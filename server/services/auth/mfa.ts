import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { db } from '../../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

const ENCRYPTION_KEY = process.env.SESSION_SECRET || 'default-key-change-in-production';
const ALGORITHM = 'aes-256-cbc';

/**
 * Encrypt sensitive data (MFA secrets, backup codes)
 */
function encrypt(text: string): string {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt sensitive data
 */
function decrypt(encryptedText: string): string {
  const [ivHex, encrypted] = encryptedText.split(':');
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Generate a new TOTP secret for a user
 */
export async function generateMfaSecret(userId: string, userEmail: string): Promise<{
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}> {
  // Generate TOTP secret
  const secret = speakeasy.generateSecret({
    name: `AutoForce™ (${userEmail})`,
    issuer: 'AutoForce',
    length: 32,
  });

  if (!secret.base32 || !secret.otpauth_url) {
    throw new Error('Failed to generate MFA secret');
  }

  // Generate QR code
  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

  // Generate 8 backup codes (8 characters each)
  const backupCodes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    backupCodes.push(code);
  }

  // Store encrypted secret and backup codes in database
  const encryptedSecret = encrypt(secret.base32);
  const encryptedBackupCodes = backupCodes.map(code => encrypt(code));

  await db
    .update(users)
    .set({
      mfaSecret: encryptedSecret,
      mfaBackupCodes: encryptedBackupCodes,
      mfaEnabled: false, // Not enabled until user verifies first code
    })
    .where(eq(users.id, userId));

  return {
    secret: secret.base32,
    qrCodeUrl,
    backupCodes,
  };
}

/**
 * Verify a TOTP token for a user
 */
export async function verifyMfaToken(
  userId: string,
  token: string
): Promise<{ valid: boolean; isBackupCode?: boolean }> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      mfaSecret: true,
      mfaBackupCodes: true,
      mfaEnabled: true,
    },
  });

  if (!user || !user.mfaSecret) {
    return { valid: false };
  }

  // Try TOTP token first
  const decryptedSecret = decrypt(user.mfaSecret);
  const verified = speakeasy.totp.verify({
    secret: decryptedSecret,
    encoding: 'base32',
    token: token,
    window: 2, // Allow 2 time steps of drift (±60 seconds)
  });

  if (verified) {
    // Update last used timestamp
    await db
      .update(users)
      .set({ mfaLastUsedAt: new Date() })
      .where(eq(users.id, userId));

    return { valid: true };
  }

  // Try backup codes
  if (user.mfaBackupCodes && user.mfaBackupCodes.length > 0) {
    for (let i = 0; i < user.mfaBackupCodes.length; i++) {
      const decryptedBackupCode = decrypt(user.mfaBackupCodes[i]);
      if (decryptedBackupCode === token.toUpperCase()) {
        // Remove used backup code
        const updatedBackupCodes = [
          ...user.mfaBackupCodes.slice(0, i),
          ...user.mfaBackupCodes.slice(i + 1),
        ];

        await db
          .update(users)
          .set({
            mfaBackupCodes: updatedBackupCodes,
            mfaLastUsedAt: new Date(),
          })
          .where(eq(users.id, userId));

        return { valid: true, isBackupCode: true };
      }
    }
  }

  return { valid: false };
}

/**
 * Enable MFA for a user (after first successful verification)
 */
export async function enableMfa(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      mfaEnabled: true,
      mfaLastUsedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/**
 * Disable MFA for a user
 */
export async function disableMfa(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: null,
      mfaLastUsedAt: null,
    })
    .where(eq(users.id, userId));
}

/**
 * Regenerate backup codes
 */
export async function regenerateBackupCodes(userId: string): Promise<string[]> {
  // Generate new backup codes
  const backupCodes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    backupCodes.push(code);
  }

  const encryptedBackupCodes = backupCodes.map(code => encrypt(code));

  await db
    .update(users)
    .set({ mfaBackupCodes: encryptedBackupCodes })
    .where(eq(users.id, userId));

  return backupCodes;
}

/**
 * Check if user has MFA enabled
 */
export async function checkMfaStatus(userId: string): Promise<{
  enabled: boolean;
  backupCodesRemaining: number;
}> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      mfaEnabled: true,
      mfaBackupCodes: true,
    },
  });

  return {
    enabled: user?.mfaEnabled ?? false,
    backupCodesRemaining: user?.mfaBackupCodes?.length ?? 0,
  };
}
