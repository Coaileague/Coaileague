import PDFDocument from 'pdfkit';
import { pool } from '../db';
import { format, startOfHour, addHours } from 'date-fns';
import { Storage } from '@google-cloud/storage';
import { typedPool } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
import { validateWebhookUrl } from './webhookDeliveryService';
const log = createLogger('darPdfService');


// ─── Interfaces ─────────────────────────────────────────────────────────────

interface DarData {
  id: string;
  report_number: string;
  workspace_id: string;
  employee_name: string;
  employee_id: string;
  site_name: string;
  site_id: string;
  shift_date: string;
  shift_start: string;
  shift_end: string;
  activity_summary: string;
  ai_summary: string;
  visitor_count: number;
  patrol_rounds_completed: number;
  incidents_occurred: boolean;
  equipment_checked: boolean;
  equipment_notes: string;
  weather_conditions: string;
  post_orders_followed: boolean;
  post_orders_notes: string;
  photos: string;
  status: string;
  trinity_articulated: boolean;
  created_at: string;
}

interface ShiftDarData {
  id: string;
  workspace_id: string;
  shift_id: string;
  chatroom_id: string;
  client_id: string;
  title: string;
  summary: string;
  content: string;
  photo_count: number;
  message_count: number;
  employee_id: string;
  employee_name: string;
  shift_start_time: string;
  shift_end_time: string;
  actual_clock_in: string;
  actual_clock_out: string;
  status: string;
  trinity_articulated: boolean;
  photo_manifest: PhotoManifestEntry[];
  pdf_url: string;
}

interface PhotoManifestEntry {
  timestamp: string;
  url: string | null;
  caption: string;
  messageId: string;
  uploaderName: string;
  attachmentType: string;
  attachmentSize: number;
  gpsLat?: number | null;
  gpsLng?: number | null;
  gpsAddress?: string | null;
  gpsAccuracy?: number | null;
}

interface ChatMessage {
  id: string;
  content: string;
  message_type: string;
  attachment_url: string | null;
  attachment_type: string | null;
  created_at: string;
  user_id: string;
  metadata: any;
}

interface VisitorRecord {
  visitor_name: string;
  visitor_company: string;
  purpose: string;
  vehicle_plate: string;
  checked_in_at: string;
  checked_out_at: string;
}

interface HourBucket {
  hourLabel: string;
  hourStart: Date;
  hourEnd: Date;
  messages: ChatMessage[];
  photos: PhotoManifestEntry[];
}

// ─── DB helper ───────────────────────────────────────────────────────────────

async function q(text: string, params: any[] = []) {
  const r = await typedPool(text, params);
  return r.rows;
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function safeFormat(val: any, fmt: string, fallback = 'N/A'): string {
  if (!val) return fallback;
  try { return format(new Date(val), fmt); } catch { return fallback; }
}

function safeTime(val: any): string {
  return safeFormat(val, 'hh:mm a');
}

function safeFullDate(val: any): string {
  return safeFormat(val, 'MMMM dd, yyyy');
}

function safeDateTime(val: any): string {
  return safeFormat(val, 'MMM dd, yyyy hh:mm a');
}

// ─── Photo fetcher ───────────────────────────────────────────────────────────

async function fetchPhotoBuffer(url: string): Promise<Buffer | null> {
  if (!url) return null;
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      // SSRF guard: reject URLs targeting private/internal IP ranges (e.g., AWS metadata)
      try {
        await validateWebhookUrl(url);
      } catch {
        log.warn(`[DarPDF] Blocked SSRF attempt — photo URL rejected: ${url.slice(0, 80)}`);
        return null;
      }
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (!bucketId) return null;
    const storage = new Storage();
    const bucket = storage.bucket(bucketId);
    const objectPath = url.startsWith('/') ? url.slice(1) : url;
    const [buffer] = await bucket.file(objectPath).download();
    return buffer;
  } catch (err: any) {
    log.warn(`[DarPDF] Photo fetch skipped (${url.slice(0, 60)}): ${(err instanceof Error ? err.message : String(err))}`);
    return null;
  }
}

// ─── Color palette ───────────────────────────────────────────────────────────

const C = {
  navy:       '#1e3a5f',
  navyLight:  '#2a4f7c',
  blue:       '#2563eb',
  blueLight:  '#dbeafe',
  gray:       '#6b7280',
  grayLight:  '#f3f4f6',
  grayBorder: '#e5e7eb',
  dark:       '#111827',
  teal:       '#0d9488',
  tealLight:  '#ccfbf1',
  amber:      '#d97706',
  amberLight: '#fef3c7',
  red:        '#dc2626',
  white:      '#ffffff',
  gold:       '#b45309',
};

// ─── Rendering primitives ────────────────────────────────────────────────────

function hline(doc: PDFKit.PDFDocument, color = C.grayBorder, x1 = 50, x2 = 562) {
  doc.moveTo(x1, doc.y).lineTo(x2, doc.y).strokeColor(color).lineWidth(0.5).stroke();
  doc.lineWidth(1);
}

function thickLine(doc: PDFKit.PDFDocument, color = C.navy, x1 = 50, x2 = 562) {
  doc.moveTo(x1, doc.y).lineTo(x2, doc.y).strokeColor(color).lineWidth(2).stroke();
  doc.lineWidth(1);
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.4);
  hline(doc, C.navy);
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor(C.navy).font('Helvetica-Bold').text(title.toUpperCase(), { characterSpacing: 0.8 });
  doc.font('Helvetica');
  doc.moveDown(0.3);
}

function labelValue(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width = 220) {
  doc.fontSize(7.5).fillColor(C.gray).font('Helvetica').text(label.toUpperCase(), x, y, { width, characterSpacing: 0.3 });
  doc.fontSize(9.5).fillColor(C.dark).font('Helvetica-Bold').text(value || '—', x, y + 10, { width });
  doc.font('Helvetica');
}

