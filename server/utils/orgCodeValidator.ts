/**
 * ORG CODE VALIDATION UTILITY
 * ============================
 * Validates organization codes for email routing.
 * Codes are used as the subdomain in email addresses: staffing@{orgcode}.coaileague.com
 *
 * Rules:
 * - 2-6 characters, alphanumeric only (NO underscores — email subdomains don't support them)
 * - Case-insensitive (stored lowercase for DNS compatibility)
 * - No reserved words (platform, support, admin, etc.)
 * - No offensive/inappropriate content
 * - Must be unique across all workspaces
 */

import { db } from '../db';
import { workspaces } from '@shared/schema';
import { eq, sql, and, ne, isNull, or } from 'drizzle-orm';

// Reserved words that cannot be used as org codes (case-insensitive, compared lowercase)
const RESERVED_WORDS = [
  // Platform reserved
  'coai', 'coaileague', 'platform', 'admin', 'root', 'system',
  'support', 'help', 'info', 'contact', 'sales', 'billing',
  'staff', 'staffing', 'trinity', 'assistant', 'bot', 'ai',
  'api', 'webhook', 'service', 'internal', 'demo', 'test',
  'example', 'sample', 'default', 'null', 'undefined', 'none',

  // Security/impersonation prevention
  'security', 'police', 'fbi', 'cia', 'nsa', 'dhs', 'atf', 'dea',
  'government', 'federal', 'state', 'county', 'city', 'official',
  'verified', 'authentic', 'real', 'legit', 'legitimate',
  'executive', 'ceo', 'cfo', 'coo', 'cto', 'president', 'director',

  // Inappropriate/offensive content (minimal set - extended check below)
  'nazi', 'hitler', 'kkk', 'racist', 'hate', 'kill', 'terror',
  'abuse', 'fraud', 'scam', 'spam', 'phish', 'malware', 'hack',
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

  // Normalize: lowercase (subdomains are lowercase by convention), strip non-alphanumeric
  const normalizedCode = code.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Length check: 2-6 characters
  if (normalizedCode.length < 2) {
    return { valid: false, error: 'Org code must be at least 2 characters', errorCode: 'TOO_SHORT' };
  }
  if (normalizedCode.length > 6) {
    return { valid: false, error: 'Org code must be 6 characters or fewer', errorCode: 'TOO_LONG' };
  }

  // Format check: alphanumeric only, must start with letter (DNS subdomain rule)
  if (!/^[a-z][a-z0-9]*$/.test(normalizedCode)) {
    return {
      valid: false,
      error: 'Org code must start with a letter and contain only letters and numbers',
      errorCode: 'INVALID_FORMAT'
    };
  }

  // Reserved word check (exact match)
  if (RESERVED_WORDS.includes(normalizedCode)) {
    return { valid: false, error: 'This org code is reserved and cannot be used', errorCode: 'RESERVED_WORD' };
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

  // Check database for existing code (case-insensitive match)
  const existing = await db.select({
    id: workspaces.id,
    name: workspaces.name,
    orgCodeStatus: workspaces.orgCodeStatus,
  })
    .from(workspaces)
    .where(
      excludeWorkspaceId
        ? and(
            eq(sql`LOWER(${workspaces.orgCode})`, normalizedCode),
            ne(workspaces.id, excludeWorkspaceId)
          )
        : eq(sql`LOWER(${workspaces.orgCode})`, normalizedCode)
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

  const normalizedCode = code.toLowerCase().replace(/[^a-z0-9]/g, '');

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
        eq(sql`LOWER(${workspaces.orgCode})`, normalizedCode),
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
 *   Dash format (root):    staffing-orgcode@coaileague.com      (legacy/alias)
 *   Plus format (root):    staffing+orgcode@coaileague.com      (legacy alternate)
 *   Subdomain format:      staffing@orgcode.coaileague.com      (primary going forward)
 *
 * All formats return the orgcode portion in lowercase.
 */
export function parseOrgCodeFromEmail(email: string): string | null {
  if (!email || typeof email !== 'string') return null;
  const e = email.toLowerCase().trim();

  // Pattern 1: Subdomain format — fn@slug.coaileague.com
  // Handles: staffing@acme.coaileague.com, calloffs@acme.coaileague.com
  const subdomainMatch = e.match(/^[a-z]+@([a-z0-9_-]+)\.coaileague\.com$/i);
  if (subdomainMatch?.[1]) {
    return subdomainMatch[1].toLowerCase();
  }

  // Pattern 2: Plus-addressing — local+orgcode@coaileague.com
  const plusMatch = e.match(/^[^+@]+\+([A-Za-z0-9_]+)@/i);
  if (plusMatch?.[1]) {
    return plusMatch[1].toLowerCase();
  }

  // Pattern 3: Dash format — staffing-orgcode@coaileague.com
  const dashMatch = e.match(/^(?:staffing|calloffs|incidents|support|docs|billing|work|jobs|requests)-([A-Za-z0-9_]+)@/i);
  if (dashMatch?.[1]) {
    return dashMatch[1].toLowerCase();
  }
  // Also handle any-function-orgcode dash pattern
  const genericDashMatch = e.match(/^[a-z]+-([a-z0-9_]+)@coaileague\.com$/i);
  if (genericDashMatch?.[1]) {
    return genericDashMatch[1].toLowerCase();
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

/**
 * Auto-generate a 2-6 char org code from company name.
 * Uses initials of significant words (skips: Inc, LLC, Corp, Services, Security, etc.)
 *
 * Examples:
 *   "Statewide Protective Services" → "sps"
 *   "Allied Universal Security" → "aus"
 *   "Texas Private Security Inc" → "tps"
 *   "Acme Corp" → "acme" (short enough to use directly)
 */
export function generateOrgCodeFromName(companyName: string): string {
  const SKIP_WORDS = new Set([
    'inc', 'llc', 'corp', 'ltd', 'co', 'company', 'group', 'holdings',
    'services', 'security', 'solutions', 'protection', 'protective',
    'management', 'enterprises', 'associates', 'international', 'national',
    'the', 'and', 'of', 'a', 'an',
  ]);

  const words = companyName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 0 && !SKIP_WORDS.has(w));

  if (words.length === 0) {
    // Fallback: first 4 chars of cleaned name
    return companyName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4) || 'org';
  }

  // If one word and it's short — use it directly
  if (words.length === 1 && words[0].length <= 6) {
    return words[0].slice(0, 6);
  }

  // Take first letter of each significant word
  const initials = words.map(w => w[0]).join('');

  // If initials are 2-6 chars — perfect
  if (initials.length >= 2 && initials.length <= 6) {
    return initials;
  }

  // Too short — use first word's first 3 chars + second word's first char
  if (initials.length < 2) {
    return (words[0].slice(0, 3) + (words[1]?.[0] || '')).slice(0, 6);
  }

  // Too long — take first 4 initials
  return initials.slice(0, 4);
}

/**
 * Generate a unique org code, appending number if taken.
 * "sps" → if taken → "sps2" → "sps3" etc.
 * Guaranteed to return a valid, available code or a random fallback.
 */
export async function generateUniqueOrgCode(companyName: string): Promise<string> {
  const base = generateOrgCodeFromName(companyName);

  // Check if base is available
  const validation = await validateOrgCodeAvailability(base);
  if (validation.valid) return validation.normalizedCode || base;

  // Try appending 2, 3, 4...
  for (let i = 2; i <= 9; i++) {
    const candidate = `${base.slice(0, 5)}${i}`;
    const check = await validateOrgCodeAvailability(candidate);
    if (check.valid) return check.normalizedCode || candidate;
  }

  // Last resort — base prefix + 3 random chars
  const rand = Math.random().toString(36).slice(2, 5);
  return `${base.slice(0, 3)}${rand}`.slice(0, 6);
}
