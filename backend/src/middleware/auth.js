import jwt from 'jsonwebtoken';
import db from '../config/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'lifetracker-super-secret-key-123';

export function verifyToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(403).json({ error: 'No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Unauthorized token' });
    }
    req.userId = decoded.id;
    req.userKey = decoded.userKey;
    req.isAdmin = Boolean(decoded.isAdmin);
    next();
  });
}

export function requireAdmin(req, res, next) {
  if (req.isAdmin) {
    return next();
  }

  // Fallback: check database directly in case token was issued without isAdmin or user was promoted
  const adminNames = (process.env.ADMIN_USERNAMES || 'nisal,nisal7410,admin')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  db.get('SELECT id, username, is_admin FROM users WHERE id = ?', [req.userId], (err, user) => {
    if (!err && user) {
      if (user.is_admin === 1 || user.id === 1 || adminNames.includes((user.username || '').toLowerCase())) {
        req.isAdmin = true;
        return next();
      }
    }
    return res.status(403).json({ error: 'Access denied: Administrator privileges required.' });
  });
}

export { JWT_SECRET };

