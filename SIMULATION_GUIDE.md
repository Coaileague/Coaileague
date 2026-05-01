# CoAIleague — ACME 30-Day Business Logic Simulation

## What This Tests

The simulation runs **12 sequential phases** against the ACME Security sandbox, validating every financial, scheduling, compliance, and integration layer before production:

| Phase | What It Tests |
|-------|--------------|
| 0 | DB connection, ACME workspace, officer pool, pay rates |
| 1 | 30-day schedule (60 shifts: 24/7 at 06:00–18:00 + 18:00–06:00) |
| 2 | Time entries (clock-in/out) for all assigned shifts |
| 3 | Weekly invoices (Mon→Sun, net-7, midnight-split validation) |
| 4 | Bi-weekly payroll runs (one week in arrears) |
| 5 | Gross margin audit ($40 bill / $20 pay = 50%) |
| 6 | Route integrity (8 financial API endpoints) |
| 7 | Stripe test-mode ($1 charge via tok_visa) |
| 8 | Plaid sandbox (ACH link token) |
| 9 | Resend email (staffing email → Trinity auto-staff) |
| 10 | Texas kill-switch (expired license blocks shifts + invoices) |
| 11 | Math audit (NaN check, hours×rate=earnings, qty×rate=total) |
| 12 | Cleanup (all sim-* records removed) |

## Expected Financial Outputs (Full Coverage)

```
Weekly invoices:  4 × $6,720.00  = $26,880.00  (168h × $40/hr)
Bi-weekly payroll: 2 × $6,720.00  = $13,440.00  (168h × $20/hr)
Gross margin:     50.0%           ($26,880 - $13,440) / $26,880
```

Note: Blocked shifts (officer license expiry day 15+) reduce actual hours below theoretical max.

## The "Midnight Split" Validation

PM shifts run 18:00 Sunday → 06:00 Monday. They cross the **week boundary**.

The simulation verifies that billing correctly attributes only Sunday hours to Week 1's invoice and only Monday hours to Week 2's — not the full 12h to whichever week the shift started in.

**Pass condition:** All midnight-crossing shifts have `billHrs < 12` after week-boundary clamping.

## The Texas Kill-Switch

Officer `dev-acme-emp-004` has their license expire on simulation day 15.

**Expected behavior:**
- Days 1–14: Officer assigned normally
- Days 15–30: Officer's shifts created with `status='open'` and `notes LIKE '%BLOCKED%'`
- Invoices: Blocked shifts excluded from billable hours
- Zero illegal assignments to the expired-license officer

## Running the Simulation

### Prerequisites

The dev server must be running for route/NaN tests (Phases 6 + 11):
```bash
npm run dev
```

Then in a separate terminal:
```bash
npm run sim:acme30
```

### Required Environment Variables

| Variable | Required For | Where to Get |
|----------|-------------|--------------|
| `DATABASE_URL` | All phases | Railway dashboard |
| `STRIPE_TEST_API_KEY` | Phase 7 | Stripe dashboard → Test keys |
| `PLAID_CLIENT_ID` | Phase 8 | Plaid dashboard → Sandbox |
| `PLAID_SECRET` | Phase 8 | Plaid dashboard → Sandbox |
| `RESEND_API_KEY` | Phase 9 | Resend dashboard |

Phases without credentials skip gracefully — they don't crash the simulation.

### Stripe Test Cards

| Card | Result |
|------|--------|
| `tok_visa` | ✅ Succeeds immediately |
| `tok_chargeDeclined` | ❌ Declines |
| `tok_chargeDeclinedInsufficientFunds` | ❌ Insufficient funds |

### Plaid Sandbox

Plaid sandbox credentials are separate from production. Get them at:
https://dashboard.plaid.com/overview/sandbox

Test bank login: `user_good` / `pass_good`

## Pass/Fail Criteria

```
🟢 READY:   0 CRITICAL failures + ≤2 HIGH failures
🔴 NOT READY: any CRITICAL failure
```

**CRITICAL failures** = financial math errors, NaN values, compliance violations, DB errors
**HIGH failures** = route gaps, Stripe/Plaid issues, payroll arrears logic
**MEDIUM failures** = server offline (routes skipped), missing env vars

## Testing Stripe + Plaid in Production

Once simulation passes in development:

1. Merge `development` → `production` branch
2. Set `STRIPE_TEST_API_KEY` in Railway production env (test key, not live)
3. Process a real $1 subscription using Stripe test card `4242 4242 4242 4242`
4. Verify the webhook fires and updates the workspace subscription status
5. Process a $1 ACH payroll via Plaid sandbox
6. Confirm the pay stub generates and saves to tenant vault

Do this with your own account as the "employee" — the $1 comes back to you.

## What Still Needs Testing After This

1. **WebSocket reconnection under Railway multi-replica** — needs load test
2. **PDF BrandedPdfService adoption** — existing routes still use old per-route PDF patterns
3. **FCM push notifications** — 4-tier delivery pyramid not built
4. **Subscription gating** — `hasTierAccess()` logic not stress-tested
5. **Mobile offline mode** — ChatDock op-sqlite not built
