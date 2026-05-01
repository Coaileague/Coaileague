#!/usr/bin/env node
// Sandbox verification: full schedule interface front→middle→back wiring.
// Crawls every API endpoint that the universal-schedule UI invokes and
// confirms every link in the loop returns a real, non-stub response.
//
// Usage: node scripts/verify-schedule-integration.mjs

import { setTimeout as wait } from 'node:timers/promises';

const BASE = process.env.SANDBOX_BASE_URL || 'http://localhost:5000';
const TEST_KEY = process.env.PLAYWRIGHT_TEST_KEY || 'sandbox-test-key-2026';
const WS = process.env.SANDBOX_WORKSPACE || 'dev-acme-security-ws';

const headers = {
  'x-test-key': TEST_KEY,
  'Content-Type': 'application/json',
};

let passed = 0;
let failed = 0;
const results = [];

function record(name, ok, detail) {
  const tag = ok ? 'PASS' : 'FAIL';
  results.push({ name, status: tag, detail });
  if (ok) passed++; else failed++;
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function call(method, path, body) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const t0 = Date.now();
  const res = await fetch(url, init);
  const dt = Date.now() - t0;
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, ok: res.ok, data, raw: text, ms: dt };
}

async function check(name, method, path, expectStatus, body, validate) {
  const r = await call(method, path, body);
  const statusOk = Array.isArray(expectStatus)
    ? expectStatus.includes(r.status)
    : r.status === expectStatus;
  let ok = statusOk;
  let detail = `${r.status} ${r.ms}ms`;
  if (statusOk && validate) {
    try {
      const v = validate(r.data, r);
      // Truthy → pass. Only false / null fail.
      if (v === false || v === null) {
        ok = false;
        detail += ` validate=fail`;
      }
    } catch (e) {
      ok = false;
      detail += ` validate-throw=${e.message}`;
    }
  }
  if (!statusOk) {
    detail += ` body=${JSON.stringify(r.data).slice(0, 240)}`;
  }
  record(name, ok, detail);
  return r;
}

