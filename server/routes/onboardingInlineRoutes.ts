import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { idempotencyMiddleware } from "../middleware/idempotency";
import { mutationLimiter } from '../middleware/rateLimiter';
import { eq, and, gt, sql } from 'drizzle-orm';
import { storage } from '../storage';
import { db } from '../db';
import { documentSignatures, userOnboarding, onboardingInvites, employees, onboardingApplications, orgCreationProgress } from '@shared/schema';
import crypto from 'crypto';
import type { AuthenticatedRequest } from '../rbac';
import { requireManager } from '../rbac';
import { requireAuth } from '../auth';
import {
  sendOnboardingInviteEmail,
} from '../services/emailCore';
import { typedExec, typedQuery } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
import { scheduleNonBlocking } from '../lib/scheduleNonBlocking';
const log = createLogger('OnboardingInlineRoutes');


const router = Router();

const publicOnboardingPaths = [
  '/invite/',        // GET /invite/:token (token lookup)
  '/application',    // POST /application (submit), GET /application/:id, PATCH /application/:id
  '/signatures',     // POST /signatures, GET /signatures/:applicationId
  '/certifications', // POST /certifications, GET /certifications/:applicationId
  '/documents',      // POST upload-url/confirm, GET /:applicationId
  '/contracts/',     // GET /contracts/:applicationId, POST /contracts/:contractId/sign
  '/status',         // GET /status
  '/migration-capabilities', // GET
];

router.use((req, res, next) => {
  const path = req.path;
  if (path.startsWith('/invite/') && req.method === 'GET') return next();
  if (path === '/invite/' || (path.match(/^\/invite\/[^/]+\/opened$/) && req.method === 'POST')) return next();
  if (path.startsWith('/application')) return next();
  if (path.startsWith('/signatures')) return next();
  if (path.startsWith('/certifications')) return next();
  if (path.startsWith('/documents')) return next();
  if (path.startsWith('/contracts')) return next();
  if (path.startsWith('/submit/')) return next();
  if (path === '/status' && req.method === 'GET') return next();
  if (path === '/migration-capabilities' && req.method === 'GET') return next();
  return requireAuth(req, res, next);
});

router.post('/invite', mutationLimiter, idempotencyMiddleware, requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.user?.id || req.user?.id;

    const { email, firstName, lastName, role, workspaceRole, position, offeredPayRate } = req.body;

    if (!email || !firstName || !lastName) {
      return res.status(400).json({ message: "Email, first name, and last name are required" });
    }

    // ── Invite role gate ─────────────────────────────────────────────────────
    // org_owner / co_owner can invite into supervisor-and-above roles.
    // All other managers (org_admin and below) may only invite into staff-tier roles.
    // Nobody may invite into org_owner or co_owner — those are assigned directly.
    const STAFF_TIER_ROLES   = ['staff', 'employee', 'officer', 'contractor', 'auditor', 'dispatcher'];
    const OWNER_TIER_ROLES   = ['supervisor', 'manager', 'department_manager', 'org_manager', 'hr_manager', 'finance_manager', 'field_supervisor'];
    const PROTECTED_ROLES    = ['org_owner', 'co_owner', 'org_admin'];

    const requestedRole = workspaceRole || 'staff';

    if (PROTECTED_ROLES.includes(requestedRole)) {
      return res.status(403).json({ message: "Ownership-tier roles cannot be granted via invite. Contact platform support." });
    }

    if (OWNER_TIER_ROLES.includes(requestedRole)) {
      // Fetch the inviter's actual workspace role to enforce the ownership gate
      const inviterEmployee = await storage.getEmployeeByUserId(userId, workspaceId);
      const inviterRole = inviterEmployee?.workspaceRole as string;
      const isOwner = ['org_owner', 'co_owner'].includes(inviterRole);
      if (!isOwner) {
        return res.status(403).json({
          message: `Only organization owners can invite someone as ${requestedRole}. Contact your org owner.`,
          code: 'OWNER_ROLE_GATE',
        });
      }
    }

    if (!STAFF_TIER_ROLES.includes(requestedRole) && !OWNER_TIER_ROLES.includes(requestedRole)) {
      return res.status(403).json({ message: "You do not have permission to grant this role" });
    }

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const workspace = await storage.getWorkspace(workspaceId);

    const invite = await storage.createOnboardingInvite({
      workspaceId,
      email,
      firstName,
      lastName,
      role: role || null,
      workspaceRole: requestedRole,
      position: position || null,
      offeredPayRate: offeredPayRate ? String(offeredPayRate) : null,
      inviteToken,
      expiresAt,
      sentBy: userId,
    } as any);

    const protocol = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
    const host = process.env.NODE_ENV === 'production'
      ? req.get('host')
      : (process.env.REPL_SLUG ? `${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : req.get('host'));
    const onboardingUrl = `${protocol}://${host}/onboarding/${inviteToken}`;

    await sendOnboardingInviteEmail(email, {
      employeeName: `${firstName} ${lastName}`,
      workspaceName: workspace?.name || 'Our Team',
      onboardingUrl,
      expiresIn: '7 days',
    });

    res.json(invite);
  } catch (error: unknown) {
    log.error("Error creating onboarding invite:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create invite" });
  }
});

router.get('/invite/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const invite = await storage.getOnboardingInviteByToken(token);

    if (!invite) {
      return res.status(404).json({ message: "Invite not found" });
    }

    if (invite.isUsed) {
      return res.status(400).json({ message: "Invite has already been used" });
    }

    if (new Date() > new Date(invite.expiresAt)) {
      return res.status(400).json({ message: "Invite has expired" });
    }

    res.json(invite);
  } catch (error) {
    log.error("Error fetching invite:", error);
    res.status(500).json({ message: "Failed to fetch invite" });
  }
});

router.get('/invites', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const invites = await storage.getOnboardingInvitesByWorkspace(workspaceId);
    res.json(invites);
  } catch (error) {
    log.error("Error fetching invites:", error);
    res.status(500).json({ message: "Failed to fetch invites" });
  }
});

