/**
 * Proposal PDF Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates proposal/bid PDFs using the universal pdfTemplateBase.
 * All colors come from pdfTemplateBase — no local overrides.
 * After generation the buffer is uploaded to GCS and an org_document record
 * is upserted so the tenant can download from the document library.
 */

import PDFDocument from 'pdfkit';
import { pool } from '../db';
import { format } from 'date-fns';
import { typedPool } from '../lib/typedSql';
import { uploadFileToObjectStorage } from '../objectStorage';
import { createLogger } from '../lib/logger';
import {
  PDF, PAGE,
  renderPdfHeader, renderPdfFooter,
  hlinePdf, sectionBar, fieldPair,
  loadTenantLogo,
} from './pdfTemplateBase';

const log = createLogger('proposalPdfService');

interface ProposalData {
  id: string;
  workspace_id: string;
  proposal_name: string;
  version: number;
  template_id: string | null;
  client_name: string | null;
  client_address: string | null;
  client_contact: string | null;
  client_email: string | null;
  client_phone: string | null;
  company_name: string | null;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_logo: string | null;
  total_value: string | null;
  valid_until: string | null;
  sections: any[] | null;
  ai_generated_content: Array<{ title: string; content: string; order: number }> | null;
  line_items: any[] | null;
  terms_and_conditions: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
}

interface LineItem {
  description: string;
  quantity: number;
  rate: number;
  total: number;
}

interface ProposalSection {
  title: string;
  content: string;
}

async function q(text: string, params: any[] = []) {
  const r = await typedPool(text, params);
  return r.rows;
}

function renderLineItems(doc: PDFDocumentType, items: LineItem[]): void {
  if (!items || items.length === 0) return;
  if (doc.y > 600) doc.addPage();

  sectionBar(doc, 'Pricing Breakdown');

  const colW = [260, 55, 80, 80];
  const headers = ['Description', 'Qty', 'Rate', 'Total'];
  let xPos = PAGE.ML;
  doc.fontSize(8).fillColor(PDF.gray).font('Helvetica');
  headers.forEach((h, i) => {
    doc.text(h, xPos, doc.y, { width: colW[i], continued: false });
    xPos += colW[i] + 7;
  });
  doc.moveDown(0.3);
  hlinePdf(doc, PDF.grayLight);

  let grandTotal = 0;
  items.forEach((item, idx) => {
    if (doc.y > 700) doc.addPage();
    const bg = idx % 2 === 0 ? PDF.white : PDF.offWhite;
    const rowH = 22;
    const rowY = doc.y;
    doc.rect(PAGE.ML, rowY, PAGE.CW, rowH).fill(bg);

    const lineTotal = (item.quantity || 0) * (item.rate || 0);
    grandTotal += item.total || lineTotal;

    xPos = PAGE.ML + 6;
    doc.fontSize(9).fillColor(PDF.dark).font('Helvetica');
    doc.text(item.description || '', xPos, rowY + 6, { width: colW[0] - 6 });
    xPos += colW[0] + 7;
    doc.text(String(item.quantity || 0), xPos, rowY + 6, { width: colW[1] });
    xPos += colW[1] + 7;
    doc.text(`$${(item.rate || 0).toFixed(2)}`, xPos, rowY + 6, { width: colW[2] });
    xPos += colW[2] + 7;
    doc.text(`$${(item.total || lineTotal).toFixed(2)}`, xPos, rowY + 6, { width: colW[3] });
    doc.y = rowY + rowH + 2;
  });

  hlinePdf(doc, PDF.grayBorder);
  doc.fontSize(11).fillColor(PDF.navyMid).font('Helvetica-Bold')
    .text(`Total: $${grandTotal.toFixed(2)}`, PAGE.ML, doc.y, { align: 'right', width: PAGE.CW });
  doc.moveDown(0.5);
}

// PDFKit type alias
type PDFDocumentType = InstanceType<typeof PDFDocument>;

