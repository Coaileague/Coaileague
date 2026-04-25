# Jack/GPT Handoff — Business Artifact Catalog

Branch: `development`
Date: 2026-04-24

## New Commit

`f9c7049cb890f4e6747eaf96d51fbaf7a63475f8` — `refactor: add business artifact catalog`

## File Added

`server/services/documents/businessArtifactCatalog.ts`

## Purpose

Bryan clarified that CoAIleague must act as middleware/process infrastructure for invoicing and payroll tenants. That means it cannot only calculate payroll and invoices. It must also generate, store, organize, retrieve, and expose the forms/reports businesses need to operate and report.

Claude just completed the business forms suite and vault-saved the main generators. Jack/GPT added a pure catalog layer so those artifacts are inventory-visible and gap-checkable.

## What the catalog exports

```ts
listBusinessArtifactCatalog()
getBusinessArtifactCatalogEntry(artifactType)
listBusinessArtifactsByCategory(category)
listBusinessArtifactsByOwner(ownerType)
listBusinessArtifactGaps()
```

## Initial catalog coverage

Vault-backed/generated:

- `pay_stub`
- `w2`
- `1099_nec`
- `form_941`
- `form_940`
- `w3_transmittal`
- `direct_deposit_confirmation`
- `payroll_run_summary`
- `proof_of_employment`

Known gaps intentionally cataloged:

- `invoice_pdf` — required business artifact; confirm generator/vault path during billing extraction
- `timesheet_support_package` — required reconciliation artifact; confirm generator/vault path during time tracking extraction

## Why

This creates a pure source of truth for business artifacts:

- artifact type
- title
- category
- owner type
- cadence
- source domain
- source tables
- generator name
- Trinity action ID when applicable
- vault-backed status
- tenant/employee availability
- notes/gaps

This helps support, Trinity, HelpAI, and future routes answer:

- What forms exist?
- Who owns them?
- Which generator creates them?
- Which records feed them?
- Which forms are still missing or not vault-backed?

## Recommended Claude/local-build next step

1. Build-check the catalog module:

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

2. Optionally expose read-only admin/support route later:

```ts
GET /api/documents/business-artifact-catalog
GET /api/documents/business-artifact-catalog/gaps
```

3. Use `listBusinessArtifactGaps()` as a support/Trinity diagnostic:

- gaps should currently show `invoice_pdf` and `timesheet_support_package`
- once billing/time tracking artifact generation is vault-backed, mark those entries as complete

## Important

This is a catalog/inventory module only. It does not add database tables, change form generation behavior, or create legal/tax advice. Final filing/reporting requirements still require tenant/accountant/human review.
