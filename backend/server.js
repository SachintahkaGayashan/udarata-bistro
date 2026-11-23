require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase, ServerValue } = require('firebase-admin/database');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount),
  databaseURL: 'https://test-5b6ed-default-rtdb.firebaseio.com',
});
const db = getDatabase();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1kb' }));

// CORS: allow-list එකේ origins පමණයි
const origins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: origins,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Key'],
}));

// Rate limit: විනාඩියකට requests 60
app.use(rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false }));

// Admin token verify middleware
async function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const decoded = await getAuth().verifyIdToken(token, true); // true = revoked tokens ප්‍රතික්ෂේප කරයි
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
      timestamp: ServerValue.TIMESTAMP,
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
      updatedAt: ServerValue.TIMESTAMP,
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

// ---- 4. Container unlock (called by the ESP32-CAM after it scans a QR code) ----
const DEVICE_KEY = process.env.ROBOT_DEVICE_KEY || '';
const UNLOCK_VALID_MS = 6 * 60 * 60 * 1000;          // a QR code works for 6 hours
const CODE_RE = /^SB1\.([A-Za-z0-9_-]{10,40})\.([a-f0-9]{32})$/;

const sha256Hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
const safeEqual = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

// stricter limit than the global one: 10 tries a minute
const unlockLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

function requireDevice(req, res, next) {
  if (DEVICE_KEY.length < 24) {
    console.error('ROBOT_DEVICE_KEY is missing or too short (min 24 chars) in .env');
    return res.status(503).json({ error: 'Not configured' });
  }
  const key = req.headers['x-device-key'] || '';
  if (!safeEqual(key, DEVICE_KEY)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.post('/api/robot/unlock', unlockLimiter, requireDevice, async (req, res) => {
  const code = String((req.body || {}).code || '').trim();
  const m = CODE_RE.exec(code);
  if (!m) return res.status(400).json({ error: 'Invalid code' });
  const [, orderId, token] = m;

  try {
    const lockRef = db.ref(`orderLocks/${orderId}`);
    const orderSnap = await db.ref(`orders/${orderId}`).once('value');
    const order = orderSnap.val();
    if (!order) return res.status(403).json({ error: 'Invalid code' });

    const status = String(order.status || '').toUpperCase();
    if (status.includes('CANCEL') || status.includes('SERVED') || status.includes('COMPLETED')) {
      return res.status(403).json({ error: 'Order already finished' });
    }

    const wantHash = sha256Hex(token);
    const now = Date.now();
    let reason = null;
    // transaction = the "used" flag is set atomically, so a code can never open the box twice.
    // NOTE: Firebase may first call this function with null (before it has the real data),
    // so null must NOT abort; returning it unchanged makes Firebase retry with the real value.
    const result = await lockRef.transaction((lock) => {
      reason = null;
      if (lock === null) return lock;
      if (lock.usedAt) { reason = 'Code already used'; return; }          // abort
      if (!safeEqual(lock.qrHash, wantHash)) { reason = 'Invalid code'; return; }
      if (now - Number(lock.timestamp || 0) > UNLOCK_VALID_MS) { reason = 'Code expired'; return; }
      return { ...lock, usedAt: now };
    });

    const saved = result.snapshot.val();
    if (!result.committed || !saved || saved.usedAt !== now) {
      console.warn(`[${new Date().toISOString()}] unlock REJECTED order ${orderId}: ${reason || 'Invalid code'}`);
      return res.status(403).json({ error: reason || 'Invalid code' });
    }

    // the NodeMCU watches robot/unlockSeq and opens the lock when it changes
    await db.ref('robot').update({
      unlockSeq: ServerValue.increment(1),
      unlockOrder: orderId,
      unlockAt: ServerValue.TIMESTAMP,
    });
    console.log(`[${new Date().toISOString()}] unlock OK order ${orderId} (${order.tableName})`);
    res.status(200).json({ status: 'Unlocked', table: order.tableName });
  } catch (err) {
    console.error('unlock error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 5000;
// Default: only this PC. To let the ESP32-CAM reach it over Wi-Fi, set HOST=0.0.0.0 in backend/.env
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => console.log(`Gateway running on http://${HOST}:${PORT}`));