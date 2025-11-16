const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const {
  Notification,
  Recipient,
  RecipientGroup,
  Application,
  SentRelease,
} = require('../models');

/**
 * POST /api/notifications/:id/send
 * Send notification to selected recipients (email recipients)
 */
router.post('/:id/send', async (req, res) => {
  try {
    const email = req.cookies.userEmail;
    const notificationId = req.params.id;
    const { recipientIds } = req.body;

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

    if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
      return res.status(400).json({ error: 'Please select at least one recipient' });
    }

    // Get selected recipients
    const selectedRecipients = await Recipient.find({
      recipientId: { $in: recipientIds },
    }).lean();

    // Create sent release record
    const releaseCount = await SentRelease.countDocuments();
    const sentRelease = await SentRelease.create({
      releaseId: releaseCount + 1,
      notificationId: notification._id,
      sentBy: email,
      recipients: selectedRecipients.map((r) => ({
        id: r.recipientId,
        name: r.name,
        email: r.email,
        role: r.role,
      })),
      content: notification.content,
      title: notification.title,
    });

    // Update notification status
    notification.status = 'sent';
    notification.sentTo = selectedRecipients.map((r) => ({
      userId: r.recipientId,
      name: r.name,
      email: r.email,
    }));
    notification.sentAt = new Date();
    await notification.save();

    console.log(
      `Release notes sent to ${selectedRecipients.length} recipients:`,
      selectedRecipients.map((r) => r.email)
    );

    res.json({
      success: true,
      message: `Release notes sent to ${selectedRecipients.length} recipients`,
      sentRelease: {
        ...sentRelease.toObject(),
        id: sentRelease.releaseId,
      },
    });
  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/notifications/:id/send-bulk
 * Send bulk notification to external applications
 */
router.post('/:id/send-bulk', async (req, res) => {
  try {
    const email = req.cookies.userEmail;
    const notificationId = req.params.id;
    const { groupIds, applicationIds } = req.body;

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

    if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
      return res.status(400).json({ error: 'Please select at least one group' });
    }

    if (!applicationIds || !Array.isArray(applicationIds) || applicationIds.length === 0) {
      return res.status(400).json({ error: 'Please select at least one application' });
    }

    // Collect users from selected groups
    const selectedGroups = await RecipientGroup.find({ groupId: { $in: groupIds } }).lean();
    const allUsersMap = new Map(); // For deduplication

    selectedGroups.forEach((group) => {
      if (group.users) {
        group.users.forEach((user) => {
          allUsersMap.set(user.userId, user);
        });
      }
    });

    const allUsers = Array.from(allUsersMap.values());

    if (allUsers.length === 0) {
      return res.status(400).json({ error: 'No users found in selected groups' });
    }

    // Get selected applications
    const selectedApplications = await Application.find({
      applicationId: { $in: applicationIds },
    }).lean();

    if (selectedApplications.length === 0) {
      return res.status(400).json({ error: 'No valid applications selected' });
    }

    const results = [];
    const errors = [];

    // Send to each application
    for (const app of selectedApplications) {
      try {
        const payload = {
          source: 'PM_INTERFACE',
          notificationId: notification._id.toString(),
          title: notification.title,
          content: notification.content,
          priority: 'high',
          type: 'release_notes',
          targetUsers: allUsers,
          metadata: {
            sentBy: email,
            sentAt: new Date().toISOString(),
            jiraReleaseNotes: notification.jiraReleaseNotes,
            groups: selectedGroups.map((g) => ({ id: g.groupId, name: g.name })),
            applicationId: app.applicationId,
            applicationName: app.name,
          },
          trackingEnabled: true,
          trackingCallbackUrl: `${
            process.env.BACKEND_URL || 'http://localhost:5000'
          }/api/notifications/track-open`,
        };

        console.log(`\n${'='.repeat(60)}`);
        console.log(`📤 Sending bulk notification to: ${app.name}`);
        console.log(`   URL: ${app.baseUrl}${app.notificationEndpoint}`);
        console.log(`   Total Users: ${allUsers.length}`);
        console.log(`   Groups: ${selectedGroups.map((g) => g.name).join(', ')}`);
        console.log(`${'='.repeat(60)}\n`);

        const targetUrl = app.baseUrl + (app.notificationEndpoint || '');
        console.log(`Sending POST request to ${targetUrl}`);
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: app.apiKey ? `Bearer ${app.apiKey}` : '',
            'X-PM-Interface-Source': 'true',
          },
          body: JSON.stringify(payload),
          timeout: 10000,
        });

        const responseData = await response.text();

        results.push({
          applicationId: app.applicationId,
          applicationName: app.name,
          success: response.ok,
          statusCode: response.status,
          userCount: allUsers.length,
          responseData: responseData,
        });

        console.log(`✅ Successfully sent to ${app.name} (Status: ${response.status})`);
      } catch (error) {
        console.error(`❌ Failed to send to ${app.name}:`, error.message);
        errors.push({
          applicationId: app.applicationId,
          applicationName: app.name,
          error: error.message,
        });
        results.push({
          applicationId: app.applicationId,
          applicationName: app.name,
          success: false,
          error: error.message,
          userCount: allUsers.length,
        });
      }
    }

    // Create sent release record with tracking
    const releaseCount = await SentRelease.countDocuments();
    const sentRelease = await SentRelease.create({
      releaseId: releaseCount + 1,
      notificationId: notification._id,
      sentBy: email,
      groups: selectedGroups.map((g) => ({
        id: g.groupId,
        name: g.name,
        description: g.description,
        color: g.color,
        users: g.users,
        applicationIds: g.applicationIds,
      })),
      applications: selectedApplications.map((a) => ({
        id: a.applicationId,
        name: a.name,
        baseUrl: a.baseUrl,
        description: a.description,
      })),
      totalUsers: allUsers.length,
      users: allUsers,
      content: notification.content,
      title: notification.title,
      results: results,
      tracking: {
        totalSent: allUsers.length,
        opened: 0,
        openedUsers: [],
        openRate: 0,
        lastOpenedAt: null,
      },
    });

    // Update notification status
    notification.status = 'sent';
    notification.sentTo = allUsers;
    notification.sentAt = new Date();
    notification.sentVia = {
      groups: selectedGroups.map((g) => ({ id: g.groupId, name: g.name })),
      applications: selectedApplications.map((a) => ({ id: a.applicationId, name: a.name })),
    };
    notification.tracking = {
      totalSent: allUsers.length,
      opened: 0,
      openedUsers: [],
      openRate: 0,
      lastOpenedAt: null,
    };
    await notification.save();

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 Bulk Send Summary:`);
    console.log(`   Total Applications: ${selectedApplications.length}`);
    console.log(`   Successful: ${successCount}`);
    console.log(`   Failed: ${failureCount}`);
    console.log(`   Total Users Notified: ${allUsers.length}`);
    console.log(`   Groups: ${selectedGroups.map((g) => g.name).join(', ')}`);
    console.log(`${'='.repeat(60)}\n`);

    res.json({
      success: true,
      message: `Notification sent to ${allUsers.length} users across ${successCount} application(s)`,
      summary: {
        totalApplications: selectedApplications.length,
        successfulApplications: successCount,
        failedApplications: failureCount,
        totalUsers: allUsers.length,
        groups: selectedGroups.map((g) => ({ id: g.groupId, name: g.name, userCount: g.users.length })),
        applications: selectedApplications.map((a) => ({ id: a.applicationId, name: a.name })),
      },
      results: results,
      sentRelease: {
        ...sentRelease.toObject(),
        id: sentRelease.releaseId,
      },
    });
  } catch (error) {
    console.error('Bulk send error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/notifications/track-open
 * Track when a user opens a notification (callback from external app)
 */
router.post('/track-open', async (req, res) => {
  try {
    const { notificationId, userId, userEmail, userName, applicationId, applicationName, openedAt } = req.body;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`👀 Notification Opened Tracking:`);
    console.log(`   Notification ID: ${notificationId}`);
    console.log(`   User: ${userName} (${userEmail})`);
    console.log(`   Application: ${applicationName}`);
    console.log(`   Opened At: ${openedAt}`);
    console.log(`${'='.repeat(60)}\n`);

    if (!notificationId || !userId) {
      return res.status(400).json({ error: 'notificationId and userId are required' });
    }

    // Find the sent release record
    const sentRelease = await SentRelease.findOne({ notificationId });

    if (!sentRelease) {
      return res.status(404).json({ error: 'Sent release record not found' });
    }

    // Check if user already opened it (prevent duplicates)
    const alreadyOpened = sentRelease.tracking.openedUsers.some((u) => u.userId === userId);

    if (alreadyOpened) {
      console.log(`   ⚠️  User already opened this notification`);
      return res.json({
        success: true,
        message: 'Already tracked',
        alreadyTracked: true,
      });
    }

    // Add to opened users
    const openedUser = {
      userId,
      name: userName || userEmail,
      email: userEmail,
      openedAt: openedAt ? new Date(openedAt) : new Date(),
      applicationId: applicationId || null,
      applicationName: applicationName || 'Unknown',
    };

    sentRelease.tracking.openedUsers.push(openedUser);
    sentRelease.tracking.opened = sentRelease.tracking.openedUsers.length;
    sentRelease.tracking.openRate = Math.round(
      (sentRelease.tracking.opened / sentRelease.tracking.totalSent) * 100
    );
    sentRelease.tracking.lastOpenedAt = openedUser.openedAt;
    await sentRelease.save();

    // Update the notification object as well
    const notification = await Notification.findById(notificationId);
    if (notification && notification.tracking) {
      notification.tracking.openedUsers.push(openedUser);
      notification.tracking.opened = notification.tracking.openedUsers.length;
      notification.tracking.openRate = Math.round(
        (notification.tracking.opened / notification.tracking.totalSent) * 100
      );
      notification.tracking.lastOpenedAt = openedUser.openedAt;
      await notification.save();
    }

    console.log(
      `   ✅ Tracking updated: ${sentRelease.tracking.opened}/${sentRelease.tracking.totalSent} opened (${sentRelease.tracking.openRate}%)`
    );

    res.json({
      success: true,
      message: 'Notification open tracked successfully',
      tracking: {
        totalSent: sentRelease.tracking.totalSent,
        opened: sentRelease.tracking.opened,
        openRate: sentRelease.tracking.openRate,
      },
    });
  } catch (error) {
    console.error('Track open error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