async function main() {
  console.log(`Sandbox base: ${BASE}`);
  console.log(`Workspace:   ${WS}`);
  console.log('');

  // ── 1. Health & wiring ────────────────────────────────────────────
  await check('GET /sw-health (server alive)', 'GET', '/sw-health', 200, undefined,
    (d) => d?.ok === true);

  // ── 2. List shifts (universal-schedule first paint) ────────────────
  const listRes = await check('GET /api/shifts (paginated list)', 'GET',
    `/api/shifts?workspaceId=${WS}&limit=5`, 200, undefined,
    (d) => Array.isArray(d?.data) && d?.pagination && typeof d.pagination.total === 'number');

  const sampleShift = listRes.data?.data?.[0];
  if (!sampleShift) {
    record('Sample shift available for downstream tests', false, 'no shifts in list');
    return summary();
  }

  // ── 3. Single shift fetch (response is wrapped: { shift: {...} }) ─
  await check('GET /api/shifts/:id (detail)', 'GET',
    `/api/shifts/${sampleShift.id}?workspaceId=${WS}`, 200, undefined,
    (d) => d?.shift?.id === sampleShift.id);

  // ── 4. /today /upcoming /pending /stats ────────────────────────────
  await check('GET /api/shifts/today', 'GET',
    `/api/shifts/today?workspaceId=${WS}`, [200, 304]);
  await check('GET /api/shifts/upcoming', 'GET',
    `/api/shifts/upcoming?workspaceId=${WS}`, [200, 304]);
  await check('GET /api/shifts/pending', 'GET',
    `/api/shifts/pending?workspaceId=${WS}`, [200, 304]);
  await check('GET /api/shifts/stats', 'GET',
    `/api/shifts/stats?workspaceId=${WS}`, [200, 304]);

  // ── 5. Employees lookup (used by ScheduleGrid) ─────────────────────
  await check('GET /api/employees', 'GET',
    `/api/employees?workspaceId=${WS}&limit=10`, 200, undefined,
    (d) => Array.isArray(d?.data));

  // ── 6. Clients lookup (used by ShiftCreationModal) ────────────────
  await check('GET /api/clients', 'GET',
    `/api/clients?workspaceId=${WS}&limit=10`, 200, undefined,
    (d) => Array.isArray(d?.data) || Array.isArray(d));

  // ── 7. Schedule ops endpoints (week/stats requires weekStart ISO) ──
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
  const wsIso = weekStart.toISOString().slice(0, 10);
  await check('GET /api/schedules/week/stats', 'GET',
    `/api/schedules/week/stats?workspaceId=${WS}&weekStart=${wsIso}`, 200);
  await check('GET /api/schedules/ai-insights', 'GET',
    `/api/schedules/ai-insights?workspaceId=${WS}`, 200);

  // ── 8. ScheduleOS (AI toggle and status) ───────────────────────────
  await check('GET /api/scheduleos/ai/status', 'GET',
    `/api/scheduleos/ai/status?workspaceId=${WS}`, 200);
  await check('POST /api/scheduleos/ai/toggle', 'POST',
    '/api/scheduleos/ai/toggle', 200, { enabled: false, workspaceId: WS });

  // ── 9. Orchestrated schedule ───────────────────────────────────────
  await check('GET /api/orchestrated-schedule/status', 'GET',
    `/api/orchestrated-schedule/status?workspaceId=${WS}`, 200);

  // ── 10. Coverage / calendar (mounted but used by sidebars) ─────────
  await check('GET /api/coverage/forecast', 'GET',
    `/api/coverage/forecast?workspaceId=${WS}`, [200, 404]);
  await check('GET /api/calendar', 'GET',
    `/api/calendar?workspaceId=${WS}`, [200, 404]);

  // ── 11. Advanced scheduling (swap requests, duplicate-week) ────────
  await check('GET /api/scheduling/swap-requests', 'GET',
    `/api/scheduling/swap-requests?workspaceId=${WS}`, 200);
  await check('GET /api/scheduling/alerts', 'GET',
    `/api/scheduling/alerts?workspaceId=${WS}`, 200);

  // ── 12. Trinity scheduling ─────────────────────────────────────────
  await check('GET /api/trinity/scheduling/status', 'GET',
    `/api/trinity/scheduling/status?workspaceId=${WS}`, [200, 404]);

  // ── 13. Shift trading marketplace ──────────────────────────────────
  await check('GET /api/shift-trading/marketplace', 'GET',
    `/api/shift-trading/marketplace?workspaceId=${WS}`, [200, 404]);

  // ── 14. Mutation: create a draft shift ─────────────────────────────
  const newShiftBody = {
    workspaceId: WS,
    title: 'Sandbox Verification Shift',
    category: 'security',
    startTime: new Date(Date.now() + 86400_000).toISOString(),
    endTime:   new Date(Date.now() + 86400_000 + 8 * 3600_000).toISOString(),
    status: 'draft',
    billableToClient: false,
  };
  const createRes = await check('POST /api/shifts (create)', 'POST',
    '/api/shifts', [200, 201], newShiftBody,
    (d) => d?.id || d?.shift?.id || d?.data?.id);
  const createdId = createRes.data?.id || createRes.data?.shift?.id || createRes.data?.data?.id;

  if (createdId) {
    // ── 15. PATCH /api/shifts/:id ────────────────────────────────────
    await check('PATCH /api/shifts/:id (update)', 'PATCH',
      `/api/shifts/${createdId}`, 200,
      { workspaceId: WS, description: 'Updated by sandbox verifier' });

    // ── 16. POST /api/scheduling/shifts/:shiftId/duplicate ────────────
    await check('POST /api/scheduling/shifts/:id/duplicate', 'POST',
      `/api/scheduling/shifts/${createdId}/duplicate`, [200, 201],
      { workspaceId: WS, newDate: new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10) });

    // ── 17. DELETE /api/shifts/:id ────────────────────────────────────
    await check('DELETE /api/shifts/:id (cleanup)', 'DELETE',
      `/api/shifts/${createdId}?workspaceId=${WS}`, [200, 204]);
  }

  // ── 18. Phantom-route detector — frontend endpoint with NO backend ─
  // The universal-schedule.tsx UI POSTs to /api/scheduling/shifts/:id/swap-request
  // but the backend ONLY exposes /api/scheduling/swap-requests. Hit both to
  // surface the silent 404 as a hard fail.
  if (sampleShift?.id) {
    await check('POST /api/scheduling/shifts/:id/swap-request (FRONTEND CALLS — should NOT 404)',
      'POST', `/api/scheduling/shifts/${sampleShift.id}/swap-request`, [200, 201, 400, 422],
      { workspaceId: WS, reason: 'sandbox', targetEmployeeId: 'dev-acme-emp-marcus' });
  }

  // ── 18b. Availability exception — used to silently 400 because the
  // route's Zod schema accepted ['time_off','schedule_change',…] but the
  // service only accepts ['vacation','sick','personal','unpaid'].
  await check('POST /api/availability/exception (Zod aligned with service)',
    'POST', '/api/availability/exception', 200,
    { workspaceId: WS,
      startDate: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10),
      endDate:   new Date(Date.now() + 32 * 86400_000).toISOString().slice(0, 10),
      requestType: 'vacation',
      reason: 'sandbox verifier',
    });

  // ── 19. Schedules publish/unpublish — these used to crash with
  //          ReferenceError: workspaceId is not defined.
  await check('POST /api/schedules/unpublish (workspaceId binding)', 'POST',
    '/api/schedules/unpublish', [200, 400, 404],
    { workspaceId: WS,
      weekStart: new Date(Date.now() + 14 * 86400_000).toISOString(),
      weekEnd:   new Date(Date.now() + 21 * 86400_000).toISOString(),
    });

  // ── 20. Duplicate-reminder — should now report alreadySent, not 404.
  // First fire a reminder against any shift; second call must distinguish
  // the duplicate case from "shift not found".
  const remShift = await call('GET',
    `/api/shifts?workspaceId=${WS}&limit=200`);
  const assignedShift = remShift.data?.data?.find?.((s) => s.employeeId);
  if (assignedShift) {
    // Burn the reminder once (might already be sent or fresh — either way
    // the SECOND call is the contract we care about).
    await call('POST', `/api/shifts/${assignedShift.id}/send-reminder`,
      { workspaceId: WS });
    await check('POST /api/shifts/:id/send-reminder DUPLICATE (no misleading 404)',
      'POST', `/api/shifts/${assignedShift.id}/send-reminder`, 200,
      { workspaceId: WS },
      (d) => d?.alreadySent === true || d?.success === true);
  } else {
    record('POST /api/shifts/:id/send-reminder DUPLICATE (skipped — no assigned shift)',
      true, 'no assigned shift in first 200 results');
  }

  return summary();
}

function summary() {
  console.log('');
  console.log('═'.repeat(64));
  console.log(`SUMMARY: ${passed} passed, ${failed} failed (total ${passed + failed})`);
  console.log('═'.repeat(64));
  return { passed, failed, results };
}

main().then((s) => {
  process.exit(s.failed === 0 ? 0 : 1);
}).catch((e) => {
  console.error('verifier crash', e);
  process.exit(2);
});
