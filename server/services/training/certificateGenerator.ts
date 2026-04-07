/**
 * Officer Training Certificate PDF Generator
 * ============================================
 * Produces a professional dark navy + gold PDF certificate
 * using PDFKit (already in use by paystubService and invoiceService).
 *
 * Returns a data URL or writes to object storage (if available).
 * Falls back to returning the certificate number if PDF fails.
 */

import PDFDocument from 'pdfkit';
import { createLogger } from '../../lib/logger';
const log = createLogger('certificateGenerator');


export interface CertificateData {
  certNumber: string;
  officerName: string;
  moduleTitle: string;
  orgName: string;
  issuedAt: Date;
  expiresAt: Date;
  overallScore: number;
  workspaceId: string;
}

// ── Navy + Gold Theme ─────────────────────────────────────────────────────
const NAVY = '#0d1b2e';
const NAVY_MID = '#1a2f4a';
const GOLD = '#c9a84c';
const GOLD_LIGHT = '#e8c87a';
const WHITE = '#ffffff';
const SILVER = '#d0d5dd';

function drawBackground(doc: InstanceType<typeof PDFDocument>): void {
  const w = doc.page.width;
  const h = doc.page.height;

  // Deep navy background
  doc.rect(0, 0, w, h).fill(NAVY);

  // Gold border — outer
  doc.rect(20, 20, w - 40, h - 40).lineWidth(3).stroke(GOLD);
  // Gold border — inner
  doc.rect(28, 28, w - 56, h - 56).lineWidth(1).stroke(GOLD_LIGHT);

  // Corner decorations — simple gold squares
  const cornerSize = 12;
  [[20, 20], [w - 20 - cornerSize, 20], [20, h - 20 - cornerSize], [w - 20 - cornerSize, h - 20 - cornerSize]].forEach(([x, y]) => {
    doc.rect(x, y, cornerSize, cornerSize).fill(GOLD);
  });
}

function drawHeader(doc: InstanceType<typeof PDFDocument>): void {
  const w = doc.page.width;

  // Organization shield / badge area
  doc.rect(w / 2 - 45, 55, 90, 70).fill(NAVY_MID).stroke(GOLD);

  // Shield star/badge text
  doc
    .fillColor(GOLD)
    .fontSize(28)
    .font('Helvetica-Bold')
    .text('★', w / 2 - 14, 70);

  doc
    .fillColor(GOLD)
    .fontSize(7)
    .font('Helvetica-Bold')
    .text('SECURITY', w / 2 - 21, 99)
    .text('CERTIFIED', w / 2 - 20, 108);

  // Title block
  doc
    .fillColor(GOLD_LIGHT)
    .fontSize(11)
    .font('Helvetica')
    .text('COAILEAGUE OFFICER CERTIFICATION PROGRAM', 0, 142, { align: 'center' });

  doc
    .fillColor(WHITE)
    .fontSize(26)
    .font('Helvetica-Bold')
    .text('CERTIFICATE OF COMPLETION', 0, 158, { align: 'center' });

  // Gold divider
  doc
    .moveTo(80, 196)
    .lineTo(w - 80, 196)
    .lineWidth(1.5)
    .stroke(GOLD);
}

