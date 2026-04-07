#!/bin/bash
TABLE_LIST=(
  "support_audit_logs"
  "support_registry"
  "support_rooms"
  "support_sessions"
  "support_ticket_history"
  "support_tickets"
  "support_tickets_escalation"
  "system_audit_logs"
  "room_analytics"
  "room_analytics_timeseries"
  "room_events"
  "terms_acknowledgments"
  "testimonials"
  "kpi_alerts"
  "kpi_alert_triggers"
  "llm_judge_evaluations"
  "llm_judge_regressions"
  "document_vault"
  "locked_report_records"
  "lone_worker_sessions"
  "lost_found_items"
  "maintenance_acknowledgments"
  "maintenance_alerts"
  "managed_api_keys"
  "manager_assignments"
  "manual_clockin_overrides"
  "mascot_interactions"
  "mascot_motion_profiles"
  "mascot_sessions"
  "mascot_tasks"
  "message_deleted_for"
  "meta_cognition_logs"
  "metrics_snapshots"
  "migration_documents"
  "migration_jobs"
)

echo "| table | rows | any_code_refs | fk_deps | verdict | notes |"
echo "|-------|------|---------------|---------|---------|-------|"

for SNAKE in "${TABLE_LIST[@]}"; do
  # Convert snake_case → camelCase
  CAMEL=$(echo "$SNAKE" | sed 's/_\([a-z]\)/\U\1/g')

  # CHECK 1: Row count
  ROWS=$(psql $DATABASE_URL -tAq -c "SELECT COUNT(*) FROM ${SNAKE};" 2>/dev/null || echo "NOT_EXIST")

  # CHECK 2: Any reference ANYWHERE in server/ or client/ source files
  REFS=$(grep -rn "\b${CAMEL}\b" server/ client/ \
    --include="*.ts" --include="*.tsx" \
    | grep -v "node_modules" | grep -v "\.local" \
    | grep -v "shared/schema" \
    | wc -l | tr -d ' ')

  # CHECK 3: FK constraints pointing TO this table
  if [ "$ROWS" != "NOT_EXIST" ]; then
    FK_DEPS=$(psql $DATABASE_URL -tAq -c "
      SELECT COUNT(*) FROM pg_constraint
      WHERE confrelid = '${SNAKE}'::regclass AND contype='f';" 2>/dev/null || echo "0")
  else
    FK_DEPS="0"
  fi

  # Determine verdict
  VERDICT="SAFE_TO_DROP"
  NOTES=""

  if [ "$ROWS" = "NOT_EXIST" ]; then
    NOTES="not in DB"
    VERDICT="NOT_IN_DB"
    [ "$REFS" -gt 0 ] && VERDICT="KEEP" && NOTES="not in DB but $REFS code refs"
  elif [ "$ROWS" -gt 0 ]; then
    VERDICT="KEEP"
    NOTES="${ROWS} rows of data"
  elif [ "$REFS" -gt 0 ]; then
    VERDICT="KEEP"
    NOTES="${REFS} code refs — camelCase: $CAMEL"
  elif [ "$FK_DEPS" -gt 0 ]; then
    VERDICT="INVESTIGATE_FK"
    NOTES="0 rows, 0 refs but $FK_DEPS FK deps"
  fi

  echo "| $SNAKE | $ROWS | $REFS | $FK_DEPS | $VERDICT | $NOTES |"
done
