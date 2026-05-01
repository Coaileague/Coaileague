/**
 * SHIFT CHATROOM BOT PROCESSOR
 * ==============================
 * ReportBot intelligence layer for the shift_chatrooms / shift_chatroom_messages system.
 *
 * Called from shiftChatroomWorkflowService.sendMessage() after every officer message.
 * Handles:
 *   /incident  → structured 9-question Q&A flow → saved to incident_reports DB
 *   /endshift  → triggers shiftChatroomWorkflowService.endShift() pipeline
 *   /report    → logs an activity entry (acknowledged + forwarded to DAR)
 *   keywords   → intelligent ReportBot prompts (fight, police, wet floor, etc.)
 *   photos     → GPS acknowledgment (handled via chat-uploads; this adds context)
 *
 * Writes bot responses directly to shift_chatroom_messages (not general chat_messages).
 */

import { db } from '../../db';
import { pool } from '../../db';
import {
  shiftChatroomMessages,
  shiftChatrooms,
  shifts,
  employees,
  incidentReports,
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { format } from 'date-fns';
import crypto from 'crypto';
import { botAIService } from '../../bots/botAIService';
import { typedExec, typedQuery } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('shiftChatroomBotProcessor');


// ── In-memory state ──────────────────────────────────────────────────────────

interface IncidentFlow {
  step: number;
  responses: string[];
  startedAt: Date;
  reporterName: string;
  shiftId: string | null;
  workspaceId: string;
}

// keyed by chatroomId — primary cache; DB is source-of-truth after restarts
const incidentFlowMap = new Map<string, IncidentFlow>();

// ── DB persistence helpers ────────────────────────────────────────────────────

async function saveFlowToDB(chatroomId: string, flow: IncidentFlow): Promise<void> {
  try {
    // CATEGORY C — Raw SQL retained: ::jsonb | Tables: shift_chatrooms | Verified: 2026-03-23
    await typedExec(sql`
      UPDATE shift_chatrooms
      SET incident_flow_state = ${JSON.stringify(flow)}::jsonb,
          updated_at = NOW()
      WHERE id = ${chatroomId}
    `);
  } catch (err: unknown) {
    log.error('[BotProcessor] Failed to persist incident flow to DB:', (err instanceof Error ? err.message : String(err))?.slice(0, 120));
  }
}

async function loadFlowFromDB(chatroomId: string): Promise<IncidentFlow | null> {
  try {
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: shift_chatrooms | Verified: 2026-03-23
    const rows = await typedQuery(sql`
      SELECT incident_flow_state FROM shift_chatrooms WHERE id = ${chatroomId} LIMIT 1
    `);
    const row = rows[0] as any;
    if (!row || !row.incident_flow_state) return null;
    const state = typeof row.incident_flow_state === 'string'
      ? JSON.parse(row.incident_flow_state)
      : row.incident_flow_state;
    // Restore Date object
    if (state?.startedAt) state.startedAt = new Date(state.startedAt);
    return state as IncidentFlow;
  } catch {
    return null;
  }
}

async function clearFlowFromDB(chatroomId: string): Promise<void> {
  try {
    // Converted to Drizzle ORM
    await db.update(shiftChatrooms).set({
      incidentFlowState: null,
      updatedAt: sql`now()`,
    }).where(eq(shiftChatrooms.id, chatroomId));
  } catch {
    // non-fatal
  }
}

// ── Keyword lists ─────────────────────────────────────────────────────────────

const INCIDENT_KEYWORDS = [
  'fight', 'fighting', 'assault', 'hit', 'punch', 'kick', 'shove',
  'weapon', 'gun', 'knife', 'taser', 'pepper spray',
  'police', 'cops', '911', 'ambulance', 'ems', 'fire',
  'injury', 'injured', 'hurt', 'blood', 'unconscious',
  'theft', 'stolen', 'shoplifting', 'robbery',
  'trespass', 'trespassing', 'banned', 'eviction',
  'damage', 'broken', 'vandalism', 'graffiti',
  'suspicious', 'threat', 'threatening',
  'force', 'restrain', 'handcuff', 'detain',
  'complaint', 'harassing', 'harassment',
];

const HAZARD_KEYWORDS = [
  'wet floor', 'spill', 'slip', 'hazard', 'smoke',
  'medical', 'choking', 'heart attack', 'seizure', 'fall',
];

const FIGHT_KEYWORDS = ['fight', 'fighting', 'assault', 'punch', 'kick', 'shove', 'hit'];
const POLICE_KEYWORDS = ['police', 'cops', '911', 'ambulance', 'ems', 'sapd', 'sheriff'];
const WET_FLOOR_KEYWORDS = ['wet floor', 'spill', 'slip', 'hazard'];

// ── 9-question incident flow ──────────────────────────────────────────────────

const INCIDENT_QUESTIONS = [
  'What time did the incident occur? (e.g., 14:17)',
  'Where exactly did it occur? (be specific — which entrance, section, nearest landmark)',
  'Describe what happened in detail. Be thorough.',
  'Who was involved? Describe each person: age, gender, physical description, clothing. Any names or IDs?',
  'Was any use of force required? If yes — describe exactly what force was used and why.',
  'Were police or emergency services contacted? If yes: agency name, officer name, badge number, and case/report number.',
  'Were there any injuries? If yes, describe injuries and whether medical attention was provided.',
  'What evidence was collected or preserved? (photos, video, witnesses, names)',
  'What is the current status? (resolved / ongoing / pending police follow-up)',
];

// ── DB write helpers ──────────────────────────────────────────────────────────

async function sendBotResponse(
  chatroomId: string,
  workspaceId: string,
  content: string,
  botEvent: string,
  extraMeta: Record<string, unknown> = {}
): Promise<void> {
  try {
    await db.insert(shiftChatroomMessages).values({
      id: crypto.randomUUID(),
      workspaceId,
      chatroomId,
      userId: 'reportbot',
      content,
      messageType: 'system',
      isAuditProtected: false,
      metadata: { botEvent, isBot: true, ...extraMeta },
    });

    // Broadcast via WebSocket non-blocking
    (async () => {
      try {
        const { broadcastToWorkspace } = await import('../../websocket');
        broadcastToWorkspace(workspaceId, {
          type: 'shift_chatroom_message',
          chatroomId,
          message: {
            userId: 'reportbot',
            senderName: 'ReportBot',
            content,
            messageType: 'system',
            isBot: true,
            createdAt: new Date().toISOString(),
          },
        });
      } catch { /* WebSocket best-effort */ }
    })();
  } catch (err) {
    log.error('[ShiftChatroomBot] Failed to send bot response:', err);
  }
}

// ── Welcome message ───────────────────────────────────────────────────────────

export async function sendWelcomeMessage(
  chatroomId: string,
  workspaceId: string,
  officerName: string,
  clientName: string,
  siteAddress: string,
  shiftStart: Date,
  shiftEnd: Date
): Promise<void> {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const content =
    `${greeting}, ${officerName}. I'm ReportBot — your shift documentation assistant.\n\n` +
    `I'll be monitoring this shift and helping you build your Daily Activity Report.\n\n` +
    `Here's how to use me:\n` +
    `/report [description] — Log any routine activity or observation\n` +
    `/incident [description] — Report an incident requiring documentation\n` +
    `Send photos any time — I'll include them in your report with location and time\n` +
    `/endshift — Generate your completed DAR when your shift is done\n\n` +
    `I'm also listening for keywords that suggest something reportable. If I notice you may have an incident to document, I'll ask you about it.\n\n` +
    `Shift details:\n` +
    `Client: ${clientName}\n` +
    `Location: ${siteAddress || 'On file'}\n` +
    `Your shift: ${format(shiftStart, 'HH:mm')} — ${format(shiftEnd, 'HH:mm')}\n` +
    `Today's date: ${format(new Date(), 'MMMM d, yyyy')}\n\n` +
    `Stay safe out there.`;

  await sendBotResponse(chatroomId, workspaceId, content, 'reportbot_welcome');
}

// ── Main processor ────────────────────────────────────────────────────────────

export async function processShiftChatroomMessage(
  chatroomId: string,
  workspaceId: string,
  userId: string,
  senderName: string,
  content: string,
  shiftId: string | null
): Promise<void> {
  const msg = content.trim();

  // ── /cancel during incident flow ─────────────────────────────────────────
  if (/^\/cancel\b/i.test(msg)) {
    const hasFlow = incidentFlowMap.has(chatroomId) || !!(await loadFlowFromDB(chatroomId));
    if (hasFlow) {
      incidentFlowMap.delete(chatroomId);
      await clearFlowFromDB(chatroomId);
      await sendBotResponse(chatroomId, workspaceId,
        'Incident report cancelled. No report was filed.',
        'incident_flow_cancelled');
    }
    return;
  }

  // ── Continue active incident flow ─────────────────────────────────────────
  // Check in-memory first; fall back to DB (handles post-restart recovery)
  let activeFlow = incidentFlowMap.get(chatroomId);
  if (!activeFlow) {
    const dbFlow = await loadFlowFromDB(chatroomId);
    if (dbFlow) {
      incidentFlowMap.set(chatroomId, dbFlow); // restore to in-memory
      activeFlow = dbFlow;
    }
  }
  if (activeFlow) {
    await continueIncidentFlow(chatroomId, workspaceId, senderName, msg, activeFlow, shiftId);
    return;
  }

  // ── /incident command ─────────────────────────────────────────────────────
  if (/^\/incident\b/i.test(msg)) {
    await startIncidentFlow(chatroomId, workspaceId, senderName, shiftId);
    return;
  }

  // ── /endshift command ─────────────────────────────────────────────────────
  if (/^\/endshift\b/i.test(msg)) {
    await handleEndShift(chatroomId, workspaceId, shiftId);
    return;
  }

  // ── /report command — log routine activity ────────────────────────────────
  if (/^\/report\b/i.test(msg)) {
    const description = msg.replace(/^\/report\s*/i, '').trim();
    await sendBotResponse(
      chatroomId, workspaceId,
      `Activity logged: "${description || '(no description)'}"\n\nThis has been added to your Daily Activity Report.`,
      'report_logged',
      { description }
    );
    return;
  }

  // ── Keyword detection ─────────────────────────────────────────────────────
  const msgLower = msg.toLowerCase();

  const hasFight = FIGHT_KEYWORDS.some(kw => msgLower.includes(kw));
  const hasPolice = POLICE_KEYWORDS.some(kw => msgLower.includes(kw));
  const hasHazard = WET_FLOOR_KEYWORDS.some(kw => msgLower.includes(kw));
  const hasIncidentKw = INCIDENT_KEYWORDS.some(kw => msgLower.includes(kw));

  if (hasFight) {
    await sendBotResponse(
      chatroomId, workspaceId,
      `It sounds like you may have an incident to document.\n\n` +
      `I want to make sure we capture everything correctly.\n` +
      `Please use /incident to formally log this, or answer these questions:\n\n` +
      `1. What time did this start?\n` +
      `2. How many people were involved?\n` +
      `3. Can you describe the individuals? (age, gender, clothing)\n` +
      `4. What happened exactly? (be specific about actions)\n` +
      `5. Was any physical force used?\n` +
      `6. Were police called? If yes, badge number and case number?\n` +
      `7. Any injuries? Medical attention needed?\n` +
      `8. Any witnesses?\n\n` +
      `Take your time — accuracy matters here.`,
      'keyword_fight_detected'
    );
    return;
  }

  if (hasPolice && !hasFight) {
    await sendBotResponse(
      chatroomId, workspaceId,
      `I see police may be involved. When you have a moment, please provide:\n` +
      `Police agency name (e.g., SAPD, Sheriff)\n` +
      `Responding officer name and badge number\n` +
      `Incident/report case number\n` +
      `Time police arrived and time they cleared\n\n` +
      `This information is required for your incident report. Use /incident to formally document.`,
      'keyword_police_detected'
    );
    return;
  }

  if (hasHazard) {
    await sendBotResponse(
      chatroomId, workspaceId,
      `Hazard noted. Quick documentation:\n` +
      `1. Exact location of hazard?\n` +
      `2. Was management or maintenance notified? Time?\n` +
      `3. Was it resolved before you left the area?\n` +
      `4. Any injuries related to this hazard?\n\n` +
      `Use /report to formally log this with a complete description.`,
      'keyword_hazard_detected'
    );
    return;
  }

  if (hasIncidentKw && !hasFight && !hasPolice && !hasHazard) {
    // Generic incident keyword — suggest /incident
    await sendBotResponse(
      chatroomId, workspaceId,
      `I noticed this may involve a reportable event. If this requires formal documentation, use /incident to start a structured incident report.\n\nType /incident [brief description] to begin.`,
      'keyword_incident_suggested'
    );
  }
}

// ── /incident flow ────────────────────────────────────────────────────────────

async function startIncidentFlow(
  chatroomId: string,
  workspaceId: string,
  reporterName: string,
  shiftId: string | null
): Promise<void> {
  const flow: IncidentFlow = {
    step: 0,
    responses: [],
    startedAt: new Date(),
    reporterName,
    shiftId,
    workspaceId,
  };
  incidentFlowMap.set(chatroomId, flow);
  await saveFlowToDB(chatroomId, flow); // persist so state survives restarts

  await sendBotResponse(
    chatroomId, workspaceId,
    `INCIDENT DOCUMENTATION\n` +
    `Let's make sure we capture everything. I'll ask you ${INCIDENT_QUESTIONS.length} questions to compile a complete, timestamped incident report. Type /cancel at any time to abort.\n\n` +
    `Question 1 of ${INCIDENT_QUESTIONS.length}: ${INCIDENT_QUESTIONS[0]}`,
    'incident_flow_start'
  );
}

async function continueIncidentFlow(
  chatroomId: string,
  workspaceId: string,
  senderName: string,
  answer: string,
  flow: IncidentFlow,
  shiftId: string | null
): Promise<void> {
  flow.responses.push(answer.trim());
  const nextStep = flow.step + 1;

  if (nextStep < INCIDENT_QUESTIONS.length) {
    flow.step = nextStep;
    await saveFlowToDB(chatroomId, flow); // persist progress after each answer
    await sendBotResponse(
      chatroomId, workspaceId,
      `Question ${nextStep + 1} of ${INCIDENT_QUESTIONS.length}: ${INCIDENT_QUESTIONS[nextStep]}`,
      'incident_flow_question',
      { step: nextStep }
    );
  } else {
    // All questions answered — compile, file, and clear state
    incidentFlowMap.delete(chatroomId);
    await clearFlowFromDB(chatroomId); // clear DB state on completion
    await compileAndFileIncidentReport(chatroomId, workspaceId, senderName, flow.responses, flow.shiftId || shiftId);
  }
}

async function compileAndFileIncidentReport(
  chatroomId: string,
  workspaceId: string,
  reporterName: string,
  responses: string[],
  shiftId: string | null
): Promise<void> {
  const labels = [
    'Time of incident',
    'Location',
    'Description',
    'Persons involved',
    'Use of force',
    'Police contact',
    'Injuries',
    'Evidence collected',
    'Current status',
  ];

  const reportLines = labels.map((label, i) => `${label}: ${responses[i] || 'Not provided'}`).join('\n');
  const timeNow = format(new Date(), 'MMM d, yyyy HH:mm');

  // Detect force use for flagging
  const forceResponse = (responses[4] || '').toLowerCase();
  const forceUsed = /yes|used|grabbed|took|restrained|takedown|physical|force/.test(forceResponse) &&
    !/no\b|none|not required/.test(forceResponse);

  // Detect police involvement
  const policeResponse = (responses[5] || '').toLowerCase();
  const policeInvolved = /yes|called|arrived|sapd|police|sheriff|ems|911|badge|case/.test(policeResponse) &&
    !/no\b|none|not called/.test(policeResponse);

  // AI-assisted professional language conversion (non-blocking, best-effort)
  let professionalSummary = reportLines;
  try {
    const aiResp = await botAIService.generate({
      botId: 'reportbot',
      workspaceId,
      action: 'cleanup',
      prompt:
        `You are a professional security report writer. Rewrite this incident report in professional security report language. ` +
        `Preserve all facts exactly. Fix spelling and grammar. Use formal third-person language.\n\n` +
        `${reportLines}\n\n` +
        `Return ONLY the professionally rewritten report text, no explanations.`,
      maxTokens: 1024,
    });
    if (aiResp.success && aiResp.text && aiResp.text.length > 50) {
      professionalSummary = aiResp.text;
    }
  } catch { /* AI non-blocking */ }

  // Save to incident_reports DB
  if (shiftId) {
    try {
      await db.insert(incidentReports).values({
        id: crypto.randomUUID(),
        workspaceId,
        shiftId,
        chatroomId,
        title: `Incident Report — ${reporterName} — ${timeNow}`,
        description: reportLines,
        incidentType: forceUsed ? 'use_of_force' : policeInvolved ? 'police_contact' : 'general',
        severity: forceUsed ? 'high' : 'medium',
        status: 'open',
        reportedBy: reporterName,
        occurredAt: new Date(),
      } as any);
    } catch (err: unknown) {
      log.warn('[ShiftChatroomBot] Incident DB save failed (non-blocking):', (err instanceof Error ? err.message : String(err)));
    }
  }

  // Post summary back in room
  let summaryContent =
    `Incident report complete. Here's what I have:\n\n` +
    `INCIDENT SUMMARY:\n${reportLines}\n\n` +
    `Filed by: ${reporterName}\n` +
    `Filed at: ${timeNow}\n`;

  if (forceUsed) {
    summaryContent += `\nUSE OF FORCE DETECTED — This report has been flagged for manager review. Your supervisor will review the force description for accuracy and liability considerations.`;
  }
  if (policeInvolved) {
    summaryContent += `\nPOLICE INVOLVEMENT DOCUMENTED — Ensure you have recorded the correct case/report number.`;
  }

  summaryContent += `\n\nThis incident has been saved and will be included in your shift DAR. Your supervisor has been notified.`;

  await sendBotResponse(
    chatroomId, workspaceId,
    summaryContent,
    'incident_report_complete',
    { reportLines, forceUsed, policeInvolved }
  );

  // Notify supervisors
  try {
    const { notifyManagers } = await import('./shiftChatroomBotNotifier');
    await notifyManagers(workspaceId, reporterName, 'incident_filed', summaryContent, chatroomId);
  } catch { /* notifier non-blocking */ }
}

// ── /endshift ─────────────────────────────────────────────────────────────────

async function handleEndShift(
  chatroomId: string,
  workspaceId: string,
  shiftId: string | null
): Promise<void> {
  await sendBotResponse(
    chatroomId, workspaceId,
    `End-of-shift command received. Running completeness check before compiling your Daily Activity Report...`,
    'endshift_triggered'
  );

  if (!shiftId) {
    await sendBotResponse(
      chatroomId, workspaceId,
      `Unable to locate shift record for this chatroom. Please contact your supervisor to generate the report manually.`,
      'endshift_no_shift'
    );
    return;
  }

  // Get shift context for completeness check
  try {
    const [chatroom] = await db.select().from(shiftChatrooms).where(eq(shiftChatrooms.id, chatroomId)).limit(1);
    if (!chatroom) {
      await sendBotResponse(chatroomId, workspaceId, 'Chatroom not found. Contact supervisor.', 'endshift_error');
      return;
    }

    // Check for missing info before generating
    const messages = await db.select().from(shiftChatroomMessages)
      .where(and(
        eq(shiftChatroomMessages.chatroomId, chatroomId)
      ))
      .orderBy(shiftChatroomMessages.createdAt);

    const officerMessages = messages.filter(m => {
      const meta = m.metadata as any;
      return m.userId !== 'reportbot' && m.messageType !== 'system' && !meta?.isBot;
    });

    const photoCount = messages.filter(m => m.messageType === 'photo').length;

    const incidentMessages = messages.filter(m => {
      const meta = m.metadata as any;
      return meta?.botEvent === 'incident_report_complete';
    });

    // Completeness check
    const missingItems: string[] = [];
    if (officerMessages.length === 0) missingItems.push('No activity messages logged during shift');
    if (photoCount === 0) missingItems.push('No photos documented (optional but recommended)');

    if (missingItems.length > 0) {
      await sendBotResponse(
        chatroomId, workspaceId,
        `Before I finalize your DAR, I noticed:\n\n${missingItems.map(i => `• ${i}`).join('\n')}\n\n` +
        `Generating DAR with available data. If you have additional information, reply now or type /endshift again to proceed.`,
        'completeness_check',
        { missingItems }
      );
      // Wait briefly then proceed (non-blocking DAR generation)
    }

    // Trigger DAR generation via workflow service
    (async () => {
      try {
        const { shiftChatroomWorkflowService } = await import('../shiftChatroomWorkflowService');
        const userId = messages.find(m => m.userId !== 'reportbot')?.userId || 'system';
        const result = await shiftChatroomWorkflowService.endShift(
          { workspaceId, shiftId, userId },
          'manual'
        );
        if (!result.success) {
          await sendBotResponse(
            chatroomId, workspaceId,
            `Report generation encountered an issue: ${result.error || 'Unknown error'}. Please contact your supervisor.`,
            'endshift_error'
          );
        }
      } catch (err: unknown) {
        log.error('[ShiftChatroomBot] endShift failed:', (err instanceof Error ? err.message : String(err)));
        await sendBotResponse(
          chatroomId, workspaceId,
          `Report generation encountered an error. Please contact your supervisor to pull the shift log manually.`,
          'endshift_error'
        );
      }
    })();
  } catch (err: unknown) {
    log.error('[ShiftChatroomBot] handleEndShift error:', (err instanceof Error ? err.message : String(err)));
    await sendBotResponse(chatroomId, workspaceId, 'End shift processing error. Contact supervisor.', 'endshift_error');
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

export const shiftChatroomBotProcessor = {
  processMessage: processShiftChatroomMessage,
  sendWelcomeMessage,
};
