import { Router } from "express";
import { db } from "../db";
import { siteBriefings, insertSiteBriefingSchema } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { hasManagerAccess, type AuthenticatedRequest } from "../rbac";
import { createLogger } from '../lib/logger';
const log = createLogger('SiteBriefingRoutes');


const router = Router();

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const briefings = await db
      .select()
      .from(siteBriefings)
      .where(eq(siteBriefings.workspaceId, workspaceId))
      .orderBy(desc(siteBriefings.updatedAt));

    res.json(briefings);
  } catch (error: unknown) {
    log.error("Error listing site briefings:", error);
    res.status(500).json({ error: "Failed to list site briefings" });
  }
});

router.get("/site/:siteId", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const [briefing] = await db
      .select()
      .from(siteBriefings)
      .where(and(eq(siteBriefings.siteId, req.params.siteId), eq(siteBriefings.workspaceId, workspaceId)));

    if (!briefing) return res.status(404).json({ error: "No briefing for this site" });
    res.json(briefing);
  } catch (error: unknown) {
    log.error("Error fetching site briefing by site:", error);
    res.status(500).json({ error: "Failed to fetch site briefing" });
  }
});

router.get("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const [briefing] = await db
      .select()
      .from(siteBriefings)
      .where(and(eq(siteBriefings.id, req.params.id), eq(siteBriefings.workspaceId, workspaceId)));

    if (!briefing) return res.status(404).json({ error: "Site briefing not found" });
    res.json(briefing);
  } catch (error: unknown) {
    log.error("Error fetching site briefing:", error);
    res.status(500).json({ error: "Failed to fetch site briefing" });
  }
});

router.post("/", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    if (!workspaceId) return res.status(403).json({ error: "Workspace context required" });

    const validated = insertSiteBriefingSchema.parse({
      ...req.body,
      workspaceId,
      lastUpdatedBy: userId,
    });

    const [briefing] = await db.insert(siteBriefings).values(validated).returning();
    res.status(201).json(briefing);
  } catch (error: unknown) {
    log.error("Error creating site briefing:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create site briefing" });
  }
});

router.patch("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to update site briefings" });
    }
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    if (!workspaceId) return res.status(403).json({ error: "Workspace context required" });

    const [existing] = await db
      .select()
      .from(siteBriefings)
      .where(and(eq(siteBriefings.id, req.params.id), eq(siteBriefings.workspaceId, workspaceId)));

    if (!existing) return res.status(404).json({ error: "Site briefing not found" });

    const updateData = insertSiteBriefingSchema.partial().parse(req.body);
    delete (updateData as any).workspaceId;

    const [updated] = await db
      .update(siteBriefings)
      .set({ ...updateData, lastUpdatedBy: userId, updatedAt: new Date() })
      .where(and(eq(siteBriefings.id, req.params.id), eq(siteBriefings.workspaceId, workspaceId)))
      .returning();

    res.json(updated);
  } catch (error: unknown) {
    log.error("Error updating site briefing:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update site briefing" });
  }
});

router.delete("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to delete site briefings" });
    }
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Missing workspace" });

    const [deleted] = await db
      .delete(siteBriefings)
      .where(and(eq(siteBriefings.id, req.params.id), eq(siteBriefings.workspaceId, workspaceId)))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Site briefing not found" });
    res.json({ success: true, deleted });
  } catch (error: unknown) {
    log.error("Error deleting site briefing:", error);
    res.status(500).json({ error: "Failed to delete site briefing" });
  }
});

export default router;
