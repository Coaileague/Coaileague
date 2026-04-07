#!/bin/bash
TABLE_LIST=(
  "conversation_encryption_keys"
  "conversation_user_state"
  "contacts"
  "custom_forms"
  "custom_form_submissions"
  "custom_rules"
  "deals"
  "deal_tasks"
  "dm_access_logs"
  "dm_audit_requests"
  "document_retention_log"
  "document_signatures"
  "document_vault"
  "email_drafts"
  "email_events"
  "email_sends"
  "email_sequences"
  "email_templates"
  "email_unsubscribes"
  "external_emails_sent"
  "external_identifiers"
  "inbound_emails"
  "internal_bids"
  "internal_email_folders"
  "internal_email_recipients"
  "internal_emails"
  "internal_mailboxes"
)

echo "| table | rows | schema_imports | fk_refs | verdict | notes |"
echo "|-------|------|----------------|---------|---------|-------|"

for SNAKE in "${TABLE_LIST[@]}"; do
  CAMEL=$(echo "$SNAKE" | sed 's/_\([a-z]\)/\U\1/g')
  ROWS=$(psql $DATABASE_URL -tAq -c "SELECT COUNT(*) FROM ${SNAKE};" 2>/dev/null || echo "NOT_EXIST")
  IMPORTS=$(grep -rn "\b${CAMEL}\b" server/ client/ --include="*.ts" --include="*.tsx" \
    | grep "from.*['\"]@shared/schema\|from.*['\"]../schema\|from.*['\"]./schema\|from.*['\"]shared/schema" \
    | grep -v node_modules | grep -v "\.local" | grep -v "^shared/schema" \
    | wc -l | tr -d ' ')

  if [ "$ROWS" != "NOT_EXIST" ]; then
    FK_REFS=$(psql $DATABASE_URL -tAq -c "
      SELECT COUNT(*) FROM pg_constraint
      WHERE confrelid = '${SNAKE}'::regclass AND contype='f';" 2>/dev/null || echo "0")
  else
    FK_REFS="0"
  fi

  VERDICT="SAFE_TO_DROP"
  NOTES=""
  if [ "$ROWS" = "NOT_EXIST" ]; then
    NOTES="not in DB"
    if [ "$IMPORTS" -gt 0 ]; then
      VERDICT="KEEP"
      NOTES="not in DB but $IMPORTS schema imports found"
    fi
  elif [ "$ROWS" -gt 0 ]; then
    VERDICT="KEEP"
    NOTES="$ROWS rows"
  elif [ "$IMPORTS" -gt 0 ]; then
    VERDICT="KEEP"
    NOTES="$IMPORTS schema imports — camelCase: $CAMEL"
  elif [ "$FK_REFS" -gt 0 ]; then
    VERDICT="KEEP"
    NOTES="FK dep from other table(s)"
  fi

  echo "| $SNAKE | $ROWS | $IMPORTS | $FK_REFS | $VERDICT | $NOTES |"
done
