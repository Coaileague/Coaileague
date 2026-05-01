/**
 * REPORTBOT PDF SERVICE
 * ======================
 * Compiles all shift room messages and photos into a professional
 * shift activity report PDF and saves it to the document safe.
 *
 * Uses pdfkit (same as darPdfService.ts) for consistency.
 * PDF is WORM-locked on save (immutable via metadata flag).
 */

import PDFDocument from 'pdfkit';
import { db } from '../../db';
import {
  chatConversations,
  chatMessages,
  chatParticipants,
  orgDocuments,
  shifts,
  employees,
  users,
  notifications,
} from '@shared/schema';
import { eq, and, asc, sql } from 'drizzle-orm';
import { format, startOfHour, addHours, differenceInHours, parseISO } from 'date-fns';
import { randomUUID } from 'crypto';
import { botAIService } from '../../bots/botAIService';
import { storage } from '../../storage';
import { createLogger } from '../../lib/logger';
const log = createLogger('reportBotPdfService');


// ─── Helpers ─────────────────────────────────────────────────────────────────

const GOLD = '#c4952a';
const NAVY = '#0f172a';
const LIGHT_GRAY = '#f1f5f9';
const DARK_GRAY = '#64748b';
const RED_COLOR = '#dc2626';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ShiftMessage {
  id: string;
  senderId: string | null;
  senderName: string | null;
  senderType: string | null;
  message: string;
  messageType: string | null;
  attachmentUrl: string | null;
  isBot: boolean;
  createdAt: Date;
  metadata?: any;
}

