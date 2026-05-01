import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import { format } from 'date-fns';
import { pool } from '../db';
import { createLogger } from '../lib/logger';
import { uploadFileToObjectStorage, downloadFileFromObjectStorage } from '../objectStorage';

const log = createLogger('FormsPdfService');

const C = {
  navy: '#0f2a4a',
  navyMid: '#1e3a5f',
  gold: '#d4af37',
  goldLight: '#f0d060',
  white: '#ffffff',
  offWhite: '#f8f9fb',
  gray: '#6b7280',
  grayLight: '#e5e7eb',
  grayDark: '#374151',
  black: '#111827',
  greenLight: '#f0fdf4',
  greenBorder: '#bbf7d0',
  green: '#15803d',
};

interface FormField {
  id?: string;
  name?: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  section?: string;
}

interface GenerateOptions {
  submission: {
    id: string;
    workspace_id: string;
    form_id: string;
    submitted_by_name?: string | null;
    submitted_by_email?: string | null;
    data: Record<string, unknown>;
    signature_data?: string | null;
    signature_type?: string | null;
    typed_name?: string | null;
    submitted_at: string | Date;
    ip_address?: string | null;
    device_type?: string | null;
    trinity_processing_status?: string;
  };
  form: {
    id: string;
    title: string;
    form_type: string;
    description?: string | null;
    fields: FormField[];
    requires_signature?: boolean;
    signature_label?: string | null;
  };
  workspace?: {
    name?: string | null;
    owner_name?: string | null;
  } | null;
}

function hline(doc: PDFKit.PDFDocument, color = C.grayLight, x1 = 50, x2 = 562) {
  doc.moveTo(x1, doc.y).lineTo(x2, doc.y).strokeColor(color).lineWidth(0.5).stroke();
  doc.moveDown(0.4);
}

function renderHeader(doc: PDFKit.PDFDocument, title: string, formType: string, workspaceName: string) {
  const startY = 30;
  doc.rect(0, 0, 612, 90).fill(C.navy);
  doc.rect(0, 90, 612, 4).fill(C.gold);

  doc.fontSize(8).fillColor(C.goldLight).text(workspaceName.toUpperCase(), 50, startY + 8, { characterSpacing: 1.5 });
  doc.fontSize(18).fillColor(C.white).text(title, 50, startY + 20, { width: 450, lineBreak: false });
  doc.fontSize(9).fillColor(C.gray).text(formType.replace(/_/g, ' ').toUpperCase(), 50, startY + 46, { characterSpacing: 0.8 });

  doc.fontSize(8).fillColor(C.gold).text('FORM SUBMISSION RECORD', 400, startY + 8, { align: 'right', width: 162 });
  doc.fontSize(8).fillColor(C.grayLight).text(`Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')}`, 400, startY + 22, { align: 'right', width: 162 });

  doc.moveDown(0.2);
  doc.y = 105;
}

function renderMetadataBlock(doc: PDFKit.PDFDocument, submission: GenerateOptions['submission']) {
  const leftX = 50;
  const midX = 307;
  const y = doc.y + 8;

  doc.rect(50, y, 512, 64).fill(C.offWhite);

  const meta = [
    { label: 'Submitted By', value: submission.submitted_by_name || 'Anonymous', x: leftX + 12, col: 0 },
    { label: 'Email', value: submission.submitted_by_email || '—', x: leftX + 12, col: 0 },
    { label: 'Submission ID', value: submission.id, x: midX + 8, col: 1 },
    { label: 'Date & Time', value: format(new Date(submission.submitted_at), 'MMMM dd, yyyy · h:mm a'), x: midX + 8, col: 1 },
  ];

  let row0 = y + 10;
  let row1 = y + 10;
  for (const m of meta) {
    const yPos = m.col === 0 ? row0 : row1;
    doc.fontSize(7).fillColor(C.gray).text(m.label.toUpperCase(), m.x, yPos, { characterSpacing: 0.5 });
    doc.fontSize(9).fillColor(C.black).text(m.value, m.x, yPos + 10, { width: 240, lineBreak: false });
    if (m.col === 0) row0 += 28;
    else row1 += 28;
  }

  if (submission.device_type) {
    doc.fontSize(7).fillColor(C.gray).text(`Device: ${submission.device_type}`, leftX + 12, row0, { characterSpacing: 0.5 });
  }

  doc.y = y + 76;
}

