const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const Anthropic = require("@anthropic-ai/sdk");
const dotenv = require("dotenv");

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
app.use(bodyParser.json());
app.use(cookieParser());

// In-memory storage (for POC)
const users = [
  {
    email: "pm1@company.com",
    password: "password123",
    name: "Product Manager 1",
  },
  {
    email: "pm2@company.com",
    password: "password123",
    name: "Product Manager 2",
  },
];

const notifications = [];
const editHistory = [];
const sentReleases = []; // Track sent releases to recipients

// Recipients list (can be expanded)
const recipientsList = [
  {
    id: 1,
    email: "dev-team@company.com",
    name: "Development Team",
    role: "Development",
    groupId: 1,
  },
  {
    id: 2,
    email: "qa-team@company.com",
    name: "QA Team",
    role: "Quality Assurance",
    groupId: 1,
  },
  {
    id: 3,
    email: "stakeholders@company.com",
    name: "Stakeholders",
    role: "Management",
    groupId: 2,
  },
  {
    id: 4,
    email: "sales-team@company.com",
    name: "Sales Team",
    role: "Sales",
    groupId: 2,
  },
  {
    id: 5,
    email: "support-team@company.com",
    name: "Support Team",
    role: "Customer Support",
    groupId: 3,
  },
  {
    id: 6,
    email: "marketing@company.com",
    name: "Marketing Team",
    role: "Marketing",
    groupId: 2,
  },
];

// Recipient groups with users
const recipientGroups = [
  {
    id: 1,
    name: "Engineering",
    description: "Development and QA teams",
    color: "#007bff",
    users: [
      { userId: 1, name: "John Doe", email: "john.doe@company.com" },
      { userId: 2, name: "Jane Smith", email: "jane.smith@company.com" },
      { userId: 3, name: "Mike Johnson", email: "mike.j@company.com" },
      { userId: 4, name: "Sarah Wilson", email: "sarah.w@company.com" },
      { userId: 5, name: "Tom Brown", email: "tom.brown@company.com" },
      { userId: 6, name: "Emily Davis", email: "emily.d@company.com" },
    ],
    applicationIds: [1, 2], // Which apps this group has access to
  },
  {
    id: 2,
    name: "Business",
    description: "Sales, Marketing, and Management",
    color: "#28a745",
    users: [
      { userId: 7, name: "Robert Taylor", email: "robert.t@company.com" },
      { userId: 8, name: "Lisa Anderson", email: "lisa.a@company.com" },
      { userId: 9, name: "David Martinez", email: "david.m@company.com" },
      { userId: 10, name: "Jennifer Lee", email: "jennifer.l@company.com" },
    ],
    applicationIds: [1, 3],
  },
  {
    id: 3,
    name: "Support",
    description: "Customer support and service",
    color: "#ffc107",
    users: [
      { userId: 11, name: "Chris Garcia", email: "chris.g@company.com" },
      { userId: 12, name: "Amanda White", email: "amanda.w@company.com" },
      { userId: 13, name: "Kevin Harris", email: "kevin.h@company.com" },
    ],
    applicationIds: [2, 3],
  },
];

// External Applications Registry
const applications = [
  {
    id: 1,
    name: "CRM Dashboard",
    baseUrl: process.env.CRM_BASE_URL || "https://webhook.site/your-webhook-id-1",
    notificationEndpoint: "",
    apiKey: "crm-api-key-123",
    status: "active",
    activeUsers: 15,
    description: "Customer Relationship Management System"
  },
  {
    id: 2,
    name: "Analytics Platform",
    baseUrl: "https://webhook.site/your-webhook-id-2",
    notificationEndpoint: "",
    apiKey: "analytics-api-key-456",
    status: "active",
    activeUsers: 12,
    description: "Business Analytics and Reporting"
  },
  {
    id: 3,
    name: "Project Manager Tool",
    baseUrl: "https://webhook.site/your-webhook-id-3",
    notificationEndpoint: "",
    apiKey: "pm-api-key-789",
    status: "active",
    activeUsers: 8,
    description: "Project Management and Tracking"
  },
];