interface HourBlock {
  label: string;
  start: Date;
  end: Date;
  messages: ShiftMessage[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

class ReportBotPdfService {
  private static instance: ReportBotPdfService;

  static getInstance(): ReportBotPdfService {
    if (!ReportBotPdfService.instance) {
      ReportBotPdfService.instance = new ReportBotPdfService();
    }
    return ReportBotPdfService.instance;
  }

  async generateAndSaveShiftReport(
    conversationId: string,
    workspaceId: string
  ): Promise<{ success: boolean; documentId?: string; error?: string }> {
    try {
      log.info(`[ReportBotPDF] Starting report generation for room ${conversationId}`);

      // ── Fetch room data ──────────────────────────────────────────────────
      const [conv] = await db
        .select()
        .from(chatConversations)
        .where(eq(chatConversations.id, conversationId))
        .limit(1);

      if (!conv || !conv.shiftId) {
        return { success: false, error: 'Room or shift not found' };
      }

      const [shift] = await db
        .select()
        .from(shifts)
        .where(eq(shifts.id, conv.shiftId))
        .limit(1);

      if (!shift) {
        return { success: false, error: 'Shift record not found' };
      }

      // ── Officer info ─────────────────────────────────────────────────────
      let officerName = 'Officer';
      let officerEmployeeId = '';
      let officerLicenseNumber = '';
      if (shift.employeeId) {
        const [emp] = await db
          .select()
          .from(employees)
          .where(eq(employees.id, shift.employeeId))
          .limit(1);
        if (emp) {
          officerName = emp.lastName
            ? `${emp.firstName} ${emp.lastName}`
            : (emp.firstName || 'Officer');
          officerEmployeeId = emp.id;
          officerLicenseNumber = (emp as any).licenseNumber || (emp as any).badgeNumber || '';
        }
      }

      const siteName = (shift as any).siteName || (shift as any).jobSiteName || (shift as any).title || 'Site';
      const siteAddress = (shift as any).siteAddress || '';
      const shiftStart = new Date(shift.startTime);
      const shiftEnd = new Date(shift.endTime);

      // ── Fetch all messages ───────────────────────────────────────────────
      const rawMessages = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, conversationId))
        .orderBy(asc(chatMessages.createdAt));

      const messages: ShiftMessage[] = rawMessages.map(m => ({
        id: m.id,
        senderId: m.senderId,
        senderName: m.senderName,
        senderType: m.senderType,
        message: m.message || '',
        messageType: m.messageType,
        attachmentUrl: m.attachmentUrl,
        isBot: m.senderType === 'bot' || m.isSystemMessage || false,
        createdAt: new Date(m.createdAt || Date.now()),
        metadata: (m as any).metadata,
      }));

      // ── Quality scan on officer messages ─────────────────────────────────
      const officerMessages = messages.filter(m => !m.isBot && m.message.trim().length > 10);
      const articulated = await this.runQualityScan(officerMessages, workspaceId);

      // ── Build hourly blocks ──────────────────────────────────────────────
      const hourBlocks = this.buildHourBlocks(shiftStart, shiftEnd, messages);

      // ── Get workspace/org name ───────────────────────────────────────────
      let orgName = 'Security Services';
      try {
        const ws = await storage.getWorkspace(workspaceId);
        orgName = ws?.name || orgName;
      } catch {}

      const reportId = `SR-${Date.now().toString(36).toUpperCase()}`;

      // ── Generate PDF ─────────────────────────────────────────────────────
      const pdfBuffer = await this.buildPdf({
        reportId,
        orgName,
        siteName,
        siteAddress,
        shiftStart,
        shiftEnd,
        officerName,
        officerLicenseNumber,
        hourBlocks,
        articulated,
        messages,
      });

      // ── Save to object storage ────────────────────────────────────────────
      const fileName = `ShiftReport_${siteName.replace(/[^a-z0-9]/gi, '_')}_${format(shiftStart, 'yyyyMMdd')}_${format(shiftStart, 'HHmm')}_${reportId}.pdf`;

      let fileUrl = '';
      let filePath = `shifts/${workspaceId}/${fileName}`;
      try {
        const { Storage } = await import('@google-cloud/storage');
        const gcs = new Storage();
        const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
        if (bucketId) {
          const bucket = gcs.bucket(bucketId);
          const file = bucket.file(filePath);
          await file.save(pdfBuffer, { contentType: 'application/pdf' });
          fileUrl = `https://storage.googleapis.com/${bucketId}/${filePath}`;
        }
      } catch (storageErr) {
        log.warn('[ReportBotPDF] Object storage unavailable, saving metadata only:', storageErr);
      }

      // ── Save to org document safe (WORM) ─────────────────────────────────
      const docId = randomUUID();
      const wormMeta = JSON.stringify({
        wormLocked: true,
        lockedAt: new Date().toISOString(),
        lockedBy: 'reportbot',
        reportId,
        shiftId: conv.shiftId,
        conversationId,
        officerName,
        siteName,
        shiftDate: format(shiftStart, 'yyyy-MM-dd'),
      });
      await db.insert(orgDocuments).values({
        id: docId,
        workspaceId,
        uploadedBy: null,
        category: 'shifts',
        fileName,
        filePath: fileUrl || filePath,
        fileSizeBytes: pdfBuffer.length,
        fileType: 'application/pdf',
        description: `WORM:${wormMeta} | Shift Activity Report — ${siteName} — ${format(shiftStart, 'MMM d, yyyy')} — ${officerName}`,
        isActive: true,
        version: 1,
      });

      log.info(`[ReportBotPDF] Saved shift report ${docId} for shift ${conv.shiftId}`);

      // ── Notify managers ───────────────────────────────────────────────────
      await this.notifyManagersReportReady(workspaceId, siteName, shiftStart, officerName, docId, conversationId);

      // ── Post completion message in room ───────────────────────────────────
      await storage.createChatMessage({
        conversationId,
        senderId: 'reportbot',
        senderName: 'ReportBot',
        senderType: 'bot',
        message:
          `Shift report compiled and saved to the document safe under Shifts.\n\n` +
          `Report ID: ${reportId}\n` +
          `File: ${fileName}\n\n` +
          `Your supervisor has been notified and can review or send the report to the client.`,
        messageType: 'text',
        metadata: { botEvent: 'report_saved', docId, reportId },
      });

      // Mark room as completed
      await db.update(chatConversations)
        .set({
          status: 'closed',
          metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ roomStatus: 'completed', reportId, docId })}::jsonb`,
        })
        .where(eq(chatConversations.id, conversationId));

      return { success: true, documentId: docId };
    } catch (err: unknown) {
      log.error('[ReportBotPDF] Generation failed:', err);
      return { success: false, error: (err instanceof Error ? err.message : String(err)) };
    }
  }

  async generateGuardTourReport(params: {
    tourId: string;
    workspaceId: string;
    officerId?: string | null;
    completedAt: Date;
    scans: Array<any>;
    checkpoints: Array<any>;
  }): Promise<string | null> {
    try {
      const [workspace, officer] = await Promise.all([
        storage.getWorkspace(params.workspaceId),
        params.officerId
          ? db.select().from(employees).where(eq(employees.id, params.officerId)).limit(1).then((r) => r[0] || null)
          : Promise.resolve(null),
      ]);

      const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      const done = new Promise<Buffer>((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
      });

      doc.fontSize(18).font('Helvetica-Bold').text('Guard Tour Completion Report');
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Workspace: ${workspace?.name || params.workspaceId}`);
      doc.text(`Tour ID: ${params.tourId}`);
      doc.text(`Officer: ${officer ? `${officer.firstName || ''} ${officer.lastName || ''}`.trim() : 'Unknown'}`);
      doc.text(`Completed At: ${format(params.completedAt, 'yyyy-MM-dd HH:mm')}`);
      doc.text(`Checkpoints: ${params.checkpoints.length}`);
      doc.text(`Scans Recorded: ${params.scans.length}`);
      doc.moveDown();

