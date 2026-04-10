/**
 * Employee Document Onboarding Service
 * 
 * Manages required document collection for employee onboarding.
 * Security guards have specific compliance requirements that must be completed
 * before they can be assigned to shifts.
 * 
 * Features:
 * - Multi-state regulatory compliance (TX, CA, FL, NY + federal)
 * - Industry-specific document requirements (security guard, armed guard, etc.)
 * - Document completion tracking
 * - Work eligibility verification
 * - Dashboard task list for incomplete documents
 * - Expiration tracking and renewal alerts
 * - State audit-ready gap analysis
 */

import { db } from '../db';
import { employees, employeeDocuments, workspaces } from '@shared/schema';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { platformEventBus } from './platformEventBus';
import {
  getStateRequiredDocuments,
  compareDocumentsToStateRequirements,
  getStateComplianceConfig,
  UNIVERSAL_FEDERAL_REQUIREMENTS,
  type StateRequiredDocument,
  type ComplianceGapReport,
} from './compliance/stateComplianceConfig';
import { createLogger } from '../lib/logger';
const log = createLogger('employeeDocumentOnboardingService');


export type SecurityPosition = 'unarmed_guard' | 'armed_guard' | 'supervisor' | 'site_manager';

export interface RequiredDocument {
  id: string;
  documentType: string;
  name: string;
  description: string;
  category: 'licensing' | 'training' | 'background' | 'compliance' | 'identification' | 'medical' | 'firearms';
  priority: 'critical' | 'high' | 'medium';
  expiresAfterYears?: number;
  renewalRequired: boolean;
  blocksWorkAssignment: boolean;
  regulatoryCitation?: string;
}

export interface DocumentRequirementStatus {
  requirement: RequiredDocument;
  status: 'not_started' | 'uploaded' | 'pending_review' | 'approved' | 'rejected' | 'expired';
  documentId?: string;
  uploadedAt?: Date;
  expirationDate?: Date;
  daysUntilExpiration?: number;
  rejectionReason?: string;
}

export interface OnboardingDeadline {
  hireDate: string;
  deadlineDate: string;
  daysRemaining: number;
  daysElapsed: number;
  isOverdue: boolean;
  urgencyLevel: 'on_track' | 'warning' | 'critical' | 'overdue';
}

export interface EmployeeOnboardingStatus {
  employeeId: string;
  employeeName: string;
  position: SecurityPosition;
  workState: string;
  isWorkEligible: boolean;
  completionPercentage: number;
  criticalDocumentsMissing: number;
  totalDocumentsRequired: number;
  totalDocumentsCompleted: number;
  documentStatuses: DocumentRequirementStatus[];
  requirements: DocumentRequirementStatus[];
  blockedReasons: string[];
  onboardingDeadline?: OnboardingDeadline;
  onboardingStatus: string;
  nextExpiringDocument?: {
    name: string;
    expirationDate: Date;
    daysUntilExpiration: number;
  };
}

