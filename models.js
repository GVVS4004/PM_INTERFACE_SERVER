const mongoose = require('mongoose');

// User Schema
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Notification Schema
const notificationSchema = new mongoose.Schema({
  targetEmail: {
    type: String,
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  jiraReleaseNotes: {
    type: String,
    default: ''
  },
  metadata: {
    source: String,
    isDraft: Boolean,
    createdBy: String,
    version: String,
    releaseDate: String,
    jiraIssues: [String],
    applicationId: Number,
    applicationName: String,
    groups: [{
      id: Number,
      name: String
    }]
  },
  status: {
    type: String,
    enum: ['unread', 'read', 'sent', 'rejected', 'draft'],
    default: 'unread'
  },
  action: {
    type: String,
    enum: ['accepted', 'rejected'],
    default: null
  },
  actionDate: Date,
  sentTo: [{
    userId: Number,
    name: String,
    email: String
  }],
  sentAt: Date,
  sentVia: {
    groups: [{
      id: Number,
      name: String
    }],
    applications: [{
      id: Number,
      name: String
    }]
  },
  tracking: {
    totalSent: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    openedUsers: [{
      userId: Number,
      name: String,
      email: String,
      openedAt: Date,
      applicationId: Number,
      applicationName: String
    }],
    openRate: { type: Number, default: 0 },
    lastOpenedAt: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Recipient Schema
const recipientSchema = new mongoose.Schema({
  recipientId: {
    type: Number,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  role: {
    type: String,
    required: true
  },
  groupId: {
    type: Number,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Recipient Group Schema
const recipientGroupSchema = new mongoose.Schema({
  groupId: {
    type: Number,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  color: {
    type: String,
    default: '#6c757d'
  },
  users: [{
    userId: Number,
    name: String,
    email: String
  }],
  applicationIds: [Number],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Application Schema
const applicationSchema = new mongoose.Schema({
  applicationId: {
    type: Number,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  baseUrl: {
    type: String,
    required: true
  },
  notificationEndpoint: {
    type: String,
    default: ''
  },
  apiKey: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance'],
    default: 'active'
  },
  activeUsers: {
    type: Number,
    default: 0
  },
  description: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Sent Release Schema
const sentReleaseSchema = new mongoose.Schema({
  releaseId: {
    type: Number,
    required: true,
    unique: true
  },
  notificationId: {
    type: Number,
    required: true,
    index: true
  },
  sentBy: {
    type: String,
    required: true
  },
  groups: [{
    id: Number,
    name: String,
    description: String,
    color: String,
    users: [{
      userId: Number,
      name: String,
      email: String
    }],
    applicationIds: [Number]
  }],
  applications: [{
    id: Number,
    name: String,
    baseUrl: String,
    description: String
  }],
  recipients: [{
    id: Number,
    name: String,
    email: String,
    role: String
  }],
  totalUsers: {
    type: Number,
    default: 0
  },
  users: [{
    userId: Number,
    name: String,
    email: String
  }],
  content: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  results: [{
    applicationId: Number,
    applicationName: String,
    success: Boolean,
    statusCode: Number,
    userCount: Number,
    responseData: String,
    error: String
  }],
  tracking: {
    totalSent: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    openedUsers: [{
      userId: Number,
      name: String,
      email: String,
      openedAt: Date,
      applicationId: Number,
      applicationName: String
    }],
    openRate: { type: Number, default: 0 },
    lastOpenedAt: Date
  },
  sentAt: {
    type: Date,
    default: Date.now
  }
});

// Edit History Schema
const editHistorySchema = new mongoose.Schema({
  historyId: {
    type: Number,
    required: true,
    unique: true
  },
  notificationId: {
    type: Number,
    required: true,
    index: true
  },
  userEmail: {
    type: String,
    required: true
  },
  originalContent: {
    type: String,
    required: true
  },
  editedContent: {
    type: String,
    required: true
  },
  editType: {
    type: String,
    enum: ['manual', 'ai'],
    default: 'manual'
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Create and export models
const User = mongoose.model('User', userSchema);
const Notification = mongoose.model('Notification', notificationSchema);
const Recipient = mongoose.model('Recipient', recipientSchema);
const RecipientGroup = mongoose.model('RecipientGroup', recipientGroupSchema);
const Application = mongoose.model('Application', applicationSchema);
const SentRelease = mongoose.model('SentRelease', sentReleaseSchema);
const EditHistory = mongoose.model('EditHistory', editHistorySchema);

module.exports = {
  User,
  Notification,
  Recipient,
  RecipientGroup,
  Application,
  SentRelease,
  EditHistory
};
