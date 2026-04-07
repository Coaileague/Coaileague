/**
 * Multi-State Security Guard Compliance Configuration Engine
 *
 * Defines state-specific document requirements, training mandates, and retention
 * policies for private security guard companies operating in TX, CA, FL, and NY.
 *
 * REGULATORY REFERENCES:
 *   Texas   – Texas Administrative Code (TAC) Title 37, Part 1, Ch. 35
 *             Texas Occupations Code Ch. 1702 (Private Security Act)
 *   California – California Business & Professions Code §§ 7580–7588
 *               16 CCR §§ 600–699 (BSIS regulations)
 *   Florida – Florida Statutes Ch. 493 (Private Security)
 *             FAC Rule 5N-1 (DACS licensing rules)
 *   New York – New York General Business Law Article 7-A (§§ 89-f – 89-p)
 *              19 NYCRR Part 174 (DCJS regulations)
 *
 * IMPORTANT: This configuration is used for audit-readiness. All document IDs,
 * retention periods, and training-hour values are sourced from the statutes and
 * administrative codes cited above. Any future changes to state law MUST be
 * reflected here.
 *
 * Last regulatory review: 2026-02-20
 */

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

export type DocumentCategory =
  | 'licensing'
  | 'training'
  | 'background'
  | 'compliance'
  | 'identification'
  | 'medical'
  | 'firearms';

export type DocumentPriority = 'critical' | 'high' | 'medium' | 'low';

export interface StateRequiredDocument {
  id: string;
  name: string;
  description: string;
  category: DocumentCategory;
  priority: DocumentPriority;
  blocksWorkAssignment: boolean;
  expiryPeriodDays?: number;
  renewalRequired: boolean;
  stateSpecificNotes?: string;
  regulatoryCitation?: string;
}

export interface LicenseLevel {
  id: string;
  name: string;
  description: string;
  guardType: 'unarmed' | 'armed';
  trainingHoursRequired: number;
  additionalTrainingNotes?: string;
  requiredDocuments: StateRequiredDocument[];
}

export interface OrgRequiredDocument {
  id: string;
  name: string;
  description: string;
  category: 'insurance' | 'licensing' | 'compliance' | 'tax';
  required: boolean;
  blocksOperations: boolean;
  renewalRequired: boolean;
  expiryPeriodDays?: number;
  regulatoryCitation?: string;
  stateSpecificNotes?: string;
}

export interface StateComplianceConfig {
  stateCode: string;
  stateName: string;
  regulatoryBody: string;
  regulatoryBodyAbbreviation: string;
  portalUrl: string;
  retentionPeriodDescription: string;
  retentionPeriodDays: number;
  licenseLevels: LicenseLevel[];
  orgRequirements?: OrgRequiredDocument[];
  workersCompRequired: boolean;
  workersCompNotes?: string;
  notes?: string[];
}

export interface ComplianceGap {
  documentId: string;
  documentName: string;
  category: DocumentCategory;
  priority: DocumentPriority;
  blocksWorkAssignment: boolean;
  stateSpecificNotes?: string;
  regulatoryCitation?: string;
}

export interface ComplianceGapReport {
  stateCode: string;
  guardType: string;
  totalRequired: number;
  totalPresent: number;
  totalMissing: number;
  missingDocuments: ComplianceGap[];
  workBlocked: boolean;
  blockingDocumentCount: number;
}

// ---------------------------------------------------------------------------
// Universal Federal Requirements (apply in every state)
// ---------------------------------------------------------------------------

/**
 * Federal documents required regardless of state.
 * Ref: IRS Publication 15 (W-4), USCIS Form I-9, Social Security Act §205(c)(2),
 * E-Verify (8 USC §1324a — mandatory for federal contractors; optional otherwise).
 */
export const UNIVERSAL_FEDERAL_REQUIREMENTS: StateRequiredDocument[] = [
  {
    id: 'federal_i9',
    name: 'Form I-9 (Employment Eligibility Verification)',
    description:
      'USCIS Form I-9 verifying identity and employment authorization. Must be completed within 3 business days of hire date. Section 1 completed by employee on or before first day of work; Section 2 completed by employer within 3 business days.',
    category: 'compliance',
    priority: 'critical',
    blocksWorkAssignment: true,
    renewalRequired: false,
    stateSpecificNotes:
      'Must be retained for 3 years after date of hire OR 1 year after termination, whichever is later. (8 CFR §274a.2(b)(2)(i)(A))',
    regulatoryCitation: '8 USC §1324a; 8 CFR §274a.2',
  },
  {
    id: 'federal_w4',
    name: 'IRS Form W-4 (Employee Withholding Certificate)',
    description:
      'Federal tax withholding election form. Must be completed before first payroll is processed.',
    category: 'compliance',
    priority: 'high',
    blocksWorkAssignment: false,
    renewalRequired: false,
    stateSpecificNotes: 'Employees may update at any time. Retain for 4 years after last filing (IRS Rev. Proc.).',
    regulatoryCitation: '26 USC §3402; IRS Publication 15',
  },
  {
    id: 'federal_ssn_card',
    name: 'Social Security Card',
    description:
      'Copy of Social Security card for payroll and I-9 verification (List C document).',
    category: 'identification',
    priority: 'high',
    blocksWorkAssignment: false,
    renewalRequired: false,
    stateSpecificNotes: 'Acceptable as List C document for I-9. Original must be presented.',
    regulatoryCitation: 'Social Security Act §205(c)(2)',
  },
  {
    id: 'federal_e_verify',
    name: 'E-Verify Confirmation (if applicable)',
    description:
      'E-Verify case number and confirmation for employers enrolled in E-Verify. Required for federal contractors and in certain states.',
    category: 'compliance',
    priority: 'medium',
    blocksWorkAssignment: false,
    renewalRequired: false,
    stateSpecificNotes:
      'Mandatory for federal contractors per FAR 52.222-54. Some states (e.g., FL) require E-Verify for all employers with 25+ employees.',
    regulatoryCitation: '8 USC §1324a note; FAR 52.222-54',
  },
];

// ---------------------------------------------------------------------------
// Texas (TX) Configuration
// ---------------------------------------------------------------------------

/**
 * TEXAS — Department of Public Safety, Private Security Bureau
 *
 * Governing Law: Texas Occupations Code Ch. 1702
 * Admin Rules: 37 TAC Part 1, Ch. 35 (Private Security)
 * Portal: TOPS (Texas Online Private Security) — https://tops.txdps.state.tx.us
 *
 * License Levels:
 *   Level II  – Non-Commissioned Security Officer (Unarmed)
 *   Level III – Commissioned Security Officer (Armed)
 *   Level IV  – Personal Protection Officer (PPO)
 *
 * Retention: 2 years from last date of employment (TAC §35.111)
 */

const TX_LEVEL_II_DOCS: StateRequiredDocument[] = [
  {
    id: 'tx_level_ii_registration',
    name: 'Level II (Non-Commissioned) Security Officer Registration',
    description: 'DPS-issued Level II security officer pocket card. Must be obtained before deployment.',
    category: 'licensing',
    priority: 'critical',
    blocksWorkAssignment: true,
    expiryPeriodDays: 730,
    renewalRequired: true,
    stateSpecificNotes: 'Registration valid 2 years. Renewal via TOPS portal. Employer must verify registration status before assignment.',
    regulatoryCitation: 'Tex. Occ. Code §1702.230; 37 TAC §35.51',
  },
  {
    id: 'tx_level_ii_training_cert',
    name: 'Level II Training Certificate (30 hours)',
    description: 'Certificate of completion for the 30-hour Level II (non-commissioned) security officer training course from a DPS-licensed training school.',
    category: 'training',
    priority: 'critical',
    blocksWorkAssignment: true,
    renewalRequired: false,
    stateSpecificNotes: 'Training must be completed at a school licensed under Tex. Occ. Code §1702.219. Includes written examination.',
    regulatoryCitation: '37 TAC §35.101',
  },
  {
    id: 'tx_color_photograph',
    name: 'Color Photograph',
    description: 'One current color photograph for employee file per TAC §35.111.',
    category: 'identification',
    priority: 'critical',
    blocksWorkAssignment: true,
    renewalRequired: false,
    stateSpecificNotes: 'Must be current likeness. Required to be maintained in employee file at all times.',
    regulatoryCitation: '37 TAC §35.111(a)(2)',
  },
  {
    id: 'tx_fingerprint_background',
    name: 'Fingerprint-Based Background Check (IdentoGO)',
    description: 'FBI/DPS fingerprint background check submitted through IdentoGO. Results must be clear before deployment.',
    category: 'background',
    priority: 'critical',
    blocksWorkAssignment: true,
    renewalRequired: false,
    stateSpecificNotes: 'Fingerprints submitted via IdentoGO (MorphoTrust). DPS processes both state (TXDPS) and federal (FBI) checks.',
    regulatoryCitation: 'Tex. Occ. Code §1702.230(d); 37 TAC §35.52',
  },
  {
    id: 'tx_drug_test',
    name: 'Pre-Employment Drug Test Results',
    description: 'Clear pre-employment drug screening results from an authorized testing facility.',
    category: 'compliance',
    priority: 'critical',
    blocksWorkAssignment: true,
    renewalRequired: false,
    stateSpecificNotes: 'Required per TAC §35.111. Must be retained in employee file.',
    regulatoryCitation: '37 TAC §35.111(a)(5)',
  },
  {
    id: 'tx_preemployment_check',
    name: 'Pre-Employment Check Documentation',
    description: 'Documentation of pre-employment verification including reference checks and employment history.',
    category: 'background',
    priority: 'high',
    blocksWorkAssignment: true,
    renewalRequired: false,
    stateSpecificNotes: 'Must include verification of applicant information prior to submission of application to DPS.',
    regulatoryCitation: '37 TAC §35.111(a)(4)',
  },
  {
    id: 'tx_employee_info_sheet',
    name: 'Employee Information Record',
    description: 'Record containing full name, date of birth, current address, Social Security number, position title, and dates of employment.',
    category: 'compliance',
    priority: 'critical',
    blocksWorkAssignment: true,
    renewalRequired: false,
    stateSpecificNotes: 'All fields required per TAC §35.111(a)(1). Must be updated when information changes.',
    regulatoryCitation: '37 TAC §35.111(a)(1)',
  },
  {
    id: 'tx_training_certificates_all',
    name: 'All Training Certificates',
    description: 'Copies of all training certificates earned during employment, including initial and continuing education.',
    category: 'training',
    priority: 'high',
    blocksWorkAssignment: false,
    renewalRequired: false,
    stateSpecificNotes: 'Must maintain copies of every training certificate in employee file.',
    regulatoryCitation: '37 TAC §35.111(a)(6)',
  },
];

const TX_LEVEL_III_ADDITIONAL_DOCS: StateRequiredDocument[] = [
  {
    id: 'tx_level_iii_registration',
    name: 'Level III (Commissioned) Security Officer Registration',
    description: 'DPS-issued Level III commissioned security officer pocket card authorizing armed duty.',
    category: 'licensing',
    priority: 'critical',
    blocksWorkAssignment: true,
    expiryPeriodDays: 730,
    renewalRequired: true,
    stateSpecificNotes: 'Must hold valid Level II before applying. Registration valid 2 years.',
    regulatoryCitation: 'Tex. Occ. Code §1702.163; 37 TAC §35.51',
  },
  {
    id: 'tx_level_iii_training_cert',
    name: 'Level III Training Certificate (45 hours)',
    description: 'Certificate of completion for the 45-hour Level III commissioned officer training, including firearms proficiency.',
    category: 'training',
    priority: 'critical',
    blocksWorkAssignment: true,
    renewalRequired: false,
    stateSpecificNotes: 'Includes firearms proficiency. Prerequisite: Level II training must be completed first.',
    regulatoryCitation: '37 TAC §35.101',
  },
  {
    id: 'tx_psych_declaration',
    name: 'Declaration of Psychological/Emotional Health',
    description: 'Signed declaration that the applicant is of sound psychological and emotional health for commissioned security work.',
    category: 'medical',
    priority: 'critical',
    blocksWorkAssignment: true,
    renewalRequired: false,
    stateSpecificNotes: 'Required for all commissioned (armed) officer applications.',
    regulatoryCitation: '37 TAC §35.53',
  },
  {
    id: 'tx_mmpi',
    name: 'MMPI (Minnesota Multiphasic Personality Inventory) Results',
    description: 'Results of the MMPI or equivalent psychological screening administered by a licensed psychologist.',
    category: 'medical',
    priority: 'critical',
    blocksWorkAssignment: true,
    renewalRequired: false,
    stateSpecificNotes: 'Must be administered and interpreted by a licensed psychologist. Results must indicate fitness for armed duty.',
    regulatoryCitation: '37 TAC §35.53',
  },
  {
    id: 'tx_firearms_proficiency',
    name: 'Firearms Proficiency Certificate',
    description: 'Certificate demonstrating firearms proficiency from a DPS-approved firearms instructor.',
    category: 'firearms',
    priority: 'critical',
    blocksWorkAssignment: true,
    expiryPeriodDays: 90,
    renewalRequired: true,
    stateSpecificNotes: 'Valid for 90 days only. Must be current at time of initial application and renewed before expiry.',
    regulatoryCitation: '37 TAC §35.143',
  },
  {
    id: 'tx_continuing_ed_armed',
    name: 'Continuing Education (6 hours / 2 years)',
    description: 'Proof of 6 hours of continuing education completed within the 2-year registration period for commissioned officers.',
    category: 'training',
    priority: 'high',
    blocksWorkAssignment: false,
    expiryPeriodDays: 730,
    renewalRequired: true,
    stateSpecificNotes: 'Required for registration renewal. Must include firearms component.',
    regulatoryCitation: '37 TAC §35.101(e)',
  },
];

const TX_BUSINESS_RECORDS: StateRequiredDocument[] = [
  {
    id: 'tx_contracts',
    name: 'Client Contracts',
    description: 'Copies of all client service contracts for security services.',
    category: 'compliance',
    priority: 'medium',
    blocksWorkAssignment: false,
    renewalRequired: false,
    stateSpecificNotes: 'Must be retained for 2 years. Subject to DPS audit.',
    regulatoryCitation: '37 TAC §35.111(c)',
  },
  {
    id: 'tx_timesheets',
    name: 'Timesheets / Work Records',
    description: 'All timesheets and records of hours worked by security officers.',
    category: 'compliance',
    priority: 'medium',
    blocksWorkAssignment: false,
    renewalRequired: false,
    stateSpecificNotes: 'Retention: 2 years from date of record.',
    regulatoryCitation: '37 TAC §35.111(c)',
  },
  {
    id: 'tx_invoices',
    name: 'Invoices / Billing Records',
    description: 'All invoices and billing documentation for security services rendered.',
    category: 'compliance',
    priority: 'medium',
    blocksWorkAssignment: false,
    renewalRequired: false,
    stateSpecificNotes: 'Retention: 2 years from date of record.',
    regulatoryCitation: '37 TAC §35.111(c)',
  },
];

const TX_CONFIG: StateComplianceConfig = {
  stateCode: 'TX',
  workersCompRequired: false,
  workersCompNotes: 'Texas is the only state where workers\' compensation insurance is optional for private employers (nonsubscriber status). Employers who opt out must file DWC Form-005 with the Texas Department of Insurance, Division of Workers\' Compensation.',
  stateName: 'Texas',
  regulatoryBody: 'Texas Department of Public Safety, Private Security Bureau',
  regulatoryBodyAbbreviation: 'DPS-PSB',
  portalUrl: 'https://tops.txdps.state.tx.us',
  retentionPeriodDescription: '2 years from last date of employment',
  retentionPeriodDays: 730,
  licenseLevels: [
    {
      id: 'tx_level_ii',
      name: 'Level II – Non-Commissioned Security Officer',
      description: 'Unarmed security officer. May perform guard, watchman, or patrol duties without a firearm.',
      guardType: 'unarmed',
      trainingHoursRequired: 30,
      additionalTrainingNotes: 'Includes written examination. Training must be from a DPS-licensed school.',
      requiredDocuments: [...TX_LEVEL_II_DOCS],
    },
    {
      id: 'tx_level_iii',
      name: 'Level III – Commissioned Security Officer',
      description: 'Armed security officer authorized to carry a firearm while on duty.',
      guardType: 'armed',
      trainingHoursRequired: 75,
      additionalTrainingNotes: 'Level II (30 hrs) + Level III (45 hrs including firearms proficiency). Must pass MMPI and psychological declaration.',
      requiredDocuments: [...TX_LEVEL_II_DOCS, ...TX_LEVEL_III_ADDITIONAL_DOCS],
    },
    {
      id: 'tx_level_iv',
      name: 'Level IV – Personal Protection Officer (PPO)',
      description: 'Personal protection / executive protection officer. Requires Level III plus additional PPO training.',
      guardType: 'armed',
      trainingHoursRequired: 90,
      additionalTrainingNotes: 'Level II (30 hrs) + Level III (45 hrs) + PPO-specific training (15 hrs minimum). All Level III docs required.',
      requiredDocuments: [...TX_LEVEL_II_DOCS, ...TX_LEVEL_III_ADDITIONAL_DOCS],
    },
  ],
  notes: [
    'TAC §35.111: Employee files must be maintained at the principal place of business and available for DPS inspection.',
    'Business records (contracts, timesheets, invoices) must be retained for 2 years per TAC §35.111(c).',
    'TOPS portal is the primary mechanism for registration applications, renewals, and status verification.',
    'Employers must report new hires and terminations to DPS within 14 days per Tex. Occ. Code §1702.230.',
  ],
};

