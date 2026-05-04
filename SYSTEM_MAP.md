
---

## DEPLOYMENT CRASH LAW — Missing Middleware Imports (added 2026-05-04)

**ROOT CAUSE OF requireAuth CRASH LOOP:**
`server/routes/guardTourRoutes.ts` used `requireAuth` and `ensureWorkspaceAccess`
in two QR code endpoints added in Wave 21A without importing them.
esbuild bundles cleanly (it finds the symbol from other bundled files).
Node.js ESM runtime crashes: `ReferenceError: requireAuth is not defined`.
Crash appears at the first request to the route, not at module init.

**THE BAD PATTERN:**
```ts
// No import for requireAuth or ensureWorkspaceAccess
router.get("/checkpoints/:id/qr", requireAuth, ensureWorkspaceAccess, async (req, res) => {
```

**THE FIX:**
```ts
import { requireAuth } from "../auth";
import { ensureWorkspaceAccess } from "../middleware/workspaceScope";
```

**PRE-PUSH CHECK (add to Railway Mirror Protocol):**
```bash
# Check ALL new/modified route files for missing middleware imports
for f in server/routes/*.ts server/routes/**/*.ts; do
  for sym in requireAuth ensureWorkspaceAccess requireManager; do
    if grep -q "$sym" "$f" && ! grep -q "import.*$sym" "$f"; then
      echo "MISSING IMPORT: $sym in $f"
    fi
  done
done
# Must return ZERO results
```

**COMMON MISSING IMPORTS IN ROUTE FILES:**
  requireAuth           → from "../auth"
  ensureWorkspaceAccess → from "../middleware/workspaceScope"
  requireManager        → from "../rbac"
  requireOwner          → from "../rbac"
  sanitizeError         → from "../middleware/errorHandler"
  createLogger          → from "../lib/logger"

This class of error is silent at build time. esbuild bundles across files so
the symbol exists somewhere in the bundle. The ESM runtime module resolver
requires the symbol to be in scope at the specific module that uses it.

---

---

## DEPLOYMENT CRASH LAW — requireAuth Circular Module Init (added 2026-05-04)

**RECURRING CRASH:** `ReferenceError: requireAuth is not defined`
Affected deploys: 2026-04-30 (×3), 2026-05-03 (×3). Total: 6 crash loops.

**ROOT CAUSE:**
esbuild bundles all modules into a single IIFE. When module execution order puts
`authRoutes.ts` initialization BEFORE `auth.ts` finishes exporting, any top-level
`import { requireAuth }` in a file that depends on both resolves to `undefined`.

The crash is triggered at module-level `router.get(...)` calls — these run immediately
when the module loads, not deferred to request time.

**THE FIX (domains/auth.ts):**
Never import `requireAuth` eagerly at the top level in files that also import
from `authRoutes.ts`. Use a lazy dynamic import inside a function body instead:

```ts
// ❌ WRONG — eager top-level import (can be undefined at module init)
import { requireAuth } from "../../auth";

// ✅ CORRECT — lazy dynamic import (resolved at call time, always safe)
let _requireAuth: RequestHandler | null = null;
async function getRequireAuth(): Promise<RequestHandler> {
  if (!_requireAuth) {
    const { requireAuth } = await import("../../auth");
    _requireAuth = requireAuth;
  }
  return _requireAuth;
}
```

**PRE-PUSH CHECK (add to Railway Mirror Protocol):**
```bash
# Ensure no file imports both requireAuth AND authRoutes at top level
grep -l "requireAuth" server/routes/domains/*.ts | xargs grep -l "authRoutes"
# Should return ZERO files (or only files using the lazy pattern)
```

**NEVER build into a top-level const outside a function if the value comes from
auth.ts AND the file also imports from authRoutes.ts. These two modules form a
soft circular dependency through the domain router.**

---


---

## NOTIFICATION ICON ARCHITECTURE (confirmed 2026-05-04)

### Android Status Bar SmallIcon — ic_stat_coaileague.png
Material Design 3 hard requirement: **white-on-transparent monochrome only**.
Any color pixels become a solid white blob at Android 5+.

Asset: Three Trinity teardrop arms — NO orbital rings, NO halo, NO core glow.
Just the three arms + centre dot. Clean silhouette at 24px.

Stored at all 5 density buckets:
  android/app/src/main/res/drawable-mdpi/ic_stat_coaileague.png      24×24
  android/app/src/main/res/drawable-hdpi/ic_stat_coaileague.png      36×36
  android/app/src/main/res/drawable-xhdpi/ic_stat_coaileague.png     48×48
  android/app/src/main/res/drawable-xxhdpi/ic_stat_coaileague.png    72×72
  android/app/src/main/res/drawable-xxxhdpi/ic_stat_coaileague.png   96×96

