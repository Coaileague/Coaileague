/**
 * SPS Negotiation Routes — /api/sps/negotiations
 * Client ↔ Org proposal negotiation with Trinity-assisted message polishing,
 * terms extraction, and agreement detection.
 */
import { Router } from 'express';
import { db } from '../db';
import {
  spsNegotiationThreads, spsNegotiationMessages, spsDocuments, workspaces,
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { callSpsAI } from './spsAIHelper';
import { createLogger } from '../lib/logger';
const log = createLogger('SpsNegotiationRoutes');


export const spsNegotiationRouter = Router();

// Look up workspace's company name and license for dynamic AI prompts
async function getWorkspaceOrgLabel(workspaceId: string): Promise<string> {
  try {
    const [ws] = await db.select({ companyName: workspaces.companyName, licenseNumber: workspaces.stateLicenseNumber })
      .from(workspaces).where(eq(workspaces.id, workspaceId));
    const name = ws?.companyName || 'your security company';
    const lic = ws?.licenseNumber ? ` (LIC#${ws.licenseNumber})` : '';
    return `${name}${lic}`;
  } catch {
    return 'your security company';
  }
}

// Agreement detection keywords
const AGREEMENT_SIGNALS = [
  'that works', 'we accept', 'agreed', "let's move forward", 'sounds good',
  'deal', 'approved', 'confirmed', 'yes to all', 'good to go', 'let\'s do it',
  'we\'re in', 'you have a deal', 'looks good to us', 'moving forward',
];

function detectAgreementSignal(message: string): boolean {
  const lower = message.toLowerCase();
  return AGREEMENT_SIGNALS.some(signal => lower.includes(signal));
}

// Extract proposed terms from client message via SPS AI
async function extractProposedTerms(message: string): Promise<Record<string, any>> {
  try {
    const prompt = `You are a terms extraction assistant for a security services company proposal.
Analyze this client message and extract any specific terms they are proposing or questioning.
Return ONLY valid JSON with these keys (null if not mentioned):
{
  "proposedRateUnarmed": null,
  "proposedRateArmed": null,
  "proposedRatePrimary": null,
  "proposedRateAdditional": null,
  "proposedSchedule": null,
  "proposedOfficerCount": null,
  "specialRequests": null,
  "concerns": null,
  "summary": "brief 1-sentence summary of client's position"
}

Client message: "${message.replace(/"/g, "'")}"`;

    const raw = await callSpsAI({ prompt, maxTokens: 512 });
    return JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
  } catch {
    return {};
  }
}

// POST /api/sps/negotiations — Create negotiation thread (from proposal)
spsNegotiationRouter.post('/', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });

    const input = z.object({
      clientName: z.string().min(1),
      clientEmail: z.string().email(),
      clientPhone: z.string().optional(),
      clientCompanyName: z.string().optional(),
      serviceLocation: z.string().optional(),
      proposalData: z.record(z.any()).optional(),
      documentId: z.string().optional(), // linked sps_documents proposal
    }).parse(req.body);

    const year = new Date().getFullYear();
    const proposalNumber = `PRO-${year}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const clientAccessToken = randomUUID();

    const [thread] = await db.insert(spsNegotiationThreads).values({
      id: randomUUID(),
      workspaceId,
      documentId: input.documentId || null,
      proposalNumber,
      clientName: input.clientName,
      clientEmail: input.clientEmail,
      clientPhone: input.clientPhone || null,
      clientCompanyName: input.clientCompanyName || null,
      serviceLocation: input.serviceLocation || null,
      proposalData: (input.proposalData || {}) as any,
      status: 'active',
      clientAccessToken,
    }).returning();

    res.status(201).json({
      ...thread,
      proposalPortalUrl: `/sps-proposal/${clientAccessToken}`,
    });
  } catch (err: unknown) {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (err.name === 'ZodError') return res.status(400).json({ error: 'Validation error', details: err.errors });
    res.status(500).json({ error: 'Failed to create negotiation thread' });
  }
});

// GET /api/sps/negotiations — List threads for workspace
spsNegotiationRouter.get('/', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });

    const threads = await db.select().from(spsNegotiationThreads)
      .where(eq(spsNegotiationThreads.workspaceId, workspaceId))
      .orderBy(desc(spsNegotiationThreads.updatedAt));

    res.json(threads);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch negotiation threads' });
  }
});

// GET /api/sps/negotiations/:id — Thread + messages
spsNegotiationRouter.get('/:id', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const [thread] = await db.select().from(spsNegotiationThreads)
      .where(and(eq(spsNegotiationThreads.id, req.params.id), eq(spsNegotiationThreads.workspaceId, workspaceId)));
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    const messages = await db.select().from(spsNegotiationMessages)
      .where(eq(spsNegotiationMessages.threadId, req.params.id))
      .orderBy(spsNegotiationMessages.createdAt);

    res.json({ thread, messages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch thread' });
  }
});

// POST /api/sps/negotiations/:id/messages — Send org message (with Trinity option)
spsNegotiationRouter.post('/:id/messages', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const [thread] = await db.select().from(spsNegotiationThreads)
      .where(and(eq(spsNegotiationThreads.id, req.params.id), eq(spsNegotiationThreads.workspaceId, workspaceId)));
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    const input = z.object({
      messageRaw: z.string().min(1),
      senderType: z.enum(['org', 'client']),
      senderName: z.string().min(1),
      senderEmail: z.string().email(),
      useAiEnhancement: z.boolean().optional().default(false),
      aiSuggestionUsed: z.boolean().optional().default(false),
    }).parse(req.body);

    let messageAiEnhanced: string | null = null;

    // Trinity polishing for org messages
    if (input.senderType === 'org' && input.useAiEnhancement) {
      try {
        const orgLabel = await getWorkspaceOrgLabel(workspaceId);
        const prompt = `You are a professional security company sales consultant for ${orgLabel}.
