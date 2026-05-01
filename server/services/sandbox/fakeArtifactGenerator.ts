/**
 * Fake Artifact Generator — ACME Sandbox
 * =======================================
 * Generates clearly-marked synthetic documents for the regulatory-auditor
 * walk-through. Every artifact is plastered with a "FAKE — SIMULATION ONLY"
 * watermark, the seeded ACME workspace ID, and the run timestamp so they
 * are impossible to confuse with real records.
 *
 * Output formats are intentionally dependency-free: SVG (for IDs / photos /
 * badges) and structured JSON / Markdown (for contracts / financials). They
 * are written to disk under `artifacts/acme-sandbox/` and registered as
 * rows in `sandbox_fake_artifacts` so the auditor login can list them via
 * the `/api/sandbox/acme/artifacts` endpoint.
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pool } from '../../db';
import { createLogger } from '../../lib/logger';

const log = createLogger('FakeArtifactGenerator');

export const ARTIFACT_ROOT = path.resolve(process.cwd(), 'artifacts', 'acme-sandbox');

const WATERMARK_BANNER = '⚠ FAKE — SIMULATION ONLY — NOT A LEGAL DOCUMENT ⚠';

export interface FakeArtifact {
  id: string;
  workspaceId: string;
  artifactType: 'fake_id' | 'fake_contract' | 'fake_financial' | 'fake_photo' | 'fake_badge';
  title: string;
  diskPath: string;
  publicUrl: string;
  mimeType: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

let bootstrapped = false;
async function ensureTable(): Promise<void> {
  if (bootstrapped) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sandbox_fake_artifacts (
      id            VARCHAR PRIMARY KEY,
      workspace_id  VARCHAR NOT NULL,
      artifact_type VARCHAR NOT NULL,
      title         VARCHAR NOT NULL,
      disk_path     TEXT NOT NULL,
      public_url    TEXT NOT NULL,
      mime_type     VARCHAR NOT NULL,
      metadata      JSONB,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS sandbox_fake_artifacts_ws_idx
      ON sandbox_fake_artifacts(workspace_id);
    CREATE INDEX IF NOT EXISTS sandbox_fake_artifacts_type_idx
      ON sandbox_fake_artifacts(artifact_type);
  `);
  bootstrapped = true;
}

async function persistArtifact(a: Omit<FakeArtifact, 'createdAt'>): Promise<FakeArtifact> {
  await ensureTable();
  await pool.query(
    `INSERT INTO sandbox_fake_artifacts
       (id, workspace_id, artifact_type, title, disk_path, public_url, mime_type, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       title       = EXCLUDED.title,
       disk_path   = EXCLUDED.disk_path,
       public_url  = EXCLUDED.public_url,
       mime_type   = EXCLUDED.mime_type,
       metadata    = EXCLUDED.metadata`,
    [a.id, a.workspaceId, a.artifactType, a.title, a.diskPath, a.publicUrl, a.mimeType, a.metadata]
  );
  return { ...a, createdAt: new Date() };
}

function svgEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Loud, unambiguous SVG ID card. The watermark crosses the entire card on a
 * 30° diagonal so it reproduces in any photocopy / screenshot.
 */
