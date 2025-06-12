const express = require('express');
const cors = require('cors');
const cspMiddleware = require('./middleware/csp');

const app = express();

// Apply CSP middleware
app.use(cspMiddleware);

// Other middleware
app.use(cors());
app.use(express.json());

// Your existing routes and configurations...

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 
