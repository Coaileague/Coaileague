/**
 * Certification Configuration Registry
 * 
 * Centralized configuration for all certification types used in compliance tracking.
 * Applies to ALL employees including owners, managers, and supervisors.
 * 
 * NO HARDCODED VALUES - All certification types are defined here
 */

import { z } from 'zod';

/**
 * Certification type definition
 */
export interface CertificationType {
  id: string;
  name: string;
  category: 'license' | 'certification' | 'training' | 'id_document';
  description: string;
  expirationRequired: boolean;
  defaultExpirationDays: number | null;
  issuingAuthorities?: string[];
  validationPattern?: string;
  appliesToRoles: string[];
  requiredForIndustries?: string[];
  renewalReminderDays: number;
}

/**
 * Master registry of all certification types
 * Add new certification types here - they will automatically be available in compliance tracking
 */
export const CERTIFICATION_TYPES: Record<string, CertificationType> = {
  guard_card: {
    id: 'guard_card',
    name: 'Guard Card',
    category: 'license',
    description: 'State-issued security guard registration card',
    expirationRequired: true,
    defaultExpirationDays: 730,
    issuingAuthorities: ['BSIS', 'State Licensing Board'],
    appliesToRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'staff', 'employee'],
    requiredForIndustries: ['security_services', 'private_security'],
    renewalReminderDays: 60,
  },
  armed_guard_license: {
    id: 'armed_guard_license',
    name: 'Armed Guard License',
    category: 'license',
    description: 'License to carry firearm while on duty',
    expirationRequired: true,
    defaultExpirationDays: 365,
    issuingAuthorities: ['BSIS', 'State Licensing Board'],
    appliesToRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'staff', 'employee'],
    requiredForIndustries: ['security_services', 'private_security'],
    renewalReminderDays: 90,
  },
  cpr_first_aid: {
    id: 'cpr_first_aid',
    name: 'CPR/First Aid Certification',
    category: 'certification',
    description: 'CPR and First Aid certification from accredited provider',
    expirationRequired: true,
    defaultExpirationDays: 730,
    issuingAuthorities: ['American Red Cross', 'American Heart Association', 'National Safety Council'],
    appliesToRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'staff', 'employee'],
    renewalReminderDays: 60,
  },
  driver_license: {
    id: 'driver_license',
    name: 'Driver\'s License',
    category: 'license',
    description: 'Valid state driver\'s license',
    expirationRequired: true,
    defaultExpirationDays: 1460,
    issuingAuthorities: ['DMV', 'Department of Motor Vehicles'],
    appliesToRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'staff', 'employee'],
    renewalReminderDays: 90,
  },
  medical_certificate: {
    id: 'medical_certificate',
    name: 'Medical Certificate',
    category: 'certification',
    description: 'DOT or company-required medical certificate',
    expirationRequired: true,
    defaultExpirationDays: 730,
    appliesToRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'staff', 'employee'],
    renewalReminderDays: 60,
  },
  professional_license: {
    id: 'professional_license',
    name: 'Professional License',
    category: 'license',
    description: 'Industry-specific professional license',
    expirationRequired: true,
    defaultExpirationDays: 365,
    appliesToRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'staff', 'employee'],
    renewalReminderDays: 90,
  },
  background_check: {
    id: 'background_check',
    name: 'Background Check',
    category: 'certification',
    description: 'Completed background check verification',
    expirationRequired: true,
    defaultExpirationDays: 365,
    appliesToRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'staff', 'employee'],
    renewalReminderDays: 60,
  },
  drug_test: {
    id: 'drug_test',
    name: 'Drug Test',
    category: 'certification',
    description: 'Pre-employment or random drug test',
    expirationRequired: true,
    defaultExpirationDays: 365,
    appliesToRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'staff', 'employee'],
    renewalReminderDays: 30,
  },
  osha_10: {
    id: 'osha_10',
    name: 'OSHA 10-Hour',
    category: 'training',
    description: 'OSHA 10-hour safety training completion',
    expirationRequired: false,
    defaultExpirationDays: null,
    issuingAuthorities: ['OSHA', 'Authorized Training Providers'],
    appliesToRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'staff', 'employee'],
    renewalReminderDays: 0,
  },
  osha_30: {
    id: 'osha_30',
    name: 'OSHA 30-Hour',
    category: 'training',
    description: 'OSHA 30-hour safety training completion',
    expirationRequired: false,
    defaultExpirationDays: null,
    issuingAuthorities: ['OSHA', 'Authorized Training Providers'],
    appliesToRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'staff', 'employee'],
    renewalReminderDays: 0,
  },
  state_id: {
    id: 'state_id',
    name: 'State ID / Government ID',
    category: 'id_document',
    description: 'Valid government-issued identification',
    expirationRequired: true,
    defaultExpirationDays: 1825,
    appliesToRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'staff', 'employee'],
    renewalReminderDays: 90,
  },
};

/**
 * Get all certification types
 */
export function getCertificationTypes(): CertificationType[] {
  return Object.values(CERTIFICATION_TYPES);
}

/**
 * Get certification type by ID
 */
export function getCertificationType(id: string): CertificationType | undefined {
  return CERTIFICATION_TYPES[id];
}

/**
 * Get certification types for a specific role
 */
export function getCertificationTypesForRole(role: string): CertificationType[] {
  return Object.values(CERTIFICATION_TYPES).filter(
    cert => cert.appliesToRoles.includes(role) || cert.appliesToRoles.includes('all')
  );
}

/**
 * Get certification types required for an industry
 */
export function getCertificationTypesForIndustry(industry: string): CertificationType[] {
  return Object.values(CERTIFICATION_TYPES).filter(
    cert => cert.requiredForIndustries?.includes(industry)
  );
}

/**
 * Get certifications that are expiring and need renewal reminders
 */
export function getCertificationsWithRenewalReminders(): CertificationType[] {
  return Object.values(CERTIFICATION_TYPES).filter(
    cert => cert.renewalReminderDays > 0
  );
}

/**
 * Certification category labels for UI
 */
export const CERTIFICATION_CATEGORY_LABELS: Record<string, string> = {
  license: 'License',
  certification: 'Certification',
  training: 'Training',
  id_document: 'ID Document',
};

/**
 * Get category label
 */
export function getCategoryLabel(category: string): string {
  return CERTIFICATION_CATEGORY_LABELS[category] || category;
}

export const certificationConfig = {
  types: CERTIFICATION_TYPES,
  getCertificationTypes,
  getCertificationType,
  getCertificationTypesForRole,
  getCertificationTypesForIndustry,
  getCertificationsWithRenewalReminders,
  getCategoryLabel,
};