function renderSectionTitle(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.6);
  doc.rect(50, doc.y, 512, 20).fill(C.navyMid);
  doc.fontSize(9).fillColor(C.white).text(title.toUpperCase(), 62, doc.y + 6, { characterSpacing: 0.8 });
  doc.y += 22;
  doc.moveDown(0.2);
}

function renderFieldValue(doc: PDFKit.PDFDocument, label: string, value: string, index: number) {
  const bgColor = index % 2 === 0 ? C.white : C.offWhite;
  const startY = doc.y;
  const valueLines = Math.ceil(value.length / 80) + 1;
  const rowH = Math.max(28, valueLines * 12 + 10);

  doc.rect(50, startY, 512, rowH).fill(bgColor);
  doc.fontSize(7.5).fillColor(C.gray).text(label, 62, startY + 6, { characterSpacing: 0.3, width: 488 });
  doc.fontSize(10).fillColor(C.black).text(value || '—', 62, startY + 16, { width: 488, lineBreak: true });
  doc.y = startY + rowH + 2;
}

function renderSignatureSection(doc: PDFKit.PDFDocument, submission: GenerateOptions['submission'], signatureLabel: string) {
  doc.addPage();
  renderSectionTitle(doc, 'Electronic Signature');
  doc.moveDown(0.4);

  const y = doc.y;
  doc.rect(50, y, 512, 120).fill(C.greenLight).stroke(C.greenBorder);

  doc.fontSize(9).fillColor(C.green).text('SIGNATURE VERIFIED', 62, y + 10, { characterSpacing: 0.8 });
  doc.moveDown(0.3);

  if (submission.typed_name) {
    doc.fontSize(8).fillColor(C.gray).text('Typed Signature', 62, y + 26);
    doc.fontSize(20).fillColor(C.black)
      .font('Helvetica-Oblique')
      .text(submission.typed_name, 62, y + 38, { width: 450 });
    doc.font('Helvetica');
  } else if (submission.signature_data && submission.signature_data.startsWith('data:image')) {
    doc.fontSize(8).fillColor(C.gray).text('Drawn Signature', 62, y + 26);
    try {
      const base64 = submission.signature_data.replace(/^data:image\/\w+;base64,/, '');
      const imgBuf = Buffer.from(base64, 'base64');
      doc.image(imgBuf, 62, y + 38, { width: 200, height: 60 });
    } catch {
      doc.fontSize(9).fillColor(C.gray).text('[Signature image on file]', 62, y + 38);
    }
  }

  doc.fontSize(8).fillColor(C.gray).text(
    `${signatureLabel} · ${format(new Date(submission.submitted_at), 'MMMM dd, yyyy')} · IP: ${submission.ip_address || 'Unknown'}`,
    62, y + 100, { width: 450 }
  );

  doc.y = y + 128;

  doc.moveDown(0.6);
  doc.fontSize(8).fillColor(C.gray)
    .text('This electronic signature is legally binding under the Electronic Signatures in Global and National Commerce Act (E-SIGN Act, 15 U.S.C. § 7001 et seq.) and applicable state electronic signature laws. The timestamp, IP address, and unique submission ID provide a complete audit trail.', 50, doc.y, { width: 512, lineBreak: true });
}

