/**
 * reCAPTCHA v3 Server-Side Verification Service
 * 
 * Verifies reCAPTCHA tokens and determines if user is human
 * - Score 0.0 = definitely a bot
 * - Score 1.0 = definitely human
 * - Threshold of 0.5 is recommended (we use 0.3 to be lenient)
 */

const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || '';
const SCORE_THRESHOLD = 0.3; // Low threshold - only blocks obvious bots

interface RecaptchaResponse {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}

interface VerificationResult {
  success: boolean;
  score: number;
  isHuman: boolean;
  action?: string;
  error?: string;
}

/**
 * Verify a reCAPTCHA token from the frontend
 * Returns score and whether user passes as human
 */
export async function verifyRecaptcha(
  token: string | null | undefined,
  expectedAction?: string,
  diagnosticsHeader?: string | null
): Promise<VerificationResult> {
  // Diagnostics bypass: Only when DIAG_BYPASS_CAPTCHA is set AND header matches
  // This is secure because it requires both server-side env var AND correct header
  const bypassEnabled = process.env.DIAG_BYPASS_CAPTCHA === 'true';
  const headerValid = diagnosticsHeader === 'trinity-diagnostics-agent';
  
  if (bypassEnabled && headerValid) {
    console.log('[reCAPTCHA] Diagnostics bypass active - allowing test request');
    return {
      success: true,
      score: 1.0,
      isHuman: true,
      action: expectedAction,
    };
  }
  
  // If no secret key configured, skip verification (development mode)
  if (!RECAPTCHA_SECRET_KEY) {
    console.log('[reCAPTCHA] No secret key configured - allowing request');
    return {
      success: true,
      score: 1.0,
      isHuman: true,
      action: expectedAction,
    };
  }

  // If no token provided, allow but log (graceful degradation)
  if (!token) {
    console.log('[reCAPTCHA] No token provided - allowing request (graceful degradation)');
    return {
      success: true,
      score: 0.7, // Neutral score
      isHuman: true,
    };
  }

  try {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        secret: RECAPTCHA_SECRET_KEY,
        response: token,
      }),
    });

    const data: RecaptchaResponse = await response.json();

    if (!data.success) {
      console.warn('[reCAPTCHA] Verification failed:', data['error-codes']);
      return {
        success: false,
        score: 0,
        isHuman: false,
        error: data['error-codes']?.join(', ') || 'Verification failed',
      };
    }

    const score = data.score ?? 0;
    const isHuman = score >= SCORE_THRESHOLD;

    // Log suspicious activity
    if (!isHuman) {
      console.warn(`[reCAPTCHA] Suspicious activity detected - Score: ${score}, Action: ${data.action}`);
    }

    // Verify action matches if expected action provided
    if (expectedAction && data.action !== expectedAction) {
      console.warn(`[reCAPTCHA] Action mismatch - Expected: ${expectedAction}, Got: ${data.action}`);
      // Still allow but log the mismatch
    }

    return {
      success: true,
      score,
      isHuman,
      action: data.action,
    };
  } catch (error) {
    console.error('[reCAPTCHA] Server error:', error);
    // Allow on error (don't block legitimate users due to service issues)
    return {
      success: true,
      score: 0.7,
      isHuman: true,
      error: 'Verification service unavailable',
    };
  }
}

/**
 * Middleware-style verification that throws if bot detected
 */
export async function requireHuman(
  token: string | null | undefined,
  action?: string
): Promise<void> {
  const result = await verifyRecaptcha(token, action);

  if (!result.isHuman) {
    const error = new Error('Suspicious activity detected. Please try again.');
    (error as any).statusCode = 429;
    throw error;
  }
}

export default {
  verifyRecaptcha,
  requireHuman,
};
