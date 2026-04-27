/**
 * Seeds the regulatory_rules table with core statutes for security companies.
 * Safe to run multiple times — checks row count first and skips if already seeded.
 *
 * Run standalone: npx tsx server/scripts/seedRegulatoryRules.ts
 * Run via Railway: railway run npx tsx server/scripts/seedRegulatoryRules.ts
 *
 * Also called automatically at server startup by ensureRegulatoryRules() in
 * legacyBootstrapRegistry if the table is empty.
 */
import { db } from '../db';
import { regulatoryRules } from '@shared/schema';
import { sql } from 'drizzle-orm';

const today = new Date().toISOString().split('T')[0];

const CORE_RULES = [
  // ── Texas Occupations Code Chapter 1702 ────────────────────────────────────
  {
    state: 'TX', category: 'licensing',
    ruleName: 'Tex. Occ. Code § 1702.101 — License Required',
    ruleText: 'A person may not act as an investigations company or security services contractor unless the person holds a license issued under this chapter.',
    plainEnglishSummary: 'Every security company in Texas must hold a valid license from DPS Private Security Bureau (PSB). Operating without a license is a criminal offense.',
    statuteReference: 'Tex. Occ. Code § 1702.101',
    severity: 'blocking',
    lastVerified: today,
  },
  {
    state: 'TX', category: 'licensing',
    ruleName: 'Tex. Occ. Code § 1702.222 — Guard Company License (Class C)',
    ruleText: 'A guard company license (Class C) authorizes a person to engage in the business of providing security guard services.',
    plainEnglishSummary: 'A Class C license is required to run a security guard company in Texas. Individual guards need separate registration.',
    statuteReference: 'Tex. Occ. Code § 1702.222',
    severity: 'blocking',
    lastVerified: today,
  },
  {
    state: 'TX', category: 'licensing',
    ruleName: 'Tex. Occ. Code § 1702.321 — Individual Guard Registration',
    ruleText: 'A person must hold a security officer commission or personal protection officer license to perform security services as an individual.',
    plainEnglishSummary: 'Every individual security officer in Texas must be registered with DPS and hold a valid guard card. Employers must verify registration before assignment.',
    statuteReference: 'Tex. Occ. Code § 1702.321',
    severity: 'blocking',
    lastVerified: today,
  },
  {
    state: 'TX', category: 'licensing',
    ruleName: 'Tex. Occ. Code § 1702.1675 — Training Hours (Level II)',
    ruleText: 'A person applying for a security officer commission must complete at least 6 hours of classroom instruction and training plus additional hours for armed officers.',
    plainEnglishSummary: 'Level II (unarmed) requires 6 hours training minimum. Level III (armed) requires additional firearm proficiency qualification. Training must be completed before assignment.',
    statuteReference: 'Tex. Occ. Code § 1702.1675',
    severity: 'warning',
    lastVerified: today,
  },
  // ── Texas Penal Code ────────────────────────────────────────────────────────
  {
    state: 'TX', category: 'penal',
    ruleName: 'Tex. Penal Code § 9.31 — Self-Defense',
    ruleText: "A person is justified in using force against another when and to the degree the actor reasonably believes the force is immediately necessary to protect the actor against the other's use or attempted use of unlawful force.",
    plainEnglishSummary: 'Security officers may use force in self-defense when reasonably necessary. Force must be proportional to the threat. Deadly force requires additional justification (§9.32).',
    statuteReference: 'Tex. Penal Code § 9.31',
    severity: 'informational',
    lastVerified: today,
  },
  {
    state: 'TX', category: 'penal',
    ruleName: "Tex. Penal Code § 9.43 — Protection of Third Person's Property",
    ruleText: 'A person is justified in using force or deadly force against another to protect land or tangible, movable property of a third person if, under the circumstances as he reasonably believes them to be, the actor would be justified in using force or deadly force to protect his own land or property.',
    plainEnglishSummary: "Security officers protecting client property have the same use-of-force justification as property owners. This is the primary legal basis for security officer authority on client sites.",
    statuteReference: 'Tex. Penal Code § 9.43',
    severity: 'informational',
    lastVerified: today,
  },
  {
    state: 'TX', category: 'penal',
    ruleName: 'Tex. Penal Code § 30.05 — Criminal Trespass',
    ruleText: 'A person commits an offense if the person enters or remains on or in property of another without effective consent and the person had notice that the entry was forbidden or received notice to depart but failed to do so.',
    plainEnglishSummary: 'Security officers can direct unauthorized persons to leave and involve law enforcement if they refuse. Verbal notice is sufficient to establish trespass.',
    statuteReference: 'Tex. Penal Code § 30.05',
    severity: 'informational',
    lastVerified: today,
  },
  // ── Texas Labor Code ────────────────────────────────────────────────────────
  {
    state: 'TX', category: 'employment',
    ruleName: 'Tex. Labor Code § 61.011 — Payday Law',
    ruleText: 'An employer shall pay wages to each employee who is exempt from overtime pay at least once per month; to each employee who is not exempt, at least twice per month.',
    plainEnglishSummary: 'Texas requires non-exempt (hourly) employees to be paid at least semi-monthly. Semi-monthly pay periods (1st–15th, 16th–EOM) are compliant.',
    statuteReference: 'Tex. Labor Code § 61.011',
    severity: 'blocking',
    lastVerified: today,
  },
  {
    state: 'TX', category: 'employment',
    ruleName: 'Tex. Labor Code § 62.051 — Minimum Wage',
    ruleText: 'An employer shall pay to each employee the federal minimum wage or higher.',
    plainEnglishSummary: 'Texas follows the federal minimum wage ($7.25/hr as of 2024). Security officers must earn at least this amount.',
    statuteReference: 'Tex. Labor Code § 62.051',
    severity: 'blocking',
    lastVerified: today,
  },
  // ── Federal ─────────────────────────────────────────────────────────────────
  {
    state: 'federal', category: 'employment',
    ruleName: 'FLSA § 207 — Overtime',
    ruleText: 'No employer shall employ any of his employees for a workweek longer than forty hours unless such employee receives compensation for his employment in excess of the hours above specified at a rate not less than one and one-half times the regular rate.',
    plainEnglishSummary: 'Federal law requires 1.5x pay for hours over 40 in a workweek. Texas has no daily overtime requirement. Security companies with 24/7 operations must track weekly hours carefully.',
    statuteReference: '29 U.S.C. § 207 (FLSA)',
    severity: 'blocking',
    lastVerified: today,
  },
  {
    state: 'federal', category: 'privacy',
    ruleName: 'FCRA § 604 — Permissible Purposes for Background Checks',
    ruleText: 'A consumer reporting agency may furnish a consumer report only under limited permissible purposes, including employment purposes with written authorization.',
    plainEnglishSummary: 'Background checks on job applicants require written consent. Adverse action based on a background check requires specific pre-adverse and adverse action notices. Applies to all security officer hiring.',
    statuteReference: '15 U.S.C. § 1681b (FCRA)',
    severity: 'blocking',
    lastVerified: today,
  },
  {
    state: 'federal', category: 'immigration',
    ruleName: 'INA § 274A — I-9 Employment Eligibility Verification',
    ruleText: 'It is unlawful for a person or other entity to hire, or to recruit or refer for a fee, for employment in the United States an alien knowing the alien is an unauthorized alien.',
    plainEnglishSummary: 'All employees must complete Form I-9 on or before first day of work. Employers must physically verify identity and work authorization documents. I-9 records must be retained for 3 years after hire or 1 year after termination, whichever is later.',
    statuteReference: '8 U.S.C. § 1324a',
    severity: 'blocking',
    lastVerified: today,
  },
];

export async function seedRegulatoryRules(): Promise<void> {
  const [countRow] = await db.select({ n: sql<number>`COUNT(*)` }).from(regulatoryRules);
  const existing = Number(countRow?.n ?? 0);

  if (existing > 0) {
    console.log(`[seedRegulatoryRules] Already seeded (${existing} rules). Skipping.`);
    return;
  }

  console.log(`[seedRegulatoryRules] Seeding ${CORE_RULES.length} regulatory rules...`);

  for (const rule of CORE_RULES) {
    await db.insert(regulatoryRules).values({
      ...rule,
      createdAt: new Date(),
    }).onConflictDoNothing();
    console.log(`  ✅ ${rule.statuteReference}`);
  }

  console.log(`[seedRegulatoryRules] Done. ${CORE_RULES.length} rules seeded.`);
}

// Allow direct execution
