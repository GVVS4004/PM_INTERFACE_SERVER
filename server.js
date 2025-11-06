const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const OpenAI = require('openai');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(bodyParser.json());
app.use(cookieParser());

// In-memory storage (for POC)
const users = [
  { email: 'pm1@company.com', password: 'password123', name: 'Product Manager 1' },
  { email: 'pm2@company.com', password: 'password123', name: 'Product Manager 2' }
];

const notifications = [];
const editHistory = [];
const sentReleases = []; // Track sent releases to recipients

// Recipients list (can be expanded)
const recipientsList = [
  { id: 1, email: 'dev-team@company.com', name: 'Development Team', role: 'Development', groupId: 1 },
  { id: 2, email: 'qa-team@company.com', name: 'QA Team', role: 'Quality Assurance', groupId: 1 },
  { id: 3, email: 'stakeholders@company.com', name: 'Stakeholders', role: 'Management', groupId: 2 },
  { id: 4, email: 'sales-team@company.com', name: 'Sales Team', role: 'Sales', groupId: 2 },
  { id: 5, email: 'support-team@company.com', name: 'Support Team', role: 'Customer Support', groupId: 3 },
  { id: 6, email: 'marketing@company.com', name: 'Marketing Team', role: 'Marketing', groupId: 2 }
];

// Recipient groups
const recipientGroups = [
  { id: 1, name: 'Engineering', description: 'Development and QA teams', color: '#007bff' },
  { id: 2, name: 'Business', description: 'Sales, Marketing, and Management', color: '#28a745' },
  { id: 3, name: 'Support', description: 'Customer support and service', color: '#ffc107' }
];

let nextRecipientId = 7;
let nextGroupId = 4;

// Active SSE connections
const clients = new Map(); // email -> response object

// OpenAI setup (you'll need to add your API key)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here'
});

// ----- Authentication Routes -----

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  const user = users.find(u => u.email === email && u.password === password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Set simple session cookie
  res.cookie('userEmail', email, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });

  res.json({ success: true, user: { email: user.email, name: user.name } });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('userEmail');
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  const email = req.cookies.userEmail;

  if (!email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = users.find(u => u.email === email);

  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  res.json({ email: user.email, name: user.name });
});

// ----- SSE Endpoint -----

