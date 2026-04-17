/**
 * Financial Approval Thresholds — Phase 17C
 * =========================================
 * Maps a financial mutation amount to the role required to approve it.
 *
 * Audit 3 (approval gates) flagged that `workflowApprovalService` derives
 * approval requirements from gap-finding *risk levels* but never from
 * *transaction amount*. This helper closes that gap so every financial
 * action can call `requiresFinancialApproval(amount)` and get back a
 * deterministic `{ requiresApproval, requiredRole, riskLevel }` triple.
 *
 * Defaults match the Phase 17C audit spec:
 *   < $5,000     → auto-approved (low risk)
 *   $5k–$10k     → manager approval (high risk)
 *   $10k–$50k    → owner approval (high risk)
 *   > $50k       → sysop approval (critical)
 *
 * Workspaces can override via the workspace_settings table; absent an
 * override, the constants below apply.
 */

import { createLogger } from '../../lib/logger';

const log = createLogger('financialApprovalThresholds');

export type FinancialRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface FinancialApprovalDecision {
  requiresApproval: boolean;
  requiredRole: string | null;
  riskLevel: FinancialRiskLevel;
  threshold: number | null;
  rationale: string;
}

/**
 * Default amount thresholds (USD). Lower bound exclusive, upper bound inclusive.
 */
export const DEFAULT_FINANCIAL_THRESHOLDS = {
  managerThreshold: 5_000,
  ownerThreshold: 10_000,
  sysopThreshold: 50_000,
} as const;

/**
 * Decide whether a financial mutation requires approval based on its amount.
 * Pure function — no DB access. Caller is responsible for creating the
 * approval record via `workflowApprovalService` if `requiresApproval`.
 */
export function requiresFinancialApproval(
  amount: number | string | null | undefined,
  overrides: Partial<typeof DEFAULT_FINANCIAL_THRESHOLDS> = {},
): FinancialApprovalDecision {
  const cfg = { ...DEFAULT_FINANCIAL_THRESHOLDS, ...overrides };
  const numeric = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return {
      requiresApproval: false,
      requiredRole: null,
      riskLevel: 'low',
      threshold: null,
      rationale: 'Zero or non-numeric amount — no approval gate.',
    };
  }

  if (numeric > cfg.sysopThreshold) {
    return {
      requiresApproval: true,
      requiredRole: 'sysop',
      riskLevel: 'critical',
      threshold: cfg.sysopThreshold,
      rationale: `Amount $${numeric.toFixed(2)} exceeds sysop threshold $${cfg.sysopThreshold.toLocaleString()}.`,
    };
  }

  if (numeric > cfg.ownerThreshold) {
    return {
      requiresApproval: true,
      requiredRole: 'org_owner',
      riskLevel: 'high',
      threshold: cfg.ownerThreshold,
      rationale: `Amount $${numeric.toFixed(2)} exceeds owner threshold $${cfg.ownerThreshold.toLocaleString()}.`,
    };
  }

  if (numeric > cfg.managerThreshold) {
    return {
      requiresApproval: true,
      requiredRole: 'manager',
      riskLevel: 'high',
      threshold: cfg.managerThreshold,
      rationale: `Amount $${numeric.toFixed(2)} exceeds manager threshold $${cfg.managerThreshold.toLocaleString()}.`,
    };
  }

  return {
    requiresApproval: false,
    requiredRole: null,
    riskLevel: numeric > cfg.managerThreshold / 2 ? 'medium' : 'low',
    threshold: null,
    rationale: `Amount $${numeric.toFixed(2)} below manager threshold $${cfg.managerThreshold.toLocaleString()}.`,
  };
}

/**
 * Verify whether the actor's role meets the required approval level.
 * Uses the support-role hierarchy used by `workflowApprovalService`:
 *   root_admin > deputy_admin > sysop > org_owner > co_owner > manager
 */
const ROLE_HIERARCHY: Record<string, number> = {
  root_admin: 100,
  deputy_admin: 90,
  sysop: 80,
  org_owner: 70,
  co_owner: 65,
  org_admin: 60,
  org_manager: 55,
  manager: 50,
  department_manager: 45,
  supervisor: 40,
  staff: 20,
  employee: 10,
};

export function actorMeetsApprovalRequirement(
  actorRole: string | null | undefined,
  requiredRole: string | null,
): boolean {
  if (!requiredRole) return true;
  if (!actorRole) return false;
  const actorLevel = ROLE_HIERARCHY[actorRole] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 0;
  if (actorLevel < requiredLevel) {
    log.info('[financialApprovalThresholds] actor below required role', {
      actorRole, requiredRole, actorLevel, requiredLevel,
    });
  }
  return actorLevel >= requiredLevel;
}
