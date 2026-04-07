/**
 * Source-of-Truth Registry
 *
 * CANONICAL AUTHORITY: This file is the single definition of which service,
 * route file, and frontend page owns each feature domain.
 *
 * Trinity reads this registry at startup and uses it to:
 *  1. Validate that no two systems claim ownership of the same domain
 *  2. Route all AI-dispatched automation tasks to the correct canonical handler
 *  3. Reject requests that try to invoke a non-canonical path for a domain
 *
 * RULES:
 *  - Every domain MUST have exactly ONE canonical entry
 *  - If a legacy alias exists, it must reference the canonical entry
 *  - Never bypass the canonical route — always use the registered service
 */
import { DOMAIN_NAMES } from "../../shared/schema/domains/DOMAIN_CONTRACT";
import { createLogger } from '../lib/logger';
const log = createLogger('sourceOfTruthRegistry');


export interface DomainEntry {
  domain: string;
  description: string;
  canonicalApiPrefix: string;
  canonicalRouteFile: string;
  canonicalService: string | null;
  frontendPage: string | null;
  legacyAliases: string[];
  trinityCan: string[];
  humanGateRequired: boolean;
}

const registry: DomainEntry[] = [
  // ── Auth ──────────────────────────────────────────────────────────────────
  {
    domain: 'auth',
    description: 'User authentication, sessions, account security, and password management',
    canonicalApiPrefix: '/api/auth',
    canonicalRouteFile: 'server/routes/authCoreRoutes.ts',
    canonicalService: 'server/auth.ts',
    frontendPage: 'client/src/pages/custom-login.tsx',
    legacyAliases: [],
    trinityCan: ['check_session', 'verify_user_identity'],
    humanGateRequired: false,
  },

  // ── Workforce / Employees ─────────────────────────────────────────────────
  {
    domain: 'employees',
    description: 'Employee records, profiles, roles, and HRIS data',
    canonicalApiPrefix: '/api/employees',
    canonicalRouteFile: 'server/routes/domains/workforce.ts',
    canonicalService: null, // Multiple services (ownerManagerEmployeeService, employeeDocumentOnboardingService)
    frontendPage: 'client/src/pages/employees.tsx',
    legacyAliases: ['/api/hris'],
    trinityCan: ['get_profile', 'update_role', 'initiate_onboarding', 'initiate_offboarding', 'flag_performance'],
    humanGateRequired: false,
  },

  // ── Scheduling ────────────────────────────────────────────────────────────
  {
    domain: 'scheduling',
    description: 'Shift creation, publishing, swaps, availability, and AI-driven schedule generation',
    canonicalApiPrefix: '/api/shifts',
    canonicalRouteFile: 'server/routes/domains/scheduling.ts',
    canonicalService: 'server/services/advancedSchedulingService.ts',
    frontendPage: 'client/src/pages/universal-schedule.tsx',
    legacyAliases: ['/api/scheduler', '/api/availability'],
    trinityCan: ['publish_shifts', 'find_coverage', 'detect_conflicts', 'suggest_swap'],
    humanGateRequired: true,
  },

  // ── Time Tracking ─────────────────────────────────────────────────────────
  {
    domain: 'time_tracking',
    description: 'Clock-in/out, time entries, timesheets, and manager approvals',
    canonicalApiPrefix: '/api/time-entries',
    canonicalRouteFile: 'server/routes/domains/time.ts',
    canonicalService: 'server/services/timeEntryService.ts',
    frontendPage: 'client/src/pages/time-tracking.tsx',
    legacyAliases: ['/api/timesheets'],
    trinityCan: ['generate_from_clockdata', 'auto_approve_clean', 'flag_exceptions', 'get_period_summary'],
    humanGateRequired: true,
  },

  // ── Payroll ───────────────────────────────────────────────────────────────
  {
    domain: 'payroll',
    description: 'Payroll runs, pay stubs, deductions, tax calculations, and QB sync',
    canonicalApiPrefix: '/api/payroll',
    canonicalRouteFile: 'server/routes/domains/payroll.ts',
    canonicalService: 'server/services/payrollAutomation.ts',
    frontendPage: 'client/src/pages/payroll-dashboard.tsx',
    legacyAliases: ['/api/expenses'],
    trinityCan: ['run_cycle', 'calculate_employee', 'validate_math', 'generate_paystub', 'push_to_qb'],
    humanGateRequired: true,
  },

  // ── Billing / Credits ─────────────────────────────────────────────────────
  {
    domain: 'billing',
    description: 'Stripe subscriptions, invoices, credit ledger, and AI token metering',
    canonicalApiPrefix: '/api/billing',
    canonicalRouteFile: 'server/routes/domains/billing.ts',
    canonicalService: 'server/services/billing/creditsLedgerService.ts',
    frontendPage: 'client/src/pages/billing.tsx',
    legacyAliases: ['/api/stripe'],
    trinityCan: ['aging_report', 'collection_priority', 'revenue_forecast'],
    humanGateRequired: true,
  },

  // ── Clients ───────────────────────────────────────────────────────────────
  {
    domain: 'clients',
    description: 'Client accounts, sites, contracts, SLA terms, and billing settings',
    canonicalApiPrefix: '/api/clients',
    canonicalRouteFile: 'server/routes/domains/clients.ts',
    canonicalService: 'server/services/clientProspectService.ts',
    frontendPage: 'client/src/pages/clients.tsx',
    legacyAliases: [],
    trinityCan: ['get_full_profile', 'get_site_details', 'update_billing_settings', 'health_score', 'flag_sla_risk'],
    humanGateRequired: false,
  },

  // ── Compliance ────────────────────────────────────────────────────────────
  {
    domain: 'compliance',
    description: 'Document management, certifications, PERC cards, I-9, and audit logs',
    canonicalApiPrefix: '/api/compliance',
    canonicalRouteFile: 'server/routes/domains/compliance.ts',
    canonicalService: 'server/services/compliance/complianceEnforcementService.ts',
    frontendPage: 'client/src/pages/compliance/index.tsx',
    legacyAliases: ['/api/documents', '/api/i9'],
    trinityCan: ['run_full_scan', 'check_officer', 'flag_expiring', 'request_document', 'run_compliance_report'],
    humanGateRequired: false,
  },

  // ── Incidents / Ops ───────────────────────────────────────────────────────
  {
    domain: 'ops',
    description: 'Incident reports, RMS, CAD dispatch, guard tours, and field operations',
    canonicalApiPrefix: '/api/incidents',
    canonicalRouteFile: 'server/routes/domains/ops.ts',
    canonicalService: 'server/services/incidentRoutingService.ts',
    frontendPage: 'client/src/pages/rms-hub.tsx',
    legacyAliases: ['/api/rms', '/api/cad'],
    trinityCan: ['create', 'escalate', 'notify_client', 'flag_compliance', 'get_history'],
    humanGateRequired: false,
  },

  // ── Communications (Chat) ─────────────────────────────────────────────────
  {
    domain: 'communications',
    description: 'IRC/MSN-style chat rooms, messages, and the ChatServerHub real-time engine',
    canonicalApiPrefix: '/api/chat',
    canonicalRouteFile: 'server/routes/chat-rooms.ts',
    canonicalService: 'server/services/ChatServerHub.ts',
    frontendPage: 'client/src/pages/chatrooms.tsx',
    legacyAliases: ['/api/conversations', '/api/messages'],
    trinityCan: ['send_message', 'get_conversations_by_entity'],
    humanGateRequired: false,
  },

  // ── Help Desk / Support ───────────────────────────────────────────────────
  {
    domain: 'helpdesk',
    description: 'HelpAI-powered support chat. Canonical room: slug=helpdesk, workspaceId=null',
    canonicalApiPrefix: '/api/helpdesk',
    canonicalRouteFile: 'server/routes/domains/support.ts',
    canonicalService: 'server/services/helpai/helpAIBotService.ts',
    frontendPage: 'client/src/pages/helpdesk.tsx',
    legacyAliases: ['/api/support'],
    trinityCan: ['faq_search', 'escalate_to_human'],
    humanGateRequired: false,
  },

  // ── AI Brain / Trinity Intelligence ───────────────────────────────────────
  {
    domain: 'trinity',
    description: 'Trinity AI orchestration, knowledge graph, domain bots, and platform automation',
    canonicalApiPrefix: '/api/trinity',
    canonicalRouteFile: 'server/routes/domains/trinity.ts',
    canonicalService: 'server/services/ai-brain/aiBrainMasterOrchestrator.ts',
    frontendPage: 'client/src/pages/trinity-chat.tsx',
    legacyAliases: ['/api/ai-brain', '/api/ai-orchestrator', '/api/ai/orchestra'],
    trinityCan: ['all'],
    humanGateRequired: false,
  },

  // ── Automation Engine ─────────────────────────────────────────────────────
  {
    domain: 'automation',
    description: 'Workflow definitions, execution engine, triggers, and platform automations',
    canonicalApiPrefix: '/api/automation',
    canonicalRouteFile: 'server/routes/automation.ts',
    canonicalService: 'server/services/autonomousScheduler.ts',
    frontendPage: 'client/src/pages/automation-control.tsx',
    legacyAliases: ['/api/workflows', '/api/automation-events'],
    trinityCan: ['trigger_workflow', 'get_execution_status', 'cancel_workflow'],
    humanGateRequired: false,
  },

  // ── Sales / Proposals ────────────────────────────────────────────────────
  {
    domain: 'sales',
    description: 'Proposals, leads, RFPs, pricing, and client acquisition pipeline',
    canonicalApiPrefix: '/api/proposals',
    canonicalRouteFile: 'server/routes/domains/sales.ts',
    canonicalService: 'server/services/clientProspectService.ts',
    frontendPage: 'client/src/pages/proposal-builder.tsx',
    legacyAliases: ['/api/leads'],
    trinityCan: ['get_pipeline_status', 'draft_proposal'],
    humanGateRequired: true,
  },

  // ── Workspace / Orgs ─────────────────────────────────────────────────────
  {
    domain: 'workspace',
    description: 'Workspace settings, multi-tenancy, onboarding flows, and org configuration',
    canonicalApiPrefix: '/api/workspace',
    canonicalRouteFile: 'server/routes/domains/orgs.ts',
    canonicalService: 'server/services/session/sessionWorkspaceService.ts',
    frontendPage: 'client/src/pages/workspace.tsx',
    legacyAliases: ['/api/onboarding'],
    trinityCan: ['get_org_context', 'check_workspace_health'],
    humanGateRequired: false,
  },

  // ── Notifications ─────────────────────────────────────────────────────────
  {
    domain: 'notifications',
    description: 'Push, email, SMS, and in-app notification delivery. Canonical engine: universalNotificationEngine',
    canonicalApiPrefix: '/api/notifications',
    canonicalRouteFile: 'server/routes/domains/comms.ts',
    canonicalService: 'server/services/universalNotificationEngine.ts',
    frontendPage: null,
    legacyAliases: [],
    trinityCan: ['push', 'sms', 'email_officer', 'email_manager', 'email_client', 'broadcast'],
    humanGateRequired: false,
  },

  // ── QuickBooks Integration ────────────────────────────────────────────────
  {
    domain: 'quickbooks',
    description: 'QuickBooks OAuth, invoice push, payroll sync. Canonical: Phase 3 service.',
    canonicalApiPrefix: '/api/quickbooks',
    canonicalRouteFile: 'server/routes/quickbooksPhase3Routes.ts',
    canonicalService: 'server/services/partners/quickbooksPhase3Service.ts',
    frontendPage: 'client/src/pages/settings.tsx',
    legacyAliases: ['/api/quickbooks/sync'],
    trinityCan: ['push_invoice', 'sync_payroll', 'get_balance'],
    humanGateRequired: false,
  },

  // ── Audit / Platform Health ───────────────────────────────────────────────
  {
    domain: 'audit',
    description: 'Audit logs, platform health checks, API docs, and schema parity',
    canonicalApiPrefix: '/api/audit',
    canonicalRouteFile: 'server/routes/domains/audit.ts',
    canonicalService: 'server/services/universalAuditService.ts',
    frontendPage: 'client/src/pages/audit-logs.tsx',
    legacyAliases: ['/api/platform'],
    trinityCan: ['trinity_audit_log', 'confidence_score', 'triad_status'],
    humanGateRequired: false,
  },
];

