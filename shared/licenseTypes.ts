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
    jurisdictionHint: 'State-issued (e.g. CA BSIS, TX DPS)',
    checklistItems: UPLOAD_AND_VERIFY('guard_card_unarmed', 'unarmed guard card'),
  },
  {
    key: 'guard_card_armed',
    displayName: 'Guard Card (Armed) + Firearm Permit',
    category: 'security',
    expiryRequired: true,
    jurisdictionHint: 'State-issued; firearm permit must accompany',
    checklistItems: [
      ...UPLOAD_AND_VERIFY('guard_card_armed', 'armed guard card'),
      { itemId: 'firearm_permit_upload', itemName: 'Upload firearm permit', itemType: 'document', isRequired: true },
      { itemId: 'firearm_qualification', itemName: 'Complete firearm qualification form', itemType: 'form', isRequired: true },
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
