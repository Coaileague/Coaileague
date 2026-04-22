/**
 * PUBLIC HIRING ROUTES — No authentication required
 * Job board and public application submission
 */
import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { db } from '../db';
import { platformEventBus } from '../services/platformEventBus';
import { scheduleNonBlocking } from '../lib/scheduleNonBlocking';
import { createLogger } from '../lib/logger';
const log = createLogger('publicHiringRoutes');

// CATEGORY C — All db.$client.query calls in this file use raw SQL for public hiring portal | Tables: workspaces, job_postings, applicants | Verified: 2026-03-23
const router = Router();

// GET /api/public/jobs/:workspaceId — Public job board
router.get('/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const ws = await db.$client.query(
      `SELECT id, name, company_name, logo_url, brand_color, website, phone FROM workspaces WHERE id = $1 LIMIT 1`,
      [workspaceId]
    );
    if (!ws.rows.length) return res.status(404).json({ error: 'Organization not found' });

    const postings = await db.$client.query(
      `SELECT id, title, description, position_type, shift_type, employment_type, sites,
              pay_rate_min, pay_rate_max, schedule_details, requires_license,
              applications_count, posted_at
       FROM job_postings
       WHERE workspace_id = $1 AND status = 'active'
       ORDER BY posted_at DESC`,
      [workspaceId]
    );
    res.json({ workspace: ws.rows[0], postings: postings.rows });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// POST /api/public/jobs/:workspaceId/apply — Public application submission
