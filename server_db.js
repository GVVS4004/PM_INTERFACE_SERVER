/**
 * PM_INTERFACE Backend Server (MongoDB Edition)
 *
 * This server uses MongoDB for data persistence and is organized with
 * modular route files for better maintainability.
 *
 * To run this server:
 * 1. Make sure MongoDB is running
 * 2. Seed the database: npm run seed
 * 3. Start the server: node server_db.js
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import database connection
const connectDB = require('./database');

// Import routes
const authRoutes = require('./routes/auth.routes');
const sseRoutes = require('./routes/sse.routes');
const notificationRoutes = require('./routes/notification.routes');
const aiRoutes = require('./routes/ai.routes');
const recipientRoutes = require('./routes/recipient.routes');
const groupRoutes = require('./routes/group.routes');
const applicationRoutes = require('./routes/application.routes');
const sendRoutes = require('./routes/send.routes');
const testRoutes = require('./routes/test.routes');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// =====================
// MIDDLEWARE
// =====================

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  })
);

app.use(bodyParser.json());
app.use(cookieParser());

// Request logging middleware (optional)
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// =====================
// ROUTES
// =====================

// Authentication routes
app.use('/api/auth', authRoutes);

// SSE (Server-Sent Events) routes
app.use('/api', sseRoutes);

// Notification routes
app.use('/api/notifications', notificationRoutes);

// AI routes
app.use('/api/ai', aiRoutes);

// Recipient routes
app.use('/api/recipients', recipientRoutes);

// Group routes
app.use('/api/groups', groupRoutes);

// Application routes
app.use('/api/applications', applicationRoutes);

// Send/Tracking routes (includes send-bulk and track-open)
app.use('/api/notifications', sendRoutes);

// Test routes
app.use('/api/test', testRoutes);

// =====================
// HEALTH CHECK
// =====================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: 'MongoDB',
    version: '1.0.0',
  });
});

// =====================
// ERROR HANDLING
// =====================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: err.message || 'Something went wrong',
  });
});

// =====================
// START SERVER
// =====================

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 PM_INTERFACE Backend Server Started (MongoDB Edition)`);
  console.log(`${'='.repeat(70)}`);
  console.log(`📡 Server listening on: http://localhost:${PORT}`);
  console.log(`💾 Database: MongoDB`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`🔑 Claude API: ${process.env.ANTHROPIC_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`\n📋 Available Routes:`);
  console.log(`   ┌─ Authentication`);
  console.log(`   │  ├─ POST   /api/auth/login`);
  console.log(`   │  ├─ POST   /api/auth/logout`);
  console.log(`   │  └─ GET    /api/auth/me`);
  console.log(`   ├─ SSE`);
  console.log(`   │  └─ GET    /api/events`);
  console.log(`   ├─ Notifications`);
  console.log(`   │  ├─ GET    /api/notifications`);
  console.log(`   │  ├─ GET    /api/notifications/:id`);
  console.log(`   │  ├─ PUT    /api/notifications/:id`);
  console.log(`   │  ├─ POST   /api/notifications/create`);
  console.log(`   │  ├─ POST   /api/webhook/notification`);
  console.log(`   │  └─ GET    /api/notifications/:id/tracking`);
  console.log(`   ├─ AI`);
  console.log(`   │  └─ POST   /api/ai/suggest`);
  console.log(`   ├─ Recipients`);
  console.log(`   │  ├─ GET    /api/recipients`);
  console.log(`   │  ├─ POST   /api/recipients`);
  console.log(`   │  ├─ PUT    /api/recipients/:id`);
  console.log(`   │  └─ DELETE /api/recipients/:id`);
  console.log(`   ├─ Groups`);
  console.log(`   │  ├─ GET    /api/groups`);
  console.log(`   │  ├─ POST   /api/groups`);
  console.log(`   │  ├─ PUT    /api/groups/:id`);
  console.log(`   │  └─ DELETE /api/groups/:id`);
  console.log(`   ├─ Applications`);
  console.log(`   │  ├─ GET    /api/applications`);
  console.log(`   │  ├─ POST   /api/applications`);
  console.log(`   │  ├─ PUT    /api/applications/:id`);
  console.log(`   │  └─ DELETE /api/applications/:id`);
  console.log(`   ├─ Send/Tracking`);
  console.log(`   │  ├─ POST   /api/notifications/:id/send`);
  console.log(`   │  ├─ POST   /api/notifications/:id/send-bulk`);
  console.log(`   │  └─ POST   /api/notifications/track-open`);
  console.log(`   └─ Test`);
  console.log(`      └─ POST   /api/test/create-notification`);
  console.log(`\n${'='.repeat(70)}`);
  console.log(`\n📝 Quick Start:`);
  console.log(`   1. Seed database: npm run seed`);
  console.log(`   2. Test login: POST http://localhost:${PORT}/api/auth/login`);
  console.log(`   3. Health check: GET http://localhost:${PORT}/health`);
  console.log(`\n✨ Server ready to receive requests!\n`);
});

// Export app for testing
module.exports = app;
