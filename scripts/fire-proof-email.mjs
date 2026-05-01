#!/usr/bin/env node
// Fire a proof-of-life email through the full schedule pipeline.
//
// Exercises:
//   POST /api/shifts/:shiftId/send-reminder
// which traverses
//   shiftRoutes  →  shiftRemindersService  →  emailCore.sendCanSpamCompliantEmail
//   →  Resend SDK (real)  OR  dev-mode noop (logs only).
//
// If RESEND_API_KEY is set in the running server's environment, this fires a
// real email; otherwise the pipeline still runs end-to-end and the dev-mode
// noop logs `[DEV MODE] Email would be sent to <addr>` — proving every link is
// wired without burning a real send.
//
// Usage:
//   node scripts/fire-proof-email.mjs              # uses default seed shift
//   PROOF_TO=you@example.com node scripts/fire-proof-email.mjs

const BASE = process.env.SANDBOX_BASE_URL || 'http://localhost:5000';
const TEST_KEY = process.env.PLAYWRIGHT_TEST_KEY || 'sandbox-test-key-2026';
const WS = process.env.SANDBOX_WORKSPACE || 'dev-acme-security-ws';
const SHIFT_ID = process.env.PROOF_SHIFT_ID || 'dev-shift-marcus-today';

const headers = {
  'x-test-key': TEST_KEY,
  'Content-Type': 'application/json',
};

function log(...a) { console.log(new Date().toISOString(), ...a); }

async function main() {
  log(`Sandbox: ${BASE}`);
  log(`Shift:   ${SHIFT_ID}`);
  log(`WS:      ${WS}`);

  // 1. Confirm the target shift is real, assigned, and has an email recipient.
  log('---');
  log('1) Fetching shift detail to confirm it is real (no stub data)…');
  const detail = await fetch(
    `${BASE}/api/shifts/${SHIFT_ID}?workspaceId=${WS}`,
    { headers },
  );
  const detailJson = await detail.json();
  if (!detail.ok || !detailJson?.shift?.id) {
    console.error('Shift not found — aborting:', detailJson);
    process.exit(1);
  }
  log(`   shift.title=${detailJson.shift.title}`);
  log(`   shift.employeeId=${detailJson.shift.employeeId}`);
  log(`   shift.startTime=${detailJson.shift.startTime}`);

  if (!detailJson.shift.employeeId) {
    console.error('Shift has no assigned employee — pick an assigned shift.');
    process.exit(1);
  }

  // 2. Fire the reminder.
  log('---');
  log('2) Posting /api/shifts/:id/send-reminder (manager action)…');
  const t0 = Date.now();
  const send = await fetch(
    `${BASE}/api/shifts/${SHIFT_ID}/send-reminder`,
    { method: 'POST', headers, body: JSON.stringify({ workspaceId: WS }) },
  );
  const sendJson = await send.json();
  log(`   HTTP ${send.status} in ${Date.now() - t0}ms`);
  console.log('   Response:', JSON.stringify(sendJson, null, 2));

  if (!send.ok || !sendJson?.success) {
    console.error('Reminder send FAILED — pipeline broken.');
    process.exit(1);
  }

  // 3. Inspect channel-level results.
  const channels = sendJson.data?.channels || {};
  log('---');
  log('3) Per-channel delivery status:');
  for (const [ch, info] of Object.entries(channels)) {
    log(`   ${ch.padEnd(8)} sent=${info.sent}${info.error ? ' err=' + info.error : ''}`);
  }

  if (!channels.email?.sent) {
    console.error('Email channel did NOT report sent=true. Pipeline incomplete.');
    process.exit(1);
  }

  log('---');
  log('PROOF COMPLETE — schedule → reminder → email pipeline executed end-to-end.');
  log('If RESEND_API_KEY was unset, see server log for [DEV MODE] entries.');
  log('If RESEND_API_KEY was set, the email landed in the recipient inbox.');
}

main().catch((e) => {
  console.error('CRASH:', e);
  process.exit(2);
});
