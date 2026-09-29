import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../config/db.js';
import { JWT_SECRET, verifyToken } from '../middleware/auth.js';
import {
  encryptUsername,
  decryptUsername,
  encryptWithGlobalKey,
  decryptWithGlobalKey,
  encrypt,
  decrypt
} from '../utils/crypto.js';

const router = express.Router();

// Signup endpoint
router.post('/signup', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    // Encrypt password hash using the global key
    const encPasswordHash = encryptWithGlobalKey(passwordHash);
    // Encrypt username deterministically using the global key
    const encUsername = encryptUsername(username);
    
    db.run(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [encUsername, encPasswordHash],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Username already exists.' });
          }
          return res.status(500).json({ error: err.message });
        }

        const userId = this.lastID;
        // Derive userKey from raw password
        const userKey = crypto.createHash('sha256').update(password).digest('hex');
        const token = jwt.sign({ id: userId, userKey }, JWT_SECRET, { expiresIn: '24h' });

        res.status(201).json({
          message: 'User created successfully.',
          token,
          user: {
            id: userId,
            username, // return plain text to UI
            monthly_budget_limit: 30000,
            daily_budget_limit: 1000,
            attendance_target_pct: 80
          }
        });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login endpoint
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const encUsername = encryptUsername(username);

  // We check for both the encrypted username AND plain username (for backward compatibility / migration)
  db.get('SELECT * FROM users WHERE username = ? OR username = ?', [encUsername, username], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password.' });
    }

    // Decrypt password hash if it is encrypted, otherwise use raw password_hash
    let storedHash = user.password_hash;
    if (storedHash.includes(':')) {
      storedHash = decryptWithGlobalKey(storedHash);
    }

    const validPassword = await bcrypt.compare(password, storedHash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid username or password.' });
    }

    // Migration logic: if username in database is still plaintext, update it and the password hash to be encrypted
    if (user.username === username) {
      const encPasswordHash = encryptWithGlobalKey(user.password_hash);
      db.run(
        'UPDATE users SET username = ?, password_hash = ? WHERE id = ?',
        [encUsername, encPasswordHash, user.id],
        (updateErr) => {
          if (updateErr) {
            console.error('Failed to migrate user to encrypted credentials:', updateErr);
          } else {
            console.log(`Migrated user ${username} to encrypted credentials.`);
          }
        }
      );
    }

    // Derive userKey from raw password
    const userKey = crypto.createHash('sha256').update(password).digest('hex');
    const token = jwt.sign({ id: user.id, userKey }, JWT_SECRET, { expiresIn: '24h' });

    // Decrypt user settings limits if they are encrypted
    const monthlyLimit = decrypt(user.monthly_budget_limit, userKey, 'number');
    const dailyLimit = decrypt(user.daily_budget_limit, userKey, 'number');
    const attendanceTarget = decrypt(user.attendance_target_pct, userKey, 'number');

    res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        username,
        monthly_budget_limit: monthlyLimit,
        daily_budget_limit: dailyLimit,
        attendance_target_pct: attendanceTarget
      }
    });
  });
});

// Get profile
router.get('/me', verifyToken, (req, res) => {
  db.get(
    'SELECT id, username, monthly_budget_limit, daily_budget_limit, attendance_target_pct FROM users WHERE id = ?',
    [req.userId],
    (err, user) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }
      
      const decryptedUser = {
        id: user.id,
        username: decryptUsername(user.username),
        monthly_budget_limit: decrypt(user.monthly_budget_limit, req.userKey, 'number'),
        daily_budget_limit: decrypt(user.daily_budget_limit, req.userKey, 'number'),
        attendance_target_pct: decrypt(user.attendance_target_pct, req.userKey, 'number'),
      };
      
      res.json(decryptedUser);
    }
  );
});

// Update settings
router.put('/settings', verifyToken, (req, res) => {
  const { monthly_budget_limit, daily_budget_limit, attendance_target_pct } = req.body;

  const encMonthlyLimit = encrypt(monthly_budget_limit, req.userKey);
  const encDailyLimit = encrypt(daily_budget_limit, req.userKey);
  const encAttendanceTarget = encrypt(attendance_target_pct, req.userKey);

  db.run(
    `UPDATE users 
     SET monthly_budget_limit = ?, daily_budget_limit = ?, attendance_target_pct = ? 
     WHERE id = ?`,
    [encMonthlyLimit, encDailyLimit, encAttendanceTarget, req.userId],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({
        message: 'Settings updated successfully.',
        settings: { monthly_budget_limit, daily_budget_limit, attendance_target_pct }
      });
    }
  );
});

export default router;
