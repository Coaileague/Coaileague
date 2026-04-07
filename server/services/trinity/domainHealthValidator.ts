/**
 * Trinity Domain Health Validator
 * ================================
 * Runtime integrity checker for the 15-domain platform architecture.
 * Uses DOMAIN_CONTRACT as the single source of truth and validates:
 *   1. File existence (routes, services, schema indices)
 *   2. Trinity action coverage per domain
 *   3. Registry alignment
 *
 * Callable via:
 *   - GET /api/trinity/domain-health
 *   - Trinity platform action: trinity.domain_health_check
 *   - Startup logging
 */

import * as fs from "fs";
import * as path from "path";
import { DOMAIN_CONTRACT, DOMAIN_NAMES, type DomainName } from "../../../shared/schema/domains/DOMAIN_CONTRACT";
import { platformActionHub } from "../helpai/platformActionHub";
import { createLogger } from '../../lib/logger';
const log = createLogger('domainHealthValidator');


const WORKSPACE_ROOT = path.resolve(process.cwd());

// Map from DOMAIN_CONTRACT domain key → Trinity action prefixes to check coverage
const DOMAIN_ACTION_PREFIXES: Record<DomainName, string[]> = {
  auth:       ['auth.'],
  orgs:       ['workspace.', 'onboarding.'],
  workforce:  ['employee.', 'hiring.'],
  scheduling: ['scheduling.', 'shift.'],
  time:       ['time.'],
  payroll:    ['payroll.'],
  billing:    ['billing.', 'quickbooks.', 'qb.'],
  trinity:    ['trinity.', 'system.', 'ai.', 'self.', 'proactive.'],
  comms:      ['notify.', 'chat.', 'broadcast.', 'email.'],
  clients:    ['client.'],
  compliance: ['compliance.', 'incident.', 'testing.'],
  audit:      ['analytics.', 'report.'],
  support:    [],
  sales:      [],
  ops:        ['safety.', 'postorders.', 'emergency.', 'external.'],
};

export interface DomainHealthStatus {
  domain: DomainName;
  label: string;
  status: 'healthy' | 'partial' | 'degraded' | 'missing';
  files_ok: number;
  files_missing: number;
  missing_files: string[];
  trinity_action_count: number;
  trinity_action_prefixes: string[];
  issues: string[];
  score: number;
}

export interface PlatformHealthReport {
  generated_at: string;
  overall_status: 'healthy' | 'partial' | 'degraded';
  total_domains: number;
  healthy_domains: number;
  partial_domains: number;
  degraded_domains: number;
  total_trinity_actions: number;
  domains_with_no_trinity_actions: string[];
  domains: DomainHealthStatus[];
  top_issues: string[];
}

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(WORKSPACE_ROOT, relativePath));
}

function checkDomainFiles(domainKey: DomainName): { ok: number; missing: string[] } {
  const contract = DOMAIN_CONTRACT[domainKey];
  const allFiles = [
    contract.schemaIndex,
    ...contract.routes,
    ...contract.services,
  ];

  const missing: string[] = [];
  let ok = 0;

  for (const f of allFiles) {
    if (fileExists(f)) {
      ok++;
    } else {
      missing.push(f);
    }
  }

  return { ok, missing };
}

function countTrinityActionsForDomain(domain: DomainName): { count: number; actions: string[] } {
  const prefixes = DOMAIN_ACTION_PREFIXES[domain];
  if (!prefixes || prefixes.length === 0) return { count: 0, actions: [] };

  const allActions = platformActionHub.getRegisteredActions();
  const matched: string[] = [];

  for (const action of allActions) {
    for (const prefix of prefixes) {
      if (action.actionId?.startsWith(prefix)) {
        matched.push(action.actionId);
        break;
      }
    }
  }

  return { count: matched.length, actions: matched };
}

