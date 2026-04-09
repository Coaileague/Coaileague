import { Router } from "express";
import { db } from "../db";
import {
  budgets,
  budgetLineItems,
  budgetVariances,
  insertBudgetSchema,
  insertBudgetLineItemSchema,
  insertBudgetVarianceSchema,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireManager, requireOwner, type AuthenticatedRequest } from "../rbac";
import { createLogger } from '../lib/logger';
const log = createLogger('BudgetRoutes');


const router = Router();

router.get('/', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { fiscalYear, department, status } = req.query;
    
    let query = db
      .select()
      .from(budgets)
      .where(eq(budgets.workspaceId, workspaceId))
      .orderBy(desc(budgets.createdAt));
    
    let allBudgets = await query;
    
    if (fiscalYear) {
      allBudgets = allBudgets.filter(b => b.fiscalYear === parseInt(fiscalYear as string));
    }
    if (department) {
      allBudgets = allBudgets.filter(b => (b as any).department === department);
    }
    if (status) {
      allBudgets = allBudgets.filter(b => b.status === status);
    }
    
    res.json(allBudgets);
  } catch (error: unknown) {
    log.error("Error fetching budgets:", error);
    res.status(500).json({ message: "Failed to fetch budgets" });
  }
});

router.get('/:id', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;
    
    const [budget] = await db
      .select()
      .from(budgets)
      .where(and(
        eq(budgets.id, id),
        eq(budgets.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!budget) {
      return res.status(404).json({ message: "Budget not found" });
    }
    
    res.json(budget);
  } catch (error: unknown) {
    log.error("Error fetching budget:", error);
    res.status(500).json({ message: "Failed to fetch budget" });
  }
});

router.post('/', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    
    const validatedData = insertBudgetSchema.parse({
      ...req.body,
      workspaceId
    });
    
    const [budget] = await db
      .insert(budgets)
      .values(validatedData)
      .returning();
    
    res.json(budget);
  } catch (error: unknown) {
    log.error("Error creating budget:", error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to create budget" });
  }
});

router.patch('/:id', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;
    
    const existing = await db
      .select()
      .from(budgets)
      .where(and(
        eq(budgets.id, id),
        eq(budgets.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!existing[0]) {
      return res.status(404).json({ message: "Budget not found" });
    }
    
    const validatedData = insertBudgetSchema.partial().parse(req.body);
    
    const [updated] = await db
      .update(budgets)
      .set({
        ...validatedData,
        updatedAt: new Date()
      })
      .where(and(eq(budgets.id, id), eq(budgets.workspaceId, workspaceId)))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ message: "Budget not found or access denied" });
    }
    res.json(updated);
  } catch (error: unknown) {
    log.error("Error updating budget:", error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to update budget" });
  }
});

router.delete('/:id', requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;
    
    const result = await db
      .delete(budgets)
      .where(and(eq(budgets.id, id), eq(budgets.workspaceId, workspaceId)))
      .returning();
    
    if (!result.length) {
      return res.status(404).json({ message: "Budget not found" });
    }
    
    res.json({ message: "Budget deleted successfully" });
  } catch (error: unknown) {
    log.error("Error deleting budget:", error);
    res.status(500).json({ message: "Failed to delete budget" });
  }
});

router.get('/:budgetId/line-items', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { budgetId } = req.params;
    
    const budget = await db
      .select()
      .from(budgets)
      .where(and(
        eq(budgets.id, budgetId),
        eq(budgets.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!budget[0]) {
      return res.status(404).json({ message: "Budget not found" });
    }
    
    const lineItems = await db
      .select()
      .from(budgetLineItems)
      .where(eq(budgetLineItems.budgetId, budgetId))
      .orderBy(budgetLineItems.name);
    
    res.json(lineItems);
  } catch (error: unknown) {
    log.error("Error fetching budget line items:", error);
    res.status(500).json({ message: "Failed to fetch budget line items" });
  }
});

