/**
 * Automated Stress-Test Runner — "Test Statewide" Dev Workspace
 *
 * Validates all 8 pipeline categories before Statewide launch.
 * Run AFTER `seed-statewide-dev.ts` has populated the test workspace.
 *
 * SQL-automatable checks run immediately.
 * Steps that require UI or real pipeline activity are flagged ⚠️ MANUAL.
 *
 * Usage:
 *   DATABASE_URL=<dev-postgres-url> npx tsx server/stress-test-statewide-dev.ts
 *
 * Exit codes:
 *   0 — all automated checks passed (manual steps still need human verification)
 *   1 — one or more automated checks failed
 */

import { pool } from "./db";

// ─── Workspace constant (must match seed-statewide-dev.ts) ───────────────────
const WS = "test-statewide-ws-00000000000001";

// ─── Result tracking ─────────────────────────────────────────────────────────
type CheckResult = {
  id: string;
  description: string;
  status: "PASS" | "FAIL" | "WARN" | "MANUAL";
  actual?: string | number;
  expected?: string;
  note?: string;
};

const results: CheckResult[] = [];

function pass(id: string, description: string, actual: string | number, expected?: string): void {
  results.push({ id, description, status: "PASS", actual, expected });
}

function fail(id: string, description: string, actual: string | number, expected: string, note?: string): void {
  results.push({ id, description, status: "FAIL", actual, expected, note });
}

function warn(id: string, description: string, actual: string | number, note: string): void {
  results.push({ id, description, status: "WARN", actual, note });
}

function manual(id: string, description: string, instruction: string): void {
  results.push({ id, description, status: "MANUAL", note: instruction });
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const r = await pool.query(sql, params);
  return parseInt(r.rows[0]?.count ?? r.rows[0]?.cnt ?? "0", 10);
}

// ─── Test 1: Scheduling Pipeline ─────────────────────────────────────────────
async function test1_schedulingPipeline(): Promise<void> {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STRESS TEST 1: SCHEDULING PIPELINE");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 1-A: Total shifts seeded
  const totalShifts = await count(
    `SELECT COUNT(*) FROM shifts WHERE workspace_id = $1`,
    [WS]
  );
  if (totalShifts === 50) {
    pass("1-A", "50 shifts seeded", totalShifts, "50");
  } else if (totalShifts > 0) {
    warn("1-A", "Unexpected shift count after seeding", totalShifts,
      `Expected 50. Re-run seed-statewide-dev.ts to reset.`);
  } else {
    fail("1-A", "Shifts seeded", totalShifts, "50",
      "Run seed-statewide-dev.ts first.");
  }

  // 1-B: Unassigned shifts (initial state)
  const unassigned = await count(
    `SELECT COUNT(*) FROM shifts WHERE employee_id IS NULL AND workspace_id = $1`,
    [WS]
  );
  if (unassigned === totalShifts) {
    pass("1-B", "All shifts start unassigned (Trinity ready)", unassigned, `${totalShifts}`);
  } else {
    warn("1-B", "Some shifts already assigned", unassigned,
      `Expected ${totalShifts} unassigned. Trinity may have already run.`);
  }

  // 1-C: Trinity-backfilled shifts
  const backfilled = await count(
    `SELECT COUNT(*) FROM shifts WHERE employee_id IS NOT NULL AND workspace_id = $1`,
    [WS]
  );
  if (backfilled === 0) {
    manual("1-C", "Trinity backfill",
      "Wait 5–10 minutes for Trinity scheduler to backfill shifts, then re-run this script.\n" +
      "     Alternatively: Admin → Schedule → 'Run AI Scheduler' to trigger manually.");
  } else if (backfilled === totalShifts) {
    pass("1-C", "All shifts backfilled by Trinity", backfilled, `${totalShifts}`);
  } else {
    warn("1-C", "Partial Trinity backfill", backfilled,
      `${backfilled}/${totalShifts} shifts assigned — Trinity may still be running.`);
  }

  // 1-D: Overlap detection (no officer double-booked)
  const overlaps = await count(
    `SELECT COUNT(*) FROM shifts s1
     WHERE EXISTS (
       SELECT 1 FROM shifts s2
       WHERE s1.employee_id = s2.employee_id
         AND s1.id != s2.id
         AND s1.start_time < s2.end_time
         AND s1.end_time > s2.start_time
         AND s1.workspace_id = $1
         AND s2.workspace_id = $1
     ) AND s1.workspace_id = $1`,
    [WS]
  );
  if (overlaps === 0) {
    pass("1-D", "No officer double-booking overlaps", 0, "0");
  } else {
    fail("1-D", "Officer overlap check", overlaps, "0",
      "Officers have conflicting shift assignments. Trinity scheduling constraint violated.");
  }

  // 1-E: Judge layer — recent rejections (informational, not fail)
  const judgeRejections = await count(
    `SELECT COUNT(*) FROM llm_judge_evaluations
     WHERE verdict = 'rejected'
       AND created_at > NOW() - INTERVAL '15 minutes'`,
    []
  );
  if (judgeRejections === 0) {
    pass("1-E", "No Judge rejections in last 15 min (clean run)", 0);
  } else {
    warn("1-E", "Judge blocked some scheduling decisions", judgeRejections,
      "Check llm_judge_evaluations.reasoning to understand what was blocked.");
  }
}

