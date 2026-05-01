/**
 * Trinity Disciplinary Workflow Engine
 * ====================================
 *
 * Orchestrates the complete disciplinary process:
 *   1. 5-W intake      — Who / What / Where / When / Why / How
 *   2. SOP research    — finds the relevant policy section that was violated
 *   3. Type routing    — employees → progressive write-ups
 *                      — 1099 contractors → Letters of Dissatisfaction (LOD)
 *   4. Doc generation  — full formal document drafted by Gemini
 *   5. Signature seq   — employee signs first, then manager countersigns
 *   6. Score deduction — career-score impact, carried across tenants
 *   7. Strike tracking — 3 active LODs = Trinity recommends no further work
 *
 * Legal compliance:
 *   - Employees    → Texas Labor Code progressive discipline
 *   - Contractors  → cannot be disciplined (IRS classification risk).
 *                    We issue LODs only, using "performance concern" language.
 *   - All documents → 7-year retention, immutable after dual signature
 */

import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
import { getSOPContextForTrinity } from './sopIndexingService';
import { geminiClient } from '../ai-brain/providers/geminiClient';

const log = createLogger('TrinityDisciplinary');

// ── Types ────────────────────────────────────────────────────────────────────

export type DisciplinarySubjectType = 'employee' | 'contractor_1099';
export type DisciplinaryDocType =
  | 'verbal_warning'
  | 'written_warning'
  | 'final_written_warning'
  | 'pip'
  | 'suspension_notice'
  | 'termination_warning'
  | 'lod_letter_of_dissatisfaction';

export type DisciplinarySeverity = 'minor' | 'moderate' | 'serious' | 'severe';

export interface DisciplinaryIntake {
  workspaceId: string;
  initiatedBy: string;
  initiatedByRole: string;
  subjectId: string;
  subjectType: DisciplinarySubjectType;
  who: string;
  what: string;
  where: string;
  when: string;
  why: string;
  how: string;
  witnesses?: string;
  priorIncidents?: string;
  rawNarrative?: string;
}

export interface DisciplinarySigningStep {
  order: number;
  role: 'employee' | 'manager' | 'witness';
  targetId: string;
  targetEmail: string;
  message: string;
}

export interface DisciplinaryResult {
  documentType: DisciplinaryDocType;
  documentTitle: string;
  documentContent: string;
  sopViolationsFound: string[];
  severityLevel: DisciplinarySeverity;
  severityReason: string;
  scoreDeduction: number;
  signingSequence: DisciplinarySigningStep[];
  trinityNarrative: string;
  rehabilitationSuggestions: string[];
  lodCount?: number;
  recommendNoFurtherWork?: boolean;
}

// ── Severity → score deduction table ─────────────────────────────────────────

const SEVERITY_SCORE_MAP: Record<DisciplinarySeverity, number> = {
  minor: 5,
  moderate: 15,
  serious: 30,
  severe: 50,
};

// ── Document type selection (progressive discipline ladder) ──────────────────

function selectDocumentType(
  subjectType: DisciplinarySubjectType,
  severity: DisciplinarySeverity,
  priorRecordCount: number,
): DisciplinaryDocType {
  if (subjectType === 'contractor_1099') {
    return 'lod_letter_of_dissatisfaction';
  }
  if (severity === 'severe') return 'final_written_warning';
  if (severity === 'serious' && priorRecordCount >= 1) return 'final_written_warning';
  if (severity === 'serious') return 'written_warning';
  if (severity === 'moderate' && priorRecordCount >= 1) return 'written_warning';
  if (severity === 'moderate') return 'verbal_warning';
  return 'verbal_warning';
}

// ── Subject lookup ──────────────────────────────────────────────────────────

async function getSubjectInfo(intake: DisciplinaryIntake): Promise<Record<string, any>> {
  if (intake.subjectType === 'employee') {
    const { rows } = await pool.query(
      `SELECT e.first_name, e.last_name, e.email, e.employee_number,
              e.position, e.hire_date, u.email AS user_email,
              'employee' AS subject_type
         FROM employees e
         LEFT JOIN users u ON u.id = e.user_id
        WHERE e.id = $1 AND e.workspace_id = $2
        LIMIT 1`,
      [intake.subjectId, intake.workspaceId],
    );
    return rows[0] || {};
  }
  const { rows } = await pool.query(
    `SELECT first_name, last_name, email,
            '1099' AS contractor_type,
            'contractor_1099' AS subject_type
       FROM contractor_pool
      WHERE id = $1 AND workspace_id = $2
      LIMIT 1`,
    [intake.subjectId, intake.workspaceId],
  );
  return rows[0] || {};
}

