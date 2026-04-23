import { randomUUID } from 'crypto';
import { systemFormTemplates } from '../seedFormTemplates';
import { documentPipeline } from '../pipeline/documentPipeline';
import { db } from '../db';
import { orgDocuments, employeeDocuments, customFormSubmissions } from '@shared/schema';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import { createNotification } from './notificationService';

import { universalAudit } from './universalAuditService';
import { createLogger } from '../lib/logger';
const log = createLogger('formWorkflowService');


export interface FormSubmission {
  id: string;
  workspaceId: string;
  templateId: string;
  templateName: string;
  templateCategory: string;
  submittedBy: string;
  submitterName: string;
  formData: Record<string, any>;
  photos: string[];
  signatureData?: string;
  status: 'draft' | 'submitted' | 'pending_review' | 'approved' | 'rejected' | 'completed';
  pipelineDocId?: string;
  reviewerId?: string;
  reviewerName?: string;
  reviewNotes?: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

function rowToSubmission(row: typeof customFormSubmissions.$inferSelect): FormSubmission {
  const raw = (row as any).formData || {};
  const meta = raw._meta || {};
  const cleanFormData: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k !== '_meta') cleanFormData[k] = v;
  }
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    templateId: row.formId,
    templateName: meta.templateName || row.formId,
    templateCategory: meta.templateCategory || 'general',
    submittedBy: row.submittedBy || '',
    submitterName: meta.submitterName || '',
    formData: cleanFormData,
    photos: Array.isArray(row.documents) ? (row.documents as string[]) : [],
    signatureData: row.signatureData ? JSON.stringify(row.signatureData) : undefined,
    status: (row.status || 'pending_review') as FormSubmission['status'],
    pipelineDocId: meta.pipelineDocId,
    reviewerId: meta.reviewerId,
    reviewerName: meta.reviewerName,
    reviewNotes: meta.reviewNotes,
    reviewedAt: meta.reviewedAt ? new Date(meta.reviewedAt) : undefined,
    createdAt: row.createdAt || row.submittedAt || new Date(),
    updatedAt: row.updatedAt || new Date(),
  };
}

class FormWorkflowService {
  async submitForm(params: {
    workspaceId: string;
    templateId: string;
    submittedBy: string;
    submitterName: string;
    formData: Record<string, any>;
    photos?: string[];
    signatureData?: string;
  }): Promise<{ submissionId: string; pipelineDocId: string; status: string }> {
    const template = this.findTemplate(params.templateId);
    const templateName = template?.name || params.templateId;
    const templateCategory = template?.category || 'custom';

    const submissionId = randomUUID();
    const now = new Date();

    let pipelineDocId = '';
    try {
      const pipelineDoc = await documentPipeline.createDocument(
        'other',
        params.workspaceId,
        {
          botId: 'form-workflow',
          botInstanceId: `form-${submissionId}`,
          roomId: params.workspaceId,
          capturedAt: now,
          rawContent: {
            templateId: params.templateId,
            templateName,
            formData: params.formData,
            photos: params.photos || [],
            signatureData: params.signatureData,
          },
        },
        {
          title: `${templateName} - ${params.submitterName}`,
          priority: 'normal',
          workspaceId: params.workspaceId,
          metadata: {
            submissionId,
            templateCategory,
            submitterName: params.submitterName,
          },
          tags: ['form-submission', templateCategory],
        }
      );
      pipelineDocId = pipelineDoc.id;
    } catch (err) {
      log.error('[FormWorkflow] Pipeline document creation failed:', err);
      pipelineDocId = `pending-${submissionId}`;
    }

    const storedFormData = {
      ...params.formData,
      _meta: {
        templateName,
        templateCategory,
        submitterName: params.submitterName,
        pipelineDocId,
      },
    };

    await db.insert(customFormSubmissions).values({
      id: submissionId,
      formId: params.templateId,
      workspaceId: params.workspaceId,
      submittedBy: params.submittedBy,
      submittedByType: 'employee',
      formData: storedFormData,
      signatureData: params.signatureData ? { raw: params.signatureData } : null,
      documents: params.photos || [],
      status: 'pending_review',
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    }).returning().then(rows => rows[0].id);

    await universalAudit.log({
      workspaceId: params.workspaceId,
      actorId: params.submittedBy,
      actorType: 'user',
      action: 'form.submitted',
      entityType: 'form_submission',
      entityId: submissionId,
      entityName: templateName,
      changeType: 'create',
      metadata: { templateId: params.templateId }
    });

    log.info(`[FormWorkflow] Submission ${submissionId} created for template "${templateName}" by ${params.submitterName}`);

    return {
      submissionId,
      pipelineDocId,
      status: 'pending_review',
    };
  }

