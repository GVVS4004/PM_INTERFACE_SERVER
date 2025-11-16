const express = require('express');
const router = express.Router();
const { Recipient } = require('../models');

/**
 * GET /api/recipients
 * Get all recipients
 */
router.get('/', async (req, res) => {
  try {
    const email = req.cookies.userEmail;

    if (!email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const recipients = await Recipient.find().sort({ recipientId: 1 }).lean();
    const recipientsFormatted = recipients.map((r) => ({
      id: r.recipientId,
      email: r.email,
      name: r.name,
      role: r.role,
      groupId: r.groupId,
    }));

    console.log(`Sending ${recipientsFormatted.length} recipients to ${email}`);
    res.json(recipientsFormatted);
  } catch (error) {
    console.error('Get recipients error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/recipients
 * Create a new recipient
 */
router.post('/', async (req, res) => {
  try {
    const email = req.cookies.userEmail;
    const { name, email: recipientEmail, role, groupId } = req.body;

    if (!email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!name || !recipientEmail || !role) {
      return res.status(400).json({ error: 'Name, email, and role are required' });
    }

    // Check if email already exists
    const existing = await Recipient.findOne({ email: recipientEmail });
    if (existing) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Get next recipient ID
    const maxRecipient = await Recipient.findOne().sort({ recipientId: -1 });
    const nextRecipientId = maxRecipient ? maxRecipient.recipientId + 1 : 1;

    const newRecipient = await Recipient.create({
      recipientId: nextRecipientId,
      name,
      email: recipientEmail,
      role,
      groupId: groupId || null,
    });

    console.log('New recipient created:', newRecipient);

    res.json({
      id: newRecipient.recipientId,
      name: newRecipient.name,
      email: newRecipient.email,
      role: newRecipient.role,
      groupId: newRecipient.groupId,
    });
  } catch (error) {
    console.error('Create recipient error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /api/recipients/:id
 * Update a recipient
 */
router.put('/:id', async (req, res) => {
  try {
    const email = req.cookies.userEmail;
    const recipientId = parseInt(req.params.id);
    const { name, email: recipientEmail, role, groupId } = req.body;

    if (!email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const recipient = await Recipient.findOne({ recipientId });

    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    // Check if new email already exists (excluding current recipient)
    if (recipientEmail && recipientEmail !== recipient.email) {
      const existing = await Recipient.findOne({
        email: recipientEmail,
        recipientId: { $ne: recipientId },
      });
      if (existing) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    if (name) recipient.name = name;
    if (recipientEmail) recipient.email = recipientEmail;
    if (role) recipient.role = role;
    if (groupId !== undefined) recipient.groupId = groupId;
    recipient.updatedAt = new Date();

    await recipient.save();

    console.log('Recipient updated:', recipient);

    res.json({
      id: recipient.recipientId,
      name: recipient.name,
      email: recipient.email,
      role: recipient.role,
      groupId: recipient.groupId,
    });
  } catch (error) {
    console.error('Update recipient error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /api/recipients/:id
 * Delete a recipient
 */
router.delete('/:id', async (req, res) => {
  try {
    const email = req.cookies.userEmail;
    const recipientId = parseInt(req.params.id);

    if (!email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const deleted = await Recipient.findOneAndDelete({ recipientId });

    if (!deleted) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    console.log('Recipient deleted:', deleted);

    res.json({
      success: true,
      deleted: {
        id: deleted.recipientId,
        name: deleted.name,
        email: deleted.email,
      },
    });
  } catch (error) {
    console.error('Delete recipient error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
