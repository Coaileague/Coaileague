-- T013: Create missing ai_call_log and universal_audit_log tables
-- These tables were referenced in code but never created via migration.

CREATE TABLE IF NOT EXISTS ai_call_log (
  id                        BIGSERIAL PRIMARY KEY,
  workspace_id              TEXT        NOT NULL,
  period_id                 TEXT,
  model_name                TEXT        NOT NULL,
  model_role                TEXT,
  call_type                 TEXT        NOT NULL,
  input_tokens              INTEGER     NOT NULL DEFAULT 0,
  output_tokens             INTEGER     NOT NULL DEFAULT 0,
  total_tokens              INTEGER     NOT NULL DEFAULT 0,
  cost_microcents           BIGINT      NOT NULL DEFAULT 0,
  triggered_by_user_id      TEXT,
  triggered_by_session_id   TEXT,
  trinity_action_id         TEXT,
  employee_id               TEXT,
  response_time_ms          INTEGER,
  was_cached                BOOLEAN     NOT NULL DEFAULT FALSE,
  fallback_used             BOOLEAN     NOT NULL DEFAULT FALSE,
  fallback_from             TEXT,
  claude_validated          BOOLEAN     NOT NULL DEFAULT FALSE,
  claude_validation_passed  BOOLEAN,
  claude_validation_action  TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_call_log_workspace_created
  ON ai_call_log (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_call_log_period
  ON ai_call_log (period_id)
  WHERE period_id IS NOT NULL;

-- universal_audit_log: append-only audit trail used by Trinity, invoices,
-- and email provisioning. Supports both "action" and "action_type" column
-- naming conventions used by different callers.
CREATE TABLE IF NOT EXISTS universal_audit_log (
  id                 TEXT        NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  workspace_id       TEXT        NOT NULL,
  actor_id           TEXT,
  action             TEXT,
  action_type        TEXT,
  entity_type        TEXT,
  entity_id          TEXT,
  action_description TEXT,
  changes            JSONB,
  new_value          JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS universal_audit_log_workspace_created
  ON universal_audit_log (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS universal_audit_log_action
  ON universal_audit_log (workspace_id, action)
  WHERE action IS NOT NULL;

CREATE INDEX IF NOT EXISTS universal_audit_log_entity
  ON universal_audit_log (workspace_id, entity_type, entity_id)
  WHERE entity_type IS NOT NULL;
