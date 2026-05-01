/**
 * verifyOnboardingGate — Layer 4 Handshake Middleware
 * 
 * PILLAR 2: Activation Sync — The Gatekeeper
 * 
 * Rule: If user is role='client' AND clientOnboardingStatus !== 'active',
 * they MUST be redirected to /verify-onboarding before any other route.
 * 
 * The dashboard, API calls, and all features are blocked until the
 * INVITED → ACTIVE flip is complete via the Confirm button.
 * 
 * Exceptions (always allowed through):
 *   - /verify-onboarding itself
 *   - /api/auth/* (login, logout, session)
 *   - /api/clients/portal/* (handshake confirmation)
 *   - Static assets, health checks
 */
import type { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { clients } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '../lib/logger';

const log = createLogger('VerifyOnboardingGate');

// Routes always allowed — never blocked by this gate
const GATE_EXEMPT_PREFIXES = [
  '/verify-onboarding',
  '/api/auth',
  '/api/clients/portal',
  '/api/push',
  '/api/health',
  '/api/csrf-token',
  '/api/legal',
  '/api/privacy',
  '/sw.js',
  '/favicon',
  '/icons',
  '/assets',
  '/manifest',
  '/screenshots',
];

export async function verifyOnboardingGate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Only applies to authenticated sessions
  const userId = (req.session as any)?.userId;
  if (!userId) return next();

  // Only applies to client-role users
  const userRole = req.user?.role || (req.session as any)?.role;
  if (userRole !== 'client') return next();

  // Allow exempt routes through
  const path = req.path;
  if (GATE_EXEMPT_PREFIXES.some(prefix => path.startsWith(prefix))) return next();

  try {
    const [clientRecord] = await db
      .select({ id: clients.id, clientOnboardingStatus: (clients as any).clientOnboardingStatus })
      .from(clients)
      .where(eq(clients.userId, userId))
      .limit(1);

    if (!clientRecord) return next(); // No client record — pass through

    const status = (clientRecord as any).clientOnboardingStatus;

    // Gate: INVITED status → block all routes, redirect to verification
    if (status && status !== 'active') {
      if (req.path.startsWith('/api/')) {
        // For API calls: return 403 with redirect hint
        res.status(403).json({
          message: 'Account verification required before accessing the platform.',
          code: 'VERIFICATION_REQUIRED',
          redirectTo: '/verify-onboarding',
          visualStatus: 'invited',
        });
        return;
      }
      // For page routes: redirect to verification screen
      res.redirect('/verify-onboarding');
      return;
    }
  } catch (err) {
    log.warn('[VerifyOnboardingGate] Status check failed (non-fatal, passing through):', err);
  }

  next();
}
