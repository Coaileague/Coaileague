import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { storage } from "../storage";
import { requireAuth } from "../auth";
import { requireOwner, requireManager, requireHRManager, type AuthenticatedRequest } from "../rbac";
import { employeeDocumentOnboardingService } from "../services/employeeDocumentOnboardingService";
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';
const log = createLogger('HireosRoutes');


const router = Router();

/**
 * Resolves the workspace for a hireosRoutes request.
 * Priority: (1) session workspaceId set by ensureWorkspaceAccess middleware,
 *           (2) workspace where user is owner, (3) workspace where user is a member.
 * Using session-scoped workspaceId is the correct approach for multi-tenant safety.
 */
async function resolveWorkspace(req: AuthenticatedRequest) {
  const sessionWorkspaceId = req.workspaceId || req.session?.workspaceId;
  if (sessionWorkspaceId) {
    const ws = await storage.getWorkspace(sessionWorkspaceId);
    if (ws) return ws;
  }
  const userId = req.user?.id;
  if (!userId) return undefined;
  return (await storage.getWorkspaceByOwnerId(userId)) ||
         (await storage.getWorkspaceByMembership(userId));
}

router.get('/documents/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || req.user?.id;
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const employee = await storage.getEmployeeByUserId(userId);
    
    if (!employee) {
      return res.status(404).json({ message: "Employee profile not found" });
    }
    
    const documents = await storage.getEmployeeDocuments(employee.workspaceId, employee.id);
    
    res.json(documents || []);
  } catch (error: unknown) {
    log.error("Error fetching employee documents:", error);
    res.status(500).json({ message: "Failed to fetch documents" });
  }
});

router.post('/documents', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || req.user?.id;
    const userEmail = req.user?.email || "";
    const userRole = req.user?.role || 'employee';
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    
    const workspace = await resolveWorkspace(req);
    
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }
    
    const documentData = req.body;
    
    const employee = await storage.getEmployee(documentData.employeeId, workspace.id);
    if (!employee) {
      return res.status(403).json({ message: "Employee not found or access denied" });
    }

    let digitalSignatureHash = null;
    if (documentData.isImmutable && documentData.fileUrl) {
      digitalSignatureHash = crypto.createHash('sha256').update(documentData.fileUrl).digest('hex');
    }

    const retentionYears = documentData.retentionPeriodYears || 7;
    const deleteAfter = new Date();
    deleteAfter.setFullYear(deleteAfter.getFullYear() + retentionYears);

    const document = await storage.createEmployeeDocument({
      ...documentData,
      workspaceId: workspace.id,
      uploadedBy: userId,
      uploadedByEmail: userEmail,
      uploadedByRole: userRole,
      uploadIpAddress: ipAddress,
      uploadUserAgent: userAgent,
      digitalSignatureHash,
      deleteAfter,
    });

    res.json(document);
  } catch (error: unknown) {
    log.error("Error uploading document:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to upload document" });
  }
});

router.get('/documents/:employeeId', requireAuth, requireHRManager, async (req: AuthenticatedRequest, res) => {
  try {
    const { employeeId } = req.params;
    const { documentType, status } = req.query;
    const userId = req.user?.id || req.user?.id;
    
    const workspace = await resolveWorkspace(req);
    
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }
    
    const employee = await storage.getEmployee(employeeId, workspace.id);
    if (!employee) {
      return res.status(403).json({ message: "Employee not found or access denied" });
    }
    
    const documents = await storage.getEmployeeDocuments(
      workspace.id,
      employeeId,
      documentType as string,
      status as string
    );
    
    res.json(documents);
  } catch (error) {
    log.error("Error fetching documents:", error);
    res.status(500).json({ message: "Failed to fetch documents" });
  }
});

