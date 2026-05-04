/**
 * Workspace Identity Repair & Orphan Audit — Wave 10
 * ─────────────────────────────────────────────────────────────────────────────
 * Secure admin endpoints to repair workspaces that bypassed the onboarding
 * flow and are missing org_code, email_slug, or provisioned email addresses.
 *
 * WHY THIS EXISTS: Normal tenant registration runs 3 steps atomically:
 *   1. Create workspaces row
 *   2. Set org_code + email_slug
 *   3. Call emailProvisioningService.provisionWorkspaceAddresses()
 * Manual DB injection skips steps 2-3. These endpoints replay them safely.
 * All operations use ON CONFLICT DO NOTHING — safe to run multiple times.
 *
 * SECURITY: X-Diagnostic-Secret header = DIAG_BYPASS_SECRET env var.
 *
 * POST /api/admin/workspace/repair-identity    — repair one workspace
 * GET  /api/admin/workspace/orphan-audit       — find all incomplete workspaces
 * POST /api/admin/workspace/repair-all-orphans — bulk repair all orphans
 */

import { Router, type Request, type Response } from 'express';
import { pool } from '../db';
import { emailProvisioningService } from '../services/email/emailProvisioningService';
import { createLogger } from '../lib/logger';

const log = createLogger('WorkspaceRepair');
const router = Router();