function buildFakeIdCardSvg(opts: {
  fullName: string;
  empNum: string;
  role: string;
  expiresAt: string;
  workspaceId: string;
  runStamp: string;
  photoSeed: string;
}): string {
  const initials = opts.fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const colorHash = crypto.createHash('sha1').update(opts.photoSeed).digest('hex').slice(0, 6);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 340" width="540" height="340">
  <rect width="540" height="340" fill="#0d1b2a" rx="14"/>
  <rect x="8" y="8" width="524" height="324" fill="#1b263b" rx="10" stroke="#ff3366" stroke-width="3" stroke-dasharray="8 6"/>
  <rect x="20" y="20" width="500" height="36" fill="#ff3366"/>
  <text x="270" y="46" font-family="monospace" font-size="20" fill="#fff" text-anchor="middle" font-weight="bold">${svgEscape(WATERMARK_BANNER)}</text>
  <text x="270" y="80" font-family="sans-serif" font-size="14" fill="#aab7c4" text-anchor="middle">ACME SECURITY SERVICES — SANDBOX BADGE</text>
  <circle cx="92" cy="180" r="56" fill="#${colorHash}"/>
  <text x="92" y="195" font-family="sans-serif" font-size="40" fill="#fff" text-anchor="middle" font-weight="bold">${svgEscape(initials)}</text>
  <text x="170" y="140" font-family="sans-serif" font-size="22" fill="#fff" font-weight="bold">${svgEscape(opts.fullName)}</text>
  <text x="170" y="170" font-family="sans-serif" font-size="14" fill="#aab7c4">Officer #: ${svgEscape(opts.empNum)}</text>
  <text x="170" y="190" font-family="sans-serif" font-size="14" fill="#aab7c4">Role: ${svgEscape(opts.role)}</text>
  <text x="170" y="210" font-family="sans-serif" font-size="14" fill="#aab7c4">TX-PSP: SIM-${svgEscape(opts.empNum)}</text>
  <text x="170" y="230" font-family="sans-serif" font-size="14" fill="#aab7c4">Expires: ${svgEscape(opts.expiresAt)}</text>
  <text x="20" y="316" font-family="monospace" font-size="11" fill="#ff3366">Workspace: ${svgEscape(opts.workspaceId)}  Run: ${svgEscape(opts.runStamp)}</text>
  <g transform="rotate(-30 270 170)" opacity="0.18">
    <text x="270" y="170" font-family="sans-serif" font-size="60" fill="#ff3366" text-anchor="middle" font-weight="bold">FAKE • DEMO • FAKE • DEMO</text>
  </g>
</svg>`;
}

function buildFakePhotoSvg(opts: { caption: string; workspaceId: string; runStamp: string; seed: string }): string {
  const h = crypto.createHash('sha1').update(opts.seed).digest('hex');
  const c1 = `#${h.slice(0, 6)}`;
  const c2 = `#${h.slice(6, 12)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="500" fill="url(#g)"/>
  <rect x="0" y="0" width="800" height="48" fill="#000" opacity="0.65"/>
  <text x="400" y="32" font-family="monospace" font-size="20" fill="#ff3366" text-anchor="middle" font-weight="bold">${svgEscape(WATERMARK_BANNER)}</text>
  <text x="400" y="260" font-family="sans-serif" font-size="36" fill="#fff" text-anchor="middle" font-weight="bold">${svgEscape(opts.caption)}</text>
  <text x="400" y="300" font-family="sans-serif" font-size="16" fill="#fff" text-anchor="middle">Procedurally generated placeholder image</text>
  <text x="20" y="488" font-family="monospace" font-size="11" fill="#fff">Workspace: ${svgEscape(opts.workspaceId)}  Run: ${svgEscape(opts.runStamp)}</text>
  <g transform="rotate(-25 400 250)" opacity="0.22">
    <text x="400" y="250" font-family="sans-serif" font-size="120" fill="#fff" text-anchor="middle" font-weight="bold">FAKE</text>
  </g>
</svg>`;
}

interface BuildContext {
  workspaceId: string;
  runStamp: string;
}

async function writeArtifact(
  ctx: BuildContext,
  subdir: string,
  filename: string,
  body: string,
  meta: Omit<FakeArtifact, 'id' | 'createdAt' | 'diskPath' | 'publicUrl'>
): Promise<FakeArtifact> {
  const dir = path.join(ARTIFACT_ROOT, subdir);
  await fs.mkdir(dir, { recursive: true });
  const diskPath = path.join(dir, filename);
  await fs.writeFile(diskPath, body, 'utf8');
  const id = `fake-${meta.artifactType}-${crypto
    .createHash('sha1')
    .update(`${ctx.workspaceId}:${filename}`)
    .digest('hex')
    .slice(0, 16)}`;
  const publicUrl = `/api/sandbox/acme/artifacts/${id}`;
  return persistArtifact({ ...meta, id, diskPath, publicUrl });
}

