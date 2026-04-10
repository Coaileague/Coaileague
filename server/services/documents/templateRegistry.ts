/**
 * Universal Document Template Registry
 * ======================================
 * Single source of truth for ALL document templates in the platform.
 * Editing here propagates to every workflow, form renderer, and PDF generator.
 *
 * Section 1 of Universal Document Template System spec.
 */

export type FieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'date'
  | 'select'
  | 'checkbox'
  | 'signature'
  | 'initials'
  | 'upload'
  | 'textarea'
  | 'ssn'
  | 'address_block'
  | 'acknowledgment_check'
  | 'number'
  | 'masked_number';

export interface TemplateField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
  validationPattern?: string;
  helpText?: string;
  mobileFullWidth: boolean;
  sensitiveData: boolean;
  defaultValue?: string;
  maxLength?: number;
}

export interface TemplateSection {
  id: string;
  title: string;
  order: number;
  description?: string;
  fields: TemplateField[];
  requiresAcknowledgment: boolean;
  acknowledgmentText?: string;
  requiresInitials: boolean;
  requiresSignature: boolean;
  scrollToReadRequired?: boolean;
  legalText?: string;
}

export interface ValidationRule {
  field: string;
  rule: 'required' | 'format' | 'min_length' | 'signature_not_empty' | 'scroll_complete';
  message: string;
}