function renderFooter(doc: PDFKit.PDFDocument, submissionId: string, hash: string) {
  const pages = (doc as any)._pageBuffer?.length || 1;
  for (let i = 0; i < pages; i++) {
    doc.switchToPage(i);
    const footerY = doc.page.height - 40;
    doc.moveTo(50, footerY - 4).lineTo(562, footerY - 4).strokeColor(C.grayLight).lineWidth(0.5).stroke();
    doc.fontSize(7).fillColor(C.gray)
      .text(`CoAIleague · Form Submission Record · ID: ${submissionId}`, 50, footerY, { align: 'left', width: 400 })
      .text(`SHA-256: ${hash.slice(0, 16)}...`, 50, footerY, { align: 'right', width: 512, characterSpacing: 0.3 });
  }
}

export async function generateFormSubmissionPdf(opts: GenerateOptions): Promise<Buffer> {
  const { submission, form, workspace } = opts;
  const workspaceName = workspace?.name || 'CoAIleague';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'LETTER', bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {
      const pdf = Buffer.concat(chunks);
      resolve(pdf);
    });
    doc.on('error', reject);

    renderHeader(doc, form.title, form.form_type, workspaceName);
    renderMetadataBlock(doc, submission);

    hline(doc);
    doc.moveDown(0.3);

    const fields = Array.isArray(form.fields) ? form.fields : [];
    const data = submission.data || {};

    const grouped: Record<string, FormField[]> = {};
    for (const field of fields) {
      const section = field.section || 'Form Fields';
      if (!grouped[section]) grouped[section] = [];
      grouped[section].push(field);
    }

    let globalIndex = 0;
    for (const [section, sectionFields] of Object.entries(grouped)) {
      renderSectionTitle(doc, section);
      for (const field of sectionFields) {
        const key = field.name || field.id || field.label;
        const raw = data[key] ?? data[field.label] ?? '';
        let displayValue = '';

        if (raw === null || raw === undefined || raw === '') {
          displayValue = '—';
        } else if (typeof raw === 'boolean') {
          displayValue = raw ? 'Yes' : 'No';
        } else if (Array.isArray(raw)) {
          displayValue = raw.join(', ');
        } else if (typeof raw === 'object') {
          displayValue = JSON.stringify(raw);
        } else {
          displayValue = String(raw);
        }

        if (field.type !== 'signature') {
          renderFieldValue(doc, field.label, displayValue, globalIndex++);
        }

        if (doc.y > doc.page.height - 80) doc.addPage();
      }
    }

    if (form.requires_signature && (submission.signature_data || submission.typed_name)) {
      renderSignatureSection(doc, submission, form.signature_label || 'Authorized Signature');
    }

    doc.flushPages();

    const tempBuf = Buffer.concat(chunks.splice(0));
    const hash = crypto.createHash('sha256').update(tempBuf).digest('hex');
    renderFooter(doc, submission.id, hash);

    doc.end();
  });
}