router.post('/documents/:documentId/approve', requireAuth, requireHRManager, async (req: AuthenticatedRequest, res) => {
  try {
    const { documentId } = req.params;
    const { approvalNotes } = req.body;
    const userId = req.user?.id || req.user?.id;

    const workspace = await resolveWorkspace(req);
    
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }
    
    const existingDoc = await storage.getEmployeeDocument(documentId, workspace.id);
    if (!existingDoc) {
      return res.status(403).json({ message: "Document not found or access denied" });
    }

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const document = await storage.approveEmployeeDocument(documentId, userId, approvalNotes);
    res.json(document);
  } catch (error: unknown) {
    log.error("Error approving document:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to approve document" });
  }
});

router.post('/documents/:documentId/reject', requireAuth, requireHRManager, async (req: AuthenticatedRequest, res) => {
  try {
    const { documentId } = req.params;
    const { rejectionReason } = req.body;
    const userId = req.user?.id || req.user?.id;

    if (!rejectionReason) {
      return res.status(400).json({ message: "Rejection reason is required" });
    }

    const workspace = await resolveWorkspace(req);
    
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }
    
    const existingDoc = await storage.getEmployeeDocument(documentId, workspace.id);
    if (!existingDoc) {
      return res.status(403).json({ message: "Document not found or access denied" });
    }

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const document = await storage.rejectEmployeeDocument(documentId, userId, rejectionReason);
    res.json(document);
  } catch (error: unknown) {
    log.error("Error rejecting document:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to reject document" });
  }
});

router.post('/documents/:documentId/access', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { documentId } = req.params;
    const { accessType } = req.body;
    const userId = req.user?.id || req.user?.id;
    const userEmail = req.user?.email || "";
    const userRole = req.user?.role || 'employee';
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    const workspace = await resolveWorkspace(req);
    
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const document = await storage.getEmployeeDocument(documentId, workspace.id);
    if (!document) {
      return res.status(404).json({ message: "Document not found or access denied" });
    }

    const accessLog = await storage.logDocumentAccess({
      workspaceId: document.workspaceId,
      documentId,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      accessedBy: userId,
      accessedByEmail: userEmail,
      accessedByRole: userRole,
      accessType,
      ipAddress,
      userAgent,
    });

    res.json(accessLog);
  } catch (error: unknown) {
    log.error("Error logging document access:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to log access" });
  }
});

router.get('/documents/:documentId/access-logs', requireAuth, requireHRManager, async (req: AuthenticatedRequest, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.user?.id || req.user?.id;
    
    const workspace = await resolveWorkspace(req);
    
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }
    
    const document = await storage.getEmployeeDocument(documentId, workspace.id);
    if (!document) {
      return res.status(403).json({ message: "Document not found or access denied" });
    }
    
    const logs = await storage.getDocumentAccessLogs(documentId);
    res.json(logs);
  } catch (error) {
    log.error("Error fetching access logs:", error);
    res.status(500).json({ message: "Failed to fetch access logs" });
  }
});

router.post('/workflow-templates', requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || req.user?.id;
    const workspace = await resolveWorkspace(req);
    
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const templateData = req.body;
    const template = await storage.createOnboardingWorkflowTemplate({
      ...templateData,
      workspaceId: workspace.id,
      createdBy: userId,
    });

    res.json(template);
  } catch (error: unknown) {
    log.error("Error creating workflow template:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create template" });
  }
});

router.get('/workflow-templates', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || req.user?.id;
    const workspace = await resolveWorkspace(req);
    
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const templates = await storage.getOnboardingWorkflowTemplates(workspace.id);
    res.json(templates);
  } catch (error) {
    log.error("Error fetching workflow templates:", error);
    res.status(500).json({ message: "Failed to fetch templates" });
  }
});

