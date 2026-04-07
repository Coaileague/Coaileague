/**
 * State Regulatory Knowledge Base
 * =================================
 * Pre-populated registry of all US state security regulatory agencies,
 * license types, statutes, hard block rules, penal code guidance,
 * civil liability protocols, and audit email domains.
 * Updateable by platform_staff without a code deploy (DB-stored, this file seeds).
 * Falls back to manual platform_staff verification for unconfigured states.
 *
 * EXPANSION POLICY:
 * - Texas: Full depth (TOPS portal, Level II/III/IV, penal code, civil liability, TOPS workflow)
 * - Top-12 operational states: Full depth
 * - Remaining 38 states + DC: Accurate baseline with fallbackToManualVerification as needed
 */

import { db } from '../../db';
import { complianceStates } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
const log = createLogger('stateRegulatoryKnowledgeBase');


export interface PenalCodeScenario {
  scenario: string;
  citation: string;
  securityApplication: string;
  recommendedAction: string;
  approvedLanguage: string;
  prohibitedLanguage: string;
}

export interface CivilLiabilityGuidance {
  scenario: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  exposureDescription: string;
  prevention: string;
  approvedLanguage: string;
  prohibitedLanguage: string;
  citation?: string;
}

export interface StateRegulatoryConfig {
  stateCode: string;
  stateName: string;
  regulatoryBody: string;
  regulatoryBodyAcronym: string;
  portalUrl: string;
  auditorEmailDomain: string;
  licenseTypes: { code: string; name: string; description: string; armedAllowed: boolean; trainingHoursRequired?: number; renewalMonths?: number }[];
  keyStatutes: { citation: string; description: string }[];
  minimumInsuranceCoverage: { type: string; minimumAmount: number; description: string }[];
  uniformRequirement: string;
  vehicleMarkingRequirement: string;
  hardBlockRules: { rule: string; citation: string; description: string }[];
  licenseRenewalPeriodMonths: number;
  firearmQualificationRenewalMonths: number;
  minimumAge: number;
  continuingEducationRequired: boolean;
  continuingEducationHours: number;
  requiredTrainingHours: number;
  armedTrainingHours: number;
  fallbackToManualVerification: boolean;
  penalCodeScenarios: PenalCodeScenario[];
  civilLiabilityGuidance: CivilLiabilityGuidance[];
  licenseApplicationProcess?: string;
  topsPortalNotes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEXAS — Primary jurisdiction. Full TOPS/DPS depth.
// ─────────────────────────────────────────────────────────────────────────────
const TEXAS_PENAL_CODE: PenalCodeScenario[] = [
  {
    scenario: 'Criminal Trespass — Removing Unauthorized Person',
    citation: 'Texas Penal Code § 30.05',
    securityApplication: 'Officer has authority to order a person to leave property where they have no permission or license to be. Refusal is a Class B misdemeanor. Officer may NOT physically remove unless person commits additional offense.',
    recommendedAction: 'Verbally order to leave. Document refusal. Call law enforcement. Do not physically engage unless safety threat occurs.',
    approvedLanguage: 'You are not authorized to be on this property. I am asking you to leave immediately. If you do not leave, I will contact law enforcement.',
    prohibitedLanguage: 'Never say "I am arresting you for trespass" — trespass alone does not authorize citizen arrest. Never physically remove a person solely for trespass.',
  },
  {
    scenario: "Citizen's Arrest — Felony or Breach of Peace",
    citation: 'Texas Code of Criminal Procedure Art. 14.01',
    securityApplication: 'A private person may arrest without a warrant for a felony or breach of peace committed in their presence. Must immediately deliver the arrested person to a peace officer. Use only minimum force necessary.',
    recommendedAction: 'Only for felonies witnessed directly. Use minimum necessary force. Immediately call 911. Do not conduct interrogation. Transfer to police upon arrival.',
    approvedLanguage: 'I witnessed you commit [specific felony]. You are being detained until law enforcement arrives. Please remain calm. I am contacting police now.',
    prohibitedLanguage: 'Never say "You are under arrest" for misdemeanors you did not witness. Never say "We will handle this internally." Never threaten charges you cannot enforce.',
  },
  {
    scenario: 'Self-Defense — Use of Force',
    citation: 'Texas Penal Code § 9.31',
    securityApplication: 'Force justified when a person reasonably believes it is immediately necessary to protect themselves against the use of unlawful force. Must be proportional to the threat.',
    recommendedAction: 'De-escalate first. Only use force when immediately necessary. Use minimum force. Document immediately after. Contact supervisor.',
    approvedLanguage: 'I used force only in direct response to a physical threat to my safety. I used the minimum force necessary to stop the threat.',
    prohibitedLanguage: 'Never say "I had to hit him because he was being aggressive." Verbal aggression alone does not justify force. Never pre-emptively use force.',
  },
  {
    scenario: 'Deadly Force in Self-Defense',
    citation: 'Texas Penal Code § 9.32',
    securityApplication: 'Deadly force justified only if actor would be justified in using force AND when the force used is not in response to verbal provocation alone, and actor reasonably believes deadly force is immediately necessary. Retreat requirement abolished in Texas.',
    recommendedAction: 'Only as absolute last resort. Immediately contact supervisor and law enforcement. Do not provide statements until legal counsel is involved.',
    approvedLanguage: 'I believed my life was in immediate danger and I had no other option to protect myself.',
    prohibitedLanguage: 'Never say "I could have backed down but chose to stand my ground." Never discuss specifics until legal counsel is present.',
  },
  {
    scenario: 'Defense of a Third Person',
    citation: 'Texas Penal Code § 9.33',
    securityApplication: 'A person may use force or deadly force to protect a third person using the same standards as self-defense (§ 9.31 and § 9.32) if they reasonably believe the third person would be justified in using such force themselves.',
    recommendedAction: 'Verify threat is real. Use minimum force. Document the incident. Same protocols as self-defense apply.',
    approvedLanguage: 'I intervened to protect [person] because I reasonably believed they faced an immediate threat of harm.',
    prohibitedLanguage: 'Never intervene in disputes where both parties are equally at fault without clear victimization.',
  },
  {
    scenario: 'Shoplifting / Theft Detention — Merchant Privilege',
    citation: 'Texas Penal Code § 124.001 (Civil Practice & Remedies Code) / Texas Penal Code § 31.03',
    securityApplication: 'A person may detain a shoplifting suspect in a reasonable manner for a reasonable period if they have probable cause to believe theft occurred. This is a civil immunity provision, not a criminal authority. Must be based on direct observation.',
    recommendedAction: 'Observe, document, and detain only with high certainty of observed theft. Do not detain in back rooms. Keep detention brief (until police arrive). Never use excessive force.',
    approvedLanguage: 'I observed you conceal/remove merchandise without payment. I am detaining you for a brief period pending law enforcement arrival. You are not under arrest.',
    prohibitedLanguage: 'Never say "You are under arrest for shoplifting." Never detain without direct observation. Never conduct searches — that is for police.',
  },
  {
    scenario: 'Public Intoxication / Disorderly Conduct',
    citation: 'Texas Penal Code § 49.02 / § 42.01',
    securityApplication: 'Officer may call law enforcement for public intoxication (Class C misdemeanor) or disorderly conduct. Cannot arrest without peace officer commission. Can refuse entry, request exit, and secure the scene.',
    recommendedAction: 'Request the person leave. Call law enforcement. Keep person safe from harm to themselves or others while waiting. Document all actions.',
    approvedLanguage: 'For your safety and the safety of others, I need you to leave the premises. I am contacting law enforcement.',
    prohibitedLanguage: 'Never say "I am arresting you for public intox." Security officers cannot make arrests for Class C misdemeanors except commissioned officers with specific authority.',
  },
  {
    scenario: 'Assault or Imminent Violence',
    citation: 'Texas Penal Code § 22.01',
    securityApplication: 'If assault occurs, officer should separate parties, secure scene, and immediately summon law enforcement. Document observations as potential witnesses. Can use force to stop ongoing assault under defense of third person statute.',
    recommendedAction: 'Separate and secure. Call 911. Document witnesses and evidence. Do not place yourself in the middle unless absolutely necessary to prevent serious bodily injury.',
    approvedLanguage: 'I am separating you for everyone\'s safety. Law enforcement has been called. Please step back.',
    prohibitedLanguage: 'Never physically intervene in mutual combat unless someone is in danger of serious bodily injury. Never say "I saw nothing" to avoid involvement.',
  },
  {
    scenario: 'Commissioned Officer Authority (Level III)',
    citation: 'Texas Occupations Code § 1702.206; Texas Code of Criminal Procedure Art. 2.12',
    securityApplication: 'Level III Commissioned Security Officers in Texas have authority to carry handguns in the course of employment and may have additional detention authority per their commission. Their authority is still limited to the property/scope of their employment.',
    recommendedAction: 'Firearms only in direct defense of life. Commission does not equal law enforcement authority. Must comply with employer firearm policies and DPS qualification requirements.',
    approvedLanguage: 'As a commissioned security officer, I am authorized to carry a firearm in the performance of my security duties on this property.',
    prohibitedLanguage: 'Never imply law enforcement authority. Never identify as "law enforcement." Commission means armed, not officer of the law.',
  },
];

const TEXAS_CIVIL_LIABILITY: CivilLiabilityGuidance[] = [
  {
    scenario: 'Premises Liability — Duty to Protect Visitors',
    riskLevel: 'critical',
    exposureDescription: 'Property owners/operators owe a duty of reasonable care to invitees. Security companies that take on "duty to protect" through contract can face negligent security claims if the duty is not met.',
    prevention: 'Never make representations that guarantee safety. Contracts must limit scope of duty. Incident reports must be thorough and immediate.',
    approvedLanguage: 'Our role is to observe, document, and report security-related matters on this property.',
    prohibitedLanguage: 'Never say "We guarantee your safety." Never say "Nothing bad will happen while we are here." Never promise outcomes.',
    citation: 'Texas Civil Practice & Remedies Code § 75.001; Timberwalk Apartments v. Cain (1998)',
  },
  {
    scenario: 'Negligent Hiring / Supervision',
    riskLevel: 'high',
    exposureDescription: 'Employer may be liable for negligent hiring if they knew or should have known an employee was unfit and harm results. Background checks are critical.',
    prevention: 'Background check every employee. Verify all licenses. Document supervision activities. Maintain discipline records.',
    approvedLanguage: 'All personnel are background-checked, licensed, and supervised according to Texas DPS and company standards.',
    prohibitedLanguage: 'Never skip background checks. Never assign officers to posts without verified credentials.',
    citation: 'Winn-Dixie Texas v. Johnson (Tex. App. 1994)',
  },
  {
    scenario: 'False Imprisonment — Unlawful Detention',
    riskLevel: 'critical',
    exposureDescription: 'Detaining a person without legal authority or reasonable cause can result in both civil false imprisonment claims and criminal charges. A detention without merchant privilege or citizen arrest justification is unlawful.',
    prevention: 'Only detain when legally authorized. Document the factual basis for any detention. Call police immediately.',
    approvedLanguage: 'I am asking you to remain briefly while I contact law enforcement — this is within my authority based on what I directly observed.',
    prohibitedLanguage: 'Never say "You cannot leave." Never detain without clear legal basis. Never detain in a room that is locked or blocked.',
    citation: 'Texas Civil Practice & Remedies Code § 124.001',
  },
  {
    scenario: 'Assumption of Duty — Over-Promising Security',
    riskLevel: 'critical',
    exposureDescription: 'If a security officer or company makes representations that create a reasonable expectation of protection, courts may find an assumed duty. Failing to fulfill that assumed duty creates liability even where no duty otherwise existed.',
    prevention: 'Train all officers to never make safety guarantees. All client contracts must include scope-of-service limitations. Officer communications must be observational only.',
    approvedLanguage: 'Our role is to observe and report, deter by presence, and respond appropriately to incidents according to our post orders.',
    prohibitedLanguage: 'Never say "We will make sure nothing happens." Never say "You are safe with us here." Never promise specific outcomes.',
    citation: 'Texas Supreme Court — voluntary assumption of duty doctrine',
  },
  {
    scenario: 'Use of Force — Excessive Force Liability',
    riskLevel: 'critical',
    exposureDescription: 'Security officers who use excessive force face civil battery claims, potential criminal charges, and expose their employer to respondeat superior liability. Force must be proportional and documented.',
    prevention: 'De-escalation training is mandatory. Document all use of force incidents immediately. Review of every force incident by management required.',
    approvedLanguage: 'I used minimum necessary force in response to an immediate threat. I will complete a full incident report.',
    prohibitedLanguage: 'Never describe force as "teaching someone a lesson." Never minimize force in reports. Never fail to report.',
    citation: 'Texas Penal Code § 9.31; respondeat superior doctrine',
  },
  {
    scenario: 'Wrongful Termination — Employee Discipline',
    riskLevel: 'high',
    exposureDescription: 'Improperly documented terminations, or terminations that appear discriminatory, retaliatory, or arbitrary, create significant wrongful termination exposure. Texas is at-will but documentation protects the employer.',
    prevention: 'Document every disciplinary action. Follow progressive discipline for all non-critical violations. Have HR review all terminations. Use proper termination language.',
    approvedLanguage: 'Your employment is being terminated effective [date] for [specific reason documented in disciplinary records].',
    prohibitedLanguage: 'Never terminate without documentation. Never reference protected characteristics. Never imply retaliation.',
    citation: 'Texas Labor Code; Texas Commission on Human Rights Act',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// FULL STATE KNOWLEDGE — All 50 states + DC
// ─────────────────────────────────────────────────────────────────────────────
export const STATE_REGULATORY_KNOWLEDGE: StateRegulatoryConfig[] = [
  {
    stateCode: 'TX',
    stateName: 'Texas',
    regulatoryBody: 'Texas Department of Public Safety — Private Security Bureau',
    regulatoryBodyAcronym: 'DPS-PSB',
    portalUrl: 'https://www.dps.texas.gov/section/private-security',
    auditorEmailDomain: '@dps.texas.gov',
    licenseTypes: [
      {
        code: 'LEVEL_II',
        name: 'Level II — Non-Commissioned Security Officer (Unarmed)',
        description: 'Non-commissioned (unarmed) security officer. Requires 6 hours pre-assignment training and 40 hours within first year. Background check via DPS. Applied through TOPS portal.',
        armedAllowed: false,
        trainingHoursRequired: 40,
        renewalMonths: 24,
      },
      {
        code: 'LEVEL_III',
        name: 'Level III — Commissioned Security Officer (Armed)',
        description: 'Commissioned (armed) security officer. Requires completion of Level II requirements plus DPS firearms qualification course (50-round minimum, 70% score). Annual firearms requalification required.',
        armedAllowed: true,
        trainingHoursRequired: 10,
        renewalMonths: 24,
      },
      {
        code: 'LEVEL_IV',
        name: 'Level IV — Personal Protection Officer (PPO)',
        description: 'Personal Protection Officer. Requires 30 hours PPO-specific training in addition to Level III. Highest individual license level. Required for bodyguard/executive protection services.',
        armedAllowed: true,
        trainingHoursRequired: 30,
        renewalMonths: 24,
      },
      {
        code: 'COMPANY_C3',
        name: 'Class C — Security Company License',
        description: 'Required for any business operating as a security services contractor in Texas. Company must have a licensed manager. Applied through TOPS portal.',
        armedAllowed: false,
        renewalMonths: 24,
      },
      {
        code: 'MANAGER',
        name: 'Security Manager License',
        description: 'Required for individuals who manage a security company or branch. Must have Level II or III license plus 2 years of management experience.',
        armedAllowed: false,
        renewalMonths: 24,
      },
    ],
    keyStatutes: [
      { citation: 'Texas Occupations Code Chapter 1702', description: 'Private Security Act — primary regulatory statute governing all security services in Texas' },
      { citation: 'Texas Admin Code Title 37, Part 1, Ch. 35', description: 'DPS administrative rules for private security licensing and operations' },
      { citation: 'Texas Occupations Code § 1702.102', description: 'Company (Class C) license required for all security services contractors' },
      { citation: 'Texas Occupations Code § 1702.163', description: 'Firearms qualification requirements — annual requalification for Level III' },
      { citation: 'Texas Occupations Code § 1702.206', description: 'Commissioned officer authority and handgun carry in course of employment' },
      { citation: 'Texas Occupations Code § 1702.221', description: 'Prohibited conduct — working with expired, revoked, or suspended license' },
      { citation: 'Texas Occupations Code § 1702.301', description: 'Grounds for license denial, revocation, and suspension' },
      { citation: 'Texas Penal Code § 30.05', description: 'Criminal trespass — security officers authority to order removal and basis for police call' },
      { citation: 'Texas Penal Code § 9.31', description: 'Self-defense — justification for use of force by security officers' },
      { citation: 'Texas Penal Code § 9.33', description: 'Defense of third persons — intervening to protect others' },
      { citation: 'Texas Code of Criminal Procedure Art. 14.01', description: "Citizen's arrest authority — felonies and breach of peace committed in officer's presence" },
      { citation: 'Texas Civil Practice & Remedies Code § 124.001', description: 'Merchant privilege detention — shoplifting detention immunity conditions' },
    ],
    minimumInsuranceCoverage: [
      { type: 'general_liability', minimumAmount: 100000, description: 'Minimum $100,000 general liability per occurrence — verify with DPS for current requirements' },
    ],
    uniformRequirement: 'Must clearly display the word SECURITY and company name. Uniform must not be deceptively similar to a law enforcement uniform. Chapter 1702 and TAC Ch. 35 uniform standards apply. Badge must indicate SECURITY not "Officer" in a way that implies law enforcement.',
    vehicleMarkingRequirement: 'Patrol vehicles must display company name and the word SECURITY. No markings, lights, or insignia resembling law enforcement. Light bars must be amber only if used.',
    hardBlockRules: [
      { rule: 'expired_license', citation: 'Texas Occupations Code § 1702.221', description: 'No person may work as a security officer with an expired, revoked, or suspended license. Immediate removal from all posts required.' },
      { rule: 'armed_without_qualification', citation: 'Texas Occupations Code § 1702.163', description: 'Armed officers must have active Level III license with current annual firearms qualification. Cannot carry without valid DPS qualification certificate.' },
      { rule: 'company_no_class_c', citation: 'Texas Occupations Code § 1702.102', description: 'Company must hold active Class C license to operate as a security contractor. Operating without a Class C is a criminal offense.' },
      { rule: 'wrong_license_class', citation: 'Texas Occupations Code § 1702.101', description: 'Officer must hold the license level required for the assigned post. Armed posts require Level III; PPO posts require Level IV.' },
      { rule: 'no_background_check', citation: 'Texas Occupations Code § 1702.113', description: 'Officers must pass a DPS background check. Convictions for certain crimes permanently bar licensing.' },
      { rule: 'underage', citation: 'Texas Occupations Code § 1702.113', description: 'Minimum age 18 years. No exceptions.' },
    ],
    licenseRenewalPeriodMonths: 24,
    firearmQualificationRenewalMonths: 12,
    minimumAge: 18,
    continuingEducationRequired: true,
    continuingEducationHours: 8,
    requiredTrainingHours: 40,
    armedTrainingHours: 10,
    fallbackToManualVerification: false,
    licenseApplicationProcess: 'All Texas security licenses are applied for and managed through the TOPS (Texas Online Private Security) portal at https://tops.dps.texas.gov. Steps: (1) Create TOPS account. (2) Complete pre-assignment training (6 hours) from a DPS-approved school. (3) Submit fingerprints for DPS background check. (4) Apply for Level II license online with training certificate and fee. (5) For Level III: complete DPS-approved firearms training, submit qualification scores to TOPS. (6) Renewal every 2 years: complete 8 CE hours, pay renewal fee in TOPS portal.',
    topsPortalNotes: 'TOPS (Texas Online Private Security) is the DPS web portal for all PSB licensing. URL: https://tops.dps.texas.gov. Officers can view license status, submit renewals, and upload training certificates. Employers can verify officer licenses in real-time through TOPS employer verification. All compliance certificates must be uploaded to TOPS within 30 days of completion.',
    penalCodeScenarios: TEXAS_PENAL_CODE,
    civilLiabilityGuidance: TEXAS_CIVIL_LIABILITY,
  },
  {
    stateCode: 'CA',
    stateName: 'California',
    regulatoryBody: 'Bureau of Security and Investigative Services, California Department of Consumer Affairs',
    regulatoryBodyAcronym: 'BSIS',
    portalUrl: 'https://www.bsis.ca.gov',
    auditorEmailDomain: '@dca.ca.gov',
    licenseTypes: [
      { code: 'GUARD_CARD', name: 'Guard Card (Unarmed)', description: 'Security guard registration — unarmed. Requires 40 hours of training (8 pre-assignment, 32 within 6 months). Background check via DOJ.', armedAllowed: false, trainingHoursRequired: 40, renewalMonths: 24 },
      { code: 'EFP', name: 'Exposed Firearm Permit (Armed)', description: 'Allows armed duty. Requires Guard Card plus 14 hours firearms training and annual requalification.', armedAllowed: true, trainingHoursRequired: 14, renewalMonths: 24 },
      { code: 'PPO', name: 'Private Patrol Operator License', description: 'Company license — required for all security businesses. Requires qualified manager with PPO license.', armedAllowed: false, renewalMonths: 24 },
    ],
    keyStatutes: [
      { citation: 'California Business and Professions Code §§ 7580-7599.8', description: 'Full private security regulatory code — BSIS licensing' },
      { citation: 'California B&P Code § 7583.3', description: 'Guard card registration requirements' },
      { citation: 'California B&P Code § 7583.38', description: 'Exposed firearm permit requirements' },
      { citation: '16 CCR §§ 600-699', description: 'BSIS administrative regulations' },
    ],
    minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 1000000, description: 'Minimum $1,000,000 general liability' }],
    uniformRequirement: 'Must display SECURITY and company name. Cannot resemble law enforcement. California-specific badge requirements apply per BSIS.',
    vehicleMarkingRequirement: 'Must display SECURITY and company name. Cannot resemble law enforcement vehicles.',
    hardBlockRules: [
      { rule: 'expired_license', citation: 'California B&P Code § 7583.3', description: 'Guard card must be current and active before any security work begins.' },
      { rule: 'armed_without_efp', citation: 'California B&P Code § 7583.38', description: 'Exposed Firearm Permit required and must be current for any armed duty.' },
      { rule: 'training_incomplete', citation: 'California B&P Code § 7583.6', description: 'Officer must complete 40 total training hours: 8 before working, 32 within 6 months.' },
    ],
    licenseRenewalPeriodMonths: 24,
    firearmQualificationRenewalMonths: 12,
    minimumAge: 18,
    continuingEducationRequired: true,
    continuingEducationHours: 32,
    requiredTrainingHours: 40,
    armedTrainingHours: 14,
    fallbackToManualVerification: false,
    penalCodeScenarios: [
      {
        scenario: 'Criminal Trespass — Removing Unauthorized Person',
        citation: 'California Penal Code § 602',
        securityApplication: 'Property owner or agent may ask unauthorized person to leave. Refusal is a misdemeanor. Security officer as property agent may issue trespass warning and call law enforcement.',
        recommendedAction: 'Issue verbal warning. Document. Call law enforcement if person refuses to leave.',
        approvedLanguage: 'You do not have permission to be on this property. Please leave now. If you refuse, I will contact law enforcement.',
        prohibitedLanguage: 'Never physically remove a person solely for trespass. Never imply arrest authority you do not have.',
      },
      {
        scenario: "Citizen's Arrest — Misdemeanor in Presence",
        citation: 'California Penal Code § 837',
        securityApplication: 'California allows citizen arrest for public offenses (misdemeanors and felonies) committed in the person\'s presence, unlike many states. Still must immediately deliver to law enforcement.',
        recommendedAction: 'Only detain if offense directly observed. Immediately call police. Use minimum force.',
        approvedLanguage: 'I directly observed you commit [offense]. I am detaining you for law enforcement. Please remain calm.',
        prohibitedLanguage: 'Never base detention on hearsay or suspicion. Never hold without calling police.',
      },
    ],
    civilLiabilityGuidance: [
      {
        scenario: 'Assumption of Duty — Safety Guarantees',
        riskLevel: 'critical',
        exposureDescription: 'California courts recognize assumed duty of care when security personnel make representations of protection.',
        prevention: 'Observe and report language only. Contracts must limit scope of duty.',
        approvedLanguage: 'Our role is to observe, deter by presence, and report security incidents.',
        prohibitedLanguage: 'Never promise safety. Never guarantee protection outcomes.',
      },
    ],
  },
  {
    stateCode: 'FL',
    stateName: 'Florida',
    regulatoryBody: 'Florida Department of Agriculture and Consumer Services — Division of Licensing',
    regulatoryBodyAcronym: 'FDACS',
    portalUrl: 'https://www.fdacs.gov/Business-Services/Private-Investigation-Recovery-and-Repossession',
    auditorEmailDomain: '@fdacs.gov',
    licenseTypes: [
      { code: 'CLASS_D', name: 'Class D — Security Officer (Unarmed)', description: 'Unarmed security officer license. Requires 40 hours training, background check, fingerprints. Application through FDACS online portal.', armedAllowed: false, trainingHoursRequired: 40, renewalMonths: 24 },
      { code: 'CLASS_G', name: 'Class G — Statewide Firearms License (Armed)', description: 'Required for armed security work. Must hold Class D first. Requires 28 hours firearms training, range qualification, and psychiatric evaluation.', armedAllowed: true, trainingHoursRequired: 28, renewalMonths: 24 },
      { code: 'CLASS_B', name: 'Class B — Security Agency License', description: 'Security agency business license. Required for all security service companies operating in Florida.', armedAllowed: false, renewalMonths: 24 },
    ],
    keyStatutes: [
      { citation: 'Florida Statutes Chapter 493', description: 'Private investigation, recovery and repossession — primary security statute' },
      { citation: 'Florida Statutes § 493.6101', description: 'Officer license requirements — Class D and G' },
      { citation: 'Florida Statutes § 493.6115', description: 'Firearms requirements — Class G mandatory prerequisites' },
      { citation: 'Florida Admin Code Rule 5N-1', description: 'DACS licensing rules and operational requirements' },
    ],
    minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: 'Minimum $300,000 general liability' }],
    uniformRequirement: 'Must display SECURITY and company name. Cannot resemble law enforcement. Chapter 493 uniform standards apply.',
    vehicleMarkingRequirement: 'Must display SECURITY and company name. Cannot resemble law enforcement. Amber lights only if equipped.',
    hardBlockRules: [
      { rule: 'expired_license', citation: 'Florida Statutes § 493.6101', description: 'Security officer license must be current. Working with expired license is a third-degree felony.' },
      { rule: 'armed_without_class_g', citation: 'Florida Statutes § 493.6115', description: 'Class G statewide firearms license required and must be current for any armed duty.' },
    ],
    licenseRenewalPeriodMonths: 24,
    firearmQualificationRenewalMonths: 12,
    minimumAge: 18,
    continuingEducationRequired: true,
    continuingEducationHours: 8,
    requiredTrainingHours: 40,
    armedTrainingHours: 28,
    fallbackToManualVerification: false,
    penalCodeScenarios: [
      {
        scenario: 'Criminal Trespass — Removing Unauthorized Person',
        citation: 'Florida Statutes § 810.08',
        securityApplication: 'Security officer as property agent may issue notice to leave. Refusal after notice is second-degree misdemeanor. Officer may not physically remove — must call law enforcement.',
        recommendedAction: 'Issue verbal notice. Document. Call law enforcement if refused.',
        approvedLanguage: 'You have been asked to leave this property. I am contacting law enforcement as you have not complied.',
        prohibitedLanguage: 'Never physically remove. Never imply arrest authority.',
      },
    ],
    civilLiabilityGuidance: [
      {
        scenario: 'Assumption of Duty — Safety Representations',
        riskLevel: 'critical',
        exposureDescription: 'Florida courts impose duty of reasonable care on property owners and their agents including security contractors when safety representations are made.',
        prevention: 'Observe and report language only. Document all incidents.',
        approvedLanguage: 'Our role is to observe, report, and deter by presence.',
        prohibitedLanguage: 'Never guarantee protection outcomes.',
      },
    ],
  },
  {
    stateCode: 'GA',
    stateName: 'Georgia',
    regulatoryBody: 'Georgia Board of Private Detective and Security Agencies',
    regulatoryBodyAcronym: 'GABD',
    portalUrl: 'https://sos.ga.gov/page/private-detective-and-security-agencies',
    auditorEmailDomain: '@sos.ga.gov',
    licenseTypes: [
      { code: 'SEC_INDIV', name: 'Security Officer Individual License', description: 'Individual security officer license — unarmed.', armedAllowed: false, renewalMonths: 24 },
      { code: 'SEC_ARMED', name: 'Armed Security Officer', description: 'Armed individual license — additional firearms training and background check required.', armedAllowed: true, renewalMonths: 24 },
      { code: 'AGENCY', name: 'Security Agency License', description: 'Company license required for all security businesses.', armedAllowed: false, renewalMonths: 24 },
    ],
    keyStatutes: [{ citation: 'Georgia Code § 43-38', description: 'Private detectives and security agencies — primary statute' }],
    minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: 'Minimum $300,000 coverage' }],
    uniformRequirement: 'SECURITY and company name must be visible. Cannot resemble law enforcement.',
    vehicleMarkingRequirement: 'Company name and SECURITY must be displayed on patrol vehicles.',
    hardBlockRules: [{ rule: 'expired_license', citation: 'Georgia Code § 43-38-7', description: 'License must be current and active before performing any security work.' }],
    licenseRenewalPeriodMonths: 24,
    firearmQualificationRenewalMonths: 12,
    minimumAge: 18,
    continuingEducationRequired: false,
    continuingEducationHours: 0,
    requiredTrainingHours: 0,
    armedTrainingHours: 0,
    fallbackToManualVerification: true,
    penalCodeScenarios: [],
    civilLiabilityGuidance: [
      {
        scenario: 'Assumption of Duty',
        riskLevel: 'critical',
        exposureDescription: 'Georgia follows common law assumption of duty — safety guarantees create enforceable duty.',
        prevention: 'Observe and report language only.',
        approvedLanguage: 'Our role is to observe, deter, and report.',
        prohibitedLanguage: 'Never guarantee safety outcomes.',
      },
    ],
  },
  {
    stateCode: 'NY',
    stateName: 'New York',
    regulatoryBody: 'New York Division of Criminal Justice Services',
    regulatoryBodyAcronym: 'DCJS',
    portalUrl: 'https://www.criminaljustice.ny.gov/ops/docs/security-guard-licensing.htm',
    auditorEmailDomain: '@dcjs.ny.gov',
    licenseTypes: [
      { code: 'REGISTERED', name: 'Registered Security Guard (Unarmed)', description: 'Individual registration. Requires 8-hour pre-assignment training, 16 hours on-the-job training, and 8 hours annual refresher.', armedAllowed: false, trainingHoursRequired: 24, renewalMonths: 24 },
      { code: 'ARMED', name: 'Armed Guard', description: 'Requires Pistol Permit plus additional 47-hour firearms training including 8-hour pre-assignment, 16-hour on-the-job, 16-hour firearm, and 7-hour annual refresher.', armedAllowed: true, trainingHoursRequired: 47, renewalMonths: 24 },
      { code: 'LICENSED_AGENCY', name: 'Licensed Security Agency', description: 'Security agency license. Required for all businesses providing security services in New York.', armedAllowed: false, renewalMonths: 24 },
    ],
    keyStatutes: [
      { citation: 'New York General Business Law Article 7-A §§ 89-f through 89-p', description: 'Security guard training and licensing — comprehensive statutory framework' },
      { citation: '19 NYCRR Part 174', description: 'DCJS security guard regulations — operational requirements' },
    ],
    minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 1000000, description: 'Minimum $1,000,000 general liability' }],
    uniformRequirement: 'SECURITY and company name must be clearly visible. Must not resemble law enforcement uniforms. DCJS registration card must be carried at all times.',
    vehicleMarkingRequirement: 'Company name and SECURITY required on all patrol vehicles.',
    hardBlockRules: [
      { rule: 'expired_license', citation: 'New York GBL Article 7-A § 89-f', description: 'Security guard registration must be current. Working without registration is a misdemeanor.' },
      { rule: 'training_incomplete', citation: 'NY GBL § 89-g', description: 'Required training hours must be completed — 8 hours pre-assignment mandatory.' },
    ],
    licenseRenewalPeriodMonths: 24,
    firearmQualificationRenewalMonths: 12,
    minimumAge: 18,
    continuingEducationRequired: true,
    continuingEducationHours: 8,
    requiredTrainingHours: 16,
    armedTrainingHours: 47,
    fallbackToManualVerification: false,
    penalCodeScenarios: [
      {
        scenario: 'Criminal Trespass — Removing Unauthorized Person',
        citation: 'New York Penal Law § 140.05',
        securityApplication: 'Security officer as property agent may order unauthorized persons to leave. Refusal is a violation (140.05). Must have clear authority as property agent.',
        recommendedAction: 'Verbal order to leave. Document. Call police if refused.',
        approvedLanguage: 'You are not authorized to be in this area. Please leave immediately. Law enforcement will be called if you do not comply.',
        prohibitedLanguage: 'Never physically eject. Never imply law enforcement authority.',
      },
    ],
    civilLiabilityGuidance: [
      {
        scenario: 'Negligent Security — Premises Liability',
        riskLevel: 'critical',
        exposureDescription: 'New York follows foreseeability doctrine — prior crime on or near premises creates duty to provide reasonable security.',
        prevention: 'Document all incidents. Report to property management. Never reduce patrol coverage in high-risk areas without management approval.',
        approvedLanguage: 'We are implementing security measures appropriate to observed risk levels at this location.',
        prohibitedLanguage: 'Never promise specific crime prevention outcomes.',
        citation: 'Nallan v. Helmsley-Spear, Inc. (NY 1980)',
      },
    ],
  },
  {
    stateCode: 'AZ',
    stateName: 'Arizona',
    regulatoryBody: 'Arizona Department of Public Safety — Private Investigator and Regulatory Section',
    regulatoryBodyAcronym: 'AZ-DPS-PIRES',
    portalUrl: 'https://www.azdps.gov/services/public/pire',
    auditorEmailDomain: '@azdps.gov',
    licenseTypes: [
      { code: 'UNARMED', name: 'Unarmed Security Guard', description: 'Unarmed officer registration. Background check via DPS.', armedAllowed: false, trainingHoursRequired: 8, renewalMonths: 24 },
      { code: 'ARMED', name: 'Armed Security Guard', description: 'Armed officer registration. Requires additional firearms training and qualification.', armedAllowed: true, renewalMonths: 24 },
    ],
    keyStatutes: [{ citation: 'Arizona Revised Statutes § 32-2601 et seq', description: 'Private investigators and security guards — primary licensing statute' }],
    minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 500000, description: 'Minimum $500,000 coverage' }],
    uniformRequirement: 'SECURITY and company name must be visible. Cannot resemble law enforcement.',
    vehicleMarkingRequirement: 'Company name and SECURITY must be displayed.',
    hardBlockRules: [{ rule: 'expired_license', citation: 'ARS § 32-2611', description: 'License must be current and active.' }],
    licenseRenewalPeriodMonths: 24,
    firearmQualificationRenewalMonths: 12,
    minimumAge: 18,
    continuingEducationRequired: false,
    continuingEducationHours: 0,
    requiredTrainingHours: 8,
    armedTrainingHours: 0,
    fallbackToManualVerification: false,
    penalCodeScenarios: [],
    civilLiabilityGuidance: [{ scenario: 'Assumption of Duty', riskLevel: 'critical', exposureDescription: 'Arizona follows assumed duty doctrine.', prevention: 'Observe and report only.', approvedLanguage: 'Our role is to observe, deter, and report.', prohibitedLanguage: 'Never guarantee safety outcomes.' }],
  },
  {
    stateCode: 'NV',
    stateName: 'Nevada',
    regulatoryBody: 'Nevada Private Investigators Licensing Board',
    regulatoryBodyAcronym: 'NPILB',
    portalUrl: 'https://pilb.nv.gov',
    auditorEmailDomain: '@pilb.nv.gov',
    licenseTypes: [
      { code: 'CARD', name: 'Security Guard Card', description: 'Individual security guard card — unarmed. 16 hours initial training required.', armedAllowed: false, trainingHoursRequired: 16, renewalMonths: 12 },
      { code: 'ARMED', name: 'Armed Guard Card', description: 'Armed security officer card — additional 14 hours firearms training plus qualification.', armedAllowed: true, trainingHoursRequired: 14, renewalMonths: 12 },
    ],
    keyStatutes: [{ citation: 'Nevada Revised Statutes Chapter 648', description: 'Private investigators and related professionals — security licensing' }],
    minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: 'Minimum $300,000 coverage' }],
    uniformRequirement: 'SECURITY and company name visible. No law enforcement resemblance.',
    vehicleMarkingRequirement: 'SECURITY and company name must be displayed on patrol vehicles.',
    hardBlockRules: [{ rule: 'expired_license', citation: 'NRS § 648.060', description: 'Guard card must be current. Annual renewal required in Nevada.' }],
    licenseRenewalPeriodMonths: 12,
    firearmQualificationRenewalMonths: 12,
    minimumAge: 18,
    continuingEducationRequired: false,
    continuingEducationHours: 0,
    requiredTrainingHours: 16,
    armedTrainingHours: 14,
    fallbackToManualVerification: false,
    penalCodeScenarios: [],
    civilLiabilityGuidance: [{ scenario: 'Assumption of Duty', riskLevel: 'critical', exposureDescription: 'Nevada recognizes assumed duty from safety representations.', prevention: 'Observe and report language only.', approvedLanguage: 'Our role is to observe, deter, and report.', prohibitedLanguage: 'Never guarantee safety outcomes.' }],
  },
  {
    stateCode: 'CO',
    stateName: 'Colorado',
    regulatoryBody: 'Colorado Department of Regulatory Agencies — Division of Professions and Occupations',
    regulatoryBodyAcronym: 'DORA-DPO',
    portalUrl: 'https://dpo.colorado.gov/SecurityGuard',
    auditorEmailDomain: '@state.co.us',
    licenseTypes: [
      { code: 'REGISTERED', name: 'Registered Security Guard', description: 'Individual registration — no pre-licensing training required by state (employer training required).', armedAllowed: false, renewalMonths: 24 },
      { code: 'ARMED', name: 'Armed Security Guard', description: 'Armed officer registration — CCW permit required in Colorado.', armedAllowed: true, renewalMonths: 24 },
    ],
    keyStatutes: [{ citation: 'Colorado Revised Statutes § 12-11-101 et seq', description: 'Security guard agency regulation — Colorado' }],
    minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 500000, description: 'Minimum $500,000 coverage' }],
    uniformRequirement: 'SECURITY and company name visible. Must not resemble law enforcement.',
    vehicleMarkingRequirement: 'SECURITY and company name on patrol vehicles.',
    hardBlockRules: [{ rule: 'expired_license', citation: 'CRS § 12-11-105', description: 'Registration must be current to work.' }],
    licenseRenewalPeriodMonths: 24,
    firearmQualificationRenewalMonths: 12,
    minimumAge: 18,
    continuingEducationRequired: false,
    continuingEducationHours: 0,
    requiredTrainingHours: 0,
    armedTrainingHours: 0,
    fallbackToManualVerification: false,
    penalCodeScenarios: [],
    civilLiabilityGuidance: [{ scenario: 'Assumption of Duty', riskLevel: 'critical', exposureDescription: 'Colorado follows assumed duty doctrine for safety representations.', prevention: 'Observe and report only.', approvedLanguage: 'Our role is to observe, deter, and report.', prohibitedLanguage: 'Never guarantee protection.' }],
  },
  {
    stateCode: 'IL',
    stateName: 'Illinois',
    regulatoryBody: 'Illinois Department of Financial and Professional Regulation',
    regulatoryBodyAcronym: 'IDFPR',
    portalUrl: 'https://idfpr.com/profs/detective.asp',
    auditorEmailDomain: '@idfpr.illinois.gov',
    licenseTypes: [
      { code: 'EMPLOYEE_REGISTRANT', name: 'Employee Registrant', description: 'Individual security guard registration — unarmed. 20 hours training required.', armedAllowed: false, trainingHoursRequired: 20, renewalMonths: 24 },
      { code: 'ARMED', name: 'Armed Registrant', description: 'Armed security guard registration — additional training required plus FOID card.', armedAllowed: true, renewalMonths: 24 },
      { code: 'AGENCY', name: 'Detective or Security Agency License', description: 'Agency license required for all security businesses. 20 CE hours required for renewal.', armedAllowed: false, renewalMonths: 24 },
    ],
    keyStatutes: [{ citation: 'Illinois Private Detective, Private Alarm, Private Security, Fingerprint Vendor, and Locksmith Act of 2004 (225 ILCS 447)', description: 'Primary regulatory statute for security in Illinois' }],
    minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: 'Minimum $300,000 coverage' }],
    uniformRequirement: 'SECURITY and company name required. Cannot resemble law enforcement.',
    vehicleMarkingRequirement: 'SECURITY and company identification required on patrol vehicles.',
    hardBlockRules: [
      { rule: 'expired_license', citation: '225 ILCS 447/40-10', description: 'Registration must be current to work.' },
      { rule: 'no_foid_card', citation: 'Illinois Firearm Owners Identification Card Act (430 ILCS 65)', description: 'Armed officers must have valid FOID card plus armed registrant license.' },
    ],
    licenseRenewalPeriodMonths: 24,
    firearmQualificationRenewalMonths: 12,
    minimumAge: 18,
    continuingEducationRequired: true,
    continuingEducationHours: 20,
    requiredTrainingHours: 20,
    armedTrainingHours: 0,
    fallbackToManualVerification: false,
    penalCodeScenarios: [],
    civilLiabilityGuidance: [{ scenario: 'Assumption of Duty', riskLevel: 'critical', exposureDescription: 'Illinois follows assumed duty doctrine.', prevention: 'Observe and report only.', approvedLanguage: 'Our role is to observe, deter, and report.', prohibitedLanguage: 'Never guarantee safety outcomes.' }],
  },
  {
    stateCode: 'NC',
    stateName: 'North Carolina',
    regulatoryBody: 'North Carolina Private Protective Services Board',
    regulatoryBodyAcronym: 'NCPPSB',
    portalUrl: 'https://www.ppsb.nc.gov',
    auditorEmailDomain: '@ppsb.nc.gov',
    licenseTypes: [
      { code: 'UNARMED', name: 'Unarmed Security Guard', description: 'Unarmed security officer registration. 16 hours training required before assignment.', armedAllowed: false, trainingHoursRequired: 16, renewalMonths: 12 },
      { code: 'ARMED', name: 'Armed Security Guard', description: 'Armed security officer registration — requires approved firearms training.', armedAllowed: true, renewalMonths: 12 },
    ],
    keyStatutes: [{ citation: 'North Carolina General Statutes Chapter 74C', description: 'Private protective services — security officer licensing' }],
    minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: 'Minimum $300,000 coverage' }],
    uniformRequirement: 'SECURITY and company name required. Must not resemble law enforcement.',
    vehicleMarkingRequirement: 'SECURITY and company name on patrol vehicles.',
    hardBlockRules: [{ rule: 'expired_license', citation: 'NCGS § 74C-8', description: 'License must be current — annual renewal required in NC.' }],
    licenseRenewalPeriodMonths: 12,
    firearmQualificationRenewalMonths: 12,
    minimumAge: 18,
    continuingEducationRequired: false,
    continuingEducationHours: 0,
    requiredTrainingHours: 16,
    armedTrainingHours: 0,
    fallbackToManualVerification: false,
    penalCodeScenarios: [],
    civilLiabilityGuidance: [{ scenario: 'Assumption of Duty', riskLevel: 'critical', exposureDescription: 'North Carolina follows assumed duty doctrine.', prevention: 'Observe and report only.', approvedLanguage: 'Our role is to observe, deter, and report.', prohibitedLanguage: 'Never guarantee safety.' }],
  },
  {
    stateCode: 'VA',
    stateName: 'Virginia',
    regulatoryBody: 'Virginia Department of Criminal Justice Services',
    regulatoryBodyAcronym: 'DCJS-VA',
    portalUrl: 'https://www.dcjs.virginia.gov/private-security',
    auditorEmailDomain: '@dcjs.virginia.gov',
    licenseTypes: [
      { code: 'UNARMED', name: 'Unarmed Security Officer', description: 'Individual registration — 18 hours training required (6 before, 12 within 90 days).', armedAllowed: false, trainingHoursRequired: 18, renewalMonths: 24 },
      { code: 'ARMED', name: 'Armed Security Officer', description: 'Armed individual registration — 15 hours firearms training plus qualification required.', armedAllowed: true, trainingHoursRequired: 15, renewalMonths: 24 },
      { code: 'BUSINESS', name: 'Private Security Business License', description: 'Business license required for all security service companies in Virginia.', armedAllowed: false, renewalMonths: 24 },
    ],
    keyStatutes: [{ citation: 'Code of Virginia § 9.1-138 et seq', description: 'Private Security Services — comprehensive licensing statute' }],
    minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: 'Minimum $300,000 coverage' }],
    uniformRequirement: 'SECURITY and company name required. Cannot resemble law enforcement.',
    vehicleMarkingRequirement: 'Company name and SECURITY required on patrol vehicles.',
    hardBlockRules: [{ rule: 'expired_license', citation: 'Code of Virginia § 9.1-145', description: 'Registration must be current and active.' }],
    licenseRenewalPeriodMonths: 24,
    firearmQualificationRenewalMonths: 12,
    minimumAge: 18,
    continuingEducationRequired: true,
    continuingEducationHours: 8,
    requiredTrainingHours: 18,
    armedTrainingHours: 15,
    fallbackToManualVerification: false,
    penalCodeScenarios: [],
    civilLiabilityGuidance: [{ scenario: 'Assumption of Duty', riskLevel: 'critical', exposureDescription: 'Virginia follows assumed duty doctrine.', prevention: 'Observe and report only.', approvedLanguage: 'Our role is to observe, deter, and report.', prohibitedLanguage: 'Never guarantee safety.' }],
  },
  {
    stateCode: 'WA',
    stateName: 'Washington',
    regulatoryBody: 'Washington State Department of Licensing',
    regulatoryBodyAcronym: 'WA-DOL',
    portalUrl: 'https://dol.wa.gov/business-licensing/professions/security-guard',
    auditorEmailDomain: '@dol.wa.gov',
    licenseTypes: [
      { code: 'UNARMED', name: 'Security Guard License', description: 'Unarmed security officer license — 8 hours training required.', armedAllowed: false, trainingHoursRequired: 8, renewalMonths: 24 },
      { code: 'ARMED', name: 'Armed Security Guard', description: 'Armed security officer license — 8 hours firearms training plus qualification required.', armedAllowed: true, trainingHoursRequired: 8, renewalMonths: 24 },
    ],
    keyStatutes: [{ citation: 'Revised Code of Washington Chapter 18.170', description: 'Security guards — licensing and regulation' }],
    minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 1000000, description: 'Minimum $1,000,000 coverage' }],
    uniformRequirement: 'SECURITY and company name must be clearly visible. Cannot resemble law enforcement.',
    vehicleMarkingRequirement: 'SECURITY and company name required on all patrol vehicles.',
    hardBlockRules: [{ rule: 'expired_license', citation: 'RCW § 18.170.050', description: 'License must be current and active. Annual renewal required.' }],
    licenseRenewalPeriodMonths: 24,
    firearmQualificationRenewalMonths: 12,
    minimumAge: 18,
    continuingEducationRequired: false,
    continuingEducationHours: 0,
    requiredTrainingHours: 8,
    armedTrainingHours: 8,
    fallbackToManualVerification: false,
    penalCodeScenarios: [],
    civilLiabilityGuidance: [{ scenario: 'Assumption of Duty', riskLevel: 'critical', exposureDescription: 'Washington follows assumed duty doctrine.', prevention: 'Observe and report only.', approvedLanguage: 'Our role is to observe, deter, and report.', prohibitedLanguage: 'Never guarantee safety.' }],
  },
  // ── REMAINING STATES — Accurate baseline, fallback for unlicensed details ──
  { stateCode: 'AL', stateName: 'Alabama', regulatoryBody: 'Alabama Security Regulatory Board', regulatoryBodyAcronym: 'ASRB', portalUrl: 'https://www.asrb.alabama.gov', auditorEmailDomain: '@asrb.alabama.gov', licenseTypes: [{ code: 'UNARMED', name: 'Security Officer', description: 'Unarmed security officer license', armedAllowed: false, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Security Officer', description: 'Armed security officer', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'Alabama Code § 34-27C', description: 'Security officer licensing' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum coverage' }], uniformRequirement: 'SECURITY and company name required. No law enforcement resemblance.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'Alabama Code § 34-27C-5', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 8, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [{ scenario: 'Assumption of Duty', riskLevel: 'critical', exposureDescription: 'Alabama follows assumed duty doctrine.', prevention: 'Observe and report only.', approvedLanguage: 'Our role is to observe, deter, and report.', prohibitedLanguage: 'Never guarantee safety.' }] },
  { stateCode: 'AK', stateName: 'Alaska', regulatoryBody: 'Alaska Division of Corporations, Business and Professional Licensing', regulatoryBodyAcronym: 'DCBPL', portalUrl: 'https://www.commerce.alaska.gov/web/cbpl/ProfessionalLicensing/PrivateInvestigatorsSecurityGuards', auditorEmailDomain: '@alaska.gov', licenseTypes: [{ code: 'GUARD', name: 'Security Guard License', description: 'Individual security guard license', armedAllowed: false, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Security Guard', description: 'Armed guard license', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'Alaska Statutes § 18.65.400', description: 'Security guards — licensing requirements' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'AS § 18.65.400', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'AR', stateName: 'Arkansas', regulatoryBody: 'Arkansas Board of Private Investigators and Private Security Agencies', regulatoryBodyAcronym: 'ABPIPSA', portalUrl: 'https://www.abpipsa.arkansas.gov', auditorEmailDomain: '@arkansas.gov', licenseTypes: [{ code: 'GUARD', name: 'Security Guard License', description: 'Individual unarmed security guard', armedAllowed: false, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Guard', description: 'Armed security officer', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'Arkansas Code § 17-40-101', description: 'Private investigators and security guards' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'ACA § 17-40-108', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'CT', stateName: 'Connecticut', regulatoryBody: 'Connecticut Department of Emergency Services and Public Protection', regulatoryBodyAcronym: 'DESPP', portalUrl: 'https://portal.ct.gov/DESPP/Division-of-State-Police/License-Services', auditorEmailDomain: '@ct.gov', licenseTypes: [{ code: 'GUARD', name: 'Security Guard License', description: 'Individual security guard license', armedAllowed: false, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Guard', description: 'Armed security officer — pistol permit required', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'Connecticut General Statutes § 29-152u', description: 'Security service companies — licensing' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 500000, description: '$500,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'CGS § 29-152u', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'DE', stateName: 'Delaware', regulatoryBody: 'Delaware State Police — Explosive Management & Licensing', regulatoryBodyAcronym: 'DSP', portalUrl: 'https://dsp.delaware.gov', auditorEmailDomain: '@delaware.gov', licenseTypes: [{ code: 'GUARD', name: 'Security Guard License', description: 'Individual security guard', armedAllowed: false, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Security Guard', description: 'Armed officer', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'Delaware Code Title 24, Chapter 13', description: 'Private investigators and security agencies' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: '24 Del. C. § 1305', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'DC', stateName: 'District of Columbia', regulatoryBody: 'DC Metropolitan Police Department — Security Officer Management Branch', regulatoryBodyAcronym: 'MPD-SOMB', portalUrl: 'https://mpdc.dc.gov', auditorEmailDomain: '@dc.gov', licenseTypes: [{ code: 'SECURITY', name: 'Security Officer License', description: 'Individual license — 40 hours training required', armedAllowed: false, trainingHoursRequired: 40, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Security Officer', description: 'Armed officer — additional training and firearms qualification', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'DC Code § 47-2839.01', description: 'Security officers — licensing and requirements' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 1000000, description: '$1,000,000 minimum' }], uniformRequirement: 'SECURITY and company name required. Must not resemble MPD.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'DC Code § 47-2839.01', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: true, continuingEducationHours: 8, requiredTrainingHours: 40, armedTrainingHours: 0, fallbackToManualVerification: false, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'HI', stateName: 'Hawaii', regulatoryBody: 'Hawaii Board of Private Detectives and Guards', regulatoryBodyAcronym: 'BPDG', portalUrl: 'https://cca.hawaii.gov/pvl/boards/detective/', auditorEmailDomain: '@hawaii.gov', licenseTypes: [{ code: 'GUARD', name: 'Guard License', description: 'Individual guard license', armedAllowed: false, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Guard', description: 'Armed guard — firearm permit required (very restrictive in HI)', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'Hawaii Revised Statutes § 463', description: 'Private detectives and guards' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'HRS § 463-3', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'ID', stateName: 'Idaho', regulatoryBody: 'Idaho Bureau of Occupational Licenses', regulatoryBodyAcronym: 'IBOL', portalUrl: 'https://ibol.idaho.gov', auditorEmailDomain: '@ibol.idaho.gov', licenseTypes: [{ code: 'GUARD', name: 'Security Officer', description: 'Individual security officer license', armedAllowed: false, renewalMonths: 24 }], keyStatutes: [{ citation: 'Idaho Code § 54-1201', description: 'Private investigators and security guards' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'Idaho Code § 54-1202', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'IN', stateName: 'Indiana', regulatoryBody: 'Indiana Professional Licensing Agency', regulatoryBodyAcronym: 'IPLA', portalUrl: 'https://www.in.gov/pla', auditorEmailDomain: '@pla.in.gov', licenseTypes: [{ code: 'GUARD', name: 'Security Guard', description: 'Individual security guard license', armedAllowed: false, renewalMonths: 24 }], keyStatutes: [{ citation: 'Indiana Code § 25-30-1', description: 'Private investigators and security guards' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'IC § 25-30-1-5', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'IA', stateName: 'Iowa', regulatoryBody: 'Iowa Department of Public Safety', regulatoryBodyAcronym: 'IDPS', portalUrl: 'https://dps.iowa.gov', auditorEmailDomain: '@iowa.gov', licenseTypes: [{ code: 'GUARD', name: 'Private Security Officer', description: 'Individual security officer license — 20 hours training', armedAllowed: false, trainingHoursRequired: 20, renewalMonths: 24 }], keyStatutes: [{ citation: 'Iowa Code § 80A', description: 'Private investigators and private security' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'Iowa Code § 80A.2', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 20, armedTrainingHours: 0, fallbackToManualVerification: false, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'KS', stateName: 'Kansas', regulatoryBody: 'Kansas Attorney General — Private Detective Licensing', regulatoryBodyAcronym: 'KSAG', portalUrl: 'https://ag.ks.gov', auditorEmailDomain: '@ag.ks.gov', licenseTypes: [{ code: 'GUARD', name: 'Security Guard', description: 'Individual security guard', armedAllowed: false, renewalMonths: 24 }], keyStatutes: [{ citation: 'Kansas Statutes Annotated § 75-7b01', description: 'Security guards — licensing requirements' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'KSA § 75-7b02', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'KY', stateName: 'Kentucky', regulatoryBody: 'Kentucky State Police — Private Security Regulatory Section', regulatoryBodyAcronym: 'KSP', portalUrl: 'https://kentuckystatepolice.org', auditorEmailDomain: '@ky.gov', licenseTypes: [{ code: 'GUARD', name: 'Security Officer', description: 'Individual security officer license', armedAllowed: false, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Security Officer', description: 'Armed officer — additional requirements', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'Kentucky Revised Statutes Chapter 329A', description: 'Private security — licensing and regulation' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'KRS § 329A.030', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'LA', stateName: 'Louisiana', regulatoryBody: 'Louisiana State Board of Private Security Examiners', regulatoryBodyAcronym: 'LSBPSE', portalUrl: 'https://www.lsbpse.com', auditorEmailDomain: '@lsbpse.com', licenseTypes: [{ code: 'UNARMED', name: 'Unarmed Security Guard', description: 'Unarmed officer — 8 hours training required', armedAllowed: false, trainingHoursRequired: 8, renewalMonths: 12 }, { code: 'ARMED', name: 'Armed Security Guard', description: 'Armed officer — additional firearms training required', armedAllowed: true, renewalMonths: 12 }], keyStatutes: [{ citation: 'Louisiana Revised Statutes § 37:3271', description: 'Security guards and private investigators' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'LSA-R.S. § 37:3272', description: 'License must be current — annual renewal in LA.' }], licenseRenewalPeriodMonths: 12, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 8, armedTrainingHours: 0, fallbackToManualVerification: false, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'ME', stateName: 'Maine', regulatoryBody: 'Maine Department of Public Safety', regulatoryBodyAcronym: 'MDPS', portalUrl: 'https://www.maine.gov/dps/mgrs', auditorEmailDomain: '@maine.gov', licenseTypes: [{ code: 'GUARD', name: 'Security Guard', description: 'Individual security guard', armedAllowed: false, renewalMonths: 24 }], keyStatutes: [{ citation: 'Maine Revised Statutes Title 32, § 9401', description: 'Security guards — licensing' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: '32 MRS § 9405', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'MD', stateName: 'Maryland', regulatoryBody: 'Maryland State Police — Security Guard Licensing Division', regulatoryBodyAcronym: 'MSP-SGLD', portalUrl: 'https://mdsp.maryland.gov/Organization/Pages/CriminalInvestigationBureau/LicensingDivision', auditorEmailDomain: '@maryland.gov', licenseTypes: [{ code: 'UNARMED', name: 'Security Guard', description: 'Unarmed security guard — 30 hours training', armedAllowed: false, trainingHoursRequired: 30, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Security Guard', description: 'Armed guard — additional 10 hours firearms training', armedAllowed: true, trainingHoursRequired: 10, renewalMonths: 24 }], keyStatutes: [{ citation: 'Maryland Code, Business Occupations and Professions Article § 19-101', description: 'Security guards — licensing requirements' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'MD BOP Art. § 19-314', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 30, armedTrainingHours: 10, fallbackToManualVerification: false, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'MA', stateName: 'Massachusetts', regulatoryBody: 'Massachusetts Department of Public Safety', regulatoryBodyAcronym: 'MA-DPS', portalUrl: 'https://www.mass.gov/orgs/department-of-public-safety', auditorEmailDomain: '@mass.gov', licenseTypes: [{ code: 'UNARMED', name: 'Class B Security Guard', description: 'Unarmed security guard — 18 hours basic training required', armedAllowed: false, trainingHoursRequired: 18, renewalMonths: 12 }, { code: 'ARMED', name: 'Class A Armed Guard', description: 'Armed guard — Class B plus firearms training and LTC (License to Carry) required', armedAllowed: true, renewalMonths: 12 }], keyStatutes: [{ citation: 'Massachusetts General Laws Chapter 147, § 22B', description: 'Security guards — licensing and training requirements' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 500000, description: '$500,000 minimum' }], uniformRequirement: 'SECURITY and company name required. Must not resemble police.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'MGL c. 147, § 22B', description: 'License must be current — annual renewal in MA.' }], licenseRenewalPeriodMonths: 12, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 18, armedTrainingHours: 0, fallbackToManualVerification: false, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'MI', stateName: 'Michigan', regulatoryBody: 'Michigan Department of State Police — Private Security Guard Section', regulatoryBodyAcronym: 'MSP-PSG', portalUrl: 'https://www.michigan.gov/msp/divisions/crd/psg', auditorEmailDomain: '@michigan.gov', licenseTypes: [{ code: 'GUARD', name: 'Security Guard', description: 'Individual security guard license — state license required plus employer license', armedAllowed: false, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Security Guard', description: 'Armed guard — CPL (Concealed Pistol License) required', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'Michigan Compiled Laws § 338.1051', description: 'Security guard business act' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'MCL § 338.1065', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: false, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'MN', stateName: 'Minnesota', regulatoryBody: 'Minnesota Board of Private Detective and Protective Agent Services', regulatoryBodyAcronym: 'MNBPDPAS', portalUrl: 'https://pabs.mn.gov', auditorEmailDomain: '@state.mn.us', licenseTypes: [{ code: 'PROTECTIVE', name: 'Protective Agent', description: 'Individual protective agent license — unarmed', armedAllowed: false, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Protective Agent', description: 'Armed protective agent', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'Minnesota Statutes § 326.3381', description: 'Protective agents — licensing' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'Minn. Stat. § 326.3381', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'MS', stateName: 'Mississippi', regulatoryBody: 'Mississippi Department of Public Safety — Private Protective Services', regulatoryBodyAcronym: 'MDPS-PPS', portalUrl: 'https://www.dps.state.ms.us', auditorEmailDomain: '@dps.ms.gov', licenseTypes: [{ code: 'GUARD', name: 'Security Guard', description: 'Individual security officer license', armedAllowed: false, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Security Guard', description: 'Armed security officer', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'Mississippi Code § 73-52', description: 'Private security agencies' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'Miss. Code § 73-52-5', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'MO', stateName: 'Missouri', regulatoryBody: 'Missouri Division of Professional Registration', regulatoryBodyAcronym: 'MODPR', portalUrl: 'https://pr.mo.gov', auditorEmailDomain: '@pr.mo.gov', licenseTypes: [{ code: 'GUARD', name: 'Security Guard', description: 'Individual security guard — minimal state requirements, employer training emphasized', armedAllowed: false, renewalMonths: 24 }], keyStatutes: [{ citation: 'Missouri Revised Statutes § 494.050', description: 'Private security agencies' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'RSMo § 494.050', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'MT', stateName: 'Montana', regulatoryBody: 'Montana Department of Labor and Industry', regulatoryBodyAcronym: 'MTDLI', portalUrl: 'https://boards.bsd.dli.mt.gov', auditorEmailDomain: '@mt.gov', licenseTypes: [{ code: 'GUARD', name: 'Security Guard', description: 'Individual security guard license', armedAllowed: false, renewalMonths: 24 }], keyStatutes: [{ citation: 'Montana Code Annotated § 37-60', description: 'Private investigators and security guards' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'MCA § 37-60-301', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'NE', stateName: 'Nebraska', regulatoryBody: 'Nebraska Private Detective Licensing Board', regulatoryBodyAcronym: 'NPDLB', portalUrl: 'https://pdlb.nebraska.gov', auditorEmailDomain: '@nebraska.gov', licenseTypes: [{ code: 'GUARD', name: 'Security Guard', description: 'Individual security guard license', armedAllowed: false, renewalMonths: 24 }], keyStatutes: [{ citation: 'Nebraska Revised Statutes § 20-901', description: 'Security guards — licensing requirements' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'Neb. Rev. Stat. § 20-901', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'NH', stateName: 'New Hampshire', regulatoryBody: 'New Hampshire State Police', regulatoryBodyAcronym: 'NHSP', portalUrl: 'https://www.nh.gov/safety/divisions/nhsp', auditorEmailDomain: '@dos.nh.gov', licenseTypes: [{ code: 'GUARD', name: 'Security Guard', description: 'Individual security guard', armedAllowed: false, renewalMonths: 24 }], keyStatutes: [{ citation: 'New Hampshire Revised Statutes Annotated § 106-F', description: 'Security guards' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'RSA § 106-F:2', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'NJ', stateName: 'New Jersey', regulatoryBody: 'New Jersey State Police — Private Detective Unit', regulatoryBodyAcronym: 'NJSP-PDU', portalUrl: 'https://www.njsp.org/division/operations/private-detective-unit.shtml', auditorEmailDomain: '@njsp.org', licenseTypes: [{ code: 'GUARD', name: 'Security Guard', description: 'Individual security officer — 24 hours training required', armedAllowed: false, trainingHoursRequired: 24, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Guard', description: 'Armed guard — firearms identification card and training required', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'New Jersey Statutes § 45:19A-1', description: 'Security officer training act' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 500000, description: '$500,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'NJSA § 45:19A-6', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 24, armedTrainingHours: 0, fallbackToManualVerification: false, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'NM', stateName: 'New Mexico', regulatoryBody: 'New Mexico Department of Public Safety — Private Investigations Advisory Board', regulatoryBodyAcronym: 'NMDPS-PIAB', portalUrl: 'https://www.dps.nm.gov', auditorEmailDomain: '@dps.nm.gov', licenseTypes: [{ code: 'GUARD', name: 'Security Guard', description: 'Individual security guard license', armedAllowed: false, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Security Guard', description: 'Armed guard — CCW permit required', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'New Mexico Statutes § 61-27B', description: 'Private investigators and security guard act' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'NMSA § 61-27B-10', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'ND', stateName: 'North Dakota', regulatoryBody: 'North Dakota Private Investigation and Security Board', regulatoryBodyAcronym: 'NDPISB', portalUrl: 'https://www.nd.gov/pisb', auditorEmailDomain: '@nd.gov', licenseTypes: [{ code: 'GUARD', name: 'Security Guard', description: 'Individual security guard license', armedAllowed: false, renewalMonths: 24 }], keyStatutes: [{ citation: 'North Dakota Century Code § 43-30', description: 'Private investigators and security guards' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'NDCC § 43-30-05', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'OH', stateName: 'Ohio', regulatoryBody: 'Ohio Investigator and Security Guard Services Board', regulatoryBodyAcronym: 'OISGSB', portalUrl: 'https://www.cos.ohio.gov/Portals/0/Divisions/EqualOpportunity/PVSG', auditorEmailDomain: '@oisgsb.ohio.gov', licenseTypes: [{ code: 'UNARMED', name: 'Unarmed Security Guard', description: 'Unarmed individual license — 24 hours training', armedAllowed: false, trainingHoursRequired: 24, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Security Guard', description: 'Armed guard — additional training and CCW required', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'Ohio Revised Code § 4749', description: 'Private investigators and security guards' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'ORC § 4749.03', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 24, armedTrainingHours: 0, fallbackToManualVerification: false, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'OK', stateName: 'Oklahoma', regulatoryBody: 'Council on Law Enforcement Education and Training (CLEET)', regulatoryBodyAcronym: 'CLEET', portalUrl: 'https://www.ok.gov/cleet', auditorEmailDomain: '@cleet.ok.gov', licenseTypes: [{ code: 'UNARMED', name: 'Unarmed Security Guard', description: 'Unarmed security officer — 8 hours training required through CLEET', armedAllowed: false, trainingHoursRequired: 8, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Security Guard', description: 'Armed guard — CLEET armed guard training required', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'Oklahoma Statutes Title 59, § 1750.1', description: 'Security guard licensing — CLEET regulation' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: '59 OS § 1750.7', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 8, armedTrainingHours: 0, fallbackToManualVerification: false, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'OR', stateName: 'Oregon', regulatoryBody: 'Oregon Department of Public Safety Standards and Training', regulatoryBodyAcronym: 'DPSST', portalUrl: 'https://www.oregon.gov/DPSST/Pages/index.aspx', auditorEmailDomain: '@oregon.gov', licenseTypes: [{ code: 'UNARMED', name: 'Private Security Professional (Unarmed)', description: 'Unarmed security professional — 14 hours training before assignment', armedAllowed: false, trainingHoursRequired: 14, renewalMonths: 24 }, { code: 'ARMED', name: 'Private Security Professional (Armed)', description: 'Armed security professional — additional firearms training and CHL required', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'Oregon Revised Statutes § 181A.830', description: 'Private security providers — DPSST licensing' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'ORS § 181A.830', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: true, continuingEducationHours: 14, requiredTrainingHours: 14, armedTrainingHours: 0, fallbackToManualVerification: false, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'PA', stateName: 'Pennsylvania', regulatoryBody: 'Pennsylvania State Police — Private Detective Division', regulatoryBodyAcronym: 'PSP-PDD', portalUrl: 'https://www.psp.pa.gov/licensing/Pages/Private-Detective.aspx', auditorEmailDomain: '@pa.gov', licenseTypes: [{ code: 'WATCHMAN', name: 'Watchman/Security Guard', description: 'Individual watchman license — minimal state requirements', armedAllowed: false, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Security Guard', description: 'Armed guard — License to Carry Firearms (LTCF) required', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'Pennsylvania Statutes Title 22, § 41', description: 'Detectives and detective agencies — security companies' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: '22 P.S. § 41', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'RI', stateName: 'Rhode Island', regulatoryBody: 'Rhode Island Department of Business Regulation', regulatoryBodyAcronym: 'RIDBR', portalUrl: 'https://dbr.ri.gov', auditorEmailDomain: '@dbr.ri.gov', licenseTypes: [{ code: 'GUARD', name: 'Security Guard', description: 'Individual security guard license', armedAllowed: false, renewalMonths: 24 }], keyStatutes: [{ citation: 'Rhode Island General Laws § 5-5.1', description: 'Private security — licensing requirements' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'RIGL § 5-5.1-3', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'SC', stateName: 'South Carolina', regulatoryBody: 'South Carolina Law Enforcement Division — Private Security', regulatoryBodyAcronym: 'SLED-PS', portalUrl: 'https://www.sled.sc.gov/PritSecurity.aspx', auditorEmailDomain: '@sled.sc.gov', licenseTypes: [{ code: 'UNARMED', name: 'Unarmed Security Guard', description: 'Unarmed security guard license', armedAllowed: false, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Security Guard', description: 'Armed guard license — SLED training required', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'South Carolina Code § 40-18', description: 'Private detective and security service licensing' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'SC Code § 40-18-20', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: false, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'SD', stateName: 'South Dakota', regulatoryBody: 'South Dakota Secretary of State', regulatoryBodyAcronym: 'SDSOS', portalUrl: 'https://sdsos.gov', auditorEmailDomain: '@state.sd.us', licenseTypes: [{ code: 'GUARD', name: 'Security Guard', description: 'Individual security guard — minimal state regulation, employer training', armedAllowed: false, renewalMonths: 24 }], keyStatutes: [{ citation: 'South Dakota Codified Laws § 36-26', description: 'Private investigators and security guards' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'SDCL § 36-26-5', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'TN', stateName: 'Tennessee', regulatoryBody: 'Tennessee Department of Commerce and Insurance — Regulatory Boards', regulatoryBodyAcronym: 'TDCI-RB', portalUrl: 'https://www.tn.gov/commerce/regulatory-boards/alarm-contractors.html', auditorEmailDomain: '@tn.gov', licenseTypes: [{ code: 'UNARMED', name: 'Unarmed Security Guard', description: 'Unarmed guard license — 16 hours training', armedAllowed: false, trainingHoursRequired: 16, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Security Guard', description: 'Armed guard — additional training and HCP (Handgun Carry Permit) required', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'Tennessee Code § 62-35', description: 'Private investigators, guards, and electronic security' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'TCA § 62-35-106', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 16, armedTrainingHours: 0, fallbackToManualVerification: false, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'UT', stateName: 'Utah', regulatoryBody: 'Utah Division of Professional Licensing', regulatoryBodyAcronym: 'UDOPL', portalUrl: 'https://dopl.utah.gov', auditorEmailDomain: '@utah.gov', licenseTypes: [{ code: 'GUARD', name: 'Security Personnel', description: 'Individual security personnel license', armedAllowed: false, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Security Personnel', description: 'Armed guard — concealed firearm permit required', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'Utah Code § 58-63', description: 'Security personnel licensing act' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'Utah Code § 58-63-302', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: false, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'VT', stateName: 'Vermont', regulatoryBody: 'Vermont Secretary of State — Office of Professional Regulation', regulatoryBodyAcronym: 'VT-OPR', portalUrl: 'https://www.sec.state.vt.us/professional-regulation', auditorEmailDomain: '@sec.state.vt.us', licenseTypes: [{ code: 'GUARD', name: 'Security Guard', description: 'Individual security guard — minimal state requirements', armedAllowed: false, renewalMonths: 24 }], keyStatutes: [{ citation: 'Vermont Statutes Title 26, § 3171', description: 'Private detectives and security services' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: '26 VSA § 3171', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'WV', stateName: 'West Virginia', regulatoryBody: 'West Virginia Department of Military Affairs and Public Safety', regulatoryBodyAcronym: 'WVDMAPS', portalUrl: 'https://psc.wv.gov', auditorEmailDomain: '@wv.gov', licenseTypes: [{ code: 'GUARD', name: 'Security Guard', description: 'Individual security guard license', armedAllowed: false, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Guard', description: 'Armed security guard', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'West Virginia Code § 30-18', description: 'Private investigators and security guards' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'WVC § 30-18-3', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'WI', stateName: 'Wisconsin', regulatoryBody: 'Wisconsin Department of Safety and Professional Services', regulatoryBodyAcronym: 'WDSPS', portalUrl: 'https://dsps.wi.gov', auditorEmailDomain: '@wisconsin.gov', licenseTypes: [{ code: 'UNARMED', name: 'Security Person', description: 'Individual security person license — 8 hours pre-employment training', armedAllowed: false, trainingHoursRequired: 8, renewalMonths: 24 }, { code: 'ARMED', name: 'Armed Security Person', description: 'Armed security person — CCW permit plus training required', armedAllowed: true, renewalMonths: 24 }], keyStatutes: [{ citation: 'Wisconsin Statutes § 440.26', description: 'Security person permits and security exemptions' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'Wis. Stat. § 440.26(3)', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 8, armedTrainingHours: 0, fallbackToManualVerification: false, penalCodeScenarios: [], civilLiabilityGuidance: [] },
  { stateCode: 'WY', stateName: 'Wyoming', regulatoryBody: 'Wyoming Attorney General — Criminal Investigation Division', regulatoryBodyAcronym: 'WYAG-CID', portalUrl: 'https://ag.wyo.gov', auditorEmailDomain: '@wyo.gov', licenseTypes: [{ code: 'GUARD', name: 'Security Guard', description: 'Individual security guard — employer-based training', armedAllowed: false, renewalMonths: 24 }], keyStatutes: [{ citation: 'Wyoming Statutes § 33-29', description: 'Private investigators and security guards' }], minimumInsuranceCoverage: [{ type: 'general_liability', minimumAmount: 300000, description: '$300,000 minimum' }], uniformRequirement: 'SECURITY and company name required.', vehicleMarkingRequirement: 'SECURITY and company name required.', hardBlockRules: [{ rule: 'expired_license', citation: 'WS § 33-29-102', description: 'License must be current.' }], licenseRenewalPeriodMonths: 24, firearmQualificationRenewalMonths: 12, minimumAge: 18, continuingEducationRequired: false, continuingEducationHours: 0, requiredTrainingHours: 0, armedTrainingHours: 0, fallbackToManualVerification: true, penalCodeScenarios: [], civilLiabilityGuidance: [] },
];

export async function seedStateKnowledgeBase(): Promise<void> {
  log.info('[StateKnowledgeBase] Seeding state regulatory knowledge base...');

  for (const state of STATE_REGULATORY_KNOWLEDGE) {
    const [existing] = await db.select({ id: complianceStates.id })
      .from(complianceStates)
      .where(eq(complianceStates.stateCode, state.stateCode))
      .limit(1);

    const data = {
      stateCode: state.stateCode,
      stateName: state.stateName,
      regulatoryBody: state.regulatoryBody,
      regulatoryBodyAcronym: state.regulatoryBodyAcronym,
      portalUrl: state.portalUrl,
      auditorEmailDomain: state.auditorEmailDomain,
      licenseTypes: state.licenseTypes as any,
      keyStatutes: state.keyStatutes as any,
      minimumInsuranceCoverage: state.minimumInsuranceCoverage as any,
      uniformRequirement: state.uniformRequirement,
      vehicleMarkingRequirement: state.vehicleMarkingRequirement,
      hardBlockRules: state.hardBlockRules as any,
      licenseRenewalPeriodMonths: state.licenseRenewalPeriodMonths,
      firearmQualificationRenewalMonths: state.firearmQualificationRenewalMonths,
      minimumAge: state.minimumAge,
      continuingEducationRequired: state.continuingEducationRequired,
      continuingEducationHours: state.continuingEducationHours,
      requiredTrainingHours: state.requiredTrainingHours,
      armedTrainingHours: state.armedTrainingHours,
      fallbackToManualVerification: state.fallbackToManualVerification,
      status: 'active' as const,
    };

    if (existing) {
      await db.update(complianceStates).set(data).where(eq(complianceStates.stateCode, state.stateCode));
    } else {
      await db.insert(complianceStates).values(data);
    }
    log.info(`[StateKnowledgeBase] Seeded ${state.stateCode} — ${state.stateName}`);
  }

  log.info(`[StateKnowledgeBase] Done — ${STATE_REGULATORY_KNOWLEDGE.length} states seeded.`);
}

export async function getStateConfig(stateCode: string): Promise<StateRegulatoryConfig | null> {
  const [row] = await db.select().from(complianceStates)
    .where(eq(complianceStates.stateCode, stateCode.toUpperCase())).limit(1);

  if (!row) {
    const staticConfig = STATE_REGULATORY_KNOWLEDGE.find(s => s.stateCode === stateCode.toUpperCase());
    return staticConfig || null;
  }

  return {
    stateCode: row.stateCode,
    stateName: row.stateName,
    regulatoryBody: row.regulatoryBody,
    regulatoryBodyAcronym: row.regulatoryBodyAcronym ?? '',
    portalUrl: row.portalUrl ?? '',
    auditorEmailDomain: (row as any).auditorEmailDomain ?? '',
    licenseTypes: ((row as any).licenseTypes as any[]) ?? [],
    keyStatutes: ((row as any).keyStatutes as any[]) ?? [],
    minimumInsuranceCoverage: ((row as any).minimumInsuranceCoverage as any[]) ?? [],
    uniformRequirement: (row as any).uniformRequirement ?? '',
    vehicleMarkingRequirement: (row as any).vehicleMarkingRequirement ?? '',
    hardBlockRules: ((row as any).hardBlockRules as any[]) ?? [],
    licenseRenewalPeriodMonths: row.licenseRenewalPeriodMonths ?? 24,
    firearmQualificationRenewalMonths: row.firearmQualificationRenewalMonths ?? 12,
    minimumAge: row.minimumAge ?? 18,
    continuingEducationRequired: row.continuingEducationRequired ?? false,
    continuingEducationHours: row.continuingEducationHours ?? 0,
    requiredTrainingHours: row.requiredTrainingHours ?? 0,
    armedTrainingHours: row.armedTrainingHours ?? 0,
    fallbackToManualVerification: row.fallbackToManualVerification ?? true,
    penalCodeScenarios: (STATE_REGULATORY_KNOWLEDGE.find(s => s.stateCode === row.stateCode)?.penalCodeScenarios) ?? [],
    civilLiabilityGuidance: (STATE_REGULATORY_KNOWLEDGE.find(s => s.stateCode === row.stateCode)?.civilLiabilityGuidance) ?? [],
    licenseApplicationProcess: STATE_REGULATORY_KNOWLEDGE.find(s => s.stateCode === row.stateCode)?.licenseApplicationProcess,
    topsPortalNotes: STATE_REGULATORY_KNOWLEDGE.find(s => s.stateCode === row.stateCode)?.topsPortalNotes,
  };
}

export function getStateConfigStatic(stateCode: string): StateRegulatoryConfig | null {
  return STATE_REGULATORY_KNOWLEDGE.find(s => s.stateCode === stateCode.toUpperCase()) || null;
}

/**
 * Verify that an auditor's email domain matches the expected regulatory body domain for the state.
 * Used by the regulatory portal to validate that audit requests come from legitimate state agency emails.
 *
 * @param auditorEmail - The email address of the auditor requesting access
 * @param stateCode - The two-letter state code (e.g., 'TX', 'CA')
 * @returns true if the email domain matches the expected state regulatory body domain; false otherwise.
 *          Returns false (not verified) if the state config is not found — callers should treat this
 *          as "unverified" and may allow manual verification as a fallback.
 */
export function verifyAuditorEmailDomain(auditorEmail: string, stateCode: string): boolean {
  if (!auditorEmail || !stateCode) return false;

  const config = getStateConfigStatic(stateCode);
  if (!config) return false;

  const expectedDomain = config.auditorEmailDomain?.toLowerCase();
  if (!expectedDomain) return false;

  const emailLower = auditorEmail.toLowerCase().trim();
  return emailLower.endsWith(expectedDomain);
}
