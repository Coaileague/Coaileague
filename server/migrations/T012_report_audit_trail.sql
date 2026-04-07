CREATE TABLE IF NOT EXISTS report_audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL,
  report_type VARCHAR(50) NOT NULL DEFAULT 'dar',
  workspace_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  actor_id UUID,
  actor_name VARCHAR(255),
  actor_email VARCHAR(255),
  ip_address VARCHAR(100),
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_audit_trail_report_id ON report_audit_trail(report_id);
CREATE INDEX IF NOT EXISTS idx_report_audit_trail_workspace_id ON report_audit_trail(workspace_id);
CREATE INDEX IF NOT EXISTS idx_report_audit_trail_action ON report_audit_trail(action);
