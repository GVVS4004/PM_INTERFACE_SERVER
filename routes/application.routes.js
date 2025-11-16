const express = require('express');
const router = express.Router();
const { Application } = require('../models');

/**
 * GET /api/applications
 * Get all applications
 */
router.get('/', async (req, res) => {
  try {
    const email = req.cookies.userEmail;

    if (!email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const applications = await Application.find().sort({ applicationId: 1 }).lean();
    const applicationsFormatted = applications.map((app) => ({
      id: app.applicationId,
      name: app.name,
      baseUrl: app.baseUrl,
      notificationEndpoint: app.notificationEndpoint,
      apiKey: app.apiKey,
      status: app.status,
      activeUsers: app.activeUsers,
      description: app.description,
    }));

    console.log(`Sending ${applicationsFormatted.length} applications to ${email}`);
    res.json(applicationsFormatted);
  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/applications
 * Create a new application
 */
router.post('/', async (req, res) => {
  try {
    const email = req.cookies.userEmail;
    const { name, baseUrl, notificationEndpoint, apiKey, description, activeUsers } = req.body;

    if (!email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!name || !baseUrl) {
      return res.status(400).json({ error: 'Name and baseUrl are required' });
    }

    // Get next application ID
    const maxApp = await Application.findOne().sort({ applicationId: -1 });
    const nextApplicationId = maxApp ? maxApp.applicationId + 1 : 1;

    const newApp = await Application.create({
      applicationId: nextApplicationId,
      name,
      baseUrl,
      notificationEndpoint: notificationEndpoint || '',
      apiKey: apiKey || '',
      status: 'active',
      activeUsers: activeUsers || 0,
      description: description || '',
    });

    console.log('New application created:', newApp);

    res.json({
      id: newApp.applicationId,
      name: newApp.name,
      baseUrl: newApp.baseUrl,
      notificationEndpoint: newApp.notificationEndpoint,
      apiKey: newApp.apiKey,
      status: newApp.status,
      activeUsers: newApp.activeUsers,
      description: newApp.description,
    });
  } catch (error) {
    console.error('Create application error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /api/applications/:id
 * Update an application
 */
router.put('/:id', async (req, res) => {
  try {
    const email = req.cookies.userEmail;
    const appId = parseInt(req.params.id);
    const { name, baseUrl, notificationEndpoint, apiKey, description, activeUsers, status } = req.body;

    if (!email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const app = await Application.findOne({ applicationId: appId });

    if (!app) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (name) app.name = name;
    if (baseUrl) app.baseUrl = baseUrl;
    if (notificationEndpoint !== undefined) app.notificationEndpoint = notificationEndpoint;
    if (apiKey !== undefined) app.apiKey = apiKey;
    if (description !== undefined) app.description = description;
    if (activeUsers !== undefined) app.activeUsers = activeUsers;
    if (status) app.status = status;
    app.updatedAt = new Date();

    await app.save();

    console.log('Application updated:', app);

    res.json({
      id: app.applicationId,
      name: app.name,
      baseUrl: app.baseUrl,
      notificationEndpoint: app.notificationEndpoint,
      apiKey: app.apiKey,
      status: app.status,
      activeUsers: app.activeUsers,
      description: app.description,
    });
  } catch (error) {
    console.error('Update application error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /api/applications/:id
 * Delete an application
 */
router.delete('/:id', async (req, res) => {
  try {
    const email = req.cookies.userEmail;
    const appId = parseInt(req.params.id);

    if (!email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const deleted = await Application.findOneAndDelete({ applicationId: appId });

    if (!deleted) {
      return res.status(404).json({ error: 'Application not found' });
    }

    console.log('Application deleted:', deleted);

    res.json({
      success: true,
      deleted: {
        id: deleted.applicationId,
        name: deleted.name,
      },
    });
  } catch (error) {
    console.error('Delete application error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
