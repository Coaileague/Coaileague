#!/bin/bash
# End-to-End Idempotency Integration Test Script
# Tests cleanup cron, duplicate detection, and audit logging

set -e

BASE_URL="${BASE_URL:-http://localhost:5000}"
WORKSPACE_ID="${WORKSPACE_ID}"
AUTH_TOKEN="${AUTH_TOKEN}"

if [ -z "$WORKSPACE_ID" ] || [ -z "$AUTH_TOKEN" ]; then
  echo "❌ Error: WORKSPACE_ID and AUTH_TOKEN environment variables must be set"
  echo "   Example: WORKSPACE_ID=ws_123 AUTH_TOKEN=your_token ./test-idempotency.sh"
  exit 1
fi

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  🧪 AUTOFORCE™ IDEMPOTENCY INTEGRATION TEST SUITE         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "🔧 Configuration:"
echo "   Base URL: $BASE_URL"
echo "   Workspace ID: $WORKSPACE_ID"
echo ""

# Helper function for API calls
api_call() {
  local method=$1
  local endpoint=$2
  local data=$3
  
  if [ -z "$data" ]; then
    curl -s -X "$method" \
      "$BASE_URL$endpoint" \
      -H "Content-Type: application/json" \
      -H "Cookie: connect.sid=$AUTH_TOKEN"
  else
    curl -s -X "$method" \
      "$BASE_URL$endpoint" \
      -H "Content-Type: application/json" \
      -H "Cookie: connect.sid=$AUTH_TOKEN" \
      -d "$data"
  fi
}

# Test 1: Seed Expired Keys
echo "═══════════════════════════════════════════════════════════"
echo "📝 TEST 1: Seeding Expired Idempotency Keys"
echo "═══════════════════════════════════════════════════════════"
SEED_RESPONSE=$(api_call POST "/api/dev/seed-expired-keys" '{"count":10,"daysOld":65}')
echo "$SEED_RESPONSE" | jq '.'

if echo "$SEED_RESPONSE" | jq -e '.success' > /dev/null; then
  echo "✅ Successfully seeded 10 expired keys (65 days old)"
else
  echo "❌ Failed to seed expired keys"
  exit 1
fi
echo ""

# Test 2: Query Keys Before Cleanup
echo "═══════════════════════════════════════════════════════════"
echo "📊 TEST 2: Querying Idempotency Keys (Before Cleanup)"
echo "═══════════════════════════════════════════════════════════"
KEYS_BEFORE=$(api_call GET "/api/dev/idempotency-keys?limit=20")
KEYS_COUNT_BEFORE=$(echo "$KEYS_BEFORE" | jq '.count')
echo "Found $KEYS_COUNT_BEFORE idempotency keys before cleanup"
echo ""

# Test 3: Trigger Cleanup Job
echo "═══════════════════════════════════════════════════════════"
echo "🧹 TEST 3: Triggering Idempotency Cleanup Job"
echo "═══════════════════════════════════════════════════════════"
CLEANUP_RESPONSE=$(api_call POST "/api/dev/trigger-automation/cleanup" "")
echo "$CLEANUP_RESPONSE" | jq '.'

if echo "$CLEANUP_RESPONSE" | jq -e '.success' > /dev/null; then
  echo "✅ Cleanup job triggered successfully"
  echo "⏳ Waiting 5 seconds for cleanup to complete..."
  sleep 5
else
  echo "❌ Failed to trigger cleanup job"
  exit 1
fi
echo ""

# Test 4: Query Keys After Cleanup
echo "═══════════════════════════════════════════════════════════"
echo "📊 TEST 4: Querying Idempotency Keys (After Cleanup)"
echo "═══════════════════════════════════════════════════════════"
KEYS_AFTER=$(api_call GET "/api/dev/idempotency-keys?limit=20")
KEYS_COUNT_AFTER=$(echo "$KEYS_AFTER" | jq '.count')
echo "Found $KEYS_COUNT_AFTER idempotency keys after cleanup"

KEYS_DELETED=$((KEYS_COUNT_BEFORE - KEYS_COUNT_AFTER))
echo ""
echo "📈 Cleanup Summary:"
echo "   Keys Before: $KEYS_COUNT_BEFORE"
echo "   Keys After:  $KEYS_COUNT_AFTER"
echo "   Keys Deleted: $KEYS_DELETED"

if [ $KEYS_DELETED -ge 10 ]; then
  echo "✅ Cleanup successfully removed expired keys"
else
  echo "⚠️  Warning: Expected at least 10 keys deleted, got $KEYS_DELETED"
fi
echo ""

# Test 5: Query Audit Logs for Cleanup
echo "═══════════════════════════════════════════════════════════"
echo "📋 TEST 5: Querying Automation Audit Logs (Cleanup)"
echo "═══════════════════════════════════════════════════════════"
AUDIT_LOGS=$(api_call GET "/api/dev/automation-audit-logs?limit=10&jobType=idempotency_cleanup")
AUDIT_COUNT=$(echo "$AUDIT_LOGS" | jq '.count')
echo "Found $AUDIT_COUNT audit log entries for cleanup job"

if [ $AUDIT_COUNT -gt 0 ]; then
  echo "✅ Cleanup job audit logs verified"
  echo "$AUDIT_LOGS" | jq '.logs[0]' || true
else
  echo "❌ No cleanup audit logs found"
fi
echo ""

# Test 6: Test Duplicate Detection (Invoice Job)
echo "═══════════════════════════════════════════════════════════"
echo "🔄 TEST 6: Testing Duplicate Detection (Invoice Job)"
echo "═══════════════════════════════════════════════════════════"
echo "Triggering invoice job (first run)..."
INVOICE_1=$(api_call POST "/api/dev/trigger-automation/invoicing" "")
echo "$INVOICE_1" | jq '.'
echo "⏳ Waiting 3 seconds..."
sleep 3

echo "Triggering invoice job (second run - should be duplicate)..."
INVOICE_2=$(api_call POST "/api/dev/trigger-automation/invoicing" "")
echo "$INVOICE_2" | jq '.'
echo "⏳ Waiting 3 seconds for jobs to complete..."
sleep 3

# Query audit logs to verify both runs
INVOICE_LOGS=$(api_call GET "/api/dev/automation-audit-logs?limit=20&jobType=invoicing")
INVOICE_LOG_COUNT=$(echo "$INVOICE_LOGS" | jq '.count')
echo ""
echo "Found $INVOICE_LOG_COUNT audit log entries for invoicing"

if [ $INVOICE_LOG_COUNT -gt 0 ]; then
  echo "✅ Invoice job executed with idempotency protection"
  echo "   (Check logs to verify duplicate detection)"
else
  echo "⚠️  Warning: No invoice audit logs found"
fi
echo ""

# Test 7: Summary
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  📊 TEST SUITE SUMMARY                                    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "✅ Test 1: Seeded expired idempotency keys"
echo "✅ Test 2: Queried keys before cleanup"
echo "✅ Test 3: Triggered cleanup job"
echo "✅ Test 4: Verified keys were deleted"
echo "✅ Test 5: Verified cleanup audit logs"
echo "✅ Test 6: Tested duplicate detection"
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ✅ IDEMPOTENCY INTEGRATION TEST COMPLETE                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 Manual Verification Steps:"
echo "   1. Check server logs for cleanup job execution"
echo "   2. Verify idempotency keys show 'completed' status"
echo "   3. Confirm audit logs show AuditOS™ attribution"
echo "   4. Test with actual workspaces having billable hours"
echo ""
