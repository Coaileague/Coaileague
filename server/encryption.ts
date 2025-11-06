import crypto from 'crypto';
import { db } from './db';
import { conversationEncryptionKeys } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Encryption Service for Private DM Messages
 * 
 * Provides AES-256-GCM encryption for message content and files.
 * Each conversation has its own encryption key stored server-side in the database.
 * 
 * NOTE: This is server-side encryption at rest. For true E2E encryption,
 * keys would need to be managed client-side with public/private key pairs.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const AUTH_TAG_LENGTH = 16;

interface EncryptionKey {
  id: string;
  key: Buffer;
  createdAt: Date;
}

// In-memory key cache for performance
const keyCache = new Map<string, EncryptionKey>();

/**
 * Generate and persist a new encryption key for a conversation
 */
export async function generateEncryptionKey(conversationId: string, workspaceId: string, createdBy?: string): Promise<EncryptionKey> {
  const id = crypto.randomUUID();
  const key = crypto.randomBytes(KEY_LENGTH);
  const keyMaterial = key.toString('base64');
  
  // Persist to database
  await db.insert(conversationEncryptionKeys).values({
    id,
    conversationId,
    workspaceId,
    keyMaterial,
    algorithm: ALGORITHM,
    createdBy,
    isActive: true,
  });
  
  const encKey: EncryptionKey = {
    id,
    key,
    createdAt: new Date(),
  };
  
  keyCache.set(id, encKey);
  return encKey;
}

/**
 * Get an encryption key by ID (loads from DB if not in cache)
 */
export async function getEncryptionKey(keyId: string): Promise<EncryptionKey | null> {
  // Check cache first
  const cached = keyCache.get(keyId);
  if (cached) {
    return cached;
  }
  
  // Load from database
  const result = await db
    .select()
    .from(conversationEncryptionKeys)
    .where(eq(conversationEncryptionKeys.id, keyId))
    .limit(1);
  
  if (result.length === 0) {
    return null;
  }
  
  const dbKey = result[0];
  const key = Buffer.from(dbKey.keyMaterial, 'base64');
  
  const encKey: EncryptionKey = {
    id: dbKey.id,
    key,
    createdAt: dbKey.createdAt,
  };
  
  // Cache for future use
  keyCache.set(keyId, encKey);
  
  // Update last_used_at timestamp
  await db
    .update(conversationEncryptionKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(conversationEncryptionKeys.id, keyId));
  
  return encKey;
}

/**
 * Store an encryption key (for loading from database)
 */
export function storeEncryptionKey(keyId: string, keyBuffer: Buffer): EncryptionKey {
  const encKey: EncryptionKey = {
    id: keyId,
    key: keyBuffer,
    createdAt: new Date(),
  };
  
  keyCache.set(keyId, encKey);
  return encKey;
}

/**
 * Encrypt a message using conversation's encryption key
 */
export async function encryptMessage(message: string, keyId: string): Promise<{ 
  encrypted: string; 
  iv: string; 
}> {
  const encKey = await getEncryptionKey(keyId);
  if (!encKey) {
    throw new Error(`Encryption key not found: ${keyId}`);
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, encKey.key, iv);
  
  let encrypted = cipher.update(message, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Combine encrypted data with auth tag
  const combined = encrypted + authTag.toString('hex');
  
  return {
    encrypted: combined,
    iv: iv.toString('hex'),
  };
}

/**
 * Decrypt a message using conversation's encryption key
 */
export async function decryptMessage(encryptedData: string, iv: string, keyId: string): Promise<string> {
  const encKey = await getEncryptionKey(keyId);
  if (!encKey) {
    throw new Error(`Encryption key not found: ${keyId}`);
  }

  // Split encrypted data and auth tag
  const authTagHex = encryptedData.slice(-AUTH_TAG_LENGTH * 2);
  const encrypted = encryptedData.slice(0, -AUTH_TAG_LENGTH * 2);
  
  const decipher = crypto.createDecipheriv(
    ALGORITHM, 
    encKey.key, 
    Buffer.from(iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Encrypt a file buffer
 */
export async function encryptFile(fileBuffer: Buffer, keyId: string): Promise<{ 
  encrypted: Buffer; 
  iv: string; 
}> {
  const encKey = await getEncryptionKey(keyId);
  if (!encKey) {
    throw new Error(`Encryption key not found: ${keyId}`);
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, encKey.key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(fileBuffer),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  
  return {
    encrypted,
    iv: iv.toString('hex'),
  };
}

/**
 * Decrypt a file buffer
 */
export async function decryptFile(encryptedBuffer: Buffer, iv: string, keyId: string): Promise<Buffer> {
  const encKey = await getEncryptionKey(keyId);
  if (!encKey) {
    throw new Error(`Encryption key not found: ${keyId}`);
  }

  // Extract auth tag from end of buffer
  const authTag = encryptedBuffer.slice(-AUTH_TAG_LENGTH);
  const encrypted = encryptedBuffer.slice(0, -AUTH_TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(
    ALGORITHM, 
    encKey.key, 
    Buffer.from(iv, 'hex')
  );
  
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  
  return decrypted;
}

/**
 * Export key as base64 for storage (wrapped/encrypted in production)
 */
export function exportKey(keyId: string): string {
  const encKey = getEncryptionKey(keyId);
  if (!encKey) {
    throw new Error(`Encryption key not found: ${keyId}`);
  }
  
  // In production, this would be wrapped with a master key (KMS/HSM)
  return encKey.key.toString('base64');
}

/**
 * Import key from base64 storage
 */
export function importKey(keyId: string, base64Key: string): EncryptionKey {
  const keyBuffer = Buffer.from(base64Key, 'base64');
  return storeEncryptionKey(keyId, keyBuffer);
}
