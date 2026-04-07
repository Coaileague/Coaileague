/**
 * ORG CODE VALIDATION UTILITY
 * ============================
 * Validates organization codes for email routing.
 * Codes are used in dash-addressing: staffing-ORGCODE@coaileague.com
 *
 * Rules:
 * - 3-12 characters, alphanumeric + underscores only
 * - Case-insensitive (stored uppercase)
 * - No reserved words (platform, support, admin, etc.)
 * - No offensive/inappropriate content
 * - Must be unique across all workspaces
 */

import { db } from '../db';
import { workspaces } from '@shared/schema';
import { eq, sql, and, ne, isNull, or } from 'drizzle-orm';

// Reserved words that cannot be used as org codes (case-insensitive)
const RESERVED_WORDS = [
  // Platform reserved
  'COAI', 'COAILEAGUE', 'PLATFORM', 'ADMIN', 'ROOT', 'SYSTEM',
  'SUPPORT', 'HELP', 'INFO', 'CONTACT', 'SALES', 'BILLING',
  'STAFF', 'STAFFING', 'TRINITY', 'ASSISTANT', 'BOT', 'AI',
  'API', 'WEBHOOK', 'SERVICE', 'INTERNAL', 'DEMO', 'TEST',
  'EXAMPLE', 'SAMPLE', 'DEFAULT', 'NULL', 'UNDEFINED', 'NONE',

  // Security/impersonation prevention
  'SECURITY', 'POLICE', 'FBI', 'CIA', 'NSA', 'DHS', 'ATF', 'DEA',
  'GOVERNMENT', 'FEDERAL', 'STATE', 'COUNTY', 'CITY', 'OFFICIAL',
  'VERIFIED', 'AUTHENTIC', 'REAL', 'LEGIT', 'LEGITIMATE',
  'EXECUTIVE', 'CEO', 'CFO', 'COO', 'CTO', 'PRESIDENT', 'DIRECTOR',

  // Inappropriate/offensive content (minimal set - extended check below)
  'NAZI', 'HITLER', 'KKK', 'RACIST', 'HATE', 'KILL', 'TERROR',
  'ABUSE', 'FRAUD', 'SCAM', 'SPAM', 'PHISH', 'MALWARE', 'HACK',
];

// Regex patterns for offensive content detection
const OFFENSIVE_PATTERNS = [
  /n[i1]gg[ae3]r?/i,
  /f[a4]gg?[o0]t/i,
  /r[e3]t[a4]rd/i,
  /[ck]unt/i,
  /wh[o0]r[e3]/i,
  /sl[u]t/i,
  /b[i1]tch/i,
  /asshole/i,
  /fuck/i,
  /shit/i,
  /sex/i,
  /porn/i,
  /xxx/i,
];

export interface OrgCodeValidationResult {
  valid: boolean;
  normalizedCode?: string;
  error?: string;
  errorCode?: 'INVALID_FORMAT' | 'RESERVED_WORD' | 'OFFENSIVE_CONTENT' | 'ALREADY_TAKEN' | 'TOO_SHORT' | 'TOO_LONG';
}

/**
 * Validate and normalize an org code
 * Does NOT check database uniqueness - use validateOrgCodeAvailability for that
 */
