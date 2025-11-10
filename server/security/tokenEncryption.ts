import crypto from 'crypto';

/**
 * OAuth Token Encryption Module
 * 
 * Provides AES-256-GCM encryption for OAuth access/refresh tokens stored in database.
 * Uses a single master key from environment variable (not per-entity keys like conversations).
 * 
 * CRITICAL: Set ENCRYPTION_KEY environment variable to a 32-byte hex string.
 * Generate with: `openssl rand -hex 32` or `node -e "console.log(crypto.randomBytes(32).toString('hex'))"`
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
 * @throws Error if key missing in production or invalid length
 */
function getMasterKey(): Buffer {
  // Return cached key if available
  if (cachedMasterKey) {
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
      console.warn(
        '⚠️  ENCRYPTION_KEY not set - OAuth tokens will be stored in PLAINTEXT! ' +
        'Set ENCRYPTION_KEY in .env for security.'
      );
      throw new Error('ENCRYPTION_KEY not configured');
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
 * @returns Encrypted token in format: iv:authTag:ciphertext (base64)
 * @throws Error if token is null/undefined or encryption key invalid
 */
export function encryptToken(token: string | null | undefined): string {
  if (!token) {
    throw new Error('Cannot encrypt null or undefined token');
  }

  // Check if already encrypted (prevents double-encryption)
  if (isEncrypted(token)) {
    console.warn('⚠️  Token appears to be already encrypted - skipping encryption');
    return token;
  }

  try {
    const key = getMasterKey();
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
 * @throws Error if token is null/undefined, invalid format, or decryption fails
 */
export function decryptToken(encryptedToken: string | null | undefined): string {
  if (!encryptedToken) {
    throw new Error('Cannot decrypt null or undefined token');
  }

  // Handle legacy plaintext tokens (backward compatibility)
  if (!isEncrypted(encryptedToken)) {
    console.warn(
      '⚠️  Decrypting legacy plaintext token - should be re-encrypted on next refresh'
    );
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
    console.error('Token encryption failed:', error);
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
    console.error('Token decryption failed:', error);
    throw error; // Don't silently fail - decryption failure means token is unusable
  }
}

/**
 * Generate a new encryption key (for setup/rotation)
 * 
 * Usage: node -e "console.log(require('./server/security/tokenEncryption').generateEncryptionKey())"
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

// Export key generator for setup script
if (require.main === module) {
  console.log('Generated ENCRYPTION_KEY (add to .env file):');
  console.log('ENCRYPTION_KEY=' + generateEncryptionKey());
  console.log('\nExample .env entry:');
  console.log(`ENCRYPTION_KEY=${generateEncryptionKey()}`);
}
