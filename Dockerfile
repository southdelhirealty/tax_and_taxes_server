# Use the official Node.js 18 LTS Alpine image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Install system dependencies for file operations
RUN apk add --no-cache \
    curl \
    bash

# Copy package.json and package-lock.json
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy the rest of the application code
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Create a non-root user to run the application
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory to the nodejs user
RUN chown -R nodejs:nodejs /app

# Switch to the non-root user
USER nodejs

# Expose the port the app runs on
EXPOSE 3001

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Start the application
CMD ["npm", "start"] 