router.post('/invite/:id/resend', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;

    const invite = await storage.getInviteById(id);

    if (!invite) {
      return res.status(404).json({ message: 'Invite not found' });
    }

    if (invite.workspaceId !== workspaceId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (invite.isUsed) {
      return res.status(400).json({ message: 'Invite has already been used' });
    }

    const newToken = crypto.randomBytes(32).toString('hex');
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const updatedInvite = await storage.resendInvite(id, newToken, newExpiresAt);

    if (!updatedInvite) {
      return res.status(500).json({ message: 'Failed to resend invite' });
    }

    const workspace = await storage.getWorkspace(workspaceId);
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
    const host = process.env.NODE_ENV === 'production'
      ? req.get('host')
      : (process.env.REPL_SLUG ? `${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : req.get('host'));
    const onboardingUrl = `${protocol}://${host}/onboarding/${newToken}`;

    await sendOnboardingInviteEmail(updatedInvite.email, {
      employeeName: `${updatedInvite.firstName} ${updatedInvite.lastName}`,
      workspaceName: workspace?.name || 'Our Team',
      onboardingUrl,
      expiresIn: '7 days',
    });

    const { broadcastPlatformUpdateGlobal } = await import('../websocket');
    broadcastPlatformUpdateGlobal({
      type: 'invite_resent',
      title: 'Invitation Resent',
      message: `Invitation resent to ${updatedInvite.email}`,
      workspaceId,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Invitation resent successfully',
      invite: updatedInvite
    });
  } catch (error: unknown) {
    log.error('Error resending invite:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to resend invite' });
  }
});

router.post('/invite/:id/revoke', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;

    const invite = await storage.getInviteById(id);

    if (!invite) {
      return res.status(404).json({ message: 'Invite not found' });
    }

    if (invite.workspaceId !== workspaceId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (invite.isUsed) {
      return res.status(400).json({ message: 'Cannot revoke a used invite' });
    }

    const revokedInvite = await storage.revokeInvite(id);

    if (!revokedInvite) {
      return res.status(500).json({ message: 'Failed to revoke invite' });
    }

    res.json({
      success: true,
      message: 'Invitation revoked successfully',
      invite: revokedInvite
    });
  } catch (error: unknown) {
    log.error('Error revoking invite:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to revoke invite' });
  }
});

router.post('/invite/:token/opened', async (req, res) => {
  try {
    const { token } = req.params;
    const invite = await storage.getOnboardingInviteByToken(token);

    if (!invite) {
      return res.status(404).json({ message: 'Invite not found' });
    }

    if (!invite.isUsed && invite.status !== 'opened' && invite.status !== 'accepted') {
      await db.update(onboardingInvites)
        .set({ status: 'opened', updatedAt: new Date() })
        .where(eq(onboardingInvites.id, invite.id));
    }

    res.json({ success: true });
  } catch (error) {
    log.error('Error marking invite as opened:', error);
    res.status(500).json({ message: 'Failed to mark invite as opened' });
  }
});

router.get('/invites/status/:status', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { status } = req.params;

    const validStatuses = ['sent', 'opened', 'accepted', 'expired', 'revoked'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
    }

    const invites = await storage.getInvitesByStatus(workspaceId, status);
    res.json(invites);
  } catch (error) {
    log.error('Error fetching invites by status:', error);
    res.status(500).json({ message: 'Failed to fetch invites' });
  }
});

router.get('/invites/stats', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const invites = await storage.getOnboardingInvitesByWorkspace(workspaceId);

    const stats = {
      total: invites.length,
      sent: invites.filter(i => i.status === 'sent').length,
      opened: invites.filter(i => i.status === 'opened').length,
      accepted: invites.filter(i => i.status === 'accepted' || i.isUsed).length,
      expired: invites.filter(i => i.status === 'expired' || (i.expiresAt && new Date(i.expiresAt) < new Date() && !i.isUsed)).length,
      revoked: invites.filter(i => i.status === 'revoked').length,
      pendingCount: invites.filter(i => !i.isUsed && i.status !== 'revoked' && i.status !== 'expired').length,
    };

    res.json(stats);
  } catch (error) {
    log.error('Error fetching invite stats:', error);
    res.status(500).json({ message: 'Failed to fetch invite statistics' });
  }
});

router.post('/application', async (req, res) => {
  try {
    const { inviteToken, ...applicationData } = req.body;

    if (!inviteToken) {
      return res.status(400).json({ message: "Invite token is required" });
    }

    // G15 FIX: Atomic invite token claim — prevents two simultaneous submissions
    // from both passing the isUsed=false check and each creating a separate
    // onboarding application. The UPDATE only succeeds for one concurrent request;
    // any other request with the same token gets 0 rows back and is rejected.
    const now = new Date();
    const [claimedInvite] = await db
      .update(onboardingInvites)
      .set({ isUsed: true, acceptedAt: now, updatedAt: now, status: 'accepted' })
      .where(
        and(
          eq(onboardingInvites.inviteToken, inviteToken),
          eq(onboardingInvites.isUsed, false),
          gt(onboardingInvites.expiresAt, now)
        )
      )
      .returning();

    if (!claimedInvite) {
      return res.status(400).json({ message: "Invalid, expired, or already used invite" });
    }

    const employeeNumber = await storage.generateEmployeeNumber(claimedInvite.workspaceId);

    const application = await storage.createOnboardingApplication({
      workspaceId: claimedInvite.workspaceId,
      inviteId: claimedInvite.id,
      firstName: applicationData.firstName || claimedInvite.firstName,
      lastName: applicationData.lastName || claimedInvite.lastName,
      email: applicationData.email || claimedInvite.email,
      employeeNumber,
      currentStep: 'personal_info',
      status: 'in_progress',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      ...applicationData,
    });

    res.json(application);
  } catch (error: unknown) {
    log.error("Error creating application:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create application" });
  }
});

