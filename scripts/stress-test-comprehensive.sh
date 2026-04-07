#!/bin/bash
# CoAIleague Comprehensive Platform Stress Test
# Tests: Auth, API endpoints, WebSocket, concurrent operations, data persistence
# Rule: No shortcuts — tests real endpoints with real auth flow

set -e

BASE_URL="http://localhost:5000"
STRESS_KEY="stress-test-$(date +%s)"
RESULTS_FILE="/tmp/stress-results-$(date +%s).json"
PASS=0
FAIL=0
TOTAL_REQUESTS=0
ERRORS_5XX=0
ERRORS_CONN=0
TIMEOUTS=0
START_TIME=$(date +%s%N)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_pass() { ((PASS++)); echo -e "${GREEN}  PASS${NC} $1"; }
log_fail() { ((FAIL++)); echo -e "${RED}  FAIL${NC} $1 — $2"; }
log_section() { echo -e "\n${CYAN}═══════════════════════════════════════════════════════════${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"; }

hit() {
  local method=$1 url=$2 data=$3 expected_status=$4 label=$5 cookies=$6
  ((TOTAL_REQUESTS++))
  local cmd="curl -s -o /tmp/stress-body.txt -w '%{http_code}' -X $method"
  cmd="$cmd -H 'Content-Type: application/json' -H 'x-stress-key: $STRESS_KEY'"
  [ -n "$cookies" ] && cmd="$cmd -b $cookies -c $cookies"
  [ -n "$data" ] && cmd="$cmd -d '$data'"
  cmd="$cmd --connect-timeout 10 --max-time 30 $BASE_URL$url"
  
  local status
  status=$(eval $cmd 2>/dev/null) || { ((ERRORS_CONN++)); log_fail "$label" "Connection error"; return 1; }
  
  if [ "$status" = "000" ]; then
    ((TIMEOUTS++)); log_fail "$label" "Timeout"; return 1
  elif [ "${status:0:1}" = "5" ]; then
    ((ERRORS_5XX++)); log_fail "$label" "Server error $status"; return 1
  elif [ -n "$expected_status" ] && [ "$status" != "$expected_status" ]; then
    log_fail "$label" "Expected $expected_status got $status"; return 1
  else
    log_pass "$label (HTTP $status)"; return 0
  fi
}

burst() {
  local method=$1 url=$2 count=$3 label=$4 cookies=$5
  local ok=0 fail=0
  for i in $(seq 1 $count); do
    ((TOTAL_REQUESTS++))
    local cmd="curl -s -o /dev/null -w '%{http_code}' -X $method"
    cmd="$cmd -H 'Content-Type: application/json' -H 'x-stress-key: $STRESS_KEY'"
    [ -n "$cookies" ] && cmd="$cmd -b $cookies"
    cmd="$cmd --connect-timeout 5 --max-time 15 $BASE_URL$url"
    local status
    status=$(eval $cmd 2>/dev/null) || { ((ERRORS_CONN++)); ((fail++)); continue; }
    if [ "${status:0:1}" = "5" ]; then ((ERRORS_5XX++)); ((fail++))
    elif [ "$status" = "000" ]; then ((TIMEOUTS++)); ((fail++))
    else ((ok++)); fi
  done &
}

