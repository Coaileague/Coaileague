import { Router } from 'express';
import type { Request, Response } from 'express';
import { pool } from '../db';
import { requireAuth } from '../auth';
import { createLogger } from '../lib/logger';
import { getRequiredAgreementsForRole } from '../middleware/requireLegalAcceptance';

const log = createLogger('LegalConsentRoutes');
const router = Router();

// GET /api/legal/agreements — list all current agreements
router.get('/agreements', async (req: Request, res: Response) => {
  try {
    const { type } = req.query as { type?: string };
    const result = await pool.query(
      `SELECT id, agreement_type, version, title, content, effective_date,
              requires_explicit_signature
       FROM legal_agreements
       WHERE is_current = true
         AND ($1::text IS NULL OR agreement_type = $1)
       ORDER BY agreement_type`,
      [type || null]
    );
    res.json(result.rows);
  } catch (err: any) {
    log.error('Failed to fetch agreements:', err?.message);
    res.status(500).json({ error: 'Failed to fetch agreements' });
  }
});

// GET /api/legal/pending-agreements — agreements this user still needs to accept
router.get('/pending-agreements', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const required = getRequiredAgreementsForRole(user.role || user.platformRole || '');
    if (required.length === 0) return res.json([]);

    const result = await pool.query(
      `SELECT la.id, la.agreement_type, la.version, la.title, la.content,
              la.effective_date, la.requires_explicit_signature
       FROM legal_agreements la
       WHERE la.is_current = true
         AND la.agreement_type = ANY($1::text[])
         AND NOT EXISTS (
           SELECT 1 FROM user_legal_acceptances ula
           WHERE ula.user_id = $2
             AND ula.agreement_type = la.agreement_type
             AND ula.version_accepted = la.version
             AND ula.revoked_at IS NULL
         )
       ORDER BY la.agreement_type`,
      [required, user.id]
    );
    res.json(result.rows);
  } catch (err: any) {
    const msg = err?.message || '';
    if (msg.includes('does not exist') || msg.includes('relation')) {
      return res.json([]); // No pending agreements if tables don't exist yet
    }
    log.error('Failed to fetch pending agreements:', err?.message);
    res.status(500).json({ error: 'Failed to fetch pending agreements' });
  }
});

// POST /api/legal/accept-agreements — accept one or more agreements
router.post('/accept-agreements', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { agreements, typedName, consentPreferences } = req.body;
    const ip = req.ip || req.socket?.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    if (!agreements || !Array.isArray(agreements) || agreements.length === 0) {
      return res.status(400).json({ error: 'agreements array required' });
    }
    if (!typedName || typedName.trim().length < 2) {
      return res.status(400).json({ error: 'typedName required for acceptance' });
    }

    for (const agreement of agreements) {
      if (!agreement.id || !agreement.type || !agreement.version) continue;
      await pool.query(
        `INSERT INTO user_legal_acceptances
         (user_id, workspace_id, agreement_id, agreement_type, version_accepted,
          accepted_at, ip_address, user_agent, acceptance_method, typed_name)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, 'typed_name', $8)
         ON CONFLICT DO NOTHING`,
        [
          user.id,
          user.workspaceId || null,
          agreement.id,
          agreement.type,
          agreement.version,
          ip,
          userAgent,
          typedName.trim(),
        ]
      );
    }

    // Upsert consent preferences
    if (consentPreferences && typeof consentPreferences === 'object') {
      const cp = consentPreferences;
      await pool.query(
        `INSERT INTO consent_preferences
         (user_id, workspace_id, trinity_voice_calls, trinity_sms, trinity_email,
          trinity_interview_calls, trinity_document_delivery, trinity_onboarding_comms,
          trinity_employment_verification, platform_updates, platform_billing,
          platform_security, marketing_emails)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (user_id, workspace_id) DO UPDATE SET
           trinity_voice_calls         = EXCLUDED.trinity_voice_calls,
           trinity_sms                 = EXCLUDED.trinity_sms,
           trinity_email               = EXCLUDED.trinity_email,
           trinity_interview_calls     = EXCLUDED.trinity_interview_calls,
           trinity_document_delivery   = EXCLUDED.trinity_document_delivery,
           trinity_onboarding_comms    = EXCLUDED.trinity_onboarding_comms,
           trinity_employment_verification = EXCLUDED.trinity_employment_verification,
           marketing_emails            = EXCLUDED.marketing_emails,
           updated_at                  = NOW()`,
        [
          user.id,
          user.workspaceId || null,
          cp.trinity_voice_calls ?? false,
          cp.trinity_sms ?? false,
          cp.trinity_email ?? false,
          cp.trinity_interview_calls ?? false,
          cp.trinity_document_delivery ?? false,
          cp.trinity_onboarding_comms ?? false,
          cp.trinity_employment_verification ?? false,
          cp.platform_updates ?? true,
          cp.platform_billing ?? true,
          cp.platform_security ?? true,
          cp.marketing_emails ?? false,
        ]
      );
    }

    log.info(`User ${user.id} accepted ${agreements.length} agreements`);
    res.json({ success: true, acceptedCount: agreements.length });
  } catch (err: any) {
    log.error('Failed to record agreement acceptance:', err?.message);
    res.status(500).json({ error: 'Failed to record acceptance' });
  }
});

