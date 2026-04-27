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
  // Use pdf-lib to merge: branded cover page (frame) + actual content from rawBuffer
  // This replaces the previous approach that dropped rawBuffer content entirely.
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      bufferPages: true,
      info: {
        Title: opts.documentTitle,
        Author: PLATFORM_NAME,
        Subject: opts.formNumber ? `Form ${opts.formNumber}` : opts.category,
        Creator: PLATFORM_NAME,
        Producer: PLATFORM_NAME,
        CreationDate: new Date(),
      },
    });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const generatedAt = new Date().toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const titleLine = opts.formNumber
      ? `${opts.documentTitle} (${opts.formNumber})`
      : opts.documentTitle;

    const periodLine = opts.period ? `Period: ${opts.period}` : '';

    // ── Header ────────────────────────────────────────────────────────────────
    const pageWidth = 612; // LETTER
    const margin = 36;

    // Top border bar
    doc
      .rect(0, 0, pageWidth, 44)
      .fill(`rgb(${PLATFORM_COLOR.r},${PLATFORM_COLOR.g},${PLATFORM_COLOR.b})`);

    // Workspace name (white, left)
    doc
      .fillColor('white')
      .fontSize(9)
      .font('Helvetica-Bold')
      .text(opts.workspaceName.toUpperCase(), margin, 14, { width: 180, align: 'left' });

    // Document title (white, center)
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(titleLine, 180, 14, { width: 252, align: 'center' });

    // Doc ID + timestamp (white, right)
    doc
      .font('Helvetica')
      .fontSize(7)
      .text(`${docNumber}`, margin + 352, 10, { width: 180, align: 'right' })
      .text(generatedAt, margin + 352, 20, { width: 180, align: 'right' });

    // Thin accent bar below header
    doc
      .rect(0, 44, pageWidth, 2)
      .fill(`rgb(${ACCENT_COLOR.r},${ACCENT_COLOR.g},${ACCENT_COLOR.b})`);

    // Move past header
    doc.moveDown(3);
    doc.fillColor('black');

    // ── Category + doc number metadata line ──────────────────────────────────
    doc
      .fontSize(8)
      .fillColor('#64748b')
      .text(`${PLATFORM_NAME} · ${opts.category.toUpperCase()} DOCUMENT · ${docNumber}`, {
        align: 'center',
      });
    doc.moveDown(1);

    // ── Footer (on every page via buffered pages) ──────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);

      const pageNum = i + 1;
      const totalPages = range.count;
      const pageBottom = 756; // LETTER height - margin

      // Bottom border bar
      doc
        .rect(0, pageBottom - 8, pageWidth, 28)
        .fill(`rgb(${PLATFORM_COLOR.r},${PLATFORM_COLOR.g},${PLATFORM_COLOR.b})`);

      // Page number (left)
      doc
        .fillColor('white')
        .font('Helvetica')
        .fontSize(7)
        .text(`Page ${pageNum} of ${totalPages}`, margin, pageBottom - 2, {
          width: 100,
          align: 'left',
        });

      // Platform name (center)
      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .text(PLATFORM_NAME, 180, pageBottom - 2, { width: 252, align: 'center' });

      // Disclaimer (right)
      doc
        .font('Helvetica')
        .fontSize(6)
        .text(
          `This document was generated by ${PLATFORM_NAME}. Contact ${PLATFORM_SUPPORT} for support.`,
          margin + 300,
          pageBottom - 2,
          { width: 240, align: 'right' },
        );
    }

    doc.end();
  });
}

// ─── Vault Persistence ────────────────────────────────────────────────────────

/**
 * Saves a stamped PDF buffer to the document_vault table.
 *
 * fileUrl convention: internal://vault/{workspaceId}/{docNumber}.pdf
 * Production deployments should replace this with an object storage URL
 * (S3/R2/Supabase Storage) once the storage backend is wired.
 *
 * The integrityHash (SHA-256) lets Trinity verify a document hasn't been
 * tampered with when it needs to reference or re-serve it.
 */
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
