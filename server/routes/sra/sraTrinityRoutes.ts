/**
 * SRA Trinity PDF Report Builder Routes — Phase 33
 *
 * Trinity guides the auditor through building a staged audit report.
 * Each conversation turn adds to or refines a section. Once all
 * sections are verified, the auditor generates the final signed PDF.
 *
 * POST /api/sra/trinity/chat             — Send message, get Trinity response + updated sections
 * GET  /api/sra/trinity/sections         — Get current staged sections
 * PATCH /api/sra/trinity/sections/:index/verify — Mark section verified/unverified
 * POST /api/sra/trinity/generate-pdf     — Generate final PDF (all sections must be verified)
 * GET  /api/sra/trinity/download/:docId  — Download generated PDF
 */

import { Router, Response } from 'express';
import { db } from '../../db';
import {
  sraAuditSessions, sraAccounts, sraFindings,
  sraEnforcementDocuments, workspaces, employees,
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { requireSRAAuth, SRARequest, logSraAction } from '../../middleware/sraAuth';
import { generateSRAReportPDF, ReportSection } from '../../services/sra/sraPdfGenerator';
import { getStateConfigStatic } from '../../services/compliance/stateRegulatoryKnowledgeBase';
import OpenAI from 'openai';
import { aiMeteringService } from '../../services/billing/aiMeteringService';
import { createLogger } from '../../lib/logger';
const log = createLogger('SraTrinityRoutes');


const router = Router();

// Lazy proxy: avoids module-load crash if OPENAI_API_KEY is missing.
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY is not set. SRA Trinity audit routes are unavailable.');
  }
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}
const openai = new Proxy({} as OpenAI, {
  get(_t, prop) {
    return (getOpenAI() as any)[prop];
  },
});

/** Typed shape of the `trinity_context` jsonb column stored in sra_audit_sessions */
interface TrinityContextData {
  messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  sections?: Array<ReportSection & { index: number; verified: boolean }>;
}

const TRINITY_SYSTEM_PROMPT = `You are Trinity, an AI assistant specialized in state regulatory compliance auditing for the security guard industry. You are helping a state regulatory auditor build an official audit report.

Your role:
1. Guide the auditor conversationally through building each section of the audit report
2. Ask targeted questions to gather the information needed for each section
3. Build structured report content based on auditor responses
4. Reference state-specific regulations and occupation codes when relevant
5. Be professional, precise, and thorough — this is a government document

Report sections you will build together:
- Executive Summary
- Organization Overview  
- Officer Compliance Assessment
- Training & Certification Review
- Incident & Liability Analysis
- Findings & Deficiencies
- Recommendations
- Auditor Certification

For each section, after gathering sufficient information, provide a SECTION_CONTENT block in this exact format:
---SECTION_START---
TITLE: [section title]
CONTENT: [formatted section content ready for the PDF report]
---SECTION_END---

Rules:
- Never generate fictional data; only use information provided by the auditor or from the connected database
- Always cite specific state statutes when noting violations
- Ask follow-up questions if information is incomplete before writing a section
- Maintain a formal government document tone`;

// ── POST /api/sra/trinity/chat ────────────────────────────────────────────────

