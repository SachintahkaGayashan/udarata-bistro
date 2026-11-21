require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://test-5b6ed-default-rtdb.firebaseio.com',
});
const db = admin.database();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1kb' }));

// CORS: allow-list එකේ origins පමණයි
const origins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: origins,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limit: විනාඩියකට requests 60
app.use(rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false }));

// Admin token verify middleware
async function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const decoded = await admin.auth().verifyIdToken(token, true); // true = revoked tokens ප්‍රතික්ෂේප කරයි
    if (decoded.admin !== true) return res.status(403).json({ error: 'Admins only' });
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

const COMMANDS = ['FORWARD', 'REVERSE', 'STOP'];

// 1. Direction commands
app.post('/api/robot/command', requireAdmin, async (req, res) => {
  const { command } = req.body || {};
  if (!COMMANDS.includes(command)) {
    return res.status(400).json({ error: 'Invalid command' });
  }
  try {
    await db.ref('robot').update({
      command,
      timestamp: admin.database.ServerValue.TIMESTAMP,
    });
    console.log(`[${new Date().toISOString()}] ${req.user.email} -> ${command}`);
    res.status(200).json({ status: 'Success', command });
  } catch (err) {
    console.error('command error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 2. Ultrasonic toggle
app.post('/api/robot/ultrasonic', requireAdmin, async (req, res) => {
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be true or false' });
  }
  try {
    await db.ref('robot').update({
      ultrasonicEnabled: enabled,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    });
    console.log(`[${new Date().toISOString()}] ${req.user.email} ultrasonic -> ${enabled}`);
    res.status(200).json({ status: 'Success', ultrasonicEnabled: enabled });
  } catch (err) {
    console.error('ultrasonic error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 3. QTR sensor data
app.get('/api/robot/qtr-sensors', requireAdmin, async (req, res) => {
  try {
    const snapshot = await db.ref('QTR_Sensors').once('value');
    res.status(200).json({ sensors: snapshot.val() || [0, 0, 0, 0, 0, 0, 0, 0] });
  } catch (err) {
    console.error('qtr error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => console.log(`Gateway running on http://${HOST}:${PORT}`));