/**
 * Trinity Deliberation Engine — Phase 3 Conscience
 *
 * Before any destructive action (terminate employee, cancel client, bulk ops),
 * Trinity reasons through the full picture using the resilient AI gateway
 * (which routes to Claude as primary):
 *   - Financial impact (revenue at risk, labor costs)
 *   - Legal exposure (Texas labor law, progressive discipline requirements)
 *   - Relationship value (tenure, history, reliability)
 *   - Rehabilitation potential (can this be fixed?)
 *   - Human impact (how does this affect the person)
 *
 * Returns a DeliberationResult that either:
 *   proceed           → Trinity agrees, executes with note
 *   proceed_with_note → Executes but documents concerns
 *   intervene         → Suggests alternatives first, queues for owner approval
 *   pause_and_warn    → Serious concern, pauses and presents full reasoning
 *   block             → Does not proceed — harm outweighs benefit
 *
 * All destructive actions generate legal documentation automatically.
 */

import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
import { callAIWithFallback } from '../ai-brain/providers/resilientAIGateway';

const log = createLogger('TrinityDeliberation');

export type DeliberationVerdict =
  | 'proceed'
  | 'proceed_with_note'
  | 'intervene'
  | 'pause_and_warn'
  | 'block';

export type RequestType =
  | 'terminate_employee'
  | 'cancel_client'
  | 'bulk_delete'
  | 'payroll_correction'
  | 'deactivation'
  | 'general_destructive';

export interface DeliberationContext {
  requestType: RequestType;
  requestedBy: string;
  requestedByRole: string;
  workspaceId: string;
  targetId?: string;
  targetType?: 'employee' | 'client';
  rawCommand?: string;
  parameters?: Record<string, any>;
}

export interface DeliberationResult {
  verdict: DeliberationVerdict;
  headline: string;
  reasoning: string;
  empathyStatement: string;
  riskAssessment: {
    financial: string;
    legal: string;
    relational: string;
    operational: string;
  };
  alternatives: Array<{
    title: string;
    description: string;
    urgency: 'immediate' | 'this_week' | 'optional';
  }>;
  generatedDocuments?: Array<{
    type: string;
    title: string;
    content: string;
    shouldPersist: boolean;
  }>;
  dataPoints: {
    targetReliabilityScore?: number;
    targetTenureMonths?: number;
    targetRevenue?: number;
    targetOutstandingBalance?: number;
    previousWarnings?: number;
  };
  proceedMessage?: string;
}

export function classifyRequest(
  message: string,
  actionId?: string,
): RequestType | null {
  const lower = message.toLowerCase();
  if (/\b(fire|terminate|let.*go|end.*employment)\b/.test(lower) ||
      actionId === 'employees.deactivate') return 'terminate_employee';
  if (/\b(cancel.*client|drop.*client|remove.*client)\b/.test(lower) ||
      actionId === 'clients.deactivate') return 'cancel_client';
  if (/\b(bulk.*delete|mass.*cancel|delete.*all)\b/.test(lower)) return 'bulk_delete';
  if (/\b(deactivate|suspend.*account)\b/.test(lower)) return 'deactivation';
  return null;
}