let nextRecipientId = 7;
let nextGroupId = 4;
let nextApplicationId = 4;
let nextUserId = 14;

// Active SSE connections
const clients = new Map(); // email -> response object

// Claude API setup (you'll need to add your API key)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "your-api-key-here",
});

// ----- Authentication Routes -----

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;

  const user = users.find((u) => u.email === email && u.password === password);

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // Set simple session cookie
  res.cookie("userEmail", email, {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: "none",
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  }); // 1 day expiry

  res.json({ success: true, user: { email: user.email, name: user.name } });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("userEmail");
  res.json({ success: true });
});

app.get("/api/auth/me", (req, res) => {
  const email = req.cookies.userEmail;
  console.log(req.cookies);

  if (!email) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const user = users.find((u) => u.email === email);

  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  res.json({ email: user.email, name: user.name });
});

// ----- SSE Endpoint -----

app.get("/api/events", (req, res) => {
  const email = req.cookies.userEmail;

  if (!email) {
    return res.status(401).send("Not authenticated");
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Store this client connection
  clients.set(email, res);
  console.log(`SSE client connected: ${email}`);

  // Send initial connection message
  res.write(
    `data: ${JSON.stringify({
      type: "connected",
      message: "SSE connected",
    })}\n\n`
  );

  // Send existing notifications for this user with source metadata
  const userNotifications = notifications
    .filter((n) => n.targetEmail === email)
    .map((n) => ({
      ...n,
      source: n.metadata?.source || "external",
      createdBy: n.metadata?.createdBy,
    }));
  if (userNotifications.length > 0) {
    res.write(
      `data: ${JSON.stringify({
        type: "initial",
        notifications: userNotifications,
      })}\n\n`
    );
  }

  // Clean up when disconnected
  req.on("close", () => {
    clients.delete(email);
    console.log(`SSE client disconnected: ${email}`);
  });
});

// ----- Notification Routes -----

app.get("/api/notifications", (req, res) => {
  const email = req.cookies.userEmail;
  console.log(req.cookies);
  if (!email) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userNotifications = notifications
    .filter((n) => n.targetEmail === email)
    .map((n) => ({
      ...n,
      source: n.metadata?.source || "external",
      createdBy: n.metadata?.createdBy,
    }));
  res.json(userNotifications);
});

app.get("/api/notifications/:id", (req, res) => {
  const email = req.cookies.userEmail;
  const notificationId = parseInt(req.params.id);

  if (!email) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const notification = notifications.find(
    (n) => n.id === notificationId && n.targetEmail === email
  );

  if (!notification) {
    return res.status(404).json({ error: "Notification not found" });
  }

  res.json({
    ...notification,
    source: notification.metadata?.source || "external",
    createdBy: notification.metadata?.createdBy,
  });
});

app.put("/api/notifications/:id", (req, res) => {
  const email = req.cookies.userEmail;
  const notificationId = parseInt(req.params.id);
  const { content, status, action } = req.body;

  if (!email) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const notification = notifications.find(
    (n) => n.id === notificationId && n.targetEmail === email
  );

  if (!notification) {
    return res.status(404).json({ error: "Notification not found" });
  }

  // Save to edit history
  if (content && content !== notification.content) {
    editHistory.push({
      id: editHistory.length + 1,
      notificationId,
      userEmail: email,
      originalContent: notification.content,
      editedContent: content,
      editType: "manual",
      timestamp: new Date().toISOString(),
    });

    notification.content = content;
  }

  if (status) {
    notification.status = status;
  }

  // Handle accept/reject actions
  if (action === "accepted" || action === "rejected") {
    notification.action = action;
    notification.actionDate = new Date().toISOString();
  }

  notification.updatedAt = new Date().toISOString();

  res.json(notification);
});

// ----- Create Notification Endpoint (PM creates new notification) -----

app.post("/api/notifications/create", async (req, res) => {
  const { title, content, jiraReleaseNotes, recipientIds, isDraft, source } =
    req.body;
  const userEmail = req.cookies.userEmail;

  // Auth check
  if (!userEmail) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // Validation
  if (!title || !title.trim()) {
    return res.status(400).json({ error: "Title is required" });
  }

  if (!content || content.trim() === "" || content === "<p><br></p>") {
    return res.status(400).json({ error: "Content is required" });
  }

  if (title.length > 200) {
    return res
      .status(400)
      .json({ error: "Title must be less than 200 characters" });
  }

  // Content size validation (10MB max)
  const MAX_CONTENT_SIZE = 10 * 1024 * 1024;
  if (content.length > MAX_CONTENT_SIZE) {
    return res.status(400).json({
      error: "Content too large. Maximum size is 10MB.",
    });
  }

  // Get user name for createdBy
  const user = users.find((u) => u.email === userEmail);

  // Create notification
  const notification = {
    id: notifications.length + 1,
    targetEmail: userEmail,
    title: title.trim(),
    content: content,
    jiraReleaseNotes: jiraReleaseNotes || "",
    metadata: {
      source: source || "pm_created",
      isDraft: isDraft === true,
      createdBy: user ? user.name : userEmail,
    },
    status: isDraft ? "draft" : "unread",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  notifications.push(notification);

  // If not draft and has recipients, send immediately
  if (!isDraft && recipientIds && recipientIds.length > 0) {
    try {
      const selectedRecipients = recipientsList.filter((r) =>
        recipientIds.includes(r.id)
      );

      if (selectedRecipients.length === 0) {
        return res.status(400).json({ error: "No valid recipients selected" });
      }

      // Create sent release record
      const sentRelease = {
        id: sentReleases.length + 1,
        notificationId: notification.id,
        sentBy: userEmail,
        recipients: selectedRecipients,
        content: notification.content,
        title: notification.title,
        sentAt: new Date().toISOString(),
      };

      sentReleases.push(sentRelease);

      // Update notification
      notification.status = "sent";
      notification.sentTo = selectedRecipients;
      notification.sentAt = sentRelease.sentAt;

      console.log(
        `PM-created notification sent to ${selectedRecipients.length} recipients`
      );
    } catch (error) {
      console.error("Failed to send notification:", error);
      return res
        .status(500)
        .json({ error: "Failed to send notification to recipients" });
    }
  }

  // Push to SSE if PM is connected
  const clientResponse = clients.get(userEmail);
  if (clientResponse) {
    clientResponse.write(
      `data: ${JSON.stringify({
        type: "notification",
        data: {
          ...notification,
          source: notification.metadata.source,
          createdBy: notification.metadata.createdBy,
        },
      })}\n\n`
    );
  }

  res.json({
    success: true,
    notification: notification,
    message: isDraft
      ? "Draft saved successfully"
      : recipientIds && recipientIds.length > 0
      ? `Notification sent to ${recipientIds.length} recipients`
      : "Notification created successfully",
  });
});

// ----- Webhook Endpoint (receives notifications from external service) -----

app.post("/api/webhook/notification", (req, res) => {
  const { targetEmail, title, content, jiraReleaseNotes, metadata } = req.body;

  if (!targetEmail || !title || !content) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const notification = {
    id: notifications.length + 1,
    targetEmail,
    title,
    content,
    jiraReleaseNotes: jiraReleaseNotes || "",
    metadata: {
      ...(metadata || {}),
      source: "external",
    },
    status: "unread",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  notifications.push(notification);

  // Push to connected client if online
  const clientRes = clients.get(targetEmail);
  if (clientRes) {
    clientRes.write(
      `data: ${JSON.stringify({
        type: "notification",
        data: {
          ...notification,
          source: notification.metadata.source,
        },
      })}\n\n`
    );
  }

  console.log(`New notification created for ${targetEmail}: ${title}`);

  res.json({ success: true, notification });
});

// ----- AI Integration Routes -----

app.post("/api/ai/suggest", async (req, res) => {
  const email = req.cookies.userEmail;
  const { content, prompt } = req.body;

  if (!email) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (!content || !prompt) {
    return res.status(400).json({ error: "Content and prompt are required" });
  }

  try {
    const message = await anthropic.messages.create({
      model: "claude-3-opus-20240229",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are a helpful assistant for product managers. You help improve and edit release notes, make them more professional, clear, and concise.

Current release notes:
${content}

User request: ${prompt}

Provide the improved version:`,
        },
      ],
    });

    const suggestion = message.content[0].text;

    res.json({ suggestion });
  } catch (error) {
    console.error("Claude API error:", error);
    res
      .status(500)
      .json({
        error: "Failed to generate AI suggestion",
        details: error.message,
      });
  }
});

// ----- Recipients Management -----

app.get("/api/recipients", (req, res) => {
  const email = req.cookies.userEmail;

  console.log("GET /api/recipients - Email from cookie:", req);
  console.log("Recipients list:", recipientsList);

  if (!email) {
    console.log("No email in cookie - not authenticated");
    return res.status(401).json({ error: "Not authenticated" });
  }

  console.log(`Sending ${recipientsList.length} recipients to ${email}`);
  res.json(recipientsList);
});

app.post("/api/notifications/:id/send", async (req, res) => {
  const email = req.cookies.userEmail;
  const notificationId = parseInt(req.params.id);
  const { recipientIds } = req.body;

  if (!email) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const notification = notifications.find(
    (n) => n.id === notificationId && n.targetEmail === email
  );

  if (!notification) {
    return res.status(404).json({ error: "Notification not found" });
  }

  if (
    !recipientIds ||
    !Array.isArray(recipientIds) ||
    recipientIds.length === 0
  ) {
    return res
      .status(400)
      .json({ error: "Please select at least one recipient" });
  }

  // Get selected recipients
  const selectedRecipients = recipientsList.filter((r) =>
    recipientIds.includes(r.id)
  );

  // Create sent release record
  const sentRelease = {
    id: sentReleases.length + 1,
    notificationId,
    sentBy: email,
    recipients: selectedRecipients,
    content: notification.content,
    title: notification.title,
    sentAt: new Date().toISOString(),
  };

  sentReleases.push(sentRelease);

  // Update notification status
  notification.status = "sent";
  notification.sentTo = selectedRecipients;
  notification.sentAt = new Date().toISOString();

  // In a real app, you would send emails here
  console.log(
    `Release notes sent to ${selectedRecipients.length} recipients:`,
    selectedRecipients.map((r) => r.email)
  );

  res.json({
    success: true,
    message: `Release notes sent to ${selectedRecipients.length} recipients`,
    sentRelease,
  });
});

// ----- Recipient CRUD Operations -----

// Create new recipient
app.post("/api/recipients", (req, res) => {
  const email = req.cookies.userEmail;
  const { name, email: recipientEmail, role, groupId } = req.body;

  if (!email) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (!name || !recipientEmail || !role) {
    return res
      .status(400)
      .json({ error: "Name, email, and role are required" });
  }

  // Check if email already exists
  if (recipientsList.find((r) => r.email === recipientEmail)) {
    return res.status(400).json({ error: "Email already exists" });
  }

  const newRecipient = {
    id: nextRecipientId++,
    name,
    email: recipientEmail,
    role,
    groupId: groupId || null,
  };

  recipientsList.push(newRecipient);
  console.log("New recipient created:", newRecipient);

  res.json(newRecipient);
});

// Update recipient
app.put("/api/recipients/:id", (req, res) => {
  const email = req.cookies.userEmail;
  const recipientId = parseInt(req.params.id);
  const { name, email: recipientEmail, role, groupId } = req.body;

  if (!email) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const recipient = recipientsList.find((r) => r.id === recipientId);

  if (!recipient) {
    return res.status(404).json({ error: "Recipient not found" });
  }

  // Check if new email already exists (excluding current recipient)
  if (recipientEmail && recipientEmail !== recipient.email) {
    if (
      recipientsList.find(
        (r) => r.email === recipientEmail && r.id !== recipientId
      )
    ) {
      return res.status(400).json({ error: "Email already exists" });
    }
  }

  if (name) recipient.name = name;
  if (recipientEmail) recipient.email = recipientEmail;
  if (role) recipient.role = role;
  if (groupId !== undefined) recipient.groupId = groupId;

  console.log("Recipient updated:", recipient);

  res.json(recipient);
});

// Delete recipient
app.delete("/api/recipients/:id", (req, res) => {
  const email = req.cookies.userEmail;
  const recipientId = parseInt(req.params.id);

  if (!email) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const index = recipientsList.findIndex((r) => r.id === recipientId);

  if (index === -1) {
    return res.status(404).json({ error: "Recipient not found" });
  }

  const deleted = recipientsList.splice(index, 1)[0];
  console.log("Recipient deleted:", deleted);

  res.json({ success: true, deleted });
});

// ----- Group CRUD Operations -----

// Get all groups with enhanced data
app.get("/api/groups", (req, res) => {
  const email = req.cookies.userEmail;

  if (!email) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // Return groups with user count and application info
  const groupsWithCounts = recipientGroups.map(group => ({
    ...group,
    userCount: group.users ? group.users.length : 0,
    applications: applications.filter(app =>
      group.applicationIds && group.applicationIds.includes(app.id)
    ).map(app => ({ id: app.id, name: app.name }))
  }));

  res.json(groupsWithCounts);
});

// Create new group
app.post("/api/groups", (req, res) => {
  const email = req.cookies.userEmail;
  const { name, description, color } = req.body;

  if (!email) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (!name) {
    return res.status(400).json({ error: "Group name is required" });
  }

  const newGroup = {
    id: nextGroupId++,
    name,
    description: description || "",
    color: color || "#6c757d",
  };

  recipientGroups.push(newGroup);
  console.log("New group created:", newGroup);

  res.json(newGroup);
});

// Update group
app.put("/api/groups/:id", (req, res) => {
  const email = req.cookies.userEmail;
  const groupId = parseInt(req.params.id);
  const { name, description, color } = req.body;

  if (!email) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const group = recipientGroups.find((g) => g.id === groupId);

  if (!group) {
    return res.status(404).json({ error: "Group not found" });
  }

  if (name) group.name = name;
  if (description !== undefined) group.description = description;
  if (color) group.color = color;

  console.log("Group updated:", group);

  res.json(group);
});

// Delete group
app.delete("/api/groups/:id", (req, res) => {
  const email = req.cookies.userEmail;
  const groupId = parseInt(req.params.id);

  if (!email) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const index = recipientGroups.findIndex((g) => g.id === groupId);

  if (index === -1) {
    return res.status(404).json({ error: "Group not found" });
  }

  // Remove group from all recipients
  recipientsList.forEach((r) => {
    if (r.groupId === groupId) {
      r.groupId = null;
    }
  });

  const deleted = recipientGroups.splice(index, 1)[0];
  console.log("Group deleted:", deleted);

  res.json({ success: true, deleted });
});

// ----- Application Management -----

// Get all applications
app.get("/api/applications", (req, res) => {
  const email = req.cookies.userEmail;

  if (!email) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  console.log(`Sending ${applications.length} applications to ${email}`);
  res.json(applications);
});

// Create new application
app.post("/api/applications", (req, res) => {
  const email = req.cookies.userEmail;
  const { name, baseUrl, notificationEndpoint, apiKey, description, activeUsers } = req.body;

  if (!email) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (!name || !baseUrl) {
    return res.status(400).json({ error: "Name and baseUrl are required" });
  }

  const newApp = {
    id: nextApplicationId++,
    name,
    baseUrl,
    notificationEndpoint: notificationEndpoint || "",
    apiKey: apiKey || "",
    status: "active",
    activeUsers: activeUsers || 0,
    description: description || "",
  };

  applications.push(newApp);
  console.log("New application created:", newApp);

  res.json(newApp);
});

// Update application
app.put("/api/applications/:id", (req, res) => {
  const email = req.cookies.userEmail;
  const appId = parseInt(req.params.id);
  const { name, baseUrl, notificationEndpoint, apiKey, description, activeUsers, status } = req.body;

  if (!email) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const app = applications.find((a) => a.id === appId);

  if (!app) {
    return res.status(404).json({ error: "Application not found" });
  }

  if (name) app.name = name;
  if (baseUrl) app.baseUrl = baseUrl;
  if (notificationEndpoint !== undefined) app.notificationEndpoint = notificationEndpoint;
  if (apiKey !== undefined) app.apiKey = apiKey;
  if (description !== undefined) app.description = description;
  if (activeUsers !== undefined) app.activeUsers = activeUsers;
  if (status) app.status = status;

  console.log("Application updated:", app);

  res.json(app);
});

// Delete application
app.delete("/api/applications/:id", (req, res) => {
  const email = req.cookies.userEmail;
  const appId = parseInt(req.params.id);

  if (!email) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const index = applications.findIndex((a) => a.id === appId);

  if (index === -1) {
    return res.status(404).json({ error: "Application not found" });
  }

  const deleted = applications.splice(index, 1)[0];
  console.log("Application deleted:", deleted);

  res.json({ success: true, deleted });
});

// ----- Bulk Notification Send to External Applications -----

app.post("/api/notifications/:id/send-bulk", async (req, res) => {
  const email = req.cookies.userEmail;
  const notificationId = parseInt(req.params.id);
  const { groupIds, applicationIds } = req.body;

  if (!email) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const notification = notifications.find(
    (n) => n.id === notificationId && n.targetEmail === email
  );

  if (!notification) {
    return res.status(404).json({ error: "Notification not found" });
  }

  if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
    return res.status(400).json({ error: "Please select at least one group" });
  }

  if (!applicationIds || !Array.isArray(applicationIds) || applicationIds.length === 0) {
    return res.status(400).json({ error: "Please select at least one application" });
  }

  // Collect users from selected groups
  const selectedGroups = recipientGroups.filter((g) => groupIds.includes(g.id));
  const allUsersMap = new Map(); // For deduplication

  selectedGroups.forEach(group => {
    if (group.users) {
      group.users.forEach(user => {
        allUsersMap.set(user.userId, user);
      });
    }
  });

  const allUsers = Array.from(allUsersMap.values());

  if (allUsers.length === 0) {
    return res.status(400).json({ error: "No users found in selected groups" });
  }

  // Get selected applications
  const selectedApplications = applications.filter((a) => applicationIds.includes(a.id));

  if (selectedApplications.length === 0) {
    return res.status(400).json({ error: "No valid applications selected" });
  }

  const results = [];
  const errors = [];

  // Send to each application
  for (const app of selectedApplications) {
    try {
      const payload = {
        source: "PM_INTERFACE",
        notificationId: notification.id,
        title: notification.title,
        content: notification.content,
        priority: "high",
        type: "release_notes",
        targetUsers: allUsers,
        metadata: {
          sentBy: email,
          sentAt: new Date().toISOString(),
          jiraReleaseNotes: notification.jiraReleaseNotes,
          groups: selectedGroups.map(g => ({ id: g.id, name: g.name })),
          applicationId: app.id,
          applicationName: app.name
        },
        // Tracking configuration
        trackingEnabled: true,
        trackingCallbackUrl: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/notifications/track-open`
      };

      console.log(`\n${"=".repeat(60)}`);
      console.log(`📤 Sending bulk notification to: ${app.name}`);
      console.log(`   URL: ${app.baseUrl}${app.notificationEndpoint}`);
      console.log(`   Total Users: ${allUsers.length}`);
      console.log(`   Groups: ${selectedGroups.map(g => g.name).join(", ")}`);
      console.log(`${"=".repeat(60)}\n`);

      // Make HTTP POST request to external application
      const fetch = require("node-fetch");
      const targetUrl = app.baseUrl + (app.notificationEndpoint || "");

      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": app.apiKey ? `Bearer ${app.apiKey}` : "",
          "X-PM-Interface-Source": "true"
        },
        body: JSON.stringify(payload),
        timeout: 10000 // 10 second timeout
      });

      const responseData = await response.text();

      results.push({
        applicationId: app.id,
        applicationName: app.name,
        success: response.ok,
        statusCode: response.status,
        userCount: allUsers.length,
        responseData: responseData
      });

      console.log(`✅ Successfully sent to ${app.name} (Status: ${response.status})`);

    } catch (error) {
      console.error(`❌ Failed to send to ${app.name}:`, error.message);
      errors.push({
        applicationId: app.id,
        applicationName: app.name,
        error: error.message
      });
      results.push({
        applicationId: app.id,
        applicationName: app.name,
        success: false,
        error: error.message,
        userCount: allUsers.length
      });
    }
  }

  // Create sent release record with tracking
  const sentRelease = {
    id: sentReleases.length + 1,
    notificationId,
    sentBy: email,
    groups: selectedGroups,
    applications: selectedApplications,
    totalUsers: allUsers.length,
    users: allUsers,
    content: notification.content,
    title: notification.title,
    sentAt: new Date().toISOString(),
    results: results,
    // Tracking data
    tracking: {
      totalSent: allUsers.length,
      opened: 0,
      openedUsers: [],
      openRate: 0,
      lastOpenedAt: null
    }
  };

  sentReleases.push(sentRelease);

  // Update notification status
  notification.status = "sent";
  notification.sentTo = allUsers;
  notification.sentAt = new Date().toISOString();
  notification.sentVia = {
    groups: selectedGroups.map(g => ({ id: g.id, name: g.name })),
    applications: selectedApplications.map(a => ({ id: a.id, name: a.name }))
  };
  notification.tracking = {
    totalSent: allUsers.length,
    opened: 0,
    openedUsers: [],
    openRate: 0,
    lastOpenedAt: null
  };

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 Bulk Send Summary:`);
  console.log(`   Total Applications: ${selectedApplications.length}`);
  console.log(`   Successful: ${successCount}`);
  console.log(`   Failed: ${failureCount}`);
  console.log(`   Total Users Notified: ${allUsers.length}`);
  console.log(`   Groups: ${selectedGroups.map(g => g.name).join(", ")}`);
  console.log(`${"=".repeat(60)}\n`);

  res.json({
    success: true,
    message: `Notification sent to ${allUsers.length} users across ${successCount} application(s)`,
    summary: {
      totalApplications: selectedApplications.length,
      successfulApplications: successCount,
      failedApplications: failureCount,
      totalUsers: allUsers.length,
      groups: selectedGroups.map(g => ({ id: g.id, name: g.name, userCount: g.users.length })),
      applications: selectedApplications.map(a => ({ id: a.id, name: a.name }))
    },
    results: results,
    sentRelease: sentRelease
  });
});

// ----- Notification Tracking Endpoints -----

// Track when a user opens a notification (callback from external app)
app.post("/api/notifications/track-open", (req, res) => {
  const { notificationId, userId, userEmail, userName, applicationId, applicationName, openedAt } = req.body;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`👀 Notification Opened Tracking:`);
  console.log(`   Notification ID: ${notificationId}`);
  console.log(`   User: ${userName} (${userEmail})`);
  console.log(`   Application: ${applicationName}`);
  console.log(`   Opened At: ${openedAt}`);
  console.log(`${"=".repeat(60)}\n`);

  if (!notificationId || !userId) {
    return res.status(400).json({ error: "notificationId and userId are required" });
  }

  // Find the sent release record
  const sentRelease = sentReleases.find(sr => sr.notificationId === notificationId);

  if (!sentRelease) {
    return res.status(404).json({ error: "Sent release record not found" });
  }

  // Check if user already opened it (prevent duplicates)
  const alreadyOpened = sentRelease.tracking.openedUsers.some(u => u.userId === userId);

  if (alreadyOpened) {
    console.log(`   ⚠️  User already opened this notification`);
    return res.json({
      success: true,
      message: "Already tracked",
      alreadyTracked: true
    });
  }

  // Add to opened users
  const openedUser = {
    userId,
    name: userName || userEmail,
    email: userEmail,
    openedAt: openedAt || new Date().toISOString(),
    applicationId: applicationId || null,
    applicationName: applicationName || "Unknown"
  };

  sentRelease.tracking.openedUsers.push(openedUser);
  sentRelease.tracking.opened = sentRelease.tracking.openedUsers.length;
  sentRelease.tracking.openRate = Math.round((sentRelease.tracking.opened / sentRelease.tracking.totalSent) * 100);
  sentRelease.tracking.lastOpenedAt = openedUser.openedAt;

  // Update the notification object as well
  const notification = notifications.find(n => n.id === notificationId);
  if (notification && notification.tracking) {
    notification.tracking.openedUsers.push(openedUser);
    notification.tracking.opened = notification.tracking.openedUsers.length;
    notification.tracking.openRate = Math.round((notification.tracking.opened / notification.tracking.totalSent) * 100);
    notification.tracking.lastOpenedAt = openedUser.openedAt;
  }

  console.log(`   ✅ Tracking updated: ${sentRelease.tracking.opened}/${sentRelease.tracking.totalSent} opened (${sentRelease.tracking.openRate}%)`);

  res.json({
    success: true,
    message: "Notification open tracked successfully",
    tracking: {
      totalSent: sentRelease.tracking.totalSent,
      opened: sentRelease.tracking.opened,
      openRate: sentRelease.tracking.openRate
    }
  });
});

// Get tracking statistics for a notification
app.get("/api/notifications/:id/tracking", (req, res) => {
  const notificationId = parseInt(req.params.id);
  const email = req.cookies.userEmail;

  if (!email) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // Find the notification
  const notification = notifications.find(n => n.id === notificationId && n.targetEmail === email);

  if (!notification) {
    return res.status(404).json({ error: "Notification not found" });
  }

  // Find the sent release record
  const sentRelease = sentReleases.find(sr => sr.notificationId === notificationId);

  if (!sentRelease || !sentRelease.tracking) {
    return res.json({
      notificationId,
      totalSent: 0,
      totalOpened: 0,
      openRate: 0,
      openedUsers: [],
      notOpenedUsers: [],
      byApplication: []
    });
  }

  // Get users who haven't opened
  const openedUserIds = new Set(sentRelease.tracking.openedUsers.map(u => u.userId));
  const notOpenedUsers = sentRelease.users.filter(u => !openedUserIds.has(u.userId));

  // Group by application
  const byApplication = sentRelease.applications.map(app => {
    const appOpenedUsers = sentRelease.tracking.openedUsers.filter(u => u.applicationId === app.id);
    const appTotalUsers = sentRelease.users.filter(user => {
      // Find which groups this user belongs to
      const userGroups = sentRelease.groups.filter(g =>
        g.users && g.users.some(gu => gu.userId === user.userId)
      );
      // Check if any of these groups have access to this application
      return userGroups.some(g => g.applicationIds && g.applicationIds.includes(app.id));
    });

    return {
      applicationId: app.id,
      applicationName: app.name,
      totalSent: appTotalUsers.length,
      opened: appOpenedUsers.length,
      openRate: appTotalUsers.length > 0 ? Math.round((appOpenedUsers.length / appTotalUsers.length) * 100) : 0
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
    lastOpenedAt: sentRelease.tracking.lastOpenedAt
  });
});

// ----- Test Data Creation (for demo purposes) -----

app.post("/api/test/create-notification", (req, res) => {
  // Create a test notification
  const testNotification = {
    id: notifications.length + 1,
    targetEmail: "pm1@company.com",
    title: "Release v2.5.0 - Q1 2025",
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
    jiraReleaseNotes: "JIRA-123, JIRA-124, JIRA-125",
    metadata: {
      version: "2.5.0",
      releaseDate: "2025-01-15",
      jiraIssues: ["JIRA-123", "JIRA-124", "JIRA-125"],
    },
    status: "unread",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  notifications.push(testNotification);

  // Push to connected client
  const clientRes = clients.get("pm1@company.com");
  if (clientRes) {
    clientRes.write(
      `data: ${JSON.stringify({
        type: "notification",
        data: testNotification,
      })}\n\n`
    );
  }

  res.json({ success: true, notification: testNotification });
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`\nTest users:`);
  users.forEach((u) =>
    console.log(`  Email: ${u.email}, Password: ${u.password}`)
  );
});
