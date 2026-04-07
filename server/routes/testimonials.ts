/**
 * Testimonial Collection System
 * 
 * Auto-prompts clients after 30 days of usage.
 * Allows 1-click approval to publish testimonials on landing pages.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { workspaces, users, platformRoles } from "@shared/schema";
import { eq, and, desc, sql, lt, isNull, gte, inArray } from "drizzle-orm";
import { requireAuth } from "../auth";
import { createLogger } from '../lib/logger';
const log = createLogger('Testimonials');


const router = Router();

// In-memory testimonial store (can be migrated to DB table later)
interface Testimonial {
  id: string;
  workspaceId: string;
  userId: string;
  userName: string;
  companyName: string;
  industry: string;
  rating: number;
  quote: string;
  title?: string;
  photoUrl?: string;
  isApproved: boolean;
  isPublished: boolean;
  createdAt: Date;
  publishedAt?: Date;
}

// Simple in-memory store for MVP
const testimonials: Testimonial[] = [
  {
    id: "demo-1",
    workspaceId: "demo",
    userId: "demo",
    userName: "Michael Rodriguez",
    companyName: "SecurePoint Protection Services",
    industry: "security",
    rating: 5,
    quote: "CoAIleague cut our scheduling time by 70%. Trinity AI predicts coverage gaps before they happen. Game changer for our 50-guard operation.",
    title: "Operations Director",
    isApproved: true,
    isPublished: true,
    createdAt: new Date("2025-11-15"),
    publishedAt: new Date("2025-11-20"),
  },
  {
    id: "demo-2",
    workspaceId: "demo",
    userId: "demo",
    userName: "Sarah Chen",
    companyName: "Allied Guard Services",
    industry: "security",
    rating: 5,
    quote: "The GPS time tracking dramatically reduced timesheet discrepancies. We recovered significant time and reduced billing disputes in the first quarter.",
    title: "CEO",
    isApproved: true,
    isPublished: true,
    createdAt: new Date("2025-10-20"),
    publishedAt: new Date("2025-10-25"),
  },
  {
    id: "demo-3",
    workspaceId: "demo",
    userId: "demo",
    userName: "James Thompson",
    companyName: "Metro Security Group",
    industry: "security",
    rating: 5,
    quote: "Finally a system that handles 50-state labor compliance automatically. Our HR team can focus on people instead of paperwork.",
    title: "HR Manager",
    isApproved: true,
    isPublished: true,
    createdAt: new Date("2025-12-01"),
    publishedAt: new Date("2025-12-05"),
  },
];

const submitTestimonialSchema = z.object({
  rating: z.number().min(1).max(5),
  quote: z.string().min(10).max(500),
  title: z.string().optional(),
  allowPublish: z.boolean().default(false),
});

// GET /api/testimonials/public - Get published testimonials (no auth)
router.get("/public", async (_req: Request, res: Response) => {
  try {
    const published = testimonials.filter(t => t.isPublished);
    res.json(published.map(t => ({
      id: t.id,
      userName: t.userName,
      companyName: t.companyName,
      industry: t.industry,
      rating: t.rating,
      quote: t.quote,
      title: t.title,
      photoUrl: t.photoUrl,
    })));
  } catch (error) {
    log.error("Error fetching testimonials:", error);
    res.status(500).json({ error: "Failed to fetch testimonials" });
  }
});

// GET /api/testimonials/prompt-status - Check if user should be prompted
router.get("/prompt-status", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string; workspaceId?: string };
    if (!user?.id || !user?.workspaceId) {
      return res.json({ shouldPrompt: false });
    }

    // Check if workspace is at least 30 days old
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, user.workspaceId),
    });

    if (!workspace?.createdAt) {
      return res.json({ shouldPrompt: false });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const isOldEnough = new Date(workspace.createdAt) < thirtyDaysAgo;

    // Check if user already submitted a testimonial
    const existing = testimonials.find(
      t => t.workspaceId === user.workspaceId && t.userId === user.id
    );

    res.json({
      shouldPrompt: isOldEnough && !existing,
      workspaceAge: Math.floor(
        (Date.now() - new Date(workspace.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      ),
      hasSubmitted: !!existing,
    });
  } catch (error) {
    log.error("Error checking prompt status:", error);
    res.json({ shouldPrompt: false });
  }
});

// POST /api/testimonials - Submit a testimonial
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string; workspaceId?: string; firstName?: string; lastName?: string };
    if (!user?.id || !user?.workspaceId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const validated = submitTestimonialSchema.parse(req.body);

    // Get workspace info
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, user.workspaceId),
    });

    if (!workspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    const testimonial: Testimonial = {
      id: crypto.randomUUID(),
      workspaceId: user.workspaceId,
      userId: user.id,
      userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Anonymous',
      companyName: workspace.name || 'Anonymous Company',
      industry: workspace.industry || 'security',
      rating: validated.rating,
      quote: validated.quote,
      title: validated.title,
      isApproved: validated.allowPublish,
      isPublished: false, // Requires admin approval
      createdAt: new Date(),
    };

    testimonials.push(testimonial);

    res.status(201).json({
      success: true,
      message: validated.allowPublish 
        ? "Thank you! Your testimonial will be reviewed and published soon."
        : "Thank you for your feedback!",
      testimonialId: testimonial.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    log.error("Error submitting testimonial:", error);
    res.status(500).json({ error: "Failed to submit testimonial" });
  }
});

// GET /api/testimonials/pending - Get pending testimonials (admin only)
router.get("/pending", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string };
    const [adminRole] = await db.select({ role: platformRoles.role }).from(platformRoles)
      .where(and(eq(platformRoles.userId, user.id || ''), inArray(platformRoles.role, ['root_admin', 'deputy_admin'] as any), isNull(platformRoles.revokedAt))).limit(1);
    if (!adminRole) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const pending = testimonials.filter(t => t.isApproved && !t.isPublished);
    res.json(pending);
  } catch (error) {
    log.error("Error fetching pending testimonials:", error);
    res.status(500).json({ error: "Failed to fetch pending testimonials" });
  }
});

// POST /api/testimonials/:id/publish - Publish a testimonial (admin only)
router.post("/:id/publish", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string };
    const [adminRole] = await db.select({ role: platformRoles.role }).from(platformRoles)
      .where(and(eq(platformRoles.userId, user.id || ''), inArray(platformRoles.role, ['root_admin', 'deputy_admin'] as any), isNull(platformRoles.revokedAt))).limit(1);
    if (!adminRole) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { id } = req.params;
    const testimonial = testimonials.find(t => t.id === id);

    if (!testimonial) {
      return res.status(404).json({ error: "Testimonial not found" });
    }

    testimonial.isPublished = true;
    testimonial.publishedAt = new Date();

    res.json({ success: true, message: "Testimonial published" });
  } catch (error) {
    log.error("Error publishing testimonial:", error);
    res.status(500).json({ error: "Failed to publish testimonial" });
  }
});

export default router;
