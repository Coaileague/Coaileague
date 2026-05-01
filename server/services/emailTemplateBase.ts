/**
 * EMAIL TEMPLATE BASE — CoAIleague Design System
 * ─────────────────────────────────────────────────────────────────────────────
 * Brand-consistent layout primitives for all outgoing emails.
 * Email-client safe: table-based layout, inline styles, no external JS/fonts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const B = {
  primary:      '#2563EB',
  primaryDark:  '#1e40af',
  purple:       '#7c3aed',
  purpleDark:   '#5b21b6',
  success:      '#16a34a',
  successLight: '#dcfce7',
  successBorder:'#86efac',
  warning:      '#d97706',
  warningLight: '#fef3c7',
  warningBorder:'#fcd34d',
  danger:       '#dc2626',
  dangerLight:  '#fef2f2',
  dangerBorder: '#fca5a5',
  infoLight:    '#eff6ff',
  infoBorder:   '#bfdbfe',
  purpleLight:  '#f5f3ff',
  purpleBorder: '#c4b5fd',
  textPrimary:  '#0f172a',
  textBody:     '#334155',
  textMuted:    '#64748b',
  textLight:    '#94a3b8',
  bg:           '#f0f4f8',
  bgCard:       '#ffffff',
  bgCardSoft:   '#f8faff',
  border:       '#e2e8f0',
  footerBg:     '#0f172a',
  footerText:   '#94a3b8',
} as const;

const HEADER_GRADIENTS: Record<string, string> = {
  blue:   'linear-gradient(135deg,#0f172a 0%,#1e3a5f 55%,#1a237e 100%)',
  green:  'linear-gradient(135deg,#052e16 0%,#14532d 55%,#0f172a 100%)',
  orange: 'linear-gradient(135deg,#431407 0%,#7c2d12 55%,#0f172a 100%)',
  red:    'linear-gradient(135deg,#450a0a 0%,#7f1d1d 55%,#0f172a 100%)',
  purple: 'linear-gradient(135deg,#2e1065 0%,#4c1d95 55%,#0f172a 100%)',
  dark:   'linear-gradient(135deg,#0f172a 0%,#1e293b 55%,#0f172a 100%)',
};

const HEADER_ACCENT: Record<string, string> = {
  blue:   'linear-gradient(90deg,#2563EB,#7c3aed,#2563EB)',
  green:  'linear-gradient(90deg,#16a34a,#0d9488,#16a34a)',
  orange: 'linear-gradient(90deg,#ea580c,#d97706,#ea580c)',
  red:    'linear-gradient(90deg,#dc2626,#db2777,#dc2626)',
  purple: 'linear-gradient(90deg,#7c3aed,#2563EB,#7c3aed)',
  dark:   'linear-gradient(90deg,#2563EB,#7c3aed,#2563EB)',
};

export function logoMark(size: 'sm' | 'md' = 'sm'): string {
  const icon = size === 'sm' ? 18 : 22;
  const textSz = size === 'sm' ? 16 : 20;
  const subSz = size === 'sm' ? 10 : 12;
  const box = icon + 10;
  return `<table border="0" cellpadding="0" cellspacing="0" style="display:inline-table;"><tr>` +
    `<td valign="middle" style="padding-right:9px;"><div style="width:${box}px;height:${box}px;background:rgba(255,255,255,0.15);border-radius:7px;border:1px solid rgba(255,255,255,0.22);text-align:center;line-height:${box}px;"><span style="font-size:${icon - 4}px;color:#fff;">&#9670;</span></div></td>` +
    `<td valign="middle"><div style="font-size:${textSz}px;font-weight:800;color:#fff;letter-spacing:-0.5px;line-height:1.2;">CoAI<span style="color:#93c5fd;">league</span></div>` +
    `<div style="font-size:${subSz}px;color:rgba(255,255,255,0.5);letter-spacing:1.5px;text-transform:uppercase;margin-top:1px;">Workforce Intelligence</div></td>` +
    `</tr></table>`;
}

export function emailHeader(params: {
  title: string;
  subtitle?: string;
  badge?: string;
  theme?: string;
}): string {
  const th = params.theme ?? 'blue';
  return `<table width="100%" border="0" cellspacing="0" cellpadding="0"><tr>` +
    `<td style="background:${HEADER_GRADIENTS[th] ?? HEADER_GRADIENTS.blue};border-radius:12px 12px 0 0;">` +
    `<table width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td class="cl-px" style="padding:22px 32px 16px;">${logoMark('sm')}</td></tr></table>` +
    `<div class="cl-rule" style="height:1px;background:rgba(255,255,255,0.1);margin:0 32px;"></div>` +
    `<table width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td class="cl-px-y" style="padding:24px 32px 32px;" align="center">` +
    (params.badge ? `<div style="display:inline-block;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.22);color:rgba(255,255,255,0.85);font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;padding:5px 14px;border-radius:20px;margin-bottom:14px;">${params.badge}</div><br>` : '') +
    `<h1 class="cl-h1" style="margin:0;color:#fff;font-size:25px;font-weight:700;line-height:1.3;letter-spacing:-0.4px;">${params.title}</h1>` +
    (params.subtitle ? `<p class="cl-sub" style="margin:9px 0 0;color:rgba(255,255,255,0.6);font-size:14px;line-height:1.5;">${params.subtitle}</p>` : '') +
    `</td></tr></table>` +
    `<div style="height:3px;background:${HEADER_ACCENT[th] ?? HEADER_ACCENT.blue};"></div>` +
    `</td></tr></table>`;
}

export function emailBody(content: string): string {
  return `<table width="100%" border="0" cellspacing="0" cellpadding="0"><tr>` +
    `<td class="cl-body" style="background-color:${B.bgCard};padding:36px 32px 28px;border-left:1px solid ${B.border};border-right:1px solid ${B.border};">` +
    content + `</td></tr></table>`;
}

export function emailFooter(params?: { workspaceName?: string; note?: string }): string {
  const year = new Date().getFullYear();
  const note = params?.note ?? `This is an automated message from CoAIleague${params?.workspaceName ? ' / ' + params.workspaceName : ''}.`;
  return `<table width="100%" border="0" cellspacing="0" cellpadding="0"><tr>` +
    `<td class="cl-px-y" style="background-color:${B.footerBg};border-radius:0 0 12px 12px;padding:24px 32px 20px;border-top:3px solid #1e293b;">` +
    `<table width="100%" border="0" cellspacing="0" cellpadding="0">` +
    `<tr><td style="padding-bottom:14px;" align="center">${logoMark('sm')}</td></tr>` +
    `<tr><td style="padding-bottom:10px;text-align:center;"><p style="margin:0;font-size:12px;color:${B.footerText};line-height:1.6;">${note}</p></td></tr>` +
    `<tr><td style="text-align:center;border-top:1px solid #1e293b;padding-top:10px;"><p style="margin:0;font-size:11px;color:#334155;">&copy; ${year} CoAIleague &bull; AI-Powered Workforce Intelligence</p></td></tr>` +
    `</table></td></tr></table>`;
}

/**
 * Mobile media-query block injected into every layout. Targets the cl-* classes
 * on the layout primitives so phone clients (Apple Mail, Gmail iOS/Android, most
 * webmail) collapse the 32px gutter to 16px, scale headings, stack the
 * label/value columns of infoCard rows, and let CTA buttons fill the row.
 *
 * Inline styles remain in place so clients that strip <style> (some Outlook
 * desktop builds) still render acceptably; the media query is purely additive.
 */
