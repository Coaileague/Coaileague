/**
 * Breach Response SOP — CoAIleague Platform
 *
 * Definitions, procedures, checklists, and logging for security/data
 * breach incidents.  Surfaces in the admin UI at /admin/breach-response
 * and is callable programmatically via the Trinity emergency action
 * "trinity.security.initiate_breach_response".
 */

import { db } from '../db';
import { auditLogs } from '@shared/schema';
import { platformEventBus } from './platformEventBus';
import { createLogger } from '../lib/logger';
const log = createLogger('breachResponseSOP');


// ─── Breach Severity ──────────────────────────────────────────────────────────

export type BreachSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface BreachIncident {
  incidentId: string;
  severity: BreachSeverity;
  discoveredAt: string;          // ISO-8601
  description: string;
  affectedWorkspaceIds?: string[];
  affectedDataTypes?: string[];
  reportedBy: string;            // userId or 'system'
  status: 'open' | 'contained' | 'resolved' | 'closed';
  phase: SopPhase;
}

export type SopPhase =
  | 'detection'
  | 'initial_assessment'
  | 'containment'
  | 'evidence_preservation'
  | 'notification'
  | 'eradication'
  | 'recovery'
  | 'post_incident';

// ─── SOP Content ─────────────────────────────────────────────────────────────

export interface SopStep {
  id: string;
  phase: SopPhase;
  title: string;
  owner: string;
  timeTarget: string;            // e.g. "Within 1 hour"
  required: boolean;
  actions: string[];
  notes?: string;
}

