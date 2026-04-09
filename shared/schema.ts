/**
 * SCHEMA AUDIT NOTES (2024-10-14)
 * 
 * TASK 2: Enum Value Consistency
 * - shiftStatusEnum (enums.ts:68) uses 'cancelled'.
 * - shiftActionStatusEnum (enums.ts:393) uses both 'canceled' and 'cancelled'.
 * - Codebase search: 'cancelled' (approx 466 occurrences) vs 'canceled' (approx 2 occurrences).
 * - Recommendation: Standardize on 'cancelled' (British spelling) in future migrations, but do not change now to avoid breaking existing data.
 * 
 * TASK 3: timestamp vs timestamptz
 * - Total timestamp() columns: ~120 (timezone-naive).
 * - Risk: Stored UTC times lose original timezone context. For night shifts crossing midnight (e.g., 22:00-06:00), 
 *   naive timestamps can lead to "off-by-one-day" errors if local vs UTC transitions aren't handled perfectly in the app layer.
 * - High-Risk Columns: 
 *   - shifts.startTime, shifts.endTime (Scheduling)
 *   - payrollRuns.periodStart, payrollRuns.periodEnd (Payroll)
 *   - invoices.issueDate, invoices.dueDate (Billing)
 * - Recommendation: Migrate to timestamptz() in a future major schema overhaul.
 * 
 * TASK 4: NOT NULL Constraints Audit
 * - employees.workspaceId: Already NOT NULL.
 * - shifts.employeeId: Nullable. LOGIC: Should remain nullable to support "Open/Unassigned" shifts.
 * - invoices.clientId: Already NOT NULL.
 */

// CoAIleague Schema — Thin Barrel
// All table definitions live in their canonical domain files.
// Import from '@shared/schema/domains/[domain]' for domain-specific access.
// Import from '@shared/schema' for backwards compatibility (re-exports everything).
//
// Domain files: shared/schema/domains/[domain]/index.ts
// Enums: shared/schema/enums.ts
// Relations: shared/schema/relations.ts
// Contract: shared/schema/domains/DOMAIN_CONTRACT.ts

// Re-export enums
export * from './schema/enums';

// Re-export all Drizzle relation definitions (required for db.query.xxx relational API)
export * from './schema/relations';

// Re-export all 16 domain table collections
export * from './schema/domains/auth';
export * from './schema/domains/orgs';
export * from './schema/domains/workforce';
export * from './schema/domains/scheduling';
export * from './schema/domains/time';
export * from './schema/domains/payroll';
export * from './schema/domains/billing';
export * from './schema/domains/trinity';
export * from './schema/domains/comms';
export * from './schema/domains/clients';
export * from './schema/domains/compliance';
export * from './schema/domains/audit';
export * from './schema/domains/support';
export * from './schema/domains/sales';
export * from './schema/domains/ops';
export * from './schema/domains/sps';
export * from './schema/domains/training';
export * from './schema/domains/recruitment';