const MOBILE_STYLES = `
  <style>
    @media only screen and (max-width:600px) {
      .cl-container { width:100% !important; max-width:100% !important; }
      .cl-outer { padding:12px 0 24px !important; }
      .cl-px { padding-left:16px !important; padding-right:16px !important; }
      .cl-px-y { padding:16px !important; }
      .cl-body { padding:20px 16px 18px !important; }
      .cl-rule { margin:0 16px !important; }
      .cl-h1 { font-size:21px !important; line-height:1.3 !important; }
      .cl-sub { font-size:13px !important; }
      .cl-card-label, .cl-card-value {
        display:block !important;
        width:100% !important;
        white-space:normal !important;
        padding:6px 14px !important;
      }
      .cl-card-label { padding-bottom:0 !important; }
      .cl-card-value { padding-top:2px !important; font-size:14px !important; }
      .cl-cta-wrap { width:100% !important; }
      .cl-cta-wrap a { display:block !important; padding:14px 20px !important; }
      .cl-alert { padding:14px 16px !important; }
      .cl-step-num { width:30px !important; }
      img.cl-img { max-width:100% !important; height:auto !important; }
    }
    /* iOS/Apple Mail dark-mode: keep contrast against the dark-blue header */
    @media (prefers-color-scheme: dark) {
      .cl-h1, .cl-sub { color:#fff !important; }
    }
  </style>
`;

