const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// Load environment variables from parent directory
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// CSP Headers Middleware
const cspMiddleware = (req, res, next) => {
  // Set frame-ancestors directive via headers
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'none'; " +
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.cashfree.com https://js.cashfree.com https://cdn.cashfree.com; " +
    "connect-src 'self' https://api.cashfree.com https://sdk.cashfree.com https://cdn.cashfree.com; " +
    "frame-src 'self' https://sdk.cashfree.com https://cdn.cashfree.com; " +
    "img-src 'self' data: blob: https://sdk.cashfree.com https://cdn.cashfree.com; " +
    "style-src 'self' 'unsafe-inline' https://sdk.cashfree.com https://cdn.cashfree.com; " +
    "font-src 'self' data: https://sdk.cashfree.com https://cdn.cashfree.com"
  );

  // Also set X-Frame-Options for older browsers
  res.setHeader('X-Frame-Options', 'DENY');

  next();
};

// Create uploads directory if it doesn't exist
// For Vercel, use /tmp directory which is available in serverless functions
const uploadsDir = process.env.NODE_ENV === 'production' 
  ? '/tmp/uploads' 
  : path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
  },
  fileFilter: function (req, file, cb) {
    // Allow PDF, JPG, PNG files
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPG, and PNG files are allowed.'));
    }
  }
});

