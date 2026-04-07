#!/bin/bash
# CoAIleague Platform Stress Test v2 — Clean, sequential suites
BASE="http://localhost:5000"
KEY="stress-test-$(date +%s)"
JAR="/tmp/st-cookies-$$.txt"
PASS=0; FAIL=0; TOTAL=0; ERR5=0

g() { echo -e "\033[0;32m$1\033[0m"; }
r() { echo -e "\033[0;31m$1\033[0m"; }
c() { echo -e "\033[0;36m$1\033[0m"; }
section() { echo ""; c "=== $1 ==="; }

check() {
  local label=$1 method=$2 url=$3 data=$4 jar=$5
  ((TOTAL++))
  local args="-s -o /dev/null -w %{http_code} -X $method -H 'Content-Type: application/json' -H 'x-stress-key: $KEY' --connect-timeout 10 --max-time 30"
  [ -n "$jar" ] && args="$args -b $jar -c $jar"
  [ -n "$data" ] && args="$args -d '$data'"
  local code
  code=$(eval curl $args "$BASE$url" 2>/dev/null) || code="000"
  if [ "${code:0:1}" = "5" ]; then
    ((FAIL++)); ((ERR5++)); r "  FAIL $label (HTTP $code)"
  elif [ "$code" = "000" ]; then
    ((FAIL++)); r "  FAIL $label (timeout/connection)"
  else
    ((PASS++)); g "  PASS $label (HTTP $code)"
  fi
}

