/**
 * RFP COMPLEXITY SCORING ENGINE
 * ==============================
 * Analyzes an uploaded RFP document or URL and scores it across 13 factors
 * to determine the per-occurrence charge before the tenant commits.
 *
 * Deliberated by Bryan, Claude, and Jack — 2026-04-25.
 *
 * SCORING MODEL:
 *   13 weighted factors → raw score → pricing tier → tenant confirmation → charge fires
 *
 * PRICING TIERS (self-serve):
 *   Score  0–3  → Standard      $500   (simple commercial, single site/state)
 *   Score  4–7  → Professional  $750   (municipal, multi-site 2–5, moderate complexity)
 *   Score  8–12 → Complex       $1,000 (state gov, armed, multi-state, tight deadline)
 *   Score 13+   → Enterprise    $1,500 (federal, union, 10+ sites, rush, heavy burden)
 *
 * CUSTOM QUOTE (above $1,500):
 *   When score >= CUSTOM_QUOTE_THRESHOLD or any single factor hits its max AND
 *   another factor also hits max → Trinity flags for custom pricing instead of
 *   auto-charging. Tenant is directed to contact sales.
 *   Jack recommendation: Enterprise/Strategic tier gets custom quote option.
 *
 * NEVER AUTO-CHARGE: requiresApproval=true on all RFP events. Trinity always
 * presents the calculated price and waits for explicit tenant confirmation.
 *
 * FACTORS (Claude original + Jack additions):
 *   1.  Contract type          (0–3) — commercial → federal
 *   2.  Site count             (0–3) — 1 → 10+
 *   3.  Jurisdiction count     (0–2) — 1 state → 3+ states
 *   4.  Armed/licensing        (0–1) — unarmed vs armed (BSIS, CLEET, TOPS, etc.)
 *   5.  Union/prevailing wage  (0–2) — standard vs Davis-Bacon/CBA
 *   6.  Deadline pressure      (0–3) — 7+ days → same-day (Jack: cap at 3)
 *   7.  Attachment count       (0–2) — <5 → 10+ required docs
 *   8.  Contract volume        (0–2) — officer hours/week bid
 *   9.  Page count             (0–2) — RFP document length (Jack: >50 = +1, >100 = +2)
 *   10. Post orders/site plans (0–1) — requires site-specific deployment plans (Jack)
 *   11. Insurance/bonding      (0–1) — enhanced coverage requirements (Jack)
 *   12. Past performance depth (0–1) — requires detailed capability statements (Jack)
 *   13. Compliance burden      (0–1) — e-Verify, WOSB, SBA, SAM.gov, etc. (Jack)
 *
 * MAX POSSIBLE SCORE: 24
 * CUSTOM QUOTE THRESHOLD: 18 (score so high even Enterprise tier underprices it)
 */

import { createLogger } from '../../lib/logger';

const log = createLogger('rfpComplexityScorer');

// ─── Types ────────────────────────────────────────────────────────────────────

export type RfpContractType =
  | 'commercial'       // Private sector — office buildings, retail, events
  | 'municipal'        // City/county government
  | 'state_gov'        // State agency or institution
  | 'federal';         // Federal agency, GSA, DOD, DHS, etc.

export interface RfpScoringInputs {
  // ── Factor 1: Contract type ───────────────────────────────────────────────
  contractType: RfpContractType;

  // ── Factor 2: Site count ──────────────────────────────────────────────────
  siteCount: number;

  // ── Factor 3: Jurisdiction count ─────────────────────────────────────────
  jurisdictionCount: number;          // Number of distinct states

  // ── Factor 4: Armed/licensing ─────────────────────────────────────────────
  armedRequired: boolean;             // Requires armed guards (BSIS, CLEET, TOPS, Level III)

  // ── Factor 5: Union/prevailing wage ──────────────────────────────────────
  prevailingWage: boolean;            // Davis-Bacon Act, CBA, union shop required
  unionRequired: boolean;             // Explicitly requires union labor

  // ── Factor 6: Deadline pressure ──────────────────────────────────────────
  daysUntilDeadline: number;          // Calendar days until proposal due date

  // ── Factor 7: Attachment count ────────────────────────────────────────────
  attachmentsRequired: number;        // Number of required supporting documents

  // ── Factor 8: Contract volume ─────────────────────────────────────────────
  estimatedOfficerHoursPerWeek: number;

  // ── Factor 9: Page count (Jack addition) ─────────────────────────────────
  rfpPageCount: number;               // Total pages in the RFP document

  // ── Factor 10: Post orders / site plans (Jack addition) ──────────────────
  requiresPostOrders: boolean;        // Each site needs specific post orders / site plans