router.get('/application/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const workspaceId = req.query.workspaceId as string;

    if (!workspaceId) {
      return res.status(400).json({ message: "Workspace ID is required" });
    }

    const application = await storage.getOnboardingApplication(id, workspaceId);

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    res.json(application);
  } catch (error) {
    log.error("Error fetching application:", error);
    res.status(500).json({ message: "Failed to fetch application" });
  }
});

router.patch('/application/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { workspaceId, ...updateData } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ message: "Workspace ID is required" });
    }

    const updated = await storage.updateOnboardingApplication(id, workspaceId, updateData);

    if (!updated) {
      return res.status(404).json({ message: "Application not found" });
    }

    res.json(updated);
  } catch (error: unknown) {
    log.error("Error updating application:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to update application" });
  }
});

router.get('/applications', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const applications = await storage.getOnboardingApplicationsByWorkspace(workspaceId);
    res.json(applications);
  } catch (error) {
    log.error("Error fetching applications:", error);
    res.status(500).json({ message: "Failed to fetch applications" });
  }
});

router.post('/signatures', async (req, res) => {
  try {
    const signatureData = req.body;

    const signature = await storage.createDocumentSignature({
      ...signatureData,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      signedAt: new Date(),
    });

    res.json(signature);
  } catch (error: unknown) {
    log.error("Error creating signature:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create signature" });
  }
});

router.get('/signatures/:applicationId', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const signatures = await storage.getDocumentSignaturesByApplication(applicationId);
    res.json(signatures);
  } catch (error) {
    log.error("Error fetching signatures:", error);
    res.status(500).json({ message: "Failed to fetch signatures" });
  }
});

router.post('/certifications', async (req, res) => {
  try {
    const certificationData = req.body;
    const certification = await storage.createEmployeeCertification(certificationData);
    res.json(certification);
  } catch (error: unknown) {
    log.error("Error creating certification:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create certification" });
  }
});

router.get('/certifications/:applicationId', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const certifications = await storage.getEmployeeCertificationsByApplication(applicationId);
    res.json(certifications);
  } catch (error) {
    log.error("Error fetching certifications:", error);
    res.status(500).json({ message: "Failed to fetch certifications" });
  }
});

router.post('/documents/upload-url', async (req, res) => {
  try {
    const { applicationId, workspaceId, documentType, fileName, fileType, fileSize } = req.body;

    if (!applicationId || !workspaceId || !documentType || !fileName || !fileType) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const maxSizeBytes = 15 * 1024 * 1024;
    if (fileSize && fileSize > maxSizeBytes) {
      return res.status(400).json({ message: "File size exceeds 15MB limit" });
    }

    const application = await storage.getOnboardingApplication(applicationId, workspaceId);
    if (!application) {
      return res.status(404).json({ message: "Application not found or access denied" });
    }

    if (application.inviteId) {
      const invite = await storage.getOnboardingInvite(application.inviteId);
      if (!invite || new Date() > new Date(invite.expiresAt)) {
        return res.status(400).json({ message: "Invitation has expired" });
      }
    }

    const sanitizedFileName = fileName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .substring(0, 255);

    const timestamp = Date.now();
    const fileExtension = sanitizedFileName.split('.').pop();
    const objectPath = `onboarding/${workspaceId}/${applicationId}/${documentType}_${timestamp}.${fileExtension}`;

    const { ObjectStorageService } = await import('../objectStorage');
    const objectStorage = new ObjectStorageService();
    const privateDir = objectStorage.getPrivateObjectDir();
    const fullPath = `${privateDir}/${objectPath}`;

    const uploadUrl = await objectStorage.generateSignedUploadUrl(
      fullPath,
      fileType,
      60 * 5
    );

    res.json({
      uploadUrl,
      filePath: fullPath,
      documentType,
      fileName: sanitizedFileName,
    });
  } catch (error: unknown) {
    log.error("Error generating upload URL:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to generate upload URL" });
  }
});

router.post('/documents/confirm', async (req, res) => {
  try {
    const { applicationId, workspaceId, filePath, documentType, fileName, fileType, fileSize } = req.body;

    if (!applicationId || !workspaceId || !filePath || !documentType) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const application = await storage.getOnboardingApplication(applicationId, workspaceId);
    if (!application) {
      return res.status(404).json({ message: "Application not found or access denied" });
    }

    let employeeId = application.employeeId;
    if (!employeeId) {
      employeeId = await db.transaction(async (tx) => {
        let inviteRole: string | null = null;
        let inviteWorkspaceRole: string | null = null;
        if (application.inviteId) {
          const [invite] = await tx.select().from(onboardingInvites).where(eq(onboardingInvites.id, application.inviteId)).limit(1);
          if (invite) {
            inviteRole = invite.role || null;
            inviteWorkspaceRole = invite.workspaceRole || 'staff';
          }
        }

        const [employee] = await tx.insert(employees).values({
          workspaceId,
          firstName: application.firstName,
          lastName: application.lastName,
          email: application.email,
          phone: application.phone,
          employeeNumber: application.employeeNumber,
          role: inviteRole,
          workspaceRole: (inviteWorkspaceRole as any) || 'staff',
          onboardingStatus: 'in_progress',
        }).returning();

        await tx.update(onboardingApplications).set({
          employeeId: employee.id,
          updatedAt: new Date(),
        }).where(eq(onboardingApplications.id, applicationId));

        return employee.id;
      });

      const { eventBus } = await import('../services/eventBus');
      const onboardingPayload = {
        employeeId,
        workspaceId,
        source: 'onboarding_application',
      };
      eventBus.emit('employee_created', onboardingPayload);
      eventBus.publish({ 
        type: 'employee_hired', 
        category: 'automation', 
        title: 'Employee Hired via Onboarding', 
        description: `New employee hired via onboarding application`, 
        workspaceId, 
        metadata: onboardingPayload 
      });
    }

    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    const isComplianceDoc = ['government_id', 'i9_form', 'w4_form', 'w9_form', 'ssn_card'].includes(documentType);
    let digitalSignatureHash = null;
    if (isComplianceDoc) {
      digitalSignatureHash = crypto.createHash('sha256').update(filePath + Date.now()).digest('hex');
    }

    const retentionYears = isComplianceDoc ? 7 : 3;
    const deleteAfter = new Date();
    deleteAfter.setFullYear(deleteAfter.getFullYear() + retentionYears);

    const document = await storage.createEmployeeDocument({
      workspaceId,
      employeeId,
      applicationId,
      documentType,
      documentName: fileName || documentType,
      fileUrl: filePath,
      fileSize,
      fileType,
      originalFileName: fileName,
      uploadedBy: application.employeeId || null,
      uploadedByEmail: application.email,
      uploadedByRole: 'employee',
      uploadIpAddress: ipAddress,
      uploadUserAgent: userAgent,
      status: 'uploaded',
      isComplianceDocument: isComplianceDoc,
      retentionPeriodYears: retentionYears,
      digitalSignatureHash,
      deleteAfter,
      isImmutable: isComplianceDoc,
    });

    res.json(document);
  } catch (error: unknown) {
    log.error("Error confirming document upload:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to confirm upload" });
  }
});