export function validateOrgCodeFormat(code: string): OrgCodeValidationResult {
  if (!code || typeof code !== 'string') {
    return { valid: false, error: 'Org code is required', errorCode: 'INVALID_FORMAT' };
  }

  // Normalize: uppercase, trim whitespace
  const normalizedCode = code.toUpperCase().trim();

  // Length check: 3-12 characters
  if (normalizedCode.length < 3) {
    return { valid: false, error: 'Org code must be at least 3 characters', errorCode: 'TOO_SHORT' };
  }
  if (normalizedCode.length > 12) {
    return { valid: false, error: 'Org code must be at most 12 characters', errorCode: 'TOO_LONG' };
  }

  // Format check: alphanumeric + underscore only, must start with letter
  if (!/^[A-Z][A-Z0-9_]*$/.test(normalizedCode)) {
    return {
      valid: false,
      error: 'Org code must start with a letter and contain only letters, numbers, and underscores',
      errorCode: 'INVALID_FORMAT'
    };
  }

  // Reserved word check
  if (RESERVED_WORDS.includes(normalizedCode)) {
    return { valid: false, error: 'This org code is reserved and cannot be used', errorCode: 'RESERVED_WORD' };
  }

  // Check for reserved word as substring (e.g., "MYCOAI" contains "COAI")
  for (const reserved of RESERVED_WORDS) {
    if (normalizedCode.includes(reserved) || reserved.includes(normalizedCode)) {
      return {
        valid: false,
        error: `Org code contains or matches reserved word "${reserved}"`,
        errorCode: 'RESERVED_WORD'
      };
    }
  }

  // Offensive content check
  for (const pattern of OFFENSIVE_PATTERNS) {
    if (pattern.test(normalizedCode)) {
      return { valid: false, error: 'Org code contains inappropriate content', errorCode: 'OFFENSIVE_CONTENT' };
    }
  }

  return { valid: true, normalizedCode };
}

/**
 * Check if an org code is available in the database
 * Returns the normalized code if available
 */
export async function validateOrgCodeAvailability(
  code: string,
  excludeWorkspaceId?: string
): Promise<OrgCodeValidationResult> {
  // First, validate format
  const formatResult = validateOrgCodeFormat(code);
  if (!formatResult.valid) {
    return formatResult;
  }

  const normalizedCode = formatResult.normalizedCode!;

  // Check database for existing code
  const existing = await db.select({
    id: workspaces.id,
    name: workspaces.name,
    orgCodeStatus: workspaces.orgCodeStatus,
  })
    .from(workspaces)
    .where(
      excludeWorkspaceId
        ? and(
            eq(sql`UPPER(${workspaces.orgCode})`, normalizedCode),
            ne(workspaces.id, excludeWorkspaceId)
          )
        : eq(sql`UPPER(${workspaces.orgCode})`, normalizedCode)
    )
    .limit(1);

  if (existing.length > 0) {
    const existingWs = existing[0];

    // Check if the code was released (can be reclaimed)
    if (existingWs.orgCodeStatus === 'released') {
      // Code is released and can be claimed by anyone
      return { valid: true, normalizedCode };
    }

    return {
      valid: false,
      error: 'This org code is already taken by another organization',
      errorCode: 'ALREADY_TAKEN'
    };
  }

  return { valid: true, normalizedCode };
}

/**
 * Look up a workspace by org code (for inbound email routing)
 */
export async function lookupWorkspaceByOrgCode(code: string): Promise<{
  found: boolean;
  workspaceId?: string;
  workspaceName?: string;
  error?: string;
}> {
  if (!code || typeof code !== 'string') {
    return { found: false, error: 'Invalid org code' };
  }

  const normalizedCode = code.toUpperCase().trim();

  const [workspace] = await db.select({
    id: workspaces.id,
    name: workspaces.name,
    orgCode: workspaces.orgCode,
    orgCodeStatus: workspaces.orgCodeStatus,
    accountState: workspaces.accountState,
    isSuspended: workspaces.isSuspended,
  })
    .from(workspaces)
    .where(
      and(
        eq(sql`UPPER(${workspaces.orgCode})`, normalizedCode),
        or(
          eq(workspaces.orgCodeStatus, 'active'),
          eq(workspaces.orgCodeStatus, 'claimed')
        )
      )
    )
    .limit(1);

  if (!workspace) {
    return { found: false, error: 'Organization not found for this code' };
  }

  // Check if workspace is active
  if (workspace.isSuspended || workspace.accountState === 'suspended') {
    return { found: false, error: 'Organization account is suspended' };
  }

  return {
    found: true,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
  };
}

/**
 * Parse org code from email address.
 * Supports three formats:
 *   Dash format (root):    staffing-ORGCODE@coaileague.com      (legacy/alias)
 *   Plus format (root):    staffing+ORGCODE@coaileague.com      (legacy alternate)
 *   Subdomain format:      staffing@ORGCODE.coaileague.com      (primary going forward)
 *
 * All formats return the ORGCODE portion in uppercase.
 */
