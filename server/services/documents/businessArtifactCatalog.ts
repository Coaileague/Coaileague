/**
 * Static catalog of business artifacts the platform is responsible for
 * generating + persisting (invoices, paystubs, support packages, etc.).
 *
 * The diagnostic service in `businessArtifactDiagnosticService.ts` consumes
 * this catalog to answer "which artifact types are wired end-to-end and
 * which still need a generator or vault path?" without needing live DB
 * access. This is the source-of-truth list — when a new artifact ships, add
 * it here and the diagnostic + Trinity HelpAI surface picks it up.
 */

export type BusinessArtifactCategory =
  | 'billing'
  | 'payroll'
  | 'compliance'
  | 'employee'
  | 'reports'
  | 'sales'
  | 'operations';

export interface BusinessArtifactCatalogEntry {
  artifactType: string;
  title: string;
  category: BusinessArtifactCategory;
  sourceDomain: string;
  /** True when the platform actively generates this artifact today. */
  generator: boolean;
  /** True when the artifact is persisted to the tenant document vault. */
  vaultBacked: boolean;
  availableToTenant: boolean;
  availableToEmployee: boolean;
}

const CATALOG: BusinessArtifactCatalogEntry[] = [
  {
    artifactType: 'invoice_pdf',
    title: 'Invoice PDF',
    category: 'billing',
    sourceDomain: 'billing/invoiceService',
    generator: true,
    vaultBacked: true,
    availableToTenant: true,
    availableToEmployee: false,
  },
  {
    artifactType: 'timesheet_support_package',
    title: 'Timesheet Support Package',
    category: 'payroll',
    sourceDomain: 'documents/timesheetSupportPackageGenerator',
    generator: true,
    vaultBacked: true,
    availableToTenant: true,
    availableToEmployee: false,
  },
  {
    artifactType: 'rfp_complexity_score',
    title: 'RFP Complexity Score',
    category: 'sales',
    sourceDomain: 'billing/rfpComplexityScorer',
    generator: true,
    vaultBacked: false,
    availableToTenant: true,
    availableToEmployee: false,
  },
  {
    artifactType: 'paystub_pdf',
    title: 'Pay Stub PDF',
    category: 'payroll',
    sourceDomain: 'paystubService',
    generator: true,
    vaultBacked: true,
    availableToTenant: true,
    availableToEmployee: true,
  },
  // The four below are catalogued so the diagnostic surfaces them as gaps
  // until their generators ship. Keeping them visible in the catalog is the
  // entire point — silent omission is what created the gap in the first place.
  {
    artifactType: 'proof_of_employment',
    title: 'Proof of Employment Letter',
    category: 'employee',
    sourceDomain: 'ai-brain/trinityDocumentActions',
    generator: false,
    vaultBacked: false,
    availableToTenant: true,
    availableToEmployee: true,
  },
  {
    artifactType: 'direct_deposit_confirmation',
    title: 'Direct Deposit Confirmation',
    category: 'payroll',
    sourceDomain: 'ai-brain/trinityDocumentActions',
    generator: false,
    vaultBacked: false,
    availableToTenant: true,
    availableToEmployee: true,
  },
  {
    artifactType: 'payroll_run_summary',
    title: 'Payroll Run Summary',
    category: 'payroll',
    sourceDomain: 'ai-brain/trinityDocumentActions',
    generator: false,
    vaultBacked: false,
    availableToTenant: true,
    availableToEmployee: false,
  },
  {
    artifactType: 'w3_transmittal',
    title: 'W-3 Transmittal',
    category: 'compliance',
    sourceDomain: 'ai-brain/trinityDocumentActions',
    generator: false,
    vaultBacked: false,
    availableToTenant: true,
    availableToEmployee: false,
  },
];

export function listBusinessArtifactCatalog(): BusinessArtifactCatalogEntry[] {
  return CATALOG.slice();
}

export function listBusinessArtifactGaps(): BusinessArtifactCatalogEntry[] {
  return CATALOG.filter(entry => !entry.generator || !entry.vaultBacked);
}
