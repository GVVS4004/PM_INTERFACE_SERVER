const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'your-api-key-here',
});

/**
 * POST /api/ai/suggest
 * Get AI suggestions for content improvement
 */
router.post('/suggest', async (req, res) => {
  try {
    const email = req.cookies.userEmail;
    const { content, prompt } = req.body;

    if (!email) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!content || !prompt) {
      return res.status(400).json({ error: 'Content and prompt are required' });
    }

    const message = await anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
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
    console.error('Claude API error:', error);
    res.status(500).json({
      error: 'Failed to generate AI suggestion',
      details: error.message,
    });
  }
});

module.exports = router;
