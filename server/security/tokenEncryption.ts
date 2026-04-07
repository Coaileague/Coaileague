import crypto from 'crypto';
import { createLogger } from '../lib/logger';
const log = createLogger('tokenEncryption');


/**
 * OAuth Token Encryption Module
 * 
 * Provides AES-256-GCM encryption for OAuth access/refresh tokens stored in database.
 * Uses a single master key from environment variable (not per-entity keys like conversations).
 * 
 * CRITICAL: Set ENCRYPTION_KEY environment variable to a 32-byte hex string.
 * Generate with: `openssl rand -hex 32` or `node -e "log.info(crypto.randomBytes(32).toString('hex'))"`
 * 
 * Security Model:
 * - Master key in environment (future: AWS KMS/Cloud HSM)
 * - AES-256-GCM for authenticated encryption
 * - Random IV per encryption operation
 * - Format: iv:authTag:ciphertext (all base64)
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits (recommended for GCM)
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

// Cached master key
let cachedMasterKey: Buffer | null = null;

/**
 * Load and validate master encryption key from environment
 * 
 * @returns Buffer | null - Returns null in development if key not set (graceful degradation)
 * @throws Error if key missing in production or invalid length
 */
function getMasterKey(): Buffer | null {
  // Return cached key if available
  if (cachedMasterKey !== null) {
    return cachedMasterKey;
  }

  const keyHex = process.env.ENCRYPTION_KEY;

  // Fail-fast in production if key not set
  if (!keyHex) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'ENCRYPTION_KEY environment variable is required in production. ' +
        'Generate with: openssl rand -hex 32'
      );
    } else {
      log.warn(
        '⚠️  ENCRYPTION_KEY not set - OAuth tokens will be stored in PLAINTEXT! ' +
        'Set ENCRYPTION_KEY in .env for security.'
      );
      // Return null in development to allow graceful degradation
      cachedMasterKey = null;
      return null;
    }
  }

  // Validate key length (should be 32 bytes = 64 hex chars)
  if (keyHex.length !== 64) {
    throw new Error(
      `ENCRYPTION_KEY must be 64 hex characters (32 bytes), got ${keyHex.length}. ` +
      'Generate with: openssl rand -hex 32'
    );
  }

  // Convert hex to buffer and cache
  cachedMasterKey = Buffer.from(keyHex, 'hex');

  if (cachedMasterKey.length !== KEY_LENGTH) {
    throw new Error(`ENCRYPTION_KEY decoded to ${cachedMasterKey.length} bytes, expected ${KEY_LENGTH}`);
  }

  return cachedMasterKey;
}

/**
 * Encrypt OAuth token using master key
 * 
 * @param token - Plaintext OAuth token
 * @returns Encrypted token in format: iv:authTag:ciphertext (base64), or plaintext if encryption unavailable in dev
 * @throws Error if token is null/undefined or encryption key invalid
 */