export function emailLayout(params: {
  header: string;
  body: string;
  footer?: string;
  preheader?: string;
}): string {
  const footer = params.footer ?? emailFooter();
  const pre = params.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:${B.bg};">${params.preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
    : '';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="format-detection" content="telephone=no"><title>CoAIleague</title>${MOBILE_STYLES}</head>` +
    `<body style="margin:0;padding:0;background-color:${B.bg};font-family:'Segoe UI',Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;width:100% !important;">` +
    pre +
    `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:${B.bg};"><tr><td align="center" class="cl-outer" style="padding:24px 16px 40px;">` +
    `<table width="100%" border="0" cellspacing="0" cellpadding="0" class="cl-container" style="max-width:600px;width:100%;"><tr><td>` +
    params.header + emailBody(params.body) + footer +
    `</td></tr></table></td></tr></table>` +
    `</body></html>`;
}

export function greeting(name: string): string {
  return `<p style="margin:0 0 20px;font-size:16px;color:${B.textBody};line-height:1.6;">Hello <strong style="color:${B.textPrimary};">${name}</strong>,</p>`;
}

export function para(text: string, opts?: { muted?: boolean; small?: boolean; center?: boolean }): string {
  const color = opts?.muted ? B.textMuted : B.textBody;
  const size = opts?.small ? '13px' : '15px';
  const align = opts?.center ? 'center' : 'left';
  return `<p style="margin:0 0 18px;font-size:${size};color:${color};line-height:1.7;text-align:${align};">${text}</p>`;
}

export function infoCard(params: {
  title?: string;
  rows: Array<{ label: string; value: string; highlight?: boolean }>;
  accentColor?: string;
}): string {
  const accent = params.accentColor ?? B.primary;
  const rows = params.rows.map((r, i) =>
    `<tr style="background-color:${i % 2 === 0 ? B.bgCardSoft : B.bgCard};">` +
    `<td class="cl-card-label" style="padding:11px 16px;font-size:13px;color:${B.textMuted};font-weight:600;white-space:nowrap;width:38%;">${r.label}</td>` +
    `<td class="cl-card-value" style="padding:11px 16px;font-size:13px;color:${r.highlight ? accent : B.textBody};font-weight:${r.highlight ? '700' : '400'};word-wrap:break-word;word-break:break-word;">${r.value}</td>` +
    `</tr>`
  ).join('');
  return `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border-radius:8px;overflow:hidden;border:1px solid ${B.border};">` +
    (params.title ? `<tr><td style="background-color:${B.bgCardSoft};padding:12px 16px;border-bottom:1px solid ${B.border};"><span style="font-size:13px;font-weight:700;color:${B.textPrimary};">${params.title}</span></td></tr>` : '') +
    rows + `</table>`;
}

type AlertType = 'info' | 'success' | 'warning' | 'danger' | 'purple';

const ALERT: Record<AlertType, { bg: string; border: string; text: string; title: string }> = {
  info:    { bg: '#eff6ff',  border: '#bfdbfe', text: '#1e3a8a',  title: '#2563EB' },
  success: { bg: '#f0fdf4',  border: '#86efac', text: '#14532d',  title: '#16a34a' },
  warning: { bg: '#fef9c3',  border: '#fcd34d', text: '#78350f',  title: '#d97706' },
  danger:  { bg: '#fef2f2',  border: '#fca5a5', text: '#7f1d1d',  title: '#dc2626' },
  purple:  { bg: '#f5f3ff',  border: '#c4b5fd', text: '#3b0764',  title: '#7c3aed' },
};

