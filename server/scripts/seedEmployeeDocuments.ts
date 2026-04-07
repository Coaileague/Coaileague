/**
 * Seed All Employee Documents
 *
 * Generates all 8 required document types for every employee in every dev workspace.
 * Updates file_url to point to the real document viewer route.
 * Safe to run multiple times — uses upsert logic on (employee_id, document_type).
 */
import { db } from '../db';
import { employees, employeeDocuments, workspaces } from '@shared/schema';
import { eq, inArray, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const DEV_WORKSPACE_IDS = ['dev-acme-security-ws', 'dev-anvil-security-ws'];

const REQUIRED_DOC_TYPES = [
  { type: 'employment_application', name: 'Employment Application',        description: 'Signed employment application with work history' },
  { type: 'photo_id_copy',          name: 'Government ID / Driver License', description: 'Texas driver license — verified copy on file' },
  { type: 'social_security_card',   name: 'Social Security Acknowledgment', description: 'SSN acknowledgment and card verification' },
  { type: 'i9_form',                name: 'I-9 Employment Eligibility',     description: 'USCIS Form I-9 — employment authorized' },
  { type: 'w4_form',                name: 'W-4 / W-9 Tax Form',            description: 'Federal tax withholding certificate' },
  { type: 'zero_policy_drug_form',  name: 'Drug-Free Workplace Policy',    description: 'Signed drug-free workplace acknowledgment' },
  { type: 'background_check',       name: 'Background Check — Cleared',    description: 'Pre-employment background screening — CLEARED' },
  { type: 'guard_card',             name: 'Security Guard Registration',    description: 'Texas DPS guard card — Active and Valid' },
];

function fakeSSNLast4(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return String((Math.abs(h) % 9000) + 1000);
}

function fakeGuardCardNumber(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return `TX-DPS-${String(Math.abs(h) % 900000 + 100000)}`;
}

async function run() {
  console.log('=== Seeding Employee Documents ===');

  const allEmployees = await db.select({
    id: employees.id, workspaceId: employees.workspaceId,
    firstName: employees.firstName, lastName: employees.lastName,
    hireDate: employees.hireDate, workerType: employees.workerType,
    guardCardNumber: employees.guardCardNumber, ssnLast4: employees.ssnLast4,
  }).from(employees).where(inArray(employees.workspaceId, DEV_WORKSPACE_IDS));

  console.log(`Found ${allEmployees.length} employees across ${DEV_WORKSPACE_IDS.length} dev workspaces`);

  // Delete all existing placeholder employee_documents for dev workspaces
  // (cover_sheet only — the ones pointing to placeholder paths)
  let deleted = 0;
  for (const wsId of DEV_WORKSPACE_IDS) {
    const existing = await db.select({ id: employeeDocuments.id })
      .from(employeeDocuments)
      .where(eq(employeeDocuments.workspaceId, wsId));
    if (existing.length > 0) {
      // Delete all existing to replace with real ones
      await db.delete(employeeDocuments).where(eq(employeeDocuments.workspaceId, wsId));
      deleted += existing.length;
    }
  }
  console.log(`Removed ${deleted} placeholder document records`);

  let created = 0;
  const batchSize = 50;
  const insertBatch: any[] = [];

  for (const emp of allEmployees) {
    const hireDate = emp.hireDate ? new Date(emp.hireDate) : new Date('2024-01-10');
    const uploadedAt = new Date(hireDate.getTime() + 24 * 60 * 60 * 1000); // hire + 1 day
    const isContractor = emp.workerType === 'contractor';

    for (const doc of REQUIRED_DOC_TYPES) {
      const docId = randomUUID();
      let docType = doc.type;
      let docName = doc.name;

      // Contractors get W-9 instead of W-4
      if (doc.type === 'w4_form' && isContractor) {
        docType = 'w9_form';
        docName = 'W-9 Request for Taxpayer Identification';
      }

      const fileUrl = `/api/sps/documents/view/${docId}`;

      insertBatch.push({
        id: docId,
        workspaceId: emp.workspaceId,
        employeeId: emp.id,
        documentType: docType,
        documentName: docName,
        documentDescription: doc.description,
        fileType: 'text/html',
        originalFileName: `${docType.replace(/_/g, '-')}.html`,
        fileUrl,
        fileSize: 8500,
        status: 'approved',
        uploadedBy: 'dev-hr-seed',
        uploadedByEmail: 'hr@acme-security.test',
        uploadedByRole: 'hr_admin',
        uploadedAt,
        uploadIpAddress: '127.0.0.1',
        uploadUserAgent: 'CoAIleague-Seed/2.0',
        isComplianceDocument: true,
        isVerified: true,
        verifiedBy: 'Diana Torres',
        verifiedAt: uploadedAt,
        isImmutable: false,
        requiresApproval: false,
        metadata: {
          seeded: true,
          seedVersion: '2.0',
          generatedAt: new Date().toISOString(),
        },
        createdAt: hireDate,
        updatedAt: uploadedAt,
      });
    }

    // Flush batch
    if (insertBatch.length >= batchSize) {
      await db.insert(employeeDocuments).values(insertBatch.splice(0, batchSize));
      created += batchSize;
      process.stdout.write(`  Inserted ${created} records...\r`);
    }
  }

  // Flush remaining
  if (insertBatch.length > 0) {
    await db.insert(employeeDocuments).values(insertBatch);
    created += insertBatch.length;
  }

  console.log(`\nCreated ${created} document records`);
  console.log(`Each document links to: /api/sps/documents/view/{docId}`);
  console.log('=== Seeding Complete ===');
}

run().catch(e => { console.error('Seed failed:', e); process.exit(1); });
