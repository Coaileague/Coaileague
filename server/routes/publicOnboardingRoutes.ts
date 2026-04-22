import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { storage } from '../storage';
import { db, pool } from '../db';
import { documentSignatures, workspaceInvites, users, employees, onboardingInvites } from '@shared/schema';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { emailService } from '../services/emailService';
import { publicFormLimiter } from '../middleware/rateLimiter';
import { scheduleNonBlocking } from '../lib/scheduleNonBlocking';
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
    // @ts-expect-error — TS migration: fix in refactoring sprint
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

    // @ts-expect-error — TS migration: fix in refactoring sprint
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

    // @ts-expect-error — TS migration: fix in refactoring sprint
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
    // @ts-expect-error — TS migration: fix in refactoring sprint
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
    // @ts-expect-error — TS migration: fix in refactoring sprint
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

      // I-9 Employment Eligibility — Section 1
      contractsToCreate.push({
        workspaceId: workspaceId as string,
        id: crypto.randomUUID(),
        applicationId,
        documentType: 'i9_section_1',
        documentTitle: 'Employment Eligibility Verification (I-9) — Section 1',
        documentContent: `EMPLOYMENT ELIGIBILITY VERIFICATION — FORM I-9 (SECTION 1)\nU.S. Citizenship and Immigration Services\n\nEmployee Information and Attestation\n\nEmployee Name: ${application.firstName} ${application.lastName}\nDate of Birth: [To be completed by employee]\nSSN Last 4: [To be completed by employee]\nEmail: ${application.email}\nDate of Hire: ${today}\nEmployer: ${orgName}\n\nATTESTATION (Employee must check one):\n[ ] A citizen of the United States\n[ ] A noncitizen national of the United States (Alien Registration Number: _______)\n[ ] A lawful permanent resident\n[ ] An alien authorized to work until: _______________\n\nI attest, under penalty of perjury, that I am aware that federal law provides for imprisonment and/or fines for false statements or use of false documents in connection with the completion of this form.\n\nEmployee Signature: _________________________ Date: _______________\nPrinted Name: ${application.firstName} ${application.lastName}\n\nEMPLOYER — Section 2 is to be completed and signed no later than the first day of employment. Keep this form on file for 3 years or 1 year after employment ends, whichever is later.`,
        status: 'pending',
      });

      // Background Check Authorization
      contractsToCreate.push({
        workspaceId: workspaceId as string,
        id: crypto.randomUUID(),
        applicationId,
        documentType: 'background_check_authorization',
        documentTitle: 'Background Investigation Authorization and Release',
        documentContent: `BACKGROUND INVESTIGATION AUTHORIZATION AND RELEASE\n\nApplicant: ${application.firstName} ${application.lastName}\nEmail: ${application.email}\nDate: ${today}\nOrganization: ${orgName}\n\nI hereby authorize ${orgName} and its designated background screening partners to conduct a thorough background investigation, which may include:\n\n• Criminal history check (federal, state, county)\n• Texas Department of Public Safety (DPS) criminal history\n• Texas Sex Offender Registry check\n• Statewide criminal search\n• Employment history verification\n• Identity verification\n• Professional license/certification verification\n\nThis authorization is required by Texas Occupations Code Chapter 1702 for all security personnel. I understand that:\n\n1. A consumer report may be obtained for employment purposes.\n2. Information obtained will be used solely for employment decisions.\n3. I have the right to request a copy of any report obtained.\n4. Adverse action based on the report will be communicated to me with an opportunity to dispute inaccurate information.\n\nI release ${orgName}, its agents, and all persons and organizations providing information from any liability arising from this investigation.\n\nSignature: _________________________ Date: _______________\nPrinted Name: ${application.firstName} ${application.lastName}`,
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
        // @ts-expect-error — TS migration: fix in refactoring sprint
        if (application.taxClassification === 'w2') {
          employeeUpdate.payType = 'hourly';
          employeeUpdate.workerType = 'employee';
        // @ts-expect-error — TS migration: fix in refactoring sprint
        } else if (application.taxClassification === '1099') {
          employeeUpdate.payType = 'contractor';
          employeeUpdate.workerType = 'contractor';
          employeeUpdate.is1099Eligible = true;
        }
      }
      await storage.updateEmployee(application.employeeId, workspaceId, employeeUpdate);
    }

    // ── Auto-queue tenant compliance documents (workspace-wide signing requirements)
    // After onboarding submit, dispatch any org docs marked for all_employees/all_staff
    // to the new employee for signing. Non-blocking — won't fail the submit if it errors.
    if (application.employeeId) {
      const newEmployeeId = application.employeeId;
      scheduleNonBlocking('onboarding.tenant-docs', async () => {
        try {
          const { orgDocuments: orgDocsTable } = await import('@shared/schema');
          const { eq: eqOp, and: andOp, sql: sqlOp } = await import('drizzle-orm');
          const { documentSigningService } = await import('../services/documentSigningService');

          const tenantDocs = await db.select()
            .from(orgDocsTable)
            .where(andOp(
              eqOp(orgDocsTable.workspaceId, workspaceId),
              eqOp(orgDocsTable.requiresSignature, true),
              sqlOp`${orgDocsTable.signatureRequired} IN ('all_employees', 'all_staff')`
            ));

          const workspace = await storage.getWorkspace(workspaceId);
          const orgName = workspace?.name || 'Your Organization';

          for (const doc of tenantDocs) {
            await documentSigningService.sendDocumentForSignature({
              documentId: doc.id,
              workspaceId,
              senderUserId: 'system',
              senderName: orgName,
              recipients: [{
                email: application.email,
                name: `${application.firstName} ${application.lastName}`,
                type: 'internal',
                employeeId: newEmployeeId,
              }],
              message: `Please review and sign this required company compliance document as part of your onboarding for ${orgName}.`,
            });
            log.info(`[Onboarding] Queued tenant doc for signing: ${doc.fileName} → ${application.email}`);
          }
        } catch (err: any) {
          log.warn('[Onboarding] Tenant doc queue failed (non-fatal):', err?.message);
        }
      });
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
        // @ts-expect-error — TS migration: fix in refactoring sprint
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
      organizationalTitle: invite.organizationalTitle || null,
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

    if (!code || !email || !password) {
      return res.status(400).json({ message: 'Invite code, email, and password are required.' });
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

    // Identity prefilled at invite time is the source of truth. The form-supplied
    // firstName/lastName is only a fallback for legacy invites that predate the
    // identity-at-invite-time change.
    const resolvedFirstName = (invite.inviteeFirstName || firstName || '').toString().trim();
    const resolvedLastName = (invite.inviteeLastName || lastName || '').toString().trim();
    const resolvedPhone = (invite.inviteePhone || '').toString().trim() || null;
    if (!resolvedFirstName || !resolvedLastName) {
      return res.status(400).json({ message: 'First and last name are required.' });
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
    const licenseTypes = (invite.licenseTypes || []) as string[];

    let newEmployeeId: string | null = null;
    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id: userId,
        email: normalizedEmail,
        firstName: resolvedFirstName,
        lastName: resolvedLastName,
        passwordHash,
        authProvider: 'email',
        emailVerified: true,
        currentWorkspaceId: invite.workspaceId,
        createdAt: new Date(),
      });

      const [emp] = await tx.insert(employees).values({
        workspaceId: invite.workspaceId,
        userId,
        firstName: resolvedFirstName,
        lastName: resolvedLastName,
        email: normalizedEmail,
        phone: resolvedPhone || undefined,
        workspaceRole: role as any,
        organizationalTitle: invite.organizationalTitle || undefined,
        isActive: true,
        hireDate: new Date(),
        // Default payroll classification so payroll readiness scanner doesn't flag immediately
        payType: 'hourly',
        workerType: 'employee',
        onboardingStatus: 'in_progress',
      }).returning({ id: employees.id });
      newEmployeeId = emp?.id ?? null;

      await tx.update(workspaceInvites)
        .set({ status: 'accepted', acceptedByUserId: userId, acceptedAt: new Date() })
        .where(eq(workspaceInvites.id, invite.id));

      await tx.update(users)
        .set({ currentWorkspaceId: invite.workspaceId })
        .where(eq(users.id, userId));

      // Seed onboarding checklist from the licenseTypes the inviter attached.
      // Runs inside the same transaction so a register that succeeds always
      // produces the corresponding checklist — no orphaned employees with
      // blank onboarding requirements.
      if (licenseTypes.length > 0 && newEmployeeId) {
        const { expandLicensesToChecklistItems } = await import('@shared/licenseTypes');
        const { onboardingChecklists } = await import('@shared/schema');
        const items = expandLicensesToChecklistItems(licenseTypes).map((i) => ({
          ...i,
          isCompleted: false,
        }));
        if (items.length > 0) {
          await tx.insert(onboardingChecklists).values({
            workspaceId: invite.workspaceId,
            applicationId: invite.id, // use invite.id as correlation key until app row is created
            employeeId: newEmployeeId,
            checklistItems: items,
          });
        }
      }
    });

    // ── Cross-tenant CoAIleague score lookup (non-blocking)
    // Surfaces prior CoAIleague network history (reliability, overall score) from
    // other workspaces so owners know if the new hire has a track record — good or bad.
    // is_in_global_pool = TRUE means the prior workspace opted this profile into the shared pool.
    scheduleNonBlocking('onboarding.cross-tenant-score', async () => {
      try {
        const { rows } = await pool.query(
          `SELECT cp.overall_score,
                  cp.reliability_score,
                  cp.workspace_id AS prior_workspace_id,
                  e.first_name || ' ' || e.last_name AS prior_name
             FROM coaileague_employee_profiles cp
             JOIN employees e ON e.id = cp.employee_id
             JOIN users u ON u.id = e.user_id
            WHERE cp.is_in_global_pool = TRUE
              AND LOWER(u.email) = LOWER($1)
              AND cp.workspace_id <> $2
            ORDER BY COALESCE(cp.last_shift_completed, cp.updated_at, cp.created_at) DESC NULLS LAST
            LIMIT 1`,
          [normalizedEmail, invite.workspaceId],
        );

        if (rows[0]) {
          const score = parseFloat(rows[0].overall_score || '0.5');
          const reliability = parseFloat(rows[0].reliability_score || '0.5');
          const flag = reliability < 0.4
            ? '⚠️ LOW RELIABILITY — verify references before assigning solo posts'
            : score > 0.8 ? '⭐ Strong CoAIleague network history' : '';

          const { rows: owners } = await pool.query(
            `SELECT user_id FROM employees
              WHERE workspace_id = $1
                AND workspace_role IN ('org_owner','co_owner')
                AND is_active = TRUE
                AND user_id IS NOT NULL
              LIMIT 3`,
            [invite.workspaceId],
          );

          const { NotificationDeliveryService } = await import('../services/notificationDeliveryService');
          for (const owner of owners) {
            await NotificationDeliveryService.send({
              type: 'staffing_status_update',
              workspaceId: invite.workspaceId,
              recipientUserId: owner.user_id,
              channel: 'in_app',
              body: {
                title: 'New Hire Has CoAIleague History',
                message: `${firstName} ${lastName} previously worked on CoAIleague. Network score: ${(score * 100).toFixed(0)}/100, Reliability: ${(reliability * 100).toFixed(0)}/100. ${flag}`.trim(),
              },
            }).catch(() => {});
          }
        }
      } catch (err: any) {
        log.warn('[CrossTenantScore] Hire lookup failed (non-fatal):', err?.message);
      }
    });

    if (req.session) {
      (req as any).session.userId = userId;
      (req as any).session.workspaceId = invite.workspaceId;
      (req as any).session.workspaceRole = role;
    }

    const landingPage = ROLE_LANDING_PAGES[role] || '/dashboard';

    // Fire-and-forget: event + audit trail + owner notification (non-blocking — must not affect response)
    Promise.resolve().then(async () => {
      try {
        const { platformEventBus } = await import('../services/platformEventBus');
        platformEventBus.publish({
          type: 'member_joined',
          workspaceId: invite.workspaceId,
          metadata: {
            userId,
            email: normalizedEmail,
            role,
            firstName: resolvedFirstName,
            lastName: resolvedLastName,
            phone: resolvedPhone,
            licenseTypes,
            inviteId: invite.id,
            method: 'workspace_invite_new_user',
          },
        }).catch(() => null);
      } catch (_) { /* non-blocking */ }
      try {
        const { auditLogs } = await import('@shared/schema');
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(auditLogs).values({
          workspaceId: invite.workspaceId,
          entityType: 'employee',
          entityId: userId,
          action: 'member_joined',
          description: `${resolvedFirstName} ${resolvedLastName} (${normalizedEmail}) registered via invite code and joined as ${role}`,
          metadata: JSON.stringify({ role, inviteCode: normalizedCode, licenseTypes, method: 'register' }),
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
              message: `${resolvedFirstName} ${resolvedLastName} accepted their invitation and joined as ${role}. Complete their onboarding in the Employee Portal.`,
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
      firstName: resolvedFirstName,
      lastName: resolvedLastName,
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
    const userId = req.user?.id || (req as any).session?.userId;
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
    const preservedUserId = (req as any).session.userId || req.user?.id;
    const preservedPassport = (req as any).session.passport;
    await new Promise<void>((resolve) => {
      req.session.regenerate((err) => {
        if (err) {
          log.warn('[PublicOnboarding] Session regeneration after invite accept failed (non-fatal):', err);
        }
        resolve();
      });
    });
    if (preservedUserId) {
      (req as any).session.userId = preservedUserId;
    }
    if (preservedPassport) {
      (req as any).session.passport = preservedPassport;
    }
    (req as any).session.workspaceId = invite.workspaceId;
    (req as any).session.workspaceRole = role;

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
        // @ts-expect-error — TS migration: fix in refactoring sprint
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