export interface DocumentTemplate {
  id: string;
  documentType: string;
  title: string;
  version: string;
  category: string;
  description: string;
  sections: TemplateSection[];
  universalHeader: boolean;
  universalFooter: boolean;
  requiresSignature: boolean;
  requiresInitials: boolean[];
  requiresDateStamp: boolean;
  requiresGpsCapture: boolean;
  requiresIpCapture: boolean;
  captureDeviceInfo: boolean;
  allowSaveForLater: boolean;
  trinityValidationRules: ValidationRule[];
  completionWebhook: string;
  estimatedMinutes: number;
  supportedLanguages?: string[];
  language?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function textField(id: string, label: string, required = true, opts: Partial<TemplateField> = {}): TemplateField {
  return { id, label, type: 'text', required, mobileFullWidth: true, sensitiveData: false, ...opts };
}
function emailField(id: string, label: string, required = true): TemplateField {
  return { id, label, type: 'email', required, mobileFullWidth: true, sensitiveData: false };
}
function phoneField(id: string, label: string, required = true): TemplateField {
  return { id, label, type: 'phone', required, mobileFullWidth: true, sensitiveData: false };
}
function dateField(id: string, label: string, required = true, opts: Partial<TemplateField> = {}): TemplateField {
  return { id, label, type: 'date', required, mobileFullWidth: true, sensitiveData: false, ...opts };
}
function selectField(id: string, label: string, options: string[], required = true): TemplateField {
  return { id, label, type: 'select', required, options, mobileFullWidth: true, sensitiveData: false };
}
function checkboxField(id: string, label: string, required = true): TemplateField {
  return { id, label, type: 'checkbox', required, mobileFullWidth: true, sensitiveData: false };
}
function signatureField(id: string, label = 'Signature'): TemplateField {
  return { id, label, type: 'signature', required: true, mobileFullWidth: true, sensitiveData: false };
}
function initialsField(id: string, label = 'Initials'): TemplateField {
  return { id, label, type: 'initials', required: true, mobileFullWidth: true, sensitiveData: false };
}
function uploadField(id: string, label: string, required = true, opts: Partial<TemplateField> = {}): TemplateField {
  return { id, label, type: 'upload', required, mobileFullWidth: true, sensitiveData: false, ...opts };
}
function textareaField(id: string, label: string, required = false, opts: Partial<TemplateField> = {}): TemplateField {
  return { id, label, type: 'textarea', required, mobileFullWidth: true, sensitiveData: false, ...opts };
}
function ssnField(id: string, label = 'Social Security Number (Last 4)', required = true): TemplateField {
  return { id, label, type: 'ssn', required, mobileFullWidth: true, sensitiveData: true };
}
function addressBlock(id: string, label = 'Address', required = true): TemplateField {
  return { id, label, type: 'address_block', required, mobileFullWidth: true, sensitiveData: false };
}
function maskedNumber(id: string, label: string, required = true, opts: Partial<TemplateField> = {}): TemplateField {
  return { id, label, type: 'masked_number', required, mobileFullWidth: true, sensitiveData: true, ...opts };
}

function requiredRule(field: string, label: string): ValidationRule {
  return { field, rule: 'required', message: `${label} is required` };
}
function sigRule(field: string): ValidationRule {
  return { field, rule: 'signature_not_empty', message: 'Signature cannot be blank' };
}

// ── TEMPLATE_REGISTRY ─────────────────────────────────────────────────────────

export const TEMPLATE_REGISTRY: Record<string, DocumentTemplate> = {

  // ── 1. Employment Application ────────────────────────────────────────────
  EMPLOYMENT_APPLICATION: {
    id: 'EMPLOYMENT_APPLICATION',
    documentType: 'employment_application',
    title: 'Employment Application',
    version: '1.0',
    category: 'employment',
    description: 'Standard employment application for security officer candidates.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: true,
    requiresInitials: [false, false, false, false, false, true],
    requiresDateStamp: true,
    requiresGpsCapture: false,
    requiresIpCapture: true,
    captureDeviceInfo: true,
    allowSaveForLater: true,
    estimatedMinutes: 15,
    completionWebhook: 'employment_application_submitted',
    trinityValidationRules: [
      requiredRule('firstName', 'First Name'),
      requiredRule('lastName', 'Last Name'),
      requiredRule('phone', 'Phone'),
      requiredRule('email', 'Email'),
      requiredRule('guardCardNumber', 'Guard Card Number'),
      sigRule('finalSignature'),
    ],
    sections: [
      {
        id: 'personal',
        title: 'Personal Information',
        order: 1,
        description: 'Please provide your full legal name and contact information.',
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: false,
        fields: [
          textField('firstName', 'First Name'),
          textField('lastName', 'Last Name'),
          textField('middleName', 'Middle Name', false),
          dateField('dateOfBirth', 'Date of Birth'),
          textField('placeOfBirth', 'Place of Birth', false),
          ssnField('ssnLastFour', 'Social Security Number (Last 4 digits)'),
          addressBlock('currentAddress', 'Current Address'),
          phoneField('phone', 'Phone Number'),
          emailField('email', 'Email Address'),
          textField('emergencyContactName', 'Emergency Contact Name'),
          phoneField('emergencyContactPhone', 'Emergency Contact Phone'),
          textField('emergencyContactRelation', 'Relationship to Emergency Contact'),
        ],
      },
      {
        id: 'license',
        title: 'License and Certifications',
        order: 2,
        description: 'Provide your security guard license details.',
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: false,
        fields: [
          textField('guardCardNumber', 'Guard Card Number'),
          selectField('licenseType', 'License Type', ['Level II – Unarmed', 'Level III – Armed', 'Level IV – PPO', 'Other']),
          dateField('licenseIssueDate', 'Issue Date'),
          dateField('licenseExpiryDate', 'Expiry Date'),
          selectField('licenseState', 'State Issued', ['TX', 'CA', 'FL', 'NY', 'GA', 'IL', 'PA', 'OH', 'AZ', 'NC', 'NJ', 'VA', 'WA', 'MA', 'TN', 'IN', 'MO', 'MD', 'WI', 'CO', 'MN', 'SC', 'AL', 'LA', 'KY', 'OR', 'OK', 'CT', 'IA', 'UT', 'NV', 'AR', 'MS', 'KS', 'NM', 'NE', 'WV', 'ID', 'HI', 'NH', 'ME', 'RI', 'MT', 'DE', 'SD', 'ND', 'AK', 'VT', 'WY', 'DC']),
          uploadField('guardCardFront', 'Guard Card – Front', true, { helpText: 'Clear photo of the front of your guard card' }),
          uploadField('guardCardBack', 'Guard Card – Back', true, { helpText: 'Clear photo of the back of your guard card' }),
        ],
      },
      {
        id: 'employment_history',
        title: 'Employment History',
        order: 3,
        description: 'List your last three employers.',
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: false,
        fields: [
          textField('employer1Name', 'Employer 1 – Company Name', false),
          addressBlock('employer1Address', 'Employer 1 – Address', false),
          phoneField('employer1Phone', 'Employer 1 – Phone', false),
          dateField('employer1StartDate', 'Employer 1 – Start Date', false),
          dateField('employer1EndDate', 'Employer 1 – End Date', false),
          textareaField('employer1ReasonForLeaving', 'Employer 1 – Reason for Leaving', false),
          textField('employer2Name', 'Employer 2 – Company Name', false),
          dateField('employer2StartDate', 'Employer 2 – Start Date', false),
          dateField('employer2EndDate', 'Employer 2 – End Date', false),
          textareaField('employer2ReasonForLeaving', 'Employer 2 – Reason for Leaving', false),
          textField('employer3Name', 'Employer 3 – Company Name', false),
          dateField('employer3StartDate', 'Employer 3 – Start Date', false),
          dateField('employer3EndDate', 'Employer 3 – End Date', false),
          textareaField('employer3ReasonForLeaving', 'Employer 3 – Reason for Leaving', false),
        ],
      },
      {
        id: 'references',
        title: 'Professional References',
        order: 4,
        description: 'List three professional references.',
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: false,
        fields: [
          textField('ref1Name', 'Reference 1 – Full Name'),
          textField('ref1Relationship', 'Reference 1 – Relationship'),
          phoneField('ref1Phone', 'Reference 1 – Phone'),
          emailField('ref1Email', 'Reference 1 – Email', false),
          textField('ref2Name', 'Reference 2 – Full Name', false),
          textField('ref2Relationship', 'Reference 2 – Relationship', false),
          phoneField('ref2Phone', 'Reference 2 – Phone', false),
          textField('ref3Name', 'Reference 3 – Full Name', false),
          textField('ref3Relationship', 'Reference 3 – Relationship', false),
          phoneField('ref3Phone', 'Reference 3 – Phone', false),
        ],
      },
      {
        id: 'legal_questions',
        title: 'Legal Questions',
        order: 5,
        description: 'Please answer all questions honestly. A yes answer does not automatically disqualify you.',
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: false,
        fields: [
          selectField('felonyConviction', 'Have you been convicted of a felony?', ['No', 'Yes']),
          textareaField('felonyExplanation', 'If yes, please explain', false, { helpText: 'Provide details of conviction, date, jurisdiction, and disposition' }),
          selectField('pendingCharges', 'Do you have any pending criminal charges?', ['No', 'Yes']),
          textareaField('pendingChargesExplanation', 'If yes, please explain', false),
          selectField('firedForCause', 'Have you ever been terminated for cause?', ['No', 'Yes']),
          textareaField('firedForCauseExplanation', 'If yes, please explain', false),
        ],
      },
      {
        id: 'acknowledgment',
        title: 'Acknowledgment and Signature',
        order: 6,
        description: 'Review and sign to certify the accuracy of your application.',
        requiresAcknowledgment: true,
        acknowledgmentText: 'I certify that all information provided in this application is true, correct, and complete to the best of my knowledge. I understand that false or misleading statements or omissions may result in denial of employment or immediate termination if discovered after employment begins.',
        requiresInitials: true,
        requiresSignature: true,
        scrollToReadRequired: false,
        fields: [
          signatureField('finalSignature', 'Applicant Signature'),
          dateField('signatureDate', 'Date'),
        ],
      },
    ],
  },

  // ── 2. Regulatory Packet ─────────────────────────────────────────────────
  REGULATORY_PACKET: {
    id: 'REGULATORY_PACKET',
    documentType: 'regulatory_packet',
    title: 'New Employee Regulatory Packet',
    version: '1.0',
    category: 'employment',
    description: 'Required compliance documents for all new security employees.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: true,
    requiresInitials: [false, false, true, true, true, true, true],
    requiresDateStamp: true,
    requiresGpsCapture: true,
    requiresIpCapture: true,
    captureDeviceInfo: true,
    allowSaveForLater: true,
    estimatedMinutes: 20,
    completionWebhook: 'regulatory_packet_completed',
    trinityValidationRules: [
      requiredRule('firstName', 'First Name'),
      sigRule('finalSignature'),
    ],
    sections: [
      {
        id: 'personal',
        title: 'Personal Information',
        order: 1,
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: false,
        fields: [
          textField('firstName', 'First Name'),
          textField('lastName', 'Last Name'),
          dateField('dateOfBirth', 'Date of Birth'),
          ssnField('ssnLastFour', 'SSN – Last 4 Digits'),
          addressBlock('currentAddress', 'Current Address'),
          phoneField('phone', 'Phone Number'),
          emailField('email', 'Email Address'),
        ],
      },
      {
        id: 'identity_documents',
        title: 'Identity Documents',
        order: 2,
        description: 'Upload clear photos of your government-issued ID.',
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: false,
        fields: [
          uploadField('stateIdFront', 'State ID / Driver\'s License – Front'),
          uploadField('stateIdBack', 'State ID / Driver\'s License – Back'),
          uploadField('socialSecurityCard', 'Social Security Card – Front'),
        ],
      },
      {
        id: 'drug_free',
        title: 'Drug-Free Workplace Policy',
        order: 3,
        description: 'Please read and acknowledge the drug-free workplace policy.',
        requiresAcknowledgment: true,
        scrollToReadRequired: true,
        acknowledgmentText: 'I have read, understand, and agree to comply with the organization\'s Drug-Free Workplace Policy. I understand that violation of this policy may result in immediate termination. I consent to drug testing as a condition of employment and during employment as required.',
        legalText: 'DRUG-FREE WORKPLACE POLICY\n\nThis organization maintains a drug-free workplace in compliance with applicable federal and state laws. The use, possession, sale, transfer, purchase, or manufacture of illegal drugs or controlled substances on company property or while performing company business is strictly prohibited.\n\nEmployees must report to work free from the influence of alcohol, illegal drugs, or any substance that may impair performance or judgment. Prescription medications must be disclosed if they may affect job performance.\n\nViolation of this policy is grounds for immediate termination. Drug testing may be required pre-employment, randomly, post-incident, or upon reasonable suspicion.',
        requiresInitials: true,
        requiresSignature: false,
        fields: [
          initialsField('drugFreeInitials', 'Initials – Drug-Free Policy'),
          dateField('drugFreeDate', 'Date'),
        ],
      },
      {
        id: 'at_will',
        title: 'At-Will Employment Acknowledgment',
        order: 4,
        requiresAcknowledgment: true,
        scrollToReadRequired: true,
        acknowledgmentText: 'I acknowledge that my employment is at-will and may be terminated by either party at any time, with or without cause, and with or without notice.',
        legalText: 'AT-WILL EMPLOYMENT STATEMENT\n\nYour employment with this organization is at-will, meaning either you or the organization may terminate the employment relationship at any time, with or without cause, and with or without advance notice. Nothing in this document, the employee handbook, or any other communication creates a contract of employment for a specific duration.\n\nThis at-will status cannot be altered by any verbal statements made by supervisors or managers. Only a written agreement signed by the organization\'s executive officer can modify this at-will relationship.',
        requiresInitials: true,
        requiresSignature: false,
        fields: [
          initialsField('atWillInitials', 'Initials – At-Will Acknowledgment'),
          dateField('atWillDate', 'Date'),
        ],
      },
      {
        id: 'liability_waiver',
        title: 'Liability Waiver',
        order: 5,
        requiresAcknowledgment: true,
        scrollToReadRequired: true,
        acknowledgmentText: 'I have read and understand the liability limitations described above and agree to the terms.',
        legalText: 'LIABILITY ACKNOWLEDGMENT\n\nAs a security officer, you are employed as a private citizen. You are not a law enforcement officer and do not have powers of arrest beyond those of any private citizen. You have no authority to detain individuals except under the doctrine of citizen\'s arrest as defined by applicable state law.\n\nThe organization shall not be liable for actions taken by security personnel that exceed the scope of their lawful authority as private citizens. You agree to hold harmless the organization for any claims arising from unauthorized use of force or unlawful detention.\n\nYou are responsible for knowing and complying with all applicable laws. The use of excessive force is strictly prohibited and may result in civil and criminal liability.',
        requiresInitials: true,
        requiresSignature: false,
        fields: [
          initialsField('liabilityInitials', 'Initials – Liability Waiver'),
          dateField('liabilityDate', 'Date'),
        ],
      },
      {
        id: 'background_check',
        title: 'Background Check Authorization',
        order: 6,
        requiresAcknowledgment: true,
        scrollToReadRequired: false,
        acknowledgmentText: 'I authorize the organization to obtain consumer reports and investigative consumer reports for employment purposes. I understand this may include criminal history, employment verification, and education records.',
        legalText: 'FAIR CREDIT REPORTING ACT (FCRA) DISCLOSURE\n\nIn accordance with the Fair Credit Reporting Act, 15 U.S.C. § 1681 et seq., this organization may obtain consumer reports and/or investigative consumer reports about you for employment purposes. These reports may contain information about your character, general reputation, personal characteristics, mode of living, criminal records, and employment history.\n\nYou have the right to request a copy of any report obtained and to dispute inaccurate information directly with the reporting agency.',
        requiresInitials: false,
        requiresSignature: false,
        fields: [
          checkboxField('fcraConsent', 'I authorize this background check and consent to release of information'),
        ],
      },
      {
        id: 'final_signature',
        title: 'Final Signature',
        order: 7,
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: true,
        fields: [
          signatureField('finalSignature', 'Employee Signature'),
          dateField('finalDate', 'Date'),
        ],
      },
    ],
  },

  // ── 3. W4 ────────────────────────────────────────────────────────────────
  W4: {
    id: 'W4',
    documentType: 'w4_withholding',
    title: 'Employee\'s Withholding Certificate (W-4)',
    version: '2024',
    category: 'tax',
    description: 'IRS Form W-4 — Employee\'s Withholding Certificate for federal income tax.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: true,
    requiresInitials: [false, false, false, false, true],
    requiresDateStamp: true,
    requiresGpsCapture: false,
    requiresIpCapture: true,
    captureDeviceInfo: true,
    allowSaveForLater: true,
    estimatedMinutes: 10,
    completionWebhook: 'w4_submitted',
    trinityValidationRules: [
      requiredRule('firstName', 'First Name'),
      requiredRule('lastName', 'Last Name'),
      requiredRule('filingStatus', 'Filing Status'),
      sigRule('signature'),
    ],
    sections: [
      {
        id: 'step1',
        title: 'Step 1 – Personal Information and Filing Status',
        order: 1,
        description: 'Complete your legal name, address, and filing status.',
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: false,
        fields: [
          textField('firstName', 'First Name and Middle Initial'),
          textField('lastName', 'Last Name'),
          ssnField('ssn', 'Social Security Number', true),
          addressBlock('address', 'Home Address'),
          selectField('filingStatus', 'Filing Status', [
            'Single or Married filing separately',
            'Married filing jointly or Qualifying surviving spouse',
            'Head of household',
          ]),
        ],
      },
      {
        id: 'step2',
        title: 'Step 2 – Multiple Jobs or Spouse Works',
        order: 2,
        description: 'Complete if you have more than one job at a time or are married filing jointly and your spouse also works.',
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: false,
        fields: [
          selectField('multipleJobsOption', 'Multiple Jobs Withholding Option', [
            'None – this is my only job',
            'Use IRS withholding estimator at irs.gov/W4App',
            'Check this box (higher withholding)',
          ]),
        ],
      },
      {
        id: 'step3',
        title: 'Step 3 – Claim Dependents',
        order: 3,
        description: 'If your total income is $200,000 or less ($400,000 or less if married filing jointly), enter your number of qualifying dependents.',
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: false,
        fields: [
          { id: 'qualifyingChildren', label: 'Qualifying Children Under 17 × $2,000', type: 'number' as FieldType, required: false, mobileFullWidth: true, sensitiveData: false },
          { id: 'otherDependents', label: 'Other Dependents × $500', type: 'number' as FieldType, required: false, mobileFullWidth: true, sensitiveData: false },
          { id: 'dependentsTotal', label: 'Total (add the amounts above)', type: 'number' as FieldType, required: false, mobileFullWidth: true, sensitiveData: false },
        ],
      },
      {
        id: 'step4',
        title: 'Step 4 – Other Adjustments (Optional)',
        order: 4,
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: false,
        fields: [
          { id: 'otherIncome', label: 'Other Income (not from jobs)', type: 'number' as FieldType, required: false, mobileFullWidth: true, sensitiveData: false },
          { id: 'deductions', label: 'Deductions (if you expect to claim itemized deductions)', type: 'number' as FieldType, required: false, mobileFullWidth: true, sensitiveData: false },
          { id: 'extraWithholding', label: 'Extra Withholding per Pay Period', type: 'number' as FieldType, required: false, mobileFullWidth: true, sensitiveData: false },
        ],
      },
      {
        id: 'step5',
        title: 'Step 5 – Signature',
        order: 5,
        description: 'Under penalties of perjury, I declare that this certificate is correct.',
        requiresAcknowledgment: false,
        requiresInitials: true,
        requiresSignature: true,
        fields: [
          signatureField('signature', 'Employee Signature'),
          dateField('signatureDate', 'Date'),
        ],
      },
    ],
  },

  // ── 4. W9 ────────────────────────────────────────────────────────────────
  W9: {
    id: 'W9',
    documentType: 'w9_tin',
    title: 'Request for Taxpayer Identification Number (W-9)',
    version: '2018',
    category: 'tax',
    description: 'IRS Form W-9 — Request for Taxpayer Identification Number and Certification.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: true,
    requiresInitials: [],
    requiresDateStamp: true,
    requiresGpsCapture: false,
    requiresIpCapture: true,
    captureDeviceInfo: true,
    allowSaveForLater: true,
    estimatedMinutes: 8,
    completionWebhook: 'w9_submitted',
    trinityValidationRules: [
      requiredRule('name', 'Name'),
      requiredRule('taxClassification', 'Federal Tax Classification'),
      sigRule('signature'),
    ],
    sections: [
      {
        id: 'identification',
        title: 'Taxpayer Identification',
        order: 1,
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: false,
        fields: [
          textField('name', 'Name (as shown on income tax return)'),
          textField('businessName', 'Business Name / Disregarded Entity Name', false),
          selectField('taxClassification', 'Federal Tax Classification', [
            'Individual/sole proprietor or single-member LLC',
            'C Corporation',
            'S Corporation',
            'Partnership',
            'Trust/estate',
            'Limited liability company (C)',
            'Limited liability company (S)',
            'Limited liability company (P)',
            'Other',
          ]),
          textField('exemptPayeeCode', 'Exempt Payee Code', false),
          textField('exemptFatcaCode', 'Exemption from FATCA Reporting Code', false),
          addressBlock('address', 'Address (number, street, and apt. or suite no.)'),
          textField('accountNumbers', 'List account number(s) here (optional)', false),
          ssnField('tin', 'Social Security Number (or EIN)'),
        ],
      },
      {
        id: 'certification',
        title: 'Certification',
        order: 2,
        requiresAcknowledgment: true,
        scrollToReadRequired: false,
        acknowledgmentText: 'Under penalties of perjury, I certify that: (1) The number shown on this form is my correct taxpayer identification number. (2) I am not subject to backup withholding. (3) I am a U.S. citizen or other U.S. person. (4) The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct.',
        requiresInitials: false,
        requiresSignature: true,
        fields: [
          signatureField('signature', 'Signature of U.S. Person'),
          dateField('signatureDate', 'Date'),
        ],
      },
    ],
  },

  // ── 5. I9 ────────────────────────────────────────────────────────────────
  I9: {
    id: 'I9',
    documentType: 'i9_eligibility',
    title: 'Employment Eligibility Verification (I-9)',
    version: '2023',
    category: 'employment',
    description: 'USCIS Form I-9 — Employment Eligibility Verification.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: true,
    requiresInitials: [],
    requiresDateStamp: true,
    requiresGpsCapture: true,
    requiresIpCapture: true,
    captureDeviceInfo: true,
    allowSaveForLater: false,
    estimatedMinutes: 10,
    completionWebhook: 'i9_submitted',
    trinityValidationRules: [
      requiredRule('firstName', 'First Name'),
      requiredRule('lastName', 'Last Name'),
      requiredRule('dateOfBirth', 'Date of Birth'),
      requiredRule('citizenshipStatus', 'Citizenship/Immigration Status'),
      sigRule('employeeSignature'),
    ],
    sections: [
      {
        id: 'section1_employee',
        title: 'Section 1 – Employee Information and Attestation',
        order: 1,
        description: 'Complete this section before the first day of employment.',
        requiresAcknowledgment: true,
        acknowledgmentText: 'I attest, under penalty of perjury, that I am (check one of the following boxes) and that the information I have provided is true and correct.',
        requiresInitials: false,
        requiresSignature: true,
        fields: [
          textField('lastName', 'Last Name (Family Name)'),
          textField('firstName', 'First Name (Given Name)'),
          textField('middleInitial', 'Middle Initial', false),
          textField('otherLastNames', 'Other Last Names Used', false),
          addressBlock('address', 'Address'),
          dateField('dateOfBirth', 'Date of Birth'),
          ssnField('ssn', 'U.S. Social Security Number', false),
          emailField('email', 'Employee\'s Email Address', false),
          phoneField('phone', 'Employee\'s Telephone Number', false),
          selectField('citizenshipStatus', 'Citizenship/Immigration Status', [
            'A citizen of the United States',
            'A noncitizen national of the United States',
            'A lawful permanent resident',
            'An alien authorized to work',
          ]),
          textField('alienRegNumber', 'Alien Registration Number/USCIS Number (if applicable)', false),
          dateField('workAuthorizationExpiry', 'Employment Authorization Document Expiration Date', false),
          signatureField('employeeSignature', 'Employee Signature'),
          dateField('employeeSignatureDate', 'Today\'s Date'),
        ],
      },
      {
        id: 'section2_employer',
        title: 'Section 2 – Employer Certification',
        order: 2,
        description: 'Employer or authorized representative must complete and sign this section within 3 business days of the employee\'s first day of employment.',
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: true,
        fields: [
          selectField('listADocument', 'List A Document (Identity and Employment Authorization)', [
            'None',
            'U.S. Passport',
            'U.S. Passport Card',
            'Permanent Resident Card (I-551)',
            'Foreign Passport with I-94',
            'Employment Authorization Document (I-766)',
            'Other',
          ]),
          textField('listADocumentNumber', 'List A Document Number', false),
          dateField('listAExpiryDate', 'List A Expiration Date', false),
          selectField('listBDocument', 'List B Document (Identity)', [
            'None',
            'Driver\'s License',
            'State ID Card',
            'School ID with Photo',
            'U.S. Military Card',
            'Other',
          ]),
          textField('listBDocumentNumber', 'List B Document Number', false),
          selectField('listCDocument', 'List C Document (Employment Authorization)', [
            'None',
            'Social Security Account Number Card',
            'Original or Certified Birth Certificate',
            'Native American Tribal Document',
            'Form I-197',
            'Other',
          ]),
          textField('listCDocumentNumber', 'List C Document Number', false),
          textField('employerName', 'Employer or Authorized Representative Name'),
          textField('employerTitle', 'Title'),
          textField('employerOrganization', 'Employer\'s Business or Organization Name'),
          addressBlock('employerAddress', 'Employer\'s Business or Organization Address'),
          dateField('employerCertDate', 'Date Employee Began Employment'),
          signatureField('employerSignature', 'Employer Signature'),
          dateField('employerSignatureDate', 'Date'),
        ],
      },
    ],
  },

  // ── 6. Direct Deposit Authorization ─────────────────────────────────────
  DIRECT_DEPOSIT_AUTHORIZATION: {
    id: 'DIRECT_DEPOSIT_AUTHORIZATION',
    documentType: 'direct_deposit_authorization',
    title: 'Direct Deposit Authorization',
    version: '1.0',
    category: 'payroll',
    description: 'Authorize payroll direct deposit to your bank account.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: true,
    requiresInitials: [],
    requiresDateStamp: true,
    requiresGpsCapture: false,
    requiresIpCapture: true,
    captureDeviceInfo: true,
    allowSaveForLater: true,
    estimatedMinutes: 5,
    completionWebhook: 'direct_deposit_authorized',
    trinityValidationRules: [
      requiredRule('employeeName', 'Employee Name'),
      requiredRule('bankName', 'Bank Name'),
      sigRule('signature'),
    ],
    sections: [
      {
        id: 'bank_info',
        title: 'Bank Account Information',
        order: 1,
        description: 'Provide your bank account details for direct deposit. All information is encrypted and stored securely.',
        requiresAcknowledgment: true,
        acknowledgmentText: 'I authorize my employer to initiate credit entries to the account indicated and, if necessary, to initiate debit entries and adjustments for any credit entries made in error. This authority will remain in effect until revoked in writing.',
        requiresInitials: false,
        requiresSignature: true,
        fields: [
          textField('employeeName', 'Employee Full Name'),
          textField('bankName', 'Bank Name'),
          maskedNumber('routingNumber', 'Routing Number (ABA/Transit Number)', true, { helpText: '9-digit number found at the bottom of your check', validationPattern: '^\\d{9}$' }),
          maskedNumber('accountNumber', 'Account Number', true, { helpText: 'Your checking or savings account number' }),
          selectField('accountType', 'Account Type', ['Checking', 'Savings']),
          signatureField('signature', 'Employee Signature'),
          dateField('signatureDate', 'Date'),
        ],
      },
    ],
  },

  // ── 7. Employee Handbook Acknowledgment ──────────────────────────────────
  EMPLOYEE_HANDBOOK_ACKNOWLEDGMENT: {
    id: 'EMPLOYEE_HANDBOOK_ACKNOWLEDGMENT',
    documentType: 'employee_handbook_acknowledgment',
    title: 'Employee Handbook Acknowledgment',
    version: '1.0',
    category: 'employment',
    description: 'Acknowledge receipt and understanding of the Employee Handbook.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: true,
    requiresInitials: [],
    requiresDateStamp: true,
    requiresGpsCapture: true,
    requiresIpCapture: true,
    captureDeviceInfo: true,
    allowSaveForLater: false,
    estimatedMinutes: 8,
    completionWebhook: 'handbook_acknowledged',
    trinityValidationRules: [
      requiredRule('employeeName', 'Employee Name'),
      sigRule('signature'),
    ],
    sections: [
      {
        id: 'handbook',
        title: 'Employee Handbook',
        order: 1,
        description: 'Please read the complete Employee Handbook before signing.',
        requiresAcknowledgment: true,
        scrollToReadRequired: true,
        acknowledgmentText: 'I acknowledge that I have received, read, and understand the Employee Handbook. I understand that it is my responsibility to comply with the policies contained in the handbook. I acknowledge that the handbook does not constitute a contract of employment.',
        legalText: 'EMPLOYEE HANDBOOK SUMMARY\n\nThis handbook contains policies governing your employment including: code of conduct, dress code, attendance, performance standards, disciplinary procedures, benefits overview, and complaint procedures.\n\nKey policies:\n• You are expected to maintain professional conduct at all times\n• Punctuality and reliability are essential\n• Confidential information must be protected\n• Workplace safety standards must be followed\n• Zero tolerance for harassment or discrimination\n• Social media use must not violate company confidentiality\n• Cell phone use during shift must comply with client site rules\n\nThis handbook may be updated periodically. You will be notified of material changes. The most current version is always available from your supervisor or HR.',
        requiresInitials: false,
        requiresSignature: true,
        fields: [
          textField('employeeName', 'Employee Full Legal Name'),
          signatureField('signature', 'Employee Signature'),
          dateField('signatureDate', 'Date'),
        ],
      },
    ],
  },

  // ── 8. Liability Waiver ──────────────────────────────────────────────────
  LIABILITY_WAIVER: {
    id: 'LIABILITY_WAIVER',
    documentType: 'liability_waiver',
    title: 'Liability Acknowledgment',
    version: '1.0',
    category: 'employment',
    description: 'Acknowledge scope of authority as a private security officer.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: true,
    requiresInitials: [true, true, true],
    requiresDateStamp: true,
    requiresGpsCapture: false,
    requiresIpCapture: true,
    captureDeviceInfo: true,
    allowSaveForLater: false,
    estimatedMinutes: 10,
    completionWebhook: 'liability_waiver_signed',
    trinityValidationRules: [sigRule('finalSignature')],
    sections: [
      {
        id: 'private_citizen',
        title: 'Private Citizen Status',
        order: 1,
        requiresAcknowledgment: true,
        scrollToReadRequired: true,
        acknowledgmentText: 'I understand that I am employed as a private citizen and security officer, not as a law enforcement officer.',
        legalText: 'SECTION I — PRIVATE CITIZEN STATUS\n\nAs a security officer, you act as a private citizen. You are NOT a law enforcement officer and do not possess police powers. Your authority is limited to: (1) Observing and reporting suspicious activity. (2) Controlling access to client premises as authorized by the client. (3) Detaining individuals only under the doctrine of citizen\'s arrest as defined by applicable state law, and only when you have witnessed a felony being committed.',
        requiresInitials: true,
        requiresSignature: false,
        fields: [initialsField('initials1', 'Section I Initials')],
      },
      {
        id: 'force_limitations',
        title: 'Use of Force Limitations',
        order: 2,
        requiresAcknowledgment: true,
        scrollToReadRequired: true,
        acknowledgmentText: 'I understand the limitations on my authority to use force.',
        legalText: 'SECTION II — USE OF FORCE POLICY\n\nThe use of force is a last resort. Reasonable force may only be used to protect yourself or others from imminent physical harm. Excessive force is strictly prohibited and may result in criminal charges, civil liability, and immediate termination. You must document any use of force incident immediately in an incident report. The organization does not indemnify officers for unauthorized use of force.',
        requiresInitials: true,
        requiresSignature: false,
        fields: [initialsField('initials2', 'Section II Initials')],
      },
      {
        id: 'final_sig',
        title: 'Final Agreement',
        order: 3,
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: true,
        fields: [
          signatureField('finalSignature', 'Employee Signature'),
          dateField('finalDate', 'Date'),
        ],
      },
    ],
  },

  // ── 9. Drug-Free Workplace ───────────────────────────────────────────────
  DRUG_FREE_WORKPLACE: {
    id: 'DRUG_FREE_WORKPLACE',
    documentType: 'drug_free_workplace',
    title: 'Drug-Free Workplace Policy Acknowledgment',
    version: '1.0',
    category: 'policy',
    description: 'Acknowledge receipt of drug-free workplace policy.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: true,
    requiresInitials: [],
    requiresDateStamp: true,
    requiresGpsCapture: false,
    requiresIpCapture: true,
    captureDeviceInfo: true,
    allowSaveForLater: false,
    estimatedMinutes: 5,
    completionWebhook: 'drug_free_acknowledged',
    trinityValidationRules: [sigRule('signature')],
    sections: [
      {
        id: 'policy',
        title: 'Drug-Free Workplace Policy',
        order: 1,
        requiresAcknowledgment: true,
        scrollToReadRequired: true,
        acknowledgmentText: 'I have read, understand, and agree to comply with this organization\'s Drug-Free Workplace Policy.',
        legalText: 'This organization is committed to maintaining a drug-free workplace in compliance with federal and state law. Prohibited conduct includes the use, possession, distribution, or sale of illegal drugs or alcohol on company property or during work hours. Pre-employment, random, and post-incident drug testing may be required. Violation is grounds for immediate termination.',
        requiresInitials: false,
        requiresSignature: true,
        fields: [
          signatureField('signature', 'Employee Signature'),
          dateField('signatureDate', 'Date'),
        ],
      },
    ],
  },

  // ── 10. Post Orders / SOP Acknowledgment ─────────────────────────────────
  POST_ORDERS_ACKNOWLEDGMENT: {
    id: 'POST_ORDERS_ACKNOWLEDGMENT',
    documentType: 'post_orders_acknowledgment',
    title: 'Post Orders / Site SOP Acknowledgment',
    version: '1.0',
    category: 'operations',
    description: 'Site-specific post orders and standard operating procedures acknowledgment.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: true,
    requiresInitials: [true, true, true, true],
    requiresDateStamp: true,
    requiresGpsCapture: true,
    requiresIpCapture: true,
    captureDeviceInfo: true,
    allowSaveForLater: false,
    estimatedMinutes: 12,
    completionWebhook: 'post_orders_acknowledged',
    trinityValidationRules: [sigRule('finalSignature')],
    sections: [
      {
        id: 'site_rules',
        title: 'Site Rules and Requirements',
        order: 1,
        requiresAcknowledgment: true,
        acknowledgmentText: 'I have read and understand the site rules and requirements.',
        requiresInitials: true,
        requiresSignature: false,
        fields: [
          textField('siteName', 'Site / Client Name'),
          textField('siteAddress', 'Site Address'),
          initialsField('siteRulesInitials', 'Site Rules Initials'),
        ],
      },
      {
        id: 'emergency_procedures',
        title: 'Emergency Procedures',
        order: 2,
        requiresAcknowledgment: true,
        acknowledgmentText: 'I have read and understand the emergency procedures for this site.',
        requiresInitials: true,
        requiresSignature: false,
        fields: [
          initialsField('emergencyInitials', 'Emergency Procedures Initials'),
        ],
      },
      {
        id: 'client_requirements',
        title: 'Client-Specific Requirements',
        order: 3,
        requiresAcknowledgment: true,
        acknowledgmentText: 'I have read and understand the client-specific requirements.',
        requiresInitials: true,
        requiresSignature: false,
        fields: [
          initialsField('clientInitials', 'Client Requirements Initials'),
        ],
      },
      {
        id: 'prohibited',
        title: 'Prohibited Items and Behaviors',
        order: 4,
        requiresAcknowledgment: true,
        acknowledgmentText: 'I understand the items and behaviors that are prohibited at this site.',
        requiresInitials: true,
        requiresSignature: false,
        fields: [
          initialsField('prohibitedInitials', 'Prohibited Items Initials'),
        ],
      },
      {
        id: 'final',
        title: 'Final Acknowledgment',
        order: 5,
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: true,
        fields: [
          signatureField('finalSignature', 'Officer Signature'),
          dateField('finalDate', 'Date'),
        ],
      },
    ],
  },

  // ── 11. Uniform and Equipment Issuance ───────────────────────────────────
  UNIFORM_EQUIPMENT_ISSUANCE: {
    id: 'UNIFORM_EQUIPMENT_ISSUANCE',
    documentType: 'uniform_equipment_issuance',
    title: 'Uniform and Equipment Issuance Record',
    version: '1.0',
    category: 'operations',
    description: 'Document uniform and equipment issued to security officer.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: true,
    requiresInitials: [],
    requiresDateStamp: true,
    requiresGpsCapture: false,
    requiresIpCapture: true,
    captureDeviceInfo: true,
    allowSaveForLater: false,
    estimatedMinutes: 8,
    completionWebhook: 'equipment_issued',
    trinityValidationRules: [
      requiredRule('employeeName', 'Employee Name'),
      sigRule('officerSignature'),
    ],
    sections: [
      {
        id: 'issuance',
        title: 'Items Issued',
        order: 1,
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: false,
        fields: [
          textField('employeeName', 'Employee Name'),
          dateField('issuanceDate', 'Date Issued'),
          textField('uniformShirtSize', 'Uniform Shirt Size', false),
          textField('uniformPantsSize', 'Uniform Pants Size', false),
          selectField('uniformShirtCondition', 'Shirt Condition', ['New', 'Good', 'Fair']),
          textField('badgeNumber', 'Badge / ID Number', false),
          checkboxField('radioIssued', 'Radio Issued', false),
          checkboxField('flashlightIssued', 'Flashlight Issued', false),
          checkboxField('handcuffsIssued', 'Handcuffs Issued', false),
          textareaField('otherItemsIssued', 'Other Items Issued', false),
          textField('issuedBy', 'Issuing Officer Name'),
        ],
      },
      {
        id: 'acknowledgment',
        title: 'Officer Acknowledgment',
        order: 2,
        requiresAcknowledgment: true,
        acknowledgmentText: 'I acknowledge receipt of the above items in the condition noted. I understand that I am responsible for these items and must return them in the same or better condition upon separation.',
        requiresInitials: false,
        requiresSignature: true,
        fields: [
          signatureField('officerSignature', 'Officer Signature'),
          signatureField('issuingOfficerSignature', 'Issuing Officer Signature'),
          dateField('signatureDate', 'Date'),
        ],
      },
    ],
  },

  // ── 12. Offer Letter ─────────────────────────────────────────────────────
  OFFER_LETTER: {
    id: 'OFFER_LETTER',
    documentType: 'offer_letter',
    title: 'Employment Offer Letter',
    version: '1.0',
    category: 'employment',
    description: 'Formal offer of employment.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: true,
    requiresInitials: [],
    requiresDateStamp: true,
    requiresGpsCapture: false,
    requiresIpCapture: true,
    captureDeviceInfo: true,
    allowSaveForLater: false,
    estimatedMinutes: 5,
    completionWebhook: 'offer_letter_accepted',
    trinityValidationRules: [sigRule('employeeSignature')],
    sections: [
      {
        id: 'offer_terms',
        title: 'Offer Terms',
        order: 1,
        description: 'Review your offer of employment below.',
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: false,
        fields: [
          textField('employeeName', 'Employee Full Name'),
          textField('positionTitle', 'Position Title'),
          dateField('startDate', 'Start Date'),
          { id: 'hourlyRate', label: 'Hourly Rate', type: 'number' as FieldType, required: true, mobileFullWidth: true, sensitiveData: false },
          selectField('payType', 'Pay Type', ['W-2 Employee', '1099 Contractor']),
          selectField('payFrequency', 'Pay Frequency', ['Weekly', 'Bi-Weekly', 'Semi-Monthly', 'Monthly']),
          textField('supervisorName', 'Reporting Supervisor'),
        ],
      },
      {
        id: 'acceptance',
        title: 'Acceptance',
        order: 2,
        requiresAcknowledgment: true,
        acknowledgmentText: 'I accept this offer of employment and acknowledge that my employment is at-will and subject to the terms described herein.',
        requiresInitials: false,
        requiresSignature: true,
        fields: [
          signatureField('employeeSignature', 'Employee Signature'),
          dateField('acceptanceDate', 'Date'),
        ],
      },
    ],
  },

  // ── 13. OJT Log ──────────────────────────────────────────────────────────
  OJT_LOG: {
    id: 'OJT_LOG',
    documentType: 'ojt_log',
    title: 'On-the-Job Training (OJT) Log',
    version: '1.0',
    category: 'training',
    description: 'Record of on-the-job training completed.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: true,
    requiresInitials: [],
    requiresDateStamp: true,
    requiresGpsCapture: false,
    requiresIpCapture: true,
    captureDeviceInfo: true,
    allowSaveForLater: true,
    estimatedMinutes: 8,
    completionWebhook: 'ojt_log_submitted',
    trinityValidationRules: [
      requiredRule('employeeName', 'Employee Name'),
      sigRule('trainerSignature'),
    ],
    sections: [
      {
        id: 'training_details',
        title: 'Training Details',
        order: 1,
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: false,
        fields: [
          textField('employeeName', 'Employee Name'),
          textField('trainerName', 'Trainer Name'),
          dateField('trainingDate', 'Training Date'),
          { id: 'trainingDurationHours', label: 'Duration (hours)', type: 'number' as FieldType, required: true, mobileFullWidth: true, sensitiveData: false },
          textField('siteLocation', 'Site / Location Trained At'),
          checkboxField('topicPatrolProcedures', 'Topic: Patrol Procedures', false),
          checkboxField('topicAccessControl', 'Topic: Access Control', false),
          checkboxField('topicIncidentReporting', 'Topic: Incident Reporting', false),
          checkboxField('topicEmergencyProcedures', 'Topic: Emergency Procedures', false),
          checkboxField('topicClientSiteRules', 'Topic: Client Site Rules', false),
          checkboxField('topicCommunicationProtocol', 'Topic: Communication Protocol', false),
          textareaField('additionalTopics', 'Additional Topics Covered', false),
          textareaField('notes', 'Trainer Notes', false),
        ],
      },
      {
        id: 'signatures',
        title: 'Signatures',
        order: 2,
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: true,
        fields: [
          signatureField('trainerSignature', 'Trainer Signature'),
          signatureField('employeeSignature', 'Employee Signature – Confirming Training Received'),
          dateField('signatureDate', 'Date'),
        ],
      },
    ],
  },

  // ── 14. Disciplinary Notice ───────────────────────────────────────────────
  DISCIPLINARY_NOTICE: {
    id: 'DISCIPLINARY_NOTICE',
    documentType: 'disciplinary_notice',
    title: 'Disciplinary Notice',
    version: '1.0',
    category: 'hr',
    description: 'Formal disciplinary notice — employee signature confirms receipt, not agreement.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: true,
    requiresInitials: [],
    requiresDateStamp: true,
    requiresGpsCapture: false,
    requiresIpCapture: true,
    captureDeviceInfo: true,
    allowSaveForLater: false,
    estimatedMinutes: 5,
    completionWebhook: 'disciplinary_notice_signed',
    trinityValidationRules: [
      requiredRule('employeeName', 'Employee Name'),
      sigRule('employeeSignature'),
    ],
    sections: [
      {
        id: 'notice',
        title: 'Disciplinary Notice Details',
        order: 1,
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: false,
        fields: [
          textField('employeeName', 'Employee Name'),
          dateField('incidentDate', 'Date of Incident'),
          textareaField('incidentDescription', 'Description of Incident', true),
          textField('policyViolated', 'Policy Violated'),
          selectField('previousWarnings', 'Previous Warnings', ['None', '1 Verbal Warning', '2 Verbal Warnings', '1 Written Warning', 'Multiple Written Warnings']),
          textareaField('correctiveAction', 'Corrective Action Required', true),
          textareaField('consequences', 'Consequence if Repeated', true),
          textField('managementName', 'Management Name'),
        ],
      },
      {
        id: 'acknowledgment',
        title: 'Employee Acknowledgment',
        order: 2,
        requiresAcknowledgment: true,
        acknowledgmentText: 'My signature below confirms that I have received this notice. It does not necessarily indicate that I agree with its contents.',
        requiresInitials: false,
        requiresSignature: true,
        fields: [
          signatureField('employeeSignature', 'Employee Signature'),
          signatureField('managementSignature', 'Management Signature'),
          dateField('signatureDate', 'Date'),
        ],
      },
    ],
  },

  // ── 15. Separation Notice ────────────────────────────────────────────────
  SEPARATION_NOTICE: {
    id: 'SEPARATION_NOTICE',
    documentType: 'separation_notice',
    title: 'Notice of Employment Separation',
    version: '1.0',
    category: 'hr',
    description: 'Notice of termination or resignation with final pay information.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: true,
    requiresInitials: [],
    requiresDateStamp: true,
    requiresGpsCapture: false,
    requiresIpCapture: true,
    captureDeviceInfo: true,
    allowSaveForLater: false,
    estimatedMinutes: 5,
    completionWebhook: 'separation_notice_completed',
    trinityValidationRules: [
      requiredRule('employeeName', 'Employee Name'),
      sigRule('managementSignature'),
    ],
    sections: [
      {
        id: 'separation',
        title: 'Separation Details',
        order: 1,
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: false,
        fields: [
          textField('employeeName', 'Employee Name'),
          dateField('lastDay', 'Last Day of Employment'),
          selectField('reasonForSeparation', 'Reason for Separation', [
            'Voluntary Resignation',
            'Involuntary Termination – Performance',
            'Involuntary Termination – Conduct',
            'Layoff / Reduction in Force',
            'End of Contract',
            'Mutual Agreement',
            'Other',
          ]),
          checkboxField('cobraNoticeProvided', 'COBRA / Benefits Notice Provided', false),
          checkboxField('equipmentReturned', 'All Equipment Returned', false),
          textareaField('finalPayInfo', 'Final Pay Information', false),
        ],
      },
      {
        id: 'signatures',
        title: 'Signatures',
        order: 2,
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: true,
        fields: [
          signatureField('managementSignature', 'Management Signature'),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          signatureField('employeeSignature', 'Employee Signature (Receipt Acknowledged)', false as any),
          dateField('signatureDate', 'Date'),
        ],
      },
    ],
  },

  // ── 16. Reference Check ──────────────────────────────────────────────────
  REFERENCE_CHECK: {
    id: 'REFERENCE_CHECK',
    documentType: 'reference_check',
    title: 'Reference Check Authorization',
    version: '1.0',
    category: 'employment',
    description: 'Authorization to contact professional references.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: true,
    requiresInitials: [],
    requiresDateStamp: true,
    requiresGpsCapture: false,
    requiresIpCapture: true,
    captureDeviceInfo: false,
    allowSaveForLater: false,
    estimatedMinutes: 3,
    completionWebhook: 'reference_check_authorized',
    trinityValidationRules: [sigRule('signature')],
    sections: [
      {
        id: 'authorization',
        title: 'Reference Check Authorization',
        order: 1,
        requiresAcknowledgment: true,
        acknowledgmentText: 'I authorize the organization to contact the references listed on my application and to verify my employment history and professional qualifications.',
        requiresInitials: false,
        requiresSignature: true,
        fields: [
          signatureField('signature', 'Applicant Signature'),
          dateField('signatureDate', 'Date'),
        ],
      },
    ],
  },

  // ── 17. Background Check Authorization ───────────────────────────────────
  BACKGROUND_CHECK_AUTHORIZATION: {
    id: 'BACKGROUND_CHECK_AUTHORIZATION',
    documentType: 'background_check_authorization',
    title: 'Background Check Authorization',
    version: '1.0',
    category: 'employment',
    description: 'FCRA-compliant background check consent.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: true,
    requiresInitials: [],
    requiresDateStamp: true,
    requiresGpsCapture: false,
    requiresIpCapture: true,
    captureDeviceInfo: true,
    allowSaveForLater: false,
    estimatedMinutes: 5,
    completionWebhook: 'background_check_authorized',
    trinityValidationRules: [
      requiredRule('fullName', 'Full Name'),
      requiredRule('fcraConsent', 'FCRA Consent'),
      sigRule('signature'),
    ],
    sections: [
      {
        id: 'fcra',
        title: 'FCRA Disclosure and Authorization',
        order: 1,
        requiresAcknowledgment: true,
        scrollToReadRequired: true,
        acknowledgmentText: 'I have read the above disclosure and hereby authorize the organization to obtain consumer reports about me.',
        legalText: 'FAIR CREDIT REPORTING ACT (FCRA) DISCLOSURE\n\nIn connection with your application for employment, the organization may obtain a consumer report and/or investigative consumer report (background check) about you from a consumer reporting agency. These reports may contain information about your character, general reputation, personal characteristics, mode of living, criminal records, credit history, and employment history.\n\nYou have the right to request disclosure of the nature and scope of any investigative consumer report within a reasonable period of time after this form is received. You may also request a written summary of your rights under the FCRA by contacting the Federal Trade Commission.',
        requiresInitials: false,
        requiresSignature: true,
        fields: [
          textField('fullName', 'Full Legal Name'),
          dateField('dateOfBirth', 'Date of Birth'),
          ssnField('ssn', 'Social Security Number'),
          textField('currentAddress', 'Current Address'),
          checkboxField('fcraConsent', 'I authorize this background check'),
          signatureField('signature', 'Applicant Signature'),
          dateField('signatureDate', 'Date'),
        ],
      },
    ],
  },

  // ── 18. SOP Acknowledgment ────────────────────────────────────────────────
  SOP_ACKNOWLEDGMENT: {
    id: 'SOP_ACKNOWLEDGMENT',
    documentType: 'sop_acknowledgment',
    title: 'Standard Operating Procedures Acknowledgment',
    version: '1.0',
    category: 'operations',
    description: 'Acknowledge receipt and understanding of organizational SOPs.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: true,
    requiresInitials: [],
    requiresDateStamp: true,
    requiresGpsCapture: false,
    requiresIpCapture: true,
    captureDeviceInfo: true,
    allowSaveForLater: false,
    estimatedMinutes: 5,
    completionWebhook: 'sop_acknowledged',
    trinityValidationRules: [sigRule('signature')],
    sections: [
      {
        id: 'sop',
        title: 'SOP Acknowledgment',
        order: 1,
        requiresAcknowledgment: true,
        scrollToReadRequired: false,
        acknowledgmentText: 'I have received, read, and understand the Standard Operating Procedures applicable to my position. I agree to comply with all SOPs.',
        requiresInitials: false,
        requiresSignature: true,
        fields: [
          textField('employeeName', 'Employee Name'),
          textField('sopVersion', 'SOP Version / Date', false),
          signatureField('signature', 'Employee Signature'),
          dateField('signatureDate', 'Date'),
        ],
      },
    ],
  },

  // ── 19. Incident Report ───────────────────────────────────────────────────
  INCIDENT_REPORT: {
    id: 'INCIDENT_REPORT',
    documentType: 'incident_report',
    title: 'Security Incident Report',
    version: '1.0',
    category: 'operations',
    description: 'Document security incidents and events.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: true,
    requiresInitials: [],
    requiresDateStamp: true,
    requiresGpsCapture: true,
    requiresIpCapture: true,
    captureDeviceInfo: true,
    allowSaveForLater: true,
    estimatedMinutes: 10,
    completionWebhook: 'incident_report_submitted',
    trinityValidationRules: [
      requiredRule('incidentType', 'Incident Type'),
      requiredRule('incidentDescription', 'Incident Description'),
      sigRule('officerSignature'),
    ],
    sections: [
      {
        id: 'incident_details',
        title: 'Incident Details',
        order: 1,
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: false,
        fields: [
          textField('officerName', 'Reporting Officer Name'),
          textField('badgeNumber', 'Badge Number', false),
          dateField('incidentDate', 'Date of Incident'),
          textField('incidentTime', 'Time of Incident'),
          textField('locationOfIncident', 'Location of Incident'),
          selectField('incidentType', 'Type of Incident', [
            'Trespass',
            'Theft / Suspected Theft',
            'Altercation / Fight',
            'Medical Emergency',
            'Fire / Hazmat',
            'Property Damage',
            'Suspicious Activity',
            'Unauthorized Access',
            'Vehicle Accident',
            'Use of Force',
            'Other',
          ]),
          textareaField('incidentDescription', 'Detailed Description of Incident', true),
          textareaField('actionsTaken', 'Actions Taken by Officer', true),
          checkboxField('policeNotified', 'Police/Emergency Services Notified', false),
          textField('policeReportNumber', 'Police Report Number (if applicable)', false),
          textField('witnessNames', 'Witness Name(s)', false),
          uploadField('evidencePhoto', 'Evidence Photo (optional)', false),
        ],
      },
      {
        id: 'officer_signature',
        title: 'Officer Signature',
        order: 2,
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: true,
        fields: [
          signatureField('officerSignature', 'Officer Signature'),
          dateField('reportDate', 'Date Report Filed'),
        ],
      },
    ],
  },

  // ── 20. Collections Demand Letter ─────────────────────────────────────────
  COLLECTIONS_DEMAND_LETTER: {
    id: 'COLLECTIONS_DEMAND_LETTER',
    documentType: 'collections_demand_letter',
    title: 'Collections Demand Letter',
    version: '1.0',
    category: 'finance',
    description: 'Formal demand letter for outstanding invoice payments.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: true,
    requiresInitials: [],
    requiresDateStamp: true,
    requiresGpsCapture: false,
    requiresIpCapture: false,
    captureDeviceInfo: false,
    allowSaveForLater: true,
    estimatedMinutes: 5,
    completionWebhook: 'collections_demand_sent',
    trinityValidationRules: [
      requiredRule('clientName', 'Client Name'),
      requiredRule('totalAmountDue', 'Total Amount Due'),
      sigRule('authorizedSignature'),
    ],
    sections: [
      {
        id: 'demand',
        title: 'Demand for Payment',
        order: 1,
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: false,
        fields: [
          textField('clientName', 'Client / Company Name'),
          addressBlock('clientAddress', 'Client Billing Address'),
          textareaField('outstandingInvoices', 'Outstanding Invoice(s) — Invoice #, Date, Amount', true, { helpText: 'List each invoice on a separate line' }),
          { id: 'totalAmountDue', label: 'Total Amount Due ($)', type: 'number' as FieldType, required: true, mobileFullWidth: true, sensitiveData: false },
          dateField('paymentDeadline', 'Payment Deadline'),
          textField('paymentLink', 'Payment Link (if applicable)', false),
        ],
      },
      {
        id: 'authorization',
        title: 'Authorized Signature',
        order: 2,
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: true,
        fields: [
          textField('authorizedName', 'Authorized Representative Name'),
          textField('authorizedTitle', 'Title'),
          signatureField('authorizedSignature', 'Authorized Signature'),
          dateField('letterDate', 'Letter Date'),
        ],
      },
    ],
  },

  // ── 21. Training Certificate (mirrors training system) ────────────────────
  TRAINING_CERTIFICATE: {
    id: 'TRAINING_CERTIFICATE',
    documentType: 'training_certificate',
    title: 'Training Completion Certificate',
    version: '1.0',
    category: 'training',
    description: 'Certificate of completion for officer training modules.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: false,
    requiresInitials: [],
    requiresDateStamp: true,
    requiresGpsCapture: false,
    requiresIpCapture: false,
    captureDeviceInfo: false,
    allowSaveForLater: false,
    estimatedMinutes: 1,
    completionWebhook: 'training_certificate_issued',
    trinityValidationRules: [],
    sections: [],
  },

  // ── 22. Intervention Record ───────────────────────────────────────────────
  INTERVENTION_RECORD: {
    id: 'INTERVENTION_RECORD',
    documentType: 'training_intervention',
    title: 'Training Intervention Record',
    version: '1.0',
    category: 'training',
    description: 'Document training intervention for officer compliance.',
    universalHeader: true,
    universalFooter: true,
    requiresSignature: true,
    requiresInitials: [],
    requiresDateStamp: true,
    requiresGpsCapture: false,
    requiresIpCapture: true,
    captureDeviceInfo: false,
    allowSaveForLater: false,
    estimatedMinutes: 5,
    completionWebhook: 'training_intervention_recorded',
    trinityValidationRules: [sigRule('supervisorSignature')],
    sections: [
      {
        id: 'intervention',
        title: 'Intervention Details',
        order: 1,
        requiresAcknowledgment: false,
        requiresInitials: false,
        requiresSignature: true,
        fields: [
          textField('employeeName', 'Employee Name'),
          textField('moduleName', 'Training Module'),
          selectField('interventionType', 'Intervention Type', ['Mandatory Retake', 'Extended Deadline', 'Remediation Required', 'Supervisor Review']),
          textareaField('interventionNotes', 'Notes', false),
          signatureField('supervisorSignature', 'Supervisor Signature'),
          dateField('interventionDate', 'Date'),
        ],
      },
    ],
  },
};

// ── Registry Lookup ───────────────────────────────────────────────────────────

export function getTemplate(templateId: string): DocumentTemplate | null {
  return TEMPLATE_REGISTRY[templateId] ?? null;
}

export function getAllTemplates(): DocumentTemplate[] {
  return Object.values(TEMPLATE_REGISTRY);
}

export function getTemplatesByCategory(category: string): DocumentTemplate[] {
  return Object.values(TEMPLATE_REGISTRY).filter(t => t.category === category);
}

export const TEMPLATE_CATEGORIES = [
  'employment',
  'tax',
  'payroll',
  'operations',
  'hr',
  'policy',
  'finance',
  'training',
] as const;

// ── Bilingual Template Resolution ─────────────────────────────────────────────
// All templates support both English and Spanish. When language='es', the
// renderer uses i18n to translate field labels and section titles at render
// time. This function marks the resolved template with its target language so
// the document renderer knows to apply Spanish translations.

export function getTemplateForLanguage(templateId: string, language: string): DocumentTemplate | null {
  const template = getTemplate(templateId);
  if (!template) return null;
  const lang = language === 'es' ? 'es' : 'en';
  return { ...template, language: lang, supportedLanguages: ['en', 'es'] };
}

export function getTemplatesForLanguage(category: string, language: string): DocumentTemplate[] {
  return getTemplatesByCategory(category).map(t => ({
    ...t,
    language: language === 'es' ? 'es' : 'en',
    supportedLanguages: ['en', 'es'],
  }));
}