export function alertBox(params: { type: AlertType; title?: string; body: string }): string {
  const c = ALERT[params.type];
  return `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border-radius:8px;overflow:hidden;border:1px solid ${c.border};background-color:${c.bg};">` +
    `<tr><td class="cl-alert" style="padding:18px 20px;">` +
    (params.title ? `<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:${c.title};">${params.title}</p>` : '') +
    `<p style="margin:0;font-size:13px;color:${c.text};line-height:1.6;word-wrap:break-word;">${params.body}</p>` +
    `</td></tr></table>`;
}

export function stepList(steps: Array<{ title: string; description?: string }>): string {
  const items = steps.map((s, i) =>
    `<tr><td valign="top" style="padding:0 0 18px;">` +
    `<table border="0" cellspacing="0" cellpadding="0" width="100%"><tr>` +
    `<td valign="top" style="width:38px;padding-top:1px;"><div style="width:28px;height:28px;background:linear-gradient(135deg,${B.primary},${B.purple});border-radius:50%;text-align:center;line-height:28px;font-size:12px;font-weight:700;color:#fff;">${i + 1}</div></td>` +
    `<td valign="top" style="padding-left:4px;"><p style="margin:3px 0 4px;font-size:14px;font-weight:700;color:${B.textPrimary};">${s.title}</p>` +
    (s.description ? `<p style="margin:0;font-size:13px;color:${B.textMuted};line-height:1.6;">${s.description}</p>` : '') +
    `</td></tr></table></td></tr>`
  ).join('');
  return `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:0 0 24px;background-color:${B.bgCardSoft};border:1px solid ${B.border};border-radius:8px;">` +
    `<tr><td style="padding:20px 20px 4px;"><p style="margin:0 0 16px;font-size:13px;font-weight:700;color:${B.textPrimary};">Step-by-Step Process</p>` +
    `<table width="100%" border="0" cellspacing="0" cellpadding="0">${items}</table></td></tr></table>`;
}

export function checkList(items: string[], color: string = B.success): string {
  const rows = items.map(item =>
    `<tr><td valign="top" style="padding:5px 0;width:22px;color:${color};font-size:14px;font-weight:700;">&#10003;</td>` +
    `<td valign="top" style="padding:5px 0;font-size:14px;color:${B.textBody};line-height:1.5;">${item}</td></tr>`
  ).join('');
  return `<table border="0" cellspacing="0" cellpadding="0" style="margin:0 0 24px;width:100%;">${rows}</table>`;
}

type ButtonStyle = 'primary' | 'success' | 'danger' | 'warning' | 'purple' | 'dark';

const BTN_BG: Record<ButtonStyle, string> = {
  primary: `linear-gradient(135deg,${B.primary} 0%,${B.purple} 100%)`,
  success: `linear-gradient(135deg,#16a34a 0%,#0d9488 100%)`,
  danger:  `linear-gradient(135deg,#dc2626 0%,#b91c1c 100%)`,
  warning: `linear-gradient(135deg,#d97706 0%,#b45309 100%)`,
  purple:  `linear-gradient(135deg,#7c3aed 0%,#2563eb 100%)`,
  dark:    `linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)`,
};

export function ctaButton(params: { text: string; url: string; style?: ButtonStyle }): string {
  const bg = BTN_BG[params.style ?? 'primary'];
  return `<table border="0" cellspacing="0" cellpadding="0" class="cl-cta-wrap" style="margin:0 auto;"><tr>` +
    `<td align="center" style="border-radius:8px;background:${bg};">` +
    `<a href="${params.url}" target="_blank" style="display:inline-block;padding:14px 38px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;border-radius:8px;letter-spacing:0.2px;">${params.text}</a>` +
    `</td></tr></table>`;
}

export function divider(): string {
  return `<div style="height:1px;background:${B.border};margin:24px 0;"></div>`;
}

export function sectionHeading(text: string, color?: string): string {
  return `<p style="margin:0 0 12px;font-size:15px;font-weight:700;color:${color ?? B.textPrimary};letter-spacing:-0.2px;">${text}</p>`;
}

