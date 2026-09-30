import crypto from 'crypto';
import db from '../config/db.js';

const CANDIDATE_SECRETS = [
  process.env.JWT_SECRET,
  'lifetracker-super-secret-key-123',
  'replace-this-secret-before-production',
  'replace-with-a-long-random-secret'
].filter(Boolean);

const ALGORITHM = 'aes-256-cbc';
const ZERO_IV = Buffer.alloc(16, 0);

/**
 * Attempts to decrypt an encrypted username using candidate encryption keys.
 * Returns decrypted plaintext string if successful, otherwise the input.
 */
export function tryDecryptUsername(encUsername) {
  if (!encUsername || typeof encUsername !== 'string') return encUsername;
  
  // Encrypted usernames are typically 32, 64, or hex characters
  if (!/^[0-9a-fA-F]{32,128}$/.test(encUsername)) {
    return encUsername;
  }

  for (const secret of CANDIDATE_SECRETS) {
    try {
      const key = crypto.createHash('sha256').update(secret).digest();
      const decipher = crypto.createDecipheriv(ALGORITHM, key, ZERO_IV);
      let decrypted = decipher.update(encUsername, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      // Check if decrypted string looks like a valid username
      if (decrypted && /^[\w\-@. ]{2,50}$/.test(decrypted)) {
        return decrypted.trim();
      }
    } catch {
      // Try next secret
    }
  }

  return encUsername;
}

/**
 * Attempts to decrypt an iv:ciphertext password hash back to a bcrypt hash ($2a$...).
 */
export function tryDecryptPasswordHash(encHash) {
  if (!encHash || typeof encHash !== 'string' || !encHash.includes(':')) {
    return encHash;
  }

  const [ivHex, cipherHex] = encHash.split(':');
  if (!ivHex || ivHex.length !== 32 || !cipherHex) {
    return encHash;
  }

  const iv = Buffer.from(ivHex, 'hex');

  for (const secret of CANDIDATE_SECRETS) {
    try {
      const key = crypto.createHash('sha256').update(secret).digest();
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      if (decrypted && decrypted.startsWith('$2')) {
        return decrypted;
      }
    } catch {
      // Try next secret
    }
  }

  return encHash;
}

/**
 * Attempts to decrypt an encrypted budget limit or target number.
 */
export function tryDecryptNumber(val, defaultVal = 0) {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === 'number') return val;
  
  const str = String(val).trim();
  const num = Number(str);
  if (!isNaN(num)) return num;

  if (!str.includes(':')) return defaultVal;

  const [ivHex, cipherHex] = str.split(':');
  if (!ivHex || ivHex.length !== 32) return defaultVal;
  const iv = Buffer.from(ivHex, 'hex');

  for (const secret of CANDIDATE_SECRETS) {
    try {
      const key = crypto.createHash('sha256').update(secret).digest();
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      const parsed = Number(decrypted);
      if (!isNaN(parsed)) return parsed;
    } catch {
      // Try next
    }
  }

  return defaultVal;
}

/**
 * Runs automatic migration on database boot:
 * 1. Ensures `is_admin` column exists in `users`.
 * 2. Decrypts any encrypted usernames into human-readable plaintext.
 * 3. Decrypts any encrypted password hashes into pure bcrypt hashes.
 * 4. Decrypts any budget limits into clear numbers.
 * 5. Assigns admin status to user ID 1 or names in ADMIN_USERNAMES.
 */
export async function runAuthMigration() {
  // 1. Ensure `is_admin` column exists
  try {
    await db.runAsync('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
    console.log('[Migration] Added `is_admin` column to users table.');
  } catch {
    // Column already exists
  }

  const adminNames = (process.env.ADMIN_USERNAMES || 'nisal,nisal7410,admin')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  // 2. Fetch all users
  const users = await db.allAsync('SELECT * FROM users');
  if (!users || users.length === 0) return;

  for (const user of users) {
    let plainUsername = tryDecryptUsername(user.username);
    plainUsername = (plainUsername || '').trim();

    let plainPasswordHash = tryDecryptPasswordHash(user.password_hash);
    let monthlyLimit = tryDecryptNumber(user.monthly_budget_limit, 30000);
    let dailyLimit = tryDecryptNumber(user.daily_budget_limit, 1000);
    let attendanceTarget = tryDecryptNumber(user.attendance_target_pct, 80);

    const shouldBeAdmin = user.id === 1 || adminNames.includes(plainUsername.toLowerCase()) ? 1 : (user.is_admin || 0);

    const needsUpdate = 
      plainUsername !== user.username ||
      plainPasswordHash !== user.password_hash ||
      monthlyLimit !== user.monthly_budget_limit ||
      dailyLimit !== user.daily_budget_limit ||
      attendanceTarget !== user.attendance_target_pct ||
      shouldBeAdmin !== user.is_admin;

    if (needsUpdate) {
      await db.runAsync(
        `UPDATE users 
         SET username = ?, 
             password_hash = ?, 
             monthly_budget_limit = ?, 
             daily_budget_limit = ?, 
             attendance_target_pct = ?, 
             is_admin = ? 
         WHERE id = ?`,
        [plainUsername, plainPasswordHash, monthlyLimit, dailyLimit, attendanceTarget, shouldBeAdmin, user.id]
      );
      console.log(`[Migration] Migrated User #${user.id} -> username: "${plainUsername}", admin: ${shouldBeAdmin}`);
    }
  }

  console.log('[Migration] User database migration completed successfully.');
}
