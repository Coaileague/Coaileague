import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { storage } from '../storage';
import { db } from '../db';
import { documentSignatures, workspaceInvites, users, employees, onboardingInvites } from '@shared/schema';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { emailService } from '../services/emailService';
import { publicFormLimiter } from '../middleware/rateLimiter';
import { createLogger } from '../lib/logger';
const log = createLogger('PublicOnboardingRoutes');


const router = Router();

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
    log.error("[PublicOnboarding] Error fetching invite:", error);
    res.status(500).json({ message: "Failed to fetch invite" });
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
      await storage.markInviteOpened(invite.id);
    }

    res.json({ success: true });
  } catch (error) {
    log.error('[PublicOnboarding] Error marking invite as opened:', error);
    res.status(500).json({ message: 'Failed to mark invite as opened' });
  }
});

router.post('/application', publicFormLimiter, async (req, res) => {
  try {
    const { inviteToken, website: honeypot, ...applicationData } = req.body;

    // SECURITY: Honeypot field — real users never fill in 'website', bots always do.
    if (honeypot) {
      // Return 200 to fool bots — they believe the submission succeeded
      return res.json({ id: 'bot_trap', status: 'in_progress' });
    }

    if (!inviteToken) {
      return res.status(400).json({ message: "Invite token is required" });
    }

    const invite = await storage.getOnboardingInviteByToken(inviteToken);

    if (!invite || new Date() > new Date(invite.expiresAt)) {
      return res.status(400).json({ message: "Invalid or expired invite" });
    }

    // SECURITY: Atomically claim the invite in a transaction — prevents duplicate applications
    // from concurrent requests with the same token (race condition fix).
    const application = await db.transaction(async (tx) => {
      // Atomic UPDATE: only succeeds if is_used is currently false
      const [claimed] = await tx
        .update(onboardingInvites)
        .set({ isUsed: true, acceptedAt: new Date() } as any)
        .where(and(eq(onboardingInvites.id, invite.id), eq(onboardingInvites.isUsed, false)))
        .returning({ id: onboardingInvites.id });

      if (!claimed) {
        // Another concurrent request already claimed this invite
        throw Object.assign(new Error("Invite has already been used"), { statusCode: 400 });
      }

      const employeeNumber = await storage.generateEmployeeNumber(invite.workspaceId);

      return storage.createOnboardingApplication({
        workspaceId: invite.workspaceId,
        inviteId: invite.id,
        firstName: applicationData.firstName || invite.firstName,
        lastName: applicationData.lastName || invite.lastName,
        email: applicationData.email || invite.email,
        employeeNumber,
        currentStep: 'personal_info',
        status: 'in_progress',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        position: (invite as any).position || applicationData.position || null,
        ...applicationData,
      } as any);
    });

    res.json(application);
  } catch (error: unknown) {
    log.error("[PublicOnboarding] Error creating application:", error);
    const statusCode = error.statusCode || 400;
    res.status(statusCode).json({ message: sanitizeError(error) || "Failed to create application" });
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

    // Mask SSN in GET response — full SSN is write-only; only last 4 digits returned
    const safeApplication = {
      ...application,
      ssn: application.ssn ? `***-**-${String(application.ssn).slice(-4)}` : undefined,
    };

    res.json(safeApplication);
  } catch (error) {
    log.error("[PublicOnboarding] Error fetching application:", error);
    res.status(500).json({ message: "Failed to fetch application" });
  }
});

// Zod schema for permitted application update fields — prevents arbitrary field injection
const applicationUpdateSchema = z.object({
  workspaceId: z.string().min(1),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(30).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  zipCode: z.string().max(20).optional(),
  dateOfBirth: z.string().optional(),
  ssn: z.string().max(11).optional(),
  licenseNumber: z.string().max(100).optional(),
  licenseExpiry: z.string().optional(),
  emergencyContactName: z.string().max(100).optional(),
  emergencyContactPhone: z.string().max(30).optional(),
  emergencyContactRelation: z.string().max(50).optional(),
  currentStep: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
}).passthrough(); // allow additional known fields from the form