async function getPriorDisciplinaryCount(
  workspaceId: string,
  subjectId: string,
): Promise<number> {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt
         FROM disciplinary_records
        WHERE workspace_id = $1
          AND employee_id = $2
          AND status = 'active'
          AND record_type NOT IN ('commendation')`,
      [workspaceId, subjectId],
    );
    return Number(rows[0]?.cnt || 0);
  } catch {
    return 0;
  }
}

async function getLODCount(workspaceId: string, contractorId: string): Promise<number> {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt
         FROM disciplinary_records
        WHERE workspace_id = $1
          AND employee_id = $2
          AND record_type = 'lod_letter_of_dissatisfaction'
          AND status = 'active'`,
      [workspaceId, contractorId],
    );
    return Number(rows[0]?.cnt || 0);
  } catch {
    return 0;
  }
}

// ── Texas DPS / regulatory standards quick-reference ────────────────────────

function getDPSStandards(incident: string): string {
  const lower = (incident || '').toLowerCase();
  const standards: string[] = [];

  if (/sleep|dozing|unresponsive|post.*abandon/.test(lower)) {
    standards.push(
      'Texas OC §1702.3615: Officers must remain alert and attentive at all times. Sleeping on post is grounds for immediate disciplinary action and potential license review.',
    );
  }
  if (/armed|firearm|weapon|draw.*weapon/.test(lower)) {
    standards.push(
      'Texas OC §1702.163: Commissioned officers must follow strict use-of-force protocols. Unauthorized display or use of a firearm may result in license suspension.',
    );
  }
  if (/alcohol|drug|intoxicat|substance/.test(lower)) {
    standards.push(
      'Texas OC TAC §35.42: Officers may not report to or remain on duty while under the influence of any intoxicant. Violation may result in immediate termination and license surrender.',
    );
  }
  if (/uniform|dress.*code|appearance/.test(lower)) {
    standards.push(
      'Texas PSB Standard: Officers must maintain professional appearance per company dress code and DPS grooming standards while on duty.',
    );
  }
  if (/client.*complaint|customer.*complaint/.test(lower)) {
    standards.push(
      'Texas OC §1702.3615: Officers must treat all persons with dignity and professionalism. Documented client complaints trigger mandatory supervisory review.',
    );
  }

  return standards.length > 0
    ? `APPLICABLE DPS/REGULATORY STANDARDS:\n${standards.join('\n')}`
    : '';
}

// ── Draft generation (Gemini) ───────────────────────────────────────────────

interface DraftCore {
  documentTitle: string;
  documentContent: string;
  sopViolationsFound: string[];
  severityLevel: DisciplinarySeverity;
  severityReason: string;
  trinityNarrative: string;
  rehabilitationSuggestions: string[];
}