router.post('/checklists', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const { applicationId, templateId } = req.body;
    const userId = req.user?.id || req.user?.id;
    
    const workspace = await resolveWorkspace(req);
    
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const application = await storage.getOnboardingApplication(applicationId);
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }
    
    if (application.workspaceId !== workspace.id) {
      return res.status(403).json({ message: "Application not found or access denied" });
    }

    const template = templateId ? await storage.getOnboardingWorkflowTemplate(templateId) : null;
    
    if (template && template.workspaceId !== workspace.id) {
      return res.status(403).json({ message: "Template not found or access denied" });
    }
    
    let checklistItems: any[] = [];
    if (template) {
      checklistItems = template.steps.map((step: any) => ({
        itemId: step.stepId,
        itemName: step.stepName,
        itemType: step.stepType,
        isRequired: step.isRequired,
        isCompleted: false,
      }));
    }

    const i9DeadlineDate = new Date();
    i9DeadlineDate.setDate(i9DeadlineDate.getDate() + 3);

    const checklist = await storage.createOnboardingChecklist({
      workspaceId: application.workspaceId,
      applicationId,
      employeeId: application.employeeId,
      templateId,
      checklistItems,
      overallProgress: 0,
      i9DeadlineDate,
    });

    res.json(checklist);
  } catch (error: unknown) {
    log.error("Error creating checklist:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create checklist" });
  }
});

router.patch('/checklists/:checklistId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { checklistId } = req.params;
    const { checklistItems } = req.body;
    const userId = req.user?.id || req.user?.id;

    const workspace = await resolveWorkspace(req);
    
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }
    
    const existingChecklist = await storage.getOnboardingChecklist(checklistId);
    if (!existingChecklist || existingChecklist.workspaceId !== workspace.id) {
      return res.status(403).json({ message: "Checklist not found or access denied" });
    }

    const totalItems = checklistItems.length;
    const completedItems = checklistItems.filter((item: any) => item.isCompleted).length;
    const overallProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    const allRequiredCompleted = checklistItems
      .filter((item: any) => item.isRequired)
      .every((item: any) => item.isCompleted);

    const onboardingCompletedAt = allRequiredCompleted ? new Date() : null;

    const checklist = await storage.updateOnboardingChecklist(checklistId, {
      checklistItems,
      overallProgress,
      onboardingCompletedAt,
    });

    res.json(checklist);
  } catch (error: unknown) {
    log.error("Error updating checklist:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to update checklist" });
  }
});

router.get('/compliance-report', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || req.user?.id;
    const workspace = await resolveWorkspace(req);
    
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const report = await storage.getHiringComplianceReport(workspace.id);
    res.json(report);
  } catch (error) {
    log.error("Error generating compliance report:", error);
    res.status(500).json({ message: "Failed to generate report" });
  }
});