export const BREACH_RESPONSE_SOP: SopStep[] = [
  // Phase 1 — Detection
  {
    id: 'det-01',
    phase: 'detection',
    title: 'Identify and record the suspected breach',
    owner: 'Any staff / automated alert',
    timeTarget: 'Immediately upon discovery',
    required: true,
    actions: [
      'Document the date, time, and source of detection (log alert, user report, external party).',
      'Do NOT attempt remediation before recording the baseline state.',
      'Take screenshots or export relevant log lines and preserve them.',
      'Initiate this SOP by clicking "Open Incident" on this page or asking Trinity: "initiate breach response".',
    ],
  },

  // Phase 2 — Initial Assessment
  {
    id: 'ass-01',
    phase: 'initial_assessment',
    title: 'Assess scope and severity',
    owner: 'Platform Owner / CTO',
    timeTarget: 'Within 1 hour',
    required: true,
    actions: [
      'Determine what data was accessed or exfiltrated: PII, credentials, payroll, schedules.',
      'Identify which workspaces (tenant orgs) may be affected.',
      'Assess attack vector: credential compromise, SQL injection, misconfigured S3, insider, etc.',
      'Assign severity: Low (no PII, internal only), Medium (limited PII), High (employee PII, financial data), Critical (mass PII, credentials, PHI).',
      'Notify the designated Incident Commander — the person who will run all remaining phases.',
    ],
  },
  {
    id: 'ass-02',
    phase: 'initial_assessment',
    title: 'Notify legal counsel',
    owner: 'Incident Commander',
    timeTarget: 'Within 2 hours for High/Critical; 24 hours for Medium',
    required: true,
    actions: [
      'Contact your retained legal counsel or cyber-insurance carrier.',
      'Do NOT issue any public statements or customer notifications without legal sign-off.',
      'Preserve attorney-client privilege — mark all written communications "Privileged & Confidential — Attorney-Client Communication".',
    ],
  },

  // Phase 3 — Containment
  {
    id: 'con-01',
    phase: 'containment',
    title: 'Short-term containment',
    owner: 'Incident Commander + Engineering',
    timeTarget: 'Within 2 hours',
    required: true,
    actions: [
      'Rotate all potentially compromised credentials: DATABASE_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY, STRIPE_SECRET_KEY, SESSION_SECRET, RESEND_API_KEY.',
      'Rotate JWT signing secrets and invalidate all active sessions via the admin panel.',
      'Disable compromised user accounts — DO NOT delete them (evidence preservation).',
      'If a workspace is confirmed breached, suspend that workspace from the admin panel.',
      'If the attack vector is known (e.g., specific endpoint), deploy a WAF rule or temporarily disable the route.',
    ],
    notes: 'Never delete logs or database records during containment. Evidence must be preserved.',
  },
  {
    id: 'con-02',
    phase: 'containment',
    title: 'Long-term containment',
    owner: 'Engineering',
    timeTarget: 'Within 24 hours',
    required: true,
    actions: [
      'Patch or remove the exploited vulnerability.',
      'Deploy to production with the fix and confirm the attack vector is closed.',
      'Enable enhanced logging for the affected area for the next 30 days.',
      'Review all similar code patterns for the same vulnerability class.',
    ],
  },

  // Phase 4 — Evidence Preservation
  {
    id: 'evd-01',
    phase: 'evidence_preservation',
    title: 'Preserve logs and forensic evidence',
    owner: 'Engineering',
    timeTarget: 'Before any remediation that modifies state',
    required: true,
    actions: [
      'Export all audit_logs rows for the affected workspace(s) for the 30 days preceding the incident.',
      'Export all ai_action_logs entries for the same period.',
      'Take a read-only snapshot of the production database.',
      'Download and archive all relevant application logs from the hosting provider.',
      'Document the chain of custody for all digital evidence.',
    ],
  },

  // Phase 5 — Notification
  {
    id: 'not-01',
    phase: 'notification',
    title: 'Regulatory notification (US state laws / GDPR)',
    owner: 'Legal Counsel + Incident Commander',
    timeTarget: '72 hours for GDPR; varies by US state (24–72 hours for California, Washington, etc.)',
    required: true,
    actions: [
      'Determine which states/jurisdictions are implicated based on affected employee/client locations.',
      'Washington State — notify the Attorney General if >500 WA residents affected (RCW 19.255.010).',
      'California — notify if ANY CA resident PII exposed (CCPA / Cal. Civ. Code § 1798.82).',
      'GDPR — notify the lead supervisory authority within 72 hours if EU data subjects affected.',
      'Document notification timeline and content — regulators will request this.',
    ],
    notes: 'Coordinate all regulatory filings through legal counsel. Premature or incorrect filings can increase liability.',
  },
  {
    id: 'not-02',
    phase: 'notification',
    title: 'Customer (tenant org) notification',
    owner: 'Incident Commander + Customer Success',
    timeTarget: 'Per legal counsel guidance — typically within 72 hours for High/Critical',
    required: true,
    actions: [
      'Draft customer notification with legal review — must include: what happened, what data, what we are doing, what customers should do, contact info.',
      'Send via Resend from a trusted domain (do NOT use a new domain — phishing risk).',
      'Offer affected tenants a dedicated support channel (email alias or Slack).',
      'If credentials (passwords) were potentially exposed, force password resets for affected users.',
    ],
  },
  {
    id: 'not-03',
    phase: 'notification',
    title: 'Internal stakeholder notification',
    owner: 'Incident Commander',
    timeTarget: 'Within 4 hours for High/Critical',
    required: true,
    actions: [
      'Notify all company founders/owners within 4 hours.',
      'Brief customer success and sales teams on the incident and approved customer communications script.',
      'Do NOT disclose incident details on public channels (Slack, social) until legal clearance.',
    ],
  },

  // Phase 6 — Eradication
  {
    id: 'era-01',
    phase: 'eradication',
    title: 'Remove threat and harden systems',
    owner: 'Engineering',
    timeTarget: 'Within 48 hours',
    required: true,
    actions: [
      'Confirm the root cause is patched and deployed to production.',
      'Run a vulnerability scan of the entire application (OWASP ZAP or Snyk).',
      'Audit all environment secrets — rotate anything that was not rotated during containment.',
      'Review and update ALLOWED_ORIGINS, rate-limiting configuration, and input validation.',
      'Force MFA enrollment for all admin users if not already required.',
    ],
  },

  // Phase 7 — Recovery
  {
    id: 'rec-01',
    phase: 'recovery',
    title: 'Restore normal operations',
    owner: 'Incident Commander + Engineering',
    timeTarget: 'As soon as eradication is confirmed',
    required: true,
    actions: [
      'Re-enable any suspended workspaces or disabled features — after confirming the threat is removed.',
      'Monitor production logs and UptimeRobot for 48–72 hours post-recovery.',
      'Confirm all affected customer data is intact — run the DB restore test procedure.',
      'Send a post-incident update to affected customers confirming resolution.',
    ],
  },

  // Phase 8 — Post-Incident Review
  {
    id: 'pir-01',
    phase: 'post_incident',
    title: 'Blameless post-incident review (PIR)',
    owner: 'All Engineering + Incident Commander',
    timeTarget: 'Within 5 business days of resolution',
    required: true,
    actions: [
      'Conduct a blameless retrospective — focus on systems and processes, not individuals.',
      'Document the full incident timeline (discovery → containment → eradication → recovery).',
      'Identify root cause using the 5-Whys technique.',
      'Produce a PIR report with: root cause, contributing factors, timeline, action items with owners and deadlines.',
      'Update this SOP and related runbooks based on lessons learned.',
    ],
    notes: 'The PIR report must be retained for a minimum of 3 years for compliance purposes.',
  },
  {
    id: 'pir-02',
    phase: 'post_incident',
    title: 'Update cyber-insurance carrier',
    owner: 'Incident Commander',
    timeTarget: 'Per policy terms — typically within 10 business days',
    required: true,
    actions: [
      'File an incident report with the cyber-insurance carrier.',
      'Provide the PIR report and all regulatory correspondence.',
      'Work with the carrier on any remediation requirements.',
    ],
  },
];