// ---------------------------------------------------------------------------
// California (CA) Configuration
// ---------------------------------------------------------------------------

/**
 * CALIFORNIA — Bureau of Security and Investigative Services (BSIS)
 *
 * Governing Law: California Business & Professions Code §§ 7580–7588
 * Admin Rules: 16 CCR §§ 600–699
 * Portal: https://www.bsis.ca.gov
 *
 * License Type: Guard Card Registration
 * Training: Power to Arrest (8 hrs pre-registration) + 32 hrs skills training
 *           within 6 months (16 hrs in first 30 days + 16 hrs within 6 months)
 *           + 8 hrs annual continuing education
 *
 * Retention: Duration of employment
 */

const CA_UNARMED_DOCS: StateRequiredDocument[] = [
  {
    id: 'ca_guard_card',
    name: 'BSIS Guard Card Registration',
    description: 'California Bureau of Security and Investigative Services guard card registration. Must be obtained before any security work.',
    category: 'licensing',
    priority: 'critical',
    blocksWorkAssignment: true,
    expiryPeriodDays: 730,
    renewalRequired: true,
    stateSpecificNotes: 'Valid 2 years. Application requires completion of Power to Arrest training. Guard must carry card while on duty.',
    regulatoryCitation: 'Cal. Bus. & Prof. Code §7583.6; 16 CCR §643',
  },
  {
    id: 'ca_power_to_arrest',
    name: 'Power to Arrest Training Certificate',
    description: 'Certificate of completion of the Power to Arrest training course. Must be completed before guard card application.',
    category: 'training',
    priority: 'critical',
    blocksWorkAssignment: true,
    renewalRequired: false,
    stateSpecificNotes: 'Must be completed BEFORE submitting guard card application. Covers citizen arrest laws, search/seizure, and liability.',
    regulatoryCitation: 'Cal. Bus. & Prof. Code §7583.6(a); 16 CCR §643(a)',
  },
  {
    id: 'ca_live_scan',
    name: 'Live Scan Fingerprint Receipt',
    description: 'Receipt confirming submission of Live Scan fingerprints for DOJ and FBI background check.',
    category: 'background',
    priority: 'critical',
    blocksWorkAssignment: true,
    renewalRequired: false,
    stateSpecificNotes: 'Live Scan results go directly to BSIS. Employer must retain receipt in file.',
    regulatoryCitation: 'Cal. Bus. & Prof. Code §7583.9; 16 CCR §643',
  },
  {
    id: 'ca_skills_training_16hr',
    name: 'Skills Training – First 16 Hours',
    description: 'Certificate of completion for the first 16 hours of skills training, due within 30 days of hire.',
    category: 'training',
    priority: 'critical',
    blocksWorkAssignment: false,
    renewalRequired: false,
    stateSpecificNotes: 'Must be completed within 30 days of employment. Topics include public relations, observation, report writing.',
    regulatoryCitation: 'Cal. Bus. & Prof. Code §7583.6(b); 16 CCR §643(b)',
  },
  {
    id: 'ca_skills_training_32hr',
    name: 'Skills Training – Full 32 Hours',
    description: 'Certificate of completion for the full 32 hours of skills training, due within 6 months of hire.',
    category: 'training',
    priority: 'high',
    blocksWorkAssignment: false,
    renewalRequired: false,
    stateSpecificNotes: 'Remaining 16 hours must be completed within 6 months of hire. Includes WMD/terrorism awareness.',
    regulatoryCitation: 'Cal. Bus. & Prof. Code §7583.6(c); 16 CCR §643(c)',
  },
  {
    id: 'ca_annual_ce',
    name: 'Annual Continuing Education (8 hours)',
    description: 'Proof of 8 hours of annual continuing education from a BSIS-approved provider.',
    category: 'training',
    priority: 'high',
    blocksWorkAssignment: false,
    expiryPeriodDays: 365,
    renewalRequired: true,
    stateSpecificNotes: 'Required annually. Must be from BSIS-certified training facility.',
    regulatoryCitation: 'Cal. Bus. & Prof. Code §7583.6(d)',
  },
];

const CA_ARMED_ADDITIONAL_DOCS: StateRequiredDocument[] = [
  {
    id: 'ca_firearms_permit',
    name: 'BSIS Firearms Permit',
    description: 'BSIS-issued firearms qualification permit authorizing the guard to carry a firearm on duty.',
    category: 'firearms',
    priority: 'critical',
    blocksWorkAssignment: true,
    expiryPeriodDays: 730,
    renewalRequired: true,
    stateSpecificNotes: 'Must complete firearms training course and range qualification. Valid 2 years. Must be carried while armed on duty.',
    regulatoryCitation: 'Cal. Bus. & Prof. Code §7583.37; 16 CCR §645',
  },
  {
    id: 'ca_baton_permit',
    name: 'BSIS Baton Permit',
    description: 'BSIS-issued permit to carry a baton while on security duty.',
    category: 'firearms',
    priority: 'high',
    blocksWorkAssignment: false,
    expiryPeriodDays: 730,
    renewalRequired: true,
    stateSpecificNotes: 'Required if guard carries a baton. Separate training and permit from firearms.',
    regulatoryCitation: 'Cal. Bus. & Prof. Code §7583.37; Cal. Penal Code §22295',
  },
  {
    id: 'ca_tear_gas_permit',
    name: 'Tear Gas / OC Spray Permit',
    description: 'Permit to carry tear gas or OC spray on duty. Requires completion of approved training.',
    category: 'firearms',
    priority: 'high',
    blocksWorkAssignment: false,
    expiryPeriodDays: 730,
    renewalRequired: true,
    stateSpecificNotes: 'Required if guard carries chemical agents. Training includes safety, deployment, and decontamination.',
    regulatoryCitation: 'Cal. Penal Code §22835; Cal. Bus. & Prof. Code §7583.37',
  },
];

const CA_CONFIG: StateComplianceConfig = {
  stateCode: 'CA',
  workersCompRequired: true,
  stateName: 'California',
  regulatoryBody: 'Bureau of Security and Investigative Services',
  regulatoryBodyAbbreviation: 'BSIS',
  portalUrl: 'https://www.bsis.ca.gov',
  retentionPeriodDescription: 'Duration of employment',
  retentionPeriodDays: 0,
  licenseLevels: [
    {
      id: 'ca_guard_card',
      name: 'Guard Card Registration (Unarmed)',
      description: 'Standard unarmed security guard registration under BSIS.',
      guardType: 'unarmed',
      trainingHoursRequired: 40,
      additionalTrainingNotes: 'Power to Arrest (8 hrs before registration) + 32 hrs skills training within 6 months (16 hrs in first 30 days). 8 hrs annual CE.',
      requiredDocuments: [...CA_UNARMED_DOCS],
    },
    {
      id: 'ca_armed_guard',
      name: 'Armed Security Guard',
      description: 'Security guard with BSIS firearms permit, authorized to carry a firearm on duty.',
      guardType: 'armed',
      trainingHoursRequired: 54,
      additionalTrainingNotes: 'All unarmed training (40 hrs) plus 14-hour firearms training and range qualification. Baton and tear gas permits require separate training courses.',
      requiredDocuments: [...CA_UNARMED_DOCS, ...CA_ARMED_ADDITIONAL_DOCS],
    },
  ],
  notes: [
    'BSIS conducts random inspections. Guard cards must be carried on-person while on duty.',
    'Employer retains employee records for the duration of employment per BSIS guidelines.',
    'Live Scan fingerprints are submitted electronically; results go directly to BSIS.',
    'Training certificates must be from BSIS-certified training facilities.',
  ],
};

// ---------------------------------------------------------------------------
// Florida (FL) Configuration
// ---------------------------------------------------------------------------

/**
 * FLORIDA — Department of Agriculture and Consumer Services (DACS)
 *         Division of Licensing
 *
 * Governing Law: Florida Statutes Chapter 493
 * Admin Rules: FAC Rule 5N-1
 * Portal: https://licensing.freshfromflorida.com
 *
 * License Classes:
 *   Class D – Unarmed Security Officer
 *   Class G – Armed (Statewide Firearm License, used in conjunction with Class D)
 *
 * Class D Training: 40 hours
 * Class G Training: 28 hours firearms training
 * Class G Requalification: 4 hours annually
 *
 * Retention: 3 years per FS §493.6124 (or longer if required by contract)
 */

const FL_CLASS_D_DOCS: StateRequiredDocument[] = [
  {
    id: 'fl_class_d_license',
    name: 'Class D Security Officer License',
    description: 'Florida DACS Class D unarmed security officer license.',
    category: 'licensing',
    priority: 'critical',
    blocksWorkAssignment: true,
    expiryPeriodDays: 730,
    renewalRequired: true,
    stateSpecificNotes: 'Valid 2 years. Must carry license while on duty. Renewal requires completion of continuing education.',
    regulatoryCitation: 'Fla. Stat. §493.6105; FAC 5N-1.100',
  },
  {
    id: 'fl_class_d_training',
    name: 'Class D Training Certificate (40 hours)',
    description: 'Certificate of completion of the 40-hour Class D security officer training program from a DACS-licensed training facility.',
    category: 'training',
    priority: 'critical',
    blocksWorkAssignment: true,
    renewalRequired: false,
    stateSpecificNotes: 'Must be completed before license application. Curriculum set by DACS and includes legal authority, emergency procedures, and patrol techniques.',
    regulatoryCitation: 'Fla. Stat. §493.6303(4); FAC 5N-1.132',
  },
  {
    id: 'fl_passport_photo',
    name: 'Passport-Style Photograph',
    description: 'Current passport-style color photograph meeting DACS specifications.',
    category: 'identification',
    priority: 'critical',
    blocksWorkAssignment: true,
    renewalRequired: false,
    stateSpecificNotes: 'Must meet DACS photo specifications. Required for license application.',
    regulatoryCitation: 'Fla. Stat. §493.6105(4)',
  },
  {
    id: 'fl_notarized_application',
    name: 'Notarized License Application',
    description: 'Notarized DACS application for Class D security officer license.',
    category: 'licensing',
    priority: 'critical',
    blocksWorkAssignment: true,
    renewalRequired: false,
    stateSpecificNotes: 'Application must be notarized. False statements on the application are grounds for denial.',
    regulatoryCitation: 'Fla. Stat. §493.6105',
  },
  {
    id: 'fl_fingerprints',
    name: 'Fingerprint Submission (FDLE + FBI)',
    description: 'Electronic fingerprint submission for Florida Department of Law Enforcement (FDLE) and FBI background check.',
    category: 'background',
    priority: 'critical',
    blocksWorkAssignment: true,
    renewalRequired: false,
    stateSpecificNotes: 'Must use a DACS-approved livescan vendor. Results submitted electronically to FDLE and FBI.',
    regulatoryCitation: 'Fla. Stat. §493.6105(5); FAC 5N-1.100',
  },
  {
    id: 'fl_mental_health_disclosure',
    name: 'Mental Health / Substance Abuse Disclosure',
    description: 'Disclosure of any mental health commitments or substance abuse treatment if applicable.',
    category: 'medical',
    priority: 'high',
    blocksWorkAssignment: false,
    renewalRequired: false,
    stateSpecificNotes: 'Required if applicant has history of involuntary commitment (Baker Act) or substance abuse treatment. Failure to disclose is grounds for revocation.',
    regulatoryCitation: 'Fla. Stat. §493.6106(1)(f)',
  },
];

const FL_CLASS_G_ADDITIONAL_DOCS: StateRequiredDocument[] = [
  {
    id: 'fl_class_g_license',
    name: 'Class G Statewide Firearm License',
    description: 'Florida DACS Class G license authorizing the carrying of a firearm while performing licensed security duties.',
    category: 'firearms',
    priority: 'critical',
    blocksWorkAssignment: true,
    expiryPeriodDays: 730,
    renewalRequired: true,
    stateSpecificNotes: 'Requires valid Class D license. Must carry both Class D and Class G licenses while armed on duty.',
    regulatoryCitation: 'Fla. Stat. §493.6115; FAC 5N-1.134',
  },
  {
    id: 'fl_firearms_training_28hr',
    name: 'Class G Firearms Training Certificate (28 hours)',
    description: 'Certificate of completion of the 28-hour firearms training course from a DACS-licensed Class K firearms instructor.',
    category: 'firearms',
    priority: 'critical',
    blocksWorkAssignment: true,
    renewalRequired: false,
    stateSpecificNotes: 'Training includes classroom instruction and range qualification. Must be taught by a Class K licensed instructor.',
    regulatoryCitation: 'Fla. Stat. §493.6115(2); FAC 5N-1.134',
  },
  {
    id: 'fl_firearms_requalification',
    name: 'Annual Firearms Requalification (4 hours)',
    description: 'Annual 4-hour firearms requalification from a Class K instructor, including range qualification.',
    category: 'firearms',
    priority: 'critical',
    blocksWorkAssignment: true,
    expiryPeriodDays: 365,
    renewalRequired: true,
    stateSpecificNotes: 'Must be completed annually. Failure to requalify suspends authority to carry. Range score must meet DACS minimum.',
    regulatoryCitation: 'Fla. Stat. §493.6115(8); FAC 5N-1.134(4)',
  },
];

const FL_CONFIG: StateComplianceConfig = {
  stateCode: 'FL',
  workersCompRequired: true,
  stateName: 'Florida',
  regulatoryBody: 'Department of Agriculture and Consumer Services, Division of Licensing',
  regulatoryBodyAbbreviation: 'DACS',
  portalUrl: 'https://licensing.freshfromflorida.com',
  retentionPeriodDescription: '3 years per FS §493.6124',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'fl_class_d',
      name: 'Class D – Unarmed Security Officer',
      description: 'Standard unarmed security officer license issued by DACS.',
      guardType: 'unarmed',
      trainingHoursRequired: 40,
      additionalTrainingNotes: '40-hour training from DACS-licensed school required before application.',
      requiredDocuments: [...FL_CLASS_D_DOCS],
    },
    {
      id: 'fl_class_g',
      name: 'Class D + Class G – Armed Security Officer',
      description: 'Class D license plus Class G statewide firearm license for armed duty.',
      guardType: 'armed',
      trainingHoursRequired: 68,
      additionalTrainingNotes: 'Class D (40 hrs) + Class G firearms (28 hrs). Annual 4-hr firearms requalification required.',
      requiredDocuments: [...FL_CLASS_D_DOCS, ...FL_CLASS_G_ADDITIONAL_DOCS],
    },
  ],
  notes: [
    'DACS conducts inspections of licensed agencies. All records must be available at the agency principal office.',
    'Both Class D and Class G must be carried on-person while on duty.',
    'E-Verify is required for all Florida employers with 25+ employees per Fla. Stat. §448.095.',
    'Mental health disclosure is mandatory where applicable — Baker Act commitments must be reported.',
    'Retention: 3 years per FS §493.6124, or longer if contractually required.',
  ],
};

// ---------------------------------------------------------------------------
// New York (NY) Configuration
// ---------------------------------------------------------------------------

/**
 * NEW YORK — Division of Criminal Justice Services (DCJS) &
 *            Department of State (DOS)
 *
 * Governing Law: NY General Business Law Article 7-A (§§ 89-f – 89-p)
 * Admin Rules: 19 NYCRR Part 174
 * Portal: https://www.dos.ny.gov/licensing
 *
 * Training Structure:
 *   8-hour Pre-Assignment Training – before first shift
 *   16-hour On-the-Job Training – within 90 days of hire
 *   8-hour Annual In-Service Training – each calendar year
 *   For Armed: 47-hour Firearms Training + Annual Firearms In-Service
 *
 * Registration: Valid 2 years
 */

const NY_UNARMED_DOCS: StateRequiredDocument[] = [
  {
    id: 'ny_registration_card',
    name: 'DOS Security Guard Registration Card',
    description: 'New York Department of State security guard registration card. Must be obtained before first work assignment.',
    category: 'licensing',
    priority: 'critical',
    blocksWorkAssignment: true,
    expiryPeriodDays: 730,
    renewalRequired: true,
    stateSpecificNotes: 'Valid 2 years. Employer must verify registration via DOS before assignment. Guard must carry card on duty.',
    regulatoryCitation: 'NY GBL §89-g; 19 NYCRR §174.2',
  },
  {
    id: 'ny_dos_application',
    name: 'DOS Application for Security Guard Registration',
    description: 'Completed Department of State application form for security guard registration.',
    category: 'licensing',
    priority: 'critical',
    blocksWorkAssignment: true,
    renewalRequired: false,
    stateSpecificNotes: 'Employer must submit application on behalf of the guard within the first day of employment.',
    regulatoryCitation: 'NY GBL §89-g(2)',
  },
  {
    id: 'ny_pre_assignment_training',
    name: 'Pre-Assignment Training Certificate (8 hours)',
    description: 'Certificate of completion of the 8-hour pre-assignment training course. Must be completed before the guard performs any security work.',
    category: 'training',
    priority: 'critical',
    blocksWorkAssignment: true,
    renewalRequired: false,
    stateSpecificNotes: 'MANDATORY before first shift. Covers legal powers, emergency procedures, access control, ethics. Training by DCJS-approved school only.',
    regulatoryCitation: 'NY GBL §89-n(1); 19 NYCRR §174.6',
  },
  {
    id: 'ny_ojt_training',
    name: 'On-the-Job Training Certificate (16 hours)',
    description: 'Certificate of completion of 16 hours of on-the-job training within 90 days of hire.',
    category: 'training',
    priority: 'critical',
    blocksWorkAssignment: false,
    renewalRequired: false,
    stateSpecificNotes: 'Must be completed within 90 calendar days of hire. Covers site-specific procedures, fire safety, and report writing.',
    regulatoryCitation: 'NY GBL §89-n(2); 19 NYCRR §174.6',
  },
  {
    id: 'ny_annual_inservice',
    name: 'Annual In-Service Training Certificate (8 hours)',
    description: 'Certificate of completion of 8 hours of annual in-service training each calendar year.',
    category: 'training',
    priority: 'high',
    blocksWorkAssignment: false,
    expiryPeriodDays: 365,
    renewalRequired: true,
    stateSpecificNotes: 'Required each calendar year after the first year. Must be DCJS-approved curriculum.',
    regulatoryCitation: 'NY GBL §89-n(3); 19 NYCRR §174.6',
  },
  {
    id: 'ny_fingerprint_background',
    name: 'Fingerprint-Based Background Check',
    description: 'Fingerprint submission for DCJS and FBI criminal background check.',
    category: 'background',
    priority: 'critical',
    blocksWorkAssignment: true,
    renewalRequired: false,
    stateSpecificNotes: 'Fingerprints submitted through DOS. Both NYS DCJS and FBI checks are conducted.',
    regulatoryCitation: 'NY GBL §89-g(4)',
  },
];