// Middleware
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = process.env.NODE_ENV === 'production' 
      ? [
          'https://taxandtaxes.vercel.app',
          'https://taxandtaxes.com',
          'https://www.taxandtaxes.com'
        ]
      : ['http://localhost:5173', 'http://localhost:3000'];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log(`CORS: Blocked origin ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(cspMiddleware);  // Apply CSP headers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Email retry system for successful payments
const pendingEmailRetries = new Map(); // Store failed email attempts with payment success

// Email retry configuration
const EMAIL_RETRY_CONFIG = {
  maxRetries: 5,
  retryDelays: [30000, 60000, 120000, 300000, 600000], // 30s, 1m, 2m, 5m, 10m
  maxAge: 30 * 60 * 1000 // 30 minutes - after this, give up
};

// Send emails with retry mechanism
const sendEmailsWithRetry = async (formData, files, clientId, paymentInfo, retryCount = 0) => {
  try {
    console.log(`📧 Sending emails for ${formData.name} - Attempt ${retryCount + 1}`);
    
    // Send admin notification email with attachments
    const adminEmail = createAdminEmailTemplate(formData, files, clientId, paymentInfo);
    await transporter.sendMail(adminEmail);
    
    // Send user confirmation email with document list
    const userEmail = createUserEmailTemplate(formData, files, clientId, paymentInfo);
    await transporter.sendMail(userEmail);
    
    console.log(`✅ Emails sent successfully for ${formData.name} (${formData.email}) - Client ID: ${clientId}`);
    
    // Remove from retry queue if it exists
    if (pendingEmailRetries.has(clientId)) {
      const retryData = pendingEmailRetries.get(clientId);
      if (retryData.timeoutId) {
        clearTimeout(retryData.timeoutId);
      }
      pendingEmailRetries.delete(clientId);
      console.log(`🗑️ Removed ${clientId} from email retry queue - emails sent successfully`);
      
      // Schedule file cleanup now that emails are sent
      if (files && files.length > 0) {
        scheduleFileCleanup(files, clientId);
      }
    }
    
    return { success: true };
    
  } catch (error) {
    console.error(`❌ Email sending failed for ${formData.name} - Attempt ${retryCount + 1}:`, error.message);
    
    // If payment was successful, set up retry mechanism
    if (paymentInfo && retryCount < EMAIL_RETRY_CONFIG.maxRetries) {
      const nextRetryCount = retryCount + 1;
      const delay = EMAIL_RETRY_CONFIG.retryDelays[retryCount] || EMAIL_RETRY_CONFIG.retryDelays[EMAIL_RETRY_CONFIG.retryDelays.length - 1];
      
      console.log(`🔄 Payment successful but email failed. Scheduling retry ${nextRetryCount} in ${delay/1000} seconds for Client ID: ${clientId}`);
      
      // Store retry data
      const retryData = {
        formData,
        files,
        clientId,
        paymentInfo,
        retryCount: nextRetryCount,
        createdAt: Date.now(),
        timeoutId: null
      };
      
      // Schedule retry
      retryData.timeoutId = setTimeout(async () => {
        console.log(`⏰ Executing email retry ${nextRetryCount} for Client ID: ${clientId}`);
        await sendEmailsWithRetry(formData, files, clientId, paymentInfo, nextRetryCount);
      }, delay);
      
      pendingEmailRetries.set(clientId, retryData);
      
      return { 
        success: false, 
        willRetry: true, 
        retryCount: nextRetryCount,
        nextRetryIn: delay 
      };
    }
    
    // If retries are exhausted, clean up files and log the failure
    if (paymentInfo) {
      console.error(`❌ All email retries exhausted for successful payment - Client ID: ${clientId}. Files will be cleaned up.`);
      if (files && files.length > 0) {
        // Clean up files immediately since we can't send emails
        cleanupFiles(files, clientId);
      }
    }
    
    return { success: false, willRetry: false, error: error.message };
  }
};

// Cleanup old retry attempts
const cleanupOldRetries = () => {
  const now = Date.now();
  const expiredEntries = [];
  
  for (const [clientId, retryData] of pendingEmailRetries.entries()) {
    if (now - retryData.createdAt > EMAIL_RETRY_CONFIG.maxAge) {
      expiredEntries.push(clientId);
    }
  }
  
  expiredEntries.forEach(clientId => {
    const retryData = pendingEmailRetries.get(clientId);
    if (retryData.timeoutId) {
      clearTimeout(retryData.timeoutId);
    }
    
    // Clean up files for expired retries since emails couldn't be sent
    if (retryData.files && retryData.files.length > 0) {
      console.log(`🧹 Cleaning up files for expired email retry - Client ID: ${clientId}`);
      cleanupFiles(retryData.files, clientId);
    }
    
    pendingEmailRetries.delete(clientId);
  });
  
  if (expiredEntries.length > 0) {
    console.log(`🧹 Cleaned up ${expiredEntries.length} expired email retry attempts`);
  }
};

// Run cleanup every 5 minutes
setInterval(cleanupOldRetries, 5 * 60 * 1000);

// Generate unique client ID with TT25 prefix
const generateClientId = () => {
  const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `TT25${timestamp}${random}`;
};

// Generate unique order ID for Cashfree
const generateOrderId = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `ORDER_TT25_${timestamp}_${random}`;
};

// Schedule file cleanup after 30 minutes (only after successful email delivery)
// For Vercel, use shorter cleanup times due to serverless nature
const scheduleFileCleanup = (files, clientId) => {
  // In production (Vercel), clean up files more aggressively
  const cleanupDelay = process.env.NODE_ENV === 'production' 
    ? 5 * 60 * 1000  // 5 minutes for production
    : 30 * 60 * 1000; // 30 minutes for development
  
  console.log(`🕐 Scheduling cleanup for ${files.length} files in ${cleanupDelay / 60000} minutes - Client ID: ${clientId}`);
  
  setTimeout(() => {
    // Check if there are still pending email retries before cleanup
    if (pendingEmailRetries.has(clientId)) {
      console.log(`⏸️ Delaying file cleanup for Client ID: ${clientId} - email retries still pending`);
      // Reschedule cleanup for another 2 minutes in production, 10 minutes in development
      const retryDelay = process.env.NODE_ENV === 'production' ? 2 * 60 * 1000 : 10 * 60 * 1000;
      setTimeout(() => cleanupFiles(files, clientId), retryDelay);
    } else {
      cleanupFiles(files, clientId);
    }
  }, cleanupDelay);
};

// Clean up uploaded files
const cleanupFiles = async (files, clientId) => {
  console.log(`🧹 Starting file cleanup for Client ID: ${clientId}`);
  
  let deletedCount = 0;
  let errorCount = 0;
  
  for (const file of files) {
    try {
      // Check if file exists before attempting deletion
      if (fs.existsSync(file.path)) {
        await fs.promises.unlink(file.path);
        deletedCount++;
        console.log(`🗑️ Deleted: ${file.originalname} (${file.path})`);
      } else {
        console.log(`⚠️ File already deleted or doesn't exist: ${file.path}`);
      }
    } catch (error) {
      errorCount++;
      console.error(`❌ Error deleting file ${file.originalname}:`, error.message);
    }
  }
  
  console.log(`✅ Cleanup completed for Client ID: ${clientId} - Deleted: ${deletedCount}, Errors: ${errorCount}`);
  
  // Log cleanup summary
  if (errorCount > 0) {
    console.warn(`⚠️ Warning: ${errorCount} files could not be deleted for Client ID: ${clientId}`);
  }
};

// Cashfree Configuration
const cashfreeConfig = {
  appId: process.env.CASHFREE_APP_ID,
  secretKey: process.env.CASHFREE_SECRET_KEY,
  environment: process.env.CASHFREE_ENVIRONMENT || 'TEST',
  baseUrl: process.env.CASHFREE_ENVIRONMENT === 'PROD' 
    ? 'https://api.cashfree.com/pg' 
    : 'https://sandbox.cashfree.com/pg'
};

// Package pricing mapping
const packagePricing = {
  'Tax Planning With Normal Filing': 799,
  'Salaried Tax ProAssist': 999,
  'Capital Gains ProAssist': 2599,
  'NRI Tax ProAssist': 4899,
  'Tax Planning With Normal Filing - Revised': 1199,
  'Salaried Tax ProAssist - Revised': 1499,
  'Capital Gains ProAssist - Revised': 3099,
  'NRI Tax ProAssist - Revised': 5899
};

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail', // You can change this to your email provider
  auth: {
    user: process.env.EMAIL_USER, // Your email
    pass: process.env.EMAIL_PASS, // Your app password
  },
});

