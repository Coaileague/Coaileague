/**
 * BUSINESS FORMS VAULT SERVICE
 * ==============================
 * The canonical layer that every form generator must pass through before
 * returning a document to the caller.
 *
 * Responsibilities:
 *   1. Stamp a branded header (workspace name, platform name, document ID,
 *      generation timestamp) onto any PDF buffer produced by a generator.
 *   2. Stamp a branded footer (page X of Y, legal disclaimer, support info).
 *   3. Persist the final PDF to the document_vault table with full metadata.
 *   4. Return a vault record the route can reference for download/audit.
 *
 * Design principle:
 *   Generator services produce the CONTENT as a PDFKit buffer.
 *   This service adds the WRAPPER and PERSISTS the result.
 *   Routes call the generator → pass the buffer here → return the vault record.
 *
 * EVERY generated document that goes to an end-user or a tenant must pass
 * through saveToVault(). No exceptions. If a generator returns a buffer
 * without calling this, it is incomplete.
 *
 * Supported document categories:
 *   payroll        — pay stubs, payroll run summaries, direct deposit confirmations
 *   tax            — W-2, 1099-NEC, 1099-MISC, 941, 940, W-3
 *   hr             — proof of employment, contractor records, disciplinary notices,
 *                    training certificates, drug test results
 *   operations     — incident reports, work orders, compliance certs, proposals,
 *                    contracts, shift confirmations
 */

import PDFDocument from 'pdfkit';
import { PDFDocument as LibPDFDocument } from 'pdf-lib';
import { db } from '../../db';
import { documentVault } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
import { createHash } from 'crypto';

const log = createLogger('BusinessFormsVaultService');

const PLATFORM_NAME = 'CoAIleague';
const PLATFORM_SUPPORT = 'support@coaileague.com';
const PLATFORM_COLOR = { r: 15, g: 23, b: 42 }; // dark navy
const ACCENT_COLOR  = { r: 99,  g: 102, b: 241 }; // indigo accent

// ─── Types ────────────────────────────────────────────────────────────────────

export type FormCategory =
  | 'payroll'
  | 'tax'
  | 'hr'
  | 'operations'
  | 'compliance'
  | 'legal';

export interface StampOptions {
  workspaceId: string;
  workspaceName: string;
  documentTitle: string;
  category: FormCategory;
  /** IRS/DOL form number if applicable: "941", "940", "W-2", "1099-NEC", etc. */
  formNumber?: string;
  /** Tax year, pay period, or reporting period */
  period?: string;
  /** Entity the document relates to (employeeId, clientId, payrollRunId) */
  relatedEntityType?: string;
  relatedEntityId?: string;
  /** User who triggered generation */
  generatedBy?: string;
  /** Content buffer from the generator (PDFKit .getBuffer() or similar) */
  rawBuffer: Buffer;
}

export interface VaultRecord {
  id: string;
  documentNumber: string;
  title: string;
  category: string;
  fileUrl: string;
  fileSizeBytes: number;
  integrityHash: string;
  createdAt: Date;
}

export interface SaveToVaultResult {
  success: boolean;
  vault?: VaultRecord;
  /** The stamped PDF buffer (header + content + footer applied) */
  stampedBuffer?: Buffer;
  error?: string;
}

// ─── Document Number Generator ────────────────────────────────────────────────

function generateDocumentNumber(category: FormCategory): string {
  const prefix = {
    payroll: 'PAY',
    tax: 'TAX',
    hr: 'HR',
    operations: 'OPS',
    compliance: 'COMP',
    legal: 'LEGAL',
  }[category] || 'DOC';

  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const seq = String(Math.floor(Math.random() * 99999)).padStart(5, '0');
  return `${prefix}-${datePart}-${seq}`;
}

// ─── PDF Stamper ──────────────────────────────────────────────────────────────

/**
 * Adds a branded header/footer overlay to an existing PDF buffer.
 *
 * For each page:
 *   Header: workspace name (left) | document title (center) | document ID + timestamp (right)
 *   Footer: page X of Y (left) | platform name (center) | legal disclaimer (right)
 *
 * This does NOT regenerate the content — it overlays the frame onto the
 * existing rendered page using PDFKit's moveTo/lineTo + text primitives.
 *
 * NOTE: Because PDFKit doesn't support page modification after the fact,
 * we create a NEW document and re-stream the content inside the frame.
 * For pure data forms (non-PDFKit source), the raw buffer is returned with
 * the header/footer prepended as a separate first/last page overlay.
 */
