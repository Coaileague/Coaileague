import type { ActionCategory, ActionHandler } from './platformActionHub';

export const TRINITY_ACTION_CATALOG_MAX = 280;

export type ActionCatalogVisibility = 'trinity' | 'internal' | 'legacy';

export interface ActionCatalogOptions {
  includeInternal?: boolean;
  category?: string;
  maxActions?: number;
}

export interface ActionCatalogEntry extends ActionHandler {
  canonicalActionId: string;
  ownerDomain: string;
  catalogVisibility: ActionCatalogVisibility;
}

const DOMAIN_OWNER_BY_PREFIX: Record<string, string> = {
  admin: 'Platform Admin',
  ai: 'Trinity Brain',
  analytics: 'Analytics',
  api: 'Developer Platform',
  approval_gate: 'Automation Governance',
  armory: 'Field Operations',
  automation: 'Automation Governance',
  automation_trigger: 'Automation Governance',
  billing: 'Billing',
  cad: 'Field Operations',
  chat: 'ChatDock',
  client: 'Client Management',
  clients: 'Client Management',
  comm: 'Communications',
  compliance: 'Compliance',
  contracts: 'Contracts',
  diagnostics: 'Platform Diagnostics',
  document: 'Documents',
  documents: 'Documents',
  email: 'Email',
  employee: 'Workforce',
  employees: 'Workforce',
  escalation: 'Platform Health',
  esignature: 'Documents',
  features: 'Platform Admin',
  forms: 'Forms',
  governance: 'Automation Governance',
  helpai: 'HelpAI',
  hris: 'Integrations',
  inbound: 'Email',
  integrations: 'Integrations',
  invoice: 'Billing',
  memory: 'Trinity Brain',
  notification_ack: 'Notifications',
  notify: 'Notifications',
  onboarding: 'Onboarding',
  orchestration: 'Automation Governance',
  payroll: 'Payroll',
  permissions: 'RBAC',
  quickbooks: 'Integrations',
  qb: 'Integrations',
  rms: 'Compliance',
  safety: 'Field Safety',
  schedule: 'Scheduling',
  scheduling: 'Scheduling',
  services: 'Platform Health',
  shiftroom: 'ChatDock',
  strategic: 'Trinity Strategy',
  system: 'Platform Health',
  tax: 'Tax',
  test: 'Diagnostics',
  time_tracking: 'Timekeeping',
  trinity: 'Trinity Brain',
  uacp: 'Platform Admin',
  ui: 'UX Shell',
  ui_shell: 'UX Shell',
  universal: 'Platform Intelligence',
  voice: 'Voice',
  workflow: 'Workflow Automation',
  work_order: 'Field Operations',
  workorder: 'Field Operations',
  workspace: 'Workspace Admin',
};

const LEGACY_ACTION_ALIASES: Record<string, string> = {
  create_invoice_batch: 'billing.batch_generate_invoices',
  fill_open_shifts: 'scheduling.fill_open_shift',
  generate_schedule: 'scheduling.generate_ai_schedule',
  notifications_get_stats: 'notify.stats',
  optimize_schedule: 'scheduling.generate_ai_schedule',
  process_payroll: 'payroll.run_payroll',
  send_invoice_reminders: 'billing.schedule_invoice_followup',
  'billing.generate_invoices': 'billing.batch_generate_invoices',
  'billing.invoice': 'billing.invoice_create',
  'billing.invoice_generate': 'billing.generate_invoice_traced',
  'billing.invoice_send': 'billing.mark_invoice_sent',
  'billing.invoices_get': 'billing.invoice_summary',
  'document.generate_invoice_pdf': 'billing.invoice_pdf',
  'notify.delivery_stats': 'notify.stats',
  'notify.mark_all_read': 'notify.manage',
  'notifications.get_stats': 'notify.stats',
  'payroll.approve_timesheets': 'payroll.approve_timesheet',
  'payroll.bulk_process': 'payroll.run_payroll',
  'report.payroll_summary': 'analytics.payroll_summary',
  'schedule.check_availability': 'scheduling.get_shifts',
  'schedule.pending_trades': 'scheduling.lifecycle_get_pending_swaps',
  'schedule.query': 'scheduling.get_shifts',
  'schedule.trade_marketplace': 'scheduling.request_shift_swap',
  'strategic.generate_schedule': 'scheduling.generate_ai_schedule',
  'system.health': 'system.health_check',
  'system.service_status': 'services.get_status',
  'workorder.get_summary': 'work_order.status_summary',
  'workorder.status': 'work_order.status_summary',
};

const INTERNAL_PREFIXES = new Set([
  'api',
  'approval_gate',
  'automation_trigger',
  'coding',
  'deployment',
  'diagnostics',
  'execution',
  'execution_tracker',
  'handler_ops',
  'hook_ops',
  'judge',
  'log_ops',
  'schema_ops',
  'spec',
  'test',
  'uacp',
]);

const CORE_OWNER_PRIORITY = new Map<string, number>([
  ['Scheduling', 0],
  ['Payroll', 1],
  ['Billing', 2],
  ['Timekeeping', 3],
  ['Workforce', 4],
  ['Client Management', 5],
  ['Field Operations', 6],
  ['Field Safety', 7],
  ['Compliance', 8],
  ['Documents', 9],
  ['Notifications', 10],
  ['ChatDock', 11],
  ['Integrations', 12],
  ['Automation Governance', 13],
  ['Trinity Brain', 14],
  ['Platform Health', 15],
]);

