export const CERTIFICATION_TYPES = {
  GUARD_LICENSE: 'guard_license',
  ARMED_GUARD: 'armed_guard',
  FIREARM_PERMIT: 'firearm_permit',
  CPR_FIRST_AID: 'cpr_first_aid',
  DRUG_TEST: 'drug_test',
  STATE_TRAINING: 'state_training',
  LEVEL_IV_PPO: 'level_iv_ppo',
  CROWD_MANAGER: 'crowd_manager',
  FIRE_LIFE_SAFETY: 'fire_life_safety',
  HANDCUFF: 'handcuff',
  BATON: 'baton',
  CHEMICAL_AGENT: 'chemical_agent',
} as const;

export type CertificationType = typeof CERTIFICATION_TYPES[keyof typeof CERTIFICATION_TYPES];

export interface CertificationTypeDefinition {
  id: CertificationType;
  name: string;
  description: string;
  category: 'licensing' | 'training' | 'medical' | 'compliance' | 'firearms' | 'specialty';
  typicalExpiryDays: number | null;
  renewalRequired: boolean;
  blocksWorkAssignment: boolean;
  postTypesRequiring: string[];
  dpsCardRequired: boolean;
}

export const CERTIFICATION_TYPE_DEFINITIONS: Record<CertificationType, CertificationTypeDefinition> = {
  [CERTIFICATION_TYPES.GUARD_LICENSE]: {
    id: CERTIFICATION_TYPES.GUARD_LICENSE,
    name: 'Security Guard License (Level II Non-Commissioned)',
    description: 'State-issued unarmed security guard registration or license required to perform guard duties.',
    category: 'licensing',
    typicalExpiryDays: 730,
    renewalRequired: true,
    blocksWorkAssignment: true,
    postTypesRequiring: ['unarmed_guard', 'security_officer', 'patrol', 'access_control', 'lobby'],
    dpsCardRequired: true,
  },
  [CERTIFICATION_TYPES.ARMED_GUARD]: {
    id: CERTIFICATION_TYPES.ARMED_GUARD,
    name: 'Armed Guard License (Level III Commissioned)',
    description: 'State-issued armed or commissioned security officer license authorizing the carrying of firearms on duty.',
    category: 'licensing',
    typicalExpiryDays: 730,
    renewalRequired: true,
    blocksWorkAssignment: true,
    postTypesRequiring: ['armed_guard', 'armed_officer', 'armed_patrol', 'armored_transport'],
    dpsCardRequired: true,
  },
  [CERTIFICATION_TYPES.FIREARM_PERMIT]: {
    id: CERTIFICATION_TYPES.FIREARM_PERMIT,
    name: 'Firearm Qualification Permit',
    description: 'Firearms proficiency qualification certificate from an approved instructor or range.',
    category: 'firearms',
    typicalExpiryDays: 365,
    renewalRequired: true,
    blocksWorkAssignment: true,
    postTypesRequiring: ['armed_guard', 'armed_officer', 'armed_patrol', 'armored_transport'],
    dpsCardRequired: true,
  },
  [CERTIFICATION_TYPES.CPR_FIRST_AID]: {
    id: CERTIFICATION_TYPES.CPR_FIRST_AID,
    name: 'CPR / First Aid Certification',
    description: 'Current CPR and First Aid certification from an accredited provider such as the American Red Cross or AHA.',
    category: 'medical',
    typicalExpiryDays: 730,
    renewalRequired: true,
    blocksWorkAssignment: false,
    postTypesRequiring: ['healthcare_security', 'hospital_security', 'emergency_response'],
    dpsCardRequired: false,
  },
  [CERTIFICATION_TYPES.DRUG_TEST]: {
    id: CERTIFICATION_TYPES.DRUG_TEST,
    name: 'Drug Screening',
    description: 'Pre-employment or periodic drug screening results from an authorized testing facility.',
    category: 'compliance',
    typicalExpiryDays: null,
    renewalRequired: false,
    blocksWorkAssignment: true,
    postTypesRequiring: ['unarmed_guard', 'armed_guard', 'security_officer', 'patrol', 'access_control'],
    dpsCardRequired: false,
  },
  [CERTIFICATION_TYPES.STATE_TRAINING]: {
    id: CERTIFICATION_TYPES.STATE_TRAINING,
    name: 'State-Mandated Training',
    description: 'Completion certificate for state-mandated security officer training hours.',
    category: 'training',
    typicalExpiryDays: null,
    renewalRequired: false,
    blocksWorkAssignment: true,
    postTypesRequiring: ['unarmed_guard', 'armed_guard', 'security_officer'],
    dpsCardRequired: false,
  },
  [CERTIFICATION_TYPES.LEVEL_IV_PPO]: {
    id: CERTIFICATION_TYPES.LEVEL_IV_PPO,
    name: 'Level IV Personal Protection Officer (PPO)',
    description: 'State-issued Personal Protection Officer license for close protection, executive protection, and bodyguard services.',
    category: 'licensing',
    typicalExpiryDays: 730,
    renewalRequired: true,
    blocksWorkAssignment: true,
    postTypesRequiring: ['personal_protection', 'executive_protection', 'bodyguard', 'vip_security'],
    dpsCardRequired: true,
  },
  [CERTIFICATION_TYPES.CROWD_MANAGER]: {
    id: CERTIFICATION_TYPES.CROWD_MANAGER,
    name: 'Crowd Manager Certification',
    description: 'Crowd management and mass gathering safety certification required for event security at venues.',
    category: 'specialty',
    typicalExpiryDays: 730,
    renewalRequired: true,
    blocksWorkAssignment: false,
    postTypesRequiring: ['event_security', 'venue_security', 'crowd_control', 'concert_security'],
    dpsCardRequired: false,
  },
  [CERTIFICATION_TYPES.FIRE_LIFE_SAFETY]: {
    id: CERTIFICATION_TYPES.FIRE_LIFE_SAFETY,
    name: 'Fire Life Safety Director Certification',
    description: 'Fire and life safety certification required for fire watch and high-rise building security assignments.',
    category: 'specialty',
    typicalExpiryDays: 365,
    renewalRequired: true,
    blocksWorkAssignment: false,
    postTypesRequiring: ['fire_watch', 'high_rise_security', 'building_security'],
    dpsCardRequired: false,
  },
  [CERTIFICATION_TYPES.HANDCUFF]: {
    id: CERTIFICATION_TYPES.HANDCUFF,
    name: 'Handcuff Restraint Certification',
    description: 'Certification authorizing the use of handcuff restraints in security operations per state regulations.',
    category: 'specialty',
    typicalExpiryDays: 365,
    renewalRequired: true,
    blocksWorkAssignment: false,
    postTypesRequiring: ['detention_officer', 'transport_security', 'court_security'],
    dpsCardRequired: true,
  },
  [CERTIFICATION_TYPES.BATON]: {
    id: CERTIFICATION_TYPES.BATON,
    name: 'Baton / Impact Weapon Certification',
    description: 'Certification authorizing the carry and use of a baton or impact weapon in security operations.',
    category: 'specialty',
    typicalExpiryDays: 365,
    renewalRequired: true,
    blocksWorkAssignment: false,
    postTypesRequiring: ['patrol_armed_baton', 'detention_officer', 'riot_control'],
    dpsCardRequired: true,
  },
  [CERTIFICATION_TYPES.CHEMICAL_AGENT]: {
    id: CERTIFICATION_TYPES.CHEMICAL_AGENT,
    name: 'Chemical Agent (OC Spray) Certification',
    description: 'Certification authorizing the carry and use of oleoresin capsicum (pepper spray) or other chemical agents.',
    category: 'specialty',
    typicalExpiryDays: 365,
    renewalRequired: true,
    blocksWorkAssignment: false,
    postTypesRequiring: ['patrol', 'armed_guard', 'riot_control', 'detention_officer'],
    dpsCardRequired: true,
  },
};

