# DigitalOcean Deployment Checklist

## Pre-Deployment Checklist

### ✅ Code Preparation
- [ ] All code committed and pushed to GitHub
- [ ] Environment variables properly configured
- [ ] Dependencies updated and tested
- [ ] `.env` file excluded from git (but `.env.example` included)
- [ ] Production URLs updated in configuration

### ✅ Repository Setup
- [ ] GitHub repository is public or DigitalOcean has access
- [ ] Repository contains all necessary deployment files:
  - [ ] `package.json` with correct Node.js version
  - [ ] `Dockerfile` for container deployment
  - [ ] `.do/app.yaml` for App Platform
  - [ ] `.gitignore` properly configured
  - [ ] `README.md` with deployment instructions

### ✅ Environment Variables
Required environment variables to set in DigitalOcean:

- [ ] `EMAIL_USER` - Gmail address for sending emails
- [ ] `EMAIL_PASS` - Gmail app password (not regular password)
- [ ] `ADMIN_EMAIL` - Email address to receive notifications
- [ ] `CASHFREE_APP_ID` - Cashfree payment gateway app ID
- [ ] `CASHFREE_SECRET_KEY` - Cashfree payment gateway secret key

Optional but recommended:
- [ ] `CORS_ORIGIN` - Allowed frontend domains
- [ ] `PRODUCTION_FRONTEND_URL` - Your frontend domain
- [ ] `PRODUCTION_BACKEND_URL` - Your API domain

## DigitalOcean App Platform Deployment

### Step 1: Create New App
1. Go to [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
2. Click **"Create App"**
3. Choose **"GitHub"** as source
4. Select your repository and branch (`main`)

### Step 2: Configure App Settings
1. **App Name**: `taxandtaxes-email-server`
2. **Plan**: Basic ($5/month recommended for production)
3. **Instance Size**: Basic XXS (sufficient for email server)
4. **HTTP Routes**: Default (`/`)

### Step 3: Environment Variables
In the App Platform dashboard:
1. Go to **Settings** → **App-Level Environment Variables**
2. Add each required environment variable
3. Mark sensitive variables as **"Encrypted"**

### Step 4: Deploy
1. Click **"Create Resources"**
2. Wait for build and deployment (5-10 minutes)
3. Check deployment logs for any errors

## Post-Deployment Verification

### ✅ Health Checks
- [ ] Health endpoint responds: `https://your-app-url.ondigitalocean.app/api/health`
- [ ] CORS properly configured for your frontend domain
- [ ] File upload endpoint accessible
- [ ] Email functionality working (test with contact form)

### ✅ Testing
- [ ] Submit a test contact form from your frontend
- [ ] Verify email delivery to admin email
- [ ] Test file upload functionality
- [ ] Verify payment integration (if applicable)

### ✅ Monitoring
- [ ] Check application logs in DigitalOcean dashboard
- [ ] Monitor email retry status: `https://your-app-url.ondigitalocean.app/api/email-retries`
- [ ] Set up alerts for application errors

## Troubleshooting Common Issues

### Email Not Sending
1. **Check Gmail App Password**
   - Use app password, not regular Gmail password
   - Enable 2-factor authentication on Gmail
   - Generate new app password if needed

2. **Check Environment Variables**
   - Verify `EMAIL_USER` and `EMAIL_PASS` are set correctly
   - Check for typos in email addresses

### CORS Errors
1. **Update CORS Origin**
   - Set `CORS_ORIGIN` to your frontend domain
   - Include both `https://yourdomain.com` and `https://www.yourdomain.com`

2. **Check Frontend URLs**
   - Update API URL in frontend to point to DigitalOcean app URL

### File Upload Issues
1. **Check File Size**
   - Default limit is 10MB per file
   - Adjust `UPLOAD_MAX_SIZE` if needed

2. **Check File Types**
   - Only PDF, JPG, PNG files allowed by default
   - Update `ALLOWED_FILE_TYPES` if needed

### Payment Integration Issues
1. **Verify Cashfree Credentials**
   - Check `CASHFREE_APP_ID` and `CASHFREE_SECRET_KEY`
   - Ensure using production credentials for live site

2. **Check Environment**
   - Verify `CASHFREE_ENVIRONMENT` is set to `PROD`

## Performance Optimization

### For Higher Traffic
- Upgrade to Professional plan ($12/month)
- Increase instance size to Basic XS
- Consider implementing Redis for caching
- Add database for persistent storage

### For Better Reliability
- Set up health check alerts
- Implement logging service (like LogRocket or Datadog)
- Add monitoring for email delivery rates
- Consider CDN for file uploads

## Security Considerations

### ✅ Security Checklist
- [ ] Environment variables properly encrypted
- [ ] No sensitive data in repository
- [ ] CORS properly configured
- [ ] File upload validation in place
- [ ] Rate limiting considered (if needed)

### Recommended Security Enhancements
- Add rate limiting for API endpoints
- Implement request validation middleware
- Add IP whitelisting for admin endpoints
- Set up SSL/TLS certificate (automatic with App Platform)

## Support and Maintenance

### Regular Maintenance
- [ ] Monitor application logs weekly
- [ ] Check email delivery rates monthly
- [ ] Update dependencies quarterly
- [ ] Review and rotate API keys annually

### Getting Help
- **DigitalOcean Support**: Available through dashboard
- **Community**: [DigitalOcean Community](https://www.digitalocean.com/community)
- **Documentation**: [App Platform Docs](https://docs.digitalocean.com/products/app-platform/)

---

**Need Help?** Check the main [README.md](./README.md) for detailed documentation or create an issue in the repository. 