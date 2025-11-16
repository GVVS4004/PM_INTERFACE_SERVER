/**
 * SSE Manager - Manages Server-Sent Events client connections
 */

class SSEManager {
  constructor() {
    this.clients = new Map(); // email -> response object
  }

  /**
   * Add a new SSE client connection
   * @param {string} email - User email
   * @param {Response} res - Express response object
   */
  addClient(email, res) {
    this.clients.set(email, res);
    console.log(`✅ SSE client connected: ${email} (Total: ${this.clients.size})`);
  }

  /**
   * Remove an SSE client connection
   * @param {string} email - User email
   */
  removeClient(email) {
    this.clients.delete(email);
    console.log(`❌ SSE client disconnected: ${email} (Total: ${this.clients.size})`);
  }

  /**
   * Get a client connection
   * @param {string} email - User email
   * @returns {Response|undefined} Express response object
   */
  getClient(email) {
    return this.clients.get(email);
  }

  /**
   * Send a message to a specific client
   * @param {string} email - User email
   * @param {object} data - Data to send
   * @returns {boolean} Success status
   */
  sendToClient(email, data) {
    const client = this.clients.get(email);
    if (!client) {
      console.log(`⚠️  Client not connected: ${email}`);
      return false;
    }

    try {
      client.write(`data: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to send to ${email}:`, error.message);
      this.removeClient(email);
      return false;
    }
  }

  /**
   * Send a notification to a specific client
   * @param {string} email - User email
   * @param {object} notification - Notification data
   */
  sendNotification(email, notification) {
    return this.sendToClient(email, {
      type: 'notification',
      data: notification,
    });
  }

  /**
   * Send initial connection confirmation
   * @param {string} email - User email
   */
  sendConnectionConfirmation(email) {
    return this.sendToClient(email, {
      type: 'connected',
      message: 'SSE connected',
    });
  }

  /**
   * Send initial notifications to a client
   * @param {string} email - User email
   * @param {Array} notifications - Array of notifications
   */
  sendInitialNotifications(email, notifications) {
    return this.sendToClient(email, {
      type: 'initial',
      notifications: notifications,
    });
  }

  /**
   * Broadcast to all connected clients
   * @param {object} data - Data to broadcast
   */
  broadcast(data) {
    let successCount = 0;
    for (const [email, client] of this.clients.entries()) {
      try {
        client.write(`data: ${JSON.stringify(data)}\n\n`);
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to broadcast to ${email}:`, error.message);
        this.removeClient(email);
      }
    }
    console.log(`📡 Broadcasted to ${successCount}/${this.clients.size} clients`);
  }

  /**
   * Get count of connected clients
   * @returns {number} Number of connected clients
   */
  getClientCount() {
    return this.clients.size;
  }

  /**
   * Get all connected client emails
   * @returns {Array<string>} Array of emails
   */
  getConnectedEmails() {
    return Array.from(this.clients.keys());
  }

  /**
   * Check if a client is connected
   * @param {string} email - User email
   * @returns {boolean}
   */
  isConnected(email) {
    return this.clients.has(email);
  }
}

// Export singleton instance
module.exports = new SSEManager();
