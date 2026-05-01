import { pool } from '../../db';
import { VOICE_PLATINUM_TIERS } from '../../../shared/billingConfig';
import { createLogger } from '../../lib/logger';
import { NON_BILLING_WORKSPACE_IDS, GRANDFATHERED_TENANT_ID } from './billingConstants';

const log = createLogger('voiceSmsMeteringService');

export class VoiceSmsMeteringService {

  // Protected workspaces (platform support org, grandfathered tenant, system)
  // are tracked for observability but are NEVER billed and NEVER blocked.
  private isProtectedWorkspace(workspaceId: string): boolean {
    if (!workspaceId) return false;
    if (NON_BILLING_WORKSPACE_IDS.has(workspaceId)) return true;
    if (GRANDFATHERED_TENANT_ID && workspaceId === GRANDFATHERED_TENANT_ID) return true;
    return false;
  }

  async recordVoiceCall(params: {
    workspaceId: string;
    callSid: string;
    durationSeconds: number;
    direction: 'inbound' | 'outbound';
    callType: string;
    officerEmployeeId?: string;
    twilioCostCents: number;
  }): Promise<{ billedCents: number; isIncluded: boolean; blocked?: boolean }> {
    try {
      // Protected workspaces: log for observability, never bill, never block
      if (this.isProtectedWorkspace(params.workspaceId)) {
        const minutesBilled = Math.ceil(params.durationSeconds / 60);
        try {
          await pool.query(`
            INSERT INTO voice_sms_event_log (
              workspace_id, event_type, direction, call_sid,
              duration_seconds, duration_minutes_billed,
              is_included, cost_basis_cents, billed_cents, margin_cents,
              officer_employee_id, call_type
            ) VALUES ($1,'voice_call',$2,$3,$4,$5,true,0,0,0,$6,$7)
          `, [
            params.workspaceId, params.direction, params.callSid,
            params.durationSeconds, minutesBilled,
            params.officerEmployeeId ?? null, params.callType,
          ]);
        } catch (e: unknown) {
          log.warn('[VoiceMetering] Protected workspace log failed:', e?.message || String(e));
        }
        return { billedCents: 0, isIncluded: true, blocked: false };
      }

      const minutesBilled = Math.ceil(params.durationSeconds / 60);
      const usage = await this.getOrCreatePeriod(params.workspaceId);
      if (!usage) {
        // Safety net: should never return null now (safe default), but if it does,
        // we still do NOT block — we log and proceed with zero billing.
        log.warn(`[VoiceMetering] Unexpected null period for workspace ${params.workspaceId} — proceeding without billing`);
        return { billedCents: 0, isIncluded: true, blocked: false };
      }

      // No subscription row: safe default returned { id: null, ... } — skip DB writes that require usage.id
      if (!usage.id) {
        return { billedCents: 0, isIncluded: true, blocked: false };
      }

      const newMinutes = usage.minutes_used + minutesBilled;
      const isIncluded = newMinutes <= usage.included_minutes;
      const overageMinutes = isIncluded
        ? 0
        : Math.min(minutesBilled, newMinutes - usage.included_minutes);
      const billedCents = overageMinutes * usage.voice_overage_rate_cents;
      const marginCents = billedCents - params.twilioCostCents;

      await pool.query(`
        INSERT INTO voice_sms_event_log (
          workspace_id, usage_id, event_type, direction,
          call_sid, duration_seconds, duration_minutes_billed,
          is_included, cost_basis_cents, billed_cents,
          margin_cents, officer_employee_id, call_type
        ) VALUES ($1,$2,'voice_call',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `, [
        params.workspaceId, usage.id, params.direction,
        params.callSid, params.durationSeconds, minutesBilled,
        isIncluded, params.twilioCostCents, billedCents,
        marginCents, params.officerEmployeeId ?? null, params.callType,
      ]);

      await pool.query(`
        UPDATE workspace_voice_sms_usage SET
          minutes_used = minutes_used + $1,
          overage_minutes = overage_minutes + $2,
          voice_overage_charges_cents = voice_overage_charges_cents + $3,
          total_overage_charges_cents = total_overage_charges_cents + $3,
          updated_at = NOW()
        WHERE id = $4
      `, [minutesBilled, overageMinutes, billedCents, usage.id]);

      if (newMinutes >= usage.soft_cap_minutes && !usage.soft_cap_voice_warning_sent_at) {
        this.sendSoftCapAlert(params.workspaceId, usage, 'voice', {
          minutesUsed: newMinutes,
          includedMinutes: usage.included_minutes,
          softCap: usage.soft_cap_minutes,
          overageRate: usage.voice_overage_rate_cents,
        }).catch(e => log.error('[VoiceSMS] Soft cap alert error:', e));
      }

      return { billedCents, isIncluded };
    } catch (err) {
      log.error('[VoiceSMS] recordVoiceCall error:', err);
      return { billedCents: 0, isIncluded: true };
    }
  }