router.post('/chat', requireSRAAuth, async (req: SRARequest, res: Response) => {
  const { sraSession } = req;
  if (!sraSession) return res.status(401).json({ success: false });

  const { message, resetContext } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ success: false, error: 'Message is required.' });
  }

  try {
    // Load session with context
    const [session] = await db.select()
      .from(sraAuditSessions)
      .where(eq(sraAuditSessions.id, sraSession.sessionId))
      .limit(1);

    if (!session) return res.status(404).json({ success: false, error: 'Session not found.' });

    // Load workspace and findings for context
    const [workspace] = await db.select({ name: workspaces.name, stateCode: (workspaces as any).stateCode })
      .from(workspaces).where(eq(workspaces.id, sraSession.workspaceId)).limit(1);

    const findings = await db.select({
      findingType: sraFindings.findingType,
      severity: sraFindings.severity,
      description: sraFindings.description,
      occupationCodeReference: sraFindings.occupationCodeReference,
      status: sraFindings.status,
    }).from(sraFindings).where(eq(sraFindings.sessionId, sraSession.sessionId));

    const stateConfig = getStateConfigStatic(sraSession.stateCode);
    const officerRows = await db.select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.workspaceId, sraSession.workspaceId), eq(employees.isActive, true)));
    const officerCount = officerRows;

    // Build context injection for Trinity
    const contextSummary = `
AUDIT CONTEXT:
- Organization: ${workspace?.name || 'Unknown'}
- State: ${sraSession.stateCode}
- Regulatory Body: ${stateConfig?.regulatoryBody || 'State Regulatory Authority'}
- Audit Period: ${new Date(session.auditPeriodStart).toLocaleDateString()} to ${new Date(session.auditPeriodEnd).toLocaleDateString()}
- Active Officers: ${officerCount.length}
- Findings Recorded: ${findings.length} total (${findings.filter(f => f.severity === 'critical').length} critical, ${findings.filter(f => f.severity === 'major').length} major)
- Key Statutes: ${stateConfig?.keyStatutes?.map(s => s.citation).join(', ') || 'State licensing statutes'}
`;

    // Build conversation history from context
    let contextMessages: Array<{ role: string; content: string }> = resetContext
      ? []
      : (session.trinityContext as Array<{ role: string; content: string }> || []);

    // Add context injection if fresh start
    if (contextMessages.length === 0) {
      contextMessages.push({
        role: 'system',
        content: TRINITY_SYSTEM_PROMPT + '\n\n' + contextSummary,
      });
    }

    contextMessages.push({ role: 'user', content: message.trim() });

    // Call OpenAI — SRA is a state regulator tool (no customer workspace billing context)
    const completion = await openai.chat.completions.create({ // withGpt
      model: 'gpt-4o-mini',
      messages: contextMessages.map(m => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
      max_tokens: 1200,
      temperature: 0.3,
    });

    const assistantReply = completion.choices[0]?.message?.content || 'I apologize, I was unable to generate a response. Please try again.';
    aiMeteringService.recordAiCall({
      workspaceId: 'sra-system',
      modelName: 'gpt-4o-mini',
      callType: 'sra_trinity_chat',
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    });

    // Add assistant reply to context
    contextMessages.push({ role: 'assistant', content: assistantReply });

    // Parse any SECTION_CONTENT blocks from the reply
    const newSections: Array<{ title: string; content: string }> = [];
    const sectionRegex = /---SECTION_START---\s*TITLE:\s*(.+?)\s*CONTENT:\s*([\s\S]+?)\s*---SECTION_END---/g;
    let match;
    while ((match = sectionRegex.exec(assistantReply)) !== null) {
      newSections.push({ title: match[1].trim(), content: match[2].trim() });
    }

    // Update or add staged sections
    let currentSections: Array<ReportSection & { index: number }> = (session.trinityContext as TrinityContextData)?.sections || [];
    for (const ns of newSections) {
      const existing = currentSections.find(s => s.title.toLowerCase() === ns.title.toLowerCase());
      if (existing) {
        existing.content = ns.content;
        existing.verified = false; // Reset verification when content changes
      } else {
        currentSections.push({ ...ns, verified: false, index: currentSections.length });
      }
    }

    // Store updated context in DB (keep last 40 messages)
    const trimmedContext = contextMessages.slice(-40);
    await db.update(sraAuditSessions).set({
      trinityContext: { messages: trimmedContext, sections: currentSections } as unknown as TrinityContextData,
    }).where(eq(sraAuditSessions.id, sraSession.sessionId));

    // Log Trinity interaction
    await logSraAction(sraSession.sessionId, sraSession.sraAccountId, sraSession.workspaceId, 'trinity_query', {
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      sectionsGenerated: newSections.length,
    }, req);

    return res.json({
      success: true,
      reply: assistantReply,
      newSections,
      sections: currentSections,
      usage: completion.usage,
    });
  } catch (err) {
    log.error('[SRA Trinity] Chat error:', err);
    return res.status(500).json({ success: false, error: 'Trinity encountered an error. Please try again.' });
  }
});

// ── GET /api/sra/trinity/sections ─────────────────────────────────────────────

router.get('/sections', requireSRAAuth, async (req: SRARequest, res: Response) => {
  const { sraSession } = req;
  if (!sraSession) return res.status(401).json({ success: false });

  try {
    const [session] = await db.select({ trinityContext: sraAuditSessions.trinityContext })
      .from(sraAuditSessions)
      .where(eq(sraAuditSessions.id, sraSession.sessionId))
      .limit(1);

    const context = (session?.trinityContext as TrinityContextData) || {};
    const sections = context.sections || [];

    return res.json({ success: true, sections });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to load sections.' });
  }
});

// ── PATCH /api/sra/trinity/sections/:index/verify ────────────────────────────