router.get('/documents/:applicationId', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { workspaceId } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ message: "Workspace ID is required" });
    }

    const application = await storage.getOnboardingApplication(applicationId, workspaceId as string);
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    const { employeeDocuments } = await import('@shared/schema');
    const documents = await db
      .select()
      .from(employeeDocuments)
      .where(
        and(
          eq(employeeDocuments.applicationId, applicationId),
          eq(employeeDocuments.workspaceId, workspaceId as string)
        )
      );

    res.json(documents);
  } catch (error) {
    log.error("Error fetching onboarding documents:", error);
    res.status(500).json({ message: "Failed to fetch documents" });
  }
});

router.get('/contracts/:applicationId', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { workspaceId } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ message: "Workspace ID is required" });
    }

    const application = await storage.getOnboardingApplication(applicationId, workspaceId as string);
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    let contracts = await db
      .select()
      .from(documentSignatures)
      .where(
        and(
          eq(documentSignatures.applicationId, applicationId),
          eq(documentSignatures.workspaceId, workspaceId as string)
        )
      )
      .orderBy(documentSignatures.createdAt);

    if (contracts.length === 0) {
      const isW4Employee = application.taxClassification === 'w4_employee';
      const isW9Contractor = application.taxClassification === 'w9_contractor';

      const contractsToCreate: any[] = [];

      const workspace = await storage.getWorkspace(workspaceId as string);
      const orgName = workspace?.name || 'The Organization';
      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      contractsToCreate.push({
        workspaceId: workspaceId as string,
        applicationId,
        documentType: 'employee_contract',
        documentTitle: 'Employment Agreement',
        documentContent: `EMPLOYMENT AGREEMENT

This Employment Agreement ("Agreement") is entered into as of ${today}, between ${orgName} ("Employer") and ${application.firstName} ${application.lastName} ("Employee").

1. EMPLOYMENT. Employer hereby agrees to employ Employee, and Employee hereby accepts employment with Employer, upon the terms and conditions set forth in this Agreement. Employment begins on the start date confirmed during onboarding.

2. POSITION AND DUTIES. Employee shall serve in the role as outlined in their offer letter, subject to such reasonable changes as Employer may determine from time to time. Employee shall devote full attention and time to the business and affairs of Employer and shall perform the duties assigned in a professional and diligent manner.

3. AT-WILL EMPLOYMENT. Employee's employment with Employer is at-will, meaning either Employee or Employer may terminate the employment relationship at any time, with or without cause or advance notice.

4. COMPENSATION. Employee shall receive compensation as outlined in the offer letter. Employer reserves the right to adjust compensation in accordance with company compensation policies.

5. CONFIDENTIALITY. During the term of employment and thereafter, Employee agrees to maintain strict confidentiality of all Employer's proprietary information, trade secrets, client information, and internal processes.

6. CODE OF CONDUCT. Employee agrees to comply with all company policies, procedures, and the Employee Handbook as updated from time to time. Employee shall conduct all business activities in accordance with applicable laws and ethical standards.

7. SECURITY INDUSTRY OBLIGATIONS. For roles in the security industry, Employee understands and agrees to maintain all required licenses, certifications, and clearances as required by applicable state and local laws. Failure to maintain required credentials may result in immediate removal from duty.

8. RETURN OF PROPERTY. Upon separation from employment, Employee agrees to immediately return all Employer property, including but not limited to: uniforms, equipment, access credentials, vehicles, and any company documents.

9. ENTIRE AGREEMENT. This Agreement constitutes the entire agreement between the parties with respect to the subject matter and supersedes all prior negotiations, representations, or agreements.

Employee Name: ${application.firstName} ${application.lastName}
Employee Email: ${application.email}
Organization: ${orgName}
Date: ${today}`,
        status: 'pending',
      });

      contractsToCreate.push({
        workspaceId: workspaceId as string,
        applicationId,
        documentType: 'offer_letter',
        documentTitle: 'Employment Offer Letter',
        documentContent: `EMPLOYMENT OFFER LETTER

${today}

Dear ${application.firstName} ${application.lastName},

We are pleased to extend this offer of employment with ${orgName} ("Company"). This letter outlines the terms of your offer.

POSITION: As outlined in your application and role assignment.

START DATE: Your start date will be confirmed by your direct supervisor or HR representative after the completion of this onboarding process and clearance of all required background checks and licensing.

COMPENSATION: Your compensation details have been confirmed with your hiring manager and will be reflected in your employee profile upon approval of this application.

WORK SCHEDULE: Your work schedule, including hours and locations, will be determined by operational needs and communicated through the scheduling system. You will have the opportunity to provide your availability preferences during this onboarding process.

BENEFITS: You may be eligible for benefits as outlined in the Employee Handbook. Benefit eligibility is subject to completion of required waiting periods.

CONDITIONS OF EMPLOYMENT: This offer is contingent upon:
  • Successful completion of this onboarding process
  • Verification of your right to work in the United States (Form I-9)
  • Successful background screening (if applicable to your role)
  • Maintenance of all required licenses and certifications for your assigned role

ACKNOWLEDGMENT: By signing below, you confirm your acceptance of this offer and the terms described herein. You understand that this offer letter is not a contract guaranteeing employment for any specific duration.

We look forward to welcoming you to the team!

Sincerely,
${orgName} Human Resources

Employee: ${application.firstName} ${application.lastName}
Email: ${application.email}
Date: ${today}`,
        status: 'pending',
      });

      contractsToCreate.push({
        workspaceId: workspaceId as string,
        applicationId,
        documentType: 'liability_waiver',
        documentTitle: 'Responsibility & Liability Waiver',
        documentContent: `RESPONSIBILITY AND LIABILITY WAIVER

This Waiver is entered into between ${application.firstName} ${application.lastName} ("Employee") and ${orgName} ("Employer") as of ${today}.

ASSUMPTION OF RISK
Employee acknowledges that the nature of security and related work may involve exposure to certain risks, including but not limited to: physical confrontations, hazardous environments, extended periods of standing or patrolling, exposure to outdoor weather conditions, and interactions with individuals who may pose a risk to personal safety.

Employee voluntarily accepts and assumes these inherent risks as a condition of employment in this industry.

SAFETY COMPLIANCE
Employee agrees to:
  1. Follow all safety protocols and procedures established by Employer
  2. Wear all required personal protective equipment (PPE) and uniforms
  3. Immediately report any unsafe conditions, injuries, or incidents to their supervisor
  4. Participate in required safety training programs
  5. Not engage in activities that create unnecessary risk to themselves or others

INCIDENT REPORTING
Employee understands and agrees that all incidents, accidents, injuries, near-misses, and security events must be reported immediately (within the same shift when possible) to their direct supervisor and documented in the Employer's incident management system.

VEHICLE AND EQUIPMENT RESPONSIBILITY
If Employee operates Company vehicles or equipment:
  • Employee certifies they hold a valid applicable license/certification
  • Employee agrees to operate all vehicles and equipment safely and lawfully
  • Employee agrees to report any damage immediately
  • Employee accepts responsibility for damage caused by negligence or violation of policies

LIMITATIONS
Nothing in this waiver limits Employee's rights to Workers' Compensation benefits, or waives any rights that cannot be waived by law. Employer maintains appropriate insurance coverage for employees performing authorized duties.

ACKNOWLEDGMENT
I have read and understand this Waiver. I voluntarily agree to its terms as a condition of my employment.

Employee: ${application.firstName} ${application.lastName}
Email: ${application.email}
Date: ${today}`,
        status: 'pending',
      });

      contractsToCreate.push({
        workspaceId: workspaceId as string,
        applicationId,
        documentType: 'uniform_acknowledgment',
        documentTitle: 'Uniform & Equipment Acknowledgment',
        documentContent: `UNIFORM AND EQUIPMENT ACKNOWLEDGMENT

Employee: ${application.firstName} ${application.lastName}
Email: ${application.email}
Organization: ${orgName}
Date: ${today}

EQUIPMENT AND UNIFORM ISSUANCE
Upon starting employment, you will be issued company uniforms and/or equipment as required for your assigned role. The specific items will be confirmed by your supervisor on or before your first day.

Standard-issue items may include (as applicable to your role):
  • Company uniform (shirts, pants, jacket)
  • Name badge and identification
  • Radio/communication device
  • Flashlight and duty gear
  • Access credentials and keys
  • Any other role-specific equipment

EMPLOYEE RESPONSIBILITIES
By signing below, Employee agrees to the following terms regarding all issued items:

1. CARE AND MAINTENANCE. Employee is responsible for maintaining all issued items in good working condition. Uniforms must be kept clean, pressed, and in good repair at all times while on duty.

2. LOSS OR DAMAGE. Employee is financially responsible for the replacement cost of any issued item that is lost, stolen (if negligence contributed), or damaged beyond normal wear and tear. Deductions from final paycheck may apply in accordance with applicable law.

3. PROPER USE. All company-issued equipment must be used exclusively for authorized work purposes. Unauthorized use, lending, or modification of equipment is prohibited.

4. RETURN REQUIREMENT. All issued items must be returned in good condition upon: end of shift (for shared equipment), termination of employment, or transfer to a new role that does not require the items.

5. UNIFORM STANDARDS. While on duty or representing the Company, Employee must wear the complete authorized uniform. Unauthorized modifications (patches, pins, alterations) are prohibited.

CONSEQUENCES OF NON-COMPLIANCE
Failure to comply with these policies may result in disciplinary action, deductions from final compensation for unreturned items (where permitted by law), and/or termination of employment.

ACKNOWLEDGMENT
I acknowledge receipt of (or agreement to receive upon start date) company-issued items, and I agree to the terms above.

Employee: ${application.firstName} ${application.lastName}
Date: ${today}`,
        status: 'pending',
      });

      if (isW4Employee) {
        contractsToCreate.push({
          workspaceId: workspaceId as string,
          applicationId,
          documentType: 'i9_form',
          documentTitle: 'Form I-9: Employment Eligibility Verification',
          documentContent: `EMPLOYMENT ELIGIBILITY VERIFICATION
Form I-9 - Department of Homeland Security

I attest, under penalty of perjury, that I am:
☐ A citizen of the United States
☐ A noncitizen national of the United States
☐ A lawful permanent resident
☐ An alien authorized to work

I certify that the information provided above is true and correct. I understand that federal law provides for imprisonment and/or fines for false statements or use of false documents in connection with the completion of this form.

Employee Full Name: ${application.firstName} ${application.lastName}
Email: ${application.email}
Date of Hire: [To be determined]

DEADLINE: This form must be completed within 3 business days of your start date.`,
          status: 'pending',
        });

        contractsToCreate.push({
          workspaceId: workspaceId as string,
          applicationId,
          documentType: 'w4_form',
          documentTitle: 'Form W-4: Employee Withholding Certificate',
          documentContent: `EMPLOYEE'S WITHHOLDING CERTIFICATE
Form W-4 - Internal Revenue Service

Employee Name: ${application.firstName} ${application.lastName}
Social Security Number: [Protected]
Address: ${application.address || '[To be completed]'}

I certify that I have completed the W-4 withholding information during onboarding and understand that this affects my federal income tax withholding.

By signing below, I authorize my employer to withhold federal income tax from my wages based on the information I have provided.`,
          status: 'pending',
        });
      }

      if (isW9Contractor) {
        contractsToCreate.push({
          workspaceId: workspaceId as string,
          applicationId,
          documentType: 'w9_form',
          documentTitle: 'Form W-9: Request for Taxpayer Identification',
          documentContent: `REQUEST FOR TAXPAYER IDENTIFICATION NUMBER AND CERTIFICATION
Form W-9 - Internal Revenue Service

Name: ${application.firstName} ${application.lastName}
Business name (if different): ${application.businessName || '[Individual]'}
Tax Classification: ☐ Individual/sole proprietor ☐ LLC ☐ Corporation

Federal Tax Classification: Independent Contractor

I certify that:
1. The TIN provided is correct
2. I am not subject to backup withholding
3. I am a U.S. citizen or other U.S. person
4. The FATCA code(s) entered on this form (if any) is correct

By signing below, I certify under penalties of perjury that the information provided is true, correct, and complete.`,
          status: 'pending',
        });
      }

      contractsToCreate.push({
        workspaceId: workspaceId as string,
        applicationId,
        documentType: 'handbook',
        documentTitle: 'Employee Handbook Acknowledgment',
        documentContent: `EMPLOYEE HANDBOOK ACKNOWLEDGMENT

I acknowledge that I have received and read the company Employee Handbook. I understand that:

1. The handbook contains important information about company policies, procedures, and expectations
2. I am responsible for reading and understanding all policies
3. The handbook is not a contract of employment
4. Policies may be updated at the company's discretion
5. I agree to comply with all company policies and procedures

I understand that violation of company policies may result in disciplinary action, up to and including termination of employment.

Employee: ${application.firstName} ${application.lastName}
Email: ${application.email}`,
        status: 'pending',
      });

      contractsToCreate.push({
        workspaceId: workspaceId as string,
        applicationId,
        documentType: 'confidentiality',
        documentTitle: 'Confidentiality & Non-Disclosure Agreement',
        documentContent: `CONFIDENTIALITY AND NON-DISCLOSURE AGREEMENT

I understand that during my ${isW4Employee ? 'employment' : 'engagement'}, I may have access to confidential and proprietary information including:
- Trade secrets and business strategies
- Customer and client information
- Financial data and projections
- Proprietary systems and processes
- Personnel information

I agree to:
1. Maintain strict confidentiality of all proprietary information
2. Not disclose confidential information to any third party
3. Use confidential information only for authorized business purposes
4. Return all confidential materials upon termination
5. Continue to maintain confidentiality after my ${isW4Employee ? 'employment' : 'engagement'} ends

I understand that breach of this agreement may result in legal action and damages.

${application.firstName} ${application.lastName}
${application.email}`,
        status: 'pending',
      });

      if (contractsToCreate.length > 0) {
        contracts = await db
          .insert(documentSignatures)
          .values(contractsToCreate)
          .returning();
      }
    }

    res.json(contracts);
  } catch (error) {
    log.error("Error fetching onboarding contracts:", error);
    res.status(500).json({ message: "Failed to fetch contracts" });
  }
});

