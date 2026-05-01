/**
 * CLIENT PORTAL HELPAI SERVICE
 * ==============================
 * AI-powered DockChat for client portals. Clients submit billing discrepancies,
 * staff issues, complaints, and violations. HelpAI uses Trinity brain (via
 * costOptimizedRouter) to attempt autonomous resolution every turn, escalating to
 * a human only when AI confidence is insufficient.
 *
 * Credit model: 10 credits per session, charged to the org's credit pool.
 * Token model: All AI tokens consumed are logged to workspaceAiUsage against the org.
 *
 * LAWS ENFORCED:
 *  LAW 20 — Client Portal Automation Guarantee: every message processed through real AI.
 *  LAW 21 — Client Event NDS Notification Mandate: org owner notified on report + dispute.
 */

import { db } from '../../db';
import {
  clientPortalReports,
  helpaiSessions,
  workspaces,
  workspaceAiUsage,
  type InsertClientPortalReport,
  type InsertHelpaiSession,
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { tokenManager } from '../billing/tokenManager';
import { costOptimizedRouter } from '../ai-brain/costOptimizedRouter';
import { NotificationDeliveryService } from '../notificationDeliveryService';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('clientPortalHelpAIService');


// ============================================================================
// TYPES
// ============================================================================

export type ReportType = 'billing_discrepancy' | 'staff_issue' | 'complaint' | 'violation' | 'service_quality' | 'other';
export type SentimentLabel = 'positive' | 'neutral' | 'concerned' | 'frustrated' | 'angry';
export type ReportSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ClientSessionStart {
  orgWorkspaceId: string;
  clientId?: string;
  clientName?: string;
  clientEmail?: string;
  reportType: ReportType;
  initialMessage?: string;
}

export interface ClientMessage {
  sessionId: string;
  message: string;
  evidenceText?: string;
}

export interface ClientSessionResponse {
  sessionId: string;
  ticketNumber: string;
  message: string;
  state: string;
  sentimentLabel?: SentimentLabel;
  creditsDeducted?: number;
}

export interface ClientReport {
  id: string;
  ticketNumber: string;
  reportType: ReportType;
  severity: ReportSeverity;
  title: string;
  description: string;
  sentimentLabel: SentimentLabel | null;
  sentimentScore: number | null;
  frustrationSignals: number;
  aiSummary: string | null;
  recommendedActions: string[];
  status: string;
  submittedByName: string | null;
  submittedByEmail: string | null;
  conversationTurns: number;
  creditsUsed: number;
  createdAt: Date;
  orgResponseNote: string | null;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
}

// ============================================================================
// SENTIMENT + COMPLEXITY LOGIC (inline, no service imports)
// ============================================================================

const FRUSTRATION_SIGNALS = [
  'terrible', 'useless', 'awful', 'never works', 'frustrated', 'unacceptable',
  'ridiculous', 'impossible', 'hate', 'give up', 'incompetent', 'disgusting',
  'worst', 'failure', 'scam', 'cheated', 'lied', 'fraud', 'refused',
];

const SATISFACTION_SIGNALS = [
  'thank', 'great', 'perfect', 'good', 'appreciate', 'helpful', 'resolved',
  'fixed', 'excellent', 'satisfied', 'pleased',
];

const CONCERN_SIGNALS = [
  'concern', 'worried', 'uncertain', 'confused', 'unclear', 'question',
  'wondering', 'issue', 'problem', 'error', 'mistake', 'wrong',
];

function analyzeSentiment(messages: string[]): {
  label: SentimentLabel;
  score: number;
  frustrationSignals: number;
  satisfactionSignals: number;
} {
  const combined = messages.join(' ').toLowerCase();

  const frustration = FRUSTRATION_SIGNALS.filter(s => combined.includes(s)).length;
  const satisfaction = SATISFACTION_SIGNALS.filter(s => combined.includes(s)).length;
  const concern = CONCERN_SIGNALS.filter(s => combined.includes(s)).length;

  const total = frustration + satisfaction + concern + 1;
  const rawScore = (satisfaction - frustration) / total;
  const score = Math.max(-1, Math.min(1, rawScore));

  let label: SentimentLabel;
  if (score >= 0.4) label = 'positive';
  else if (score >= 0.1) label = 'neutral';
  else if (score >= -0.2) label = 'concerned';
  else if (score >= -0.5) label = 'frustrated';
  else label = 'angry';

  return { label, score, frustrationSignals: frustration, satisfactionSignals: satisfaction };
}

function deriveSeverity(reportType: ReportType, frustrationSignals: number, messageCount: number): ReportSeverity {
  if (reportType === 'violation' || frustrationSignals >= 5) return 'critical';
  if (reportType === 'billing_discrepancy' || frustrationSignals >= 3) return 'high';
  if (frustrationSignals >= 1 || messageCount >= 4) return 'medium';
  return 'low';
}

function buildFallbackSummary(
  reportType: ReportType,
  description: string,
  messages: string[],
  sentiment: ReturnType<typeof analyzeSentiment>,
  evidenceText?: string
): string {
  const typeLabels: Record<ReportType, string> = {
    billing_discrepancy: 'Billing Discrepancy',
    staff_issue: 'Staff Issue',
    complaint: 'Service Complaint',
    violation: 'Policy Violation',
    service_quality: 'Service Quality Issue',
    other: 'Client Issue',
  };

  const lines = [
    `**Report Type:** ${typeLabels[reportType]}`,
    `**Sentiment:** ${sentiment.label} (score: ${sentiment.score.toFixed(2)})`,
    `**Frustration Signals Detected:** ${sentiment.frustrationSignals}`,
    ``,
    `**Issue Summary:**`,
    description.substring(0, 500),
    ``,
    `**Conversation Context (${messages.length} turns):**`,
    messages.slice(-4).map((m, i) => `[${i + 1}] ${m.substring(0, 200)}`).join('\n'),
  ];

  if (evidenceText) {
    lines.push(``, `**Client-Provided Evidence:**`, evidenceText.substring(0, 400));
  }

  return lines.join('\n');
}

function buildRecommendedActions(reportType: ReportType, sentimentLabel: SentimentLabel): string[] {
  const base: Record<ReportType, string[]> = {
    billing_discrepancy: [
      'Review invoice and time records for the reported period',
      'Compare charges against contracted service rates',
      'Contact billing department to issue correction or credit if warranted',
      'Follow up with client within 48 hours',
    ],
    staff_issue: [
      'Review the staff member\'s shift records and incident reports',
      'Speak with the employee and supervisor involved',
      'Document findings and take corrective action if needed',
      'Provide written response to client within 72 hours',
    ],
    complaint: [
      'Acknowledge receipt of the complaint immediately',
      'Assign a resolution owner from management',
      'Investigate the root cause and document findings',
      'Offer remediation or service credit where appropriate',
    ],
    violation: [
      'Treat as high priority — escalate to compliance officer',
      'Preserve all evidence and documentation',
      'Review post orders and contract obligations',
      'Respond in writing within 24 hours with a remediation plan',
    ],
    service_quality: [
      'Review service delivery records for the reported period',
      'Identify gaps between contracted and delivered service levels',
      'Implement corrective measures and document them',
      'Schedule a service quality review call with the client',
    ],
    other: [
      'Review the client\'s concern carefully',
      'Assign to the appropriate department for investigation',
      'Respond to the client with findings within 5 business days',
    ],
  };

  const actions = [...base[reportType]];

  if (sentimentLabel === 'angry' || sentimentLabel === 'frustrated') {
    actions.unshift('PRIORITY: Client is highly frustrated — respond within 24 hours');
  }

  return actions;
}

// ============================================================================
// AI SYSTEM PROMPT BUILDER
// ============================================================================

function buildAISystemPrompt(reportType: ReportType, clientName?: string): string {
  const typeContext: Record<ReportType, string> = {
    billing_discrepancy: 'invoice charges, billing amounts, payment history, or rate discrepancies',
    staff_issue: 'officer conduct, tardiness, no-shows, professionalism, or safety concerns',
    complaint: 'service delivery, response time, communication, or overall service experience',
    violation: 'post order violations, policy breaches, legal compliance, or safety violations',
    service_quality: 'guard performance, coverage gaps, reporting quality, or service standards',
    other: 'miscellaneous concerns requiring management attention',
  };

  return `You are HelpAI, the intelligent support assistant for a professional security services management platform. You are speaking with ${clientName || 'a valued client'} who has reported an issue regarding ${typeContext[reportType]}.

Your primary mission is AUTONOMOUS RESOLUTION — attempt to resolve or provide clear answers without requiring human intervention wherever possible.

Resolution strategies by type:
- billing_discrepancy: Explain common billing patterns, ask for specific invoice numbers/dates, clarify charge breakdowns, guide them on dispute process
- staff_issue: Gather officer name/badge, incident date/time/location, specific behavior observed; acknowledge the concern and explain the investigation process
- complaint: Identify the specific failure point, propose concrete improvements, explain the service commitment
- violation: Treat with maximum seriousness, gather all evidence details, explain the compliance investigation process
- service_quality: Gather specific metrics (coverage hours, response times), acknowledge gaps, explain corrective actions available
- other: Understand the concern fully before routing

Response rules:
1. Ask ONE specific clarifying question per turn — do not overwhelm
2. After 3+ turns with enough detail, gently guide toward /done to submit
3. For urgent/safety issues: instruct client to call 911 immediately AND submit this report
4. NEVER claim to dispatch emergency services or make commitments on behalf of the org
5. NEVER say you are unavailable or that this goes straight to a human — attempt resolution first
6. Keep responses to 3-5 sentences max, professional and empathetic
7. If you can provide a definitive answer (e.g., explaining how billing works), do so directly

When sufficient information is gathered, include this suggestion: "Type **/done** to submit your full report to your security provider."`;
}

// ============================================================================
// SESSION STATE — in-memory with periodic cleanup
// ============================================================================

interface SessionState {
  orgWorkspaceId: string;
  clientId?: string;
  reportType: ReportType;
  messages: string[];           // client messages only
  aiResponses: string[];        // AI responses (parallel array)
  evidenceTexts: string[];
  startedAt: Date;
  totalTokensUsed: number;
}

// ============================================================================
// SERVICE
// ============================================================================

export class ClientPortalHelpAIService {
  private sessions = new Map<string, SessionState>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    // LAW 17: Cleanup stale sessions every 30 min to prevent memory leak
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;
      for (const [id, sess] of this.sessions.entries()) {
        if (now - sess.startedAt.getTime() > 4 * 60 * 60 * 1000) { // 4-hour TTL
          this.sessions.delete(id);
          cleaned++;
        }
      }
      if (cleaned > 0) log.info(`[ClientPortalHelpAI] Cleaned ${cleaned} stale sessions`);
    }, 30 * 60 * 1000);
    this.cleanupTimer.unref(); // LAW 17: unref timer so it doesn't block shutdown
  }

  /**
   * Start a DockChat session. Validates the org workspace, deducts 10 credits,
   * and opens a session for real AI-driven conversation.
   */
  async startSession(params: ClientSessionStart): Promise<ClientSessionResponse> {
    // GAP-CPH-06 FIX: Validate orgWorkspaceId exists before deducting credits
    const [ws] = await db
      .select({ id: workspaces.id, companyName: workspaces.companyName, ownerId: workspaces.ownerId })
      .from(workspaces)
      .where(eq(workspaces.id, params.orgWorkspaceId))
      .limit(1);

    if (!ws) {
      log.warn('[ClientPortalHelpAI] startSession rejected: unknown orgWorkspaceId', { orgWorkspaceId: params.orgWorkspaceId });
      return {
        sessionId: '',
        ticketNumber: '',
        message: 'Unable to start session. Your organization account could not be verified. Please contact your service provider.',
        state: 'error',
        creditsDeducted: 0,
      };
    }

    // Deduct credits from org before starting — gate access
    const creditCheck = await this.deductOrgCredits(params.orgWorkspaceId);
    if (!creditCheck.success) {
      return {
        sessionId: '',
        ticketNumber: '',
        message: `Your organization has insufficient credits to start a support session. Please contact your security provider to top up credits.`,
        state: 'credit_denied',
        creditsDeducted: 0,
      };
    }

    const ticketNumber = `CPR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const [session] = await db.insert(helpaiSessions).values({
      ticketNumber,
      workspaceId: params.orgWorkspaceId,
      guestName: params.clientName,
      guestEmail: params.clientEmail,
      authMethod: 'guest',
      authVerified: false,
      state: 'queued',
      queuePosition: 1,
      queueEnteredAt: new Date(),
      metadata: {
        source: 'client_portal_dockchat',
        reportType: params.reportType,
        clientId: params.clientId,
      },
    } as InsertHelpaiSession).returning();

    this.sessions.set(session.id, {
      orgWorkspaceId: params.orgWorkspaceId,
      clientId: params.clientId,
      reportType: params.reportType,
      messages: params.initialMessage ? [params.initialMessage] : [],
      aiResponses: [],
      evidenceTexts: [],
      startedAt: new Date(),
      totalTokensUsed: 0,
    });

    const typePrompts: Record<ReportType, string> = {
      billing_discrepancy: 'billing discrepancy',
      staff_issue: 'staff issue or concern',
      complaint: 'service complaint',
      violation: 'policy violation',
      service_quality: 'service quality issue',
      other: 'concern',
    };

    const opening = [
      `Hello! I'm **HelpAI**, your support assistant powered by Trinity AI.`,
      ``,
      `Your reference is **${ticketNumber}**.`,
      ``,
      `I understand you're reporting a **${typePrompts[params.reportType]}**. I'll do my best to help resolve this directly. Please describe what happened in as much detail as possible.`,
      ``,
      `Type **/done** at any time to submit a full report to your security provider. For life-threatening emergencies, call **911** immediately.`,
    ].join('\n');

    return {
      sessionId: session.id,
      ticketNumber,
      message: params.initialMessage
        ? opening + `\n\n*Your initial message: "${params.initialMessage}"* — please continue with more details.`
        : opening,
      state: 'active',
      creditsDeducted: 10,
    };
  }

  /**
   * LAW 20 — Process a client message using real Trinity AI (costOptimizedRouter).
   * Attempts autonomous resolution every turn. Tracks tokens against org usage.
   */
  async processMessage(params: ClientMessage): Promise<{ message: string; state: string }> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      return { message: 'Session not found. Please start a new session.', state: 'error' };
    }

    const msg = params.message.trim();

    // Terminal commands — skip AI call
    if (msg.toLowerCase() === '/done' || msg.toLowerCase().startsWith('/submit') || msg.toLowerCase() === '/close') {
      return {
        message: `Thank you for sharing the details. Type **submit** to confirm and send this full report to your security provider.`,
        state: 'satisfaction_check',
      };
    }

    if (msg.toLowerCase() === 'submit' || msg.toLowerCase() === 'yes' || msg.toLowerCase() === 'confirm') {
      return {
        message: `Your report is being submitted. You'll receive a reference number you can use for follow-up.`,
        state: 'submitting',
      };
    }

    // Store client message
    session.messages.push(msg);
    if (params.evidenceText) {
      session.evidenceTexts.push(params.evidenceText);
    }

    // Build conversation history for AI context
    const conversationLines: string[] = [];
    const maxHistory = Math.min(session.messages.length, session.aiResponses.length);
    for (let i = 0; i < maxHistory; i++) {
      conversationLines.push(`Client: ${session.messages[i]}`);
      conversationLines.push(`HelpAI: ${session.aiResponses[i]}`);
    }
    // Add the latest client message (which is the one we just stored)
    if (session.messages.length > session.aiResponses.length) {
      conversationLines.push(`Client: ${session.messages[session.messages.length - 1]}`);
    }

    const conversationHistory = conversationLines.join('\n');
    const systemPrompt = buildAISystemPrompt(session.reportType, undefined);

    const task = [
      `Conversation so far:\n${conversationHistory}`,
      ``,
      `Report type: ${session.reportType}`,
      session.evidenceTexts.length > 0 ? `Client-provided evidence: ${session.evidenceTexts.slice(-2).join('; ')}` : '',
      `Turn number: ${session.messages.length}`,
      ``,
      `Provide a helpful, professional response that attempts to resolve or gather information. Keep it concise.`,
    ].filter(Boolean).join('\n');

    let aiResponse: string;
    let tokensUsed = 0;

    const AI_TIMEOUT_MS = 30_000;

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI call timed out after 30s')), AI_TIMEOUT_MS)
      );

      const result = await Promise.race([
        costOptimizedRouter.execute({
          task,
          context: systemPrompt,
          workspaceId: session.orgWorkspaceId,
          featureKey: 'client_portal_helpai_message',
        }),
        timeoutPromise,
      ]);

      aiResponse = result.content;
      tokensUsed = result.tokensUsed || 0;
      session.totalTokensUsed += tokensUsed;

      // Track token usage against org's AI usage (LAW 14 + LAW 20)
      if (tokensUsed > 0) {
        await db.insert(workspaceAiUsage).values({
          workspaceId: session.orgWorkspaceId,
          feature: 'client_portal_helpai',
          operation: 'chat_message',
          requestId: params.sessionId,
          tokensUsed,
          model: result.model || 'gpt-4o-mini',
          providerCostUsd: ((tokensUsed / 1000) * 0.00015).toFixed(6),
          markupPercentage: '0',
          clientChargeUsd: '0',
          status: 'completed',
          billingPeriod: new Date().toISOString().slice(0, 7),
          inputData: { messageLength: msg.length, turn: session.messages.length },
          outputData: { responseLength: aiResponse.length, provider: result.provider },
        } as any).catch((err: unknown) => {
          log.warn('[ClientPortalHelpAI] workspaceAiUsage insert failed (non-blocking):', (err as Error)?.message);
        });
      }
    } catch (aiErr: unknown) {
      log.warn('[ClientPortalHelpAI] AI call failed, using fallback response:', (aiErr as Error)?.message);
      // Graceful fallback — scripted response if AI unavailable
      const turnCount = session.messages.length;
      const sentiment = analyzeSentiment(session.messages);
      if (turnCount === 1) {
        aiResponse = `I hear you. This is clearly an important matter. Could you provide more details?\n- When did this happen?\n- Who was involved?\n- What evidence do you have?\n\nThe more detail you share, the better we can help resolve this.`;
      } else if (sentiment.label === 'angry' || sentiment.label === 'frustrated') {
        aiResponse = `I completely understand your frustration, and I want to assure you this will be taken seriously. Please continue sharing any additional details. When you're ready, type **/done** to submit your report.`;
      } else if (turnCount >= 3) {
        aiResponse = `Thank you for all the details. If you have any evidence (dates, names, invoice numbers), please include them now. When you're ready to submit, type **/done**.`;
      } else {
        aiResponse = `Understood. Please continue — anything else relevant to add? Type **/done** when you're ready to submit.`;
      }
    }

    // Store AI response for context continuity
    session.aiResponses.push(aiResponse);

    return { message: aiResponse, state: 'answering' };
  }

  /**
   * Close session: runs full sentiment analysis, builds AI summary via Trinity,
   * persists report, and NOTIFIES org owner via NDS (LAW 21).
   */
  async closeSession(sessionId: string, title: string): Promise<{
    success: boolean;
    reportId?: string;
    ticketNumber?: string;
    summary?: string;
    sentimentLabel?: SentimentLabel;
    severity?: ReportSeverity;
    recommendedActions?: string[];
    message: string;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, message: 'Session not found.' };
    }

    const [dbSession] = await db.select().from(helpaiSessions).where(eq(helpaiSessions.id, sessionId));
    if (!dbSession) {
      return { success: false, message: 'Session record not found.' };
    }

    const allMessages = session.messages;
    const evidenceText = session.evidenceTexts.join('\n\n').trim() || undefined;

    const sentiment = analyzeSentiment(allMessages);
    const severity = deriveSeverity(session.reportType, sentiment.frustrationSignals, allMessages.length);
    const description = allMessages.join('\n\n');
    const recommendedActions = buildRecommendedActions(session.reportType, sentiment.label);

    // Use Trinity AI to generate professional summary for org, fall back to template
    let aiSummary: string;
    try {
      const summaryTask = [
        `Generate a concise professional support escalation summary for the org manager reviewing this client issue.`,
        ``,
        `Report type: ${session.reportType}`,
        `Sentiment: ${sentiment.label} (frustration signals: ${sentiment.frustrationSignals})`,
        `Severity: ${severity}`,
        ``,
        `Client conversation (${allMessages.length} turns):`,
        allMessages.map((m, i) => `[${i + 1}] ${m}`).join('\n'),
        evidenceText ? `\nEvidence provided: ${evidenceText}` : '',
        ``,
        `Write a 3-5 sentence summary covering: what the client reported, their emotional state, key facts, and what action is recommended. Be factual and professional.`,
      ].filter(Boolean).join('\n');

      const summaryResult = await Promise.race([
        costOptimizedRouter.execute({
          task: summaryTask,
          context: 'You write concise professional client support escalation summaries for security company managers.',
          workspaceId: session.orgWorkspaceId,
          featureKey: 'client_portal_helpai_summary',
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Summary AI call timed out after 30s')), 30_000)
        ),
      ]);
      aiSummary = summaryResult.content;
      session.totalTokensUsed += summaryResult.tokensUsed || 0;
    } catch (summaryErr: unknown) {
      log.warn('[ClientPortalHelpAI] Summary AI call failed, using fallback:', (summaryErr as Error)?.message);
      aiSummary = buildFallbackSummary(session.reportType, description, allMessages, sentiment, evidenceText);
    }

    // Persist report
    const [report] = await db.insert(clientPortalReports).values({
      sessionId,
      workspaceId: session.orgWorkspaceId,
      clientId: session.clientId,
      submittedByName: dbSession.guestName,
      submittedByEmail: dbSession.guestEmail,
      reportType: session.reportType,
      severity,
      title: title || `${session.reportType.replace(/_/g, ' ')} — ${new Date().toLocaleDateString()}`,
      description,
      evidenceText,
      sentimentScore: parseFloat(sentiment.score.toFixed(3)) as unknown as string,
      sentimentLabel: sentiment.label,
      frustrationSignals: sentiment.frustrationSignals,
      satisfactionSignals: sentiment.satisfactionSignals,
      aiSummary,
      recommendedActions,
      conversationTurns: allMessages.length,
      creditsUsed: 10,
      status: 'open',
    } as unknown as InsertClientPortalReport).returning();

    // Update helpai session state
    await db.update(helpaiSessions)
      .set({ state: 'disconnected', resolvedAt: new Date(), issueSummary: aiSummary, updatedAt: new Date() })
      .where(eq(helpaiSessions.id, sessionId));

    // LAW 21 — Notify org owner that a client report was submitted
    await this.notifyOrgOwner({
      orgWorkspaceId: session.orgWorkspaceId,
      notificationType: 'client_portal_report',
      subject: `Client Report Submitted — ${severity.toUpperCase()} | ${dbSession.ticketNumber}`,
      body: {
        title: `New client report submitted: ${dbSession.ticketNumber}`,
        reportType: session.reportType,
        severity,
        sentimentLabel: sentiment.label,
        ticketNumber: dbSession.ticketNumber,
        reportId: report.id,
        submittedByName: dbSession.guestName || 'Unknown client',
        submittedByEmail: dbSession.guestEmail || null,
        summary: aiSummary.substring(0, 400),
        recommendedActions,
        source: 'client_portal_dockchat',
      },
    });

    // Clean up in-memory session
    this.sessions.delete(sessionId);

    const closingMessage = [
      `Your report **${dbSession.ticketNumber}** has been submitted successfully.`,
      ``,
      `**Sentiment Detected:** ${sentiment.label}`,
      `**Severity Level:** ${severity.toUpperCase()}`,
      ``,
      `Your security provider has been notified and will review your report. Response times depend on your service agreement.`,
      `For emergencies or immediate threats, contact 911 directly — this system does not dispatch emergency services.`,
      ``,
      `Keep your reference number **${dbSession.ticketNumber}** for follow-up.`,
    ].join('\n');

    return {
      success: true,
      reportId: report.id,
      ticketNumber: dbSession.ticketNumber,
      summary: aiSummary,
      sentimentLabel: sentiment.label,
      severity,
      recommendedActions,
      message: closingMessage,
    };
  }

  /**
   * Get all client portal reports for an org (for the org's admin dashboard).
   */
  async getOrgReports(orgWorkspaceId: string, limit = 50): Promise<ClientReport[]> {
    const rows = await db
      .select()
      .from(clientPortalReports)
      .where(eq(clientPortalReports.workspaceId, orgWorkspaceId))
      .orderBy(desc(clientPortalReports.createdAt))
      .limit(limit);

    return rows.map(r => ({
      id: r.id,
      ticketNumber: (r as any).sessionId ? r.id : r.id,
      reportType: r.reportType as ReportType,
      severity: r.severity as ReportSeverity,
      title: r.title,
      description: r.description,
      sentimentLabel: r.sentimentLabel as SentimentLabel | null,
      sentimentScore: r.sentimentScore ? parseFloat(r.sentimentScore) : null,
      frustrationSignals: r.frustrationSignals ?? 0,
      aiSummary: r.aiSummary,
      recommendedActions: Array.isArray(r.recommendedActions) ? r.recommendedActions as string[] : [],
      status: r.status,
      submittedByName: r.submittedByName,
      submittedByEmail: r.submittedByEmail,
      conversationTurns: r.conversationTurns ?? 0,
      creditsUsed: r.creditsUsed ?? 10,
      createdAt: r.createdAt!,
      orgResponseNote: r.orgResponseNote,
      acknowledgedAt: r.acknowledgedAt,
      resolvedAt: r.resolvedAt,
    }));
  }

  /**
   * Org acknowledges a report (marks as acknowledged).
   */
  async acknowledgeReport(reportId: string, orgWorkspaceId: string, note?: string): Promise<boolean> {
    const result = await db.update(clientPortalReports)
      .set({
        status: 'acknowledged',
        acknowledgedAt: new Date(),
        orgResponseNote: note,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clientPortalReports.id, reportId),
          eq(clientPortalReports.workspaceId, orgWorkspaceId)
        )
      )
      .returning();

    return result.length > 0;
  }

  /**
   * Org resolves a report.
   */
  async resolveReport(
    reportId: string,
    orgWorkspaceId: string,
    resolvedByUserId: string,
    note?: string
  ): Promise<boolean> {
    const result = await db.update(clientPortalReports)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedByUserId,
        orgResponseNote: note,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clientPortalReports.id, reportId),
          eq(clientPortalReports.workspaceId, orgWorkspaceId)
        )
      )
      .returning();

    return result.length > 0;
  }

  /**
   * Get a single report by ID.
   */
  async getReport(reportId: string, orgWorkspaceId: string): Promise<ClientReport | null> {
    const [row] = await db
      .select()
      .from(clientPortalReports)
      .where(
        and(
          eq(clientPortalReports.id, reportId),
          eq(clientPortalReports.workspaceId, orgWorkspaceId)
        )
      );

    if (!row) return null;

    return {
      id: row.id,
      ticketNumber: row.id,
      reportType: row.reportType as ReportType,
      severity: row.severity as ReportSeverity,
      title: row.title,
      description: row.description,
      sentimentLabel: row.sentimentLabel as SentimentLabel | null,
      sentimentScore: row.sentimentScore ? parseFloat(row.sentimentScore) : null,
      frustrationSignals: row.frustrationSignals ?? 0,
      aiSummary: row.aiSummary,
      recommendedActions: Array.isArray(row.recommendedActions) ? row.recommendedActions as string[] : [],
      status: row.status,
      submittedByName: row.submittedByName,
      submittedByEmail: row.submittedByEmail,
      conversationTurns: row.conversationTurns ?? 0,
      creditsUsed: row.creditsUsed ?? 10,
      createdAt: row.createdAt!,
      orgResponseNote: row.orgResponseNote,
      acknowledgedAt: row.acknowledgedAt,
      resolvedAt: row.resolvedAt,
    };
  }

  /**
   * LAW 21 — Notify the org workspace owner of a client-originated event.
   * Fail-open: notification failure never blocks the client's action.
   */
  private async notifyOrgOwner(params: {
    orgWorkspaceId: string;
    notificationType: 'client_portal_report' | 'client_portal_dispute';
    subject: string;
    body: Record<string, unknown>;
  }): Promise<void> {
    try {
      const [ws] = await db
        .select({ ownerId: workspaces.ownerId })
        .from(workspaces)
        .where(eq(workspaces.id, params.orgWorkspaceId))
        .limit(1);

      if (!ws?.ownerId) {
        log.warn('[ClientPortalHelpAI] notifyOrgOwner: no ownerId found for workspace', { workspaceId: params.orgWorkspaceId });
        return;
      }

      await NotificationDeliveryService.send({
        type: params.notificationType,
        workspaceId: params.orgWorkspaceId,
        recipientUserId: ws.ownerId,
        channel: 'in_app',
        subject: params.subject,
        body: params.body,
        idempotencyKey: `${params.notificationType}-${params.orgWorkspaceId}-${Date.now()}`,
      });
    } catch (err: unknown) {
      log.warn('[ClientPortalHelpAI] notifyOrgOwner failed (non-blocking):', (err as Error)?.message);
    }
  }

  /**
   * Deduct 10 credits from the org's credit pool for a DockChat session.
   */
  private async deductOrgCredits(orgWorkspaceId: string): Promise<{ success: boolean; remaining: number }> {
    try {
      const result = await tokenManager.recordUsage({
        workspaceId: orgWorkspaceId,
        featureKey: 'client_portal_helpai_session',
        featureName: 'Client Portal DockChat',
        description: 'Client Portal DockChat session — Trinity AI support conversation',
      });
      return { success: result.success, remaining: result.newBalance ?? 0 };
    } catch (err: unknown) {
      log.warn('[ClientPortalHelpAI] Credit deduction failed, allowing session:', (err as Error)?.message);
      return { success: true, remaining: 0 }; // Fail open — log but don't block client
    }
  }
}

export const clientPortalHelpAIService = new ClientPortalHelpAIService();