  async recordSmsMessage(params: {
    workspaceId: string;
    messageSid: string;
    callType: string;
    twilioCostCents: number;
  }): Promise<{ billedCents: number; isIncluded: boolean; blocked?: boolean }> {
    try {
      // Protected workspaces: log for observability, never bill, never block
      if (this.isProtectedWorkspace(params.workspaceId)) {
        try {
          await pool.query(`
            INSERT INTO voice_sms_event_log (
              workspace_id, event_type, direction, message_sid,
              is_included, cost_basis_cents, billed_cents, margin_cents, call_type
            ) VALUES ($1,'sms_outbound','outbound',$2,true,0,0,0,$3)
          `, [params.workspaceId, params.messageSid, params.callType]);
        } catch (e: unknown) {
          log.warn('[VoiceMetering] Protected workspace SMS log failed:', e?.message || String(e));
        }
        return { billedCents: 0, isIncluded: true, blocked: false };
      }

      const usage = await this.getOrCreatePeriod(params.workspaceId);
      if (!usage || !usage.id) {
        return { billedCents: 0, isIncluded: true, blocked: false };
      }

      const newCount = usage.sms_messages_used + 1;
      const isIncluded = newCount <= usage.included_sms_messages;
      const billedCents = isIncluded ? 0 : usage.sms_overage_rate_cents;
      const marginCents = billedCents - params.twilioCostCents;

      await pool.query(`
        INSERT INTO voice_sms_event_log (
          workspace_id, usage_id, event_type, direction,
          message_sid, is_included, cost_basis_cents,
          billed_cents, margin_cents, call_type
        ) VALUES ($1,$2,'sms_outbound','outbound',$3,$4,$5,$6,$7,$8)
      `, [
        params.workspaceId, usage.id, params.messageSid,
        isIncluded, params.twilioCostCents,
        billedCents, marginCents, params.callType,
      ]);

      await pool.query(`
        UPDATE workspace_voice_sms_usage SET
          sms_messages_used = sms_messages_used + 1,
          sms_overage_count = sms_overage_count + $1,
          sms_overage_charges_cents = sms_overage_charges_cents + $2,
          total_overage_charges_cents = total_overage_charges_cents + $2,
          updated_at = NOW()
        WHERE id = $3
      `, [isIncluded ? 0 : 1, billedCents, usage.id]);

      if (newCount >= usage.soft_cap_sms_messages && !usage.soft_cap_sms_warning_sent_at) {
        this.sendSoftCapAlert(params.workspaceId, usage, 'sms', {
          smsUsed: newCount,
          includedSms: usage.included_sms_messages,
          softCap: usage.soft_cap_sms_messages,
          overageRate: usage.sms_overage_rate_cents,
        }).catch(e => log.error('[VoiceSMS] SMS soft cap alert error:', e));
      }

      return { billedCents, isIncluded };
    } catch (err) {
      log.error('[VoiceSMS] recordSmsMessage error:', err);
      return { billedCents: 0, isIncluded: true };
    }
  }

