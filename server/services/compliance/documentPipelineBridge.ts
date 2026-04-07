import { db } from '../../db';
import {
  employeeDocuments,
  complianceDocuments,
  employees
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import { createLogger } from '../../lib/logger';
const log = createLogger('documentPipelineBridge');


const COMPLIANCE_TO_EMPLOYEE_DOC_TYPE: Record<string, string> = {
  'guard_registration': 'guard_card',
  'guard_license': 'guard_card',
  'security_license': 'guard_card',
  'guard_registration_copy': 'guard_card_copy',
  'guard_license_copy': 'guard_card_copy',
  'state_license': 'license',
  'firearm_permit': 'firearms_permit',
  'firearms_license': 'firearms_permit',
  'concealed_carry_permit': 'firearms_permit',
  'firearm_qualification': 'firearms_qualification',
  'firearms_qual': 'firearms_qualification',
  'level_2_training': 'level_ii_training',
  'level_ii_cert': 'level_ii_training',
  'level_3_training': 'level_iii_training',
  'level_iii_cert': 'level_iii_training',
  'cpr_cert': 'cpr_first_aid_cert',
  'first_aid': 'cpr_first_aid_cert',
  'cpr_first_aid': 'cpr_first_aid_cert',
  'government_photo_id': 'government_id',
  'drivers_license': 'government_id',
  'state_id': 'government_id',
  'id_copy': 'photo_id_copy',
  'photo_id': 'government_id',
  'ssn': 'social_security_card',
  'social_security': 'social_security_card',
  'ssn_card': 'social_security_card',
  'i9': 'i9_form',
  'i-9': 'i9_form',
  'w4': 'tax_form',
  'w-4': 'tax_form',
  'w4_form': 'tax_form',
  'bg_check': 'background_check',
  'criminal_background': 'background_check',
  'fingerprints': 'fingerprint_receipt',
  'fingerprint': 'fingerprint_receipt',
  'livescan': 'fingerprint_receipt',
  'identogo': 'fingerprint_receipt',
  'drug_screening': 'drug_test',
  'drug_screen': 'drug_test',
  'pre_employment_drug': 'drug_test',
  'psych_eval': 'psychological_evaluation',
  'psychological_exam': 'psychological_evaluation',
  'cover_page': 'cover_sheet',
  'personnel_cover': 'cover_sheet',
  'application': 'employment_application',
  'job_application': 'employment_application',
  'photo': 'employee_photograph',
  'employee_photo': 'employee_photograph',
  'drug_policy': 'zero_policy_drug_form',
  'zero_tolerance': 'zero_policy_drug_form',
  'handbook': 'policy_acknowledgment',
  'employee_handbook': 'policy_acknowledgment',
  'employee_handbook_signed': 'policy_acknowledgment',
  'nda': 'confidentiality_agreement',
  'non_disclosure': 'confidentiality_agreement',
  'direct_deposit': 'direct_deposit_form',
  'bank_info': 'direct_deposit_form',
  'continuing_ed': 'continuing_education',
  'ce_credits': 'continuing_education',
  'supervisor_cert': 'supervisor_training',
};

const VALID_EMPLOYEE_DOC_TYPES = new Set([
  'government_id', 'passport', 'ssn_card', 'birth_certificate',
  'i9_form', 'w4_form', 'w9_form', 'direct_deposit_form',
  'employee_handbook_signed', 'confidentiality_agreement', 'code_of_conduct',
  'certification', 'license', 'training_certificate',
  'background_check', 'drug_test', 'physical_exam',
  'emergency_contact_form', 'uniform_agreement', 'vehicle_insurance',
  'custom_document',
  'cover_sheet', 'employment_application', 'employee_photograph',
  'guard_card', 'guard_card_copy', 'zero_policy_drug_form',
  'fingerprint_receipt', 'level_ii_training', 'level_iii_training',
  'photo_id_copy', 'social_security_card', 'cpr_first_aid_cert',
  'tax_form', 'policy_acknowledgment', 'firearms_permit',
  'firearms_qualification', 'psychological_evaluation',
  'supervisor_training', 'continuing_education',
]);

export function resolveEmployeeDocumentType(complianceDocType: string): string {
  const normalized = complianceDocType.toLowerCase().trim().replace(/[\s-]+/g, '_');

  const mapped = COMPLIANCE_TO_EMPLOYEE_DOC_TYPE[normalized];
  if (mapped && VALID_EMPLOYEE_DOC_TYPES.has(mapped)) {
    return mapped;
  }

  if (VALID_EMPLOYEE_DOC_TYPES.has(normalized)) {
    return normalized;
  }

  return 'custom_document';
}

interface BridgeResult {
  success: boolean;
  employeeDocumentId?: string;
  action: 'created' | 'updated' | 'skipped';
  reason?: string;
}

export async function bridgeComplianceToEmployeeDocument(
  complianceDoc: {
    id: string;
    workspaceId: string;
    employeeId: string;
    documentName: string;
    documentTypeId?: string | null;
    fileName?: string | null;
    fileType?: string | null;
    fileSizeBytes?: number | null;
    storageUrl?: string | null;
    storageKey?: string | null;
    expirationDate?: Date | null;
    status: string;
    fileHashSha256?: string | null;
    uploadedBy?: string | null;
    uploadIpAddress?: string | null;
    uploadUserAgent?: string | null;
  }
): Promise<BridgeResult> {
  try {
    if (!complianceDoc.employeeId || !complianceDoc.workspaceId) {
      return { success: false, action: 'skipped', reason: 'Missing employeeId or workspaceId' };
    }

    const employeeDocType = resolveEmployeeDocumentType(
      complianceDoc.documentTypeId || complianceDoc.documentName || 'custom_document'
    );

    const existing = await db.query.employeeDocuments.findFirst({
      where: and(
        eq(employeeDocuments.employeeId, complianceDoc.employeeId),
        eq(employeeDocuments.documentType, employeeDocType as any),
        eq(employeeDocuments.workspaceId, complianceDoc.workspaceId),
      ),
    });

    const fileUrl = complianceDoc.storageUrl || complianceDoc.storageKey || `compliance://${complianceDoc.id}`;

    const complianceStatus = complianceDoc.status;
    let empDocStatus: string;
    if (complianceStatus === 'approved' || complianceStatus === 'locked' || complianceStatus === 'verified') {
      empDocStatus = 'approved';
    } else if (complianceStatus === 'rejected') {
      empDocStatus = 'rejected';
    } else if (complianceStatus === 'expired') {
      empDocStatus = 'expired';
    } else {
      empDocStatus = 'uploaded';
    }

    if (existing) {
      await db.update(employeeDocuments)
        .set({
          fileUrl,
          fileSize: complianceDoc.fileSizeBytes,
          fileType: complianceDoc.fileType,
          originalFileName: complianceDoc.fileName,
          status: empDocStatus as any,
          expirationDate: complianceDoc.expirationDate,
          isVerified: complianceStatus === 'approved' || complianceStatus === 'locked' || complianceStatus === 'verified',
          verifiedAt: (complianceStatus === 'approved' || complianceStatus === 'locked') ? new Date() : undefined,
          isComplianceDocument: true,
          digitalSignatureHash: complianceDoc.fileHashSha256,
          metadata: {
            sourceSystem: 'compliance_vault',
            complianceDocumentId: complianceDoc.id,
            bridgedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(employeeDocuments.id, existing.id));

      return { success: true, employeeDocumentId: existing.id, action: 'updated' };
    }

    const [newDoc] = await db.insert(employeeDocuments).values({
      workspaceId: complianceDoc.workspaceId,
      employeeId: complianceDoc.employeeId,
      documentType: employeeDocType as any,
      documentName: complianceDoc.documentName,
      fileUrl,
      fileSize: complianceDoc.fileSizeBytes,
      fileType: complianceDoc.fileType,
      originalFileName: complianceDoc.fileName,
      uploadedBy: complianceDoc.uploadedBy,
      uploadIpAddress: complianceDoc.uploadIpAddress || '0.0.0.0',
      uploadUserAgent: complianceDoc.uploadUserAgent,
      status: empDocStatus as any,
      expirationDate: complianceDoc.expirationDate,
      isComplianceDocument: true,
      isVerified: complianceStatus === 'approved' || complianceStatus === 'locked' || complianceStatus === 'verified',
      verifiedAt: (complianceStatus === 'approved' || complianceStatus === 'locked') ? new Date() : undefined,
      digitalSignatureHash: complianceDoc.fileHashSha256,
      metadata: {
        sourceSystem: 'compliance_vault',
        complianceDocumentId: complianceDoc.id,
        bridgedAt: new Date().toISOString(),
      },
    }).returning();

    platformEventBus.publish({
      type: 'document_bridged',
      workspaceId: complianceDoc.workspaceId,
      payload: {
        documentId: newDoc.id,
        destination: 'employee_documents',
        employeeId: complianceDoc.employeeId,
        employeeDocumentId: newDoc.id,
        complianceDocumentId: complianceDoc.id,
        documentType: employeeDocType,
      },
      metadata: { source: 'DocumentPipelineBridge' },
    }).catch((err: any) => log.warn('[DocumentPipelineBridge] Failed to publish document_bridged:', err.message));

    return { success: true, employeeDocumentId: newDoc.id, action: 'created' };
  } catch (error) {
    log.error('[DocumentPipelineBridge] Error bridging compliance→employee document:', error);
    return { success: false, action: 'skipped', reason: String(error) };
  }
}

export async function bridgeFileCabinetToEmployeeDocument(
  workspaceId: string,
  employeeId: string,
  fileRecord: {
    id: string;
    fileName: string;
    fileType?: string;
    category?: string;
    uploadedBy: string;
  },
  ipAddress: string,
  userAgent?: string,
): Promise<BridgeResult> {
  try {
    const docType = resolveEmployeeDocumentType(fileRecord.category || fileRecord.fileName);
    const fileUrl = `file-cabinet://${employeeId}/${fileRecord.id}`;

    const existing = await db.query.employeeDocuments.findFirst({
      where: and(
        eq(employeeDocuments.employeeId, employeeId),
        eq(employeeDocuments.documentType, docType as any),
        eq(employeeDocuments.workspaceId, workspaceId),
      ),
    });

    if (existing) {
      await db.update(employeeDocuments)
        .set({
          fileUrl,
          originalFileName: fileRecord.fileName,
          fileType: fileRecord.fileType,
          metadata: {
            sourceSystem: 'file_cabinet',
            fileCabinetId: fileRecord.id,
            bridgedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(employeeDocuments.id, existing.id));

      return { success: true, employeeDocumentId: existing.id, action: 'updated' };
    }

    const [newDoc] = await db.insert(employeeDocuments).values({
      workspaceId,
      employeeId,
      documentType: docType as any,
      documentName: fileRecord.fileName,
      fileUrl,
      fileType: fileRecord.fileType,
      originalFileName: fileRecord.fileName,
      uploadedBy: fileRecord.uploadedBy,
      uploadIpAddress: ipAddress,
      uploadUserAgent: userAgent,
      status: 'uploaded',
      isComplianceDocument: false,
      metadata: {
        sourceSystem: 'file_cabinet',
        fileCabinetId: fileRecord.id,
        bridgedAt: new Date().toISOString(),
      },
    }).returning();

    return { success: true, employeeDocumentId: newDoc.id, action: 'created' };
  } catch (error) {
    log.error('[DocumentPipelineBridge] Error bridging file cabinet→employee document:', error);
    return { success: false, action: 'skipped', reason: String(error) };
  }
}

export async function bridgeComplianceStatusChange(
  complianceDocId: string,
  newStatus: string,
  updatedBy?: string,
): Promise<BridgeResult> {
  try {
    const compDoc = await db.query.complianceDocuments.findFirst({
      where: eq(complianceDocuments.id, complianceDocId),
    });

    if (!compDoc) {
      return { success: false, action: 'skipped', reason: 'Compliance document not found' };
    }

    const employeeDocType = resolveEmployeeDocumentType(
      compDoc.documentTypeId || compDoc.documentName || 'custom_document'
    );

    const existing = await db.query.employeeDocuments.findFirst({
      where: and(
        eq(employeeDocuments.employeeId, compDoc.employeeId),
        eq(employeeDocuments.documentType, employeeDocType as any),
        eq(employeeDocuments.workspaceId, compDoc.workspaceId),
      ),
    });

    if (!existing) {
      return bridgeComplianceToEmployeeDocument({
        id: compDoc.id,
        workspaceId: compDoc.workspaceId,
        employeeId: compDoc.employeeId,
        documentName: compDoc.documentName,
        documentTypeId: compDoc.documentTypeId,
        fileName: compDoc.fileName,
        fileType: compDoc.fileType,
        fileSizeBytes: compDoc.fileSizeBytes,
        storageUrl: compDoc.storageUrl,
        storageKey: compDoc.storageKey,
        expirationDate: compDoc.expirationDate,
        status: newStatus,
        fileHashSha256: compDoc.fileHashSha256,
        uploadedBy: compDoc.uploadedBy,
        uploadIpAddress: compDoc.uploadIpAddress,
        uploadUserAgent: compDoc.uploadUserAgent,
      });
    }

    let empDocStatus: string;
    if (newStatus === 'approved' || newStatus === 'locked' || newStatus === 'verified') {
      empDocStatus = 'approved';
    } else if (newStatus === 'rejected') {
      empDocStatus = 'rejected';
    } else if (newStatus === 'expired') {
      empDocStatus = 'expired';
    } else {
      empDocStatus = 'uploaded';
    }

    const updateData: any = {
      status: empDocStatus,
      updatedAt: new Date(),
    };

    if (empDocStatus === 'approved') {
      updateData.isVerified = true;
      updateData.verifiedAt = new Date();
      updateData.verifiedBy = updatedBy;
    } else if (empDocStatus === 'rejected') {
      updateData.rejectedBy = updatedBy;
      updateData.rejectedAt = new Date();
    }

    await db.update(employeeDocuments)
      .set(updateData)
      .where(eq(employeeDocuments.id, existing.id));

    return { success: true, employeeDocumentId: existing.id, action: 'updated' };
  } catch (error) {
    log.error('[DocumentPipelineBridge] Error bridging status change:', error);
    return { success: false, action: 'skipped', reason: String(error) };
  }
}

export const documentPipelineBridge = {
  resolveEmployeeDocumentType,
  bridgeComplianceToEmployeeDocument,
  bridgeFileCabinetToEmployeeDocument,
  bridgeComplianceStatusChange,
};