const NY_ARMED_ADDITIONAL_DOCS: StateRequiredDocument[] = [
  {
    id: 'ny_armed_registration',
    name: 'Armed Guard Registration / Special Armed Guard Registration',
    description: 'DOS registration authorizing the security guard to carry a firearm on duty.',
    category: 'firearms',
    priority: 'critical',
    blocksWorkAssignment: true,
    expiryPeriodDays: 730,
    renewalRequired: true,
    stateSpecificNotes: 'Requires valid unarmed registration plus completion of 47-hour firearms training. Valid 2 years.',
    regulatoryCitation: 'NY GBL §89-f(6); 19 NYCRR §174.4',
  },
  {
    id: 'ny_firearms_training_47hr',
    name: 'Firearms Training Certificate (47 hours)',
    description: 'Certificate of completion of the 47-hour firearms training course from a DCJS-approved firearms instructor.',
    category: 'firearms',
    priority: 'critical',
    blocksWorkAssignment: true,
    renewalRequired: false,
    stateSpecificNotes: 'Includes classroom instruction, handling, safety, legal aspects, and live-fire qualification. Must achieve minimum score on qualification course.',
    regulatoryCitation: 'NY GBL §89-n(4); 19 NYCRR §174.7',
  },
  {
    id: 'ny_firearms_annual_inservice',
    name: 'Annual Firearms In-Service Training',
    description: 'Annual firearms in-service training and requalification for armed security guards.',
    category: 'firearms',
    priority: 'critical',
    blocksWorkAssignment: true,
    expiryPeriodDays: 365,
    renewalRequired: true,
    stateSpecificNotes: 'Required annually. Includes range requalification. Failure to complete suspends armed authority.',
    regulatoryCitation: 'NY GBL §89-n(5); 19 NYCRR §174.7',
  },
  {
    id: 'ny_nyc_pistol_license',
    name: 'NYC Pistol License (if operating in NYC)',
    description: 'New York City Police Department pistol license required for armed security guards operating within the five boroughs.',
    category: 'firearms',
    priority: 'critical',
    blocksWorkAssignment: true,
    expiryPeriodDays: 1095,
    renewalRequired: true,
    stateSpecificNotes: 'Required IN ADDITION to DOS armed registration for guards working within NYC. Issued by NYPD License Division.',
    regulatoryCitation: 'NYC Admin. Code §10-131; 38 RCNY §5-01',
  },
];

const NY_CONFIG: StateComplianceConfig = {
  stateCode: 'NY',
  workersCompRequired: true,
  stateName: 'New York',
  regulatoryBody: 'Department of State (DOS) & Division of Criminal Justice Services (DCJS)',
  regulatoryBodyAbbreviation: 'DOS/DCJS',
  portalUrl: 'https://www.dos.ny.gov/licensing',
  retentionPeriodDescription: '3 years after termination per NY GBL §89-g',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'ny_unarmed',
      name: 'Unarmed Security Guard',
      description: 'Standard unarmed security guard registered with the Department of State.',
      guardType: 'unarmed',
      trainingHoursRequired: 24,
      additionalTrainingNotes: '8-hr Pre-Assignment (before first shift) + 16-hr OJT (within 90 days). 8-hr annual in-service each subsequent year.',
      requiredDocuments: [...NY_UNARMED_DOCS],
    },
    {
      id: 'ny_armed',
      name: 'Armed Security Guard',
      description: 'Security guard with DOS armed registration, authorized to carry a firearm on duty.',
      guardType: 'armed',
      trainingHoursRequired: 71,
      additionalTrainingNotes: 'All unarmed training (24 hrs initial) + 47-hr firearms training. Annual firearms in-service required. NYC guards also need NYPD pistol license.',
      requiredDocuments: [...NY_UNARMED_DOCS, ...NY_ARMED_ADDITIONAL_DOCS],
    },
  ],
  notes: [
    'Pre-Assignment Training (8 hrs) MUST be completed before the guard works a single shift — no exceptions.',
    'OJT (16 hrs) deadline is 90 calendar days from date of hire.',
    'NYC armed guards require BOTH DOS armed registration AND an NYPD pistol license.',
    'Employer must verify guard registration through the DOS online system before assignment.',
    'Training must be conducted by DCJS-certified instructors at DCJS-approved schools.',
  ],
};

// ---------------------------------------------------------------------------
// Illinois (IL) Configuration — DETAILED
// ---------------------------------------------------------------------------

