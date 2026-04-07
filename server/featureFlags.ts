// Feature Flags for Graceful Degradation
// Prevents app crashes when optional services are unavailable

export const FEATURES = {
  // Payment Processing
  STRIPE_PAYMENTS: !!process.env.STRIPE_SECRET_KEY,
  
  // Email Services
  EMAIL_NOTIFICATIONS: !!process.env.RESEND_API_KEY,
  
  // SMS Services (Optional)
  SMS_NOTIFICATIONS: !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN,
  
  // AI Services (Optional - Gemini is the primary AI brain)
  AI_FEATURES: !!process.env.OPENAI_API_KEY || !!process.env.ANTHROPIC_API_KEY || !!process.env.GEMINI_API_KEY,
  
  // Object Storage (Optional)
  OBJECT_STORAGE: !!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID,
  
  // Core Features (Always Available)
  DATABASE: true,
  AUTHENTICATION: true,
  WEBSOCKETS: true,
} as const;

export type FeatureKey = keyof typeof FEATURES;

export function isFeatureEnabled(feature: FeatureKey): boolean {
  return FEATURES[feature] === true;
}

export function requireFeature(feature: FeatureKey): void {
  if (!FEATURES[feature]) {
    throw new Error(`Feature "${feature}" is not enabled. Required environment variables may be missing.`);
  }
}

// Get human-readable feature status
export function getFeatureStatus() {
  return Object.entries(FEATURES).map(([key, enabled]) => ({
    feature: key,
    enabled,
    status: enabled ? 'ok' : 'disabled',
  }));
}