async function stampBrandedFrame(opts: StampOptions, docNumber: string): Promise<Buffer> {
  // Merge branded header/footer/metadata onto the original rawBuffer pages using pdf-lib.
  // Original content is fully preserved — branding is overlaid, not replaced.
  try {
    const { PDFDocument: PdfLib, rgb, StandardFonts } = await import('pdf-lib');

    // Load original content PDF
    const originalPdf = await PdfLib.load(opts.rawBuffer);
    const totalPages = originalPdf.getPageCount();

    // Create overlay/stamp doc
    const stampPdf = await PdfLib.create();
    const helvetica = await stampPdf.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await stampPdf.embedFont(StandardFonts.HelveticaBold);

    // Embed original pages
    const embeddedPages = await stampPdf.embedPdf(originalPdf);

    const generatedAt = new Date().toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    for (let i = 0; i < totalPages; i++) {
      const origPage = originalPdf.getPage(i);
      const { width, height } = origPage.getSize();
      const embeddedPage = embeddedPages[i];

      const page = stampPdf.addPage([width, height]);

      // Draw original page content
      page.drawPage(embeddedPage);

      const headerH = 36;
      const footerH = 20;
      const brandColor = rgb(
        PLATFORM_COLOR.r / 255, PLATFORM_COLOR.g / 255, PLATFORM_COLOR.b / 255
      );

      // ── Header bar ───────────────────────────────────────────────────────
      page.drawRectangle({ x: 0, y: height - headerH, width, height: headerH, color: brandColor });

      // Workspace name (left)
      page.drawText((opts.workspaceName || PLATFORM_NAME).substring(0, 30), {
        x: 8, y: height - headerH + 12,
        size: 9, font: helveticaBold, color: rgb(1, 1, 1),
      });

      // Document title (center)
      const titleText = opts.documentTitle.substring(0, 40);
      page.drawText(titleText, {
        x: width / 2 - (titleText.length * 2.5), y: height - headerH + 12,
        size: 9, font: helveticaBold, color: rgb(1, 1, 1),
      });

      // Doc ID + page (right)
      const rightText = `${docNumber} · p${i + 1}/${totalPages}`;
      page.drawText(rightText, {
        x: width - 120, y: height - headerH + 12,
        size: 7, font: helvetica, color: rgb(1, 1, 1),
      });

      // ── Footer bar ───────────────────────────────────────────────────────
      page.drawRectangle({ x: 0, y: 0, width, height: footerH, color: brandColor });

      page.drawText(`Generated by ${PLATFORM_NAME} · ${generatedAt} · ${PLATFORM_SUPPORT}`, {
        x: 8, y: 6, size: 6, font: helvetica, color: rgb(1, 1, 1),
      });

      // Generated timestamp on right
      page.drawText(`Page ${i + 1} of ${totalPages}`, {
        x: width - 80, y: 6, size: 6, font: helvetica, color: rgb(1, 1, 1),
      });
    }

    const pdfBytes = await stampPdf.save();
    return Buffer.from(pdfBytes);
  } catch (stampErr: any) {
    log.error('[VaultService] PDF stamp failed, returning original:', stampErr?.message);
    // Return original rather than branded-but-empty shell
    return opts.rawBuffer;
  }
}


