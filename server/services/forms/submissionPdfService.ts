/**
 * Submission PDF Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders any UDTS DocumentTemplate + formData payload into a branded PDF
 * using the universal pdfTemplateBase (header/footer/section bars/colors).
 *
 * Drives the submit-time handshake:
 *
 *   client → POST /api/document-forms/submit
 *     ↳ documentFormRoutes inserts customFormSubmissions row
 *     ↳ generateSubmissionPdf(template, formData, signaturePayload) → Buffer
 *     ↳ saveToVault({...rawBuffer}) → uploads to GCS + writes documentVault row
 *     ↳ UPDATE customFormSubmissions SET pdfUrl, vaultDocumentId, pdfGeneratedAt
 *     ↳ platformEventBus.publish('document.submitted')
 *     ↳ best-effort receipt email
 *     ↳ response includes vaultId + documentNumber so the renderer can show
 *       "View in Document Safe" / "Download PDF"
 *
 * Field rendering rules:
 *   - Hidden meta keys (those that start with `__`) are skipped.
 *   - sensitiveData fields (SSN, masked_number, ssn) are masked to last 4.
 *   - signature fields render the embedded PNG inside a labelled signature box.
 *   - acknowledgment_check fields render as ☑ / ☐ with the legalText below.
 *   - upload fields list the file name (or "Uploaded") since the bytes live
 *     in their own object key — we don't inline arbitrary uploads.
 */

import PDFDocument from 'pdfkit';
import { format } from 'date-fns';
import {
  PDF, PAGE,
  renderPdfHeader, renderPdfFooter,
  hlinePdf, sectionBar,
  loadTenantLogo,
} from '../pdfTemplateBase';
import type { DocumentTemplate, TemplateField, TemplateSection } from '../documents/templateRegistry';
import { createLogger } from '../../lib/logger';

const log = createLogger('submissionPdfService');

export interface SubmissionSignerInfo {
  /** Display name shown above the signature (e.g. "Jane Doe") */
  signerName?: string | null;
  /** Address from which the form was submitted */
  ipAddress?: string | null;
  /** User-Agent header at submit time */
  userAgent?: string | null;
  /** "lat,lng" string captured from the device, or "denied" */
  geoLocation?: string | null;
  /** ISO-8601 timestamp of submission */
  submittedAt?: string | Date | null;
}

export interface GenerateSubmissionPdfOptions {
  template: DocumentTemplate;
  formData: Record<string, unknown>;
  signer: SubmissionSignerInfo;
  workspaceId: string;
  workspaceName?: string | null;
  /** Reference shown in the header (the human-readable submission ID) */
  submissionRef: string;
}

const LABEL_HIDDEN_PREFIX = '__';

function mask(value: string, kind: 'ssn' | 'masked' | 'plain'): string {
  if (!value) return '';
  if (kind === 'ssn') {
    const digits = String(value).replace(/\D/g, '');
    if (digits.length >= 4) return `XXX-XX-${digits.slice(-4)}`;
    return 'XXX-XX-XXXX';
  }
  if (kind === 'masked') {
    if (value.length <= 4) return '••••';
    return `${'•'.repeat(value.length - 4)}${value.slice(-4)}`;
  }
  return value;
}

function safeString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(safeString).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    // address_block payload { street, city, state, zip }
    const parts: string[] = [];
    for (const k of ['street', 'street2', 'city', 'state', 'zip', 'country']) {
      if ((v as unknown)[k]) parts.push(String((v as unknown)[k]));
    }
    if (parts.length) return parts.join(', ');
    try { return JSON.stringify(v); } catch { return ''; }
  }
  return String(v);
}

function renderSubmissionMeta(
  doc: PDFKit.PDFDocument,
  opts: GenerateSubmissionPdfOptions,
) {
  const { signer, submissionRef } = opts;
  const submitted = signer.submittedAt
    ? format(new Date(signer.submittedAt), 'MMMM d, yyyy · h:mm a')
    : format(new Date(), 'MMMM d, yyyy · h:mm a');
  const ip = signer.ipAddress || '—';
  const geo = signer.geoLocation && signer.geoLocation !== 'denied' ? signer.geoLocation : 'not captured';

  const y = doc.y + 4;
  doc.rect(PAGE.ML, y, PAGE.CW, 56).fill(PDF.offWhite);

  const col = (label: string, value: string, x: number, yPos: number) => {
    doc.fontSize(7).fillColor(PDF.gray).font('Helvetica')
      .text(label.toUpperCase(), x, yPos, { characterSpacing: 0.5, width: 240 });
    doc.fontSize(9).fillColor(PDF.dark).font('Helvetica-Bold')
      .text(value, x, yPos + 9, { width: 240, lineBreak: false });
    doc.font('Helvetica');
  };

  col('Submitted By', signer.signerName || '—', PAGE.ML + 12, y + 8);
  col('Submitted At', submitted, PAGE.ML + 12, y + 30);
  col('Submission Ref', submissionRef, PAGE.MID + 4, y + 8);
  col('IP / Location', `${ip} · ${geo}`, PAGE.MID + 4, y + 30);

  doc.y = y + 64;
}