export async function generateAndStorePdf(opts: GenerateOptions): Promise<string | null> {
  try {
    const { submission, form } = opts;

    const wsRow = await pool.query(`SELECT name, owner_name FROM workspaces WHERE id = $1`, [submission.workspace_id]);
    const workspace = wsRow.rows[0] || null;

    const pdfBuf = await generateFormSubmissionPdf({ ...opts, workspace });

    const fileName = `form-submission-${submission.id}.pdf`;
    const gcsPath = `forms/${submission.workspace_id}/${submission.id}/submission.pdf`;

    await uploadFileToObjectStorage({
      objectPath: gcsPath,
      buffer: pdfBuf,
      workspaceId: submission.workspace_id,
      storageCategory: 'documents',
      metadata: { contentType: 'application/pdf', metadata: { submissionId: submission.id, formId: form.id } },
    });

    const docResult = await pool.query(
      `INSERT INTO org_documents
       (workspace_id, category, file_name, file_path, file_size_bytes, file_type,
        description, requires_signature, is_active, created_at, updated_at)
       VALUES ($1, 'form_submission', $2, $3, $4, 'application/pdf', $5, $6, true, NOW(), NOW())
       RETURNING id`,
      [
        submission.workspace_id,
        fileName,
        gcsPath,
        pdfBuf.length,
        `Form submission: ${form.title} — ${submission.submitted_by_name || 'Anonymous'} — ${format(new Date(submission.submitted_at), 'MMM dd yyyy')}`,
        form.requires_signature || false,
      ]
    );

    const docId = docResult.rows[0]?.id;

    await pool.query(
      `UPDATE form_submissions SET generated_document_id = $1, generated_document_url = $2 WHERE id = $3 AND workspace_id = $4`,
      [docId || null, gcsPath, submission.id, submission.workspace_id]
    );

    if (docId) {
      await pool.query(
        `UPDATE org_documents SET description = description || $1 WHERE id = $2`,
        [` [submission_id:${submission.id}]`, docId]
      ).catch((err: any) => log.warn('[formsPdfService] org_documents tag failed:', err));
    }

    log.info(`PDF generated for submission ${submission.id} → ${gcsPath} (${pdfBuf.length} bytes)`);
    return gcsPath;
  } catch (err: unknown) {
    log.error(`PDF generation failed for submission ${opts.submission.id}:`, err?.message);
    return null;
  }
}