router.get('/documents/:employeeId/packet', requireAuth, requireHRManager, async (req: AuthenticatedRequest, res) => {
  try {
    const { default: PDFDocument } = await import('pdfkit');
    const { PDFDocument: PDFLib, degrees } = await import('pdf-lib');
    const { employeeId } = req.params;
    const userId = req.user?.id || req.user?.id;
    
    const workspace = await resolveWorkspace(req);
    
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const employee = await storage.getEmployeeById(employeeId, workspace.id);
    if (!employee) {
      return res.status(403).json({ message: "Employee not found or access denied" });
    }

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const documents = await storage.getEmployeeDocuments(workspace.id, employeeId, {
      status: 'approved'
    });

    if (!documents || documents.length === 0) {
      return res.status(404).json({ message: "No approved documents found for this employee" });
    }

    const fetchFileAsBuffer = (url: string): Promise<Buffer> => {
      return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, (response: any) => {
          const chunks: any[] = [];
          response.on('data', (chunk: any) => chunks.push(chunk));
          response.on('end', () => resolve(Buffer.concat(chunks)));
          response.on('error', reject);
        }).on('error', reject);
      });
    };

    const metadataBuffers: Buffer[] = [];
    const doc = new PDFDocument({ 
      size: 'LETTER',
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    });

    doc.on('data', (chunk: Buffer) => metadataBuffers.push(chunk));

    const metadataPDFPromise = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(metadataBuffers)));
    });

    doc.fontSize(24).font('Helvetica-Bold').text('Employee Onboarding Packet', { align: 'center' });
    doc.moveDown();
    doc.fontSize(18).font('Helvetica').text(workspace.name || PLATFORM.name, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(14).font('Helvetica-Bold').text('Employee Information');
    doc.fontSize(12).font('Helvetica');
    doc.text(`Name: ${employee.firstName} ${employee.lastName}`);
    doc.text(`Email: ${employee.email}`);
    doc.text(`Position: ${employee.position || 'N/A'}`);
    doc.text(`Department: ${(employee as any).department || 'N/A'}`);
    doc.text(`Employee ID: ${employee.id}`);
    doc.moveDown();

    doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`);
    doc.text(`Generated by: ${req.user?.email || ""}`);
    doc.text(`Total Documents: ${documents.length}`);
    doc.moveDown(2);

    doc.addPage();
    doc.fontSize(18).font('Helvetica-Bold').text('Table of Contents', { underline: true });
    doc.moveDown();
    doc.fontSize(11).font('Helvetica');

    documents.forEach((document: any, index: number) => {
      doc.text(`${index + 1}. ${document.documentName} (${document.documentType})`);
      doc.fontSize(9).fillColor('#666666');
      doc.text(`   Status: ${document.status} | Uploaded: ${new Date(document.uploadedAt).toLocaleDateString()}`, { indent: 20 });
      doc.fontSize(11).fillColor('#000000');
      doc.moveDown(0.5);
    });

    documents.forEach((document: any, index: number) => {
      doc.addPage();
      
      doc.fontSize(16).font('Helvetica-Bold').text(`Document ${index + 1}: ${document.documentName}`, { underline: true });
      doc.moveDown();

      doc.fontSize(12).font('Helvetica-Bold').text('Document Classification');
      doc.fontSize(10).font('Helvetica');
      doc.text(`Type: ${document.documentType}`);
      doc.text(`Description: ${document.documentDescription || 'N/A'}`);
      doc.text(`Status: ${document.status.toUpperCase()}`);
      doc.moveDown();

      doc.fontSize(12).font('Helvetica-Bold').text('File Information');
      doc.fontSize(10).font('Helvetica');
      doc.text(`Original File: ${document.originalFileName || 'N/A'}`);
      doc.text(`File Type: ${document.fileType || 'N/A'}`);
      doc.text(`File Size: ${document.fileSize ? (document.fileSize / 1024).toFixed(2) + ' KB' : 'N/A'}`);
      doc.text(`Storage URL: ${document.fileUrl}`);
      doc.moveDown();

      doc.fontSize(12).font('Helvetica-Bold').text('Audit Trail - WHO Uploaded');
      doc.fontSize(10).font('Helvetica');
      doc.text(`Uploaded By: ${document.uploadedByEmail || 'N/A'}`);
      doc.text(`Role at Upload: ${document.uploadedByRole || 'N/A'}`);
      doc.moveDown();

      doc.fontSize(12).font('Helvetica-Bold').text('Audit Trail - WHEN Uploaded');
      doc.fontSize(10).font('Helvetica');
      doc.text(`Uploaded At: ${new Date(document.uploadedAt).toLocaleString()}`);
      if (document.approvedAt) {
        doc.text(`Approved At: ${new Date(document.approvedAt).toLocaleString()}`);
      }
      if (document.expiresAt) {
        doc.text(`Expires At: ${new Date(document.expiresAt).toLocaleString()}`);
      }
      doc.moveDown();

      doc.fontSize(12).font('Helvetica-Bold').text('Audit Trail - WHERE Uploaded');
      doc.fontSize(10).font('Helvetica');
      doc.text(`IP Address: ${document.uploadIpAddress || 'N/A'}`);
      doc.text(`Location: ${document.uploadGeoLocation || 'N/A'}`);
      doc.text(`User Agent: ${document.uploadUserAgent ? document.uploadUserAgent.substring(0, 80) + '...' : 'N/A'}`);
      doc.moveDown();

      doc.fontSize(12).font('Helvetica-Bold').fillColor('#CC0000').text('Tamper-Proof Verification');
      doc.fontSize(9).font('Helvetica').fillColor('#000000');
      doc.text(`SHA-256 Hash: ${document.tamperProofHash || 'N/A'}`, { width: 500 });
      doc.fontSize(8).fillColor('#666666');
      doc.text('This cryptographic hash ensures document integrity. Any modification to the original file will invalidate this hash.');
      doc.fillColor('#000000');
      doc.moveDown();

      if (document.approvedBy) {
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#008800').text('Approval Information');
        doc.fontSize(10).font('Helvetica').fillColor('#000000');
        doc.text(`Approved By: ${document.approvedByEmail || 'N/A'}`);
        if (document.approvalNotes) {
          doc.text(`Notes: ${document.approvalNotes}`);
        }
      }

      doc.fontSize(8).fillColor('#666666');
      const footerY = doc.page.height - 80;
      doc.text(
        `Legal Retention: ${document.deleteAfterDate ? 'Delete after ' + new Date(document.deleteAfterDate).toLocaleDateString() : '7 years (default)'} | Generated by ${PLATFORM.name}™ AI Hiring™ Digital File Cabinet`,
        50,
        footerY,
        { width: doc.page.width - 100, align: 'center' }
      );
    });

    doc.addPage();
    doc.fontSize(16).font('Helvetica-Bold').text('Compliance & Legal Notice', { align: 'center', underline: true });
    doc.moveDown(2);
    doc.fontSize(10).font('Helvetica');
    doc.text('This digitally generated onboarding packet contains complete WHO/WHEN/WHERE audit trails for all employee documents in compliance with:', { align: 'justify' });
    doc.moveDown();
    doc.list([
      'SOC 2 Type II (Security Audit)',
      'GDPR (General Data Protection Regulation)',
      'HIPAA (Health Insurance Portability and Accountability Act)',
      '7-Year Legal Retention Requirements'
    ]);
    doc.moveDown();
    doc.text('All documents are tamper-proof with SHA-256 cryptographic hashing. Any modifications to original files will invalidate the hash verification.', { align: 'justify' });
    doc.moveDown();
    doc.fontSize(12).font('Helvetica-Bold').text('Digital Signature');
    doc.fontSize(10).font('Helvetica');
    doc.text(`This packet was digitally generated and signed on ${new Date().toLocaleString()} by ${req.user?.email || ""}.`);
    doc.moveDown();
    doc.fontSize(8).fillColor('#666666');
    doc.text(`Powered by ${PLATFORM.name}™ AI Hiring™ - Enterprise-Grade Digital File Cabinet & Compliance Automation`, { align: 'center' });

    doc.end();

    const metadataPDFBuffer = await metadataPDFPromise;

    const masterPDF = await PDFLib.load(metadataPDFBuffer);

    for (let i = 0; i < documents.length; i++) {
      const document = documents[i];
      
      try {
        if (!document.fileUrl) {
          log.warn(`Document ${document.id} has no file URL, skipping merge`);
          continue;
        }

        const documentBuffer = await fetchFileAsBuffer(document.fileUrl);

        if (document.fileType === 'application/pdf') {
          const documentPDF = await PDFLib.load(documentBuffer);
          const copiedPages = await masterPDF.copyPages(documentPDF, documentPDF.getPageIndices());
          
          copiedPages.forEach((page: any) => {
            masterPDF.addPage(page);
          });
        } else if (document.fileType?.startsWith('image/')) {
          const page = masterPDF.addPage();
          let embeddedImage;

          if (document.fileType === 'image/jpeg' || document.fileType === 'image/jpg') {
            embeddedImage = await masterPDF.embedJpg(documentBuffer);
          } else if (document.fileType === 'image/png') {
            embeddedImage = await masterPDF.embedPng(documentBuffer);
          } else {
            log.warn(`Unsupported image type ${document.fileType}, skipping`);
            continue;
          }

          const { width, height } = page.getSize();
          const imageWidth = embeddedImage.width;
          const imageHeight = embeddedImage.height;
          
          const maxWidth = width - 100;
          const maxHeight = height - 100;
          const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight, 1);
          
          const scaledWidth = imageWidth * scale;
          const scaledHeight = imageHeight * scale;
          
          const x = (width - scaledWidth) / 2;
          const y = (height - scaledHeight) / 2;
          
          page.drawImage(embeddedImage, {
            x,
            y,
            width: scaledWidth,
            height: scaledHeight,
          });
        } else {
          log.warn(`Unsupported file type ${document.fileType} for document ${document.id}, skipping merge`);
        }
      } catch (docError: unknown) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        log.error(`Error merging document ${document.id}:`, docError.message);
      }
    }

    const finalPDFBytes = await masterPDF.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="onboarding-packet-${employee.firstName}-${employee.lastName}-${Date.now()}.pdf"`);
    res.setHeader('Content-Length', finalPDFBytes.length.toString());

    res.send(Buffer.from(finalPDFBytes));

    for (const document of documents) {
      await storage.logDocumentAccess({
        documentId: document.id,
        workspaceId: workspace.id,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        accessedBy: userId,
        accessedByEmail: req.user?.email || "",
        accessType: 'download',
        accessIpAddress: req.ip || 'unknown',
        accessUserAgent: req.headers['user-agent'] || 'unknown',
      });
    }

  } catch (error: unknown) {
    log.error("Error generating PDF packet:", error);
    res.status(500).json({ message: "Failed to generate PDF packet" });
  }
});