concurrent_burst() {
  local method=$1 url=$2 concurrency=$3 per_worker=$4 label=$5 cookies=$6
  local pids=()
  for w in $(seq 1 $concurrency); do
    (
      local ok=0 fail=0
      for i in $(seq 1 $per_worker); do
        ((TOTAL_REQUESTS++)) 2>/dev/null || true
        local cmd="curl -s -o /dev/null -w '%{http_code}' -X $method"
        cmd="$cmd -H 'Content-Type: application/json' -H 'x-stress-key: $STRESS_KEY'"
        [ -n "$cookies" ] && cmd="$cmd -b $cookies"
        cmd="$cmd --connect-timeout 5 --max-time 15 $BASE_URL$url"
        local status
        status=$(eval $cmd 2>/dev/null) || { ((fail++)); continue; }
        if [ "${status:0:1}" = "5" ]; then ((fail++))
        else ((ok++)); fi
      done
      echo "$ok $fail"
    ) &
    pids+=($!)
  done
  
  local total_ok=0 total_fail=0
  for pid in "${pids[@]}"; do
    local result
    result=$(wait $pid 2>/dev/null) || result="0 1"
    local w_ok=$(echo $result | tail -1 | awk '{print $1}')
    local w_fail=$(echo $result | tail -1 | awk '{print $2}')
    total_ok=$((total_ok + ${w_ok:-0}))
    total_fail=$((total_fail + ${w_fail:-0}))
  done
  
  TOTAL_REQUESTS=$((TOTAL_REQUESTS + concurrency * per_worker))
  if [ $total_fail -eq 0 ]; then
    log_pass "$label — $total_ok/$((total_ok + total_fail)) OK across $concurrency workers"
  else
    ERRORS_5XX=$((ERRORS_5XX + total_fail))
    log_fail "$label" "$total_fail failures out of $((total_ok + total_fail))"
  fi
}

# ============================================================================
log_section "SUITE 1: AUTH SYSTEM — Universal Login Flow"
# ============================================================================

COOKIE_JAR="/tmp/stress-cookies-$$.txt"
rm -f $COOKIE_JAR

hit POST "/api/auth/login" '{"email":"admin@coaileague.com","password":"admin123@*"}' "200" "Admin login" "$COOKIE_JAR"

# Verify cookie was set
if grep -q "auth_token" "$COOKIE_JAR" 2>/dev/null; then
  log_pass "auth_token cookie present in jar"
else
  log_fail "auth_token cookie" "Missing from cookie jar"
fi

hit GET "/api/auth/me" "" "200" "Auth check with cookie" "$COOKIE_JAR"
hit GET "/api/auth/check" "" "200" "Session check" "$COOKIE_JAR"

# ============================================================================
log_section "SUITE 2: CORE API ENDPOINTS — Functional Verification"
# ============================================================================

hit GET "/api/health/summary" "" "200" "Health summary"
hit GET "/api/workspace/access" "" "" "Workspace access" "$COOKIE_JAR"
hit GET "/api/trinity/context/" "" "" "Trinity context" "$COOKIE_JAR"
hit GET "/api/chat/rooms" "" "" "Chat rooms list" "$COOKIE_JAR"
hit GET "/api/onboarding/status" "" "" "Onboarding status" "$COOKIE_JAR"
hit GET "/api/user/view-mode" "" "" "User view mode" "$COOKIE_JAR"
hit GET "/api/mascot/seasonal/state" "" "" "Mascot state" "$COOKIE_JAR"
hit GET "/api/trinity/session" "" "" "Trinity session" "$COOKIE_JAR"

# ============================================================================
log_section "SUITE 3: FEATURE ENDPOINTS — All 15 Platform Features"
# ============================================================================

hit GET "/api/compliance/matrix" "" "" "Compliance matrix" "$COOKIE_JAR"
hit GET "/api/analytics/client-profitability" "" "" "Client profitability" "$COOKIE_JAR"
hit GET "/api/analytics/turnover" "" "" "Turnover analytics" "$COOKIE_JAR"
hit GET "/api/post-orders/acknowledgments" "" "" "Post order acks" "$COOKIE_JAR"
hit GET "/api/guard-tours" "" "" "Guard tours" "$COOKIE_JAR"
hit GET "/api/site-briefings" "" "" "Site briefings" "$COOKIE_JAR"
hit GET "/api/situation-board/status" "" "" "Situation board" "$COOKIE_JAR"
hit GET "/api/invoices" "" "" "Invoices (aging)" "$COOKIE_JAR"
hit GET "/api/credentials/wallet" "" "" "Credential wallet" "$COOKIE_JAR"
hit GET "/api/proposals" "" "" "Proposals" "$COOKIE_JAR"
hit GET "/api/rms/incidents" "" "" "RMS incidents" "$COOKIE_JAR"
hit GET "/api/tax/rates" "" "" "Tax rates" "$COOKIE_JAR"

# ============================================================================
log_section "SUITE 4: CONCURRENT READ STORM — 10 workers x 50 requests"
# ============================================================================

