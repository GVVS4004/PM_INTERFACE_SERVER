const express = require('express');
const router = express.Router();
const { RecipientGroup, Application, Recipient } = require('../models');

/**
 * GET /api/groups
 * Get all recipient groups with user count and application info
 */
router.get('/', async (req, res) => {
  try {
    const email = req.cookies.userEmail;

    if (!email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const groups = await RecipientGroup.find().sort({ groupId: 1 }).lean();
    const applications = await Application.find().lean();

    // Return groups with user count and application info
    const groupsWithCounts = groups.map((group) => ({
      id: group.groupId,
      name: group.name,
      description: group.description,
      color: group.color,
      users: group.users,
      userCount: group.users ? group.users.length : 0,
      applicationIds: group.applicationIds,
      applications: applications
        .filter((app) => group.applicationIds && group.applicationIds.includes(app.applicationId))
        .map((app) => ({ id: app.applicationId, name: app.name })),
    }));

    res.json(groupsWithCounts);
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/groups
 * Create a new group
 */
router.post('/', async (req, res) => {
  try {
    const email = req.cookies.userEmail;
    const { name, description, color } = req.body;

    if (!email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    // Get next group ID
    const maxGroup = await RecipientGroup.findOne().sort({ groupId: -1 });
    const nextGroupId = maxGroup ? maxGroup.groupId + 1 : 1;

    const newGroup = await RecipientGroup.create({
      groupId: nextGroupId,
      name,
      description: description || '',
      color: color || '#6c757d',
      users: [],
      applicationIds: [],
    });

    console.log('New group created:', newGroup);

    res.json({
      id: newGroup.groupId,
      name: newGroup.name,
      description: newGroup.description,
      color: newGroup.color,
    });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /api/groups/:id
 * Update a group
 */
router.put('/:id', async (req, res) => {
  try {
    const email = req.cookies.userEmail;
    const groupId = parseInt(req.params.id);
    const { name, description, color } = req.body;

    if (!email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const group = await RecipientGroup.findOne({ groupId });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (name) group.name = name;
    if (description !== undefined) group.description = description;
    if (color) group.color = color;
    group.updatedAt = new Date();

    await group.save();

    console.log('Group updated:', group);

    res.json({
      id: group.groupId,
      name: group.name,
      description: group.description,
      color: group.color,
    });
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /api/groups/:id
 * Delete a group and remove groupId from all recipients
 */
router.delete('/:id', async (req, res) => {
  try {
    const email = req.cookies.userEmail;
    const groupId = parseInt(req.params.id);

    if (!email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const deleted = await RecipientGroup.findOneAndDelete({ groupId });

    if (!deleted) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Remove group from all recipients
    await Recipient.updateMany({ groupId: groupId }, { $set: { groupId: null } });

    console.log('Group deleted:', deleted);

    res.json({
      success: true,
      deleted: {
        id: deleted.groupId,
        name: deleted.name,
      },
    });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