function badge(doc: PDFKit.PDFDocument, text: string, x: number, y: number, bgColor: string, textColor: string) {
  const w = doc.widthOfString(text) + 12;
  const h = 14;
  doc.roundedRect(x, y, w, h, 3).fillColor(bgColor).fill();
  doc.fontSize(7).fillColor(textColor).font('Helvetica-Bold').text(text, x + 6, y + 3.5, { width: w });
  doc.font('Helvetica');
  return w;
}

function ensureSpace(doc: PDFKit.PDFDocument, neededHeight = 80) {
  if (doc.y > 792 - 50 - neededHeight) doc.addPage();
}

function footer(doc: PDFKit.PDFDocument, reportId: string, orgName: string, pageRange?: string) {
  const y = 745;
  hline(doc, C.grayBorder, 50, 562);
  doc.fontSize(6.5).fillColor(C.gray).font('Helvetica');
  doc.text(`CONFIDENTIAL — ${orgName.toUpperCase()} | Report ID: ${reportId.slice(0, 16).toUpperCase()} | Generated: ${format(new Date(), 'MMM dd, yyyy hh:mm a')}`, 50, y + 4, { width: 512, align: 'center' });
  if (pageRange) {
    doc.text(pageRange, 50, y + 14, { width: 512, align: 'center' });
  }
}

// ─── Cover Page ──────────────────────────────────────────────────────────────

function renderCoverPage(
  doc: PDFKit.PDFDocument,
  opts: {
    orgName: string;
    reportType: string;
    reportId: string;
    reportDate: string;
    shiftDate: string;
    shiftTime: string;
    siteName: string;
    clientName: string;
    officerNames: string[];
    supervisorName: string;
    status: string;
    trinityArticulated: boolean;
    messageCount?: number;
    photoCount?: number;
    patrolCount?: number;
    incidentsOccurred?: boolean;
  }
) {
  // Top color bar
  doc.rect(50, 50, 512, 6).fillColor(C.navy).fill();
  doc.moveDown(1.5);

  // Org name
  doc.fontSize(20).fillColor(C.navy).font('Helvetica-Bold').text(opts.orgName.toUpperCase(), { align: 'center', characterSpacing: 1.5 });
  doc.moveDown(0.3);

  // Report type
  doc.fontSize(14).fillColor(C.gray).font('Helvetica').text(opts.reportType, { align: 'center', characterSpacing: 0.5 });
  doc.moveDown(0.2);

  // Date
  doc.fontSize(10).fillColor(C.gray).text(opts.shiftDate, { align: 'center' });
  doc.moveDown(1.2);

  // Status + Trinity badges centered
  const badgeY = doc.y;
  const statusColor = opts.status === 'verified' ? C.teal : opts.status === 'sent_to_client' ? C.blue : opts.status === 'pending_review' ? C.amber : C.gray;
  const statusLabel = opts.status === 'verified' ? 'VERIFIED' : opts.status === 'sent_to_client' ? 'SENT TO CLIENT' : opts.status === 'pending_review' ? 'PENDING REVIEW' : opts.status.toUpperCase();
  const badgeWidth = doc.widthOfString(statusLabel) + 16;
  const centerX = 306 - badgeWidth / 2;
  doc.roundedRect(centerX, badgeY, badgeWidth, 18, 4).fillColor(statusColor).fill();
  doc.fontSize(8).fillColor(C.white).font('Helvetica-Bold').text(statusLabel, centerX + 4, badgeY + 5, { width: badgeWidth });

  if (opts.trinityArticulated) {
    const triText = 'TRINITY AI ENHANCED';
    const triWidth = doc.widthOfString(triText) + 16;
    const triX = 306 - triWidth / 2;
    doc.moveDown(0.8);
    doc.roundedRect(triX, doc.y, triWidth, 18, 4).fillColor(C.teal).fill();
    doc.fontSize(8).fillColor(C.white).font('Helvetica-Bold').text(triText, triX + 4, doc.y + 5, { width: triWidth });
  }
  doc.font('Helvetica');
  doc.moveDown(1.5);

  // Info grid — site / client / shift time
  const infoY = doc.y;
  doc.rect(50, infoY, 512, 76).fillColor(C.grayLight).fill();
  doc.rect(50, infoY, 512, 76).strokeColor(C.grayBorder).lineWidth(0.5).stroke();
  doc.lineWidth(1);

  labelValue(doc, 'Site / Location', opts.siteName, 62, infoY + 8);
  labelValue(doc, 'Client', opts.clientName, 306, infoY + 8);
  labelValue(doc, 'Shift', opts.shiftTime, 62, infoY + 44);
  labelValue(doc, 'Report ID', opts.reportId.slice(0, 16).toUpperCase(), 306, infoY + 44);
  doc.y = infoY + 84;
  doc.moveDown(0.5);

  // Officers and supervisor block
  const persY = doc.y;
  doc.rect(50, persY, 512, opts.officerNames.length > 1 ? 72 + (opts.officerNames.length - 1) * 14 : 72).fillColor(C.white).fill();
  hline(doc, C.navy, 50, 562);
  doc.moveDown(0.3);

  doc.fontSize(7.5).fillColor(C.gray).font('Helvetica').text('OFFICER(S) ON DUTY', 62, doc.y, { characterSpacing: 0.3 });
  doc.moveDown(0.2);
  opts.officerNames.forEach((name, idx) => {
    doc.fontSize(10).fillColor(C.dark).font('Helvetica-Bold').text(`${idx + 1}. ${name}`, 62, doc.y);
    doc.moveDown(0.2);
  });

  const supY = persY + 8;
  doc.fontSize(7.5).fillColor(C.gray).font('Helvetica').text('SUPERVISOR ON DUTY', 306, supY, { characterSpacing: 0.3 });
  doc.fontSize(10).fillColor(C.dark).font('Helvetica-Bold').text(opts.supervisorName || 'Not Assigned', 306, supY + 12);
  doc.font('Helvetica');
  doc.moveDown(1.2);

  hline(doc, C.navy, 50, 562);
  doc.moveDown(0.5);

  // Stats row
  const stats: Array<{ label: string; value: string; color: string }> = [];
  if (opts.messageCount !== undefined) stats.push({ label: 'Activity Entries', value: String(opts.messageCount), color: C.blue });
  if (opts.photoCount !== undefined) stats.push({ label: 'Photos Captured', value: String(opts.photoCount), color: C.teal });
  if (opts.patrolCount !== undefined) stats.push({ label: 'Patrol Rounds', value: String(opts.patrolCount), color: C.navy });
  if (opts.incidentsOccurred !== undefined) stats.push({ label: 'Incidents', value: opts.incidentsOccurred ? 'YES' : 'None', color: opts.incidentsOccurred ? C.red : C.gray });

  if (stats.length > 0) {
    const sw = 512 / stats.length;
    const sy = doc.y;
    stats.forEach((s, i) => {
      const sx = 50 + i * sw;
      doc.rect(sx + 2, sy, sw - 4, 52).fillColor(C.grayLight).fill();
      doc.rect(sx + 2, sy, sw - 4, 52).strokeColor(C.grayBorder).lineWidth(0.5).stroke();
      doc.lineWidth(1);
      doc.fontSize(18).fillColor(s.color).font('Helvetica-Bold').text(s.value, sx + 2, sy + 8, { width: sw - 4, align: 'center' });
      doc.fontSize(7.5).fillColor(C.gray).font('Helvetica').text(s.label.toUpperCase(), sx + 2, sy + 32, { width: sw - 4, align: 'center', characterSpacing: 0.3 });
    });
    doc.font('Helvetica');
    doc.y = sy + 58;
  }

  // Bottom accent bar
  doc.rect(50, 730, 512, 4).fillColor(C.navy).fill();
}