function renderField(
  doc: PDFKit.PDFDocument,
  field: TemplateField,
  rawValue: unknown,
  index: number,
) {
  if (field.id.startsWith(LABEL_HIDDEN_PREFIX)) return;

  let displayValue = '';
  switch (field.type) {
    case 'signature':
    case 'initials':
      // Rendered separately in renderSignatureBlock — skip in field grid
      return;
    case 'ssn':
      displayValue = mask(safeString(rawValue), 'ssn');
      break;
    case 'masked_number':
      displayValue = mask(safeString(rawValue), 'masked');
      break;
    case 'checkbox':
      displayValue = rawValue ? '✓ Yes' : '✗ No';
      break;
    case 'date':
      if (rawValue) {
        const d = new Date(rawValue);
        displayValue = isNaN(d.getTime()) ? safeString(rawValue) : format(d, 'MMM d, yyyy');
      }
      break;
    case 'upload':
      displayValue = rawValue ? 'Uploaded — see attachment record' : 'Not provided';
      break;
    case 'acknowledgment_check':
      displayValue = rawValue ? '☑ Acknowledged' : '☐ Not acknowledged';
      break;
    case 'address_block':
      displayValue = safeString(rawValue);
      break;
    default:
      displayValue = field.sensitiveData
        ? mask(safeString(rawValue), 'masked')
        : safeString(rawValue);
  }

  const bgColor = index % 2 === 0 ? PDF.white : PDF.offWhite;
  const valueText = displayValue || '—';
  const valueLines = Math.max(1, Math.ceil(valueText.length / 90));
  const rowH = Math.max(28, valueLines * 12 + 12);

  // Page-break check
  if (doc.y + rowH > PAGE.H - 60) {
    doc.addPage();
  }

  const startY = doc.y;
  doc.rect(PAGE.ML, startY, PAGE.CW, rowH).fill(bgColor);
  doc.fontSize(7.5).fillColor(PDF.gray).font('Helvetica')
    .text(field.label, PAGE.ML + 12, startY + 6, { characterSpacing: 0.3, width: PAGE.CW - 24 });
  doc.fontSize(10).fillColor(PDF.dark).font('Helvetica-Bold')
    .text(valueText, PAGE.ML + 12, startY + 16, { width: PAGE.CW - 24, lineBreak: true });
  doc.font('Helvetica');
  doc.y = startY + rowH + 2;
}

function renderAcknowledgmentBlock(
  doc: PDFKit.PDFDocument,
  section: TemplateSection,
  acknowledged: boolean,
) {
  if (!section.requiresAcknowledgment) return;
  const text = section.acknowledgmentText || '';
  const legal = section.legalText || '';

  if (legal) {
    if (doc.y + 80 > PAGE.H - 60) doc.addPage();
    doc.fontSize(8).fillColor(PDF.grayDark).font('Helvetica-Oblique')
      .text(legal, PAGE.ML, doc.y, { width: PAGE.CW, lineGap: 1 });
    doc.font('Helvetica');
    doc.moveDown(0.4);
  }

  if (doc.y + 24 > PAGE.H - 60) doc.addPage();
  const y = doc.y;
  const bg = acknowledged ? PDF.successLight : PDF.warnLight;
  const border = acknowledged ? PDF.successBorder : PDF.warnBorder;
  doc.rect(PAGE.ML, y, PAGE.CW, 22).fill(bg).strokeColor(border).stroke();
  doc.fontSize(9).fillColor(acknowledged ? PDF.success : PDF.warn).font('Helvetica-Bold')
    .text(`${acknowledged ? '☑' : '☐'}  ${text || 'Acknowledged'}`, PAGE.ML + 12, y + 6, {
      width: PAGE.CW - 24,
      lineBreak: false,
    });
  doc.font('Helvetica');
  doc.y = y + 28;
}

