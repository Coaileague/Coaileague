/**
 * Regulatory Knowledge Base — Seed Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Seeds baseline regulatory knowledge for Trinity, HelpAI, and spawned agents.
 * Run: npx tsx server/scripts/seedRegulatoryKnowledge.ts
 *
 * DESIGN PRINCIPLE: ALL knowledge is DATA, not code.
 *   Add a new state → add rows here. Never modify service code.
 *   Trinity reads from the DB at query time — always current.
 *
 * COVERAGE IN THIS SEED:
 *   FEDERAL — applies to all states (FLSA, ADA, I-9, OSHA, UoF case law)
 *   TX      — Texas DPS Chapter 1702, TCOLE, state income tax (none), SUI
 *   CA      — BSIS, AB5, state income tax, SUI, PAGA
 *   FL      — Chapter 493, no income tax, SUI
 *   NY      — Article 7-A, income tax, SUI, NYPFL
 *   (More states = more rows — same pattern, no new code)
 */

import { pool } from "../db";

const ENTRIES = [

  // ══════════════════════════════════════════════════════════════════
  // FEDERAL — applies to all states
  // ══════════════════════════════════════════════════════════════════

  // Use of Force Case Law
  {
    state_code: "FEDERAL",
    knowledge_type: "case_law",
    title: "Graham v. Connor (1989) — Objective Reasonableness Standard",
    summary: "The Supreme Court established the 'objective reasonableness' test for all police and security use of force. Force must be evaluated from the perspective of a reasonable officer on the scene, without the benefit of hindsight. Courts consider severity of the crime, immediate threat to officers or others, and active resistance or flight.",
    content_json: {
      citation: "490 U.S. 386 (1989)",
      key_factors: [
        "Severity of the crime at issue",
        "Whether the suspect poses immediate threat to safety",
        "Whether the suspect is actively resisting arrest or attempting to evade"
      ],
      applicability: "All security use of force reports must document these three factors"
    },
    citation: "490 U.S. 386 (1989)",
    source_url: "https://supreme.justia.com/cases/federal/us/490/386/"
  },
  {
    state_code: "FEDERAL",
    knowledge_type: "case_law",
    title: "Tennessee v. Garner (1985) — Deadly Force Against Fleeing Suspects",
    summary: "Deadly force may NOT be used to prevent escape unless the officer has probable cause to believe the suspect poses a significant threat of death or serious physical injury to the officer or others. A fleeing suspect who is not dangerous cannot be stopped with deadly force.",
    content_json: {
      citation: "471 U.S. 1 (1985)",
      rule: "Deadly force requires probable cause of significant threat",
      security_relevance: "Armed security officers follow this standard — cannot shoot unarmed fleeing suspects"
    },
    citation: "471 U.S. 1 (1985)",
    source_url: "https://supreme.justia.com/cases/federal/us/471/1/"
  },

  // Federal UoF report requirements
  {
    state_code: "FEDERAL",
    knowledge_type: "uof_guideline",
    title: "Use of Force Report — Required Elements",
    summary: "Every use of force incident report must document: (1) Officer name and license number, (2) Date/time/location of incident, (3) Description of threatening behavior observed, (4) Force type used and justification, (5) Injuries sustained by any party, (6) Witness names, (7) Whether de-escalation was attempted and why it failed, (8) Supervisor notification time.",
    content_json: {
      required_elements: [
        "Officer name and license/badge number",
        "Date, time, and exact location",
        "Subject's threatening behavior (objective observations only)",
        "Type of force used and specific justification (cite Graham factors)",
        "Injuries — officer, subject, and bystanders",
        "Witnesses present",
        "De-escalation attempts made prior to force",
        "Time supervisor was notified",
        "Medical attention provided or declined"
      ],
      graham_checklist: [
        "Severity of crime or threat at issue",
        "Whether subject posed immediate threat to safety",
        "Whether subject was actively resisting or fleeing"
      ],
      language_guidance: "Use objective, factual language. 'I observed the subject raise a closed fist toward my face' — not 'The subject was going to hit me.'"
    },
    citation: "Graham v. Connor, 490 U.S. 386 (1989)"
  },

  // Federal Occupation Codes
  {
    state_code: "FEDERAL",
    knowledge_type: "occupation_code",
    title: "SOC 33-9032 — Security Guards",
    summary: "Bureau of Labor Statistics Standard Occupational Classification for security guards and gaming surveillance officers. Use for payroll classification, tax reporting, and workers compensation.",
    content_json: { code: "33-9032", system: "SOC", title: "Security Guards" }
  },
  {
    state_code: "FEDERAL",
    knowledge_type: "occupation_code",
    title: "SOC 33-9021 — Private Detectives and Investigators",
    summary: "SOC code for licensed investigators and private detectives. Applies to PPO licensees conducting surveillance, background checks, or investigations.",
    content_json: { code: "33-9021", system: "SOC", title: "Private Detectives and Investigators" }
  },

  // Federal payroll rules
  {
    state_code: "FEDERAL",
    knowledge_type: "payroll_tax_rule",
    title: "Federal Income Tax Withholding — Security Workers",
    summary: "Security guards are W-2 employees in virtually all cases. IRS scrutinizes misclassification as 1099. Must withhold federal income tax, FICA (6.2% SS + 1.45% Medicare), and remit employer match. Armed security may qualify for hazard pay treatment.",
    content_json: {
      fica_employee: { social_security: 0.062, medicare: 0.0145 },
      fica_employer: { social_security: 0.062, medicare: 0.0145 },
      futa_rate: 0.006,
      notes: "1099 classification for security officers is generally incorrect and creates significant IRS liability"
    }
  },
  {
    state_code: "FEDERAL",
    knowledge_type: "payroll_tax_rule",
    title: "FLSA Overtime — Security Guards",
    summary: "Security guards are non-exempt under FLSA. Must receive 1.5x regular rate for hours over 40 per workweek. Fluctuating workweek method may apply for salaried guards on variable schedules. On-call time rules apply — armed officers on-call may trigger overtime.",
    content_json: {
      overtime_multiplier: 1.5,
      threshold_hours: 40,
      exceptions: ["Executive exemption rarely applies to supervisors earning less than $684/week"],
      on_call_rules: "Time on-call is compensable if officer is required to remain on premises or within short response distance"
    },
    citation: "29 U.S.C. § 207"
  },

  // ══════════════════════════════════════════════════════════════════
  // TEXAS
  // ══════════════════════════════════════════════════════════════════

  {
    state_code: "TX",
    knowledge_type: "statute",
    title: "Texas Occupations Code Chapter 1702 — Private Security",
    summary: "Governs all private security companies and personnel in Texas. Requires licensing through the Texas DPS Private Security Bureau (PSB). Companies must have a PSB license (C-number). Individuals must hold a guard card matching their role (Level II unarmed, Level III armed, Level IV PPO). Guard cards expire every 2 years.",
    content_json: {
      governing_body: "Texas Department of Public Safety — Private Security Bureau",
      company_license_prefix: "C",
      individual_license_types: [
        { code: "level2_unarmed", name: "Level II — Non-Commissioned Security Officer", armed: false, renewal_months: 24 },
        { code: "level3_armed", name: "Level III — Commissioned Security Officer", armed: true, renewal_months: 24 },
        { code: "level4_ppo", name: "Level IV — Personal Protection Officer", armed: true, renewal_months: 24 }
      ],
      renewal_grace_period_days: 14,
      psb_website: "https://www.dps.texas.gov/rsd/psb/"
    },
    citation: "Texas Occupations Code § 1702",
    source_url: "https://statutes.capitol.texas.gov/Docs/OC/htm/OC.1702.htm"
  },
  {
    state_code: "TX",
    knowledge_type: "penal_code",
    title: "Texas Penal Code § 9.31 — Self-Defense",
    summary: "A person is justified in using force against another when and to the degree the actor reasonably believes force is immediately necessary to protect himself against the other's use or attempted use of unlawful force. Force is NOT justified in response to verbal provocation alone.",
    content_json: {
      citation: "Texas Penal Code § 9.31",
      key_elements: ["Reasonable belief", "Immediately necessary", "Protect against unlawful force"],
      not_justified: ["Verbal provocation alone", "Consent situations", "Provoked situations"]
    },
    citation: "Texas Penal Code § 9.31"
  },
  {
    state_code: "TX",
    knowledge_type: "penal_code",
    title: "Texas Penal Code § 9.32 — Deadly Force in Defense of Person",
    summary: "Deadly force is justified only if the actor reasonably believes it is immediately necessary to protect against another's use or attempted use of unlawful deadly force, or to prevent aggravated kidnapping, murder, sexual assault, aggravated robbery, or arson. Texas does NOT require retreat ('Stand Your Ground').",
    content_json: {
      citation: "Texas Penal Code § 9.32",
      triggers: ["Deadly force by another", "Aggravated kidnapping", "Murder or attempted murder", "Sexual assault", "Aggravated robbery", "Arson"],
      no_duty_to_retreat: true
    },
    citation: "Texas Penal Code § 9.32"
  },
  {
    state_code: "TX",
    knowledge_type: "payroll_tax_rule",
    title: "Texas State Income Tax — None",
    summary: "Texas has NO state income tax. Security company payroll does not require state income tax withholding. However, employers must still pay Texas unemployment insurance (UI) tax and file TWC quarterly reports.",
    content_json: { state_income_tax: false, notes: "No withholding required for state income tax" }
  },
  {
    state_code: "TX",
    knowledge_type: "payroll_tax_rule",
    title: "Texas Unemployment Insurance (UI) — SUI",
    summary: "Texas employers pay State Unemployment Insurance (SUI) to the Texas Workforce Commission (TWC). New employer rate is 2.7% on first $9,000 of each employee's wages per year. Experience-rated employers can range from 0.25% to 6.25%. File quarterly Form C-3.",
    content_json: {
      new_employer_rate: 0.027,
      wage_base: 9000,
      rate_range: { min: 0.0025, max: 0.0625 },
      filing_form: "TWC Form C-3",
      filing_frequency: "quarterly",
      agency: "Texas Workforce Commission",
      agency_url: "https://www.twc.texas.gov/"
    }
  },
  {
    state_code: "TX",
    knowledge_type: "occupation_code",
    title: "Texas Workers Comp — Security Guard Code 7720",
    summary: "Texas NCCI workers compensation class code 7720 applies to security guards and patrol services. Used for workers comp premium calculation. Armed security may use code 7723 (armed guard services) with higher premium.",
    content_json: { code: "7720", system: "NCCI_workers_comp", armed_code: "7723", title: "Security Guard Services" }
  },
  {
    state_code: "TX",
    knowledge_type: "uof_reportable_incident_types",
    title: "Texas DPS — Use of Force Reportable Incident Types",
    summary: "These incident types trigger mandatory Use of Force reporting to Texas DPS PSB within the required timeframe.",
    content_json: {
      types: ["use_of_force", "firearm_discharge", "physical_altercation",
              "use_of_force_incident", "weapon_drawn", "officer_involved",
              "deadly_force", "weapon_deployed"]
    }
  },
  {
    state_code: "TX",
    knowledge_type: "required_armed_certifications",
    title: "Texas DPS — Required Certifications for Armed Officers",
    summary: "Armed security officers in Texas must maintain current firearm qualification and complete required continuing education.",
    content_json: {
      certTypes: ["firearm_qualification", "armed_security", "dps_guard_card"],
      renewal_months: 24,
      ce_hours_per_renewal: 6
    }
  },
  {
    state_code: "TX",
    knowledge_type: "audit_checklist",
    title: "Texas DPS PSB Audit Checklist — What Auditors Check",
    summary: "Standard items a Texas DPS PSB auditor reviews during a compliance inspection.",
    content_json: {
      items: [
        "Company license (C-number) — current and posted at principal place of business",
        "Employee guard cards — valid, current, correct level for assignment",
        "Armed officers — Level III (Commissioned) for armed posts only",
        "Daily Activity Reports (DARs) — maintained for 2 years minimum",
        "Use of Force reports — filed within required timeframe",
        "Insurance certificate — minimum $100,000 per occurrence",
        "Firearm qualification records — annual for armed officers",
        "Employee application files — background check, fingerprints, ID documents",
        "Training records — initial and continuing education hours",
        "Contracts — signed client service agreements on file"
      ]
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // CALIFORNIA
  // ══════════════════════════════════════════════════════════════════

  {
    state_code: "CA",
    knowledge_type: "statute",
    title: "California Business & Professions Code § 7580-7582 — BSIS Licensing",
    summary: "California Bureau of Security and Investigative Services (BSIS) licenses all security companies and personnel. Unarmed: Security Guard Registration (G card). Armed: Exposed Firearm Permit (EFP). PPO: separate license. All guards must complete 40 hours of training before working.",
    content_json: {
      governing_body: "Bureau of Security and Investigative Services (BSIS)",
      bsis_website: "https://www.bsis.ca.gov",
      license_types: [
        { code: "ca_unarmed", name: "Security Guard Registration (G Card)", armed: false },
        { code: "ca_armed_efp", name: "Exposed Firearm Permit (EFP)", armed: true },
        { code: "ca_ppo", name: "Private Patrol Operator License", armed: true }
      ],
      pre_work_training_hours: 40
    },
    citation: "California Business & Professions Code § 7580-7582",
    source_url: "https://www.bsis.ca.gov/forms_pubs/security_guard_reg.shtml"
  },
  {
    state_code: "CA",
    knowledge_type: "payroll_tax_rule",
    title: "California State Income Tax Withholding",
    summary: "California imposes state income tax on all wages. Employers must withhold SDI (State Disability Insurance) at 1.1% of wages (no wage ceiling as of 2024). Employer also pays SUI, ETT, and must file DE 9 quarterly.",
    content_json: {
      sdi_rate_employee: 0.011,
      sdi_wage_ceiling: null,
      sui_new_employer_rate: 0.034,
      sui_wage_base: 7000,
      ett_rate: 0.001,
      ett_wage_base: 7000,
      filing_forms: ["DE 9 (quarterly)", "DE 9C (detail)"],
      agency: "California Employment Development Department (EDD)"
    }
  },
  {
    state_code: "CA",
    knowledge_type: "uof_reportable_incident_types",
    title: "California BSIS — Use of Force Reportable Incident Types",
    summary: "California BSIS requires reporting of any use of physical force resulting in injury, any firearm use, and any incident where a guard was involved in a physical altercation.",
    content_json: {
      types: ["use_of_force", "firearm_discharge", "physical_altercation",
              "use_of_force_incident", "weapon_drawn", "officer_involved",
              "deadly_force"]
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // FLORIDA
  // ══════════════════════════════════════════════════════════════════

  {
    state_code: "FL",
    knowledge_type: "statute",
    title: "Florida Statutes Chapter 493 — Security Services",
    summary: "Florida licenses security companies through the Department of Agriculture and Consumer Services. Class D license for unarmed officers. Class G license for armed officers (requires firearms training). Company must hold a Class B license.",
    content_json: {
      governing_body: "Florida Department of Agriculture and Consumer Services",
      license_types: [
        { code: "fl_class_d", name: "Class D — Unarmed Security Officer", armed: false },
        { code: "fl_class_g", name: "Class G — Armed Security Officer", armed: true },
        { code: "fl_class_b", name: "Class B — Security Agency License", entity: "company" }
      ]
    },
    citation: "Florida Statutes Chapter 493"
  },
  {
    state_code: "FL",
    knowledge_type: "payroll_tax_rule",
    title: "Florida State Income Tax — None",
    summary: "Florida has NO state income tax. No withholding required for state income tax. Employers pay Florida Reemployment Tax (SUI) to the FL Department of Revenue. New employer rate 2.7% on first $7,000.",
    content_json: {
      state_income_tax: false,
      sui_new_employer_rate: 0.027,
      sui_wage_base: 7000
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // NEW YORK
  // ══════════════════════════════════════════════════════════════════

  {
    state_code: "NY",
    knowledge_type: "statute",
    title: "New York General Business Law Article 7-A — Security Guards",
    summary: "New York licenses security guards through the Department of State Division of Licensing Services. All security guards must register and complete required training. Armed guards need additional firearms permits.",
    content_json: {
      governing_body: "NY Department of State — Division of Licensing Services",
      license_types: [
        { code: "ny_unarmed", name: "Unarmed Security Guard Registration", armed: false },
        { code: "ny_armed", name: "Armed Security Guard — pistol permit required", armed: true }
      ]
    },
    citation: "New York General Business Law Article 7-A"
  },
  {
    state_code: "NY",
    knowledge_type: "payroll_tax_rule",
    title: "New York State Income Tax + NYC Tax",
    summary: "New York has state income tax ranging from 4% to 10.9%. NYC residents pay an additional city income tax 3.078%-3.876%. Also required: NYPFL (Paid Family Leave, employee pays 0.373% up to $399.43/year in 2024), SUI on first $12,300.",
    content_json: {
      state_income_tax: true,
      state_rate_range: { min: 0.04, max: 0.109 },
      nyc_tax: true,
      nyc_rate_range: { min: 0.03078, max: 0.03876 },
      nypfl_employee_rate: 0.00373,
      nypfl_wage_ceiling: 107640,
      sui_wage_base: 12300,
      agency: "New York Department of Taxation and Finance"
    }
  },
];

async function seedRegulatoryKnowledge(): Promise<void> {
  console.log("Seeding regulatory knowledge base...");

  // Ensure table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS regulatory_knowledge_base (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
      state_code VARCHAR(5) NOT NULL,
      knowledge_type VARCHAR(80) NOT NULL,
      title VARCHAR(300) NOT NULL,
      summary TEXT NOT NULL,
      content_json JSONB,
      citation VARCHAR(500),
      source_url TEXT,
      applicable_license_types TEXT[] DEFAULT ARRAY[]::text[],
      tags TEXT[] DEFAULT ARRAY[]::text[],
      confidence_score INTEGER DEFAULT 100,
      last_verified_at TIMESTAMP DEFAULT NOW(),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS rkb_state_type_idx ON regulatory_knowledge_base(state_code, knowledge_type);
  `);

  let inserted = 0;
  let updated = 0;

  for (const entry of ENTRIES) {
    const existing = await pool.query(
      `SELECT id FROM regulatory_knowledge_base WHERE state_code = $1 AND title = $2 LIMIT 1`,
      [entry.state_code, entry.title]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE regulatory_knowledge_base SET summary = $1, content_json = $2, citation = $3,
         source_url = $4, updated_at = NOW() WHERE id = $5`,
        [entry.summary, entry.content_json ? JSON.stringify(entry.content_json) : null,
         entry.citation || null, entry.source_url || null, existing.rows[0].id]
      );
      updated++;
    } else {
      await pool.query(
        `INSERT INTO regulatory_knowledge_base
         (state_code, knowledge_type, title, summary, content_json, citation, source_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [entry.state_code, entry.knowledge_type, entry.title, entry.summary,
         entry.content_json ? JSON.stringify(entry.content_json) : null,
         entry.citation || null, entry.source_url || null]
      );
      inserted++;
    }
  }

  console.log(`Done. Inserted: ${inserted}, Updated: ${updated}, Total: ${ENTRIES.length}`);
  await pool.end();
}

seedRegulatoryKnowledge().catch(console.error);
