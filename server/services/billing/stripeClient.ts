/**
 * Lazy Stripe client factory.
 *
 * Replaces the previous pattern of module-load `new Stripe(process.env.STRIPE_SECRET_KEY!)`
 * which crashed the entire process at import time when the env var was missing.
 *
 * Usage:
 *   import { getStripe } from './stripeClient';
 *   const stripe = getStripe();
 *
 * The first call instantiates the SDK; subsequent calls return the cached singleton.
 * If STRIPE_SECRET_KEY is missing, a clear error is thrown at use-site instead of
 * crashing boot — billing routes will return 500 with a meaningful message and the
 * rest of the platform stays up.
 */

import Stripe from 'stripe';

const STRIPE_API_VERSION = '2025-09-30.clover' as const;
const STRIPE_TIMEOUT_MS = 10_000;
const STRIPE_MAX_NETWORK_RETRIES = 2;

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Billing operations are unavailable. ' +
      'Set STRIPE_SECRET_KEY in the deploy environment.'
    );
  }

  _stripe = new Stripe(key, {
    apiVersion: STRIPE_API_VERSION as any,
    timeout: STRIPE_TIMEOUT_MS,
    maxNetworkRetries: STRIPE_MAX_NETWORK_RETRIES,
  });
  return _stripe;
}

/** True if STRIPE_SECRET_KEY is configured (does not instantiate the client). */
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}