  // ── Factor 11: Insurance / bonding (Jack addition) ───────────────────────
  enhancedInsuranceRequired: boolean; // Requires coverage above standard GL/WC/umbrella

  // ── Factor 12: Past performance / capability depth (Jack addition) ────────
  requiresDetailedCapabilityStatement: boolean; // Extensive past performance narratives required

  // ── Factor 13: Compliance burden (Jack addition) ─────────────────────────
  highComplianceBurden: boolean;      // SAM.gov, e-Verify, WOSB, SBA 8(a), SDVOSB certification docs
}

export interface RfpScoringBreakdown {
  factor: string;
  raw: number;
  score: number;
  note: string;
}

export type RfpPricingTier = 'standard' | 'professional' | 'complex' | 'enterprise' | 'custom_quote';

export interface RfpComplexityResult {
  /** Total raw score (0–24 max) */
  totalScore: number;
  /** Pricing tier based on score */
  tier: RfpPricingTier;
  /** Price in USD (null if custom_quote) */
  priceUsd: number | null;
  /** Price in cents for Stripe (null if custom_quote) */
  priceCents: number | null;
  /** Human-readable tier label */
  tierLabel: string;
  /** Message Trinity presents to the tenant before charging */
  tenantMessage: string;
  /** Per-factor breakdown for transparency / audit */
  breakdown: RfpScoringBreakdown[];
  /** Whether this requires human sales review instead of self-serve */
  requiresCustomQuote: boolean;
  /** Stripe price env var to use for the charge */
  stripePriceEnvVar: string | null;
}

// ─── Scoring Constants ────────────────────────────────────────────────────────

const TIERS: Array<{ min: number; max: number; tier: RfpPricingTier; label: string; priceUsd: number; stripePriceEnvVar: string }> = [
  { min: 0,  max: 3,  tier: 'standard',     label: 'Standard',     priceUsd: 500,  stripePriceEnvVar: 'STRIPE_PRICE_PREMIUM_RFP_STANDARD'     },
  { min: 4,  max: 7,  tier: 'professional', label: 'Professional', priceUsd: 750,  stripePriceEnvVar: 'STRIPE_PRICE_PREMIUM_RFP_PROFESSIONAL'  },
  { min: 8,  max: 12, tier: 'complex',      label: 'Complex',      priceUsd: 1000, stripePriceEnvVar: 'STRIPE_PRICE_PREMIUM_RFP_COMPLEX'       },
  { min: 13, max: 17, tier: 'enterprise',   label: 'Enterprise',   priceUsd: 1500, stripePriceEnvVar: 'STRIPE_PRICE_PREMIUM_RFP_ENTERPRISE'    },
];

/** Score at or above this always routes to custom quote regardless of tier */
const CUSTOM_QUOTE_THRESHOLD = 18;

// ─── Individual Factor Scorers ────────────────────────────────────────────────

function scoreContractType(t: RfpContractType): RfpScoringBreakdown {
  const map: Record<RfpContractType, number> = { commercial: 0, municipal: 1, state_gov: 2, federal: 3 };
  const score = map[t];
  return {
    factor: 'Contract Type',
    raw: score,
    score,
    note: `${t} contract (0=commercial → 3=federal)`,
  };
}

function scoreSiteCount(n: number): RfpScoringBreakdown {
  const score = n === 1 ? 0 : n <= 5 ? 1 : n <= 10 ? 2 : 3;
  return {
    factor: 'Site Count',
    raw: n,
    score,
    note: `${n} site(s) — score ${score} (1=0, 2–5=1, 6–10=2, 10+=3)`,
  };
}

function scoreJurisdictions(n: number): RfpScoringBreakdown {
  const score = n === 1 ? 0 : n === 2 ? 1 : 2;
  return {
    factor: 'Jurisdiction Count',
    raw: n,
    score,
    note: `${n} state(s) — score ${score}`,
  };
}

function scoreArmed(armed: boolean): RfpScoringBreakdown {
  return {
    factor: 'Armed / Licensing',
    raw: armed ? 1 : 0,
    score: armed ? 1 : 0,
    note: armed
      ? 'Armed guards required — state licensing (BSIS/CLEET/TOPS/DPS) must be addressed'
      : 'Unarmed — standard guard license only',
  };
}

function scoreUnion(prevailingWage: boolean, unionRequired: boolean): RfpScoringBreakdown {
  const score = (prevailingWage || unionRequired) ? 2 : 0;
  const notes: string[] = [];
  if (prevailingWage) notes.push('Davis-Bacon / prevailing wage');
  if (unionRequired)  notes.push('union shop required');
  return {
    factor: 'Union / Prevailing Wage',
    raw: score,
    score,
    note: score > 0 ? notes.join(', ') : 'Standard employment terms',
  };
}

