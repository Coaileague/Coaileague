// License & credential taxonomy.
//
// Source of truth for "what license types can an invitee need to produce
// during onboarding" and "what document/verification checklist items do
// each imply". Client form, server persistence, and checklist seeder all
// read from this.
//
// NOTE: This is a seed list. Extend as new industries/jurisdictions are
// added. Keys are stable — never rename an existing key, add a new one
// and deprecate the old.

export type LicenseCategory =
  | 'security'
  | 'healthcare'
  | 'food_service'
  | 'transportation'
  | 'cleaning'
  | 'cosmetology'
  | 'trades'
  | 'general';

export type ChecklistItemType = 'document' | 'signature' | 'certification' | 'form' | 'task';

export interface LicenseChecklistItem {
  itemId: string;
  itemName: string;
  itemType: ChecklistItemType;
  isRequired: boolean;
}

// ─── Texas Private Security Act (Tex. Occ. Code Ch. 1702) levels ────────────
// Values intentionally match the existing employees.licenseType varchar so no
// migration is required. Treat this as the typed contract over DB strings —
// Trinity/HelpAI compliance logic should switch on this enum, not the raw
// string, so the compiler enforces exhaustive handling.
export enum TexasSecurityLevel {
  LEVEL_II_UNARMED = 'level2_unarmed',   // Non-Commissioned Security Officer
  LEVEL_III_ARMED = 'level3_armed',      // Commissioned Security Officer
  LEVEL_IV_PPO = 'level4_ppo',           // Personal Protection Officer
}

export interface TexasLicenseProfile {
  level: TexasSecurityLevel;
  displayName: string;
  shortLabel: string;             // e.g. "Level II — Unarmed"
  isArmed: boolean;
  requiresPsychEval: boolean;     // §1702.230(d): PPO and commissioned require psych eval
  requiresFirearmQualification: boolean;
  regulatoryReference: string;
  // IDs from server/services/compliance/certificationTypes.ts. Listed by string
  // (rather than imported) so this module stays runtime-free of server code.
  requiredCertificationTypeIds: readonly string[];
  // The matching key in LICENSE_TYPES below (so callers can pull checklist items).
  licenseTypeKey: string;
}

export const TEXAS_LICENSE_PROFILES: Record<TexasSecurityLevel, TexasLicenseProfile> = {
  [TexasSecurityLevel.LEVEL_II_UNARMED]: {
    level: TexasSecurityLevel.LEVEL_II_UNARMED,
    displayName: 'Level II — Non-Commissioned Security Officer',
    shortLabel: 'Level II — Unarmed',
    isArmed: false,
    requiresPsychEval: false,
    requiresFirearmQualification: false,
    regulatoryReference: 'Tex. Occ. Code §1702.230 / 37 TAC §35.21',
    requiredCertificationTypeIds: ['guard_license'],
    licenseTypeKey: 'guard_card_unarmed',
  },
  [TexasSecurityLevel.LEVEL_III_ARMED]: {
    level: TexasSecurityLevel.LEVEL_III_ARMED,
    displayName: 'Level III — Commissioned Security Officer',
    shortLabel: 'Level III — Armed',
    isArmed: true,
    requiresPsychEval: true,
    requiresFirearmQualification: true,
    regulatoryReference: 'Tex. Occ. Code §1702.163 / 37 TAC §35.41',
    requiredCertificationTypeIds: ['armed_guard', 'firearm_permit'],
    licenseTypeKey: 'guard_card_armed',
  },
  [TexasSecurityLevel.LEVEL_IV_PPO]: {
    level: TexasSecurityLevel.LEVEL_IV_PPO,
    displayName: 'Level IV — Personal Protection Officer',
    shortLabel: 'Level IV — PPO',
    isArmed: true,
    requiresPsychEval: true,
    requiresFirearmQualification: true,
    regulatoryReference: 'Tex. Occ. Code §1702.230 / 37 TAC §35.61',
    requiredCertificationTypeIds: ['armed_guard', 'firearm_permit', 'level_iv_ppo'],
    licenseTypeKey: 'guard_card_armed', // PPO is built on top of Level III; uses armed checklist
  },
};

// Narrow an unknown string (e.g. employees.licenseType column) into the typed
// enum. Returns null for unrecognised values so callers can decide policy
// (block vs. warn vs. ignore) rather than this module crashing.
export function parseTexasSecurityLevel(value: string | null | undefined): TexasSecurityLevel | null {
  if (!value) return null;
  if (value === TexasSecurityLevel.LEVEL_II_UNARMED) return TexasSecurityLevel.LEVEL_II_UNARMED;
  if (value === TexasSecurityLevel.LEVEL_III_ARMED) return TexasSecurityLevel.LEVEL_III_ARMED;
  if (value === TexasSecurityLevel.LEVEL_IV_PPO) return TexasSecurityLevel.LEVEL_IV_PPO;
  return null;
}

export function getTexasLicenseProfile(level: TexasSecurityLevel): TexasLicenseProfile {
  return TEXAS_LICENSE_PROFILES[level];
}

export function requiresPsychEval(level: TexasSecurityLevel): boolean {
  return TEXAS_LICENSE_PROFILES[level].requiresPsychEval;
}

