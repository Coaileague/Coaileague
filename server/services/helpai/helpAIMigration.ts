/**
 * HelpAI v2 Startup Migration
 * ============================
 * Creates the 6 new tables introduced by the HelpAI Complete System spec.
 * USER LAW: pool.query + CREATE TABLE IF NOT EXISTS (no db:push, no Drizzle migration runner).
 * Called once at server startup, idempotent and safe to run multiple times.
 */

import { pool } from '../../db';
import { typedPoolExec } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('helpAIMigration');


export async function runHelpAIV2Migration(): Promise<void> {
  log.info('[HelpAI Migration] Ensuring v2 tables...');

  try {
    // TABLE 1: helpai_conversations — core conversation tracker for new engine
    // CATEGORY C — Raw SQL retained: CREATE TABLE | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE TABLE IF NOT EXISTS helpai_conversations (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id VARCHAR,
        layer VARCHAR NOT NULL DEFAULT 'workspace',
        channel_type VARCHAR NOT NULL DEFAULT 'help_desk',
        channel_id TEXT,
        initiated_by_role TEXT,
        language VARCHAR NOT NULL DEFAULT 'en',
        faith_sensitivity_state VARCHAR NOT NULL DEFAULT 'neutral',
        faith_forward_mode BOOLEAN DEFAULT false,
        status VARCHAR NOT NULL DEFAULT 'active',
        priority VARCHAR NOT NULL DEFAULT 'normal',
        human_handoff_active BOOLEAN DEFAULT false,
        handoff_to TEXT,
        sla_first_response_at TIMESTAMP,
        sla_resolved_at TIMESTAMP,
        sla_first_response_met BOOLEAN,
        sla_resolution_met BOOLEAN,
        satisfaction_response TEXT,
        trinity_escalation_id VARCHAR,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS helpai_conv_workspace_idx ON helpai_conversations(workspace_id)
    `);
    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS helpai_conv_status_idx ON helpai_conversations(status)
    `);
    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS helpai_conv_priority_idx ON helpai_conversations(priority)
    `);
    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS helpai_conv_created_idx ON helpai_conversations(created_at)
    `);

    // TABLE 2: helpai_messages — per-message record with cognitive metadata
    // CATEGORY C — Raw SQL retained: CREATE TABLE | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE TABLE IF NOT EXISTS helpai_messages (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id VARCHAR NOT NULL,
        workspace_id VARCHAR,
        sender VARCHAR NOT NULL DEFAULT 'helpai',
        content TEXT NOT NULL,
        language VARCHAR NOT NULL DEFAULT 'en',
        cognitive_layer_used VARCHAR,
        priority_classification VARCHAR NOT NULL DEFAULT 'normal',
        status_broadcast TEXT,
        processing_started_at TIMESTAMP,
        processing_completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS helpai_msg_conversation_idx ON helpai_messages(conversation_id)
    `);
    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS helpai_msg_workspace_idx ON helpai_messages(workspace_id)
    `);
    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS helpai_msg_created_idx ON helpai_messages(created_at)
    `);

    // TABLE 3: helpai_sla_log — SLA compliance per conversation
    // CATEGORY C — Raw SQL retained: CREATE TABLE | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE TABLE IF NOT EXISTS helpai_sla_log (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id VARCHAR,
        conversation_id VARCHAR NOT NULL,
        layer VARCHAR NOT NULL DEFAULT 'workspace',
        channel_type TEXT,
        first_response_seconds INTEGER,
        resolution_minutes INTEGER,
        first_response_met BOOLEAN NOT NULL DEFAULT false,
        resolution_met BOOLEAN NOT NULL DEFAULT false,
        missed_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS helpai_sla_workspace_idx ON helpai_sla_log(workspace_id)
    `);
    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS helpai_sla_conversation_idx ON helpai_sla_log(conversation_id)
    `);

    // TABLE 4: helpai_faq_gaps — unanswered questions needing new FAQ entries
    // CATEGORY C — Raw SQL retained: CREATE TABLE | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE TABLE IF NOT EXISTS helpai_faq_gaps (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id VARCHAR,
        question_received TEXT NOT NULL,
        language VARCHAR NOT NULL DEFAULT 'en',
        was_answered BOOLEAN NOT NULL DEFAULT false,
        resolution_type TEXT,
        flagged_for_faq_creation BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS helpai_faq_gaps_workspace_idx ON helpai_faq_gaps(workspace_id)
    `);
    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS helpai_faq_gaps_answered_idx ON helpai_faq_gaps(was_answered)
    `);

    // TABLE 5: helpai_proactive_alerts — per-workspace proactive monitoring alerts
    // CATEGORY C — Raw SQL retained: CREATE TABLE | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE TABLE IF NOT EXISTS helpai_proactive_alerts (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id VARCHAR,
        alert_type TEXT NOT NULL,
        alert_source_thread TEXT,
        description TEXT NOT NULL,
        priority VARCHAR NOT NULL DEFAULT 'normal',
        delivered_to TEXT,
        acknowledged BOOLEAN NOT NULL DEFAULT false,
        acknowledged_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS helpai_proactive_workspace_idx ON helpai_proactive_alerts(workspace_id)
    `);
    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS helpai_proactive_ack_idx ON helpai_proactive_alerts(acknowledged)
    `);
    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS helpai_proactive_created_idx ON helpai_proactive_alerts(created_at)
    `);

    // TABLE 6: trinity_helpai_command_bus — bidirectional structured payloads
    // CATEGORY C — Raw SQL retained: CREATE TABLE | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE TABLE IF NOT EXISTS trinity_helpai_command_bus (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id VARCHAR,
        direction VARCHAR NOT NULL,
        message_type VARCHAR NOT NULL,
        priority VARCHAR NOT NULL DEFAULT 'normal',
        payload JSONB NOT NULL DEFAULT '{}',
        status VARCHAR NOT NULL DEFAULT 'sent',
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS trinity_cmd_bus_workspace_idx ON trinity_helpai_command_bus(workspace_id)
    `);
    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS trinity_cmd_bus_direction_idx ON trinity_helpai_command_bus(direction)
    `);
    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS trinity_cmd_bus_status_idx ON trinity_helpai_command_bus(status)
    `);
    // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE INDEX IF NOT EXISTS trinity_cmd_bus_priority_idx ON trinity_helpai_command_bus(priority)
    `);

    log.info('[HelpAI Migration] v2 tables ready (6 tables ensured)');
  } catch (err) {
    log.error('[HelpAI Migration] Migration failed (non-blocking):', err);
  }
}