async function generateDraft(
  intake: DisciplinaryIntake,
  subjectInfo: Record<string, unknown>,
  sopContext: string,
  priorRecordCount: number,
  regulatoryContext: string,
): Promise<DraftCore> {
  const isContractor = intake.subjectType === 'contractor_1099';

  const systemPrompt = `You are Trinity, an AI HR supervisor for a private security company.
You draft professional disciplinary documents that are:
- Factual and specific (cite exact dates, times, locations)
- Policy-referenced (cite the specific SOP section violated)
- Legally defensible (objective language, no emotional or discriminatory language)
- Progressive (proportional to history and severity)
- Empathetic in tone while firm on standards

For EMPLOYEES: write formal disciplinary documents (verbal warning, written warning, final warning, PIP).
For CONTRACTORS (1099): write a Letter of Dissatisfaction ONLY.
  CRITICAL: never use the words "discipline", "discipline", or "employment" in contractor documents.
  A LOD is a notice of performance concern, not discipline. This distinction
  is essential for IRS contractor classification compliance.

Return ONLY valid JSON with these fields:
  documentTitle (string),
  documentContent (full formal document text — header, incident description,
    policy violation, expected behavior, consequences, signature block),
  sopViolationsFound (string[]),
  severityLevel ("minor" | "moderate" | "serious" | "severe"),
  severityReason (string),
  trinityNarrative (string — reasoning shown to the manager),
  rehabilitationSuggestions (string[]).`;

  const userPrompt = `DISCIPLINARY INCIDENT DETAILS:
Subject: ${subjectInfo.first_name || ''} ${subjectInfo.last_name || ''}
Subject Type: ${intake.subjectType}
Position: ${subjectInfo.position || 'Security Officer'}
Hire/Contract Date: ${subjectInfo.hire_date || 'Unknown'}
Prior Disciplinary Records (active): ${priorRecordCount}

INCIDENT 5-W REPORT:
WHO: ${intake.who}
WHAT: ${intake.what}
WHERE: ${intake.where}
WHEN: ${intake.when}
WHY: ${intake.why}
HOW DISCOVERED: ${intake.how}
WITNESSES: ${intake.witnesses || 'None stated'}
PRIOR RELATED INCIDENTS: ${intake.priorIncidents || 'None stated'}
ADDITIONAL CONTEXT: ${intake.rawNarrative || 'None'}

${sopContext ? `COMPANY SOP/POLICIES:\n${sopContext.slice(0, 3000)}` : 'No SOP uploaded for this workspace yet.'}

${regulatoryContext}

Generate the appropriate ${isContractor ? 'Letter of Dissatisfaction' : 'disciplinary'} document in JSON as instructed.`;

  let raw = '';
  try {
    const response = await geminiClient.generate({
      workspaceId: intake.workspaceId,
      userId: intake.initiatedBy,
      featureKey: 'hr_document_request',
      systemPrompt,
      userMessage: userPrompt,
      temperature: 0.4,
      maxTokens: 4000,
    });
    raw = response?.text || '';
  } catch (err: unknown) {
    log.warn('[TrinityDisciplinary] Gemini call failed, falling back to template:', err?.message);
  }

  const parsed = parseDraftJSON(raw);
  if (parsed) return parsed;

  // ── Fallback template if AI generation is unavailable ──
  return buildFallbackDraft(intake, subjectInfo, priorRecordCount);
}

function parseDraftJSON(text: string): DraftCore | null {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/g, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  try {
    const obj = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    if (!obj.documentContent || !obj.severityLevel) return null;
    return {
      documentTitle: String(obj.documentTitle || 'Disciplinary Document'),
      documentContent: String(obj.documentContent),
      sopViolationsFound: Array.isArray(obj.sopViolationsFound) ? obj.sopViolationsFound : [],
      severityLevel: normalizeSeverity(obj.severityLevel),
      severityReason: String(obj.severityReason || ''),
      trinityNarrative: String(obj.trinityNarrative || ''),
      rehabilitationSuggestions: Array.isArray(obj.rehabilitationSuggestions)
        ? obj.rehabilitationSuggestions
        : [],
    };
  } catch {
    return null;
  }
}

function normalizeSeverity(value: any): DisciplinarySeverity {
  const s = String(value || '').toLowerCase();
  if (s === 'severe' || s === 'serious' || s === 'moderate' || s === 'minor') return s;
  return 'moderate';
}

function buildFallbackDraft(
  intake: DisciplinaryIntake,
  subjectInfo: Record<string, unknown>,
  priorRecordCount: number,
): DraftCore {
  const name = `${subjectInfo.first_name || 'Subject'} ${subjectInfo.last_name || ''}`.trim();
  const severity: DisciplinarySeverity = priorRecordCount >= 2 ? 'serious' : 'moderate';
  const isContractor = intake.subjectType === 'contractor_1099';
  const docTitle = isContractor
    ? 'Letter of Dissatisfaction'
    : 'Employee Disciplinary Document';

  const body = `${docTitle}
Subject: ${name}
Date of Incident: ${intake.when}
Location: ${intake.where}

INCIDENT DESCRIPTION
${intake.what}

POLICY/PERFORMANCE BASIS
${intake.why}

HOW DISCOVERED
${intake.how}

WITNESSES
${intake.witnesses || 'None stated'}

${isContractor
  ? 'This letter notifies you that your recent performance on the engagement described above did not meet the standards expected of contractors serving our clients. This is a notice of performance concern and is not an action related to employment.'
  : `This is a formal disciplinary notice. Continued performance below expectations may result in further action up to and including termination, consistent with company policy and applicable Texas law. Prior active records on file: ${priorRecordCount}.`}

EXPECTED CORRECTIVE ACTION
- Review the applicable company policy.
- Acknowledge this document with your signature below.
- Return to full compliance on your next shift/engagement.

SIGNATURES
${isContractor ? 'Contractor' : 'Employee'}: ______________________  Date: __________
Manager:               ______________________  Date: __________
`;

  return {
    documentTitle: docTitle,
    documentContent: body,
    sopViolationsFound: [],
    severityLevel: severity,
    severityReason: 'Fallback template used — AI generation unavailable.',
    trinityNarrative:
      'AI draft unavailable; this is a policy-compliant fallback template. Please review carefully before sending.',
    rehabilitationSuggestions: [
      'Review the specific policy section with the subject.',
      'Schedule a 30-day follow-up to verify corrective action.',
    ],
  };
}