function scoreStatus(filesMissing: number, filesOk: number, trinityCount: number, prefixes: string[]): {
  status: DomainHealthStatus['status'];
  score: number;
} {
  const totalFiles = filesMissing + filesOk;
  const fileScore = totalFiles > 0 ? (filesOk / totalFiles) * 100 : 100;
  const actionScore = prefixes.length === 0 ? 100 : Math.min(100, trinityCount * 10);
  const score = Math.round((fileScore * 0.6) + (actionScore * 0.4));

  let status: DomainHealthStatus['status'];
  if (score >= 85 && filesMissing === 0) status = 'healthy';
  else if (score >= 60) status = 'partial';
  else if (score >= 30) status = 'degraded';
  else status = 'missing';

  return { status, score };
}

export function runDomainHealthCheck(): PlatformHealthReport {
  const domainResults: DomainHealthStatus[] = [];
  const allTopIssues: string[] = [];

  for (const domainKey of DOMAIN_NAMES) {
    const contract = DOMAIN_CONTRACT[domainKey];
    const { ok, missing } = checkDomainFiles(domainKey);
    const { count: trinityCount } = countTrinityActionsForDomain(domainKey);
    const prefixes = DOMAIN_ACTION_PREFIXES[domainKey];

    const issues: string[] = [];
    if (missing.length > 0) {
      issues.push(`${missing.length} missing file(s)`);
    }
    if (prefixes.length > 0 && trinityCount === 0) {
      issues.push(`No Trinity actions registered for domain`);
    } else if (prefixes.length > 0 && trinityCount < 3) {
      issues.push(`Low Trinity action coverage (${trinityCount} actions)`);
    }

    const { status, score } = scoreStatus(missing.length, ok, trinityCount, prefixes);

    if (status === 'degraded' || status === 'missing') {
      allTopIssues.push(`[${domainKey}] ${issues.join('; ')}`);
    }

    domainResults.push({
      domain: domainKey,
      label: contract.label,
      status,
      files_ok: ok,
      files_missing: missing.length,
      missing_files: missing.slice(0, 5),
      trinity_action_count: trinityCount,
      trinity_action_prefixes: prefixes,
      issues,
      score,
    });
  }

  const healthy = domainResults.filter(d => d.status === 'healthy').length;
  const partial = domainResults.filter(d => d.status === 'partial').length;
  const degraded = domainResults.filter(d => d.status === 'degraded' || d.status === 'missing').length;
  const noActions = domainResults
    .filter(d => d.trinity_action_count === 0 && d.trinity_action_prefixes.length > 0)
    .map(d => d.domain);

  const totalActions = platformActionHub.getRegisteredActions().length;

  let overall: PlatformHealthReport['overall_status'];
  if (degraded === 0 && partial <= 2) overall = 'healthy';
  else if (degraded <= 2) overall = 'partial';
  else overall = 'degraded';

  return {
    generated_at: new Date().toISOString(),
    overall_status: overall,
    total_domains: DOMAIN_NAMES.length,
    healthy_domains: healthy,
    partial_domains: partial,
    degraded_domains: degraded,
    total_trinity_actions: totalActions,
    domains_with_no_trinity_actions: noActions,
    domains: domainResults,
    top_issues: allTopIssues.slice(0, 10),
  };
}

export function logDomainHealthSummary(): void {
  try {
    const report = runDomainHealthCheck();
    const statusIcon = report.overall_status === 'healthy' ? '✅' : report.overall_status === 'partial' ? '⚠️' : '❌';
    log.info(`[DomainHealth] ${statusIcon} Platform ${report.overall_status.toUpperCase()}: ${report.healthy_domains}/${report.total_domains} domains healthy, ${report.total_trinity_actions} Trinity actions registered`);
    if (report.top_issues.length > 0) {
      log.info(`[DomainHealth] Top issues:`);
      for (const issue of report.top_issues) {
        log.info(`[DomainHealth]   - ${issue}`);
      }
    }
    if (report.domains_with_no_trinity_actions.length > 0) {
      log.info(`[DomainHealth] Domains with 0 Trinity actions: ${report.domains_with_no_trinity_actions.join(', ')}`);
    }
  } catch (err) {
    log.error('[DomainHealth] Failed to run health check:', err);
  }
}
