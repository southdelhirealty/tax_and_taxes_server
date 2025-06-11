@echo off
REM Deployment script for Tax And Taxes Email Server (Windows)
REM This script can be used for manual deployment preparation

echo 🚀 Starting deployment preparation for Tax And Taxes Email Server...

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check Node.js version
for /f "tokens=1 delims=v" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✅ Node.js version: %NODE_VERSION%

REM Check if package.json exists
if not exist "package.json" (
    echo ❌ package.json not found
    pause
    exit /b 1
)

REM Check if index.js exists
if not exist "index.js" (
    echo ❌ index.js not found
    pause
    exit /b 1
)

echo 📦 Installing dependencies...
npm ci --only=production
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

echo ✅ Running basic health checks...

REM Check if .env file exists
if not exist ".env" (
    echo ⚠️  .env file not found. Make sure to set environment variables in DigitalOcean App Platform
)

REM Check if DigitalOcean config exists
if not exist ".do\app.yaml" (
    echo ❌ .do\app.yaml not found. Please make sure the DigitalOcean App Platform configuration is in place.
    pause
    exit /b 1
)

echo.
echo ✅ Deployment preparation complete!
echo.
echo Next steps:
echo 1. Push your code to GitHub repository
echo 2. Create or update your DigitalOcean App Platform app
echo 3. Set the required environment variables in the DigitalOcean dashboard:
echo    - EMAIL_USER
echo    - EMAIL_PASS
echo    - ADMIN_EMAIL
echo    - CASHFREE_APP_ID
echo    - CASHFREE_SECRET_KEY
echo.
echo DigitalOcean App Platform will automatically deploy from your GitHub repository.
echo.
echo 🎉 Deployment script completed successfully!
pause 