  async getCurrentPeriodUsage(workspaceId: string): Promise<{
    minutesUsed: number;
    includedMinutes: number;
    smsUsed: number;
    includedSms: number;
    overageChargesCents: number;
    hasPlatinum: boolean;
  }> {
    const usage = await this.getOrCreatePeriod(workspaceId);
    if (!usage || !usage.id) {
      return { minutesUsed: 0, includedMinutes: 0, smsUsed: 0, includedSms: 0, overageChargesCents: 0, hasPlatinum: false };
    }
    return {
      minutesUsed: usage.minutes_used,
      includedMinutes: usage.included_minutes,
      smsUsed: usage.sms_messages_used,
      includedSms: usage.included_sms_messages,
      overageChargesCents: usage.total_overage_charges_cents,
      hasPlatinum: true,
    };
  }

  private async getOrCreatePeriod(workspaceId: string) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString().split('T')[0];
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString().split('T')[0];

    const sub = await pool.query(
      `SELECT * FROM voice_platinum_subscriptions WHERE workspace_id = $1 AND is_active = true`,
      [workspaceId]
    );
    if (!sub.rows[0]) {
      // No active Voice Platinum subscription — return a minimal safe record so
      // calls aren't blocked. Usage is effectively untracked here (no period row),
      // but callers treat { id: null } as "do not persist usage, do not block".
      log.warn(`[VoiceMetering] No active subscription for workspace ${workspaceId} — using safe default (no blocking)`);
      return {
        id: null,
        workspace_id: workspaceId,
        included_minutes: 0,
        included_sms_messages: 0,
        included_recording_minutes: 0,
        voice_overage_rate_cents: 0,
        sms_overage_rate_cents: 0,
        minutes_used: 0,
        sms_messages_used: 0,
        soft_cap_minutes: Number.MAX_SAFE_INTEGER,
        soft_cap_sms_messages: Number.MAX_SAFE_INTEGER,
        soft_cap_voice_warning_sent_at: new Date(),
        soft_cap_sms_warning_sent_at: new Date(),
        total_overage_charges_cents: 0,
      } as any;
    }

    const s = sub.rows[0];
    const existing = await pool.query(
      `SELECT * FROM workspace_voice_sms_usage WHERE workspace_id = $1 AND billing_period_start = $2`,
      [workspaceId, start]
    );
    if (existing.rows[0]) return existing.rows[0];

    const created = await pool.query(`
      INSERT INTO workspace_voice_sms_usage (
        workspace_id, billing_period_start, billing_period_end,
        included_minutes, included_sms_messages, included_recording_minutes,
        voice_overage_rate_cents, sms_overage_rate_cents
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (workspace_id, billing_period_start)
      DO UPDATE SET updated_at = NOW()
      RETURNING *
    `, [
      workspaceId, start, end,
      s.included_minutes, s.included_sms_messages,
      s.included_recording_minutes,
      s.voice_overage_per_minute_cents,
      s.sms_overage_per_message_cents,
    ]);
    return created.rows[0];
  }

  private async sendSoftCapAlert(
    workspaceId: string,
    usage: Record<string, unknown>,
    type: 'voice' | 'sms',
    data: Record<string, unknown>
  ): Promise<void> {
    try {
      const col = type === 'voice' ? 'soft_cap_voice_warning_sent_at' : 'soft_cap_sms_warning_sent_at';
      await pool.query(
        `UPDATE workspace_voice_sms_usage SET ${col} = NOW() WHERE id = $1`,
        [usage.id]
      );
      log.warn(`[VoiceSMS] Soft cap reached for workspace ${workspaceId} — type: ${type}`, data);
    } catch (e) {
      log.error('[VoiceSMS] sendSoftCapAlert error:', e);
    }
  }
}

export const voiceSmsMeteringService = new VoiceSmsMeteringService();
