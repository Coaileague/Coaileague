/**
 * HelpAI Knowledge Tools — Canonical Tool Bridge
 * ================================================
 * Central tool set for HelpAI to query Trinity's knowledge systems,
 * retrieve cross-channel context, and execute support actions.
 *
 * Called by helpAIBotService during response generation and by the
 * toolCapabilityRegistry during Trinity-orchestrated sessions.
 *
 * ALL tools are read-only or action-gated. No blind mutations.
 */

import { db, pool } from '../../db';
import { helposFaqs } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';

const log = createLogger('helpAIKnowledgeTools');

// ── Types ────────────────────────────────────────────────────────────────────

export interface KnowledgeSearchResult {
  source: 'trinity_static' | 'trinity_org' | 'faq' | 'platform_docs';
  title: string;
  content: string;
  relevanceScore: number;
  category?: string;
}

export interface CrossChannelContext {
  userId: string;
  workspaceId: string;
  recentEmails: Array<{
    id: string;
    subject: string;
    folderType: string;
    fromAddress: string;
    createdAt: Date;
    isRead: boolean;
  }>;
  recentVoiceCalls: Array<{
    id: string;
    callerNumber: string;
    status: string;
    durationSeconds: number | null;
    startedAt: Date;
    trinityResolved: boolean;
  }>;
  openTickets: Array<{
    id: string;
    subject: string;
    status: string;
    priority: string;
    createdAt: Date;
  }>;
  channelSummary: string;
}

export interface FAQSearchResult {
  id: string;
  question: string;
  answer: string;
  category?: string;
  score: number;
}

// ── Tool 1: Trinity Knowledge Search ─────────────────────────────────────────

/**
 * Search Trinity's full knowledge base (static regulatory modules + org-specific knowledge).
 * Returns a pre-formatted context block ready to inject into system prompts.
 */
export async function searchTrinityKnowledge(
  query: string,
  workspaceId: string,
  stateCode?: string
): Promise<string> {
  try {
    const { trinityKnowledgeService } = await import('../ai-brain/trinityKnowledgeService');
    const context = await trinityKnowledgeService.buildKnowledgeContext(query, workspaceId, stateCode);
    if (context) {
      log.info(`[KnowledgeTools] Trinity knowledge found for query: "${query.substring(0, 60)}"`);
    }
    return context;
  } catch (err: any) {
    log.warn('[KnowledgeTools] Trinity knowledge search failed:', err.message);
    return '';
  }
}

/**
 * Direct knowledge search returning structured results with relevance scores.
 * Used by tool registry for programmatic consumption.
 */
