/**
 * Contract PDF Generator
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates fully executed contract PDFs using the universal pdfTemplateBase.
 * All styling comes from pdfTemplateBase — no local color overrides.
 */

import PDFDocument from 'pdfkit';
import { db } from '../../db';
import { clientContracts } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { format } from 'date-fns';
import {
  PDF, PAGE,
  renderPdfHeader, renderPdfFooter,
  hlinePdf, sectionBar, fieldPair,
  loadTenantLogo,
} from '../pdfTemplateBase';

export async function generateExecutedContractPdf(contractId: string): Promise<Buffer> {
  const [contract] = await db
    .select()
    .from(clientContracts)
    .where(eq(clientContracts.id, contractId))
    .limit(1);

  if (!contract) throw new Error(`Contract ${contractId} not found`);

  const tenantLogo = await loadTenantLogo(contract.workspaceId).catch(() => null);
  const executed = contract.executedAt
    ? format(new Date(contract.executedAt), 'MMMM d, yyyy')
    : format(new Date(), 'MMMM d, yyyy');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: PAGE.MT, bottom: PAGE.MB, left: PAGE.ML, right: PAGE.MR },
      bufferPages: true,
      info: {
        Title: contract.title || 'Executed Contract',
        Subject: 'Fully Executed Agreement',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // ── Universal header ──────────────────────────────────────────────────────
    renderPdfHeader(doc, {
      title: contract.title || 'Service Agreement',
      subtitle: 'Fully Executed Agreement',
      workspaceName: 'CoAIleague',
      tenantLogoBuffer: tenantLogo,
      refLabel: `ID: ${contractId.slice(0, 8).toUpperCase()}`,
      generatedLabel: `Executed: ${executed}`,
    });

    // ── Parties ───────────────────────────────────────────────────────────────
    sectionBar(doc, 'Parties to this Agreement');

    const partyY = doc.y + 6;
    fieldPair(doc, 'Service Provider', 'Service Provider', PAGE.ML, partyY, 220);
    fieldPair(doc, 'Client', contract.clientName || 'Client', PAGE.MID + 12, partyY, 220);
    doc.y = partyY + 36;

    if (contract.clientEmail) {
      doc.fontSize(8).fillColor(PDF.gray).font('Helvetica')
        .text(`Client Email: ${contract.clientEmail}`, PAGE.ML);
      doc.moveDown(0.3);
    }
    doc.moveDown(0.5);

    // ── Value & Term ──────────────────────────────────────────────────────────
    if (contract.totalValue || contract.expiresAt) {
      hlinePdf(doc);
      const termY = doc.y + 4;
      if (contract.totalValue) {
        fieldPair(doc, 'Contract Value',
          `$${parseFloat(contract.totalValue).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
          PAGE.ML, termY, 220);
      }
      if (contract.expiresAt) {
        fieldPair(doc, 'Expiration Date',
          format(new Date(contract.expiresAt), 'MMMM d, yyyy'),
          PAGE.MID + 12, termY, 220);
      }
      doc.y = termY + 36;
      doc.moveDown(0.3);
    }

    // ── Contract Content ──────────────────────────────────────────────────────
    if (contract.content) {
      sectionBar(doc, 'Agreement Terms');
      doc.fontSize(9.5).fillColor(PDF.grayDark).font('Helvetica')
        .text(contract.content, { lineGap: 4, align: 'justify', width: PAGE.CW });
      doc.moveDown(0.8);
    }

    if (contract.specialTerms) {
      if (doc.y > 580) doc.addPage();
      sectionBar(doc, 'Special Terms & Conditions');
      doc.fontSize(9.5).fillColor(PDF.grayDark).font('Helvetica')
        .text(contract.specialTerms, { lineGap: 4, width: PAGE.CW });
      doc.moveDown(0.8);
    }

    // ── Signature Blocks ──────────────────────────────────────────────────────
    if (doc.y > 560) doc.addPage();
    doc.moveDown(0.5);
    hlinePdf(doc, PDF.grayBorder);
    sectionBar(doc, 'Signatures — Fully Executed');

    const sigY = doc.y + 8;

    // Provider sig
    doc.fontSize(8).fillColor(PDF.gray).font('Helvetica')
      .text('Service Provider Signature:', PAGE.ML, sigY);
    doc.moveTo(PAGE.ML, sigY + 22)
      .lineTo(PAGE.ML + 210, sigY + 22)
      .strokeColor(PDF.grayBorder).lineWidth(0.75).stroke();
    doc.fontSize(8).fillColor(PDF.gray)
      .text('Service Provider', PAGE.ML, sigY + 28);
    doc.fontSize(8).fillColor(PDF.gray)
      .text(`Date: ${executed}`, PAGE.ML, sigY + 38);

    // Client sig
    doc.fontSize(8).fillColor(PDF.gray).font('Helvetica')
      .text('Client Signature:', PAGE.MID + 12, sigY);
    doc.moveTo(PAGE.MID + 12, sigY + 22)
      .lineTo(PAGE.MID + 222, sigY + 22)
      .strokeColor(PDF.grayBorder).lineWidth(0.75).stroke();
    doc.fontSize(8).fillColor(PDF.gray)
      .text(contract.clientName || 'Client', PAGE.MID + 12, sigY + 28);
    doc.fontSize(8).fillColor(PDF.gray)
      .text(`Date: ${executed}`, PAGE.MID + 12, sigY + 38);

    doc.y = sigY + 58;
    doc.moveDown(1);

    // E-SIGN compliance notice
    doc.fontSize(7.5).fillColor(PDF.gray).font('Helvetica')
      .text(
        'This document was executed electronically pursuant to the Electronic Signatures in Global and National Commerce Act (E-SIGN Act, 15 U.S.C. § 7001 et seq.) and applicable state law. The digital signature and execution timestamp constitute a legally binding agreement.',
        PAGE.ML, doc.y, { width: PAGE.CW, align: 'justify', lineGap: 3 },
      );

    // ── Universal footer on all pages ─────────────────────────────────────────
    renderPdfFooter(doc, {
      docId: contractId.slice(0, 8).toUpperCase(),
      docType: 'Executed Contract',
      workspaceName: 'CoAIleague',
    });

    doc.end();
  });
}