// ── Security gate ─────────────────────────────────────────────────────────────
router.use((req: Request, res: Response, next: () => void) => {
  const provided = req.headers['x-diagnostic-secret'] || req.query.secret;
  const expected = process.env.DIAG_BYPASS_SECRET;
  if (!expected || provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized — X-Diagnostic-Secret required' });
  }
  next();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function deriveOrgCode(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim().split(/\s+/);
  const code = words.map((w: string) => w.slice(0, 3)).join('').slice(0, 8);
  return code || 'WS';
}

function deriveEmailSlug(orgCode: string, name: string): string {
  if (orgCode) return orgCode.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'workspace';
}

async function ensureUniqueSlug(baseSlug: string, excludeId: string): Promise<string> {
  let slug = baseSlug;
  let suffix = 2;
  for (let i = 0; i < 10; i++) {
    const { rows } = await pool.query(
      `SELECT id FROM workspaces WHERE email_slug = $1 AND id != $2 LIMIT 1`,
      [slug, excludeId]
    );
    if (rows.length === 0) break;
    slug = `${baseSlug.replace(/\d+$/, '')}${suffix++}`;
  }
  return slug;
}

async function ensureUniqueOrgCode(baseCode: string, excludeId: string): Promise<string> {
  let code = baseCode;
  let suffix = 2;
  for (let i = 0; i < 10; i++) {
    const { rows } = await pool.query(
      `SELECT id FROM workspaces WHERE org_code = $1 AND id != $2 LIMIT 1`,
      [code, excludeId]
    );
    if (rows.length === 0) break;
    code = `${baseCode.slice(0, 6)}${suffix++}`;
  }
  return code;
}

// ── Core repair function (reusable) ───────────────────────────────────────────
async function repairWorkspace(wsId: string, dryRun: boolean): Promise<{
  workspaceId: string;
  workspaceName: string;
  repairs: string[];
  alreadyOk: string[];
  emailAddresses: string[];
  orgCode: string;
  emailSlug: string;
}> {
  const { rows } = await pool.query(
    `SELECT id, name, org_code, email_slug, email_domain, subscription_tier, state_license_number
     FROM workspaces WHERE id = $1`,
    [wsId]
  );

  const ws = rows[0];
  if (!ws) throw new Error(`Workspace ${wsId} not found`);

  const repairs: string[] = [];
  const alreadyOk: string[] = [];

  // ── Step 1: org_code ──────────────────────────────────────────────────────
  let orgCode = ws.org_code || '';
  if (!orgCode) {
    // Special case: Statewide always gets 'sps' (matches productionSeed.ts)
    const isStatewide = String(ws.name).toLowerCase().includes('statewide')
      || wsId === process.env.STATEWIDE_WORKSPACE_ID;
    const candidate = isStatewide ? 'sps' : deriveOrgCode(ws.name);
    orgCode = await ensureUniqueOrgCode(candidate, wsId);
    if (!dryRun) {
      await pool.query(
        `UPDATE workspaces
         SET org_code = $1, org_code_status = 'active',
             org_code_claimed_at = COALESCE(org_code_claimed_at, NOW()), updated_at = NOW()
         WHERE id = $2`,
        [orgCode, wsId]
      );
    }
    repairs.push(`org_code set → "${orgCode}"`);
  } else {
    alreadyOk.push(`org_code: "${orgCode}"`);
  }

  // ── Step 2: email_slug ────────────────────────────────────────────────────
  let emailSlug = ws.email_slug || '';
  if (!emailSlug) {
    const candidate = deriveEmailSlug(orgCode, ws.name);
    emailSlug = await ensureUniqueSlug(candidate, wsId);
    if (!dryRun) {
      await pool.query(
        `UPDATE workspaces SET email_slug = $1, email_domain = 'coaileague.com', updated_at = NOW()
         WHERE id = $2`,
        [emailSlug, wsId]
      );
    }
    repairs.push(`email_slug set → "${emailSlug}"`);
  } else {
    alreadyOk.push(`email_slug: "${emailSlug}"`);
  }

  // ── Step 3: platform_email_addresses + email_routing ─────────────────────
  const { rows: existingAddrs } = await pool.query(
    `SELECT address FROM platform_email_addresses WHERE workspace_id = $1`,
    [wsId]
  );

  const emailAddresses: string[] = [];
  if (existingAddrs.length === 0) {
    if (!dryRun) {
      await emailProvisioningService.provisionWorkspaceAddresses(wsId, emailSlug);
    }
    // Canonical addresses for this slug
    const fns = ['staffing', 'calloffs', 'incidents', 'support', 'docs', 'billing'];
    fns.forEach(fn => emailAddresses.push(`${fn}@${emailSlug}.coaileague.com`));
    repairs.push(`email addresses provisioned: ${emailAddresses.length} addresses under @${emailSlug}.coaileague.com`);
  } else {
    existingAddrs.forEach(r => emailAddresses.push(r.address));
    alreadyOk.push(`email addresses: ${existingAddrs.length} already provisioned`);
  }

  // ── Step 4: workspace_members — ensure root admin has owner role ──────────
  const rootEmail = process.env.ROOT_ADMIN_EMAIL;
  if (rootEmail) {
    const { rows: rootUser } = await pool.query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [rootEmail]
    );
    if (rootUser.length > 0) {
      const rootId = rootUser[0].id;
      const { rows: membership } = await pool.query(
        `SELECT id, workspace_role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [wsId, rootId]
      );
      if (membership.length === 0) {
        if (!dryRun) {
          await pool.query(
            `INSERT INTO workspace_members (workspace_id, user_id, workspace_role, created_at, updated_at)
             VALUES ($1, $2, 'org_owner', NOW(), NOW()) ON CONFLICT DO NOTHING`,
            [wsId, rootId]
          );
        }
        repairs.push(`root admin (${rootEmail}) added as org_owner`);
      } else if (membership[0].workspace_role !== 'org_owner') {
        if (!dryRun) {
          await pool.query(
            `UPDATE workspace_members SET workspace_role = 'org_owner' WHERE workspace_id = $1 AND user_id = $2`,
            [wsId, rootId]
          );
        }
        repairs.push(`root admin role upgraded to org_owner`);
      } else {
        alreadyOk.push(`root admin already org_owner`);
      }
    }
  }

  log.info(`[WorkspaceRepair] ${dryRun ? '[DRY RUN] ' : ''}${wsId} | repairs: ${repairs.length} | ok: ${alreadyOk.length}`);

  return {
    workspaceId: wsId,
    workspaceName: ws.name,
    repairs,
    alreadyOk,
    emailAddresses,
    orgCode,
    emailSlug,
  };
}

// ── POST /repair-identity ─────────────────────────────────────────────────────
router.post('/repair-identity', async (req: Request, res: Response) => {
  const { workspaceId, workspaceName, dryRun = false } = req.body as {
    workspaceId?: string;
    workspaceName?: string;
    dryRun?: boolean;
  };

  if (!workspaceId && !workspaceName) {
    return res.status(400).json({ error: 'Provide workspaceId or workspaceName' });
  }

  try {
    let wsId = workspaceId;

    if (!wsId) {
      const { rows } = await pool.query(
        `SELECT id FROM workspaces WHERE LOWER(name) ILIKE $1 ORDER BY created_at ASC LIMIT 1`,
        [`%${workspaceName!.toLowerCase()}%`]
      );
      if (!rows[0]) {
        return res.status(404).json({
          error: `No workspace found matching "${workspaceName}"`,
          hint: 'Use workspaceId (exact UUID) for precision, or check STATEWIDE_WORKSPACE_ID in Railway vars',
        });
      }
      wsId = rows[0].id;
    }

    const result = await repairWorkspace(wsId!, Boolean(dryRun));

    return res.json({
      success: true,
      dryRun: Boolean(dryRun),
      ...result,
      summary: result.repairs.length > 0
        ? `${result.repairs.length} repair(s) applied${dryRun ? ' (dry run — no DB writes)' : ''}.`
        : 'Workspace was already fully provisioned — nothing to repair.',
      activeEndpoints: result.emailAddresses.map(addr => ({
        address: addr,
        trinityActive: true,
        inboundUrl: `https://coaileague.com/api/inbound/email`,
      })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('[WorkspaceRepair] repair-identity failed:', msg);
    return res.status(500).json({ error: msg });
  }
});