// GET /api/legal/consent-check/:userId/:channel
router.get('/consent-check/:userId/:channel', requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId, channel } = req.params;
    const result = await pool.query(
      `SELECT trinity_voice_calls, trinity_sms, trinity_email, trinity_document_delivery,
              trinity_interview_calls, all_opted_out,
              voice_opted_out_at, sms_opted_out_at, email_opted_out_at
       FROM consent_preferences WHERE user_id = $1`,
      [userId]
    );
    if (!result.rows[0]) return res.json({ consented: false });

    const row = result.rows[0];
    if (row.all_opted_out) return res.json({ consented: false, reason: 'all_opted_out' });

    const channelMap: Record<string, boolean> = {
      voice: row.trinity_voice_calls,
      sms: row.trinity_sms,
      email: row.trinity_email,
      document: row.trinity_document_delivery,
      interview: row.trinity_interview_calls,
    };
    res.json({ consented: channelMap[channel] ?? false, preferences: row });
  } catch (err: any) {
    log.error('Consent check failed:', err?.message);
    res.status(500).json({ error: 'Consent check failed' });
  }
});

// POST /api/legal/opt-out — unauthenticated (for SMS STOP compliance)
router.post('/opt-out', async (req: Request, res: Response) => {
  try {
    const { email, phone, channel } = req.body;
    if (!email && !phone) {
      return res.status(400).json({ error: 'email or phone required' });
    }
    if (!['all', 'voice', 'sms', 'email'].includes(channel)) {
      return res.status(400).json({ error: 'channel must be all, voice, sms, or email' });
    }

    const userResult = await pool.query(
      `SELECT id FROM users WHERE email = $1 OR phone = $2 LIMIT 1`,
      [email || null, phone || null]
    );
    const userId = userResult.rows[0]?.id;
    if (!userId) {
      return res.json({ success: true, message: 'Opt-out recorded.' });
    }

    const updates: string[] = [];
    if (channel === 'all') {
      updates.push('all_opted_out = true, all_opted_out_at = NOW()');
    } else if (channel === 'sms') {
      updates.push('trinity_sms = false, sms_opted_out_at = NOW()');
    } else if (channel === 'voice') {
      updates.push('trinity_voice_calls = false, voice_opted_out_at = NOW()');
    } else if (channel === 'email') {
      updates.push('trinity_email = false, email_opted_out_at = NOW()');
    }

    await pool.query(
      `UPDATE consent_preferences SET ${updates.join(', ')}, updated_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );

    log.info(`Opt-out recorded for user ${userId} channel=${channel}`);
    res.json({ success: true, message: 'Opt-out recorded. You will no longer receive these communications.' });
  } catch (err: any) {
    log.error('Opt-out failed:', err?.message);
    res.status(500).json({ error: 'Opt-out failed' });
  }
});

// GET /api/legal/my-acceptances — what agreements current user has accepted
router.get('/my-acceptances', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = await pool.query(
      `SELECT ula.agreement_type, ula.version_accepted, ula.accepted_at,
              ula.acceptance_method, ula.typed_name, la.title
       FROM user_legal_acceptances ula
       JOIN legal_agreements la ON la.id = ula.agreement_id
       WHERE ula.user_id = $1 AND ula.revoked_at IS NULL
       ORDER BY ula.accepted_at DESC`,
      [user.id]
    );
    res.json(result.rows);
  } catch (err: any) {
    log.error('Failed to fetch acceptances:', err?.message);
    res.status(500).json({ error: 'Failed to fetch acceptances' });
  }
});

// GET /api/legal/consent-preferences — get current user's consent preferences
router.get('/consent-preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = await pool.query(
      `SELECT * FROM consent_preferences WHERE user_id = $1`,
      [user.id]
    );
    res.json(result.rows[0] || null);
  } catch (err: any) {
    log.error('Failed to fetch consent preferences:', err?.message);
    res.status(500).json({ error: 'Failed to fetch consent preferences' });
  }
});

// PATCH /api/legal/consent-preferences — update consent preferences
router.patch('/consent-preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const cp = req.body;
    await pool.query(
      `INSERT INTO consent_preferences
       (user_id, workspace_id, trinity_voice_calls, trinity_sms, trinity_email,
        trinity_interview_calls, trinity_document_delivery, trinity_onboarding_comms,
        marketing_emails, platform_updates, platform_billing)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id, workspace_id) DO UPDATE SET
         trinity_voice_calls       = EXCLUDED.trinity_voice_calls,
         trinity_sms               = EXCLUDED.trinity_sms,
         trinity_email             = EXCLUDED.trinity_email,
         trinity_interview_calls   = EXCLUDED.trinity_interview_calls,
         trinity_document_delivery = EXCLUDED.trinity_document_delivery,
         trinity_onboarding_comms  = EXCLUDED.trinity_onboarding_comms,
         marketing_emails          = EXCLUDED.marketing_emails,
         platform_updates          = EXCLUDED.platform_updates,
         platform_billing          = EXCLUDED.platform_billing,
         updated_at                = NOW()`,
      [
        user.id,
        user.workspaceId || null,
        cp.trinity_voice_calls ?? false,
        cp.trinity_sms ?? false,
        cp.trinity_email ?? false,
        cp.trinity_interview_calls ?? false,
        cp.trinity_document_delivery ?? false,
        cp.trinity_onboarding_comms ?? false,
        cp.marketing_emails ?? false,
        cp.platform_updates ?? true,
        cp.platform_billing ?? true,
      ]
    );
    res.json({ success: true });
  } catch (err: any) {
    log.error('Failed to update consent preferences:', err?.message);
    res.status(500).json({ error: 'Failed to update consent preferences' });
  }
});

export default router;