export function passwordResetSteps(): string {
  return stepList([
    { title: 'Click the reset button below', description: 'Opens a secure page to create your new password.' },
    { title: 'Enter your new password', description: 'Use at least 8 characters with letters, numbers, and symbols.' },
    { title: 'Confirm your new password', description: 'Re-enter the same password to confirm there are no typos.' },
    { title: 'Click "Set New Password"', description: 'Your password will be updated immediately and securely.' },
    { title: 'Sign in with your new password', description: 'Return to the login page and use your email and new password.' },
  ]);
}

// ─── Shared template builders used by emailService + inline callers ───────────

/**
 * Document / contract signature request email.
 * Replaces scattered inline HTML in contractPipelineService and documentSigningService.
 */
export function buildDocumentSignatureRequestEmail(params: {
  recipientName: string;
  documentTitle: string;
  portalUrl: string;
  expiryDays?: number;
  workspaceName?: string;
}): { subject: string; html: string } {
  const { recipientName, documentTitle, portalUrl, expiryDays = 30, workspaceName } = params;
  const expiryDate = new Date(Date.now() + expiryDays * 86_400_000)
    .toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return {
    subject: `Action Required: Please Review and Sign — ${documentTitle}`,
    html: emailLayout({
      preheader: `${documentTitle} is ready for your review and electronic signature.`,
      header: emailHeader({ title: 'Document Ready for Signature', subtitle: 'Secure electronic signing required', badge: 'E-Signature', theme: 'blue' }),
      body:
        greeting(recipientName || 'there') +
        para(`A document has been prepared for your review and electronic signature:`) +
        infoCard({ rows: [{ label: 'Document', value: documentTitle, highlight: true }, { label: 'Expires', value: expiryDate }] }) +
        para('Click the button below to review and sign securely. This link is unique to you and should not be shared.') +
        `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">` +
        ctaButton({ text: 'Review & Sign Document', url: portalUrl }) +
        `</td></tr></table>` +
        alertBox({ type: 'info', title: `Link expires in ${expiryDays} days`, body: `For your security, this link expires on ${expiryDate}. After expiry, contact the sender for a new link.` }) +
        para('If you did not expect this document, you can safely ignore this email.', { muted: true, small: true }),
      footer: emailFooter({ workspaceName }),
    }),
  };
}

/**
 * Executed contract / agreement delivery email.
 * All parties receive this after every required signature is collected.
 */
export function buildContractExecutedEmail(params: {
  recipientName: string;
  contractTitle: string;
  viewUrl: string;
  executionDate?: string;
  workspaceName?: string;
}): { subject: string; html: string } {
  const { recipientName, contractTitle, viewUrl, executionDate, workspaceName } = params;
  const execDate = executionDate ?? new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return {
    subject: `Your Executed Agreement is Ready — ${contractTitle}`,
    html: emailLayout({
      preheader: `"${contractTitle}" has been fully signed and is now in effect.`,
      header: emailHeader({ title: 'Agreement Fully Executed', subtitle: 'All signatures collected — agreement in effect', badge: 'Contract Complete', theme: 'green' }),
      body:
        greeting(recipientName || 'there') +
        para('Great news — your agreement has been fully executed by all parties and is now in effect:') +
        infoCard({
          rows: [
            { label: 'Agreement', value: contractTitle, highlight: true },
            { label: 'Execution Date', value: execDate },
            { label: 'Status', value: 'Fully Executed — All Signatures Collected' },
          ],
        }) +
        para('You can view and download the executed copy from the document center:') +
        `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">` +
        ctaButton({ text: 'View Executed Agreement', url: viewUrl, style: 'success' }) +
        `</td></tr></table>` +
        alertBox({ type: 'info', title: 'Keep this for your records', body: 'This executed agreement is stored securely. You can download a copy at any time from the document center.' }) +
        para('This agreement was executed via CoAIleague\'s secure e-signature platform.', { muted: true, small: true }),
      footer: emailFooter({ workspaceName }),
    }),
  };
}

/**
 * Payment reminder email (invoices overdue or approaching due date).
 * Replaces inline HTML in autonomousScheduler and autonomousPaymentCollector.
 */