export async function generateAndGetPdf(opts: GenerateOptions): Promise<Buffer | null> {
  try {
    const row = await pool.query(
      `SELECT generated_document_url FROM form_submissions WHERE id = $1`,
      [opts.submission.id]
    );
    const storedPath: string | null = row.rows[0]?.generated_document_url ?? null;
    if (storedPath?.startsWith('forms/')) {
      return await downloadFileFromObjectStorage(storedPath);
    }
  } catch {
    // fall through to generate
  }
  const gcsPath = await generateAndStorePdf(opts);
  if (!gcsPath) return null;
  try {
    return await downloadFileFromObjectStorage(gcsPath);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// generateCustomFormPdf
// Generates a PDF for customForms / customFormSubmissions (Drizzle-backed).
// Used by formBuilderRoutes.ts GET /forms/:formId/submissions/:submissionId/pdf
// ─────────────────────────────────────────────────────────────────────────────

export interface CustomFormPdfOptions {
  form: {
    id: string;
    name: string;
    description?: string | null;
    category?: string | null;
    template: unknown;
  };
  submission: {
    id: string;
    workspaceId: string;
    submittedBy?: string | null;
    formData: unknown;
    signatureData?: unknown;
    status?: string | null;
    approvedBy?: string | null;
    approvedAt?: Date | null;
    rejectedBy?: string | null;
    rejectedAt?: Date | null;
    approvalNotes?: string | null;
    submittedAt?: Date | null;
    ipAddress?: string | null;
  };
  signatures?: Array<{
    signedBy: string;
    signatureType: string;
    signatureData?: string | null;
    signedAt?: Date | null;
    ipAddress?: string | null;
  }>;
}

export async function generateCustomFormPdf(opts: CustomFormPdfOptions): Promise<Buffer> {
  const { form, submission, signatures = [] } = opts;
  const template = form.template as any;
  const fields: Array<{ id?: string; label: string; type: string }> = template?.fields || [];
  const formData = submission.formData as Record<string, any> || {};

  // Look up workspace name for header
  let workspaceName = 'CoAIleague';
  try {
    const wsRow = await pool.query(`SELECT name FROM workspaces WHERE id = $1`, [submission.workspaceId]);
    workspaceName = wsRow.rows[0]?.name || 'CoAIleague';
  } catch {
    // non-fatal
  }

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'LETTER', bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Header ─────────────────────────────────────────────────────────────
    renderHeader(doc, form.name, form.category || 'custom_form', workspaceName);

    // ── Metadata block ─────────────────────────────────────────────────────
    const y = doc.y + 8;
    doc.rect(50, y, 512, 52).fill(C.offWhite);
    doc.fontSize(7).fillColor(C.gray).text('SUBMISSION ID', 62, y + 8, { characterSpacing: 0.5 });
    doc.fontSize(9).fillColor(C.black).text(submission.id, 62, y + 18, { width: 240 });
    doc.fontSize(7).fillColor(C.gray).text('STATUS', 320, y + 8, { characterSpacing: 0.5 });
    doc.fontSize(9).fillColor(C.black).text((submission.status || 'completed').toUpperCase(), 320, y + 18, { width: 200 });
    const submittedAt = submission.submittedAt ? format(new Date(submission.submittedAt), 'MMMM dd, yyyy · h:mm a') : '—';
    doc.fontSize(7).fillColor(C.gray).text('SUBMITTED', 62, y + 34, { characterSpacing: 0.5 });
    doc.fontSize(9).fillColor(C.black).text(submittedAt, 62, y + 44, { width: 240 });
    doc.fontSize(7).fillColor(C.gray).text('GENERATED', 320, y + 34, { characterSpacing: 0.5 });
    doc.fontSize(9).fillColor(C.black).text(format(new Date(), 'MMMM dd, yyyy · h:mm a'), 320, y + 44, { width: 200 });
    doc.y = y + 62;

    // ── Form fields ─────────────────────────────────────────────────────────
    const displayFields = fields.filter(f => !['section_header', 'divider', 'esignature'].includes(f.type));
    if (displayFields.length > 0) {
      renderSectionTitle(doc, 'Form Responses');
      displayFields.forEach((field, idx) => {
        const key = field.id || field.label;
        const raw = formData[key] ?? formData[field.label] ?? '';
        const value = typeof raw === 'object' ? JSON.stringify(raw) : String(raw || '—');
        if (doc.y > 680) doc.addPage();
        renderFieldValue(doc, field.label, value, idx);
      });
    }

    // ── Signature block ─────────────────────────────────────────────────────
    const sigData = submission.signatureData as any;
    const hasDrawnSig = sigData?.drawn && typeof sigData.drawn === 'string' && sigData.drawn.startsWith('data:image');
    const typedName = sigData?.name || sigData?.typedName;

    if (hasDrawnSig || typedName || signatures.length > 0) {
      doc.addPage();
      renderSectionTitle(doc, 'Signatures');
      doc.moveDown(0.4);

      // Submitter's own signature
      if (hasDrawnSig || typedName) {
        const sigY = doc.y;
        doc.rect(50, sigY, 512, 100).fill(C.greenLight).stroke(C.greenBorder);
        doc.fontSize(9).fillColor(C.green).text('SUBMITTER SIGNATURE', 62, sigY + 10, { characterSpacing: 0.8 });
        if (typedName) {
          doc.fontSize(18).fillColor(C.black).font('Helvetica-Oblique').text(typedName, 62, sigY + 28, { width: 450 });
          doc.font('Helvetica');
        } else if (hasDrawnSig) {
          try {
            const b64 = sigData.drawn.replace(/^data:image\/\w+;base64,/, '');
            doc.image(Buffer.from(b64, 'base64'), 62, sigY + 24, { width: 180, height: 55 });
          } catch {
            doc.fontSize(9).fillColor(C.gray).text('[Drawn signature on file]', 62, sigY + 28);
          }
        }
        doc.fontSize(7.5).fillColor(C.gray).text(
          `Signed: ${submittedAt} · IP: ${submission.ipAddress || 'Unknown'}`,
          62, sigY + 84, { width: 450 }
        );
        doc.y = sigY + 108;
        doc.moveDown(0.4);
      }

      // Reviewer signatures
      for (const sig of signatures) {
        if (doc.y > 680) doc.addPage();
        const sigY = doc.y;
        const isCanvas = sig.signatureData && sig.signatureData.startsWith('data:image');
        doc.rect(50, sigY, 512, 90).fill(C.offWhite);
        doc.fontSize(8).fillColor(C.gray).text(`${sig.signatureType.toUpperCase()} SIGNATURE — ${sig.signedBy}`, 62, sigY + 8, { characterSpacing: 0.5 });
        if (isCanvas) {
          try {
            const b64 = (sig.signatureData as string).replace(/^data:image\/\w+;base64,/, '');
            doc.image(Buffer.from(b64, 'base64'), 62, sigY + 20, { width: 160, height: 50 });
          } catch {
            doc.fontSize(9).fillColor(C.gray).text('[Signature image on file]', 62, sigY + 24);
          }
        } else if (sig.signatureData) {
          doc.fontSize(16).fillColor(C.black).font('Helvetica-Oblique').text(sig.signatureData, 62, sigY + 22, { width: 450 });
          doc.font('Helvetica');
        }
        const sigTs = sig.signedAt ? format(new Date(sig.signedAt), 'MMMM dd, yyyy · h:mm a') : '—';
        doc.fontSize(7.5).fillColor(C.gray).text(`${sigTs} · IP: ${sig.ipAddress || 'Unknown'}`, 62, sigY + 74, { width: 450 });
        doc.y = sigY + 96;
        doc.moveDown(0.3);
      }
    }

    // ── Approval stamp ──────────────────────────────────────────────────────
    if (submission.status === 'approved' || submission.status === 'rejected') {
      if (doc.y > 640) doc.addPage();
      renderSectionTitle(doc, submission.status === 'approved' ? 'Approval Record' : 'Rejection Record');
      doc.moveDown(0.3);
      const stampY = doc.y;
      const stampColor = submission.status === 'approved' ? C.greenLight : '#fef2f2';
      const stampBorder = submission.status === 'approved' ? C.greenBorder : '#fecaca';
      const stampText = submission.status === 'approved' ? C.green : '#991b1b';
      doc.rect(50, stampY, 512, 70).fill(stampColor).stroke(stampBorder);
      doc.fontSize(11).fillColor(stampText)
        .text(submission.status === 'approved' ? '✓ APPROVED' : '✗ REJECTED', 62, stampY + 10, { characterSpacing: 1 });
      const byId = submission.approvedBy || submission.rejectedBy || '—';
      const atDate = (submission.approvedAt || submission.rejectedAt)
        ? format(new Date((submission.approvedAt || submission.rejectedAt)!), 'MMMM dd, yyyy · h:mm a')
        : '—';
      doc.fontSize(9).fillColor(C.black).text(`By: ${byId}`, 62, stampY + 28);
      doc.fontSize(9).fillColor(C.black).text(`Date: ${atDate}`, 62, stampY + 41);
      if (submission.approvalNotes) {
        doc.fontSize(9).fillColor(C.grayDark).text(`Notes: ${submission.approvalNotes}`, 62, stampY + 54, { width: 450 });
      }
      doc.y = stampY + 80;
    }

    // ── Footer ──────────────────────────────────────────────────────────────
    const hash = crypto
      .createHash('sha256')
      .update(`${submission.id}:${submission.submittedAt}:${form.id}`)
      .digest('hex');
    const pages = (doc as any)._pageBuffer?.length || 1;
    for (let i = 0; i < pages; i++) {
      doc.switchToPage(i);
      const footerY = doc.page.height - 40;
      doc.moveTo(50, footerY - 4).lineTo(562, footerY - 4).strokeColor(C.grayLight).lineWidth(0.5).stroke();
      doc.fontSize(7).fillColor(C.gray)
        .text(`CoAIleague · Form Record · ${form.name} · ID: ${submission.id.slice(0, 8)}`, 50, footerY, { align: 'left', width: 400 })
        .text(`SHA-256: ${hash.slice(0, 16)}...`, 50, footerY, { align: 'right', width: 512 });
    }

    doc.end();
  });
}