const IL_CONFIG: StateComplianceConfig = {
  stateCode: 'IL', stateName: 'Illinois',
  workersCompRequired: true,
  regulatoryBody: 'Illinois Department of Financial and Professional Regulation',
  regulatoryBodyAbbreviation: 'IDFPR',
  portalUrl: 'https://idfpr.illinois.gov',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'il_perc_unarmed', name: 'PERC – Unarmed Security Officer',
      description: 'Unarmed security officer with Permanent Employee Registration Card.',
      guardType: 'unarmed', trainingHoursRequired: 20,
      additionalTrainingNotes: '20-hour basic training from IDFPR-approved school required before PERC issuance.',
      requiredDocuments: [
        { id: 'il_perc', name: 'Permanent Employee Registration Card (PERC)', description: 'IDFPR-issued PERC for unarmed security work. Must be obtained before deployment.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 1095, renewalRequired: true, stateSpecificNotes: 'Valid 3 years. Must be carried on duty.', regulatoryCitation: '225 ILCS 447/25-10; 68 IAC 1240.210' },
        { id: 'il_basic_training_20hr', name: 'Basic Training Certificate (20 hours)', description: 'Completion of 20-hour basic security officer training from IDFPR-approved provider.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: '225 ILCS 447/25-15; 68 IAC 1240.220' },
        { id: 'il_background_check', name: 'Fingerprint-Based Background Check', description: 'FBI and Illinois State Police fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: '225 ILCS 447/25-10(c)' },
      ],
    },
    {
      id: 'il_perc_armed', name: 'PERC + Firearm Control Card (FCC) – Armed',
      description: 'Armed security officer with PERC and Firearm Control Card.',
      guardType: 'armed', trainingHoursRequired: 40,
      additionalTrainingNotes: '20-hour basic + 20-hour firearms training with range qualification. Annual firearms requalification required.',
      requiredDocuments: [
        { id: 'il_perc', name: 'Permanent Employee Registration Card (PERC)', description: 'IDFPR-issued PERC.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 1095, renewalRequired: true, regulatoryCitation: '225 ILCS 447/25-10' },
        { id: 'il_fcc', name: 'Firearm Control Card (FCC)', description: 'IDFPR-issued FCC authorizing armed security duty.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 1095, renewalRequired: true, stateSpecificNotes: 'Requires valid PERC plus firearms training completion.', regulatoryCitation: '225 ILCS 447/28-5; 68 IAC 1240.300' },
        { id: 'il_firearms_training_20hr', name: 'Firearms Training Certificate (20 hours)', description: 'Completion of 20-hour firearms training with range qualification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: '225 ILCS 447/28-5' },
        { id: 'il_basic_training_20hr', name: 'Basic Training Certificate (20 hours)', description: 'Completion of 20-hour basic security officer training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: '225 ILCS 447/25-15' },
        { id: 'il_background_check', name: 'Fingerprint-Based Background Check', description: 'FBI and ISP fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: '225 ILCS 447/25-10(c)' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Pennsylvania (PA) Configuration — DETAILED
// ---------------------------------------------------------------------------

const PA_CONFIG: StateComplianceConfig = {
  stateCode: 'PA', stateName: 'Pennsylvania',
  workersCompRequired: true,
  regulatoryBody: 'Pennsylvania State Police, Bureau of Licensing',
  regulatoryBodyAbbreviation: 'PSP',
  portalUrl: 'https://www.psp.pa.gov',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'pa_unarmed', name: 'Unarmed Security Officer (Employer Certified)',
      description: 'Unarmed security officer. Pennsylvania does not require a state-issued individual license for unarmed guards; employer provides training.',
      guardType: 'unarmed', trainingHoursRequired: 0,
      additionalTrainingNotes: 'No state-mandated training hours for unarmed guards. Employer responsible for job-specific training. Lethal Weapons Training Act (Act 235) applies only to armed officers.',
      requiredDocuments: [
        { id: 'pa_employer_training_cert', name: 'Employer-Provided Training Certificate', description: 'Documentation of employer-provided security training.', category: 'training', priority: 'high', blocksWorkAssignment: false, renewalRequired: false, stateSpecificNotes: 'No state mandate; best practice for employer compliance.', regulatoryCitation: 'N/A — no state unarmed guard licensing' },
        { id: 'pa_background_check', name: 'Criminal Background Check (Act 34)', description: 'Pennsylvania State Police criminal background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: '18 Pa.C.S. §9101 et seq.' },
      ],
    },
    {
      id: 'pa_armed_act235', name: 'Act 235 Certified – Armed Security Officer',
      description: 'Armed security officer certified under the Lethal Weapons Training Act (Act 235).',
      guardType: 'armed', trainingHoursRequired: 40,
      additionalTrainingNotes: '40-hour Lethal Weapons Training course (Act 235). Annual requalification required. Must qualify with each weapon carried.',
      requiredDocuments: [
        { id: 'pa_act235_certification', name: 'Act 235 Lethal Weapons Certification', description: 'Pennsylvania Act 235 certification authorizing use of lethal weapons on duty.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 365, renewalRequired: true, stateSpecificNotes: 'Annual requalification required. Must qualify with each weapon carried on duty.', regulatoryCitation: '22 Pa. Code §35.1 et seq.; Act 235 of 1974' },
        { id: 'pa_act235_training_40hr', name: 'Act 235 Training Certificate (40 hours)', description: 'Completion of 40-hour Act 235 lethal weapons training from PSP-approved school.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: '22 Pa. Code §35.11' },
        { id: 'pa_background_check', name: 'Criminal Background Check (Act 34)', description: 'Pennsylvania State Police criminal background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: '18 Pa.C.S. §9101 et seq.' },
        { id: 'pa_fbi_fingerprint', name: 'FBI Fingerprint Check (Act 73)', description: 'Federal fingerprint-based background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Act 73 of 2007; 28 CFR §16.30 et seq.' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// New Jersey (NJ) Configuration — DETAILED
// ---------------------------------------------------------------------------

const NJ_CONFIG: StateComplianceConfig = {
  stateCode: 'NJ', stateName: 'New Jersey',
  workersCompRequired: true,
  regulatoryBody: 'New Jersey State Police, Security Officer Registration Unit',
  regulatoryBodyAbbreviation: 'NJSP-SORA',
  portalUrl: 'https://www.njsp.org/private-detective/security-officer.shtml',
  retentionPeriodDescription: '5 years from last date of employment',
  retentionPeriodDays: 1825,
  licenseLevels: [
    {
      id: 'nj_sora_unarmed', name: 'SORA Registration – Unarmed Security Officer',
      description: 'Unarmed security officer registered under the Security Officer Registration Act (SORA).',
      guardType: 'unarmed', trainingHoursRequired: 24,
      additionalTrainingNotes: '24 hours of training within 90 days of employment. Includes 8-hour pre-assignment course.',
      requiredDocuments: [
        { id: 'nj_sora_id', name: 'SORA Registration ID Card', description: 'New Jersey SORA identification card issued by the Superintendent of State Police.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, stateSpecificNotes: 'Valid 2 years. Must be carried on duty. Employer must verify registration.', regulatoryCitation: 'N.J.S.A. 45:19A-3; N.J.A.C. 13:55A-1.3' },
        { id: 'nj_sora_training_24hr', name: 'SORA Training Certificate (24 hours)', description: 'Completion of 24-hour security officer training per SORA requirements.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'N.J.S.A. 45:19A-6; N.J.A.C. 13:55A-1.7' },
        { id: 'nj_fingerprint_background', name: 'Fingerprint-Based Background Check', description: 'State Police and FBI fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'N.J.S.A. 45:19A-4' },
      ],
    },
    {
      id: 'nj_sora_armed', name: 'SORA Registration + Armed – Security Officer',
      description: 'Armed security officer with SORA registration and NJ firearms authorization.',
      guardType: 'armed', trainingHoursRequired: 48,
      additionalTrainingNotes: '24-hour SORA training + additional firearms training. NJ firearms permits are highly restrictive; employer must obtain appropriate permits.',
      requiredDocuments: [
        { id: 'nj_sora_id', name: 'SORA Registration ID Card', description: 'NJ SORA identification card.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'N.J.S.A. 45:19A-3' },
        { id: 'nj_sora_training_24hr', name: 'SORA Training Certificate (24 hours)', description: 'Completion of 24-hour SORA training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'N.J.S.A. 45:19A-6' },
        { id: 'nj_firearms_permit', name: 'Permit to Carry Firearm', description: 'NJ Superior Court-issued permit to carry a handgun.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, stateSpecificNotes: 'NJ has very restrictive carry laws. Permit issued by Superior Court judge.', regulatoryCitation: 'N.J.S.A. 2C:58-4' },
        { id: 'nj_firearms_training', name: 'Firearms Qualification Certificate', description: 'Completion of firearms training and range qualification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: true, expiryPeriodDays: 365, regulatoryCitation: 'N.J.S.A. 2C:58-4(d)' },
        { id: 'nj_fingerprint_background', name: 'Fingerprint-Based Background Check', description: 'State Police and FBI fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'N.J.S.A. 45:19A-4' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Virginia (VA) Configuration — DETAILED
// ---------------------------------------------------------------------------

const VA_CONFIG: StateComplianceConfig = {
  stateCode: 'VA', stateName: 'Virginia',
  workersCompRequired: true,
  regulatoryBody: 'Virginia Department of Criminal Justice Services',
  regulatoryBodyAbbreviation: 'DCJS',
  portalUrl: 'https://www.dcjs.virginia.gov',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'va_unarmed', name: 'Unarmed Security Officer Registration',
      description: 'Unarmed security officer registered with DCJS.',
      guardType: 'unarmed', trainingHoursRequired: 18,
      additionalTrainingNotes: '18 hours of entry-level training: includes legal authority, report writing, safety, and ethics. Must be completed within 90 days of employment.',
      requiredDocuments: [
        { id: 'va_registration', name: 'DCJS Security Officer Registration', description: 'Virginia DCJS registration for unarmed security work.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, stateSpecificNotes: 'Valid 2 years. Must carry registration on duty.', regulatoryCitation: 'Va. Code §9.1-139; 6 VAC 20-171-30' },
        { id: 'va_entry_training_18hr', name: 'Entry-Level Training Certificate (18 hours)', description: 'Completion of 18-hour entry-level security officer training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Va. Code §9.1-141; 6 VAC 20-171-360' },
        { id: 'va_background_check', name: 'Fingerprint-Based Background Check', description: 'Virginia State Police and FBI fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Va. Code §9.1-139(E)' },
      ],
    },
    {
      id: 'va_armed', name: 'Armed Security Officer Registration',
      description: 'Armed security officer registered with DCJS.',
      guardType: 'armed', trainingHoursRequired: 42,
      additionalTrainingNotes: '18 hours entry-level + 24 hours firearms training. Annual firearms requalification and 4-hour in-service training required.',
      requiredDocuments: [
        { id: 'va_registration', name: 'DCJS Security Officer Registration', description: 'Virginia DCJS registration.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'Va. Code §9.1-139' },
        { id: 'va_entry_training_18hr', name: 'Entry-Level Training Certificate (18 hours)', description: 'Completion of 18-hour entry-level training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Va. Code §9.1-141' },
        { id: 'va_firearms_training_24hr', name: 'Firearms Training Certificate (24 hours)', description: 'Completion of 24-hour firearms training with range qualification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: '6 VAC 20-171-370' },
        { id: 'va_firearms_requalification', name: 'Annual Firearms Requalification', description: 'Annual firearms range requalification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 365, renewalRequired: true, regulatoryCitation: '6 VAC 20-171-370' },
        { id: 'va_background_check', name: 'Fingerprint-Based Background Check', description: 'Virginia State Police and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Va. Code §9.1-139(E)' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Georgia (GA) Configuration — DETAILED
// ---------------------------------------------------------------------------

const GA_CONFIG: StateComplianceConfig = {
  stateCode: 'GA', stateName: 'Georgia',
  workersCompRequired: true,
  regulatoryBody: 'Georgia Board of Private Detective and Security Agencies',
  regulatoryBodyAbbreviation: 'BPDSA',
  portalUrl: 'https://sos.ga.gov/PLB',
  retentionPeriodDescription: '2 years from last date of employment',
  retentionPeriodDays: 730,
  licenseLevels: [
    {
      id: 'ga_unarmed', name: 'Unarmed Security Officer Registration',
      description: 'Unarmed security officer registered with the Georgia Board.',
      guardType: 'unarmed', trainingHoursRequired: 24,
      additionalTrainingNotes: '24-hour basic security officer training required prior to registration.',
      requiredDocuments: [
        { id: 'ga_registration', name: 'Security Officer Registration', description: 'Georgia Board-issued security officer registration.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'O.C.G.A. §43-38-7; Ga. Comp. R. & Regs. 509-3-.10' },
        { id: 'ga_training_24hr', name: 'Basic Training Certificate (24 hours)', description: 'Completion of 24-hour basic security officer training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'O.C.G.A. §43-38-7.1' },
        { id: 'ga_background_check', name: 'Criminal Background Check', description: 'GBI and FBI fingerprint-based background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'O.C.G.A. §43-38-6' },
      ],
    },
    {
      id: 'ga_armed', name: 'Armed Security Officer Registration',
      description: 'Armed security officer registered with the Georgia Board.',
      guardType: 'armed', trainingHoursRequired: 28,
      additionalTrainingNotes: '24-hour basic training + additional firearms training. Georgia Weapons Carry License may be required.',
      requiredDocuments: [
        { id: 'ga_registration', name: 'Security Officer Registration', description: 'Georgia Board-issued registration.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'O.C.G.A. §43-38-7' },
        { id: 'ga_training_24hr', name: 'Basic Training Certificate (24 hours)', description: 'Completion of 24-hour basic training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'O.C.G.A. §43-38-7.1' },
        { id: 'ga_firearms_qualification', name: 'Firearms Qualification Certificate', description: 'Firearms training and range qualification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: true, expiryPeriodDays: 365, regulatoryCitation: 'O.C.G.A. §43-38-10' },
        { id: 'ga_background_check', name: 'Criminal Background Check', description: 'GBI and FBI fingerprint-based background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'O.C.G.A. §43-38-6' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Ohio (OH) Configuration — DETAILED
// ---------------------------------------------------------------------------

const OH_CONFIG: StateComplianceConfig = {
  stateCode: 'OH', stateName: 'Ohio',
  workersCompRequired: true,
  regulatoryBody: 'Ohio Department of Public Safety, Private Investigator Security Guard Services',
  regulatoryBodyAbbreviation: 'ODPS-PISGS',
  portalUrl: 'https://www.ohiopublicsafety.com/pisgs',
  retentionPeriodDescription: '2 years from last date of employment',
  retentionPeriodDays: 730,
  licenseLevels: [
    {
      id: 'oh_unarmed', name: 'Unarmed Security Guard Registration',
      description: 'Unarmed security guard registered with ODPS.',
      guardType: 'unarmed', trainingHoursRequired: 20,
      additionalTrainingNotes: '20-hour basic security guard training. Must be completed through approved training program.',
      requiredDocuments: [
        { id: 'oh_registration', name: 'Security Guard Registration', description: 'Ohio PISGS security guard registration card.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'ORC §4749.06; OAC 4501:21-1' },
        { id: 'oh_training_20hr', name: 'Basic Training Certificate (20 hours)', description: 'Completion of 20-hour basic security guard training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'ORC §4749.06(B)' },
        { id: 'oh_background_check', name: 'BCI&I and FBI Background Check', description: 'Ohio BCI&I and FBI fingerprint-based background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'ORC §4749.03(B)' },
      ],
    },
    {
      id: 'oh_armed', name: 'Armed Security Guard Registration',
      description: 'Armed security guard registered with ODPS.',
      guardType: 'armed', trainingHoursRequired: 40,
      additionalTrainingNotes: '20-hour basic + 20-hour armed guard training with firearms qualification.',
      requiredDocuments: [
        { id: 'oh_registration', name: 'Security Guard Registration', description: 'Ohio PISGS registration card.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'ORC §4749.06' },
        { id: 'oh_training_20hr', name: 'Basic Training Certificate (20 hours)', description: 'Completion of 20-hour basic training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'ORC §4749.06(B)' },
        { id: 'oh_firearms_training', name: 'Armed Guard Training Certificate (20 hours)', description: 'Completion of 20-hour armed guard training with firearms qualification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'ORC §4749.06(C)' },
        { id: 'oh_firearms_requalification', name: 'Annual Firearms Requalification', description: 'Annual firearms range requalification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 365, renewalRequired: true, regulatoryCitation: 'ORC §4749.06(C)' },
        { id: 'oh_background_check', name: 'BCI&I and FBI Background Check', description: 'Ohio BCI&I and FBI fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'ORC §4749.03(B)' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Massachusetts (MA) Configuration — DETAILED
// ---------------------------------------------------------------------------

const MA_CONFIG: StateComplianceConfig = {
  stateCode: 'MA', stateName: 'Massachusetts',
  workersCompRequired: true,
  regulatoryBody: 'Local Police Departments (Municipal Licensing)',
  regulatoryBodyAbbreviation: 'LPD',
  portalUrl: 'https://www.mass.gov/how-to/apply-for-a-watch-guard-or-patrol-agency-license',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'ma_watch_guard', name: 'Watch Guard / Patrol License (Unarmed)',
      description: 'Unarmed watch, guard, or patrol license issued by local chief of police.',
      guardType: 'unarmed', trainingHoursRequired: 0,
      additionalTrainingNotes: 'No state-mandated training hours. Local licensing authority may impose additional requirements. License issued by municipal chief of police.',
      requiredDocuments: [
        { id: 'ma_local_license', name: 'Municipal Watch/Guard License', description: 'License issued by local chief of police under M.G.L. c. 147.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 365, renewalRequired: true, stateSpecificNotes: 'Issued by local police department. Requirements vary by municipality.', regulatoryCitation: 'M.G.L. c. 147, §22' },
        { id: 'ma_cori_check', name: 'CORI Background Check', description: 'Criminal Offender Record Information (CORI) background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'M.G.L. c. 6, §172' },
      ],
    },
    {
      id: 'ma_armed', name: 'Armed Watch Guard with LTC',
      description: 'Armed security officer with License to Carry (LTC) firearms.',
      guardType: 'armed', trainingHoursRequired: 16,
      additionalTrainingNotes: 'Requires Massachusetts License to Carry (LTC). Firearms safety training required. LTC issued by local chief of police.',
      requiredDocuments: [
        { id: 'ma_local_license', name: 'Municipal Watch/Guard License', description: 'Local chief of police-issued license.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 365, renewalRequired: true, regulatoryCitation: 'M.G.L. c. 147, §22' },
        { id: 'ma_ltc', name: 'License to Carry Firearms (LTC)', description: 'Massachusetts LTC issued by local licensing authority.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 2190, renewalRequired: true, stateSpecificNotes: 'Valid 6 years. Issued by local chief of police. Unrestricted LTC required for armed guard duty.', regulatoryCitation: 'M.G.L. c. 140, §131' },
        { id: 'ma_firearms_training', name: 'Firearms Safety Training Certificate', description: 'Completion of approved firearms safety course.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'M.G.L. c. 140, §131P' },
        { id: 'ma_cori_check', name: 'CORI Background Check', description: 'Criminal Offender Record Information check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'M.G.L. c. 6, §172' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Michigan (MI) Configuration — DETAILED
// ---------------------------------------------------------------------------

const MI_CONFIG: StateComplianceConfig = {
  stateCode: 'MI', stateName: 'Michigan',
  workersCompRequired: true,
  regulatoryBody: 'Michigan Department of Licensing and Regulatory Affairs',
  regulatoryBodyAbbreviation: 'LARA',
  portalUrl: 'https://www.michigan.gov/lara',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'mi_unarmed', name: 'Unarmed Security Guard (Company Licensed)',
      description: 'Unarmed security guard employed by a LARA-licensed security company. Michigan licenses companies, not individual unarmed guards.',
      guardType: 'unarmed', trainingHoursRequired: 0,
      additionalTrainingNotes: 'No state-mandated individual license for unarmed guards. Company must hold valid Private Security Guard Agency License. Employer responsible for training.',
      requiredDocuments: [
        { id: 'mi_employer_training', name: 'Employer-Provided Training Documentation', description: 'Documentation of employer-provided security training.', category: 'training', priority: 'high', blocksWorkAssignment: false, renewalRequired: false, stateSpecificNotes: 'Employer must document training provided. No state minimum hours.', regulatoryCitation: 'MCL 338.1067' },
        { id: 'mi_background_check', name: 'Criminal Background Check', description: 'Michigan State Police (ICHAT) and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'MCL 338.1067' },
      ],
    },
    {
      id: 'mi_armed', name: 'Armed Security Guard with CPL',
      description: 'Armed security guard with Michigan Concealed Pistol License.',
      guardType: 'armed', trainingHoursRequired: 8,
      additionalTrainingNotes: 'Requires Michigan Concealed Pistol License (CPL). 8-hour CPL training course required.',
      requiredDocuments: [
        { id: 'mi_cpl', name: 'Concealed Pistol License (CPL)', description: 'Michigan CPL for armed security duty.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 1825, renewalRequired: true, stateSpecificNotes: 'Valid 5 years. Must be renewed before expiry.', regulatoryCitation: 'MCL 28.425b' },
        { id: 'mi_cpl_training', name: 'CPL Training Certificate (8 hours)', description: 'Completion of 8-hour CPL training including range qualification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'MCL 28.425j' },
        { id: 'mi_background_check', name: 'Criminal Background Check', description: 'Michigan State Police and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'MCL 338.1067' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Arizona (AZ) Configuration — DETAILED
// ---------------------------------------------------------------------------

const AZ_CONFIG: StateComplianceConfig = {
  stateCode: 'AZ', stateName: 'Arizona',
  workersCompRequired: true,
  regulatoryBody: 'Arizona Department of Public Safety',
  regulatoryBodyAbbreviation: 'AZ-DPS',
  portalUrl: 'https://www.azdps.gov/services/public/guard',
  retentionPeriodDescription: '2 years from last date of employment',
  retentionPeriodDays: 730,
  licenseLevels: [
    {
      id: 'az_unarmed', name: 'Unarmed Security Guard Registration',
      description: 'Unarmed security guard registered with Arizona DPS.',
      guardType: 'unarmed', trainingHoursRequired: 8,
      additionalTrainingNotes: '8-hour pre-assignment training required before deployment.',
      requiredDocuments: [
        { id: 'az_guard_registration', name: 'Security Guard Registration Card', description: 'Arizona DPS security guard registration card.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, stateSpecificNotes: 'Valid 2 years. Must be carried on duty.', regulatoryCitation: 'ARS §32-2622; AAC R13-5-102' },
        { id: 'az_pre_assignment_8hr', name: 'Pre-Assignment Training Certificate (8 hours)', description: 'Completion of 8-hour pre-assignment security guard training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'ARS §32-2632; AAC R13-5-106' },
        { id: 'az_fingerprint_clearance', name: 'Fingerprint Clearance Card', description: 'Arizona DPS fingerprint clearance card.', category: 'background', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 2190, renewalRequired: true, stateSpecificNotes: 'Valid 6 years. Must be obtained before registration.', regulatoryCitation: 'ARS §41-1758.07' },
      ],
    },
    {
      id: 'az_armed', name: 'Armed Security Guard Registration',
      description: 'Armed security guard registered with Arizona DPS.',
      guardType: 'armed', trainingHoursRequired: 24,
      additionalTrainingNotes: '8-hour pre-assignment + 16-hour firearms training with range qualification.',
      requiredDocuments: [
        { id: 'az_guard_registration', name: 'Security Guard Registration Card', description: 'Arizona DPS registration card.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'ARS §32-2622' },
        { id: 'az_pre_assignment_8hr', name: 'Pre-Assignment Training Certificate (8 hours)', description: 'Completion of 8-hour pre-assignment training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'ARS §32-2632' },
        { id: 'az_firearms_training', name: 'Firearms Training Certificate (16 hours)', description: 'Completion of 16-hour firearms training with range qualification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'ARS §32-2632(D)' },
        { id: 'az_firearms_requalification', name: 'Annual Firearms Requalification', description: 'Annual firearms range requalification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 365, renewalRequired: true, regulatoryCitation: 'ARS §32-2632(E)' },
        { id: 'az_fingerprint_clearance', name: 'Fingerprint Clearance Card', description: 'Arizona DPS fingerprint clearance card.', category: 'background', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 2190, renewalRequired: true, regulatoryCitation: 'ARS §41-1758.07' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Nevada (NV) Configuration — DETAILED
// ---------------------------------------------------------------------------

const NV_CONFIG: StateComplianceConfig = {
  stateCode: 'NV', stateName: 'Nevada',
  workersCompRequired: true,
  regulatoryBody: 'Nevada Private Investigators Licensing Board',
  regulatoryBodyAbbreviation: 'PILB',
  portalUrl: 'https://pilb.nv.gov',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'nv_unarmed', name: 'Unarmed Security Guard – Work Card',
      description: 'Unarmed security guard with PILB work card.',
      guardType: 'unarmed', trainingHoursRequired: 8,
      additionalTrainingNotes: '8-hour pre-assignment training. Additional 16 hours within first 60 days of employment.',
      requiredDocuments: [
        { id: 'nv_work_card', name: 'PILB Security Guard Work Card', description: 'Nevada PILB-issued security guard work card.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 1825, renewalRequired: true, stateSpecificNotes: 'Valid 5 years. Must be carried on duty.', regulatoryCitation: 'NRS 648.060; NAC 648.345' },
        { id: 'nv_training_8hr', name: 'Pre-Assignment Training Certificate (8 hours)', description: 'Completion of 8-hour pre-assignment security guard training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'NRS 648.140; NAC 648.350' },
        { id: 'nv_background_check', name: 'Background Investigation', description: 'PILB-conducted background investigation including fingerprints.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'NRS 648.100' },
      ],
    },
    {
      id: 'nv_armed', name: 'Armed Security Guard – Work Card + Firearms Permit',
      description: 'Armed security guard with PILB work card and firearms permit.',
      guardType: 'armed', trainingHoursRequired: 48,
      additionalTrainingNotes: '8-hour pre-assignment + 40-hour firearms training with range qualification. Annual firearms requalification required.',
      requiredDocuments: [
        { id: 'nv_work_card', name: 'PILB Security Guard Work Card', description: 'Nevada PILB work card.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 1825, renewalRequired: true, regulatoryCitation: 'NRS 648.060' },
        { id: 'nv_firearms_permit', name: 'PILB Firearms Permit', description: 'PILB-issued firearms permit for armed security duty.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 1825, renewalRequired: true, regulatoryCitation: 'NRS 648.148' },
        { id: 'nv_firearms_training_40hr', name: 'Firearms Training Certificate (40 hours)', description: 'Completion of 40-hour firearms training with range qualification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'NRS 648.148; NAC 648.365' },
        { id: 'nv_background_check', name: 'Background Investigation', description: 'PILB-conducted background investigation.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'NRS 648.100' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// North Carolina (NC) Configuration — DETAILED
// ---------------------------------------------------------------------------

const NC_CONFIG: StateComplianceConfig = {
  stateCode: 'NC', stateName: 'North Carolina',
  workersCompRequired: true,
  regulatoryBody: 'North Carolina Private Protective Services Board',
  regulatoryBodyAbbreviation: 'PPSB',
  portalUrl: 'https://www.ncdps.gov/ppsb',
  retentionPeriodDescription: '2 years from last date of employment',
  retentionPeriodDays: 730,
  licenseLevels: [
    {
      id: 'nc_unarmed', name: 'Unarmed Security Guard Registration',
      description: 'Unarmed security guard registered with the NC Private Protective Services Board.',
      guardType: 'unarmed', trainingHoursRequired: 16,
      additionalTrainingNotes: '16-hour unarmed security guard training. Must complete within 30 days of employment.',
      requiredDocuments: [
        { id: 'nc_registration', name: 'PPSB Security Guard Registration', description: 'North Carolina PPSB registration permit.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'NCGS §74C-11; 12 NCAC 07D .0700' },
        { id: 'nc_training_16hr', name: 'Unarmed Training Certificate (16 hours)', description: 'Completion of 16-hour unarmed security guard training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'NCGS §74C-13(b); 12 NCAC 07D .0707' },
        { id: 'nc_background_check', name: 'SBI and FBI Background Check', description: 'NC State Bureau of Investigation and FBI fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'NCGS §74C-8(d)' },
      ],
    },
    {
      id: 'nc_armed', name: 'Armed Security Guard Registration',
      description: 'Armed security guard registered with the NC PPSB.',
      guardType: 'armed', trainingHoursRequired: 36,
      additionalTrainingNotes: '16-hour unarmed training + 20-hour firearms training with range qualification.',
      requiredDocuments: [
        { id: 'nc_registration', name: 'PPSB Security Guard Registration', description: 'NC PPSB registration permit.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'NCGS §74C-11' },
        { id: 'nc_training_16hr', name: 'Unarmed Training Certificate (16 hours)', description: 'Completion of 16-hour basic training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'NCGS §74C-13(b)' },
        { id: 'nc_firearms_training_20hr', name: 'Firearms Training Certificate (20 hours)', description: 'Completion of 20-hour firearms training with range qualification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'NCGS §74C-13(c)' },
        { id: 'nc_firearms_requalification', name: 'Annual Firearms Requalification', description: 'Annual firearms range requalification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 365, renewalRequired: true, regulatoryCitation: 'NCGS §74C-13(f)' },
        { id: 'nc_background_check', name: 'SBI and FBI Background Check', description: 'NC SBI and FBI fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'NCGS §74C-8(d)' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Maryland (MD) Configuration — DETAILED
// ---------------------------------------------------------------------------

const MD_CONFIG: StateComplianceConfig = {
  stateCode: 'MD', stateName: 'Maryland',
  workersCompRequired: true,
  regulatoryBody: 'Maryland State Police, Licensing Division',
  regulatoryBodyAbbreviation: 'MSP',
  portalUrl: 'https://mdsp.maryland.gov/Organization/Pages/CriminalInvestigationBureau/LicensingDivision.aspx',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'md_unarmed', name: 'Unarmed Security Guard Registration',
      description: 'Unarmed security guard registered with MSP Licensing Division.',
      guardType: 'unarmed', trainingHoursRequired: 16,
      additionalTrainingNotes: '16-hour pre-assignment training. Additional on-the-job training within first 90 days.',
      requiredDocuments: [
        { id: 'md_registration', name: 'Security Guard Registration Card', description: 'Maryland State Police security guard registration.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'Md. Code Ann., Bus. Occ. & Prof. §13-301; COMAR 29.03.02' },
        { id: 'md_training_16hr', name: 'Pre-Assignment Training Certificate (16 hours)', description: 'Completion of 16-hour pre-assignment security guard training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Md. Code Ann., Bus. Occ. & Prof. §13-304' },
        { id: 'md_background_check', name: 'Fingerprint-Based Background Check', description: 'Maryland CJIS and FBI fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Md. Code Ann., Bus. Occ. & Prof. §13-301(e)' },
      ],
    },
    {
      id: 'md_armed', name: 'Armed Security Guard Registration',
      description: 'Armed security guard registered with MSP with firearm authorization.',
      guardType: 'armed', trainingHoursRequired: 40,
      additionalTrainingNotes: '16-hour pre-assignment + 24-hour firearms training. Handgun Qualification License (HQL) required.',
      requiredDocuments: [
        { id: 'md_registration', name: 'Security Guard Registration Card', description: 'MSP security guard registration.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'Md. Code Ann., Bus. Occ. & Prof. §13-301' },
        { id: 'md_training_16hr', name: 'Pre-Assignment Training Certificate (16 hours)', description: 'Completion of 16-hour pre-assignment training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Md. Code Ann., Bus. Occ. & Prof. §13-304' },
        { id: 'md_hql', name: 'Handgun Qualification License (HQL)', description: 'Maryland HQL required for handgun possession.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 3650, renewalRequired: true, regulatoryCitation: 'Md. Code Ann., Pub. Safety §5-117.1' },
        { id: 'md_firearms_training', name: 'Firearms Training Certificate', description: 'Completion of firearms training with range qualification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: true, expiryPeriodDays: 365, regulatoryCitation: 'COMAR 29.03.02.06' },
        { id: 'md_background_check', name: 'Fingerprint-Based Background Check', description: 'Maryland CJIS and FBI fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Md. Code Ann., Bus. Occ. & Prof. §13-301(e)' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Connecticut (CT) Configuration — DETAILED
// ---------------------------------------------------------------------------

const CT_CONFIG: StateComplianceConfig = {
  stateCode: 'CT', stateName: 'Connecticut',
  workersCompRequired: true,
  regulatoryBody: 'Connecticut Department of Emergency Services and Public Protection',
  regulatoryBodyAbbreviation: 'DESPP',
  portalUrl: 'https://portal.ct.gov/despp',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'ct_unarmed', name: 'Unarmed Security Officer License',
      description: 'Unarmed security officer licensed by DESPP.',
      guardType: 'unarmed', trainingHoursRequired: 8,
      additionalTrainingNotes: '8-hour security officer training course. Must complete before license issuance.',
      requiredDocuments: [
        { id: 'ct_security_license', name: 'Security Officer License', description: 'Connecticut DESPP security officer license.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 1825, renewalRequired: true, stateSpecificNotes: 'Valid 5 years. Must be carried on duty.', regulatoryCitation: 'Conn. Gen. Stat. §29-161a' },
        { id: 'ct_training_8hr', name: 'Security Officer Training Certificate (8 hours)', description: 'Completion of 8-hour security officer training course.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Conn. Gen. Stat. §29-161a(c)' },
        { id: 'ct_background_check', name: 'Criminal Background Check', description: 'Connecticut State Police and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Conn. Gen. Stat. §29-161a(b)' },
      ],
    },
    {
      id: 'ct_armed', name: 'Armed Security Officer License',
      description: 'Armed security officer with DESPP license and pistol permit.',
      guardType: 'armed', trainingHoursRequired: 24,
      additionalTrainingNotes: '8-hour basic + NRA or equivalent firearms course. Connecticut Pistol Permit required.',
      requiredDocuments: [
        { id: 'ct_security_license', name: 'Security Officer License', description: 'Connecticut DESPP security officer license.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 1825, renewalRequired: true, regulatoryCitation: 'Conn. Gen. Stat. §29-161a' },
        { id: 'ct_pistol_permit', name: 'Connecticut State Permit to Carry Pistol/Revolver', description: 'CT pistol permit required for armed security duty.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 1825, renewalRequired: true, regulatoryCitation: 'Conn. Gen. Stat. §29-28' },
        { id: 'ct_firearms_training', name: 'Firearms Training Certificate', description: 'Completion of approved firearms training course.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Conn. Gen. Stat. §29-28(b)' },
        { id: 'ct_background_check', name: 'Criminal Background Check', description: 'CT State Police and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Conn. Gen. Stat. §29-161a(b)' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Minnesota (MN) Configuration — DETAILED
// ---------------------------------------------------------------------------

const MN_CONFIG: StateComplianceConfig = {
  stateCode: 'MN', stateName: 'Minnesota',
  workersCompRequired: true,
  regulatoryBody: 'Minnesota Board of Private Detective and Protective Agent Services',
  regulatoryBodyAbbreviation: 'MN-PDPA',
  portalUrl: 'https://dps.mn.gov/divisions/pdb',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'mn_unarmed', name: 'Unarmed Protective Agent (Company Licensed)',
      description: 'Unarmed protective agent employed by a Board-licensed company. Minnesota licenses companies; individual certification through employer.',
      guardType: 'unarmed', trainingHoursRequired: 6,
      additionalTrainingNotes: '6-hour pre-assignment training. Employer must be licensed by the Board.',
      requiredDocuments: [
        { id: 'mn_employee_certificate', name: 'Employee Certificate of Authority', description: 'Certificate issued upon completion of training and background check.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'Minn. Stat. §326.3361; Minn. R. 7506.0600' },
        { id: 'mn_training_6hr', name: 'Pre-Assignment Training Certificate (6 hours)', description: 'Completion of 6-hour pre-assignment training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Minn. Stat. §326.3361; Minn. R. 7506.0700' },
        { id: 'mn_background_check', name: 'BCA and FBI Background Check', description: 'Minnesota Bureau of Criminal Apprehension and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Minn. Stat. §326.336' },
      ],
    },
    {
      id: 'mn_armed', name: 'Armed Protective Agent',
      description: 'Armed protective agent with Board authorization.',
      guardType: 'armed', trainingHoursRequired: 30,
      additionalTrainingNotes: '6-hour pre-assignment + 24-hour firearms training. Minnesota Permit to Carry required.',
      requiredDocuments: [
        { id: 'mn_employee_certificate', name: 'Employee Certificate of Authority', description: 'Certificate with armed endorsement.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'Minn. Stat. §326.3361' },
        { id: 'mn_permit_to_carry', name: 'Minnesota Permit to Carry', description: 'Minnesota permit to carry a pistol.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 1825, renewalRequired: true, regulatoryCitation: 'Minn. Stat. §624.714' },
        { id: 'mn_firearms_training', name: 'Firearms Training Certificate', description: 'Completion of firearms training and range qualification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: true, expiryPeriodDays: 365, regulatoryCitation: 'Minn. R. 7506.0800' },
        { id: 'mn_background_check', name: 'BCA and FBI Background Check', description: 'MN BCA and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Minn. Stat. §326.336' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Washington (WA) Configuration — DETAILED
// ---------------------------------------------------------------------------

const WA_CONFIG: StateComplianceConfig = {
  stateCode: 'WA', stateName: 'Washington',
  workersCompRequired: true,
  regulatoryBody: 'Washington State Department of Licensing',
  regulatoryBodyAbbreviation: 'DOL',
  portalUrl: 'https://www.dol.wa.gov/business/security',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'wa_unarmed', name: 'Unarmed Private Security Guard License',
      description: 'Unarmed security guard licensed by Washington DOL.',
      guardType: 'unarmed', trainingHoursRequired: 8,
      additionalTrainingNotes: '8-hour pre-assignment training. Additional 16 hours within first 6 months. Annual 4-hour continuing education.',
      requiredDocuments: [
        { id: 'wa_guard_license', name: 'Private Security Guard License', description: 'Washington DOL security guard license.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, stateSpecificNotes: 'Valid 2 years. Must carry while on duty.', regulatoryCitation: 'RCW 18.170.040; WAC 308-18-030' },
        { id: 'wa_pre_assignment_8hr', name: 'Pre-Assignment Training Certificate (8 hours)', description: 'Completion of 8-hour pre-assignment security guard training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'RCW 18.170.060; WAC 308-18-060' },
        { id: 'wa_background_check', name: 'WSP and FBI Background Check', description: 'Washington State Patrol and FBI fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'RCW 18.170.040(3)' },
      ],
    },
    {
      id: 'wa_armed', name: 'Armed Private Security Guard License',
      description: 'Armed security guard licensed by Washington DOL.',
      guardType: 'armed', trainingHoursRequired: 24,
      additionalTrainingNotes: '8-hour pre-assignment + additional firearms training. Annual firearms requalification required.',
      requiredDocuments: [
        { id: 'wa_guard_license', name: 'Private Security Guard License', description: 'Washington DOL security guard license.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'RCW 18.170.040' },
        { id: 'wa_pre_assignment_8hr', name: 'Pre-Assignment Training Certificate (8 hours)', description: 'Completion of 8-hour pre-assignment training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'RCW 18.170.060' },
        { id: 'wa_firearms_certification', name: 'Firearms Certification', description: 'DOL firearms certification for armed security duty.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 365, renewalRequired: true, regulatoryCitation: 'RCW 18.170.060; WAC 308-18-080' },
        { id: 'wa_background_check', name: 'WSP and FBI Background Check', description: 'Washington State Patrol and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'RCW 18.170.040(3)' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Oregon (OR) Configuration — DETAILED
// ---------------------------------------------------------------------------

const OR_CONFIG: StateComplianceConfig = {
  stateCode: 'OR', stateName: 'Oregon',
  workersCompRequired: true,
  regulatoryBody: 'Oregon Department of Public Safety Standards and Training',
  regulatoryBodyAbbreviation: 'DPSST',
  portalUrl: 'https://www.oregon.gov/dpsst',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'or_unarmed', name: 'Unarmed Private Security Professional',
      description: 'Unarmed private security professional certified by DPSST.',
      guardType: 'unarmed', trainingHoursRequired: 14,
      additionalTrainingNotes: '14-hour basic security training from DPSST-approved provider.',
      requiredDocuments: [
        { id: 'or_certification', name: 'DPSST Private Security Professional Certification', description: 'Oregon DPSST certification for unarmed security work.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'ORS 181A.870; OAR 259-060-0020' },
        { id: 'or_training_14hr', name: 'Basic Training Certificate (14 hours)', description: 'Completion of 14-hour basic security professional training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'ORS 181A.870; OAR 259-060-0130' },
        { id: 'or_background_check', name: 'Criminal Background Check', description: 'Oregon State Police and FBI fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'ORS 181A.870(3)' },
      ],
    },
    {
      id: 'or_armed', name: 'Armed Private Security Professional',
      description: 'Armed private security professional certified by DPSST with firearms endorsement.',
      guardType: 'armed', trainingHoursRequired: 38,
      additionalTrainingNotes: '14-hour basic + 24-hour firearms training with range qualification. Annual firearms requalification.',
      requiredDocuments: [
        { id: 'or_certification', name: 'DPSST Private Security Professional Certification', description: 'Oregon DPSST certification.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'ORS 181A.870' },
        { id: 'or_training_14hr', name: 'Basic Training Certificate (14 hours)', description: 'Completion of 14-hour basic training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'ORS 181A.870' },
        { id: 'or_firearms_training', name: 'Firearms Training Certificate (24 hours)', description: 'Completion of 24-hour firearms training with range qualification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'OAR 259-060-0140' },
        { id: 'or_firearms_requalification', name: 'Annual Firearms Requalification', description: 'Annual firearms requalification with range score.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 365, renewalRequired: true, regulatoryCitation: 'OAR 259-060-0140' },
        { id: 'or_background_check', name: 'Criminal Background Check', description: 'Oregon State Police and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'ORS 181A.870(3)' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Colorado (CO) Configuration — DETAILED
// ---------------------------------------------------------------------------

const CO_CONFIG: StateComplianceConfig = {
  stateCode: 'CO', stateName: 'Colorado',
  workersCompRequired: true,
  regulatoryBody: 'No statewide regulatory body (local jurisdictions may apply)',
  regulatoryBodyAbbreviation: 'N/A',
  portalUrl: 'https://www.colorado.gov/dora',
  retentionPeriodDescription: '3 years from last date of employment (employer best practice)',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'co_unarmed', name: 'Unarmed Security Guard (No State License Required)',
      description: 'Unarmed security guard. Colorado does not require state-level individual licensing for security guards. Some municipalities (Denver, Aurora) may require local registration.',
      guardType: 'unarmed', trainingHoursRequired: 0,
      additionalTrainingNotes: 'No state-mandated training. Local jurisdictions may impose requirements. Employer responsible for job-specific training.',
      requiredDocuments: [
        { id: 'co_employer_training', name: 'Employer-Provided Training Documentation', description: 'Documentation of employer-provided security training.', category: 'training', priority: 'high', blocksWorkAssignment: false, renewalRequired: false, stateSpecificNotes: 'No state mandate. Best practice.', regulatoryCitation: 'N/A — no state guard licensing' },
        { id: 'co_background_check', name: 'CBI Background Check', description: 'Colorado Bureau of Investigation background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Employer best practice; CRS §24-72-301 et seq.' },
      ],
    },
    {
      id: 'co_armed', name: 'Armed Security Guard',
      description: 'Armed security guard. No state armed guard license; concealed carry permit may be needed.',
      guardType: 'armed', trainingHoursRequired: 0,
      additionalTrainingNotes: 'No state-mandated armed guard training. Colorado is a shall-issue concealed carry state. Employer should ensure firearms training.',
      requiredDocuments: [
        { id: 'co_ccw_permit', name: 'Concealed Handgun Permit (CHP)', description: 'Colorado concealed handgun permit.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 1825, renewalRequired: true, regulatoryCitation: 'CRS §18-12-203' },
        { id: 'co_firearms_training', name: 'Firearms Training Certificate', description: 'Completion of firearms safety/training course.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'CRS §18-12-203(1)(h)' },
        { id: 'co_background_check', name: 'CBI Background Check', description: 'Colorado Bureau of Investigation background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'CRS §24-72-301 et seq.' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Tennessee (TN) Configuration — DETAILED
// ---------------------------------------------------------------------------

const TN_CONFIG: StateComplianceConfig = {
  stateCode: 'TN', stateName: 'Tennessee',
  workersCompRequired: true,
  regulatoryBody: 'Tennessee Department of Commerce & Insurance, Private Protective Services',
  regulatoryBodyAbbreviation: 'TDCI-PPS',
  portalUrl: 'https://www.tn.gov/commerce/regboards/private-protective-services.html',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'tn_unarmed', name: 'Unarmed Security Guard/Officer Registration',
      description: 'Unarmed security guard registered under the Tennessee Private Protective Services Licensing Act.',
      guardType: 'unarmed', trainingHoursRequired: 16,
      additionalTrainingNotes: '16-hour pre-assignment training required. Annual in-service training.',
      requiredDocuments: [
        { id: 'tn_registration', name: 'Security Guard Registration', description: 'Tennessee security guard registration through TDCI.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'TCA §62-35-116; Tenn. Comp. R. & Regs. 0780-05-02' },
        { id: 'tn_training_16hr', name: 'Pre-Assignment Training Certificate (16 hours)', description: 'Completion of 16-hour pre-assignment security training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'TCA §62-35-118' },
        { id: 'tn_background_check', name: 'TBI and FBI Background Check', description: 'Tennessee Bureau of Investigation and FBI fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'TCA §62-35-116(b)' },
      ],
    },
    {
      id: 'tn_armed', name: 'Armed Security Guard/Officer Registration',
      description: 'Armed security guard registered with TDCI.',
      guardType: 'armed', trainingHoursRequired: 40,
      additionalTrainingNotes: '16-hour pre-assignment + 24-hour firearms training. Tennessee Enhanced Handgun Carry Permit may be required.',
      requiredDocuments: [
        { id: 'tn_registration', name: 'Security Guard Registration', description: 'Tennessee security guard registration.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'TCA §62-35-116' },
        { id: 'tn_training_16hr', name: 'Pre-Assignment Training Certificate (16 hours)', description: 'Completion of 16-hour training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'TCA §62-35-118' },
        { id: 'tn_firearms_training', name: 'Firearms Training Certificate', description: 'Completion of firearms training and range qualification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: true, expiryPeriodDays: 365, regulatoryCitation: 'TCA §62-35-118' },
        { id: 'tn_background_check', name: 'TBI and FBI Background Check', description: 'TBI and FBI fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'TCA §62-35-116(b)' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Louisiana (LA) Configuration — DETAILED
// ---------------------------------------------------------------------------

const LA_CONFIG: StateComplianceConfig = {
  stateCode: 'LA', stateName: 'Louisiana',
  workersCompRequired: true,
  regulatoryBody: 'Louisiana State Board of Private Security Examiners',
  regulatoryBodyAbbreviation: 'LSBPSE',
  portalUrl: 'https://lsbpse.com',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'la_unarmed', name: 'Unarmed Security Officer Registration',
      description: 'Unarmed security officer registered with LSBPSE.',
      guardType: 'unarmed', trainingHoursRequired: 8,
      additionalTrainingNotes: '8-hour pre-assignment training. Additional on-the-job training within 90 days.',
      requiredDocuments: [
        { id: 'la_registration', name: 'LSBPSE Security Officer Registration', description: 'Louisiana Board security officer registration card.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'La. R.S. 37:3282; LAC 46:LXI.701' },
        { id: 'la_training_8hr', name: 'Pre-Assignment Training Certificate (8 hours)', description: 'Completion of 8-hour pre-assignment training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'La. R.S. 37:3286; LAC 46:LXI.901' },
        { id: 'la_background_check', name: 'LSP and FBI Background Check', description: 'Louisiana State Police and FBI fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'La. R.S. 37:3282(B)' },
      ],
    },
    {
      id: 'la_armed', name: 'Armed Security Officer Registration',
      description: 'Armed security officer registered with LSBPSE.',
      guardType: 'armed', trainingHoursRequired: 56,
      additionalTrainingNotes: '8-hour pre-assignment + 48-hour firearms training. Annual firearms requalification required.',
      requiredDocuments: [
        { id: 'la_registration', name: 'LSBPSE Security Officer Registration', description: 'Louisiana Board registration card.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'La. R.S. 37:3282' },
        { id: 'la_training_8hr', name: 'Pre-Assignment Training Certificate (8 hours)', description: 'Completion of 8-hour pre-assignment training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'La. R.S. 37:3286' },
        { id: 'la_firearms_training', name: 'Firearms Training Certificate (48 hours)', description: 'Completion of 48-hour firearms training with range qualification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'La. R.S. 37:3286; LAC 46:LXI.903' },
        { id: 'la_firearms_requalification', name: 'Annual Firearms Requalification', description: 'Annual firearms requalification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 365, renewalRequired: true, regulatoryCitation: 'LAC 46:LXI.905' },
        { id: 'la_background_check', name: 'LSP and FBI Background Check', description: 'Louisiana State Police and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'La. R.S. 37:3282(B)' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// South Carolina (SC) Configuration — DETAILED
// ---------------------------------------------------------------------------

const SC_CONFIG: StateComplianceConfig = {
  stateCode: 'SC', stateName: 'South Carolina',
  workersCompRequired: true,
  regulatoryBody: 'South Carolina Law Enforcement Division',
  regulatoryBodyAbbreviation: 'SLED',
  portalUrl: 'https://www.sled.sc.gov',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'sc_unarmed', name: 'Unarmed Security Officer Registration',
      description: 'Unarmed security officer registered with SLED.',
      guardType: 'unarmed', trainingHoursRequired: 8,
      additionalTrainingNotes: '8-hour basic security officer training.',
      requiredDocuments: [
        { id: 'sc_registration', name: 'SLED Security Officer Registration', description: 'South Carolina SLED security officer registration.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'S.C. Code §40-18-80' },
        { id: 'sc_training_8hr', name: 'Basic Training Certificate (8 hours)', description: 'Completion of 8-hour basic security officer training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'S.C. Code §40-18-100' },
        { id: 'sc_background_check', name: 'SLED and FBI Background Check', description: 'SLED and FBI fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'S.C. Code §40-18-60' },
      ],
    },
    {
      id: 'sc_armed', name: 'Armed Security Officer Registration',
      description: 'Armed security officer registered with SLED.',
      guardType: 'armed', trainingHoursRequired: 24,
      additionalTrainingNotes: '8-hour basic + 16-hour firearms training with range qualification.',
      requiredDocuments: [
        { id: 'sc_registration', name: 'SLED Security Officer Registration', description: 'SLED security officer registration.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'S.C. Code §40-18-80' },
        { id: 'sc_training_8hr', name: 'Basic Training Certificate (8 hours)', description: 'Completion of 8-hour basic training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'S.C. Code §40-18-100' },
        { id: 'sc_firearms_training', name: 'Firearms Training Certificate (16 hours)', description: 'Completion of 16-hour firearms training with qualification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: true, expiryPeriodDays: 365, regulatoryCitation: 'S.C. Code §40-18-100(B)' },
        { id: 'sc_background_check', name: 'SLED and FBI Background Check', description: 'SLED and FBI fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'S.C. Code §40-18-60' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Alabama (AL) Configuration — DETAILED
// ---------------------------------------------------------------------------

const AL_CONFIG: StateComplianceConfig = {
  stateCode: 'AL', stateName: 'Alabama',
  workersCompRequired: true,
  regulatoryBody: 'Alabama Security Regulatory Board',
  regulatoryBodyAbbreviation: 'ASRB',
  portalUrl: 'https://asbpi.alabama.gov',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'al_unarmed', name: 'Unarmed Security Officer Registration',
      description: 'Unarmed security officer registered with the Alabama Security Regulatory Board.',
      guardType: 'unarmed', trainingHoursRequired: 14,
      additionalTrainingNotes: '14-hour basic security officer training required.',
      requiredDocuments: [
        { id: 'al_registration', name: 'ASRB Security Officer Registration', description: 'Alabama ASRB security officer registration.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'Ala. Code §34-44-7; Ala. Admin. Code 741-X-3' },
        { id: 'al_training_14hr', name: 'Basic Training Certificate (14 hours)', description: 'Completion of 14-hour basic security officer training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Ala. Code §34-44-7(c)' },
        { id: 'al_background_check', name: 'ALEA and FBI Background Check', description: 'Alabama Law Enforcement Agency and FBI fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Ala. Code §34-44-7(b)' },
      ],
    },
    {
      id: 'al_armed', name: 'Armed Security Officer Registration',
      description: 'Armed security officer registered with ASRB.',
      guardType: 'armed', trainingHoursRequired: 30,
      additionalTrainingNotes: '14-hour basic + 16-hour firearms training with range qualification.',
      requiredDocuments: [
        { id: 'al_registration', name: 'ASRB Security Officer Registration', description: 'Alabama ASRB registration.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'Ala. Code §34-44-7' },
        { id: 'al_training_14hr', name: 'Basic Training Certificate (14 hours)', description: 'Completion of 14-hour basic training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Ala. Code §34-44-7(c)' },
        { id: 'al_firearms_training', name: 'Firearms Training Certificate', description: 'Completion of firearms training and range qualification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: true, expiryPeriodDays: 365, regulatoryCitation: 'Ala. Admin. Code 741-X-3-.06' },
        { id: 'al_background_check', name: 'ALEA and FBI Background Check', description: 'ALEA and FBI fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Ala. Code §34-44-7(b)' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Indiana (IN) Configuration — DETAILED
// ---------------------------------------------------------------------------

const IN_CONFIG: StateComplianceConfig = {
  stateCode: 'IN', stateName: 'Indiana',
  workersCompRequired: true,
  regulatoryBody: 'Indiana Private Investigator and Security Guard Licensing Board',
  regulatoryBodyAbbreviation: 'PISGLB',
  portalUrl: 'https://www.in.gov/pla/professions/private-investigator-and-security-guard',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'in_unarmed', name: 'Unarmed Security Guard License',
      description: 'Unarmed security guard licensed by the Indiana PISGLB.',
      guardType: 'unarmed', trainingHoursRequired: 0,
      additionalTrainingNotes: 'No state-mandated minimum training hours for unarmed guards. Employer-provided training required. Board may establish additional requirements.',
      requiredDocuments: [
        { id: 'in_license', name: 'Security Guard License', description: 'Indiana PISGLB security guard license.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'IC 25-30-1-3; 812 IAC 5-1' },
        { id: 'in_background_check', name: 'State and FBI Background Check', description: 'Indiana State Police and FBI fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'IC 25-30-1-5.2' },
      ],
    },
    {
      id: 'in_armed', name: 'Armed Security Guard License',
      description: 'Armed security guard licensed by the Indiana PISGLB.',
      guardType: 'armed', trainingHoursRequired: 16,
      additionalTrainingNotes: 'Firearms training required. Indiana License to Carry Handgun required.',
      requiredDocuments: [
        { id: 'in_license', name: 'Security Guard License', description: 'Indiana PISGLB license.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'IC 25-30-1-3' },
        { id: 'in_ltch', name: 'License to Carry Handgun (LTCH)', description: 'Indiana License to Carry Handgun.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: true, stateSpecificNotes: 'Lifetime or 5-year license available.', regulatoryCitation: 'IC 35-47-2-3' },
        { id: 'in_firearms_training', name: 'Firearms Training Certificate', description: 'Completion of firearms training and qualification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: '812 IAC 5-1' },
        { id: 'in_background_check', name: 'State and FBI Background Check', description: 'Indiana State Police and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'IC 25-30-1-5.2' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Missouri (MO) Configuration — DETAILED
// ---------------------------------------------------------------------------

const MO_CONFIG: StateComplianceConfig = {
  stateCode: 'MO', stateName: 'Missouri',
  workersCompRequired: true,
  regulatoryBody: 'No statewide regulatory body (local jurisdictions: St. Louis, Kansas City)',
  regulatoryBodyAbbreviation: 'N/A',
  portalUrl: 'https://www.mo.gov',
  retentionPeriodDescription: '3 years from last date of employment (employer best practice)',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'mo_unarmed', name: 'Unarmed Security Guard (No State License Required)',
      description: 'Unarmed security guard. Missouri does not have state-level individual guard licensing. St. Louis and Kansas City have local registration requirements.',
      guardType: 'unarmed', trainingHoursRequired: 0,
      additionalTrainingNotes: 'No state-mandated training. Local municipalities (St. Louis: Board of Police Commissioners; Kansas City: KCPD) may require registration.',
      requiredDocuments: [
        { id: 'mo_employer_training', name: 'Employer-Provided Training Documentation', description: 'Documentation of employer-provided security training.', category: 'training', priority: 'high', blocksWorkAssignment: false, renewalRequired: false, regulatoryCitation: 'N/A — no state guard licensing' },
        { id: 'mo_background_check', name: 'Criminal Background Check', description: 'Missouri State Highway Patrol background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Employer best practice; RSMo §610.120' },
      ],
    },
    {
      id: 'mo_armed', name: 'Armed Security Guard',
      description: 'Armed security guard. Missouri is a constitutional carry state; no permit required to carry, but employer may require CCW endorsement.',
      guardType: 'armed', trainingHoursRequired: 0,
      additionalTrainingNotes: 'No state-mandated armed guard training. Missouri is permitless carry. Employer should ensure firearms proficiency.',
      requiredDocuments: [
        { id: 'mo_firearms_training', name: 'Firearms Training Certificate', description: 'Employer-required firearms training and qualification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: true, expiryPeriodDays: 365, regulatoryCitation: 'Employer requirement; RSMo §571.111' },
        { id: 'mo_background_check', name: 'Criminal Background Check', description: 'Missouri State Highway Patrol background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'RSMo §610.120' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Wisconsin (WI) Configuration — DETAILED
// ---------------------------------------------------------------------------

const WI_CONFIG: StateComplianceConfig = {
  stateCode: 'WI', stateName: 'Wisconsin',
  workersCompRequired: true,
  regulatoryBody: 'Wisconsin Department of Safety and Professional Services',
  regulatoryBodyAbbreviation: 'DSPS',
  portalUrl: 'https://dsps.wi.gov',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'wi_unarmed', name: 'Unarmed Private Security Person (Company Licensed)',
      description: 'Unarmed security person employed by a DSPS-licensed private detective/security agency. Wisconsin licenses agencies, not individual guards.',
      guardType: 'unarmed', trainingHoursRequired: 0,
      additionalTrainingNotes: 'No state-mandated individual training hours. Company must hold valid Private Detective/Security Agency License. Employer provides training.',
      requiredDocuments: [
        { id: 'wi_credentials', name: 'Credential Card', description: 'Credential card issued by the licensed agency.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, stateSpecificNotes: 'Must carry while on duty. Issued by employing agency.', regulatoryCitation: 'Wis. Stat. §440.26(5m)' },
        { id: 'wi_background_check', name: 'Criminal Background Check', description: 'Wisconsin DOJ and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Wis. Stat. §440.26' },
      ],
    },
    {
      id: 'wi_armed', name: 'Armed Private Security Person',
      description: 'Armed security person with Wisconsin Concealed Carry License (CCL).',
      guardType: 'armed', trainingHoursRequired: 0,
      additionalTrainingNotes: 'Wisconsin Concealed Carry License required. No additional state-mandated firearms training beyond CCL requirements.',
      requiredDocuments: [
        { id: 'wi_credentials', name: 'Credential Card', description: 'Credential card from licensed agency.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'Wis. Stat. §440.26(5m)' },
        { id: 'wi_ccl', name: 'Concealed Carry License (CCL)', description: 'Wisconsin CCL for armed security duty.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 1825, renewalRequired: true, regulatoryCitation: 'Wis. Stat. §175.60' },
        { id: 'wi_background_check', name: 'Criminal Background Check', description: 'Wisconsin DOJ and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Wis. Stat. §440.26' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Oklahoma (OK) Configuration — DETAILED
// ---------------------------------------------------------------------------

const OK_CONFIG: StateComplianceConfig = {
  stateCode: 'OK', stateName: 'Oklahoma',
  workersCompRequired: true,
  regulatoryBody: 'Council on Law Enforcement Education and Training',
  regulatoryBodyAbbreviation: 'CLEET',
  portalUrl: 'https://www.ok.gov/cleet',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'ok_unarmed', name: 'Phase I – Unarmed Security Guard',
      description: 'Unarmed security guard licensed by CLEET (Phase I).',
      guardType: 'unarmed', trainingHoursRequired: 40,
      additionalTrainingNotes: '40-hour Phase I (unarmed) security guard training from CLEET-approved school.',
      requiredDocuments: [
        { id: 'ok_phase1_license', name: 'CLEET Phase I Security Guard License', description: 'Oklahoma CLEET Phase I unarmed security guard license.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, stateSpecificNotes: 'Valid 2 years. Must carry license while on duty.', regulatoryCitation: '59 O.S. §1750.3; OAC 390:35-1-4' },
        { id: 'ok_phase1_training_40hr', name: 'Phase I Training Certificate (40 hours)', description: 'Completion of 40-hour Phase I unarmed security guard training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: '59 O.S. §1750.5; OAC 390:35-5-5' },
        { id: 'ok_background_check', name: 'OSBI and FBI Background Check', description: 'Oklahoma State Bureau of Investigation and FBI fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: '59 O.S. §1750.3(B)' },
      ],
    },
    {
      id: 'ok_armed', name: 'Phase II – Armed Security Guard',
      description: 'Armed security guard licensed by CLEET (Phase II).',
      guardType: 'armed', trainingHoursRequired: 72,
      additionalTrainingNotes: '40-hour Phase I + 32-hour Phase II (armed) training including firearms qualification.',
      requiredDocuments: [
        { id: 'ok_phase2_license', name: 'CLEET Phase II Armed Security Guard License', description: 'Oklahoma CLEET Phase II armed security guard license.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: '59 O.S. §1750.4; OAC 390:35-1-4' },
        { id: 'ok_phase1_training_40hr', name: 'Phase I Training Certificate (40 hours)', description: 'Completion of 40-hour Phase I training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: '59 O.S. §1750.5' },
        { id: 'ok_phase2_training_32hr', name: 'Phase II Firearms Training Certificate (32 hours)', description: 'Completion of 32-hour Phase II armed training with firearms qualification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: '59 O.S. §1750.5; OAC 390:35-5-6' },
        { id: 'ok_firearms_requalification', name: 'Annual Firearms Requalification', description: 'Annual firearms requalification through CLEET.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 365, renewalRequired: true, regulatoryCitation: 'OAC 390:35-5-9' },
        { id: 'ok_background_check', name: 'OSBI and FBI Background Check', description: 'OSBI and FBI fingerprint background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: '59 O.S. §1750.3(B)' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// STANDARD States — Basic License + Federal Requirements
// ---------------------------------------------------------------------------

const AK_CONFIG: StateComplianceConfig = {
  stateCode: 'AK', stateName: 'Alaska',
  workersCompRequired: true,
  regulatoryBody: 'Alaska Department of Public Safety (no individual guard license required)',
  regulatoryBodyAbbreviation: 'AK-DPS',
  portalUrl: 'https://dps.alaska.gov',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [{
    id: 'ak_guard', name: 'Security Guard (No State License Required)',
    description: 'Alaska does not require individual state licensing for security guards. Company must hold a business license.',
    guardType: 'unarmed', trainingHoursRequired: 0,
    requiredDocuments: [
      { id: 'ak_background_check', name: 'Criminal Background Check', description: 'Alaska State Troopers background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'AS §18.65.087' },
    ],
  }],
};

const AR_CONFIG: StateComplianceConfig = {
  stateCode: 'AR', stateName: 'Arkansas',
  workersCompRequired: true,
  regulatoryBody: 'Arkansas Board of Private Investigators and Private Security Agencies',
  regulatoryBodyAbbreviation: 'BPIPSA',
  portalUrl: 'https://www.ark.org/asp/index.php',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [{
    id: 'ar_unarmed', name: 'Unarmed Security Officer (Company Licensed)',
    description: 'Unarmed security officer employed by a Board-licensed security company.',
    guardType: 'unarmed', trainingHoursRequired: 0,
    additionalTrainingNotes: 'Arkansas licenses security companies, not individual unarmed guards.',
    requiredDocuments: [
      { id: 'ar_background_check', name: 'ASP and FBI Background Check', description: 'Arkansas State Police and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Ark. Code Ann. §17-40-308' },
    ],
  }],
};

const DC_CONFIG: StateComplianceConfig = {
  stateCode: 'DC', stateName: 'District of Columbia',
  workersCompRequired: true,
  regulatoryBody: 'District of Columbia Metropolitan Police Department, Security Officers Management Branch',
  regulatoryBodyAbbreviation: 'MPD-SOMB',
  portalUrl: 'https://mpdc.dc.gov/node/209622',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [
    {
      id: 'dc_unarmed', name: 'Unarmed Special Police Officer (SPO)',
      description: 'Unarmed Special Police Officer licensed by DC Metropolitan Police.',
      guardType: 'unarmed', trainingHoursRequired: 40,
      additionalTrainingNotes: '40-hour pre-assignment training. Must pass written examination.',
      requiredDocuments: [
        { id: 'dc_spo_license', name: 'Special Police Officer License', description: 'DC MPD Special Police Officer license.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'DC Code §47-2839.01; 17 DCMR §700' },
        { id: 'dc_training_40hr', name: 'SPO Training Certificate (40 hours)', description: 'Completion of 40-hour SPO training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: '17 DCMR §708' },
        { id: 'dc_background_check', name: 'MPD Background Investigation', description: 'DC Metropolitan Police background investigation.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'DC Code §47-2839.01(b)' },
      ],
    },
    {
      id: 'dc_armed', name: 'Armed Special Police Officer (SPO)',
      description: 'Armed Special Police Officer with firearms authorization.',
      guardType: 'armed', trainingHoursRequired: 80,
      additionalTrainingNotes: '40-hour SPO training + 40-hour firearms training. Annual firearms requalification required.',
      requiredDocuments: [
        { id: 'dc_spo_license', name: 'Special Police Officer License', description: 'DC MPD SPO license.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'DC Code §47-2839.01' },
        { id: 'dc_training_40hr', name: 'SPO Training Certificate (40 hours)', description: 'Completion of 40-hour SPO training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: '17 DCMR §708' },
        { id: 'dc_firearms_training', name: 'Firearms Training Certificate (40 hours)', description: 'Completion of 40-hour firearms training with qualification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: '17 DCMR §710' },
        { id: 'dc_firearms_requalification', name: 'Annual Firearms Requalification', description: 'Annual firearms range requalification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 365, renewalRequired: true, regulatoryCitation: '17 DCMR §710' },
        { id: 'dc_background_check', name: 'MPD Background Investigation', description: 'DC Metropolitan Police background investigation.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'DC Code §47-2839.01(b)' },
      ],
    },
  ],
};

const DE_CONFIG: StateComplianceConfig = {
  stateCode: 'DE', stateName: 'Delaware',
  workersCompRequired: true,
  regulatoryBody: 'Delaware Board of Private Investigators and Private Security Agencies',
  regulatoryBodyAbbreviation: 'BPIPSA',
  portalUrl: 'https://dpr.delaware.gov/boards/privateinvestigators',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [{
    id: 'de_unarmed', name: 'Unarmed Security Guard Registration',
    description: 'Unarmed security guard registered with the Delaware Board.',
    guardType: 'unarmed', trainingHoursRequired: 16,
    requiredDocuments: [
      { id: 'de_registration', name: 'Security Guard Registration', description: 'Delaware Board security guard registration.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'Del. Code Ann. tit. 24, §1301 et seq.' },
      { id: 'de_training', name: 'Training Certificate (16 hours)', description: 'Completion of 16-hour security guard training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Del. Code Ann. tit. 24, §1304' },
      { id: 'de_background_check', name: 'SBI and FBI Background Check', description: 'Delaware SBI and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Del. Code Ann. tit. 24, §1302' },
    ],
  }],
};

const HI_CONFIG: StateComplianceConfig = {
  stateCode: 'HI', stateName: 'Hawaii',
  workersCompRequired: true,
  regulatoryBody: 'Hawaii Board of Private Detectives and Guards',
  regulatoryBodyAbbreviation: 'BPDG',
  portalUrl: 'https://cca.hawaii.gov/pvl/boards/detective',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [{
    id: 'hi_guard', name: 'Security Guard Registration',
    description: 'Security guard registered with the Hawaii Board of Private Detectives and Guards.',
    guardType: 'unarmed', trainingHoursRequired: 8,
    requiredDocuments: [
      { id: 'hi_guard_card', name: 'Guard Registration Card', description: 'Hawaii Board-issued guard registration card.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'HRS §463-10; HAR §16-97' },
      { id: 'hi_training', name: 'Guard Training Certificate', description: 'Completion of guard training program.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'HRS §463-10.5' },
      { id: 'hi_background_check', name: 'Criminal Background Check', description: 'Hawaii Criminal Justice Data Center background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'HRS §463-9' },
    ],
  }],
};

const IA_CONFIG: StateComplianceConfig = {
  stateCode: 'IA', stateName: 'Iowa',
  workersCompRequired: true,
  regulatoryBody: 'Iowa Department of Public Safety (no individual guard license required)',
  regulatoryBodyAbbreviation: 'IA-DPS',
  portalUrl: 'https://dps.iowa.gov',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [{
    id: 'ia_guard', name: 'Security Guard (No Individual State License)',
    description: 'Iowa does not require individual state licensing for security guards. Security companies must be registered.',
    guardType: 'unarmed', trainingHoursRequired: 0,
    requiredDocuments: [
      { id: 'ia_background_check', name: 'Criminal Background Check', description: 'Iowa DCI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Iowa Code §80A.4' },
    ],
  }],
};

const ID_CONFIG: StateComplianceConfig = {
  stateCode: 'ID', stateName: 'Idaho',
  workersCompRequired: true,
  regulatoryBody: 'Idaho Bureau of Occupational Licenses (no individual guard license)',
  regulatoryBodyAbbreviation: 'IBOL',
  portalUrl: 'https://ibol.idaho.gov',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [{
    id: 'id_guard', name: 'Security Guard (No State License Required)',
    description: 'Idaho does not require individual state licensing for security guards.',
    guardType: 'unarmed', trainingHoursRequired: 0,
    requiredDocuments: [
      { id: 'id_background_check', name: 'Criminal Background Check', description: 'Idaho State Police background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Idaho Code §54-1601 et seq.' },
    ],
  }],
};

const KS_CONFIG: StateComplianceConfig = {
  stateCode: 'KS', stateName: 'Kansas',
  workersCompRequired: true,
  regulatoryBody: 'Kansas Bureau of Investigation (no individual guard license)',
  regulatoryBodyAbbreviation: 'KBI',
  portalUrl: 'https://www.kansas.gov/kbi',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [{
    id: 'ks_guard', name: 'Security Guard (No Individual State License)',
    description: 'Kansas does not require individual state licensing for security guards. Detective agencies are licensed by the KBI.',
    guardType: 'unarmed', trainingHoursRequired: 0,
    requiredDocuments: [
      { id: 'ks_background_check', name: 'KBI and FBI Background Check', description: 'Kansas Bureau of Investigation and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'K.S.A. §75-7b01 et seq.' },
    ],
  }],
};

const KY_CONFIG: StateComplianceConfig = {
  stateCode: 'KY', stateName: 'Kentucky',
  workersCompRequired: true,
  regulatoryBody: 'Kentucky Board of Licensure for Private Investigators',
  regulatoryBodyAbbreviation: 'KBLPI',
  portalUrl: 'https://kblpi.ky.gov',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [{
    id: 'ky_guard', name: 'Security Guard Registration',
    description: 'Security guard registered with the Kentucky Board.',
    guardType: 'unarmed', trainingHoursRequired: 0,
    additionalTrainingNotes: 'Kentucky licenses companies; individual guards must be registered. No state-mandated minimum training hours.',
    requiredDocuments: [
      { id: 'ky_registration', name: 'Security Guard Registration', description: 'Kentucky Board security guard registration.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'KRS §329A.035' },
      { id: 'ky_background_check', name: 'KSP and FBI Background Check', description: 'Kentucky State Police and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'KRS §329A.035(3)' },
    ],
  }],
};

const ME_CONFIG: StateComplianceConfig = {
  stateCode: 'ME', stateName: 'Maine',
  workersCompRequired: true,
  regulatoryBody: 'Maine State Police, Licensing Division',
  regulatoryBodyAbbreviation: 'MSP',
  portalUrl: 'https://www.maine.gov/dps/msp',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [{
    id: 'me_guard', name: 'Security Guard License',
    description: 'Security guard licensed by the Maine State Police.',
    guardType: 'unarmed', trainingHoursRequired: 0,
    requiredDocuments: [
      { id: 'me_license', name: 'Security Guard License', description: 'Maine State Police security guard license.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 365, renewalRequired: true, regulatoryCitation: '32 MRSA §9401 et seq.' },
      { id: 'me_background_check', name: 'SBI and FBI Background Check', description: 'Maine SBI and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: '32 MRSA §9404' },
    ],
  }],
};

const MS_CONFIG: StateComplianceConfig = {
  stateCode: 'MS', stateName: 'Mississippi',
  workersCompRequired: true,
  regulatoryBody: 'Mississippi Department of Public Safety (no individual guard license)',
  regulatoryBodyAbbreviation: 'MS-DPS',
  portalUrl: 'https://www.dps.state.ms.us',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [{
    id: 'ms_guard', name: 'Security Guard (No Individual State License)',
    description: 'Mississippi does not require individual state licensing for security guards. Security companies must be licensed.',
    guardType: 'unarmed', trainingHoursRequired: 0,
    requiredDocuments: [
      { id: 'ms_background_check', name: 'Criminal Background Check', description: 'Mississippi DPS background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Miss. Code Ann. §73-23-1 et seq.' },
    ],
  }],
};

const MT_CONFIG: StateComplianceConfig = {
  stateCode: 'MT', stateName: 'Montana',
  workersCompRequired: true,
  regulatoryBody: 'Montana Board of Private Security',
  regulatoryBodyAbbreviation: 'BPS',
  portalUrl: 'https://boards.bsd.dli.mt.gov/private-security',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [{
    id: 'mt_guard', name: 'Security Guard License',
    description: 'Security guard licensed by the Montana Board of Private Security.',
    guardType: 'unarmed', trainingHoursRequired: 0,
    requiredDocuments: [
      { id: 'mt_license', name: 'Security Guard License', description: 'Montana Board of Private Security guard license.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'MCA §37-60-301 et seq.' },
      { id: 'mt_background_check', name: 'Criminal Background Check', description: 'Montana DOJ and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'MCA §37-60-303' },
    ],
  }],
};

const ND_CONFIG: StateComplianceConfig = {
  stateCode: 'ND', stateName: 'North Dakota',
  workersCompRequired: true,
  regulatoryBody: 'North Dakota Private Investigation and Security Board',
  regulatoryBodyAbbreviation: 'NPISB',
  portalUrl: 'https://www.nd.gov/npisb',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [{
    id: 'nd_guard', name: 'Security Guard License',
    description: 'Security guard licensed by the North Dakota PISB.',
    guardType: 'unarmed', trainingHoursRequired: 0,
    requiredDocuments: [
      { id: 'nd_license', name: 'Security Guard License', description: 'North Dakota PISB security guard license.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'NDCC §43-30-03' },
      { id: 'nd_background_check', name: 'BCI and FBI Background Check', description: 'North Dakota BCI and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'NDCC §43-30-03(2)' },
    ],
  }],
};

const NE_CONFIG: StateComplianceConfig = {
  stateCode: 'NE', stateName: 'Nebraska',
  workersCompRequired: true,
  regulatoryBody: 'Nebraska Secretary of State',
  regulatoryBodyAbbreviation: 'NE-SOS',
  portalUrl: 'https://sos.nebraska.gov',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [{
    id: 'ne_guard', name: 'Security Guard Registration',
    description: 'Security guard registered under the Nebraska Private Detective Licensing Act.',
    guardType: 'unarmed', trainingHoursRequired: 0,
    requiredDocuments: [
      { id: 'ne_registration', name: 'Security Guard Registration', description: 'Nebraska Secretary of State security guard registration.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'Neb. Rev. Stat. §71-3201 et seq.' },
      { id: 'ne_background_check', name: 'NSP and FBI Background Check', description: 'Nebraska State Patrol and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Neb. Rev. Stat. §71-3208' },
    ],
  }],
};

const NH_CONFIG: StateComplianceConfig = {
  stateCode: 'NH', stateName: 'New Hampshire',
  workersCompRequired: true,
  regulatoryBody: 'New Hampshire Department of Safety (no individual guard license)',
  regulatoryBodyAbbreviation: 'NH-DOS',
  portalUrl: 'https://www.nh.gov/safety',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [{
    id: 'nh_guard', name: 'Security Guard (No State License Required)',
    description: 'New Hampshire does not require individual state licensing for security guards.',
    guardType: 'unarmed', trainingHoursRequired: 0,
    requiredDocuments: [
      { id: 'nh_background_check', name: 'Criminal Background Check', description: 'New Hampshire State Police background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'RSA 106-F; employer best practice' },
    ],
  }],
};

const NM_CONFIG: StateComplianceConfig = {
  stateCode: 'NM', stateName: 'New Mexico',
  workersCompRequired: true,
  regulatoryBody: 'New Mexico Regulation and Licensing Department, Private Investigations Advisory Board',
  regulatoryBodyAbbreviation: 'RLD-PIAB',
  portalUrl: 'https://www.rld.nm.gov',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [{
    id: 'nm_guard', name: 'Security Guard Registration',
    description: 'Security guard registered with the New Mexico RLD.',
    guardType: 'unarmed', trainingHoursRequired: 16,
    requiredDocuments: [
      { id: 'nm_registration', name: 'Security Guard Registration', description: 'New Mexico RLD security guard registration.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'NMSA 1978 §61-27B-7' },
      { id: 'nm_training', name: 'Security Guard Training Certificate', description: 'Completion of required security guard training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'NMSA 1978 §61-27B-9' },
      { id: 'nm_background_check', name: 'DPS and FBI Background Check', description: 'New Mexico DPS and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'NMSA 1978 §61-27B-7(C)' },
    ],
  }],
};

const RI_CONFIG: StateComplianceConfig = {
  stateCode: 'RI', stateName: 'Rhode Island',
  workersCompRequired: true,
  regulatoryBody: 'Rhode Island Department of Public Safety (no individual guard license)',
  regulatoryBodyAbbreviation: 'RI-DPS',
  portalUrl: 'https://dps.ri.gov',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [{
    id: 'ri_guard', name: 'Security Guard (No Individual State License)',
    description: 'Rhode Island does not require individual state licensing for security guards. Security companies must be licensed.',
    guardType: 'unarmed', trainingHoursRequired: 0,
    requiredDocuments: [
      { id: 'ri_background_check', name: 'BCI and FBI Background Check', description: 'Rhode Island BCI and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'R.I. Gen. Laws §5-5-1 et seq.' },
    ],
  }],
};

const SD_CONFIG: StateComplianceConfig = {
  stateCode: 'SD', stateName: 'South Dakota',
  workersCompRequired: true,
  regulatoryBody: 'South Dakota Department of Public Safety (no individual guard license)',
  regulatoryBodyAbbreviation: 'SD-DPS',
  portalUrl: 'https://dps.sd.gov',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [{
    id: 'sd_guard', name: 'Security Guard (No State License Required)',
    description: 'South Dakota does not require individual state licensing for security guards.',
    guardType: 'unarmed', trainingHoursRequired: 0,
    requiredDocuments: [
      { id: 'sd_background_check', name: 'Criminal Background Check', description: 'South Dakota DCI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Employer best practice' },
    ],
  }],
};

const UT_CONFIG: StateComplianceConfig = {
  stateCode: 'UT', stateName: 'Utah',
  workersCompRequired: true,
  regulatoryBody: 'Utah Division of Occupational and Professional Licensing',
  regulatoryBodyAbbreviation: 'DOPL',
  portalUrl: 'https://dopl.utah.gov',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [{
    id: 'ut_guard', name: 'Armed Private Security Officer License',
    description: 'Security officer licensed by Utah DOPL.',
    guardType: 'unarmed', trainingHoursRequired: 0,
    additionalTrainingNotes: 'Utah issues Armed Private Security Officer licenses through DOPL. Unarmed guards employed by licensed agencies do not require individual licenses.',
    requiredDocuments: [
      { id: 'ut_registration', name: 'Security Guard Registration', description: 'Utah DOPL security registration.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'UCA §58-63-302' },
      { id: 'ut_background_check', name: 'BCI and FBI Background Check', description: 'Utah BCI and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'UCA §58-63-302(3)' },
    ],
  }],
};

const VT_CONFIG: StateComplianceConfig = {
  stateCode: 'VT', stateName: 'Vermont',
  workersCompRequired: true,
  regulatoryBody: 'Vermont Secretary of State, Office of Professional Regulation (no individual guard license)',
  regulatoryBodyAbbreviation: 'VT-OPR',
  portalUrl: 'https://sos.vermont.gov/opr',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [{
    id: 'vt_guard', name: 'Security Guard (No State License Required)',
    description: 'Vermont does not require individual state licensing for security guards.',
    guardType: 'unarmed', trainingHoursRequired: 0,
    requiredDocuments: [
      { id: 'vt_background_check', name: 'Criminal Background Check', description: 'Vermont Crime Information Center background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Employer best practice' },
    ],
  }],
};

const WV_CONFIG: StateComplianceConfig = {
  stateCode: 'WV', stateName: 'West Virginia',
  workersCompRequired: true,
  regulatoryBody: 'West Virginia Secretary of State',
  regulatoryBodyAbbreviation: 'WV-SOS',
  portalUrl: 'https://sos.wv.gov',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [{
    id: 'wv_guard', name: 'Security Guard Registration',
    description: 'Security guard registered under the West Virginia Private Investigation and Security Services Act.',
    guardType: 'unarmed', trainingHoursRequired: 16,
    requiredDocuments: [
      { id: 'wv_registration', name: 'Security Guard Registration', description: 'West Virginia Secretary of State registration.', category: 'licensing', priority: 'critical', blocksWorkAssignment: true, expiryPeriodDays: 730, renewalRequired: true, regulatoryCitation: 'W. Va. Code §30-18-3' },
      { id: 'wv_training', name: 'Training Certificate', description: 'Completion of required security guard training.', category: 'training', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'W. Va. Code §30-18-9' },
      { id: 'wv_background_check', name: 'WV State Police and FBI Background Check', description: 'West Virginia State Police and FBI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'W. Va. Code §30-18-4' },
    ],
  }],
};

const WY_CONFIG: StateComplianceConfig = {
  stateCode: 'WY', stateName: 'Wyoming',
  workersCompRequired: true,
  regulatoryBody: 'Wyoming Division of Criminal Investigation (no individual guard license)',
  regulatoryBodyAbbreviation: 'WY-DCI',
  portalUrl: 'https://wyomingdci.wyo.gov',
  retentionPeriodDescription: '3 years from last date of employment',
  retentionPeriodDays: 1095,
  licenseLevels: [{
    id: 'wy_guard', name: 'Security Guard (No State License Required)',
    description: 'Wyoming does not require individual state licensing for security guards.',
    guardType: 'unarmed', trainingHoursRequired: 0,
    requiredDocuments: [
      { id: 'wy_background_check', name: 'Criminal Background Check', description: 'Wyoming DCI background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Employer best practice' },
    ],
  }],
};

// ---------------------------------------------------------------------------
// Master Configuration Map
// ---------------------------------------------------------------------------

export const STATE_COMPLIANCE_CONFIGS: Record<string, StateComplianceConfig> = {
  TX: TX_CONFIG,
  CA: CA_CONFIG,
  FL: FL_CONFIG,
  NY: NY_CONFIG,
  IL: IL_CONFIG,
  PA: PA_CONFIG,
  NJ: NJ_CONFIG,
  VA: VA_CONFIG,
  GA: GA_CONFIG,
  OH: OH_CONFIG,
  MA: MA_CONFIG,
  MI: MI_CONFIG,
  AZ: AZ_CONFIG,
  NV: NV_CONFIG,
  NC: NC_CONFIG,
  MD: MD_CONFIG,
  CT: CT_CONFIG,
  MN: MN_CONFIG,
  WA: WA_CONFIG,
  OR: OR_CONFIG,
  CO: CO_CONFIG,
  TN: TN_CONFIG,
  LA: LA_CONFIG,
  SC: SC_CONFIG,
  AL: AL_CONFIG,
  IN: IN_CONFIG,
  MO: MO_CONFIG,
  WI: WI_CONFIG,
  OK: OK_CONFIG,
  AK: AK_CONFIG,
  AR: AR_CONFIG,
  DC: DC_CONFIG,
  DE: DE_CONFIG,
  HI: HI_CONFIG,
  IA: IA_CONFIG,
  ID: ID_CONFIG,
  KS: KS_CONFIG,
  KY: KY_CONFIG,
  ME: ME_CONFIG,
  MS: MS_CONFIG,
  MT: MT_CONFIG,
  ND: ND_CONFIG,
  NE: NE_CONFIG,
  NH: NH_CONFIG,
  NM: NM_CONFIG,
  RI: RI_CONFIG,
  SD: SD_CONFIG,
  UT: UT_CONFIG,
  VT: VT_CONFIG,
  WV: WV_CONFIG,
  WY: WY_CONFIG,
};

// ---------------------------------------------------------------------------
// Accessor Functions
// ---------------------------------------------------------------------------

/**
 * Retrieve the full compliance configuration for a given state.
 *
 * @param stateCode  Two-letter state abbreviation (e.g. "TX", "CA", "FL", "NY")
 * @returns The StateComplianceConfig for the requested state, or null if not supported.
 */
export function getStateComplianceConfig(stateCode: string): StateComplianceConfig | null {
  const normalized = stateCode.toUpperCase().trim();
  return STATE_COMPLIANCE_CONFIGS[normalized] ?? null;
}

/**
 * Get all required documents for a specific state and guard type (unarmed / armed).
 * Returns both state-specific and universal federal documents.
 *
 * @param stateCode  Two-letter state abbreviation
 * @param guardType  "unarmed" or "armed"
 * @returns Array of StateRequiredDocument including federal requirements,
 *          or empty array if state is not supported.
 */
export function getStateRequiredDocuments(
  stateCode: string,
  guardType: 'unarmed' | 'armed'
): StateRequiredDocument[] {
  const config = getStateComplianceConfig(stateCode);
  if (!config) return [];

  const matchingLevel = config.licenseLevels.find(
    (level) => level.guardType === guardType
  );

  if (!matchingLevel) {
    const fallback = config.licenseLevels.find(
      (level) => level.guardType === 'unarmed'
    );
    if (!fallback) return [...UNIVERSAL_FEDERAL_REQUIREMENTS];
    return [...UNIVERSAL_FEDERAL_REQUIREMENTS, ...fallback.requiredDocuments];
  }

  return [...UNIVERSAL_FEDERAL_REQUIREMENTS, ...matchingLevel.requiredDocuments];
}

/**
 * Compare a guard's existing documents against state requirements and identify gaps.
 * This is the core audit-readiness function — it tells you exactly what's missing.
 *
 * @param stateCode       Two-letter state abbreviation
 * @param guardType       "unarmed" or "armed"
 * @param existingDocTypes Array of document type IDs the guard already has on file
 * @returns ComplianceGapReport with missing documents, work-blocking status, and counts
 */
export function compareDocumentsToStateRequirements(
  stateCode: string,
  guardType: string,
  existingDocTypes: string[]
): ComplianceGapReport {
  const normalizedGuardType = guardType.toLowerCase().includes('arm')
    ? 'armed'
    : 'unarmed';

  const requiredDocs = getStateRequiredDocuments(stateCode, normalizedGuardType as 'unarmed' | 'armed');

  const existingSet = new Set(existingDocTypes.map((t) => t.toLowerCase().trim()));

  const missingDocuments: ComplianceGap[] = [];

  for (const doc of requiredDocs) {
    const stateReqId = doc.id.toLowerCase();
    const mappedDocType = mapStateRequirementToEmployeeDocType(stateReqId);
    const matched = existingSet.has(stateReqId) || existingSet.has(mappedDocType);

    if (!matched) {
      missingDocuments.push({
        documentId: doc.id,
        documentName: doc.name,
        category: doc.category,
        priority: doc.priority,
        blocksWorkAssignment: doc.blocksWorkAssignment,
        stateSpecificNotes: doc.stateSpecificNotes,
        regulatoryCitation: doc.regulatoryCitation,
      });
    }
  }

  const blockingDocs = missingDocuments.filter((d) => d.blocksWorkAssignment);

  return {
    stateCode: stateCode.toUpperCase().trim(),
    guardType: normalizedGuardType,
    totalRequired: requiredDocs.length,
    totalPresent: requiredDocs.length - missingDocuments.length,
    totalMissing: missingDocuments.length,
    missingDocuments,
    workBlocked: blockingDocs.length > 0,
    blockingDocumentCount: blockingDocs.length,
  };
}

// ---------------------------------------------------------------------------
// Additional Accessor Functions
// ---------------------------------------------------------------------------

export function getGenericStateConfig(stateCode: string): StateComplianceConfig {
  const normalized = stateCode.toUpperCase().trim();
  return {
    stateCode: normalized,
    stateName: normalized,
    regulatoryBody: 'State Regulatory Authority',
    regulatoryBodyAbbreviation: 'SRA',
    portalUrl: '',
    retentionPeriodDescription: '3 years from last date of employment (federal minimum)',
    retentionPeriodDays: 1095,
    licenseLevels: [
      {
        id: `${normalized.toLowerCase()}_generic_unarmed`,
        name: 'Unarmed Security Guard (Generic)',
        description: 'Generic unarmed security guard configuration with federal baseline requirements.',
        guardType: 'unarmed',
        trainingHoursRequired: 0,
        additionalTrainingNotes: 'Training requirements vary by state. Consult state regulatory authority for specific mandates.',
        requiredDocuments: [
          { id: `${normalized.toLowerCase()}_generic_background`, name: 'Criminal Background Check', description: 'State and FBI criminal background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Federal and state requirements' },
          { id: `${normalized.toLowerCase()}_generic_training`, name: 'Employer-Provided Training Documentation', description: 'Documentation of employer-provided security training.', category: 'training', priority: 'high', blocksWorkAssignment: false, renewalRequired: false, regulatoryCitation: 'Employer best practice' },
        ],
      },
      {
        id: `${normalized.toLowerCase()}_generic_armed`,
        name: 'Armed Security Guard (Generic)',
        description: 'Generic armed security guard configuration with federal baseline requirements.',
        guardType: 'armed',
        trainingHoursRequired: 0,
        additionalTrainingNotes: 'Armed guard requirements vary significantly by state. Consult state regulatory authority before deploying armed personnel.',
        requiredDocuments: [
          { id: `${normalized.toLowerCase()}_generic_background`, name: 'Criminal Background Check', description: 'State and FBI criminal background check.', category: 'background', priority: 'critical', blocksWorkAssignment: true, renewalRequired: false, regulatoryCitation: 'Federal and state requirements' },
          { id: `${normalized.toLowerCase()}_generic_training`, name: 'Employer-Provided Training Documentation', description: 'Documentation of employer-provided security training.', category: 'training', priority: 'high', blocksWorkAssignment: false, renewalRequired: false, regulatoryCitation: 'Employer best practice' },
          { id: `${normalized.toLowerCase()}_generic_firearms`, name: 'Firearms Training and Qualification', description: 'Firearms training certificate and range qualification.', category: 'firearms', priority: 'critical', blocksWorkAssignment: true, renewalRequired: true, expiryPeriodDays: 365, regulatoryCitation: 'State firearms regulations' },
        ],
      },
    ],
    workersCompRequired: normalized === 'TX' ? false : true,
    workersCompNotes: normalized === 'TX'
      ? 'Texas is the only state where workers\' compensation is optional (nonsubscriber status).'
      : 'Workers\' compensation insurance is mandatory for employers in this state.',
    notes: [
      'This is a generic configuration. Consult the specific state regulatory authority for current requirements.',
      'Federal requirements (I-9, W-4, E-Verify) always apply regardless of state.',
    ],
  };
}

export function getWorkersCompRequirement(stateCode: string): { required: boolean; notes: string } {
  const config = getStateComplianceConfig(stateCode);
  if (config) {
    return {
      required: config.workersCompRequired,
      notes: config.workersCompNotes || (config.workersCompRequired
        ? 'Workers\' compensation insurance is mandatory for employers in this state.'
        : 'Workers\' compensation insurance is optional in this state.'),
    };
  }
  const normalized = stateCode.toUpperCase().trim();
  if (normalized === 'TX') {
    return { required: false, notes: 'Texas allows nonsubscriber status — workers\' comp is optional.' };
  }
  return { required: true, notes: 'Workers\' compensation insurance is required by default in most states.' };
}

export function getSupportedStates(): string[] {
  return Object.keys(STATE_COMPLIANCE_CONFIGS).sort();
}

export function isStateSupported(stateCode: string): boolean {
  const normalized = stateCode.toUpperCase().trim();
  return normalized in STATE_COMPLIANCE_CONFIGS;
}

const STATE_REQ_TO_EMPLOYEE_DOC_TYPE: Record<string, string> = {
  'federal_i9': 'i9_form',
  'federal_w4': 'tax_form',
  'federal_ssn_card': 'social_security_card',
  'federal_e_verify': 'custom_document',

  'tx_level_ii_registration': 'guard_card',
  'tx_level_ii_training_cert': 'level_ii_training',
  'tx_color_photograph': 'employee_photograph',
  'tx_fingerprint_background': 'fingerprint_receipt',
  'tx_drug_test': 'drug_test',
  'tx_preemployment_check': 'background_check',
  'tx_employee_info_sheet': 'cover_sheet',
  'tx_training_certificates_all': 'training_certificate',
  'tx_level_iii_registration': 'guard_card',
  'tx_level_iii_training_cert': 'level_iii_training',
  'tx_psych_declaration': 'psychological_evaluation',
  'tx_firearms_proficiency': 'firearms_qualification',

  'ca_guard_card': 'guard_card',
  'ca_guard_registration': 'guard_card',
  'ca_bsis_guard_card': 'guard_card',
  'ca_firearms_permit': 'firearms_permit',
  'ca_firearms_qualification': 'firearms_qualification',
  'ca_baton_permit': 'certification',
  'ca_background_check': 'background_check',
  'ca_fingerprint': 'fingerprint_receipt',
  'ca_powers_to_arrest': 'training_certificate',
  'ca_training_cert': 'training_certificate',
  'ca_photograph': 'employee_photograph',
  'ca_drug_test': 'drug_test',

  'fl_d_license': 'guard_card',
  'fl_g_license': 'guard_card',
  'fl_class_d': 'guard_card',
  'fl_class_g': 'guard_card',
  'fl_background_check': 'background_check',
  'fl_fingerprint': 'fingerprint_receipt',
  'fl_training_cert': 'training_certificate',
  'fl_photograph': 'employee_photograph',
  'fl_drug_test': 'drug_test',
  'fl_firearms_qualification': 'firearms_qualification',

  'ny_registration': 'guard_card',
  'ny_guard_registration': 'guard_card',
  'ny_background_check': 'background_check',
  'ny_fingerprint': 'fingerprint_receipt',
  'ny_training_cert': 'training_certificate',
  'ny_photograph': 'employee_photograph',
  'ny_drug_test': 'drug_test',
  'ny_firearms_permit': 'firearms_permit',
};

export function mapStateRequirementToEmployeeDocType(stateReqId: string): string {
  const normalized = stateReqId.toLowerCase().trim();
  const mapped = STATE_REQ_TO_EMPLOYEE_DOC_TYPE[normalized];
  if (mapped) return mapped;

  if (normalized.includes('guard_card') || normalized.includes('registration') || normalized.includes('license') || normalized.includes('class_d') || normalized.includes('class_g')) return 'guard_card';
  if (normalized.includes('fingerprint') || normalized.includes('livescan') || normalized.includes('identogo')) return 'fingerprint_receipt';
  if (normalized.includes('background') || normalized.includes('criminal')) return 'background_check';
  if (normalized.includes('drug') || normalized.includes('screening')) return 'drug_test';
  if (normalized.includes('photograph') || normalized.includes('photo')) return 'employee_photograph';
  if (normalized.includes('training') || normalized.includes('cert')) return 'training_certificate';
  if (normalized.includes('firearms_qual') || normalized.includes('range_qual')) return 'firearms_qualification';
  if (normalized.includes('firearms') || normalized.includes('firearm') || normalized.includes('carry_permit')) return 'firearms_permit';
  if (normalized.includes('psych') || normalized.includes('mental')) return 'psychological_evaluation';
  if (normalized.includes('i9') || normalized.includes('i-9')) return 'i9_form';
  if (normalized.includes('w4') || normalized.includes('w-4') || normalized.includes('withholding')) return 'tax_form';
  if (normalized.includes('ssn') || normalized.includes('social_security')) return 'social_security_card';
  if (normalized.includes('info_sheet') || normalized.includes('cover')) return 'cover_sheet';

  return 'custom_document';
}

export function compareDocumentsToStateRequirementsWithMapping(
  stateCode: string,
  guardType: string,
  existingDocTypes: string[]
): ComplianceGapReport {
  const normalizedGuardType = guardType.toLowerCase().includes('arm')
    ? 'armed'
    : 'unarmed';

  const requiredDocs = getStateRequiredDocuments(stateCode, normalizedGuardType as 'unarmed' | 'armed');

  const existingSet = new Set(existingDocTypes.map((t) => t.toLowerCase().trim()));

  const missingDocuments: ComplianceGap[] = [];

  for (const doc of requiredDocs) {
    const stateReqId = doc.id.toLowerCase();
    const mappedDocType = mapStateRequirementToEmployeeDocType(stateReqId);

    const matched = existingSet.has(stateReqId) || existingSet.has(mappedDocType);

    if (!matched) {
      missingDocuments.push({
        documentId: doc.id,
        documentName: doc.name,
        category: doc.category,
        priority: doc.priority,
        blocksWorkAssignment: doc.blocksWorkAssignment,
        stateSpecificNotes: doc.stateSpecificNotes,
        regulatoryCitation: doc.regulatoryCitation,
      });
    }
  }

  const blockingDocs = missingDocuments.filter((d) => d.blocksWorkAssignment);

  return {
    stateCode: stateCode.toUpperCase().trim(),
    guardType: normalizedGuardType,
    totalRequired: requiredDocs.length,
    totalPresent: requiredDocs.length - missingDocuments.length,
    totalMissing: missingDocuments.length,
    missingDocuments,
    workBlocked: blockingDocs.length > 0,
    blockingDocumentCount: blockingDocs.length,
  };
}
