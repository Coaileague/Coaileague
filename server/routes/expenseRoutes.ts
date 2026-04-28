import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { db } from "../db";
import {
  expenses,
  expenseCategories,
  insertExpenseSchema,
  insertExpenseReceiptSchema,
} from "@shared/schema";
import { sql, eq, and, or } from "drizzle-orm";
import crypto from "crypto";
import { requireAuth, requireManager, type AuthenticatedRequest } from "../rbac";
import { storage } from "../storage";
import { objectStorageClient } from "../objectStorage";
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('ExpenseRoutes');


const router = Router();

const DEFAULT_EXPENSE_CATEGORIES = [
  { name: "Meals & Entertainment", code: "MEALS" },
  { name: "Travel", code: "TRAVEL" },
  { name: "Fuel", code: "FUEL" },
  { name: "Mileage", code: "MILEAGE" },
  { name: "Equipment", code: "EQUIP" },
  { name: "Software & Subscriptions", code: "SOFTWARE" },
  { name: "Office Supplies", code: "OFFICE" },
  { name: "Training & Certifications", code: "TRAINING" },
  { name: "Marketing", code: "MARKETING" },
  { name: "Utilities", code: "UTILITIES" },
  { name: "Uniforms & PPE", code: "UNIFORM" },
  { name: "Other", code: "OTHER" },
];

router.get('/categories', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace context required' });

    const existing = await db
      .select()
      .from(expenseCategories)
      .where(and(eq(expenseCategories.workspaceId, workspaceId), eq(expenseCategories.isActive, true)));

    if (existing.length > 0) return res.json(existing);

    const seeded = await db
      .insert(expenseCategories)
      .values(
        DEFAULT_EXPENSE_CATEGORIES.map(c => ({
          workspaceId,
          name: c.name,
          code: c.code,
          requiresApproval: true,
          isActive: true,
        }))
      )
      .returning();

    res.json(seeded);
  } catch (error: unknown) {
    log.error('[expenses/categories]', (error as any)?.message);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to fetch expense categories' });
  }
});

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }
  return {
    bucketName: pathParts[1],
    objectName: pathParts.slice(2).join("/"),
  };
}

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const employee = await storage.getEmployeeByUserId(userId);
    if (!employee || employee.workspaceId !== workspaceId) {
      return res.status(404).json({ message: "Employee record not found" });
    }

    const validated = insertExpenseSchema.parse({
      ...req.body,
      workspaceId,
      employeeId: employee.id,
      status: 'submitted',
      submittedAt: new Date()
    });

    const expense = await storage.createExpense(validated);
    res.json(expense);
  } catch (error: unknown) {
    log.error("Error creating expense:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create expense" });
  }
});

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const user = await storage.getUser(userId);
    
    let filters: { status?: string; employeeId?: string; categoryId?: string } = {};
    
    const employeeForRole = await storage.getEmployeeByUserId(userId);
    const hasManagerRole = ['org_owner', 'co_owner', 'org_manager', 'manager', 'department_manager'].includes(employeeForRole?.workspaceRole || '');
    if (!hasManagerRole) {
      if (!employeeForRole) {
        return res.json([]);
      }
      filters.employeeId = employeeForRole.id;
    }
    
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.employeeId) filters.employeeId = req.query.employeeId as string;
    if (req.query.categoryId) filters.categoryId = req.query.categoryId as string;

    const expenseList = await storage.getExpensesByWorkspace(workspaceId, filters);
    res.json(expenseList);
  } catch (error: unknown) {
    log.error("Error fetching expenses:", error);
    res.status(500).json({ message: "Failed to fetch expenses" });
  }
});

router.get('/pending-count', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.json({ count: 0 });
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(expenses)
      .where(and(eq(expenses.workspaceId, workspaceId), eq(expenses.status, 'submitted')));
    res.json({ count: Number(result[0]?.count) || 0 });
  } catch (error) {
    log.error('Expenses pending count error:', error);
    res.status(500).json({ count: 0, error: true });
  }
});

