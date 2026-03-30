require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { initDB } = require('./db');
const authMiddleware = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const competitionRoutes = require('./routes/competitions');
const investmentRoutes = require('./routes/investments');
const { updateAllPrices } = require('./services/stocks');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Public routes
app.use('/api/auth', (req, res, next) => {
  if (req.path === '/register' || req.path === '/login') return next();
  authMiddleware(req, res, next);
}, authRoutes);

// Protected routes
app.use('/api/competitions', authMiddleware, competitionRoutes);
app.use('/api/investments', authMiddleware, investmentRoutes);

// Serve React build in production
app.use(express.static(path.join(__dirname, 'client', 'build')));
app.get('{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'build', 'index.html'));
});

// Update prices every 15 minutes (market hours check optional)
cron.schedule('*/15 * * * *', () => {
  updateAllPrices();
});

// Start server first, then init DB (so Railway sees a listening port)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);

  // Init DB after server is listening
  initDB()
    .then(() => {
      console.log('DB ready');
      setTimeout(() => updateAllPrices(), 5000);
    })
    .catch((err) => {
      console.error('DB init error (will retry on first request):', err.message);
    });
});
