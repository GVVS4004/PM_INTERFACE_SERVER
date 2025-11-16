const express = require('express');
const router = express.Router();
const { Notification } = require('../models');
const sseManager = require('../utils/sse.manager');

/**
 * GET /api/events
 * Server-Sent Events endpoint for real-time notifications
 */
router.get('/events', async (req, res) => {
  try {
    const email = req.cookies.userEmail;

    if (!email) {
      return res.status(401).send('Not authenticated');
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Add client to SSE manager
    sseManager.addClient(email, res);

    // Send connection confirmation
    sseManager.sendConnectionConfirmation(email);

    // Send existing notifications for this user
    const userNotifications = await Notification.find({ targetEmail: email })
      .sort({ createdAt: -1 })
      .lean();

    const notificationsWithSource = userNotifications.map((n) => ({
      ...n,
      id: n._id,
      source: n.metadata?.source || 'external',
      createdBy: n.metadata?.createdBy,
    }));

    if (notificationsWithSource.length > 0) {
      sseManager.sendInitialNotifications(email, notificationsWithSource);
    }

    // Handle client disconnect
    req.on('close', () => {
      sseManager.removeClient(email);
    });
  } catch (error) {
    console.error('SSE error:', error);
    res.status(500).send('SSE error');
  }
});

module.exports = router;