function scoreDeadline(days: number): RfpScoringBreakdown {
  // Jack recommendation: cap at 3 for same-day/24-hour
  const score = days >= 7 ? 0 : days >= 3 ? 1 : days >= 1 ? 2 : 3;
  const label = days >= 7 ? '7+ days' : days >= 3 ? '3–6 days' : days >= 1 ? '1–2 days (rush)' : 'Same-day / < 24 hours';
  return {
    factor: 'Deadline Pressure',
    raw: days,
    score,
    note: `${days} day(s) until deadline — ${label} — score ${score}`,
  };
}

function scoreAttachments(n: number): RfpScoringBreakdown {
  const score = n < 5 ? 0 : n <= 10 ? 1 : 2;
  return {
    factor: 'Attachments Required',
    raw: n,
    score,
    note: `${n} required attachment(s) (<5=0, 5–10=1, 10+=2)`,
  };
}

function scoreVolume(hoursPerWeek: number): RfpScoringBreakdown {
  const score = hoursPerWeek < 200 ? 0 : hoursPerWeek <= 1000 ? 1 : 2;
  return {
    factor: 'Contract Volume (hrs/wk)',
    raw: hoursPerWeek,
    score,
    note: `${hoursPerWeek} officer hrs/wk (<200=0, 200–1000=1, 1000+=2)`,
  };
}

function scorePageCount(pages: number): RfpScoringBreakdown {
  // Jack addition: >50 pages = +1, >100 pages = +2
  const score = pages <= 50 ? 0 : pages <= 100 ? 1 : 2;
  return {
    factor: 'RFP Page Count',
    raw: pages,
    score,
    note: `${pages} pages (≤50=0, 51–100=1, >100=2)`,
  };
}

function scorePostOrders(required: boolean): RfpScoringBreakdown {
  return {
    factor: 'Post Orders / Site Plans',
    raw: required ? 1 : 0,
    score: required ? 1 : 0,
    note: required
      ? 'Site-specific post orders and deployment plans required per location'
      : 'No per-site post orders required',
  };
}

function scoreInsurance(enhanced: boolean): RfpScoringBreakdown {
  return {
    factor: 'Insurance / Bonding',
    raw: enhanced ? 1 : 0,
    score: enhanced ? 1 : 0,
    note: enhanced
      ? 'Enhanced coverage required (above standard GL/WC/umbrella limits)'
      : 'Standard insurance requirements',
  };
}

function scorePastPerformance(detailed: boolean): RfpScoringBreakdown {
  return {
    factor: 'Past Performance / Capability Depth',
    raw: detailed ? 1 : 0,
    score: detailed ? 1 : 0,
    note: detailed
      ? 'Detailed capability statements, past performance narratives, and project references required'
      : 'Standard capability overview',
  };
}

function scoreComplianceBurden(high: boolean): RfpScoringBreakdown {
  return {
    factor: 'Compliance Burden',
    raw: high ? 1 : 0,
    score: high ? 1 : 0,
    note: high
      ? 'Heavy compliance requirements: SAM.gov, e-Verify, SDVOSB/WOSB/8(a) certification, SCA, etc.'
      : 'Standard compliance documentation',
  };
}

// ─── Main Scorer ──────────────────────────────────────────────────────────────

/**
 * Score an RFP across all 13 factors and return the pricing tier + tenant message.
 *
 * Usage:
 *   const inputs = await extractRfpInputsFromDocument(pdfBuffer);
 *   const result = scoreRfpComplexity(inputs);
 *   // Present result.tenantMessage to tenant for confirmation
 *   // If result.requiresCustomQuote === false, charge result.priceCents via Stripe
 */
