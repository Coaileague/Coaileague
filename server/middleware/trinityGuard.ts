/**
 * Trinity Guard — Real-Time Intrusion Detection Middleware
 * =========================================================
 * Trinity's "biological immune system" — intercepts every API request and scans
 * for attack patterns before they reach route handlers. Uses the SecurityHardeningService
 * for threat tracking and auto-blocking, and fires events to Trinity's consciousness
 * via the internal event bus so she can learn, adapt, and escalate.
 *
 * Detection surface:
 *  - URL / query string: SQL injection, XSS, path traversal, command injection
 *  - User-Agent: Known attacker tool fingerprints
 *  - Request body: SQL/XSS in identifier fields (skips long-form content to prevent false positives)
 *  - Blocked IPs: Immediate deny before any processing
 *
 * Security philosophy:
 *  - Never false-positive legitimate traffic (content routes, chat messages, rich text excluded)
 *  - Critical threats → auto-block IP + full Trinity platform event (persisted)
 *  - High threats → log + internal event (Trinity learns), request allowed (reduce FP blocking)
 *  - Blocked IPs → 403 immediately, no processing
 */

import { Request, Response, NextFunction } from 'express';
import { securityHardeningService } from '../services/infrastructure/securityHardeningService';
import { platformEventBus } from '../services/platformEventBus';
import { createLogger } from '../lib/logger';
import { pool } from '../db';
const log = createLogger('trinityGuard');

async function logInjectionAttempt(
  eventType: string,
  severity: string,
  ip: string,
  path: string,
  method: string,
  description: string,
  threats: unknown[],
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO security_audit_log (event_type, severity, ip_address, path, method, description, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [eventType, severity, ip, path, method, description, JSON.stringify({ threats })]
    );
  } catch (err: any) {
    log.warn('[TrinityGuard] security_audit_log write failed:', err?.message);
  }
}

// Webhook paths use signature-based auth — skip body scanning entirely
const WEBHOOK_PREFIXES = [
  '/api/webhooks/',
  '/api/stripe/webhook',
  '/api/resend/',
  '/api/twilio/',
  '/api/message-bridge/',
  // Inbound email webhook (Resend POSTs here with arbitrary email body content).
  // Bodies contain real emails which may include SQL keywords, HTML, script tags, etc.
  // Signature-verified in inboundEmailRouter — body scanning here would cause false-positive
  // IP blocks on Resend's delivery IPs, silently breaking all future inbound mail.
  '/api/inbound/',
  // Trinity Voice + SMS Twilio webhooks — validated by Twilio HMAC signature,
  // bodies carry caller-provided content (names, case numbers, spoken transcripts).
  // Scanning would cause false-positive IP blocks on Twilio's delivery IPs.
  '/api/voice/',
  '/api/sms/inbound',
  '/api/sms/status',
];

// Routes that carry long-form user-generated text — skip body scanning to avoid false positives
// SQL keywords appear naturally in chat messages, post orders, incident narratives, etc.
const CONTENT_PATH_PATTERNS = [
  /\/api\/chat/i,
  /\/api\/private-messages/i,
  /\/api\/comm-os/i,
  /\/api\/announcements/i,
  /\/api\/post-orders/i,
  /\/api\/documents/i,
  /\/api\/incidents/i,
  /\/api\/rms/i,
  /\/api\/cad/i,
  /\/api\/situation/i,
  /\/api\/notes/i,
];

// Fingerprints of known penetration testing / exploit tools
const ATTACK_AGENT_PATTERNS = [
  /sqlmap/i, /nikto/i, /nmap/i, /masscan/i, /nessus/i, /openvas/i,
  /burpsuite/i, /nuclei/i, /acunetix/i, /dirbuster/i, /gobuster/i,
  /wfuzz/i, /hydra/i, /metasploit/i, /sqlninja/i, /havij/i,
  /arachni/i, /vega\//i, /skipfish/i, /zaproxy/i, /appscan/i,
];

