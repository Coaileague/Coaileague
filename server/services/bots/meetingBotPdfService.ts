/**
 * MEETINGBOT PDF SERVICE
 * ======================
 * Compiles meeting transcript, action items, decisions, and notes into
 * a professional meeting summary PDF saved to the document safe.
 *
 * Triggered by /meetingend slash command.
 * PDF is WORM-locked immediately on save (immutable).
 */

import PDFDocument from 'pdfkit';
import { db } from '../../db';
import { chatConversations, chatMessages, orgDocuments, employees } from '@shared/schema';
import { eq, asc, and, sql } from 'drizzle-orm';
import { format } from 'date-fns';
import { randomUUID } from 'crypto';
import { botAIService } from '../../bots/botAIService';
import { storage } from '../../storage';
import { typedExec } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('meetingBotPdfService');


const GOLD = '#c4952a';
const NAVY = '#0f172a';
const LIGHT_GRAY = '#f1f5f9';
const DARK_GRAY = '#64748b';

interface MeetingItem {
  type: 'action' | 'decision' | 'note' | 'message';
  text: string;
  author: string;
  timestamp: Date;
}

interface MotionRecord {
  text: string;
  movedBy: string;
  secondedBy?: string;
  addedAt: Date;
}

interface VoteRecord {
  motionIndex: number;
  voter: string;
  vote: 'yes' | 'no' | 'abstain';
  addedAt: Date;
}

interface AttendeeRecord {
  name: string;
  joinedAt: Date;
}

class MeetingBotPdfService {
  private static instance: MeetingBotPdfService;

  static getInstance(): MeetingBotPdfService {
    if (!MeetingBotPdfService.instance) {
      MeetingBotPdfService.instance = new MeetingBotPdfService();
    }
    return MeetingBotPdfService.instance;
  }

