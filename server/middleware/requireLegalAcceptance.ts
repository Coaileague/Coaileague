import type { Request, Response, NextFunction } from 'express';
import { pool } from '../db';
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';

const log = createLogger('RequireLegalAcceptance');

const EXEMPT_PREFIXES = [
  '/api/legal',
  '/api/auth',
  '/api/inbound',
  '/api/voice',
  '/api/forms/public',
  '/api/onboarding',
  '/health',
  '/status',
  '/api/status',
];

function getRequiredAgreementsForRole(role: string): string[] {
  const base = ['platform_terms', 'privacy_policy'];
  const officer = [...base, 'trinity_consent'];
  const auditor = ['auditor_terms'];

  switch (role) {
    case 'sra_auditor':
      return auditor;
    case 'officer':
    case 'supervisor':
    case 'manager':
    case 'department_manager':
      return officer;
    case 'org_owner':
    case 'co_owner':
    case 'org_admin':
      return officer;
    default:
      return base;
  }
}

export async function requireLegalAcceptance(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = (req as any).user;
  if (!user?.id) return next();

  if (EXEMPT_PREFIXES.some((p) => req.path.startsWith(p))) return next();

  try {
    const required = getRequiredAgreementsForRole(user.role || user.platformRole || '');
    if (required.length === 0) return next();

    const result = await pool.query(
      `SELECT la.id, la.agreement_type FROM legal_agreements la
       WHERE la.is_current = true
         AND la.agreement_type = ANY($1::text[])
         AND NOT EXISTS (
           SELECT 1 FROM user_legal_acceptances ula
           WHERE ula.user_id = $2
             AND ula.agreement_type = la.agreement_type
             AND ula.version_accepted = la.version
             AND ula.revoked_at IS NULL
         )
       LIMIT 1`,
      [required, user.id]
    );

    if (result.rows.length > 0) {
      res.status(403).json({
        error: 'LEGAL_ACCEPTANCE_REQUIRED',
        message: `Please review and accept the required agreements to continue using ${PLATFORM.name}.`,
        pendingAgreementType: result.rows[0].agreement_type,
      });
      return;
    }
  } catch (err: any) {
    log.warn('Legal acceptance check failed (non-blocking):', err?.message);
  }

  next();
}

export { getRequiredAgreementsForRole };