  async getSubmissions(workspaceId: string, filters?: {
    status?: string;
    templateId?: string;
    submittedBy?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<FormSubmission[]> {
    const conditions = [eq(customFormSubmissions.workspaceId, workspaceId)];

    if (filters?.status) {
      conditions.push(eq(customFormSubmissions.status, filters.status));
    }
    if (filters?.templateId) {
      conditions.push(eq(customFormSubmissions.formId, filters.templateId));
    }
    if (filters?.submittedBy) {
      conditions.push(eq(customFormSubmissions.submittedBy, filters.submittedBy));
    }
    if (filters?.dateFrom) {
      conditions.push(gte(customFormSubmissions.createdAt, new Date(filters.dateFrom)));
    }
    if (filters?.dateTo) {
      conditions.push(lte(customFormSubmissions.createdAt, new Date(filters.dateTo)));
    }

    const rows = await db
      .select()
      .from(customFormSubmissions)
      .where(and(...conditions))
      .orderBy(desc(customFormSubmissions.createdAt));

    return rows.map(rowToSubmission);
  }

  async getSubmission(submissionId: string): Promise<FormSubmission | null> {
    const rows = await db
      .select()
      .from(customFormSubmissions)
      .where(eq(customFormSubmissions.id, submissionId))
      .limit(1);

    return rows.length > 0 ? rowToSubmission(rows[0]) : null;
  }

  async reviewSubmission(
    submissionId: string,
    action: 'approve' | 'reject',
    reviewerId: string,
    reviewerName: string,
    notes?: string,
    workspaceId?: string
  ): Promise<FormSubmission | null> {
    const conditions: any[] = [eq(customFormSubmissions.id, submissionId)];
    if (workspaceId) conditions.push(eq(customFormSubmissions.workspaceId, workspaceId));

    const rows = await db
      .select()
      .from(customFormSubmissions)
      .where(and(...conditions))
      .limit(1);

    if (rows.length === 0) return null;

    const row = rows[0];

    // Guard against concurrent approvals — only act on submissions still pending review
    if (row.status !== 'pending_review') {
      log.warn(`[FormWorkflow] Submission ${submissionId} already processed (status: ${row.status}). Returning current state.`);
      return rowToSubmission(row);
    }

    const raw = (row as any).formData || {};
    const existingMeta = raw._meta || {};
    const now = new Date();

    let newStatus: string = action === 'approve' ? 'approved' : 'rejected';

    const updatedMeta = {
      ...existingMeta,
      reviewerId,
      reviewerName,
      reviewNotes: notes,
      reviewedAt: now.toISOString(),
    };

    if (action === 'approve' && existingMeta.pipelineDocId) {
      try {
        await documentPipeline.approveDocument(
          existingMeta.pipelineDocId,
          reviewerId,
          reviewerName
        );
        newStatus = 'completed';
      } catch (err) {
        log.error('[FormWorkflow] Pipeline approval failed:', err);
      }
    }

    await db
      .update(customFormSubmissions)
      .set({
        status: newStatus,
        formData: { ...raw, _meta: updatedMeta },
        updatedAt: now,
      })
      .where(eq(customFormSubmissions.id, submissionId));

    await universalAudit.log({
      workspaceId: row.workspaceId,
      actorId: reviewerId,
      actorType: 'user',
      action: action === 'approve' ? 'approval.granted' : 'approval.denied',
      entityType: 'form_submission',
      entityId: submissionId,
      entityName: existingMeta.templateName || 'Form Submission',
      changeType: 'update',
      metadata: { notes, reviewerName }
    });

    const submission = rowToSubmission({ ...row, status: newStatus, formData: { ...raw, _meta: updatedMeta }, updatedAt: now });

    if (action === 'approve') {
      try {
        await this.saveApprovedFormToLibrary(submission, reviewerId);
      } catch (err) {
        log.error('[FormWorkflow] Failed to save approved form to library:', err);
      }
    }

    log.info(`[FormWorkflow] Submission ${submissionId} ${action}ed by ${reviewerName}`);
    return submission;
  }

  async getPendingReviews(workspaceId: string): Promise<FormSubmission[]> {
    const rows = await db
      .select()
      .from(customFormSubmissions)
      .where(and(
        eq(customFormSubmissions.workspaceId, workspaceId),
        eq(customFormSubmissions.status, 'pending_review')
      ))
      .orderBy(desc(customFormSubmissions.createdAt));

    return rows.map(rowToSubmission);
  }

  getAvailableTemplates(businessCategory?: string): any[] {
    const templates: any[] = [];

    const securityTemplates = systemFormTemplates.security || [];
    for (const t of securityTemplates) {
      templates.push({
        id: `system-security-${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name: t.name,
        description: t.description,
        category: t.category || 'security',
        isSystem: true,
        fields: t.fields,
        requiresPhotos: (t as any).requiresPhotos || false,
        photoInstructions: (t as any).photoInstructions || '',
        minPhotos: (t as any).minPhotos || 0,
        maxPhotos: (t as any).maxPhotos || 0,
      });
    }

    const generalTemplates = (systemFormTemplates as any).general || [];
    for (const t of generalTemplates) {
      templates.push({
        id: `system-general-${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name: t.name,
        description: t.description,
        category: t.category || 'general',
        isSystem: true,
        fields: t.fields,
        requiresPhotos: (t as any).requiresPhotos || false,
        photoInstructions: (t as any).photoInstructions || '',
        minPhotos: (t as any).minPhotos || 0,
        maxPhotos: (t as any).maxPhotos || 0,
      });
    }

    return templates;
  }

  private async saveApprovedFormToLibrary(submission: FormSubmission, reviewerId: string): Promise<void> {
    const formContent = JSON.stringify({
      templateId: submission.templateId,
      templateName: submission.templateName,
      submitterName: submission.submitterName,
      formData: submission.formData,
      photos: submission.photos,
      signatureData: submission.signatureData,
      reviewerName: submission.reviewerName,
      reviewNotes: submission.reviewNotes,
      reviewedAt: submission.reviewedAt,
      pipelineDocId: submission.pipelineDocId,
    });

    const [orgDoc] = await db.insert(orgDocuments).values({
      workspaceId: submission.workspaceId,
      uploadedBy: reviewerId,
      category: 'form',
      fileName: `${submission.templateName} - ${submission.submitterName}.json`,
      filePath: `forms/${submission.workspaceId}/${submission.id}`,
      fileType: 'json',
      description: `Approved form: ${submission.templateName} submitted by ${submission.submitterName}`,
      requiresSignature: false,
    }).returning();

    log.info(`[FormWorkflow] Saved approved form ${submission.id} to org document library as ${orgDoc.id}`);

    try {
      const employees = await db.query.employees.findMany({
        where: (emp, { eq: eqOp, and: andOp }) => andOp(
          eqOp(emp.workspaceId, submission.workspaceId),
          eqOp(emp.userId, submission.submittedBy)
        ),
      });

      if (employees.length > 0) {
        const emp = employees[0];
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(employeeDocuments).values({
          workspaceId: submission.workspaceId,
          employeeId: emp.id,
          documentType: 'custom_form',
          documentName: `${submission.templateName} - Approved`,
          documentDescription: `Completed ${submission.templateName} form, reviewed and approved by ${submission.reviewerName}`,
          fileUrl: `forms/${submission.workspaceId}/${submission.id}`,
          fileType: 'application/json',
          uploadedBy: reviewerId,
          uploadedByRole: 'system',
          uploadedByEmail: 'system@coaileague.com',
          uploadIpAddress: '0.0.0.0',
          status: 'approved',
          approvedBy: reviewerId,
          approvedAt: new Date(),
          isImmutable: true,
          isComplianceDocument: submission.templateCategory === 'security',
          metadata: { sourceFormId: submission.id, templateId: submission.templateId, orgDocId: orgDoc.id },
        });
        log.info(`[FormWorkflow] Saved approved form copy to employee ${emp.id} file cabinet`);

        await createNotification({
          userId: submission.submittedBy,
          workspaceId: submission.workspaceId,
          type: 'document',
          title: 'Form Approved',
          message: `Your "${submission.templateName}" has been approved by ${submission.reviewerName}`,
          priority: 'normal',
          actionUrl: '/employees',
          idempotencyKey: `document-${Date.now()}-${submission.submittedBy}`
        });
      }
    } catch (empErr) {
      log.error('[FormWorkflow] Failed to save form to employee file cabinet:', empErr);
    }
  }

  private findTemplate(templateId: string): any | null {
    const allCategories = Object.values(systemFormTemplates);
    for (const category of allCategories) {
      if (Array.isArray(category)) {
        for (const t of category) {
          const generatedId = `system-${(t as any).category || 'general'}-${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
          if (generatedId === templateId || t.name === templateId) {
            return t;
          }
        }
      }
    }
    return null;
  }
}

export const formWorkflowService = new FormWorkflowService();
log.info('[FormWorkflow] Form workflow service initialized (DB-backed)');
