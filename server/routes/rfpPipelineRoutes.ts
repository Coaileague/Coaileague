import { Router } from "express";
import { db } from "../db";
import { pipelineDeals, activities, insertPipelineDealSchema, clients, sites } from "@shared/schema";
import { eq, and, desc, count, sql, ilike, inArray } from "drizzle-orm";
import { requireAuth, requireManager, type AuthenticatedRequest } from "../rbac";
import { requirePlan } from '../tierGuards';
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('RfpPipelineRoutes');


const router = Router();
// Sales/RFP pipeline is a Professional+ feature (contract_pipeline, rfp_generation)
router.use(requireAuth);
router.use(requirePlan('professional'));

const VALID_STAGES = ['lead', 'survey', 'rfp', 'proposal', 'contract', 'won', 'lost'] as const;

router.get("/stats", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const deals = await db
      .select()
      .from(pipelineDeals)
      .where(eq(pipelineDeals.workspaceId, workspaceId));

    const stageStats: Record<string, { count: number; totalValue: number }> = {};
    for (const stage of VALID_STAGES) {
      stageStats[stage] = { count: 0, totalValue: 0 };
    }

    let totalDeals = 0;
    let wonDeals = 0;
    let lostDeals = 0;

    for (const deal of deals) {
      const stage = deal.stage || 'lead';
      if (!stageStats[stage]) {
        stageStats[stage] = { count: 0, totalValue: 0 };
      }
      stageStats[stage].count++;
      stageStats[stage].totalValue += parseFloat(deal.estimatedMonthlyValue || '0');
      totalDeals++;
      if (stage === 'won') wonDeals++;
      if (stage === 'lost') lostDeals++;
    }

    const closedDeals = wonDeals + lostDeals;
    const conversionRate = closedDeals > 0 ? (wonDeals / closedDeals) * 100 : 0;

    const totalPipelineValue = Object.values(stageStats)
      .reduce((sum, s) => sum + s.totalValue, 0);

    res.json({
      stageStats,
      totalDeals,
      wonDeals,
      lostDeals,
      conversionRate: Math.round(conversionRate * 10) / 10,
      totalPipelineValue,
    });
  } catch (error: unknown) {
    log.error("Error fetching pipeline stats:", error);
    res.status(500).json({ error: "Failed to fetch pipeline stats" });
  }
});

router.post("/", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const parsed = insertPipelineDealSchema.safeParse({
      ...req.body,
      workspaceId,
    });

    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    if (parsed.data.stage && !VALID_STAGES.includes(parsed.data.stage as any)) {
      return res.status(400).json({ error: `Invalid stage: ${parsed.data.stage}. Must be one of: ${VALID_STAGES.join(', ')}` });
    }

    const [deal] = await db
      .insert(pipelineDeals)
      .values(parsed.data)
      .returning();

    await db.insert(activities).values({
      organizationId: workspaceId,
      workspaceId,
      dealId: deal.id,
      activityType: "deal_created",
      subject: `Deal created for ${deal.prospectCompany}`,
      performedBy: req.user?.id ?? undefined,
      createdByUserId: req.user?.id || 'system',
    });

    res.status(201).json(deal);
  } catch (error: unknown) {
    log.error("Error creating deal:", error);
    res.status(500).json({ error: "Failed to create deal" });
  }
});

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const { stage, search, limit: qLimit, offset: qOffset } = req.query;
    const limit = Math.min(Math.max(parseInt(qLimit as string) || 100, 1), 500);
    const offset = Math.max(parseInt(qOffset as string) || 0, 0);

    let conditions = [eq(pipelineDeals.workspaceId, workspaceId)];

    if (stage && typeof stage === 'string' && VALID_STAGES.includes(stage as any)) {
      conditions.push(eq(pipelineDeals.stage, stage));
    }

    if (search && typeof search === 'string') {
      conditions.push(ilike(pipelineDeals.prospectCompany, `%${search}%`));
    }

    const whereClause = and(...conditions);

    const [totalResult] = await db
      .select({ total: count() })
      .from(pipelineDeals)
      .where(whereClause);

    const deals = await db
      .select()
      .from(pipelineDeals)
      .where(whereClause)
      .orderBy(desc(pipelineDeals.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ items: deals, total: totalResult?.total || 0, limit, offset });
  } catch (error: unknown) {
    log.error("Error listing deals:", error);
    res.status(500).json({ error: "Failed to list deals" });
  }
});

