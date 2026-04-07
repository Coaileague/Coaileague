/**
 * PHASE 36 — RETENTION ENFORCEMENT SERVICE
 *
 * Daily cron at 3 AM UTC:
 * 1. Loads all retention_policies from DB
 * 2. For each policy with a known table_name: scans for records past their retention period
 * 3. Applies the policy's deletion_strategy:
 *    - "anonymize" — replaces PII fields with [ANONYMIZED-{id}] placeholder
 *    - "delete" — hard deletes the rows
 * 4. Logs sweep results to sra_audit_log (append-only)
 * 5. Alerts platform staff on errors via sra_audit_log entry
 */

import { pool } from '../db';
import { createLogger } from '../lib/logger';
const log = createLogger('RetentionEnforcement');
import { universalAudit } from './universalAuditService';

interface RetentionPolicy {
  id: number;
  data_type: string;
  table_name: string | null;
  retention_days: number;
  deletion_strategy: 'anonymize' | 'delete';
  description: string;
  legal_basis: string;
}

interface SweepResult {
  data_type: string;
  table_name: string;
  strategy: string;
  records_reviewed: number;
  records_affected: number;
  errors: string[];
  ran_at: string;
}

// ── Table-specific anonymization/deletion handlers ────────────────────────────

async function enforceSearchQueryLogs(retentionDays: number): Promise<SweepResult> {
  const result: SweepResult = { data_type: 'search_query_logs', table_name: 'search_query_log', strategy: 'delete', records_reviewed: 0, records_affected: 0, errors: [], ran_at: new Date().toISOString() };
  try {
    const countRes = await pool.query(`SELECT COUNT(*) FROM search_query_log WHERE created_at < now() - ($1 || ' days')::interval`, [Math.floor(Number(retentionDays))]);
    result.records_reviewed = parseInt(countRes.rows[0].count, 10);
    if (result.records_reviewed > 0) {
      const del = await pool.query(`DELETE FROM search_query_log WHERE created_at < now() - ($1 || ' days')::interval`, [Math.floor(Number(retentionDays))]);
      result.records_affected = del.rowCount ?? 0;
    }
  } catch (e: any) {
    result.errors.push(e.message);
  }
  return result;
}

async function enforceSupportTickets(retentionDays: number): Promise<SweepResult> {
  const result: SweepResult = { data_type: 'support_tickets', table_name: 'support_tickets', strategy: 'delete', records_reviewed: 0, records_affected: 0, errors: [], ran_at: new Date().toISOString() };
  try {
    const safeRetentionDays = Math.floor(Number(retentionDays));
    const countRes = await pool.query("SELECT COUNT(*) FROM support_tickets WHERE status IN ('closed','resolved') AND updated_at < now() - ($1 || ' days')::interval", [safeRetentionDays]);
    result.records_reviewed = parseInt(countRes.rows[0].count, 10);
    if (result.records_reviewed > 0) {
      const del = await pool.query("DELETE FROM support_tickets WHERE status IN ('closed','resolved') AND updated_at < now() - ($1 || ' days')::interval", [safeRetentionDays]);
      result.records_affected = del.rowCount ?? 0;
    }
  } catch (e: any) {
    result.errors.push(e.message);
  }
  return result;
}