// Email templates
const createAdminEmailTemplate = (data, files = [], clientId, paymentInfo = null) => {
  return {
    from: process.env.EMAIL_USER,
    to: process.env.ADMIN_EMAIL || 'taxndtaxes@gmail.com',
    subject: `🚨 New Contact Form Submission - ${data.service} - Client ID: ${clientId}`,
    attachments: files.map(file => ({
      filename: file.originalname,
      path: file.path
    })),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
        <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
          <h1 style="margin: 0; font-size: 24px;">📧 New Contact Form Submission</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">Tax And Taxes - Customer Inquiry</p>
          <div style="background: rgba(255,255,255,0.1); margin: 15px 0 0 0; padding: 10px; border-radius: 8px;">
            <p style="margin: 0; font-size: 16px; font-weight: 600;">Client ID: ${clientId}</p>
          </div>
        </div>
        
        <div style="background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="border-left: 4px solid #10b981; padding-left: 20px; margin-bottom: 30px;">
            <h2 style="color: #1e293b; margin: 0 0 10px 0;">Customer Information</h2>
            <p style="color: #64748b; margin: 0;">Received: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
          </div>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #374151; width: 30%;">📧 Name:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${data.name}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #374151;">✉️ Email:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #1e293b;">
                <a href="mailto:${data.email}" style="color: #10b981; text-decoration: none;">${data.email}</a>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #374151;">📱 Phone:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #1e293b;">
                <a href="tel:${data.phone}" style="color: #10b981; text-decoration: none;">${data.phone}</a>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #374151;">🏷️ Service:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                <span style="background: #dcfce7; color: #166534; padding: 6px 12px; border-radius: 20px; font-size: 14px; font-weight: 500;">
                  ${data.service}
                </span>
              </td>
            </tr>
            ${paymentInfo ? `
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #374151;">💳 Payment Status:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                <span style="background: #dcfce7; color: #166534; padding: 6px 12px; border-radius: 20px; font-size: 14px; font-weight: 600;">
                  ✅ PAID - ₹${paymentInfo.amount}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #374151;">🆔 Payment ID:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-family: 'Courier New', monospace; font-weight: 600;">${paymentInfo.paymentId}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #374151;">🔄 Transaction ID:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-family: 'Courier New', monospace; font-weight: 600;">${paymentInfo.transactionId}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #374151;">📦 Order ID:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-family: 'Courier New', monospace; font-weight: 600;">${paymentInfo.orderId}</td>
            </tr>
            ` : ''}
            ${data.bankAccountNumber ? `
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #374151;">🏦 Bank Account:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${data.bankAccountNumber}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #374151;">🏛️ Bank Name:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${data.bankName}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #374151;">🔢 IFSC Code:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${data.ifscCode}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #374151;">👤 Account Holder:</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${data.accountHolderName}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 12px 0; font-weight: bold; color: #374151; vertical-align: top;">💬 Message:</td>
              <td style="padding: 12px 0; color: #1e293b; line-height: 1.6;">
                <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; border-left: 3px solid #10b981;">
                  ${data.message || 'No additional message provided'}
                </div>
              </td>
            </tr>
          </table>
          
          ${files.length > 0 ? `
          <div style="margin-top: 30px; padding: 20px; background: #fef3c7; border-radius: 12px; border-left: 4px solid #f59e0b;">
            <h3 style="color: #92400e; margin: 0 0 15px 0; font-size: 18px;">📎 Submitted Documents (${files.length} files)</h3>
            <ul style="margin: 0; padding-left: 20px; color: #92400e;">
              ${files.map(file => `
                <li style="margin: 8px 0; font-weight: 500;">
                  📄 ${file.originalname} 
                  <span style="color: #78716c; font-size: 12px; font-weight: normal;">(${(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                </li>
              `).join('')}
            </ul>
            <p style="margin: 15px 0 0 0; color: #92400e; font-size: 14px; font-style: italic;">
              💡 All documents are attached to this email for your review.
            </p>
          </div>
          ` : ''}
        </div>
        
        <div style="background: #f1f5f9; padding: 20px; border-radius: 12px; margin-top: 20px; text-align: center;">
          <h3 style="color: #374151; margin: 0 0 15px 0;">Quick Actions</h3>
          <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <a href="mailto:${data.email}?subject=Re: Your inquiry about ${data.service}" 
               style="background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 500; display: inline-block; margin: 5px;">
              📧 Reply via Email
            </a>
            <a href="tel:${data.phone}" 
               style="background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 500; display: inline-block; margin: 5px;">
              📞 Call Customer
            </a>
            <a href="https://wa.me/${data.phone.replace(/[^0-9]/g, '')}?text=Hi ${data.name}, thank you for your inquiry about ${data.service}. We're here to help!" 
               style="background: #25d366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 500; display: inline-block; margin: 5px;">
              💬 WhatsApp
            </a>
          </div>
        </div>
        
        <div style="text-align: center; margin-top: 30px; color: #64748b; font-size: 14px;">
          <p>This email was automatically generated from the Tax And Taxes contact form.</p>
          <p>Please respond within 2 hours to maintain our service commitment.</p>
        </div>
      </div>
    `,
  };
};

const createUserEmailTemplate = (data, files = [], clientId, paymentInfo = null) => {
  return {
    from: process.env.EMAIL_USER,
    to: data.email,
    subject: `✅ Thank you for contacting Tax And Taxes - Client ID: ${clientId}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
        <!-- Header with Logo -->
        <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center">
                <h1 style="margin: 0; font-size: 28px; font-weight: 700;">🎉 Thank You, ${data.name}!</h1>
                <p style="margin: 15px 0 0 0; font-size: 18px; opacity: 0.9; font-weight: 400;">We've received your inquiry</p>
              </td>
            </tr>
          </table>
        </div>
        
        <!-- Response Time Card -->
        <div style="background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 20px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" style="padding-bottom: 30px;">
                <div style="background: #dcfce7; color: #166534; padding: 20px; border-radius: 12px; display: inline-block; text-align: center;">
                  <h2 style="margin: 0 0 10px 0; font-size: 20px; font-weight: 600;">⏰ Expected Response Time</h2>
                  <p style="margin: 0 0 5px 0; font-size: 28px; font-weight: 700; color: #059669;">Within 2 Hours</p>
                  <p style="margin: 0; font-size: 14px; opacity: 0.8; font-weight: 500;">On business days (Mon-Sat, 9AM-8PM IST)</p>
                </div>
              </td>
            </tr>
          </table>
          
          <!-- Inquiry Summary -->
          <div style="border-left: 4px solid #10b981; padding-left: 20px; margin-bottom: 25px;">
            <h3 style="color: #1e293b; margin: 0 0 15px 0; font-size: 18px; font-weight: 600;">📋 Your Inquiry Summary</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px 0; color: #64748b; font-weight: 600; width: 40%; vertical-align: top;">Service Requested:</td>
                <td style="padding: 10px 0;">
                  <span style="background: #dcfce7; color: #166534; padding: 6px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; display: inline-block;">
                    ${data.service}
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #64748b; font-weight: 600; vertical-align: top;">Submitted On:</td>
                <td style="padding: 10px 0; color: #1e293b; font-weight: 500;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #64748b; font-weight: 600; vertical-align: top;">Reference ID:</td>
                <td style="padding: 10px 0; color: #1e293b; font-family: 'Courier New', monospace; font-weight: 700; background: #f1f5f9; padding: 8px 12px; border-radius: 6px; display: inline-block;">${clientId}</td>
              </tr>
              ${paymentInfo ? `
              <tr>
                <td style="padding: 10px 0; color: #64748b; font-weight: 600; vertical-align: top;">💳 Payment Status:</td>
                <td style="padding: 10px 0;">
                  <span style="background: #dcfce7; color: #166534; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; display: inline-block;">
                    ✅ PAID - ₹${paymentInfo.amount}
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #64748b; font-weight: 600; vertical-align: top;">🆔 Payment ID:</td>
                <td style="padding: 10px 0; color: #1e293b; font-family: 'Courier New', monospace; font-weight: 700; background: #f1f5f9; padding: 8px 12px; border-radius: 6px; display: inline-block;">${paymentInfo.paymentId}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #64748b; font-weight: 600; vertical-align: top;">🔄 Transaction ID:</td>
                <td style="padding: 10px 0; color: #1e293b; font-family: 'Courier New', monospace; font-weight: 700; background: #f1f5f9; padding: 8px 12px; border-radius: 6px; display: inline-block;">${paymentInfo.transactionId}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #64748b; font-weight: 600; vertical-align: top;">📦 Order ID:</td>
                <td style="padding: 10px 0; color: #1e293b; font-family: 'Courier New', monospace; font-weight: 700; background: #f1f5f9; padding: 8px 12px; border-radius: 6px; display: inline-block;">${paymentInfo.orderId}</td>
              </tr>
              ` : ''}
            </table>
            
            ${data.message ? `
              <div style="margin-top: 20px;">
                <p style="color: #64748b; font-weight: 600; margin: 0 0 10px 0;">Your Message:</p>
                <div style="background: #f8fafc; padding: 18px; border-radius: 10px; color: #1e293b; line-height: 1.6; border: 1px solid #e2e8f0; font-style: italic;">
                  "${data.message}"
                </div>
              </div>
            ` : ''}
            
            ${files.length > 0 ? `
              <div style="margin-top: 25px; padding: 20px; background: #f0f9ff; border-radius: 12px; border-left: 4px solid #0ea5e9;">
                <h4 style="color: #0c4a6e; margin: 0 0 15px 0; font-size: 16px; font-weight: 600;">📎 Documents Successfully Submitted (${files.length} files)</h4>
                <ul style="margin: 0; padding-left: 20px; color: #0c4a6e;">
                  ${files.map(file => {
                    const documentType = file.fieldname === 'form16' ? 'Form 16' :
                                       file.fieldname === 'panCard' ? 'PAN Card' :
                                       file.fieldname === 'aadharCard' ? 'Aadhar Card' :
                                       file.fieldname === 'incomeDocuments' ? 'Income Documents' :
                                       file.fieldname === 'deductionDocuments' ? 'Deduction Documents' :
                                       file.fieldname === 'bankStatement' ? 'Bank Statement' :
                                       file.fieldname;
                    return `
                      <li style="margin: 8px 0; font-weight: 500;">
                        📄 ${documentType}: ${file.originalname} 
                        <span style="color: #64748b; font-size: 12px; font-weight: normal;">(${(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                      </li>
                    `;
                  }).join('')}
                </ul>
                <p style="margin: 15px 0 0 0; color: #0c4a6e; font-size: 14px;">
                  ✅ All your documents have been securely uploaded and sent to our tax experts for review.
                </p>
              </div>
            ` : ''}
          </div>
        </div>
        
        <!-- What Happens Next -->
        <div style="background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 20px;">
          <h3 style="color: #1e293b; margin: 0 0 30px 0; text-align: center; font-size: 20px; font-weight: 600;">🚀 What Happens Next?</h3>
          
          <!-- Step 1 -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 25px;">
            <tr>
              <td width="80" align="center" style="vertical-align: top; padding-right: 20px;">
                <div style="background: #eff6ff; color: #1d4ed8; width: 60px; height: 60px; border-radius: 50%; margin: 0 auto; display: table;">
                  <div style="display: table-cell; text-align: center; vertical-align: middle; font-size: 24px; font-weight: 700;">1</div>
                </div>
              </td>
              <td style="vertical-align: top; padding-left: 0px;">
                <h4 style="margin: 0 0 8px 0; color: #374151; font-size: 18px; font-weight: 600;">Review & Assign</h4>
                <p style="margin: 0; color: #64748b; font-size: 15px; line-height: 1.5;">Our team reviews your inquiry and assigns the best tax expert for your needs</p>
              </td>
            </tr>
          </table>
          
          <!-- Step 2 -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 25px;">
            <tr>
              <td width="80" align="center" style="vertical-align: top; padding-right: 20px;">
                <div style="background: #f0fdf4; color: #16a34a; width: 60px; height: 60px; border-radius: 50%; margin: 0 auto; display: table;">
                  <div style="display: table-cell; text-align: center; vertical-align: middle; font-size: 24px; font-weight: 700;">2</div>
                </div>
              </td>
              <td style="vertical-align: top; padding-left: 0px;">
                <h4 style="margin: 0 0 8px 0; color: #374151; font-size: 18px; font-weight: 600;">Personal Response</h4>
                <p style="margin: 0; color: #64748b; font-size: 15px; line-height: 1.5;">You'll receive a personalized response via email or phone within 2 hours</p>
              </td>
            </tr>
          </table>
          
          <!-- Step 3 -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 10px;">
            <tr>
              <td width="80" align="center" style="vertical-align: top; padding-right: 20px;">
                <div style="background: #fef3c7; color: #d97706; width: 60px; height: 60px; border-radius: 50%; margin: 0 auto; display: table;">
                  <div style="display: table-cell; text-align: center; vertical-align: middle; font-size: 24px; font-weight: 700;">3</div>
                </div>
              </td>
              <td style="vertical-align: top; padding-left: 0px;">
                <h4 style="margin: 0 0 8px 0; color: #374151; font-size: 18px; font-weight: 600;">Schedule Consultation</h4>
                <p style="margin: 0; color: #64748b; font-size: 15px; line-height: 1.5;">We'll help schedule your tax filing consultation at your convenience</p>
              </td>
            </tr>
          </table>
        </div>
        
        <!-- Contact Options -->
        <div style="background: #f8fafc; padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 20px; border: 1px solid #e2e8f0;">
          <h3 style="color: #374151; margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">📞 Need Immediate Assistance?</h3>
          
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" style="padding: 10px;">
                <table cellpadding="0" cellspacing="0" border="0" style="display: inline-table;">
                  <tr>
                    <td style="padding: 0 5px;">
                      <a href="tel:+916238495077" style="background: #10b981; color: white; padding: 12px 20px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; margin: 5px;">
                        📞 Call: +91 62384 95077
                      </a>
                    </td>
                    <td style="padding: 0 5px;">
                      <a href="https://wa.me/916238495077?text=Hi, I just submitted a contact form and need immediate assistance." style="background: #25d366; color: white; padding: 12px 20px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; margin: 5px;">
                        💬 WhatsApp Us
                      </a>
                    </td>
                    <td style="padding: 0 5px;">
                      <a href="mailto:taxndtaxes@gmail.com?subject=Urgent: Follow-up on contact form submission" style="background: #6366f1; color: white; padding: 12px 20px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; margin: 5px;">
                        ✉️ Direct Email
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          
          <p style="margin: 20px 0 0 0; color: #64748b; font-size: 14px; font-weight: 500;">
            <strong>Business Hours:</strong> Monday to Saturday, 9:00 AM - 8:00 PM (IST)
          </p>
        </div>
        
        <!-- Company Highlights -->
        <div style="background: linear-gradient(135deg, #1e293b, #334155); color: white; padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
          <h3 style="margin: 0 0 25px 0; font-size: 20px; font-weight: 600;">🏆 Why Choose Tax And Taxes?</h3>
          
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <!-- Achievement 1 -->
              <td width="25%" align="center" style="padding: 15px; vertical-align: top;">
                <div style="font-size: 32px; margin-bottom: 10px;">✅</div>
                <div style="font-weight: 700; font-size: 16px; margin-bottom: 5px;">98.5% Success Rate</div>
                <div style="font-size: 13px; opacity: 0.8;">Accurate filings</div>
              </td>
              
              <!-- Achievement 2 -->
              <td width="25%" align="center" style="padding: 15px; vertical-align: top;">
                <div style="font-size: 32px; margin-bottom: 10px;">⚡</div>
                <div style="font-weight: 700; font-size: 16px; margin-bottom: 5px;">24hr Processing</div>
                <div style="font-size: 13px; opacity: 0.8;">Quick turnaround</div>
              </td>
              
              <!-- Achievement 3 -->
              <td width="25%" align="center" style="padding: 15px; vertical-align: top;">
                <div style="font-size: 32px; margin-bottom: 10px;">🔒</div>
                <div style="font-weight: 700; font-size: 16px; margin-bottom: 5px;">100% Secure</div>
                <div style="font-size: 13px; opacity: 0.8;">Bank-grade security</div>
              </td>
              
              <!-- Achievement 4 -->
              <td width="25%" align="center" style="padding: 15px; vertical-align: top;">
                <div style="font-size: 32px; margin-bottom: 10px;">👨‍💼</div>
                <div style="font-weight: 700; font-size: 16px; margin-bottom: 5px;">Expert CAs</div>
                <div style="font-size: 13px; opacity: 0.8;">22+ years of experience</div>
              </td>
            </tr>
          </table>
        </div>
        
        <!-- Footer -->
        <div style="text-align: center; margin-top: 30px; color: #64748b; font-size: 14px; line-height: 1.6;">
          <div style="background: white; padding: 25px; border-radius: 12px; margin-bottom: 15px; border: 1px solid #e2e8f0;">
            <p style="margin: 0 0 10px 0; font-weight: 600; color: #374151;">This is an automated confirmation email from Tax And Taxes.</p>
            <p style="margin: 0; color: #64748b;">Please do not reply to this email. For support, use the contact methods above.</p>
          </div>
          
          <div style="padding: 20px; border-top: 2px solid #e2e8f0;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center">
                  <p style="margin: 0 0 5px 0; font-weight: 700; color: #1e293b; font-size: 16px;">Tax And Taxes</p>
                  <p style="margin: 0; color: #64748b; font-size: 14px; font-style: italic;">Making tax filing simple, accurate, and stress-free!</p>
                </td>
              </tr>
            </table>
          </div>
        </div>
      </div>
    `,
  };
};

// API endpoint to handle form submissions with file uploads
app.post('/api/contact', upload.any(), async (req, res) => {
  try {
    const formData = req.body;
    const uploadedFiles = req.files;
    
    // Generate unique client ID
    const clientId = generateClientId();
    
    // Validate required fields
    if (!formData.name || !formData.email || !formData.phone || !formData.service) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }

    // Get all uploaded files (using upload.any() gives us an array directly)
    const allFiles = uploadedFiles || [];
    
    // Validate mandatory file uploads
    const aadharCardFiles = allFiles.filter(file => file.fieldname.startsWith('aadharCard'));
    if (aadharCardFiles.length === 0) {
      // Clean up any uploaded files if validation fails
      allFiles.forEach(file => {
        fs.unlink(file.path, (err) => {
          if (err) console.error(`Error deleting file ${file.originalname}:`, err.message);
        });
      });
      
      return res.status(400).json({ 
        success: false, 
        error: 'Aadhar Card upload is mandatory. Please upload your Aadhar Card to continue.' 
      });
    }

    // Extract payment information if provided
    const paymentInfo = formData.paymentId ? {
      paymentId: formData.paymentId,
      orderId: formData.orderId,
      amount: formData.paymentAmount,
      transactionId: formData.transactionId || formData.paymentId,
      orderStatus: formData.orderStatus || 'PAID'
    } : null;

    console.log(`📄 Processing submission for ${formData.name} with ${allFiles.length} files`);
    console.log(`🆔 Generated Client ID: ${clientId}`);
    
    // Log payment information if provided
    if (paymentInfo) {
      console.log(`💳 Payment processed:`, {
        paymentId: paymentInfo.paymentId,
        transactionId: paymentInfo.transactionId,
        orderId: paymentInfo.orderId,
        amount: `₹${paymentInfo.amount}`,
        status: paymentInfo.orderStatus
      });
    }
    
    // Log uploaded files for debugging
    if (allFiles.length > 0) {
      console.log('📎 Uploaded files:');
      allFiles.forEach(file => {
        console.log(`  - ${file.fieldname}: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      });
    }

    // Send emails with retry mechanism
    const emailResult = await sendEmailsWithRetry(formData, allFiles, clientId, paymentInfo);
    
    if (emailResult.success) {
      // Schedule file cleanup after 30 minutes (only after successful email delivery)
      if (allFiles.length > 0) {
        scheduleFileCleanup(allFiles, clientId);
      }
      
      res.json({ 
        success: true, 
        message: `Thank you! Your tax filing request has been submitted successfully with Client ID: ${clientId}. Our team will contact you within 24 hours to process your documents and begin your ITR filing.`,
        clientId: clientId,
        documentsReceived: allFiles.length
      });
    } else if (emailResult.willRetry && paymentInfo) {
      // Payment was successful, but email failed - retry system is activated
      console.log(`💳 Payment successful for ${formData.name}, but email delivery failed. Auto-retry system activated for Client ID: ${clientId}`);
      
      // Don't clean up files immediately - keep them for email retries
      res.json({ 
        success: true, 
        message: `Payment successful! Your tax filing request has been submitted with Client ID: ${clientId}. You will receive email confirmation shortly. Our team will contact you within 24 hours.`,
        clientId: clientId,
        documentsReceived: allFiles.length,
        paymentStatus: 'completed',
        emailStatus: 'retrying'
      });
    } else {
      // Both payment and email failed, or payment failed
      throw new Error(emailResult.error || 'Email delivery failed');
    }
    
  } catch (error) {
    console.error('❌ Error processing form submission:', error);
    
    // Clean up uploaded files immediately if email sending fails
    const allFiles = req.files || [];
    if (allFiles.length > 0) {
      console.log(`🧹 Email sending failed, cleaning up ${allFiles.length} files immediately - Client ID: ${generateClientId()}`);
      
      allFiles.forEach(file => {
        fs.unlink(file.path, (err) => {
          if (err) {
            console.error(`❌ Error deleting file ${file.originalname}:`, err.message);
          } else {
            console.log(`🗑️ Cleaned up file immediately: ${file.originalname}`);
          }
        });
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process your submission. Please try again or contact us directly.' 
    });
  }
});

// Create Cashfree payment order
app.post('/api/create-payment-order', async (req, res) => {
  try {
    const { amount, customerName, customerEmail, customerPhone, service } = req.body;
    
    // Generate unique order ID
    const orderId = generateOrderId();
    
    // Cashfree order creation payload
    const orderData = {
      order_id: orderId,
      order_amount: amount,
      order_currency: 'INR',
      customer_details: {
        customer_id: `CUST_${Date.now()}`,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone
      },
      order_meta: {
        return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment-success`,
        notify_url: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/payment-webhook`,
        payment_methods: ''
      },
      order_note: `Payment for ${service} - Tax And Taxes`
    };

    console.log(`🔄 Creating payment order for ${customerName} - Amount: ₹${amount}`);
    
    // Create order with Cashfree
    const response = await axios.post(`${cashfreeConfig.baseUrl}/orders`, orderData, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': '2025-01-01',
        'x-client-id': cashfreeConfig.appId,
        'x-client-secret': cashfreeConfig.secretKey
      }
    });

    console.log(`✅ Payment order created successfully: ${orderId}`);
    
    res.json({
      success: true,
      orderId: orderId,
      paymentSessionId: response.data.payment_session_id,
      orderToken: response.data.order_token
    });

  } catch (error) {
    console.error('❌ Error creating payment order:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to create payment order',
      details: error.response?.data || error.message
    });
  }
});

// Verify payment status
app.post('/api/verify-payment', async (req, res) => {
  try {
    const { orderId } = req.body;
    
    console.log(`🔍 Verifying payment for order: ${orderId}`);
    
    // Get payment status from Cashfree
    const response = await axios.get(`${cashfreeConfig.baseUrl}/orders/${orderId}`, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': '2025-01-01',
        'x-client-id': cashfreeConfig.appId,
        'x-client-secret': cashfreeConfig.secretKey
      }
    });

    const order = response.data;
    const isSuccess = order.order_status === 'PAID';
    
    console.log(`${isSuccess ? '✅' : '❌'} Payment verification: ${orderId} - Status: ${order.order_status}`);
    
    res.json({
      success: true,
      paymentSuccess: isSuccess,
      paymentId: order.payment_group?.payments?.[0]?.cf_payment_id || null,
      orderStatus: order.order_status,
      orderAmount: order.order_amount
    });

  } catch (error) {
    console.error('❌ Error verifying payment:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to verify payment',
      details: error.response?.data || error.message
    });
  }
});

// Payment webhook (for server-to-server notifications)
app.post('/api/payment-webhook', (req, res) => {
  try {
    const paymentData = req.body;
    console.log('📨 Payment webhook received:', paymentData);
    
    // Here you can add additional logic like updating database, sending notifications, etc.
    // For now, we'll just log it
    
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Payment webhook error:', error);
    res.status(500).json({ success: false });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'Email server is running!', timestamp: new Date().toISOString() });
});

// Email retry monitoring endpoint
app.get('/api/email-retries', (req, res) => {
  try {
    const now = Date.now();
    const retries = [];
    
    for (const [clientId, retryData] of pendingEmailRetries.entries()) {
      retries.push({
        clientId,
        customerName: retryData.formData.name,
        customerEmail: retryData.formData.email,
        service: retryData.formData.service,
        retryCount: retryData.retryCount,
        createdAt: new Date(retryData.createdAt).toISOString(),
        ageMinutes: Math.round((now - retryData.createdAt) / 60000),
        paymentAmount: retryData.paymentInfo?.amount,
        paymentId: retryData.paymentInfo?.paymentId
      });
    }
    
    res.json({
      success: true,
      totalPendingRetries: retries.length,
      retries: retries,
      retryConfig: EMAIL_RETRY_CONFIG
    });
  } catch (error) {
    console.error('❌ Error getting email retries:', error);
    res.status(500).json({ success: false, error: 'Failed to get retry status' });
  }
});

// Manual email retry trigger endpoint
app.post('/api/retry-email', async (req, res) => {
  try {
    const { clientId } = req.body;
    
    if (!clientId) {
      return res.status(400).json({ success: false, error: 'Client ID is required' });
    }
    
    const retryData = pendingEmailRetries.get(clientId);
    if (!retryData) {
      return res.status(404).json({ 
        success: false, 
        error: `No pending email retry found for Client ID: ${clientId}` 
      });
    }
    
    console.log(`🔄 Manual email retry triggered for Client ID: ${clientId}`);
    
    // Cancel existing timeout
    if (retryData.timeoutId) {
      clearTimeout(retryData.timeoutId);
    }
    
    // Trigger immediate retry
    const result = await sendEmailsWithRetry(
      retryData.formData, 
      retryData.files, 
      retryData.clientId, 
      retryData.paymentInfo, 
      retryData.retryCount
    );
    
    res.json({
      success: true,
      clientId: clientId,
      emailResult: result,
      message: result.success 
        ? 'Email sent successfully!' 
        : `Email retry failed. ${result.willRetry ? 'Auto-retry scheduled.' : 'No more retries will be attempted.'}`
    });
    
  } catch (error) {
    console.error('❌ Error in manual email retry:', error);
    res.status(500).json({ success: false, error: 'Failed to retry email' });
  }
});

// Test cleanup endpoint (development only)
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/test-cleanup', async (req, res) => {
    try {
      const { files, clientId } = req.body;
      
      console.log(`🧪 Test cleanup requested for Client ID: ${clientId}`);
      
      if (files && files.length > 0) {
        // Schedule immediate cleanup for testing (1 second delay)
        setTimeout(() => {
          cleanupFiles(files, clientId);
        }, 1000);
        
        res.json({ 
          success: true, 
          message: `Test cleanup scheduled for ${files.length} files`,
          clientId: clientId 
        });
      } else {
        res.json({ 
          success: false, 
          message: 'No files provided for cleanup test' 
        });
      }
    } catch (error) {
      console.error('❌ Test cleanup error:', error);
      res.status(500).json({ success: false, error: 'Test cleanup failed' });
    }
  });
}

// For Vercel deployment - export the app
module.exports = app;

// Start the server (for both development and production)
app.listen(PORT, () => {
  console.log(`🚀 Email server running on port ${PORT}`);
  console.log(`📧 Admin email: ${process.env.ADMIN_EMAIL || 'taxndtaxes@gmail.com'}`);
  console.log(`📧 Email user: ${process.env.EMAIL_USER || 'NOT SET'}`);
  console.log(`🔑 Email pass configured: ${process.env.EMAIL_PASS ? 'YES' : 'NO'}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('✅ Ready to handle contact form submissions!');
}).on('error', (err) => {
  console.error('❌ Server startup error:', err);
}); 
