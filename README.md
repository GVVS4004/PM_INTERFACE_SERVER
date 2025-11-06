# Backend API Server

Express.js server with SSE support, authentication, and OpenAI integration.

## Setup

```bash
npm install
```

Create a `.env` file with:
```
OPENAI_API_KEY=your-key-here
PORT=4000
```

## Start Server

```bash
npm start
```

Server runs on `http://localhost:4000`

## Test Users

- Email: `pm1@company.com`, Password: `password123`
- Email: `pm2@company.com`, Password: `password123`

## Quick Test

Create a test notification:
```bash
curl -X POST http://localhost:4000/api/test/create-notification
```
