# Docker Setup Guide for Tax And Taxes Email Server

This guide will help you run the Tax And Taxes Email Server using Docker and Docker Compose.

## Prerequisites

### 1. Install Docker Desktop
- **Windows**: Download from [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)
- **Mac**: Download from [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)
- **Linux**: Install Docker Engine and Docker Compose

### 2. Verify Installation
```bash
docker --version
docker compose version
```

## Quick Start

### 1. Configure Environment Variables
Copy the Docker environment template:
```bash
# Copy the Docker environment template
cp .env.docker .env

# Edit .env with your actual values
# Required: EMAIL_USER, EMAIL_PASS, ADMIN_EMAIL, CASHFREE_APP_ID, CASHFREE_SECRET_KEY
```

### 2. Production Deployment
```bash
# Build and start the production container
docker compose up --build -d

# Check container status
docker compose ps

# View logs
docker compose logs -f

# Stop the container
docker compose down
```

### 3. Development Mode
```bash
# Run in development mode with live reloading
docker compose -f docker-compose.dev.yml up --build

# Run in detached mode
docker compose -f docker-compose.dev.yml up --build -d
```

## Docker Compose Files

### `docker-compose.yml` (Production)
- Uses production Dockerfile
- Sets NODE_ENV=production
- Optimized for deployment
- Includes health checks
- Uses named volumes for uploads

### `docker-compose.dev.yml` (Development)
- Uses development Dockerfile with nodemon
- Sets NODE_ENV=development
- Live code reloading
- Mounts source code as volume
- Uses local uploads directory

## Available Commands

### Basic Operations
```bash
# Start services
docker compose up

# Start in background
docker compose up -d

# Build and start
docker compose up --build

# Stop services
docker compose down

# Stop and remove volumes
docker compose down -v
```

### Development Operations
```bash
# Development mode
docker compose -f docker-compose.dev.yml up

# Development with rebuild
docker compose -f docker-compose.dev.yml up --build

# Stop development environment
docker compose -f docker-compose.dev.yml down
```

### Monitoring and Debugging
```bash
# View logs
docker compose logs

# Follow logs in real-time
docker compose logs -f

# View logs for specific service
docker compose logs taxandtaxes-server

# Execute commands in running container
docker compose exec taxandtaxes-server bash

# Check container status
docker compose ps

# View resource usage
docker stats
```

## Environment Variables

### Required Variables
Create a `.env` file with these required variables:

```bash
# Email Configuration
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
ADMIN_EMAIL=admin@yourdomain.com

# Cashfree Configuration
CASHFREE_APP_ID=your-cashfree-app-id
CASHFREE_SECRET_KEY=your-cashfree-secret-key
```

### Optional Variables
```bash
# Environment
NODE_ENV=production
PORT=3001

# Cashfree Settings
CASHFREE_ENVIRONMENT=PROD

# URLs
PRODUCTION_FRONTEND_URL=https://yourdomain.com
PRODUCTION_BACKEND_URL=https://your-api-domain.com

# Security
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
UPLOAD_MAX_SIZE=10485760
ALLOWED_FILE_TYPES=application/pdf,image/jpeg,image/jpg,image/png
```

## Health Checks

The containers include built-in health checks:

```bash
# Check health status
docker compose ps

# Manual health check
curl http://localhost:3001/api/health
```

Expected response:
```json
{
  "status": "Email server is running!",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Volumes and Data Persistence

### Production
- **uploads_temp**: Named volume for temporary file uploads
- Files are automatically cleaned up after email delivery

### Development
- **Source code**: Live-mounted for immediate changes
- **uploads**: Local directory mounted for file debugging
- **node_modules**: Excluded to prevent conflicts

## Networking

### Ports
- **3001**: API server port (mapped to host)

### Networks
- **Production**: `taxandtaxes-network`
- **Development**: `taxandtaxes-dev-network`

## Troubleshooting

### Common Issues

#### 1. Docker Desktop Not Running
```bash
# Error: Cannot connect to Docker daemon
# Solution: Start Docker Desktop application
```

#### 2. Port Already in Use
```bash
# Error: Port 3001 is already allocated
# Solution: Stop conflicting services or change port
docker compose down
# Or change port in docker-compose.yml
```

#### 3. Environment Variables Not Loading
```bash
# Check if .env file exists
ls -la .env

# Verify environment variables in container
docker compose exec taxandtaxes-server env | grep EMAIL
```

#### 4. Build Failures
```bash
# Clean build (remove cache)
docker compose build --no-cache

# Remove all containers and images
docker compose down --rmi all
docker system prune -a
```

#### 5. Permission Issues (Linux/Mac)
```bash
# Fix upload directory permissions
sudo chown -R $USER:$USER uploads/

# Or run with Docker as current user
export UID=$(id -u)
export GID=$(id -g)
docker compose up
```

### Debugging Steps

1. **Check Container Status**
   ```bash
   docker compose ps
   docker compose logs
   ```

2. **Verify Environment Variables**
   ```bash
   docker compose exec taxandtaxes-server env
   ```

3. **Test Health Endpoint**
   ```bash
   curl http://localhost:3001/api/health
   ```

4. **Access Container Shell**
   ```bash
   docker compose exec taxandtaxes-server bash
   ```

5. **Check Network Connectivity**
   ```bash
   docker network ls
   docker network inspect tax_and_taxes_server_taxandtaxes-network
   ```

## Performance Optimization

### Production Settings
```yaml
# In docker-compose.yml
services:
  taxandtaxes-server:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
        reservations:
          memory: 256M
          cpus: '0.25'
```

### Monitoring
```bash
# Resource usage
docker stats

# Container health
docker compose exec taxandtaxes-server curl http://localhost:3001/api/health
```

## Security Considerations

### 1. Environment Variables
- Never commit `.env` file to version control
- Use Docker secrets in production
- Rotate credentials regularly

### 2. Network Security
- Use custom networks (already configured)
- Limit exposed ports
- Consider reverse proxy (nginx) for production

### 3. Container Security
- Run as non-root user (already configured)
- Keep base images updated
- Scan for vulnerabilities

## Integration with DigitalOcean

### Deploy to DigitalOcean App Platform
```bash
# App Platform supports Docker deployments
# Use the Dockerfile directly
# Set environment variables in App Platform dashboard
```

### Deploy to DigitalOcean Droplet
```bash
# SSH to your droplet
ssh root@your-droplet-ip

# Clone repository
git clone your-repo-url
cd tax_and_taxes_server

# Configure environment
cp .env.docker .env
nano .env

# Start with Docker Compose
docker compose up -d
```

## Support

For Docker-related issues:
- Check [Docker Documentation](https://docs.docker.com/)
- Visit [Docker Community Forums](https://forums.docker.com/)
- Review container logs: `docker compose logs`

For application-specific issues:
- Check the main [README.md](./README.md)
- Review [DEPLOYMENT.md](./DEPLOYMENT.md)
- Create an issue in the repository 