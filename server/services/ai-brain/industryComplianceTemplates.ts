/**
 * INDUSTRY COMPLIANCE TEMPLATES SERVICE
 * =====================================
 * Maps industry taxonomy compliance templates to actual compliance configurations.
 * Deploys industry-specific compliance rules, checklists, and monitoring to workspaces.
 * 
 * When a workspace selects their industry during onboarding:
 * 1. Looks up the sub-industry's compliance templates
 * 2. Resolves template IDs to full compliance configurations
 * 3. Activates relevant compliance monitoring rules
 * 4. Creates industry-specific checklists and documents
 */

import industryTaxonomy from '@shared/industry-taxonomy.json';
import { db } from '../../db';
import { workspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
const log = createLogger('industryComplianceTemplates');

export interface ComplianceTemplate {
  id: string;
  name: string;
  description: string;
  category: 'safety' | 'regulatory' | 'licensing' | 'training' | 'environmental' | 'privacy' | 'financial';
  priority: 'critical' | 'high' | 'medium' | 'low';
  requirements: {
    id: string;
    name: string;
    description: string;
    frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually' | 'one_time';
    documentRequired: boolean;
  }[];
  certifications: string[];
  renewalPeriod?: string;
  regulatoryBody?: string;
}

export interface IndustryComplianceConfig {
  subIndustryId: string;
  subIndustryName: string;
  sectorId: string;
  sectorName: string;
  templates: ComplianceTemplate[];
  certifications: string[];
  totalRequirements: number;
  criticalRequirements: number;
}

const COMPLIANCE_TEMPLATE_REGISTRY: Record<string, ComplianceTemplate> = {
  osha_safety: {
    id: 'osha_safety',
    name: 'OSHA Safety Standards',
    description: 'Occupational Safety and Health Administration workplace safety requirements',
    category: 'safety',
    priority: 'critical',
    requirements: [
      { id: 'osha_1', name: 'Safety Training', description: 'Annual employee safety training', frequency: 'annually', documentRequired: true },
      { id: 'osha_2', name: 'Incident Reporting', description: 'Log and report workplace injuries', frequency: 'daily', documentRequired: true },
      { id: 'osha_3', name: 'Hazard Communication', description: 'Maintain SDS sheets and chemical labeling', frequency: 'monthly', documentRequired: true },
      { id: 'osha_4', name: 'PPE Compliance', description: 'Ensure proper PPE usage and availability', frequency: 'daily', documentRequired: false },
    ],
    certifications: ['OSHA_10', 'OSHA_30'],
    renewalPeriod: '5 years',
    regulatoryBody: 'OSHA',
  },

  hipaa: {
    id: 'hipaa',
    name: 'HIPAA Compliance',
    description: 'Health Insurance Portability and Accountability Act privacy and security rules',
    category: 'privacy',
    priority: 'critical',
    requirements: [
      { id: 'hipaa_1', name: 'Privacy Training', description: 'Annual HIPAA privacy training for all employees', frequency: 'annually', documentRequired: true },
      { id: 'hipaa_2', name: 'Risk Assessment', description: 'Conduct security risk assessment', frequency: 'annually', documentRequired: true },
      { id: 'hipaa_3', name: 'BAA Management', description: 'Maintain Business Associate Agreements', frequency: 'annually', documentRequired: true },
      { id: 'hipaa_4', name: 'Access Controls', description: 'Review and audit PHI access logs', frequency: 'monthly', documentRequired: true },
      { id: 'hipaa_5', name: 'Breach Protocol', description: 'Maintain breach notification procedures', frequency: 'annually', documentRequired: true },
    ],
    certifications: [],
    regulatoryBody: 'HHS Office for Civil Rights',
  },

  worker_comp: {
    id: 'worker_comp',
    name: 'Workers Compensation',
    description: 'Workers compensation insurance and reporting requirements',
    category: 'regulatory',
    priority: 'critical',
    requirements: [
      { id: 'wc_1', name: 'Insurance Coverage', description: 'Maintain active workers comp insurance', frequency: 'annually', documentRequired: true },
      { id: 'wc_2', name: 'Claim Reporting', description: 'Report injuries within required timeframe', frequency: 'daily', documentRequired: true },
      { id: 'wc_3', name: 'Posting Requirements', description: 'Display required workplace posters', frequency: 'annually', documentRequired: false },
    ],
    certifications: [],
    regulatoryBody: 'State Workers Comp Board',
  },

  liability: {
    id: 'liability',
    name: 'General Liability',
    description: 'General liability insurance and coverage requirements',
    category: 'financial',
    priority: 'high',
    requirements: [
      { id: 'liab_1', name: 'Insurance Coverage', description: 'Maintain adequate liability coverage', frequency: 'annually', documentRequired: true },
      { id: 'liab_2', name: 'Certificate of Insurance', description: 'Provide COI to clients as requested', frequency: 'monthly', documentRequired: true },
    ],
    certifications: [],
  },

  basic_liability: {
    id: 'basic_liability',
    name: 'Basic Liability Coverage',
    description: 'Minimum liability insurance requirements for small businesses',
    category: 'financial',
    priority: 'medium',
    requirements: [
      { id: 'basic_liab_1', name: 'Insurance Verification', description: 'Verify active liability coverage', frequency: 'annually', documentRequired: true },
    ],
    certifications: [],
  },

  background_check: {
    id: 'background_check',
    name: 'Background Check Requirements',
    description: 'Employee background screening and verification',
    category: 'regulatory',
    priority: 'high',
    requirements: [
      { id: 'bg_1', name: 'Pre-Employment Screening', description: 'Conduct background checks before hiring', frequency: 'one_time', documentRequired: true },
      { id: 'bg_2', name: 'Periodic Rescreening', description: 'Rescreen employees per policy', frequency: 'annually', documentRequired: true },
      { id: 'bg_3', name: 'Consent Documentation', description: 'Maintain signed consent forms', frequency: 'one_time', documentRequired: true },
    ],
    certifications: [],
  },

  guard_card: {
    id: 'guard_card',
    name: 'Security Guard Card',
    description: 'State security guard licensing requirements',
    category: 'licensing',
    priority: 'critical',
    requirements: [
      { id: 'gc_1', name: 'License Verification', description: 'Verify active guard card for all officers', frequency: 'monthly', documentRequired: true },
      { id: 'gc_2', name: 'Renewal Tracking', description: 'Track and renew licenses before expiration', frequency: 'annually', documentRequired: true },
      { id: 'gc_3', name: 'Training Hours', description: 'Complete required training hours', frequency: 'annually', documentRequired: true },
    ],
    certifications: ['STATE_GUARD_LICENSE'],
    renewalPeriod: '2 years',
    regulatoryBody: 'Bureau of Security and Investigative Services',
  },

  firearms_permit: {
    id: 'firearms_permit',
    name: 'Firearms Permit',
    description: 'Armed security firearms certification and permitting',
    category: 'licensing',
    priority: 'critical',
    requirements: [
      { id: 'fp_1', name: 'Firearms Qualification', description: 'Complete annual firearms qualification', frequency: 'annually', documentRequired: true },
      { id: 'fp_2', name: 'Permit Renewal', description: 'Renew firearms permit before expiration', frequency: 'annually', documentRequired: true },
      { id: 'fp_3', name: 'Weapons Storage', description: 'Maintain secure weapons storage', frequency: 'daily', documentRequired: false },
    ],
    certifications: ['FIREARMS_CERT', 'ARMED_GUARD_LICENSE'],
    renewalPeriod: '1 year',
  },

  training_40hr: {
    id: 'training_40hr',
    name: '40-Hour Security Training',
    description: 'State-mandated 40-hour security officer training',
    category: 'training',
    priority: 'high',
    requirements: [
      { id: 'tr40_1', name: 'Initial Training', description: 'Complete 40-hour training course', frequency: 'one_time', documentRequired: true },
      { id: 'tr40_2', name: 'Continuing Education', description: 'Complete annual CE requirements', frequency: 'annually', documentRequired: true },
    ],
    certifications: [],
  },

  food_safety: {
    id: 'food_safety',
    name: 'Food Safety Certification',
    description: 'Food handling and safety certification requirements',
    category: 'regulatory',
    priority: 'critical',
    requirements: [
      { id: 'fs_1', name: 'Manager Certification', description: 'Food safety manager certification', frequency: 'annually', documentRequired: true },
      { id: 'fs_2', name: 'Handler Permits', description: 'Food handler permits for all staff', frequency: 'annually', documentRequired: true },
      { id: 'fs_3', name: 'Temperature Logs', description: 'Daily temperature monitoring logs', frequency: 'daily', documentRequired: true },
      { id: 'fs_4', name: 'Sanitation Checks', description: 'Regular sanitation inspections', frequency: 'daily', documentRequired: true },
    ],
    certifications: ['SERVSAFE', 'SERVSAFE_MANAGER'],
    renewalPeriod: '5 years',
    regulatoryBody: 'Health Department',
  },

  health_department: {
    id: 'health_department',
    name: 'Health Department Compliance',
    description: 'Local health department inspection and permit requirements',
    category: 'regulatory',
    priority: 'critical',
    requirements: [
      { id: 'hd_1', name: 'Health Permit', description: 'Maintain current health permit', frequency: 'annually', documentRequired: true },
      { id: 'hd_2', name: 'Inspection Readiness', description: 'Prepare for unannounced inspections', frequency: 'daily', documentRequired: false },
      { id: 'hd_3', name: 'Violation Correction', description: 'Address violations within required timeframe', frequency: 'monthly', documentRequired: true },
    ],
    certifications: [],
    regulatoryBody: 'Local Health Department',
  },

  electrical_safety: {
    id: 'electrical_safety',
    name: 'Electrical Safety Standards',
    description: 'Electrical work safety and code compliance',
    category: 'safety',
    priority: 'critical',
    requirements: [
      { id: 'elec_1', name: 'Lockout/Tagout', description: 'LOTO procedures for electrical work', frequency: 'daily', documentRequired: true },
      { id: 'elec_2', name: 'Arc Flash Training', description: 'Arc flash awareness and PPE training', frequency: 'annually', documentRequired: true },
      { id: 'elec_3', name: 'Tool Inspection', description: 'Regular inspection of electrical tools', frequency: 'monthly', documentRequired: true },
    ],
    certifications: ['JOURNEYMAN_ELECTRICIAN', 'MASTER_ELECTRICIAN'],
    regulatoryBody: 'OSHA / NFPA 70E',
  },

  nec_compliance: {
    id: 'nec_compliance',
    name: 'National Electrical Code',
    description: 'NEC code compliance for electrical installations',
    category: 'regulatory',
    priority: 'critical',
    requirements: [
      { id: 'nec_1', name: 'Code Updates', description: 'Stay current with NEC updates', frequency: 'annually', documentRequired: true },
      { id: 'nec_2', name: 'Permit Compliance', description: 'Pull permits for electrical work', frequency: 'monthly', documentRequired: true },
      { id: 'nec_3', name: 'Inspection Passage', description: 'Pass electrical inspections', frequency: 'monthly', documentRequired: true },
    ],
    certifications: [],
    regulatoryBody: 'NFPA / Local Building Department',
  },

  fall_protection: {
    id: 'fall_protection',
    name: 'Fall Protection Program',
    description: 'OSHA fall protection requirements for work at heights',
    category: 'safety',
    priority: 'critical',
    requirements: [
      { id: 'fall_1', name: 'Fall Protection Training', description: 'Train workers on fall protection', frequency: 'annually', documentRequired: true },
      { id: 'fall_2', name: 'Equipment Inspection', description: 'Inspect harnesses and anchors', frequency: 'daily', documentRequired: true },
      { id: 'fall_3', name: 'Rescue Plan', description: 'Maintain fall rescue procedures', frequency: 'annually', documentRequired: true },
    ],
    certifications: ['OSHA_30'],
    regulatoryBody: 'OSHA',
  },

  dot_compliance: {
    id: 'dot_compliance',
    name: 'DOT Compliance',
    description: 'Department of Transportation regulations for commercial vehicles',
    category: 'regulatory',
    priority: 'critical',
    requirements: [
      { id: 'dot_1', name: 'Driver Qualification', description: 'Maintain driver qualification files', frequency: 'annually', documentRequired: true },
      { id: 'dot_2', name: 'Hours of Service', description: 'Track and enforce HOS regulations', frequency: 'daily', documentRequired: true },
      { id: 'dot_3', name: 'Vehicle Inspections', description: 'Pre/post trip vehicle inspections', frequency: 'daily', documentRequired: true },
      { id: 'dot_4', name: 'Drug Testing', description: 'Implement drug testing program', frequency: 'annually', documentRequired: true },
    ],
    certifications: ['DOT_AUTHORITY', 'CDL'],
    regulatoryBody: 'FMCSA / DOT',
  },

  osha_cleaning: {
    id: 'osha_cleaning',
    name: 'OSHA Cleaning Industry Standards',
    description: 'Safety standards specific to cleaning and janitorial services',
    category: 'safety',
    priority: 'high',
    requirements: [
      { id: 'clean_1', name: 'Chemical Safety Training', description: 'Train on cleaning chemical hazards', frequency: 'annually', documentRequired: true },
      { id: 'clean_2', name: 'SDS Availability', description: 'Maintain SDS for all chemicals', frequency: 'monthly', documentRequired: true },
      { id: 'clean_3', name: 'PPE Requirements', description: 'Provide appropriate PPE', frequency: 'daily', documentRequired: false },
    ],
    certifications: [],
    regulatoryBody: 'OSHA',
  },

  chemical_safety: {
    id: 'chemical_safety',
    name: 'Chemical Safety Program',
    description: 'Hazardous chemical handling and storage requirements',
    category: 'safety',
    priority: 'high',
    requirements: [
      { id: 'chem_1', name: 'Chemical Inventory', description: 'Maintain chemical inventory list', frequency: 'monthly', documentRequired: true },
      { id: 'chem_2', name: 'Storage Compliance', description: 'Proper chemical storage procedures', frequency: 'daily', documentRequired: false },
      { id: 'chem_3', name: 'Spill Response', description: 'Train on spill response procedures', frequency: 'annually', documentRequired: true },
    ],
    certifications: [],
    regulatoryBody: 'OSHA / EPA',
  },

  bloodborne_pathogens: {
    id: 'bloodborne_pathogens',
    name: 'Bloodborne Pathogens Standard',
    description: 'OSHA bloodborne pathogens exposure control',
    category: 'safety',
    priority: 'critical',
    requirements: [
      { id: 'bbp_1', name: 'Exposure Control Plan', description: 'Maintain written exposure control plan', frequency: 'annually', documentRequired: true },
      { id: 'bbp_2', name: 'Training', description: 'Annual BBP training for exposed workers', frequency: 'annually', documentRequired: true },
      { id: 'bbp_3', name: 'Vaccination Offer', description: 'Offer Hepatitis B vaccination', frequency: 'one_time', documentRequired: true },
      { id: 'bbp_4', name: 'Post-Exposure Protocol', description: 'Establish post-exposure procedures', frequency: 'annually', documentRequired: true },
    ],
    certifications: [],
    regulatoryBody: 'OSHA',
  },

  plumbing_code: {
    id: 'plumbing_code',
    name: 'Plumbing Code Compliance',
    description: 'State and local plumbing code requirements',
    category: 'regulatory',
    priority: 'critical',
    requirements: [
      { id: 'plumb_1', name: 'License Verification', description: 'Verify plumber licenses', frequency: 'annually', documentRequired: true },
      { id: 'plumb_2', name: 'Permit Compliance', description: 'Pull required plumbing permits', frequency: 'monthly', documentRequired: true },
      { id: 'plumb_3', name: 'Inspection Passage', description: 'Pass plumbing inspections', frequency: 'monthly', documentRequired: true },
    ],
    certifications: ['JOURNEYMAN_PLUMBER', 'MASTER_PLUMBER'],
    regulatoryBody: 'State Plumbing Board',
  },

  backflow_prevention: {
    id: 'backflow_prevention',
    name: 'Backflow Prevention Certification',
    description: 'Backflow prevention device testing and certification',
    category: 'licensing',
    priority: 'high',
    requirements: [
      { id: 'bf_1', name: 'Tester Certification', description: 'Maintain backflow tester certification', frequency: 'annually', documentRequired: true },
      { id: 'bf_2', name: 'Annual Testing', description: 'Test backflow devices annually', frequency: 'annually', documentRequired: true },
    ],
    certifications: ['BACKFLOW_CERT'],
    renewalPeriod: '1 year',
  },

  epa_608: {
    id: 'epa_608',
    name: 'EPA 608 Certification',
    description: 'EPA refrigerant handling certification',
    category: 'licensing',
    priority: 'critical',
    requirements: [
      { id: 'epa_1', name: 'Technician Certification', description: 'EPA 608 certification for technicians', frequency: 'one_time', documentRequired: true },
      { id: 'epa_2', name: 'Refrigerant Tracking', description: 'Track refrigerant purchases and usage', frequency: 'monthly', documentRequired: true },
      { id: 'epa_3', name: 'Leak Repair', description: 'Comply with leak repair requirements', frequency: 'monthly', documentRequired: true },
    ],
    certifications: ['EPA_608'],
    regulatoryBody: 'EPA',
  },

  refrigerant_handling: {
    id: 'refrigerant_handling',
    name: 'Refrigerant Handling Procedures',
    description: 'Proper refrigerant recovery and handling',
    category: 'environmental',
    priority: 'high',
    requirements: [
      { id: 'ref_1', name: 'Recovery Equipment', description: 'Maintain certified recovery equipment', frequency: 'annually', documentRequired: true },
      { id: 'ref_2', name: 'Disposal Records', description: 'Document refrigerant disposal', frequency: 'monthly', documentRequired: true },
    ],
    certifications: [],
    regulatoryBody: 'EPA',
  },

  liquor_license: {
    id: 'liquor_license',
    name: 'Liquor License Compliance',
    description: 'Alcohol beverage control licensing requirements',
    category: 'licensing',
    priority: 'critical',
    requirements: [
      { id: 'liq_1', name: 'License Renewal', description: 'Renew liquor license annually', frequency: 'annually', documentRequired: true },
      { id: 'liq_2', name: 'Staff Certification', description: 'TIPS/RBS certification for servers', frequency: 'annually', documentRequired: true },
      { id: 'liq_3', name: 'Age Verification', description: 'Verify age for alcohol sales', frequency: 'daily', documentRequired: false },
      { id: 'liq_4', name: 'Hours Compliance', description: 'Comply with service hour restrictions', frequency: 'daily', documentRequired: false },
    ],
    certifications: ['TIPS_CERTIFIED', 'RBS_CERTIFIED'],
    renewalPeriod: '1-3 years',
    regulatoryBody: 'ABC / State Liquor Authority',
  },

  fire_safety: {
    id: 'fire_safety',
    name: 'Fire Safety Compliance',
    description: 'Fire prevention and safety requirements',
    category: 'safety',
    priority: 'critical',
    requirements: [
      { id: 'fire_1', name: 'Fire Extinguisher Inspection', description: 'Monthly fire extinguisher checks', frequency: 'monthly', documentRequired: true },
      { id: 'fire_2', name: 'Fire Drill', description: 'Conduct regular fire drills', frequency: 'quarterly', documentRequired: true },
      { id: 'fire_3', name: 'Exit Signage', description: 'Maintain illuminated exit signs', frequency: 'monthly', documentRequired: false },
      { id: 'fire_4', name: 'Sprinkler Inspection', description: 'Annual sprinkler system inspection', frequency: 'annually', documentRequired: true },
    ],
    certifications: [],
    regulatoryBody: 'Fire Marshal',
  },

  ada_compliance: {
    id: 'ada_compliance',
    name: 'ADA Compliance',
    description: 'Americans with Disabilities Act accessibility requirements',
    category: 'regulatory',
    priority: 'high',
    requirements: [
      { id: 'ada_1', name: 'Accessibility Audit', description: 'Conduct accessibility assessment', frequency: 'annually', documentRequired: true },
      { id: 'ada_2', name: 'Reasonable Accommodation', description: 'Process accommodation requests', frequency: 'monthly', documentRequired: true },
      { id: 'ada_3', name: 'Staff Training', description: 'Train staff on ADA requirements', frequency: 'annually', documentRequired: true },
    ],
    certifications: [],
    regulatoryBody: 'DOJ',
  },

  cosmetology_license: {
    id: 'cosmetology_license',
    name: 'Cosmetology Licensing',
    description: 'State cosmetology licensing requirements',
    category: 'licensing',
    priority: 'critical',
    requirements: [
      { id: 'cos_1', name: 'License Verification', description: 'Verify all stylist licenses', frequency: 'monthly', documentRequired: true },
      { id: 'cos_2', name: 'Continuing Education', description: 'Track CE requirements', frequency: 'annually', documentRequired: true },
      { id: 'cos_3', name: 'Salon License', description: 'Maintain salon establishment license', frequency: 'annually', documentRequired: true },
    ],
    certifications: ['COSMETOLOGY_LICENSE'],
    renewalPeriod: '2 years',
    regulatoryBody: 'State Board of Cosmetology',
  },

  sanitation: {
    id: 'sanitation',
    name: 'Sanitation Standards',
    description: 'Health and sanitation requirements for personal service establishments',
    category: 'regulatory',
    priority: 'high',
    requirements: [
      { id: 'san_1', name: 'Tool Sterilization', description: 'Sterilize tools between clients', frequency: 'daily', documentRequired: false },
      { id: 'san_2', name: 'Sanitizer Logs', description: 'Document sanitization procedures', frequency: 'daily', documentRequired: true },
      { id: 'san_3', name: 'Health Inspection', description: 'Pass health inspections', frequency: 'annually', documentRequired: true },
    ],
    certifications: [],
    regulatoryBody: 'Health Department',
  },

  bonded_insured: {
    id: 'bonded_insured',
    name: 'Bonded & Insured Requirements',
    description: 'Surety bond and insurance requirements for service businesses',
    category: 'financial',
    priority: 'medium',
    requirements: [
      { id: 'bond_1', name: 'Surety Bond', description: 'Maintain active surety bond', frequency: 'annually', documentRequired: true },
      { id: 'bond_2', name: 'Insurance Certificate', description: 'Provide insurance certificates', frequency: 'annually', documentRequired: true },
    ],
    certifications: [],
  },

  project_management: {
    id: 'project_management',
    name: 'Project Management Standards',
    description: 'Construction project management best practices',
    category: 'regulatory',
    priority: 'medium',
    requirements: [
      { id: 'pm_1', name: 'Documentation', description: 'Maintain project documentation', frequency: 'daily', documentRequired: true },
      { id: 'pm_2', name: 'Change Orders', description: 'Process and document change orders', frequency: 'weekly', documentRequired: true },
    ],
    certifications: ['PMP', 'CCM'],
  },
};

class IndustryComplianceTemplatesService {
  private static instance: IndustryComplianceTemplatesService;

  static getInstance(): IndustryComplianceTemplatesService {
    if (!IndustryComplianceTemplatesService.instance) {
      IndustryComplianceTemplatesService.instance = new IndustryComplianceTemplatesService();
    }
    return IndustryComplianceTemplatesService.instance;
  }

  getTemplate(templateId: string): ComplianceTemplate | undefined {
    return COMPLIANCE_TEMPLATE_REGISTRY[templateId];
  }

  getAllTemplates(): Record<string, ComplianceTemplate> {
    return { ...COMPLIANCE_TEMPLATE_REGISTRY };
  }

  getTemplatesByIds(templateIds: string[]): ComplianceTemplate[] {
    return templateIds
      .map(id => COMPLIANCE_TEMPLATE_REGISTRY[id])
      .filter((t): t is ComplianceTemplate => t !== undefined);
  }

  getSubIndustryFromTaxonomy(subIndustryId: string): {
    subIndustry: { id: string; name: string; complianceTemplates: string[]; certifications: string[] };
    industryGroup: { id: string; name: string };
    sector: { id: string; name: string };
  } | null {
    for (const sector of industryTaxonomy.sectors) {
      for (const group of sector.industryGroups) {
        const subIndustry = group.subIndustries.find(s => s.id === subIndustryId);
        if (subIndustry) {
          return {
            subIndustry,
            industryGroup: { id: group.id, name: group.name },
            sector: { id: sector.id, name: sector.name },
          };
        }
      }
    }
    return null;
  }

  getComplianceConfigForSubIndustry(subIndustryId: string): IndustryComplianceConfig | null {
    const taxonomy = this.getSubIndustryFromTaxonomy(subIndustryId);
    if (!taxonomy) return null;

    const templates = this.getTemplatesByIds(taxonomy.subIndustry.complianceTemplates);
    
    const totalRequirements = templates.reduce((sum, t) => sum + t.requirements.length, 0);
    const criticalRequirements = templates
      .filter(t => t.priority === 'critical')
      .reduce((sum, t) => sum + t.requirements.length, 0);

    return {
      subIndustryId,
      subIndustryName: taxonomy.subIndustry.name,
      sectorId: taxonomy.sector.id,
      sectorName: taxonomy.sector.name,
      templates,
      certifications: taxonomy.subIndustry.certifications,
      totalRequirements,
      criticalRequirements,
    };
  }

  async deployComplianceTemplates(params: {
    workspaceId: string;
    subIndustryId: string;
    userId: string;
  }): Promise<{
    success: boolean;
    templatesDeployed: string[];
    requirementsCreated: number;
    errors: string[];
  }> {
    const { workspaceId, subIndustryId, userId } = params;
    const errors: string[] = [];
    const templatesDeployed: string[] = [];
    let requirementsCreated = 0;

    log.info(`[IndustryComplianceTemplates] Deploying templates for workspace ${workspaceId}, sub-industry ${subIndustryId}`);

    try {
      const config = this.getComplianceConfigForSubIndustry(subIndustryId);
      if (!config) {
        errors.push(`Sub-industry ${subIndustryId} not found in taxonomy`);
        return { success: false, templatesDeployed, requirementsCreated, errors };
      }

      const taxonomy = this.getSubIndustryFromTaxonomy(subIndustryId);
      if (!taxonomy) {
        errors.push(`Cannot find taxonomy for sub-industry ${subIndustryId}`);
        return { success: false, templatesDeployed, requirementsCreated, errors };
      }

      await db.update(workspaces)
        .set({
          sectorId: taxonomy.sector.id,
          industryGroupId: taxonomy.industryGroup.id,
          subIndustryId: taxonomy.subIndustry.id,
          industryTaxonomyVersion: industryTaxonomy.version,
          industrySelectedAt: new Date(),
          industrySelectedBy: userId,
          industryComplianceTemplates: config.templates.map(t => t.id),
          industryCertifications: config.certifications,
          industryOnboardingComplete: true,
        })
        .where(eq(workspaces.id, workspaceId));

      for (const template of config.templates) {
        templatesDeployed.push(template.id);
        requirementsCreated += template.requirements.length;
      }

      log.info(`[IndustryComplianceTemplates] Deployed ${templatesDeployed.length} templates with ${requirementsCreated} requirements for workspace ${workspaceId}`);

      return {
        success: true,
        templatesDeployed,
        requirementsCreated,
        errors,
      };

    } catch (error: any) {
      log.error('[IndustryComplianceTemplates] Deployment failed:', error);
      errors.push((error instanceof Error ? error.message : String(error)));
      return {
        success: false,
        templatesDeployed,
        requirementsCreated,
        errors,
      };
    }
  }

  getComplianceSummaryForWorkspace(workspaceId: string, templates: string[]): {
    totalTemplates: number;
    totalRequirements: number;
    byCategory: Record<string, number>;
    byPriority: Record<string, number>;
    criticalItems: string[];
  } {
    const resolvedTemplates = this.getTemplatesByIds(templates);
    
    const byCategory: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const criticalItems: string[] = [];
    let totalRequirements = 0;

    for (const template of resolvedTemplates) {
      byCategory[template.category] = (byCategory[template.category] || 0) + 1;
      byPriority[template.priority] = (byPriority[template.priority] || 0) + 1;
      totalRequirements += template.requirements.length;

      if (template.priority === 'critical') {
        criticalItems.push(template.name);
      }
    }

    return {
      totalTemplates: resolvedTemplates.length,
      totalRequirements,
      byCategory,
      byPriority,
      criticalItems,
    };
  }

  getRequiredCertifications(templates: string[]): {
    id: string;
    fromTemplate: string;
  }[] {
    const certifications: { id: string; fromTemplate: string }[] = [];
    const resolvedTemplates = this.getTemplatesByIds(templates);

    for (const template of resolvedTemplates) {
      for (const cert of template.certifications) {
        if (!certifications.find(c => c.id === cert)) {
          certifications.push({ id: cert, fromTemplate: template.id });
        }
      }
    }

    return certifications;
  }
}

export const industryComplianceTemplates = IndustryComplianceTemplatesService.getInstance();
export { COMPLIANCE_TEMPLATE_REGISTRY };
