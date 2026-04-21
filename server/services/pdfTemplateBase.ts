/**
 * PDF TEMPLATE BASE — CoAIleague Design System
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all PDF layout: colors, header, footer, helpers.
 *
 * Usage:
 *   import { PDF, renderPdfHeader, renderPdfFooter, hlinePdf, sectionBar } from './pdfTemplateBase';
 *
 * White-glove tenants: pass tenantLogoBuffer to renderPdfHeader() to show the
 * tenant's logo instead of the platform wordmark. Color tokens remain fixed —
 * they belong to the platform, not individual tenants.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import PDFDocument from 'pdfkit';
type PDFDocumentType = InstanceType<typeof PDFDocument>;

/** Canonical platform color tokens — do not override per-tenant. */
export const PDF = {
  navy:        '#0f2a4a',   // deep navy — header background
  navyMid:     '#1e3a5f',   // mid navy — section bars
  navyLight:   '#2a4f7c',   // light navy — accents
  gold:        '#d4af37',   // gold accent line
  goldLight:   '#f0d060',   // light gold text on dark bg
  white:       '#ffffff',
  offWhite:    '#f8f9fb',   // alternating row background
  gray:        '#6b7280',   // muted label text
  grayLight:   '#e5e7eb',   // dividers
  grayBorder:  '#d1d5db',
  grayDark:    '#374151',   // body text
  dark:        '#111827',   // primary text
  successLight:'#f0fdf4',
  successBorder:'#bbf7d0',
  success:     '#15803d',
  warnLight:   '#fefce8',
  warnBorder:  '#fde047',
  warn:        '#ca8a04',
  dangerLight: '#fef2f2',
  dangerBorder:'#fca5a5',
  danger:      '#dc2626',
} as const;

/** Page margin constants (LETTER, points) */
export const PAGE = {
  W:   612,
  H:   792,
  ML:   50,   // margin left
  MR:   50,   // margin right
  MT:  110,   // margin top (below header)
  MB:   50,   // margin bottom
  CW:  512,   // content width (W - ML - MR)
  MID: 306,   // center X
} as const;

// ─── Shared drawing helpers ───────────────────────────────────────────────────

/** Horizontal rule across content width */
export function hlinePdf(
  doc: PDFDocumentType,
  color: string = PDF.grayLight,
  x1: number = PAGE.ML,
  x2: number = PAGE.W - PAGE.MR,
): void {
  doc.moveTo(x1, doc.y).lineTo(x2, doc.y).strokeColor(color).lineWidth(0.5).stroke();
  doc.moveDown(0.4);
}

/** Navy section title bar */
export function sectionBar(doc: PDFDocumentType, title: string): void {
  doc.moveDown(0.6);
  doc.rect(PAGE.ML, doc.y, PAGE.CW, 20).fill(PDF.navyMid);
  doc.fontSize(9).fillColor(PDF.white)
    .font('Helvetica-Bold')
    .text(title.toUpperCase(), PAGE.ML + 12, doc.y + 6, { characterSpacing: 0.8 });
  doc.y += 22;
  doc.moveDown(0.2);
}

/** Two-column label/value pair */
export function fieldPair(
  doc: PDFDocumentType,
  label: string,
  value: string,
  x: number = PAGE.ML,
  y?: number,
  width: number = 220,
): void {
  const yPos = y ?? doc.y;
  doc.fontSize(7.5).fillColor(PDF.gray).font('Helvetica')
    .text(label.toUpperCase(), x, yPos, { width, characterSpacing: 0.3 });
  doc.fontSize(9.5).fillColor(PDF.dark).font('Helvetica-Bold')
    .text(value || '—', x, yPos + 10, { width });
  doc.font('Helvetica');
}

/** Alternating zebra row for form field/value */
export function zebraRow(
  doc: PDFDocumentType,
  label: string,
  value: string,
  index: number,
): void {
  const bg = index % 2 === 0 ? PDF.white : PDF.offWhite;
  const valueLines = Math.ceil((value || '').length / 80) + 1;
  const rowH = Math.max(28, valueLines * 12 + 10);
  const startY = doc.y;
  doc.rect(PAGE.ML, startY, PAGE.CW, rowH).fill(bg);
  doc.fontSize(7.5).fillColor(PDF.gray).font('Helvetica')
    .text(label, PAGE.ML + 12, startY + 6, { characterSpacing: 0.3, width: PAGE.CW - 24 });
  doc.fontSize(10).fillColor(PDF.dark).font('Helvetica')
    .text(value || '—', PAGE.ML + 12, startY + 16, { width: PAGE.CW - 24, lineBreak: true });
  doc.y = startY + rowH + 2;
}

// ─── Page header ─────────────────────────────────────────────────────────────

export interface PdfHeaderOptions {
  /** Document title shown in the header (large text) */
  title: string;
  /** Optional subtitle / document type */
  subtitle?: string;
  /** Workspace / tenant name shown top-left */
  workspaceName?: string;
  /**
   * Tenant logo PNG/JPEG buffer for white-glove workspaces.
   * When provided, the logo is shown instead of the platform wordmark.
   * Platform color tokens are not affected.
   */
  tenantLogoBuffer?: Buffer | null;
  /** Right-side label (e.g. "Ref: INV-2024-001") */
  refLabel?: string;
  /** Label for generated date / timestamp line */
  generatedLabel?: string;
}