      doc.font('Helvetica-Bold').text('Checkpoint Activity');
      doc.moveDown(0.3);
      for (const checkpoint of params.checkpoints) {
        const scan = params.scans.find((s: any) => s.checkpointId === checkpoint.id);
        const status = scan ? `Scanned at ${format(new Date(scan.scannedAt), 'HH:mm:ss')}` : 'Not scanned';
        doc.font('Helvetica').fontSize(9).text(`• ${checkpoint.name || checkpoint.id} — ${status}`);
      }

      doc.end();
      const pdfBuffer = await done;

      const safeTourId = String(params.tourId).replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `GuardTour_${safeTourId}_${format(params.completedAt, 'yyyyMMdd_HHmmss')}.pdf`;
      const filePath = `guard-tours/${params.workspaceId}/${fileName}`;

      let publicUrl: string | null = null;
      try {
        const { Storage } = await import('@google-cloud/storage');
        const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
        if (bucketId) {
          const gcs = new Storage();
          const file = gcs.bucket(bucketId).file(filePath);
          await file.save(pdfBuffer, { contentType: 'application/pdf' });
          publicUrl = `https://storage.googleapis.com/${bucketId}/${filePath}`;
        }
      } catch (storageErr) {
        log.warn('[ReportBotPDF] Guard tour upload failed (non-blocking):', storageErr);
      }

      await db.insert(orgDocuments).values({
        id: randomUUID(),
        workspaceId: params.workspaceId,
        uploadedBy: null,
        category: 'operations',
        fileName,
        filePath: publicUrl || filePath,
        fileSizeBytes: pdfBuffer.length,
        fileType: 'application/pdf',
        description: `Guard tour report for ${params.tourId} (${format(params.completedAt, 'yyyy-MM-dd HH:mm')})`,
        isActive: true,
        version: 1,
      });