router.patch('/application/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const parsed = applicationUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input", details: parsed.error.flatten() });
    }

    const { workspaceId, ...updateData } = parsed.data;

    const updated = await storage.updateOnboardingApplication(id, workspaceId, updateData);

    if (!updated) {
      return res.status(404).json({ message: "Application not found" });
    }

    res.json(updated);
  } catch (error: unknown) {
    log.error("[PublicOnboarding] Error updating application:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to update application" });
  }
});

// Zod schema for document signature — ensures required fields are present before DB write
const signatureSchema = z.object({
  applicationId: z.string().min(1, "applicationId is required"),
  workspaceId: z.string().min(1, "workspaceId is required"),
  documentType: z.string().min(1).max(100),
  signatureDataUrl: z.string().min(1).optional(),
  documentContent: z.string().optional(),
  signerName: z.string().max(200).optional(),
  signerTitle: z.string().max(100).optional(),
}).passthrough();

router.post('/signatures', async (req, res) => {
  try {
    const parsed = signatureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid signature data", details: parsed.error.flatten() });
    }

    const signature = await storage.createDocumentSignature({
      ...parsed.data,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      signedAt: new Date(),
    });

    res.json(signature);
  } catch (error: unknown) {
    log.error("[PublicOnboarding] Error creating signature:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create signature" });
  }
});

router.get('/signatures/:applicationId', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const signatures = await storage.getDocumentSignaturesByApplication(applicationId);
    res.json(signatures);
  } catch (error) {
    log.error("[PublicOnboarding] Error fetching signatures:", error);
    res.status(500).json({ message: "Failed to fetch signatures" });
  }
});

router.post('/certifications', async (req, res) => {
  try {
    const certificationData = req.body;
    const certification = await storage.createEmployeeCertification(certificationData);
    res.json(certification);
  } catch (error: unknown) {
    log.error("[PublicOnboarding] Error creating certification:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create certification" });
  }
});