router.patch('/sections/:index/verify', requireSRAAuth, async (req: SRARequest, res: Response) => {
  const { sraSession } = req;
  if (!sraSession) return res.status(401).json({ success: false });

  const sectionIndex = parseInt(req.params.index, 10);
  const { verified } = req.body;

  if (isNaN(sectionIndex)) {
    return res.status(400).json({ success: false, error: 'Invalid section index' });
  }

  try {
    const [session] = await db.select({ trinityContext: sraAuditSessions.trinityContext })
      .from(sraAuditSessions)
      .where(eq(sraAuditSessions.id, sraSession.sessionId))
      .limit(1);

    const context = (session?.trinityContext as TrinityContextData) || {};
    const sections = [...(context.sections || [])];

    if (sectionIndex < 0 || sectionIndex >= sections.length) {
      return res.status(400).json({ success: false, error: 'Section index out of range.' });
    }

    sections[sectionIndex].verified = !!verified;

    await db.update(sraAuditSessions).set({
      trinityContext: { ...context, sections } as unknown as TrinityContextData,
    }).where(eq(sraAuditSessions.id, sraSession.sessionId));

    return res.json({ success: true, sections });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to update section.' });
  }
});

// ── POST /api/sra/trinity/generate-pdf ───────────────────────────────────────

router.post('/generate-pdf', requireSRAAuth, async (req: SRARequest, res: Response) => {
  const { sraSession } = req;
  if (!sraSession) return res.status(401).json({ success: false });

  try {
    const [session] = await db.select()
      .from(sraAuditSessions)
      .where(eq(sraAuditSessions.id, sraSession.sessionId))
      .limit(1);

    const [account] = await db.select({
      fullLegalName: sraAccounts.fullLegalName,
      badgeNumber: sraAccounts.badgeNumber,
      regulatoryBody: sraAccounts.regulatoryBody,
    }).from(sraAccounts).where(eq(sraAccounts.id, sraSession.sraAccountId)).limit(1);

    const [workspace] = await db.select({ name: workspaces.name })
      .from(workspaces).where(eq(workspaces.id, sraSession.workspaceId)).limit(1);

    const findings = await db.select({
      findingType: sraFindings.findingType,
      severity: sraFindings.severity,
      description: sraFindings.description,
      occupationCodeReference: sraFindings.occupationCodeReference,
      recommendedAction: sraFindings.recommendedAction,
      complianceDeadline: sraFindings.complianceDeadline,
      fineAmount: sraFindings.fineAmount,
      status: sraFindings.status,
    }).from(sraFindings).where(eq(sraFindings.sessionId, sraSession.sessionId));

    const context = (session?.trinityContext as TrinityContextData) || {};
    const sections: ReportSection[] = context.sections || [];

    const verifiedSections = sections.filter(s => s.verified);
    if (verifiedSections.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No verified sections. Please verify at least one section before generating.',
      });
    }

    const { pdfBuffer, sha256Hash } = await generateSRAReportPDF({
      auditorName: account?.fullLegalName || 'Unknown Auditor',
      badgeNumber: account?.badgeNumber || 'N/A',
      regulatoryBody: account?.regulatoryBody || 'State Regulatory Authority',
      stateCode: sraSession.stateCode,
      workspaceName: workspace?.name || 'Unknown Organization',
      auditPeriodStart: new Date(session.auditPeriodStart),
      auditPeriodEnd: new Date(session.auditPeriodEnd),
      sessionId: sraSession.sessionId,
      generatedAt: new Date(),
      sections,
      findings: findings.map(f => ({
        findingType: f.findingType,
        severity: f.severity,
        description: f.description,
        occupationCodeReference: f.occupationCodeReference,
        recommendedAction: f.recommendedAction,
        complianceDeadline: f.complianceDeadline,
        fineAmount: f.fineAmount,
        status: f.status,
      })),
    });

    // Store PDF reference in enforcement documents
    const docId = `sra-report-${sraSession.sessionId.slice(0, 8)}-${Date.now()}`;
    const [enfDoc] = await db.insert(sraEnforcementDocuments).values({
      sessionId: sraSession.sessionId,
      workspaceId: sraSession.workspaceId,
      documentType: 'audit_report',
      documentUrl: `/api/sra/trinity/download/${docId}`,
      sha256Hash,
      issuedBySraId: sraSession.sraAccountId,
      metadata: { docId, sections: verifiedSections.length, findings: findings.length },
    }).returning();

    await logSraAction(sraSession.sessionId, sraSession.sraAccountId, sraSession.workspaceId, 'pdf_generated', {
      documentId: enfDoc.id,
      sha256Hash,
      sections: verifiedSections.length,
      findings: findings.length,
    }, req);

    // Return PDF directly
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="SRA-Audit-Report-${sraSession.workspaceId.slice(0, 8)}-${Date.now()}.pdf"`);
    res.setHeader('X-SHA256-Hash', sha256Hash);
    res.setHeader('X-Document-Id', enfDoc.id);
    res.send(pdfBuffer);
  } catch (err) {
    log.error('[SRA Trinity] PDF generation error:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate PDF report.' });
  }
});

export default router;
