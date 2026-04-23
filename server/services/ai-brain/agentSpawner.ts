/**
 * Trinity Agent Spawner
 * =====================
 * Phases 1–3 of Trinity Agent Spawning System
 *
 * Responsibilities:
 * - DB table initialization (agent_registry, agent_tasks, agent_task_logs)
 * - Seed default platform agents
 * - spawnAgent()         — spawn a single domain agent
 * - evaluateAgentPayload() — evaluate returned payload against criteria
 * - spawnParallelAgents()  — run multiple agents in true parallel
 * - notifyTrinityApproval() — fire approved payload back to Trinity's event bus
 *
 * USER LAW: pool.query + CREATE TABLE IF NOT EXISTS (no db:push, no Drizzle schema change)
 */

import { pool, db } from '../../db';
import { eq, sql } from 'drizzle-orm';
import { meteredGemini } from '../billing/meteredGeminiClient';
import { universalNotificationEngine } from '../universalNotificationEngine';
import { platformEventBus } from '../platformEventBus';
import { typedPoolExec } from '../../lib/typedSql';
import { agentRegistry } from '@shared/schema';
import { agentTasks } from '@shared/schema/domains/trinity/extended';
import { createLogger } from '../../lib/logger';
const log = createLogger('agentSpawner');

// ============================================================================
// TYPES
// ============================================================================

export interface AgentRegistry {
  id: string;
  workspaceId: string | null;
  agentKey: string;
  agentName: string;
  domain: string;
  systemPrompt: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  completionCriteria: { min_score: number };
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentTask {
  id: string;
  workspaceId: string;
  agentKey: string;
  spawnedBy: string;
  taskType: string;
  status: 'pending' | 'in_progress' | 'complete' | 'failed' | 're_tasked' | 'escalated';
  inputPayload: Record<string, unknown>;
  outputPayload: Record<string, unknown> | null;
  completionScore: number | null;
  confidenceLevel: number | null;
  flags: unknown[] | null;
  trinityEvaluation: string | null;
  evaluationResult: 'approved' | 'denied' | 'escalated_to_helpai' | 'escalated_to_management' | null;
  retryCount: number;
  maxRetries: number;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  spawnedAt: Date;
  completedAt: Date | null;
  evaluatedAt: Date | null;
}

// ============================================================================
// PHASE 1 — TABLE INITIALIZATION (USER LAW: pool.query, CREATE TABLE IF NOT EXISTS)
// ============================================================================

export async function initAgentTables(): Promise<void> {
  try {
    // CATEGORY C — Raw SQL retained: CREATE TABLE | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE TABLE IF NOT EXISTS agent_registry (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID,
        agent_key TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        domain TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        input_schema JSONB NOT NULL DEFAULT '{}',
        output_schema JSONB NOT NULL DEFAULT '{}',
        completion_criteria JSONB NOT NULL DEFAULT '{"min_score": 75}',
        is_default BOOLEAN NOT NULL DEFAULT false,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // CATEGORY C — Raw SQL retained: CREATE UNIQUE | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE UNIQUE INDEX IF NOT EXISTS agent_registry_ws_key_unique
        ON agent_registry(workspace_id, agent_key)
        WHERE workspace_id IS NOT NULL
    `);

    // CATEGORY C — Raw SQL retained: CREATE UNIQUE | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE UNIQUE INDEX IF NOT EXISTS agent_registry_global_key_unique
        ON agent_registry(agent_key)
        WHERE workspace_id IS NULL
    `);

    // CATEGORY C — Raw SQL retained: CREATE TABLE | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE TABLE IF NOT EXISTS agent_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        agent_key TEXT NOT NULL,
        spawned_by TEXT NOT NULL DEFAULT 'trinity',
        task_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        input_payload JSONB NOT NULL DEFAULT '{}',
        output_payload JSONB,
        completion_score INTEGER,
        confidence_level INTEGER,
        flags JSONB,
        trinity_evaluation TEXT,
        evaluation_result TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 2,
        related_entity_type TEXT,
        related_entity_id UUID,
        spawned_at TIMESTAMP NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP,
        evaluated_at TIMESTAMP
      )
    `);

    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS agent_tasks_workspace_idx ON agent_tasks(workspace_id)
    `);
    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS agent_tasks_status_idx ON agent_tasks(status)
    `);
    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS agent_tasks_agent_key_idx ON agent_tasks(agent_key)
    `);

    // CATEGORY C — Raw SQL retained: CREATE TABLE | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE TABLE IF NOT EXISTS agent_task_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_task_id UUID NOT NULL,
        workspace_id UUID NOT NULL,
        log_type TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB,
        logged_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS agent_task_logs_task_idx ON agent_task_logs(agent_task_id)
    `);
    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS agent_task_logs_workspace_idx ON agent_task_logs(workspace_id)
    `);

    log.info('[AgentSpawner] Tables initialized: agent_registry, agent_tasks, agent_task_logs');
  } catch (err) {
    log.error('[AgentSpawner] Table initialization error:', err);
    throw err;
  }
}