// ── GET /orphan-audit ─────────────────────────────────────────────────────────
// Finds all workspaces missing org_code, email_slug, or email addresses.
// This is the "orphan finder" — run before mass migration to see who needs repair.
router.get('/orphan-audit', async (_req: Request, res: Response) => {
  try {
    // Workspaces missing org_code
    const { rows: missingOrgCode } = await pool.query(
      `SELECT id, name, created_at FROM workspaces
       WHERE org_code IS NULL OR org_code = ''
       ORDER BY created_at DESC LIMIT 50`
    );

    // Workspaces missing email_slug
    const { rows: missingSlug } = await pool.query(
      `SELECT id, name, org_code FROM workspaces
       WHERE email_slug IS NULL OR email_slug = ''
       ORDER BY created_at DESC LIMIT 50`
    );

    // Workspaces with no email addresses provisioned
    const { rows: missingEmails } = await pool.query(
      `SELECT w.id, w.name, w.org_code, w.email_slug
       FROM workspaces w
       WHERE NOT EXISTS (
         SELECT 1 FROM platform_email_addresses pea
         WHERE pea.workspace_id = w.id
       )
       ORDER BY w.created_at DESC LIMIT 50`
    ).catch(() => ({ rows: [] })); // table may not exist yet

    // Workspaces missing state license number (DPS compliance gap)
    const { rows: missingLicense } = await pool.query(
      `SELECT id, name, org_code FROM workspaces
       WHERE state_license_number IS NULL OR state_license_number = ''
       ORDER BY created_at DESC LIMIT 50`
    );

    const orphanIds = new Set([
      ...missingOrgCode.map(r => r.id),
      ...missingSlug.map(r => r.id),
      ...missingEmails.map(r => r.id),
    ]);

    return res.json({
      summary: {
        totalOrphans: orphanIds.size,
        missingOrgCode: missingOrgCode.length,
        missingEmailSlug: missingSlug.length,
        missingEmailAddresses: missingEmails.length,
        missingLicenseNumber: missingLicense.length,
      },
      orphans: {
        missingOrgCode: missingOrgCode.map(r => ({ id: r.id, name: r.name, since: r.created_at })),
        missingEmailSlug: missingSlug.map(r => ({ id: r.id, name: r.name, orgCode: r.org_code })),
        missingEmailAddresses: missingEmails.map(r => ({ id: r.id, name: r.name, emailSlug: r.email_slug })),
        missingLicenseNumber: missingLicense.map(r => ({ id: r.id, name: r.name, orgCode: r.org_code })),
      },
      remediation: orphanIds.size > 0
        ? `POST /api/admin/workspace/repair-all-orphans to fix all ${orphanIds.size} orphan(s) at once.`
        : 'All workspaces are fully provisioned.',
    });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── POST /repair-all-orphans ──────────────────────────────────────────────────
// Bulk-repairs every orphaned workspace. Safe to re-run (idempotent).
// Used during Wave 10 mass migration to ensure all tenants are provisioned.
router.post('/repair-all-orphans', async (req: Request, res: Response) => {
  const { dryRun = false } = req.body as { dryRun?: boolean };

  try {
    // Find all workspaces missing any provisioning step
    const { rows: orphans } = await pool.query(
      `SELECT DISTINCT w.id, w.name
       FROM workspaces w
       WHERE w.org_code IS NULL OR w.email_slug IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM platform_email_addresses pea WHERE pea.workspace_id = w.id
          )
       ORDER BY w.created_at ASC`
    ).catch(async () => {
      // Fallback if platform_email_addresses doesn't exist yet
      const r = await pool.query(
        `SELECT id, name FROM workspaces WHERE org_code IS NULL OR email_slug IS NULL ORDER BY created_at ASC`
      );
      return r;
    });

    const results: Array<{ id: string; name: string; repairs: string[]; error?: string }> = [];

    for (const ws of orphans) {
      try {
        const result = await repairWorkspace(ws.id, Boolean(dryRun));
        results.push({ id: ws.id, name: ws.name, repairs: result.repairs });
      } catch (wsErr: unknown) {
        results.push({ id: ws.id, name: ws.name, repairs: [], error: wsErr instanceof Error ? wsErr.message : String(wsErr) });
      }
    }

    const succeeded = results.filter(r => !r.error).length;
    const failed = results.filter(r => r.error).length;

    return res.json({
      success: failed === 0,
      dryRun: Boolean(dryRun),
      totalProcessed: results.length,
      succeeded,
      failed,
      results,
      summary: `${succeeded}/${results.length} workspaces ${dryRun ? 'would be' : ''} repaired${failed > 0 ? `, ${failed} error(s)` : ''}.`,
    });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