Polish this message to be professional, clear, legally appropriate, and persuasive while maintaining the core intent.
Keep it concise. Do not change pricing unless instructed.
Return ONLY the polished message text, no explanation.

Original message: "${input.messageRaw.replace(/"/g, "'")}"`;
        messageAiEnhanced = await callSpsAI({ prompt, maxTokens: 512 });
      } catch {
        messageAiEnhanced = null;
      }
    }

    // Extract proposed terms from client messages
    let proposedTerms: Record<string, any> = {};
    if (input.senderType === 'client') {
      proposedTerms = await extractProposedTerms(input.messageRaw);
    }

    // Agreement detection
    const agreementDetected = input.senderType === 'client'
      ? detectAgreementSignal(input.messageRaw)
      : false;

    const [message] = await db.insert(spsNegotiationMessages).values({
      id: randomUUID(),
      threadId: req.params.id,
      senderType: input.senderType,
      senderName: input.senderName,
      senderEmail: input.senderEmail,
      messageRaw: input.messageRaw,
      messageAiEnhanced,
      aiSuggestionUsed: input.aiSuggestionUsed,
      proposedTerms: proposedTerms as any,
      agreementSignalDetected: agreementDetected,
    }).returning();

    // Update thread if agreement detected
    if (agreementDetected && !thread.agreementDetected) {
      await db.update(spsNegotiationThreads)
        .set({
          agreementDetected: true,
          agreementDetectedAt: new Date(),
          agreedTerms: proposedTerms as any,
          updatedAt: new Date(),
        })
        .where(eq(spsNegotiationThreads.id, req.params.id));
    } else {
      await db.update(spsNegotiationThreads)
        .set({ updatedAt: new Date() })
        .where(eq(spsNegotiationThreads.id, req.params.id));
    }

    res.status(201).json({
      message,
      proposedTerms,
      agreementDetected,
      aiEnhancedVersion: messageAiEnhanced,
    });
  } catch (err: unknown) {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (err.name === 'ZodError') return res.status(400).json({ error: 'Validation error', details: err.errors });
    log.error('[spsNegotiationRoutes] POST message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// POST /api/sps/negotiations/:id/polish — Get Trinity polish suggestion (without sending)
spsNegotiationRouter.post('/:id/polish', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    const [thread] = await db.select().from(spsNegotiationThreads)
      .where(and(eq(spsNegotiationThreads.id, req.params.id), eq(spsNegotiationThreads.workspaceId, workspaceId)));
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    const { messageRaw } = req.body;
    if (!messageRaw) return res.status(400).json({ error: 'messageRaw required' });

    let polished = messageRaw;
    try {
      const orgLabel = await getWorkspaceOrgLabel(workspaceId || 'unknown');
      polished = await callSpsAI({
        prompt: `You are a professional security company sales consultant for ${orgLabel}.
Polish this message to be professional, clear, legally appropriate, and persuasive while maintaining the core intent.
Keep it concise. Do not change pricing unless instructed.
Return ONLY the polished message text.

Original: "${messageRaw.replace(/"/g, "'")}"`,
        maxTokens: 512,
      });
    } catch (e) {
      polished = messageRaw;
    }

    res.json({ original: messageRaw, polished });
  } catch (err) {
    res.status(500).json({ error: 'Polish failed' });
  }
});

