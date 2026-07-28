import crypto from 'crypto';

const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET;

// Ensure server refuses to run without secure encryption keys
if (process.env.NODE_ENV === 'production' || ENCRYPTION_SECRET) {
  if (!ENCRYPTION_SECRET) {
    console.error('[SipWise] FATAL: ENCRYPTION_SECRET environment variable is not set. Refusing to start.');
    process.exit(1);
  }
  if (ENCRYPTION_SECRET.length < 32) {
    console.error('[SipWise] FATAL: ENCRYPTION_SECRET must be at least 32 characters. Refusing to start.');
    process.exit(1);
  }
}

// Fallback secret for local development/CI environments only
const activeSecret = ENCRYPTION_SECRET || 'dev_secret_sipwise_encryption_key_must_be_long';

function getUserKey(userId: string): Buffer {
  return crypto.createHmac('sha256', activeSecret).update(userId).digest();
}

interface EncryptedPayload {
  iv: string;
  tag: string;
  encryptedData: string;
}

export function encryptData(data: unknown, userId: string): EncryptedPayload | null {
  if (data === null || data === undefined) return null;
  
  const key = getUserKey(userId);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  const text = JSON.stringify(data);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag().toString('hex');
  
  return {
    iv: iv.toString('hex'),
    tag: tag,
    encryptedData: encrypted
  };
}

export function decryptData(payload: unknown, userId: string): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  
  const p = payload as Record<string, unknown>;
  if (typeof p.iv !== 'string' || typeof p.tag !== 'string' || typeof p.encryptedData !== 'string') {
    // Return payload directly for backwards compatibility with plaintext columns
    return payload;
  }
  
  try {
    const key = getUserKey(userId);
    const iv = Buffer.from(p.iv, 'hex');
    const tag = Buffer.from(p.tag, 'hex');
    const encryptedText = Buffer.from(p.encryptedData, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return JSON.parse(decrypted.toString('utf8'));
  } catch (err) {
    console.error('[SipWise] Decryption failed, returning null context:', err);
    return null;
  }
}
