const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');

const app = express();
const db = new Database('conversations.db');
const API_KEY = 'your-secret-key'; // Must match Unity script

app.use(cors());
app.use(express.json());

// Serve dashboard.html and other static files
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    start_time TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    sender TEXT,
    message TEXT,
    timestamp TEXT,
    FOREIGN KEY(session_id) REFERENCES sessions(id)
  );
`);

// Auth middleware
function authMiddleware(req, res, next) {
  if (req.headers['x-api-key'] !== API_KEY)
    return res.status(401).json({ error: 'Unauthorized' });

  next();
}

// Save conversation from Unity
app.post('/api/conversations', authMiddleware, (req, res) => {
  const { sessionId, startTime, messages } = req.body;

  db.prepare(
    `INSERT OR IGNORE INTO sessions (id, start_time) VALUES (?, ?)`
  ).run(sessionId, startTime);

  const insertMsg = db.prepare(
    `INSERT INTO messages (session_id, sender, message, timestamp)
     VALUES (?, ?, ?, ?)`
  );

  const insertMany = db.transaction((msgs) => {
    for (const m of msgs) {
      insertMsg.run(
        m.sessionId,
        m.sender,
        m.message,
        m.timestamp
      );
    }
  });

  insertMany(messages);

  res.json({
    success: true,
    saved: messages.length
  });
});

// Get all sessions
app.get('/api/sessions', (req, res) => {
  const { date } = req.query;

  let query = `
    SELECT s.*, COUNT(m.id) AS message_count
    FROM sessions s
    LEFT JOIN messages m
    ON s.id = m.session_id
  `;

  const params = [];

  if (date) {
    query += ` WHERE DATE(s.start_time) = ?`;
    params.push(date);
  }

  query += `
    GROUP BY s.id
    ORDER BY s.start_time DESC
  `;

  res.json(db.prepare(query).all(...params));
});

// Get messages for a session
app.get('/api/sessions/:sessionId/messages', (req, res) => {
  const messages = db.prepare(
    `SELECT *
     FROM messages
     WHERE session_id = ?
     ORDER BY timestamp ASC`
  ).all(req.params.sessionId);

  res.json(messages);
});

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'running'
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});