// SQL injection: requires multi-token attack structure, not single keywords.
// UNION SELECT, DROP TABLE, DELETE FROM, exec(), xp_cmdshell, classic OR 1=1 variants.
const SQL_INJECTION_RE = /(\bunion\s+(?:all\s+)?select\b|\bdrop\s+table\b|\bdelete\s+from\b|\binsert\s+into\b|\bexec(?:ute)?\s*\(|\bxp_cmdshell\b|'\s*or\s*'\d|\bor\s+1\s*=\s*1\b|\bor\s+'[^']*'\s*=\s*'[^']*'|--\s*(?:drop|insert|select|update|delete)\b)/i;

// Path traversal: encoded and plain variants
const PATH_TRAVERSAL_RE = /(?:\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\/|\.\.%2f|%252e%252e|\.\.%5c)/i;

// XSS: script tags, event handlers, javascript: protocol in URLs/fields
const XSS_RE = /(?:<\s*script[\s>/]|javascript\s*:|data\s*:\s*text\/html|on(?:load|error|click|mouseover|focus|blur|keydown|keyup|submit|change)\s*=\s*['"(])/i;

// Command injection: shell metacharacters + known commands in URL context
const CMD_INJECTION_RE = /(?:\|\s*(?:cat|ls\b|id\b|whoami|pwd|wget|curl\b|nc\b|bash|sh\b|python|perl|ruby)\b|\$\([\w\s]+\)|`[^`]{0,40}`|;\s*(?:cat|rm|chmod|id|ls|whoami)\s)/i;

type ThreatSeverityLocal = 'medium' | 'high' | 'critical';
type ThreatTypeLocal = 'sql_injection' | 'xss' | 'suspicious_pattern' | 'unauthorized_access';

interface DetectedThreat {
  type: ThreatTypeLocal;
  severity: ThreatSeverityLocal;
  description: string;
  location: 'url' | 'body' | 'header';
}

function isWebhookPath(path: string): boolean {
  return WEBHOOK_PREFIXES.some(prefix => path.startsWith(prefix));
}

function isContentRoute(path: string): boolean {
  return CONTENT_PATH_PATTERNS.some(pattern => pattern.test(path));
}

/**
 * Extracts only short identifier-like fields from a request body for threat scanning.
 * Explicitly skips long-form text fields where SQL/XSS keywords appear legitimately.
 */
function extractScannableText(obj: Record<string, any>, depth = 0): string {
  if (depth > 3) return '';
  const SKIP_CONTENT_KEYS = new Set([
    'message', 'content', 'description', 'body', 'text', 'notes', 'comments',
    'summary', 'details', 'reason', 'narrative', 'instructions', 'remarks',
    'postOrderText', 'reportContent', 'incidentDescription', 'caseNotes',
  ]);

  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (SKIP_CONTENT_KEYS.has(key) || SKIP_CONTENT_KEYS.has(key.toLowerCase())) continue;
    if (typeof value === 'string' && value.length < 500) {
      parts.push(`${key}=${value}`);
    } else if (Array.isArray(value)) {
      // Only scan short string array elements
      for (const item of value) {
        if (typeof item === 'string' && item.length < 200) parts.push(item);
      }
    } else if (typeof value === 'object' && value !== null) {
      parts.push(extractScannableText(value, depth + 1));
    }
  }
  return parts.join(' ');
}

export function trinityGuardMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const method = req.method;
  const path = req.path;
  const rawUrl = (req.originalUrl || path).slice(0, 2000);
  // Decode percent-encoding so %20UNION%20SELECT etc. is caught by the regex
  let decodedUrl = rawUrl;
  try { decodedUrl = decodeURIComponent(rawUrl).slice(0, 2000); } catch { /* keep rawUrl if malformed */ }
  const scanUrl = rawUrl + ' ' + decodedUrl; // scan both encoded + decoded forms
  const ua = (req.headers['user-agent'] || '').slice(0, 300);

  // Webhooks — signature-verified separately, skip payload scanning
  if (isWebhookPath(path)) {
    return next();
  }

  // ── BLOCKED IP FAST-PATH ────────────────────────────────────────────────────
  if (securityHardeningService.isBlocked(ip)) {
    platformEventBus.emit('security_blocked_ip_access', {
      ip, path, method, timestamp: new Date().toISOString(),
    });
    log.warn(`[TrinityGuard] BLOCKED IP denied: ${ip} → ${method} ${path}`);
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const threats: DetectedThreat[] = [];

  // ── SCANNER 1: Attacker Tool User-Agent ────────────────────────────────────
  for (const pattern of ATTACK_AGENT_PATTERNS) {
    if (pattern.test(ua)) {
      threats.push({
        type: 'suspicious_pattern',
        severity: 'high',
        description: `Known attack-tool user-agent fingerprint: "${ua.slice(0, 80)}"`,
        location: 'header',
      });
      break;
    }
  }

  // ── SCANNER 2: URL / Query String Analysis ──────────────────────────────────
  // Scan both raw and URL-decoded forms so percent-encoded attacks (UNION%20SELECT) are caught
  if (PATH_TRAVERSAL_RE.test(scanUrl)) {
    threats.push({ type: 'suspicious_pattern', severity: 'high', description: 'Path traversal sequence in URL', location: 'url' });
  }

  if (SQL_INJECTION_RE.test(scanUrl)) {
    threats.push({ type: 'sql_injection', severity: 'critical', description: 'SQL injection attack pattern in URL/query string', location: 'url' });
  }

  if (XSS_RE.test(scanUrl)) {
    threats.push({ type: 'xss', severity: 'high', description: 'Cross-site scripting pattern in URL', location: 'url' });
  }

  if (CMD_INJECTION_RE.test(scanUrl)) {
    threats.push({ type: 'suspicious_pattern', severity: 'critical', description: 'Command injection attempt in URL', location: 'url' });
  }

  // ── SCANNER 3: Request Body (non-content, non-webhook routes only) ──────────
  if (['POST', 'PUT', 'PATCH'].includes(method) && !isContentRoute(path)) {
    const body = req.body;
    if (body && typeof body === 'object') {
      const scannable = extractScannableText(body);
      if (scannable.length > 0) {
        if (SQL_INJECTION_RE.test(scannable)) {
          threats.push({ type: 'sql_injection', severity: 'critical', description: 'SQL injection pattern in request body', location: 'body' });
        }
        if (XSS_RE.test(scannable)) {
          threats.push({ type: 'xss', severity: 'high', description: 'XSS pattern in request body', location: 'body' });
        }
        if (CMD_INJECTION_RE.test(scannable)) {
          threats.push({ type: 'suspicious_pattern', severity: 'critical', description: 'Command injection pattern in request body', location: 'body' });
        }
      }
    }
  }

  // ── THREAT RESPONSE ─────────────────────────────────────────────────────────
  if (threats.length === 0) {
    return next();
  }

  const mostSevere = threats.find(t => t.severity === 'critical') || threats[0];
  const isCritical = mostSevere.severity === 'critical';

  // Record every detected threat in the SecurityHardeningService
  // (auto-blocks the IP if it hits the attempt threshold)
  for (const t of threats) {
    securityHardeningService.recordThreat(t.type, t.severity, ip, path, t.description, {
      method,
      ua: ua.slice(0, 100),
      url: rawUrl.slice(0, 500),
    });
  }

  // Persist to security_audit_log for SOC2 / audit trail (Rule 9 compliance)
  logInjectionAttempt(mostSevere.type, mostSevere.severity, ip, path, method, mostSevere.description, threats).catch((err: any) => log.warn('[TrinityGuard] logInjectionAttempt failed (non-blocking):', err?.message));

  // Fire internal lightweight event — Trinity's subagents subscribe to this
  platformEventBus.emit('security_threat_detected', {
    ip, path, method,
    threats: threats.map(t => ({ type: t.type, severity: t.severity, location: t.location })),
    isCritical,
    timestamp: new Date().toISOString(),
  });

  // Critical threats: hard-block IP, publish full persisted Trinity event, deny request
  if (isCritical) {
    securityHardeningService.blockEntity(
      'ip',
      ip,
      `TrinityGuard auto-block: ${mostSevere.description}`,
      24 * 60 * 60 * 1000 // 24-hour block
    );

    log.error(`[TrinityGuard] CRITICAL threat AUTO-BLOCKED: IP=${ip} PATH=${path} TYPE=${mostSevere.type}`);

    // Publish full platform event so Trinity's event bus records this for staff visibility
    platformEventBus.publish({
      type: 'trinity_issue_detected',
      category: 'security',
      title: `Critical Attack Blocked: ${mostSevere.type.replace('_', ' ').toUpperCase()}`,
      description: `IP address ${ip} was automatically blocked after triggering ${threats.length} security detector(s) at ${method} ${path}. Primary threat: ${mostSevere.description}`,
      metadata: {
        severity: 'critical',
        audience: 'staff',
      },
      payload: {
        ip,
        path,
        method,
        threatCount: threats.length,
        primaryThreat: mostSevere,
        allThreats: threats,
        blockedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      visibility: 'platform_staff',
    }).catch((err: any) => log.warn('[TrinityGuard] EventBus publish failed (non-blocking):', err?.message));

    res.status(403).json({ error: 'Request blocked: security violation detected' });
    return;
  }

  // High severity: log and emit — but allow request through (avoids blocking false positives)
  log.warn(`[TrinityGuard] HIGH threat detected — IP=${ip} PATH=${path}: ${mostSevere.description}`);
  return next();
}
