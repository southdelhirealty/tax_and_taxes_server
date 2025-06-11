#!/bin/bash

# Deployment script for Tax And Taxes Email Server
# This script can be used for manual deployment to DigitalOcean App Platform

set -e

echo "🚀 Starting deployment for Tax And Taxes Email Server..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if doctl is installed
if ! command -v doctl &> /dev/null; then
    print_warning "doctl CLI is not installed. Installing..."
    # Add installation instructions for doctl
    echo "Please install doctl CLI tool:"
    echo "https://docs.digitalocean.com/reference/doctl/how-to/install/"
    exit 1
fi

# Check if user is authenticated
if ! doctl auth list &> /dev/null; then
    print_error "You are not authenticated with DigitalOcean CLI"
    echo "Please run: doctl auth init"
    exit 1
fi

print_status "Checking Node.js version..."
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js version 18 or higher is required. Current version: $(node --version)"
    exit 1
fi

print_status "Installing dependencies..."
npm ci --only=production

print_status "Running basic health check..."
# You can add more pre-deployment checks here
if [ ! -f "package.json" ]; then
    print_error "package.json not found"
    exit 1
fi

if [ ! -f "index.js" ]; then
    print_error "index.js not found"
    exit 1
fi

print_status "Checking environment variables..."
if [ ! -f ".env" ]; then
    print_warning ".env file not found. Make sure to set environment variables in DigitalOcean App Platform"
fi

print_status "Creating app.yaml if it doesn't exist..."
if [ ! -f ".do/app.yaml" ]; then
    print_error ".do/app.yaml not found. Please make sure the DigitalOcean App Platform configuration is in place."
    exit 1
fi

print_status "Deployment preparation complete!"
echo ""
echo "Next steps:"
echo "1. Push your code to GitHub repository"
echo "2. Create or update your DigitalOcean App Platform app"
echo "3. Set the required environment variables in the DigitalOcean dashboard:"
echo "   - EMAIL_USER"
echo "   - EMAIL_PASS"
echo "   - ADMIN_EMAIL"
echo "   - CASHFREE_APP_ID"
echo "   - CASHFREE_SECRET_KEY"
echo ""
echo "DigitalOcean App Platform will automatically deploy from your GitHub repository."
echo ""
print_status "Deployment script completed successfully! 🎉" 