router.post('/:budgetId/line-items', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { budgetId } = req.params;
    
    const budget = await db
      .select()
      .from(budgets)
      .where(and(
        eq(budgets.id, budgetId),
        eq(budgets.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!budget[0]) {
      return res.status(404).json({ message: "Budget not found" });
    }
    
    const validatedData = insertBudgetLineItemSchema.parse({
      ...req.body,
      budgetId,
      workspaceId
    });
    
    const [lineItem] = await db
      .insert(budgetLineItems)
      .values(validatedData)
      .returning();
    
    res.json(lineItem);
  } catch (error: unknown) {
    log.error("Error creating budget line item:", error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to create budget line item" });
  }
});

router.patch('/:budgetId/line-items/:id', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { budgetId, id } = req.params;
    
    const budget = await db
      .select()
      .from(budgets)
      .where(and(
        eq(budgets.id, budgetId),
        eq(budgets.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!budget[0]) {
      return res.status(404).json({ message: "Budget not found" });
    }
    
    const existing = await db
      .select()
      .from(budgetLineItems)
      .where(and(
        eq(budgetLineItems.id, id),
        eq(budgetLineItems.budgetId, budgetId)
      ))
      .limit(1);
    
    if (!existing[0]) {
      return res.status(404).json({ message: "Budget line item not found" });
    }
    
    const validatedData = insertBudgetLineItemSchema.partial().parse(req.body);
    
    const [updated] = await db
      .update(budgetLineItems)
      .set(validatedData)
      .where(eq(budgetLineItems.id, id))
      .returning();
    
    res.json(updated);
  } catch (error: unknown) {
    log.error("Error updating budget line item:", error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to update budget line item" });
  }
});

router.delete('/:budgetId/line-items/:id', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { budgetId, id } = req.params;
    
    const budget = await db
      .select()
      .from(budgets)
      .where(and(
        eq(budgets.id, budgetId),
        eq(budgets.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!budget[0]) {
      return res.status(404).json({ message: "Budget not found" });
    }
    
    const existing = await db
      .select()
      .from(budgetLineItems)
      .where(and(
        eq(budgetLineItems.id, id),
        eq(budgetLineItems.budgetId, budgetId)
      ))
      .limit(1);
    
    if (!existing[0]) {
      return res.status(404).json({ message: "Budget line item not found" });
    }
    
    await db
      .delete(budgetLineItems)
      .where(eq(budgetLineItems.id, id));
    
    res.json({ message: "Budget line item deleted successfully" });
  } catch (error: unknown) {
    log.error("Error deleting budget line item:", error);
    res.status(500).json({ message: "Failed to delete budget line item" });
  }
});

router.get('/:budgetId/variances', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { budgetId } = req.params;
    const { year, month } = req.query;
    
    const budget = await db
      .select()
      .from(budgets)
      .where(and(
        eq(budgets.id, budgetId),
        eq(budgets.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!budget[0]) {
      return res.status(404).json({ message: "Budget not found" });
    }
    
    let query = db
      .select()
      .from(budgetVariances)
      .where(eq(budgetVariances.budgetId, budgetId))
      .orderBy(desc(budgetVariances.year), desc(budgetVariances.month));
    
    let variances = await query;
    
    if (year) {
      variances = variances.filter(v => v.year === parseInt(year as string));
    }
    if (month) {
      variances = variances.filter(v => v.month === parseInt(month as string));
    }
    
    res.json(variances);
  } catch (error: unknown) {
    log.error("Error fetching budget variances:", error);
    res.status(500).json({ message: "Failed to fetch budget variances" });
  }
});

router.post('/:budgetId/variances', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { budgetId } = req.params;
    
    const budget = await db
      .select()
      .from(budgets)
      .where(and(
        eq(budgets.id, budgetId),
        eq(budgets.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!budget[0]) {
      return res.status(404).json({ message: "Budget not found" });
    }
    
    const validatedData = insertBudgetVarianceSchema.parse({
      ...req.body,
      budgetId,
      workspaceId
    });
    
    const [variance] = await db
      .insert(budgetVariances)
      .values(validatedData)
      .returning();
    
    res.json(variance);
  } catch (error: unknown) {
    log.error("Error creating budget variance:", error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to create budget variance" });
  }
});

export default router;