export function parseOrgCodeFromEmail(email: string): string | null {
  if (!email || typeof email !== 'string') return null;
  const e = email.toLowerCase().trim();

  // Pattern 1: Subdomain format — fn@slug.coaileague.com
  // Handles: staffing@acme.coaileague.com, calloffs@acme.coaileague.com
  const subdomainMatch = e.match(/^[a-z]+@([a-z0-9_-]+)\.coaileague\.com$/i);
  if (subdomainMatch?.[1]) {
    return subdomainMatch[1].toUpperCase();
  }

  // Pattern 2: Plus-addressing — local+ORGCODE@coaileague.com
  const plusMatch = e.match(/^[^+@]+\+([A-Za-z0-9_]+)@/i);
  if (plusMatch?.[1]) {
    return plusMatch[1].toUpperCase();
  }

  // Pattern 3: Dash format — staffing-ORGCODE@coaileague.com
  const dashMatch = e.match(/^(?:staffing|calloffs|incidents|support|docs|billing|work|jobs|requests)-([A-Za-z0-9_]+)@/i);
  if (dashMatch?.[2]) {
    return dashMatch[2].toUpperCase();
  }
  // Also handle any-function-ORGCODE dash pattern
  const genericDashMatch = e.match(/^[a-z]+-([a-z0-9_]+)@coaileague\.com$/i);
  if (genericDashMatch?.[1]) {
    return genericDashMatch[1].toUpperCase();
  }

  return null;
}

/**
 * Parse the email function (staffing, calloffs, incidents, etc.)
 * and workspace email slug from any supported address format.
 * Returns null if address doesn't match a known workspace pattern.
 */
export function parseEmailFunctionAndSlug(email: string): { fn: string; slug: string } | null {
  if (!email || typeof email !== 'string') return null;
  const e = email.toLowerCase().trim();

  // Subdomain format: fn@slug.coaileague.com
  const subdomainMatch = e.match(/^([a-z]+)@([a-z0-9_-]+)\.coaileague\.com$/);
  if (subdomainMatch) {
    return { fn: subdomainMatch[1], slug: subdomainMatch[2] };
  }

  // Dash format: fn-slug@coaileague.com
  const dashMatch = e.match(/^([a-z]+)-([a-z0-9_-]+)@coaileague\.com$/);
  if (dashMatch) {
    return { fn: dashMatch[1], slug: dashMatch[2] };
  }

  return null;
}

/**
 * Lookup a workspace by email slug (the subdomain portion of their email addresses).
 * e.g., slug = "acme" for acme.coaileague.com addresses.
 */
export async function lookupWorkspaceByEmailSlug(
  slug: string
): Promise<{ found: boolean; workspaceId?: string; workspaceName?: string; error?: string }> {
  if (!slug) return { found: false, error: 'No slug provided' };

  // email_slug is not in the Drizzle schema — use raw SQL
  const { pool: rawPool } = await import('../db');
  const { rows } = await rawPool.query(
    `SELECT id, name, is_suspended, account_state FROM workspaces WHERE email_slug = $1 LIMIT 1`,
    [slug.toLowerCase()]
  );
  const workspace = rows[0];
  if (!workspace) return { found: false, error: 'No workspace found for this email domain' };
  if (workspace.is_suspended || workspace.account_state === 'suspended') {
    return { found: false, error: 'Organization account is suspended' };
  }

  return { found: true, workspaceId: workspace.id, workspaceName: workspace.name };
}

/**
 * Claim an org code for a workspace (sets it as active)
 */
export async function claimOrgCode(
  workspaceId: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  // Validate availability
  const validation = await validateOrgCodeAvailability(code, workspaceId);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // Update workspace with new org code
  await db.update(workspaces)
    .set({
      orgCode: validation.normalizedCode,
      orgCodeStatus: 'active',
      orgCodeClaimedAt: new Date(),
      orgCodeReleasedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, workspaceId));

  return { success: true };
}

/**
 * Release an org code (when workspace is cancelled)
 * The code becomes available for others to claim
 */
export async function releaseOrgCode(workspaceId: string): Promise<void> {
  await db.update(workspaces)
    .set({
      orgCodeStatus: 'released',
      orgCodeReleasedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, workspaceId));
}