export function requiresArmedCommission(level: TexasSecurityLevel): boolean {
  return TEXAS_LICENSE_PROFILES[level].isArmed;
}

// Narrow shape an officer record must satisfy for license inference. Kept
// minimal so this helper works against the full employee row, a redacted
// shift-assignment payload, or a hand-built test fixture.
export interface TexasOfficerLicenseInput {
  licenseType?: string | null;
  isArmed?: boolean | null;
  guardCardStatus?: string | null;
}

// Derive the typed Texas profile from a record using the DB columns we already
// store. Trinity scheduling and HelpAI compliance can call this once and then
// rely on the typed profile for downstream checks.
export function inferTexasLicenseProfile(input: TexasOfficerLicenseInput): TexasLicenseProfile | null {
  const level = parseTexasSecurityLevel(input.licenseType);
  if (!level) return null;
  return TEXAS_LICENSE_PROFILES[level];
}

export interface LicenseTypeDefinition {
  key: string;
  displayName: string;
  category: LicenseCategory;
  // True if the license has an expiration date we need to track.
  expiryRequired: boolean;
  // Free-text hint surfaced in the invite UI to help the issuer pick.
  jurisdictionHint?: string;
  // Items auto-added to the onboardee's onboardingChecklist when this
  // license is attached to the invite.
  checklistItems: LicenseChecklistItem[];
  // Optional: cross-reference to the Texas DPS level this credential satisfies.
  // Powers Trinity's typed compliance checks without changing the existing
  // multi-state taxonomy.
  texasLevel?: TexasSecurityLevel;
}

const UPLOAD_AND_VERIFY = (prefix: string, name: string): LicenseChecklistItem[] => [
  {
    itemId: `${prefix}_upload`,
    itemName: `Upload ${name}`,
    itemType: 'document',
    isRequired: true,
  },
  {
    itemId: `${prefix}_expiry`,
    itemName: `Confirm ${name} expiration date`,
    itemType: 'form',
    isRequired: true,
  },
];

