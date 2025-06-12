// Content Security Policy Middleware
const cspMiddleware = (req, res, next) => {
  // Set frame-ancestors directive via header
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'none';" // Restrict framing to none for security
  );

  // Set X-Frame-Options as a fallback for older browsers
  res.setHeader('X-Frame-Options', 'DENY');

  next();
};

module.exports = cspMiddleware; 