export function getCertificationTypeDefinition(certType: CertificationType): CertificationTypeDefinition | undefined {
  return CERTIFICATION_TYPE_DEFINITIONS[certType];
}

export function getAllCertificationTypes(): CertificationTypeDefinition[] {
  return Object.values(CERTIFICATION_TYPE_DEFINITIONS);
}

export function getCertificationTypeByPostType(postType: string): CertificationTypeDefinition[] {
  const normalizedPostType = postType.toLowerCase().replace(/[\s-]/g, '_');
  return Object.values(CERTIFICATION_TYPE_DEFINITIONS).filter(def =>
    def.postTypesRequiring.some(pt => pt.toLowerCase() === normalizedPostType)
  );
}

export interface StateRequirement {
  stateCode: string;
  certType: CertificationType;
  stateDocumentId: string;
  stateName: string;
  requiredForArmed: boolean;
  requiredForUnarmed: boolean;
  trainingHours: number | null;
  expiryDays: number | null;
  regulatoryCitation: string | null;
  notes: string | null;
}

const STATE_REQUIREMENTS: StateRequirement[] = [
  {
    stateCode: 'TX',
    certType: CERTIFICATION_TYPES.GUARD_LICENSE,
    stateDocumentId: 'tx_level_ii_registration',
    stateName: 'Level II Non-Commissioned Registration',
    requiredForArmed: true,
    requiredForUnarmed: true,
    trainingHours: 30,
    expiryDays: 730,
    regulatoryCitation: 'Tex. Occ. Code §1702.230; 37 TAC §35.51',
    notes: 'Registration valid 2 years. Renewal via TOPS portal.',
  },
  {
    stateCode: 'TX',
    certType: CERTIFICATION_TYPES.ARMED_GUARD,
    stateDocumentId: 'tx_level_iii_registration',
    stateName: 'Level III Commissioned Registration',
    requiredForArmed: true,
    requiredForUnarmed: false,
    trainingHours: 45,
    expiryDays: 730,
    regulatoryCitation: 'Tex. Occ. Code §1702.163; 37 TAC §35.51',
    notes: 'Requires valid Level II. Registration valid 2 years.',
  },
  {
    stateCode: 'TX',
    certType: CERTIFICATION_TYPES.LEVEL_IV_PPO,
    stateDocumentId: 'tx_level_iv_ppo',
    stateName: 'Level IV Personal Protection Officer',
    requiredForArmed: false,
    requiredForUnarmed: false,
    trainingHours: 15,
    expiryDays: 730,
    regulatoryCitation: 'Tex. Occ. Code §1702.163; 37 TAC §35.51',
    notes: 'Requires Level III. Additional 15-hour PPO training required. Valid 2 years.',
  },
  {
    stateCode: 'TX',
    certType: CERTIFICATION_TYPES.FIREARM_PERMIT,
    stateDocumentId: 'tx_firearms_proficiency',
    stateName: 'Firearms Proficiency Certificate',
    requiredForArmed: true,
    requiredForUnarmed: false,
    trainingHours: null,
    expiryDays: 90,
    regulatoryCitation: '37 TAC §35.143',
    notes: 'Valid for 90 days only. Must be current at time of initial application.',
  },
  {
    stateCode: 'TX',
    certType: CERTIFICATION_TYPES.DRUG_TEST,
    stateDocumentId: 'tx_drug_test',
    stateName: 'Pre-Employment Drug Test',
    requiredForArmed: true,
    requiredForUnarmed: true,
    trainingHours: null,
    expiryDays: null,
    regulatoryCitation: '37 TAC §35.111(a)(5)',
    notes: 'Must be retained in employee file.',
  },
  {
    stateCode: 'TX',
    certType: CERTIFICATION_TYPES.STATE_TRAINING,
    stateDocumentId: 'tx_level_ii_training_cert',
    stateName: 'Level II Training Certificate (30 hours)',
    requiredForArmed: true,
    requiredForUnarmed: true,
    trainingHours: 30,
    expiryDays: null,
    regulatoryCitation: '37 TAC §35.101',
    notes: 'Training must be from a DPS-licensed school. Includes written examination.',
  },
  {
    stateCode: 'TX',
    certType: CERTIFICATION_TYPES.HANDCUFF,
    stateDocumentId: 'tx_handcuff_restraint',
    stateName: 'Handcuff Restraint Authorization',
    requiredForArmed: false,
    requiredForUnarmed: false,
    trainingHours: 4,
    expiryDays: 365,
    regulatoryCitation: '37 TAC §35.143',
    notes: 'Required for officers authorized to use physical restraints. Annual recertification.',
  },
  {
    stateCode: 'TX',
    certType: CERTIFICATION_TYPES.BATON,
    stateDocumentId: 'tx_baton_certification',
    stateName: 'Baton / Impact Weapon Qualification',
    requiredForArmed: false,
    requiredForUnarmed: false,
    trainingHours: 8,
    expiryDays: 365,
    regulatoryCitation: '37 TAC §35.143',
    notes: 'Must complete approved baton course. Annual recertification required.',
  },
  {
    stateCode: 'TX',
    certType: CERTIFICATION_TYPES.CHEMICAL_AGENT,
    stateDocumentId: 'tx_chemical_agent_oc',
    stateName: 'Chemical Agent (OC Spray) Authorization',
    requiredForArmed: false,
    requiredForUnarmed: false,
    trainingHours: 4,
    expiryDays: 365,
    regulatoryCitation: '37 TAC §35.143',
    notes: 'Required for officers authorized to carry OC spray. Annual recertification.',
  },

  {
    stateCode: 'CA',
    certType: CERTIFICATION_TYPES.GUARD_LICENSE,
    stateDocumentId: 'ca_guard_card',
    stateName: 'BSIS Guard Card Registration',
    requiredForArmed: true,
    requiredForUnarmed: true,
    trainingHours: 8,
    expiryDays: 730,
    regulatoryCitation: 'Cal. Bus. & Prof. Code §7583.6; 16 CCR §643',
    notes: 'Power to Arrest training required before application. Valid 2 years.',
  },
  {
    stateCode: 'CA',
    certType: CERTIFICATION_TYPES.FIREARM_PERMIT,
    stateDocumentId: 'ca_firearms_permit',
    stateName: 'BSIS Firearms Permit',
    requiredForArmed: true,
    requiredForUnarmed: false,
    trainingHours: null,
    expiryDays: 730,
    regulatoryCitation: 'Cal. Bus. & Prof. Code §7583.37; 16 CCR §645',
    notes: 'Must complete firearms training course and range qualification. Valid 2 years.',
  },
  {
    stateCode: 'CA',
    certType: CERTIFICATION_TYPES.STATE_TRAINING,
    stateDocumentId: 'ca_skills_training_32hr',
    stateName: 'Skills Training (32 hours)',
    requiredForArmed: true,
    requiredForUnarmed: true,
    trainingHours: 32,
    expiryDays: null,
    regulatoryCitation: 'Cal. Bus. & Prof. Code §7583.6(b-c); 16 CCR §643(b-c)',
    notes: '16 hours within 30 days, remaining 16 within 6 months of hire.',
  },

  {
    stateCode: 'FL',
    certType: CERTIFICATION_TYPES.GUARD_LICENSE,
    stateDocumentId: 'fl_class_d_license',
    stateName: 'Class D Security Officer License',
    requiredForArmed: true,
    requiredForUnarmed: true,
    trainingHours: 40,
    expiryDays: 730,
    regulatoryCitation: 'Fla. Stat. §493.6105; FAC 5N-1.100',
    notes: 'Class D required for all security officer work. Valid 2 years.',
  },
  {
    stateCode: 'FL',
    certType: CERTIFICATION_TYPES.ARMED_GUARD,
    stateDocumentId: 'fl_class_g_license',
    stateName: 'Class G Statewide Firearm License',
    requiredForArmed: true,
    requiredForUnarmed: false,
    trainingHours: 28,
    expiryDays: 730,
    regulatoryCitation: 'Fla. Stat. §493.6115; FAC 5N-1.134',
    notes: 'Requires Class D. 28-hour firearms training course. Valid 2 years.',
  },
  {
    stateCode: 'FL',
    certType: CERTIFICATION_TYPES.DRUG_TEST,
    stateDocumentId: 'fl_drug_screening',
    stateName: 'Drug Screening Results',
    requiredForArmed: true,
    requiredForUnarmed: true,
    trainingHours: null,
    expiryDays: null,
    regulatoryCitation: 'Fla. Stat. §493.6101(10)',
    notes: 'Required as part of licensing application.',
  },
  {
    stateCode: 'FL',
    certType: CERTIFICATION_TYPES.STATE_TRAINING,
    stateDocumentId: 'fl_class_d_training',
    stateName: 'Class D Training Certificate (40 hours)',
    requiredForArmed: true,
    requiredForUnarmed: true,
    trainingHours: 40,
    expiryDays: null,
    regulatoryCitation: 'Fla. Stat. §493.6105(4); FAC 5N-1.100',
    notes: 'Must be from a DACS-licensed training school.',
  },

  {
    stateCode: 'NY',
    certType: CERTIFICATION_TYPES.GUARD_LICENSE,
    stateDocumentId: 'ny_security_guard_registration',
    stateName: 'Security Guard Registration Card',
    requiredForArmed: true,
    requiredForUnarmed: true,
    trainingHours: 8,
    expiryDays: 730,
    regulatoryCitation: 'NY Gen. Bus. Law §89-g; 19 NYCRR §174',
    notes: 'Pre-assignment 8-hour training. Registration valid 2 years. Must carry card on duty.',
  },
  {
    stateCode: 'NY',
    certType: CERTIFICATION_TYPES.ARMED_GUARD,
    stateDocumentId: 'ny_armed_guard_license',
    stateName: 'Armed Guard License',
    requiredForArmed: true,
    requiredForUnarmed: false,
    trainingHours: 47,
    expiryDays: 730,
    regulatoryCitation: 'NY Gen. Bus. Law §89-f(6); 19 NYCRR §174.6',
    notes: '47-hour firearms training. Annual 8-hour requalification.',
  },
  {
    stateCode: 'NY',
    certType: CERTIFICATION_TYPES.STATE_TRAINING,
    stateDocumentId: 'ny_ojt_16hr',
    stateName: 'On-the-Job Training (16 hours)',
    requiredForArmed: true,
    requiredForUnarmed: true,
    trainingHours: 16,
    expiryDays: null,
    regulatoryCitation: 'NY Gen. Bus. Law §89-g(3); 19 NYCRR §174.4',
    notes: 'Must be completed within 90 days of hire.',
  },
  {
    stateCode: 'NY',
    certType: CERTIFICATION_TYPES.FIREARM_PERMIT,
    stateDocumentId: 'ny_firearms_qualification',
    stateName: 'Firearms Qualification Certificate',
    requiredForArmed: true,
    requiredForUnarmed: false,
    trainingHours: null,
    expiryDays: 365,
    regulatoryCitation: 'NY Gen. Bus. Law §89-f(6); 19 NYCRR §174.6',
    notes: 'Annual requalification required.',
  },
];