// ─── Hourly chronological grouping ──────────────────────────────────────────

function groupMessagesByHour(messages: ChatMessage[], photos: PhotoManifestEntry[]): HourBucket[] {
  if (messages.length === 0 && photos.length === 0) return [];

  // Determine time range
  const allTimes = [
    ...messages.map(m => new Date(m.created_at).getTime()),
    ...photos.map(p => new Date(p.timestamp).getTime()),
  ].filter(t => !isNaN(t));

  if (allTimes.length === 0) return [];

  const minTime = new Date(Math.min(...allTimes));
  const maxTime = new Date(Math.max(...allTimes));
  const startHour = startOfHour(minTime);

  const buckets: HourBucket[] = [];
  let cursor = startHour;

  while (cursor <= maxTime) {
    const next = addHours(cursor, 1);
    const hourMessages = messages.filter(m => {
      const t = new Date(m.created_at).getTime();
      return t >= cursor.getTime() && t < next.getTime();
    });
    const hourPhotos = photos.filter(p => {
      const t = new Date(p.timestamp).getTime();
      return t >= cursor.getTime() && t < next.getTime();
    });
    if (hourMessages.length > 0 || hourPhotos.length > 0) {
      buckets.push({
        hourLabel: `${format(cursor, 'hh:mm a')} – ${format(next, 'hh:mm a')}`,
        hourStart: cursor,
        hourEnd: next,
        messages: hourMessages,
        photos: hourPhotos,
      });
    }
    cursor = next;
  }

  return buckets;
}

// ─── Hourly activity log renderer ────────────────────────────────────────────

async function renderHourlyLog(
  doc: PDFKit.PDFDocument,
  buckets: HourBucket[],
  reportId: string,
  orgName: string
) {
  if (buckets.length === 0) return;

  sectionTitle(doc, 'CHRONOLOGICAL ACTIVITY LOG');
  doc.fontSize(8.5).fillColor(C.gray).text(`${buckets.length} hour-period(s) with recorded activity — all times in report timezone`, { width: 512 });
  doc.moveDown(0.5);

  for (const bucket of buckets) {
    ensureSpace(doc, 60);

    // Hour header bar
    doc.rect(50, doc.y, 512, 20).fillColor(C.navy).fill();
    doc.fontSize(9).fillColor(C.white).font('Helvetica-Bold')
      .text(bucket.hourLabel, 60, doc.y + 5, { width: 400 });
    const entryCount = bucket.messages.length + bucket.photos.length;
    doc.fontSize(8).fillColor(C.blueLight)
      .text(`${entryCount} entr${entryCount !== 1 ? 'ies' : 'y'}`, 420, doc.y + 6, { width: 130, align: 'right' });
    doc.font('Helvetica');
    doc.y += 24;

    // Text messages
    for (const msg of bucket.messages) {
      if (msg.message_type === 'photo' && !msg.content) continue; // photos handled separately
      ensureSpace(doc, 30);

      const timeStr = safeTime(msg.created_at);
      const gps = msg.metadata?.gps;
      const isPhoto = msg.message_type === 'photo' || !!msg.attachment_url;

      // Time pill
      doc.rect(50, doc.y, 56, 14).fillColor(C.blueLight).fill();
      doc.fontSize(7.5).fillColor(C.navyLight).font('Helvetica-Bold').text(timeStr, 52, doc.y + 3, { width: 52 });
      doc.font('Helvetica');

      // Type badge
      let tagX = 112;
      if (isPhoto) {
        tagX += badge(doc, 'PHOTO', tagX, doc.y, C.tealLight, C.teal) + 4;
      } else if (msg.message_type === 'report') {
        tagX += badge(doc, 'REPORT', tagX, doc.y, C.amberLight, C.amber) + 4;
      } else if (msg.message_type === 'incident') {
        tagX += badge(doc, 'INCIDENT', tagX, doc.y, '#fee2e2', C.red) + 4;
      }

      // Content
      if (msg.content) {
        const maxW = 562 - tagX - 4;
        doc.fontSize(9).fillColor(C.dark).text(msg.content, tagX, doc.y, { width: Math.max(maxW, 80) });
      }

      // GPS line
      if (gps?.lat && gps?.lng) {
        doc.moveDown(0.15);
        const gpsText = gps.address
          ? `GPS: ${gps.address} (${Number(gps.lat).toFixed(5)}, ${Number(gps.lng).toFixed(5)})`
          : `GPS: ${Number(gps.lat).toFixed(5)}, ${Number(gps.lng).toFixed(5)}`;
        doc.fontSize(7).fillColor(C.gray).text(gpsText, 60, doc.y, { width: 500 });
      }

      doc.moveDown(0.4);
    }

    // Photo thumbnails in this hour (summary line — full images in Photo Evidence)
    if (bucket.photos.length > 0) {
      ensureSpace(doc, 20);
      const photoLabel = bucket.photos.length === 1
        ? `1 photo captured this hour — see Photo Evidence section`
        : `${bucket.photos.length} photos captured this hour — see Photo Evidence section`;
      doc.rect(50, doc.y, 512, 16).fillColor(C.tealLight).fill();
      doc.fontSize(8).fillColor(C.teal).font('Helvetica-Bold').text(`  ${photoLabel}`, 52, doc.y + 4, { width: 508 });
      doc.font('Helvetica');
      doc.y += 20;
      doc.moveDown(0.1);
    }

    doc.moveDown(0.3);
  }
}