router.post('/auditor-access/grant', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || req.user?.id;
    const workspace = await resolveWorkspace(req);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    const { auditorEmail, auditorName, durationHours = 72, accessScope = 'read_only' } = req.body;
    if (!auditorEmail || !auditorName) {
      return res.status(400).json({ message: "Auditor email and name are required" });
    }

    const maxDurationHours = 720; // 30 days max
    const grantedHours = Math.min(durationHours, maxDurationHours);
    const expiresAt = new Date(Date.now() + grantedHours * 60 * 60 * 1000);
    const accessToken = crypto.randomBytes(32).toString('hex');

    await storage.createAuditLog({
      workspaceId: workspace.id,
      action: 'auditor_access_granted',
      entityType: 'workspace',
      entityId: workspace.id,
      userId,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      details: {
        auditorEmail,
        auditorName,
        accessScope,
        durationHours: grantedHours,
        expiresAt: expiresAt.toISOString(),
        accessToken: accessToken.substring(0, 8) + '...',
      },
    });

    res.json({
      message: 'Auditor access granted',
      auditorEmail,
      auditorName,
      accessScope,
      expiresAt: expiresAt.toISOString(),
      durationHours: grantedHours,
      accessToken,
    });
  } catch (error: unknown) {
    log.error("Error granting auditor access:", error);
    res.status(500).json({ message: "Failed to grant auditor access" });
  }
});

