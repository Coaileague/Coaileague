/**
 * Phase F — Handbook Audit Engine
 * CoAIleague Legal/Safety Sprint
 *
 * Audits employee handbooks (compliance documents) for required sections
 * mandated by Texas DPS, OSHA, and labor law for security guard operations.
 */

import { db, pool } from "../db";
import { complianceDocuments } from '@shared/schema';
import { eq, and, inArray, desc, ne } from 'drizzle-orm';
import { typedPool } from '../lib/typedSql';

export interface HandbookAuditResult {
  workspaceId: string;
  documentId?: string;
  documentTitle: string;
  auditedAt: string;
  overallScore: number;        // 0-100
  passedSections: string[];
  missingSections: MissingSection[];
  warnings: AuditWarning[];
  recommendations: string[];
  compliant: boolean;
}

export interface MissingSection {
  section: string;
  severity: "critical" | "required" | "recommended";
  description: string;
  remedy: string;
}

export interface AuditWarning {
  code: string;
  message: string;
  severity: "high" | "medium" | "low";
}

// ─── Required Sections Checklist ──────────────────────────────────────────────

const REQUIRED_SECTIONS: Array<{
  name: string;
  keywords: string[];
  severity: "critical" | "required" | "recommended";
  description: string;
  remedy: string;
}> = [
  {
    name: "Emergency Procedures — Direct 911 Instruction",
    keywords: ["911", "emergency services", "call for emergency", "contact emergency"],
    severity: "critical",
    description: "Handbook must explicitly instruct officers to call 911 for life-threatening emergencies. Officers cannot rely on employer systems for emergency dispatch.",
    remedy: 'Add a section stating: "In any life-threatening emergency, call 911 immediately. Do not wait for supervisor approval or use internal communication systems as a substitute for emergency services."',
  },
  {
    name: "Use of Force Policy",
    keywords: ["use of force", "force continuum", "physical force", "restraint", "deadly force"],
    severity: "critical",
    description: "Texas DPS requires documented use-of-force policy for all commissioned/non-commissioned security personnel.",
    remedy: "Add a Use of Force policy section defining the force continuum, prohibited actions, and reporting requirements per Texas Occupations Code Chapter 1702.",
  },
  {
    name: "Firearms and Weapons Policy",
    keywords: ["firearm", "weapon", "gun", "armed", "endorsement", "license to carry", "ltc", "concealed"],
    severity: "critical",
    description: "All armed security personnel must have documented weapons policy including endorsement verification requirements.",
    remedy: "Add Firearms Policy section covering: required DPS armed endorsement, weapon storage, prohibited carry areas, and duty weapon requirements.",
  },
  {
    name: "Texas DPS License Requirements",
    keywords: ["dps", "department of public safety", "security license", "commission", "license number", "level ii", "level iii"],
    severity: "critical",
    description: "Handbook must document Texas DPS license verification requirements for all security personnel.",
    remedy: "Add License Requirements section specifying: minimum license level by post type, verification procedure before scheduling, and expiration monitoring.",
  },
  {
    name: "Sexual Harassment Policy",
    keywords: ["sexual harassment", "harassment", "hostile work environment", "unwanted advances", "discrimination"],
    severity: "required",
    description: "Federal and Texas law require written anti-harassment policy.",
    remedy: "Add Sexual Harassment and Anti-Discrimination policy section with reporting procedures and zero-tolerance statement.",
  },
  {
    name: "Disciplinary Procedures",
    keywords: ["discipline", "disciplinary", "termination", "written warning", "suspension", "progressive discipline"],
    severity: "required",
    description: "Documented disciplinary procedures protect the company from wrongful termination claims.",
    remedy: "Add Progressive Discipline section: verbal warning → written warning → suspension → termination, with appeal process.",
  },
  {
    name: "Attendance and Tardiness Policy",
    keywords: ["attendance", "tardiness", "absent", "no call no show", "ncns", "punctuality"],
    severity: "required",
    description: "Attendance policy is essential for security operations where absent officers create coverage gaps.",
    remedy: "Add Attendance Policy section specifying: call-out procedures, no-call-no-show consequences, and maximum excused absences.",
  },
  {
    name: "Incident Reporting Obligations",
    keywords: ["incident report", "reporting obligation", "document", "notify supervisor", "report to management"],
    severity: "required",
    description: "Officers must understand mandatory incident reporting requirements.",
    remedy: "Add Incident Reporting section requiring: immediate supervisor notification, written report within 24 hours, and documentation retention requirements.",
  },
  {
    name: "Confidentiality and Non-Disclosure",
    keywords: ["confidential", "non-disclosure", "proprietary", "client information", "data privacy"],
    severity: "required",
    description: "Security personnel handle sensitive client information and must understand confidentiality obligations.",
    remedy: "Add Confidentiality section covering client identity protection, surveillance footage handling, and unauthorized disclosure consequences.",
  },
  {
    name: "Social Media and Electronic Communications Policy",
    keywords: ["social media", "social network", "facebook", "twitter", "instagram", "posting", "electronic communication"],
    severity: "recommended",
    description: "Officers posting client locations or incidents on social media creates serious liability.",
    remedy: "Add Social Media Policy prohibiting: posting client locations, security footage, incident details, or anything that identifies clients or employers.",
  },
  {
    name: "Vehicle and Equipment Use Policy",
    keywords: ["vehicle", "company vehicle", "equipment", "radio", "patrol car", "uniform"],
    severity: "recommended",
    description: "Equipment use policies protect company assets and establish liability boundaries.",
    remedy: "Add Equipment and Vehicle Use section covering authorized use, personal use prohibition, damage reporting, and loss procedures.",
  },
];