// ─── Photo evidence renderer ─────────────────────────────────────────────────

async function renderPhotoEvidence(doc: PDFKit.PDFDocument, photos: PhotoManifestEntry[]) {
  if (photos.length === 0) return;

  // Start photo evidence on a new page
  doc.addPage();
  sectionTitle(doc, 'PHOTO EVIDENCE');
  doc.fontSize(9).fillColor(C.gray).text(
    `${photos.length} photo(s) captured during shift — in chronological order. Each photo includes timestamp, GPS coordinates, and address where available.`,
    { width: 512 }
  );
  doc.moveDown(0.6);

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    ensureSpace(doc, 220);

    const photoTime = safeDateTime(photo.timestamp);
    const photoTimeShort = safeTime(photo.timestamp);

    // Photo header bar
    const headerY = doc.y;
    doc.rect(50, headerY, 512, 24).fillColor(C.navy).fill();
    doc.fontSize(9.5).fillColor(C.white).font('Helvetica-Bold')
      .text(`Photo ${i + 1} of ${photos.length}`, 60, headerY + 7, { width: 200 });
    doc.fontSize(8.5).fillColor(C.blueLight).font('Helvetica')
      .text(photoTimeShort, 420, headerY + 8, { width: 130, align: 'right' });
    doc.y = headerY + 28;

    // Metadata row
    const metaY = doc.y;
    doc.rect(50, metaY, 512, 42).fillColor(C.grayLight).fill();
    doc.rect(50, metaY, 512, 42).strokeColor(C.grayBorder).lineWidth(0.5).stroke();
    doc.lineWidth(1);

    doc.fontSize(7.5).fillColor(C.gray).font('Helvetica').text('CAPTURED BY', 62, metaY + 5, { characterSpacing: 0.3 });
    doc.fontSize(9).fillColor(C.dark).font('Helvetica-Bold').text(photo.uploaderName || 'Officer', 62, metaY + 16);

    doc.fontSize(7.5).fillColor(C.gray).font('Helvetica').text('TIMESTAMP', 240, metaY + 5, { characterSpacing: 0.3 });
    doc.fontSize(9).fillColor(C.dark).font('Helvetica-Bold').text(photoTime, 240, metaY + 16);

    // GPS coordinates
    if (photo.gpsLat && photo.gpsLng) {
      doc.fontSize(7.5).fillColor(C.gray).font('Helvetica').text('GPS COORDINATES', 62, metaY + 29, { characterSpacing: 0.3 });
      const coordText = `${Number(photo.gpsLat).toFixed(6)}, ${Number(photo.gpsLng).toFixed(6)}`;
      doc.fontSize(8.5).fillColor(C.teal).font('Helvetica-Bold').text(coordText, 62, metaY + 38, { characterSpacing: 0.1 });
    }
    if (photo.gpsAddress) {
      const addrX = photo.gpsLat ? 240 : 62;
      doc.fontSize(7.5).fillColor(C.gray).font('Helvetica').text('LOCATION ADDRESS', addrX, metaY + 29, { characterSpacing: 0.3 });
      doc.fontSize(8.5).fillColor(C.dark).font('Helvetica-Bold').text(photo.gpsAddress, addrX, metaY + 38, { width: 350 });
    }
    if (!photo.gpsLat && !photo.gpsAddress) {
      doc.fontSize(7.5).fillColor(C.gray).font('Helvetica').text('GPS: Not available for this photo', 62, metaY + 33);
    }

    doc.font('Helvetica');
    doc.y = metaY + 48;

    // Caption
    if (photo.caption) {
      doc.moveDown(0.2);
      doc.fontSize(9).fillColor(C.dark).text(`"${photo.caption}"`, 62, doc.y, { width: 490, oblique: true } as any);
      doc.moveDown(0.3);
    }

    // Photo image
    if (photo.url) {
      try {
        const buffer = await fetchPhotoBuffer(photo.url);
        if (buffer) {
          const imgY = doc.y;
          const maxW = 480;
          const maxH = 320;
          doc.image(buffer, 62, imgY, { fit: [maxW, maxH], align: 'center' });
          doc.y = imgY + maxH + 8;

          // Timestamp + GPS watermark line under photo
          const stampParts = [`TIMESTAMP: ${photoTime}`];
          if (photo.gpsLat && photo.gpsLng) stampParts.push(`GPS: ${Number(photo.gpsLat).toFixed(5)}, ${Number(photo.gpsLng).toFixed(5)}`);
          if (photo.gpsAddress) stampParts.push(`ADDRESS: ${photo.gpsAddress}`);
          doc.fontSize(7).fillColor(C.gray).text(stampParts.join('  |  '), 62, doc.y, { width: 480 });
          doc.moveDown(0.4);
        } else {
          doc.rect(62, doc.y, 480, 60).fillColor(C.grayLight).fill();
          doc.fontSize(9).fillColor(C.gray).text('[Image could not be loaded — file reference preserved]', 62, doc.y + 20, { width: 480, align: 'center' });
          doc.y += 68;
          doc.moveDown(0.3);
        }
      } catch {
        doc.rect(62, doc.y, 480, 60).fillColor(C.grayLight).fill();
        doc.fontSize(9).fillColor(C.gray).text('[Image unavailable]', 62, doc.y + 20, { width: 480, align: 'center' });
        doc.y += 68;
        doc.moveDown(0.3);
      }
    } else {
      doc.rect(62, doc.y, 480, 40).fillColor(C.grayLight).fill();
      doc.fontSize(9).fillColor(C.gray).text('[No image data stored for this entry]', 62, doc.y + 12, { width: 480, align: 'center' });
      doc.y += 48;
      doc.moveDown(0.3);
    }

    hline(doc, C.grayBorder);
    doc.moveDown(0.4);
  }
}

