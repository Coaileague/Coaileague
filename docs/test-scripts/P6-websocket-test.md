# P6 — WebSocket Real-Time Event Test Script

**Setup:** Two browser windows open side-by-side. Both logged into CoAIleague.  
**Window A:** Manager account (org_owner or manager role) on Acme Security.  
**Window B:** Employee account for an officer on Acme Security.  
**Dev Tools:** Open the browser console in each window (F12 → Console tab).

---

## Pre-Flight: Confirm WebSocket Connected

In both windows, open the console and paste:
```js
// Should print "WebSocket connected" — if not, refresh
window.__ws && console.log("WS open:", window.__ws.readyState === 1 ? "CONNECTED" : "DISCONNECTED")
```

If the app uses the platform's built-in WebSocket, just check the Network tab → WS → confirm a connection is open to `/ws`.

---

## Test 1 — Clock-In Broadcast (officer_clocked_in)

**Goal:** Officer clocks in → manager sees it in real time without refreshing.

1. Window A: Navigate to **Workforce → Live Dashboard** (or the schedule page with active shift indicators).
2. Window B: Navigate to **Time Tracking → Clock In** and click Clock In (enable GPS if prompted).
3. Window A: Within 3 seconds, the officer's row should update from "Not Clocked In" to "Active — Clocked In".
4. Console check (Window A):
   ```
   Expected WS message: { type: "officer_clocked_in", employeeId: "...", timestamp: "..." }
   ```

**Pass:** Dashboard updates without a refresh.  
**Fail:** Dashboard stays stale. Check console for WS errors.

---

## Test 2 — Shift Assigned Broadcast (shift_assigned)

**Goal:** Manager assigns a shift → employee sees it on their schedule instantly.

1. Window B: Navigate to **My Schedule**. Note the current shifts shown.
2. Window A: Navigate to **Scheduling → Shifts** → create a new shift or find an unassigned shift.
3. Window A: Assign the shift to the test officer and click Save.
4. Window B: Within 3 seconds, the new shift should appear on the schedule without refreshing.
5. Console check (Window B):
   ```
   Expected WS message: { type: "shift_assigned", shiftId: "...", employeeId: "...", startTime: "...", endTime: "...", title: "..." }
   ```

**Pass:** Shift appears in Window B immediately.  
**Fail:** Nothing appears. Check that Window B's WS is still connected.

---

## Test 3 — Reassignment Broadcast

**Goal:** Manager manually reassigns a shift to a different officer → both old and new officer receive the event.

1. Window A: Pick a shift currently assigned to Officer A. Reassign it to Officer B.
2. Any officer window: Confirm `shift_assigned` event fires with the new `employeeId`.
3. Check console in Window B (if logged in as Officer A or B): new shift appears or disappears correctly.

**Pass:** Both officers' schedules update in real time.

---

## Test 4 — Invoice Paid Broadcast (invoice_paid)

**Goal:** Stripe invoice webhook fires → manager sees the invoice status change from Pending to Paid.

1. Window A: Navigate to **Billing → Invoices** and note any pending invoice.
2. In a third tab (or API tool), fire a test Stripe webhook:
   ```
   POST /api/stripe/webhook  (use Stripe CLI: stripe trigger invoice.paid)
   ```
   Or from the Stripe dashboard → Developers → Webhooks → Send test event → `invoice.paid`.
3. Window A: The invoice row should flip from Pending to Paid without a page refresh.
4. Console check:
   ```
   Expected WS message: { type: "invoice_paid", invoiceId: "...", workspaceId: "..." }
   ```

**Pass:** Invoice status updates live.  
**Note:** If Stripe CLI is not available, skip to Test 5 and come back after P4.

---

## Test 5 — Reconnection Event Buffer (reconnect_sync)

**Goal:** Client disconnects briefly → on reconnect, all missed events are replayed (up to 5 minutes of buffer).

1. Window B: Open the console. Note the current timestamp.
2. Window B: Open Network tab → find the WebSocket connection → right-click → "Cancel" (or temporarily disable Wi-Fi for 5 seconds, then re-enable).
3. Window A: While Window B is disconnected, perform TWO actions:
   - Assign a new shift to the officer in Window B.
   - Post a chat message in any workroom.
4. Window B: When the connection restores (should auto-reconnect within 2–5 seconds), the client sends `{ type: "reconnect_sync", lastEventTimestamp: <ms> }`.
5. Console check (Window B):
   ```
   Expected response: { type: "reconnect_sync_replay", events: [...], count: 2 }
   ```
   Both missed events should be in the `events` array and the UI should update.

**Pass:** Missed events are replayed and UI catches up without a full page refresh.  
**Full-refresh scenario:** If more than 5 minutes pass, the server sends `{ type: "full_refresh_required", reason: "gap_too_large" }` — the client should trigger a full data reload. Test this by waiting 6 minutes before reconnecting.

---

## Test 6 — Multi-Workspace Isolation

**Goal:** Events from Acme Security do NOT appear in Statewide Protective Services or any other workspace.

1. Open a third browser window logged into a different workspace (e.g., Statewide or Anvil Security).
2. In Window A (Acme), assign a shift.
3. Confirm the third window's console does NOT show a `shift_assigned` event.
4. The event buffer for each workspace is isolated — `workspaceEventBuffer.get(acme_id)` has no overlap with `workspaceEventBuffer.get(statewide_id)`.

**Pass:** No cross-tenant event leakage.

---

## Test 7 — 50-Event Buffer Rollover

**Goal:** Buffer only keeps the last 50 events per workspace.

1. Rapidly create 55 shifts (or use the dev console to call the API in a loop).
2. Disconnect Window B briefly.
3. Reconnect and check: `reconnect_sync_replay` returns a max of 50 events, not 55.
4. The oldest 5 are dropped silently (no error, just oldest events pruned).

**Pass:** `count` in the replay response is ≤ 50.

---

## Expected WebSocket Message Types (reference)

| Type | Direction | Trigger |
|---|---|---|
| `officer_clocked_in` | Server → Client | Officer clocks in |
| `officer_clocked_out` | Server → Client | Officer clocks out |
| `shift_assigned` | Server → Client | Shift assigned/reassigned |
| `invoice_paid` | Server → Client | Stripe invoice.paid webhook |
| `reconnect_sync` | Client → Server | Client reconnects after disconnect |
| `reconnect_sync_replay` | Server → Client | Server replays missed events |
| `full_refresh_required` | Server → Client | Gap > 5 min, replay impossible |
| `session_sync_ping` | Client → Server | Keepalive ping |

---

**All 7 tests passing = P6 complete.**