router.get("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [deal] = await db
      .select()
      .from(pipelineDeals)
      .where(and(
        eq(pipelineDeals.id, req.params.id),
        eq(pipelineDeals.workspaceId, workspaceId)
      ));

    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const dealActivities = await db
      .select()
      .from(activities)
      .where(and(eq(activities.dealId, deal.id), eq(activities.workspaceId, workspaceId)))
      .orderBy(desc(activities.createdAt));

    res.json({ ...deal, activities: dealActivities });
  } catch (error: unknown) {
    log.error("Error fetching deal:", error);
    res.status(500).json({ error: "Failed to fetch deal" });
  }
});

router.patch("/:id", requireManager as any, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [existing] = await db
      .select()
      .from(pipelineDeals)
      .where(and(
        eq(pipelineDeals.id, req.params.id),
        eq(pipelineDeals.workspaceId, workspaceId)
      ));

    if (!existing) return res.status(404).json({ error: "Deal not found" });

    const updateData: Record<string, any> = { updatedAt: new Date() };
    const allowedFields = [
      'prospectCompany', 'prospectContactName', 'prospectEmail', 'prospectPhone',
      'source', 'stage', 'estimatedMonthlyValue', 'coverageType', 'estimatedHoursWeekly',
      'numberOfSites', 'siteSurveyScheduledAt', 'siteSurveyCompletedAt', 'siteSurveyNotes',
      'rfpReceivedAt', 'rfpDueDate', 'rfpDocumentUrl', 'rfpResponseUrl',
      'proposalSentAt', 'proposalDocumentUrl', 'proposalAmount',
      'contractSentAt', 'contractSignedAt', 'contractDocumentUrl',
      'contractStartDate', 'contractEndDate',
      'outcomeStatus', 'outcomeLostReason', 'outcomeClosedAt',
      'assignedTo', 'notes',
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    const oldStage = existing.stage;
    const newStage = req.body.stage;

    if (newStage && newStage !== oldStage) {
      if (!VALID_STAGES.includes(newStage)) {
        return res.status(400).json({ error: `Invalid stage: ${newStage}. Must be one of: ${VALID_STAGES.join(', ')}` });
      }

      if (newStage === 'won') {
        updateData.outcomeStatus = 'won';
        updateData.outcomeClosedAt = new Date();
      } else if (newStage === 'lost') {
        updateData.outcomeStatus = 'lost';
        updateData.outcomeClosedAt = new Date();
      }
    }

    const [updated] = await db
      .update(pipelineDeals)
      .set(updateData)
      .where(and(eq(pipelineDeals.id, req.params.id), eq(pipelineDeals.workspaceId, workspaceId)))
      .returning();

    if (newStage && newStage !== oldStage) {
      await db.insert(activities).values({
        organizationId: workspaceId,
        workspaceId,
        dealId: updated.id,
        activityType: "stage_changed",
        subject: `Stage changed from "${oldStage}" to "${newStage}"`,
        performedBy: req.user?.id ?? undefined,
        metadata: { oldStage, newStage },
        createdByUserId: req.user?.id || 'system',
      });

      if (newStage === 'won') {
        await db.insert(activities).values({
          organizationId: workspaceId,
          workspaceId,
          dealId: updated.id,
          activityType: "deal_won",
          subject: `Deal won — flagged for client & site creation for ${updated.prospectCompany}`,
          performedBy: req.user?.id ?? undefined,
          metadata: { autoFlagClientCreation: true },
          createdByUserId: req.user?.id || 'system',
        });
      }
    }

    res.json(updated);
  } catch (error: unknown) {
    log.error("Error updating deal:", error);
    res.status(500).json({ error: "Failed to update deal" });
  }
});

router.post("/:id/activities", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const [deal] = await db
      .select()
      .from(pipelineDeals)
      .where(and(
        eq(pipelineDeals.id, req.params.id),
        eq(pipelineDeals.workspaceId, workspaceId)
      ));

    if (!deal) return res.status(404).json({ error: "Deal not found" });

    if (!req.body.activityType && !req.body.description) {
      return res.status(400).json({ error: "Validation failed", details: "activityType or description required" });
    }

    const [activity] = await db
      .insert(activities)
      .values({
        organizationId: workspaceId,
        workspaceId,
        dealId: deal.id,
        activityType: req.body.activityType || 'note',
        subject: req.body.description || req.body.activityType || 'note',
        notes: req.body.description,
        performedBy: req.user?.id ?? undefined,
        metadata: req.body.metadata || {},
        createdByUserId: req.user?.id || 'system',
      })
      .returning();

    res.status(201).json(activity);
  } catch (error: unknown) {
    log.error("Error adding activity:", error);
    res.status(500).json({ error: "Failed to add activity" });
  }
});

export default router;