// ============================================================================
// PHASE 2 — SEED DEFAULT AGENTS (ON CONFLICT DO NOTHING, additive)
// ============================================================================

const DEFAULT_AGENTS: Array<{
  agentKey: string;
  agentName: string;
  domain: string;
  systemPrompt: string;
  completionCriteria: { min_score: number };
}> = [
  {
    agentKey: 'compliance_agent',
    agentName: 'Compliance Agent',
    domain: 'Regulatory compliance, document review, post order verification, licensing requirements',
    completionCriteria: { min_score: 78 },
    systemPrompt: `You are a compliance specialist for private security operations. You review documents, contracts, post orders, and employee records against applicable regulatory requirements. You return structured findings with specific violation citations, severity ratings (critical/major/minor), and remediation recommendations. You do not approve or deny — you analyze and report. Your output must match the defined output schema exactly. Return ONLY valid JSON, no preamble, no markdown.`,
  },
  {
    agentKey: 'schedule_agent',
    agentName: 'Schedule Agent',
    domain: 'Shift coverage optimization, scheduling logic, gap analysis, headcount forecasting',
    completionCriteria: { min_score: 75 },
    systemPrompt: `You are a scheduling optimization specialist for security operations. You analyze shift requirements, available personnel, certifications, and coverage gaps. You return an optimized coverage proposal with confidence score, identified conflicts, and alternative options if primary proposal has risk. Your output must match the defined output schema exactly. Return ONLY valid JSON, no preamble, no markdown.`,
  },
  {
    agentKey: 'finance_agent',
    agentName: 'Finance Agent',
    domain: 'Invoice processing, payroll reconciliation, billing discrepancy analysis, hours verification',
    completionCriteria: { min_score: 80 },
    systemPrompt: `You are a financial reconciliation specialist for security company operations. You process invoice data, verify hours worked against schedule records, identify billing discrepancies, and return reconciled payloads ready for approval. You flag any mathematical inconsistencies, missing data, or anomalies. Your output must match the defined output schema exactly. Return ONLY valid JSON, no preamble, no markdown.`,
  },
  {
    agentKey: 'legal_agent',
    agentName: 'Legal Agent',
    domain: 'Incident liability assessment, use-of-force documentation review, risk exposure analysis',
    completionCriteria: { min_score: 80 },
    systemPrompt: `You are a legal risk assessment specialist for private security operations. You review incident reports, use-of-force documentation, and related records to assess liability exposure. You return a structured risk assessment with severity classification, documentation gaps, and recommended protective actions. You do not provide legal advice — you provide structured risk data for management review. Your output must match the defined output schema exactly. Return ONLY valid JSON, no preamble, no markdown.`,
  },
  {
    agentKey: 'hiring_agent',
    agentName: 'Hiring Agent',
    domain: 'Applicant scoring, interview evaluation, liability assessment for new hires',
    completionCriteria: { min_score: 75 },
    systemPrompt: `You are a hiring evaluation specialist for security company staffing. You score interview transcripts, evaluate applicant responses against role requirements, assess liability indicators, and produce structured applicant summaries for management review. You apply consistent scoring criteria across all applicants. Your output must match the defined output schema exactly. Return ONLY valid JSON, no preamble, no markdown.`,
  },
  {
    agentKey: 'incident_agent',
    agentName: 'Incident Agent',
    domain: 'Incident report processing, timeline extraction, severity classification, structured documentation',
    completionCriteria: { min_score: 75 },
    systemPrompt: `You are an incident documentation specialist for security operations. You process raw incident reports and extract structured data: parties involved, precise timeline, actions taken, witnesses, property involved, severity classification, and required follow-up actions. You return a clean structured payload ready for Trinity to file or escalate. Your output must match the defined output schema exactly. Return ONLY valid JSON, no preamble, no markdown.`,
  },
  {
    agentKey: 'audit_agent',
    agentName: 'Audit Agent',
    domain: 'Systematic workspace audits, record gap analysis, compliance coverage verification',
    completionCriteria: { min_score: 78 },
    systemPrompt: `You are a systematic audit specialist for security company operations. You perform structured reviews across defined scopes — employee records, billing cycles, client documentation, scheduling coverage — and return gap analysis reports with severity ratings and prioritized remediation lists. Your output must match the defined output schema exactly. Return ONLY valid JSON, no preamble, no markdown.`,
  },
];