const HIGH_VALUE_VERBS = [
  'approve',
  'assign',
  'cancel',
  'create',
  'execute',
  'fill',
  'generate',
  'publish',
  'reassign',
  'run',
  'send',
  'update',
  'void',
];

export function resolveCanonicalActionId(actionId: string): string {
  return LEGACY_ACTION_ALIASES[actionId] ?? actionId;
}

export function getActionOwnerDomain(actionId: string, category?: ActionCategory): string {
  const canonicalId = resolveCanonicalActionId(actionId);
  const prefix = canonicalId.split('.')[0] || actionId.split('.')[0] || String(category ?? 'uncategorized');
  return DOMAIN_OWNER_BY_PREFIX[prefix] ?? DOMAIN_OWNER_BY_PREFIX[String(category ?? '')] ?? 'Platform Misc';
}

export function getActionCatalogVisibility(action: ActionHandler): ActionCatalogVisibility {
  if (resolveCanonicalActionId(action.actionId) !== action.actionId) return 'legacy';
  const prefix = action.actionId.split('.')[0];
  if (action.isDeferred || action.isTestTool || INTERNAL_PREFIXES.has(prefix)) return 'internal';
  return action.catalogVisibility ?? 'trinity';
}

export function toActionCatalogEntry(action: ActionHandler): ActionCatalogEntry {
  return {
    ...action,
    canonicalActionId: resolveCanonicalActionId(action.actionId),
    ownerDomain: action.ownerDomain ?? getActionOwnerDomain(action.actionId, action.category),
    catalogVisibility: getActionCatalogVisibility(action),
  };
}

function getActionPriorityScore(action: ActionCatalogEntry): number {
  let score = CORE_OWNER_PRIORITY.get(action.ownerDomain) ?? 50;
  if (action.catalogVisibility === 'legacy') score += 100;
  if (action.catalogVisibility === 'internal') score += 200;
  if (action.isDeferred) score += 250;
  if (action.isTestTool) score += 250;

  const actionId = action.canonicalActionId.toLowerCase();
  if (HIGH_VALUE_VERBS.some((verb) => actionId.includes(`.${verb}`) || actionId.includes(`_${verb}`))) {
    score -= 0.5;
  }
  if (actionId.includes('.get_') || actionId.includes('.list') || actionId.includes('.status') || actionId.includes('.summary')) {
    score += 0.25;
  }
  return score;
}

export function buildTrinityActionCatalog(
  actions: ActionHandler[],
  options: ActionCatalogOptions = {},
): ActionCatalogEntry[] {
  const maxActions = options.maxActions ?? TRINITY_ACTION_CATALOG_MAX;
  const byCanonicalId = new Map<string, ActionCatalogEntry>();

  for (const action of actions) {
    const entry = toActionCatalogEntry(action);
    if (!options.includeInternal && entry.catalogVisibility !== 'trinity') continue;
    if (options.category && entry.category !== options.category && !entry.canonicalActionId.startsWith(`${options.category}.`)) {
      continue;
    }

    const existing = byCanonicalId.get(entry.canonicalActionId);
    if (!existing || compareActionCatalogEntries(entry, existing) < 0) {
      byCanonicalId.set(entry.canonicalActionId, entry);
    }
  }

  return Array.from(byCanonicalId.values())
    .sort(compareActionCatalogEntries)
    .slice(0, maxActions);
}

export function compareActionCatalogEntries(a: ActionCatalogEntry, b: ActionCatalogEntry): number {
  const scoreDelta = getActionPriorityScore(a) - getActionPriorityScore(b);
  if (scoreDelta !== 0) return scoreDelta;
  return a.canonicalActionId.localeCompare(b.canonicalActionId);
}

export function getActionCatalogReport(actions: ActionHandler[]): {
  registeredActions: number;
  uniqueActionIds: number;
  trinityCatalogActions: number;
  internalActions: number;
  legacyAliasActions: number;
  duplicateActionIds: string[];
  byOwnerDomain: Record<string, number>;
  aliases: Record<string, string>;
  maxCatalogActions: number;
} {
  const entries = actions.map(toActionCatalogEntry);
  const ids = actions.map((action) => action.actionId);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  const byOwnerDomain: Record<string, number> = {};
  for (const entry of entries) {
    byOwnerDomain[entry.ownerDomain] = (byOwnerDomain[entry.ownerDomain] || 0) + 1;
  }

  return {
    registeredActions: actions.length,
    uniqueActionIds: new Set(ids).size,
    trinityCatalogActions: buildTrinityActionCatalog(actions).length,
    internalActions: entries.filter((entry) => entry.catalogVisibility === 'internal').length,
    legacyAliasActions: entries.filter((entry) => entry.catalogVisibility === 'legacy').length,
    duplicateActionIds: Array.from(new Set(duplicates)).sort(),
    byOwnerDomain,
    aliases: LEGACY_ACTION_ALIASES,
    maxCatalogActions: TRINITY_ACTION_CATALOG_MAX,
  };
}