export const LICENSE_TYPES: LicenseTypeDefinition[] = [
  // ─── Security ──────────────────────────────────────────────────────
  {
    key: 'guard_card_unarmed',
    displayName: 'Guard Card (Unarmed)',
    category: 'security',
    expiryRequired: true,
    jurisdictionHint: 'State-issued (e.g. CA BSIS, TX DPS Level II)',
    texasLevel: TexasSecurityLevel.LEVEL_II_UNARMED,
    checklistItems: UPLOAD_AND_VERIFY('guard_card_unarmed', 'unarmed guard card'),
  },
  {
    key: 'guard_card_armed',
    displayName: 'Guard Card (Armed) + Firearm Permit',
    category: 'security',
    expiryRequired: true,
    jurisdictionHint: 'State-issued; firearm permit must accompany (TX DPS Level III/IV)',
    texasLevel: TexasSecurityLevel.LEVEL_III_ARMED,
    checklistItems: [
      ...UPLOAD_AND_VERIFY('guard_card_armed', 'armed guard card'),
      { itemId: 'firearm_permit_upload', itemName: 'Upload firearm permit', itemType: 'document', isRequired: true },
      { itemId: 'firearm_qualification', itemName: 'Complete firearm qualification form', itemType: 'form', isRequired: true },
      { itemId: 'psych_eval_upload', itemName: 'Upload psychological evaluation (Tex. Occ. Code §1702.163)', itemType: 'document', isRequired: true },
    ],
  },
  {
    key: 'ppo_license',
    displayName: 'Private Patrol Operator (PPO) License',
    category: 'security',
    expiryRequired: true,
    checklistItems: UPLOAD_AND_VERIFY('ppo_license', 'PPO license'),
  },

  // ─── Healthcare ────────────────────────────────────────────────────
  {
    key: 'cna',
    displayName: 'Certified Nursing Assistant (CNA)',
    category: 'healthcare',
    expiryRequired: true,
    checklistItems: UPLOAD_AND_VERIFY('cna', 'CNA certification'),
  },
  {
    key: 'rn',
    displayName: 'Registered Nurse (RN)',
    category: 'healthcare',
    expiryRequired: true,
    checklistItems: UPLOAD_AND_VERIFY('rn', 'RN license'),
  },
  {
    key: 'lvn_lpn',
    displayName: 'Licensed Vocational / Practical Nurse',
    category: 'healthcare',
    expiryRequired: true,
    checklistItems: UPLOAD_AND_VERIFY('lvn_lpn', 'LVN/LPN license'),
  },
  {
    key: 'cpr_bls',
    displayName: 'CPR / Basic Life Support',
    category: 'healthcare',
    expiryRequired: true,
    checklistItems: UPLOAD_AND_VERIFY('cpr_bls', 'CPR/BLS card'),
  },

  // ─── Food service ─────────────────────────────────────────────────
  {
    key: 'food_handler',
    displayName: 'Food Handler Card',
    category: 'food_service',
    expiryRequired: true,
    checklistItems: UPLOAD_AND_VERIFY('food_handler', 'food handler card'),
  },
  {
    key: 'servsafe',
    displayName: 'ServSafe Manager Certification',
    category: 'food_service',
    expiryRequired: true,
    checklistItems: UPLOAD_AND_VERIFY('servsafe', 'ServSafe certificate'),
  },
  {
    key: 'alcohol_server',
    displayName: 'Alcohol Server Permit (e.g. TIPS, RBS)',
    category: 'food_service',
    expiryRequired: true,
    checklistItems: UPLOAD_AND_VERIFY('alcohol_server', 'alcohol server permit'),
  },

  // ─── Transportation ───────────────────────────────────────────────
  {
    key: 'cdl_a',
    displayName: 'Commercial Driver License — Class A',
    category: 'transportation',
    expiryRequired: true,
    checklistItems: [
      ...UPLOAD_AND_VERIFY('cdl_a', 'CDL-A license'),
      { itemId: 'dot_medical_card', itemName: 'Upload DOT medical card', itemType: 'document', isRequired: true },
    ],
  },
  {
    key: 'cdl_b',
    displayName: 'Commercial Driver License — Class B',
    category: 'transportation',
    expiryRequired: true,
    checklistItems: [
      ...UPLOAD_AND_VERIFY('cdl_b', 'CDL-B license'),
      { itemId: 'dot_medical_card', itemName: 'Upload DOT medical card', itemType: 'document', isRequired: true },
    ],
  },
  {
    key: 'drivers_license',
    displayName: 'Standard Driver License',
    category: 'transportation',
    expiryRequired: true,
    checklistItems: UPLOAD_AND_VERIFY('drivers_license', 'driver license'),
  },

  // ─── Cleaning / Janitorial ────────────────────────────────────────
  {
    key: 'janitorial_bond',
    displayName: 'Janitorial Bond / Insurance',
    category: 'cleaning',
    expiryRequired: true,
    checklistItems: UPLOAD_AND_VERIFY('janitorial_bond', 'janitorial bond'),
  },
  {
    key: 'osha_10',
    displayName: 'OSHA 10-Hour Safety Card',
    category: 'cleaning',
    expiryRequired: false,
    checklistItems: UPLOAD_AND_VERIFY('osha_10', 'OSHA 10 card'),
  },

  // ─── Cosmetology ──────────────────────────────────────────────────
  {
    key: 'cosmetology',
    displayName: 'Cosmetology License',
    category: 'cosmetology',
    expiryRequired: true,
    checklistItems: UPLOAD_AND_VERIFY('cosmetology', 'cosmetology license'),
  },
  {
    key: 'barber',
    displayName: 'Barber License',
    category: 'cosmetology',
    expiryRequired: true,
    checklistItems: UPLOAD_AND_VERIFY('barber', 'barber license'),
  },

  // ─── Trades ───────────────────────────────────────────────────────
  {
    key: 'electrician',
    displayName: 'Electrician License',
    category: 'trades',
    expiryRequired: true,
    checklistItems: UPLOAD_AND_VERIFY('electrician', 'electrician license'),
  },
  {
    key: 'hvac',
    displayName: 'HVAC License / EPA 608',
    category: 'trades',
    expiryRequired: true,
    checklistItems: UPLOAD_AND_VERIFY('hvac', 'HVAC certification'),
  },

  // ─── General ──────────────────────────────────────────────────────
  {
    key: 'background_check',
    displayName: 'Background Check Consent',
    category: 'general',
    expiryRequired: false,
    checklistItems: [
      { itemId: 'background_check_consent', itemName: 'Sign background check consent', itemType: 'signature', isRequired: true },
    ],
  },
  {
    key: 'drug_screen',
    displayName: 'Drug Screen',
    category: 'general',
    expiryRequired: false,
    checklistItems: [
      { itemId: 'drug_screen_consent', itemName: 'Sign drug screen consent', itemType: 'signature', isRequired: true },
      { itemId: 'drug_screen_result', itemName: 'Drug screen result on file', itemType: 'document', isRequired: true },
    ],
  },
];

const BY_KEY: Record<string, LicenseTypeDefinition> = LICENSE_TYPES.reduce((acc, def) => {
  acc[def.key] = def;
  return acc;
}, {} as Record<string, LicenseTypeDefinition>);

export function getLicenseType(key: string): LicenseTypeDefinition | undefined {
  return BY_KEY[key];
}

export const LICENSE_TYPE_KEYS: readonly string[] = LICENSE_TYPES.map((l) => l.key);

export function isValidLicenseTypeKey(key: string): boolean {
  return key in BY_KEY;
}

// Expand a set of license-type keys into a deduped list of checklist items.
// Dedup is by itemId so two licenses requiring the same task (e.g. DOT
// medical card) only produce one checklist item.
export function expandLicensesToChecklistItems(keys: string[]): LicenseChecklistItem[] {
  const seen = new Set<string>();
  const out: LicenseChecklistItem[] = [];
  for (const key of keys) {
    const def = BY_KEY[key];
    if (!def) continue;
    for (const item of def.checklistItems) {
      if (seen.has(item.itemId)) continue;
      seen.add(item.itemId);
      out.push(item);
    }
  }
  return out;
}