router.post('/:workspaceId/apply', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const {
      job_posting_id, first_name, last_name, email, phone,
      has_license, license_number, license_state, license_type,
      interested_in_sponsorship
    } = req.body;

    if (!first_name || !last_name || !email) {
      return res.status(400).json({ error: 'first_name, last_name, and email are required' });
    }

    const jp = await db.$client.query(
      `SELECT id FROM job_postings WHERE id = $1 AND workspace_id = $2 AND status = 'active' LIMIT 1`,
      [job_posting_id, workspaceId]
    );
    if (!jp.rows.length) return res.status(404).json({ error: 'Job posting not found or no longer active' });

    const idResult = await db.$client.query(`SELECT gen_random_uuid()::VARCHAR AS id`);
    const id = idResult.rows[0].id;

    const pgClient = await db.$client.connect();
    try {
      await pgClient.query('BEGIN');
      await pgClient.query(
        `INSERT INTO applicants (
          id, workspace_id, job_posting_id, first_name, last_name, email, phone,
          has_guard_card, guard_card_number, license_state, license_type,
          has_armed_endorsement, years_experience, applied_at, status,
          trinity_score, trinity_score_rationale, pipeline_stage, license_verified, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,FALSE,0,NOW(),'applied',0,'Pending Trinity scoring','applied',FALSE,$12)`,
        [
          id, workspaceId, job_posting_id,
          first_name, last_name, email, phone || null,
          has_license || false, license_number || null,
          license_state || null, license_type || null,
          interested_in_sponsorship ? 'Applicant expressed interest in license sponsorship.' : null
        ]
      );
      await pgClient.query(
        `UPDATE job_postings SET applications_count = applications_count + 1 WHERE id = $1 AND workspace_id = $2`,
        [job_posting_id, workspaceId]
      );
      await pgClient.query('COMMIT');
    } catch (txErr) {
      await pgClient.query('ROLLBACK');
      throw txErr;
    } finally {
      pgClient.release();
    }

    platformEventBus.publish({
      type: 'system_signal',
      category: 'hiring',
      title: `New Public Application — ${first_name} ${last_name}`,
      description: `Applied for posting ${job_posting_id}. License: ${has_license}`,
      workspaceId,
      metadata: { applicantId: id, hasLicense: has_license }
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    // ── Trinity Auto-Score (non-blocking — never delays the applicant's response) ──
    // Fires immediately after application saved. Score lands in DB within ~5 seconds.
    scheduleNonBlocking('trinity.auto-score-applicant', async () => {
      const { screenCandidate } = await import(
        '../services/recruitment/trinityScreeningService'
      );

      // Build resume text from application fields
      const resumeText = [
        `Name: ${first_name} ${last_name}`,
        `Email: ${email}`,
        phone ? `Phone: ${phone}` : '',
        has_license
          ? `Security License: YES — ${license_type || 'type not specified'} — ${license_state || 'state not specified'} — ${license_number || 'number not specified'}`
          : 'Security License: NO',
        interested_in_sponsorship ? 'Notes: Applicant interested in license sponsorship' : '',
      ].filter(Boolean).join('\n');

      // Get job posting details for context
      const postingResult = await db.$client.query(
        `SELECT title, position_type, employment_type, shift_type, requires_license,
                requires_armed_license, site_type, state_jurisdiction, bilingual_required,
                sponsorship_available, pay_rate_min, pay_rate_max
           FROM job_postings WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
        [job_posting_id, workspaceId]
      );
      const posting = postingResult.rows[0] || {};

      const result = await screenCandidate(
        { id, workspaceId } as any,
        resumeText,
        posting.position_type || 'unarmed_officer',
        {
          isArmedRole: !!posting.requires_armed_license,
          stateJurisdiction: posting.state_jurisdiction || 'TX',
          siteType: posting.site_type || 'general',
          requiresBilingual: !!posting.bilingual_required,
          sponsorshipAvailable: !!posting.sponsorship_available,
        }
      );

      // Write score back to applicant record
      await db.$client.query(
        `UPDATE applicants
            SET trinity_score = $1,
                trinity_score_rationale = $2,
                trinity_score_dimensions = $3,
                trinity_flags = $4,
                trinity_liability_indicators = $5,
                trinity_recommendation = $6,
                trinity_scored_at = NOW(),
                pipeline_stage = CASE
                  WHEN $1 >= 70 THEN 'pre_screened'
                  WHEN $1 >= 50 THEN 'applied'
                  ELSE 'disqualified'
                END,
                status = CASE WHEN $1 < 50 THEN 'rejected' ELSE status END
          WHERE id = $7 AND workspace_id = $8`,
        [
          result.score,
          result.reasoning,
          JSON.stringify(result.dimensions),
          JSON.stringify(result.flags),
          JSON.stringify(result.liabilityIndicators),
          result.recommendation,
          id,
          workspaceId,
        ]
      );

      // Cross-tenant network check (only if workspace opted in)
      const { checkCrossTenantHistory } = await import(
        '../services/hiring/crossTenantScreenService'
      );
      const crossCheck = await checkCrossTenantHistory({
        phone: phone || null,
        email,
        workspaceId,
        applicantId: id,
      });

      if (crossCheck.flagged) {
        await db.$client.query(
          `UPDATE applicants
              SET cross_tenant_flag = TRUE,
                  cross_tenant_flag_reason = $1
            WHERE id = $2 AND workspace_id = $3`,
          [crossCheck.reason, id, workspaceId]
        );
        log.info(`[CrossTenant] Applicant ${id} flagged — prior network record`);
      }

      // If liability indicators present, spawn legal_agent for deeper review
      if (result.liabilityIndicators.length > 0 || result.flags.some(f => f.severity === 'critical')) {
        try {
          const { spawnAgent } = await import('../services/ai-brain/agentSpawner');
          await spawnAgent({
            workspaceId,
            agentKey: 'legal_agent',
            taskType: 'hire_liability_assessment',
            inputPayload: {
              applicant_id: id,
              applicant_name: `${first_name} ${last_name}`,
              trinity_score: result.score,
              liability_indicators: result.liabilityIndicators,
              flags: result.flags,
              resume_summary: resumeText.slice(0, 500),
            },
            relatedEntityType: 'applicant',
            relatedEntityId: id,
            spawnedBy: 'public_apply_auto_score',
          });
        } catch (spawnErr: any) {
          log.warn('[AutoScore] legal_agent spawn failed:', spawnErr?.message);
        }
      }

      // Notify workspace — score complete
      platformEventBus.publish({
        type: 'applicant_scored',
        category: 'hiring',
        title: `Trinity scored: ${first_name} ${last_name} — ${result.score}/100`,
        description: `${result.recommendation.toUpperCase()}: ${result.reasoning}`,
        workspaceId,
        metadata: {
          applicantId: id,
          score: result.score,
          recommendation: result.recommendation,
          hasLiabilityFlags: result.liabilityIndicators.length > 0,
          hasCriticalFlags: result.flags.some(f => f.severity === 'critical'),
          crossTenantFlag: crossCheck.flagged,
        },
      }).catch(() => {});

      log.info(`[AutoScore] ${first_name} ${last_name} → ${result.score}/100 (${result.recommendation})`);
    });

    res.status(201).json({
      success: true,
      applicantId: id,
      message: 'Application submitted successfully. You will be contacted within 2–3 business days.'
    });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