router.post('/contracts/:contractId/sign', async (req, res) => {
  try {
    const { contractId } = req.params;
    const { workspaceId } = req.query;
    const { signedByName, applicationId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ message: "Workspace ID is required" });
    }

    if (!signedByName || !applicationId) {
      return res.status(400).json({ message: "Signature name and application ID are required" });
    }

    const application = await storage.getOnboardingApplication(applicationId, workspaceId as string);
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    const [existingContract] = await db
      .select()
      .from(documentSignatures)
      .where(
        and(
          eq(documentSignatures.id, contractId),
          eq(documentSignatures.applicationId, applicationId),
          eq(documentSignatures.workspaceId, workspaceId as string)
        )
      )
      .limit(1);

    if (!existingContract) {
      return res.status(404).json({ message: "Contract not found or access denied" });
    }

    if (existingContract.status === 'signed') {
      return res.status(400).json({ message: "Contract has already been signed" });
    }

    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    const [updatedContract] = await db
      .update(documentSignatures)
      .set({
        status: 'signed',
        signedByName: signedByName.trim(),
        signedAt: new Date(),
        ipAddress,
        userAgent,
        updatedAt: new Date(),
      })
      .where(eq(documentSignatures.id, contractId))
      .returning();

    res.json(updatedContract);
  } catch (error: unknown) {
    log.error("Error signing contract:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to sign contract" });
  }
});

