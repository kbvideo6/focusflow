import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../config/db.js';
import { JWT_SECRET, verifyToken } from '../middleware/auth.js';
import {
  tryDecryptUsername,
  tryDecryptPasswordHash,
  tryDecryptNumber
} from '../utils/migration.js';
import { encryptUsername } from '../utils/crypto.js';

const router = express.Router();

const getAdminNames = () => {
  return (process.env.ADMIN_USERNAMES || 'nisal,nisal7410,admin')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
};

// Signup endpoint
router.post('/signup', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const cleanUsername = String(username).trim();
  if (cleanUsername.length < 2) {
    return res.status(400).json({ error: 'Username must be at least 2 characters long.' });
  }

  try {
    // Check if user already exists (case-insensitive)
    const existing = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE LOWER(TRIM(username)) = LOWER(?)', [cleanUsername], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existing) {
      return res.status(400).json({ error: 'Username already exists.' });
    }

    // Check user count to grant admin to the first user
    const userCountRow = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    const isFirstUser = !userCountRow || userCountRow.count === 0;
    const adminNames = getAdminNames();
    const isAdmin = (isFirstUser || adminNames.includes(cleanUsername.toLowerCase())) ? 1 : 0;

    // Secure standard bcrypt hash (never fragile AES wrapper)
    const passwordHash = await bcrypt.hash(password, 10);
    
    db.run(
      `INSERT INTO users (username, password_hash, monthly_budget_limit, daily_budget_limit, attendance_target_pct, is_admin) 
       VALUES (?, ?, 30000, 1000, 80, ?)`,
      [cleanUsername, passwordHash, isAdmin],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Username already exists.' });
          }
          return res.status(500).json({ error: err.message });
        }

        const userId = this.lastID;
        const userKey = crypto.createHash('sha256').update(password).digest('hex');
        const token = jwt.sign(
          { id: userId, username: cleanUsername, isAdmin: Boolean(isAdmin), userKey },
          JWT_SECRET,
          { expiresIn: '30d' }
        );

        res.status(201).json({
          message: 'User created successfully.',
          token,
          user: {
            id: userId,
            username: cleanUsername,
            monthly_budget_limit: 30000,
            daily_budget_limit: 1000,
            attendance_target_pct: 80,
            is_admin: Boolean(isAdmin)
          }
        });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const cleanUsername = String(username).trim();
  const legacyEncryptedVariant = encryptUsername(cleanUsername);

  try {
    // 1. Try finding user case-insensitively, or by legacy encrypted variant
    db.get(
      'SELECT * FROM users WHERE LOWER(TRIM(username)) = LOWER(?) OR username = ? OR username = ?',
      [cleanUsername, cleanUsername, legacyEncryptedVariant],
      async (err, user) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        // 2. If not found by direct SQL, scan for any legacy encrypted username
        if (!user) {
          const allUsers = await new Promise((resolve) => {
            db.all('SELECT * FROM users', [], (err, rows) => resolve(rows || []));
          });

          user = allUsers.find(u => {
            const dec = tryDecryptUsername(u.username);
            return dec && dec.toLowerCase() === cleanUsername.toLowerCase();
          });
        }

        if (!user) {
          return res.status(400).json({ error: 'Invalid username or password.' });
        }

        // 3. Resolve password hash (pure bcrypt or legacy encrypted)
        let storedHash = user.password_hash;
        if (storedHash && storedHash.includes(':')) {
          storedHash = tryDecryptPasswordHash(storedHash);
        }

        const validPassword = await bcrypt.compare(password, storedHash);
        if (!validPassword) {
          return res.status(400).json({ error: 'Invalid username or password.' });
        }

        // 4. Resolve limits
        const monthlyLimit = tryDecryptNumber(user.monthly_budget_limit, 30000);
        const dailyLimit = tryDecryptNumber(user.daily_budget_limit, 1000);
        const attendanceTarget = tryDecryptNumber(user.attendance_target_pct, 80);

        // 5. Resolve Admin Status
        const adminNames = getAdminNames();
        const isAdmin = Boolean(
          user.is_admin === 1 || 
          user.id === 1 || 
          adminNames.includes(cleanUsername.toLowerCase())
        );

        // 6. Transparently upgrade/migrate row if it was stored with legacy encrypted format
        const needsRowUpgrade = 
          user.username !== cleanUsername || 
          user.password_hash !== storedHash ||
          user.monthly_budget_limit !== monthlyLimit ||
          user.is_admin !== (isAdmin ? 1 : 0);

        if (needsRowUpgrade) {
          db.run(
            `UPDATE users 
             SET username = ?, password_hash = ?, monthly_budget_limit = ?, daily_budget_limit = ?, attendance_target_pct = ?, is_admin = ? 
             WHERE id = ?`,
            [cleanUsername, storedHash, monthlyLimit, dailyLimit, attendanceTarget, isAdmin ? 1 : 0, user.id],
            (updateErr) => {
              if (updateErr) console.error('Auto-upgrade user error:', updateErr);
            }
          );
        }

        // 7. Issue session token (30 days validity for smooth UX)
        const userKey = crypto.createHash('sha256').update(password).digest('hex');
        const token = jwt.sign(
          { id: user.id, username: cleanUsername, isAdmin, userKey },
          JWT_SECRET,
          { expiresIn: '30d' }
        );

        res.json({
          message: 'Login successful.',
          token,
          user: {
            id: user.id,
            username: cleanUsername,
            monthly_budget_limit: monthlyLimit,
            daily_budget_limit: dailyLimit,
            attendance_target_pct: attendanceTarget,
            is_admin: isAdmin
          }
        });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get profile
router.get('/me', verifyToken, (req, res) => {
  db.get(
    'SELECT id, username, monthly_budget_limit, daily_budget_limit, attendance_target_pct, is_admin FROM users WHERE id = ?',
    [req.userId],
    (err, user) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const plainUsername = tryDecryptUsername(user.username);
      const monthlyLimit = tryDecryptNumber(user.monthly_budget_limit, 30000);
      const dailyLimit = tryDecryptNumber(user.daily_budget_limit, 1000);
      const attendanceTarget = tryDecryptNumber(user.attendance_target_pct, 80);

      const adminNames = getAdminNames();
      const isAdmin = Boolean(
        user.is_admin === 1 || 
        user.id === 1 || 
        adminNames.includes((plainUsername || '').toLowerCase())
      );

      res.json({
        id: user.id,
        username: plainUsername,
        monthly_budget_limit: monthlyLimit,
        daily_budget_limit: dailyLimit,
        attendance_target_pct: attendanceTarget,
        is_admin: isAdmin
      });
    }
  );
});

// Update settings
router.put('/settings', verifyToken, (req, res) => {
  const { monthly_budget_limit, daily_budget_limit, attendance_target_pct } = req.body;

  const monthly = Number(monthly_budget_limit) || 30000;
  const daily = Number(daily_budget_limit) || 1000;
  const attendance = Number(attendance_target_pct) || 80;

  db.run(
    `UPDATE users 
     SET monthly_budget_limit = ?, daily_budget_limit = ?, attendance_target_pct = ? 
     WHERE id = ?`,
    [monthly, daily, attendance, req.userId],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({
        message: 'Settings updated successfully.',
        settings: {
          monthly_budget_limit: monthly,
          daily_budget_limit: daily,
          attendance_target_pct: attendance
        }
      });
    }
  );
});

export default router;