// ─── Visitor table ───────────────────────────────────────────────────────────

function renderVisitorTable(doc: PDFKit.PDFDocument, visitors: VisitorRecord[]) {
  if (visitors.length === 0) return;
  ensureSpace(doc, 80);
  sectionTitle(doc, 'VISITOR LOG');

  const headers = ['Visitor Name', 'Company', 'Purpose', 'Vehicle', 'Check In', 'Check Out'];
  const widths = [105, 85, 100, 65, 68, 68];
  const tableX = 50;
  const headerH = 18;
  const rowH = 16;

  // Header row
  const headerY = doc.y;
  doc.rect(tableX, headerY, 512, headerH).fillColor(C.navy).fill();
  let xPos = tableX + 4;
  headers.forEach((h, i) => {
    doc.fontSize(7.5).fillColor(C.white).font('Helvetica-Bold').text(h, xPos, headerY + 5, { width: widths[i], characterSpacing: 0.2 });
    xPos += widths[i] + 2;
  });
  doc.font('Helvetica');
  doc.y = headerY + headerH;

  visitors.forEach((v, idx) => {
    ensureSpace(doc, rowH + 4);
    const rowY = doc.y;
    const bg = idx % 2 === 0 ? C.white : C.grayLight;
    doc.rect(tableX, rowY, 512, rowH).fillColor(bg).fill();
    doc.rect(tableX, rowY, 512, rowH).strokeColor(C.grayBorder).lineWidth(0.3).stroke();
    doc.lineWidth(1);

    xPos = tableX + 4;
    const vals = [
      v.visitor_name || '—',
      v.visitor_company || '—',
      v.purpose || '—',
      v.vehicle_plate || '—',
      v.checked_in_at ? safeTime(v.checked_in_at) : '—',
      v.checked_out_at ? safeTime(v.checked_out_at) : 'STILL IN',
    ];
    vals.forEach((val, i) => {
      doc.fontSize(8).fillColor(C.dark).text(val, xPos, rowY + 4, { width: widths[i] - 2 });
      xPos += widths[i] + 2;
    });
    doc.y = rowY + rowH;
  });
  doc.moveDown(0.5);
}

// ─── Signature block ─────────────────────────────────────────────────────────

function renderSignatureBlock(doc: PDFKit.PDFDocument, officerName: string, supervisorName: string) {
  ensureSpace(doc, 110);
  sectionTitle(doc, 'SIGNATURES');
  doc.moveDown(0.5);

  const sigY = doc.y;
  doc.rect(50, sigY, 240, 80).fillColor(C.grayLight).fill();
  doc.rect(50, sigY, 240, 80).strokeColor(C.grayBorder).lineWidth(0.5).stroke();
  doc.rect(322, sigY, 240, 80).fillColor(C.grayLight).fill();
  doc.rect(322, sigY, 240, 80).strokeColor(C.grayBorder).lineWidth(0.5).stroke();
  doc.lineWidth(1);

  doc.fontSize(7.5).fillColor(C.gray).font('Helvetica').text('OFFICER SIGNATURE', 60, sigY + 8, { characterSpacing: 0.3 });
  doc.moveTo(60, sigY + 50).lineTo(280, sigY + 50).strokeColor('#9ca3af').lineWidth(0.7).stroke();
  doc.lineWidth(1);
  doc.fontSize(9).fillColor(C.dark).font('Helvetica-Bold').text(officerName, 60, sigY + 56);

  doc.fontSize(7.5).fillColor(C.gray).font('Helvetica').text('SUPERVISOR SIGNATURE', 332, sigY + 8, { characterSpacing: 0.3 });
  doc.moveTo(332, sigY + 50).lineTo(552, sigY + 50).strokeColor('#9ca3af').lineWidth(0.7).stroke();
  doc.lineWidth(1);
  doc.fontSize(9).fillColor(C.dark).font('Helvetica-Bold').text(supervisorName || 'Not Assigned', 332, sigY + 56);
  doc.font('Helvetica');

  doc.y = sigY + 88;
}

// ─── Upload to object storage ────────────────────────────────────────────────

async function uploadPdfBuffer(buffer: Buffer, darId: string, workspaceId: string, prefix: string): Promise<string | null> {
  try {
    const { uploadFileToObjectStorage } = await import('../objectStorage');
    const fileName = `${prefix}-${Date.now()}.pdf`;
    const objectPath = `.private/dars/${workspaceId}/${fileName}`;
    await uploadFileToObjectStorage({
      objectPath,
      buffer,
      metadata: { contentType: 'application/pdf', metadata: { darId } },
    });
    // Record storage usage — DAR PDFs are documents category; system-generated so never blocked
    const { recordStorageUsage } = await import('./storage/storageQuotaService');
    recordStorageUsage(workspaceId, 'documents', buffer.length).catch(() => null);
    return objectPath;
  } catch (uploadErr: any) {
    log.error('[DarPDF] Object storage upload failed:', uploadErr.message);
    return null;
  }
}

// ─── Resolve supervisor ───────────────────────────────────────────────────────