export function getStateRequirements(stateCode: string): StateRequirement[] {
  return STATE_REQUIREMENTS.filter(r => r.stateCode === stateCode.toUpperCase());
}

export function getStateRequirementsForType(stateCode: string, certType: CertificationType): StateRequirement[] {
  return STATE_REQUIREMENTS.filter(
    r => r.stateCode === stateCode.toUpperCase() && r.certType === certType
  );
}

export function getRequiredCertificationsForGuardType(
  stateCode: string,
  guardType: 'armed' | 'unarmed'
): StateRequirement[] {
  const upper = stateCode.toUpperCase();
  return STATE_REQUIREMENTS.filter(r => {
    if (r.stateCode !== upper) return false;
    return guardType === 'armed' ? r.requiredForArmed : r.requiredForUnarmed;
  });
}

export function getSupportedCertificationStates(): string[] {
  const states = new Set(STATE_REQUIREMENTS.map(r => r.stateCode));
  return Array.from(states).sort();
}

export interface CertificationComplianceCheck {
  certType: CertificationType;
  typeName: string;
  required: boolean;
  present: boolean;
  expired: boolean;
  expiresWithinDays: number | null;
  stateRequirement: StateRequirement | null;
}

export function checkEmployeeCertificationCompliance(
  stateCode: string,
  guardType: 'armed' | 'unarmed',
  employeeCerts: Array<{
    certificationType: string;
    expirationDate?: Date | string | null;
    status?: string | null;
  }>
): CertificationComplianceCheck[] {
  const required = getRequiredCertificationsForGuardType(stateCode, guardType);
  const now = new Date();

  return required.map(req => {
    const definition = CERTIFICATION_TYPE_DEFINITIONS[req.certType];
    const matching = employeeCerts.find(c => c.certificationType === req.certType);
    let expired = false;
    let expiresWithinDays: number | null = null;

    if (matching?.expirationDate) {
      const expDate = new Date(matching.expirationDate);
      expired = expDate < now;
      if (!expired) {
        expiresWithinDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    const present = !!matching && matching.status !== 'rejected' && matching.status !== 'expired';

    return {
      certType: req.certType,
      typeName: definition?.name ?? req.certType,
      required: true,
      present,
      expired,
      expiresWithinDays,
      stateRequirement: req,
    };
  });
}

export function mapCertificationTypeToSchema(certType: CertificationType): string {
  return certType;
}

export function parseCertificationTypeFromSchema(schemaType: string): CertificationType | null {
  const allTypes = Object.values(CERTIFICATION_TYPES) as string[];
  if (allTypes.includes(schemaType)) {
    return schemaType as CertificationType;
  }
  return null;
}

export function validateTxDpsLicenseNumber(licenseNumber: string): { valid: boolean; error?: string } {
  if (!licenseNumber || typeof licenseNumber !== 'string') {
    return { valid: false, error: 'License number is required' };
  }
  const cleaned = licenseNumber.trim().toUpperCase();
  const txPattern = /^[A-Z0-9]{6,12}$/;
  if (!txPattern.test(cleaned)) {
    return {
      valid: false,
      error: 'Texas DPS license number must be 6-12 alphanumeric characters (e.g., A123456 or 1234567)',
    };
  }
  return { valid: true };
}
