/**
 * SRA PDF Report Generator — Phase 33
 * Generates compliance audit reports as PDF with SHA-256 integrity hash.
 * Uses pdfkit (already installed). Called after Trinity stages all sections.
 */

import crypto from 'crypto';
import path from 'path';

export interface ReportSection {
  title: string;
  content: string;
  verified: boolean;
  resourceIds?: string[];
}

export interface SRAReportData {
  auditorName: string;
  badgeNumber: string;
  regulatoryBody: string;
  stateCode: string;
  workspaceName: string;
  auditPeriodStart: Date;
  auditPeriodEnd: Date;
  sessionId: string;
  generatedAt: Date;
  sections: ReportSection[];
  findings: Array<{
    findingType: string;
    severity: string;
    description: string;
    occupationCodeReference?: string | null;
    recommendedAction?: string | null;
    complianceDeadline?: Date | null;
    fineAmount?: string | number | null;
    status: string;
  }>;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#cc0000',
  major: '#e65c00',
  minor: '#b8860b',
  informational: '#2060a0',
};

const FINDING_TYPE_LABELS: Record<string, string> = {
  expired_license: 'Expired License',
  training_deficiency: 'Training Deficiency',
  documentation_gap: 'Documentation Gap',
  policy_violation: 'Policy Violation',
  staffing_violation: 'Staffing Violation',
};

/**
 * Generates a PDF buffer and its SHA-256 hash from the report data.
 * Returns { pdfBuffer, sha256Hash }
 */
