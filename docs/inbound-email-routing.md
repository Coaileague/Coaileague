# CoAIleague Inbound Email Routing — Architecture Specification

**Status**: NOT BUILT — Dedicated future session required.  
**Date Documented**: March 2026  
**Author**: Trinity AI — Post-Email-Barrel Gap Sweep (Phase 6)

---

## Overview

The outbound email pipeline is now operational (email barrel fix, March 2026).  
The inbound pipeline — four purpose-built email addresses that create platform records — has not been built.  
This document defines exactly what is needed so it can be built cleanly.

---

## The Four Inbound Addresses

| Address | Trigger Action | Record Created |
|---|---|---|
| `calloffs@coaileague.com` | Employee submits a call-off by email | Call-off record + replacement flow |
| `incidents@coaileague.com` | Field officer reports an incident | Incident report record |
| `docs@coaileague.com` | Attach a document to a record | Document attached to matching record |
| `support@coaileague.com` | Employee or client requests support | Support ticket |

---

## Infrastructure Requirements

### Inbound Email Provider

Resend does **not** support inbound email parsing (as of March 2026).  
One of the following providers must be selected:

**Option A — SendGrid Inbound Parse** (recommended)  
- Set up MX records pointing `calloffs.coaileague.com` etc. to SendGrid  
- Configure webhook: `POST https://api.coaileague.com/api/inbound-email`  
- Payload: multipart form with headers, body, attachments  
- Cost: Included in SendGrid plans  

**Option B — Postmark Inbound**  
- Similar MX + webhook setup  
- Strong attachment handling and spam filtering  

**Option C — AWS SES + Lambda**  
- MX to SES, trigger Lambda to forward parsed payload to CoAIleague API  
- More infrastructure overhead but no vendor lock-in  

**DNS Requirements (all options)**  
```
calloffs.coaileague.com  MX  10  [provider-mx-server]
incidents.coaileague.com MX  10  [provider-mx-server]
docs.coaileague.com      MX  10  [provider-mx-server]
support.coaileague.com   MX  10  [provider-mx-server]
```

---

## Parsing Logic

Each inbound email must be parsed to extract:
1. **Org identity** — Sender email domain matched to `workspaces.domain` or `clients.email`
2. **Employee identity** — Sender email matched to `employees.email` or `users.email`
3. **Content** — Subject + body text parsed for relevant fields

### Identity Resolution Priority
```
1. Exact match: sender email → users.email → workspaceId + userId
2. Domain match: @acmesecurity.com → workspaces where domain contains 'acmesecurity'
3. Fallback: Unknown sender → create unmatched record, alert platform admin
```

### Unmatched Email Handling
- Create an `inbound_email_unmatched` record in the DB
- Send auto-reply: "We couldn't match your email to a CoAIleague account. Please contact support."
- Alert `support@coaileague.com` internally

---

## Per-Address Record Creation

### `calloffs@coaileague.com`

**Parse From Email Body:**
- Employee name / ID
- Shift date (natural language: "tomorrow", "March 15", etc.)
- Reason for call-off (sick, personal, emergency)
- Duration (single shift, multiple days)

**DB Record Created:**
```sql
INSERT INTO call_offs (
  workspace_id, employee_id, shift_id, reason, submitted_via, submitted_at, status
) VALUES (...)
```

**Downstream Actions:**
- Notify manager via notification + email
- Trinity triggers coverage pipeline (find replacement)
- If no shift found for that date, create a pending call-off for manager review

---

### `incidents@coaileague.com`

**Parse From Email Body:**
- Location / site name
- Incident type (theft, medical, disturbance, etc.)
- Time of incident
- Persons involved
- Any attachments (photos, videos) → upload to GCS

**DB Record Created:**
```sql
INSERT INTO incident_reports (
  workspace_id, reported_by, site_id, incident_type, description, 
  submitted_via, occurred_at, attachments
) VALUES (...)
```

**Downstream Actions:**
- Real-time notification to manager and org_owner
- Trinity flags for incident review
- If photos attached: generate pre-signed GCS URLs and attach to record

---

### `docs@coaileague.com`

**Parse From Email Body:**
- Reference number in subject line: `RE: EMP-ACME-00042 — W-9`
- Document type: W-9, I-9, license, certification, etc.
- Attachments are the actual documents → upload to GCS

**Matching Logic:**
- Parse subject for employee number, invoice number, or contract number
- Match to existing record
- Attach document to matched record

**DB Record Created:**
```sql
INSERT INTO compliance_documents (
  workspace_id, entity_type, entity_id, document_type, 
  file_url, submitted_via, status
) VALUES (...)
```

**Downstream Actions:**
- Notify manager that document was received and is pending review
- Add to compliance queue

---

### `support@coaileague.com`

**Parse From Email Body:**
- Subject → ticket title
- Body → ticket description
- Sender identity → link to employee or client record

**DB Record Created:**
```sql
INSERT INTO support_tickets (
  workspace_id, user_id, subject, description, 
  submitted_via, status, priority
) VALUES (...)
```

**Downstream Actions:**
- Auto-reply: "Ticket TKT-XXXX created. We'll respond within 24 hours."
- Notify support team
- HelpAI classifies and routes to correct team

---

## Spam and Abuse Prevention

- SPF/DKIM validation on inbound sender
- Rate limit: max 10 inbound emails per sender per hour
- Attachment size limit: 10MB per email, 25MB per day per sender
- Content scanning: virus scan attachments before upload to GCS

---

## API Endpoint

```
POST /api/inbound-email
Content-Type: multipart/form-data

Payload fields (from email provider):
  to:           string  (which address was targeted)
  from:         string  (sender email)
  subject:      string
  text:         string  (plain text body)
  html:         string  (HTML body)
  attachments:  File[]  (binary attachments)
  headers:      string  (raw email headers)
  spam_score:   number  (provider spam score)
  signature:    string  (webhook signature for verification)
```

**Response:**
- `200 OK` — record created successfully
- `422 Unprocessable` — sender not recognized, unmatched record created
- `400 Bad Request` — signature verification failed

---

## Environment Variables Required

```bash
INBOUND_EMAIL_PROVIDER=sendgrid          # or postmark, ses
INBOUND_EMAIL_WEBHOOK_SECRET=...         # Provider webhook signing secret
INBOUND_EMAIL_SPAM_THRESHOLD=5.0         # Reject above this score
```

---

## Estimated Build Effort

| Component | Effort |
|---|---|
| DNS configuration | 2 hours |
| Provider setup (SendGrid/Postmark) | 1 hour |
| Webhook endpoint + signature verification | 3 hours |
| Identity resolution middleware | 4 hours |
| calloffs@ parser + record creation | 3 hours |
| incidents@ parser + record creation + GCS | 4 hours |
| docs@ parser + GCS upload | 3 hours |
| support@ parser + ticket creation | 2 hours |
| Spam/abuse prevention | 2 hours |
| Testing + integration | 4 hours |
| **Total** | **~28 hours** |

---

## Session Recommendation

Build as a dedicated 1-day session with the following order:
1. DNS + provider setup (day start)
2. Webhook endpoint with identity resolution
3. `support@` and `calloffs@` (highest business value, simplest parsing)
4. `incidents@` with GCS attachment handling
5. `docs@` with record matching
6. Full integration test with real email sends

**Flag**: Build `support@` first — it has the simplest parsing and highest daily volume.
