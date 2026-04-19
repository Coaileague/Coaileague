# Auditor Non-Disclosure Agreement — Template v2026-04-19-v1

**IMPORTANT:** This is a pre-counsel working template. Do not use in
production until reviewed and approved by legal counsel. The version
string at the top of this file MUST match `AUDITOR_NDA_VERSION` env
var; bumping the env var invalidates every prior auditor's acceptance
and forces re-acceptance through `POST /api/auditor/nda/accept`.

---

## Parties

- **Disclosing Party ("Platform"):** CoAIleague LLC and its customer
  (the "Licensed Company") whose data is being accessed.
- **Receiving Party ("Auditor"):** the individual regulator or agency
  representative authenticated through the CoAIleague Auditor Portal.

## Purpose

Auditor is granted time-limited, scope-limited read access to the
Licensed Company's compliance data through the Auditor Portal for the
sole purpose of performing a regulatory audit authorized under
Auditor's statutory authority.

## Permitted Use

Auditor may:

1. **View** compliance artifacts through the Auditor Portal for the
   duration of the active audit window.
2. **Export** a point-in-time compliance packet for retention in
   Auditor's official audit file.
3. **Flag** findings via the portal, which creates an alert to the
   Licensed Company and is preserved in the Platform audit log.

## Prohibited Use

Auditor may NOT:

1. Redistribute, publish, or share data accessed through the Portal
   with any third party outside the scope of the authorizing
   regulatory action.
2. Use credentials outside of audits formally opened against the
   Licensed Company.
3. Copy, transcribe, screenshot, or otherwise remove data from the
   Portal except as permitted under "Permitted Use" above.
4. Attempt to access data for any Licensed Company against whom
   Auditor does not have an active audit opened.

## Data Handling

- Personally Identifiable Information (PII) including SSNs and
  officer photos: Auditor must not redistribute, publish, or retain
  beyond the minimum required by law.
- Biometric data (fingerprints, facial images): subject to
  Illinois BIPA and equivalent state laws where applicable.
- TCOLE / licensing records: treated as non-public under Texas
  Occupations Code § 1702.

## Audit Trail

Auditor acknowledges that:

- Every action taken through the Portal is logged in the Platform's
  immutable audit trail (`audit_logs` table).
- Session duration, IP address, and User-Agent are recorded per
  auditor.
- Breach of this agreement triggers automated Platform notification
  to the Licensed Company and Platform legal team.

## Retention

- Findings flagged through the Portal are retained for **10 years**
  (or longer if required by the regulator's governing statute).
- Auditor-exported compliance packets are Auditor's property;
  Auditor's own retention policy governs.

## Term & Termination

- This NDA is perpetual. Access is revoked when:
  - The audit window closes (`auditor_audits.status = 'closed'`), or
  - Platform or Licensed Company revokes Auditor's access, or
  - Auditor's regulatory authority is revoked.

## Governing Law & Venue

Governed by the law of the state of the Licensed Company's primary
place of business. Venue: any court of competent jurisdiction therein.

## Acceptance

By signing electronically through the Auditor Portal, Auditor
acknowledges they have read, understand, and agree to be bound by
this agreement. Acceptance is timestamped and bound to the Auditor's
authenticated account in `auditor_nda_acceptances`.

---

## Version History

| Version | Date | Change |
|---------|------|--------|
| 2026-04-19-v1 | 2026-04-19 | Initial working template (pre-counsel) |
