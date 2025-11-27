import PDFDocument from 'pdfkit';
import { format } from 'date-fns';

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  message: string;
  createdAt: Date;
  messageType?: string;
}

interface ExportData {
  title: string;
  subtitle?: string;
  messages: ChatMessage[];
  metadata: {
    exportedAt: Date;
    exportedBy?: string;
    totalMessages: number;
    dateRange?: {
      start: Date;
      end: Date;
    };
    participants?: string[];
  };
}

/**
 * Generate PDF transcript of chat conversation
 */
export async function generateChatPDF(data: ExportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc
      .fontSize(20)
      .fillColor('#10b981')
      .text('CoAIleague Chat Export', { align: 'center' });

    doc
      .fontSize(16)
      .fillColor('#000000')
      .text(data.title, { align: 'center' })
      .moveDown();

    if (data.subtitle) {
      doc
        .fontSize(12)
        .fillColor('#666666')
        .text(data.subtitle, { align: 'center' })
        .moveDown();
    }

    // Metadata section
    doc
      .fontSize(10)
      .fillColor('#666666')
      .text(`Exported: ${format(data.metadata.exportedAt, 'PPpp')}`, { align: 'right' });

    if (data.metadata.exportedBy) {
      doc.text(`Exported by: ${data.metadata.exportedBy}`, { align: 'right' });
    }

    doc.text(`Total Messages: ${data.metadata.totalMessages}`, { align: 'right' });

    if (data.metadata.dateRange) {
      doc.text(
        `Date Range: ${format(data.metadata.dateRange.start, 'PP')} - ${format(data.metadata.dateRange.end, 'PP')}`,
        { align: 'right' }
      );
    }

    if (data.metadata.participants && data.metadata.participants.length > 0) {
      doc.text(`Participants: ${data.metadata.participants.join(', ')}`, { align: 'right' });
    }

    doc.moveDown(2);

    // Horizontal line
    doc
      .strokeColor('#10b981')
      .lineWidth(2)
      .moveTo(50, doc.y)
      .lineTo(550, doc.y)
      .stroke()
      .moveDown();

    // Messages
    for (const message of data.messages) {
      // Check if we need a new page
      if (doc.y > 700) {
        doc.addPage();
      }

      // Timestamp and sender
      doc
        .fontSize(9)
        .fillColor('#059669')
        .text(format(new Date(message.createdAt), 'PPpp'), { continued: true })
        .fillColor('#1F2937')
        .text(` - ${message.senderName}`)
        .moveDown(0.2);

      // Message content
      doc
        .fontSize(10)
        .fillColor('#000000')
        .text(message.message, {
          indent: 20,
          width: 500,
        })
        .moveDown(0.8);

      // Light separator
      doc
        .strokeColor('#E5E7EB')
        .lineWidth(0.5)
        .moveTo(70, doc.y)
        .lineTo(530, doc.y)
        .stroke()
        .moveDown(0.5);
    }

    // Footer
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(8)
        .fillColor('#999999')
        .text(
          `Page ${i + 1} of ${pageCount}`,
          50,
          doc.page.height - 50,
          { align: 'center' }
        );
    }

    doc.end();
  });
}

/**
 * Generate HTML transcript of chat conversation
 */
export function generateChatHTML(data: ExportData): string {
  const messagesHTML = data.messages.map((msg) => {
    const timestamp = format(new Date(msg.createdAt), 'PPpp');
    return `
      <div class="message">
        <div class="message-header">
          <span class="timestamp">${timestamp}</span>
          <span class="sender">${escapeHTML(msg.senderName)}</span>
        </div>
        <div class="message-content">${escapeHTML(msg.message)}</div>
      </div>
    `;
  }).join('');

  const participantsHTML = data.metadata.participants
    ? `<p><strong>Participants:</strong> ${data.metadata.participants.join(', ')}</p>`
    : '';

  const dateRangeHTML = data.metadata.dateRange
    ? `<p><strong>Date Range:</strong> ${format(data.metadata.dateRange.start, 'PP')} - ${format(data.metadata.dateRange.end, 'PP')}</p>`
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(data.title)} - Chat Export</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1F2937;
      background: #F9FAFB;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      padding: 40px;
    }
    header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid #10b981;
    }
    h1 {
      color: #10b981;
      margin: 0 0 10px 0;
      font-size: 28px;
    }
    h2 {
      color: #1F2937;
      margin: 0 0 10px 0;
      font-size: 22px;
    }
    .subtitle {
      color: #6B7280;
      font-size: 16px;
      margin: 0;
    }
    .metadata {
      background: #F3F4F6;
      padding: 20px;
      border-radius: 6px;
      margin-bottom: 30px;
      font-size: 14px;
      color: #4B5563;
    }
    .metadata p {
      margin: 8px 0;
    }
    .messages {
      margin-top: 30px;
    }
    .message {
      margin-bottom: 20px;
      padding: 15px;
      background: #FAFAFA;
      border-left: 4px solid #10b981;
      border-radius: 4px;
    }
    .message-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 13px;
    }
    .timestamp {
      color: #059669;
      font-weight: 500;
    }
    .sender {
      color: #1F2937;
      font-weight: 600;
    }
    .message-content {
      color: #111827;
      font-size: 15px;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #E5E7EB;
      text-align: center;
      color: #9CA3AF;
      font-size: 13px;
    }
    @media print {
      body {
        background: white;
        padding: 0;
      }
      .container {
        box-shadow: none;
        max-width: 100%;
      }
      .message {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>CoAIleague Chat Export</h1>
      <h2>${escapeHTML(data.title)}</h2>
      ${data.subtitle ? `<p class="subtitle">${escapeHTML(data.subtitle)}</p>` : ''}
    </header>

    <div class="metadata">
      <p><strong>Exported:</strong> ${format(data.metadata.exportedAt, 'PPpp')}</p>
      ${data.metadata.exportedBy ? `<p><strong>Exported by:</strong> ${escapeHTML(data.metadata.exportedBy)}</p>` : ''}
      <p><strong>Total Messages:</strong> ${data.metadata.totalMessages}</p>
      ${dateRangeHTML}
      ${participantsHTML}
    </div>

    <div class="messages">
      ${messagesHTML}
    </div>

    <footer>
      <p>This chat transcript was generated by CoAIleague Autonomous Workforce Management Solutions</p>
      <p>For authorized personnel only - Confidential</p>
    </footer>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Escape HTML special characters
 */
function escapeHTML(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}