// ─── Validation ────────────────────────────────────────────────────────────

function validateRegistry(): void {
  const prefixes = registry.map(e => e.canonicalApiPrefix);
  const dupes = prefixes.filter((p, i) => prefixes.indexOf(p) !== i);
  if (dupes.length > 0) {
    log.error('[SourceOfTruthRegistry] CONFLICT DETECTED — duplicate canonical prefixes:', dupes);
  }

  const domains = registry.map(e => e.domain);
  const dupeDomains = domains.filter((d, i) => domains.indexOf(d) !== i);
  if (dupeDomains.length > 0) {
    log.error('[SourceOfTruthRegistry] CONFLICT DETECTED — duplicate domain names:', dupeDomains);
  }
}

/**
 * DOMAIN_CONTRACT cross-reference map.
 * Registry uses legacy/operational names; contract uses canonical architectural names.
 * This map translates between the two systems.
 */
const REGISTRY_TO_CONTRACT_MAP: Record<string, string> = {
  auth:           'auth',
  employees:      'workforce',
  workspace:      'orgs',
  scheduling:     'scheduling',
  time_tracking:  'time',
  payroll:        'payroll',
  billing:        'billing',
  trinity:        'trinity',
  communications: 'comms',
  clients:        'clients',
  compliance:     'compliance',
  audit:          'audit',
  helpdesk:       'support',
  sales:          'sales',
  ops:            'ops',
};

