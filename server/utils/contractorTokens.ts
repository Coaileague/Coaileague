import crypto from 'crypto';

/**
 * SECURITY FIX: Opaque token system with workspace binding
 * 
 * Old design (VULNERABLE):
 * - Token format: {offerId}:{timestamp}:{hmac}
 * - Exposed offerId in plaintext (brute-force risk)
 * - No workspace binding (cross-tenant replay possible)
 * 
 * New design (SECURE):
 * - Token format: opaque UUID
 * - Stored in database (shift_offers.responseToken)
 * - Validated via database lookup with workspace check
 * - Prevents cross-tenant replay (token tied to specific workspace)
 */

// Generate opaque response token (cryptographically random UUID)
export function generateResponseToken(): string {
  // Generate 16 random bytes and format as UUID v4
  const randomBytes = crypto.randomBytes(16);
  
  // Set version (4) and variant bits per RFC 4122
  randomBytes[6] = (randomBytes[6] & 0x0f) | 0x40; // version 4
  randomBytes[8] = (randomBytes[8] & 0x3f) | 0x80; // variant 10
  
  // Format as UUID string
  const hex = randomBytes.toString('hex');
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32)
  ].join('-');
}

/**
 * Validate response token via database lookup
 * 
 * IMPORTANT: This function only validates token format.
 * Caller MUST verify workspace scoping via database query.
 * 
 * @param token - Opaque UUID token
 * @returns Validation result (format check only)
 */
export function validateResponseTokenFormat(token: string): { 
  valid: boolean; 
  error?: string;
} {
  // Validate UUID format (8-4-4-4-12 hex pattern)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  if (!uuidRegex.test(token)) {
    return { valid: false, error: 'Invalid token format' };
  }
  
  return { valid: true };
}