/**
 * Renders the universal branded PDF page header.
 * Navy bar → gold accent line → title block.
 * Starts at y=0; leaves cursor at y = headerBottom + 6.
 */
export function renderPdfHeader(
  doc: PDFDocumentType,
  opts: PdfHeaderOptions,
): void {
  const {
    title,
    subtitle,
    workspaceName = 'CoAIleague',
    tenantLogoBuffer,
    refLabel,
    generatedLabel,
  } = opts;

  // Navy background bar
  doc.rect(0, 0, PAGE.W, 90).fill(PDF.navy);
  // Gold accent line
  doc.rect(0, 90, PAGE.W, 4).fill(PDF.gold);

  if (tenantLogoBuffer) {
    // White-glove: tenant logo on the left side of the header
    try {
      doc.image(tenantLogoBuffer, PAGE.ML, 18, { height: 40, fit: [160, 40] });
    } catch {
      // Fall through to text wordmark if logo fails
      doc.fontSize(13).fillColor(PDF.goldLight).font('Helvetica-Bold')
        .text(workspaceName.toUpperCase(), PAGE.ML, 22, { characterSpacing: 0.8 });
    }
  } else {
    // Platform wordmark
    doc.fontSize(8).fillColor(PDF.goldLight).font('Helvetica-Bold')
      .text(workspaceName.toUpperCase(), PAGE.ML, 16, { characterSpacing: 1.5 });
    doc.fontSize(6).fillColor('rgba(255,255,255,0.5)').font('Helvetica')
      .text('WORKFORCE INTELLIGENCE', PAGE.ML, 26, { characterSpacing: 1.2 });
  }

  // Title (centered)
  doc.fontSize(18).fillColor(PDF.white).font('Helvetica-Bold')
    .text(title, PAGE.ML, 30, { width: PAGE.CW, align: 'center' });

  if (subtitle) {
    doc.fontSize(9).fillColor(PDF.gray).font('Helvetica')
      .text(subtitle.toUpperCase(), PAGE.ML, 52, { width: PAGE.CW, align: 'center', characterSpacing: 0.6 });
  }

  // Right-side metadata
  if (refLabel) {
    doc.fontSize(7.5).fillColor(PDF.goldLight).font('Helvetica')
      .text(refLabel, PAGE.ML, 16, { width: PAGE.CW, align: 'right' });
  }
  if (generatedLabel) {
    doc.fontSize(7.5).fillColor(PDF.gray).font('Helvetica')
      .text(generatedLabel, PAGE.ML, 26, { width: PAGE.CW, align: 'right' });
  }

  // Reset cursor below header
  doc.y = 106;
}

// ─── Page footer ─────────────────────────────────────────────────────────────

export interface PdfFooterOptions {
  /** Short document identifier (e.g. first 8 chars of UUID) */
  docId: string;
  /** Document type label (e.g. "Proposal" | "Contract" | "Form Submission") */
  docType?: string;
  /** Optional hash / integrity stamp */
  hash?: string;
  /** Workspace / tenant name */
  workspaceName?: string;
}

/**
 * Renders consistent footer on every page.
 * Must be called after doc.end() is triggered (bufferPages: true required).
 */
export function renderPdfFooter(
  doc: PDFDocumentType,
  opts: PdfFooterOptions,
): void {
  const pageCount = (doc as any)._pageBuffer?.length ?? 1;
  const { docId, docType = 'Document', hash, workspaceName = 'CoAIleague' } = opts;

  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    const footerY = doc.page.height - 38;

    doc.moveTo(PAGE.ML, footerY - 5)
      .lineTo(PAGE.W - PAGE.MR, footerY - 5)
      .strokeColor(PDF.grayLight).lineWidth(0.5).stroke();

    const leftText = `${workspaceName} · ${docType} · ID: ${docId}`;
    const rightText = hash ? `SHA-256: ${hash.slice(0, 16)}…` : `Page ${i + 1} of ${pageCount}`;

    doc.fontSize(7).fillColor(PDF.gray).font('Helvetica')
      .text(leftText, PAGE.ML, footerY, { align: 'left', width: PAGE.CW - 80 });
    doc.fontSize(7).fillColor(PDF.gray)
      .text(rightText, PAGE.ML, footerY, { align: 'right', width: PAGE.CW });
  }
}

// ─── Tenant branding helper ───────────────────────────────────────────────────

/**
 * Loads the tenant's logo from GCS for white-glove rendering.
 * Returns null if no logo is configured or loading fails.
 */
export async function loadTenantLogo(
  workspaceId: string,
): Promise<Buffer | null> {
  try {
    const { db } = await import('../db');
    const { workspaces } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');
    const [ws] = await db.select().from(workspaces)
      .where(eq(workspaces.id, workspaceId)).limit(1);
    const logoUrl: string | undefined = (ws as any)?.logoUrl ?? (ws as any)?.logo_url;
    if (!logoUrl) return null;

    const { downloadFileFromObjectStorage } = await import('../objectStorage');
    return await downloadFileFromObjectStorage(logoUrl);
  } catch {
    return null;
  }
}