AndroidManifest.xml FCM defaults (apply to all notifications automatically):
  com.google.firebase.messaging.default_notification_icon  → @drawable/ic_stat_coaileague
  com.google.firebase.messaging.default_notification_color → @color/fcm_notification_color (#7C3AED)
  com.google.firebase.messaging.default_notification_channel_id → coaileague_alerts

### Android LargeIcon / Notification Shade
Full-color Trinity arms (blue #93C5FD + gold #FED7AA + purple #C4B5FD + white core).
No orbital rings in this version either — arms only, clean on any background.
Served from: https://coaileague.com/icons/trinity-notification-192.png (192×192)

### FCM HTTP v1 Payload — android.notification block
  icon:  "ic_stat_coaileague"          ← drawable name, no path/extension
  color: "#7C3AED"                     ← purple tint on monochrome icon
  image: "https://coaileague.com/icons/trinity-notification-192.png"  ← LargeIcon

### PWA / Web Push (sw.js + manifest.json)
  badge: /icons/badge-72.png           ← 72×72 monochrome (was 0KB empty — now real)
  icon:  /icons/trinity-notification-192.png  ← full-color in notification shade
  manifest.json: monochrome purpose icon added (ic_stat_coaileague-96.png, 96×96)

### App Logo Usage (in-app, NOT notifications)
  Trinity arms animate with color + glow + breathing — NO orbital rings anywhere.
  Orbital rings were removed from TrinityOrbitalAvatar (fixed Wave 19).
  Idle: soft comet arc sweeps and fades (Gemini-style). Active states: full animation.

### Regenerating Icons
  node scripts/generateNotificationIcons.js
  Reads: client/public/favicon.svg arm path
  Outputs: all drawable-* PNGs + badge-72.png + trinity-notification-192.png

---

---

## BRANDING LAW — Trinity Orbital Arm (permanent, added 2026-05-04)

**ONLY LOGO:** The Trinity orbital arm — three teardrop arms at 0°/120°/240° radiating from a glowing core, with two orbital rings. This is the sole brand mark for CoAIleague.

**DEPRECATED / FORBIDDEN:** Any reference to a "Celtic knot" or any other legacy logo design. These must never appear in code, comments, documentation, or assets. If you see this term in context, treat it as a reference to the legacy deprecated design and do not use it.

**CANONICAL SOURCE:** `client/public/favicon.svg` — the Trinity orbital arm vector. This is the authoritative source file for all icon derivatives.

**ARM PATH (SVG):** `M60 43 C55 34,53 19,60 6 C67 19,65 34,60 43 Z` in a 120×120 viewbox.
Three instances at rotations 0°, 120°, 240°.

**NOTIFICATION ICON ARCHITECTURE:**
  - Android SmallIcon (status bar native): `ic_stat_coaileague` drawable
    - White-on-transparent monochrome orbital arm
    - Stored in `android/app/src/main/res/drawable-{mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi}/`
    - 24/36/48/72/96px respectively
    - Tinted #7C3AED (brand purple) by Android OS via `@color/purple_brand`
  - Badge (PWA/Chrome status bar): `/icons/badge-72.png` (72×72, white-on-transparent)
  - LargeIcon (notification shade): `/icons/notification-icon-192x192.png` (full-color)
  - PWA manifest monochrome: `/icons/ic_stat_coaileague_96.png` (96×96, purpose: monochrome)

**FCM PAYLOAD (canonical):**
```typescript
android: {
  notification: {
    icon: "ic_stat_coaileague",   // drawable name — no path, no extension
    color: "#7C3AED",             // brand purple tint
    image: "https://coaileague.com/icons/icon-192x192.png",  // LargeIcon
    channel_id: "coaileague_alerts",
  }
}
```

**GENERATION SCRIPT:** `node scripts/generate-notification-icons.js`
Regenerates all 5 Android density PNGs from `favicon.svg` using Sharp.
Run any time the orbital arm design updates. Never hand-edit the PNGs.

---

---

## DEPLOYMENT CRASH LAW — Drizzle Schema Index Pattern (added 2026-05-04)

**ROOT CAUSE OF WAVE 21C CRASH:**
Indexes defined as standalone exports outside `pgTable()` crash at Node.js startup.
Drizzle's `IndexBuilderOn2.on()` calls `JSON.parse()` on column metadata.
When called outside a table definition, column metadata is `undefined`.
Result: `SyntaxError: "undefined" is not valid JSON` — instant crash loop.

**THE BAD PATTERN (NEVER DO THIS):**
```ts
export const myTable = pgTable("my_table", { ... });

// ❌ WRONG — standalone index outside pgTable crashes at runtime
export const myTableIndexes = {
  idx: index("my_idx").on(myTable.someColumn),
};
```

**THE CORRECT PATTERN (ALWAYS DO THIS):**
```ts
export const myTable = pgTable("my_table", {
  id: varchar("id").primaryKey(),
  someColumn: varchar("some_column"),
}, (t) => [
  // ✅ CORRECT — indexes inside pgTable third argument
  index("my_idx").on(t.someColumn),
  uniqueIndex("my_unique_idx").on(t.someColumn),
]);
```

**PRE-PUSH SCHEMA CHECK (add to Railway Mirror Protocol):**
```bash
grep -rn 'export const.*Indexes.*=' shared/schema/ | grep -v '//' 
# Must return ZERO results — no standalone index exports
```

This crash is silent at build time (Vite/esbuild pass clean).
It only appears at Node.js startup when Drizzle initializes the schema module.
The Railway Mirror Protocol `node build.mjs` does NOT catch this.
The only reliable check is: `grep` for standalone index exports before every push.

---

# COAILEAGUE SYSTEM MAP v5.0
# Last updated: 2026-05-03
# Purpose: Canonical map of what exists, where it lives, and how it connects.
# Read this before adding ANYTHING to avoid duplication and conflicts.

---

## VOICE INFINITE REDIRECT LOOP — Post-Mortem

**Symptom:** Application error on first 3 calls. Worked on 4th-5th ring.
**Root cause:** Infinite redirect loop + Railway rolling deploy overlap.

### Why it appeared intermittent

Railway rolling deploy keeps the old container alive for ~2 minutes while
spinning up the new one. First 3 calls hit old container (pre-fix) → error.
Calls 4-5 hit new container → works. Appeared to "fix itself."

### The actual code bug (would persist after deploy)

Every voice route called `resolveWorkspaceFromPhoneNumber(To)`. For the
master Twilio number (not in `workspaces.twilio_phone_number`), it returns null.

Routes handled null like this:
```
if (!workspace) {
  return redirect(`/api/voice/caller-identify?lang=${lang}`)  ← self-redirect
}
```

`caller-identify` → redirects to `caller-identify` → Twilio follows 5-10
redirects → "application error". Every route had this same loop.

**Also:** `workspace.phoneRecord.extensionConfig` accessed on routes where
`phoneRecord` doesn't exist on the new return type → TypeError on any
non-null workspace match (future tenant with twilio_phone_number set).

### Fixes Applied

1. All 6 infinite self-redirects changed to `/guest-identify` (Wave 16 guest flow)
2. All `workspace.phoneRecord.extensionConfig` replaced with `{}: Record<string, boolean>`
   (extension config defaults to all-enabled for the master line)

### Pre-Commit Rule Added

```bash
# Check for self-redirect patterns
grep -n "redirect.*caller-identify" server/routes/voiceRoutes.ts | head -10
# None should be inside an "if (!workspace)" block

# Check for phoneRecord access
grep -rn "workspace\.phoneRecord" server/
# Must return: nothing
```

---

---

## VOICE SYSTEM CRASH POST-MORTEM — May 2026

**Symptom:** "Application error" on all calls + SMS down simultaneously.
**Root cause:** Module-level startup crash taking down the entire Express server.

### Three-Part Root Cause

**1. `workspacePhoneNumbers` imported but not defined correctly**
File: `server/routes/voiceRoutes.ts` and `server/services/trinityVoice/voiceOrchestrator.ts`
After Directive 2 eliminated the table, the import remained. esbuild hoisted it above
`const` declarations — creating a syntax error on load. Server never started.

**2. `workspaces.isGrandfathered` queried — column does not exist**
File: `server/services/trinityVoice/voiceOrchestrator.ts` (new resolveWorkspaceFromPhoneNumber)
The rewritten function selected `isGrandfathered` from the workspaces table.
That column is not in the schema. Drizzle ORM type error at module evaluation.

**3. `acmeSeed.ts` still imported `workspacePhoneNumbers`**
A dev seed file retained the old import. Even seed files in the import graph crash the server.

### Permanent Fixes Applied

| File | Fix |
|------|-----|
| `voiceOrchestrator.ts` | Removed `workspacePhoneNumbers` import; replaced `isGrandfathered` with `founderExemption` (exists in schema) |
| `voiceRoutes.ts` | Removed `workspacePhoneNumbers` import; stubbed management routes; removed INSERT in initializeVoiceTables |
| `acmeSeed.ts` | Completely stubbed — no-op with comment explaining Directive 2 |

### Pre-Commit Rule (Added to Railway Mirror Protocol)

```bash
# Check for dead schema references before every commit
grep -rn 'workspacePhoneNumbers' server/ | grep -v '//'
# Must return: nothing

# Verify every import reference maps to an existing schema export
node build.mjs
# Must return: ✅ Server build complete
```

### Voice System State After Fix

- `resolveWorkspaceFromPhoneNumber`: queries `workspaces.twilio_phone_number` (single column, existing table)
- When no tenant match (master number): routes to guest IVR — never returns "not configured"
- TwiML Safety Net: catch block returns `<Dial>` to `VOICE_FALLBACK_PHONE` — no dead lines
- All `<Gather language="">`: single value `en-US` only — Twilio rejects comma-separated values
- `workspacePhoneNumbers`: 0 references anywhere in server code

---

---

## RAILWAY MIRROR PROTOCOL (MANDATORY — NEVER SKIP)

**Established after Wave 16 deployment failures. Permanent law.**

### Root Cause of Past Failures
1. Node.js OOM during TSC — 1.1M lines of TS exceeds default 1.5GB heap
2. Python string injection wrote `\`` (escaped backtick) into JSX files
3. Mixed import paths passed local TSC but crashed esbuild on Railway
4. `language="en-US,es-US"` invalid TwiML attribute caused Twilio errors

### The Protocol — Before Every Commit

```bash
# Step 1: Full Vite build (catches duplicate keys, bad imports, esbuild errors)
node build.mjs

# Step 2: Tests
npx vitest run

# Step 3: Grep for escaped backticks in client files (Python injection artifact)
grep -r '\\`' client/src/ --include='*.tsx' --include='*.ts'
# Must return: nothing

# Step 4: Grep for comma-separated Twilio language values (invalid TwiML)
grep -r 'language="[a-z][a-z]-[A-Z][A-Z],[a-z]' server/
# Must return: nothing
```

### Hard Rules
- `NODE_OPTIONS='--max-old-space-size=4096'` is set in `nixpacks.toml [variables]` — covers ALL Railway build phases
- All fetch URLs in JSX use string concatenation, not template literals, when injected via Python scripts
- smsService import from `extensions/`: always `../../smsService` 
- Twilio `<Gather language="">` always ONE language code — never comma-separated
- TwiML Safety Net: `/api/voice/inbound` catch block dials owner — never returns "application error"

---

## Wave 14 — Smart RMS (Complete)

**Files:** `server/services/rms/smartRmsService.ts`, `server/routes/rms/`
**Schema:** `site_pass_down_log`, `banned_entities`, `incident_report_client_copies`
**DAR extensions:** `auto_aggregated`, `event_timeline`, `nfc_tap_count`, `is_client_approved`

Key services:
- Auto-DAR aggregation (shift events → chronological timeline, guard reviews then submits)
- Trinity Narrative Translator (raw guard text → formal third-person, approval gate)
- Pass-down log (BOLO + site notes, 24h TTL, mandatory clock-in acknowledgment)
- Banned entities registry (unified BOLO + trespass, queried at every clock-in)
- Client copy pipeline (sanitize → supervisor approve → client portal sync)

5 Trinity/HelpAI RMS actions registered in `trinityComplianceIncidentActions.ts`

---

## Wave 14.5 — RMS Frontend Bridge (Complete)

**Files:** `client/src/pages/worker-dashboard.tsx`, `client/src/pages/rms-hub.tsx`, `client/src/pages/worker-incidents.tsx`

Key components:
- **Shift Brief intercept modal** — fires at clock-in, shows BOLOs + pass-downs. Mandatory acknowledge if `hasCritical=true`. Lives INSIDE `WorkerDashboardInner` (not outside ErrorBoundary).
- **Auto-DAR timeline UI** — rms-hub Incidents tab. Enter Shift ID → Auto-generate → Review timeline → Submit
- **Trinity Narrative Translator UI** — "Draft with Trinity" button → approval block with manager gate
- **"Approve for Client"** button on incident rows → sanitized copy → client portal sync

⚠️ Known injection artifact: Python scripts must use string concatenation for fetch URLs in JSX, not template literals. Escaped backtick `\`` breaks TSC and esbuild.

---

## Wave 19.5 — Billing Safety Valves & Data Archival (Complete)

**Goal:** Enterprise guardrails that protect MRR and keep the database fast at 10,000+ guards.

### Task 1 — Spend Cap Kill-Switch

**Schema (workspaces table — idempotent ALTER TABLE on boot):**
```
max_overage_limit_cents    INTEGER DEFAULT 5000  -- $50.00 default cap. 0 = no cap.
current_month_overage_cents INTEGER DEFAULT 0
overage_alert_sent_at      TIMESTAMP
overage_blocked_at         TIMESTAMP
```

**platformServicesMeter.processBatch() — runs before every credit deduction:**
- Calculates projected overage in cents (1 credit = 0.1 cents)
- 80% threshold → updates `overage_alert_sent_at`, fires `spend_cap.warning` platform event + SMS to owner
- 100% threshold → updates `overage_blocked_at`, fires `spend_cap.blocked` event, **skips the billing** (continues to next workspace)
- Zero limit → no cap enforced (opt-out for Enterprise)
- `resetMonthlyOverage(workspaceId)` — called from Stripe invoice.paid webhook to reset counters each cycle
- `ensureSpendCapSchema()` — idempotent, runs on server startup

**What gets blocked at 100%:** AI token overages, PTT metered calls, any `platformServicesMeter` charge.
**What is NEVER blocked:** Tier base subscription, panic alerts, compliance-critical actions.

### Task 2 — Data Archival Pipeline (Hot vs. Cold)

**File:** `server/services/storageArchival.ts`

**Archival rules:**
- Records > 60 days → `archived=TRUE`, `archived_at=NOW()`
- Records > 1 year → `audio_url=NULL` (storage freed, metadata retained)
- Regulatory hold → NEVER archived (checked via retentionPolicyService)

**Tables covered:** `cad_event_log`, `ptt_transmissions`, `ptt_plate_log`, `import_history`, `incident_reports`

**Partial indexes added:**
```sql
CREATE INDEX cad_event_log_active_idx ON cad_event_log(workspace_id, created_at DESC) WHERE archived IS NOT TRUE;
CREATE INDEX ptt_transmissions_active_idx ON ptt_transmissions(workspace_id, created_at DESC) WHERE archived IS NOT TRUE;
```
All primary queries run against the partial index — full table ignored by default.

**Cron:** `scheduleArchivalCron()` — daily at 3am UTC. First run scheduled at server startup.
**Batch size:** 500 records per run to avoid row-lock contention.
**API:** `getStorageStats(workspaceId)` — returns hot/cold counts for billing dashboard.

### Task 3 — Proration Transparency UI

**New API endpoint:** `GET /api/billing/addons/:addonId/proration-preview`
- Calls `stripe.invoices.retrieveUpcoming()` with the workspace's subscription
- Returns `{ dueTodayCents, nextMonthCents }`
- Falls back to full addon price if Stripe preview unavailable

**Billing page flow:**
1. Tenant clicks "Purchase Add-on" → `fetchProrationPreview()` called
2. Modal appears: "Calculating prorated charge..." (loading state)
3. Modal shows: **Due Today (Prorated): $X.XX** | **Next Month Total: $Y.YY/mo**
4. Tenant clicks **"Confirm — Pay $X.XX Today"** → `purchaseAddonMutation.mutate(addonId)`
5. Or clicks Cancel → modal closes, nothing charged

No surprise charges. Tenant explicitly consents before any charge fires.

### Tests: 18/18 passing (tests/unit/wave19_5-guardrails.test.ts)
- Spend cap threshold math (80%/100%/zero limit/credit→cents conversion)
- PTT cost-per-transmission within expected range
- Archival 60-day/365-day boundary logic
- Audio URL purge preserves metadata
- Proration calculation accuracy
- Retention policy integration (active/cancelled/regulatory hold)

---

---

## WAVE NUMBERING CORRECTION (Bryan confirmed 2026-05-04)

The original session transcript compressed Wave 18 and Wave 19 into
one git commit tagged wave19. Correct canonical roadmap:

  Wave 16 — Trinity 360 Omni-Channel Voice [COMPLETE]
  Wave 17 — Zero-Friction Migration Engine [COMPLETE — git: feat(wave17)]
  Wave 18 — Intelligent CAD & NFC Patrol Engine [COMPLETE — git: feat(wave19) partial]
  Wave 19 — PTT Radio + CAD Event Stream [COMPLETE — git: feat(wave19-complete)]

Wave 18 CAD work included in the wave19 commits:
  - cadRoutes.ts broadcastToWorkspace fires cad:new_call AND helpai_cad_alert
  - CAD → ChatDock bridge: new calls auto-post to shift rooms as HelpAI messages
  - cad_event_log table (created by PTT service)
  - GPS pipeline audit (gps-ping writes to time_entries.lastGpsPingLat/Lng)
  - Stale dot detection, breadcrumb polylines, NFC flash on map — PENDING Wave 20

---

## Wave 21C — Elite PDF Document Engine (Complete)

**Built on:** pdfkit + pdfTemplateBase.ts (navy/gold design system, existing)
**Storage:** Stream directly to HTTP response. No GCS dependency. Audit-logged to generated_documents.
**Auto-starts:** generated_documents schema bootstrap runs at server startup (idempotent).

### New Files
- `server/services/pdfEngine.ts` — 700-line unified PDF engine, 3 outputs
- `server/routes/pdfRoutes.ts` — 163-line route layer, mounted at `/api/documents`

### Task 1 — generated_documents Table
Logged on every PDF generation for legal retention:
  doc_id (e.g. UOF-20260504-A3F7), workspace_id, document_type, reference_id,
  file_size_bytes, page_count, generated_by_name, regulatory_citations[], status, created_at
Indexes: workspace+type, reference_id, doc_id (unique)
Bootstrap: idempotent CREATE TABLE IF NOT EXISTS at server startup (9500ms deferred)

### Task 2 — PDF Engine Core
All three outputs share:
  - Tenant logo in header (loadTenantLogo() → workspace.logo_url)
  - Navy/gold CoAIleague design system (pdfTemplateBase.ts)
  - Doc ID in footer: `UOF-20260504-A3F7` format for verification
  - Page N of M in footer
  - Exact timestamp (America/Chicago) in header
  - Cryptographic uniqueness: 4 random bytes (8 hex chars) per doc

### Task 3 — Three Outputs

**Output 1 — Use of Force Report** (`POST /api/documents/uof-report/:incidentId`)
  - Section 1: Incident overview (type, severity, GPS, site)
  - Section 2: Reporting officer (name, guard card #, license classification, shift times)
  - Section 3: Trinity AI narrative (polished_description with source note)
  - Section 4: Graham v. Connor 3-factor analysis form (fillable fields)
  - Section 5: Witnesses
  - Section 6: Trinity legal flags (critical/warning with recommendations)
  - Section 7: RKE citations — actual statutes from regulatory_knowledge_base
               (Graham v. Connor, state penal code, UoF guidelines)
  - Section 8: Supervisor signature block (4 signature lines)

**Output 2 — Daily Activity Report** (`POST /api/documents/dar/:darId`)
  - Assignment details (client, site, officer, license, shift times, weather)
  - Activity summary (full text)
  - Patrol statistics (round count, vehicle checks, incidents flag)
  - Additional notes
  - Officer certification signature block

**Output 3 — DPS Audit Packet** (`POST /api/documents/dps-audit-packet`)
  Body: `{ auditLabel?: string }` — Manager+ only
  - Cover page: entity info, license number, officer/incident/shift counts
    Red alert box if expired armed officers found
  - Table of contents
  - Exhibit A: Full roster with license status (color coded ACTIVE/EXPIRED/UNVERIFIED)
  - Exhibit B: All UoF incidents (12 months), polished narratives
  - Exhibit C: Armed shift logs (12 months), officer + guard card + site + status
  - Dynamic: regulatory body name from state_regulatory_config, not hardcoded
  - Redacted: no billing rates, no SSNs, no internal notes (same middleware as auditor portal)

**GET /api/documents/history** — Last 50 generated docs for workspace

### Revenue Connection
Every PDF has the CoAIleague brand in header and footer.
Every court submission, every client delivery, every DPS audit = brand impression.
Owners can click one button → professional PDF ready in ~2 seconds.
"Turn a 3-day DPS audit panic into one button press."

---

---

## BILLING MODEL — CANONICAL STRUCTURE (confirmed 2026-05-04)

### Prepaid Subscription (1 month in advance — always)
  Tenant subscribes → charged immediately for Month 1 → access starts now
  Day 30 → charged again before Month 2 begins
  Non-payment → past_due → grace period → suspended → workspace purged
  Tenant NEVER uses service they haven't pre-paid for

### Tier Base Price (all platform features included)
  Starter:      $XXX/month — up to 15 seats
  Professional: $1,499/month — up to 50 seats ($32/seat overage)
  Business:     custom — up to 200 seats
  Enterprise:   custom — "unlimited" (still soft-capped, overages for truly extreme use)

  INCLUDED in tier (soft-capped, overage charged):
    Scheduling, compliance, incident reports, ChatDock, voice IVR, CAD console,
    RFPs, document generation, payroll dashboard, HelpAI, Trinity AI brain,
    NFC patrol, guard tours, client portal, analytics, shift offers, all core features

### Per-Seat Add-Ons (billed with monthly subscription, in advance)
  Email (activated addresses):
    Each unique sending email address activated costs per-seat per-month
    Metered via platformServicesMeter.trackEmail()
    Resend transactional: per send (3x margin applied)
    Resend inbound processing: per inbound email received

  PTT Radio:
    $3/seat/month per officer with PTT access
    Addon key: 'ptt_radio'
    Requires Professional+
    Gated at /api/ptt/transmit — 402 if addon not active
    AI cost: ~$0.0011/transmission (Whisper + Gemini Flash)
    98% margin at $3/seat

### Middleware/Processing Usage (per-event billing)
  Invoicing: per invoice generated/sent (Stripe processing pass-through + margin)
  Payroll:   per payroll run processed (ACH/Plaid middleware cost + margin)
  Storage:   tier includes X GB, overage charged per GB above limit
  AI tokens: tier includes monthly allowance, $0.10/1K over quota (Professional)

### Key Principle
  Platform NEVER absorbs costs. Every service consumed is metered and
  charged back with appropriate margin via platformServicesMeter.
  3x margin applied to all infrastructure pass-throughs (email, SMS).
  AI token overages: charged at cost + margin to subscription invoice.

---


---

## Wave 21B — Production Hardening (Complete)

**Status: THE PLATFORM IS PRODUCTION READY.**

### Task 1 — Redis Pub/Sub Backplane (Multi-Replica WebSocket)

**Problem:** With 2+ Railway replicas, guard connects to Server A, supervisor connects to Server B — they can't see each other's events.

**Solution:** `broadcastToWorkspace()` now does two things on every call:
1. **Local broadcast** — clients on THIS replica receive immediately via `globalBroadcaster`
2. **Redis publish** — `publishBroadcast()` fires to `chat:broadcast` channel — other replicas receive via subscription

**Cross-replica subscription:** On server startup, `subscribeToRoomBroadcasts()` is registered. Events published by other Railway replicas arrive here and are delivered to locally-connected clients via `globalBroadcaster`.

**Fallback:** If `REDIS_URL` is not set, `publishBroadcast()` is a no-op (local delivery only). Railway starts in single-replica mode, scales to multi-replica as load grows — zero code change required.

**Files:**
- `server/websocket.ts` — `broadcastToWorkspace()` wired to publish + subscribe
- `server/services/chat/chatDurabilityAdapter.ts` — already had full Redis pub/sub, now fully activated

**Env var to enable:** `REDIS_URL` — add a Railway Redis plugin to the project, Railway auto-sets this.

### Task 2 — FCM Push Notification Pipeline

**Problem:** WebSocket sessions die when the app is backgrounded on mobile. Panic alerts and PTT dispatcher responses go undelivered.

**Solution:** FCM HTTP v1 API — no firebase-admin SDK (saves 40MB+ from bundle). Uses JWT auth with service account credentials.

**Files:**
- `server/services/fcmService.ts` (245 lines) — Full FCM HTTP v1 implementation
  - `sendFCMToToken()` — single device
  - `sendFCMToUser()` — all devices for a user
  - `sendFCMToWorkspace()` — all active devices in workspace (panic/Code Red)
  - JWT caching — 1 hour tokens, 5-minute renewal buffer
  - Auto-invalidates stale tokens (`UNREGISTERED` → `is_active=false`)
  - `ensureDeviceTokenSchema()` — idempotent boot
- `shared/schema/domains/orgs/index.ts` — `user_device_tokens` table
  - Unique index on `fcm_token` — prevents duplicate registrations
  - Supports web, iOS, Android device types
- `server/routes/notifications.ts` — `POST /api/notifications/register-device`
  - Upsert — same token refreshes `last_seen_at`, new token creates row
  - `DELETE /api/notifications/register-device` — logout deregistration
- `server/services/notificationDeliveryService.ts` — `triggerFCMForCritical()`
  - Called after WS broadcast for panic/PTT events
  - Routes to single user (PTT response) or full workspace (panic alert)

**Env vars to enable:** `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`

**Fallback:** If Firebase env vars are missing, all FCM calls return 0 silently. WS delivery still works normally.

### Task 3 — Stripe Spend Cap Reset

**Problem:** `resetMonthlyOverage()` was built in Wave 19.5 but never wired to the Stripe invoice webhook. Tenants who hit 100% cap would remain blocked even after paying.

**Fix:** `stripeWebhooks.ts → handleInvoicePaymentSucceeded()` now calls `resetMonthlyOverage(workspaceId)` immediately after marking workspace `active`. New billing cycle starts with clean counters:
- `current_month_overage_cents → 0`
- `overage_alert_sent_at → NULL`
- `overage_blocked_at → NULL`

Non-fatal: if reset fails, workspace recovers on next cycle. Logged as warning.

### Tests: 18/18 passing (tests/unit/wave21b-hardening.test.ts)
- Redis backplane (URL gating, event enrichment, channel naming, buffer trimming, reconnect backoff)
- FCM pipeline (token validation, URL format, graceful degradation, device types, JWT caching, batch limit)
- Stripe overage reset (counter values, billing cycle boundary, Enterprise opt-out)

---

---

## Wave 21A — NFC/QR Patrol Engine + CAD Integration (Complete)

**Philosophy:** Guard scans a checkpoint → everything updates automatically.
No manual reporting. Trinity, HelpAI, supervisors, and the CAD board all
know the patrol status in real time.

### QR Code Generation (guardTourRoutes.ts)

**New endpoints:**
- `GET /api/guard-tours/checkpoints/:id/qr` → PNG QR image, 300px, error correction H
- `GET /api/guard-tours/tours/:tourId/print-qr` → JSON array of base64 data URLs for all checkpoints

**QR Payload format** (workspace-locked, cross-tenant proof):
```json
{ "v": 1, "w": "workspaceId", "c": "checkpointId", "t": "tourId", "n": "Checkpoint Name", "nfc": "nfc-tag-uuid-or-null" }
```
`w` (workspaceId) is always embedded. If a guard from Tenant A scans a QR from Tenant B
the API rejects it — workspace mismatch caught at validation. Physical tags cannot cause
confusion between clients or tenants.

QR stored back to `guardTourCheckpoints.qrCode` for reference.
Error correction level H: survives 30% damage — works on dirty, partially torn laminated tags.

### QR Print Sheet (client/src/pages/qr-print-sheet.tsx, 186 lines)

Route: `/guard-tours/print-qr/:tourId`

- Grid of cards, one per checkpoint, sorted by patrol order number
- Each card: company name header, 180px QR, checkpoint name + description, checkpoint ID (first 12 chars), footer
- Print dialog auto-opens when QR codes load
- Manual "Print / Save PDF" button for re-printing
- Cards designed for lamination: solid black QR on white, high contrast
- Company name pulled from workspace config — tenant-branded
- Print CSS: A4, 1cm margins, `break-inside-avoid` per card, no UI chrome in print output
- "Print QR Codes" button added to each tour card in guard-tour.tsx management page

### CAD ↔ Patrol Bridge (guardTourRoutes.ts /scans POST)

On every checkpoint scan:
1. `patrol_scan` broadcast → CAD board → officer dot flashes green at checkpoint GPS
2. `cad_event_log` entry written: `"Maria Lopez cleared North Entrance during patrol"`
3. `helpai_patrol_scan` broadcast → active shift room → HelpAI posts: `✅ Maria Lopez cleared North Entrance — 14:32:17`
4. Trinity logo → success state → idle after 2 seconds

All three happen non-blocking — the scan API response (201) fires immediately, broadcast follows async. Network issues never delay the guard's scan confirmation.

### Missed Checkpoint → CAD (patrolWatcherService.ts)

Existing missed checkpoint detection (10/20/30 min thresholds) now ALSO broadcasts:
- `patrol_missed` event → CAD board → red alert indicator
- HelpAI in shift room: `⚠️ Patrol Alert: South Gate missed 25 minutes. Check guard status.`
- Trinity logo → warning state → idle after 4 seconds
Runs alongside existing SMS escalation (not instead of it).

### WebSocket Events (use-chatroom-websocket.ts)

| Event | Trinity State | Action |
|---|---|---|
| `patrol_scan` | success → idle 2s | CAD dot flashes green |
| `helpai_patrol_scan` | speaking → idle | HelpAI message in shift room |
| `patrol_missed` | warning → idle 4s | HelpAI alert + CAD red indicator |

### Tests: 16/16 passing (tests/unit/wave21a-patrol-nfc.test.ts)
- QR workspace isolation (cross-tenant rejection, same-tenant acceptance)
- NFC anti-spoof validation (time drift, GPS radius)
- Patrol watcher thresholds (10/22/35 minute escalation levels)
- CAD broadcast payload structure
- HelpAI message format
- Print sheet URL format and checkpoint sort order

---

---

## Wave 20 — Texas DPS Auditor Portal & Regulatory Knowledge Engine (Complete)

**Philosophy:** Dynamic by design. Any state = config rows, not code changes.

### Task 1 — Zero-Trust Sandbox

**Schema:** `auditor_links` table
  - token (128-char, unique), workspaceId, label, expiresAt, accessCount, isRevoked, allowedExhibits
  - Every access logs lastAccessedAt + increments accessCount
  - Revocation: flip isRevoked=true, immediately blocks token

**Route:** `/dps-portal/:token` (fully isolated React page, no nav/sidebar)
  - LazyLoaded component: `client/src/pages/compliance/dps-auditor-portal.tsx`
  - `credentials: "omit"` — no CoAIleague session cookies on any request
  - Invalid/expired token → clean error screen, no app leak

**API:** `GET /api/regulatory/auditor-portal/:token/*` (no CoAIleague auth — token-gated)
  - `/meta` → workspace name + full state config from `state_regulatory_config`
  - `/officers` → guard card status, license type, expiry (redacted)
  - `/use-of-force` → UoF incidents with filed status
  - `/armed-shifts` → armed post shift logs with GPS and guard card at time
  - `POST /auditor-portal/create-link` → owner generates shareable token

**File:** `server/routes/regulatoryPublicRoutes.ts` (225 lines)

### Task 2 — Pre-Audit Red Team Engine

**API:** `GET /api/compliance/pre-audit` (requireAuth + requireManager)
**File:** `server/routes/preAuditRoutes.ts` (289 lines)

Fully dynamic — reads from `state_regulatory_config` + `regulatory_knowledge_base`:
  - Armed shifts × expired/missing guard card → CRITICAL
  - License type insufficient for armed post (reads armedAllowed from state config) → CRITICAL
  - License expiring within 30 days → WARNING
  - UoF incidents without polished formal report → CRITICAL
  - Armed officers missing required training certs (reads from DB, not hardcoded) → CRITICAL
  - Missing liability insurance → CRITICAL

Returns `PreAuditReport`: overallRisk, auditReadinessScore (0-100), flags[].
Score: 100 - (critical × 15) - (warning × 5), floored at 0.

### Task 3 — Dynamic State Compliance Dashboard

**Frontend:** `client/src/pages/compliance/dps-auditor-portal.tsx` (472 lines)
  - All state-specific text comes from meta endpoint, not hardcoded
  - Portal label, regulatory body name, governing law citation → from `state_regulatory_config`
  - License tier names → resolved from `licenseTypes` JSONB array
  - Exhibit A: Active Roster & License Status
  - Exhibit B: Use of Force & Firearm Discharge Reports
  - Exhibit C: Armed Post Shift Logs (Proof of Presence)

### Task 4 — Data Redaction Middleware

**Applied to:** `/api/regulatory/auditor-portal/:token/*` (all endpoints)
**Stripped fields:** internalNotes, supervisorComments, billingRate, hourlyRate, payRate,
  ssn, taxId, bankAccountNumber, routingNumber, directDepositInfo, privateNotes,
  managerOnlyNotes, stripeCustomerId, compensationNotes

Nested objects recursively redacted. Guard card number, expiry, license type all preserved.

---

## Regulatory Knowledge Engine (RKE) — Wave 20

**Mission:** Trinity, HelpAI, and all spawned agents know all applicable security law,
payroll tax rules, occupation codes, UoF standards, and audit requirements for every
state CoAIleague operates in. No knowledge is hardcoded — new state = new data rows.

### Architecture

**Layer 1 — Knowledge Base Table**
`regulatory_knowledge_base` — structured rows per state per topic.
  Types: statute | case_law | occupation_code | uof_guideline | form_template
         payroll_tax_rule | license_tier | renewal_requirement | audit_checklist
         penal_code | uof_reportable_incident_types | required_armed_certifications

**Layer 2 — Retrieval Service**
`server/services/regulatoryKnowledgeService.ts` (238 lines)
  - `retrieveRegulatoryContext(stateCode, types?)` → full typed context object
  - `buildRegulatoryContextPrompt(stateCode, topic?)` → formatted string for Trinity's window
  - `ensureRegulatoryKnowledgeSchema()` → idempotent boot

**Layer 3 — Trinity Integration**
`server/services/ai-brain/aiBrainService.ts` — `handleMessage()` now:
  1. Detects regulatory topic in message (payroll/UoF/licensing/audit keywords)
  2. Reads workspace state from workspaces table
  3. Calls `buildRegulatoryContextPrompt(stateCode, topic)` — retrieves from DB
  4. Appends as `enrichedSystemPrompt` — Trinity answers with real law, not hallucination

### Seed Coverage (server/scripts/seedRegulatoryKnowledge.ts — 427 lines)

**FEDERAL (applies all states):**
  - Graham v. Connor (1989) — Objective Reasonableness 3-factor test
  - Tennessee v. Garner (1985) — Deadly force against fleeing suspects
  - UoF Report required elements (9 fields, including de-escalation documentation)
  - SOC 33-9032 (Security Guards), SOC 33-9021 (Investigators)
  - FICA rates, FLSA overtime, 1099 misclassification warning

**Texas (TX):**
  - Chapter 1702 Occupations Code — Level II/III/IV license tiers
  - Texas Penal Code §9.31 (self-defense) + §9.32 (deadly force)
  - No state income tax
  - SUI: 2.7% new employer on $9,000 wage base (TWC Form C-3)
  - Workers comp NCCI 7720 (unarmed) / 7723 (armed)
  - DPS PSB audit checklist (10 items)
  - UoF reportable incident types
  - Required armed certifications

**California (CA):**
  - BSIS Business & Professions Code §7580-7582
  - G-card (unarmed) + EFP (armed) license structure
  - SDI 1.1% employee, no wage ceiling
  - SUI 3.4% new employer on $7,000
  - EDD filing requirements

**Florida (FL):**
  - Chapter 493 FS, Class D/G licensing
  - No state income tax
  - Reemployment Tax 2.7% new employer

**New York (NY):**
  - General Business Law Article 7-A
  - Income tax 4%-10.9%, NYC tax 3.078%-3.876%
  - NYPFL 0.373% employee
  - SUI $12,300 wage base

### Tests: 24/24 passing (tests/unit/wave20-dps-portal.test.ts)
- Pre-audit flag logic (expired license, insufficient tier, expiring warning)
- Score calculation (0 critical = 100, 3 critical = 55, floors at 0)
- Data redaction (strips billing/SSN/notes, preserves audit fields)
- RKE data model (Graham factors, TX no income tax, FICA rates, FLSA threshold)
- State-agnostic portal (same URL/code for all 50 states)
- Token security (expired/revoked/valid)

---

---

## Wave 19 — PTT Radio + CAD Event Stream (Complete)

**Goal:** Push-to-talk radio inside ChatDock shift rooms. HelpAI acts as dispatcher. Every transmission becomes a CAD event.

**Files:**
- `server/services/ptt/pttDispatcherService.ts` — AI dispatcher, extraction, CAD logging (400 lines)
- `server/routes/pttRoutes.ts` — API endpoints (281 lines)
- `tests/unit/wave19-ptt.test.ts` — 38 tests, all passing
- `server/objectStorage.ts` — added `VOICE_MESSAGES` StorageDirectory
- `server/routes/domains/ops.ts` — pttRouter mounted at `/api/ptt`

**API (mounted at `/api/ptt`):**
```
POST   /api/ptt/transmit              → upload audio → transcribe → dispatch → CAD event
GET    /api/ptt/transmissions         → room transmission history
GET    /api/ptt/plates                → license plate log
GET    /api/ptt/shift-log/:roomId     → full shift radio log + AI summary
GET    /api/ptt/cad-feed              → unified CAD event stream (Matrix Ticker)
```

**Pipeline per transmission:**
1. Officer releases PTT button → POST /api/ptt/transmit with audio file
2. GCS upload → permanent URL
3. Whisper transcription (~800ms for 10s audio)
4. Gemini Flash extraction: plates, incidents, status, location, priority
5. HelpAI dispatcher response generated
6. GPS breadcrumb stamped to gps_locations
7. CAD event written to cad_event_log
8. License plates written to ptt_plate_log
9. broadcastToWorkspace x2: ptt_dispatcher_response + cad_ptt_event
10. Emergency: SMS blast to all supervisors simultaneously

**Auto-extraction (Gemini Flash per transmission):**
- License plates → ptt_plate_log (workspace-scoped, searchable)
- Incident descriptions → cad_event_log
- Status updates (10-codes) → logged
- Location references → mapped to GPS bounds when possible
- Priority: routine / urgent / emergency → triggers escalation if emergency

**HelpAI as dispatcher:**
- Responds in 1-2 sentences in radio tone
- Acknowledges officer, confirms what was logged
- Emergency: immediate, direct, supervisor alerted
- Routine: brief copy acknowledgment
- Never references 911 (liability rule enforced in prompt)

**CAD integration:**
- Every PTT transmission → cad_event_log (unified with NFC scans, clock-ins, panic alerts)
- cad_ptt_event broadcast → CAD map shows radio icon at officer's GPS position
- Matrix Ticker: GET /api/ptt/cad-feed → real-time scrolling event stream
- Plates extracted from radio → searchable plate log for CAD board

**DB schema (ensurePTTSchema() at startup):**
- ptt_transmissions (workspace_id, room_id, sender, audio_url, transcript, dispatcher_response, extract_data, gps, priority)
- ptt_plate_log (workspace_id, plate_fragment, context, reporter, gps, transmission_id)
- cad_event_log (workspace_id, event_type, source, actor, description, metadata, gps, priority) — unified stream for ALL CAD events

**Delivery stack:**
  1. WebSocket (in-app, real-time) — primary
  2. FCM/APNs push notification with audio (backgrounded) — see Wave 19 TODO
  3. Twilio SMS with transcript (offline) — see Wave 19 TODO
  4. Twilio Voice call (emergency priority only) — uses existing Wave 16 voice system

**TURN infrastructure:** Cloudflare Calls (account already on Cloudflare)
  Env vars needed: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_CALLS_TOKEN
  Enable: Cloudflare dashboard → Calls → Enable (5 minutes)

**PTT vs Competition:**
  Zello: $6-10/user/month, no AI, no auto-logging, separate app
  CoAIleague PTT: included in Professional+, AI dispatcher, auto-extraction,
  GPS stamp, CAD integration, plate log, shift summary, deep linked to platform

**Token cost per transmission:** ~$0.0011 (Whisper + Gemini Flash)
**TURN cost per relayed transmission:** ~$0.00025 (15-20% of transmissions)
**Margin at Professional tier cap (50K tx/month):** >95%

**Test coverage (38 tests):**
- Plate detection patterns (radio alphabet, standard format)
- Priority classification (routine/urgent/emergency)
- Transmission structure validation
- Audio format acceptance/rejection
- CAD event mapping
- Four-layer delivery cascade logic
- Dispatcher response quality (concise, no 911, acknowledgment format)

**Wave 19 TODO (frontend PTT button — next sprint):**
- PTT button in ConversationPane shift rooms (hold-to-talk)
- Radio crackle sound effect on open/close
- Waveform animation during recording
- Dispatcher response rendered in room with HelpAI avatar
- FCM/APNs push with audio for backgrounded officers
- Cloudflare Calls WebRTC signaling for live half-duplex (Phase 2)

---

---

## Wave 17 — Zero-Friction Migration Engine (Complete)

**Goal:** One unified AI importer for any messy competitor export. Zero overlapping services.

**Files:**
- `server/services/migration/unifiedMigrationService.ts` — all logic (452 lines)
- `server/routes/importRoutes.ts` — thin router, 8 endpoints (232 lines, rewritten)
- `server/routes/migration.ts` — STUBBED (redirects to /api/import)
- `tests/unit/wave17-migration.test.ts` — 18 tests, all passing

**Eliminated:** Old `importRoutes.ts` (706 lines, CSV-only, string input) + old `migration.ts` (487 lines, in-memory CSV jobs, unregistered AI mapper)

**New package:** `xlsx` — Excel/XLSX parsing in production

**API (mounted at `/api/import` — already in orgs.ts):**
```
POST   /api/import/parse              → upload CSV/XLSX/PDF → Gemini → jobId + preview
GET    /api/import/jobs/:jobId        → job status + all rows
PUT    /api/import/jobs/:jobId/rows   → edit individual rows before commit
POST   /api/import/jobs/:jobId/commit → approve and write to DB
DELETE /api/import/jobs/:jobId        → cancel job
POST   /api/import/rollback/:batchId  → undo a committed batch
GET    /api/import/history            → audit trail
```

**Pipeline (Parse → Review → Commit):**
1. Tenant uploads file (CSV, XLSX, PDF)
2. Server extracts raw text via `extractRawText()` (XLSX → sheet_to_csv → Gemini)
3. `parseWithGemini()` sends to Gemini Flash — returns confidence-scored rows
4. `createJob()` builds in-memory job (2h TTL) with summary counts
5. Frontend shows confidence table: auto≥90 (pre-checked), review 50-89 (yellow), fix<50 (red)
6. Tenant edits red/yellow rows inline → `PUT /jobs/:id/rows`
7. Tenant clicks Approve → `POST /jobs/:id/commit` → transaction → import_history

**Confidence scoring:**
- `auto` (≥90): pre-checked, no action needed
- `review` (50-89): tenant should verify before committing
- `fix` (<50 or blocking error): tenant must fix before commit
- `ghost`: name present, both email AND phone missing → creates employee with `status:'incomplete'` + `completion_token` UUID → SMS/email sent to self-complete

**Ghost Employee Bridge:**
When a guard is missing both email and phone (common in competitor exports):
- Record created with `onboarding_status: 'pending'` and a `completion_token`
- If phone exists: SMS sent → `https://coaileague.com/complete/{token}`
- Employee fills in their own info → profile completed
- Import never fails due to missing contact info

**Rollback:**
Every committed batch has a `batchId`. `POST /api/import/rollback/:batchId` deletes all records in employees/clients/shifts with that batchId and marks import_history as rolled_back. One click to undo a 500-guard import.

**DB schema additions (idempotent, run at startup):**
- `import_history` table (workspace_id, batch_id, entity_type, counts, status)
- `employees.import_batch_id` column
- `employees.completion_token` column
- `clients.import_batch_id` column
- `shifts.import_batch_id` column

**Supported source formats:** GetSling, TrackTik, ADP, Gusto, Deputy, When I Work, QuickBooks, plain spreadsheets, hand-typed rosters — Gemini Flash normalizes all of them.

**Test coverage (18 tests):**
- CSV/XLSX/PDF extraction
- Job creation, retrieval, workspace isolation
- Row editing + error recalculation
- Ghost detection (name present, no contact info)
- Confidence scoring rules
- Client and shift entity types
- Bulk import: 500 guards created and retrieved in <100ms

---

---

## Wave 16 — Trinity 360 Omni-Channel SOC Telephony (Complete)

**Architecture:** One master Twilio number. Trinity answers all calls. Tenants identified by `workspaces.state_license_number` or `workspaces.twilio_phone_number`. Guest flow handles prospects, law enforcement, complainants.

**Key Files:**
- `server/services/trinityVoice/voiceOrchestrator.ts` — handleInbound, resolveWorkspaceFromPhoneNumber
- `server/services/trinityVoice/tenantLookupService.ts` — lookupByLicenseNumber, lookupByCompanyName, resolveOnDutyContact
- `server/services/trinityVoice/extensions/guestExtension.ts` — guest IVR, tenant lookup, smart transfer
- `server/services/trinityVoice/extensions/tenantPortalExtension.ts` — full 9-option portal per tenant
- `server/routes/voiceRoutes.ts` — all webhook endpoints

**Database:** NO workspace_phone_numbers table (eliminated as bloat).
`workspaces.twilio_phone_number` column handles dedicated per-tenant numbers.
`workspaces.state_license_number` is the public lookup key for guest callers.

**Priority Waterfall:** Supervisor on shift → Manager on shift → Co-Owner → Owner → Voicemail+SMS

**Tenant Portal Menu (auto-provisioned at registration):**
1. Guards/Officers → schedule, clock in/out, calloff, pay
2. Clients/Site Contacts → coverage check, concerns, billing
3. Urgent → blast SMS all contacts + immediate Dial
4. Complaint → collect name+purpose → on-duty manager
5. Hiring → texts application link instantly
6. Employment Verification → platform query
7. Pay/Timesheet → platform query
8. Speak with Manager → collect + Dial waterfall
0. Trinity AI → Gemini Live free-talk

**TwiML Safety Net (Directive 3):**
`/api/voice/inbound` catch block returns valid TwiML with `<Dial>` to owner.
Env var: `VOICE_FALLBACK_PHONE` (defaults to `OWNER_PHONE`, then `8302134562`).
Caller NEVER gets a dead line.

**911 Liability Rule — Enforced:**
Zero "911" in any TTS string. Trinity says "urgent" not "emergency dispatch."
No duty to public safety created for CoAIleague, tenants, or Trinity.

**Env Vars (all already in Railway):**
- `TWILIO_PHONE_NUMBER` — master number
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` — Twilio auth
- `GEMINI_API_KEY` — Gemini Live
- `VOICE_FALLBACK_PHONE` — safety net fallback (optional, defaults to owner phone)

**Statewide (C11608501) — First Tenant:**
- Bryan's phone from `users.phone` (owner record) is the transfer target
- All transfers waterfall to Bryan until supervisors/managers are added
- No manual config needed — shift schedule drives routing automatically

---

---

## WAVE COMPLETION STATUS

| Wave | Domains | Status | Key Deliverables |
|---|---|---|---|
| 1 | Infrastructure, Auth, RBAC, Orgs, Notifications | ✅ | Auth pipeline, WS, rate limiting, dedup |
| 2 | Onboarding, Workforce, Compliance, Training, Documents | ✅ | HR forms, DPS license compliance, PDF generation |
| 3 | Scheduling, Time, Ops, FieldOps, Auditor | ✅ | Anti-spoofing, storage typing, panic chain, contracts |
| 4 | Billing, Payroll, Finance, Clients, Sales | ✅ | Revenue domain, ACH dispatch, FinancialCalculator |
| 5 | Comms, ChatDock, Gemini Live, Redis buffer, Omni-Inbox | ✅ | ChatDock, seqNum, Resend inbound, token metering |
| 6 | Trinity Agency, ATS, Episodic Memory | ✅ | AI interview rubric, vision verification, memory loop |
| 6.5 | Schema Consolidation | ✅ | 30 dead tables dropped, 4 composite indexes, pgView |
| 6.7 | Zombie Code Purge | ✅ | 23 dead services deleted, 6.5MB assets purged |
| 7 | Frontend Bridge | ✅ | Action Blocks, seqNum replay, ChatDockErrorBoundary |
| 8 Part 1 | Zero-Defect Sweep | ✅ | Stuck buttons, mutex locks, 11 error boundaries |
| 8 Part 2 | Re-Auth Safety Net | ✅ | ReAuthModal — managers never lose in-progress work |
| 8.1 | SPS Production Migration | ✅ | Diagnostic route, PLAID_WEBHOOK_SECRET warnOnly |
| 8.2 | Financial Integrity & Billing Audit | ✅ | Token pipe unified, Stripe IDs to env vars |
| 9 | Native Financial Polish | 🔲 | 941/940 PDF rendering, YTD wage accumulator |
| 10 | Client Value & Analytics Engine | 🔲 | Trinity financial simulator (Action Blocks) |
| 11 | DPS Auditor Portal & Compliance Sandbox | 🔲 | Wave 11 stubs preserved |

---



---

## NATIVE FINANCIAL STACK (built in-house — no third-party payroll API)

**Tax Engine:** `server/services/tax/taxRulesRegistry.ts` (v2025.1)
- IRS Pub 15-T federal brackets for all 4 filing statuses (2025 rates)
- All 50 states + DC income tax (flat and progressive)
- FICA: SS 6.2% (wage base $176,100), Medicare 1.45% + 0.9% additional
- FUTA 6.0% gross / 0.6% net, SUTA new-employer rates all 50 states

**Calculation Engine:** `server/services/payrollAutomation.ts` (2,378 lines)
- Gross → net: pre-tax deductions → FICA → federal/state brackets → post-tax → garnishments
- YTD SS wage base tracking (stops at $176,100)
- 1099 contractors: zero withholding, straight gross pay
- Decimal-safe via FinancialCalculator (decimal.js — no float drift)
- Full calculation audit trail stored in payroll_entries.calculationInputs

**Form Generation:** `server/services/taxFormGeneratorService.ts` (1,068 lines)
- W-2: Real PDFKit layout with IRS box coordinates (Box a–12)
- 1099-NEC: Full form with payer EIN, recipient TIN, Box 1
- Form 941 (quarterly): All IRS line items calculated (PDF layout pending Wave 9)
- Form 940 (annual FUTA): Data complete (PDF layout pending Wave 9)
- Saves to tenant document vault + writes employee_tax_forms record

**ACH Dispatch:** netPay (not grossPay) flows to `achTransferService.initiatePayrollAchTransfer()`
- Plaid ACH: tenant bank → employee bank (platform never touched)
- Stripe Connect: alternative payout method when Plaid unavailable

**Middleware Fees (passive income):**
- Payroll: $3.50/employee/run (tier discounts: Pro -10%, Enterprise -20%)
- Invoice: 2.9% + $0.25 flat per payment processed
- Stripe Connect payouts: 0.75% (our cost 0.25%)
- W-2: $5.00/form | 1099-NEC: $3.00/form | 941/940: included

**NOT built (intentional):**
- IRS e-filing: requires IRS authorization — tenants file manually with the generated PDF

---

## THE LIFECYCLE PIPELINE (master flow — DO NOT BREAK)

```
Client signs contract (POST /api/client-portal/:clientId/sign-contract)
  clientLifecycleStatus = 'active'  ←── financial gate cleared
  client_contract_signed event ──→ AutomationTriggerService ──→ Trinity notifies manager

Manager publishes schedule (POST /api/schedules/publish)
  Financial gate: clientLifecycleStatus must be 'active' or 403 PUBLISH_BLOCKED
  Shifts updated to 'scheduled'
  WebSocket: type='schedule_published' ──→ ForceRefreshProvider invalidates queries
  AutomationTriggerService: generateWeeklyInvoices()

Stripe invoice paid ──→ /api/webhooks/stripe
  invoice_paid event ──→ owner notification
  AR close-out

Timesheet approved ──→ time_entries_approved event
  executePayrollProcessing() ──→ requestApproval()
  Manager approves ──→ executeApprovedPayroll()
  W-2: calculatePayrollTaxes() (federal + FICA + state)
  1099: isContractor=true → skip withholding
  initiatePayrollAchTransfer() (Plaid) ──→ payroll_run_paid ──→ employee notified

Lone worker misses check-in (*/5 cron)
  nextCheckInDue > 15min ago → panicAlertService.triggerAlert()
  SMS blast to full supervisor chain
  loneWorkerSessions.status = 'escalated'
```

---

## DOMAIN OWNERSHIP MAP

| Domain | Schema file | Route mount | Key service |
|---|---|---|---|
| Auth | `shared/schema/domains/auth/` | `/api/auth` via `domains/auth.ts` | `server/auth.ts` |
| Orgs | `shared/schema/domains/orgs/` | `/api/orgs` via `domains/orgs.ts` | `workspaceLifecycleService.ts` |
| Scheduling | `shared/schema/domains/scheduling/` | `/api/shifts`, `/api/schedules` | `schedulesRoutes.ts`, `shiftRoutes.ts` |
| Time | `shared/schema/domains/time/` | `/api/time-entries`, `/api/breaks` | `time-entry-routes.ts` |
| Ops | `shared/schema/domains/ops/` | `/api/incident-pipeline`, `/api/safety` | `panicAlertService.ts` |
| FieldOps | `shared/schema/domains/ops/` | `/api/safety/*geofences*` | `safetyRoutes.ts` |
| Auditor | `shared/schema/domains/compliance/` | `/api/regulatory-portal` | `regulatoryPortal.ts` |
| Billing | `shared/schema/domains/billing/` | `/api/billing`, `/api/invoices` | `billingAutomation.ts` |
| Payroll | `shared/schema/domains/payroll/` | `/api/payroll` | `payrollAutomation.ts`, `achTransferService.ts` |
| Clients | `shared/schema/domains/clients/` | `/api/clients`, `/api/client-portal` | `clientPortalSignContractRoutes.ts` |
| Finance | `shared/schema/domains/billing/` | `/api/financial-reports`, `/api/trinity-cfo` | `financialReportsService.ts`, `cfoTools.ts` |
| Workforce | `shared/schema/domains/workforce/` | `/api/employees` | `employeeRoutes.ts` |
| Compliance | `shared/schema/domains/compliance/` | `/api/compliance/*` | `regulatoryPortal.ts` |
| Training | `shared/schema/domains/training/` | `/api/training` | `trainingCertificationRoutes.ts` |
| Documents | `shared/schema/domains/sps/` | `/api/documents` | `documentRoutes.ts` |
| Trinity | `shared/schema/domains/trinity/` | `/api/trinity-chat`, `/api/trinity-cfo` | `trinityChatService.ts`, `cfoTools.ts` |

---

## STORAGE ARCHITECTURE (enforce this strictly)

### The Law: All uploads go through buildStoragePath()
```typescript
import { uploadFileToObjectStorage, buildStoragePath, StorageDirectory } from '../objectStorage';

// CORRECT — compiler enforces workspaceId namespace
const path = buildStoragePath(workspaceId, StorageDirectory.INCIDENTS, incidentId, filename);
await uploadFileToObjectStorage({ objectPath: path, buffer, workspaceId, storageCategory: 'media' });

// WRONG — bypass detected in Wave 3 audit
const path = `incidents/${filename}`; // ❌ no workspaceId namespace
```

### StorageDirectory enum values (all valid paths):
```
INCIDENTS       → workspaces/{wsId}/incidents/{entityId}/{filename}
CONTRACTS       → workspaces/{wsId}/contracts/{entityId}/{filename}  
CHAT            → workspaces/{wsId}/chat/{entityId}/{filename}
DPS_LICENSES    → workspaces/{wsId}/dps-licenses/{entityId}/{filename}
TIME_PHOTOS     → workspaces/{wsId}/time-photos/{entityId}/{filename}
DAR_ATTACHMENTS → workspaces/{wsId}/dar-attachments/{entityId}/{filename}
PAYROLL         → workspaces/{wsId}/payroll/{entityId}/{filename}
TAX_FORMS       → workspaces/{wsId}/tax-forms/{entityId}/{filename}
COMPLIANCE_DOCS → workspaces/{wsId}/compliance-docs/{entityId}/{filename}
AUDIT_EXPORTS   → workspaces/{wsId}/audit-exports/{entityId}/{filename}
CLIENT_DOCS     → workspaces/{wsId}/client-docs/{entityId}/{filename}
```

### Photo URL Validation (Wave 3 hardening):
Clock-in photos MUST come from our GCS bucket. `validateStoragePhotoUrl()` in `time-entry-routes.ts` enforces this. External URLs return 400 EXTERNAL_PHOTO_URL_REJECTED.

---

## TRINITY ARCHITECTURE (immutable rules)

### Identity
- Trinity is ONE unified individual — not modes, not toggles, not personalities
- Purple = Trinity elements exclusively
- Gold = HelpAI exclusively
- Trinity NEVER provides legal advice
- Trinity NEVER assumes duty of care

### Autonomy Ladder (per-workspace, stored in trinity_workspace_autonomy)
```
off                  → Read-only, no actions
advisory             → Recommends, waits for explicit confirm
order_execution      → DEFAULT. Executes operator orders within risk limits
supervised_autonomous → Proactively queues high-confidence low-risk fixes
```
Hard ceilings (non-bypassable regardless of autonomy mode):
- Dollar threshold table in `financialApprovalThresholds.ts`
- Public safety boundary (CLAUDE.md / TRINITY.md)
- `trinityConscience.ts` veto rules

### Trinity CFO Tools (read-only, safe to call in any context)
```typescript
import { monthlyPnL, arAgingSummary, cashRunway, expenseTrend,
         clientProfitability, companyHealth } from '../services/trinity/cfoTools';
```

### Action Budget
- Hard ceiling: 300 total registered Trinity actions
- Current estimate: ~280 (check `platformActionHub.ts` before registering more)

---

## NOTIFICATION SYSTEM

### Dedup Window: 6 hours (NOTIFICATION_DEDUP_WINDOW_MS in shared/config/notificationConfig.ts)
Exception: Panic alerts use unique idempotency key `panic_sms_{alertId}_{recipientId}` — always fires regardless of dedup.

### Panic Alert chain (never touch this without legal approval):
1. `panicAlertService.triggerAlert()` → DB insert → `notifyEmergencyContacts()` → SMS to all managers/owners
2. `broadcastToWorkspace({ type: 'safety:panic_alert', priority: 'critical', requiresAcknowledgment: true })`
3. `platformEventBus.publish({ type: 'panic_alert_triggered', metadata: { priority: 'CRITICAL' } })`
4. `autoCreateCadCall()` → CAD-SOS-{alertNumber}

Tier: `panic_alerts: 'free'` — NEVER blocked by billing. Check `tierDefinitions.ts`.

---

## WEBSOCKET EVENT NAMES (frontend must subscribe to exact strings)

Events the server emits via `broadcastToWorkspace()`:
```
shift_created           → shift added
shift_updated           → shift modified
shift_deleted           → shift removed
schedule_published      → week published (ForceRefreshProvider subscribed ✅)
shifts_bulk_created     → recurring pattern generated (ForceRefreshProvider subscribed ✅)
schedules_updated       → legacy alias (keep for backward compat)
safety:panic_alert      → panic triggered (priority: critical)
safety:panic_acknowledged
safety:panic_resolved
client_contract_signed  → contract signed, financial gate cleared
payroll_run_paid        → ACH initiated
```

**Critical:** The frontend bus dispatches by `data.type` string. If you add a new server event, you MUST add the matching `bus.subscribe('your_event', ...)` in `client/src/contexts/ForceRefreshProvider.tsx`.

---

## CRON JOB INVENTORY (autonomousScheduler.ts unless noted)

| Schedule | Job | File |
|---|---|---|
| `*/5 * * * *` | Shift reminders | autonomousScheduler.ts |
| `*/5 * * * *` | Lone worker SLA escalation → panic | autonomousScheduler.ts ← Wave 3 |
| `*/5 * * * *` | ReportBot check-in | autonomousScheduler.ts |
| `0 2 * * *` | Notification cleanup | notificationCleanupService.ts |
| `30 2 * * *` | Trinity social graph recalc | autonomousScheduler.ts |
| `30 2 * * *` | Officer score recompute | scoringScheduler.ts |
| `0 3 * * *` | AI usage daily rollup | autonomousScheduler.ts |
| `0 3 * * *` | Trinity incubation cycle | autonomousScheduler.ts |
| `0 3 * * *` | Token cleanup | tokenCleanupService.ts |

**Note:** Multiple jobs at the same time = NORMAL. They do different things. Only true duplicates (same job, multiple registrations) are removed.

---

## SCHEMA CONVENTIONS

### Enum placement
- New enums → `shared/schema/enums.ts` FIRST
- Then import into domain schema file
- NEVER define enums inline in domain files (breaks barrel exports)

### Workspace scoping
- Every query that returns tenant data MUST include `eq(table.workspaceId, workspaceId)`
- FK columns to shifts MUST be included in the shift DELETE cascade (app-layer in `shiftRoutes.ts`)

### Tax records
- `employeeTaxForms` table stores W-2 and 1099 with `formType: 'w2' | '1099'`
- Tax forms generated on-demand at year-end via `taxFormGeneratorService.ts`
- NOT generated per payroll run (correct behavior — IRS year-end aggregates)

---

## DEV LOGIN

```
GET /api/auth/dev-login       → Marcus Rivera (owner@acme-security.test)
GET /api/auth/dev-login-root  → Root admin
Password: admin123
```

---

## BUILD COMMANDS

```bash
node build.mjs                    # Production build
npx vitest run                    # Run all tests (270 expected to pass)
node build.mjs && npx vitest run  # Full gate check
```

Server TSC (memory-limited):
```bash
node --max-old-space-size=2048 node_modules/typescript/bin/tsc --project tsconfig.server.json --noEmit
```

---

## REPOSITORY

- **Repo:** Coaileague/Coaileague
- **Token:** `GH_TOKEN_REDACTED`
- **Deployment branch:** `main` → Railway (auto-deploy on push)
- **Work branch:** `development` → merge to main when green

---

## WAVE 4 — FINANCIAL & COMMERCIAL LOGIC (COMPLETE ✅)

### Client State Machine — Canonical ENUM
**File:** `shared/schema/enums.ts` → `clientLifecycleStatusEnum`
**Values:** `pending_onboarding | pending_approval | active | past_due | terminated`
- `pending_onboarding`: client record created, no contract
- `pending_approval`: client signed (Gate 1), awaiting SPS countersignature
- `active`: dual-signature complete — shifts CAN publish
- `past_due`: payment failure — shifts HARD-BLOCKED
- `terminated`: permanent — access revoked, sessions invalidated

### Service Agreement Double-Gate
**Route file:** `server/routes/clientPortalSignContractRoutes.ts`
- Gate 1: `POST /:clientId/sign-contract` → `pending_approval` (client sig only)
- Gate 2: `POST /:clientId/countersign` → `active` (SPS operator sig — MANAGER+ required)
- Publish gate in `schedulesRoutes.ts` checks `clientLifecycleStatus === 'active'` ONLY
- Schema columns on `clientContracts`: `clientSignatureData/At/By/Ip` + `counterSignatureData/At/By/Ip/Name`

### RBAC Guillotine
**File:** `server/middleware/requireActiveClientAgreement.ts`
- Blocks `terminated` → 403 + calls `revokeClientPortalSessions(clientId)`
- Blocks `past_due` → 403 with payment recovery URL
- Applied at: `server/routes/domains/clients.ts` → `/api/client-portal/*`
- Exempt: `/billing`, `/support`, `/coi`, `/health`

### Government ID Vault
**Table:** `clientIdentifications` (`shared/schema/domains/clients/index.ts`)
- Columns: idType, idNumber (last-4 only), frontImagePath, backImagePath, verificationStatus
- Status lifecycle: `pending → verified → rejected → expired`

### 10% Auto-Pay Discount
**File:** `server/services/billingAutomation.ts` inside `db.transaction()`
- Checks Stripe customer for active default payment method
- Injects `-10% Auto-Pay Discount` row into `invoiceLineItems` with snapshotted absolute dollar amount
- Adjusts invoice total in same transaction — atomic, no race conditions

### Stripe Connect — Multi-Party Routing
**File:** `server/services/billing/stripeConnectService.ts`
- `createDestinationCharge()`: client pays → funds route to tenant's Stripe Connect account via Destination Charges
- Platform takes `PLATFORM_FEE_PERCENT` (2.5%) as application_fee_amount
- Tenant `stripeConnectAccountId` stored in `orgFinanceSettings.stripeConnectAccountId`
- `onboardTenantConnectAccount()`: creates Stripe Express account + returns onboarding URL

### Plaid ACH Payroll Routing (Confirmed Isolation)
**File:** `server/services/payroll/achTransferService.ts`
- ORIGIN (funding source): `orgFinanceSettings.plaidAccountId` — TENANT bank
- DESTINATION: `employeeBankAccounts.plaidAccountId` — EMPLOYEE bank
- CoAIleague corporate accounts: NEVER TOUCHED

### Dunning State Locks
**Webhook:** `server/services/billing/stripeWebhooks.ts` → `handleInvoicePaymentFailed()`
- Sets `workspaces.subscriptionStatus = 'past_due'` (existing)
- NEW: Sets `clients.clientLifecycleStatus = 'past_due'` when `invoice.metadata.clientId` is present
- Publish gate (`schedulesRoutes.ts`): blocks all publishing when `workspace.subscriptionStatus === 'past_due'`
- Payroll gate (`payrollRoutes.ts`): blocks payroll run when `subscriptionStatus === 'past_due'`

### Trinity Financial Conscience — Approval Gate
**Service:** `server/services/trinity/trinityFinancialConscience.ts`
**Table:** `trinityFinancialDrafts` (`shared/schema/domains/trinity/index.ts`)
**Routes:** `server/routes/trinityFinancialDraftRoutes.ts` → `/api/trinity/financial-drafts`

Actions (registered in `actionRegistry.ts`):
- `finance.stage_invoice_generation` → drafts invoice math, notifies owner, waits for APPROVE
- `finance.stage_payroll_run` → drafts payroll math, notifies owner, waits for APPROVE
- `finance.execute_approved_draft` → triggered by APPROVE click; runs real Stripe/Plaid calls

**RULE:** Trinity NEVER calls Stripe or Plaid directly on financial actions.
Only `executeApprovedDraft()` after human APPROVE click moves money.

### Do Not Duplicate / Conflict Rules
- Do NOT add another sign-contract route — the double-gate in `clientPortalSignContractRoutes.ts` is the canonical path
- Do NOT call `generateWeeklyInvoices()` from Trinity directly — use `finance.stage_invoice_generation` + APPROVE gate
- Do NOT set `clientLifecycleStatus = 'active'` anywhere except Gate 2 (`/countersign` route)
- The Plaid ACH service already uses tenant bank as origin — do NOT add another Plaid service

---


---

# ══════════════════════════════════════════════════════════════════
# RAILWAY MIRROR PROTOCOL — MANDATORY PRE-COMMIT GATE (v2.0)
# Effective after Wave 16 deployment failures. NEVER SKIP THIS.
# ══════════════════════════════════════════════════════════════════

## THE FOUR FAILURE MODES THAT HAVE BURNED PRODUCTION

| Failure | Symptom | Missed by | Caught by |
|---|---|---|---|
| `await` in non-async callback | `esbuild: await can only be used inside async` | TSC (OOM) | `vite build` |
| Duplicate object key | `esbuild: Duplicate key "enabled"` | TSC (OOM) | `vite build` |
| JSX outside component return | `esbuild: Expected ) but found {` | TSC (OOM) | `vite build` |
| Escaped template literal `\${var}` | `esbuild: Syntax error backtick` | TSC (OOM) | `vite build` |
| Duplicate schema column | Drizzle OOM on boot → Railway crash | build.mjs | manual grep |

## THE MANDATORY COMMAND SEQUENCE (run in this exact order)

```bash
# STEP 1 — Client build (catches all esbuild/JSX/syntax errors exactly as Railway does)
npx vite build

# STEP 2 — Server build (catches import errors, missing exports)
node build.mjs

# STEP 3 — Tests
npx vitest run

# STEP 4 — Schema duplicate check (run after any schema edit)
grep -rn "^\s\+\(\w\+\):" shared/schema/domains/orgs/index.ts | sort | uniq -d

# ALL FOUR MUST BE GREEN BEFORE git commit. NO EXCEPTIONS.
```

## WHY TSC --noEmit IS NOT SUFFICIENT

The full codebase (1.1M+ lines) causes Node.js heap exhaustion during TSC's
type-checking phase. TSC crashes with OOM and exits 0 (no error reported) —
giving a FALSE POSITIVE. The build appears green. It is not.

**Resolution:** `vite build` uses esbuild which is written in Go — no heap
limit, no OOM. It is the exact tool Railway uses. TSC is useful for type
checking individual modules during development but MUST NOT be the sole
gate before a production commit.

## PYTHON INJECTION RULES (after multiple escaped-literal failures)

When injecting TypeScript/TSX via Python heredocs or string manipulation:
- Template literals: `${var}` NOT `\${var}` — Python escaping bleeds through
- Backticks in strings: use raw strings `r"""..."""` to prevent escaping
- JSX placement: always confirm modal/overlay JSX is INSIDE the component
  return statement, not after the closing tag
- After ANY Python injection: run `npx vite build` immediately, not just build.mjs
- Check injected file with: `grep -n '\\$\|\\`' client/src/pages/[modified-file].tsx`

## SCHEMA DUPLICATE PREVENTION

Before adding any column to an existing table:
```bash
grep -n "columnName" shared/schema/domains/*/index.ts
```
Zero results required before proceeding. One duplicate = Drizzle OOM at boot = Railway crash.

---

# ══════════════════════════════════════════════════════════════════
# WAVE COMPLETION STATUS — UPDATED (Waves 9–16)
# ══════════════════════════════════════════════════════════════════

| Wave | Name | Status | Key Files |
|---|---|---|---|
| 9 | Armor Plate — Financial & Legal Compliance | ✅ | `evidenceBundleService.ts`, `taxFormGeneratorService.ts` |
| 10 | Migration Concierge & ChatDock Action Middleware | ✅ | `migration.ts` (487L), `importRoutes.ts` (706L), `chatActionBlockRoutes.ts` |
| 11 | CFO Brain & Margin Protection | ✅ | `tokenVelocitySentinel.ts`, `safeToSpendService.ts`, `ghostExpenseAuditor.ts` |
| 12 | NFC Physical Integrity & Office/Asset Verification | ✅ | `nfcIntegrityService.ts`, `officeAuditService.ts`, `patrolWatcherService.ts` |
| 13 | Revenue & Stability | ✅ | `liveIntegrityFeed.ts`, `morningBriefService.ts`, `rfpLibraryService.ts`, `sb140ComplianceGate.ts` |
| 14 | Smart RMS | ✅ | `smartRmsService.ts`, `sitePassDownLog`, `bannedEntities`, `incidentReportClientCopies` |
| 14.5 | RMS Frontend Bridge | ✅ | `worker-dashboard.tsx` (shift brief modal), `rms-hub.tsx`, `worker-incidents.tsx` |
| 15 | Strategic Pricing Restructure | ✅ | `billingConfig.ts`, `pricing.tsx` |
| 16 | Trinity 360 Omni-Channel SOC Telephony | ✅ | `tenantLookupService.ts`, `guestExtension.ts` (603L), `tenantPortalExtension.ts` (695L), `voiceRoutes.ts` (5300L+) |

---

# ══════════════════════════════════════════════════════════════════
# WAVE 14 — SMART RMS (COMPLETE ✅)
# ══════════════════════════════════════════════════════════════════

## Schema Additions (ops domain)
- `sitePassDownLog` — priority/category/24h TTL/acknowledged_by
- `bannedEntities` — unified BOLO + trespass, queried at clock-in
- `incidentReportClientCopies` — sanitized pipeline: strips PII, supervisor approves, client portal sync
- `dailyActivityReports` extended: autoAggregated, eventTimeline, nfcTapCount, clientApprovedNarrative

## Service: server/services/rms/smartRmsService.ts
- `generateAutoDar()` — shift events → chronological timeline
- `translateNarrative()` — raw guard notes → formal third-person (Trinity drafts, guard approves)
- `approveNarrativeDraft()` — guard approval step before DAR submission
- `generateShiftBrief()` — BOLOs + pass-downs injected at clock-in
- `createClientCopy()` — PII-stripped incident report → client portal

## Routes
- `GET /api/rms/dars/auto-generate?shiftId=X`
- `POST /api/rms/dars/auto-submit`
- `POST /api/rms/narrative/translate`
- `POST /api/rms/narrative/approve`
- `GET /api/rms/shift-brief?siteId=X`
- `POST /api/rms/incidents/:id/client-copy`

## Trinity Actions (trinityComplianceIncidentActions.ts)
- `rms.translate_narrative`, `rms.approve_narrative`, `rms.generate_dar`,
  `rms.shift_brief`, `rms.create_client_copy`

---

# ══════════════════════════════════════════════════════════════════
# WAVE 14.5 — RMS FRONTEND BRIDGE (COMPLETE ✅)
# ══════════════════════════════════════════════════════════════════

## Modified Files
- `client/src/pages/worker-dashboard.tsx`
  - Shift Brief intercept modal (hasCritical → mandatory acknowledge)
  - `handleClockAction` MUST be `async` — it contains `await fetch()`
  - Modal JSX MUST be INSIDE `WorkerDashboardInner` return, INSIDE `CanvasHubPage`
  - NEVER place modal after `</CanvasHubPage>` or outside the component function

- `client/src/pages/rms-hub.tsx`
  - Auto-DAR panel in Create DAR modal
  - "Approve for Client" button with clientCopySynced Set state

- `client/src/pages/worker-incidents.tsx`
  - "Draft with Trinity" button + trinityDraft state
  - Approval block before final submission

## Hard Rules for worker-dashboard.tsx
```typescript
// ✅ CORRECT
const handleClockAction = useCallback(async () => {
  const briefRes = await fetch(`/api/rms/shift-brief?siteId=${siteId}`...);
});

// ❌ BROKEN — await in non-async = vite build failure
const handleClockAction = useCallback(() => {
  const briefRes = await fetch(...);  // esbuild rejects this
});
```

---

# ══════════════════════════════════════════════════════════════════
# WAVE 16 — TRINITY 360 OMNI-CHANNEL SOC TELEPHONY (COMPLETE ✅)
# ══════════════════════════════════════════════════════════════════

## Architecture Decision: ONE master Twilio number
- All calls → single TWILIO_PHONE_NUMBER env var
- Trinity identifies tenant from spoken license # or company name
- No per-tenant Twilio numbers needed
- Twilio webhook: POST https://www.coaileague.com/api/voice/inbound ← ALREADY CONFIGURED

## Key Files
| File | Lines | Purpose |
|---|---|---|
| `server/routes/voiceRoutes.ts` | 5300+ | All IVR routes, duress, missed call SMS, ChatDock sync |
| `server/services/trinityVoice/voiceOrchestrator.ts` | 482 | handleInbound, buildMainIVR, resolveWorkspaceFromPhoneNumber |
| `server/services/trinityVoice/tenantLookupService.ts` | 187 | lookupByLicenseNumber, lookupByCompanyName, resolveOnDutyContact |
| `server/services/trinityVoice/extensions/guestExtension.ts` | 603 | handleGuestIdentify, handleTenantLookup, handleSmartTransfer, handleAnnounceCaller |
| `server/services/trinityVoice/extensions/tenantPortalExtension.ts` | 695 | Full 9-option tenant phone portal |
| `server/services/trinityVoice/geminiLiveBridge.ts` | 264 | Twilio Media Streams → Gemini Live bidirectional audio |

## Priority Waterfall (resolveOnDutyContact)
```
1st → Supervisor on active shift (workspace_role = supervisor / shift_leader)
2nd → Manager / Dept Manager on active shift
3rd → Co-Owner (if phone on file)
4th → Owner (always has phone — fallback of last resort)
5th → Voicemail → SMS notification to owner
```
Statewide Protective Services (C11608501): Steps 1-3 return empty → Bryan 830-213-4562 gets all calls.
When supervisors/managers are added: they get calls first automatically. Zero config change needed.

## Tenant Portal Menu (all tenants — identical structure, isolated data)
```
1 → Guards/Officers (schedule, clock in/out, calloff, pay, supervisor)
2 → Clients/Site Contacts (coverage check, concerns, billing, coverage request)
3 → Urgent Situation (blast SMS all contacts + immediate Dial)
4 → Complaint (collect name + purpose → Dial on-duty manager)
5 → Hiring/Employment (text application link from workspace.voice_hiring_link)
6 → Employment Verification (platform query → response)
7 → Pay/Timesheet (platform query → weekly hours + OT)
8 → Speak with Manager (collect name + purpose → Dial waterfall)
0 → Trinity AI free-talk (Gemini Live + tenant context)
```

## SOC Features
- **Duress bypass**: POST /api/voice/duress-check — first 3 seconds every call
  Phrases: "code red", "officer needs assistance", "mayday" + Spanish equivalents
  → blast SMS ALL contacts simultaneously + immediate Dial (no whisper, no menu)
- **Missed call SMS**: POST /api/voice/missed-call-sms — fires when caller hangs up during hold
- **ChatDock live card**: POST /api/voice/call-chatdock-sync — call_start + call_end events
- **Caller identity**: lookupCallerByPhone(From, workspaceId) → personalized greeting

## Auto-Provisioning (workspace.ts createWorkspace)
Every new tenant registration automatically gets:
- voice_hiring_link = https://coaileague.com/apply/{orgCode}
- voice_portal_enabled = true
No manual setup. License number in workspaces.state_license_number is the public routing key.

## 911 Hard Rule (NON-NEGOTIABLE — ZERO EXCEPTIONS)
Trinity NEVER says "call 911" or implies she dispatches public safety resources.
No "911" in ANY voice TTS string. Duress → "Connecting your supervisor immediately."
Emergency → "I am notifying management now."
Violations create legal duty and liability for CoAIleague and all tenants.
Enforced in: publicSafetyGuard.ts, trinityConscience.ts, trinityActionDispatcher.ts,
panicAlertService.ts, AND all tenantPortalExtension.ts voice strings.

## Schema Additions (workspaces table — orgs domain)
```typescript
voiceHiringLink: varchar("voice_hiring_link")
voiceCustomGreeting: text("voice_custom_greeting")
voiceCustomGreetingEs: text("voice_custom_greeting_es")
voicePortalEnabled: boolean("voice_portal_enabled").default(true)
// stateLicenseState already existed at L835 — DO NOT ADD AGAIN
```

## Do Not Duplicate / Conflict Rules
- DO NOT add a second stateLicenseState to orgs schema — already at line 835
- DO NOT add per-tenant Twilio numbers — one master number is the architecture
- DO NOT add 911 to any voice TTS string — hard liability rule
- DO NOT call resolveOnDutyContact without a workspaceId — will query wrong tenant

---

# ══════════════════════════════════════════════════════════════════
# REACT / FRONTEND HARD RULES (permanent — from Wave 8)
# ══════════════════════════════════════════════════════════════════

```typescript
// ✅ CORRECT — use TanStack Query's isPending
<button disabled={mutation.isPending}>Submit</button>

// ❌ FORBIDDEN — local loading state with mutation
const [isSubmitting, setIsSubmitting] = useState(false); // never do this

// ✅ CORRECT — async callback when using await inside
const handleAction = useCallback(async () => {
  const res = await fetch('/api/...');
}, [dep]);

// ❌ BROKEN — vite build fails
const handleAction = useCallback(() => {
  const res = await fetch('/api/...'); // ERROR: await in non-async
}, [dep]);

// ✅ CORRECT — single key per object in useQuery
useQuery({ queryKey: [...], enabled: someCondition });

// ❌ BROKEN — duplicate key, vite build fails
useQuery({ queryKey: [...], enabled: false, enabled: someCondition });

// ✅ CORRECT — JSX modal/overlay inside the component's return
function MyComponent() {
  return (
    <CanvasHubPage>
      {/* all content */}
      {modalOpen && <Modal />}  {/* ← INSIDE CanvasHubPage */}
    </CanvasHubPage>
  );
}

// ❌ BROKEN — JSX outside return scope
function MyComponent() {
  return (<CanvasHubPage>{/* content */}</CanvasHubPage>);
}
{modalOpen && <Modal />}  {/* ← OUTSIDE — esbuild parse failure */}
```

---

# ══════════════════════════════════════════════════════════════════
# ENV VAR REGISTRY (production Railway — complete list)
# ══════════════════════════════════════════════════════════════════

| Var | Purpose | Required |
|---|---|---|
| DATABASE_URL | Neon PostgreSQL connection string | ✅ |
| TWILIO_ACCOUNT_SID | Twilio auth | ✅ |
| TWILIO_AUTH_TOKEN | Twilio auth | ✅ |
| TWILIO_PHONE_NUMBER | Master voice number | ✅ |
| GEMINI_API_KEY | Gemini Flash + Gemini Live | ✅ |
| OPENAI_API_KEY | GPT fallback + Whisper | ✅ |
| ANTHROPIC_API_KEY | Claude (Trinity triad) | ✅ |
| RESEND_API_KEY | Transactional email | ✅ |
| RESEND_WEBHOOK_SECRET | Inbound email verification | ✅ |
| STRIPE_SECRET_KEY | Billing | ✅ |
| STRIPE_WEBHOOK_SECRET | Stripe events | ✅ |
| PLAID_CLIENT_ID | ACH payroll | ✅ |
| PLAID_SECRET | ACH payroll | ✅ |
| SESSION_SECRET | Express sessions | ✅ |
| ENCRYPTION_KEY | PII field encryption | ✅ |
| QUICKBOOKS_CLIENT_ID | QB integration | optional |
| QUICKBOOKS_CLIENT_SECRET | QB integration | optional |
| ENABLE_PATROL_WATCHER | Wave 12 crons | optional |
| ENABLE_MORNING_BRIEF | Wave 13 6AM cron | optional |

No new env vars needed for Wave 16. All voice routing is code-driven from the database.

---

## RAILWAY MIRROR PROTOCOL — PERMANENT BUILD RULE
*Instituted after Wave 16 deployment failures. Must be followed before every commit.*

### The Three Deployment Killers (learned the hard way)
1. **Node OOM during TSC** — 1.1M lines of TS needs 4GB heap. `nixpacks.toml` [variables]
   sets `NODE_OPTIONS=--max-old-space-size=4096` for ALL build phases. Never remove this.
2. **Escaped backticks in JSX** — Python string injection writes `\`` instead of real template
   literals. Always use string concatenation in JSX event handlers: `"/api/" + id + "/path"`
3. **Invalid TwiML attributes** — Twilio `<Gather>` accepts exactly ONE language value.
   Never use comma-separated values like `language="en-US,es-US"`. Use `language="en-US"`.

### Pre-Commit Checklist (mandatory)
```
1. node build.mjs          ← esbuild catches syntax errors TSC misses at scale
2. npx vitest run           ← 270 tests must pass
3. grep -r "\\`" client/src/ ← zero escaped backticks allowed
4. grep -r "en-US,es" server/ ← zero invalid TwiML language combos
```
TSC (`npx tsc --noEmit`) is run on Railway with full 4GB heap. Local runs may OOM on
constrained containers — that is expected. The build.mjs + vitest gates are sufficient
for local validation.

---

## WAVE 14 — Smart RMS (Records Management System)
*Files: server/services/rms/smartRmsService.ts, trinityComplianceIncidentActions.ts*

| Feature | Details |
|---|---|
| Auto-DAR | Aggregates shift events → chronological timeline. Guard reviews + submits. |
| Narrative Translator | Raw guard text → formal third-person report. Guard approval required. |
| Pass-Down Log | Priority/category/24h TTL, mandatory guard acknowledge at clock-in |
| Banned Entities | BOLO + trespass unified. Queried at every clock-in. |
| Client Copy Pipeline | Strips SSNs/IDs, supervisor approves, client portal sync. |
| Shift Brief | BOLOs + pass-downs injected as intercept modal at clock-in |

**Schema additions (ops domain):** `site_pass_down_log`, `banned_entities`,
`incident_report_client_copies`, DAR column extensions (10 new columns).

**HelpAI actions added:** `rms.auto_generate_dar`, `rms.translate_narrative`,
`rms.approve_narrative`, `rms.get_shift_brief`, `rms.sync_client_copy`

---

## WAVE 14.5 — RMS Frontend Bridge
*Files: client/src/pages/rms-hub.tsx, worker-dashboard.tsx, worker-incidents.tsx*

| Component | Details |
|---|---|
| Shift Brief Modal | Intercepts clock-in in worker-dashboard. Mandatory ack if hasCritical. |
| Auto-DAR Timeline | rms-hub.tsx — Shift ID → auto-generate → review → submit flow |
| Narrative Translator UI | "Draft with Trinity" button → approval block before submission |
| Client Copy Approve | Incident row button → sanitized copy → client portal sync |

**Known footgun:** JSX fetch URLs must use string concatenation, never template literals
written via Python injection. Always write: `"/api/rms/" + id + "/endpoint"`.

---

## WAVE 16 — Trinity 360 Omni-Channel SOC Telephony
*Files: server/routes/voiceRoutes.ts (5,600+ lines), tenantPortalExtension.ts,
guestExtension.ts, tenantLookupService.ts, voiceOrchestrator.ts*

### Architecture Decision (permanent)
**ONE master Twilio number.** No per-tenant numbers. No `workspace_phone_numbers` table.
`workspaces.twilio_phone_number` column holds the dedicated number if a tenant has one.
Master number falls through to the CoAIleague guest IVR automatically.

### Workspace Phone Resolution
```typescript
// resolveWorkspaceFromPhoneNumber queries workspaces.twilio_phone_number
// Returns null for master number → guest IVR handles it
// NEVER returns 'Configuration error' — always falls to guest flow
```

### Priority Waterfall (all transfers)
```
1st: Supervisor on active shift (workspace_members role=supervisor/shift_leader)
2nd: Manager/Dept Manager on active shift
3rd: Co-Owner (if phone on file)
4th: Owner (always last — always has phone)
5th: Voicemail → SMS to owner
```
*Statewide today: Steps 1-3 empty → Bryan at 830-213-4562 (from users.phone, not hardcoded)*

### Full 9-Option Tenant Portal Menu
| Option | Action |
|---|---|
| 1 — Guards/Officers | Schedule query, clock in/out (writes time_entries), calloff, pay, supervisor |
| 2 — Clients | Coverage count, concerns, billing, request coverage, manager |
| 3 — Urgent | Blast SMS all contacts + immediate <Dial> (no 911 language, no duty created) |
| 4 — Complaint | Collect name + purpose → <Dial> on-duty manager |
| 5 — Hiring | Texts workspace.voice_hiring_link instantly via SMS |
| 6 — Employment Verification | Platform DB query → response |
| 7 — Pay/Timesheet | time_entries query → hours this week |
| 8 — Speak with Manager | Collect name + purpose → <Dial> waterfall |
| 0 — Trinity AI | Gemini Live bidirectional audio session |

### TwiML Safety Net (Directive 3)
```
POST /api/voice/inbound
  try:
    → normal call handling
  catch (ANY error):
    → returns hardcoded valid XML
    → <Say>Transferring you to our team...</Say>
    → <Dial>VOICE_FALLBACK_PHONE || OWNER_PHONE || 8302134562</Dial>
    → caller NEVER gets a dead line
```

### SOC Features
- **Duress bypass:** "Code Red" / "Código Rojo" → blast SMS all contacts + immediate Dial
- **Missed call SMS:** hang-up during hold → Trinity texts caller within seconds
- **ChatDock sync:** live call card on call_start, summary + recording on call_end
- **Caller recognition:** `lookupCallerByPhone(From, workspaceId)` → personalized greeting

### 911 Hard Rule (permanent, non-negotiable)
Trinity NEVER says "911", "call the police", or "contact emergency services" in any TTS.
No duty created. No liability for CoAIleague, tenants, or Trinity.
Enforced by: `publicSafetyGuard.ts`, `trinityConscience.ts`, `panicAlertService.ts`,
`trinityActionDispatcher.ts`, and manual audit of all voice TTS strings.

### Auto-Provisioning (workspace registration)
Every new tenant gets on workspace creation (non-blocking):
- `voice_hiring_link = https://coaileague.com/apply/{orgCode}`
- `voice_portal_enabled = true`

### Environment Variables (complete — no new vars needed)
| Var | Purpose | Status |
|---|---|---|
| TWILIO_PHONE_NUMBER | Master voice number | Required, in Railway |
| TWILIO_ACCOUNT_SID | Auth | Required, in Railway |
| TWILIO_AUTH_TOKEN | Auth | Required, in Railway |
| GEMINI_API_KEY | Gemini Live free-talk | Required, in Railway |
| VOICE_FALLBACK_PHONE | Safety net fallback | Optional (defaults to OWNER_PHONE) |
| OWNER_PHONE | Absolute last resort Dial | Optional |

**Twilio webhook:** `POST https://www.coaileague.com/api/voice/inbound`
**Status callback:** `POST https://www.coaileague.com/api/webhooks/twilio/status`

---

# NEXT: WAVE 18 — CAD Infrastructure & NFC Patrol Engine