// ─── Prohibited / Dangerous Patterns ─────────────────────────────────────────

const DANGEROUS_PATTERNS: Array<{
  code: string;
  pattern: RegExp;
  message: string;
  severity: "high" | "medium" | "low";
}> = [
  {
    code: "AUTO_911",
    pattern: /company (will|shall|must|can|may) (call|contact|notify|reach) 911/i,
    message: 'Handbook implies the company calls 911 on behalf of officers. Officers must call 911 directly. Remove language suggesting the company acts as intermediary for emergency services.',
    severity: "high",
  },
  {
    code: "LEGAL_ADVICE",
    pattern: /this (handbook|policy|document) (constitutes|provides|is) (legal (advice|counsel|guidance))/i,
    message: 'Handbook claims to provide legal advice or guidance. Add disclaimer: "This handbook does not constitute legal advice."',
    severity: "medium",
  },
  {
    code: "UNLIMITED_FORCE",
    pattern: /use (any|all|whatever) (force|means) (necessary|needed|required)/i,
    message: 'Dangerous use-of-force language detected. Replace with proportional force continuum language.',
    severity: "high",
  },
  {
    code: "WAIVE_RIGHTS",
    pattern: /waive (your|any|all|their) (right|rights|legal right)/i,
    message: 'Handbook may contain illegal waiver-of-rights language. Review with employment attorney.',
    severity: "high",
  },
];

// ─── Audit Function ───────────────────────────────────────────────────────────

export async function auditHandbook(params: {
  workspaceId: string;
  documentText: string;
  documentTitle?: string;
  documentId?: string;
}): Promise<HandbookAuditResult> {
  const { workspaceId, documentText, documentTitle = "Employee Handbook", documentId } = params;
  const text = documentText.toLowerCase();

  const passedSections: string[] = [];
  const missingSections: MissingSection[] = [];
  const warnings: AuditWarning[] = [];

  // Check required sections
  for (const section of REQUIRED_SECTIONS) {
    const found = section.keywords.some(kw => text.includes(kw.toLowerCase()));
    if (found) {
      passedSections.push(section.name);
    } else {
      missingSections.push({
        section: section.name,
        severity: section.severity,
        description: section.description,
        remedy: section.remedy,
      });
    }
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.pattern.test(documentText)) {
      warnings.push({
        code: pattern.code,
        message: pattern.message,
        severity: pattern.severity,
      });
    }
  }

  // Calculate score
  const criticalMissing = missingSections.filter(m => m.severity === "critical").length;
  const requiredMissing = missingSections.filter(m => m.severity === "required").length;
  const highWarnings = warnings.filter(w => w.severity === "high").length;

  const totalChecks = REQUIRED_SECTIONS.length;
  const passedCount = passedSections.length;
  const baseScore = Math.round((passedCount / totalChecks) * 100);
  const penalty = (criticalMissing * 10) + (requiredMissing * 5) + (highWarnings * 8);
  const overallScore = Math.max(0, baseScore - penalty);

  const compliant = criticalMissing === 0 && highWarnings === 0 && overallScore >= 70;

  const recommendations: string[] = [];
  if (criticalMissing > 0) {
    recommendations.push(`URGENT: ${criticalMissing} critical section(s) are missing. These are required by Texas DPS or federal law and must be added before the handbook is distributed.`);
  }
  if (requiredMissing > 0) {
    recommendations.push(`${requiredMissing} required section(s) are missing. Add these to protect the company from employment law liability.`);
  }
  if (highWarnings > 0) {
    recommendations.push(`${highWarnings} dangerous policy pattern(s) detected. Review with a licensed Texas employment attorney before distributing.`);
  }
  if (overallScore >= 90) {
    recommendations.push("Handbook is substantially complete. Schedule annual review with legal counsel to ensure continued compliance.");
  }

  return {
    workspaceId,
    documentId,
    documentTitle,
    auditedAt: new Date().toISOString(),
    overallScore,
    passedSections,
    missingSections,
    warnings,
    recommendations,
    compliant,
  };
}

export async function auditWorkspaceHandbooks(workspaceId: string): Promise<HandbookAuditResult[]> {
  // Converted to Drizzle ORM: IN subquery → inArray()
  const resultRows = await db.select({
    id: complianceDocuments.id,
    title: (complianceDocuments as any).title,
    content: (complianceDocuments as any).content,
    documentType: complianceDocuments.documentTypeId,
  })
    .from(complianceDocuments)
    .where(and(
      eq(complianceDocuments.workspaceId, workspaceId),
      inArray(complianceDocuments.documentTypeId, ['employee_handbook', 'handbook', 'policy']),
      ne(complianceDocuments.status, 'archived')
    ))
    .orderBy(desc(complianceDocuments.createdAt))
    .limit(10);

  const audits: HandbookAuditResult[] = [];
  for (const doc of resultRows) {
    if (doc.content) {
      const audit = await auditHandbook({
        workspaceId,
        documentText: doc.content,
        documentTitle: doc.title,
        documentId: doc.id,
      });
      audits.push(audit);
    }
  }
  return audits;
}
