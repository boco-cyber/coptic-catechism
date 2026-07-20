const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const connectDB = require('../config/db');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

// Production traffic is terminated by the deployment's reverse proxy. Trust
// its first hop so express-session can recognize HTTPS and issue Secure cookies.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// ── Connect to MongoDB ────────────────────────────────────────────
connectDB();

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set when NODE_ENV=production');
}

// ── Middleware ─────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://localhost:19006'],
  credentials: true
}));
app.use(express.json());
app.use(morgan('dev'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'admin_sessions'
  }),
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000 // 8 hours
  }
}));

app.use(express.static(path.join(__dirname, '../public')));

// ── Routes ────────────────────────────────────────────────────────
app.use('/api', apiRoutes);
app.use('/admin/api', adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get(['/ar', '/ar/'], (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

// ── Start Server ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Coptic Catechism API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