export function buildPaymentReminderEmail(params: {
  clientName: string;
  invoiceNumber: string;
  amountDue: string;
  dueDate: string;
  daysOverdue?: number;
  paymentUrl?: string;
  workspaceName?: string;
}): { subject: string; html: string } {
  const { clientName, invoiceNumber, amountDue, dueDate, daysOverdue = 0, paymentUrl, workspaceName } = params;
  const isOverdue = daysOverdue > 0;
  const subject = isOverdue
    ? `Overdue Invoice ${invoiceNumber} — ${daysOverdue} Days Past Due`
    : `Payment Reminder — Invoice ${invoiceNumber} Due ${dueDate}`;
  return {
    subject,
    html: emailLayout({
      preheader: isOverdue ? `Invoice ${invoiceNumber} is ${daysOverdue} days overdue.` : `Invoice ${invoiceNumber} is due on ${dueDate}.`,
      header: emailHeader({
        title: isOverdue ? 'Overdue Invoice Notice' : 'Payment Reminder',
        subtitle: isOverdue ? `${daysOverdue} days past due — immediate action required` : `Due on ${dueDate}`,
        badge: isOverdue ? 'Overdue' : 'Reminder',
        theme: isOverdue ? 'red' : 'orange',
      }),
      body:
        greeting(clientName || 'there') +
        para(isOverdue
          ? `Invoice <strong>${invoiceNumber}</strong> for <strong>${amountDue}</strong> was due on ${dueDate} and is now <strong>${daysOverdue} days past due</strong>. Please arrange payment at your earliest convenience.`
          : `Invoice <strong>${invoiceNumber}</strong> for <strong>${amountDue}</strong> is due on <strong>${dueDate}</strong>. Please ensure timely payment to avoid a late notice.`) +
        infoCard({
          rows: [
            { label: 'Invoice Number', value: invoiceNumber, highlight: true },
            { label: 'Amount Due', value: amountDue },
            { label: 'Due Date', value: dueDate },
            ...(isOverdue ? [{ label: 'Days Overdue', value: `${daysOverdue} days` }] : []),
          ],
        }) +
        (paymentUrl
          ? `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">` +
            ctaButton({ text: 'Pay Now', url: paymentUrl, style: isOverdue ? 'danger' : 'primary' }) +
            `</td></tr></table>`
          : '') +
        para('If you have already submitted payment, please disregard this notice. Contact us if you have any questions.', { muted: true }),
      footer: emailFooter({ workspaceName }),
    }),
  };
}

/**
 * Billing event emails for Stripe lifecycle.
 * theme: 'welcome' | 'upgrade' | 'cancel' | 'payment_ok' | 'payment_fail' | 'trial' | 'suspended' | 'reactivated'
 */