async function gatherTargetData(
  ctx: DeliberationContext,
): Promise<DeliberationResult['dataPoints']> {
  const data: DeliberationResult['dataPoints'] = {};
  try {
    if (ctx.targetType === 'employee' && ctx.targetId) {
      const { rows } = await pool.query(`
        SELECT
          EXTRACT(MONTH FROM AGE(NOW(), e.hire_date)) AS tenure_months,
          cp.reliability_score,
          (SELECT COUNT(*) FROM disciplinary_records dr
            WHERE dr.employee_id = e.id AND dr.workspace_id = $1
              AND dr.record_type != 'commendation' AND dr.status = 'active') AS warning_count
        FROM employees e
        LEFT JOIN coaileague_profiles cp ON cp.employee_id = e.id
        WHERE e.id = $2 AND e.workspace_id = $1 LIMIT 1
      `, [ctx.workspaceId, ctx.targetId]);
      if (rows[0]) {
        data.targetReliabilityScore = parseFloat(rows[0].reliability_score || '0.5');
        data.targetTenureMonths = parseInt(rows[0].tenure_months || '0');
        data.previousWarnings = parseInt(rows[0].warning_count || '0');
      }
    }
    if (ctx.targetType === 'client' && ctx.targetId) {
      const { rows } = await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.total::numeric ELSE 0 END), 0) AS total_revenue,
          COALESCE(SUM(CASE WHEN i.status NOT IN ('paid','void','cancelled') THEN i.total::numeric ELSE 0 END), 0) AS outstanding
        FROM invoices i
        WHERE i.client_id = $1 AND i.workspace_id = $2
      `, [ctx.targetId, ctx.workspaceId]);
      if (rows[0]) {
        data.targetRevenue = parseFloat(rows[0].total_revenue || '0');
        data.targetOutstandingBalance = parseFloat(rows[0].outstanding || '0');
      }
    }
  } catch (err: any) {
    log.warn('[Deliberation] Data gather failed (non-fatal):', err?.message);
  }
  return data;
}

const DELIBERATION_SYSTEM = `You are Trinity's ethical reasoning core — the judge in her biological triad.
You deliberate before high-stakes decisions like an experienced HR director and employment attorney combined.

Always consider:
1. FINANCIAL IMPACT — Revenue, cost, cash flow affected
2. LEGAL EXPOSURE — Texas Labor Code, labor claims, wage disputes, IRS contractor classification
3. RELATIONSHIP VALUE — Tenure, history, reliability score
4. REHABILITATION POTENTIAL — Can this be fixed before escalating?
5. EMPATHY — The human impact on the person involved
6. ORGANIZATIONAL HEALTH — Does this move the company forward or create liability?

Texas law: Documented progressive discipline before termination defends against
unemployment claims. Always recommend documentation be created first.

For contractors (1099): NEVER use "discipline" or "termination" language.
Issue Letters of Dissatisfaction only. This protects IRS contractor classification.

Return ONLY valid JSON matching DeliberationResult interface.`;

export async function deliberate(
  ctx: DeliberationContext,
): Promise<DeliberationResult> {
  const dataPoints = await gatherTargetData(ctx);

  const prompt = `${DELIBERATION_SYSTEM}

Request: ${ctx.requestType}
Requested by: ${ctx.requestedByRole}
Raw command: "${ctx.rawCommand || 'not provided'}"
Target: ${ctx.targetType || 'unknown'}
Data: ${JSON.stringify(dataPoints)}

Deliberate. Return JSON:
{
  "verdict": "proceed|proceed_with_note|intervene|pause_and_warn|block",
  "headline": "one sentence summary",
  "reasoning": "full explanation",
  "empathyStatement": "human impact",
  "riskAssessment": { "financial": "...", "legal": "...", "relational": "...", "operational": "..." },
  "alternatives": [{ "title": "...", "description": "...", "urgency": "immediate|this_week|optional" }],
  "generatedDocuments": [{ "type": "counseling_note|pip|warning_letter|client_recovery_plan", "title": "...", "content": "full document text", "shouldPersist": true }],
  "proceedMessage": "what Trinity will say she did (if proceeding)"
}`;

  try {
    const response = await callAIWithFallback(prompt, dataPoints, {
      workspaceId: ctx.workspaceId,
      userId: ctx.requestedBy,
      operationType: 'critical',
      maxTokens: 3000,
      temperature: 0.2,
    });
    const text = response.content || '';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return { ...parsed, dataPoints };
  } catch (err: any) {
    log.error('[Deliberation] AI reasoning failed:', err?.message);
    return {
      verdict: 'pause_and_warn',
      headline: 'Trinity could not complete analysis — human review required',
      reasoning: 'AI deliberation temporarily unavailable. This action requires human authorization.',
      empathyStatement: 'Impact on the person involved could not be assessed.',
      riskAssessment: { financial: 'Unknown', legal: 'Unknown — consult HR', relational: 'Unknown', operational: 'Unknown' },
      alternatives: [{ title: 'Wait and retry', description: 'Try again in a few minutes.', urgency: 'immediate' }],
      dataPoints,
    };
  }
}

export async function persistDeliberationDocuments(
  result: DeliberationResult,
  ctx: DeliberationContext,
): Promise<void> {
  if (!result.generatedDocuments?.length || ctx.targetType !== 'employee' || !ctx.targetId) return;
  for (const doc of result.generatedDocuments) {
    if (!doc.shouldPersist) continue;
    try {
      await pool.query(`
        INSERT INTO employee_documents
          (id, workspace_id, employee_id, document_type, document_name,
           file_url, uploaded_by, uploaded_by_role, upload_ip_address,
           is_compliance_document, retention_period_years, metadata, created_at, updated_at)
        VALUES
          (gen_random_uuid(), $1, $2, $3, $4,
           'trinity_generated', $5, 'system', '127.0.0.1',
           TRUE, 7, $6, NOW(), NOW())
      `, [
        ctx.workspaceId, ctx.targetId,
        doc.type, doc.title,
        ctx.requestedBy,
        JSON.stringify({ content: doc.content, generatedBy: 'trinity_deliberation', requestType: ctx.requestType }),
      ]);
    } catch (err: any) {
      log.warn('[Deliberation] Document persist failed (non-fatal):', err?.message);
    }
  }
}