async function enforceIncidentReports(retentionDays: number): Promise<SweepResult> {
  // Incident reports: anonymize PII but keep the record for legal purposes
  const result: SweepResult = { data_type: 'incident_reports', table_name: 'incident_reports', strategy: 'anonymize', records_reviewed: 0, records_affected: 0, errors: [], ran_at: new Date().toISOString() };
  try {
    const safeRetentionDays2 = Math.floor(Number(retentionDays));
    // Find closed incidents past retention (that haven't been anonymized yet)
    const candidates = await pool.query(
      "SELECT id FROM incident_reports WHERE status='closed' AND updated_at < now() - ($1 || ' days')::interval AND raw_description NOT LIKE '[ANONYMIZED%' LIMIT 500",
      [safeRetentionDays2]
    );
    result.records_reviewed = candidates.rows.length;
    for (const row of candidates.rows) {
      try {
        await pool.query(
          `UPDATE incident_reports SET raw_description='[ANONYMIZED-RETENTION]', raw_voice_transcript=NULL, location_address='[ANONYMIZED-RETENTION]' WHERE id=$1`,
          [row.id]
        );
        result.records_affected++;
      } catch (e: any) {
        result.errors.push(`Incident ${row.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    result.errors.push(e.message);
  }
  return result;
}

// ── Main sweep function ───────────────────────────────────────────────────────

export async function runRetentionSweep(): Promise<SweepResult[]> {
  log.info('[RetentionEnforcement] Starting daily retention sweep');
  const startAt = Date.now();
  const results: SweepResult[] = [];

  try {
    // Load policies
    const { rows: policies } = await pool.query<RetentionPolicy>(
      `SELECT * FROM retention_policies ORDER BY data_type`
    );

    // Run handlers for known tables
    for (const policy of policies) {
      if (policy.data_type === 'search_query_logs') {
        results.push(await enforceSearchQueryLogs(policy.retention_days));
      } else if (policy.data_type === 'support_tickets') {
        results.push(await enforceSupportTickets(policy.retention_days));
      } else if (policy.data_type === 'incident_reports') {
        results.push(await enforceIncidentReports(policy.retention_days));
      }
      // payroll_tax_records, employment_records, audit_log — these are append-only or
      // legally required to be kept; we log but do not auto-delete
    }

    const totalAffected = results.reduce((s, r) => s + r.records_affected, 0);
    const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);
    const tookMs = Date.now() - startAt;

    const sweepSummary = {
      ran_at: new Date().toISOString(),
      took_ms: tookMs,
      policies_evaluated: policies.length,
      handlers_run: results.length,
      records_affected: totalAffected,
      errors: totalErrors,
      results: results.map(r => ({ data_type: r.data_type, affected: r.records_affected, errors: r.errors.length })),
    };

    log.info(`[RetentionEnforcement] Sweep complete: ${totalAffected} records affected, ${totalErrors} errors, ${tookMs}ms`);

    // Log sweep results to universalAudit (consolidated)
    await universalAudit.log({
      workspaceId: 'platform',
      actorType: 'system',
      action: 'retention.sweep_completed',
      entityType: 'system',
      entityId: 'daily_retention',
      changeType: 'action',
      metadata: sweepSummary,
    });

    // Alert on errors
    if (totalErrors > 0) {
      await universalAudit.log({
        workspaceId: 'platform',
        actorType: 'system',
        action: 'retention.sweep_errors',
        entityType: 'system',
        entityId: 'daily_retention',
        changeType: 'action',
        metadata: { errors_count: totalErrors, details: results.filter(r => r.errors.length > 0) },
      });
    }

  } catch (err: any) {
    log.error('[RetentionEnforcement] Fatal sweep error:', err.message);
    await universalAudit.log({
      workspaceId: 'platform',
      actorType: 'system',
      action: 'retention.sweep_fatal',
      entityType: 'system',
      entityId: 'daily_retention',
      changeType: 'action',
      metadata: { error: err.message, ran_at: new Date().toISOString() },
    });
  }

  return results;
}

// ── Schedule daily 3 AM UTC cron ──────────────────────────────────────────────

export function scheduleRetentionSweep(): void {
  const msUntil3AM = () => {
    const now = new Date();
    const next3AM = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(),
      now.getUTCDate() + 1, 3, 0, 0, 0
    ));
    return next3AM.getTime() - now.getTime();
  };

  const scheduleNext = () => {
    const delay = msUntil3AM();
    setTimeout(async () => {
      try {
        await runRetentionSweep();
      } catch (err) {
        log.error('[RetentionEnforcement] Cron error:', err);
      }
      scheduleNext();
    }, delay).unref();
    const hours = Math.round(delay / 36000) / 100;
    log.info(`[RetentionEnforcement] Next sweep in ${hours}h (3 AM UTC)`);
  };

  scheduleNext();
  log.info('[RetentionEnforcement] Daily retention sweep cron registered');
}
