/**
 * FocusFlow – Web Push Notification Routes
 * =========================================
 * Endpoints:
 *   GET  /api/notifications/vapid-public-key   → returns the VAPID public key for SW subscribe
 *   POST /api/notifications/subscribe           → store a push subscription for this user
 *   DELETE /api/notifications/unsubscribe       → remove push subscription
 *   POST /api/notifications/send-daily          → (admin) manually trigger daily summary push
 *   POST /api/notifications/test                → send test push to self
 *
 * Schema added to DB:  push_subscriptions
 */

import express from 'express';
import webpush from 'web-push';
import db from '../config/db.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Configure VAPID
const vapidPublicKey  = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject    = process.env.VAPID_SUBJECT || 'mailto:focusflow@localhost';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
} else {
  console.warn('[push] VAPID keys not set – push notifications will be disabled.');
}

// ── DB helpers ────────────────────────────────────────────────
const runQ = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    })
  );

const allQ = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    })
  );

// Ensure push_subscriptions table exists (idempotent)
async function ensureTable() {
  await runQ(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      endpoint    TEXT    NOT NULL UNIQUE,
      p256dh      TEXT    NOT NULL,
      auth        TEXT    NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}
ensureTable().catch(console.error);

// ── Helper: send push to one subscription ──────────────────────
async function sendPushToSubscription(sub, payload) {
  const pushSub = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dh, auth: sub.auth }
  };
  try {
    await webpush.sendNotification(pushSub, JSON.stringify(payload));
    return true;
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription expired → clean up
      await runQ('DELETE FROM push_subscriptions WHERE endpoint = ?', [sub.endpoint]).catch(() => {});
    }
    return false;
  }
}

// ── Helper: send push to all subscriptions for a user ─────────
async function pushToUser(userId, payload) {
  const subs = await allQ('SELECT * FROM push_subscriptions WHERE user_id = ?', [userId]);
  await Promise.allSettled(subs.map((s) => sendPushToSubscription(s, payload)));
}

// ── Routes ─────────────────────────────────────────────────────

/**
 * GET /vapid-public-key
 * Returns the VAPID public key so the frontend can subscribe
 */
router.get('/vapid-public-key', (_req, res) => {
  if (!vapidPublicKey) {
    return res.status(503).json({ error: 'Push notifications not configured on server.' });
  }
  res.json({ publicKey: vapidPublicKey });
});

/**
 * POST /subscribe
 * Body: { endpoint, keys: { p256dh, auth } }
 * Stores/updates the push subscription for the authenticated user
 */
router.post('/subscribe', verifyToken, async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription object.' });
  }

  try {
    // Upsert: if endpoint already exists for this user, update; otherwise insert
    await runQ(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth`,
      [req.userId, endpoint, keys.p256dh, keys.auth]
    );

    // Send a silent welcome push to confirm subscription works
    await sendPushToSubscription(
      { endpoint, p256dh: keys.p256dh, auth: keys.auth },
      {
        title: '🎯 FocusFlow Notifications Active',
        body: "You'll receive smart daily reminders - we promise not to spam.",
        url: '/',
        tag: 'ff-welcome',
        icon: '/screen.png'
      }
    );

    res.json({ success: true, message: 'Subscribed to push notifications.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /unsubscribe
 * Body: { endpoint }
 */
router.delete('/unsubscribe', verifyToken, async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint required.' });
  }
  try {
    await runQ(
      'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
      [req.userId, endpoint]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /test
 * Sends a test push notification to the current user's subscriptions
 */
router.post('/test', verifyToken, async (req, res) => {
  try {
    await pushToUser(req.userId, {
      title: '✅ FocusFlow Test Notification',
      body: 'Push notifications are working correctly!',
      url: '/',
      tag: 'ff-test',
      icon: '/screen.png'
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /send-daily
 * Called by a cron job or admin to send the day's summary to all users
 * Requires the internal x-cron-key header (security)
 */
router.post('/send-daily', async (req, res) => {
  const cronKey = req.headers['x-cron-key'];
  const expectedKey = process.env.CRON_SECRET || 'focusflow-cron-secret';

  if (cronKey !== expectedKey) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  try {
    const users = await allQ('SELECT DISTINCT user_id FROM push_subscriptions');
    const results = [];

    for (const { user_id } of users) {
      await pushToUser(user_id, {
        title: '📊 FocusFlow Daily Summary',
        body: 'Your daily recap is ready. Check your attendance, finances, and health stats.',
        url: '/',
        tag: 'ff-daily',
        icon: '/screen.png'
      });
      results.push(user_id);
    }

    res.json({ success: true, notifiedUsers: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export the pushToUser helper so other routes can trigger pushes
export { pushToUser };
export default router;
