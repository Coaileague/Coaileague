import { Router } from "express";
import { requireAuth } from "../auth";
import { requireManager, requirePlatformStaff, type AuthenticatedRequest } from "../rbac";
import { storage } from "../storage";
import { z } from "zod";
import { createLogger } from '../lib/logger';
const log = createLogger('FormRoutes');


import { universalAudit } from "../services/universalAuditService";

const router = Router();

const createCustomFormSchema = z.object({
  workspaceId: z.string().min(1, "Organization ID is required"),
  name: z.string().min(1, "Form name is required").max(200),
  description: z.string().optional(),
  category: z.enum(['onboarding', 'rms', 'compliance', 'custom']).optional(),
  template: z.any(),
  requiresSignature: z.boolean().optional(),
  signatureType: z.enum(['typed_name', 'drawn', 'uploaded']).optional(),
  signatureText: z.string().optional(),
  requiresDocuments: z.boolean().optional(),
  documentTypes: z.any().optional(),
  maxDocuments: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
  accessibleBy: z.any().optional(),
  createdByRole: z.string().optional(),
});

const updateCustomFormSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  category: z.enum(['onboarding', 'rms', 'compliance', 'custom']).optional(),
  template: z.any().optional(),
  requiresSignature: z.boolean().optional(),
  signatureType: z.enum(['typed_name', 'drawn', 'uploaded']).optional(),
  signatureText: z.string().optional(),
  requiresDocuments: z.boolean().optional(),
  documentTypes: z.any().optional(),
  maxDocuments: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
  accessibleBy: z.any().optional(),
});

router.get("/custom-forms", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
    
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const forms = await storage.getCustomFormsByOrganization(workspace.id);
    res.json(forms);
  } catch (error) {
    log.error("Error fetching custom forms:", error);
    res.status(500).json({ message: "Failed to fetch custom forms" });
  }
});

router.get("/custom-forms/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
    
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const form = await storage.getCustomForm(id);
    
    if (!form || form.workspaceId !== workspace.id) {
      return res.status(404).json({ message: "Form not found" });
    }

    res.json(form);
  } catch (error) {
    log.error("Error fetching custom form:", error);
    res.status(500).json({ message: "Failed to fetch custom form" });
  }
});

router.post("/custom-forms", requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const platformRole = req.platformRole;
    
    const validationResult = createCustomFormSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: "Invalid form data",
        errors: validationResult.error.errors
      });
    }

    const validatedData = validationResult.data;

    const workspace = await storage.getWorkspace(validatedData.workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const formData = {
      ...validatedData,
      createdBy: userId,
      createdByRole: platformRole,
    };

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const form = await storage.createCustomForm(formData);
    res.json(form);
  } catch (error) {
    log.error("Error creating custom form:", error);
    res.status(500).json({ message: "Failed to create custom form" });
  }
});

router.patch("/custom-forms/:id", requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    
    const form = await storage.getCustomForm(id);
    if (!form) {
      return res.status(404).json({ message: "Form not found" });
    }

    const validationResult = updateCustomFormSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: "Invalid form data",
        errors: validationResult.error.errors
      });
    }

    const updated = await storage.updateCustomForm(id, form.workspaceId, validationResult.data);
    res.json(updated);
  } catch (error) {
    log.error("Error updating custom form:", error);
    res.status(500).json({ message: "Failed to update custom form" });
  }
});

router.delete("/custom-forms/:id", requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    
    const form = await storage.getCustomForm(id);
    if (!form) {
      return res.status(404).json({ message: "Form not found" });
    }

    await storage.deleteCustomForm(id, form.workspaceId);
    res.json({ success: true });
  } catch (error) {
    log.error("Error deleting custom form:", error);
    res.status(500).json({ message: "Failed to delete custom form" });
  }
});

const createCustomFormSubmissionSchema = z.object({
  formId: z.string().min(1, "Form ID is required"),
  workspaceId: z.string().min(1, "Workspace ID is required"),
  submittedByName: z.string().optional(),
  formData: z.any(),
  eSignature: z.any().optional(),
  documents: z.any().optional(),
  status: z.enum(['draft', 'completed', 'archived']).optional(),
});

router.get("/custom-form-submissions", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
    
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const submissions = await storage.getCustomFormSubmissionsByOrganization(workspace.id);
    res.json(submissions);
  } catch (error) {
    log.error("Error fetching form submissions:", error);
    res.status(500).json({ message: "Failed to fetch form submissions" });
  }
});

router.get("/custom-form-submissions/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
    
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const submission = await storage.getCustomFormSubmission(id);
    
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    if (submission.workspaceId !== workspace.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(submission);
  } catch (error) {
    log.error("Error fetching form submission:", error);
    res.status(500).json({ message: "Failed to fetch form submission" });
  }
});