async function resolveSupervisor(workspaceId: string, shiftId?: string | null): Promise<string> {
  try {
    const rows = await q(
      `SELECT u.first_name, u.last_name FROM workspace_members wm JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id=$1 AND wm.role IN ('org_owner','co_owner','manager','supervisor') ORDER BY wm.created_at ASC LIMIT 1`,
      [workspaceId]
    );
    if (rows.length) {
      const r = rows[0] as any;
      return `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'On-Duty Supervisor';
    }
  } catch (err) { 
    log.error('[DarPDF] resolveSupervisor failed:', err);
  }
  return 'On-Duty Supervisor';
}

// ─── Resolve client name ──────────────────────────────────────────────────────

async function resolveClientName(workspaceId: string, clientId?: string | null, siteId?: string | null): Promise<string> {
  try {
    if (clientId) {
      const rows = await q(`SELECT COALESCE(company_name, first_name || ' ' || last_name, 'Client') AS name FROM clients WHERE id=$1 AND workspace_id=$2`, [clientId, workspaceId]);
      if (rows.length) return (rows[0] as any).name;
    }
    if (siteId) {
      const rows = await q(`SELECT client_id FROM sites WHERE id=$1 AND workspace_id=$2`, [siteId, workspaceId]);
      const cid = (rows[0] as any)?.client_id;
      if (cid) {
        const crows = await q(`SELECT COALESCE(company_name, first_name || ' ' || last_name, 'Client') AS name FROM clients WHERE id=$1`, [cid]);
        if (crows.length) return (crows[0] as any).name;
      }
    }
  } catch (err) {
    log.error('[DarPDF] resolveClientName failed:', err);
  }
  return 'Client';
}

// ─── Main: generateDarPdf ─────────────────────────────────────────────────────

export async function generateDarPdf(darId: string, workspaceId: string): Promise<string | null> {
  const darRows = await q(`SELECT * FROM daily_activity_reports WHERE id=$1 AND workspace_id=$2`, [darId, workspaceId]);
  if (!darRows.length) return null;
  const dar = darRows[0] as unknown as DarData;

  const wsRows = await q(`SELECT name FROM workspaces WHERE id=$1`, [workspaceId]);
  const orgName = (wsRows[0] as any)?.name || 'Security Organization';

  const clientName = await resolveClientName(workspaceId, null, dar.site_id);
  const supervisorName = await resolveSupervisor(workspaceId, (dar as any).shift_id);

  // Build officer list (could be multiple co-assigned but DAR typically single)
  const officerNames = dar.employee_name ? [dar.employee_name] : ['On-Duty Officer'];

  let visitors: VisitorRecord[] = [];
  if (dar.site_id && dar.shift_date) {
    try {
      const sd = new Date(dar.shift_date);
      const dayStart = new Date(sd); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(sd); dayEnd.setHours(23, 59, 59, 999);
      visitors = (await q(
        `SELECT * FROM visitor_logs WHERE workspace_id=$1 AND site_id=$2 AND checked_in_at >= $3 AND checked_in_at <= $4 ORDER BY checked_in_at ASC`,
        [workspaceId, dar.site_id, dayStart.toISOString(), dayEnd.toISOString()]
      )) as unknown as VisitorRecord[];
    } catch (err) {
      log.error('[DarPDF] visitors fetch failed:', err);
    }
  }

  // Build pseudo chat-style messages from the activity summary for hourly grouping
  // DAR doesn't have chatroom messages, so we turn the summary into one entry
  const pseudoMessages: ChatMessage[] = [];
  if (dar.activity_summary) {
    const shiftTime = dar.shift_start ? new Date(dar.shift_start) : (dar.shift_date ? new Date(dar.shift_date) : new Date());
    pseudoMessages.push({
      id: dar.id,
      content: dar.activity_summary,
      message_type: 'report',
      attachment_url: null,
      attachment_type: null,
      created_at: shiftTime.toISOString(),
      user_id: dar.employee_id || '',
      metadata: {},
    });
  }

  const hourlyBuckets = groupMessagesByHour(pseudoMessages, []);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 50, bottom: 70, left: 50, right: 50 },
      info: { Title: `DAR ${dar.report_number}`, Author: orgName, Subject: 'Daily Activity Report' },
      autoFirstPage: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', async () => {
      const pdfBuffer = Buffer.concat(chunks);
      const result = await uploadPdfBuffer(pdfBuffer, darId, workspaceId, `dar-${dar.report_number}`);
      resolve(result);
    });
    doc.on('error', reject);

    (async () => {
      try {
        const shiftTimeLabel =
          dar.shift_start && dar.shift_end
            ? `${safeTime(dar.shift_start)} – ${safeTime(dar.shift_end)}`
            : dar.shift_start
            ? `Starting ${safeTime(dar.shift_start)}`
            : 'All Day';

        renderCoverPage(doc, {
          orgName,
          reportType: 'DAILY ACTIVITY REPORT',
          reportId: dar.report_number || dar.id,
          reportDate: dar.created_at,
          shiftDate: dar.shift_date ? safeFullDate(dar.shift_date) : safeFullDate(dar.created_at),
          shiftTime: shiftTimeLabel,
          siteName: dar.site_name || 'On-Site Location',
          clientName,
          officerNames,
          supervisorName,
          status: dar.status || 'submitted',
          trinityArticulated: !!dar.trinity_articulated,
          patrolCount: dar.patrol_rounds_completed,
          incidentsOccurred: dar.incidents_occurred,
        });

        footer(doc, dar.id, orgName);

        doc.addPage();

        // Officer / shift info recap
        sectionTitle(doc, 'SHIFT INFORMATION');
        const infoY = doc.y;
        labelValue(doc, 'Officer on Duty', dar.employee_name || '—', 50, infoY);
        labelValue(doc, 'Supervisor on Duty', supervisorName, 306, infoY);
        doc.y = infoY + 32;
        const infoY2 = doc.y;
        labelValue(doc, 'Site / Location', dar.site_name || '—', 50, infoY2);
        labelValue(doc, 'Client', clientName, 306, infoY2);
        doc.y = infoY2 + 32;
        const infoY3 = doc.y;
        labelValue(doc, 'Shift Date', dar.shift_date ? safeFullDate(dar.shift_date) : '—', 50, infoY3);
        labelValue(doc, 'Shift Hours', shiftTimeLabel, 306, infoY3);
        doc.y = infoY3 + 32;
        const infoY4 = doc.y;
        labelValue(doc, 'Patrol Rounds', String(dar.patrol_rounds_completed || 0), 50, infoY4);
        labelValue(doc, 'Incidents Occurred', dar.incidents_occurred ? 'YES — See activity log' : 'None reported', 306, infoY4);
        doc.y = infoY4 + 32;

        if (dar.weather_conditions) {
          labelValue(doc, 'Weather Conditions', dar.weather_conditions, 50, doc.y);
          doc.y += 32;
        }

        // Executive / Trinity summary
        if (dar.ai_summary || (dar.trinity_articulated && dar.activity_summary)) {
          sectionTitle(doc, dar.trinity_articulated ? 'TRINITY AI EXECUTIVE SUMMARY' : 'EXECUTIVE SUMMARY');
          const summaryText = dar.ai_summary || dar.activity_summary;
          if (dar.trinity_articulated) {
            doc.rect(50, doc.y, 512, 14).fillColor(C.tealLight).fill();
            doc.fontSize(7.5).fillColor(C.teal).font('Helvetica-Bold').text('  TRINITY AI ENHANCED — Professionally articulated by Trinity AI System', 52, doc.y + 3, { width: 508 });
            doc.font('Helvetica');
            doc.y += 18;
          }
          doc.fontSize(10).fillColor(C.dark).text(summaryText, { width: 512 });
          doc.moveDown(0.5);
        }

        // Chronological activity log
        if (hourlyBuckets.length > 0) {
          await renderHourlyLog(doc, hourlyBuckets, dar.id, orgName);
        } else {
          sectionTitle(doc, 'ACTIVITY LOG');
          doc.fontSize(10).fillColor(C.dark).text(dar.activity_summary || 'No activity recorded.', { width: 512 });
          doc.moveDown(0.5);
        }

        if (dar.post_orders_notes) {
          sectionTitle(doc, 'POST ORDERS NOTES');
          doc.fontSize(10).fillColor(C.dark).text(dar.post_orders_notes, { width: 512 });
          doc.moveDown(0.5);
        }
        if (dar.equipment_notes) {
          sectionTitle(doc, 'EQUIPMENT NOTES');
          doc.fontSize(10).fillColor(C.dark).text(dar.equipment_notes, { width: 512 });
          doc.moveDown(0.5);
        }

        renderVisitorTable(doc, visitors);
        renderSignatureBlock(doc, dar.employee_name || 'Officer', supervisorName);
        footer(doc, dar.id, orgName);
        doc.end();
      } catch (err) {
        reject(err);
      }
    })();
  });
}

// ─── Main: generateShiftTransparencyPdf ──────────────────────────────────────

export async function generateShiftTransparencyPdf(darId: string, workspaceId: string): Promise<string | null> {
  const darRows = await q(`SELECT * FROM dar_reports WHERE id=$1 AND workspace_id=$2`, [darId, workspaceId]);
  if (!darRows.length) return null;
  const dar = darRows[0] as unknown as ShiftDarData;

  const wsRows = await q(`SELECT name FROM workspaces WHERE id=$1`, [workspaceId]);
  const orgName = (wsRows[0] as any)?.name || 'Security Organization';

  const clientName = await resolveClientName(workspaceId, dar.client_id, null);
  const supervisorName = await resolveSupervisor(workspaceId, dar.shift_id);

  // Resolve site name from shift
  let siteName = 'Assigned Location';
  if (dar.shift_id) {
    try {
      const shiftRows = await q(`SELECT s.name AS site_name FROM shifts sh LEFT JOIN sites s ON s.id = sh.site_id WHERE sh.id=$1`, [dar.shift_id]);
      if (shiftRows.length && (shiftRows[0] as any).site_name) siteName = (shiftRows[0] as any).site_name;
    } catch (err) {
      log.error('[DarPDF] siteName fetch failed:', err);
    }
  }

  // Fetch all chatroom messages with GPS metadata
  let chatMessages: ChatMessage[] = [];
  if (dar.chatroom_id) {
    const msgRows = await q(
      `SELECT id, content, message_type, attachment_url, attachment_type, attachment_size, created_at, user_id, metadata
       FROM shift_chatroom_messages
       WHERE chatroom_id=$1 AND message_type != 'system'
       ORDER BY created_at ASC`,
      [dar.chatroom_id]
    );
    chatMessages = msgRows as unknown as ChatMessage[];
  }

  // Build photo manifest — prefer stored manifest, supplement with chatroom messages
  let photos: PhotoManifestEntry[] = [];
  if (dar.photo_manifest && Array.isArray(dar.photo_manifest) && dar.photo_manifest.length > 0) {
    photos = dar.photo_manifest;
  } else if (dar.chatroom_id) {
    const photoRows = await q(
      `SELECT id, content, message_type, attachment_url, attachment_type, attachment_size, created_at, user_id, metadata
       FROM shift_chatroom_messages
       WHERE chatroom_id=$1 AND (message_type='photo' OR attachment_url IS NOT NULL)
       ORDER BY created_at ASC`,
      [dar.chatroom_id]
    );
    photos = photoRows.map((r: any) => {
      const gps = r.metadata?.gps;
      return {
        timestamp: new Date(r.created_at).toISOString(),
        url: r.attachment_url || null,
        caption: r.content || 'Photo captured during shift',
        messageId: r.id,
        uploaderName: dar.employee_name || 'Officer',
        attachmentType: r.attachment_type || 'image/jpeg',
        attachmentSize: r.attachment_size || 0,
        gpsLat: gps?.lat ?? null,
        gpsLng: gps?.lng ?? null,
        gpsAddress: gps?.address ?? null,
        gpsAccuracy: gps?.accuracy ?? null,
      };
    });
  }

  // Enrich manifest entries with GPS from message metadata where not already present
  const messageMetaMap: Record<string, any> = {};
  chatMessages.forEach(m => { if (m.id) messageMetaMap[m.id] = m.metadata; });
  photos = photos.map(p => {
    if (p.messageId && messageMetaMap[p.messageId] && !p.gpsLat) {
      const gps = messageMetaMap[p.messageId]?.gps;
      if (gps) {
        return { ...p, gpsLat: gps.lat, gpsLng: gps.lng, gpsAddress: gps.address, gpsAccuracy: gps.accuracy };
      }
    }
    return p;
  });

  // Sort photos chronologically
  photos.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Non-photo chat messages
  const textMessages = chatMessages.filter(m => m.message_type !== 'photo' || m.content);

  const hourlyBuckets = groupMessagesByHour(textMessages, photos);

  // Visitors
  let visitors: VisitorRecord[] = [];
  if (dar.shift_start_time) {
    try {
      let siteIdForLookup: string | null = null;
      if (dar.shift_id) {
        const sRows = await q(`SELECT site_id FROM shifts WHERE id=$1`, [dar.shift_id]);
        siteIdForLookup = (sRows[0] as any)?.site_id || null;
      }
      const shiftStart = new Date(dar.shift_start_time);
      const dayStart = new Date(shiftStart); dayStart.setHours(0, 0, 0, 0);
      const shiftEnd = dar.shift_end_time ? new Date(dar.shift_end_time) : addHours(shiftStart, 12);
      const dayEnd = new Date(shiftEnd); dayEnd.setHours(23, 59, 59, 999);
      if (siteIdForLookup) {
        visitors = (await q(
          `SELECT * FROM visitor_logs WHERE workspace_id=$1 AND site_id=$2 AND checked_in_at >= $3 AND checked_in_at <= $4 ORDER BY checked_in_at ASC`,
          [workspaceId, siteIdForLookup, dayStart.toISOString(), dayEnd.toISOString()]
        )) as unknown as VisitorRecord[];
      }
    } catch (err) {
      log.error('[DarPDF] transparency visitors fetch failed:', err);
    }
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 50, bottom: 70, left: 50, right: 50 },
      info: { Title: `Shift Transparency Report`, Author: orgName, Subject: 'Shift Transparency Report — Client Copy' },
      autoFirstPage: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', async () => {
      const pdfBuffer = Buffer.concat(chunks);
      const result = await uploadPdfBuffer(pdfBuffer, darId, workspaceId, `shift-report-${dar.shift_id || darId}`);
      resolve(result);
    });
    doc.on('error', reject);

    (async () => {
      try {
        const shiftDate = dar.shift_start_time
          ? safeFullDate(dar.shift_start_time)
          : safeFullDate((dar as any).created_at ?? new Date());

        const shiftTimeLabel =
          dar.shift_start_time && dar.shift_end_time
            ? `${safeTime(dar.shift_start_time)} – ${safeTime(dar.shift_end_time)}`
            : dar.shift_start_time
            ? `Starting ${safeTime(dar.shift_start_time)}`
            : 'Full Shift';

        const clockLabel =
          dar.actual_clock_in
            ? `Clock In: ${safeTime(dar.actual_clock_in)}${dar.actual_clock_out ? `  •  Clock Out: ${safeTime(dar.actual_clock_out)}` : ''}`
            : shiftTimeLabel;

        renderCoverPage(doc, {
          orgName,
          reportType: 'SHIFT TRANSPARENCY REPORT',
          reportId: dar.id,
          reportDate: (dar as any).created_at ?? '',
          shiftDate,
          shiftTime: clockLabel,
          siteName,
          clientName,
          officerNames: dar.employee_name ? [dar.employee_name] : ['On-Duty Officer'],
          supervisorName,
          status: dar.status || 'draft',
          trinityArticulated: !!dar.trinity_articulated,
          messageCount: chatMessages.length,
          photoCount: photos.length,
        });

        footer(doc, dar.id, orgName);
        doc.addPage();

        // Shift info recap
        sectionTitle(doc, 'SHIFT DETAILS');
        const iy = doc.y;
        labelValue(doc, 'Officer on Duty', dar.employee_name || '—', 50, iy);
        labelValue(doc, 'Supervisor on Duty', supervisorName, 306, iy);
        doc.y = iy + 32;
        const iy2 = doc.y;
        labelValue(doc, 'Site / Location', siteName, 50, iy2);
        labelValue(doc, 'Client', clientName, 306, iy2);
        doc.y = iy2 + 32;
        const iy3 = doc.y;
        labelValue(doc, 'Scheduled Start', safeDateTime(dar.shift_start_time), 50, iy3);
        labelValue(doc, 'Scheduled End', dar.shift_end_time ? safeDateTime(dar.shift_end_time) : '—', 306, iy3);
        doc.y = iy3 + 32;
        const iy4 = doc.y;
        labelValue(doc, 'Actual Clock In', dar.actual_clock_in ? safeDateTime(dar.actual_clock_in) : 'Not recorded', 50, iy4);
        labelValue(doc, 'Actual Clock Out', dar.actual_clock_out ? safeDateTime(dar.actual_clock_out) : 'Not recorded', 306, iy4);
        doc.y = iy4 + 32;

        if (dar.summary) {
          sectionTitle(doc, dar.trinity_articulated ? 'TRINITY AI SHIFT SUMMARY' : 'SHIFT SUMMARY');
          if (dar.trinity_articulated) {
            doc.rect(50, doc.y, 512, 14).fillColor(C.tealLight).fill();
            doc.fontSize(7.5).fillColor(C.teal).font('Helvetica-Bold')
              .text('  TRINITY AI ENHANCED — Professionally articulated by Trinity AI System', 52, doc.y + 3, { width: 508 });
            doc.font('Helvetica');
            doc.y += 18;
          }
          doc.fontSize(10).fillColor(C.dark).text(dar.summary, { width: 512 });
          doc.moveDown(0.5);
        }

        // Hourly chronological activity log
        await renderHourlyLog(doc, hourlyBuckets, dar.id, orgName);

        // Visitor log
        renderVisitorTable(doc, visitors);

        // Signature block
        renderSignatureBlock(doc, dar.employee_name || 'Officer', supervisorName);
        footer(doc, dar.id, orgName);

        // Photo evidence — full images with GPS on new pages
        if (photos.length > 0) {
          await renderPhotoEvidence(doc, photos);
          footer(doc, dar.id, orgName);
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    })();
  });
}