const SECURITY_GUARD_REQUIREMENTS: Record<SecurityPosition, RequiredDocument[]> = {
  unarmed_guard: [
    {
      id: 'cover_sheet',
      documentType: 'cover_sheet',
      name: 'Officer File Cover Sheet',
      description: 'Personnel file cover sheet with officer info, emergency contacts, and position details.',
      category: 'compliance',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
      regulatoryCitation: 'TAC §35.111 - Employee Records',
    },
    {
      id: 'employment_application',
      documentType: 'employment_application',
      name: 'Employment Application',
      description: 'Completed company employment application with full personal history.',
      category: 'compliance',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
      regulatoryCitation: 'TAC §35.111(1) - Full name, DOB, position, address',
    },
    {
      id: 'employee_photograph',
      documentType: 'employee_photograph',
      name: 'Employee Photograph (Color)',
      description: 'Recent color photograph of employee. Required by state for personnel file.',
      category: 'identification',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
      regulatoryCitation: 'TAC §35.111(5) - One color photograph',
    },
    {
      id: 'guard_card',
      documentType: 'guard_card',
      name: 'Security Guard Registration Card',
      description: 'State-issued security guard license/registration card. Required before any work assignment.',
      category: 'licensing',
      priority: 'critical',
      expiresAfterYears: 2,
      renewalRequired: true,
      blocksWorkAssignment: true,
      regulatoryCitation: 'TX Occ. Code §1702.230 - Registration required',
    },
    {
      id: 'guard_card_copy',
      documentType: 'guard_card_copy',
      name: 'Guard Card Copy (Front & Back, Color)',
      description: 'Color copy of guard card, front and back. Required for state audit file.',
      category: 'licensing',
      priority: 'critical',
      renewalRequired: true,
      expiresAfterYears: 2,
      blocksWorkAssignment: true,
    },
    {
      id: 'zero_policy_drug_form',
      documentType: 'zero_policy_drug_form',
      name: 'Zero Tolerance Drug Policy Acknowledgment',
      description: 'Signed acknowledgment of company zero-tolerance drug and alcohol policy.',
      category: 'compliance',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
    },
    {
      id: 'drug_test',
      documentType: 'drug_test',
      name: 'Pre-Employment Drug Screening Results',
      description: 'Clear pre-employment drug test results from authorized testing facility.',
      category: 'compliance',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
      regulatoryCitation: 'TAC §35.111(6) - Results of any drug tests',
    },
    {
      id: 'background_check',
      documentType: 'background_check',
      name: 'Background Check Results',
      description: 'Clear criminal background check from authorized agency.',
      category: 'background',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
      regulatoryCitation: 'TAC §35.111(7) - Pre-employment check documentation',
    },
    {
      id: 'fingerprint_receipt',
      documentType: 'fingerprint_receipt',
      name: 'Fingerprint Receipt (IdentoGO/LiveScan)',
      description: 'Electronic fingerprint submission receipt for FBI and state background check.',
      category: 'background',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
      regulatoryCitation: 'TX Occ. Code §1702.230(d) - Fingerprinting required',
    },
    {
      id: 'level_ii_training',
      documentType: 'level_ii_training',
      name: 'Level II Training Certificate (30 Hours)',
      description: 'State-mandated 30-hour Level II non-commissioned security officer training certificate from DPS-licensed school.',
      category: 'training',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
      regulatoryCitation: 'TAC §35.111(8), TAC §35.142 - Level II training (30 hrs)',
    },
    {
      id: 'i9_form',
      documentType: 'i9_form',
      name: 'I-9 Employment Eligibility Verification',
      description: 'Federal form verifying identity and employment authorization. Must be completed within 3 business days of hire.',
      category: 'compliance',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
      regulatoryCitation: '8 USC §1324a - Employment verification (federal)',
    },
    {
      id: 'photo_id',
      documentType: 'government_id',
      name: 'Government-Issued Photo ID',
      description: 'Valid driver\'s license, state ID, or passport.',
      category: 'identification',
      priority: 'critical',
      expiresAfterYears: 8,
      renewalRequired: true,
      blocksWorkAssignment: true,
    },
    {
      id: 'photo_id_copy',
      documentType: 'photo_id_copy',
      name: 'Photo ID Copy (Front & Back, Color)',
      description: 'Color copy of government-issued photo ID, front and back for personnel file.',
      category: 'identification',
      priority: 'critical',
      renewalRequired: true,
      expiresAfterYears: 8,
      blocksWorkAssignment: true,
    },
    {
      id: 'ssn_card',
      documentType: 'social_security_card',
      name: 'Social Security Card',
      description: 'Social Security card for I-9 and payroll verification.',
      category: 'identification',
      priority: 'high',
      renewalRequired: false,
      blocksWorkAssignment: false,
    },
    {
      id: 'cpr_first_aid',
      documentType: 'cpr_first_aid_cert',
      name: 'CPR / First Aid Certification',
      description: 'Current CPR and First Aid certification from accredited provider (AHA, Red Cross).',
      category: 'training',
      priority: 'high',
      expiresAfterYears: 2,
      renewalRequired: true,
      blocksWorkAssignment: false,
      regulatoryCitation: 'Industry best practice — CPR/First Aid certification recommended for all security personnel',
    },
    {
      id: 'w4_form',
      documentType: 'tax_form',
      name: 'W-4 Tax Withholding Form',
      description: 'Federal tax withholding election form.',
      category: 'compliance',
      priority: 'high',
      renewalRequired: false,
      blocksWorkAssignment: false,
      regulatoryCitation: 'IRS Publication 15 (Circular E)',
    },
    {
      id: 'direct_deposit',
      documentType: 'direct_deposit_form',
      name: 'Direct Deposit Authorization',
      description: 'Bank account information for payroll direct deposit.',
      category: 'compliance',
      priority: 'medium',
      renewalRequired: false,
      blocksWorkAssignment: false,
    },
    {
      id: 'handbook_ack',
      documentType: 'policy_acknowledgment',
      name: 'Employee Handbook Acknowledgment',
      description: 'Signed acknowledgment of company policies and procedures.',
      category: 'compliance',
      priority: 'medium',
      renewalRequired: false,
      blocksWorkAssignment: false,
    },
    {
      id: 'confidentiality_agreement',
      documentType: 'confidentiality_agreement',
      name: 'Confidentiality Agreement',
      description: 'Signed confidentiality and non-disclosure agreement for client site information.',
      category: 'compliance',
      priority: 'medium',
      renewalRequired: false,
      blocksWorkAssignment: false,
    },
  ],

  armed_guard: [
    {
      id: 'cover_sheet',
      documentType: 'cover_sheet',
      name: 'Officer File Cover Sheet',
      description: 'Personnel file cover sheet with officer info, emergency contacts, and position details.',
      category: 'compliance',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
      regulatoryCitation: 'TAC §35.111 - Employee Records',
    },
    {
      id: 'employment_application',
      documentType: 'employment_application',
      name: 'Employment Application',
      description: 'Completed company employment application with full personal history.',
      category: 'compliance',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
    },
    {
      id: 'employee_photograph',
      documentType: 'employee_photograph',
      name: 'Employee Photograph (Color)',
      description: 'Recent color photograph of employee. Required by state for personnel file.',
      category: 'identification',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
      regulatoryCitation: 'TAC §35.111(5) - One color photograph',
    },
    {
      id: 'guard_card',
      documentType: 'guard_card',
      name: 'Security Guard Commission Card',
      description: 'State-issued commissioned security officer license. Required before any armed assignment.',
      category: 'licensing',
      priority: 'critical',
      expiresAfterYears: 2,
      renewalRequired: true,
      blocksWorkAssignment: true,
      regulatoryCitation: 'TX Occ. Code §1702.163 - Commission required for armed',
    },
    {
      id: 'guard_card_copy',
      documentType: 'guard_card_copy',
      name: 'Commission Card Copy (Front & Back, Color)',
      description: 'Color copy of commission card, front and back. Required for state audit file.',
      category: 'licensing',
      priority: 'critical',
      renewalRequired: true,
      expiresAfterYears: 2,
      blocksWorkAssignment: true,
    },
    {
      id: 'zero_policy_drug_form',
      documentType: 'zero_policy_drug_form',
      name: 'Zero Tolerance Drug Policy Acknowledgment',
      description: 'Signed acknowledgment of company zero-tolerance drug and alcohol policy.',
      category: 'compliance',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
    },
    {
      id: 'drug_test',
      documentType: 'drug_test',
      name: 'Pre-Employment Drug Screening Results',
      description: 'Clear pre-employment drug test results from authorized testing facility.',
      category: 'compliance',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
      regulatoryCitation: 'TAC §35.111(6) - Results of any drug tests',
    },
    {
      id: 'psychological_evaluation',
      documentType: 'psychological_evaluation',
      name: 'Declaration of Psychological & Emotional Health',
      description: 'Declaration of Psychological and Emotional Health form required for commissioned (armed) officers.',
      category: 'medical',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
      regulatoryCitation: 'TAC §35.145 - Psychological/emotional health declaration (Level III)',
    },
    {
      id: 'firearms_permit',
      documentType: 'firearms_permit',
      name: 'Firearms Permit / Handgun Proficiency',
      description: 'State-issued armed security handgun proficiency certificate. Valid 90 days from qualification.',
      category: 'firearms',
      priority: 'critical',
      expiresAfterYears: 1,
      renewalRequired: true,
      blocksWorkAssignment: true,
      regulatoryCitation: 'TAC §35.143 - Firearms proficiency (valid 90 days)',
    },
    {
      id: 'firearms_qualification',
      documentType: 'firearms_qualification',
      name: 'Firearms Qualification Certificate',
      description: 'Annual firearms qualification from DPS-approved range. Must be renewed annually.',
      category: 'firearms',
      priority: 'critical',
      expiresAfterYears: 1,
      renewalRequired: true,
      blocksWorkAssignment: true,
      regulatoryCitation: 'TAC §35.143 - Annual firearms requalification',
    },
    {
      id: 'background_check',
      documentType: 'background_check',
      name: 'Background Check Results',
      description: 'Clear criminal background check from authorized agency.',
      category: 'background',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
      regulatoryCitation: 'TAC §35.111(7) - Pre-employment check documentation',
    },
    {
      id: 'fingerprint_receipt',
      documentType: 'fingerprint_receipt',
      name: 'Fingerprint Receipt (IdentoGO/LiveScan)',
      description: 'Electronic fingerprint submission receipt for FBI and state background check.',
      category: 'background',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
      regulatoryCitation: 'TX Occ. Code §1702.230(d) - Fingerprinting required',
    },
    {
      id: 'level_ii_training',
      documentType: 'level_ii_training',
      name: 'Level II Training Certificate (30 Hours)',
      description: 'State-mandated 30-hour Level II non-commissioned security officer training certificate.',
      category: 'training',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
      regulatoryCitation: 'TAC §35.142 - Level II training (30 hrs)',
    },
    {
      id: 'level_iii_training',
      documentType: 'level_iii_training',
      name: 'Level III Training Certificate (45 Hours)',
      description: 'State-mandated 45-hour Level III commissioned security officer training including firearms proficiency.',
      category: 'training',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
      regulatoryCitation: 'TAC §35.143 - Level III training (45 hrs, includes firearms)',
    },
    {
      id: 'i9_form',
      documentType: 'i9_form',
      name: 'I-9 Employment Eligibility Verification',
      description: 'Federal form verifying identity and employment authorization. Must be completed within 3 business days of hire.',
      category: 'compliance',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
      regulatoryCitation: '8 USC §1324a - Employment verification (federal)',
    },
    {
      id: 'photo_id',
      documentType: 'government_id',
      name: 'Government-Issued Photo ID',
      description: 'Valid driver\'s license, state ID, or passport.',
      category: 'identification',
      priority: 'critical',
      expiresAfterYears: 8,
      renewalRequired: true,
      blocksWorkAssignment: true,
    },
    {
      id: 'photo_id_copy',
      documentType: 'photo_id_copy',
      name: 'Photo ID Copy (Front & Back, Color)',
      description: 'Color copy of government-issued photo ID, front and back for personnel file.',
      category: 'identification',
      priority: 'critical',
      renewalRequired: true,
      expiresAfterYears: 8,
      blocksWorkAssignment: true,
    },
    {
      id: 'ssn_card',
      documentType: 'social_security_card',
      name: 'Social Security Card',
      description: 'Social Security card for I-9 and payroll verification.',
      category: 'identification',
      priority: 'high',
      renewalRequired: false,
      blocksWorkAssignment: false,
    },
    {
      id: 'cpr_first_aid',
      documentType: 'cpr_first_aid_cert',
      name: 'CPR / First Aid Certification',
      description: 'Current CPR and First Aid certification from accredited provider.',
      category: 'training',
      priority: 'high',
      expiresAfterYears: 2,
      renewalRequired: true,
      blocksWorkAssignment: false,
      regulatoryCitation: 'Industry best practice — CPR/First Aid certification recommended for all security personnel',
    },
    {
      id: 'continuing_education',
      documentType: 'continuing_education',
      name: 'Continuing Education Records',
      description: 'Commissioned officer continuing education (6 hours every 2 years). Records must include school name, seminar number, date, credits.',
      category: 'training',
      priority: 'high',
      expiresAfterYears: 2,
      renewalRequired: true,
      blocksWorkAssignment: false,
      regulatoryCitation: 'TAC §35.146 - Continuing education (6 hrs/2 yrs for commissioned)',
    },
    {
      id: 'w4_form',
      documentType: 'tax_form',
      name: 'W-4 Tax Withholding Form',
      description: 'Federal tax withholding election form.',
      category: 'compliance',
      priority: 'high',
      renewalRequired: false,
      blocksWorkAssignment: false,
    },
    {
      id: 'direct_deposit',
      documentType: 'direct_deposit_form',
      name: 'Direct Deposit Authorization',
      description: 'Bank account information for payroll direct deposit.',
      category: 'compliance',
      priority: 'medium',
      renewalRequired: false,
      blocksWorkAssignment: false,
    },
    {
      id: 'handbook_ack',
      documentType: 'policy_acknowledgment',
      name: 'Employee Handbook Acknowledgment',
      description: 'Signed acknowledgment of company policies and procedures.',
      category: 'compliance',
      priority: 'medium',
      renewalRequired: false,
      blocksWorkAssignment: false,
    },
    {
      id: 'confidentiality_agreement',
      documentType: 'confidentiality_agreement',
      name: 'Confidentiality Agreement',
      description: 'Signed confidentiality and non-disclosure agreement for client site information.',
      category: 'compliance',
      priority: 'medium',
      renewalRequired: false,
      blocksWorkAssignment: false,
    },
  ],

  supervisor: [
    {
      id: 'cover_sheet',
      documentType: 'cover_sheet',
      name: 'Officer File Cover Sheet',
      description: 'Personnel file cover sheet with officer info, emergency contacts, and position details.',
      category: 'compliance',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
    },
    {
      id: 'employment_application',
      documentType: 'employment_application',
      name: 'Employment Application',
      description: 'Completed company employment application with full personal history.',
      category: 'compliance',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
    },
    {
      id: 'employee_photograph',
      documentType: 'employee_photograph',
      name: 'Employee Photograph (Color)',
      description: 'Recent color photograph of employee for personnel file.',
      category: 'identification',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
    },
    {
      id: 'guard_card',
      documentType: 'guard_card',
      name: 'Security Guard Registration Card',
      description: 'State-issued security guard license.',
      category: 'licensing',
      priority: 'critical',
      expiresAfterYears: 2,
      renewalRequired: true,
      blocksWorkAssignment: true,
    },
    {
      id: 'guard_card_copy',
      documentType: 'guard_card_copy',
      name: 'Guard Card Copy (Front & Back, Color)',
      description: 'Color copy of guard card, front and back. Required for state audit file.',
      category: 'licensing',
      priority: 'critical',
      renewalRequired: true,
      expiresAfterYears: 2,
      blocksWorkAssignment: true,
    },
    {
      id: 'zero_policy_drug_form',
      documentType: 'zero_policy_drug_form',
      name: 'Zero Tolerance Drug Policy Acknowledgment',
      description: 'Signed acknowledgment of company zero-tolerance drug and alcohol policy.',
      category: 'compliance',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
    },
    {
      id: 'drug_test',
      documentType: 'drug_test',
      name: 'Pre-Employment Drug Screening Results',
      description: 'Clear pre-employment drug test results.',
      category: 'compliance',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
    },
    {
      id: 'background_check',
      documentType: 'background_check',
      name: 'Background Check Results',
      description: 'Clear criminal background check from authorized agency.',
      category: 'background',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
    },
    {
      id: 'fingerprint_receipt',
      documentType: 'fingerprint_receipt',
      name: 'Fingerprint Receipt (IdentoGO/LiveScan)',
      description: 'Electronic fingerprint submission receipt.',
      category: 'background',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
    },
    {
      id: 'level_ii_training',
      documentType: 'level_ii_training',
      name: 'Level II Training Certificate (30 Hours)',
      description: 'State-mandated 30-hour Level II security officer training certificate.',
      category: 'training',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
    },
    {
      id: 'supervisor_training',
      documentType: 'supervisor_training',
      name: 'Supervisor / Leadership Training Certificate',
      description: 'Security supervisor leadership and management training certificate.',
      category: 'training',
      priority: 'high',
      renewalRequired: false,
      blocksWorkAssignment: false,
    },
    {
      id: 'i9_form',
      documentType: 'i9_form',
      name: 'I-9 Employment Eligibility Verification',
      description: 'Federal form verifying identity and employment authorization.',
      category: 'compliance',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
    },
    {
      id: 'photo_id',
      documentType: 'government_id',
      name: 'Government-Issued Photo ID',
      description: 'Valid driver\'s license, state ID, or passport.',
      category: 'identification',
      priority: 'critical',
      expiresAfterYears: 8,
      renewalRequired: true,
      blocksWorkAssignment: true,
    },
    {
      id: 'photo_id_copy',
      documentType: 'photo_id_copy',
      name: 'Photo ID Copy (Front & Back, Color)',
      description: 'Color copy of government-issued photo ID, front and back for personnel file.',
      category: 'identification',
      priority: 'critical',
      renewalRequired: true,
      expiresAfterYears: 8,
      blocksWorkAssignment: true,
    },
    {
      id: 'ssn_card',
      documentType: 'social_security_card',
      name: 'Social Security Card',
      description: 'Social Security card for I-9 and payroll verification.',
      category: 'identification',
      priority: 'high',
      renewalRequired: false,
      blocksWorkAssignment: false,
    },
    {
      id: 'cpr_first_aid',
      documentType: 'cpr_first_aid_cert',
      name: 'CPR / First Aid Certification',
      description: 'Current CPR and First Aid certification.',
      category: 'training',
      priority: 'high',
      expiresAfterYears: 2,
      renewalRequired: true,
      blocksWorkAssignment: false,
    },
    {
      id: 'w4_form',
      documentType: 'tax_form',
      name: 'W-4 Tax Withholding Form',
      description: 'Federal tax withholding election form.',
      category: 'compliance',
      priority: 'high',
      renewalRequired: false,
      blocksWorkAssignment: false,
    },
    {
      id: 'direct_deposit',
      documentType: 'direct_deposit_form',
      name: 'Direct Deposit Authorization',
      description: 'Bank account information for payroll.',
      category: 'compliance',
      priority: 'medium',
      renewalRequired: false,
      blocksWorkAssignment: false,
    },
    {
      id: 'handbook_ack',
      documentType: 'policy_acknowledgment',
      name: 'Employee Handbook Acknowledgment',
      description: 'Signed acknowledgment of company policies.',
      category: 'compliance',
      priority: 'medium',
      renewalRequired: false,
      blocksWorkAssignment: false,
    },
    {
      id: 'confidentiality_agreement',
      documentType: 'confidentiality_agreement',
      name: 'Confidentiality Agreement',
      description: 'Signed confidentiality and non-disclosure agreement.',
      category: 'compliance',
      priority: 'medium',
      renewalRequired: false,
      blocksWorkAssignment: false,
    },
  ],

  site_manager: [
    {
      id: 'cover_sheet',
      documentType: 'cover_sheet',
      name: 'Officer File Cover Sheet',
      description: 'Personnel file cover sheet.',
      category: 'compliance',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
    },
    {
      id: 'employment_application',
      documentType: 'employment_application',
      name: 'Employment Application',
      description: 'Completed company employment application.',
      category: 'compliance',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
    },
    {
      id: 'employee_photograph',
      documentType: 'employee_photograph',
      name: 'Employee Photograph (Color)',
      description: 'Recent color photograph of employee for personnel file.',
      category: 'identification',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
    },
    {
      id: 'background_check',
      documentType: 'background_check',
      name: 'Background Check Results',
      description: 'Clear criminal background check from authorized agency.',
      category: 'background',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
    },
    {
      id: 'i9_form',
      documentType: 'i9_form',
      name: 'I-9 Employment Eligibility Verification',
      description: 'Federal form verifying identity and employment authorization.',
      category: 'compliance',
      priority: 'critical',
      renewalRequired: false,
      blocksWorkAssignment: true,
    },
    {
      id: 'photo_id',
      documentType: 'government_id',
      name: 'Government-Issued Photo ID',
      description: 'Valid driver\'s license, state ID, or passport.',
      category: 'identification',
      priority: 'critical',
      expiresAfterYears: 8,
      renewalRequired: true,
      blocksWorkAssignment: true,
    },
    {
      id: 'photo_id_copy',
      documentType: 'photo_id_copy',
      name: 'Photo ID Copy (Front & Back, Color)',
      description: 'Color copy of government-issued photo ID, front and back.',
      category: 'identification',
      priority: 'critical',
      renewalRequired: true,
      expiresAfterYears: 8,
      blocksWorkAssignment: true,
    },
    {
      id: 'ssn_card',
      documentType: 'social_security_card',
      name: 'Social Security Card',
      description: 'Social Security card for I-9 and payroll verification.',
      category: 'identification',
      priority: 'high',
      renewalRequired: false,
      blocksWorkAssignment: false,
    },
    {
      id: 'w4_form',
      documentType: 'tax_form',
      name: 'W-4 Tax Withholding Form',
      description: 'Federal tax withholding election form.',
      category: 'compliance',
      priority: 'high',
      renewalRequired: false,
      blocksWorkAssignment: false,
    },
    {
      id: 'direct_deposit',
      documentType: 'direct_deposit_form',
      name: 'Direct Deposit Authorization',
      description: 'Bank account information for payroll.',
      category: 'compliance',
      priority: 'medium',
      renewalRequired: false,
      blocksWorkAssignment: false,
    },
    {
      id: 'handbook_ack',
      documentType: 'policy_acknowledgment',
      name: 'Employee Handbook Acknowledgment',
      description: 'Signed acknowledgment of company policies.',
      category: 'compliance',
      priority: 'medium',
      renewalRequired: false,
      blocksWorkAssignment: false,
    },
  ],
};

