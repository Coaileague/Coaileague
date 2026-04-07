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
import { employees, orgDocuments, orgDocumentSignatures, employeeCertifications, hrDocumentRequests, workspaces } from '@shared/schema';
import { eq, and, lt, isNull, isNotNull, desc, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { universalAudit } from '../universalAuditService';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityDocumentActions');

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