// POST /api/sps/negotiations/:id/convert-to-contract — Generate contract from agreed terms
spsNegotiationRouter.post('/:id/convert-to-contract', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const [thread] = await db.select().from(spsNegotiationThreads)
      .where(and(eq(spsNegotiationThreads.id, req.params.id), eq(spsNegotiationThreads.workspaceId, workspaceId)));
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    const year = new Date().getFullYear();
    const contractNumber = `CON-${year}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const accessToken = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);

    const agreedTerms = (thread as any).agreedTerms || {};
    const proposalData = (thread as any).proposalData || {};

    const [doc] = await db.insert(spsDocuments).values({
      id: randomUUID(),
      workspaceId,
      documentType: 'client_contract',
      documentNumber: contractNumber,
      status: 'draft',
      accessToken,
      expiresAt,
      recipientName: thread.clientName,
      recipientEmail: thread.clientEmail,
      // White-label (CLAUDE.md §6): signer comes from the authenticated
      // user. Hardcoded tenant identity removed.
      orgSignerName: (req.user)?.firstName
        ? `${(req.user).firstName} ${(req.user).lastName || ''}`.trim()
        : 'Authorized Signer',
      orgSignerEmail: (req.user)?.email || 'noreply@coaileague.com',
      clientCompanyName: thread.clientCompanyName || null,
      clientContactName: thread.clientName,
      serviceLocation: thread.serviceLocation || null,
      ratePrimary: (agreedTerms.proposedRatePrimary || proposalData.ratePrimary || null) as any,
      rateAdditional: (agreedTerms.proposedRateAdditional || proposalData.rateAdditional || null) as any,
      serviceType: (proposalData.serviceType || null) as any,
      contractTerm: (agreedTerms.contractTerm || proposalData.contractTerm || '90 Days Trial') as any,
      officersRequired: (proposalData.officersRequired || 1) as any,
      negotiationThreadId: thread.id,
      stateCode: 'TX',
      formData: {
        proposalNumber: thread.proposalNumber,
        agreedTerms,
        proposalData,
        sourceNegotiationId: thread.id,
      } as any,
      auditLog: [{ action: 'created_from_negotiation', timestamp: new Date().toISOString(), negotiationId: thread.id }] as any,
    }).returning();

    // Update thread to converted
    await db.update(spsNegotiationThreads)
      .set({
        status: 'converted_to_contract',
        contractDocumentId: doc.id,
        updatedAt: new Date(),
      })
      .where(eq(spsNegotiationThreads.id, req.params.id));

    res.status(201).json({
      contract: doc,
      contractPortalUrl: `/sps-packet/${accessToken}`,
    });
  } catch (err) {
    log.error('[spsNegotiationRoutes] convert-to-contract error:', err);
    res.status(500).json({ error: 'Failed to generate contract' });
  }
});
