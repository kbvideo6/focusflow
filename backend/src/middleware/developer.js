import db from '../config/db.js';
import { verifyToken } from './auth.js';

const getAdminNames = () => {
  return (process.env.ADMIN_USERNAMES || 'nisal,nisal7410,admin')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
};

/**
 * Middleware that validates the caller has developer/admin privileges:
 * - Checks if user has `is_admin = 1`
 * - Or user is ID 1 (first registered user)
 * - Or username matches `ADMIN_USERNAMES` environment variable
 * - Or request header `x-dev-key` matches `process.env.DEV_KEY` (for direct API/curl calls from developer)
 */
export function verifyDeveloper(req, res, next) {
  // Support direct developer key header
  const devKeyHeader = req.headers['x-dev-key'];
  if (devKeyHeader && process.env.DEV_KEY && devKeyHeader === process.env.DEV_KEY) {
    req.isDeveloper = true;
    return next();
  }

  // Otherwise authenticate via session JWT token
  verifyToken(req, res, () => {
    db.get('SELECT id, username, is_admin FROM users WHERE id = ?', [req.userId], (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to verify developer status.' });
      }

      if (!user) {
        return res.status(403).json({ error: 'User not found.' });
      }

      const adminNames = getAdminNames();
      const isAdmin = Boolean(
        user.is_admin === 1 || 
        user.id === 1 || 
        adminNames.includes((user.username || '').toLowerCase())
      );

      if (!isAdmin) {
        return res.status(403).json({ 
          error: 'Access denied. Developer / Administrator permissions required.' 
        });
      }

      req.isDeveloper = true;
      req.adminUser = user;
      next();
    });
  });
}