export async function generateProposalPdf(proposalId: string, workspaceId: string): Promise<Buffer> {
  const rows = await q(`SELECT * FROM proposals WHERE id=$1 AND workspace_id=$2`, [proposalId, workspaceId]);
  if (!rows.length) throw new Error('Proposal not found');
  const proposal = rows[0] as unknown as ProposalData;

  const wsRows = await q(`SELECT name FROM workspaces WHERE id=$1`, [workspaceId]);
  const orgName = (wsRows[0] as any)?.name || proposal.company_name || 'CoAIleague';

  const tenantLogo = await loadTenantLogo(workspaceId).catch(() => null);

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: PAGE.MT, bottom: PAGE.MB, left: PAGE.ML, right: PAGE.MR },
      bufferPages: true,
      info: {
        Title: `Proposal — ${proposal.proposal_name}`,
        Author: orgName,
        Subject: 'Business Proposal / Bid',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // ── Universal header ──────────────────────────────────────────────────────
    renderPdfHeader(doc, {
      title: proposal.proposal_name,
      subtitle: 'Proposal / Bid',
      workspaceName: proposal.company_name || orgName,
      tenantLogoBuffer: tenantLogo,
      refLabel: `v${proposal.version || 1}`,
      generatedLabel: `Generated: ${format(new Date(), 'MMM d, yyyy')}`,
    });

    // ── Party details ─────────────────────────────────────────────────────────
    const partyY = doc.y + 6;
    fieldPair(doc, 'Prepared For', proposal.client_name || 'N/A', PAGE.ML, partyY, 220);
    fieldPair(doc, 'Prepared By', proposal.company_name || orgName, PAGE.MID + 12, partyY, 220);
    doc.y = partyY + 32;

    const row2Y = doc.y;
    fieldPair(doc, 'Client Contact', proposal.client_contact || 'N/A', PAGE.ML, row2Y, 220);
    fieldPair(doc, 'Company Phone', proposal.company_phone || 'N/A', PAGE.MID + 12, row2Y, 220);
    doc.y = row2Y + 32;

    const row3Y = doc.y;
    fieldPair(doc, 'Client Email', proposal.client_email || 'N/A', PAGE.ML, row3Y, 220);
    fieldPair(doc, 'Company Email', proposal.company_email || 'N/A', PAGE.MID + 12, row3Y, 220);
    doc.y = row3Y + 32;

    if (proposal.client_address || proposal.company_address) {
      const row4Y = doc.y;
      fieldPair(doc, 'Client Address', proposal.client_address || 'N/A', PAGE.ML, row4Y, 220);
      fieldPair(doc, 'Company Address', proposal.company_address || 'N/A', PAGE.MID + 12, row4Y, 220);
      doc.y = row4Y + 32;
    }
    if (proposal.valid_until) {
      const row5Y = doc.y;
      fieldPair(doc, 'Valid Until', format(new Date(proposal.valid_until), 'MMMM d, yyyy'), PAGE.ML, row5Y, 220);
      doc.y = row5Y + 32;
    }
    doc.moveDown(0.3);

    // ── Standard sections ─────────────────────────────────────────────────────
    const sections = (proposal.sections || []) as ProposalSection[];
    for (const section of sections) {
      if (doc.y > 640) doc.addPage();
      hlinePdf(doc);
      doc.fontSize(12).fillColor(PDF.navyMid).font('Helvetica-Bold')
        .text(section.title?.toUpperCase() || 'SECTION');
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor(PDF.dark).font('Helvetica')
        .text(section.content || '', { width: PAGE.CW });
      doc.moveDown(0.5);
    }

    // ── AI-generated sections ─────────────────────────────────────────────────
    if (proposal.ai_generated_content && Array.isArray(proposal.ai_generated_content)) {
      const aiSections = [...proposal.ai_generated_content]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      for (const section of aiSections) {
        if (doc.y > 600) doc.addPage();
        doc.moveDown(1);
        doc.fontSize(13).fillColor(PDF.navyMid).font('Helvetica-Bold')
          .text(section.title || 'Section');
        const lineY = doc.y;
        doc.moveTo(PAGE.ML, lineY).lineTo(PAGE.W - PAGE.MR, lineY)
          .strokeColor(PDF.gold).lineWidth(1).stroke();
        doc.moveDown(0.4);
        doc.fontSize(10).fillColor(PDF.grayDark).font('Helvetica')
          .text(section.content || '', { align: 'justify', lineGap: 4, width: PAGE.CW });
      }
      doc.moveDown(0.5);
    }

    // ── Line items / pricing ──────────────────────────────────────────────────
    renderLineItems(doc, (proposal.line_items || []) as LineItem[]);

    // ── Terms & conditions ────────────────────────────────────────────────────
    if (proposal.terms_and_conditions) {
      if (doc.y > 540) doc.addPage();
      sectionBar(doc, 'Terms and Conditions');
      doc.fontSize(9).fillColor(PDF.grayDark).font('Helvetica')
        .text(proposal.terms_and_conditions, { width: PAGE.CW });
      doc.moveDown(0.5);
    }

    // ── Signature blocks ──────────────────────────────────────────────────────
    if (doc.y > 600) doc.addPage();
    hlinePdf(doc, PDF.grayBorder);
    doc.moveDown(0.5);

    const sigY = doc.y;
    doc.fontSize(8).fillColor(PDF.gray).font('Helvetica')
      .text('Authorized Signature:', PAGE.ML, sigY);
    doc.moveTo(PAGE.ML, sigY + 22).lineTo(PAGE.ML + 210, sigY + 22)
      .strokeColor(PDF.grayBorder).lineWidth(0.75).stroke();
    doc.fontSize(8).fillColor(PDF.gray)
      .text(proposal.company_name || orgName, PAGE.ML, sigY + 28);

    doc.fontSize(8).fillColor(PDF.gray)
      .text('Client Acceptance:', PAGE.MID + 12, sigY);
    doc.moveTo(PAGE.MID + 12, sigY + 22).lineTo(PAGE.MID + 222, sigY + 22)
      .strokeColor(PDF.grayBorder).lineWidth(0.75).stroke();
    doc.fontSize(8).fillColor(PDF.gray)
      .text(proposal.client_name || 'Client', PAGE.MID + 12, sigY + 28);

    // ── Universal footer ──────────────────────────────────────────────────────
    renderPdfFooter(doc, {
      docId: proposal.id.slice(0, 8).toUpperCase(),
      docType: 'Proposal',
      workspaceName: proposal.company_name || orgName,
    });

    doc.end();
  });

  // ── Save to GCS + record in org_documents ────────────────────────────────
  const gcsPath = `proposals/${workspaceId}/${proposalId}/proposal.pdf`;
  try {
    await uploadFileToObjectStorage({
      objectPath: gcsPath,
      buffer: pdfBuffer,
      workspaceId,
      storageCategory: 'documents',
      metadata: { contentType: 'application/pdf', metadata: { proposalId } },
    });

    await pool.query(
      `INSERT INTO org_documents
         (workspace_id, category, file_name, file_path, file_size_bytes, file_type,
          description, requires_signature, is_active, created_at, updated_at)
       VALUES ($1, 'proposal', $2, $3, $4, 'application/pdf', $5, false, true, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [
        workspaceId,
        `${proposal.proposal_name}.pdf`,
        gcsPath,
        pdfBuffer.length,
        `Proposal: ${proposal.proposal_name} — v${proposal.version || 1} — ${format(new Date(), 'MMM d, yyyy')}`,
      ],
    );
    log.info(`[proposalPdf] Stored to GCS: ${gcsPath} (${pdfBuffer.length} bytes)`);
  } catch (storeErr : unknown) {
    log.warn(`[proposalPdf] GCS store failed for ${proposalId} (non-fatal): ${storeErr.message}`);
  }

  return pdfBuffer;
}