/**
 * Validates the runtime registry against DOMAIN_CONTRACT.
 * Logs discrepancies at startup so they are visible in server logs.
 * Does NOT throw — registry mismatches are warnings, not fatal.
 */
export function validateAgainstContract(): void {
  try {
    const contractDomains: string[] = [...DOMAIN_NAMES];
    const registryDomainKeys = registry.map(e => e.domain);
    const mappedContractDomains = registryDomainKeys
      .map(k => REGISTRY_TO_CONTRACT_MAP[k])
      .filter(Boolean);

    const unmappedRegistryDomains = registryDomainKeys.filter(k => !REGISTRY_TO_CONTRACT_MAP[k]);
    const missingFromRegistry = contractDomains.filter(d => !mappedContractDomains.includes(d));
    const extraInRegistry = unmappedRegistryDomains.filter(
      d => !['automation', 'notifications', 'quickbooks'].includes(d)
    );

    if (missingFromRegistry.length > 0) {
      log.warn(
        `[SourceOfTruthRegistry] DOMAIN_CONTRACT domains NOT covered by registry: ${missingFromRegistry.join(', ')}`
      );
    }
    if (extraInRegistry.length > 0) {
      log.warn(
        `[SourceOfTruthRegistry] Registry domains with no DOMAIN_CONTRACT mapping: ${extraInRegistry.join(', ')}`
      );
    }
    if (missingFromRegistry.length === 0 && extraInRegistry.length === 0) {
      log.info(`[SourceOfTruthRegistry] Contract alignment check passed — all 15 contract domains covered`);
    }
  } catch (err) {
    log.warn('[SourceOfTruthRegistry] Could not validate against DOMAIN_CONTRACT:', err);
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export function getSourceOfTruthRegistry(): DomainEntry[] {
  return registry;
}

export function getCanonicalEntry(domain: string): DomainEntry | undefined {
  return registry.find(e => e.domain === domain);
}

export function resolveCanonicalPrefix(requestedPrefix: string): DomainEntry | undefined {
  return registry.find(e =>
    e.canonicalApiPrefix === requestedPrefix ||
    e.legacyAliases.includes(requestedPrefix)
  );
}

export function getDomainsThatRequireHumanGate(): DomainEntry[] {
  return registry.filter(e => e.humanGateRequired);
}

export function printRegistryAtStartup(): void {
  validateRegistry();
  const lines = registry.map(e => {
    const aliases = e.legacyAliases.length > 0 ? ` (aliases: ${e.legacyAliases.join(', ')})` : '';
    const gate = e.humanGateRequired ? ' [HUMAN GATE]' : '';
    return `  ${e.domain.padEnd(20)} → ${e.canonicalApiPrefix}${aliases}${gate}`;
  });
  log.info('[SourceOfTruthRegistry] Canonical domain registry loaded:\n' + lines.join('\n'));
}
