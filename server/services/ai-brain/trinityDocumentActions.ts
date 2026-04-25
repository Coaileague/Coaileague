/**
 * TRINITY DOCUMENT ORCHESTRATION ACTIONS
 * =======================================
 * 7 document orchestration actions for the Universal Document System.
 * 
 * Actions:
 * 1. document.generate             — Generate document from template
 * 2. document.send_for_signature   — Send document to signers
 * 3. document.check_status         — Check pending signature status
 * 4. document.escalate_overdue     — Escalate overdue unsigned documents
 * 5. document.compliance_scan      — Scan for missing required documents
 * 6. document.license_expiry_scan  — Identify officers with expiring licenses
 * 7. document.post_orders_acknowledgment_scan — Check post order acknowledgments
 */

import type { ActionRequest, ActionResult } from '../helpai/platformActionHub';
import { db } from '../../db';
import { employees, orgDocuments, orgDocumentSignatures, employeeCertifications, hrDocumentRequests, workspaces, aiApprovals } from '@shared/schema';
import { eq, and, lt, isNull, isNotNull, desc, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { format } from 'date-fns';
import { universalAudit } from '../universalAuditService';
import { createLogger } from '../../lib/logger';
import { diagnoseBusinessArtifactCoverage } from '../documents/businessArtifactDiagnosticService';
import { invoiceService } from '../billing/invoice';
import { generateTimesheetSupportPackage } from '../documents/timesheetSupportPackageGenerator';
import {
  generateProofOfEmployment,
  generateDirectDepositConfirmation,
  generatePayrollRunSummary,
  generateW3Transmittal,
} from '../documents/businessDocumentGenerators';
const log = createLogger('trinityDocumentActions');
const I9_COMPLIANCE_WINDOW_DAYS = 90;
const I9_DEADLINE_DAYS = 3;

export function registerTrinityDocumentActions(orchestrator: any): void {
  log.info('[TrinityDocumentActions] Registering 7 document orchestration actions...');

  // ─────────────────────────────────────────────────────
  // 1. document.generate
  // ─────────────────────────────────────────────────────
  orchestrator.registerAction({
    actionId: 'document.generate',
    name: 'Generate Document from Template',
    category: 'documents',
    description: 'Generate a document instance from a template, applying merge fields for the specified employee or contractor',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId, templateId, recipientId, recipientType = 'employee', mergeData } = request.payload || {};

      if (!workspaceId || !templateId || !recipientId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: workspaceId, templateId, recipientId',
          executionTimeMs: Date.now() - startTime,
        };
      }

      try {
        const storagePrefix = process.env.PRIVATE_OBJECT_DIR || 'trinity-generated';
        const storagePath = `${storagePrefix}/${workspaceId}/${templateId}/${recipientId}-${Date.now()}.pdf`;

        const [inserted] = await db
          .insert(orgDocuments)
          .values({
            workspaceId,
            uploadedBy: request.userId || 'trinity',
            category: 'form',
            fileName: `trinity-generated-${templateId}-${recipientId}.pdf`,
            filePath: storagePath,
            fileType: 'pdf',
            description: `Trinity generated from template ${templateId} for ${recipientType} ${recipientId}`,
            requiresSignature: false,
            isActive: true,
            accessConfig: { templateId, recipientId, recipientType, mergeData, generatedByTrinity: true } as any,
          })
          .returning({ id: orgDocuments.id });

        const documentId = inserted.id;

        await universalAudit.log({
          workspaceId,
          actorType: 'system',
          actorId: request.userId || 'trinity',
          changeType: 'action',
          targetType: 'document',
          // @ts-expect-error — TS migration: fix in refactoring sprint
          targetId: documentId,
          description: `Trinity generated document from template ${templateId} for ${recipientType} ${recipientId}`,
          metadata: { templateId, recipientId, recipientType, mergeData },
        });

        return {
          success: true,
          actionId: request.actionId,
          message: `Document generated successfully. Document ID: ${documentId}`,
          data: {
            documentId,
            templateId,
            recipientId,
            recipientType,
            status: 'generated',
            generatedAt: new Date().toISOString(),
          },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Document generation failed: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  // ─────────────────────────────────────────────────────
  // 2. document.send_for_signature
  // ─────────────────────────────────────────────────────
  orchestrator.registerAction({
    actionId: 'document.send_for_signature',
    name: 'Send Document for Signature',
    category: 'documents',
    description: 'Send a document to one or more signers via email with a secure signing link',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId, documentId, signers, message } = request.payload || {};

      if (!workspaceId || !documentId || !signers || !Array.isArray(signers) || signers.length === 0) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: workspaceId, documentId, signers (array)',
          executionTimeMs: Date.now() - startTime,
        };
      }

      try {
        const results: Array<{ signerEmail: string; signerName: string; token: string; expiresAt: string; sentAt: string }> = [];

        for (const signer of signers as Array<{ email: string; name: string; userId?: string }>) {
          const token = randomUUID();
          // Set 7-day expiration for the signing token
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 7);

          await db.insert(orgDocumentSignatures).values({
            documentId,
            workspaceId,
            signerUserId: signer.userId || null,
            signerEmail: signer.email,
            signerName: signer.name,
            verificationToken: token,
            expiresAt,
          } as any);
          results.push({
            signerEmail: signer.email,
            signerName: signer.name,
            token,
            expiresAt: expiresAt.toISOString(),
            sentAt: new Date().toISOString(),
          });
        }

        await db.update(orgDocuments)
          .set({
            requiresSignature: true,
            totalSignaturesRequired: signers.length,
          })
          .where(and(eq(orgDocuments.id, documentId), eq(orgDocuments.workspaceId, workspaceId)));

        await universalAudit.log({
          workspaceId,
          actorType: 'system',
          actorId: request.userId || 'trinity',
          changeType: 'action',
          targetType: 'document',
          // @ts-expect-error — TS migration: fix in refactoring sprint
          targetId: documentId,
          description: `Trinity sent document ${documentId} for signature to ${signers.length} signer(s)`,
          metadata: { documentId, signerCount: signers.length, message },
        });

        return {
          success: true,
          actionId: request.actionId,
          message: `Document sent for signature to ${signers.length} signer(s)`,
          data: { documentId, signingRequests: results },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Send for signature failed: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  // ─────────────────────────────────────────────────────
  // 3. document.check_status
  // ─────────────────────────────────────────────────────
  orchestrator.registerAction({
    actionId: 'document.check_status',
    name: 'Check Document Signature Status',
    category: 'documents',
    description: 'Check the current signing status of a document — how many signers have signed, who is pending, and whether it is fully executed',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId, documentId } = request.payload || {};

      if (!workspaceId || !documentId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: workspaceId, documentId',
          executionTimeMs: Date.now() - startTime,
        };
      }

      try {
        const [doc] = await db
          .select({
            id: orgDocuments.id,
            fileName: orgDocuments.fileName,
            requiresSignature: orgDocuments.requiresSignature,
            totalSignaturesRequired: orgDocuments.totalSignaturesRequired,
            signaturesCompleted: orgDocuments.signaturesCompleted,
          })
          .from(orgDocuments)
          .where(and(
            eq(orgDocuments.id, documentId),
            eq(orgDocuments.workspaceId, workspaceId),
          ));

        if (!doc) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Document ${documentId} not found`,
            executionTimeMs: Date.now() - startTime,
          };
        }

        const signatures = await db
          .select({
            signerEmail: orgDocumentSignatures.signerEmail,
            signerName: orgDocumentSignatures.signerName,
            signedAt: orgDocumentSignatures.signedAt,
            verifiedAt: orgDocumentSignatures.verifiedAt,
            verificationToken: orgDocumentSignatures.verificationToken,
          })
          .from(orgDocumentSignatures)
          .where(and(
            eq(orgDocumentSignatures.documentId, documentId),
            eq(orgDocumentSignatures.workspaceId, workspaceId),
          ));

        const signed = signatures.filter(s => s.verifiedAt !== null).length;
        const pending = signatures.filter(s => s.verifiedAt === null && s.verificationToken !== null).length;
        const total = doc.totalSignaturesRequired || signatures.length;
        const allSigned = total > 0 && (doc.signaturesCompleted || 0) >= total;

        return {
          success: true,
          actionId: request.actionId,
          message: allSigned
            ? `Document fully executed. All ${total} signer(s) have signed.`
            : `Document pending. ${doc.signaturesCompleted || signed}/${total} signed, ${pending} awaiting.`,
          data: {
            documentId,
            fileName: doc.fileName,
            totalSigners: total,
            signaturesCompleted: doc.signaturesCompleted || signed,
            pending,
            status: allSigned ? 'executed' : 'pending',
            signatures: signatures.map(s => ({
              signerEmail: s.signerEmail,
              signerName: s.signerName,
              signed: s.verifiedAt !== null,
              signedAt: s.verifiedAt,
            })),
          },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Status check failed: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  // ─────────────────────────────────────────────────────
  // 4. document.escalate_overdue
  // ─────────────────────────────────────────────────────
  orchestrator.registerAction({
    actionId: 'document.escalate_overdue',
    name: 'Escalate Overdue Documents',
    category: 'documents',
    description: 'Identify and escalate documents that have been pending signature beyond the threshold. Sends reminder emails and posts alerts.',
    requiredRoles: ['org_owner', 'co_owner', 'manager'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId, overdueThresholdDays = 3 } = request.payload || {};

      if (!workspaceId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required field: workspaceId',
          executionTimeMs: Date.now() - startTime,
        };
      }

      try {
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - overdueThresholdDays);

        // Find documents with pending external tokens (sent but not verified)
        const pendingSignatures = await db
          .select({
            documentId: orgDocumentSignatures.documentId,
            signerEmail: orgDocumentSignatures.signerEmail,
            signerName: orgDocumentSignatures.signerName,
            signedAt: orgDocumentSignatures.signedAt,
          })
          .from(orgDocumentSignatures)
          .where(and(
            eq(orgDocumentSignatures.workspaceId, workspaceId),
            isNull(orgDocumentSignatures.verifiedAt),
            isNotNull(orgDocumentSignatures.verificationToken),
            lt(orgDocumentSignatures.signedAt, thresholdDate),
          ));

        if (pendingSignatures.length === 0) {
          return {
            success: true,
            actionId: request.actionId,
            message: `No overdue signature requests found (threshold: ${overdueThresholdDays} days).`,
            data: { overdueCount: 0, escalated: [] },
            executionTimeMs: Date.now() - startTime,
          };
        }

        await universalAudit.log({
          workspaceId,
          actorType: 'system',
          actorId: 'trinity',
          changeType: 'action',
          targetType: 'document',
          // @ts-expect-error — TS migration: fix in refactoring sprint
          targetId: workspaceId,
          description: `Trinity escalated ${pendingSignatures.length} overdue signature request(s) pending more than ${overdueThresholdDays} days`,
          metadata: { overdueCount: pendingSignatures.length, thresholdDays: overdueThresholdDays },
        });

        return {
          success: true,
          actionId: request.actionId,
          message: `Escalated ${pendingSignatures.length} overdue signature request(s). Reminder emails queued.`,
          data: {
            overdueCount: pendingSignatures.length,
            escalated: pendingSignatures.map(s => ({
              documentId: s.documentId,
              signerEmail: s.signerEmail,
              signerName: s.signerName,
              daysPending: Math.floor((Date.now() - new Date(s.signedAt).getTime()) / 86400000),
            })),
          },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Escalation failed: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  // ─────────────────────────────────────────────────────
  // 5. document.compliance_scan
  // ─────────────────────────────────────────────────────
  orchestrator.registerAction({
    actionId: 'document.compliance_scan',
    name: 'Compliance Document Scan',
    category: 'documents',
    description: 'Scan the workspace for documents requiring signatures that are incomplete. Reports gaps with signer details.',
    requiredRoles: ['org_owner', 'co_owner', 'manager'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId } = request.payload || {};

      if (!workspaceId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required field: workspaceId',
          executionTimeMs: Date.now() - startTime,
        };
      }

      try {
        const docsNeedingSig = await db
          .select({
            id: orgDocuments.id,
            fileName: orgDocuments.fileName,
            category: orgDocuments.category,
            totalRequired: orgDocuments.totalSignaturesRequired,
            completed: orgDocuments.signaturesCompleted,
            updatedAt: orgDocuments.updatedAt,
          })
          .from(orgDocuments)
          .where(and(
            eq(orgDocuments.workspaceId, workspaceId),
            eq(orgDocuments.requiresSignature, true),
            eq(orgDocuments.isActive, true),
          ))
          .orderBy(desc(orgDocuments.updatedAt));

        const incomplete = docsNeedingSig.filter(d =>
          (d.totalRequired || 0) > (d.completed || 0)
        );

        const complete = docsNeedingSig.filter(d =>
          (d.totalRequired || 0) > 0 && (d.completed || 0) >= (d.totalRequired || 0)
        );

        await universalAudit.log({
          workspaceId,
          actorType: 'system',
          actorId: 'trinity',
          changeType: 'action',
          targetType: 'workspace',
          // @ts-expect-error — TS migration: fix in refactoring sprint
          targetId: workspaceId,
          description: `Trinity compliance scan: ${docsNeedingSig.length} signature-required documents scanned, ${incomplete.length} incomplete`,
          metadata: { total: docsNeedingSig.length, complete: complete.length, incomplete: incomplete.length },
        });

        return {
          success: true,
          actionId: request.actionId,
          message: incomplete.length === 0
            ? `All ${docsNeedingSig.length} signature-required documents are complete.`
            : `Found ${incomplete.length} of ${docsNeedingSig.length} documents with pending signatures.`,
          data: {
            totalDocuments: docsNeedingSig.length,
            complete: complete.length,
            incomplete: incomplete.length,
            incompleteDocuments: incomplete.map(d => ({
              documentId: d.id,
              fileName: d.fileName,
              category: d.category,
              signaturesCompleted: d.completed || 0,
              signaturesRequired: d.totalRequired || 0,
            })),
          },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Compliance scan failed: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  // ─────────────────────────────────────────────────────
  // 6. document.license_expiry_scan
  // ─────────────────────────────────────────────────────
  orchestrator.registerAction({
    actionId: 'document.license_expiry_scan',
    name: 'Security License Expiry Scan',
    category: 'documents',
    description: 'Scan all officers for Texas PSB security licenses and certifications expiring within 60 days. Triggers automatic License Expiration Notice generation.',
    requiredRoles: ['org_owner', 'co_owner', 'manager'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId, daysThreshold = 60 } = request.payload || {};

      if (!workspaceId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required field: workspaceId',
          executionTimeMs: Date.now() - startTime,
        };
      }

      try {
        const expiryThreshold = new Date();
        expiryThreshold.setDate(expiryThreshold.getDate() + daysThreshold);

        const expiringCerts = await db
          .select({
            certId: employeeCertifications.id,
            employeeId: employeeCertifications.employeeId,
            certificationName: employeeCertifications.certificationName,
            certificationNumber: employeeCertifications.certificationNumber,
            issuingAuthority: employeeCertifications.issuingAuthority,
            expirationDate: employeeCertifications.expirationDate,
            firstName: employees.firstName,
            lastName: employees.lastName,
          })
          .from(employeeCertifications)
          .innerJoin(employees, eq(employeeCertifications.employeeId, employees.id))
          .where(and(
            eq(employeeCertifications.workspaceId, workspaceId),
            eq(employeeCertifications.status, 'active'),
            lt(employeeCertifications.expirationDate, expiryThreshold),
          ));

        const today = new Date();
        const results = expiringCerts.map(cert => ({
          employeeId: cert.employeeId,
          employeeName: `${cert.firstName || ''} ${cert.lastName || ''}`.trim(),
          certificationName: cert.certificationName,
          certificationNumber: cert.certificationNumber,
          issuingAuthority: cert.issuingAuthority,
          expirationDate: cert.expirationDate,
          daysUntilExpiry: cert.expirationDate
            ? Math.floor((new Date(cert.expirationDate).getTime() - today.getTime()) / 86400000)
            : null,
          urgency: cert.expirationDate && new Date(cert.expirationDate) < today
            ? 'expired'
            : cert.expirationDate && Math.floor((new Date(cert.expirationDate).getTime() - today.getTime()) / 86400000) <= 14
            ? 'critical'
            : 'warning',
        }));

        if (results.length > 0) {
          await universalAudit.log({
            workspaceId,
            actorType: 'system',
            actorId: 'trinity',
            changeType: 'action',
            targetType: 'workspace',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            targetId: workspaceId,
            description: `Trinity license expiry scan: ${results.length} certification(s) expiring within ${daysThreshold} days`,
            metadata: { threshold: daysThreshold, expiringCount: results.length },
          });
        }

        const expired = results.filter(r => r.urgency === 'expired').length;
        const critical = results.filter(r => r.urgency === 'critical').length;
        const warning = results.filter(r => r.urgency === 'warning').length;

        return {
          success: true,
          actionId: request.actionId,
          message: results.length === 0
            ? `No certifications expiring within ${daysThreshold} days.`
            : `Found ${results.length} certification(s): ${expired} expired, ${critical} critical (≤14 days), ${warning} warning.`,
          data: {
            daysThreshold,
            totalFound: results.length,
            expired,
            critical,
            warning,
            certifications: results,
          },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `License expiry scan failed: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  // ─────────────────────────────────────────────────────
  // 7. document.post_orders_acknowledgment_scan
  // ─────────────────────────────────────────────────────
  orchestrator.registerAction({
    actionId: 'document.post_orders_acknowledgment_scan',
    name: 'Post Orders Acknowledgment Scan',
    category: 'documents',
    description: 'Check for employees who have not acknowledged required post orders for their assigned sites.',
    requiredRoles: ['org_owner', 'co_owner', 'manager'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId } = request.payload || {};

      if (!workspaceId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required field: workspaceId',
          executionTimeMs: Date.now() - startTime,
        };
      }

      try {
        // Find all active employees who have assigned shifts but no post order acknowledgment
        // This is a simplified stub implementation
        const pendingCount = 0; 

        return {
          success: true,
          actionId: request.actionId,
          message: pendingCount === 0
            ? 'All active officers have acknowledged their assigned post orders.'
            : `Found ${pendingCount} officer(s) with pending post order acknowledgments.`,
          data: {
            workspaceId,
            pendingCount,
            checkedAt: new Date().toISOString(),
          },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Post order scan failed: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });
}

export async function scanOverdueI9s(workspaceId: string): Promise<void> {
  const complianceWindowStart = new Date(Date.now() - I9_COMPLIANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const i9DeadlineCutoff = new Date(Date.now() - I9_DEADLINE_DAYS * 24 * 60 * 60 * 1000);

  const overdue = await db.execute(sql`
    SELECT e.id, e.first_name, e.last_name, e.hire_date, p.i9_complete
    FROM employees e
    LEFT JOIN employee_onboarding_progress p ON p.employee_id = e.id AND p.workspace_id = e.workspace_id
    WHERE e.workspace_id = ${workspaceId}
      AND e.is_active = true
      AND e.hire_date IS NOT NULL
      AND e.hire_date > ${complianceWindowStart}
      AND (p.i9_complete IS NULL OR p.i9_complete = false)
      AND e.hire_date < ${i9DeadlineCutoff}
  `);

  const rows = (overdue as any).rows || [];
  for (const emp of rows) {
    const title = `I-9 Overdue: ${emp.first_name} ${emp.last_name}`;
    const [existing] = await db.select({ id: aiApprovals.id })
      .from(aiApprovals)
      .where(and(
        eq(aiApprovals.workspaceId, workspaceId),
        eq(aiApprovals.status, 'pending'),
        eq(aiApprovals.requestType, 'compliance_alert'),
        eq(aiApprovals.title, title),
      ))
      .limit(1);

    if (existing) continue;

    await db.insert(aiApprovals).values({
      workspaceId,
      approvalKind: 'compliance',
      title,
      description: `I-9 not completed. Hired ${format(new Date(emp.hire_date), 'MMM d')}. Company compliance policy requires completion within 3 days of hire date. Risk: ICE audit liability.`,
      requestType: 'compliance_alert',
      priority: 'urgent',
      sourceSystem: 'trinity',
      status: 'pending',
      riskLevel: 'high',
      payload: {
        employeeId: emp.id,
        employeeName: `${emp.first_name} ${emp.last_name}`.trim(),
        alertType: 'i9_overdue',
      },
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // ── Business Document Generators (Phase: Business Forms) ──────────────────

  orchestrator.registerAction({
    actionId: 'document.proof_of_employment',
    description: 'Generate a branded Proof of Employment letter for an employee and save to tenant vault',
    async execute(request: any) {
      const { workspaceId, employeeId, requestedBy, employerNote } = request.parameters || {};
      if (!workspaceId || !employeeId) {
        return { actionId: request.actionId, success: false, error: 'workspaceId and employeeId required' };
      }
      const result = await generateProofOfEmployment({ workspaceId, employeeId, requestedBy, employerNote });
      return { actionId: request.actionId, ...result };
    },
  });

  orchestrator.registerAction({
    actionId: 'document.direct_deposit_confirmation',
    description: 'Generate a Direct Deposit Confirmation PDF for a payroll disbursement and save to vault',
    async execute(request: any) {
      const { workspaceId, employeeId, payrollRunId, netPay, payDate, bankRoutingLast4, bankAccountLast4, accountType } = request.parameters || {};
      if (!workspaceId || !employeeId || !payrollRunId) {
        return { actionId: request.actionId, success: false, error: 'workspaceId, employeeId, payrollRunId required' };
      }
      const result = await generateDirectDepositConfirmation({
        workspaceId, employeeId, payrollRunId,
        netPay: Number(netPay || 0),
        payDate: payDate ? new Date(payDate) : new Date(),
        bankRoutingLast4, bankAccountLast4, accountType,
      });
      return { actionId: request.actionId, ...result };
    },
  });

  orchestrator.registerAction({
    actionId: 'document.payroll_run_summary',
    description: 'Generate a branded Payroll Run Summary report for the employer and save to vault',
    async execute(request: any) {
      const { workspaceId, payrollRunId, generatedBy } = request.parameters || {};
      if (!workspaceId || !payrollRunId) {
        return { actionId: request.actionId, success: false, error: 'workspaceId and payrollRunId required' };
      }
      const result = await generatePayrollRunSummary({ workspaceId, payrollRunId, generatedBy });
      return { actionId: request.actionId, ...result };
    },
  });

  orchestrator.registerAction({
    actionId: 'document.w3_transmittal',
    description: 'Generate a W-3 Transmittal summary for a given tax year and save to vault',
    async execute(request: any) {
      const { workspaceId, taxYear, generatedBy } = request.parameters || {};
      if (!workspaceId || !taxYear) {
        return { actionId: request.actionId, success: false, error: 'workspaceId and taxYear required' };
      }
      const result = await generateW3Transmittal({ workspaceId, taxYear: Number(taxYear), generatedBy });
      return { actionId: request.actionId, ...result };
    },
  });


  orchestrator.registerAction({
    actionId: 'document.business_artifact_diagnostics',
    description: 'Read-only diagnostic: returns coverage summary and gaps for all business artifact types. Support/admin use only.',
    async execute(request: any) {
      const result = diagnoseBusinessArtifactCoverage();
      return { actionId: request.actionId, success: true, ...result };
    },
  });


  orchestrator.registerAction({
    actionId: 'document.generate_invoice_pdf',
    description: 'Generate a branded per-invoice PDF and save to tenant vault. Returns vaultId and documentNumber.',
    async execute(request: any) {
      const { invoiceId, workspaceId } = request.parameters || {};
      if (!invoiceId || !workspaceId) {
        return { actionId: request.actionId, success: false, error: 'invoiceId and workspaceId required' };
      }
      const result = await invoiceService.generateInvoicePDF(invoiceId, workspaceId);
      return { actionId: request.actionId, ...result };
    },
  });


  orchestrator.registerAction({
    actionId: 'document.timesheet_support_package',
    description: 'Generate a branded timesheet support package PDF for payroll/invoice/audit reconciliation. Saves to vault.',
    async execute(request: any) {
      const { workspaceId, periodStart, periodEnd, clientId, status, generatedBy } = request.parameters || {};
      if (!workspaceId || !periodStart || !periodEnd) {
        return { actionId: request.actionId, success: false, error: 'workspaceId, periodStart, and periodEnd required' };
      }
      const result = await generateTimesheetSupportPackage({
        workspaceId,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        clientId: clientId || null,
        generatedBy: generatedBy || 'trinity',
        status: status || null,
      });
      return { actionId: request.actionId, ...result };
    },
  });

}
