/**
 * FORCE CLOCK PDF SERVICE
 * =======================
 * Generates the weekly Force Clock Audit Report — a WORM-locked PDF listing
 * every Trinity-assisted clock-in from the past 7 days, grouped by officer
 * and by approving manager, with flagged abuse patterns and recommendations.
 *
 * Triggered every Monday at 07:30 by autonomousScheduler.ts.
 * One PDF per active workspace.
 */

import PDFDocument from 'pdfkit';
import { db } from '../../db';
import { workspaces, employees, timeEntries, orgDocuments } from '@shared/schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import { format, subDays } from 'date-fns';
import { randomUUID } from 'crypto';
import { storage } from '../../storage';
import { createLogger } from '../../lib/logger';
const log = createLogger('forceClockPdfService');


const GOLD = '#c4952a';
const NAVY = '#0f172a';
const LIGHT_GRAY = '#f1f5f9';
const DARK_GRAY = '#64748b';
const RED = '#dc2626';
const AMBER = '#d97706';

interface ForceClockEntry {
  id: string;
  employeeId: string;
  officerName: string;
  approvedByUserId: string | null;
  approverName: string;
  clockIn: Date;
  clockOut: Date | null;
  reason: string;
  geofenceOverride: boolean;
}

interface OfficerSummary {
  officerName: string;
  employeeId: string;
  count: number;
  entries: ForceClockEntry[];
  flagged: boolean;
  flagReason: string;
}

interface ManagerSummary {
  approverName: string;
  approvedByUserId: string;
  count: number;
  entries: ForceClockEntry[];
  flagged: boolean;
}

class ForceClockPdfService {
  private static instance: ForceClockPdfService;

  static getInstance(): ForceClockPdfService {
    if (!ForceClockPdfService.instance) {
      ForceClockPdfService.instance = new ForceClockPdfService();
    }
    return ForceClockPdfService.instance;
  }

  /**
   * Weekly cron entry point — runs once per active workspace.
   */
  async runWeeklyReport(): Promise<void> {
    const allWorkspaces = await db
      .select({ id: workspaces.id, companyName: workspaces.companyName, name: workspaces.name })
      .from(workspaces)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .where(eq(workspaces.isActive, true));

    log.info(`[ForceClockPdf] Running weekly report for ${allWorkspaces.length} workspaces`);

    for (const ws of allWorkspaces) {
      try {
        await this.generateReportForWorkspace(ws.id, ws.companyName || ws.name || 'Unknown Company');
      } catch (err) {
        log.error(`[ForceClockPdf] Failed for workspace ${ws.id}:`, err);
      }
    }
  }

