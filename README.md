# Tax And Taxes Email Server

A Node.js Express server that handles contact form submissions, file uploads, email notifications, and payment processing for the Tax And Taxes website.

## Features

- 📧 **Email Processing**: Handles contact form submissions with email notifications
- 📁 **File Uploads**: Supports PDF, JPG, PNG file uploads with validation
- 💳 **Payment Integration**: Cashfree payment gateway integration
- 🔄 **Email Retry System**: Robust retry mechanism for failed emails
- 🚀 **Health Monitoring**: Built-in health check endpoints
- 🔒 **Security**: CORS protection, file type validation, and secure file handling

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Email**: Nodemailer
- **File Upload**: Multer
- **Payment**: Cashfree Payment Gateway
- **Environment**: dotenv

## API Endpoints

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/contact` | Submit contact form with file uploads |
| `POST` | `/api/create-payment-order` | Create Cashfree payment order |
| `POST` | `/api/verify-payment` | Verify payment status |
| `GET` | `/api/health` | Health check endpoint |

### Monitoring Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/email-retries` | View pending email retries |
| `POST` | `/api/retry-email` | Manually retry failed emails |
| `POST` | `/api/payment-webhook` | Payment webhook handler |

## Environment Variables

### Required Variables

```bash
# Server Configuration
PORT=3001
NODE_ENV=production

# Email Configuration
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
ADMIN_EMAIL=admin@yourdomain.com

# Cashfree Configuration
CASHFREE_APP_ID=your-cashfree-app-id
CASHFREE_SECRET_KEY=your-cashfree-secret-key
CASHFREE_ENVIRONMENT=PROD

# Frontend URLs
PRODUCTION_FRONTEND_URL=https://yourdomain.com
PRODUCTION_BACKEND_URL=https://your-api-domain.com

# Security
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
```

### Optional Variables

```bash
# File Upload Limits
UPLOAD_MAX_SIZE=10485760  # 10MB
ALLOWED_FILE_TYPES=application/pdf,image/jpeg,image/jpg,image/png

# Cashfree URLs (defaults provided)
CASHFREE_BASE_URL=https://api.cashfree.com/pg
CASHFREE_JS_URL=https://sdk.cashfree.com/js/v3/cashfree.js
```

## Local Development

### Prerequisites

- Node.js 18 or higher
- npm 8 or higher

### Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd tax_and_taxes_server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **For production testing**
   ```bash
   # Cross-platform (recommended)
   npm run production
   
   # Windows specific
   npm run production:win
   
   # Unix/Linux/Mac specific
   npm run production:unix
   ```

5. **Access the server**
   ```
   http://localhost:3001
   ```

## DigitalOcean Deployment

### Option 1: App Platform (Recommended)

1. **Prepare your repository**
   ```bash
   # Make sure all files are committed
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Create DigitalOcean App**
   - Go to [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
   - Click "Create App"
   - Connect your GitHub repository
   - Select the repository and branch (`main`)

3. **Configure the app**
   - The app will automatically detect Node.js
   - Use the provided `.do/app.yaml` configuration
   - Set the following environment variables in the DigitalOcean dashboard:
     - `EMAIL_USER`
     - `EMAIL_PASS`
     - `ADMIN_EMAIL`
     - `CASHFREE_APP_ID`
     - `CASHFREE_SECRET_KEY`

4. **Deploy**
   - Click "Create Resources"
   - DigitalOcean will automatically build and deploy your app

### Option 2: Docker Deployment

1. **Build the Docker image**
   ```bash
   docker build -t taxandtaxes-server .
   ```

2. **Run the container**
   ```bash
   docker run -d \
     --name taxandtaxes-server \
     -p 3001:3001 \
     --env-file .env \
     taxandtaxes-server
   ```

### Option 3: Using Deployment Script

1. **Make the script executable**
   ```bash
   chmod +x deploy.sh
   ```

2. **Run the deployment script**
   ```bash
   ./deploy.sh
   ```

## File Upload Configuration

### Supported File Types
- PDF files (application/pdf)
- JPEG images (image/jpeg, image/jpg)
- PNG images (image/png)

### File Size Limits
- Maximum file size: 10MB per file
- Multiple files supported per submission

### Storage
- **Development**: Files stored in `./uploads/` directory
- **Production**: Files stored in `/tmp/uploads/` (automatically cleaned up)

## Email Retry System

The server includes a robust email retry mechanism:

- **Maximum Retries**: 5 attempts
- **Retry Delays**: 30s, 1m, 2m, 5m, 10m
- **Maximum Age**: 30 minutes before giving up
- **Monitoring**: Available via `/api/email-retries` endpoint

## Security Features

- **CORS Protection**: Configurable allowed origins
- **File Validation**: Type and size restrictions
- **Environment Variables**: Sensitive data protection
- **Non-root User**: Docker container runs as non-root user
- **Health Checks**: Automated health monitoring

## Monitoring and Logging

### Health Check
```bash
curl https://your-domain.com/api/health
```

### Email Retry Status
```bash
curl https://your-domain.com/api/email-retries
```

### Manual Email Retry
```bash
curl -X POST https://your-domain.com/api/retry-email \
  -H "Content-Type: application/json" \
  -d '{"clientId": "TT25123456789"}'
```

## Troubleshooting

### Common Issues

1. **Email sending fails**
   - Check email credentials
   - Verify app password for Gmail
   - Check network connectivity

2. **File upload errors**
   - Verify file size limits
   - Check file type restrictions
   - Ensure uploads directory permissions

3. **Payment integration issues**
   - Verify Cashfree credentials
   - Check environment (SANDBOX vs PROD)
   - Review webhook URL configuration

### Logs

Check application logs for detailed error information:

```bash
# For DigitalOcean App Platform
doctl apps logs <app-id>

# For Docker
docker logs taxandtaxes-server
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin feature-name`
5. Submit a pull request

## License

This project is licensed under the ISC License.

## Support

For support, email your-support@email.com or create an issue in the repository. 