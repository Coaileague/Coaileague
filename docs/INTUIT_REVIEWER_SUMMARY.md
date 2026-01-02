# Trinity QuickBooks Integration - Intuit Reviewer Summary

## Application Identity

**Application Name:** Trinity (CoAIleague Platform)  
**Integration Type:** Accounting Automation Middleware  
**Category:** Workforce Management / Time & Billing Automation

---

## What Trinity Is

Trinity is an **accounting automation platform** that serves as intelligent middleware between workforce management operations and QuickBooks Online. Trinity automates the administrative burden of time-to-invoice workflows while maintaining complete data integrity and user control.

**Key Identity Statement:**
> Trinity is stateless regarding PII and relies on the `intuit_tid` (Intuit Tenant ID) for all reconciliation. We built this application specifically for the Intuit ecosystem.

---

## What Trinity Does NOT Do

| Activity | Trinity's Role |
|----------|----------------|
| Process payments | NO - All payments flow through QuickBooks |
| Store financial credentials | NO - Only encrypted OAuth tokens |
| Move funds | NO - Trinity is a data orchestrator, not a fund handler |
| Modify bank accounts | NO - Read-only for reconciliation |
| Store credit card numbers | NO - PCI scope is zero |

---

## What Trinity DOES Do

### 1. Time-to-Invoice Automation
- Aggregates billable hours from workforce time tracking
- Generates invoice line items based on client/employee mappings
- Sends invoices to QuickBooks via authenticated API calls

### 2. Identity Reconciliation
- Maps CoAIleague entities (clients, employees) to QuickBooks entities (customers, vendors)
- Uses `intuit_tid` as the authoritative identifier
- Four-tier confidence matching: email_exact, name_exact, name_fuzzy, manual_review

### 3. Safe-Halt Controls
- **5% Variance Detection:** Trinity automatically halts if hours discrepancy exceeds 5%
- **Exception Triage:** Suspicious transactions are routed to human review
- **Idempotency Keys:** Every API call includes deterministic deduplication

---

## Compliance Architecture

### Rate Limiting
- Per-realm rate limiting: 500 requests/minute
- Exponential backoff on 429 responses
- Circuit breaker integration for cascading failure prevention

### Token Management
- OAuth2 PKCE flow (no client secrets in browser)
- AES-256-GCM encrypted token storage
- Automatic token refresh before expiry
- Per-workspace token isolation

### Audit Trail
- Every QuickBooks API call logged to `quickbooks_api_usage` table
- SOX-compliant 7-year retention
- Includes: timestamp, realm_id, endpoint, response_status, user_context

### Error Handling
- Structured error responses with actionable messages
- Automatic retry with exponential backoff (3 attempts max)
- Failed operations logged with full context for debugging
- Circuit breaker opens after 5 consecutive failures

---

## Data Flow

```
[CoAIleague Time Tracking] 
         |
         v
[Trinity Billing Orchestration]
         |
    [Validation]
         |
    [Identity Mapping] <-- uses intuit_tid
         |
    [Risk Assessment]
         |
    [Idempotency Check]
         |
         v
[QuickBooks Online API]
         |
         v
[Invoice Created in QuickBooks]
```

---

## Tenant Scoping

All Trinity operations are **tenant-scoped**:

- Every API call includes `realmId` validation
- Cross-tenant data access is architecturally impossible
- OAuth tokens are stored per-workspace, not globally
- Connection status is verified before every sync operation

---

## Manual Override Points

Trinity maintains human control at critical junctures:

1. **Identity Mapping Review** - Ambiguous matches require human confirmation
2. **Exception Triage** - Flagged transactions await human decision
3. **Go-Live Approval** - Automation requires explicit owner activation
4. **Disconnect Control** - Users can revoke integration at any time

---

## Summary Statement

Trinity is an accounting automation platform with:
- Independent validation
- Reconciliation controls
- Safe-halt mechanisms
- Complete audit trails

**Payments are not processed by Trinity.** All financial transactions occur within QuickBooks. Trinity's role is to automate data preparation and ensure accuracy before submission.

All actions are:
- Tenant-scoped
- Idempotent
- Auditable
- Reversible (via exception triage)

---

*Document prepared for Intuit App Review - January 2026*