export function buildBillingEventEmail(params: {
  recipientName: string;
  workspaceName: string;
  planName?: string;
  event: 'welcome' | 'upgrade' | 'downgrade' | 'cancel' | 'payment_ok' | 'payment_fail' | 'trial_ending' | 'suspended' | 'reactivated';
  actionUrl?: string;
  platformName?: string;
}): { subject: string; html: string } {
  const { recipientName, workspaceName, planName, event, actionUrl, platformName = 'CoAIleague' } = params;

  const configs: Record<string, { subject: string; title: string; subtitle: string; badge: string; theme: string; body: string; cta?: { text: string } }> = {
    welcome: {
      subject: `Welcome to ${platformName}!`,
      title: `Welcome to ${platformName}`,
      subtitle: 'Your workforce intelligence platform is ready',
      badge: 'Welcome',
      theme: 'green',
      body: para(`Hi ${recipientName}, your workspace <strong>${workspaceName}</strong> is now active${planName ? ` on the <strong>${planName}</strong> plan` : ''}. Trinity AI is ready to start managing your workforce operations.`),
      cta: { text: 'Go to Dashboard' },
    },
    upgrade: {
      subject: `${workspaceName} — Plan Upgraded`,
      title: 'Plan Upgraded',
      subtitle: `You now have access to all ${planName || 'premium'} features`,
      badge: 'Upgrade Complete',
      theme: 'green',
      body: para(`Your workspace <strong>${workspaceName}</strong> has been upgraded${planName ? ` to the <strong>${planName}</strong> plan` : ''}. New capabilities are available immediately.`),
      cta: { text: 'Explore New Features' },
    },
    downgrade: {
      subject: `${workspaceName} — Plan Changed`,
      title: 'Subscription Updated',
      subtitle: 'Your plan has been adjusted',
      badge: 'Plan Changed',
      theme: 'orange',
      body: para(`Your workspace <strong>${workspaceName}</strong> subscription has been updated${planName ? ` to the <strong>${planName}</strong> plan` : ''}. Some features may no longer be available.`),
    },
    cancel: {
      subject: `${workspaceName} — Subscription Cancelled`,
      title: 'Subscription Cancelled',
      subtitle: 'Your account has been moved to the free tier',
      badge: 'Cancelled',
      theme: 'dark',
      body: para(`Your subscription for <strong>${workspaceName}</strong> has been cancelled. Your workspace has been moved to the free tier. We hope to see you again.`),
      cta: { text: 'Resubscribe' },
    },
    payment_ok: {
      subject: `Payment Confirmed — ${workspaceName}`,
      title: 'Payment Confirmed',
      subtitle: 'Your subscription is active and in good standing',
      badge: 'Payment Received',
      theme: 'green',
      body: para(`Payment for <strong>${workspaceName}</strong> has been successfully processed. Your subscription continues without interruption.`),
    },
    payment_fail: {
      subject: `Payment Failed — Action Required`,
      title: 'Payment Issue',
      subtitle: 'Your payment could not be processed',
      badge: 'Action Required',
      theme: 'red',
      body: para(`A payment for <strong>${workspaceName}</strong> has failed. Please update your payment method to avoid service interruption.`) +
        alertBox({ type: 'danger', title: 'Update required within 3 days', body: 'If payment is not resolved your workspace may be suspended. Click below to update your billing information.' }),
      cta: { text: 'Update Payment Method' },
    },
    trial_ending: {
      subject: `Trial Ending Soon — ${workspaceName}`,
      title: 'Your Trial is Ending Soon',
      subtitle: 'Add a payment method to continue uninterrupted',
      badge: 'Trial Ending',
      theme: 'orange',
      body: para(`Your trial for <strong>${workspaceName}</strong> is ending soon. Add a payment method to continue using all ${platformName} features without interruption.`) +
        alertBox({ type: 'warning', title: 'No charge until trial ends', body: 'You will not be charged until your trial period ends. Cancel anytime before then.' }),
      cta: { text: 'Add Payment Method' },
    },
    suspended: {
      subject: `Account Suspended — ${workspaceName}`,
      title: 'Account Suspended',
      subtitle: 'Payment issue requires immediate attention',
      badge: 'Suspended',
      theme: 'red',
      body: para(`<strong>${workspaceName}</strong> has been suspended due to a payment issue. Please resolve your billing to restore access.`) +
        alertBox({ type: 'danger', title: 'Immediate action required', body: 'Your team cannot access the platform until billing is resolved. Contact support if you need assistance.' }),
      cta: { text: 'Resolve Billing' },
    },
    reactivated: {
      subject: `Account Reactivated — ${workspaceName}`,
      title: 'Account Reactivated',
      subtitle: 'Welcome back — your workspace is fully restored',
      badge: 'Active',
      theme: 'green',
      body: para(`Great news! <strong>${workspaceName}</strong> has been reactivated. Your team has full access to all platform features.`),
      cta: { text: 'Go to Dashboard' },
    },
  };

  const cfg = configs[event] ?? configs.welcome;

  return {
    subject: cfg.subject,
    html: emailLayout({
      preheader: cfg.subject,
      header: emailHeader({ title: cfg.title, subtitle: cfg.subtitle, badge: cfg.badge, theme: cfg.theme }),
      body:
        greeting(recipientName || 'there') +
        cfg.body +
        (cfg.cta && actionUrl
          ? `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">` +
            ctaButton({ text: cfg.cta.text, url: actionUrl }) +
            `</td></tr></table>`
          : ''),
      footer: emailFooter({ workspaceName }),
    }),
  };
}