export function scoreRfpComplexity(inputs: RfpScoringInputs): RfpComplexityResult {
  const breakdown: RfpScoringBreakdown[] = [
    scoreContractType(inputs.contractType),
    scoreSiteCount(inputs.siteCount),
    scoreJurisdictions(inputs.jurisdictionCount),
    scoreArmed(inputs.armedRequired),
    scoreUnion(inputs.prevailingWage, inputs.unionRequired),
    scoreDeadline(inputs.daysUntilDeadline),
    scoreAttachments(inputs.attachmentsRequired),
    scoreVolume(inputs.estimatedOfficerHoursPerWeek),
    scorePageCount(inputs.rfpPageCount),
    scorePostOrders(inputs.requiresPostOrders),
    scoreInsurance(inputs.enhancedInsuranceRequired),
    scorePastPerformance(inputs.requiresDetailedCapabilityStatement),
    scoreComplianceBurden(inputs.highComplianceBurden),
  ];

  const totalScore = breakdown.reduce((sum, f) => sum + f.score, 0);

  // Custom quote: score >= threshold, or federal + union + armed all at max
  const isFederalMaxComplexity =
    inputs.contractType === 'federal' &&
    inputs.unionRequired &&
    inputs.armedRequired &&
    inputs.daysUntilDeadline < 3;

  const requiresCustomQuote = totalScore >= CUSTOM_QUOTE_THRESHOLD || isFederalMaxComplexity;

  if (requiresCustomQuote) {
    log.info(`[RFP Scorer] Custom quote triggered — score ${totalScore} (threshold ${CUSTOM_QUOTE_THRESHOLD})`);
    return {
      totalScore,
      tier: 'custom_quote',
      priceUsd: null,
      priceCents: null,
      tierLabel: 'Custom Quote Required',
      tenantMessage:
        `This RFP has a complexity score of ${totalScore}, which exceeds our standard pricing tiers. ` +
        `Trinity can still generate this proposal — please contact your account manager or email ` +
        `support@coaileague.com for a custom quote. We typically respond within 4 business hours.`,
      breakdown,
      requiresCustomQuote: true,
      stripePriceEnvVar: null,
    };
  }

  const tier = TIERS.find(t => totalScore >= t.min && totalScore <= t.max) ?? TIERS[TIERS.length - 1];

  const tenantMessage =
    `Trinity analyzed your RFP and scored it as a **${tier.label}** proposal ` +
    `(complexity score: ${totalScore}/17). ` +
    `Trinity will generate your complete, branded proposal response for **$${tier.priceUsd}**. ` +
    `The document will be saved to your vault and available for download immediately. ` +
    `Authorize charge to proceed?`;

  log.info(`[RFP Scorer] Score ${totalScore} → ${tier.label} tier → $${tier.priceUsd}`);

  return {
    totalScore,
    tier: tier.tier,
    priceUsd: tier.priceUsd,
    priceCents: tier.priceUsd * 100,
    tierLabel: tier.label,
    tenantMessage,
    breakdown,
    requiresCustomQuote: false,
    stripePriceEnvVar: tier.stripePriceEnvVar,
  };
}

// ─── RFP Input Extractor (Trinity AI extraction from document) ─────────────────
// This is the Gemini-powered extraction step that runs BEFORE the scorer.
// Trinity reads the RFP document and returns structured RfpScoringInputs.

export interface RfpExtractionResult {
  success: boolean;
  inputs?: RfpScoringInputs;
  extractionNotes?: string[];   // Things Trinity flagged as ambiguous
  error?: string;
}

/**
 * Build the Gemini prompt for extracting scoring inputs from an RFP document.
 * The response is structured JSON that maps directly to RfpScoringInputs.
 */
export function buildRfpExtractionPrompt(rfpText: string): string {
  return `You are analyzing a security services RFP document. Extract the following information and return it as a JSON object with exactly these fields. Be conservative — if you are not certain about a field, use the lower/safer value.

RFP DOCUMENT:
${rfpText.slice(0, 12000)}

Return ONLY valid JSON with these exact fields:
{
  "contractType": "commercial" | "municipal" | "state_gov" | "federal",
  "siteCount": number,
  "jurisdictionCount": number,
  "armedRequired": boolean,
  "prevailingWage": boolean,
  "unionRequired": boolean,
  "daysUntilDeadline": number,
  "attachmentsRequired": number,
  "estimatedOfficerHoursPerWeek": number,
  "rfpPageCount": number,
  "requiresPostOrders": boolean,
  "enhancedInsuranceRequired": boolean,
  "requiresDetailedCapabilityStatement": boolean,
  "highComplianceBurden": boolean,
  "extractionNotes": string[]
}

Extraction rules:
- contractType: look for "federal", "FAR", "GSA", "DOD", "DHS" → "federal"; state agency → "state_gov"; city/county → "municipal"; default → "commercial"
- siteCount: count distinct locations/addresses in scope of work
- jurisdictionCount: count distinct states referenced for licensing or operations
- armedRequired: true if "armed", "firearm", "weapon", "Level III", "Level II", state guard license number mentioned
- prevailingWage: true if "Davis-Bacon", "prevailing wage", "wage determination"
- unionRequired: true if "union", "collective bargaining", "CBA", "union shop"
- daysUntilDeadline: calculate from "proposals due" date to today (${new Date().toISOString().split('T')[0]}); default 14 if not found
- attachmentsRequired: count "submit", "provide", "include", "attach" requirements in section headers
- estimatedOfficerHoursPerWeek: parse from staffing plan or hours table; default 168 if not found
- rfpPageCount: estimate from document length — roughly 250 words per page; actual page count if stated
- requiresPostOrders: true if "post orders", "post plan", "site plan", "deployment plan" mentioned
- enhancedInsuranceRequired: true if coverage limits exceed $1M GL / $2M umbrella, or special bonds required
- requiresDetailedCapabilityStatement: true if "past performance", "relevant experience", "capability statement", "project narratives" required
- highComplianceBurden: true if SAM.gov, e-Verify, SDVOSB, WOSB, 8(a), SCA, OSHA certifications required
- extractionNotes: list anything ambiguous or that needs human review`;
}

