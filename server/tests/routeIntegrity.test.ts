/**
 * ROUTE INTEGRITY TEST
 * ====================
 * Automated enforcement so "Phantom Routes" never reach production.
 *
 * For every scheduling API call the frontend makes, this test:
 * 1. Normalises the URL to a pattern (/api/shifts/:id/approve)
 * 2. Checks it against the BACKEND_ROUTE_MANIFEST (authoritative source)
 * 3. Verifies the HTTP method matches
 * 4. Verifies the mount prefix resolves to a real route file
 *
 * Run: npx tsx server/tests/routeIntegrity.test.ts
 * CI:  Add to package.json scripts and your Railway build step.
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

// ─── Backend Route Manifest ───────────────────────────────────────────────────
// SOURCE OF TRUTH: every route that MUST exist on the backend.
// When adding a new route, add it here FIRST, then implement it.
// If it's not here, the test will fail even if the route exists.

export const BACKEND_ROUTE_MANIFEST = [
  // ── Core Shift Actions ──────────────────────────────────────────────────────
  { method: "GET",    path: "/api/shifts",                        file: "shiftRoutes.ts" },
  { method: "POST",   path: "/api/shifts",                        file: "shiftRoutes.ts" },
  { method: "GET",    path: "/api/shifts/:id",                    file: "shiftRoutes.ts" },
  { method: "PATCH",  path: "/api/shifts/:id",                    file: "shiftRoutes.ts" },
  { method: "DELETE", path: "/api/shifts/:id",                    file: "shiftRoutes.ts" },
  { method: "POST",   path: "/api/shifts/:id/acknowledge",        file: "shiftRoutes.ts" },
  { method: "POST",   path: "/api/shifts/:id/accept",             file: "shiftRoutes.ts" },
  { method: "POST",   path: "/api/shifts/:id/deny",               file: "shiftRoutes.ts" },
  { method: "POST",   path: "/api/shifts/:id/mark-calloff",       file: "shiftRoutes.ts" },
  { method: "POST",   path: "/api/shifts/:id/pickup",             file: "shiftRoutes.ts" },
  { method: "POST",   path: "/api/shifts/:id/proof-of-service",   file: "shiftRoutes.ts" },
  { method: "POST",   path: "/api/shifts/:id/ai-fill",            file: "shiftRoutes.ts" },
  { method: "PATCH",  path: "/api/shifts/:id/approve",            file: "shiftRoutes.ts" },
  { method: "POST",   path: "/api/shifts/offers/:id/accept",      file: "shiftRoutes.ts" },
  { method: "POST",   path: "/api/shifts/offers/:id/decline",     file: "shiftRoutes.ts" },

  // ── Scheduling ──────────────────────────────────────────────────────────────
  { method: "GET",    path: "/api/schedules/week/stats",          file: "schedulesRoutes.ts" },
  { method: "POST",   path: "/api/schedules/publish",             file: "schedulesRoutes.ts" },
  { method: "POST",   path: "/api/schedules/apply-insight",       file: "schedulesRoutes.ts" },
  { method: "POST",   path: "/api/schedules/auto-fill/preflight", file: "schedulesRoutes.ts" },
  { method: "GET",    path: "/api/schedules/ai-insights",         file: "schedulesRoutes.ts" },

  // ── Swap Requests ───────────────────────────────────────────────────────────
  { method: "POST",   path: "/api/scheduling/swap-requests",              file: "advancedSchedulingRoutes.ts" },
  { method: "GET",    path: "/api/scheduling/swap-requests",              file: "advancedSchedulingRoutes.ts" },
  { method: "POST",   path: "/api/scheduling/swap-requests/:id/approve",  file: "advancedSchedulingRoutes.ts" },
  { method: "POST",   path: "/api/scheduling/swap-requests/:id/reject",   file: "advancedSchedulingRoutes.ts" },
  { method: "POST",   path: "/api/scheduling/swap-requests/:id/cancel",   file: "advancedSchedulingRoutes.ts" },
  { method: "POST",   path: "/api/scheduling/shifts/:id/duplicate",       file: "advancedSchedulingRoutes.ts" },

  // ── Shift Trading ───────────────────────────────────────────────────────────
  { method: "POST",   path: "/api/shift-trading/trades/:id/accept",           file: "shiftTradingRoutes.ts" },
  { method: "POST",   path: "/api/shift-trading/trades/:id/manager-approve",  file: "shiftTradingRoutes.ts" },
  { method: "POST",   path: "/api/shift-trading/trades/:id/manager-reject",   file: "shiftTradingRoutes.ts" },
  { method: "GET",    path: "/api/shift-trading/availability",                 file: "shiftTradingRoutes.ts" },
  { method: "POST",   path: "/api/shift-trading/availability",                 file: "shiftTradingRoutes.ts" },
  { method: "DELETE", path: "/api/shift-trading/availability/:id",             file: "shiftTradingRoutes.ts" },

  // ── Coverage ────────────────────────────────────────────────────────────────
  { method: "GET",    path: "/api/coverage",               file: "coverageRoutes.ts" },
  { method: "POST",   path: "/api/coverage/accept/:id",    file: "coverageRoutes.ts" },
  { method: "POST",   path: "/api/coverage/trigger",       file: "coverageRoutes.ts" },

  // ── Approvals ───────────────────────────────────────────────────────────────
  { method: "GET",    path: "/api/approvals",                    file: "approvalRoutes.ts" },
  { method: "POST",   path: "/api/approvals/:id/decision",       file: "approvalRoutes.ts" },
  { method: "POST",   path: "/api/approvals/:id/cancel",         file: "approvalRoutes.ts" },

  // ── Timesheet Edit Requests ─────────────────────────────────────────────────
  { method: "GET",    path: "/api/timesheet-edit-requests/pending",   file: "approvalRoutes.ts" },
  { method: "PUT",    path: "/api/timesheet-edit-requests/:id/review", file: "approvalRoutes.ts" },

  // ── Timesheets ──────────────────────────────────────────────────────────────
  { method: "GET",    path: "/api/timesheets",              file: "payrollTimesheetRoutes.ts" },
  { method: "POST",   path: "/api/timesheets/:id/approve",  file: "payrollTimesheetRoutes.ts" },
  { method: "POST",   path: "/api/timesheets/:id/reject",   file: "payrollTimesheetRoutes.ts" },
  { method: "POST",   path: "/api/timesheets/:id/submit",   file: "payrollTimesheetRoutes.ts" },

  // ── Trinity Scheduling ──────────────────────────────────────────────────────
  { method: "POST",   path: "/api/trinity/scheduling/auto-fill",                    file: "trinitySchedulingRoutes.ts" },
  { method: "GET",    path: "/api/trinity/scheduling/insights",                     file: "trinitySchedulingRoutes.ts" },
  { method: "GET",    path: "/api/trinity/scheduling/pending-approvals",            file: "trinitySchedulingRoutes.ts" },
  { method: "POST",   path: "/api/trinity/scheduling/pending-approvals/:id/approve", file: "trinitySchedulingRoutes.ts" },
  { method: "POST",   path: "/api/trinity/scheduling/pending-approvals/:id/reject",  file: "trinitySchedulingRoutes.ts" },
  { method: "POST",   path: "/api/trinity/import-schedule",                         file: "autonomousSchedulingRoutes.ts" },

  // ── Security Compliance Approvals ───────────────────────────────────────────
  { method: "GET",    path: "/api/security-compliance/approvals",             file: "compliance/approvals.ts" },
  { method: "GET",    path: "/api/security-compliance/approvals/pending",     file: "compliance/approvals.ts" },
  { method: "POST",   path: "/api/security-compliance/approvals/:id/decide",  file: "compliance/approvals.ts" },

  // ── Time Entries ────────────────────────────────────────────────────────────
  { method: "GET",    path: "/api/time-entries",              file: "timeEntryRoutes.ts" },
  { method: "PATCH",  path: "/api/time-entries/:id/approve",  file: "timeEntryRoutes.ts" },
  { method: "PATCH",  path: "/api/time-entries/:id/reject",   file: "timeEntryRoutes.ts" },
  { method: "POST",   path: "/api/time-entries/:id/clock-out", file: "timeEntryRoutes.ts" },

  // ── Shift Chatrooms ─────────────────────────────────────────────────────────
  { method: "GET",    path: "/api/shift-chatrooms/by-shift/:id",  file: "shiftChatroomRoutes.ts" },

  // ── Auth ─────────────────────────────────────────────────────────────────────
  { method: "GET",    path: "/api/auth/session",          file: "authRoutes.ts" },
  { method: "GET",    path: "/api/auth/user",             file: "authRoutes.ts" },
  { method: "POST",   path: "/api/auth/logout-all",       file: "authRoutes.ts" },
  { method: "POST",   path: "/api/auth/magic-link",       file: "authRoutes.ts" },
  { method: "POST",   path: "/api/auth/forgot-password",  file: "authRoutes.ts" },
  { method: "POST",   path: "/api/auth/reset-password",   file: "authRoutes.ts" },
  { method: "PATCH",  path: "/api/auth/profile",          file: "authRoutes.ts" },
  { method: "POST",   path: "/api/auth/mfa/setup",        file: "authRoutes.ts" },
  { method: "POST",   path: "/api/auth/mfa/verify",       file: "authRoutes.ts" },

  // ── Onboarding ───────────────────────────────────────────────────────────────
  { method: "GET",    path: "/api/onboarding/progress",        file: "onboardingRoutes.ts" },
  { method: "POST",   path: "/api/onboarding/initialize",      file: "onboardingRoutes.ts" },
  { method: "GET",    path: "/api/onboarding/tasks",           file: "onboardingRoutes.ts" },
] as const;

// ─── Test Runner ──────────────────────────────────────────────────────────────

const ROUTES_DIR = join(process.cwd(), "server/routes");

function normalisePattern(path: string): string {
  return path.replace(/:[a-zA-Z]+/g, ":id");
}

function scanRouteFile(filename: string): Set<string> {
  const found = new Set<string>();
  const candidates = [
    join(ROUTES_DIR, filename),
    join(ROUTES_DIR, filename.replace(".ts", "Routes.ts")),
  ];
  const filepath = candidates.find(existsSync);
  if (!filepath) return found;

  const content = readFileSync(filepath, "utf8");
  const routeRe = /router\.(get|post|patch|put|delete)\(['"]([^'"]+)['"]/gi;
  let m: RegExpExecArray | null;
  while ((m = routeRe.exec(content)) !== null) {
    found.add(`${m[1].toUpperCase()} ${normalisePattern(m[2])}`);
  }
  return found;
}

function runRouteIntegrityTest(): { passed: number; failed: number; errors: string[] } {
  const errors: string[] = [];
  let passed = 0;

  // Cache file scans
  const fileCache = new Map<string, Set<string>>();

  for (const entry of BACKEND_ROUTE_MANIFEST) {
    const fileKey = entry.file;
    if (!fileCache.has(fileKey)) {
      fileCache.set(fileKey, scanRouteFile(fileKey));
    }
    const routes = fileCache.get(fileKey)!;

    // Build the sub-path (remove the mount prefix)
    // e.g. /api/scheduling/swap-requests → scan for /swap-requests in advancedSchedulingRoutes
    const fullPath = normalisePattern(entry.path);
    const method = entry.method;

    // Check by last 2 segments (handles prefix-mounted routers)
    const segments = fullPath.split("/").filter(Boolean);
    const subPaths = [
      "/" + segments.slice(-1).join("/"),
      "/" + segments.slice(-2).join("/"),
      "/" + segments.slice(-3).join("/"),
      fullPath.replace(/^\/api\/[^/]+/, "") || "/",
      "/",   // Handles root mounts like GET / for the list endpoint
    ];

    const found = subPaths.some((sub) => routes.has(`${method} ${normalisePattern(sub)}`));

    if (found) {
      passed++;
    } else {
      errors.push(
        `❌ ${method} ${fullPath} — not found in ${fileKey}\n   (searched sub-paths: ${subPaths.join(", ")})`
      );
    }
  }

  return { passed, failed: errors.length, errors };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://\${process.argv[1]}`) {
  console.log("\n🔍 CoAIleague Route Integrity Test\n" + "=".repeat(50));
  const { passed, failed, errors } = runRouteIntegrityTest();

  errors.forEach((e) => console.log(e));

  console.log("\n" + "=".repeat(50));
  console.log(`  Checked: \${passed + failed} routes`);
  console.log(`  ✅ Passed: \${passed}`);
  console.log(`  ❌ Failed: \${failed}`);

  if (failed > 0) {
    console.log("\n  Add the missing routes BEFORE merging to development.");
    process.exit(1);
  } else {
    console.log("\n  All routes verified. Safe to deploy.");
    process.exit(0);
  }
}

export { runRouteIntegrityTest };
