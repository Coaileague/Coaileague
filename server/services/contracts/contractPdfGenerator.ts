import PDFDocument from 'pdfkit';
import { db } from '../../db';
import { clientContracts } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { format } from 'date-fns';

/**
 * Generates a fully executed contract PDF with all signature blocks.
 * Used after all parties have signed to produce the immutable executed copy.
 */
export async function generateExecutedContractPdf(contractId: string): Promise<Buffer> {
  const [contract] = await db
    .select()
    .from(clientContracts)
    .where(eq(clientContracts.id, contractId))
    .limit(1);

  if (!contract) throw new Error(`Contract ${contractId} not found`);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 50, bottom: 60, left: 55, right: 55 },
      info: {
        Title: contract.title || 'Executed Contract',
        Subject: 'Fully Executed Agreement',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const navy = '#1e3a5f';
    const gray = '#6b7280';
    const light = '#f9fafb';
    const executed = contract.executedAt ? format(new Date(contract.executedAt), 'MMMM d, yyyy') : format(new Date(), 'MMMM d, yyyy');

    // ── Header ────────────────────────────────────────────────────────────────
    doc.fontSize(18).fillColor(navy).font('Helvetica-Bold')
      .text('EXECUTED AGREEMENT', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(12).fillColor(navy).font('Helvetica-Bold')
      .text(contract.title || 'Service Agreement', { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor(gray).font('Helvetica')
      .text(`Execution Date: ${executed}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(55, doc.y).lineTo(557, doc.y).strokeColor('#d1d5db').lineWidth(1).stroke();
    doc.moveDown(0.8);

    // ── Party Information ─────────────────────────────────────────────────────
    doc.fontSize(10).fillColor(navy).font('Helvetica-Bold').text('PARTIES');
    doc.moveDown(0.3);

    const partyY = doc.y;
    doc.fontSize(9).fillColor(gray).font('Helvetica').text('Service Provider:', 55, partyY);
    doc.fontSize(10).fillColor('#111827').text(contract.companyName || 'Service Provider', 55, partyY + 12);

    doc.fontSize(9).fillColor(gray).font('Helvetica').text('Client:', 310, partyY);
    doc.fontSize(10).fillColor('#111827').text(contract.clientName || 'Client', 310, partyY + 12);
    doc.y = partyY + 35;

    if (contract.clientEmail) {
      doc.fontSize(9).fillColor(gray).font('Helvetica').text(`Client Email: ${contract.clientEmail}`, 55);
      doc.moveDown(0.3);
    }
    doc.moveDown(0.5);
    doc.moveTo(55, doc.y).lineTo(557, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    doc.moveDown(0.8);

    // ── Contract Content ──────────────────────────────────────────────────────
    if (contract.content) {
      doc.fontSize(10).fillColor(navy).font('Helvetica-Bold').text('AGREEMENT TERMS');
      doc.moveDown(0.4);
      doc.fontSize(9.5).fillColor('#374151').font('Helvetica')
        .text(contract.content, { lineGap: 4, align: 'justify', width: 502 });
      doc.moveDown(0.8);
    }

    // Special terms
    if (contract.specialTerms) {
      if (doc.y > 580) doc.addPage();
      doc.fontSize(10).fillColor(navy).font('Helvetica-Bold').text('SPECIAL TERMS & CONDITIONS');
      doc.moveDown(0.4);
      doc.fontSize(9.5).fillColor('#374151').font('Helvetica')
        .text(contract.specialTerms, { lineGap: 4, width: 502 });
      doc.moveDown(0.8);
    }

    // ── Value & Term ──────────────────────────────────────────────────────────
    if (contract.totalValue || contract.expiresAt) {
      if (doc.y > 620) doc.addPage();
      doc.moveTo(55, doc.y).lineTo(557, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
      doc.moveDown(0.6);
      const termY = doc.y;
      if (contract.totalValue) {
        doc.fontSize(9).fillColor(gray).font('Helvetica').text('Contract Value:', 55, termY);
        doc.fontSize(11).fillColor('#111827').font('Helvetica-Bold')
          .text(`$${parseFloat(contract.totalValue).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 55, termY + 12);
      }
      if (contract.expiresAt) {
        doc.fontSize(9).fillColor(gray).font('Helvetica').text('Expires:', 310, termY);
        doc.fontSize(10).fillColor('#111827').font('Helvetica')
          .text(format(new Date(contract.expiresAt), 'MMMM d, yyyy'), 310, termY + 12);
      }
      doc.y = termY + 40;
    }

    // ── Signature Blocks ──────────────────────────────────────────────────────
    if (doc.y > 580) doc.addPage();
    doc.moveDown(0.5);
    doc.moveTo(55, doc.y).lineTo(557, doc.y).strokeColor('#d1d5db').lineWidth(1).stroke();
    doc.moveDown(0.8);
    doc.fontSize(10).fillColor(navy).font('Helvetica-Bold').text('SIGNATURES — FULLY EXECUTED');
    doc.moveDown(0.6);

    // Company signature block
    doc.fontSize(9).fillColor(gray).font('Helvetica').text('Service Provider Signature:', 55);
    doc.moveDown(0.2);
    doc.moveTo(55, doc.y + 8).lineTo(260, doc.y + 8).strokeColor('#9ca3af').lineWidth(0.75).stroke();
    doc.moveDown(1.5);
    doc.fontSize(8).fillColor(gray).text(contract.companyName || 'Service Provider', 55);
    doc.fontSize(8).fillColor(gray).text(`Date: ${executed}`, 55);

    // Client signature block
    const clientSigY = doc.y - 50;
    doc.fontSize(9).fillColor(gray).font('Helvetica').text('Client Signature:', 310, clientSigY);
    doc.moveTo(310, clientSigY + 20).lineTo(557, clientSigY + 20).strokeColor('#9ca3af').lineWidth(0.75).stroke();
    doc.fontSize(8).fillColor(gray).text(contract.clientName || 'Client', 310, clientSigY + 32);
    doc.fontSize(8).fillColor(gray).text(`Date: ${executed}`, 310, clientSigY + 42);

    // ── Footer ────────────────────────────────────────────────────────────────
    const pageCount = (doc as any)._pageBuffer?.length ?? 1;
    doc.fontSize(7).fillColor('#9ca3af')
      .text(
        `CoAIleague Platform | Contract ID: ${contractId.slice(0, 8).toUpperCase()} | Executed: ${executed} | Page 1 of ${pageCount}`,
        55, 720,
        { width: 502, align: 'center' },
      );

    doc.end();
  });
}