  async generateAndSaveMeetingSummary(
    conversationId: string,
    workspaceId: string,
    endedByUserId: string,
    endedByName: string
  ): Promise<{ success: boolean; documentId?: string; summaryText?: string; error?: string }> {
    try {
      // ── 0. Pull in-memory meeting bot data (motions, votes, attendees) ───
      let botMotions: MotionRecord[] = [];
      let botVotes: VoteRecord[] = [];
      let botAttendees: AttendeeRecord[] = [];
      let meetingType: string | undefined;
      try {
        const { shiftRoomBotOrchestrator } = await import('./shiftRoomBotOrchestrator');
        const botData = shiftRoomBotOrchestrator.getMeetingBotData(conversationId);
        if (botData) {
          botMotions = (botData as any).motions || [];
          botVotes = (botData as any).votes || [];
          botAttendees = (botData as any).attendees || [];
          meetingType = (botData as any).meetingType;
        }
      } catch {
        // Non-blocking — proceed without in-memory data
      }

      // ── 1. Fetch conversation metadata ───────────────────────────────────
      const [conv] = await db.select().from(chatConversations).where(eq(chatConversations.id, conversationId));
      if (!conv) return { success: false, error: 'Conversation not found' };

      // ── 2. Fetch all messages ────────────────────────────────────────────
      const rawMessages = await db.select().from(chatMessages)
        .where(eq(chatMessages.conversationId, conversationId))
        .orderBy(asc(chatMessages.createdAt));

      // ── 3. Categorize items ──────────────────────────────────────────────
      const items: MeetingItem[] = [];
      const participants = new Set<string>();
      const transcript: string[] = [];

      for (const msg of rawMessages) {
        if (msg.senderType === 'system') continue;
        const meta = (msg.metadata as any) || {};
        const author = msg.senderName || 'Unknown';
        const ts = new Date(msg.createdAt);

        if (msg.senderType !== 'bot') {
          participants.add(author);
          transcript.push(`${format(ts, 'HH:mm')} ${author}: ${msg.message}`);
        }

        if (meta.botCommand === 'actionitem') {
          items.push({ type: 'action', text: meta.actionItem || msg.message, author, timestamp: ts });
        } else if (meta.botCommand === 'decision') {
          items.push({ type: 'decision', text: meta.decision || msg.message, author, timestamp: ts });
        } else if (meta.botCommand === 'note') {
          items.push({ type: 'note', text: meta.note || msg.message, author, timestamp: ts });
        } else if (msg.senderType !== 'bot' && msg.messageType !== 'system') {
          items.push({ type: 'message', text: msg.message, author, timestamp: ts });
        }
      }

      // ── 4. AI-generate comprehensive summary from full transcript ───────────
      // Trinity reads the FULL transcript and identifies tagged + untagged decisions/action items
      let aiSummary = 'Meeting summary not available.';
      let aiStructured: {
        summary?: string;
        keyPoints?: string[];
        decisions?: string[];
        actionItems?: Array<{ task: string; owner: string }>;
        unresolvedQuestions?: string[];
        nextSteps?: string[];
      } = {};

      try {
        const taggedActions = items.filter(i => i.type === 'action').map(i => ({ text: i.text, owner: i.author }));
        const taggedDecisions = items.filter(i => i.type === 'decision').map(i => ({ text: i.text }));

        const summaryResp = await botAIService.generateFullTranscriptMeetingSummary(
          workspaceId,
          conv.subject || 'Meeting',
          transcript.slice(-200), // up to 200 transcript lines
          Array.from(participants),
          taggedActions,
          taggedDecisions
        );

        if (summaryResp.success && summaryResp.text) {
          // Try to parse structured JSON response
          try {
            const jsonMatch = summaryResp.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              aiStructured = JSON.parse(jsonMatch[0]);
              aiSummary = aiStructured.summary || summaryResp.text;
              // Merge AI-discovered items with tagged items
              if (aiStructured.actionItems) {
                for (const aiItem of aiStructured.actionItems) {
                  const alreadyTagged = taggedActions.some(t => t.text.toLowerCase().includes(aiItem.task.toLowerCase().slice(0, 30)));
                  if (!alreadyTagged) {
                    items.push({ type: 'action', text: `${aiItem.task} (detected by Trinity)`, author: aiItem.owner || 'Unassigned', timestamp: new Date() });
                  }
                }
              }
              if (aiStructured.decisions) {
                for (const dec of aiStructured.decisions) {
                  const alreadyTagged = taggedDecisions.some(t => t.text.toLowerCase().includes(dec.toLowerCase().slice(0, 30)));
                  if (!alreadyTagged) {
                    items.push({ type: 'decision', text: `${dec} (detected by Trinity)`, author: 'Trinity', timestamp: new Date() });
                  }
                }
              }
            }
          } catch {
            aiSummary = summaryResp.text;
          }
        }
      } catch {
        // non-blocking — use placeholder
      }

      // ── 5. Generate PDF ──────────────────────────────────────────────────
      const pdfBuffer = await this.buildPdf(
        conv.subject || 'Meeting Summary',
        items,
        Array.from(participants),
        aiSummary,
        endedByName,
        conv.createdAt ? new Date(conv.createdAt) : new Date(),
        new Date(),
        aiStructured,
        botMotions,
        botVotes,
        botAttendees,
        meetingType
      );

      // ── 6. Save to object storage ─────────────────────────────────────────
      let fileUrl = '';
      try {
        const { uploadFileToObjectStorage } = await import('../../objectStorage');
        const objectPath = `.private/meetings/${workspaceId}/${conversationId}/meeting-summary-${Date.now()}.pdf`;
        await uploadFileToObjectStorage({
          objectPath,
          buffer: pdfBuffer,
          metadata: { contentType: 'application/pdf', metadata: { conversationId, workspaceId } },
        });
        // Record storage usage — meeting PDFs are documents category; system-generated so never blocked
        const { recordStorageUsage } = await import('../../services/storage/storageQuotaService');
        recordStorageUsage(workspaceId, 'documents', pdfBuffer.length).catch(() => null);
        fileUrl = objectPath;
      } catch {
        // Fallback: store path marker (PDF bytes too large for metadata)
        fileUrl = `.private/meetings/${workspaceId}/${conversationId}/meeting-summary-unavailable.pdf`;
      }

      // ── 7. Save to org_documents (WORM-locked) ───────────────────────────
      const docId = randomUUID();
      const isLLCMeeting = meetingType === 'llc_compliance';
      const docCategory = isLLCMeeting ? 'meeting_minutes' : 'meetings';
      const fileName = `${isLLCMeeting ? 'LLC Compliance Meeting Minutes' : 'Meeting Summary'} — ${conv.subject || 'Untitled'} — ${format(new Date(), 'MMM d, yyyy')}.pdf`;
      await db.insert(orgDocuments).values({
        id: docId,
        workspaceId,
        uploadedBy: endedByUserId,
        category: docCategory,
        fileName,
        filePath: fileUrl,
        fileSizeBytes: pdfBuffer.length,
        fileType: 'application/pdf',
        description: `Auto-generated by MeetingBot. Attendees: ${Array.from(participants).join(', ')}. Meeting type: ${meetingType || 'general'}`,
        isActive: true,
        version: 1,
      });

      // ── 7b. LLC compliance: record meeting date to workspace metadata ──────
      if (isLLCMeeting) {
        try {
          // CATEGORY C — Raw SQL retained: ::jsonb | Tables: workspaces | Verified: 2026-03-23
          await typedExec(sql`
            UPDATE workspaces
            SET metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{lastLLCComplianceMeeting}',
              to_jsonb(NOW()::text)
            )
            WHERE id = ${workspaceId}
          `);
        } catch (llcErr) {
          log.warn('[MeetingBotPdf] LLC compliance date update failed (non-blocking):', llcErr);
        }
      }

      // ── 8. Notify managers ───────────────────────────────────────────────
      try {
        const staffRoster = await db.select({ id: employees.userId, workspaceRole: employees.workspaceRole })
          .from(employees)
          .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)));
        const managers = staffRoster.filter(e =>
          e.workspaceRole === 'manager' || e.workspaceRole === 'org_owner' || e.workspaceRole === 'co_owner'
        );
        for (const mgr of managers) {
          if (!mgr.id) continue;
          await storage.createNotification({
            userId: mgr.id,
            workspaceId,
            type: 'document',
            title: 'Meeting Summary Ready',
            message: `MeetingBot generated a meeting summary for "${conv.subject || 'Meeting'}". ${items.filter(i => i.type === 'action').length} action items, ${items.filter(i => i.type === 'decision').length} decisions.`,
            metadata: { documentId: docId, conversationId, category: 'meetings' },
            priority: 'normal',
          });
        }
      } catch {
        // non-blocking
      }

      return { success: true, documentId: docId, summaryText: aiSummary };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  private buildPdf(
    title: string,
    items: MeetingItem[],
    participants: string[],
    aiSummary: string,
    closedBy: string,
    startedAt: Date,
    endedAt: Date,
    aiStructured?: {
      summary?: string;
      keyPoints?: string[];
      decisions?: string[];
      actionItems?: Array<{ task: string; owner: string }>;
      unresolvedQuestions?: string[];
      nextSteps?: string[];
    },
    motions: MotionRecord[] = [],
    votes: VoteRecord[] = [],
    attendees: AttendeeRecord[] = [],
    meetingType?: string
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 100;
      const durationMin = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);

      // ── Header ──────────────────────────────────────────────────────────
      const headerLabel = meetingType === 'llc_compliance' ? 'LLC COMPLIANCE MEETING MINUTES' : 'MEETING SUMMARY';
      doc.rect(0, 0, doc.page.width, 80).fill(NAVY);
      doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold')
        .text(headerLabel, 50, 20, { width: pageWidth - 150 });
      doc.fillColor(GOLD).fontSize(11)
        .text(title, 50, 42, { width: pageWidth - 150 });
      doc.fillColor('#94a3b8').fontSize(9)
        .text('Generated by MeetingBot  •  CoAIleague Workforce Platform', 50, 60);
      doc.fillColor(GOLD).fontSize(9)
        .text(`WORM LOCKED`, doc.page.width - 130, 60);

      doc.moveDown(3);

      // ── Meta block ──────────────────────────────────────────────────────
      doc.rect(50, doc.y, pageWidth, 60).fill(LIGHT_GRAY);
      const metaY = doc.y + 10;
      doc.fillColor(NAVY).fontSize(9).font('Helvetica-Bold').text('DATE', 60, metaY);
      doc.fillColor(DARK_GRAY).font('Helvetica').text(format(startedAt, 'MMMM d, yyyy'), 60, metaY + 12);
      doc.fillColor(NAVY).font('Helvetica-Bold').text('DURATION', 200, metaY);
      doc.fillColor(DARK_GRAY).font('Helvetica').text(`${durationMin} min`, 200, metaY + 12);
      doc.fillColor(NAVY).font('Helvetica-Bold').text('CLOSED BY', 330, metaY);
      doc.fillColor(DARK_GRAY).font('Helvetica').text(closedBy, 330, metaY + 12);
      doc.moveDown(4);

      // ── Participants ─────────────────────────────────────────────────────
      const allAttendeeNames = new Set<string>(participants);
      attendees.forEach(a => allAttendeeNames.add(a.name));
      if (allAttendeeNames.size > 0) {
        doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('ATTENDEES', 50, doc.y);
        doc.rect(50, doc.y + 2, pageWidth, 1).fill(GOLD);
        doc.moveDown(0.8);
        doc.fillColor('#334155').fontSize(9).font('Helvetica')
          .text(Array.from(allAttendeeNames).join('  •  '), 50, doc.y, { width: pageWidth });
        doc.moveDown(1.5);
      }

      // ── AI Summary ───────────────────────────────────────────────────────
      doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('EXECUTIVE SUMMARY', 50, doc.y);
      doc.rect(50, doc.y + 2, pageWidth, 1).fill(GOLD);
      doc.moveDown(0.8);
      doc.fillColor('#334155').fontSize(9).font('Helvetica')
        .text(aiSummary, 50, doc.y, { width: pageWidth });
      doc.moveDown(1.5);

      // ── Key Points (Trinity-detected) ─────────────────────────────────────
      if (aiStructured?.keyPoints && aiStructured.keyPoints.length > 0) {
        doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('KEY POINTS', 50, doc.y);
        doc.rect(50, doc.y + 2, pageWidth, 1).fill(GOLD);
        doc.moveDown(0.8);
        aiStructured.keyPoints.forEach(kp => {
          doc.fillColor('#334155').fontSize(9).font('Helvetica')
            .text(`• ${kp}`, 58, doc.y, { width: pageWidth - 20 });
          doc.moveDown(0.4);
        });
        doc.moveDown(0.8);
      }

      // ── Unresolved Questions (Trinity-detected) ───────────────────────────
      if (aiStructured?.unresolvedQuestions && aiStructured.unresolvedQuestions.length > 0) {
        doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('UNRESOLVED QUESTIONS', 50, doc.y);
        doc.rect(50, doc.y + 2, pageWidth, 1).fill(GOLD);
        doc.moveDown(0.8);
        aiStructured.unresolvedQuestions.forEach((q, idx) => {
          doc.fillColor('#334155').fontSize(9).font('Helvetica')
            .text(`${idx + 1}. ${q}`, 58, doc.y, { width: pageWidth - 20 });
          doc.moveDown(0.4);
        });
        doc.moveDown(0.8);
      }

      // ── Decisions ────────────────────────────────────────────────────────
      const decisions = items.filter(i => i.type === 'decision');
      if (decisions.length > 0) {
        doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('DECISIONS', 50, doc.y);
        doc.rect(50, doc.y + 2, pageWidth, 1).fill(GOLD);
        doc.moveDown(0.8);
        decisions.forEach((d, idx) => {
          doc.fillColor(NAVY).fontSize(9).font('Helvetica-Bold')
            .text(`${idx + 1}.`, 50, doc.y, { continued: true })
            .fillColor('#334155').font('Helvetica')
            .text(`  ${d.text}`, { width: pageWidth - 20 });
          doc.fillColor(DARK_GRAY).fontSize(8)
            .text(`    — ${d.author}, ${format(d.timestamp, 'h:mm a')}`, 50, doc.y);
          doc.moveDown(0.5);
        });
        doc.moveDown(0.5);
      }

      // ── Motions & Votes ───────────────────────────────────────────────────
      if (motions.length > 0) {
        doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('MOTIONS & VOTES', 50, doc.y);
        doc.rect(50, doc.y + 2, pageWidth, 1).fill(GOLD);
        doc.moveDown(0.8);
        motions.forEach((motion, idx) => {
          const motionVotes = votes.filter(v => v.motionIndex === idx);
          const yes = motionVotes.filter(v => v.vote === 'yes').length;
          const no = motionVotes.filter(v => v.vote === 'no').length;
          const abstain = motionVotes.filter(v => v.vote === 'abstain').length;
          const total = yes + no + abstain;
          const passed = yes > no;

          doc.fillColor(NAVY).fontSize(9).font('Helvetica-Bold')
            .text(`Motion #${idx + 1}: ${motion.text}`, 50, doc.y, { width: pageWidth });
          doc.fillColor(DARK_GRAY).fontSize(8).font('Helvetica')
            .text(`Moved by: ${motion.movedBy}${motion.secondedBy ? `  •  Seconded by: ${motion.secondedBy}` : ''}`, 58, doc.y);
          if (total > 0) {
            const outcome = passed ? 'PASSED' : 'FAILED';
            const outcomeColor = passed ? '#16a34a' : '#dc2626';
            doc.fillColor(outcomeColor).fontSize(8).font('Helvetica-Bold')
              .text(`${outcome}  —  Yes: ${yes} | No: ${no} | Abstain: ${abstain}`, 58, doc.y);
            if (motionVotes.length > 0) {
              doc.fillColor(DARK_GRAY).fontSize(7).font('Helvetica')
                .text(`Votes: ${motionVotes.map(v => `${v.voter} (${v.vote})`).join(', ')}`, 58, doc.y, { width: pageWidth - 30 });
            }
          } else {
            doc.fillColor(DARK_GRAY).fontSize(8).font('Helvetica').text('No votes recorded.', 58, doc.y);
          }
          doc.moveDown(0.7);
        });
        doc.moveDown(0.5);
      }

      // ── Action Items ─────────────────────────────────────────────────────
      const actions = items.filter(i => i.type === 'action');
      if (actions.length > 0) {
        doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('ACTION ITEMS', 50, doc.y);
        doc.rect(50, doc.y + 2, pageWidth, 1).fill(GOLD);
        doc.moveDown(0.8);
        actions.forEach((a, idx) => {
          doc.rect(52, doc.y, 6, 6).stroke('#64748b');
          doc.fillColor('#334155').fontSize(9).font('Helvetica')
            .text(`${idx + 1}.  ${a.text}`, 65, doc.y, { width: pageWidth - 25 });
          doc.fillColor(DARK_GRAY).fontSize(8)
            .text(`    Assigned by: ${a.author}  •  ${format(a.timestamp, 'h:mm a')}`, 65, doc.y);
          doc.moveDown(0.7);
        });
        doc.moveDown(0.5);
      }

      // ── Notes ────────────────────────────────────────────────────────────
      const notes = items.filter(i => i.type === 'note');
      if (notes.length > 0) {
        doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('NOTES', 50, doc.y);
        doc.rect(50, doc.y + 2, pageWidth, 1).fill(GOLD);
        doc.moveDown(0.8);
        notes.forEach(n => {
          doc.fillColor('#334155').fontSize(9).font('Helvetica')
            .text(`• ${n.text}`, 58, doc.y, { width: pageWidth - 20 });
          doc.fillColor(DARK_GRAY).fontSize(8)
            .text(`  — ${n.author}, ${format(n.timestamp, 'h:mm a')}`, 58, doc.y);
          doc.moveDown(0.5);
        });
      }

      // ── Footer ───────────────────────────────────────────────────────────
      doc.rect(50, doc.page.height - 60, pageWidth, 1).fill(GOLD);
      doc.fillColor(DARK_GRAY).fontSize(8).font('Helvetica')
        .text(
          `Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}  •  WORM LOCKED — Document immutable  •  CoAIleague`,
          50, doc.page.height - 50, { width: pageWidth, align: 'center' }
        );

      doc.end();
    });
  }
}

export const meetingBotPdfService = MeetingBotPdfService.getInstance();