router.post("/custom-form-submissions", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const validationResult = createCustomFormSubmissionSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: "Invalid submission data",
        errors: validationResult.error.errors
      });
    }

    const validatedData = validationResult.data;

    const workspace = await storage.getWorkspace(validatedData.workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const form = await storage.getCustomForm(validatedData.formId);
    if (!form || form.workspaceId !== validatedData.workspaceId) {
      return res.status(404).json({ message: "Form not found or access denied" });
    }

    const submissionData = {
      ...validatedData,
      submittedBy: userId,
      submittedAt: new Date(),
    };

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const submission = await storage.createCustomFormSubmission(submissionData);
    
    await universalAudit.log({
      workspaceId: validatedData.workspaceId,
      actorId: userId,
      actorType: 'user',
      action: 'form.submitted',
      entityType: 'form_submission',
      entityId: submission.id,
      entityName: form.name,
      changeType: 'create',
      metadata: { formId: form.id }
    });

    res.json(submission);
  } catch (error) {
    log.error("Error submitting form:", error);
    res.status(500).json({ message: "Failed to submit form" });
  }
});

let _formWorkflowService: any = null;
async function getFormWorkflowService() {
  if (!_formWorkflowService) {
    const mod = await import('../services/formWorkflowService');
    _formWorkflowService = mod.formWorkflowService;
  }
  return _formWorkflowService;
}

router.get("/form-templates/available", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
    const workspaceId = workspace?.id;

    const fws = await getFormWorkflowService();
    const systemTemplates = fws.getAvailableTemplates(workspace?.businessCategory || undefined);

    let customForms: any[] = [];
    if (workspaceId) {
      try {
        customForms = (await storage.getCustomFormsByOrganization(workspaceId)).map((f: any) => ({
          id: `custom-${f.id}`,
          name: f.name,
          description: f.description,
          category: f.category || 'custom',
          isSystem: false,
          fields: f.template?.fields || [],
          requiresPhotos: false,
          requiresSignature: f.requiresSignature || false,
        }));
      } catch (e) {
        log.warn('[FormRoutes] Failed to load custom forms:', e);
      }
    }

    res.json([...systemTemplates, ...customForms]);
  } catch (error) {
    log.error("Error fetching available templates:", error);
    res.status(500).json({ message: "Failed to fetch templates" });
  }
});

router.get("/form-submissions/pending-reviews", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    const fws = await getFormWorkflowService();
    const pending = await fws.getPendingReviews(workspace.id);
    res.json(pending);
  } catch (error) {
    log.error("Error fetching pending reviews:", error);
    res.status(500).json({ message: "Failed to fetch pending reviews" });
  }
});

router.post("/form-submissions", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const schema = z.object({
      templateId: z.string().min(1),
      formData: z.record(z.any()),
      photos: z.array(z.string()).optional(),
      signatureData: z.string().optional(),
    });

    const validationResult = schema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ message: "Invalid data", errors: validationResult.error.errors });
    }

    const { templateId, formData, photos, signatureData } = validationResult.data;

    const user = await storage.getUser(userId);
    const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    const submitterName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'Unknown';

    const fws = await getFormWorkflowService();
    const result = await fws.submitForm({
      workspaceId: workspace.id,
      templateId,
      submittedBy: userId,
      submitterName,
      formData,
      photos,
      signatureData,
    });

    res.json(result);
  } catch (error) {
    log.error("Error submitting form:", error);
    res.status(500).json({ message: "Failed to submit form" });
  }
});

router.get("/form-submissions", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    const { status, templateId, dateFrom, dateTo } = req.query;

    const fws = await getFormWorkflowService();
    const submissions = await fws.getSubmissions(workspace.id, {
      status: status as string,
      templateId: templateId as string,
      submittedBy: userId,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
    });

    res.json(submissions);
  } catch (error) {
    log.error("Error fetching submissions:", error);
    res.status(500).json({ message: "Failed to fetch submissions" });
  }
});

router.get("/form-submissions/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const fws = await getFormWorkflowService();
    const submission = await fws.getSubmission(id);
    if (!submission) return res.status(404).json({ message: "Submission not found" });
    res.json(submission);
  } catch (error) {
    log.error("Error fetching submission:", error);
    res.status(500).json({ message: "Failed to fetch submission" });
  }
});

router.patch("/form-submissions/:id/review", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;
    const reviewSchema = z.object({
      action: z.enum(['approve', 'reject']),
      notes: z.string().optional(),
    });

    const validationResult = reviewSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ message: "Invalid data", errors: validationResult.error.errors });
    }

    const { action, notes } = validationResult.data;
    const user = await storage.getUser(userId);
    const reviewerName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'Manager';
    const reviewerWorkspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);

    const fws = await getFormWorkflowService();
    const result = await fws.reviewSubmission(id, action, userId, reviewerName, notes, reviewerWorkspace?.id);
    if (!result) return res.status(404).json({ message: "Submission not found" });

    res.json(result);
  } catch (error) {
    log.error("Error reviewing submission:", error);
    res.status(500).json({ message: "Failed to review submission" });
  }
});

export default router;