export async function seedDefaultAgents(): Promise<void> {
  try {
    for (const agent of DEFAULT_AGENTS) {
      // Converted to Drizzle ORM: ON CONFLICT → onConflictDoNothing
      await db.insert(agentRegistry).values({
        agentKey: agent.agentKey,
        agentName: agent.agentName,
        domain: agent.domain,
        systemPrompt: agent.systemPrompt,
        completionCriteria: agent.completionCriteria,
        isDefault: true,
        workspaceId: null,
      }).onConflictDoNothing();
    }
    log.info('[AgentSpawner] Seeded 7 default platform agents');
  } catch (err) {
    log.error('[AgentSpawner] Seed error:', err);
  }
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

async function logTask(
  agentTaskId: string,
  workspaceId: string,
  logType: string,
  message: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    // CATEGORY C — Raw SQL retained: AI brain engine task logging INSERT | Tables: agent_task_logs | Verified: 2026-03-23
    await typedPoolExec(
      `INSERT INTO agent_task_logs (agent_task_id, workspace_id, log_type, message, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [agentTaskId, workspaceId, logType, message, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    log.error('[AgentSpawner] Log write error:', err);
  }
}

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

function repairTruncatedJson(text: string): string {
  const stripped = stripMarkdownFences(text);
  try {
    JSON.parse(stripped);
    return stripped;
  } catch {
    let repaired = stripped;
    // Close open brackets
    const opens = (repaired.match(/\{/g) || []).length;
    const closes = (repaired.match(/\}/g) || []).length;
    const arrOpens = (repaired.match(/\[/g) || []).length;
    const arrCloses = (repaired.match(/\]/g) || []).length;

    if (arrOpens > arrCloses) repaired += ']'.repeat(arrOpens - arrCloses);
    if (opens > closes) repaired += '}'.repeat(opens - closes);

    try {
      JSON.parse(repaired);
      return repaired;
    } catch {
      return stripped;
    }
  }
}

function getManagementNotificationUserId(workspaceId: string): string {
  // Send to system user — universalNotificationEngine will route to workspace management
  return 'system';
}

// ============================================================================
// PHASE 3 — SPAWN ENGINE
// ============================================================================

/**
 * Spawn a single domain-specialized agent for a task.
 * Looks up agent from registry, calls AI with scoped system prompt,
 * parses and validates response, immediately evaluates payload.
 */
export async function spawnAgent(params: {
  workspaceId: string;
  agentKey: string;
  taskType: string;
  inputPayload: Record<string, unknown>;
  relatedEntityType?: string;
  relatedEntityId?: string;
  spawnedBy?: string;
}): Promise<AgentTask> {
  const {
    workspaceId,
    agentKey,
    taskType,
    inputPayload,
    relatedEntityType,
    relatedEntityId,
    spawnedBy = 'trinity',
  } = params;

  // Step 1: Look up agent from registry (workspace-scoped first, then global defaults)
  const agentResult = await pool.query<AgentRegistry & Record<string, unknown>>(
    `SELECT id, workspace_id, agent_key, agent_name, domain, system_prompt,
            input_schema, output_schema, completion_criteria, is_default, is_active
     FROM agent_registry
     WHERE agent_key = $1
       AND is_active = true
       AND (workspace_id = $2 OR workspace_id IS NULL)
     ORDER BY (workspace_id = $2) DESC NULLS LAST
     LIMIT 1`,
    [agentKey, workspaceId]
  );

  if (agentResult.rows.length === 0) {
    const errMsg = `Agent '${agentKey}' not found or inactive for workspace ${workspaceId}`;
    log.error(`[AgentSpawner] ${errMsg}`);

    // Create a failed task record
    const failedResult = await pool.query<{ id: string }>(
      `INSERT INTO agent_tasks
         (workspace_id, agent_key, spawned_by, task_type, status, input_payload,
          related_entity_type, related_entity_id)
       VALUES ($1, $2, $3, $4, 'failed', $5, $6, $7)
       RETURNING id`,
      [
        workspaceId, agentKey, spawnedBy, taskType,
        JSON.stringify(inputPayload),
        relatedEntityType || null,
        relatedEntityId || null,
      ]
    );
    const taskId = failedResult.rows[0].id;
    await logTask(taskId, workspaceId, 'spawn', `Agent lookup failed: ${errMsg}`);
    return fetchTask(taskId);
  }

  const agentRow = agentResult.rows[0];
  const completionCriteria = typeof agentRow.completion_criteria === 'string'
    ? JSON.parse(agentRow.completion_criteria as string)
    : agentRow.completion_criteria as { min_score: number };

  // Step 2: Create agent_tasks record with status = 'pending'
  const taskResult = await pool.query<{ id: string }>(
    `INSERT INTO agent_tasks
       (workspace_id, agent_key, spawned_by, task_type, status, input_payload,
        related_entity_type, related_entity_id)
     VALUES ($1, $2, $3, $4, 'in_progress', $5, $6, $7)
     RETURNING id`,
    [
      workspaceId, agentKey, spawnedBy, taskType,
      JSON.stringify(inputPayload),
      relatedEntityType || null,
      relatedEntityId || null,
    ]
  );
  const taskId = taskResult.rows[0].id;

  // Step 3: Log spawn event
  await logTask(taskId, workspaceId, 'spawn', `Spawning ${agentRow.agent_name} for task: ${taskType}`, {
    agentKey,
    taskType,
    spawnedBy,
    inputPayloadKeys: Object.keys(inputPayload),
  });

  // Step 4–5: Build and call AI
  const userPrompt = `${JSON.stringify(inputPayload, null, 2)}

Return ONLY valid JSON (no markdown, no preamble). Your response must include:
- completion_score (integer 0-100): how well you completed this task
- confidence_level (integer 0-100): your confidence in the results
- flags (array): any critical/major/minor issues found (empty array if none)
- All task-specific fields as described in your instructions`;

  let aiResult;
  try {
    aiResult = await meteredGemini.generate({
      workspaceId,
      featureKey: `agent_spawn_${agentKey}_${taskType}`,
      prompt: userPrompt,
      systemInstruction: agentRow.system_prompt as string,
      model: 'gemini-2.5-flash',
      temperature: 0.3,
      maxOutputTokens: 2048,
    });
  } catch (aiErr) {
    const errMsg = `AI call failed: ${aiErr instanceof Error ? aiErr.message : String(aiErr)}`;
    // Converted to Drizzle ORM
    await db.update(agentTasks)
      .set({ status: 'failed', completedAt: sql`now()` })
      .where(eq(agentTasks.id, taskId));
    await logTask(taskId, workspaceId, 'return', errMsg);
    return fetchTask(taskId);
  }

  // Step 6–7: Parse and validate response
  const rawText = repairTruncatedJson(aiResult.text);
  let outputPayload: Record<string, unknown>;
  try {
    outputPayload = JSON.parse(rawText);
  } catch {
    // Converted to Drizzle ORM
    await db.update(agentTasks)
      .set({ status: 'failed', completedAt: sql`now()` })
      .where(eq(agentTasks.id, taskId));
    await logTask(taskId, workspaceId, 'return', 'Failed to parse agent output as JSON', { rawText: rawText.slice(0, 500) });
    return fetchTask(taskId);
  }

  const completionScore = typeof outputPayload.completion_score === 'number'
    ? outputPayload.completion_score
    : null;
  const confidenceLevel = typeof outputPayload.confidence_level === 'number'
    ? outputPayload.confidence_level
    : null;
  const flags = Array.isArray(outputPayload.flags) ? outputPayload.flags : [];

  // Converted to Drizzle ORM
  await db.update(agentTasks)
    .set({
      status: 'complete',
      outputPayload,
      completionScore,
      confidenceLevel,
      flags,
      completedAt: sql`now()`,
    })
    .where(eq(agentTasks.id, taskId));

  // Step 9: Log return event
  await logTask(taskId, workspaceId, 'return', `Agent returned with score ${completionScore}`, {
    completionScore,
    confidenceLevel,
    flagCount: flags.length,
    agentName: agentRow.agent_name,
  });

  // Step 10: Immediately evaluate
  return evaluateAgentPayload(taskId);
}

/**
 * Evaluate a returned agent payload against completion criteria.
 * Branches on 4 outcomes: approved | re_tasked | escalated_to_helpai | escalated_to_management
 */
export async function evaluateAgentPayload(taskId: string): Promise<AgentTask> {
  // Step 1: Fetch task and agent registry
  const taskResult = await pool.query<Record<string, unknown>>(
    `SELECT t.*, r.completion_criteria, r.agent_name
     FROM agent_tasks t
     LEFT JOIN agent_registry r
       ON t.agent_key = r.agent_key
       AND (r.workspace_id = t.workspace_id OR r.workspace_id IS NULL)
     WHERE t.id = $1
     ORDER BY (r.workspace_id = t.workspace_id) DESC NULLS LAST
     LIMIT 1`,
    [taskId]
  );

  if (taskResult.rows.length === 0) {
    throw new Error(`[AgentSpawner] evaluateAgentPayload: task ${taskId} not found`);
  }

  const row = taskResult.rows[0];
  const workspaceId = row.workspace_id as string;
  const agentKey = row.agent_key as string;
  const taskType = row.task_type as string;
  const agentName = (row.agent_name as string) || agentKey;
  const retryCount = (row.retry_count as number) || 0;
  const maxRetries = (row.max_retries as number) || 2;
  const completionScore = row.completion_score as number | null;
  const flags = Array.isArray(row.flags) ? row.flags : (row.flags ? JSON.parse(row.flags as string) : []);
  const spawnedBy = row.spawned_by as string;
  const inputPayload = typeof row.input_payload === 'string'
    ? JSON.parse(row.input_payload as string)
    : row.input_payload as Record<string, unknown>;
  const relatedEntityType = row.related_entity_type as string | null;
  const relatedEntityId = row.related_entity_id as string | null;

  const rawCriteria = row.completion_criteria;
  const criteria: { min_score: number } = typeof rawCriteria === 'string'
    ? JSON.parse(rawCriteria as string)
    : (rawCriteria as { min_score: number }) || { min_score: 75 };

  const minScore = criteria.min_score || 75;
  const hasCriticalFlags = flags.some(
    (f: unknown) => typeof f === 'object' && f !== null && (f as Record<string, unknown>).severity === 'critical'
  );

  let evaluationResult: AgentTask['evaluationResult'];
  let newStatus: AgentTask['status'];
  let trinityEvaluation: string;

  if (completionScore === null || completionScore === undefined) {
    // No score returned — treat as failed/re-task
    if (retryCount < maxRetries) {
      evaluationResult = null;
      newStatus = 're_tasked';
      trinityEvaluation = `Agent returned no completion_score. Auto-retasking (attempt ${retryCount + 1}/${maxRetries}).`;
    } else {
      evaluationResult = 'escalated_to_management';
      newStatus = 'escalated';
      trinityEvaluation = `Agent failed to return a valid completion_score after ${retryCount} retries. Manual review required.`;
    }
  } else if (completionScore >= minScore && !hasCriticalFlags) {
    // APPROVED PATH
    evaluationResult = 'approved';
    newStatus = 'complete';
    trinityEvaluation = `Agent scored ${completionScore}/${minScore} threshold with no critical flags. Payload approved and forwarded to Trinity orchestration.`;
  } else if (completionScore >= minScore && hasCriticalFlags) {
    // ESCALATE TO HELPAI (borderline — score ok but critical flags)
    evaluationResult = 'escalated_to_helpai';
    newStatus = 'escalated';
    trinityEvaluation = `Agent scored ${completionScore} (above ${minScore} threshold) but returned ${flags.filter((f: unknown) => typeof f === 'object' && f !== null && (f as Record<string, unknown>).severity === 'critical').length} critical flag(s). Escalating to HelpAI for secondary review.`;
  } else if (completionScore < minScore && retryCount < maxRetries) {
    // RE-TASK
    evaluationResult = null;
    newStatus = 're_tasked';
    trinityEvaluation = `Agent scored ${completionScore} (below ${minScore} threshold). Auto-retasking (attempt ${retryCount + 1}/${maxRetries}).`;
  } else {
    // ESCALATE TO MANAGEMENT (exhausted retries)
    evaluationResult = 'escalated_to_management';
    newStatus = 'escalated';
    trinityEvaluation = `Agent scored ${completionScore} (below ${minScore} threshold) after ${retryCount} retries. Escalating to management for manual review.`;
  }

  // Converted to Drizzle ORM
  await db.update(agentTasks)
    .set({
      trinityEvaluation,
      evaluationResult,
      status: newStatus,
      evaluatedAt: sql`now()`,
    })
    .where(eq(agentTasks.id, taskId));
  await logTask(taskId, workspaceId, 'evaluation', trinityEvaluation, { evaluationResult, completionScore });

  // Branch actions
  const task = await fetchTask(taskId);

  if (evaluationResult === 'approved') {
    notifyTrinityApproval(task);
  } else if (evaluationResult === 'escalated_to_helpai') {
    await logTask(taskId, workspaceId, 'escalation', `Escalating to HelpAI for secondary evaluation`);
    try {
      const { helpAIHandleEscalatedPayload } = await import('../helpai/helpAIOrchestrator');
      await helpAIHandleEscalatedPayload({
        taskId,
        agentKey,
        outputPayload: task.outputPayload || {},
        completionScore: completionScore || 0,
        flags,
      });
    } catch (err) {
      log.error('[AgentSpawner] HelpAI escalation error:', err);
      await logTask(taskId, workspaceId, 'escalation', `HelpAI escalation error — notifying management`, { error: String(err) });
      await sendManagementEscalation(task, agentName, taskType, workspaceId);
    }
  } else if (newStatus === 're_tasked') {
    // CATEGORY C — Raw SQL retained: AI brain engine self-referencing arithmetic increment (retry_count + 1) | Tables: agent_tasks | Verified: 2026-03-23
    await typedPoolExec(
      `UPDATE agent_tasks SET retry_count = retry_count + 1 WHERE id = $1`,
      [taskId]
    );
    await logTask(taskId, workspaceId, 'retry', `Retrying agent spawn (retry ${retryCount + 1}/${maxRetries})`);
    try {
      await spawnAgent({
        workspaceId,
        agentKey,
        taskType,
        inputPayload,
        relatedEntityType: relatedEntityType || undefined,
        relatedEntityId: relatedEntityId || undefined,
        spawnedBy,
      });
    } catch (retryErr) {
      log.error('[AgentSpawner] Retry spawn error:', retryErr);
    }
  } else if (evaluationResult === 'escalated_to_management') {
    await sendManagementEscalation(task, agentName, taskType, workspaceId);
  }

  return task;
}

async function sendManagementEscalation(
  task: AgentTask,
  agentName: string,
  taskType: string,
  workspaceId: string
): Promise<void> {
  await logTask(task.id, workspaceId, 'escalation', `Escalating to management: ${taskType}`, {
    agentName,
    completionScore: task.completionScore,
    retryCount: task.retryCount,
  });

  try {
    await universalNotificationEngine.sendNotification({
      workspaceId,
      userId: 'system',
      idempotencyKey: `notif-${Date.now()}`,
          type: 'issue_detected',
      title: `Trinity Agent Review Required: ${taskType}`,
      message: `Trinity was unable to complete "${taskType}" automatically via ${agentName}. Manual review required.`,
      severity: 'warning',
      actionUrl: '/ai/command-center',
      metadata: {
        agentTaskId: task.id,
        agentKey: task.agentKey,
        taskType,
        completionScore: task.completionScore,
        retryCount: task.retryCount,
      },
    });
  } catch (notifErr) {
    log.error('[AgentSpawner] Management notification error:', notifErr);
  }
}

/**
 * Spawn multiple agents in true parallel (Promise.all).
 */
export async function spawnParallelAgents(params: {
  workspaceId: string;
  tasks: Array<{
    agentKey: string;
    taskType: string;
    inputPayload: Record<string, unknown>;
    relatedEntityType?: string;
    relatedEntityId?: string;
  }>;
  spawnedBy?: string;
}): Promise<AgentTask[]> {
  const { workspaceId, tasks, spawnedBy = 'trinity' } = params;

  log.info(`[AgentSpawner] spawnParallelAgents: spawning ${tasks.length} agents in parallel for workspace ${workspaceId}`);

  const results = await Promise.all(
    tasks.map((task) =>
      spawnAgent({
        workspaceId,
        agentKey: task.agentKey,
        taskType: task.taskType,
        inputPayload: task.inputPayload,
        relatedEntityType: task.relatedEntityType,
        relatedEntityId: task.relatedEntityId,
        spawnedBy,
      })
    )
  );

  log.info(`[AgentSpawner] spawnParallelAgents: completed ${results.length} agents`);
  return results;
}

/**
 * Notify Trinity orchestration that a payload was approved.
 * Uses platformEventBus (existing dispatch pattern — no new patterns introduced).
 */
export function notifyTrinityApproval(task: AgentTask): void {
  try {
    platformEventBus.publish({
      type: 'agent_task_approved',
      title: `Agent Task Approved: ${task.taskType}`,
      workspaceId: task.workspaceId,
      metadata: {
        agentKey: task.agentKey,
        taskId: task.id,
        taskType: task.taskType,
        outputPayload: task.outputPayload,
        relatedEntityType: task.relatedEntityType,
        relatedEntityId: task.relatedEntityId,
        completionScore: task.completionScore,
        evaluationResult: task.evaluationResult,
      },
    }).catch((err) => log.warn('[agentSpawner] Fire-and-forget failed:', err));
    log.info(`[AgentSpawner] notifyTrinityApproval: published agent_task_approved for ${task.agentKey}/${task.taskType}`);
  } catch (err) {
    log.error('[AgentSpawner] notifyTrinityApproval error:', err);
  }
}

// ============================================================================
// INTERNAL: Fetch full task record from DB
// ============================================================================

async function fetchTask(taskId: string): Promise<AgentTask> {
  const result = await pool.query<Record<string, unknown>>(
    `SELECT * FROM agent_tasks WHERE id = $1`,
    [taskId]
  );
  if (result.rows.length === 0) {
    throw new Error(`[AgentSpawner] fetchTask: task ${taskId} not found`);
  }
  const row = result.rows[0];
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    agentKey: row.agent_key as string,
    spawnedBy: row.spawned_by as string,
    taskType: row.task_type as string,
    status: row.status as AgentTask['status'],
    inputPayload: typeof row.input_payload === 'string'
      ? JSON.parse(row.input_payload as string)
      : row.input_payload as Record<string, unknown>,
    outputPayload: row.output_payload
      ? (typeof row.output_payload === 'string'
        ? JSON.parse(row.output_payload as string)
        : row.output_payload as Record<string, unknown>)
      : null,
    completionScore: row.completion_score as number | null,
    confidenceLevel: row.confidence_level as number | null,
    flags: row.flags
      ? (typeof row.flags === 'string' ? JSON.parse(row.flags as string) : row.flags as unknown[])
      : null,
    trinityEvaluation: row.trinity_evaluation as string | null,
    evaluationResult: row.evaluation_result as AgentTask['evaluationResult'],
    retryCount: row.retry_count as number,
    maxRetries: row.max_retries as number,
    relatedEntityType: row.related_entity_type as string | null,
    relatedEntityId: row.related_entity_id as string | null,
    spawnedAt: row.spawned_at as Date,
    completedAt: row.completed_at as Date | null,
    evaluatedAt: row.evaluated_at as Date | null,
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export async function initializeAgentSpawner(): Promise<void> {
  await initAgentTables();
  await seedDefaultAgents();
  log.info('[AgentSpawner] Agent Spawning System initialized');
}