app.get('/api/events', (req, res) => {
  const email = req.cookies.userEmail;

  if (!email) {
    return res.status(401).send('Not authenticated');
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Store this client connection
  clients.set(email, res);
  console.log(`SSE client connected: ${email}`);

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE connected' })}\n\n`);

  // Send existing notifications for this user with source metadata
  const userNotifications = notifications.filter(n => n.targetEmail === email).map(n => ({
    ...n,
    source: n.metadata?.source || 'external',
    createdBy: n.metadata?.createdBy
  }));
  if (userNotifications.length > 0) {
    res.write(`data: ${JSON.stringify({ type: 'initial', notifications: userNotifications })}\n\n`);
  }

  // Clean up when disconnected
  req.on('close', () => {
    clients.delete(email);
    console.log(`SSE client disconnected: ${email}`);
  });
});

// ----- Notification Routes -----

app.get('/api/notifications', (req, res) => {
  const email = req.cookies.userEmail;

  if (!email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const userNotifications = notifications.filter(n => n.targetEmail === email).map(n => ({
    ...n,
    source: n.metadata?.source || 'external',
    createdBy: n.metadata?.createdBy
  }));
  res.json(userNotifications);
});

app.get('/api/notifications/:id', (req, res) => {
  const email = req.cookies.userEmail;
  const notificationId = parseInt(req.params.id);

  if (!email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const notification = notifications.find(n => n.id === notificationId && n.targetEmail === email);

  if (!notification) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  res.json({
    ...notification,
    source: notification.metadata?.source || 'external',
    createdBy: notification.metadata?.createdBy
  });
});

app.put('/api/notifications/:id', (req, res) => {
  const email = req.cookies.userEmail;
  const notificationId = parseInt(req.params.id);
  const { content, status, action } = req.body;

  if (!email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const notification = notifications.find(n => n.id === notificationId && n.targetEmail === email);

  if (!notification) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  // Save to edit history
  if (content && content !== notification.content) {
    editHistory.push({
      id: editHistory.length + 1,
      notificationId,
      userEmail: email,
      originalContent: notification.content,
      editedContent: content,
      editType: 'manual',
      timestamp: new Date().toISOString()
    });

    notification.content = content;
  }

  if (status) {
    notification.status = status;
  }

  // Handle accept/reject actions
  if (action === 'accepted' || action === 'rejected') {
    notification.action = action;
    notification.actionDate = new Date().toISOString();
  }

  notification.updatedAt = new Date().toISOString();

  res.json(notification);
});

// ----- Create Notification Endpoint (PM creates new notification) -----

app.post('/api/notifications/create', async (req, res) => {
  const { title, content, jiraReleaseNotes, recipientIds, isDraft, source } = req.body;
  const userEmail = req.cookies.userEmail;

  // Auth check
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
      error: 'Content too large. Maximum size is 10MB.'
    });
  }

  // Get user name for createdBy
  const user = users.find(u => u.email === userEmail);

  // Create notification
  const notification = {
    id: notifications.length + 1,
    targetEmail: userEmail,
    title: title.trim(),
    content: content,
    jiraReleaseNotes: jiraReleaseNotes || '',
    metadata: {
      source: source || 'pm_created',
      isDraft: isDraft === true,
      createdBy: user ? user.name : userEmail
    },
    status: isDraft ? 'draft' : 'unread',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  notifications.push(notification);

  // If not draft and has recipients, send immediately
  if (!isDraft && recipientIds && recipientIds.length > 0) {
    try {
      const selectedRecipients = recipientsList.filter(r => recipientIds.includes(r.id));

      if (selectedRecipients.length === 0) {
        return res.status(400).json({ error: 'No valid recipients selected' });
      }

      // Create sent release record
      const sentRelease = {
        id: sentReleases.length + 1,
        notificationId: notification.id,
        sentBy: userEmail,
        recipients: selectedRecipients,
        content: notification.content,
        title: notification.title,
        sentAt: new Date().toISOString()
      };

      sentReleases.push(sentRelease);

      // Update notification
      notification.status = 'sent';
      notification.sentTo = selectedRecipients;
      notification.sentAt = sentRelease.sentAt;

      console.log(`PM-created notification sent to ${selectedRecipients.length} recipients`);
    } catch (error) {
      console.error('Failed to send notification:', error);
      return res.status(500).json({ error: 'Failed to send notification to recipients' });
    }
  }

  // Push to SSE if PM is connected
  const clientResponse = clients.get(userEmail);
  if (clientResponse) {
    clientResponse.write(`data: ${JSON.stringify({
      type: 'notification',
      data: {
        ...notification,
        source: notification.metadata.source,
        createdBy: notification.metadata.createdBy
      }
    })}\n\n`);
  }

  res.json({
    success: true,
    notification: notification,
    message: isDraft ? 'Draft saved successfully' :
             (recipientIds && recipientIds.length > 0) ?
             `Notification sent to ${recipientIds.length} recipients` :
             'Notification created successfully'
  });
});

// ----- Webhook Endpoint (receives notifications from external service) -----

app.post('/api/webhook/notification', (req, res) => {
  const { targetEmail, title, content, jiraReleaseNotes, metadata } = req.body;

  if (!targetEmail || !title || !content) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const notification = {
    id: notifications.length + 1,
    targetEmail,
    title,
    content,
    jiraReleaseNotes: jiraReleaseNotes || '',
    metadata: {
      ...(metadata || {}),
      source: 'external'
    },
    status: 'unread',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  notifications.push(notification);

  // Push to connected client if online
  const clientRes = clients.get(targetEmail);
  if (clientRes) {
    clientRes.write(`data: ${JSON.stringify({
      type: 'notification',
      data: {
        ...notification,
        source: notification.metadata.source
      }
    })}\n\n`);
  }

  console.log(`New notification created for ${targetEmail}: ${title}`);

  res.json({ success: true, notification });
});

// ----- AI Integration Routes -----

app.post('/api/ai/suggest', async (req, res) => {
  const email = req.cookies.userEmail;
  const { content, prompt } = req.body;

  if (!email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!content || !prompt) {
    return res.status(400).json({ error: 'Content and prompt are required' });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant for product managers. You help improve and edit release notes, make them more professional, clear, and concise.'
        },
        {
          role: 'user',
          content: `Current release notes:\n\n${content}\n\nUser request: ${prompt}\n\nProvide the improved version:`
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });

    const suggestion = completion.choices[0].message.content;

    res.json({ suggestion });
  } catch (error) {
    console.error('OpenAI API error:', error);
    res.status(500).json({ error: 'Failed to generate AI suggestion', details: error.message });
  }
});

// ----- Recipients Management -----

app.get('/api/recipients', (req, res) => {
  const email = req.cookies.userEmail;

  console.log('GET /api/recipients - Email from cookie:', email);
  console.log('Recipients list:', recipientsList);

  if (!email) {
    console.log('No email in cookie - not authenticated');
    return res.status(401).json({ error: 'Not authenticated' });
  }

  console.log(`Sending ${recipientsList.length} recipients to ${email}`);
  res.json(recipientsList);
});

app.post('/api/notifications/:id/send', async (req, res) => {
  const email = req.cookies.userEmail;
  const notificationId = parseInt(req.params.id);
  const { recipientIds } = req.body;

  if (!email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const notification = notifications.find(n => n.id === notificationId && n.targetEmail === email);

  if (!notification) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
    return res.status(400).json({ error: 'Please select at least one recipient' });
  }

  // Get selected recipients
  const selectedRecipients = recipientsList.filter(r => recipientIds.includes(r.id));

  // Create sent release record
  const sentRelease = {
    id: sentReleases.length + 1,
    notificationId,
    sentBy: email,
    recipients: selectedRecipients,
    content: notification.content,
    title: notification.title,
    sentAt: new Date().toISOString()
  };

  sentReleases.push(sentRelease);

  // Update notification status
  notification.status = 'sent';
  notification.sentTo = selectedRecipients;
  notification.sentAt = new Date().toISOString();

  // In a real app, you would send emails here
  console.log(`Release notes sent to ${selectedRecipients.length} recipients:`, selectedRecipients.map(r => r.email));

  res.json({
    success: true,
    message: `Release notes sent to ${selectedRecipients.length} recipients`,
    sentRelease
  });
});

// ----- Recipient CRUD Operations -----

// Create new recipient
app.post('/api/recipients', (req, res) => {
  const email = req.cookies.userEmail;
  const { name, email: recipientEmail, role, groupId } = req.body;

  if (!email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!name || !recipientEmail || !role) {
    return res.status(400).json({ error: 'Name, email, and role are required' });
  }

  // Check if email already exists
  if (recipientsList.find(r => r.email === recipientEmail)) {
    return res.status(400).json({ error: 'Email already exists' });
  }

  const newRecipient = {
    id: nextRecipientId++,
    name,
    email: recipientEmail,
    role,
    groupId: groupId || null
  };

  recipientsList.push(newRecipient);
  console.log('New recipient created:', newRecipient);

  res.json(newRecipient);
});

// Update recipient
app.put('/api/recipients/:id', (req, res) => {
  const email = req.cookies.userEmail;
  const recipientId = parseInt(req.params.id);
  const { name, email: recipientEmail, role, groupId } = req.body;

  if (!email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const recipient = recipientsList.find(r => r.id === recipientId);

  if (!recipient) {
    return res.status(404).json({ error: 'Recipient not found' });
  }

  // Check if new email already exists (excluding current recipient)
  if (recipientEmail && recipientEmail !== recipient.email) {
    if (recipientsList.find(r => r.email === recipientEmail && r.id !== recipientId)) {
      return res.status(400).json({ error: 'Email already exists' });
    }
  }

  if (name) recipient.name = name;
  if (recipientEmail) recipient.email = recipientEmail;
  if (role) recipient.role = role;
  if (groupId !== undefined) recipient.groupId = groupId;

  console.log('Recipient updated:', recipient);

  res.json(recipient);
});

// Delete recipient
app.delete('/api/recipients/:id', (req, res) => {
  const email = req.cookies.userEmail;
  const recipientId = parseInt(req.params.id);

  if (!email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const index = recipientsList.findIndex(r => r.id === recipientId);

  if (index === -1) {
    return res.status(404).json({ error: 'Recipient not found' });
  }

  const deleted = recipientsList.splice(index, 1)[0];
  console.log('Recipient deleted:', deleted);

  res.json({ success: true, deleted });
});

// ----- Group CRUD Operations -----

// Get all groups
app.get('/api/groups', (req, res) => {
  const email = req.cookies.userEmail;

  if (!email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  res.json(recipientGroups);
});

// Create new group
app.post('/api/groups', (req, res) => {
  const email = req.cookies.userEmail;
  const { name, description, color } = req.body;

  if (!email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!name) {
    return res.status(400).json({ error: 'Group name is required' });
  }

  const newGroup = {
    id: nextGroupId++,
    name,
    description: description || '',
    color: color || '#6c757d'
  };

  recipientGroups.push(newGroup);
  console.log('New group created:', newGroup);

  res.json(newGroup);
});

// Update group
app.put('/api/groups/:id', (req, res) => {
  const email = req.cookies.userEmail;
  const groupId = parseInt(req.params.id);
  const { name, description, color } = req.body;

  if (!email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const group = recipientGroups.find(g => g.id === groupId);

  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  if (name) group.name = name;
  if (description !== undefined) group.description = description;
  if (color) group.color = color;

  console.log('Group updated:', group);

  res.json(group);
});

// Delete group
app.delete('/api/groups/:id', (req, res) => {
  const email = req.cookies.userEmail;
  const groupId = parseInt(req.params.id);

  if (!email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const index = recipientGroups.findIndex(g => g.id === groupId);

  if (index === -1) {
    return res.status(404).json({ error: 'Group not found' });
  }

  // Remove group from all recipients
  recipientsList.forEach(r => {
    if (r.groupId === groupId) {
      r.groupId = null;
    }
  });

  const deleted = recipientGroups.splice(index, 1)[0];
  console.log('Group deleted:', deleted);

  res.json({ success: true, deleted });
});

// ----- Test Data Creation (for demo purposes) -----

app.post('/api/test/create-notification', (req, res) => {
  // Create a test notification
  const testNotification = {
    id: notifications.length + 1,
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
      jiraIssues: ['JIRA-123', 'JIRA-124', 'JIRA-125']
    },
    status: 'unread',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  notifications.push(testNotification);

  // Push to connected client
  const clientRes = clients.get('pm1@company.com');
  if (clientRes) {
    clientRes.write(`data: ${JSON.stringify({ type: 'notification', data: testNotification })}\n\n`);
  }

  res.json({ success: true, notification: testNotification });
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`\nTest users:`);
  users.forEach(u => console.log(`  Email: ${u.email}, Password: ${u.password}`));
});
