const express = require('express');
const router = express.Router();
const { Notification, User, EditHistory } = require('../models');
const sseManager = require('../utils/sse.manager');

/**
 * GET /api/notifications
 * Get all notifications for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const email = req.cookies.userEmail;

    if (!email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userNotifications = await Notification.find({ targetEmail: email })
      .sort({ createdAt: -1 })
      .lean();

    const notificationsWithSource = userNotifications.map((n) => ({
      ...n,
      id: n._id,
      source: n.metadata?.source || 'external',
      createdBy: n.metadata?.createdBy,
    }));

    res.json(notificationsWithSource);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/notifications/:id
 * Get a specific notification by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const email = req.cookies.userEmail;
    const notificationId = req.params.id;

    if (!email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const notification = await Notification.findOne({
      _id: notificationId,
      targetEmail: email,
    }).lean();

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({
      ...notification,
      id: notification._id,
      source: notification.metadata?.source || 'external',
      createdBy: notification.metadata?.createdBy,
    });
  } catch (error) {
    console.error('Get notification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /api/notifications/:id
 * Update a notification (content, status, action)
 */
router.put('/:id', async (req, res) => {
  try {
    const email = req.cookies.userEmail;
    const notificationId = req.params.id;
    const { content, status, action } = req.body;

    if (!email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const notification = await Notification.findOne({
      _id: notificationId,
      targetEmail: email,
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    // Save to edit history if content changed
    if (content && content !== notification.content) {
      const historyCount = await EditHistory.countDocuments();
      await EditHistory.create({
        historyId: historyCount + 1,
        notificationId: notification._id,
        userEmail: email,
        originalContent: notification.content,
        editedContent: content,
        editType: 'manual',
      });

      notification.content = content;
    }

    if (status) {
      notification.status = status;
    }

    // Handle accept/reject actions
    if (action === 'accepted' || action === 'rejected') {
      notification.action = action;
      notification.actionDate = new Date();
    }

    notification.updatedAt = new Date();
    await notification.save();

    res.json({
      ...notification.toObject(),
      id: notification._id,
    });
  } catch (error) {
    console.error('Update notification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/notifications/create
 * Create a new notification (PM creates)
 */
router.post('/create', async (req, res) => {
  try {
    const { title, content, jiraReleaseNotes, recipientIds, isDraft, source } = req.body;
    const userEmail = req.cookies.userEmail;

    if (!userEmail) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Validation
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    if (!content || content.trim() === '' || content === '<p><br></p>') {
      return res.status(400).json({ error: 'Content is required' });
    }

    if (title.length > 200) {
      return res.status(400).json({ error: 'Title must be less than 200 characters' });
    }

    // Content size validation (10MB max)
    const MAX_CONTENT_SIZE = 10 * 1024 * 1024;
    if (content.length > MAX_CONTENT_SIZE) {
      return res.status(400).json({
        error: 'Content too large. Maximum size is 10MB.',
      });
    }

    // Get user name
    const user = await User.findOne({ email: userEmail });

    // Create notification
    const notification = await Notification.create({
      targetEmail: userEmail,
      title: title.trim(),
      content: content,
      jiraReleaseNotes: jiraReleaseNotes || '',
      metadata: {
        source: source || 'pm_created',
        isDraft: isDraft === true,
        createdBy: user ? user.name : userEmail,
      },
      status: isDraft ? 'draft' : 'unread',
    });

    // Push to SSE if PM is connected
    if (sseManager.isConnected(userEmail)) {
      sseManager.sendNotification(userEmail, {
        ...notification.toObject(),
        id: notification._id,
        source: notification.metadata.source,
        createdBy: notification.metadata.createdBy,
      });
    }

    res.json({
      success: true,
      notification: {
        ...notification.toObject(),
        id: notification._id,
      },
      message: isDraft
        ? 'Draft saved successfully'
        : recipientIds && recipientIds.length > 0
        ? `Notification sent to ${recipientIds.length} recipients`
        : 'Notification created successfully',
    });
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/webhook/notification
 * Webhook endpoint to receive notifications from external services
 */
router.post('/webhook/notification', async (req, res) => {
  try {
    const { targetEmail, title, content, jiraReleaseNotes, metadata } = req.body;

    if (!targetEmail || !title || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const notification = await Notification.create({
      targetEmail,
      title,
      content,
      jiraReleaseNotes: jiraReleaseNotes || '',
      metadata: {
        ...(metadata || {}),
        source: 'external',
      },
      status: 'unread',
    });

    // Push to connected client if online
    if (sseManager.isConnected(targetEmail)) {
      sseManager.sendNotification(targetEmail, {
        ...notification.toObject(),
        id: notification._id,
        source: notification.metadata.source,
      });
    }

    console.log(`New notification created for ${targetEmail}: ${title}`);

    res.json({
      success: true,
      notification: {
        ...notification.toObject(),
        id: notification._id,
      },
    });
  } catch (error) {
    console.error('Webhook notification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/notifications/:id/tracking
 * Get tracking statistics for a notification
 */
router.get('/:id/tracking', async (req, res) => {
  try {
    const notificationId = req.params.id;
    const email = req.cookies.userEmail;

    if (!email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { SentRelease } = require('../models');

    // Find the notification
    const notification = await Notification.findOne({
      _id: notificationId,
      targetEmail: email,
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    // Find the sent release record
    const sentRelease = await SentRelease.findOne({ notificationId: notification._id });

    if (!sentRelease || !sentRelease.tracking) {
      return res.json({
        notificationId,
        totalSent: 0,
        totalOpened: 0,
        openRate: 0,
        openedUsers: [],
        notOpenedUsers: [],
        byApplication: [],
      });
    }

    // Get users who haven't opened
    const openedUserIds = new Set(sentRelease.tracking.openedUsers.map((u) => u.userId));
    const notOpenedUsers = sentRelease.users.filter((u) => !openedUserIds.has(u.userId));

    // Group by application
    const byApplication = sentRelease.applications.map((app) => {
      const appOpenedUsers = sentRelease.tracking.openedUsers.filter((u) => u.applicationId === app.id);
      const appTotalUsers = sentRelease.users.filter((user) => {
        const userGroups = sentRelease.groups.filter(
          (g) => g.users && g.users.some((gu) => gu.userId === user.userId)
        );
        return userGroups.some((g) => g.applicationIds && g.applicationIds.includes(app.id));
      });

      return {
        applicationId: app.id,
        applicationName: app.name,
        totalSent: appTotalUsers.length,
        opened: appOpenedUsers.length,
        openRate: appTotalUsers.length > 0 ? Math.round((appOpenedUsers.length / appTotalUsers.length) * 100) : 0,
      };
    });

    res.json({
      notificationId,
      totalSent: sentRelease.tracking.totalSent,
      totalOpened: sentRelease.tracking.opened,
      openRate: sentRelease.tracking.openRate,
      openedUsers: sentRelease.tracking.openedUsers,
      notOpenedUsers: notOpenedUsers,
      byApplication: byApplication,
      lastOpenedAt: sentRelease.tracking.lastOpenedAt,
    });
  } catch (error) {
    console.error('Get tracking error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