// ─── Test 2: Compliance Pipeline ─────────────────────────────────────────────
async function test2_compliancePipeline(): Promise<void> {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STRESS TEST 2: COMPLIANCE PIPELINE");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 2-A: Officer license distribution
  const [unarmed, armed, ppo] = await Promise.all([
    count(`SELECT COUNT(*) FROM employees WHERE workspace_id = $1 AND license_type = 'level2_unarmed'`, [WS]),
    count(`SELECT COUNT(*) FROM employees WHERE workspace_id = $1 AND license_type = 'level3_armed'`, [WS]),
    count(`SELECT COUNT(*) FROM employees WHERE workspace_id = $1 AND license_type = 'level4_ppo'`, [WS]),
  ]);
  const totalEmp = unarmed + armed + ppo;
  if (unarmed === 75 && armed === 45 && ppo === 30) {
    pass("2-A", "License type distribution correct (75/45/30)", `${unarmed}/${armed}/${ppo}`, "75/45/30");
  } else {
    warn("2-A", "License type distribution", `${unarmed}/${armed}/${ppo}`,
      `Expected 75/45/30 (level2/level3/level4). Total: ${totalEmp}`);
  }

  // 2-B: Armed clients match armed officers
  const armedClients = await count(
    `SELECT COUNT(*) FROM clients WHERE workspace_id = $1 AND requires_armed = true`, [WS]
  );
  const armedOfficers = await count(
    `SELECT COUNT(*) FROM employees WHERE workspace_id = $1 AND is_armed = true`, [WS]
  );
  if (armedClients === 8 && armedOfficers === 75) {
    pass("2-B", "Armed client/officer counts correct", `${armedClients} clients / ${armedOfficers} officers`, "8 / 75");
  } else {
    warn("2-B", "Armed client/officer counts", `${armedClients} clients / ${armedOfficers} officers`,
      `Expected 8 armed clients and 75 armed officers.`);
  }

  // 2-C: Guard card expiry — all in future
  const expiredCards = await count(
    `SELECT COUNT(*) FROM employees
     WHERE workspace_id = $1
       AND guard_card_expiry_date IS NOT NULL
       AND guard_card_expiry_date < CURRENT_DATE`,
    [WS]
  );
  if (expiredCards === 0) {
    pass("2-C", "No expired guard cards", 0, "0");
  } else {
    fail("2-C", "Expired guard cards found", expiredCards, "0",
      "Officers with expired licenses should not be schedulable. Check Trinity compliance filter.");
  }

  // 2-D: W-2 vs 1099 distribution
  const w2 = await count(
    `SELECT COUNT(*) FROM employees WHERE workspace_id = $1 AND compliance_pay_type = 'w2'`, [WS]
  );
  const c1099 = await count(
    `SELECT COUNT(*) FROM employees WHERE workspace_id = $1 AND compliance_pay_type = '1099'`, [WS]
  );
  if (w2 === 120 && c1099 === 30) {
    pass("2-D", "W-2 / 1099 distribution correct (120/30)", `${w2}/${c1099}`, "120/30");
  } else {
    warn("2-D", "W-2 / 1099 distribution", `${w2}/${c1099}`, "Expected 120 W-2, 30 1099.");
  }

  // 2-E: Judge compliance vetoes (armed shift assigned to unarmed officer)
  manual("2-E", "Judge compliance veto — armed/unarmed mismatch",
    "In the app: manually try to assign a 'level2_unarmed' officer to a shift\n" +
    "     linked to a client where requires_armed=true.\n" +
    "     Expected: blocked by Judge layer with an 'armed license required' message.\n" +
    "     Verify in DB:\n" +
    "       SELECT COUNT(*) FROM llm_judge_evaluations\n" +
    `       WHERE verdict = 'rejected' AND reasoning ILIKE '%arm%'\n` +
    "       AND created_at > NOW() - INTERVAL '1 hour';");
}