function drawBody(doc: InstanceType<typeof PDFDocument>, data: CertificateData): void {
  const w = doc.page.width;

  doc
    .fillColor(SILVER)
    .fontSize(11)
    .font('Helvetica')
    .text('This certifies that', 0, 214, { align: 'center' });

  // Officer name — large gold
  doc
    .fillColor(GOLD)
    .fontSize(32)
    .font('Helvetica-Bold')
    .text(data.officerName, 0, 232, { align: 'center' });

  // Name underline
  const nameWidth = Math.min(data.officerName.length * 16, 400);
  doc
    .moveTo(w / 2 - nameWidth / 2, 272)
    .lineTo(w / 2 + nameWidth / 2, 272)
    .lineWidth(1)
    .stroke(GOLD_LIGHT);

  doc
    .fillColor(SILVER)
    .fontSize(11)
    .font('Helvetica')
    .text('has successfully completed the training requirements for', 0, 284, { align: 'center' });

  // Module title — white, prominent
  const titleLines = data.moduleTitle.length > 60 ? 2 : 1;
  doc
    .fillColor(WHITE)
    .fontSize(18)
    .font('Helvetica-Bold')
    .text(data.moduleTitle, 80, 306, { align: 'center', width: w - 160 });

  const bodyY = 306 + titleLines * 24 + 16;

  // Score badge
  const scoreX = w / 2 - 55;
  doc.rect(scoreX, bodyY, 110, 38).fill(NAVY_MID).stroke(GOLD);
  doc
    .fillColor(GOLD)
    .fontSize(10)
    .font('Helvetica-Bold')
    .text('FINAL SCORE', scoreX, bodyY + 5, { width: 110, align: 'center' });
  doc
    .fillColor(WHITE)
    .fontSize(18)
    .font('Helvetica-Bold')
    .text(`${data.overallScore}%`, scoreX, bodyY + 17, { width: 110, align: 'center' });

  const dateY = bodyY + 58;

  // Issued / Expires row
  doc
    .fillColor(SILVER)
    .fontSize(9)
    .font('Helvetica')
    .text('ISSUE DATE', 80, dateY, { width: 180 })
    .text('EXPIRATION DATE', w / 2 + 20, dateY, { width: 180 });

  doc
    .fillColor(WHITE)
    .fontSize(12)
    .font('Helvetica-Bold')
    .text(formatDate(data.issuedAt), 80, dateY + 12, { width: 180 })
    .text(formatDate(data.expiresAt), w / 2 + 20, dateY + 12, { width: 180 });

  // Org name
  doc
    .fillColor(SILVER)
    .fontSize(10)
    .font('Helvetica')
    .text(data.orgName, 0, dateY + 38, { align: 'center' });
}

function drawFooter(doc: InstanceType<typeof PDFDocument>, certNumber: string): void {
  const w = doc.page.width;
  const h = doc.page.height;

  // Footer divider
  doc
    .moveTo(80, h - 80)
    .lineTo(w - 80, h - 80)
    .lineWidth(1)
    .stroke(GOLD_LIGHT);

  // Certificate number
  doc
    .fillColor(SILVER)
    .fontSize(8)
    .font('Helvetica')
    .text(`Certificate Number: ${certNumber}`, 80, h - 68, { align: 'left' });

  doc
    .fillColor(SILVER)
    .fontSize(8)
    .font('Helvetica')
    .text(`Verify: /api/public/training/certification/verify/${certNumber}`, w / 2, h - 68, { align: 'right', width: w / 2 - 80 });

  // QR placeholder (simple box with text — real QR would require a separate library)
  const qrSize = 40;
  const qrX = w / 2 - qrSize / 2;
  const qrY = h - 62;
  doc.rect(qrX, qrY, qrSize, qrSize).fill(WHITE).stroke(GOLD);
  doc
    .fillColor(NAVY)
    .fontSize(5)
    .font('Helvetica-Bold')
    .text('SCAN', qrX, qrY + 15, { width: qrSize, align: 'center' })
    .text('VERIFY', qrX, qrY + 22, { width: qrSize, align: 'center' });

  // Bottom tagline
  doc
    .fillColor(GOLD_LIGHT)
    .fontSize(7)
    .font('Helvetica')
    .text('This certificate was issued by the CoAIleague Officer Training Certification Program.', 0, h - 34, { align: 'center' });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Generates a PDF certificate and returns a base64 data URL.
 * Returns null if generation fails (caller treats as non-fatal).
 */
export async function generateCertificatePdf(data: CertificateData): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        layout: 'landscape',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        const dataUrl = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
        resolve(dataUrl);
      });
      doc.on('error', () => resolve(null));

      drawBackground(doc);
      drawHeader(doc);
      drawBody(doc, data);
      drawFooter(doc, data.certNumber);

      doc.end();
    } catch (err) {
      log.error('[CertGen] PDF generation error:', err);
      resolve(null);
    }
  });
}
