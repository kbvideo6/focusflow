import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import db, { initDatabase } from './config/db.js';
import { runSeed } from './config/seed.js';
import authRoutes from './routes/auth.js';
import trackerRoutes from './routes/tracker.js';
import developerRoutes from './routes/developer.js';
import notificationRoutes from './routes/notifications.js';

const app = express();
const PORT = process.env.PORT || 5000;

// ── Security Headers (Helmet) ────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // CSP managed by the frontend build tool
    crossOriginEmbedderPolicy: false
  })
);

// ── CORS ──────────────────────────────────────────────────────
const envOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:5000',
  'http://localhost:4173',
  'http://localhost:8080',
  'http://147.93.112.99:8080',
  'http://147.93.112.99:5000'
];

const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman, same-origin)
      if (!origin) return callback(null, true);
      
      // Explicit allowed origins or wildcard
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow common VPS IP and localhost hostnames automatically
      try {
        const url = new URL(origin);
        if (
          url.hostname === 'localhost' ||
          url.hostname === '127.0.0.1' ||
          url.hostname === '147.93.112.99' ||
          url.hostname.startsWith('192.168.') ||
          url.hostname.startsWith('10.')
        ) {
          return callback(null, true);
        }
      } catch (_) {}

      // Reject politely without throwing a 500 error
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-dev-key', 'x-cron-key'],
    credentials: true
  })
);

// ── Rate Limiting ─────────────────────────────────────────────
// Auth endpoints: strict (prevent brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again in 15 minutes.' }
});

// General API limiter (generous for normal use)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down a bit.' }
});

app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// ── Body Parser ───────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/tracker', trackerRoutes);
app.use('/api/developer', developerRoutes);
app.use('/api/notifications', notificationRoutes);

// ── Health Check ──────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// ── 404 Handler ───────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// ── Global Error Handler ──────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[server error]', err.message);
  if (err.message.startsWith('CORS:')) {
    return res.status(403).json({ error: err.message });
  }
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Startup ───────────────────────────────────────────────────
async function ensureInitialData() {
  try {
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM timetable', (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    if (!row || row.count === 0) {
      console.log('No timetable data found. Running database seeder...');
      await runSeed();
      console.log('Database seeded successfully.');
      return;
    }

    console.log('Database already has timetable data. Skipping seeder.');
  } catch (err) {
    console.error('Failed to initialize default data:', err);
    throw err;
  }
}

async function startServer() {
  try {
    await initDatabase();
    await ensureInitialData();

    app.listen(PORT, () => {
      console.log(`✅ FocusFlow backend running on port ${PORT}`);
      console.log(`🔒 CORS allowed origins: ${allowedOrigins.join(', ')}`);
    });
  } catch (err) {
    console.error('Failed to initialize and start server:', err);
    process.exit(1);
  }
}

startServer();