// ─── Severity Rules ───────────────────────────────────────────────────────────

export const SEVERITY_GUIDE = [
  {
    level: 'critical' as BreachSeverity,
    label: 'Critical',
    description: 'Mass PII exposure, credential database compromise, financial data breach affecting multiple tenants.',
    responseTime: '15 minutes',
    notifyWithin: '72 hours (GDPR) / 24–48 hours (state laws)',
    examples: [
      'Database backup downloaded by an attacker',
      'All user password hashes exposed',
      'Stripe keys or ACH banking details leaked',
    ],
  },
  {
    level: 'high' as BreachSeverity,
    label: 'High',
    description: 'PII exposed for one or more tenants, employee records accessed, payroll data leaked.',
    responseTime: '1 hour',
    notifyWithin: '72 hours',
    examples: [
      'Single-tenant employee SSN/DOB records accessed',
      'Payroll run data exposed to wrong party',
      'Guard schedules with home addresses downloaded',
    ],
  },
  {
    level: 'medium' as BreachSeverity,
    label: 'Medium',
    description: 'Limited PII exposure, internal data visible to wrong user, partial credential leak.',
    responseTime: '4 hours',
    notifyWithin: '5 business days or as required',
    examples: [
      'One tenant admin briefly saw another tenant\'s shift list',
      'Internal employee ID numbers exposed (no SSN)',
      'API key with read-only scope leaked',
    ],
  },
  {
    level: 'low' as BreachSeverity,
    label: 'Low',
    description: 'No PII, internal-only data, no customer impact, potential vulnerability with no confirmed exploitation.',
    responseTime: '24 hours',
    notifyWithin: 'Internal review only',
    examples: [
      'A debug endpoint was briefly accessible without auth — no PII',
      'Internal metric data temporarily world-readable',
      'Penetration test finding — not yet exploited',
    ],
  },
];

// ─── Incident Logger ──────────────────────────────────────────────────────────

export async function logBreachIncident(incident: BreachIncident): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      workspaceId: incident.affectedWorkspaceIds?.[0] || 'platform',
      userId: incident.reportedBy,
      action: 'breach_incident_opened',
      resource: 'security_incident',
      resourceId: incident.incidentId,
      details: {
        incidentId: incident.incidentId,
        severity: incident.severity,
        description: incident.description,
        affectedWorkspaces: incident.affectedWorkspaceIds,
        affectedDataTypes: incident.affectedDataTypes,
        status: incident.status,
        phase: incident.phase,
      },
    });
  } catch (err) {
    log.error('[BreachSOP] Failed to write audit log for breach incident:', err);
  }

  // Broadcast a platform-level health alert
  try {
    const { broadcastToAllClients } = await import('../websocket');
    broadcastToAllClients({
      type: 'health_alert',
      data: {
        level: incident.severity === 'critical' || incident.severity === 'high' ? 'error' : 'warning',
        message: `Security incident ${incident.incidentId} opened — severity: ${incident.severity}`,
        incidentId: incident.incidentId,
        timestamp: incident.discoveredAt,
      },
    });
  } catch (err) {
    log.warn('[BreachSOP] WebSocket alert failed (non-fatal):', err);
  }
}

// ─── Convenience Helpers ──────────────────────────────────────────────────────

export function generateIncidentId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INC-${ts}-${rand}`;
}

export function getStepsByPhase(phase: SopPhase): SopStep[] {
  return BREACH_RESPONSE_SOP.filter(s => s.phase === phase);
}

export const SOP_PHASES: { id: SopPhase; label: string; description: string }[] = [
  { id: 'detection',             label: 'Detection',              description: 'Identify and record the suspected breach' },
  { id: 'initial_assessment',    label: 'Initial Assessment',     description: 'Scope, severity, and legal notification' },
  { id: 'containment',           label: 'Containment',            description: 'Stop the bleeding — short and long-term' },
  { id: 'evidence_preservation', label: 'Evidence Preservation',  description: 'Lock down logs and forensic data' },
  { id: 'notification',          label: 'Notification',           description: 'Regulators, customers, and internal stakeholders' },
  { id: 'eradication',           label: 'Eradication',            description: 'Remove the threat and harden systems' },
  { id: 'recovery',              label: 'Recovery',               description: 'Restore normal operations safely' },
  { id: 'post_incident',         label: 'Post-Incident Review',   description: 'Blameless review and documentation' },
];