      return publicUrl || filePath;
    } catch (err) {
      log.warn('[ReportBotPDF] Guard tour PDF generation failed (non-blocking):', err);
      return null;
    }
  }

  // ── Quality scan via AI ──────────────────────────────────────────────────

  private async runQualityScan(
    messages: ShiftMessage[],
    workspaceId: string
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (messages.length === 0) return result;

    try {
      const batch = messages.slice(0, 20).map(m => m.message).join('\n---\n');
      const aiResp = await botAIService.generate({
        botId: 'reportbot',
        workspaceId,
        action: 'cleanup',
        prompt:
          `You are a professional security report editor. Rewrite each of the following officer messages ` +
          `in professional security report language. Preserve the meaning. Correct spelling. ` +
          `Return JSON array of rewritten messages in the same order.\n\n` +
          `Messages:\n${batch}`,
        maxTokens: 2048,
      });

      if (aiResp.success && aiResp.text) {
        try {
          const jsonMatch = aiResp.text.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const rewritten: string[] = JSON.parse(jsonMatch[0]);
            messages.slice(0, 20).forEach((m, i) => {
              if (rewritten[i] && rewritten[i] !== m.message) {
                result.set(m.id, rewritten[i]);
              }
            });
          }
        } catch {}
      }
    } catch (err) {
      log.warn('[ReportBotPDF] Quality scan failed (non-blocking):', err);
    }

    return result;
  }

  // ── Build hour blocks ────────────────────────────────────────────────────

  private buildHourBlocks(shiftStart: Date, shiftEnd: Date, messages: ShiftMessage[]): HourBlock[] {
    const blocks: HourBlock[] = [];
    let cursor = startOfHour(shiftStart);
    const end = addHours(startOfHour(shiftEnd), 1);

    while (cursor < end) {
      const next = addHours(cursor, 1);
      const blockMessages = messages.filter(
        m => m.createdAt >= cursor && m.createdAt < next && !m.isBot
      );
      blocks.push({
        label: `${format(cursor, 'HH:mm')} — ${format(next, 'HH:mm')}`,
        start: cursor,
        end: next,
        messages: blockMessages,
      });
      cursor = next;
    }

    return blocks;
  }

  // ── PDF construction ─────────────────────────────────────────────────────

  private buildPdf(params: {
    reportId: string;
    orgName: string;
    siteName: string;
    siteAddress: string;
    shiftStart: Date;
    shiftEnd: Date;
    officerName: string;
    officerLicenseNumber: string;
    hourBlocks: HourBlock[];
    articulated: Map<string, string>;
    messages: ShiftMessage[];
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const {
        reportId, orgName, siteName, siteAddress, shiftStart, shiftEnd,
        officerName, officerLicenseNumber, hourBlocks, articulated,
      } = params;

      const pageW = doc.page.width - 100;

      // ── WATERMARK ────────────────────────────────────────────────────────
      const watermarkOptions = {
        lineBreak: false,
        width: 600,
        height: 600,
        align: 'center' as const,
        baseline: 'middle' as const,
      };
      doc.save();
      doc.rotate(-45, { origin: [306, 396] });
      doc.fontSize(72).fillColor('#f1f5f9').opacity(0.15);
      doc.text('SHIFT REPORT', 56, 320, watermarkOptions);
      doc.restore();
      doc.opacity(1);

      // ── HEADER BAND ──────────────────────────────────────────────────────
      doc.rect(50, 50, pageW, 80).fill(NAVY);
      doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold');
      doc.text(orgName.toUpperCase(), 65, 65);
      doc.fontSize(11).font('Helvetica');
      doc.text('SHIFT ACTIVITY REPORT', 65, 90);
      doc.fontSize(9).fillColor(GOLD);
      doc.text(`Report ID: ${reportId}`, doc.page.width - 200, 75);
      doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`, doc.page.width - 200, 90);

      let y = 150;

      // ── SITE AND SHIFT INFO ───────────────────────────────────────────────
      doc.fillColor(NAVY).fontSize(12).font('Helvetica-Bold');
      doc.text('SITE INFORMATION', 50, y);
      y += 18;
      doc.moveTo(50, y).lineTo(50 + pageW, y).strokeColor(GOLD).lineWidth(1.5).stroke();
      y += 10;

      doc.font('Helvetica').fontSize(10).fillColor('#1e293b');
      const infoItems = [
        ['Site Name', siteName],
        ['Site Address', siteAddress || 'On file'],
        ['Shift Date', format(shiftStart, 'EEEE, MMMM d, yyyy')],
        ['Shift Time', `${format(shiftStart, 'HH:mm')} to ${format(shiftEnd, 'HH:mm')}`],
        ['Officer', officerName],
        ['License / Badge', officerLicenseNumber || 'On file'],
      ];

      for (const [label, value] of infoItems) {
        doc.font('Helvetica-Bold').text(`${label}:`, 50, y, { continued: true });
        doc.font('Helvetica').text(`  ${value}`, { lineBreak: false });
        y += 16;
      }

      y += 15;

      // ── HOURLY LOG ───────────────────────────────────────────────────────
      doc.fillColor(NAVY).fontSize(12).font('Helvetica-Bold');
      doc.text('HOURLY ACTIVITY LOG — CHRONOLOGICAL', 50, y);
      y += 18;
      doc.moveTo(50, y).lineTo(50 + pageW, y).strokeColor(GOLD).lineWidth(1.5).stroke();
      y += 12;

      let photoCounter = 0;

      for (const block of hourBlocks) {
        // Check if we need a new page
        if (y > doc.page.height - 120) {
          doc.addPage();
          y = 50;
        }

        // Hour header
        doc.rect(50, y, pageW, 18).fill(LIGHT_GRAY);
        doc.fillColor(NAVY).fontSize(10).font('Helvetica-Bold');
        doc.text(block.label, 56, y + 4);
        y += 22;

        if (block.messages.length === 0) {
          doc.font('Helvetica').fontSize(9).fillColor(DARK_GRAY)
            .text('No officer activity documented for this period.', 60, y);
          y += 14;
        } else {
          for (const msg of block.messages) {
            if (y > doc.page.height - 100) {
              doc.addPage();
              y = 50;
            }

            const timeStr = format(msg.createdAt, 'HH:mm');
            const isPhoto = msg.messageType === 'image' || msg.attachmentUrl?.includes('image');
            const isIncident = detectIncident(msg.message);

            if (isPhoto) {
              photoCounter++;
              doc.fillColor(DARK_GRAY).font('Helvetica-Bold').fontSize(9);
              doc.text(`Photo ${photoCounter} — ${timeStr} — ${msg.senderName || officerName}`, 60, y);
              const metaGps = msg.metadata?.gps;
              if (metaGps) {
                doc.font('Helvetica').fontSize(8).fillColor(DARK_GRAY);
                doc.text(`GPS: ${metaGps.lat?.toFixed(5)}, ${metaGps.lng?.toFixed(5)}`, 60, y + 11);
                y += 12;
              }
              y += 14;
            } else {
              if (isIncident) {
                doc.rect(56, y - 2, pageW - 10, 14).fill('#fef2f2');
                doc.fillColor(RED_COLOR).font('Helvetica-Bold').fontSize(9);
                doc.text(`INCIDENT REPORT — ${timeStr}`, 60, y);
                y += 13;
              } else {
                doc.fillColor(DARK_GRAY).font('Helvetica-Bold').fontSize(8);
                doc.text(`${timeStr} — ${msg.senderName || officerName}`, 60, y);
                y += 11;
              }

              const displayText = articulated.get(msg.id) || msg.message;
              doc.font('Helvetica').fontSize(9).fillColor('#1e293b');
              const textHeight = doc.heightOfString(displayText, { width: pageW - 20 });
              doc.text(displayText, 66, y, { width: pageW - 20 });
              y += textHeight + 6;

              // If rewritten, show original as footnote
              if (articulated.has(msg.id)) {
                doc.fontSize(7).fillColor(DARK_GRAY).font('Helvetica-Oblique');
                doc.text(`Original: ${msg.message}`, 66, y, { width: pageW - 20 });
                y += doc.heightOfString(msg.message, { width: pageW - 20 }) + 4;
              }
            }
          }
        }

        y += 8;
      }

      // ── SIGNATURE SECTION ────────────────────────────────────────────────
      if (y > doc.page.height - 150) {
        doc.addPage();
        y = 50;
      }

      y += 10;
      doc.fillColor(NAVY).fontSize(12).font('Helvetica-Bold');
      doc.text('SIGNATURE AND CERTIFICATION', 50, y);
      y += 18;
      doc.moveTo(50, y).lineTo(50 + pageW, y).strokeColor(GOLD).lineWidth(1.5).stroke();
      y += 15;

      doc.font('Helvetica').fontSize(9).fillColor('#1e293b');
      doc.text(
        'This report was automatically compiled by ReportBot under Trinity AI orchestration and reviewed for accuracy. ' +
        'Original message content is preserved in the CoAIleague audit trail.',
        50, y, { width: pageW }
      );
      y += 35;

      // Signature lines
      for (const [label, name] of [
        ['Officer Signature', officerName],
        ['Supervisor Review', ''],
      ]) {
        doc.moveTo(50, y).lineTo(250, y).strokeColor(NAVY).lineWidth(0.5).stroke();
        doc.fillColor(DARK_GRAY).fontSize(8);
        doc.text(`${label}: ${name}`, 50, y + 3);
        doc.text(`Date: ${format(new Date(), 'MMM d, yyyy')}`, 260, y + 3);
        y += 30;
      }

      // ── FOOTER ───────────────────────────────────────────────────────────
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        const footerY = doc.page.height - 30;
        doc.fillColor(DARK_GRAY).fontSize(7).font('Helvetica');
        doc.text(
          `Powered by CoAIleague  |  Report ID: ${reportId}  |  Page ${i + 1} of ${range.count}`,
          50, footerY, { align: 'center', width: pageW }
        );
      }

      doc.end();
    });
  }

  // ── Notify managers ──────────────────────────────────────────────────────

  private async notifyManagersReportReady(
    workspaceId: string,
    siteName: string,
    shiftStart: Date,
    officerName: string,
    docId: string,
    conversationId: string
  ): Promise<void> {
    try {
      const managers = await db
        .select()
        .from(employees)
        .where(
          and(
            eq(employees.workspaceId, workspaceId),
            sql`${employees.role} IN ('manager', 'co_owner', 'org_owner', 'supervisor')`
          )
        );

      const dateStr = format(shiftStart, 'MMM d, yyyy');

      for (const mgr of managers) {
        if (mgr.userId) {
          await storage.createNotification({
            workspaceId,
            userId: mgr.userId,
            type: 'system',
            scope: 'workspace',
            category: 'schedule',
            title: `Shift Report Ready — ${siteName}`,
            idempotencyKey: `system-${Date.now()}-${mgr.userId}`,
            message: `Shift report for ${siteName} on ${dateStr} (Officer: ${officerName}) is ready. View or send to client.`,
            relatedEntityType: 'org_document',
            relatedEntityId: docId,
            metadata: { docId, siteName, officerName, shiftDate: dateStr, action: 'view_or_send' },
            createdBy: 'reportbot',
          });
        }
      }
    } catch (err) {
      log.error('[ReportBotPDF] Manager notification failed:', err);
    }
  }
}

// ─── Incident detection helper (shared with orchestrator) ───────────────────

function detectIncident(message: string): boolean {
  const patterns = [
    /incident/i, /assault/i, /fight/i, /weapon/i, /unauthorized/i, /suspicious/i,
    /trespass/i, /fire/i, /medical/i, /injured/i, /theft/i, /police/i, /emergency/i,
  ];
  return patterns.some(p => p.test(message));
}

export const reportBotPdfService = ReportBotPdfService.getInstance();
log.info('[ReportBotPdfService] Initialized');