export function encryptToken(token: string | null | undefined): string {
  if (!token) {
    throw new Error('Cannot encrypt null or undefined token');
  }

  // Check if already encrypted (prevents double-encryption)
  if (isEncrypted(token)) {
    log.warn('⚠️  Token appears to be already encrypted - skipping encryption');
    return token;
  }

  try {
    const key = getMasterKey();
    
    // Graceful degradation in development - store plaintext if no encryption key
    if (!key) {
      log.warn('⚠️  Storing token in PLAINTEXT - ENCRYPTION_KEY not configured');
      return token; // Return plaintext in development
    }
    
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let ciphertext = cipher.update(token, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:ciphertext (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext}`;
  } catch (error: any) {
    // Re-throw with context
    throw new Error(`Token encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt OAuth token using master key
 * 
 * @param encryptedToken - Encrypted token in format: iv:authTag:ciphertext (base64)
 * @returns Decrypted plaintext token
 * @throws Error if token is null/undefined, invalid format, or decryption fails (except in dev without key)
 */
export function decryptToken(encryptedToken: string | null | undefined): string {
  if (!encryptedToken) {
    throw new Error('Cannot decrypt null or undefined token');
  }

  // Handle legacy plaintext tokens (backward compatibility)
  if (!isEncrypted(encryptedToken)) {
    // In development without encryption key, this is expected
    return encryptedToken;
  }

  // Parse encrypted format: iv:authTag:ciphertext
  const parts = encryptedToken.split(':');
  if (parts.length !== 3) {
    throw new Error(
      `Invalid encrypted token format - expected 3 parts (iv:authTag:ciphertext), got ${parts.length}`
    );
  }

  const [ivBase64, authTagBase64, ciphertext] = parts;

  try {
    const key = getMasterKey();
    
    // If no key in development, cannot decrypt encrypted tokens
    if (!key) {
      throw new Error('Cannot decrypt encrypted token - ENCRYPTION_KEY not configured');
    }
    
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  } catch (error: any) {
    // Check for authentication failures (tampered data)
    if (error.message.includes('Unsupported state or unable to authenticate data')) {
      throw new Error('Token decryption failed - data may be corrupted or tampered with');
    }

    // Re-throw with context
    throw new Error(`Token decryption failed: ${error.message}`);
  }
}

/**
 * Check if a token appears to be encrypted
 * 
 * @param token - Token to check
 * @returns true if token appears to be in encrypted format
 */
export function isEncrypted(token: string): boolean {
  // Encrypted format has exactly 2 colons (iv:authTag:ciphertext)
  return token.split(':').length === 3;
}

/**
 * Safely encrypt token (returns null if input is null)
 * 
 * @param token - OAuth token or null
 * @returns Encrypted token or null
 */
export function safeEncryptToken(token: string | null | undefined): string | null {
  if (!token) return null;

  try {
    return encryptToken(token);
  } catch (error) {
    log.error('Token encryption failed:', error);
    throw error; // Don't silently fail - encryption failure is critical
  }
}

/**
 * Safely decrypt token (returns null if input is null)
 * 
 * @param encryptedToken - Encrypted OAuth token or null
 * @returns Decrypted token or null
 */
export function safeDecryptToken(encryptedToken: string | null | undefined): string | null {
  if (!encryptedToken) return null;

  try {
    return decryptToken(encryptedToken);
  } catch (error) {
    log.error('Token decryption failed:', error);
    throw error; // Don't silently fail - decryption failure means token is unusable
  }
}

/**
 * Generate a new encryption key (for setup/rotation)
 * 
 * Usage: node -e "log.info(require('./server/security/tokenEncryption').generateEncryptionKey())"
 * 
 * @returns 32-byte hex string suitable for ENCRYPTION_KEY
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Validate that encryption is properly configured
 * 
 * @returns true if encryption is configured, false otherwise
 */
export function isEncryptionConfigured(): boolean {
  try {
    getMasterKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * SSN Encryption Utilities
 * 
 * Provides AES-256-GCM encryption specifically for Social Security Numbers.
 * Uses the same master key as OAuth tokens for consistency.
 * 
 * Security: SSNs are highly sensitive PII - always encrypt at rest.
 */

/**
 * Encrypt a Social Security Number
 * 
 * @param ssn - Plaintext SSN (9 digits, with or without dashes)
 * @returns Encrypted SSN string
 */
export function encryptSSN(ssn: string | null | undefined): string | null {
  if (!ssn || ssn.trim() === '') {
    return null;
  }

  // Normalize SSN by removing dashes/spaces
  const normalizedSSN = ssn.replace(/[-\s]/g, '');
  
  // Validate SSN format (9 digits)
  if (!/^\d{9}$/.test(normalizedSSN)) {
    log.warn('⚠️  Invalid SSN format - encrypting as-is');
  }

  return encryptToken(normalizedSSN);
}

/**
 * Decrypt a Social Security Number
 * 
 * @param encryptedSSN - Encrypted SSN string
 * @returns Decrypted SSN (9 digits, no formatting)
 */
export function decryptSSN(encryptedSSN: string | null | undefined): string | null {
  if (!encryptedSSN || encryptedSSN.trim() === '') {
    return null;
  }

  try {
    return decryptToken(encryptedSSN);
  } catch (error: any) {
    log.error('SSN decryption failed:', error.message);
    return null;
  }
}

/**
 * Get masked SSN for display (XXX-XX-1234)
 * 
 * @param encryptedOrPlainSSN - SSN (encrypted or plain)
 * @returns Masked SSN string (last 4 digits visible)
 */
export function getMaskedSSN(encryptedOrPlainSSN: string | null | undefined): string | null {
  if (!encryptedOrPlainSSN) {
    return null;
  }

  try {
    // Decrypt if encrypted
    const ssn = isEncrypted(encryptedOrPlainSSN) 
      ? decryptSSN(encryptedOrPlainSSN) 
      : encryptedOrPlainSSN;
    
    if (!ssn || ssn.length < 4) {
      return null;
    }

    // Show only last 4 digits
    const last4 = ssn.slice(-4);
    return `XXX-XX-${last4}`;
  } catch {
    return null;
  }
}

// Export key generator for setup script
// Run with: tsx server/security/tokenEncryption.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  log.info('Generated ENCRYPTION_KEY (add to .env file):');
  log.info('ENCRYPTION_KEY=' + generateEncryptionKey());
  log.info('\nExample .env entry:');
  log.info(`ENCRYPTION_KEY=${generateEncryptionKey()}`);
}