router.get('/pending-approval', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const pendingExpenses = await db.select().from(expenses)
      .where(and(
        eq(expenses.workspaceId, workspaceId),
        // @ts-expect-error — TS migration: fix in refactoring sprint
        or(eq(expenses.status, 'pending'), eq(expenses.status, 'submitted'))
      ));
    res.json(pendingExpenses);
  } catch (error: unknown) {
    log.error('Error fetching pending expenses:', error);
    res.status(500).json({ error: true, message: 'Failed to fetch pending expenses' });
  }
});

router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const expense = await storage.getExpense(req.params.id, workspaceId);
    
    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const receipts = await storage.getExpenseReceiptsByExpense(expense.id);
    res.json({ ...expense, receipts });
  } catch (error: unknown) {
    log.error("Error fetching expense:", error);
    res.status(500).json({ message: "Failed to fetch expense" });
  }
});

router.post('/:id/receipts', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const expense = await storage.getExpense(req.params.id, workspaceId);
    
    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    const { fileData, fileName, fileType } = req.body;
    
    if (!fileData || !fileName || !fileType) {
      return res.status(400).json({ message: "File data, name, and type are required" });
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
    if (!allowedTypes.includes(fileType.toLowerCase())) {
      return res.status(400).json({ message: "Invalid file type. Only images (JPEG, PNG, GIF) and PDF are allowed." });
    }

    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255);
    const fileExt = sanitizedName.split('.').pop()?.toLowerCase() || 'png';
    
    const extensionMap: Record<string, string[]> = {
      'image/jpeg': ['jpg', 'jpeg'],
      'image/jpg': ['jpg', 'jpeg'],
      'image/png': ['png'],
      'image/gif': ['gif'],
      'application/pdf': ['pdf'],
    };
    if (!extensionMap[fileType]?.includes(fileExt)) {
      return res.status(400).json({ message: "File extension does not match MIME type" });
    }

    const base64Data = fileData.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (buffer.length > MAX_FILE_SIZE) {
      return res.status(400).json({ message: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` });
    }

    const privateDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateDir) {
      log.error('PRIVATE_OBJECT_DIR environment variable not set');
      return res.status(500).json({ message: "Object storage not configured" });
    }

    const receiptId = crypto.randomUUID();
    const objectPath = `${privateDir}/expense-receipts/${workspaceId}/${expense.id}/${receiptId}.${fileExt}`;
    const { bucketName, objectName } = parseObjectPath(objectPath);
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    await file.save(buffer, {
      metadata: {
        contentType: fileType,
        metadata: {
          workspaceId: workspaceId,
          expenseId: expense.id,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          uploadedBy: req.user?.id,
          timestamp: new Date().toISOString(),
          originalFileName: sanitizedName,
        },
      },
    });

    const fileUrl = `/objects/expense-receipts/${workspaceId}/${expense.id}/${receiptId}.${fileExt}`;

    const validated = insertExpenseReceiptSchema.parse({
      workspaceId,
      expenseId: expense.id,
      fileName: sanitizedName,
      fileUrl,
      fileType,
      fileSize: buffer.length,
    });

    const receipt = await storage.createExpenseReceipt(validated);
    res.json(receipt);
  } catch (error: unknown) {
    log.error("Error uploading receipt:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to upload receipt" });
  }
});

router.patch('/:id/approve', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { reviewNotes } = req.body;

    const expense = await storage.approveExpense(req.params.id, workspaceId, userId, reviewNotes);
    
    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    res.json(expense);
  } catch (error: unknown) {
    log.error("Error approving expense:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to approve expense" });
  }
});

router.patch('/:id/reject', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { reviewNotes } = req.body;

    if (!reviewNotes) {
      return res.status(400).json({ message: "Review notes are required when rejecting an expense" });
    }

    const expense = await storage.rejectExpense(req.params.id, workspaceId, userId, reviewNotes);
    
    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    res.json(expense);
  } catch (error: unknown) {
    log.error("Error rejecting expense:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to reject expense" });
  }
});

router.patch('/:id/mark-paid', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { paymentMethod } = req.body;

    const expense = await storage.markExpensePaid(req.params.id, workspaceId, userId, paymentMethod);
    
    if (!expense) {
      return res.status(404).json({ message: "Expense not found or not approved" });
    }

    res.json(expense);
  } catch (error: unknown) {
    log.error("Error marking expense as paid:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to mark expense as paid" });
  }
});

export default router;