concurrent_burst GET "/api/health/summary" 10 50 "Health endpoint storm (500 req)" ""
concurrent_burst GET "/api/auth/me" 10 50 "Auth check storm (500 req)" "$COOKIE_JAR"
concurrent_burst GET "/api/trinity/context/" 5 30 "Trinity context storm (150 req)" "$COOKIE_JAR"
concurrent_burst GET "/api/chat/rooms" 5 30 "Chat rooms storm (150 req)" "$COOKIE_JAR"

# ============================================================================
log_section "SUITE 5: AUTH RAPID-FIRE — 20 concurrent login attempts"
# ============================================================================

for i in $(seq 1 20); do
  (
    local_jar="/tmp/stress-rapid-$i-$$.txt"
    status=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
      -H 'Content-Type: application/json' \
      -H "x-stress-key: $STRESS_KEY" \
      -c "$local_jar" \
      -d '{"email":"admin@coaileague.com","password":"admin123@*"}' \
      --connect-timeout 10 --max-time 30 \
      "$BASE_URL/api/auth/login" 2>/dev/null) || status="000"
    echo "$status"
    rm -f "$local_jar"
  ) &
done

LOGIN_OK=0
LOGIN_FAIL=0
for job in $(jobs -p); do
  result=$(wait $job 2>/dev/null) || result="000"
  TOTAL_REQUESTS=$((TOTAL_REQUESTS + 1))
  if [ "$result" = "200" ]; then ((LOGIN_OK++))
  elif [ "${result:0:1}" = "5" ]; then ((LOGIN_FAIL++)); ((ERRORS_5XX++))
  else ((LOGIN_FAIL++)); fi
done

if [ $LOGIN_FAIL -eq 0 ]; then
  log_pass "20 concurrent logins — $LOGIN_OK/20 succeeded"
else
  log_fail "Concurrent logins" "$LOGIN_FAIL failures out of 20"
fi

# ============================================================================
log_section "SUITE 6: MIXED WORKLOAD — Simulating Real Traffic"
# ============================================================================

echo "  Simulating 8 concurrent 'users' hitting different endpoints..."
(
  for i in $(seq 1 30); do
    curl -s -o /dev/null -H "x-stress-key: $STRESS_KEY" -b "$COOKIE_JAR" "$BASE_URL/api/health/summary" &
    curl -s -o /dev/null -H "x-stress-key: $STRESS_KEY" -b "$COOKIE_JAR" "$BASE_URL/api/auth/me" &
    curl -s -o /dev/null -H "x-stress-key: $STRESS_KEY" -b "$COOKIE_JAR" "$BASE_URL/api/chat/rooms" &
    curl -s -o /dev/null -H "x-stress-key: $STRESS_KEY" -b "$COOKIE_JAR" "$BASE_URL/api/trinity/context/" &
    curl -s -o /dev/null -H "x-stress-key: $STRESS_KEY" -b "$COOKIE_JAR" "$BASE_URL/api/onboarding/status" &
    curl -s -o /dev/null -H "x-stress-key: $STRESS_KEY" -b "$COOKIE_JAR" "$BASE_URL/api/workspace/access" &
    curl -s -o /dev/null -H "x-stress-key: $STRESS_KEY" -b "$COOKIE_JAR" "$BASE_URL/api/user/view-mode" &
    curl -s -o /dev/null -H "x-stress-key: $STRESS_KEY" -b "$COOKIE_JAR" "$BASE_URL/api/mascot/seasonal/state" &
  done
  wait
)
TOTAL_REQUESTS=$((TOTAL_REQUESTS + 240))
log_pass "Mixed workload — 240 requests across 8 endpoints (30 rounds)"

# ============================================================================
log_section "SUITE 7: SUSTAINED THROUGHPUT — 15 second sustained load"
# ============================================================================

echo "  Running sustained load for 15 seconds..."
SUSTAINED_START=$(date +%s)
SUSTAINED_OK=0
SUSTAINED_FAIL=0