async function persistToVault(
  stampedBuffer: Buffer,
  opts: StampOptions,
  docNumber: string,
): Promise<VaultRecord> {
  const integrityHash = createHash('sha256').update(stampedBuffer).digest('hex');
  const fileUrl = `internal://vault/${opts.workspaceId}/${docNumber}.pdf`;
  const title = opts.formNumber
    ? `${opts.documentTitle} – ${opts.formNumber}${opts.period ? ` (${opts.period})` : ''}`
    : `${opts.documentTitle}${opts.period ? ` (${opts.period})` : ''}`;

  const [record] = await db.insert(documentVault).values({
    workspaceId: opts.workspaceId,
    documentNumber: docNumber,
    title,
    category: opts.category,
    fileUrl,
    fileSizeBytes: stampedBuffer.length,
    mimeType: 'application/pdf',
    tags: [opts.category, opts.formNumber ?? opts.documentTitle.toLowerCase().replace(/\s+/g, '_')],
    relatedEntityType: opts.relatedEntityType ?? null,
    relatedEntityId: opts.relatedEntityId ?? null,
    uploadedBy: opts.generatedBy ?? 'trinity',
    isSigned: false,
    integrityHash,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning({
    id: documentVault.id,
    documentNumber: documentVault.documentNumber,
    title: documentVault.title,
    category: documentVault.category,
    fileUrl: documentVault.fileUrl,
    fileSizeBytes: documentVault.fileSizeBytes,
    integrityHash: documentVault.integrityHash,
    createdAt: documentVault.createdAt,
  });

  return record as VaultRecord;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * The single required call after any form generator produces a PDF buffer.
 *
 * Usage:
 *   const pdf = await myFormGenerator.generate(data);
 *   const result = await saveToVault({
 *     workspaceId, workspaceName, documentTitle: 'W-2 Wage Statement',
 *     category: 'tax', formNumber: 'W-2', period: '2025',
 *     relatedEntityType: 'employee', relatedEntityId: employeeId,
 *     rawBuffer: pdf.buffer,
 *   });
 *   if (!result.success) throw new Error(result.error);
 *   return { vaultId: result.vault!.id, pdfBuffer: result.stampedBuffer };
 */
export async function saveToVault(opts: StampOptions): Promise<SaveToVaultResult> {
  try {
    const docNumber = generateDocumentNumber(opts.category);

    // 1. Generate branded cover/frame page (header, footer, metadata)
    const frameBuffer = await stampBrandedFrame(opts, docNumber);

    // 2. Merge frame page + content using pdf-lib
    // This embeds the actual rawBuffer content after the branded frame page.
    let stampedBuffer: Buffer;
    try {
      const mergedDoc = await LibPDFDocument.create();
      // Copy frame page(s) first
      const frameDoc = await LibPDFDocument.load(frameBuffer);
      const framePages = await mergedDoc.copyPages(frameDoc, frameDoc.getPageIndices());
      framePages.forEach(p => mergedDoc.addPage(p));
      // Copy content page(s) from rawBuffer
      const contentDoc = await LibPDFDocument.load(opts.rawBuffer);
      const contentPages = await mergedDoc.copyPages(contentDoc, contentDoc.getPageIndices());
      contentPages.forEach(p => mergedDoc.addPage(p));
      stampedBuffer = Buffer.from(await mergedDoc.save());
    } catch (mergeErr: any) {
      // Fallback: if rawBuffer isn't a valid PDF (e.g. PDFKit stream mid-render),
      // use the frame buffer alone and log a warning
      log.warn('[BusinessForms] PDF merge failed, using frame-only fallback:', mergeErr?.message);
      stampedBuffer = frameBuffer;
    }

    // 3. Persist to vault
    const vault = await persistToVault(stampedBuffer, opts, docNumber);

    log.info(
      `[BusinessForms] Saved ${opts.category} document "${opts.documentTitle}" → ${vault.documentNumber} (${vault.fileSizeBytes} bytes)`,
    );

    return { success: true, vault, stampedBuffer };
  } catch (error: any) {
    log.error('[BusinessForms] Failed to save document to vault:', error?.message);
    return { success: false, error: error?.message || 'Failed to generate branded document' };
  }
}

/**
 * Retrieve a vault record by document number (for re-serving or auditing).
 */
export async function getVaultRecord(
  workspaceId: string,
  documentNumber: string,
): Promise<VaultRecord | null> {
  const [record] = await db
    .select({
      id: documentVault.id,
      documentNumber: documentVault.documentNumber,
      title: documentVault.title,
      category: documentVault.category,
      fileUrl: documentVault.fileUrl,
      fileSizeBytes: documentVault.fileSizeBytes,
      integrityHash: documentVault.integrityHash,
      createdAt: documentVault.createdAt,
    })
    .from(documentVault)
    .where(
      and(
        eq(documentVault.workspaceId, workspaceId),
        eq(documentVault.documentNumber, documentNumber),
      ),
    )
    .limit(1);

  return (record as VaultRecord) ?? null;
}

/**
 * List all vault records for a workspace, optionally filtered by category.
 */
export async function listVaultRecords(
  workspaceId: string,
  category?: FormCategory,
): Promise<VaultRecord[]> {
  const query = db
    .select({
      id: documentVault.id,
      documentNumber: documentVault.documentNumber,
      title: documentVault.title,
      category: documentVault.category,
      fileUrl: documentVault.fileUrl,
      fileSizeBytes: documentVault.fileSizeBytes,
      integrityHash: documentVault.integrityHash,
      createdAt: documentVault.createdAt,
    })
    .from(documentVault)
    .where(
      category
        ? and(eq(documentVault.workspaceId, workspaceId), eq(documentVault.category, category))
        : eq(documentVault.workspaceId, workspaceId),
    )
    .orderBy(documentVault.createdAt);

  return (await query) as VaultRecord[];
}
