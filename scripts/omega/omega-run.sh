#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# OMEGA MASTER RUNNER — npm run omega equivalent
# Runs all 15 scripts in order. Stops on any failure.
# Usage: bash scripts/omega/omega-run.sh [--dry-run]
# ═══════════════════════════════════════════════════════════════════════════

set -e
DRYRUN=${1:-}
echo ""
echo "══════════════════════════════════════════════════════════════"
echo " OMEGA NUCLEAR — FULL PIPELINE"
echo " $(date)"
echo "══════════════════════════════════════════════════════════════"
echo ""

run_script() {
  local name=$1
  local script=$2
  shift 2
  echo ""
  echo "── [$name] ────────────────────────────────────────────────"
  tsx $script "$@" || { echo "❌ [$name] FAILED — stopping pipeline"; exit 1; }
  echo "✅ [$name] PASSED"
}

run_script "1/15 verify-prior-fixes"    scripts/omega/verify-prior-fixes.ts
run_script "2/15 preflight-check"       scripts/omega/preflight-check.ts
run_script "3/15 setup-webhooks"        scripts/omega/setup-webhooks.ts $DRYRUN
run_script "4/15 verify-webhooks"       scripts/omega/verify-webhooks.ts
run_script "5/15 test-webhooks"         scripts/omega/test-webhooks.ts $DRYRUN
run_script "6/15 email-routing-test"    scripts/omega/email-routing-test.ts
run_script "7/15 tenant-isolation"      scripts/omega/tenant-isolation-audit.ts
run_script "8/15 financial-atomicity"   scripts/omega/financial-atomicity-check.ts
run_script "9/15 webhook-replay"        scripts/omega/webhook-replay.ts $DRYRUN
run_script "10/15 trinity-smoke"        scripts/omega/trinity-action-smoke.ts
run_script "11/15 chaos-smoke"          scripts/omega/chaos-smoke.ts
run_script "12/15 reset-acme"           scripts/omega/reset-acme.ts --confirm $DRYRUN
run_script "13/15 battle-sim"           scripts/omega/battle-sim.ts $DRYRUN
run_script "14/15 statewide-verify"     scripts/omega/statewide-readonly-verify.ts
run_script "15/15 canary-cleanup"       scripts/omega/canary-cleanup-dryrun.ts

echo ""
echo "══════════════════════════════════════════════════════════════"
echo " OMEGA PIPELINE COMPLETE — ALL 15 SCRIPTS PASSED"
echo " Evidence appended to OMEGA_STATE_CHECKPOINT.md"
echo "══════════════════════════════════════════════════════════════"
echo ""
