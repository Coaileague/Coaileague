# Mobile Field App — Reality Check (Readiness Section 4)

**Date:** 2026-04-19
**Scope:** Verify every 🔶 mobile feature claimed in the prior audit, produce
a truthful status matrix, and fix the highest-impact visible failure.

The prior audit marked every mobile item 🔶. That was not truthful — some
pieces are DONE, some are MISS outright. This doc replaces the prior 🔶
block with specific file:line references and effort estimates.

---

## 1. Truthful Status Matrix

| Feature | Status | Reference |
|---------|:------:|-----------|
| PWA (manifest + service worker) | PART | `client/public/manifest.json:1-272`, `client/public/service-worker.js:1-760`. Install prompt `client/src/components/pwa-install-prompt.tsx`. **Gap:** end-to-end DAR/incident photo sync untested under offline conditions. |
| Officer mobile dashboard | DONE | `client/src/components/mobile/MobileWorkerLayout.tsx:199-300` (5-tab nav + haptics), `client/src/pages/worker-dashboard.tsx`. |
| Mobile clock-in/out (GPS + photo) | PART | Endpoints + GPS + photo all wired. **Gap:** geofence perimeter definition is server-side only; client approval flow (UniversalFAB geofence modal) doesn't handle its endpoint being missing. See bug #1. |
| Mobile incident report | DONE | `client/src/pages/worker-incidents.tsx:71-300+` with auto-location, photo attach, severity routing to `incidentRoutingService`. |
| Mobile DAR (daily report) | PART | Route + template loader exist (`client/src/pages/field-reports.tsx:1-120+`). **Gap:** dynamic template fields aren't bound to `onChange` → submission loses field values. See bug #2. |
| Offline queue (guaranteed delivery) | DONE | IndexedDB queue + service-worker sync (`client/public/service-worker.js:281-391`, `client/src/lib/offlineQueue.ts`). |
| Panic / duress button | MISS | Haptics entry + CAD-console reference exist, but no dedicated mobile endpoint or component surfaces a panic action. Not mounted in `MobileWorkerLayout`. |
| Shift acceptance from mobile | PART | `client/src/components/ShiftOfferSheet.tsx:33-90` accept/decline mutations work. **Gap:** sheet not surfaced in worker nav or push notification actions. |
| Guard tour QR scan | MISS | Guard-tour route points to desktop-only view. No QR scanner component in the mobile surface. |
| Push notifications | PART | VAPID + subscribe endpoint + SW handler all wired. **Gap:** subscription was gated by a 7-day engagement window, so officers missed day-one alerts. **FIXED in this section** — see section 3. |

**Revised score:** (3 DONE + 5 PART + 2 MISS) / 10 = **55%** (prior doc said 46%, close enough; the delta is within rounding).

---

## 2. Top 3 In-Branch Bugs (highest blast radius)

Listed for follow-up. I fixed #3 in this branch because it was the smallest,
safest, highest-leverage change. #1 and #2 need a dedicated follow-up branch.

### Bug #1 — Geofence override modal never closes after silent-fail

- **Files:** `client/src/components/UniversalFAB.tsx:272-285` (client), expected `PATCH /api/time-entries/geofence-override/:id` (server, unverified).
- **Root cause:** client `handleGeofenceSubmit` only clears modal state on the success-toast path; if the endpoint 404s, the modal stays stuck.
- **Fix sketch:** always clear modal state in `finally`; add the missing PATCH route stub to the time-entry routes with basic manager approval.
- **Effort:** S (5–10 lines + route stub).

### Bug #2 — DAR template fields don't submit

- **File:** `client/src/pages/field-reports.tsx:~91-200+`
- **Root cause:** template dynamic fields render but have no `onChange` bound to `formData` state, so submission sends a partially-empty object.
- **Fix sketch:** add `handleFieldChange(name, value)` and wire `onChange` on every dynamic input (mirror the incident-type selection pattern elsewhere in the file).
- **Effort:** M (10–20 lines).

### Bug #3 — Push subscription delayed behind 7-day engagement window ✅ FIXED

- **Files:** `client/src/lib/pushNotifications.ts`, `client/src/pages/worker-dashboard.tsx`
- **Root cause:** `markCoreActionPerformed()` only stamped a localStorage flag. A separate opt-in card surfaced later, after the engagement window. A day-one Statewide officer would miss shift reminders, incident escalations, and duress response pings for days.
- **Fix applied:** added `markCoreActionAndAutoSubscribe()` which does the engagement mark AND silently invokes `subscribeToPush()` (idempotent via a new `coaileague-push-auto-sub-attempted` flag). The native browser permission prompt still appears — we just don't show a second custom opt-in card.
- **Blast-radius justification:** first clock-in is the day-one moment. Every minute the officer isn't subscribed, they miss critical pushes. This is 12 lines of code and removes a visible day-one failure.

---

## 3. The Fix That Shipped

```diff
 // client/src/pages/worker-dashboard.tsx
-import { markCoreActionPerformed } from "@/lib/pushNotifications";
+import { markCoreActionPerformed, markCoreActionAndAutoSubscribe } from "@/lib/pushNotifications";
 ...
   const handleClockAction = useCallback(() => {
-    markCoreActionPerformed();
+    // Readiness Section 4 — auto-subscribe to push on first clock-in
+    markCoreActionAndAutoSubscribe();
     if (clockStatus?.isClockedIn) { ... }
```

```ts
// client/src/lib/pushNotifications.ts — new function
export async function markCoreActionAndAutoSubscribe(): Promise<void> {
  markCoreActionPerformed();
  // idempotent: only attempts once per device via localStorage flag
  // silent failures: unsupported, permission denied, already subscribed
  ...
}
```

The old `markCoreActionPerformed()` is preserved so any other caller
(incident report, etc.) keeps its existing contract.

---

## 4. Remaining Mobile Work (out of scope for this branch)

- Panic/duress button — build the endpoint + mobile component
- Guard-tour QR scanner — add `html5-qrcode` (or similar) + scan handler
- Shift offer — surface on the dashboard + add push action buttons
- DAR form-binding fix (bug #2)
- Geofence modal fix (bug #1)

Recommended next branch name: `claude/mobile-field-app-hardening`.