  /**
   * Generate and persist the force clock PDF for a single workspace.
   */
  async generateReportForWorkspace(workspaceId: string, companyName: string): Promise<{ success: boolean; documentId?: string; error?: string }> {
    try {
      const cutoff = subDays(new Date(), 7);

      // ── 1. Fetch force clock entries ────────────────────────────────────────
      const rawEntries = await db
        .select({
          id: timeEntries.id,
          employeeId: timeEntries.employeeId,
          approvedBy: timeEntries.approvedBy,
          clockIn: timeEntries.clockIn,
          clockOut: timeEntries.clockOut,
          reason: timeEntries.trinityClockInReason,
          geofenceOverride: timeEntries.geofenceOverrideRequired,
        })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.workspaceId, workspaceId),
            eq(timeEntries.trinityAssistedClockin, true),
            gte(timeEntries.clockIn, cutoff)
          )
        );

      if (rawEntries.length === 0) {
        log.info(`[ForceClockPdf] No force clocks in past 7d for workspace ${workspaceId} — skipping`);
        return { success: true };
      }

      // ── 2. Fetch employee names for all involved parties ────────────────────
      const allEmployees = await db
        .select({ userId: employees.userId, firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(eq(employees.workspaceId, workspaceId));

      const empMap = new Map<string, string>();
      for (const e of allEmployees) {
        if (e.userId) empMap.set(e.userId, `${e.firstName || ''} ${e.lastName || ''}`.trim() || e.userId);
      }

      // ── 3. Build enriched entries ───────────────────────────────────────────
      const entries: ForceClockEntry[] = rawEntries.map(r => ({
        id: r.id,
        employeeId: r.employeeId || '',
        officerName: empMap.get(r.employeeId || '') || r.employeeId || 'Unknown',
        approvedByUserId: r.approvedBy || null,
        approverName: r.approvedBy ? (empMap.get(r.approvedBy) || r.approvedBy) : 'System / Auto-approved',
        clockIn: r.clockIn ? new Date(r.clockIn) : new Date(),
        clockOut: r.clockOut ? new Date(r.clockOut) : null,
        reason: r.reason || 'No reason recorded',
        geofenceOverride: r.geofenceOverride ?? false,
      }));

      // ── 4. Group by officer ─────────────────────────────────────────────────
      const officerMap = new Map<string, OfficerSummary>();
      for (const e of entries) {
        const key = e.employeeId;
        if (!officerMap.has(key)) {
          officerMap.set(key, { officerName: e.officerName, employeeId: key, count: 0, entries: [], flagged: false, flagReason: '' });
        }
        const s = officerMap.get(key)!;
        s.count++;
        s.entries.push(e);
      }

      // Flag officers with 3+ force clocks in 7d
      for (const s of officerMap.values()) {
        if (s.count >= 5) {
          s.flagged = true;
          s.flagReason = `RED: ${s.count} force clocks in 7 days — critical review required`;
        } else if (s.count >= 3) {
          s.flagged = true;
          s.flagReason = `AMBER: ${s.count} force clocks in 7 days — pattern alert`;
        }
      }

      // ── 5. Group by approving manager ──────────────────────────────────────
      const managerMap = new Map<string, ManagerSummary>();
      for (const e of entries) {
        const key = e.approvedByUserId || 'auto';
        if (!managerMap.has(key)) {
          managerMap.set(key, { approverName: e.approverName, approvedByUserId: key, count: 0, entries: [], flagged: false });
        }
        const m = managerMap.get(key)!;
        m.count++;
        m.entries.push(e);
      }

      // Flag managers with 10+ approvals in 7d (abuse pattern)
      for (const m of managerMap.values()) {
        if (m.count >= 10) m.flagged = true;
      }

      // ── 6. Build PDF ────────────────────────────────────────────────────────
      const officerSummaries = Array.from(officerMap.values()).sort((a, b) => b.count - a.count);
      const managerSummaries = Array.from(managerMap.values()).sort((a, b) => b.count - a.count);
      const flaggedCount = officerSummaries.filter(s => s.flagged).length + managerSummaries.filter(m => m.flagged).length;

      const pdfBuffer = await this.buildPdf(
        companyName,
        entries,
        officerSummaries,
        managerSummaries,
        cutoff,
        new Date(),
        flaggedCount
      );

      // ── 7. Save to object storage ───────────────────────────────────────────
      let fileUrl = '';
      try {
        const { Storage } = await import('@google-cloud/storage');
        const gcs = new Storage();
        const bucketName = process.env.GCLOUD_STORAGE_BUCKET || process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
        if (!bucketName) {
          throw new Error('Object storage bucket not configured (set GCLOUD_STORAGE_BUCKET or DEFAULT_OBJECT_STORAGE_BUCKET_ID)');
        }
        const gcsPath = `.private/force_clock_reports/${workspaceId}/weekly-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
        const bucket = gcs.bucket(bucketName);
        const file = bucket.file(gcsPath);
        await file.save(pdfBuffer, { contentType: 'application/pdf', resumable: false });
        fileUrl = `gs://${bucketName}/${gcsPath}`;
      } catch {
        fileUrl = `.private/force_clock_reports/${workspaceId}/weekly-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      }

      // ── 8. Save to org_documents (WORM-locked) ──────────────────────────────
      const docId = randomUUID();
      const fileName = `Force Clock Audit Report — Week of ${format(cutoff, 'MMM d')} to ${format(new Date(), 'MMM d, yyyy')}.pdf`;
      await db.insert(orgDocuments).values({
        id: docId,
        workspaceId,
        uploadedBy: 'system',
        category: 'force_clock_reports',
        fileName,
        filePath: fileUrl,
        fileSizeBytes: pdfBuffer.length,
        fileType: 'application/pdf',
        description: `Auto-generated weekly force clock audit. ${entries.length} force clocks, ${flaggedCount} flagged pattern(s).`,
        isActive: true,
        version: 1,
      });

      // ── 9. Notify org owners if any flags ───────────────────────────────────
      if (flaggedCount > 0) {
        try {
          const owners = await db
            .select({ userId: employees.userId })
            .from(employees)
            .where(
              and(
                eq(employees.workspaceId, workspaceId),
                eq(employees.isActive, true),
                eq(employees.workspaceRole, 'org_owner')
              )
            );
          for (const o of owners) {
            if (!o.userId) continue;
            await storage.createNotification({
              userId: o.userId,
              workspaceId,
              type: 'compliance_alert',
              title: 'Force Clock Audit Report Ready',
              message: `Weekly force clock audit complete: ${entries.length} force clocks, ${flaggedCount} flagged patterns detected. Review the report in Documents.`,
              metadata: { documentId: docId, category: 'force_clock_reports', flaggedCount },
              // @ts-expect-error — TS migration: fix in refactoring sprint
              priority: flaggedCount >= 3 ? 'critical' : 'high',
            });
          }
        } catch {
          // non-blocking
        }
      }

      log.info(`[ForceClockPdf] Report saved for workspace ${workspaceId}: ${fileName}`);
      return { success: true, documentId: docId };
    } catch (err: any) {
      log.error(`[ForceClockPdf] Error generating report for workspace ${workspaceId}:`, err);
      return { success: false, error: err?.message || String(err) };
    }
  }

  private buildPdf(
    companyName: string,
    entries: ForceClockEntry[],
    officerSummaries: OfficerSummary[],
    managerSummaries: ManagerSummary[],
    periodStart: Date,
    periodEnd: Date,
    flaggedCount: number
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 100;

      // ── Header ──────────────────────────────────────────────────────────
      doc.rect(0, 0, doc.page.width, 90).fill(NAVY);
      doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold')
        .text('FORCE CLOCK AUDIT REPORT', 50, 18, { width: pageWidth - 120 });
      doc.fillColor(GOLD).fontSize(11)
        .text(companyName, 50, 40, { width: pageWidth - 120 });
      doc.fillColor('#94a3b8').fontSize(9)
        .text('Generated by ClockBot  •  CoAIleague Workforce Platform', 50, 58);
      doc.fillColor('#94a3b8').fontSize(9)
        .text(`Period: ${format(periodStart, 'MMM d, yyyy')} — ${format(periodEnd, 'MMM d, yyyy')}`, 50, 71);
      if (flaggedCount > 0) {
        doc.fillColor(RED).fontSize(9).font('Helvetica-Bold')
          .text(`${flaggedCount} PATTERN(S) FLAGGED`, doc.page.width - 180, 40);
      }
      doc.fillColor(GOLD).fontSize(8).font('Helvetica')
        .text('WORM LOCKED', doc.page.width - 130, 71);

      doc.moveDown(4);

      // ── Summary bar ─────────────────────────────────────────────────────
      doc.rect(50, doc.y, pageWidth, 50).fill(LIGHT_GRAY);
      const sumY = doc.y + 10;
      doc.fillColor(NAVY).fontSize(8).font('Helvetica-Bold').text('TOTAL FORCE CLOCKS', 60, sumY);
      doc.fillColor(DARK_GRAY).fontSize(16).font('Helvetica-Bold').text(String(entries.length), 60, sumY + 12);

      doc.fillColor(NAVY).fontSize(8).font('Helvetica-Bold').text('OFFICERS INVOLVED', 200, sumY);
      doc.fillColor(DARK_GRAY).fontSize(16).font('Helvetica-Bold').text(String(officerSummaries.length), 200, sumY + 12);

      doc.fillColor(NAVY).fontSize(8).font('Helvetica-Bold').text('APPROVING MANAGERS', 340, sumY);
      doc.fillColor(DARK_GRAY).fontSize(16).font('Helvetica-Bold').text(String(managerSummaries.filter(m => m.approvedByUserId !== 'auto').length), 340, sumY + 12);

      const flagColor = flaggedCount > 0 ? RED : '#16a34a';
      doc.fillColor(NAVY).fontSize(8).font('Helvetica-Bold').text('FLAGGED PATTERNS', 460, sumY);
      doc.fillColor(flagColor).fontSize(16).font('Helvetica-Bold').text(String(flaggedCount), 460, sumY + 12);

      doc.moveDown(4.5);

      // ── Officer Summary Table ────────────────────────────────────────────
      doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('OFFICER SUMMARY', 50, doc.y);
      doc.rect(50, doc.y + 2, pageWidth, 1).fill(GOLD);
      doc.moveDown(0.8);

      // Table header row
      doc.rect(50, doc.y, pageWidth, 18).fill(NAVY);
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
        .text('OFFICER', 55, doc.y + 4)
        .text('FORCE CLOCKS', 260, doc.y + 4)
        .text('STATUS', 370, doc.y + 4);
      doc.moveDown(1.5);

      for (const s of officerSummaries) {
        const rowColor = s.flagged ? (s.count >= 5 ? '#fef2f2' : '#fffbeb') : '#ffffff';
        doc.rect(50, doc.y, pageWidth, 20).fill(rowColor);
        doc.fillColor(NAVY).fontSize(8).font('Helvetica')
          .text(s.officerName, 55, doc.y + 4, { width: 200 });
        doc.fillColor(s.flagged ? (s.count >= 5 ? RED : AMBER) : DARK_GRAY).fontSize(8).font('Helvetica-Bold')
          .text(String(s.count), 265, doc.y + 4);
        const statusText = s.flagged ? s.flagReason.split(':')[0] : 'NORMAL';
        doc.fillColor(s.flagged ? (s.count >= 5 ? RED : AMBER) : '#16a34a').fontSize(7).font('Helvetica-Bold')
          .text(statusText, 375, doc.y + 4, { width: 170 });
        doc.moveDown(1.6);
      }

      doc.moveDown(1);

      // ── Manager Approval Summary ─────────────────────────────────────────
      doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('MANAGER APPROVAL SUMMARY', 50, doc.y);
      doc.rect(50, doc.y + 2, pageWidth, 1).fill(GOLD);
      doc.moveDown(0.8);

      doc.rect(50, doc.y, pageWidth, 18).fill(NAVY);
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
        .text('APPROVING MANAGER', 55, doc.y + 4)
        .text('APPROVALS', 310, doc.y + 4)
        .text('ABUSE FLAG', 400, doc.y + 4);
      doc.moveDown(1.5);

      for (const m of managerSummaries) {
        const rowColor = m.flagged ? '#fef2f2' : '#ffffff';
        doc.rect(50, doc.y, pageWidth, 20).fill(rowColor);
        doc.fillColor(NAVY).fontSize(8).font('Helvetica')
          .text(m.approverName, 55, doc.y + 4, { width: 250 });
        doc.fillColor(m.flagged ? RED : DARK_GRAY).fontSize(8).font('Helvetica-Bold')
          .text(String(m.count), 315, doc.y + 4);
        doc.fillColor(m.flagged ? RED : '#16a34a').fontSize(7).font('Helvetica-Bold')
          .text(m.flagged ? 'FLAGGED — 10+ APPROVALS' : 'OK', 405, doc.y + 4);
        doc.moveDown(1.6);
      }

      doc.moveDown(1);

      // ── Detailed Entry Log ───────────────────────────────────────────────
      if (doc.y > doc.page.height - 200) doc.addPage();

      doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('DETAILED FORCE CLOCK LOG', 50, doc.y);
      doc.rect(50, doc.y + 2, pageWidth, 1).fill(GOLD);
      doc.moveDown(0.8);

      doc.rect(50, doc.y, pageWidth, 18).fill(NAVY);
      doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold')
        .text('DATE/TIME', 55, doc.y + 4)
        .text('OFFICER', 150, doc.y + 4)
        .text('APPROVER', 290, doc.y + 4)
        .text('REASON', 420, doc.y + 4);
      doc.moveDown(1.5);

      for (const e of entries) {
        if (doc.y > doc.page.height - 80) {
          doc.addPage();
          doc.moveDown(1);
        }
        doc.rect(50, doc.y, pageWidth, 18).fill(LIGHT_GRAY);
        doc.fillColor(DARK_GRAY).fontSize(7).font('Helvetica')
          .text(format(e.clockIn, 'MM/dd HH:mm'), 55, doc.y + 4, { width: 92 })
          .text(e.officerName, 150, doc.y + 4, { width: 136 })
          .text(e.approverName, 290, doc.y + 4, { width: 126 })
          .text(e.reason.substring(0, 55), 420, doc.y + 4, { width: 140 });
        doc.moveDown(1.5);
      }

      doc.moveDown(1);

      // ── Trinity Recommendations ──────────────────────────────────────────
      if (doc.y > doc.page.height - 180) doc.addPage();

      doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('TRINITY AI RECOMMENDATIONS', 50, doc.y);
      doc.rect(50, doc.y + 2, pageWidth, 1).fill(GOLD);
      doc.moveDown(0.8);

      const recommendations: string[] = [];
      const highFreqOfficers = officerSummaries.filter(s => s.count >= 3);
      const highFreqManagers = managerSummaries.filter(m => m.flagged);

      if (highFreqOfficers.length > 0) {
        recommendations.push(`${highFreqOfficers.length} officer(s) have had 3+ force clocks this week. Review GPS compliance training and geofence coverage for: ${highFreqOfficers.map(s => s.officerName).join(', ')}.`);
      }
      if (highFreqManagers.length > 0) {
        recommendations.push(`${highFreqManagers.length} manager(s) approved 10+ force clocks this week. Review approval authority and consider requiring secondary authorization: ${highFreqManagers.map(m => m.approverName).join(', ')}.`);
      }
      if (entries.filter(e => e.geofenceOverride).length > 0) {
        recommendations.push(`${entries.filter(e => e.geofenceOverride).length} entries involved geofence overrides. Review post boundary accuracy and consider updating geofence radius for impacted sites.`);
      }
      if (recommendations.length === 0) {
        recommendations.push('No significant patterns detected this week. Force clock usage is within normal operational bounds.');
      }

      for (const rec of recommendations) {
        doc.rect(50, doc.y, pageWidth, 2).fill(LIGHT_GRAY);
        doc.moveDown(0.3);
        doc.rect(50, doc.y, 3, 20).fill(GOLD);
        doc.fillColor(DARK_GRAY).fontSize(9).font('Helvetica')
          .text(rec, 60, doc.y + 3, { width: pageWidth - 20 });
        doc.moveDown(1.5);
      }

      // ── Footer ───────────────────────────────────────────────────────────
      doc.rect(50, doc.page.height - 55, pageWidth, 1).fill(GOLD);
      doc.fillColor(DARK_GRAY).fontSize(7).font('Helvetica')
        .text(`Generated: ${format(new Date(), 'MMMM d, yyyy HH:mm')}  •  WORM-locked — immutable record  •  CoAIleague Force Clock Audit`, 50, doc.page.height - 45, { width: pageWidth, align: 'center' });

      doc.end();
    });
  }
}

export const forceClockPdfService = ForceClockPdfService.getInstance();