// ─── Convenience: score from raw text (for API route use) ─────────────────────

/**
 * Full pipeline: extract inputs from RFP text → score → return result.
 * The actual Gemini API call happens in the Trinity action that calls this.
 * This function accepts pre-extracted inputs (after Gemini runs the extraction prompt).
 */
export function buildScoringReport(
  inputs: RfpScoringInputs,
  extractionNotes: string[] = [],
): RfpComplexityResult & { extractionNotes: string[] } {
  const result = scoreRfpComplexity(inputs);
  return { ...result, extractionNotes };
}

// ─── Validation / Test Scenarios ──────────────────────────────────────────────

/** Quick sanity-check scenarios. Run via: npx tsx server/services/billing/rfpComplexityScorer.ts */
if (require.main === module) {
  const scenarios: Array<{ name: string; inputs: RfpScoringInputs }> = [
    {
      name: 'Simple commercial — 1 site, unarmed, 10 days',
      inputs: {
        contractType: 'commercial', siteCount: 1, jurisdictionCount: 1,
        armedRequired: false, prevailingWage: false, unionRequired: false,
        daysUntilDeadline: 10, attachmentsRequired: 3, estimatedOfficerHoursPerWeek: 80,
        rfpPageCount: 20, requiresPostOrders: false, enhancedInsuranceRequired: false,
        requiresDetailedCapabilityStatement: false, highComplianceBurden: false,
      },
    },
    {
      name: 'Municipal — 3 sites, unarmed, tight deadline',
      inputs: {
        contractType: 'municipal', siteCount: 3, jurisdictionCount: 1,
        armedRequired: false, prevailingWage: false, unionRequired: false,
        daysUntilDeadline: 4, attachmentsRequired: 6, estimatedOfficerHoursPerWeek: 300,
        rfpPageCount: 45, requiresPostOrders: true, enhancedInsuranceRequired: false,
        requiresDetailedCapabilityStatement: false, highComplianceBurden: false,
      },
    },
    {
      name: 'State gov — 7 sites, armed, multi-state',
      inputs: {
        contractType: 'state_gov', siteCount: 7, jurisdictionCount: 2,
        armedRequired: true, prevailingWage: false, unionRequired: false,
        daysUntilDeadline: 7, attachmentsRequired: 8, estimatedOfficerHoursPerWeek: 600,
        rfpPageCount: 70, requiresPostOrders: true, enhancedInsuranceRequired: true,
        requiresDetailedCapabilityStatement: true, highComplianceBurden: false,
      },
    },
    {
      name: 'Federal — 12 sites, armed, union, rush, 10+ attachments, SAM.gov',
      inputs: {
        contractType: 'federal', siteCount: 12, jurisdictionCount: 4,
        armedRequired: true, prevailingWage: true, unionRequired: true,
        daysUntilDeadline: 1, attachmentsRequired: 14, estimatedOfficerHoursPerWeek: 1200,
        rfpPageCount: 120, requiresPostOrders: true, enhancedInsuranceRequired: true,
        requiresDetailedCapabilityStatement: true, highComplianceBurden: true,
      },
    },
  ];

  console.log('\nRFP COMPLEXITY SCORING — VALIDATION SCENARIOS\n' + '='.repeat(55));
  for (const s of scenarios) {
    const result = scoreRfpComplexity(s.inputs);
    console.log(`\n${s.name}`);
    console.log(`  Score: ${result.totalScore} → ${result.tierLabel} → ${result.priceUsd ? '$' + result.priceUsd : 'CUSTOM QUOTE'}`);
    console.log(`  Breakdown:`);
    for (const f of result.breakdown) {
      if (f.score > 0) console.log(`    +${f.score}  ${f.factor}: ${f.note}`);
    }
    if (result.requiresCustomQuote) console.log(`  ⚠️  CUSTOM QUOTE REQUIRED`);
  }
}