router.get('/progress', async (req: any, res) => {
  try {
    let userId: string;

    if (req.requireAuth && req.requireAuth() && req.user?.claims) {
      userId = req.user?.id;
    } else if (req.session?.userId) {
      userId = req.session.userId;
    } else {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const progress = await db.select()
      .from(userOnboarding)
      .where(eq(userOnboarding.userId, userId))
      .limit(1);

    if (progress.length === 0) {
      const newProgress = await db.insert(userOnboarding)
        .values({ userId, workspaceId })
        .returning();
      return res.json(newProgress[0]);
    }

    res.json(progress[0]);
  } catch (error) {
    log.error("Error fetching onboarding progress:", error);
    res.status(500).json({ message: "Failed to fetch onboarding progress" });
  }
});

router.post('/skip', async (req: any, res) => {
  try {
    let userId: string;

    if (req.requireAuth && req.requireAuth() && req.user?.claims) {
      userId = req.user?.id;
    } else if (req.session?.userId) {
      userId = req.session.userId;
    } else {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const updated = await db.update(userOnboarding)
      .set({
        hasSkipped: true,
        lastViewedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(userOnboarding.userId, userId))
      .returning();

    if (updated.length === 0) {
      const created = await db.insert(userOnboarding)
        .values({
          workspaceId: workspaceId,
          userId,
          hasSkipped: true,
          lastViewedAt: new Date()
        })
        .returning();
      return res.json(created[0]);
    }

    res.json(updated[0]);
  } catch (error) {
    log.error("Error skipping onboarding:", error);
    res.status(500).json({ message: "Failed to skip onboarding" });
  }
});

router.post('/complete', async (req: any, res) => {
  try {
    let userId: string;

    if (req.requireAuth && req.requireAuth() && req.user?.claims) {
      userId = req.user?.id;
    } else if (req.session?.userId) {
      userId = req.session.userId;
    } else {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      completedSteps,
      communicationProgress,
      operationsProgress,
      growthProgress,
      platformProgress
    } = req.body;

    const progressPercentage = 100;

    const updated = await db.update(userOnboarding)
      .set({
        completedSteps: completedSteps || [],
        hasCompleted: true,
        progressPercentage,
        communicationProgress: communicationProgress || 0,
        operationsProgress: operationsProgress || 0,
        growthProgress: growthProgress || 0,
        platformProgress: platformProgress || 0,
        lastViewedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(userOnboarding.userId, userId))
      .returning();

    if (updated.length === 0) {
      const created = await db.insert(userOnboarding)
        .values({
          workspaceId: workspaceId,
          userId,
          completedSteps: completedSteps || [],
          hasCompleted: true,
          progressPercentage,
          communicationProgress: communicationProgress || 0,
          operationsProgress: operationsProgress || 0,
          growthProgress: growthProgress || 0,
          platformProgress: platformProgress || 0,
          lastViewedAt: new Date()
        })
        .returning();
      return res.json(created[0]);
    }

    res.json(updated[0]);
  } catch (error) {
    log.error("Error completing onboarding:", error);
    res.status(500).json({ message: "Failed to complete onboarding" });
  }
});

router.get('/migration-capabilities', async (req, res) => {
  try {
    const { onboardingOrchestrator } = await import('../services/ai-brain/subagents/onboardingOrchestrator');
    const capabilities = onboardingOrchestrator.getMigrationCapabilities();
    res.json(capabilities);
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post('/test-workflow', async (req, res) => {
  try {
    const user = req.user as any;
    const { testWorkspaceId, testWorkspaceName, testOwnerName, dryRun = true } = req.body;

    const { onboardingOrchestrator } = await import('../services/ai-brain/subagents/onboardingOrchestrator');
    const result = await onboardingOrchestrator.testInvitationWorkflow({
      testUserId: user.id,
      testWorkspaceId: testWorkspaceId || user.activeWorkspaceId,
      testWorkspaceName: testWorkspaceName || 'Test Organization',
      testOwnerName: testOwnerName || user.firstName || 'Test User',
      dryRun,
    });

    res.json(result);
  } catch (error: unknown) {
    log.error("[Test Workflow] Error:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get('/diagnostics/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const { onboardingOrchestrator } = await import('../services/ai-brain/subagents/onboardingOrchestrator');
    const diagnostics = await onboardingOrchestrator.getWorkflowDiagnostics(workspaceId);

    res.json(diagnostics);
  } catch (error: unknown) {
    log.error("[Workflow Diagnostics] Error:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post('/initialize-trinity', async (req, res) => {
  try {
    const user = req.user as any;
    const { workspaceId, workspaceName, ownerName, subscriptionTier } = req.body;

    const { onboardingOrchestrator } = await import('../services/ai-brain/subagents/onboardingOrchestrator');
    const result = await onboardingOrchestrator.initializeWorkspaceTrinity({
      workspaceId: workspaceId || user.activeWorkspaceId,
      workspaceName: workspaceName || 'My Organization',
      ownerId: user.id,
      ownerName: ownerName || user.firstName || 'User',
      subscriptionTier: subscriptionTier || 'starter',
    });

    res.json(result);
  } catch (error: unknown) {
    log.error("[Initialize Trinity] Error:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get('/status', async (req, res) => {
  try {
    const user = req.user as any;
    const workspaceId = req.workspaceId || user.activeWorkspaceId || user.defaultWorkspaceId;

    if (!workspaceId) {
      return res.json({ status: 'not_started' });
    }

    const { onboardingOrchestrator } = await import('../services/ai-brain/subagents/onboardingOrchestrator');
    const status = await onboardingOrchestrator.getOnboardingStatus(workspaceId);

    res.json(status);
  } catch (error: unknown) {
    log.error("[Onboarding Status] Error:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post('/submit/:applicationId', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace ID is required' });
    }

    const application = await storage.getOnboardingApplication(applicationId, workspaceId);
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    const contracts = await db.select().from(documentSignatures)
      .where(and(
        eq(documentSignatures.applicationId, applicationId),
        eq(documentSignatures.workspaceId, workspaceId)
      ));

    const unsignedCritical = contracts.filter(c =>
      ['employee_contract', 'offer_letter', 'liability_waiver', 'uniform_acknowledgment'].includes(c.documentType) &&
      c.status !== 'signed'
    );
    if (unsignedCritical.length > 0) {
      return res.status(400).json({ message: `${unsignedCritical.length} required document(s) must be signed before submitting.` });
    }

    await storage.updateOnboardingApplication(applicationId, workspaceId, {
      status: 'pending_review',
      currentStep: 'completed',
      completedAt: new Date(),
    });

    if (application.employeeId) {
      await storage.updateEmployee(application.employeeId, workspaceId, {
        onboardingStatus: 'pending_review',
        firstName: application.firstName,
        lastName: application.lastName,
        email: application.email,
        phone: application.phone || undefined,
        address: application.address || undefined,
        city: application.city || undefined,
        state: application.state || undefined,
        zipCode: application.zipCode || undefined,
        availabilityNotes: application.availabilityNotes || undefined,
      });
    }

    const managers = await storage.getEmployeesByWorkspace(workspaceId);
    const managerIds = managers
      .filter(e => e.userId && ['org_owner','co_owner','manager','department_manager','supervisor'].includes(e.workspaceRole || ''))
      .map(e => e.userId!)
      .slice(0, 5);

    for (const managerId of managerIds) {
      await storage.createNotification({
        userId: managerId,
        workspaceId,
        type: 'approval_required',
        title: 'New Employee Ready for Review',
        message: `${application.firstName} ${application.lastName} has completed onboarding and is awaiting your approval.`,
        actionUrl: '/employees',
        priority: 'high',
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    }

    log.info(`[Onboarding] Application ${applicationId} submitted — employee ${application.firstName} ${application.lastName} pending review`);

    res.json({ success: true, message: 'Application submitted successfully. Your manager will review and approve your profile.' });
  } catch (error: unknown) {
    log.error('[Onboarding] Submit error:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to submit application' });
  }
});

router.get('/pending-review', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const employees = await storage.getEmployeesByWorkspace(workspaceId);
    const pending = employees.filter(e => e.onboardingStatus === 'pending_review');
    res.json(pending);
  } catch (error: unknown) {
    res.status(500).json({ message: sanitizeError(error) });
  }
});

router.post('/approve/:employeeId', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { employeeId } = req.params;
    const { payRate, notes } = req.body;

    const employee = await storage.getEmployee(employeeId, workspaceId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const updates: any = { onboardingStatus: 'completed', isActive: true, status: 'active' };
    if (payRate) updates.hourlyRate = payRate;

    await storage.updateEmployee(employeeId, workspaceId, updates);

    if (employee.userId) {
      await storage.createNotification({
        userId: employee.userId,
        workspaceId,
        type: 'action_required',
        title: 'Onboarding Approved!',
        message: `Your onboarding has been approved. Welcome to the team! You are now eligible for shift assignments.`,
        actionUrl: '/dashboard',
        priority: 'high',
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    }

    // Initialize compliance window for the newly approved officer
    try {
      const { complianceEnforcementService } = await import('../services/compliance/complianceEnforcementService');
      await complianceEnforcementService.initializeWindow({
        entityType: 'officer',
        entityId: employeeId,
        workspaceId,
        isContractor: employee.workspaceRole === 'contractor'
      });
    } catch (complianceErr) {
      log.error('[OnboardingApproval] Failed to initialize compliance window:', complianceErr);
    }

    // Notify the management team that a new officer is now active and ready for shift assignments
    scheduleNonBlocking('onboarding.management-team-notification', async () => {
      try {
        const { db } = await import('../db');
        const { employees: empTable } = await import('../../shared/schema');
        const { eq, or, and: dbAnd } = await import('drizzle-orm');
        const officerName = [employee.firstName, employee.lastName].filter(Boolean).join(' ') || 'New Officer';
        const managers = await db.select({ userId: empTable.userId })
          .from(empTable)
          .where(dbAnd(
            eq(empTable.workspaceId, workspaceId),
            or(
              eq(empTable.workspaceRole as any, 'org_owner'),
              eq(empTable.workspaceRole as any, 'co_owner'),
              eq(empTable.workspaceRole as any, 'manager'),
              eq(empTable.workspaceRole as any, 'supervisor'),
            )
          ));
        for (const mgr of managers) {
          if (!mgr.userId || mgr.userId === employee.userId) continue;
          await storage.createNotification({
            userId: mgr.userId,
            workspaceId,
            type: 'employee_update',
            title: 'New Officer Activated',
            message: `${officerName} has completed onboarding and is now active. They are eligible for shift assignments.`,
            actionUrl: '/employees',
            priority: 'normal',
          }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
        }
      } catch (notifyErr) {
        log.error('[OnboardingApproval] Failed to notify managers of new active officer:', notifyErr);
      }
    });

    log.info(`[Onboarding] Employee ${employeeId} approved by manager in workspace ${workspaceId}`);

    res.json({ success: true, message: 'Employee approved and activated.' });
  } catch (error: unknown) {
    res.status(500).json({ message: sanitizeError(error) });
  }
});

router.get('/readiness', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const { onboardingPipelineService } = await import('../services/onboardingPipelineService');
    const readiness = await onboardingPipelineService.getOrgReadinessScore(workspaceId);
    res.json(readiness);
  } catch (error: unknown) {
    log.error('[Onboarding Readiness] Error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to get readiness score' });
  }
});

router.get('/create-org/progress', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || (req.user as any)?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: org_creation_progress | Verified: 2026-03-23
    const result = await typedQuery(
      sql`SELECT progress_data FROM org_creation_progress WHERE user_id = ${userId} LIMIT 1`
    );
    const row = result[0] as any;
    const progress = row?.progress_data ?? null;
    res.json({ success: true, progress });
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post('/create-org/progress', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || (req.user as any)?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const data = req.body;
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(orgCreationProgress).values({
      userId,
      progressData: data,
      updatedAt: sql`now()`,
    }).onConflictDoUpdate({
      target: orgCreationProgress.userId,
      set: {
        progressData: data,
        updatedAt: sql`now()`,
      },
    });
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.delete('/create-org/progress', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || (req.user as any)?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    await db.delete(orgCreationProgress).where(eq(orgCreationProgress.userId, userId));
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

export default router;