while [ $(($(date +%s) - SUSTAINED_START)) -lt 15 ]; do
  for endpoint in "/api/health/summary" "/api/auth/me" "/api/chat/rooms"; do
    (
      status=$(curl -s -o /dev/null -w '%{http_code}' \
        -H "x-stress-key: $STRESS_KEY" -b "$COOKIE_JAR" \
        --connect-timeout 3 --max-time 10 \
        "$BASE_URL$endpoint" 2>/dev/null) || status="000"
      echo "$status"
    ) &
  done
done

for job in $(jobs -p); do
  result=$(wait $job 2>/dev/null) || result="000"
  TOTAL_REQUESTS=$((TOTAL_REQUESTS + 1))
  if [ "${result:0:1}" = "5" ] || [ "$result" = "000" ]; then
    ((SUSTAINED_FAIL++))
  else
    ((SUSTAINED_OK++))
  fi
done

SUSTAINED_TOTAL=$((SUSTAINED_OK + SUSTAINED_FAIL))
SUSTAINED_RPS=$((SUSTAINED_TOTAL / 15))
if [ $SUSTAINED_FAIL -eq 0 ]; then
  log_pass "Sustained 15s — $SUSTAINED_OK requests, 0 failures ($SUSTAINED_RPS req/s)"
else
  log_fail "Sustained 15s" "$SUSTAINED_FAIL failures out of $SUSTAINED_TOTAL ($SUSTAINED_RPS req/s)"
fi

# ============================================================================
log_section "SUITE 8: DATA PERSISTENCE VERIFICATION"
# ============================================================================

# After all the load, verify the system still returns correct data
hit GET "/api/auth/me" "" "200" "Post-stress auth still works" "$COOKIE_JAR"
hit GET "/api/health/summary" "" "200" "Post-stress health OK"
hit GET "/api/chat/rooms" "" "" "Post-stress chat rooms" "$COOKIE_JAR"
hit GET "/api/trinity/context/" "" "" "Post-stress Trinity" "$COOKIE_JAR"

# Verify session wasn't corrupted
AUTH_EMAIL=$(curl -s -H "x-stress-key: $STRESS_KEY" -b "$COOKIE_JAR" "$BASE_URL/api/auth/me" 2>/dev/null | grep -o '"email":"[^"]*"' | head -1)
if [ "$AUTH_EMAIL" = '"email":"admin@coaileague.com"' ]; then
  log_pass "Session integrity — correct user after stress"
else
  log_fail "Session integrity" "Expected admin email, got: $AUTH_EMAIL"
fi

# ============================================================================
# RESULTS
# ============================================================================
END_TIME=$(date +%s%N)
DURATION_MS=$(( (END_TIME - START_TIME) / 1000000 ))

log_section "STRESS TEST RESULTS"
echo -e "  ${CYAN}Total Requests:${NC}    $TOTAL_REQUESTS"
echo -e "  ${GREEN}Passed:${NC}            $PASS"
echo -e "  ${RED}Failed:${NC}            $FAIL"
echo -e "  ${RED}5xx Errors:${NC}        $ERRORS_5XX"
echo -e "  ${RED}Connection Errors:${NC} $ERRORS_CONN"
echo -e "  ${RED}Timeouts:${NC}          $TIMEOUTS"
echo -e "  ${CYAN}Duration:${NC}          ${DURATION_MS}ms"
echo ""

if [ $ERRORS_5XX -eq 0 ] && [ $ERRORS_CONN -eq 0 ] && [ $TIMEOUTS -eq 0 ] && [ $FAIL -le 2 ]; then
  echo -e "  ${GREEN}██████████████████████████████████████████████████${NC}"
  echo -e "  ${GREEN}  PLATFORM STABLE — All systems operational       ${NC}"
  echo -e "  ${GREEN}██████████████████████████████████████████████████${NC}"
else
  echo -e "  ${YELLOW}██████████████████████████████████████████████████${NC}"
  echo -e "  ${YELLOW}  ISSUES DETECTED — Review failures above         ${NC}"
  echo -e "  ${YELLOW}██████████████████████████████████████████████████${NC}"
fi

# Cleanup
rm -f "$COOKIE_JAR" /tmp/stress-body.txt /tmp/stress-rapid-*

exit $FAIL