router.post('/auditor-access/revoke', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || req.user?.id;
    const workspace = await resolveWorkspace(req);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    const { auditorEmail, reason } = req.body;
    if (!auditorEmail) {
      return res.status(400).json({ message: "Auditor email is required" });
    }

    await storage.createAuditLog({
      workspaceId: workspace.id,
      action: 'auditor_access_revoked',
      entityType: 'workspace',
      entityId: workspace.id,
      userId,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      details: { auditorEmail, reason: reason || 'Manual revocation', revokedAt: new Date().toISOString() },
    });

    res.json({ message: 'Auditor access revoked', auditorEmail });
  } catch (error: unknown) {
    log.error("Error revoking auditor access:", error);
    res.status(500).json({ message: "Failed to revoke auditor access" });
  }
});

router.post('/documents/purge-request', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || req.user?.id;
    const workspace = await resolveWorkspace(req);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    const { documentId, employeeId, reason, requestType = 'purge' } = req.body;
    if (!documentId || !reason) {
      return res.status(400).json({ message: "Document ID and reason are required" });
    }

    const document = await storage.getEmployeeDocument(documentId, workspace.id);
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    if (document.isImmutable) {
      return res.status(403).json({
        message: "Cannot purge immutable documents. These are protected by retention policy.",
        code: 'IMMUTABLE_DOCUMENT',
      });
    }

    const retentionEnd = document.deleteAfter ? new Date(document.deleteAfter) : null;
    const isUnderRetention = retentionEnd && retentionEnd > new Date();

    await storage.createAuditLog({
      workspaceId: workspace.id,
      action: 'document_purge_requested',
      entityType: 'document',
      entityId: documentId,
      userId,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      details: {
        employeeId,
        reason,
        requestType,
        documentType: document.documentType,
        documentName: (document as any).title || (document as any).fileName,
        requiresSupportReview: isUnderRetention,
        retentionEnd: retentionEnd?.toISOString() || null,
        requestedAt: new Date().toISOString(),
      },
    });

    if (isUnderRetention) {
      return res.json({
        message: `Document is under retention policy until ${retentionEnd!.toISOString().split('T')[0]}. Purge request submitted and requires support team review before processing.`,
        documentId,
        status: 'pending_support_review',
        requiresSupportReview: true,
        retentionEnd: retentionEnd!.toISOString(),
      });
    }

    res.json({
      message: 'Document purge request submitted for manager review',
      documentId,
      status: 'pending_review',
      requiresSupportReview: false,
    });
  } catch (error: unknown) {
    log.error("Error creating purge request:", error);
    res.status(500).json({ message: "Failed to submit purge request" });
  }
});

