/**
 * Statewide Protective Services — Production Org Seed
 * ─────────────────────────────────────────────────────────────────────────────
 * Idempotent seed that configures everything a new org gets during onboarding.
 * Run on production Railway when Statewide workspace doesn't have full org data.
 *
 * Statewide PSB License: C11608501 (Texas DPS Private Security Bureau)
 * Run: npx tsx server/scripts/seedStatewideProduction.ts
 */

import { pool } from "../db";

const STATEWIDE_WS_ID = process.env.STATEWIDE_WORKSPACE_ID || "dev-anvil-security-ws";

interface OrgConfig {
  orgCode: string;
  companyName: string;
  licenseNumber: string;
  licensingAuthority: string;
  state: string;
  businessCategory: string;
  subscriptionTier: string;
  maxEmployees: number;
  maxClients: number;
  billingEmail: string;
  phone: string;
  address: string;
  city: string;
  zip: string;
  taxId: string;
  sdvosb: boolean;
}

const STATEWIDE: OrgConfig = {
  orgCode:            "STATEWIDE",        // The slug shown in settings + identity cards
  companyName:        "Statewide Protective Services",
  licenseNumber:      "C11608501",        // Texas DPS PSB License
  licensingAuthority: "Texas DPS — Private Security Bureau",
  state:              "TX",
  businessCategory:   "security",
  subscriptionTier:   "enterprise",       // Grandfathered founder exemption
  maxEmployees:       500,
  maxClients:         100,
  billingEmail:       "billing@statewideprotective.com",
  phone:              "(210) 555-0100",
  address:            "San Antonio, TX",
  city:               "San Antonio",
  zip:                "78201",
  taxId:              "",                  // Set in Railway env
  sdvosb:             true,               // Service-Disabled Veteran-Owned Small Business
};

async function seedStatewideProduction(): Promise<void> {
  console.log(`Seeding Statewide org data for workspace: ${STATEWIDE_WS_ID}`);

  // 1. Update workspace with full org identity
  const wsResult = await pool.query(
    `UPDATE workspaces SET
      org_code         = $1,
      name             = $2,
      license_number   = $3,
      state            = $4,
      business_category = $5,
      subscription_tier = $6,
      max_employees    = $7,
      max_clients      = $8,
      phone            = $9,
      city             = $10,
      zip              = $11,
      org_code_status  = 'active',
      org_code_claimed_at = NOW(),
      updated_at       = NOW()
    WHERE id = $12
    RETURNING id, org_code`,
    [
      STATEWIDE.orgCode, STATEWIDE.companyName, STATEWIDE.licenseNumber,
      STATEWIDE.state, STATEWIDE.businessCategory, STATEWIDE.subscriptionTier,
      STATEWIDE.maxEmployees, STATEWIDE.maxClients,
      STATEWIDE.phone, STATEWIDE.city, STATEWIDE.zip,
      STATEWIDE_WS_ID,
    ]
  );
  console.log(`Workspace updated: ${JSON.stringify(wsResult.rows[0])}`);

  // 2. Ensure state_regulatory_config has TX row
  await pool.query(
    `INSERT INTO state_regulatory_config
     (state_code, state_name, licensing_authority, licensing_authority_url,
      license_types, renewal_period_months, fingerprint_required, background_check_required,
      minimum_age, notes, active)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, true)
     ON CONFLICT (state_code) DO UPDATE SET
       licensing_authority = EXCLUDED.licensing_authority,
       license_types = EXCLUDED.license_types,
       updated_at = NOW()`,
    [
      "TX",
      "Texas",
      "Texas Department of Public Safety — Private Security Bureau",
      "https://www.dps.texas.gov/rsd/psb/",
      JSON.stringify([
        { code: "level2_unarmed", name: "Level II — Non-Commissioned Security Officer", armedAllowed: false, renewalPeriodMonths: 24, initialTrainingHours: 6 },
        { code: "level3_armed",   name: "Level III — Commissioned Security Officer",    armedAllowed: true,  renewalPeriodMonths: 24, initialTrainingHours: 6 },
        { code: "level4_ppo",     name: "Level IV — Personal Protection Officer",       armedAllowed: true,  renewalPeriodMonths: 24, initialTrainingHours: 6 },
      ]),
      24, true, true, 18,
      "Chapter 1702, Texas Occupations Code",
    ]
  );
  console.log("TX regulatory config upserted");

  // 3. Ensure regulatory knowledge base is seeded
  const rkbCount = await pool.query(
    "SELECT COUNT(*) FROM regulatory_knowledge_base WHERE state_code IN ('TX', 'FEDERAL')"
  );
  if (parseInt(rkbCount.rows[0].count) < 5) {
    console.log("Regulatory knowledge base thin — run: npx tsx server/scripts/seedRegulatoryKnowledge.ts");
  } else {
    console.log(`Regulatory knowledge base: ${rkbCount.rows[0].count} entries`);
  }

  console.log("\nStatewide production seed complete.");
  console.log(`  Org Code:    ${STATEWIDE.orgCode}`);
  console.log(`  License:     ${STATEWIDE.licenseNumber}`);
  console.log(`  Tier:        ${STATEWIDE.subscriptionTier}`);
  await pool.end();
}

seedStatewideProduction().catch(e => { console.error(e); process.exit(1); });