function renderSignatureBlock(
  doc: PDFKit.PDFDocument,
  field: TemplateField,
  rawValue: unknown,
  signer: SubmissionSignerInfo,
) {
  // Force onto its own page if not enough room
  if (doc.y + 160 > PAGE.H - 60) doc.addPage();

  const y = doc.y + 4;
  doc.rect(PAGE.ML, y, PAGE.CW, 130).fill(PDF.successLight).strokeColor(PDF.successBorder).stroke();

  doc.fontSize(8).fillColor(PDF.success).font('Helvetica-Bold')
    .text((field.type === 'initials' ? 'INITIALS' : 'SIGNATURE'), PAGE.ML + 12, y + 8, { characterSpacing: 0.6 });
  doc.font('Helvetica');

  doc.fontSize(7.5).fillColor(PDF.gray)
    .text(field.label, PAGE.ML + 12, y + 22, { width: PAGE.CW - 24 });

  // Embed image if present
  const isImage = typeof rawValue === 'string' && rawValue.startsWith('data:image');
  if (isImage) {
    try {
      const base64 = rawValue.split(',')[1];
      const buf = Buffer.from(base64, 'base64');
      // 220 x 64 frame with padding
      doc.image(buf, PAGE.ML + 16, y + 40, { fit: [220, 64], align: 'left', valign: 'top' });
    } catch (err) {
      log.warn('[SubmissionPdf] Could not embed signature image:', (err as Error)?.message);
      doc.fontSize(11).fillColor(PDF.dark).font('Helvetica-Oblique')
        .text(signer.signerName || 'signed electronically', PAGE.ML + 16, y + 50);
      doc.font('Helvetica');
    }
  } else if (rawValue) {
    // Typed signature fallback
    doc.fontSize(18).fillColor(PDF.dark).font('Helvetica-Oblique')
      .text(safeString(rawValue), PAGE.ML + 16, y + 46, { width: 280 });
    doc.font('Helvetica');
  } else {
    doc.fontSize(10).fillColor(PDF.gray).font('Helvetica-Oblique')
      .text('— not provided —', PAGE.ML + 16, y + 50);
    doc.font('Helvetica');
  }

  // Right column metadata
  const metaX = PAGE.MID + 8;
  const submittedTxt = signer.submittedAt
    ? format(new Date(signer.submittedAt), 'MMM d, yyyy · h:mm a')
    : format(new Date(), 'MMM d, yyyy · h:mm a');
  doc.fontSize(7).fillColor(PDF.gray)
    .text(`Signer: ${signer.signerName || '—'}`, metaX, y + 40, { width: PAGE.CW / 2 - 16 });
  doc.text(`Date: ${submittedTxt}`, metaX, y + 54, { width: PAGE.CW / 2 - 16 });
  doc.text(`IP: ${signer.ipAddress || '—'}`, metaX, y + 68, { width: PAGE.CW / 2 - 16 });
  if (signer.geoLocation && signer.geoLocation !== 'denied') {
    doc.text(`Geo: ${signer.geoLocation}`, metaX, y + 82, { width: PAGE.CW / 2 - 16 });
  }

  doc.y = y + 138;
}

/**
 * Render a UDTS submission to a PDF buffer using the universal branded
 * template. Caller is responsible for handing the returned buffer to
 * saveToVault() so the file is persisted and indexed.
 */
export async function generateSubmissionPdf(
  opts: GenerateSubmissionPdfOptions,
): Promise<Buffer> {
  const { template, formData, signer, workspaceId, workspaceName, submissionRef } = opts;

  const tenantLogo = await loadTenantLogo(workspaceId).catch(() => null);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: PAGE.MT, bottom: PAGE.MB, left: PAGE.ML, right: PAGE.MR },
      bufferPages: true,
      info: {
        Title: template.title,
        Subject: template.description || 'UDTS Submission',
        Producer: 'CoAIleague Platform',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // ── Page 1 header ────────────────────────────────────────────────────────
    renderPdfHeader(doc, {
      title: template.title,
      subtitle: `${template.category.toUpperCase()} · v${template.version}`,
      workspaceName: workspaceName || 'CoAIleague',
      tenantLogoBuffer: tenantLogo,
      refLabel: `Ref: ${submissionRef.slice(0, 12)}`,
      generatedLabel: `Generated: ${format(new Date(), 'MMM d, yyyy')}`,
    });

    if (template.description) {
      doc.fontSize(9).fillColor(PDF.grayDark).font('Helvetica')
        .text(template.description, PAGE.ML, doc.y, { width: PAGE.CW });
      doc.moveDown(0.3);
      hlinePdf(doc);
    }

    // Submission metadata block (who/when/where)
    renderSubmissionMeta(doc, opts);

    // ── Sections ─────────────────────────────────────────────────────────────
    const sortedSections = [...template.sections].sort((a, b) => a.order - b.order);
    let fieldIndex = 0;

    for (const section of sortedSections) {
      sectionBar(doc, section.title);

      if (section.description) {
        doc.fontSize(8).fillColor(PDF.gray).font('Helvetica')
          .text(section.description, PAGE.ML, doc.y, { width: PAGE.CW });
        doc.moveDown(0.3);
      }

      // Render non-signature fields first (zebra rows)
      for (const field of section.fields) {
        if (field.type === 'signature' || field.type === 'initials') continue;
        renderField(doc, field, formData[field.id], fieldIndex++);
      }

      // Then the section's signature/initials fields, each in its own block
      for (const field of section.fields) {
        if (field.type !== 'signature' && field.type !== 'initials') continue;
        renderSignatureBlock(doc, field, formData[field.id], signer);
      }

      // Section acknowledgment
      const ackKey = `__ack_${section.id}`;
      const ackVal = !!formData[ackKey];
      renderAcknowledgmentBlock(doc, section, ackVal);

      doc.moveDown(0.4);
    }

    // ── Universal footer (every page) ────────────────────────────────────────
    renderPdfFooter(doc, {
      docId: submissionRef.slice(0, 8),
      docType: template.title,
      workspaceName: workspaceName || 'CoAIleague',
    });

    doc.end();
  });
}
