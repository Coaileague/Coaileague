/**
 * Trinity Workforce Protocol Service
 * =====================================
 * Enforces the legal, ethical, and procedural distinction between CONTRACTORS
 * and EMPLOYEES across all Trinity workforce operations.
 *
 * Core rules:
 * - CONTRACTORS: Follow CLIENT SOP only. Not "fired" — "removed from service."
 *   No progressive discipline. Removal can be immediate and is not a termination.
 * - EMPLOYEES (W2): Follow BOTH company handbook AND client SOP. Progressive
 *   discipline. 3 documented issues within a 6-month rolling window trigger
 *   termination review. Critical violations (law breach, safety, ethics) allow
 *   immediate termination.
 *
 * All language guidance is designed to:
 * - Minimize wrongful termination / wrongful removal exposure
 * - Respect mental health and dignity
 * - Comply with applicable state and federal law
 * - Never assume duty or make promises that create liability
 */

import { db } from '../../db';
import { employees, disciplinaryRecords, employeeDocuments } from '@shared/schema';
import { eq, and, gte, count, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { typedQuery } from '../../lib/typedSql';

export type WorkerType = 'employee' | 'contractor';

export interface DisciplinaryThresholdResult {
  employeeId: string;
  workerType: WorkerType;
  issueCountInWindow: number;
  windowMonths: number;
  thresholdReached: boolean;
  thresholdCount: number;
  oldestIssueDate?: Date;
  newestIssueDate?: Date;
  recommendation: string;
  requiredAction: string;
  approvedLanguage: string;
}

export interface WorkerTypeProtocol {
  workerType: WorkerType;
  separationTerminology: {
    actionLabel: string;
    documentLabel: string;
    letterHeader: string;
  };
  governingDocuments: {
    mustFollowHandbook: boolean;
    mustFollowClientSOP: boolean;
    handbookNote: string;
    sopNote: string;
  };
  disciplineFramework: {
    hasProgressiveDiscipline: boolean;
    steps: string[];
    windowMonths: number;
    thresholdCount: number;
    criticalViolationImmediate: boolean;
  };
  approvedSeparationLanguage: {
    forCause: string;
    noFault: string;
    performance: string;
    criticalViolation: string;
  };
  prohibitedSeparationLanguage: string[];
  taxClassification: 'W2' | '1099-NEC';
  benefitsEligible: boolean;
  handledByPayroll: boolean;
  handledByAccountsPayable: boolean;
}

export interface HandbookSOPContext {
  hasHandbook: boolean;
  hasSOP: boolean;
  handbookSections: string[];
  sopSections: string[];
  applicableToWorkerType: WorkerType;
  complianceNotes: string;
}

export interface GuidanceForSituation {
  situation: string;
  workerType: WorkerType;
  stateCode: string;
  recommendedApproach: string;
  approvedLanguage: string;
  prohibitedLanguage: string;
  requiredDocumentation: string[];
  escalationRequired: boolean;
  legalNote: string;
}

// ── Core protocol definitions ──

const CONTRACTOR_PROTOCOL: WorkerTypeProtocol = {
  workerType: 'contractor',
  separationTerminology: {
    actionLabel: 'Removal from Service / Assignment Termination',
    documentLabel: 'Service Termination Notice',
    letterHeader: 'Notice of Service Assignment Termination',
  },
  governingDocuments: {
    mustFollowHandbook: false,
    mustFollowClientSOP: true,
    handbookNote: 'Contractors are NOT required to follow the company employee handbook. They are independent professionals. Handbook policies do not apply to contractors.',
    sopNote: 'Contractors MUST follow the client\'s site-specific Standard Operating Procedures (SOP) for each assignment. SOPs govern conduct on the client\'s premises during the engagement.',
  },
  disciplineFramework: {
    hasProgressiveDiscipline: false,
    steps: ['Service engagement may be ended at any time per the contractor agreement terms.'],
    windowMonths: 0,
    thresholdCount: 0,
    criticalViolationImmediate: true,
  },
  approvedSeparationLanguage: {
    forCause: 'We are ending your service engagement effective [DATE]. Your service agreement is being terminated based on [SPECIFIC REASON — SOP violation, client request, safety concern, etc.]. You will receive payment for all services rendered through [DATE] per your agreement terms.',
    noFault: 'We are concluding this service engagement effective [DATE]. This decision reflects current operational needs and is not a reflection of the quality of your work. Payment for all services rendered through [DATE] will be processed per your agreement.',
    performance: 'We are ending your assignment effective [DATE] due to performance concerns related to [SPECIFIC ISSUE]. This is a business decision based on the requirements of this engagement.',
    criticalViolation: 'Your service assignment is being terminated immediately effective today. A serious violation of the site SOP or applicable law has occurred that makes continuation of this assignment untenable. Payment for services rendered through today will be processed.',
  },
  prohibitedSeparationLanguage: [
    'You are fired.',
    'You are terminated.',
    'Your employment is ended.',
    'We are letting you go from your job.',
    'You are being laid off.',
    'You are being dismissed from employment.',
    'This is a termination of employment.',
  ],
  taxClassification: '1099-NEC',
  benefitsEligible: false,
  handledByPayroll: false,
  handledByAccountsPayable: true,
};

const EMPLOYEE_PROTOCOL: WorkerTypeProtocol = {
  workerType: 'employee',
  separationTerminology: {
    actionLabel: 'Employment Termination',
    documentLabel: 'Notice of Employment Termination',
    letterHeader: 'Notice of Termination of Employment',
  },
  governingDocuments: {
    mustFollowHandbook: true,
    mustFollowClientSOP: true,
    handbookNote: 'Employees are required to follow the company employee handbook at all times. Handbook violations are subject to progressive discipline.',
    sopNote: 'Employees must also follow client site-specific SOPs during any assignment. Client SOP violations may result in removal from a specific site and/or disciplinary action.',
  },
  disciplineFramework: {
    hasProgressiveDiscipline: true,
    steps: [
      'Step 1: Verbal Warning — documented in writing in employee record.',
      'Step 2: First Written Warning — signed acknowledgment required from employee.',
      'Step 3: Second Written Warning or Performance Improvement Plan (PIP) — mandatory acknowledgment and correction plan.',
      'Step 4: Final Written Warning or Suspension — with or without pay depending on severity.',
      'Step 5: Termination of Employment — for repeat offenses or failure to meet PIP requirements.',
    ],
    windowMonths: 6,
    thresholdCount: 3,
    criticalViolationImmediate: true,
  },
  approvedSeparationLanguage: {
    forCause: 'Your employment with [COMPANY NAME] is terminated effective [DATE]. This decision is based on [SPECIFIC DOCUMENTED REASON(S) from disciplinary records]. You will receive your final paycheck covering all wages earned through your last day of work in accordance with [STATE] law. Please return all company property immediately.',
    noFault: 'Your employment with [COMPANY NAME] is being terminated effective [DATE] due to [operational restructuring / position elimination / lack of work]. This is not a reflection of your job performance. You will receive your final paycheck covering all earned wages through [DATE] per [STATE] law.',
    performance: 'Following the progressive discipline process, including [verbal warning on DATE / written warning on DATE / PIP initiated on DATE], we have determined that the required performance standards have not been met. Your employment is terminated effective [DATE].',
    criticalViolation: 'Due to a critical violation of [company policy / applicable law / safety protocols] that occurred on [DATE], your employment is terminated effective immediately. This decision bypasses the standard progressive discipline process due to the severity of the violation. Your final paycheck will be provided in accordance with [STATE] law.',
  },
  prohibitedSeparationLanguage: [
    'We are just letting you go — do not say this without documentation.',
    'You are a bad fit — must reference specific performance issues instead.',
    'Nobody likes working with you — this is subjective and legally risky.',
    'We have to cut costs — if not a true layoff, this creates misrepresentation risk.',
    'You should have known better — accusatory without specific policy citation.',
  ],
  taxClassification: 'W2',
  benefitsEligible: true,
  handledByPayroll: true,
  handledByAccountsPayable: false,
};

class TrinityWorkforceProtocolService {

  getWorkerTypeProtocol(workerType: WorkerType): WorkerTypeProtocol {
    return workerType === 'contractor' ? CONTRACTOR_PROTOCOL : EMPLOYEE_PROTOCOL;
  }

  async checkDisciplinaryThreshold(
    workspaceId: string,
    employeeId: string
  ): Promise<DisciplinaryThresholdResult> {
    // Get employee's worker type
    const [emp] = await db.select({
      id: employees.id,
      workerType: employees.workerType,
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
      .limit(1);

    if (!emp) {
      return {
        employeeId,
        workerType: 'employee',
        issueCountInWindow: 0,
        windowMonths: 6,
        thresholdReached: false,
        thresholdCount: 3,
        recommendation: 'Employee record not found.',
        requiredAction: 'Verify employee ID.',
        approvedLanguage: '',
      };
    }

    const workerType = (emp.workerType === 'contractor' ? 'contractor' : 'employee') as WorkerType;
    const protocol = this.getWorkerTypeProtocol(workerType);

    if (workerType === 'contractor') {
      return {
        employeeId,
        workerType: 'contractor',
        issueCountInWindow: 0,
        windowMonths: 0,
        thresholdReached: false,
        thresholdCount: 0,
        recommendation: 'Contractors do not have a progressive discipline framework. Service engagement may be ended per contractor agreement terms.',
        requiredAction: 'Review contractor agreement for termination provisions. Use approved service termination language.',
        approvedLanguage: CONTRACTOR_PROTOCOL.approvedSeparationLanguage.noFault,
      };
    }

    const windowStart = new Date();
    windowStart.setMonth(windowStart.getMonth() - protocol.disciplineFramework.windowMonths);

    const records = await db.select({
      id: disciplinaryRecords.id,
      type: disciplinaryRecords.type,
      issuedAt: disciplinaryRecords.issuedAt,
    })
      .from(disciplinaryRecords)
      .where(and(
        eq(disciplinaryRecords.employeeId, employeeId),
        eq(disciplinaryRecords.workspaceId, workspaceId),
        gte(disciplinaryRecords.issuedAt, windowStart),
      ));

    const issueCount = records.length;
    const thresholdReached = issueCount >= protocol.disciplineFramework.thresholdCount;

    const dates = records.map(r => r.issuedAt).filter(Boolean) as Date[];
    const oldestIssueDate = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : undefined;
    const newestIssueDate = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : undefined;

    let recommendation: string;
    let requiredAction: string;
    let approvedLanguage: string;

    if (thresholdReached) {
      recommendation = `THRESHOLD REACHED: ${issueCount} documented issues within the ${protocol.disciplineFramework.windowMonths}-month rolling window (threshold: ${protocol.disciplineFramework.thresholdCount}). Termination review is required.`;
      requiredAction = 'HR review required before proceeding. Schedule termination meeting. Prepare final paycheck per state law. Collect company property. Provide benefits information (COBRA if applicable).';
      approvedLanguage = EMPLOYEE_PROTOCOL.approvedSeparationLanguage.performance;
    } else if (issueCount === protocol.disciplineFramework.thresholdCount - 1) {
      recommendation = `WARNING: ${issueCount} issues in ${protocol.disciplineFramework.windowMonths}-month window. One more issue will trigger termination review threshold.`;
      requiredAction = `Issue ${this.getNextDisciplinaryStep(issueCount)} and clearly communicate that further violations within this window will result in termination review.`;
      approvedLanguage = `This is a formal ${this.getNextDisciplinaryStep(issueCount)} regarding [SPECIFIC ISSUE]. You should be aware that you have received ${issueCount} documented warnings within the past ${protocol.disciplineFramework.windowMonths} months. Further violations may result in termination of employment.`;
    } else if (issueCount > 0) {
      recommendation = `${issueCount} issue(s) documented in current ${protocol.disciplineFramework.windowMonths}-month window. Continue progressive discipline as appropriate.`;
      requiredAction = `Issue ${this.getNextDisciplinaryStep(issueCount)} per progressive discipline policy.`;
      approvedLanguage = `This ${this.getNextDisciplinaryStep(issueCount)} is being issued regarding [SPECIFIC ISSUE on SPECIFIC DATE]. Please review the attached documentation. Your signature below acknowledges receipt, not necessarily agreement.`;
    } else {
      recommendation = 'No documented issues in current rolling window. Progressive discipline framework has not been initiated.';
      requiredAction = 'Issue verbal warning (documented) for first offense. Ensure all future disciplinary actions are documented promptly.';
      approvedLanguage = EMPLOYEE_PROTOCOL.approvedSeparationLanguage.forCause;
    }

    return {
      employeeId,
      workerType,
      issueCountInWindow: issueCount,
      windowMonths: protocol.disciplineFramework.windowMonths,
      thresholdReached,
      thresholdCount: protocol.disciplineFramework.thresholdCount,
      oldestIssueDate,
      newestIssueDate,
      recommendation,
      requiredAction,
      approvedLanguage,
    };
  }

  private getNextDisciplinaryStep(currentIssueCount: number): string {
    if (currentIssueCount === 0) return 'Verbal Warning (documented in writing)';
    if (currentIssueCount === 1) return 'First Written Warning';
    if (currentIssueCount === 2) return 'Second Written Warning or Performance Improvement Plan (PIP)';
    return 'Final Written Warning or Suspension';
  }

  getGuidanceForSituation(
    situation: 'policy_violation' | 'law_violation' | 'performance_issue' | 'safety_concern' | 'mental_health_concern' | 'client_complaint' | 'client_sop_violation' | 'no_longer_needed',
    workerType: WorkerType,
    stateCode: string = 'TX',
    severity: 'minor' | 'moderate' | 'critical' = 'moderate'
  ): GuidanceForSituation {
    const protocol = this.getWorkerTypeProtocol(workerType);

    const guidanceMap: Record<string, Omit<GuidanceForSituation, 'workerType' | 'stateCode'>> = {
      law_violation: {
        situation: 'Violation of Applicable Law',
        recommendedApproach: workerType === 'contractor'
          ? 'Immediately end service assignment. Document the specific violation. No progressive discipline framework applies to contractors.'
          : 'This is a critical violation. Bypass progressive discipline. Document the violation with specifics. Terminate employment. Consult legal counsel before acting if criminal matter is involved.',
        approvedLanguage: workerType === 'contractor'
          ? protocol.approvedSeparationLanguage.criticalViolation
          : EMPLOYEE_PROTOCOL.approvedSeparationLanguage.criticalViolation,
        prohibitedLanguage: 'Never say "we will overlook this one time" for law violations. Never fail to document. Never allow continued work after discovered law violation.',
        requiredDocumentation: ['Written incident report with specific law citation', 'Witness statements if applicable', 'Time/date/location of violation', 'Service termination notice or employee termination notice'],
        escalationRequired: true,
        legalNote: `In ${stateCode}: law violations by security personnel may trigger mandatory reporting requirements. Consult legal counsel. Document everything. Do not make any statements that could be construed as admissions by the company.`,
      },
      safety_concern: {
        situation: 'Safety Concern / Unsafe Conduct',
        recommendedApproach: workerType === 'contractor'
          ? 'Remove from assignment immediately pending safety review. End engagement if safety standard not met.'
          : 'Remove from post immediately. Investigate. If critical safety violation, bypass progressive discipline. If first offense, issue written warning and corrective action plan.',
        approvedLanguage: workerType === 'contractor'
          ? 'Your assignment is being suspended effective immediately pending a safety review. We take safety concerns very seriously and cannot continue this engagement while this review is underway.'
          : 'Due to a safety concern observed on [DATE], you are being temporarily removed from active duty pending a review. This is a serious matter and will be documented in your personnel file.',
        prohibitedLanguage: 'Never ignore safety concerns. Never allow a person with identified safety issues to continue working while investigation is pending. Never minimize safety incidents in documentation.',
        requiredDocumentation: ['Safety incident report', 'Witness statements', 'Photos/video if available', 'Medical evaluation if physical safety incident', 'Corrective action plan'],
        escalationRequired: severity === 'critical',
        legalNote: `OSHA and ${stateCode} state safety laws may require specific reporting for certain workplace safety incidents. Consult safety officer and legal counsel.`,
      },
      mental_health_concern: {
        situation: 'Mental Health or Wellness Concern',
        recommendedApproach: workerType === 'contractor'
          ? 'Approach with empathy. If the concern affects performance or safety, end the assignment with sensitivity. Provide EAP resources if available.'
          : 'Approach with empathy and human dignity. Do NOT initiate disciplinary action. Instead, initiate a wellness check and referral to Employee Assistance Program (EAP). Only if a safety risk is present should removal from post occur. HR and management must be involved. ADA considerations may apply.',
        approvedLanguage: workerType === 'contractor'
          ? 'We have noticed you may be dealing with some personal challenges. We genuinely care about your wellbeing. We are going to conclude this assignment at this time and encourage you to seek support if needed. [Provide EAP info if available]'
          : 'We have noticed some signs that you may be experiencing personal challenges, and we genuinely care about your wellbeing. We want to connect you with our Employee Assistance Program (EAP) which provides confidential support. There is no penalty for seeking this support.',
        prohibitedLanguage: 'Never say "you seem crazy." Never threaten termination for seeking mental health support. Never disclose mental health concerns to unauthorized parties. Never fail to offer EAP if available.',
        requiredDocumentation: ['Manager observation notes (objective behavior only, no diagnosis)', 'EAP referral documentation', 'Any accommodation requests per ADA if applicable'],
        escalationRequired: true,
        legalNote: `ADA and ${stateCode} state disability law may protect employees with mental health conditions. Consult HR and legal counsel before taking any adverse action. Reasonable accommodation must be considered.`,
      },
      performance_issue: {
        situation: 'Performance Issue / Failure to Meet Standards',
        recommendedApproach: workerType === 'contractor'
          ? 'Communicate performance concerns directly and professionally. End assignment if performance standards are not met. No progressive discipline required for contractors.'
          : 'Follow progressive discipline framework. Document each step. Give clear expectations and timelines. Use a Performance Improvement Plan (PIP) if repeated issues occur.',
        approvedLanguage: workerType === 'contractor'
          ? 'We have concerns about the performance standards required for this engagement. Specifically, [ISSUE]. We are concluding this assignment effective [DATE].'
          : 'We are issuing this [warning level] because [SPECIFIC PERFORMANCE ISSUE]. We expect [SPECIFIC IMPROVEMENT] by [DATE]. Failure to meet this standard may result in further disciplinary action up to and including termination.',
        prohibitedLanguage: 'Never make vague performance claims. Always be specific about what standard was not met and cite the relevant policy section.',
        requiredDocumentation: ['Specific performance standard not met with dates', 'Policy section referenced', 'Prior communications about expectations', 'Performance Improvement Plan (for written warnings)'],
        escalationRequired: false,
        legalNote: `Ensure all performance standards are clearly documented in the employee handbook or contractor agreement. Subjective performance assessments without objective criteria create legal exposure in ${stateCode}.`,
      },
      policy_violation: {
        situation: 'Policy or Handbook Violation',
        recommendedApproach: workerType === 'contractor'
          ? 'Note: Contractors are not bound by the company handbook — only by client SOP and the contractor agreement. If the violation is of the contractor agreement, address per agreement terms.'
          : 'Identify the specific policy violated. Cite the handbook section. Follow progressive discipline appropriate to the severity.',
        approvedLanguage: workerType === 'contractor'
          ? 'We have noted a violation of the terms of your service agreement, specifically [SECTION/TERM]. We need to address this formally.'
          : 'This [warning type] is being issued for violation of company policy [POLICY NAME, Section X], which occurred on [DATE]. The specific conduct at issue is [DESCRIPTION].',
        prohibitedLanguage: 'Never apply company handbook rules to contractors. Never cite a policy that is not in writing. Never issue discipline without citing the specific policy section.',
        requiredDocumentation: ['Specific handbook section violated', 'Description of the conduct', 'Date and witnesses', 'Signed acknowledgment from employee'],
        escalationRequired: severity === 'critical',
        legalNote: `Ensure the employee received and acknowledged the handbook before citing it in discipline. In ${stateCode}, unsigned or unacknowledged handbooks have reduced legal force.`,
      },
      client_complaint: {
        situation: 'Client Complaint About Worker Conduct',
        recommendedApproach: workerType === 'contractor'
          ? 'Take client complaints seriously. Investigate promptly. If substantiated, discuss with contractor and either correct or end assignment per client\'s needs.'
          : 'Investigate before acting. Do not simply relay a client complaint as fact. If substantiated, follow progressive discipline. If critical conduct, may skip steps.',
        approvedLanguage: workerType === 'contractor'
          ? 'We have received a concern from our client regarding your conduct during an assignment. We are reviewing this matter and will follow up with you shortly.'
          : 'A concern was raised regarding your conduct on [DATE] at [LOCATION]. We have reviewed the matter and determined [FINDINGS]. This [disciplinary action] is being issued in response.',
        prohibitedLanguage: 'Never terminate based solely on a client complaint without investigation. Never promise clients specific disciplinary outcomes. Never share the employee\'s personnel file with clients.',
        requiredDocumentation: ['Client complaint documentation', 'Your investigation notes', 'Worker\'s response', 'Decision rationale'],
        escalationRequired: false,
        legalNote: `Client complaints do not override your obligations to employees under ${stateCode} employment law. Investigate before acting.`,
      },
      client_sop_violation: {
        situation: 'Client SOP Violation — applies to both contractors and employees',
        recommendedApproach: workerType === 'contractor'
          ? 'Client SOP is the primary governing document for contractors on-site. Any material SOP violation can be grounds for immediate assignment removal.'
          : 'Client SOP violations are also subject to progressive discipline for employees, as employees are required to follow both handbook and client SOP. Severity of the SOP violation determines the discipline level.',
        approvedLanguage: workerType === 'contractor'
          ? 'Your assignment at [CLIENT SITE] is being concluded effective immediately due to a violation of the site\'s Standard Operating Procedures, specifically [SOP SECTION/REQUIREMENT].'
          : 'This [warning level] is being issued because you violated the client SOP requirement [SPECIFIC REQUIREMENT] on [DATE]. All personnel are required to adhere to client site SOPs at all times.',
        prohibitedLanguage: 'Never allow SOP violations to go undocumented. Never permit repeated SOP violations without escalating consequences.',
        requiredDocumentation: ['SOP document with violated section highlighted', 'Incident report', 'Worker\'s acknowledgment of SOP at onboarding'],
        escalationRequired: severity === 'critical',
        legalNote: `Ensure all workers acknowledge client SOPs in writing before their first assignment at that site. Undocumented SOP acknowledgments are difficult to enforce in ${stateCode}.`,
      },
      no_longer_needed: {
        situation: 'Position No Longer Needed / Assignment Concluded',
        recommendedApproach: workerType === 'contractor'
          ? 'End engagement with advance notice per contractor agreement. This is a business decision, not a performance issue.'
          : 'If a true reduction in workforce or position elimination, follow RIF (Reduction in Force) protocols. Document the business reason. Ensure any severance is per policy. Check WARN Act if 50+ employees.',
        approvedLanguage: workerType === 'contractor'
          ? protocol.approvedSeparationLanguage.noFault
          : EMPLOYEE_PROTOCOL.approvedSeparationLanguage.noFault,
        prohibitedLanguage: workerType === 'contractor'
          ? 'Do not use employee termination language. This is an assignment conclusion, not a termination.' : 'Do not use this reason to mask a performance or conduct issue. Courts see through pretextual layoffs.',
        requiredDocumentation: ['Business justification for position elimination', 'Severance documentation if applicable', 'COBRA notice for employees if benefits were provided'],
        escalationRequired: false,
        legalNote: `${stateCode} at-will employment law applies to employees. However, documented legitimate business reasons for RIF still protect the company from retaliation claims.`,
      },
    };

    const guidance = guidanceMap[situation] || guidanceMap.performance_issue!;

    return {
      ...guidance,
      situation: guidance.situation,
      workerType,
      stateCode,
    };
  }

  async getHandbookSOPContextForEmployee(
    workspaceId: string,
    employeeId: string,
    clientId?: string
  ): Promise<HandbookSOPContext> {
    const [emp] = await db.select({ workerType: employees.workerType })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
      .limit(1);

    const workerType = (emp?.workerType === 'contractor' ? 'contractor' : 'employee') as WorkerType;
    const protocol = this.getWorkerTypeProtocol(workerType);

    // Converted to Drizzle ORM: IN subquery → inArray()
    const handbookRows = await db.select({
      documentType: employeeDocuments.documentType,
      storagePath: employeeDocuments.storagePath,
      fileName: employeeDocuments.fileName,
    })
      .from(employeeDocuments)
      .where(and(
        eq(employeeDocuments.workspaceId, workspaceId),
        inArray(employeeDocuments.documentType, ['employee_handbook', 'handbook', 'policy'])
      ))
      .limit(5)
      .catch(() => []);

    // CATEGORY C — Genuine schema mismatch: No client_documents table in schema; SOP docs stored in org_documents without clientId FK | Tables: org_documents | Verified: 2026-03-23
    const sopRows: any[] = clientId ? await db.execute(sql`
      SELECT category as "documentType", file_path as "storagePath", file_name as "fileName"
      FROM org_documents
      WHERE workspace_id = ${workspaceId}
        AND category IN ('sop', 'post_orders', 'site_instructions')
      LIMIT 5
    `).then(r => Array.isArray(r) ? r : (r as any).rows || []).catch(() => []) : [];

    const hasHandbook = handbookRows.length > 0;
    const hasSOP = sopRows.length > 0;

    return {
      hasHandbook,
      hasSOP,
      handbookSections: hasHandbook ? ['See uploaded handbook document'] : [],
      sopSections: hasSOP ? ['See uploaded SOP document'] : [],
      applicableToWorkerType: workerType,
      complianceNotes: [
        workerType === 'employee'
          ? `EMPLOYEE: Must follow BOTH company handbook (${hasHandbook ? 'UPLOADED' : 'NOT YET UPLOADED — REQUIRED'}) AND client SOP (${hasSOP ? 'UPLOADED' : 'NOT YET UPLOADED — REQUIRED'}).`
          : `CONTRACTOR: Must follow CLIENT SOP ONLY (${hasSOP ? 'UPLOADED' : 'NOT YET UPLOADED — REQUIRED'}) — handbook does NOT apply to contractors.`,
        !hasHandbook && workerType === 'employee' ? 'ACTION REQUIRED: No employee handbook has been uploaded for this workspace. Upload handbook through Document Management before issuing disciplinary actions.' : '',
        !hasSOP ? `ACTION RECOMMENDED: No SOP has been uploaded for ${clientId ? 'this client' : 'this workspace'}. Upload site SOPs to ensure proper guidance can be provided.` : '',
      ].filter(Boolean).join('\n'),
    };
  }

  buildWorkerTypePromptInjection(workerType: WorkerType): string {
    const protocol = this.getWorkerTypeProtocol(workerType);

    return `
WORKFORCE PROTOCOL — ${workerType.toUpperCase()}:
Classification: ${protocol.taxClassification}
Separation Action: "${protocol.separationTerminology.actionLabel}" — use this term, NOT "fired" or "terminated" (for contractors)

GOVERNING DOCUMENTS:
• Handbook: ${protocol.governingDocuments.mustFollowHandbook ? 'REQUIRED' : 'NOT APPLICABLE'} — ${protocol.governingDocuments.handbookNote}
• Client SOP: ${protocol.governingDocuments.mustFollowClientSOP ? 'REQUIRED' : 'NOT APPLICABLE'} — ${protocol.governingDocuments.sopNote}

DISCIPLINE FRAMEWORK:
${protocol.disciplineFramework.hasProgressiveDiscipline
  ? `Progressive discipline required:
${protocol.disciplineFramework.steps.map(s => `  • ${s}`).join('\n')}
• 3-Issue Threshold: ${protocol.disciplineFramework.thresholdCount} documented issues within ${protocol.disciplineFramework.windowMonths} months triggers termination review
• Critical Violations: May bypass progressive discipline`
  : 'No progressive discipline framework — assignments may be ended per agreement terms.'}

APPROVED SEPARATION LANGUAGE (use EXACTLY this framing):
For-Cause: "${protocol.approvedSeparationLanguage.forCause.substring(0, 100)}..."
No-Fault: "${protocol.approvedSeparationLanguage.noFault.substring(0, 100)}..."

PROHIBITED LANGUAGE (NEVER USE):
${protocol.prohibitedSeparationLanguage.map(p => `  ✗ "${p}"`).join('\n')}
`.trim();
  }
}

export const trinityWorkforceProtocol = new TrinityWorkforceProtocolService();