export async function generateAcmeFakeArtifactSet(ctx: BuildContext): Promise<FakeArtifact[]> {
  const out: FakeArtifact[] = [];

  // ── 1. Fake employee IDs (10 officers, matches seed-acme-full.ts) ─────────
  const officers = [
    { name: 'Marcus Rodriguez',  empNum: 'ACM-001', role: 'Site Supervisor (TX-Lvl-III Armed)' },
    { name: 'Jennifer Torres',   empNum: 'ACM-002', role: 'Operations Manager' },
    { name: 'David Kim',         empNum: 'ACM-003', role: 'Security Officer (Unarmed)' },
    { name: 'Alicia Brown',      empNum: 'ACM-004', role: 'Security Officer (Unarmed)' },
    { name: 'Robert Washington', empNum: 'ACM-005', role: 'Senior Officer (TX-Lvl-III Armed)' },
    { name: 'Carmen Lopez',      empNum: 'ACM-006', role: 'Security Officer (Unarmed)' },
    { name: 'Anthony Johnson',   empNum: 'ACM-007', role: 'Dispatcher' },
    { name: 'Nicole Davis',      empNum: 'ACM-008', role: 'HR Coordinator' },
    { name: 'Kevin Smith',       empNum: 'ACM-009', role: 'Security Officer (Unarmed)' },
    { name: 'Maria Garcia',      empNum: 'ACM-010', role: 'Security Officer (Unarmed)' },
  ];

  for (const o of officers) {
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    const svg = buildFakeIdCardSvg({
      fullName: o.name,
      empNum: o.empNum,
      role: o.role,
      expiresAt: expires.toISOString().slice(0, 10),
      workspaceId: ctx.workspaceId,
      runStamp: ctx.runStamp,
      photoSeed: o.empNum,
    });
    out.push(
      await writeArtifact(ctx, 'ids', `${o.empNum}-fake-id.svg`, svg, {
        workspaceId: ctx.workspaceId,
        artifactType: 'fake_id',
        title: `Fake ID — ${o.name} (${o.empNum})`,
        mimeType: 'image/svg+xml',
        metadata: { officer: o.name, empNum: o.empNum, role: o.role, isFake: true },
      })
    );
  }

  // ── 2. Fake post-photos for each client site ──────────────────────────────
  const sites = [
    'Pacific Medical Center — Main Lobby',
    'Westside Shopping Mall — North Atrium',
    'TechHub Corporate Campus — Loading Dock',
    'LA Metro Transit Authority — Platform B',
    'Sunset Luxury Apartments — Pool Deck',
  ];
  for (const site of sites) {
    const svg = buildFakePhotoSvg({
      caption: site,
      workspaceId: ctx.workspaceId,
      runStamp: ctx.runStamp,
      seed: site,
    });
    const slug = site.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
    out.push(
      await writeArtifact(ctx, 'photos', `site-${slug}.svg`, svg, {
        workspaceId: ctx.workspaceId,
        artifactType: 'fake_photo',
        title: `Fake site photo — ${site}`,
        mimeType: 'image/svg+xml',
        metadata: { site, isFake: true },
      })
    );
  }

  // ── 3. Fake master service contract ───────────────────────────────────────
  const contract = `# ⚠ FAKE — SIMULATION ONLY — NOT A LEGAL DOCUMENT ⚠

# MASTER SECURITY SERVICES AGREEMENT  (DEMO COPY)

**Workspace:** ${ctx.workspaceId}
**Run stamp:** ${ctx.runStamp}
**Generated by:** ACME Sandbox Simulation

---

This document is a procedurally generated placeholder used to walk a
regulatory auditor through the platform's compliance flow. Every clause,
party name, EIN, and dollar amount is fabricated. No party signed this.

## Parties (FICTITIOUS)

- **Provider:** Acme Security Services LLC (DEMO) — Texas EIN: 99-9999999 (FAKE)
- **Client:**   Pacific Medical Center (DEMO) — Texas Reg: TX-DEMO-0001 (FAKE)

## Scope of services (sample)

| Site | Coverage | Bill rate | Pay rate | Notes |
| --- | --- | --- | --- | --- |
| PMC Main Lobby | 24/7 unarmed | \$40.00/hr | \$20.00/hr | Trinity-staffed |
| PMC ER Entrance | Mon–Fri 18:00–06:00 armed (Lvl III) | \$60.00/hr | \$30.00/hr | License gate active |

## Pricing math (simulated)

- Standard bill rate: \$40.00/hr
- Officer pay rate:   \$20.00/hr
- Stripe processing:  2.9% + \$0.30 per charge
- Platform fee:       3.0% of subtotal
- Tax withholding:    FICA 7.65%, FUTA 0.6%, SUTA 2.7% (sample)

## Termination

This agreement self-destructs the instant the simulation harness is reseeded.

---

*Document generated ${new Date().toISOString()} by ACME Sandbox Simulation.*
*WATERMARK: ${WATERMARK_BANNER}*
`;
  out.push(
    await writeArtifact(ctx, 'contracts', 'pmc-master-services-FAKE.md', contract, {
      workspaceId: ctx.workspaceId,
      artifactType: 'fake_contract',
      title: 'Fake master services agreement (Pacific Medical Center)',
      mimeType: 'text/markdown',
      metadata: { client: 'Pacific Medical Center', isFake: true },
    })
  );

  // ── 4. Fake financial snapshot — what an auditor would skim ───────────────
  const financials = {
    _watermark: WATERMARK_BANNER,
    _disclaimer: 'Every figure below is procedurally generated. No money moved.',
    workspaceId: ctx.workspaceId,
    runStamp: ctx.runStamp,
    period: '2026-04 (synthetic)',
    revenue: {
      grossInvoiced: 26880.0,
      collected: 20160.0,
      outstanding: 6720.0,
      stripeFees: 779.65,
      platformFees: 806.4,
    },
    payroll: {
      grossWages: 13440.0,
      overtimePremium: 240.0,
      employerFICA: 1027.66,
      employerFUTA: 80.64,
      employerSUTA: 362.88,
      netDisbursed: 10453.32,
    },
    netMargin: {
      grossMargin: 13440.0,
      afterFees: 11854.0,
      afterEmployerTaxes: 10383.0,
      marginPct: 38.6,
      note: 'Computed AFTER processing + employer taxes. Matches §3 audit math.',
    },
    bankBalances: [
      { account: 'Operating (Plaid sandbox)',   balance: 84210.55, lastSync: ctx.runStamp },
      { account: 'Payroll (Plaid sandbox)',     balance: 22487.10, lastSync: ctx.runStamp },
      { account: 'Tax Reserve (Plaid sandbox)', balance:  4112.83, lastSync: ctx.runStamp },
    ],
  };
  out.push(
    await writeArtifact(
      ctx,
      'financials',
      'acme-2026-04-snapshot-FAKE.json',
      JSON.stringify(financials, null, 2),
      {
        workspaceId: ctx.workspaceId,
        artifactType: 'fake_financial',
        title: 'Fake monthly financial snapshot (April 2026 demo)',
        mimeType: 'application/json',
        metadata: { period: '2026-04', isFake: true },
      }
    )
  );

  // ── 5. Fake company ID badge for the auditor's "audit pack" cover ────────
  const cover = buildFakeIdCardSvg({
    fullName: 'ACME SECURITY SVCS',
    empNum: 'COVER-PAGE',
    role: 'Audit Pack Cover',
    expiresAt: 'never (demo)',
    workspaceId: ctx.workspaceId,
    runStamp: ctx.runStamp,
    photoSeed: 'audit-cover',
  });
  out.push(
    await writeArtifact(ctx, 'ids', 'AUDIT-PACK-COVER-FAKE.svg', cover, {
      workspaceId: ctx.workspaceId,
      artifactType: 'fake_badge',
      title: 'Fake audit pack cover badge',
      mimeType: 'image/svg+xml',
      metadata: { isFake: true },
    })
  );

  log.info(`[FakeArtifactGenerator] Wrote ${out.length} clearly-fake artifacts`);
  return out;
}

export async function listFakeArtifacts(workspaceId: string): Promise<FakeArtifact[]> {
  await ensureTable();
  const r = await pool.query(
    `SELECT id, workspace_id, artifact_type, title, disk_path, public_url, mime_type, metadata, created_at
       FROM sandbox_fake_artifacts
      WHERE workspace_id = $1
      ORDER BY artifact_type, title`,
    [workspaceId]
  );
  return r.rows.map(r => ({
    id: r.id,
    workspaceId: r.workspace_id,
    artifactType: r.artifact_type,
    title: r.title,
    diskPath: r.disk_path,
    publicUrl: r.public_url,
    mimeType: r.mime_type,
    metadata: r.metadata || {},
    createdAt: r.created_at,
  }));
}

export async function getFakeArtifact(id: string): Promise<FakeArtifact | null> {
  await ensureTable();
  const r = await pool.query(
    `SELECT id, workspace_id, artifact_type, title, disk_path, public_url, mime_type, metadata, created_at
       FROM sandbox_fake_artifacts WHERE id = $1`,
    [id]
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    artifactType: row.artifact_type,
    title: row.title,
    diskPath: row.disk_path,
    publicUrl: row.public_url,
    mimeType: row.mime_type,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}
