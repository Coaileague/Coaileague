import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import { promotionalBanners } from "@shared/schema";
import { z } from "zod";
import { requirePlatformStaff, type AuthenticatedRequest } from "../rbac";
import { createLogger } from '../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../services/billing/billingConstants';
const log = createLogger('PromotionalBannerRoutes');


const router = Router();

router.get('/active', async (req, res) => {
  try {
    const [activeBanner] = await db
      .select()
      .from(promotionalBanners)
      .where(eq(promotionalBanners.isActive, true))
      .orderBy(desc(promotionalBanners.priority))
      .limit(1);

    res.json(activeBanner || null);
  } catch (error: unknown) {
    log.error("Error fetching active banner:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get('/', async (req, res) => {
  try {
    const banners = await db
      .select()
      .from(promotionalBanners)
      .where(eq(promotionalBanners.isActive, true))
      .orderBy(desc(promotionalBanners.createdAt));

    res.json(banners);
  } catch (error: unknown) {
    log.error("Error fetching banners:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get('/admin/all', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const banners = await db
      .select()
      .from(promotionalBanners)
      .orderBy(desc(promotionalBanners.createdAt));

    res.json(banners);
  } catch (error: unknown) {
    log.error("Error fetching all banners:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post('/', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const schema = z.object({
      message: z.string().min(1, "Message is required"),
      ctaText: z.string().optional(),
      ctaLink: z.string().optional(),
      isActive: z.boolean().default(false),
      priority: z.number().default(0),
    });

    const validationResult = schema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: "Invalid request",
        errors: validationResult.error.errors
      });
    }

    const { message, ctaText, ctaLink, isActive, priority } = validationResult.data;

    if (isActive) {
      await db
        .update(promotionalBanners)
        .set({ isActive: false })
        .where(eq(promotionalBanners.isActive, true));
    }

    const [banner] = await db
      .insert(promotionalBanners)
      .values({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        workspaceId: PLATFORM_WORKSPACE_ID,
        message,
        ctaText,
        ctaLink,
        isActive,
        priority,
        createdBy: userId,
      })
      .returning();

    res.json(banner);
  } catch (error: unknown) {
    log.error("Error creating banner:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.patch('/:id', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    
    const schema = z.object({
      message: z.string().optional(),
      ctaText: z.string().optional(),
      ctaLink: z.string().optional(),
      isActive: z.boolean().optional(),
      priority: z.number().optional(),
    });

    const validationResult = schema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: "Invalid request",
        errors: validationResult.error.errors
      });
    }

    const updates = validationResult.data;

    if (updates.isActive === true) {
      await db
        .update(promotionalBanners)
        .set({ isActive: false })
        .where(eq(promotionalBanners.isActive, true));
    }

    const [updatedBanner] = await db
      .update(promotionalBanners)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(promotionalBanners.id, id))
      .returning();

    if (!updatedBanner) {
      return res.status(404).json({ error: "Banner not found" });
    }

    res.json(updatedBanner);
  } catch (error: unknown) {
    log.error("Error updating banner:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.delete('/:id', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const [deletedBanner] = await db
      .delete(promotionalBanners)
      .where(eq(promotionalBanners.id, id))
      .returning();

    if (!deletedBanner) {
      return res.status(404).json({ error: "Banner not found" });
    }

    res.json({ message: "Banner deleted successfully" });
  } catch (error: unknown) {
    log.error("Error deleting banner:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

export default router;