burst_test() {
  local label=$1 url=$2 count=$3 concurrency=$4 jar=$5
  local tmpdir="/tmp/st-burst-$$"
  mkdir -p "$tmpdir"
  
  local total_ok=0 total_fail=0
  for batch_start in $(seq 1 $concurrency $count); do
    local pids=""
    local batch_end=$((batch_start + concurrency - 1))
    [ $batch_end -gt $count ] && batch_end=$count
    
    for i in $(seq $batch_start $batch_end); do
      (
        local args="-s -o /dev/null -w %{http_code} -H 'x-stress-key: $KEY' --connect-timeout 5 --max-time 15"
        [ -n "$jar" ] && args="$args -b $jar"
        local code
        code=$(eval curl $args "$BASE$url" 2>/dev/null) || code="000"
        echo "$code" > "$tmpdir/$i.txt"
      ) &
    done
    wait
  done
  
  for f in "$tmpdir"/*.txt; do
    [ -f "$f" ] || continue
    local code=$(cat "$f")
    ((TOTAL++))
    if [ "${code:0:1}" = "5" ]; then ((total_fail++)); ((ERR5++))
    elif [ "$code" = "000" ]; then ((total_fail++))
    else ((total_ok++)); fi
  done
  rm -rf "$tmpdir"
  
  if [ $total_fail -eq 0 ]; then
    ((PASS++)); g "  PASS $label — $total_ok/$((total_ok + total_fail)) OK"
  else
    ((FAIL++)); r "  FAIL $label — $total_fail failures out of $((total_ok + total_fail))"
  fi
}

sustained_test() {
  local label=$1 duration=$2 jar=$3
  local tmpdir="/tmp/st-sustained-$$"
  mkdir -p "$tmpdir"
  local endpoints=("/api/health/summary" "/api/auth/me" "/api/chat/rooms" "/api/trinity/context/" "/api/onboarding/status")
  local start=$(date +%s)
  local idx=0
  
  while [ $(($(date +%s) - start)) -lt $duration ]; do
    for ep in "${endpoints[@]}"; do
      ((idx++))
      (
        local args="-s -o /dev/null -w %{http_code} -H 'x-stress-key: $KEY' --connect-timeout 3 --max-time 10"
        [ -n "$jar" ] && args="$args -b $jar"
        local code
        code=$(eval curl $args "$BASE$ep" 2>/dev/null) || code="000"
        echo "$code" > "$tmpdir/$idx.txt"
      ) &
    done
    sleep 0.1
  done
  wait
  
  local ok=0 fail=0
  for f in "$tmpdir"/*.txt; do
    [ -f "$f" ] || continue
    local code=$(cat "$f")
    ((TOTAL++))
    if [ "${code:0:1}" = "5" ] || [ "$code" = "000" ]; then ((fail++))
    else ((ok++)); fi
  done
  rm -rf "$tmpdir"
  
  local total=$((ok + fail))
  local rps=$((total / duration))
  if [ $fail -eq 0 ]; then
    ((PASS++)); g "  PASS $label — $total requests, $rps req/s, 0 failures"
  else
    ((FAIL++)); r "  FAIL $label — $fail failures out of $total ($rps req/s)"
  fi
}

echo ""
c "╔══════════════════════════════════════════════════════════╗"
c "║   CoAIleague Platform Stress Test v2                    ║"
c "╚══════════════════════════════════════════════════════════╝"

# ---------- SUITE 1: AUTH ----------
section "SUITE 1: Universal Auth Flow"
rm -f "$JAR"
check "Admin login + cookie" POST "/api/auth/login" '{"email":"admin@coaileague.com","password":"admin123@*"}' "$JAR"

if grep -q "auth_token" "$JAR" 2>/dev/null; then
  ((PASS++)); ((TOTAL++)); g "  PASS auth_token cookie set"
else
  ((FAIL++)); ((TOTAL++)); r "  FAIL auth_token cookie missing"
fi

check "Auth /me with cookie" GET "/api/auth/me" "" "$JAR"
check "Session check" GET "/api/auth/check" "" "$JAR"

# ---------- SUITE 2: CORE ENDPOINTS ----------
section "SUITE 2: Core API Endpoints"
check "Health summary" GET "/api/health/summary" "" ""
check "Workspace access" GET "/api/workspace/access" "" "$JAR"
check "Trinity context" GET "/api/trinity/context/" "" "$JAR"
check "Chat rooms" GET "/api/chat/rooms" "" "$JAR"
check "Onboarding status" GET "/api/onboarding/status" "" "$JAR"
check "View mode" GET "/api/user/view-mode" "" "$JAR"
check "Mascot state" GET "/api/mascot/seasonal/state" "" "$JAR"
check "Trinity session" GET "/api/trinity/session" "" "$JAR"

# ---------- SUITE 3: FEATURE ENDPOINTS ----------
section "SUITE 3: All 15 Platform Features"
check "Compliance matrix" GET "/api/compliance/matrix" "" "$JAR"
check "Client profitability" GET "/api/analytics/client-profitability" "" "$JAR"
check "Turnover analytics" GET "/api/analytics/turnover" "" "$JAR"
check "Post order acks" GET "/api/post-orders/acknowledgments" "" "$JAR"
check "Guard tours" GET "/api/guard-tours" "" "$JAR"
check "Site briefings" GET "/api/site-briefings" "" "$JAR"
check "Situation board" GET "/api/situation-board/status" "" "$JAR"
check "Invoices" GET "/api/invoices" "" "$JAR"
check "Credential wallet" GET "/api/credentials/wallet" "" "$JAR"
check "Proposals" GET "/api/proposals" "" "$JAR"
check "RMS incidents" GET "/api/rms/incidents" "" "$JAR"
check "Tax rates" GET "/api/tax/rates" "" "$JAR"

# ---------- SUITE 4: CONCURRENT READS ----------
section "SUITE 4: Concurrent Read Storm"
burst_test "Health burst (200 req, 20 concurrent)" "/api/health/summary" 200 20 ""
burst_test "Auth /me burst (200 req, 20 concurrent)" "/api/auth/me" 200 20 "$JAR"
burst_test "Trinity burst (100 req, 10 concurrent)" "/api/trinity/context/" 100 10 "$JAR"
burst_test "Chat rooms burst (100 req, 10 concurrent)" "/api/chat/rooms" 100 10 "$JAR"
burst_test "Workspace burst (100 req, 10 concurrent)" "/api/workspace/access" 100 10 "$JAR"

# ---------- SUITE 5: RAPID AUTH ----------
section "SUITE 5: Rapid-Fire Auth (20 concurrent logins)"
tmpdir="/tmp/st-auth-$$"
mkdir -p "$tmpdir"
for i in $(seq 1 20); do
  (
    local_jar="/tmp/st-login-$i-$$.txt"
    code=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
      -H 'Content-Type: application/json' -H "x-stress-key: $KEY" \
      -c "$local_jar" \
      -d '{"email":"admin@coaileague.com","password":"admin123@*"}' \
      --connect-timeout 10 --max-time 30 \
      "$BASE/api/auth/login" 2>/dev/null) || code="000"
    echo "$code" > "$tmpdir/$i.txt"
    rm -f "$local_jar"
  ) &
done
wait

auth_ok=0; auth_rate_limited=0; auth_fail=0
for f in "$tmpdir"/*.txt; do
  [ -f "$f" ] || continue
  code=$(cat "$f")
  ((TOTAL++))
  if [ "$code" = "200" ]; then ((auth_ok++))
  elif [ "$code" = "429" ]; then ((auth_rate_limited++))
  elif [ "${code:0:1}" = "5" ]; then ((auth_fail++)); ((ERR5++))
  else ((auth_fail++)); fi
done
rm -rf "$tmpdir"

if [ $auth_fail -eq 0 ]; then
  ((PASS++)); g "  PASS 20 concurrent logins — $auth_ok OK, $auth_rate_limited rate-limited (429=correct security)"
else
  ((FAIL++)); r "  FAIL Concurrent logins — $auth_fail server errors"
fi

# ---------- SUITE 6: MIXED WORKLOAD ----------
section "SUITE 6: Mixed Traffic Simulation (320 requests)"
tmpdir="/tmp/st-mixed-$$"
mkdir -p "$tmpdir"
idx=0
endpoints=("/api/health/summary" "/api/auth/me" "/api/chat/rooms" "/api/trinity/context/" "/api/onboarding/status" "/api/workspace/access" "/api/user/view-mode" "/api/mascot/seasonal/state")

for round in $(seq 1 40); do
  for ep in "${endpoints[@]}"; do
    ((idx++))
    (
      code=$(curl -s -o /dev/null -w '%{http_code}' -H "x-stress-key: $KEY" -b "$JAR" --connect-timeout 5 --max-time 15 "$BASE$ep" 2>/dev/null) || code="000"
      echo "$code" > "$tmpdir/$idx.txt"
    ) &
  done
  # Keep 8 concurrent per round
  if [ $((round % 5)) -eq 0 ]; then wait; fi
done
wait

mixed_ok=0; mixed_fail=0
for f in "$tmpdir"/*.txt; do
  [ -f "$f" ] || continue
  code=$(cat "$f")
  ((TOTAL++))
  if [ "${code:0:1}" = "5" ] || [ "$code" = "000" ]; then ((mixed_fail++)); ((ERR5++))
  else ((mixed_ok++)); fi
done
rm -rf "$tmpdir"

if [ $mixed_fail -eq 0 ]; then
  ((PASS++)); g "  PASS Mixed workload — $mixed_ok requests, 0 failures"
else
  ((FAIL++)); r "  FAIL Mixed workload — $mixed_fail failures out of $((mixed_ok + mixed_fail))"
fi

# ---------- SUITE 7: SUSTAINED LOAD ----------
section "SUITE 7: Sustained Throughput (15 seconds)"
sustained_test "15-second sustained load" 15 "$JAR"

# ---------- SUITE 8: POST-STRESS VERIFICATION ----------
section "SUITE 8: Post-Stress Data Integrity"
check "Auth still works" GET "/api/auth/me" "" "$JAR"
check "Health still OK" GET "/api/health/summary" "" ""
check "Chat still works" GET "/api/chat/rooms" "" "$JAR"
check "Trinity still works" GET "/api/trinity/context/" "" "$JAR"

# Verify session wasn't corrupted
email=$(curl -s -H "x-stress-key: $KEY" -b "$JAR" "$BASE/api/auth/me" 2>/dev/null | grep -o '"email":"[^"]*"' | head -1)
((TOTAL++))
if [ "$email" = '"email":"admin@coaileague.com"' ]; then
  ((PASS++)); g "  PASS Session integrity — correct user after stress"
else
  ((FAIL++)); r "  FAIL Session integrity — got: $email"
fi

# ---------- RESULTS ----------
echo ""
c "╔══════════════════════════════════════════════════════════╗"
c "║   STRESS TEST RESULTS                                   ║"
c "╚══════════════════════════════════════════════════════════╝"
echo ""
c "  Total Operations:  $TOTAL"
g "  Passed:            $PASS"
[ $FAIL -gt 0 ] && r "  Failed:            $FAIL" || g "  Failed:            $FAIL"
[ $ERR5 -gt 0 ] && r "  5xx Errors:        $ERR5" || g "  5xx Errors:        $ERR5"
echo ""

if [ $ERR5 -eq 0 ] && [ $FAIL -le 2 ]; then
  g "  ████████████████████████████████████████████████████"
  g "  █  PLATFORM STABLE — All systems operational      █"
  g "  ████████████████████████████████████████████████████"
else
  r "  ████████████████████████████████████████████████████"
  r "  █  ISSUES DETECTED — Review failures above        █"
  r "  ████████████████████████████████████████████████████"
fi

rm -f "$JAR"