// ─── Test 3: Payroll Pipeline ─────────────────────────────────────────────────
async function test3_payrollPipeline(): Promise<void> {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STRESS TEST 3: PAYROLL PIPELINE");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 3-A: Bank accounts set up
  const bankAccounts = await count(
    `SELECT COUNT(*) FROM employee_bank_accounts WHERE workspace_id = $1`, [WS]
  );
  if (bankAccounts === 150) {
    pass("3-A", "All 150 officers have bank accounts", bankAccounts, "150");
  } else if (bankAccounts > 0) {
    warn("3-A", "Bank accounts set up", bankAccounts, "Expected 150.");
  } else {
    fail("3-A", "Bank accounts set up", bankAccounts, "150",
      "No bank accounts found. Re-run seed-statewide-dev.ts.");
  }

  // 3-B: Employee payroll records
  const payrollInfo = await count(
    `SELECT COUNT(*) FROM employee_payroll_info WHERE workspace_id = $1`, [WS]
  );
  if (payrollInfo >= 0) {
    // Not seeded directly; informational
    if (payrollInfo > 0) {
      pass("3-B", "Employee payroll info records present", payrollInfo);
    } else {
      warn("3-B", "Employee payroll info records", 0,
        "No payroll_info records yet — created when payroll runs. Run payroll to generate.");
    }
  }

  // 3-C: Existing payroll runs
  const payrollRuns = await count(
    `SELECT COUNT(*) FROM payroll_runs WHERE workspace_id = $1`, [WS]
  );
  if (payrollRuns === 0) {
    manual("3-C", "Run payroll to generate payroll_run records",
      "In the app: Admin → Payroll → 'Run Payroll' for the Test Statewide workspace.\n" +
      "     Then re-run this script to verify:\n" +
      "       SELECT COUNT(*) FROM payroll_runs WHERE workspace_id = '" + WS + "';\n" +
      "     Expected: ≥1 payroll run record.");
  } else {
    pass("3-C", "Payroll run records present", payrollRuns, "≥1");
  }

  // 3-D: Payroll entries (hours × rate)
  const payrollEntries = await count(
    `SELECT COUNT(*) FROM payroll_entries WHERE workspace_id = $1`, [WS]
  );
  if (payrollEntries > 0) {
    pass("3-D", "Payroll entries exist", payrollEntries);
  } else {
    warn("3-D", "Payroll entries", 0,
      "No payroll entries yet — will be created after payroll run (see 3-C).");
  }

  // 3-E: Hours calculation check (shifts with employees assigned)
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600), 0) as total_hours
     FROM shifts
     WHERE workspace_id = $1 AND employee_id IS NOT NULL`,
    [WS]
  );
  const totalHours = parseFloat(rows[0]?.total_hours ?? "0");
  if (totalHours > 0) {
    pass("3-E", "Assigned shifts have calculable hours", `${totalHours.toFixed(1)} hrs`);
  } else {
    warn("3-E", "Hours calculation (no assigned shifts yet)", 0,
      "Shifts not yet assigned. Wait for Trinity backfill (Test 1-C) before re-running payroll check.");
  }
}

// ─── Test 4: Incident Reporting Pipeline ─────────────────────────────────────
async function test4_incidentReporting(): Promise<void> {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STRESS TEST 4: INCIDENT REPORTING PIPELINE");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 4-A: Existing incident reports
  const incidents = await count(
    `SELECT COUNT(*) FROM incident_reports WHERE workspace_id = $1`, [WS]
  );
  if (incidents === 0) {
    manual("4-A", "File a test incident to verify GPS + timestamp capture",
      "In the app: Any officer → HelpAI or Incidents → 'Report Incident'\n" +
      "     Fill in description='Test incident'. GPS and timestamp should auto-capture.\n" +
      "     Then re-run to verify:\n" +
      "       SELECT id, gps_latitude, gps_longitude, created_at, status\n" +
      "       FROM incident_reports WHERE workspace_id = '" + WS + "' LIMIT 5;");
  } else {
    pass("4-A", "Incident reports present", incidents);
  }

  // 4-B: Incidents with GPS
  if (incidents > 0) {
    const withGps = await count(
      `SELECT COUNT(*) FROM incident_reports
       WHERE workspace_id = $1
         AND gps_latitude IS NOT NULL
         AND gps_longitude IS NOT NULL`,
      [WS]
    );
    if (withGps === incidents) {
      pass("4-B", "All incidents have GPS coordinates", withGps, `${incidents}`);
    } else {
      fail("4-B", "Incidents missing GPS data", withGps, `${incidents}`,
        "Some incidents were filed without GPS. Check mobile GPS permission handling.");
    }

    // 4-C: Incidents with timestamps
    const withTimestamp = await count(
      `SELECT COUNT(*) FROM incident_reports
       WHERE workspace_id = $1 AND created_at IS NOT NULL`,
      [WS]
    );
    if (withTimestamp === incidents) {
      pass("4-C", "All incidents have timestamps", withTimestamp, `${incidents}`);
    } else {
      fail("4-C", "Incidents missing timestamps", withTimestamp, `${incidents}`);
    }
  }
}

// ─── Test 5: Email / Notification Delivery Pipeline ──────────────────────────
async function test5_emailDelivery(): Promise<void> {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STRESS TEST 5: EMAIL / NOTIFICATION DELIVERY PIPELINE");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 5-A: Notification deliveries for workspace users
  const notifications = await count(
    `SELECT COUNT(*) FROM notification_deliveries WHERE workspace_id = $1`, [WS]
  );
  if (notifications > 0) {
    pass("5-A", "Notification deliveries recorded", notifications);
  } else {
    warn("5-A", "Notification deliveries", 0,
      "No notification records yet — generated when emails/SMS/push are sent (shift assignments, payroll, etc.).");
  }

  // 5-B: Failed deliveries
  const failedDeliveries = await count(
    `SELECT COUNT(*) FROM notification_deliveries
     WHERE workspace_id = $1 AND status = 'failed'`,
    [WS]
  );
  if (failedDeliveries === 0) {
    pass("5-B", "No failed notification deliveries", 0, "0");
  } else {
    fail("5-B", "Failed notification deliveries", failedDeliveries, "0",
      "Check notification_deliveries.last_error for failure reasons.");
  }

  // 5-C: Delivery success rate
  if (notifications > 0) {
    const sentDeliveries = await count(
      `SELECT COUNT(*) FROM notification_deliveries
       WHERE workspace_id = $1 AND status IN ('sent','delivered')`,
      [WS]
    );
    const rate = Math.round((sentDeliveries / notifications) * 100);
    if (rate >= 90) {
      pass("5-C", `Notification delivery success rate`, `${rate}%`, "≥90%");
    } else {
      fail("5-C", `Notification delivery success rate`, `${rate}%`, "≥90%",
        "Delivery rate below threshold. Check NDS logs and channel configuration.");
    }
  }

  // 5-D: Manual bulk email trigger
  manual("5-D", "Bulk email load test",
    "Trigger an action that sends to all 150 officers (e.g., run payroll,\n" +
    "     broadcast an announcement, or reset a batch of passwords).\n" +
    "     Then verify:\n" +
    "       SELECT status, COUNT(*) FROM notification_deliveries\n" +
    "       WHERE workspace_id = '" + WS + "'\n" +
    "       AND created_at > NOW() - INTERVAL '5 minutes'\n" +
    "       GROUP BY status;");
}

// ─── Test 6: HelpAI Pipeline ──────────────────────────────────────────────────
async function test6_helpAI(): Promise<void> {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STRESS TEST 6: HELPAI PIPELINE");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 6-A: Trinity action logs (any conversation turns recorded)
  const trinityLogs = await count(
    `SELECT COUNT(*) FROM trinity_action_logs WHERE workspace_id = $1`, [WS]
  );
  if (trinityLogs > 0) {
    pass("6-A", "Trinity action logs recorded", trinityLogs);
  } else {
    warn("6-A", "Trinity action logs", 0,
      "No action logs yet — generated when HelpAI/Trinity interactions occur for this workspace.");
  }

  // 6-B: AI brain jobs related to workspace
  const aiBrainJobs = await count(
    `SELECT COUNT(*) FROM ai_brain_jobs WHERE workspace_id = $1`, [WS]
  );
  if (aiBrainJobs > 0) {
    pass("6-B", "AI Brain jobs queued/processed for workspace", aiBrainJobs);
  } else {
    warn("6-B", "AI Brain jobs", 0,
      "No AI Brain jobs yet for this workspace — generated on scheduling runs, HelpAI, etc.");
  }

  // 6-C: Manual HelpAI interaction test
  manual("6-C", "HelpAI shift request test",
    "Log in as any test officer (test1@example.com / Statewide2024!).\n" +
    "     In HelpAI: type 'I need a shift tomorrow'\n" +
    "     Expected: list of available shifts returned.\n" +
    "     Then: 'I'll take the 6am-2pm shift at Downtown HQ'\n" +
    "     Expected: shift assigned, confirmation sent.\n" +
    "     Verify in DB:\n" +
    "       SELECT COUNT(*) FROM trinity_action_logs\n" +
    "       WHERE workspace_id = '" + WS + "'\n" +
    "       AND created_at > NOW() - INTERVAL '5 minutes';");
}

// ─── Test 7: Trinity Cognitive Pipeline ──────────────────────────────────────
async function test7_trinityCognitive(): Promise<void> {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STRESS TEST 7: TRINITY COGNITIVE PIPELINE");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 7-A: AI learning events (RL repository)
  const learningEvents = await count(
    `SELECT COUNT(*) FROM ai_learning_events WHERE workspace_id = $1`, [WS]
  );
  if (learningEvents > 0) {
    pass("7-A", "Trinity RL learning events recorded", learningEvents);
  } else {
    warn("7-A", "Trinity RL learning events", 0,
      "No learning events yet — created after Trinity takes scheduling/orchestration actions.");
  }

  // 7-B: Knowledge base (global entries available to workspace)
  const kbEntries = await count(
    `SELECT COUNT(*) FROM trinity_knowledge_base WHERE is_active = true`
  );
  if (kbEntries > 0) {
    pass("7-B", "Trinity knowledge base has active entries (global)", kbEntries);
  } else {
    fail("7-B", "Trinity knowledge base", 0, ">0",
      "No active KB entries. Trinity will not have context for compliance rules, state laws, etc.");
  }

  // 7-C: LLM Judge evaluations (any verdict)
  const judgeTotal = await count(
    `SELECT COUNT(*) FROM llm_judge_evaluations WHERE workspace_id = $1`, [WS]
  );
  if (judgeTotal > 0) {
    const judgeApproved = await count(
      `SELECT COUNT(*) FROM llm_judge_evaluations WHERE workspace_id = $1 AND verdict = 'approved'`, [WS]
    );
    const judgeRejected = await count(
      `SELECT COUNT(*) FROM llm_judge_evaluations WHERE workspace_id = $1 AND verdict = 'rejected'`, [WS]
    );
    pass("7-C", `Judge evaluations logged (${judgeApproved} approved / ${judgeRejected} rejected)`,
      judgeTotal, ">0");
  } else {
    warn("7-C", "LLM Judge evaluations", 0,
      "No Judge evaluations yet for this workspace. Triggered by Trinity scheduling/action runs.");
  }

  // 7-D: Trinity recommendation engine
  const recommendations = await count(
    `SELECT COUNT(*) FROM trinity_recommendations WHERE workspace_id = $1`, [WS]
  );
  if (recommendations > 0) {
    pass("7-D", "Trinity recommendations generated", recommendations);
  } else {
    warn("7-D", "Trinity recommendations", 0,
      "No recommendations yet — generated after Trinity observes workspace patterns.");
  }

  // 7-E: Orchestration runs
  const orchRuns = await count(
    `SELECT COUNT(*) FROM orchestration_runs WHERE workspace_id = $1`, [WS]
  );
  if (orchRuns > 0) {
    pass("7-E", "Orchestration runs logged for workspace", orchRuns);
  } else {
    warn("7-E", "Orchestration runs", 0,
      "No orchestration runs yet — will appear after Trinity executes automated workflows.");
  }
}

// ─── Test 8: Database Performance ────────────────────────────────────────────
async function test8_dbPerformance(): Promise<void> {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STRESS TEST 8: DATABASE PERFORMANCE");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 8-A: employees + shifts join performance
  const explainStart = Date.now();
  await pool.query(
    `SELECT e.id, COUNT(s.id) AS shift_count
     FROM employees e
     LEFT JOIN shifts s ON e.id = s.employee_id AND s.workspace_id = $1
     WHERE e.workspace_id = $1
     GROUP BY e.id`,
    [WS]
  );
  const elapsed = Date.now() - explainStart;

  if (elapsed < 100) {
    pass("8-A", "employees+shifts join performance", `${elapsed}ms`, "<100ms");
  } else if (elapsed < 500) {
    warn("8-A", "employees+shifts join performance", `${elapsed}ms`,
      "Response >100ms but <500ms. Acceptable for dev; may need tuning at production scale.");
  } else {
    fail("8-A", "employees+shifts join performance", `${elapsed}ms`, "<500ms",
      "Query too slow. Check workspace_id and employee_id indexes.");
  }

  // 8-B: availability query performance
  const availStart = Date.now();
  await pool.query(
    `SELECT employee_id, day_of_week, start_time, end_time
     FROM employee_availability
     WHERE workspace_id = $1
     ORDER BY employee_id, day_of_week`,
    [WS]
  );
  const availElapsed = Date.now() - availStart;
  if (availElapsed < 200) {
    pass("8-B", "employee_availability query performance", `${availElapsed}ms`, "<200ms");
  } else {
    warn("8-B", "employee_availability query performance", `${availElapsed}ms`,
      "Availability scan slow. Verify workspace_id index on employee_availability.");
  }

  // 8-C: workspace_id index health on key tables
  const { rows: idxStats } = await pool.query(
    `SELECT indexrelname, idx_scan, idx_tup_fetch
     FROM pg_stat_user_indexes
     WHERE schemaname = 'public'
       AND indexrelname ILIKE '%workspace%'
     ORDER BY idx_scan DESC
     LIMIT 15`
  );
  if (idxStats.length > 0) {
    pass("8-C", `${idxStats.length} workspace_id indexes found in pg_stat_user_indexes`,
      idxStats.length, ">0");
    console.log("       Top workspace indexes (by scan count):");
    idxStats.slice(0, 5).forEach((r: Record<string, unknown>) => {
      console.log(`         ${String(r.indexrelname).padEnd(55)} scans=${r.idx_scan}`);
    });
  } else {
    fail("8-C", "workspace_id indexes found", 0, ">0",
      "No workspace indexes seen in pg_stat. Check if workspaceIndexBootstrap ran at boot.");
  }

  // 8-D: Database size (informational)
  const { rows: sizeRows } = await pool.query(
    `SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size,
            pg_database_size(current_database()) AS db_size_bytes`
  );
  const sizeBytes = parseInt(sizeRows[0]?.db_size_bytes ?? "0", 10);
  const sizePretty = sizeRows[0]?.db_size ?? "unknown";
  const sizeGB = sizeBytes / (1024 ** 3);
  if (sizeGB < 1) {
    pass("8-D", "Database size", sizePretty, "<1GB");
  } else {
    warn("8-D", "Database size growing", sizePretty,
      "DB exceeds 1GB. Consider purging old dev seed data before production launch.");
  }
}

// ─── Summary reporter ─────────────────────────────────────────────────────────
function printSummary(): boolean {
  console.log("\n");
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("STRESS TEST SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════════");

  const passes   = results.filter(r => r.status === "PASS");
  const fails    = results.filter(r => r.status === "FAIL");
  const warnings = results.filter(r => r.status === "WARN");
  const manuals  = results.filter(r => r.status === "MANUAL");

  const allPassed = fails.length === 0;

  for (const r of results) {
    const icon = r.status === "PASS"   ? "✅"
               : r.status === "FAIL"   ? "❌"
               : r.status === "WARN"   ? "⚠️ "
               :                        "⚠️  MANUAL";
    const actual = r.actual !== undefined ? `  →  ${r.actual}` : "";
    const expected = r.expected !== undefined ? `  (expected: ${r.expected})` : "";
    console.log(`  ${icon} [${r.id}] ${r.description}${actual}${expected}`);
    if ((r.status === "FAIL" || r.status === "WARN" || r.status === "MANUAL") && r.note) {
      // Print note indented
      r.note.split("\n").forEach(line => console.log(`       ${line}`));
    }
  }

  console.log("\n───────────────────────────────────────────────────────────────────");
  console.log(`  PASS:    ${passes.length}`);
  console.log(`  FAIL:    ${fails.length}`);
  console.log(`  WARN:    ${warnings.length}   (may be expected if Trinity hasn't run yet)`);
  console.log(`  MANUAL:  ${manuals.length}   (require UI or pipeline actions — see ⚠️  MANUAL items above)`);
  console.log("───────────────────────────────────────────────────────────────────");

  if (allPassed) {
    console.log("\n🟢  ALL AUTOMATED CHECKS PASSED");
    console.log("   Complete the ⚠️  MANUAL steps above, then re-run to capture full results.");
    console.log("   When all manual checks also pass: PRODUCTION READY ✅\n");
  } else {
    console.log("\n🔴  FAILURES DETECTED — debug before launch:");
    for (const r of fails) {
      console.log(`   ❌ [${r.id}] ${r.description}`);
      if (r.note) r.note.split("\n").forEach(l => console.log(`      ${l}`));
    }
    console.log();
  }

  return allPassed;
}

// ─── Entry point ─────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  // Production guard (TRINITY.md §A)
  const { isProduction } = await import("./lib/isProduction");
  if (isProduction()) {
    console.log("🛑 [STRESS-TEST] Aborted — production environment detected.");
    process.exit(1);
  }

  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("STRESS TEST & LOAD TEST RUNNER — Test Statewide Dev Workspace");
  console.log(`Workspace: ${WS}`);
  console.log(`Run at:    ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════════════════════════════════");

  await test1_schedulingPipeline();
  await test2_compliancePipeline();
  await test3_payrollPipeline();
  await test4_incidentReporting();
  await test5_emailDelivery();
  await test6_helpAI();
  await test7_trinityCognitive();
  await test8_dbPerformance();

  const allPassed = printSummary();

  await pool.end();
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("❌ [STRESS-TEST] Fatal error:", err);
  process.exit(1);
});
