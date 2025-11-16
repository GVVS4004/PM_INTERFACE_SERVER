const express = require('express');
const router = express.Router();
const { Notification } = require('../models');
const sseManager = require('../utils/sse.manager');

/**
 * POST /api/test/create-notification
 * Create a test notification for demo purposes
 */
router.post('/create-notification', async (req, res) => {
  try {
    // Create a test notification
    const testNotification = await Notification.create({
      targetEmail: 'pm1@company.com',
      title: 'Release v2.5.0 - Q1 2025',
      content: `# Release Notes v2.5.0

## New Features
- Added user authentication with OAuth2
- Implemented real-time notifications
- New dashboard analytics

## Bug Fixes
- Fixed login redirect issue
- Resolved memory leak in notification service

## Improvements
- Performance optimization for large datasets
- Updated UI components`,
      jiraReleaseNotes: 'JIRA-123, JIRA-124, JIRA-125',
      metadata: {
        version: '2.5.0',
        releaseDate: '2025-01-15',
        jiraIssues: ['JIRA-123', 'JIRA-124', 'JIRA-125'],
      },
      status: 'unread',
    });

    // Push to connected client if online
    if (sseManager.isConnected('pm1@company.com')) {
      sseManager.sendNotification('pm1@company.com', {
        ...testNotification.toObject(),
        id: testNotification._id,
      });
    }

    console.log('✅ Test notification created for pm1@company.com');

    res.json({
      success: true,
      notification: {
        ...testNotification.toObject(),
        id: testNotification._id,
      },
    });
  } catch (error) {
    console.error('Create test notification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