// ── Signing sequence ────────────────────────────────────────────────────────

async function buildSigningSequence(
  intake: DisciplinaryIntake,
  subjectInfo: Record<string, unknown>,
  docType: DisciplinaryDocType,
): Promise<DisciplinarySigningStep[]> {
  let managerEmail = '';
  try {
    const { rows } = await pool.query(
      `SELECT email FROM users WHERE id = $1 LIMIT 1`,
      [intake.initiatedBy],
    );
    managerEmail = rows[0]?.email || '';
  } catch {
    managerEmail = '';
  }
  const subjectEmail = subjectInfo.user_email || subjectInfo.email || '';
  const seq: DisciplinarySigningStep[] = [];

  if (subjectEmail) {
    seq.push({
      order: 1,
      role: 'employee',
      targetId: intake.subjectId,
      targetEmail: subjectEmail,
      message: `You have a ${
        docType === 'lod_letter_of_dissatisfaction' ? 'Letter of Dissatisfaction' : 'disciplinary document'
      } that requires your acknowledgment and signature. Please review and sign within 48 hours.`,
    });
  }

  if (managerEmail) {
    seq.push({
      order: 2,
      role: 'manager',
      targetId: intake.initiatedBy,
      targetEmail: managerEmail,
      message: `The document has been signed by the ${
        intake.subjectType === 'contractor_1099' ? 'contractor' : 'employee'
      }. Please review and countersign to finalize.`,
    });
  }

  return seq;
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function runDisciplinaryWorkflow(
  intake: DisciplinaryIntake,
): Promise<DisciplinaryResult> {
  const subjectInfo = await getSubjectInfo(intake);
  const sopContext = await getSOPContextForTrinity(
    intake.workspaceId,
    `${intake.what} ${intake.why}`.slice(0, 200),
  );
  const priorRecords = await getPriorDisciplinaryCount(
    intake.workspaceId,
    intake.subjectId,
  );
  const regulatoryContext = getDPSStandards(intake.what);

  const draft = await generateDraft(
    intake,
    subjectInfo,
    sopContext,
    priorRecords,
    regulatoryContext,
  );

  const docType = selectDocumentType(
    intake.subjectType,
    draft.severityLevel,
    priorRecords,
  );

  const scoreDeduction = SEVERITY_SCORE_MAP[draft.severityLevel] || 15;

  const signingSequence = await buildSigningSequence(intake, subjectInfo, docType);

  const result: DisciplinaryResult = {
    documentType: docType,
    documentTitle: draft.documentTitle,
    documentContent: draft.documentContent,
    sopViolationsFound: draft.sopViolationsFound,
    severityLevel: draft.severityLevel,
    severityReason: draft.severityReason,
    scoreDeduction,
    signingSequence,
    trinityNarrative: draft.trinityNarrative,
    rehabilitationSuggestions: draft.rehabilitationSuggestions,
  };

  if (intake.subjectType === 'contractor_1099') {
    const currentLODCount = await getLODCount(intake.workspaceId, intake.subjectId);
    const newLODCount = currentLODCount + 1;
    result.lodCount = newLODCount;
    result.recommendNoFurtherWork = newLODCount >= 3;
    if (newLODCount >= 3) {
      result.trinityNarrative +=
        `\n\nNOTE: This is the ${newLODCount}${ordinalSuffix(newLODCount)} Letter of Dissatisfaction issued to this contractor. ` +
        `Per company policy, three LODs constitute grounds for non-renewal of contractor engagement. ` +
        `Trinity recommends no further work assignments pending owner review.`;
    }
  }

  return result;
}

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// Re-export for callers that want progressive discipline helpers.
export { selectDocumentType, SEVERITY_SCORE_MAP };
