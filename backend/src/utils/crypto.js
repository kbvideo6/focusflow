import 'dotenv/config';
import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const JWT_SECRET = process.env.JWT_SECRET || 'lifetracker-super-secret-key-123';

// Deriving a 32-byte global encryption key from the JWT secret
const GLOBAL_KEY = crypto.createHash('sha256').update(JWT_SECRET).digest();
const ZERO_IV = Buffer.alloc(16, 0); // Static IV for deterministic username lookup

/**
 * Encrypt a username deterministically using the global key.
 */
export function encryptUsername(username) {
  if (!username) return username;
  try {
    const cipher = crypto.createCipheriv(ALGORITHM, GLOBAL_KEY, ZERO_IV);
    let encrypted = cipher.update(String(username), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  } catch (err) {
    console.error('Error encrypting username:', err);
    return username;
  }
}

/**
 * Decrypt a username using the global key. Falls back to raw value if it isn't hex/encrypted.
 */
export function decryptUsername(ciphertext) {
  if (!ciphertext) return ciphertext;
  try {
    // Only attempt to decrypt if it looks like a valid hex string of expected length
    if (!/^[0-9a-fA-F]+$/.test(ciphertext)) {
      return ciphertext;
    }
    const decipher = crypto.createDecipheriv(ALGORITHM, GLOBAL_KEY, ZERO_IV);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return ciphertext; // Fallback for backward compatibility with plain text usernames
  }
}

/**
 * Encrypt a string (like a password hash) using the global key with a random IV.
 */
export function encryptWithGlobalKey(text) {
  if (!text) return text;
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, GLOBAL_KEY, iv);
    let encrypted = cipher.update(String(text), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (err) {
    console.error('Error encrypting with global key:', err);
    return text;
  }
}

/**
 * Decrypt a string using the global key. Falls back to raw value if invalid.
 */
export function decryptWithGlobalKey(ciphertext) {
  if (!ciphertext || typeof ciphertext !== 'string' || !ciphertext.includes(':')) {
    return ciphertext;
  }
  try {
    const [ivHex, encText] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, GLOBAL_KEY, iv);
    let decrypted = decipher.update(encText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return ciphertext;
  }
}

/**
 * Encrypt any user-specific data value using the user's secret key.
 */
export function encrypt(val, userKeyHex) {
  if (val === null || val === undefined || !userKeyHex) {
    return val;
  }
  try {
    const key = Buffer.from(userKeyHex, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let plainText = String(val);
    if (typeof val === 'object') {
      plainText = JSON.stringify(val);
    }
    
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (err) {
    console.error('Encryption error:', err);
    return val;
  }
}

/**
 * Decrypt user-specific data. Falls back to the raw value if not formatted/encrypted.
 */
export function decrypt(ciphertext, userKeyHex, type = 'string') {
  if (ciphertext === null || ciphertext === undefined || !userKeyHex) {
    return ciphertext;
  }
  
  const strVal = String(ciphertext);
  if (!strVal.includes(':')) {
    // If not in standard iv:ciphertext format, return raw for backward compatibility
    return castValue(ciphertext, type);
  }
  
  try {
    const key = Buffer.from(userKeyHex, 'hex');
    const [ivHex, encText] = strVal.split(':');
    if (ivHex.length !== 32) {
      return castValue(ciphertext, type);
    }
    
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return castValue(decrypted, type);
  } catch (err) {
    // Fallback to raw value on error
    return castValue(ciphertext, type);
  }
}

function castValue(value, type) {
  if (value === null || value === undefined) return value;
  
  if (type === 'number') {
    const num = Number(value);
    return isNaN(num) ? value : num;
  }
  if (type === 'json') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  }
  if (type === 'boolean') {
    if (value === 'true' || value === 1 || value === '1') return true;
    if (value === 'false' || value === 0 || value === '0') return false;
    return value;
  }
  return value;
}
