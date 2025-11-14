import crypto from 'crypto';

// Generate HMAC-signed response token for contractor offers
// Format: {offerId}:{timestamp}:{hmac}
export function generateResponseToken(offerId: string): string {
  const secret = process.env.SESSION_SECRET || 'fallback-secret-change-me';
  const timestamp = Date.now().toString();
  const payload = `${offerId}:${timestamp}`;
  
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return `${payload}:${hmac}`;
}

// Validate response token and extract offer ID
export function validateResponseToken(token: string): { 
  valid: boolean; 
  offerId: string | null;
  error?: string;
} {
  try {
    const parts = token.split(':');
    if (parts.length !== 3) {
      return { valid: false, offerId: null, error: 'Invalid token format' };
    }
    
    const [offerId, timestamp, receivedHmac] = parts;
    const secret = process.env.SESSION_SECRET || 'fallback-secret-change-me';
    const payload = `${offerId}:${timestamp}`;
    
    // Verify HMAC
    const expectedHmac = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    if (receivedHmac !== expectedHmac) {
      return { valid: false, offerId: null, error: 'Invalid signature' };
    }
    
    // Check token age (valid for 30 days max)
    const tokenAge = Date.now() - parseInt(timestamp);
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    
    if (tokenAge > maxAge) {
      return { valid: false, offerId: null, error: 'Token expired' };
    }
    
    return { valid: true, offerId };
  } catch (error) {
    return { valid: false, offerId: null, error: 'Token validation failed' };
  }
}
