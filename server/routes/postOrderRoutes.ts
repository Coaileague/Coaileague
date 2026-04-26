import { Router } from "express";
import { db } from "../db";
import { postOrderTemplates, shiftOrders, shiftOrderAcknowledgments, employees, insertPostOrderTemplateSchema } from "@shared/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { z } from "zod";
import { hasManagerAccess, type AuthenticatedRequest } from "../rbac";
import { createLogger } from '../lib/logger';
const log = createLogger('PostOrderRoutes');

const router = Router();

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Missing workspace' });
    const templates = await db
      .select()
      .from(postOrderTemplates)
      .where(eq(postOrderTemplates.workspaceId, workspaceId))
      .orderBy(desc(postOrderTemplates.updatedAt));
    res.json(templates);
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to fetch post orders' });
  }
});

uter.post("/templates", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    if (!workspaceId) return res.status(403).json({ error: "Workspace context required" });

    const validated = insertPostOrderTemplateSchema.parse({
      ...req.body,
      workspaceId,
      createdBy: userId,
    });

    const [template] = await db.insert(postOrderTemplates).values(validated).returning();
    res.status(201).json(template);
  } catch (error: unknown) {
    log.error("Error creating post order template:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create post order template" });
  }
});

outer.delete("/templates/:id", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to delete post order templates" });
    }
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const [deleted] = await db
      .delete(postOrderTemplates)
      .where(and(eq(postOrderTemplates.id, req.params.id), eq(postOrderTemplates.workspaceId, workspaceId)))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Template not found" });
    res.json({ success: true, deleted });
  } catch (error: unknown) {
    log.error("Error deleting post order template:", error);
    res.status(500).json({ error: "Failed to delete post order template" });
  }
});

outer.get("/shift/:shiftId", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const orders = await db
      .select()
      .from(shiftOrders)
      .where(and(eq(shiftOrders.shiftId, req.params.shiftId), eq(shiftOrders.workspaceId, workspaceId)))
      .orderBy(desc(shiftOrders.createdAt));

    res.json(orders);
  } catch (error: unknown) {
    log.error("Error fetching shift orders:", error);
    res.status(500).json({ error: "Failed to fetch shift orders" });
  }
});

router.post("/acknowledge", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const schema = z.object({
      shiftOrderId: z.string(),
      employeeId: z.string(),
      notes: z.string().optional(),
      signatureUrl: z.string().optional(),
    });

    const data = schema.parse(req.body);

    const [order] = await db
      .select()
      .from(shiftOrders)
      .where(and(eq(shiftOrders.id, data.shiftOrderId), eq(shiftOrders.workspaceId, workspaceId)));

    if (!order) return res.status(404).json({ error: "Shift order not found" });

    const [ack] = await db
      .insert(shiftOrderAcknowledgments)
      .values({
        workspaceId,
        shiftOrderId: data.shiftOrderId,
        employeeId: data.employeeId,
        notes: data.notes,
        signatureUrl: data.signatureUrl,
        signedAt: data.signatureUrl ? new Date() : null,
      })
      .onConflictDoNothing()
      .returning();

    if (!ack) {
      return res.status(409).json({ error: "Already acknowledged" });
    }

    res.status(201).json(ack);
  } catch (error: unknown) {
    log.error("Error acknowledging post order:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    res.status(500).json({ error: "Failed to acknowledge post order" });
  }
});

outer.get("/tracking", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const orders = await db
      .select({
        id: shiftOrders.id,
        shiftId: shiftOrders.shiftId,
        title: shiftOrders.title,
        description: shiftOrders.description,
        priority: shiftOrders.priority,
        requiresAcknowledgment: shiftOrders.requiresAcknowledgment,
        requiresSignature: shiftOrders.requiresSignature,
        requiresPhotos: shiftOrders.requiresPhotos,
        createdAt: shiftOrders.createdAt,
        ackCount: sql<number>`(SELECT COUNT(*) FROM shift_order_acknowledgments WHERE shift_order_id = ${shiftOrders.id})`.as('ack_count'),
      })
      .from(shiftOrders)
      .where(eq(shiftOrders.workspaceId, workspaceId))
      .orderBy(desc(shiftOrders.createdAt));

    res.json(orders);
  } catch (error: unknown) {
    log.error("Error fetching tracking data:", error);
    res.status(500).json({ error: "Failed to fetch tracking data" });
  }
});

export default router;
