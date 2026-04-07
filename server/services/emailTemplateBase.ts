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
    `<table width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td style="padding:22px 32px 16px;">${logoMark('sm')}</td></tr></table>` +
    `<div style="height:1px;background:rgba(255,255,255,0.1);margin:0 32px;"></div>` +
    `<table width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td style="padding:24px 32px 32px;" align="center">` +
    (params.badge ? `<div style="display:inline-block;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.22);color:rgba(255,255,255,0.85);font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;padding:5px 14px;border-radius:20px;margin-bottom:14px;">${params.badge}</div><br>` : '') +
    `<h1 style="margin:0;color:#fff;font-size:25px;font-weight:700;line-height:1.3;letter-spacing:-0.4px;">${params.title}</h1>` +
    (params.subtitle ? `<p style="margin:9px 0 0;color:rgba(255,255,255,0.6);font-size:14px;line-height:1.5;">${params.subtitle}</p>` : '') +
    `</td></tr></table>` +
    `<div style="height:3px;background:${HEADER_ACCENT[th] ?? HEADER_ACCENT.blue};"></div>` +
    `</td></tr></table>`;
}

export function emailBody(content: string): string {
  return `<table width="100%" border="0" cellspacing="0" cellpadding="0"><tr>` +
    `<td style="background-color:${B.bgCard};padding:36px 32px 28px;border-left:1px solid ${B.border};border-right:1px solid ${B.border};">` +
    content + `</td></tr></table>`;
}

export function emailFooter(params?: { workspaceName?: string; note?: string }): string {
  const year = new Date().getFullYear();
  const note = params?.note ?? `This is an automated message from CoAIleague${params?.workspaceName ? ' / ' + params.workspaceName : ''}.`;
  return `<table width="100%" border="0" cellspacing="0" cellpadding="0"><tr>` +
    `<td style="background-color:${B.footerBg};border-radius:0 0 12px 12px;padding:24px 32px 20px;border-top:3px solid #1e293b;">` +
    `<table width="100%" border="0" cellspacing="0" cellpadding="0">` +
    `<tr><td style="padding-bottom:14px;" align="center">${logoMark('sm')}</td></tr>` +
    `<tr><td style="padding-bottom:10px;text-align:center;"><p style="margin:0;font-size:12px;color:${B.footerText};line-height:1.6;">${note}</p></td></tr>` +
    `<tr><td style="text-align:center;border-top:1px solid #1e293b;padding-top:10px;"><p style="margin:0;font-size:11px;color:#334155;">&copy; ${year} CoAIleague &bull; AI-Powered Workforce Intelligence</p></td></tr>` +
    `</table></td></tr></table>`;
}

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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>CoAIleague</title></head>` +
    `<body style="margin:0;padding:0;background-color:${B.bg};font-family:'Segoe UI',Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">` +
    pre +
    `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:${B.bg};"><tr><td align="center" style="padding:24px 16px 40px;">` +
    `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;"><tr><td>` +
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
    `<td style="padding:11px 16px;font-size:13px;color:${B.textMuted};font-weight:600;white-space:nowrap;width:38%;">${r.label}</td>` +
    `<td style="padding:11px 16px;font-size:13px;color:${r.highlight ? accent : B.textBody};font-weight:${r.highlight ? '700' : '400'};">${r.value}</td>` +
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
    `<tr><td style="padding:18px 20px;">` +
    (params.title ? `<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:${c.title};">${params.title}</p>` : '') +
    `<p style="margin:0;font-size:13px;color:${c.text};line-height:1.6;">${params.body}</p>` +
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
  return `<table border="0" cellspacing="0" cellpadding="0" style="margin:0 auto;"><tr>` +
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
