/**
 * Multi-State Regulatory Seed — Readiness Section 24
 * ======================================================
 * Seeds compliance_states rows for CA + FL so tenant #2 from either
 * state is viable without a schema change. Texas is already seeded.
 *
 * Intended to run once per environment (idempotent ON CONFLICT DO
 * NOTHING on state_code). Callable from the admin surface via
 * POST /api/dev/seed-multi-state-regulatory.
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { createLogger } from '../lib/logger';

const log = createLogger('multiStateRegulatorySeed');

interface StateSeed {
  stateCode: string;
  stateName: string;
  regulatoryBody: string;
  regulatoryBodyAcronym: string;
  portalUrl: string;
  companyLicensePrefix: string;
  individualLicensePrefix: string;
  requiredTrainingHours: number;
  armedTrainingHours: number;
  licenseRenewalPeriodMonths: number;
  minimumAge: number;
  keyStatutes: Array<{ citation: string; description: string }>;
  licenseTypes: Array<{ code: string; name: string; description: string; armedAllowed: boolean }>;
  minimumInsuranceCoverage: Array<{ type: string; minimumAmount: number; description: string }>;
  firearmQualificationRenewalMonths: number;
}

const CA_SEED: StateSeed = {
  stateCode: 'CA',
  stateName: 'California',
  regulatoryBody: 'California Bureau of Security and Investigative Services',
  regulatoryBodyAcronym: 'BSIS',
  portalUrl: 'https://www.bsis.ca.gov',
  companyLicensePrefix: 'PPO',
  individualLicensePrefix: 'G',
  requiredTrainingHours: 40,
  armedTrainingHours: 14, // Exposed Firearm permit
  licenseRenewalPeriodMonths: 24,
  minimumAge: 18,
  keyStatutes: [
    { citation: 'B&P Code § 7580 et seq.', description: 'Private Security Services Act (California Business & Professions Code)' },
    { citation: 'CCR Title 16 § 643', description: 'Exposed firearm permit training + qualification requirements' },
  ],
  licenseTypes: [
    { code: 'PPO',  name: 'Private Patrol Operator', description: 'Company license', armedAllowed: true },
    { code: 'G',    name: 'Security Guard Registration', description: 'Individual — unarmed', armedAllowed: false },
    { code: 'F',    name: 'Exposed Firearm Permit',      description: 'Individual — armed addendum to G', armedAllowed: true },
  ],
  minimumInsuranceCoverage: [
    { type: 'general_liability', minimumAmount: 1000000, description: 'Per California BSIS requirement (PPO licensees).' },
  ],
  firearmQualificationRenewalMonths: 12,
};

const FL_SEED: StateSeed = {
  stateCode: 'FL',
  stateName: 'Florida',
  regulatoryBody: 'Florida Department of Agriculture & Consumer Services, Division of Licensing',
  regulatoryBodyAcronym: 'DACS-DOL',
  portalUrl: 'https://licensing.fdacs.gov',
  companyLicensePrefix: 'B',  // Class B — security agency
  individualLicensePrefix: 'D', // Class D — security officer
  requiredTrainingHours: 40, // Class D
  armedTrainingHours: 28,    // Class G
  licenseRenewalPeriodMonths: 24,
  minimumAge: 18,
  keyStatutes: [
    { citation: 'Fla. Stat. Ch. 493', description: 'Private Investigative, Private Security, and Repossession Services' },
    { citation: 'Fla. Admin. Code 5N-1', description: 'Rules of the Division of Licensing' },
  ],
  licenseTypes: [
    { code: 'B', name: 'Class B — Security Agency',   description: 'Company license', armedAllowed: true },
    { code: 'D', name: 'Class D — Security Officer', description: 'Individual — unarmed', armedAllowed: false },
    { code: 'G', name: 'Class G — Statewide Firearm', description: 'Individual — armed addendum to D', armedAllowed: true },
    { code: 'M', name: 'Class M — Manager',           description: 'Agency manager', armedAllowed: false },
  ],
  minimumInsuranceCoverage: [
    { type: 'general_liability', minimumAmount: 300000, description: 'Per Fla. Stat. § 493.6110 minimum for Class B licensees.' },
  ],
  firearmQualificationRenewalMonths: 12,
};

async function seedOne(seed: StateSeed): Promise<boolean> {
  try {
    await db.execute(sql`
      INSERT INTO compliance_states (
        state_code, state_name, regulatory_body, regulatory_body_acronym,
        portal_url, status,
        company_license_prefix, individual_license_prefix,
        required_training_hours, armed_training_hours,
        license_renewal_period_months, minimum_age,
        key_statutes, license_types, minimum_insurance_coverage,
        firearm_qualification_renewal_months,
        created_at, updated_at
      ) VALUES (
        ${seed.stateCode}, ${seed.stateName}, ${seed.regulatoryBody}, ${seed.regulatoryBodyAcronym},
        ${seed.portalUrl}, 'active',
        ${seed.companyLicensePrefix}, ${seed.individualLicensePrefix},
        ${seed.requiredTrainingHours}, ${seed.armedTrainingHours},
        ${seed.licenseRenewalPeriodMonths}, ${seed.minimumAge},
        ${JSON.stringify(seed.keyStatutes)}::jsonb,
        ${JSON.stringify(seed.licenseTypes)}::jsonb,
        ${JSON.stringify(seed.minimumInsuranceCoverage)}::jsonb,
        ${seed.firearmQualificationRenewalMonths},
        NOW(), NOW()
      )
      ON CONFLICT (state_code) DO NOTHING
    `);
    return true;
  } catch (err: any) {
    log.warn(`[multiStateSeed] ${seed.stateCode} seed failed:`, err?.message);
    return false;
  }
}

export interface MultiStateSeedResult {
  success: boolean;
  seeded: string[];
  skipped: string[];
}

export async function seedMultiStateRegulatory(): Promise<MultiStateSeedResult> {
  const seeded: string[] = [];
  const skipped: string[] = [];
  for (const seed of [CA_SEED, FL_SEED]) {
    const ok = await seedOne(seed);
    if (ok) seeded.push(seed.stateCode); else skipped.push(seed.stateCode);
  }
  log.info(`[multiStateSeed] Seeded: ${seeded.join(', ')}; skipped: ${skipped.join(', ')}`);
  return { success: skipped.length === 0, seeded, skipped };
}