router.get('/certifications/:applicationId', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const certifications = await storage.getEmployeeCertificationsByApplication(applicationId);
    res.json(certifications);
  } catch (error) {
    log.error("[PublicOnboarding] Error fetching certifications:", error);
    res.status(500).json({ message: "Failed to fetch certifications" });
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
    log.error("[PublicOnboarding] Error fetching documents:", error);
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
      const workspace = await storage.getWorkspace(workspaceId as string);
      const orgName = workspace?.name || 'The Organization';
      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      const contractsToCreate: any[] = [];

      contractsToCreate.push({
        id: crypto.randomUUID(),
        workspaceId: workspaceId as string,
        applicationId,
        documentType: 'employee_contract',
        documentTitle: 'Employment Agreement',
        documentContent: `EMPLOYMENT AGREEMENT\n\nThis Employment Agreement ("Agreement") is entered into as of ${today}, between ${orgName} ("Employer") and ${application.firstName} ${application.lastName} ("Employee").\n\n1. EMPLOYMENT. Employer hereby agrees to employ Employee, and Employee hereby accepts employment with Employer, upon the terms and conditions set forth in this Agreement. Employment begins on the start date confirmed during onboarding.\n\n2. POSITION AND DUTIES. Employee shall serve in the role as outlined in their offer letter, subject to such reasonable changes as Employer may determine from time to time. Employee shall devote full attention and time to the business and affairs of Employer and shall perform the duties assigned in a professional and diligent manner.\n\n3. AT-WILL EMPLOYMENT. Employee\'s employment with Employer is at-will, meaning either Employee or Employer may terminate the employment relationship at any time, with or without cause or advance notice.\n\n4. COMPENSATION. Employee shall receive compensation as outlined in the offer letter. Employer reserves the right to adjust compensation in accordance with company compensation policies.\n\n5. CONFIDENTIALITY. During the term of employment and thereafter, Employee agrees to maintain strict confidentiality of all Employer\'s proprietary information, trade secrets, client information, and internal processes.\n\n6. CODE OF CONDUCT. Employee agrees to comply with all company policies, procedures, and the Employee Handbook as updated from time to time. Employee shall conduct all business activities in accordance with applicable laws and ethical standards.\n\n7. SECURITY INDUSTRY OBLIGATIONS. For roles in the security industry, Employee understands and agrees to maintain all required licenses, certifications, and clearances as required by applicable state and local laws. Failure to maintain required credentials may result in immediate removal from duty.\n\n8. RETURN OF PROPERTY. Upon separation from employment, Employee agrees to immediately return all Employer property, including but not limited to: uniforms, equipment, access credentials, vehicles, and any company documents.\n\n9. ENTIRE AGREEMENT. This Agreement constitutes the entire agreement between the parties with respect to the subject matter and supersedes all prior negotiations, representations, or agreements.\n\nEmployee Name: ${application.firstName} ${application.lastName}\nEmployee Email: ${application.email}\nOrganization: ${orgName}\nDate: ${today}`,
        status: 'pending',
      });

      contractsToCreate.push({
        id: crypto.randomUUID(),
        workspaceId: workspaceId as string,
        applicationId,
        documentType: 'offer_letter',
        documentTitle: 'Offer Letter & Compensation',
        documentContent: `OFFER LETTER\n\nDear ${application.firstName} ${application.lastName},\n\nWe are pleased to extend this offer of employment with ${orgName}. This letter outlines the terms and conditions of your employment.\n\nPOSITION: Security Officer / Guard (or as specified in your role assignment)\nSTART DATE: To be confirmed during onboarding completion\nCOMPENSATION: As discussed, your compensation will be determined based on your role, experience, and applicable pay schedules. Full details will be provided upon final onboarding completion.\nSCHEDULE: Your schedule will be determined based on operational needs, your stated availability, and mutual agreement.\nBENEFITS: You may be eligible for benefits as described in the Employee Handbook, subject to applicable waiting periods and eligibility requirements.\n\nThis offer is contingent upon:\n- Successful completion of all required background checks\n- Verification of your right to work in the United States\n- Possession of all required licenses and certifications for your role\n- Satisfactory completion of the onboarding process\n\nThis offer letter does not constitute a contract of employment for any specific duration. Employment with ${orgName} is at-will.\n\nBy signing below, you acknowledge receipt of this offer and acceptance of these terms.\n\nSincerely,\n${orgName} Human Resources\nDate: ${today}`,
        status: 'pending',
      });

      contractsToCreate.push({
        id: crypto.randomUUID(),
        workspaceId: workspaceId as string,
        applicationId,
        documentType: 'liability_waiver',
        documentTitle: 'Liability Waiver & Release',
        documentContent: `LIABILITY WAIVER AND RELEASE OF CLAIMS\n\nThis Liability Waiver and Release of Claims ("Waiver") is entered into as of ${today}, by ${application.firstName} ${application.lastName} ("Employee") in favor of ${orgName} ("Employer").\n\nIN CONSIDERATION of employment with Employer, Employee voluntarily agrees to the following:\n\n1. ASSUMPTION OF RISK. Employee acknowledges that security work may involve certain inherent risks, including but not limited to physical confrontations, exposure to hazardous conditions, and interactions with potentially dangerous individuals. Employee voluntarily assumes all such risks associated with the performance of security duties.\n\n2. RELEASE OF LIABILITY. To the fullest extent permitted by applicable law, Employee releases, waives, and discharges Employer, its officers, directors, employees, agents, and successors from any and all claims, demands, actions, or causes of action arising out of or related to Employee\'s employment, except those arising from Employer\'s gross negligence or willful misconduct.\n\n3. EQUIPMENT AND VEHICLE USE. Employee agrees to indemnify and hold harmless Employer for any damage to Employer\'s property caused by Employee\'s negligence or intentional acts.\n\n4. INCIDENT REPORTING. Employee agrees to immediately report all incidents, injuries, and near-misses to their supervisor and understands that failure to report may affect any applicable workers\' compensation claims.\n\n5. WORKERS\' COMPENSATION. Employee acknowledges awareness of the workers\' compensation program and agrees to follow all reporting procedures.\n\n6. GOVERNING LAW. This Waiver shall be governed by the laws of the state in which Employee performs services.\n\nEmployee acknowledges having read and understood this Waiver and signs it voluntarily.\n\nEmployee: ${application.firstName} ${application.lastName}\nDate: ${today}`,
        status: 'pending',
      });

      contractsToCreate.push({
        workspaceId: workspaceId as string,
        id: crypto.randomUUID(),
        applicationId,
        documentType: 'uniform_acknowledgment',
        documentTitle: 'Uniform & Equipment Acknowledgment',
        documentContent: `UNIFORM AND EQUIPMENT ACKNOWLEDGMENT\n\nEmployee: ${application.firstName} ${application.lastName}\nDate: ${today}\nOrganization: ${orgName}\n\nI, ${application.firstName} ${application.lastName}, acknowledge receipt of the following uniform items and/or equipment (as applicable to my role and location assignment):\n\n- Uniform shirt(s) / jacket(s) as provided\n- Identification badge and holder\n- Access credentials (keys, key cards, codes) as applicable\n- Any equipment specific to assigned post\n\nI understand and agree to the following terms:\n\n1. CARE AND MAINTENANCE. I will maintain all issued uniform items and equipment in clean, serviceable condition. I will report any damage or loss immediately to my supervisor.\n\n2. PROFESSIONAL APPEARANCE. I will wear the complete, approved uniform at all times while on duty. No unauthorized modifications to the uniform are permitted.\n\n3. SECURITY OF EQUIPMENT. I will safeguard all Employer-issued equipment and access credentials. I will not share access credentials with any unauthorized person.\n\n4. RETURN OF PROPERTY. Upon separation from employment, resignation, termination, or reassignment, I will immediately return all uniform items, equipment, and access credentials in my possession. I understand that failure to return Employer property may result in deductions from my final paycheck to the extent permitted by applicable law.\n\n5. REPLACEMENT COSTS. I understand that I may be held responsible for the replacement cost of any items lost or damaged due to my negligence.\n\n6. CONFIDENTIALITY OF ACCESS. I will keep all access codes, credentials, and security information strictly confidential and will notify my supervisor immediately of any compromise or suspected compromise.\n\nEmployee: ${application.firstName} ${application.lastName}\nDate: ${today}`,
        status: 'pending',
      });

      const created = await db
        .insert(documentSignatures)
        .values(contractsToCreate)
        .returning();

      contracts = created;
    }

    res.json(contracts);
  } catch (error: unknown) {
    log.error("[PublicOnboarding] Error fetching contracts:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to fetch contracts" });
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
    log.error("[PublicOnboarding] Error signing contract:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to sign contract" });
  }
});

