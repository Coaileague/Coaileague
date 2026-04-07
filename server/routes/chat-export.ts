/**
 * server/routes/chat-export.ts
 *
 * Generates PDF and HTML exports of chat/support conversations.
 * Imported by chat.ts as './chat-export.js' (TypeScript resolves .js -> .ts).
 */

import PDFDocument from 'pdfkit';
import { PLATFORM } from '../config/platformConfig';

export interface ChatExportMessage {
  id: string;
  senderId?: string;
  senderName?: string;
  message: string;
  createdAt: string | Date;
}

export interface ChatExportData {
  title: string;
  subtitle?: string;
  messages: ChatExportMessage[];
  metadata?: {
    exportedAt?: Date;
    exportedBy?: string;
    exportedByRole?: string;
    totalMessages?: number;
    dateRange?: { start: Date; end: Date };
    participants?: (string | undefined)[];
  };
}

/**
 * Generate a PDF buffer from chat/conversation export data.
 */
export async function generateChatPDF(data: ChatExportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    const buffers: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text(PLATFORM.name, { align: 'center' });
    doc.fontSize(14).font('Helvetica').text(data.title, { align: 'center' });
    if (data.subtitle) {
      doc.fontSize(10).fillColor('#666').text(data.subtitle, { align: 'center' });
      doc.fillColor('#000');
    }

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.5);

    // Metadata block
    if (data.metadata) {
      doc.fontSize(9).fillColor('#555');
      if (data.metadata.exportedBy) {
        doc.text(`Exported by: ${data.metadata.exportedBy} (${data.metadata.exportedByRole || 'staff'})`);
      }
      if (data.metadata.exportedAt) {
        doc.text(`Exported at: ${new Date(data.metadata.exportedAt).toLocaleString()}`);
      }
      if (data.metadata.totalMessages != null) {
        doc.text(`Total messages: ${data.metadata.totalMessages}`);
      }
      if (data.metadata.dateRange) {
        const start = new Date(data.metadata.dateRange.start).toLocaleString();
        const end = new Date(data.metadata.dateRange.end).toLocaleString();
        doc.text(`Date range: ${start} – ${end}`);
      }
      if (data.metadata.participants?.length) {
        const names = data.metadata.participants.filter(Boolean).join(', ');
        doc.text(`Participants: ${names}`);
      }
      doc.fillColor('#000');
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke('#ddd');
      doc.moveDown(0.5);
    }

    // Messages
    doc.fontSize(10);
    for (const msg of data.messages) {
      const ts = new Date(msg.createdAt).toLocaleString();
      const sender = msg.senderName || msg.senderId || 'Unknown';

      doc.font('Helvetica-Bold').fillColor('#222').text(`${sender}`, { continued: true });
      doc.font('Helvetica').fillColor('#888').text(`  ${ts}`);
      doc.fillColor('#333').font('Helvetica').text(msg.message, { indent: 16 });
      doc.moveDown(0.4);
    }

    doc.end();
  });
}

/**
 * Generate an HTML string from chat/conversation export data.
 */
export function generateChatHTML(data: ChatExportData): string {
  const rows = data.messages.map((msg) => {
    const ts = new Date(msg.createdAt).toLocaleString();
    const sender = msg.senderName || msg.senderId || 'Unknown';
    const escapedMsg = msg.message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    return `<div class="message">
      <div class="meta"><span class="sender">${sender}</span><span class="ts">${ts}</span></div>
      <div class="body">${escapedMsg}</div>
    </div>`;
  }).join('\n');

  const meta = data.metadata;
  const metaBlock = meta ? `
    <div class="meta-block">
      ${meta.exportedBy ? `<p>Exported by: <strong>${meta.exportedBy}</strong>${meta.exportedByRole ? ` (${meta.exportedByRole})` : ''}</p>` : ''}
      ${meta.exportedAt ? `<p>Exported at: ${new Date(meta.exportedAt).toLocaleString()}</p>` : ''}
      ${meta.totalMessages != null ? `<p>Total messages: ${meta.totalMessages}</p>` : ''}
      ${meta.dateRange ? `<p>Date range: ${new Date(meta.dateRange.start).toLocaleString()} – ${new Date(meta.dateRange.end).toLocaleString()}</p>` : ''}
      ${meta.participants?.filter(Boolean).length ? `<p>Participants: ${meta.participants.filter(Boolean).join(', ')}</p>` : ''}
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${data.title}</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 40px auto; color: #222; }
    h1 { font-size: 1.6rem; margin-bottom: 4px; }
    h2 { font-size: 1rem; font-weight: normal; color: #666; margin-top: 0; }
    hr { border: none; border-top: 1px solid #ddd; margin: 16px 0; }
    .meta-block { background: #f8f8f8; border-radius: 6px; padding: 12px 16px; font-size: 0.85rem; color: #555; margin-bottom: 20px; }
    .meta-block p { margin: 4px 0; }
    .message { padding: 10px 0; border-bottom: 1px solid #eee; }
    .meta { display: flex; gap: 12px; align-items: baseline; margin-bottom: 4px; }
    .sender { font-weight: 600; font-size: 0.9rem; }
    .ts { font-size: 0.78rem; color: #999; }
    .body { font-size: 0.9rem; line-height: 1.5; padding-left: 8px; color: #333; }
  </style>
</head>
<body>
  <h1>${data.title}</h1>
  ${data.subtitle ? `<h2>${data.subtitle}</h2>` : ''}
  <hr>
  ${metaBlock}
  <div class="messages">${rows}</div>
</body>
</html>`;
}