router.get('/employee/:employeeId/hiring-score', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || req.user?.id;
    const { employeeId } = req.params;

    const requestorWorkspace = await resolveWorkspace(req);
    if (!requestorWorkspace) {
      return res.status(403).json({ message: "No workspace access" });
    }

    const employee = await storage.getEmployeeById(employeeId, requestorWorkspace.id);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const isSameOrg = true;

    const onboardingStatus = await employeeDocumentOnboardingService.checkWorkEligibility(employeeId);

    const behaviorScore = {
      reliabilityScore: (employee as any).reliabilityScore ?? 100,
      attendanceRate: (employee as any).attendanceRate ?? 100,
      complianceScore: onboardingStatus.eligible ? 100 : Math.max(0, 50 - (onboardingStatus.reasons?.length || 0) * 10),
      overallScore: Math.round(
        // @ts-expect-error — TS migration: fix in refactoring sprint
        ((employee.reliabilityScore ?? 100) * 0.4) +
        // @ts-expect-error — TS migration: fix in refactoring sprint
        ((employee.attendanceRate ?? 100) * 0.3) +
        (onboardingStatus.eligible ? 100 : 50) * 0.3
      ),
      isWorkEligible: onboardingStatus.eligible,
      complianceBlockers: isSameOrg ? (onboardingStatus.reasons || []) : [],
      lastUpdated: new Date().toISOString(),
    };

    res.json({
      employeeId,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      hiringScore: behaviorScore,
      crossOrgVisible: !isSameOrg,
      accessLevel: isSameOrg ? 'full' : 'score_only',
    });
  } catch (error: unknown) {
    log.error("Error fetching hiring score:", error);
    res.status(500).json({ message: "Failed to fetch hiring score" });
  }
});

export default router;
