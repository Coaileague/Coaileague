import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { db } from '../../db';
import { supportTickets, helposFaqs } from '@shared/schema';
import { eq, and, desc, gte, count, sql } from 'drizzle-orm';

import { createLogger } from '../../lib/logger';
const log = createLogger('trinityHelpdeskActions');

function mkAction(actionId: string, fn: (params: any) => Promise<any>): ActionHandler {
  return {
    actionId,
    name: actionId,
    category: 'automation' as any,
    description: `Trinity helpdesk action: ${actionId}`,
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      try {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const data = await fn(req.params || {});
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return { success: true, data };
      } catch (err: any) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return { success: false, error: err?.message || 'Unknown error' };
      }
    }
  };
}

export function registerHelpdeskActions() {

  helpaiOrchestrator.registerAction(mkAction('helpdesk.ticket.create', async (params) => {
    const { workspaceId, subject, description, priority = 'normal', type = 'support', submittedBy } = params;
    if (!workspaceId || !subject || !description) {
      return { error: 'workspaceId, subject, and description are required' };
    }
    const year = new Date().getFullYear();
    const countResult = await db.select({ total: count() }).from(supportTickets).where(eq(supportTickets.workspaceId, workspaceId));
    const seq = (countResult[0]?.total ?? 0) + 1;
    const ticketNumber = `TKT-${year}-${String(seq).padStart(4, '0')}`;
    const [ticket] = await db.insert(supportTickets).values({
      workspaceId,
      ticketNumber,
      subject,
      description,
      priority,
      type,
      status: 'open',
      requestedBy: submittedBy ?? 'Trinity (AI)',
      submissionMethod: 'app',
    }).returning();
    return { created: true, ticketNumber: ticket.ticketNumber, ticketId: ticket.id, status: ticket.status };
  }));

  helpaiOrchestrator.registerAction(mkAction('helpdesk.ticket.query', async (params) => {
    const { workspaceId, status, limit = 10 } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const conditions = [eq(supportTickets.workspaceId, workspaceId)];
    if (status) conditions.push(eq(supportTickets.status as any, status));
    const tickets = await db.select({
      id: supportTickets.id,
      ticketNumber: supportTickets.ticketNumber,
      subject: supportTickets.subject,
      status: supportTickets.status,
      priority: supportTickets.priority,
      type: supportTickets.type,
      createdAt: supportTickets.createdAt,
      assignedTo: supportTickets.assignedTo,
    }).from(supportTickets)
      .where(and(...conditions))
      .orderBy(desc(supportTickets.createdAt))
      .limit(limit);
    return { tickets, count: tickets.length };
  }));

  helpaiOrchestrator.registerAction(mkAction('helpdesk.ticket.resolve', async (params) => {
    const { ticketId, resolution, resolvedBy = 'Trinity (AI)' } = params;
    if (!ticketId || !resolution) return { error: 'ticketId and resolution are required' };
    const [updated] = await db.update(supportTickets)
      .set({
        status: 'resolved',
        resolution,
        resolvedAt: new Date(),
        resolvedBy,
        updatedAt: new Date(),
        faqCandidate: true,
        faqCandidateFlaggedAt: new Date(),
      })
      .where(eq(supportTickets.id, ticketId))
      .returning();
    if (!updated) return { error: 'Ticket not found' };
    return { resolved: true, ticketNumber: updated.ticketNumber, status: updated.status, faqCandidateFlagged: true };
  }));

  helpaiOrchestrator.registerAction(mkAction('helpdesk.faq.search', async (params) => {
    const { workspaceId, query, limit = 5 } = params;
    if (!workspaceId || !query) return { error: 'workspaceId and query are required' };
    const q = `%${query.toLowerCase()}%`;
    const faqs = await db.select({
      id: helposFaqs.id,
      category: helposFaqs.category,
      question: helposFaqs.question,
      answer: helposFaqs.answer,
      viewCount: helposFaqs.viewCount,
      helpfulCount: helposFaqs.helpfulCount,
    }).from(helposFaqs)
      .where(and(
        eq(helposFaqs.workspaceId, workspaceId),
        eq(helposFaqs.isPublished, true),
        sql`(lower(${helposFaqs.question}) LIKE ${q} OR lower(${helposFaqs.answer}) LIKE ${q})`,
      ))
      .orderBy(desc(helposFaqs.helpfulCount))
      .limit(limit);
    await db.update(helposFaqs)
      .set({ viewCount: sql`${helposFaqs.viewCount} + 1` })
      .where(sql`${helposFaqs.id} IN (${sql.join(faqs.map(f => sql`${f.id}`), sql`, `)})`);
    return { results: faqs, count: faqs.length, query };
  }));

  helpaiOrchestrator.registerAction(mkAction('helpdesk.faq.suggest', async (params) => {
    const { workspaceId, question, answer, category = 'general', sourceTicketId } = params;
    if (!workspaceId || !question || !answer) {
      return { error: 'workspaceId, question, and answer are required' };
    }
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const [faq] = await db.insert(helposFaqs).values({
      workspaceId,
      category,
      question,
      answer,
      status: 'needs_review',
      autoSuggested: true,
      relatedTicketIds: sourceTicketId ? [sourceTicketId] : [],
      sourceType: 'ai',
      sourceId: sourceTicketId,
      isPublished: false,
      reviewRequired: true,
    }).returning({ id: helposFaqs.id, question: helposFaqs.question });
    return { created: true, faqId: faq.id, status: 'needs_review', message: 'FAQ queued for human review before publishing' };
  }));

  helpaiOrchestrator.registerAction(mkAction('helpdesk.workspace.history', async (params) => {
    const { workspaceId, daysBack = 30 } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const since = new Date();
    since.setDate(since.getDate() - daysBack);
    const tickets = await db.select({
      id: supportTickets.id,
      ticketNumber: supportTickets.ticketNumber,
      subject: supportTickets.subject,
      status: supportTickets.status,
      priority: supportTickets.priority,
      type: supportTickets.type,
      emailCategory: supportTickets.emailCategory,
      createdAt: supportTickets.createdAt,
      resolvedAt: supportTickets.resolvedAt,
    }).from(supportTickets)
      .where(and(
        eq(supportTickets.workspaceId, workspaceId),
        gte(supportTickets.createdAt, since),
      ))
      .orderBy(desc(supportTickets.createdAt))
      .limit(50);
    const open = tickets.filter(t => t.status === 'open').length;
    const resolved = tickets.filter(t => t.status === 'resolved').length;
    const urgent = tickets.filter(t => t.priority === 'urgent').length;
    const categoryMap: Record<string, number> = {};
    for (const t of tickets) {
      const cat = t.emailCategory ?? t.type ?? 'general';
      categoryMap[cat] = (categoryMap[cat] ?? 0) + 1;
    }
    const recurringTopics = Object.entries(categoryMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, count]) => ({ topic, count }));
    return {
      workspaceId,
      daysBack,
      totalTickets: tickets.length,
      openTickets: open,
      resolvedTickets: resolved,
      urgentTickets: urgent,
      recurringTopics,
      recentTickets: tickets.slice(0, 10),
    };
  }));
}
