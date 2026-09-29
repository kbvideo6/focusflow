import jwt from 'jsonwebtoken';

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
    next();
  });
}

export { JWT_SECRET };