export async function searchKnowledgeStructured(
  query: string,
  workspaceId: string,
  opts?: { category?: string; stateCode?: string; limit?: number }
): Promise<KnowledgeSearchResult[]> {
  const results: KnowledgeSearchResult[] = [];

  try {
    const { trinityKnowledgeService } = await import('../ai-brain/trinityKnowledgeService');
    const [staticModules, orgModules] = await Promise.all([
      trinityKnowledgeService.queryStaticKnowledge({
        query,
        category: opts?.category,
        stateCode: opts?.stateCode,
        limit: opts?.limit ?? 3,
      }),
      trinityKnowledgeService.queryOrgKnowledge(workspaceId, query, 3),
    ]);

    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    for (const mod of staticModules) {
      const combined = `${mod.title} ${mod.content}`.toLowerCase();
      const score = terms.reduce((acc, t) => {
        let count = 0;
        let pos = 0;
        while ((pos = combined.indexOf(t, pos)) !== -1) { count++; pos += t.length || 1; }
        return acc + count;
      }, 0);
      results.push({
        source: 'trinity_static',
        title: mod.title,
        content: mod.content.slice(0, 600),
        relevanceScore: Math.min(score / Math.max(terms.length, 1), 1),
        category: mod.category,
      });
    }

    for (const org of orgModules) {
      results.push({
        source: 'trinity_org',
        title: org.title || 'Org Knowledge',
        content: org.summary || org.content || '',
        relevanceScore: 0.7,
        category: org.knowledge_type,
      });
    }
  } catch (err: any) {
    log.warn('[KnowledgeTools] Structured knowledge search failed:', err.message);
  }

  return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// ── Tool 2: Platform FAQ Search ───────────────────────────────────────────────

/**
 * Search platform FAQs using keyword scoring.
 * Semantic AI search is attempted first; falls back to DB keyword match.
 */
export async function searchPlatformFAQs(
  query: string,
  workspaceId: string,
  limit = 3
): Promise<FAQSearchResult[]> {
  try {
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    const faqs = await db
      .select({
        id: helposFaqs.id,
        question: helposFaqs.question,
        answer: helposFaqs.answer,
        category: helposFaqs.category,
      })
      .from(helposFaqs)
      .where(eq(helposFaqs.isPublished, true))
      .limit(40);

    const scored: FAQSearchResult[] = faqs.map(faq => {
      const haystack = `${faq.question} ${faq.answer}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        let pos = 0;
        while ((pos = haystack.indexOf(term, pos)) !== -1) { score++; pos += term.length || 1; }
      }
      return {
        id: faq.id,
        question: faq.question,
        answer: faq.answer,
        category: faq.category || undefined,
        score: Math.min(score / Math.max(terms.length, 1), 1),
      };
    });

    return scored
      .filter(f => f.score > 0 || terms.length === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (err: any) {
    log.warn('[KnowledgeTools] FAQ search failed:', err.message);
    return [];
  }
}

// ── Tool 3: Cross-Channel Context ─────────────────────────────────────────────

/**
 * Build a complete cross-channel picture of a user's recent activity.
 * Aggregates emails, voice calls, and open support tickets into a unified context.
 * Used to give HelpAI + Trinity full situational awareness before responding.
 */
export async function getUserCrossChannelContext(
  userId: string,
  workspaceId: string
): Promise<CrossChannelContext> {
  const [emailRows, voiceRows, ticketRows] = await Promise.all([
    // Recent emails where the user is involved (sent or received by their workspace)
    pool.query<{
      id: string;
      subject: string;
      folder_type: string;
      from_address: string;
      created_at: Date;
      is_read: boolean;
    }>(`
      SELECT
        em.id,
        em.subject,
        ef.folder_type,
        em.from_address,
        em.created_at,
        COALESCE(em.is_read, false) AS is_read
      FROM internal_emails em
      JOIN internal_email_folders ef ON ef.id = em.folder_id
      JOIN internal_email_mailboxes mb ON mb.id = ef.mailbox_id
      WHERE mb.workspace_id = $1
        AND em.created_at >= NOW() - INTERVAL '7 days'
      ORDER BY em.created_at DESC
      LIMIT 10
    `, [workspaceId]),

    // Recent voice calls for this workspace
    pool.query<{
      id: string;
      caller_number: string;
      status: string;
      duration_seconds: number | null;
      started_at: Date;
      ai_resolved: boolean;
    }>(`
      SELECT
        id,
        caller_number,
        status,
        duration_seconds,
        started_at,
        COALESCE((metadata->>'ai_resolved')::boolean, false) AS ai_resolved
      FROM voice_call_sessions
      WHERE workspace_id = $1
        AND started_at >= NOW() - INTERVAL '7 days'
      ORDER BY started_at DESC
      LIMIT 5
    `, [workspaceId]),

    // Open support tickets for this user
    pool.query<{
      id: string;
      subject: string;
      status: string;
      priority: string;
      created_at: Date;
    }>(`
      SELECT id, subject, status, priority, created_at
      FROM support_tickets
      WHERE workspace_id = $1
        AND status NOT IN ('resolved', 'closed')
      ORDER BY created_at DESC
      LIMIT 5
    `, [workspaceId]),
  ]).then(([e, v, t]) => [e.rows, v.rows, t.rows]).catch(() => [[], [], []]);

  const recentEmails = (emailRows as any[]).map(r => ({
    id: r.id,
    subject: r.subject || '(no subject)',
    folderType: r.folder_type,
    fromAddress: r.from_address,
    createdAt: r.created_at,
    isRead: r.is_read,
  }));

  const recentVoiceCalls = (voiceRows as any[]).map(r => ({
    id: r.id,
    callerNumber: r.caller_number,
    status: r.status,
    durationSeconds: r.duration_seconds,
    startedAt: r.started_at,
    trinityResolved: r.ai_resolved,
  }));

  const openTickets = (ticketRows as any[]).map(r => ({
    id: r.id,
    subject: r.subject,
    status: r.status,
    priority: r.priority,
    createdAt: r.created_at,
  }));

  const channelSummary = buildChannelSummary(recentEmails, recentVoiceCalls, openTickets);

  return {
    userId,
    workspaceId,
    recentEmails,
    recentVoiceCalls,
    openTickets,
    channelSummary,
  };
}

function buildChannelSummary(
  emails: CrossChannelContext['recentEmails'],
  calls: CrossChannelContext['recentVoiceCalls'],
  tickets: CrossChannelContext['openTickets']
): string {
  const parts: string[] = [];

  if (emails.length > 0) {
    const unread = emails.filter(e => !e.isRead).length;
    parts.push(`${emails.length} recent email(s) in the last 7 days (${unread} unread)`);
  }

  if (calls.length > 0) {
    const resolved = calls.filter(c => c.trinityResolved).length;
    parts.push(`${calls.length} recent voice call(s) (${resolved} resolved by Trinity AI)`);
  }

  if (tickets.length > 0) {
    const urgent = tickets.filter(t => ['urgent', 'high'].includes(t.priority)).length;
    parts.push(`${tickets.length} open support ticket(s) (${urgent} urgent/high priority)`);
  }

  if (parts.length === 0) {
    return 'No recent cross-channel activity in the last 7 days.';
  }

  return `Cross-channel activity: ${parts.join('; ')}.`;
}

/**
 * Format cross-channel context as a string block for injection into system prompts.
 */
export async function buildCrossChannelContextBlock(
  userId: string,
  workspaceId: string
): Promise<string> {
  try {
    const ctx = await getUserCrossChannelContext(userId, workspaceId);
    if (
      ctx.recentEmails.length === 0 &&
      ctx.recentVoiceCalls.length === 0 &&
      ctx.openTickets.length === 0
    ) {
      return '';
    }

    const parts: string[] = ['## Cross-Channel Context (last 7 days)'];
    parts.push(ctx.channelSummary);

    if (ctx.openTickets.length > 0) {
      parts.push('\n### Open Support Tickets');
      for (const t of ctx.openTickets) {
        parts.push(`- [${t.priority.toUpperCase()}] ${t.subject} (${t.status})`);
      }
    }

    if (ctx.recentVoiceCalls.length > 0) {
      parts.push('\n### Recent Voice Calls');
      for (const c of ctx.recentVoiceCalls) {
        const resolved = c.trinityResolved ? ' [Trinity AI resolved]' : ' [required human agent]';
        parts.push(`- ${c.callerNumber} • ${c.status}${resolved}`);
      }
    }

    return parts.join('\n');
  } catch (err: any) {
    log.warn('[KnowledgeTools] Cross-channel context build failed:', err.message);
    return '';
  }
}

// ── Tool 4: Support Action Bridge ─────────────────────────────────────────────

/**
 * Execute a corrective support action via the supportActionRegistry.
 * Requires actor to be support role or 'system'. Returns structured result.
 */
export async function executeSupportAction(payload: {
  actionType: string;
  workspaceId: string;
  targetEntityType: string;
  targetEntityId?: string;
  reason: string;
  actorId: string;
  actorType: 'system' | 'support_agent' | 'trinity';
  ticketId?: string;
  correctionData?: Record<string, any>;
}): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    const { supportActionRegistry } = await import('./supportActionRegistry');
    const result = await supportActionRegistry.execute(payload as any);
    log.info(`[KnowledgeTools] Support action executed: ${payload.actionType} → success=${result.success}`);
    return { success: result.success, result };
  } catch (err: any) {
    log.error('[KnowledgeTools] Support action failed:', err.message);
    return { success: false, error: err.message };
  }
}

// ── Tool 5: Platform Knowledge Summary ────────────────────────────────────────

/**
 * Build a rich knowledge injection block combining Trinity knowledge + FAQs + cross-channel context.
 * This is the one-stop call for enriching any AI response.
 */
export async function buildFullKnowledgeBlock(opts: {
  query: string;
  workspaceId: string;
  userId?: string;
  stateCode?: string;
  includeCrossChannel?: boolean;
}): Promise<string> {
  const { query, workspaceId, userId, stateCode, includeCrossChannel = true } = opts;

  const [knowledgeCtx, faqResults, crossChannelBlock] = await Promise.all([
    searchTrinityKnowledge(query, workspaceId, stateCode),
    searchPlatformFAQs(query, workspaceId, 3),
    includeCrossChannel && userId
      ? buildCrossChannelContextBlock(userId, workspaceId)
      : Promise.resolve(''),
  ]);

  const parts: string[] = [];

  if (knowledgeCtx) {
    parts.push(knowledgeCtx);
  }

  if (faqResults.length > 0) {
    const relevant = faqResults.filter(f => f.score > 0.2);
    if (relevant.length > 0) {
      parts.push('## Relevant Platform FAQs');
      for (const faq of relevant) {
        parts.push(`**Q: ${faq.question}**\nA: ${faq.answer}`);
      }
    }
  }

  if (crossChannelBlock) {
    parts.push(crossChannelBlock);
  }

  return parts.join('\n\n');
}