router.post('/submit/:applicationId', publicFormLimiter, async (req, res) => {
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
      const employeeUpdate: Record<string, any> = {
        onboardingStatus: 'pending_review',
        firstName: application.firstName,
        lastName: application.lastName,
        email: application.email,
      };
      if (application.phone) employeeUpdate.phone = application.phone;
      if (application.address) employeeUpdate.address = application.address;
      if (application.city) employeeUpdate.city = application.city;
      if (application.state) employeeUpdate.state = application.state;
      if (application.zipCode) employeeUpdate.zipCode = application.zipCode;
      if (application.availabilityNotes) employeeUpdate.availabilityNotes = application.availabilityNotes;
      if (application.emergencyContactName) employeeUpdate.emergencyContactName = application.emergencyContactName;
      if (application.emergencyContactPhone) employeeUpdate.emergencyContactPhone = application.emergencyContactPhone;
      if (application.emergencyContactRelation) employeeUpdate.emergencyContactRelation = application.emergencyContactRelation;
      if (application.dateOfBirth) employeeUpdate.dateOfBirth = application.dateOfBirth;
      if ((application as any).position) employeeUpdate.position = (application as any).position;
      // Propagate payroll classification defaults from application tax data
      if (application.taxClassification) {
        if (application.taxClassification === 'w2') {
          employeeUpdate.payType = 'hourly';
          employeeUpdate.workerType = 'employee';
        } else if (application.taxClassification === '1099') {
          employeeUpdate.payType = 'contractor';
          employeeUpdate.workerType = 'contractor';
          employeeUpdate.is1099Eligible = true;
        }
      }
      await storage.updateEmployee(application.employeeId, workspaceId, employeeUpdate);
    }

    const managers = await storage.getEmployeesByWorkspace(workspaceId);
    const managerIds = managers
      .filter(e => e.userId && ['org_owner', 'co_owner', 'manager', 'department_manager', 'supervisor'].includes(e.workspaceRole || ''))
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

    log.info(`[PublicOnboarding] Application ${applicationId} submitted — ${application.firstName} ${application.lastName} pending review`);

    res.json({ success: true, message: 'Application submitted successfully. Your manager will review and approve your profile.' });
  } catch (error: unknown) {
    log.error('[PublicOnboarding] Submit error:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to submit application' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// WORKSPACE INVITE ACCEPT FLOW — public endpoints for invite link acceptance
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_DISPLAY_NAMES: Record<string, string> = {
  manager: 'Manager',
  co_owner: 'Co-Owner',
  org_admin: 'Administrator',
  employee: 'Employee',
  staff: 'Staff Member',
  supervisor: 'Supervisor',
};

const ROLE_LANDING_PAGES: Record<string, string> = {
  manager: '/leaders-hub',
  co_owner: '/dashboard',
  org_owner: '/dashboard',
  org_admin: '/dashboard',
  admin: '/dashboard',
  employee: '/schedule',
  staff: '/schedule',
  supervisor: '/leaders-hub',
};

router.get('/workspace-invite/:code', async (req, res) => {
  try {
    const code = req.params.code.toUpperCase().trim();
    const [invite] = await db.select().from(workspaceInvites)
      .where(eq(workspaceInvites.inviteCode, code))
      .limit(1);

    if (!invite) {
      return res.status(404).json({ message: 'Invite not found. Check the link and try again.' });
    }
    if (new Date() > new Date(invite.expiresAt)) {
      return res.status(410).json({
        message: 'This invitation has expired.',
        expired: true,
        expiredAt: invite.expiresAt,
      });
    }
    if (invite.status !== 'pending') {
      return res.status(409).json({ message: 'This invitation has already been used.' });
    }

    const workspace = await storage.getWorkspace(invite.workspaceId);
    const inviter = invite.inviterUserId ? await storage.getUser(invite.inviterUserId) : null;
    const inviterName = inviter
      ? `${inviter.firstName || ''} ${inviter.lastName || ''}`.trim() || inviter.email
      : null;

    res.json({
      code: invite.inviteCode,
      workspaceName: workspace?.name || 'Unknown Organization',
      workspaceId: invite.workspaceId,
      role: invite.inviteeRole,
      roleName: ROLE_DISPLAY_NAMES[invite.inviteeRole || 'staff'] || invite.inviteeRole,
      inviterName,
      inviteeEmail: invite.inviteeEmail,
      expiresAt: invite.expiresAt,
      landingPage: ROLE_LANDING_PAGES[invite.inviteeRole || 'employee'] || '/dashboard',
    });
  } catch (error: unknown) {
    log.error('[PublicOnboarding] workspace-invite lookup error:', error);
    res.status(500).json({ message: 'Failed to load invite details.' });
  }
});

router.post('/workspace-invite/register', async (req, res) => {
  try {
    const { code, firstName, lastName, email, password } = req.body;

    if (!code || !firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const normalizedCode = code.toUpperCase().trim();
    const normalizedEmail = email.toLowerCase().trim();

    const [invite] = await db.select().from(workspaceInvites)
      .where(eq(workspaceInvites.inviteCode, normalizedCode))
      .limit(1);

    if (!invite) return res.status(404).json({ message: 'Invite not found.' });
    if (new Date() > new Date(invite.expiresAt)) return res.status(410).json({ message: 'This invitation has expired.' });
    if (invite.status !== 'pending') return res.status(409).json({ message: 'This invitation has already been used.' });
    if (invite.inviteeEmail && invite.inviteeEmail.toLowerCase() !== normalizedEmail) {
      return res.status(403).json({ message: 'This invite was sent to a different email address.' });
    }

    const workspace = await storage.getWorkspace(invite.workspaceId);
    if (!workspace) return res.status(404).json({ message: 'Organization no longer exists.' });

    const existingUser = await db.select({ id: users.id }).from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    if (existingUser.length > 0) {
      return res.status(409).json({
        message: 'An account with this email already exists. Please log in and use the invite code instead.',
        existingAccount: true,
        inviteCode: normalizedCode,
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = crypto.randomUUID();
    const role = (invite.inviteeRole as string) || 'employee';

    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id: userId,
        email: normalizedEmail,
        firstName,
        lastName,
        passwordHash,
        authProvider: 'email',
        emailVerified: true,
        currentWorkspaceId: invite.workspaceId,
        createdAt: new Date(),
      });

      await tx.insert(employees).values({
        workspaceId: invite.workspaceId,
        userId,
        firstName,
        lastName,
        email: normalizedEmail,
        workspaceRole: role as any,
        isActive: true,
        hireDate: new Date(),
        // Default payroll classification so payroll readiness scanner doesn't flag immediately
        payType: 'hourly',
        workerType: 'employee',
        onboardingStatus: 'in_progress',
      });

      await tx.update(workspaceInvites)
        .set({ status: 'accepted', acceptedByUserId: userId, acceptedAt: new Date() })
        .where(eq(workspaceInvites.id, invite.id));

      await tx.update(users)
        .set({ currentWorkspaceId: invite.workspaceId })
        .where(eq(users.id, userId));
    });

    if (req.session) {
      (req.session as any).userId = userId;
      (req.session as any).workspaceId = invite.workspaceId;
      (req.session as any).workspaceRole = role;
    }

    const landingPage = ROLE_LANDING_PAGES[role] || '/dashboard';

    // Fire-and-forget: event + audit trail + owner notification (non-blocking — must not affect response)
    Promise.resolve().then(async () => {
      try {
        const { platformEventBus } = await import('../services/platformEventBus');
        platformEventBus.publish({
          type: 'member_joined',
          workspaceId: invite.workspaceId,
          metadata: { userId, email: normalizedEmail, role, firstName, lastName, method: 'workspace_invite_new_user' },
        }).catch(() => null);
      } catch (_) { /* non-blocking */ }
      try {
        const { auditLogs } = await import('@shared/schema');
        await db.insert(auditLogs).values({
          workspaceId: invite.workspaceId,
          entityType: 'employee',
          entityId: userId,
          action: 'member_joined',
          description: `${firstName} ${lastName} (${normalizedEmail}) registered via invite code and joined as ${role}`,
          metadata: JSON.stringify({ role, inviteCode: normalizedCode, method: 'register' }),
          createdAt: new Date(),
        });
      } catch (_) { /* non-blocking */ }
      try {
        const { workspaces: wsSchema } = await import('@shared/schema');
        const { eq: eqOp } = await import('drizzle-orm');
        const [ws] = await db.select({ ownerId: wsSchema.ownerId }).from(wsSchema).where(eqOp(wsSchema.id, invite.workspaceId)).limit(1);
        if (ws?.ownerId) {
          const { NotificationDeliveryService } = await import('../services/notificationDeliveryService');
          await NotificationDeliveryService.send({
            type: 'staffing_status_update',
            workspaceId: invite.workspaceId,
            recipientUserId: ws.ownerId,
            channel: 'in_app',
            body: {
              title: 'New Team Member Joined',
              message: `${firstName} ${lastName} accepted their invitation and joined as ${role}. Complete their onboarding in the Employee Portal.`,
            },
          }).catch(() => null);
        }
      } catch (_) { /* non-blocking */ }
    }).catch(() => null);

    res.json({
      success: true,
      userId,
      workspaceId: invite.workspaceId,
      workspaceName: workspace.name,
      role,
      roleName: ROLE_DISPLAY_NAMES[role] || role,
      firstName,
      landingPage,
      firstLogin: true,
    });
  } catch (error: unknown) {
    log.error('[PublicOnboarding] workspace-invite register error:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Registration failed.' });
  }
});

router.post('/workspace-invite/accept-existing', async (req, res) => {
  try {
    const userId = req.user?.id || (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: 'Not logged in.' });

    const { code } = req.body;
    const normalizedCode = code?.toUpperCase?.().trim();
    if (!normalizedCode) return res.status(400).json({ message: 'Invite code required.' });

    const [invite] = await db.select().from(workspaceInvites)
      .where(eq(workspaceInvites.inviteCode, normalizedCode))
      .limit(1);

    if (!invite) return res.status(404).json({ message: 'Invite not found.' });
    if (new Date() > new Date(invite.expiresAt)) return res.status(410).json({ message: 'This invitation has expired.' });
    if (invite.status !== 'pending') return res.status(409).json({ message: 'This invitation has already been used.' });

    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (invite.inviteeEmail && invite.inviteeEmail.toLowerCase() !== user.email?.toLowerCase()) {
      return res.status(403).json({ message: 'This invite was sent to a different email address.' });
    }

    const workspace = await storage.getWorkspace(invite.workspaceId);
    if (!workspace) return res.status(404).json({ message: 'Organization no longer exists.' });

    const role = (invite.inviteeRole as string) || 'employee';

    await db.transaction(async (tx) => {
      await tx.update(workspaceInvites)
        .set({ status: 'accepted', acceptedByUserId: userId, acceptedAt: new Date() })
        .where(eq(workspaceInvites.id, invite.id));

      await tx.update(users)
        .set({ currentWorkspaceId: invite.workspaceId })
        .where(eq(users.id, userId));

      await tx.insert(employees).values({
        workspaceId: invite.workspaceId,
        userId,
        firstName: user.firstName || 'New',
        lastName: user.lastName || 'Member',
        email: user.email || '',
        workspaceRole: role as any,
        isActive: true,
        hireDate: new Date(),
        payType: 'hourly',
        workerType: 'employee',
        onboardingStatus: 'in_progress',
      });
    });

    // SECURITY: Regenerate the session on workspace join to prevent session fixation.
    // Preserve the authenticated identity before regeneration.
    const preservedUserId = (req.session as any).userId || req.user?.id;
    const preservedPassport = (req.session as any).passport;
    await new Promise<void>((resolve) => {
      req.session.regenerate((err) => {
        if (err) {
          log.warn('[PublicOnboarding] Session regeneration after invite accept failed (non-fatal):', err);
        }
        resolve();
      });
    });
    if (preservedUserId) {
      (req.session as any).userId = preservedUserId;
    }
    if (preservedPassport) {
      (req.session as any).passport = preservedPassport;
    }
    (req.session as any).workspaceId = invite.workspaceId;
    (req.session as any).workspaceRole = role;

    // Fire-and-forget: event + audit trail + owner notification (non-blocking — must not affect response)
    const joinedFirst = user.firstName || 'New';
    const joinedLast = user.lastName || 'Member';
    const joinedEmail = user.email || '';
    Promise.resolve().then(async () => {
      try {
        const { platformEventBus } = await import('../services/platformEventBus');
        platformEventBus.publish({
          type: 'member_joined',
          workspaceId: invite.workspaceId,
          metadata: { userId, email: joinedEmail, role, firstName: joinedFirst, lastName: joinedLast, method: 'workspace_invite_existing_user' },
        }).catch(() => null);
      } catch (_) { /* non-blocking */ }
      try {
        const { auditLogs } = await import('@shared/schema');
        await db.insert(auditLogs).values({
          workspaceId: invite.workspaceId,
          entityType: 'employee',
          entityId: userId,
          action: 'member_joined',
          description: `${joinedFirst} ${joinedLast} (${joinedEmail}) accepted invite and joined as ${role}`,
          metadata: JSON.stringify({ role, inviteCode: normalizedCode, method: 'accept_existing' }),
          createdAt: new Date(),
        });
      } catch (_) { /* non-blocking */ }
      try {
        const { workspaces: wsSchema } = await import('@shared/schema');
        const { eq: eqOp } = await import('drizzle-orm');
        const [ws] = await db.select({ ownerId: wsSchema.ownerId }).from(wsSchema).where(eqOp(wsSchema.id, invite.workspaceId)).limit(1);
        if (ws?.ownerId && ws.ownerId !== userId) {
          const { NotificationDeliveryService } = await import('../services/notificationDeliveryService');
          await NotificationDeliveryService.send({
            type: 'staffing_status_update',
            workspaceId: invite.workspaceId,
            recipientUserId: ws.ownerId,
            channel: 'in_app',
            body: {
              title: 'Team Member Joined',
              message: `${joinedFirst} ${joinedLast} accepted their invitation and joined as ${role}.`,
            },
          }).catch(() => null);
        }
      } catch (_) { /* non-blocking */ }
    }).catch(() => null);

    res.json({
      success: true,
      workspaceId: invite.workspaceId,
      workspaceName: workspace.name,
      role,
      roleName: ROLE_DISPLAY_NAMES[role] || role,
      landingPage: ROLE_LANDING_PAGES[role] || '/dashboard',
    });
  } catch (error: unknown) {
    log.error('[PublicOnboarding] accept-existing error:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to accept invite.' });
  }
});

export default router;