class EmployeeDocumentOnboardingService {
  
  getPositionFromRole(role: string | null): SecurityPosition {
    if (!role) return 'unarmed_guard';
    const roleLower = role.toLowerCase();
    if (roleLower.includes('armed') || roleLower.includes('firearm')) return 'armed_guard';
    if (roleLower.includes('supervisor')) return 'supervisor';
    if (roleLower.includes('manager') || roleLower.includes('site manager')) return 'site_manager';
    return 'unarmed_guard';
  }

  getRequiredDocuments(position: SecurityPosition): RequiredDocument[] {
    return SECURITY_GUARD_REQUIREMENTS[position] || SECURITY_GUARD_REQUIREMENTS.unarmed_guard;
  }

  async getEmployeeOnboardingStatus(employeeId: string): Promise<EmployeeOnboardingStatus | null> {
    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, employeeId),
    });

    if (!employee) return null;

    const position = this.getPositionFromRole(employee.role);
    const requirements = this.getRequiredDocuments(position);

    const uploadedDocs = await db.query.employeeDocuments.findMany({
      where: eq(employeeDocuments.employeeId, employeeId),
    });

    const docsByType = new Map(uploadedDocs.map(d => [d.documentType, d]));
    const now = new Date();

    const documentStatuses: DocumentRequirementStatus[] = requirements.map(req => {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const doc = docsByType.get(req.documentType);
      
      if (!doc) {
        return {
          requirement: req,
          status: 'not_started' as const,
        };
      }

      let status: DocumentRequirementStatus['status'] = 'uploaded';
      
      if (doc.status === 'approved' || doc.isVerified) {
        if (doc.expirationDate && doc.expirationDate < now) {
          status = 'expired';
        } else {
          status = 'approved';
        }
      } else if (doc.rejectedAt) {
        status = 'rejected';
      } else if (doc.requiresApproval && !doc.approvedAt) {
        status = 'pending_review';
      }

      let daysUntilExpiration: number | undefined;
      if (doc.expirationDate) {
        daysUntilExpiration = Math.ceil((doc.expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }

      return {
        requirement: req,
        status,
        documentId: doc.id,
        uploadedAt: doc.uploadedAt,
        expirationDate: doc.expirationDate || undefined,
        daysUntilExpiration,
        rejectionReason: doc.rejectionReason || undefined,
      };
    });

    const completedDocs = documentStatuses.filter(d => d.status === 'approved');
    const criticalMissing = documentStatuses.filter(
      d => d.requirement.blocksWorkAssignment && d.status !== 'approved'
    );

    const blockedReasons: string[] = [];

    const accountNotActivated = employee.status === 'pending' || employee.status === 'invited' || employee.status === 'inactive';
    if (accountNotActivated) {
      blockedReasons.push(`Account not activated — employee status is "${employee.status}". Account must be active before work assignment.`);
    }

    if (employee.terminationDate) {
      blockedReasons.push('Employee has been terminated and cannot be assigned to work.');
    }

    for (const doc of criticalMissing) {
      if (doc.status === 'not_started') {
        blockedReasons.push(`Missing required document: ${doc.requirement.name}`);
      } else if (doc.status === 'pending_review') {
        blockedReasons.push(`Pending approval: ${doc.requirement.name}`);
      } else if (doc.status === 'rejected') {
        blockedReasons.push(`Document rejected: ${doc.requirement.name} - ${doc.rejectionReason || 'See manager'}`);
      } else if (doc.status === 'expired') {
        blockedReasons.push(`Expired document: ${doc.requirement.name}`);
      }
    }

    const expiringDocs = documentStatuses
      .filter(d => d.daysUntilExpiration !== undefined && d.daysUntilExpiration > 0 && d.daysUntilExpiration <= 30)
      .sort((a, b) => (a.daysUntilExpiration || 999) - (b.daysUntilExpiration || 999));

    let onboardingDeadline: OnboardingDeadline | undefined;
    const ONBOARDING_DEADLINE_DAYS = 15;
    const referenceDate = employee.hireDate || employee.createdAt;
    if (referenceDate) {
      const hireDateObj = new Date(referenceDate);
      const deadlineDateObj = new Date(hireDateObj.getTime() + ONBOARDING_DEADLINE_DAYS * 24 * 60 * 60 * 1000);
      const daysElapsed = Math.floor((now.getTime() - hireDateObj.getTime()) / (1000 * 60 * 60 * 24));
      const daysRemaining = Math.ceil((deadlineDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const isOverdue = daysRemaining < 0 && completedDocs.length < requirements.length;

      let urgencyLevel: OnboardingDeadline['urgencyLevel'] = 'on_track';
      if (isOverdue) {
        urgencyLevel = 'overdue';
      } else if (daysRemaining <= 3) {
        urgencyLevel = 'critical';
      } else if (daysRemaining <= 7) {
        urgencyLevel = 'warning';
      }

      onboardingDeadline = {
        hireDate: hireDateObj.toISOString(),
        deadlineDate: deadlineDateObj.toISOString(),
        daysRemaining: Math.max(daysRemaining, 0),
        daysElapsed,
        isOverdue,
        urgencyLevel,
      };

      if (isOverdue) {
        blockedReasons.push(`Onboarding deadline exceeded by ${Math.abs(daysRemaining)} day(s) — all documents must be completed within ${ONBOARDING_DEADLINE_DAYS} days of hire`);

        platformEventBus.publish({
          type: 'compliance_onboarding_overdue',
          category: 'automation',
          title: `Onboarding Overdue — ${employee.firstName} ${employee.lastName}`,
          description: `Employee onboarding is ${Math.abs(daysRemaining)} days overdue with ${requirements.length - completedDocs.length} document(s) still missing`,
          workspaceId: employee.workspaceId,
          metadata: { employeeId, employeeName: `${employee.firstName} ${employee.lastName}`, daysOverdue: Math.abs(daysRemaining), missingDocCount: requirements.length - completedDocs.length },
        }).catch((err: any) => log.warn('[OnboardingService] publish compliance_onboarding_overdue failed:', err.message));
      }
    }

    const workState = employee.state || 'TX';

    return {
      employeeId,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      position,
      workState,
      isWorkEligible: criticalMissing.length === 0 && !accountNotActivated && !employee.terminationDate,
      completionPercentage: Math.round((completedDocs.length / requirements.length) * 100),
      criticalDocumentsMissing: criticalMissing.length,
      totalDocumentsRequired: requirements.length,
      totalDocumentsCompleted: completedDocs.length,
      documentStatuses,
      requirements: documentStatuses,
      blockedReasons,
      onboardingDeadline,
      onboardingStatus: employee.onboardingStatus || 'not_started',
      nextExpiringDocument: expiringDocs[0] ? {
        name: expiringDocs[0].requirement.name,
        expirationDate: expiringDocs[0].expirationDate!,
        daysUntilExpiration: expiringDocs[0].daysUntilExpiration!,
      } : undefined,
    };
  }

  async getStateComplianceGapReport(employeeId: string, stateCode: string): Promise<ComplianceGapReport | null> {
    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, employeeId),
    });
    if (!employee) return null;

    const position = this.getPositionFromRole(employee.role);
    const guardType = (position === 'armed_guard') ? 'armed' : 'unarmed';

    const uploadedDocs = await db.query.employeeDocuments.findMany({
      where: eq(employeeDocuments.employeeId, employeeId),
    });
    const existingDocTypes = uploadedDocs
      .filter(d => d.status === 'approved' || d.isVerified)
      .map(d => d.documentType);

    return compareDocumentsToStateRequirements(stateCode, guardType, existingDocTypes);
  }

  async checkWorkEligibility(employeeId: string): Promise<{ eligible: boolean; reasons: string[] }> {
    const status = await this.getEmployeeOnboardingStatus(employeeId);
    if (!status) {
      return { eligible: false, reasons: ['Employee not found'] };
    }
    return { eligible: status.isWorkEligible, reasons: status.blockedReasons };
  }

  async getWorkspaceOnboardingOverview(workspaceId: string): Promise<{
    totalEmployees: number;
    workEligibleCount: number;
    pendingDocumentsCount: number;
    expiringDocumentsCount: number;
    employeeStatuses: Array<{
      employeeId: string;
      employeeName: string;
      isWorkEligible: boolean;
      completionPercentage: number;
      onboardingDeadline?: OnboardingDeadline;
      onboardingStatus: string;
      workState: string;
      criticalDocumentsMissing: number;
      totalDocumentsRequired: number;
      totalDocumentsCompleted: number;
    }>;
  }> {
    const workspaceEmployees = await db.query.employees.findMany({
      where: and(
        eq(employees.workspaceId, workspaceId),
        isNull(employees.terminationDate)
      ),
    });

    const employeeStatuses = await Promise.all(
      workspaceEmployees.map(async (emp) => {
        const status = await this.getEmployeeOnboardingStatus(emp.id);
        return {
          employeeId: emp.id,
          employeeName: `${emp.firstName} ${emp.lastName}`,
          isWorkEligible: status?.isWorkEligible || false,
          completionPercentage: status?.completionPercentage || 0,
          onboardingDeadline: status?.onboardingDeadline,
          onboardingStatus: status?.onboardingStatus || 'not_started',
          workState: status?.workState || 'TX',
          criticalDocumentsMissing: status?.criticalDocumentsMissing || 0,
          totalDocumentsRequired: status?.totalDocumentsRequired || 0,
          totalDocumentsCompleted: status?.totalDocumentsCompleted || 0,
        };
      })
    );

    const allDocs = await db.query.employeeDocuments.findMany({
      where: eq(employeeDocuments.workspaceId, workspaceId),
    });

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const expiringCount = allDocs.filter(
      d => d.expirationDate && d.expirationDate > now && d.expirationDate <= thirtyDaysFromNow
    ).length;

    const pendingCount = allDocs.filter(
      d => d.requiresApproval && !d.approvedAt && !d.rejectedAt
    ).length;

    return {
      totalEmployees: workspaceEmployees.length,
      workEligibleCount: employeeStatuses.filter(e => e.isWorkEligible).length,
      pendingDocumentsCount: pendingCount,
      expiringDocumentsCount: expiringCount,
      employeeStatuses,
    };
  }

  async notifyDocumentRequired(employeeId: string): Promise<void> {
    const status = await this.getEmployeeOnboardingStatus(employeeId);
    if (!status) return;

    const missingDocs = status.documentStatuses.filter(d => d.status === 'not_started');
    if (missingDocs.length > 0) {
      platformEventBus.publish({
        type: 'employee_documents_required',
        workspaceId: 'system',
        payload: {
          employeeId,
          employeeName: status.employeeName,
          missingDocuments: missingDocs.map(d => d.requirement.name),
          blockedFromWork: !status.isWorkEligible,
        },
        metadata: { source: 'EmployeeDocumentOnboardingService' },
      }).catch((err) => log.warn('[employeeDocumentOnboardingService] Fire-and-forget failed:', err));
    }
  }

  async createOnboardingTasksForEmployee(employeeId: string): Promise<void> {
    const status = await this.getEmployeeOnboardingStatus(employeeId);
    if (!status) return;

    const incompleteDocs = status.documentStatuses.filter(d => d.status !== 'approved');
    
    for (const doc of incompleteDocs) {
      platformEventBus.publish({
        type: 'employee_task_created',
        workspaceId: 'system',
        payload: {
          employeeId,
          taskType: 'document_upload',
          taskName: `Upload: ${doc.requirement.name}`,
          taskDescription: doc.requirement.description,
          priority: doc.requirement.priority,
          blocksWork: doc.requirement.blocksWorkAssignment,
          documentType: doc.requirement.documentType,
        },
        metadata: { source: 'EmployeeDocumentOnboardingService' },
      }).catch((err) => log.warn('[employeeDocumentOnboardingService] Fire-and-forget failed:', err));
    }

    log.info(`[EmployeeDocumentOnboarding] Created ${incompleteDocs.length} tasks for employee ${employeeId}`);
  }
}

export const employeeDocumentOnboardingService = new EmployeeDocumentOnboardingService();
