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
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'build', 'index.html'));
});

// Update prices every 15 minutes (market hours check optional)
cron.schedule('*/15 * * * *', () => {
  updateAllPrices();
});

async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Initial price update
  setTimeout(() => updateAllPrices(), 5000);
}

start().catch(console.error);