export async function generateSRAReportPDF(data: SRAReportData): Promise<{ pdfBuffer: Buffer; sha256Hash: string }> {
  const { default: PDFDocument } = await import('pdfkit');

  const chunks: Buffer[] = [];
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 60, bottom: 60, left: 60, right: 60 },
    info: {
      Title: `SRA Audit Report — ${data.workspaceName}`,
      Author: `${data.auditorName} (${data.regulatoryBody})`,
      Subject: 'State Regulatory Audit Report',
      Keywords: 'regulatory audit compliance security',
      CreationDate: data.generatedAt,
    },
  });

  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  // ── HEADER ─────────────────────────────────────────────────────────────────
  doc
    .rect(0, 0, doc.page.width, 90)
    .fill('#1a3a6b');

  doc
    .fontSize(20)
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .text('STATE REGULATORY AUDIT REPORT', 60, 20, { align: 'left' })
    .fontSize(11)
    .font('Helvetica')
    .text(`${data.regulatoryBody} — ${data.stateCode}`, 60, 48)
    .text(`Powered by CoAIleague`, doc.page.width - 200, 48, { align: 'right', width: 140 });

  doc.moveDown(3);
  doc.fillColor('#000000');

  // ── AUDIT METADATA ──────────────────────────────────────────────────────────
  doc
    .fontSize(13)
    .font('Helvetica-Bold')
    .fillColor('#1a3a6b')
    .text('AUDIT INFORMATION')
    .moveDown(0.3);

  doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor('#1a3a6b').lineWidth(1.5).stroke();
  doc.moveDown(0.5);

  const metaFields = [
    ['Organization Audited', data.workspaceName],
    ['Audit Period', `${data.auditPeriodStart.toLocaleDateString('en-US')} — ${data.auditPeriodEnd.toLocaleDateString('en-US')}`],
    ['Auditor', data.auditorName],
    ['Badge Number', data.badgeNumber],
    ['Regulatory Body', data.regulatoryBody],
    ['Report Generated', data.generatedAt.toLocaleString('en-US')],
    ['Session Reference', data.sessionId.slice(0, 24) + '...'],
  ];

  doc.fontSize(10).font('Helvetica');
  for (const [label, value] of metaFields) {
    doc.fillColor('#555555').text(`${label}:`, 60, doc.y, { continued: true, width: 180 })
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .fillColor('#000000').font('Helvetica-Bold').text(` ${value}`, { font: 'Helvetica-Bold' }).font('Helvetica').moveDown(0.25);
  }
  doc.moveDown(0.5);

  // ── SECTIONS ────────────────────────────────────────────────────────────────
  for (const section of data.sections.filter(s => s.verified)) {
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#1a3a6b')
      .text(section.title.toUpperCase())
      .moveDown(0.2);

    doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor('#1a3a6b').lineWidth(1).stroke();
    doc.moveDown(0.4);

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#000000')
      .text(section.content, { lineGap: 4, paragraphGap: 6 })
      .moveDown(0.8);
  }

  // ── FINDINGS TABLE ──────────────────────────────────────────────────────────
  if (data.findings.length > 0) {
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#1a3a6b')
      .text('AUDIT FINDINGS SUMMARY')
      .moveDown(0.2);

    doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor('#1a3a6b').lineWidth(1).stroke();
    doc.moveDown(0.4);

    let findingNum = 1;
    for (const finding of data.findings) {
      const severityColor = SEVERITY_COLORS[finding.severity] || '#000000';
      const typeLabel = FINDING_TYPE_LABELS[finding.findingType] || finding.findingType;

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000')
        .text(`Finding #${findingNum}: ${typeLabel}`, { continued: true })
        .fillColor(severityColor)
        .text(`  [${finding.severity.toUpperCase()}]`);

      doc.font('Helvetica').fillColor('#000000').fontSize(9)
        .text(finding.description, { lineGap: 3, indent: 10 });

      if (finding.occupationCodeReference) {
        doc.fillColor('#555555').text(`Occupation Code: ${finding.occupationCodeReference}`, { indent: 10 });
      }
      if (finding.recommendedAction) {
        doc.fillColor('#1a3a6b').text(`Recommended Action: `, { continued: true, indent: 10 })
          .fillColor('#000000').text(finding.recommendedAction);
      }
      if (finding.complianceDeadline) {
        doc.fillColor('#555555').text(`Compliance Deadline: ${new Date(finding.complianceDeadline).toLocaleDateString('en-US')}`, { indent: 10 });
      }
      if (finding.fineAmount) {
        doc.fillColor('#cc0000').text(`Fine Amount: $${Number(finding.fineAmount).toFixed(2)}`, { indent: 10 });
      }
      doc.fillColor('#000000').moveDown(0.6);
      findingNum++;
    }
  }

  // ── SIGNATURE BLOCK ─────────────────────────────────────────────────────────
  doc.moveDown(1);
  doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor('#cccccc').lineWidth(0.5).stroke();
  doc.moveDown(0.5);

  doc.fontSize(9).fillColor('#555555').font('Helvetica')
    .text(`Digitally prepared by ${data.auditorName} — Badge #${data.badgeNumber}`)
    .text(`${data.regulatoryBody}, ${data.stateCode}`)
    .text(`Report generated: ${data.generatedAt.toISOString()}`);

  doc.moveDown(0.5);

  // ── FOOTER WITH SHA-256 PLACEHOLDER ────────────────────────────────────────
  // We'll stamp the hash AFTER generating, so we use a placeholder
  const hashPlaceholder = '[SHA256_HASH_PLACEHOLDER]';
  doc.fontSize(8).fillColor('#888888')
    .text(`Document Integrity: ${hashPlaceholder}`)
    .text('Powered by CoAIleague — coaileague.com');

  doc.end();

  await new Promise<void>(resolve => doc.on('end', resolve));
  const rawBuffer = Buffer.concat(chunks);

  // Compute SHA-256 of the raw PDF
  const sha256Hash = crypto.createHash('sha256').update(rawBuffer).digest('hex');

  // Stamp the real hash into the buffer (text replace the placeholder)
  const withHash = Buffer.from(
    rawBuffer.toString('latin1').replace(hashPlaceholder, `SHA-256: ${sha256Hash}`),
    'latin1'
  );

  return { pdfBuffer: withHash, sha256Hash };
}
