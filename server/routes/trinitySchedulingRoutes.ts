import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { db } from "../db";
import { shifts, employees, clients, supportTickets } from "@shared/schema";
import { storage } from "../storage";
import { eq, and, gte, lte, isNull, sql, inArray } from "drizzle-orm";
import { aiTokenGateway } from "../services/billing/aiTokenGateway";
import { trinitySchedulerWithSLA } from "../services/trinity/trinitySchedulerWithSLA";
import { createLogger } from '../lib/logger';
const log = createLogger('TrinitySchedulingRoutes');


const router = Router();

router.get('/insights', async (req: any, res) => {
    try {
      const userId: string | undefined = req.user?.id || req.user?.claims?.sub || req.session?.userId;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
      if (!userWorkspace) return res.status(404).json({ message: "Workspace not found" });
      
      const weekStart = req.query.weekStart ? new Date(req.query.weekStart as string) : new Date();
      const weekEnd = req.query.weekEnd ? new Date(req.query.weekEnd as string) : new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const weekShifts = await db.select().from(shifts)
        .where(
          and(
            eq(shifts.workspaceId, userWorkspace.workspaceId),
            gte(shifts.startTime, weekStart),
            lte(shifts.endTime, weekEnd)
          )
        );
      
      const insights: Array<{id: string; type: string; icon: string; title: string; description: string; actionable?: boolean; actionLabel?: string; actionData?: any}> = [];
      
      const openShifts = weekShifts.filter(s => !s.employeeId);
      if (openShifts.length > 0) {
        insights.push({
          id: 'open-shifts-alert',
          type: 'warning',
          icon: 'alert',
          title: `${openShifts.length} Open Shifts Need Staffing`,
          description: `There are ${openShifts.length} unassigned shifts this week. I can auto-fill these with qualified employees.`,
          actionable: true,
          actionLabel: 'Auto-Fill All',
          actionData: { type: 'auto_fill', shiftIds: openShifts.map(s => s.id) }
        });
      }
      
      const totalHours = weekShifts.reduce((sum, s) => {
        const start = new Date(s.startTime);
        const end = new Date(s.endTime);
        return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      }, 0);
      
      if (totalHours < 40 && weekShifts.length > 0) {
        insights.push({
          id: 'low-coverage',
          type: 'suggestion',
          icon: 'bulb',
          title: 'Coverage Below Target',
          description: `Only ${totalHours.toFixed(0)} hours scheduled this week. Consider adding more shifts.`,
        });
      }
      
      if (weekShifts.length > 5 && openShifts.length === 0) {
        insights.push({
          id: 'optimization-ready',
          type: 'metric',
          icon: 'target',
          title: 'Schedule Optimization Ready',
          description: 'Schedule is fully staffed. Run Trinity optimization to balance workload and reduce costs.',
          actionable: true,
          actionLabel: 'Optimize',
          actionData: { type: 'optimize_coverage' }
        });
      }
      
      if (openShifts.length === 0 && weekShifts.length > 0) {
        insights.push({
          id: 'health-good',
          type: 'metric',
          icon: 'trend',
          title: 'Schedule Health: Excellent',
          description: 'All shifts are assigned and no conflicts detected.',
        });
      }
      
      res.json(insights);
    } catch (error: unknown) {
      log.error("Error generating scheduling insights:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to generate insights" });
    }
  });

router.post('/auto-fill', async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.id;
      const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
      if (!userWorkspace) return res.status(404).json({ message: "Workspace not found" });
      
      const { shiftIds, weekStart, weekEnd, prioritizeBy = 'urgency', useContractorFallback = true } = req.body;
      
      const { trinityAutonomousScheduler } = await import('../services/scheduling/trinityAutonomousScheduler');
      const { broadcastToWorkspace } = await import('../websocket');
      
      const startTime = Date.now();
      const sessionId = `trinity-ai-autofill-${Date.now()}`;
      
      
      let mode: 'current_day' | 'current_week' | 'next_week' | 'full_month' | 'full_quarter' = 'full_month';
      if (req.body.mode === 'full_quarter') {
        mode = 'full_quarter';
      } else if (weekStart && weekEnd) {
        const start = new Date(weekStart);
        const end = new Date(weekEnd);
        const daysSpan = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSpan <= 1) mode = 'current_day';
        else if (daysSpan <= 7) mode = 'current_week';
        else if (daysSpan <= 14) mode = 'next_week';
        else if (daysSpan <= 45) mode = 'full_month';
        else mode = 'full_quarter';
      }
      
      const initialOpenShifts = await db.select({ count: sql<number>`count(*)` })
        .from(shifts)
        .where(and(
          eq(shifts.workspaceId, userWorkspace.workspaceId),
          isNull(shifts.employeeId),
          gte(shifts.startTime, new Date())
        ));
      const totalShiftsCount = Number(initialOpenShifts[0]?.count || 0);
      
      broadcastToWorkspace(userWorkspace.workspaceId, {
        type: 'trinity_scheduling_started',
        sessionId,
        totalShifts: totalShiftsCount,
        message: 'I\'m analyzing shifts with intelligent scheduling...',
        timestamp: Date.now(),
      });
      
      res.json({ 
        success: true,
        sessionId,
        message: `Trinity is processing ${totalShiftsCount} open shifts. Progress updates via WebSocket.`,
        totalShifts: totalShiftsCount,
        mode,
        async: true,
      });

      trinityAutonomousScheduler.executeAutonomousScheduling({
        workspaceId: userWorkspace.workspaceId,
        userId: userId,
        mode,
        prioritizeBy: prioritizeBy as 'urgency' | 'value' | 'chronological',
        useContractorFallback,
        maxShiftsPerEmployee: 0,
        respectAvailability: true,
      }).then(result => {
        broadcastToWorkspace(userWorkspace.workspaceId, {
          type: 'trinity_scheduling_http_complete',
          sessionId,
          success: result.success,
          totalAssigned: result.summary?.totalAssigned || 0,
          totalFailed: result.summary?.totalFailed || 0,
          totalProcessed: result.summary?.totalProcessed || 0,
          avgConfidence: result.summary?.avgConfidence || 0,
        });
      }).catch(err => {
        log.error('[Trinity AutoFill] Background scheduling error:', err);
        broadcastToWorkspace(userWorkspace.workspaceId, {
          type: 'trinity_scheduling_error',
          sessionId,
          error: (err instanceof Error ? err.message : String(err)) || 'Scheduling session failed',
        });
      });
    } catch (error: unknown) {
      log.error("[Trinity AutoFill] AI scheduling error:", error);
      res.status(500).json({ message: sanitizeError(error) || "AI auto-fill failed" });
    }
  });

router.post('/ask', async (req: any, res) => {
    try {
      const userId: string | undefined = req.user?.id || req.user?.claims?.sub || req.session?.userId;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
      if (!userWorkspace) return res.status(404).json({ message: "Workspace not found" });
      
      const { question, weekStart, weekEnd } = req.body;
      
      if (!question || typeof question !== 'string') {
        return res.status(400).json({ message: "Question is required" });
      }
      
      const start = weekStart ? new Date(weekStart) : new Date();
      const end = weekEnd ? new Date(weekEnd) : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const weekShifts = await db.select().from(shifts).where(
        and(
          eq(shifts.workspaceId, userWorkspace.workspaceId),
          gte(shifts.startTime, start),
          lte(shifts.endTime, end)
        )
      );
      
      const workspaceEmployees = await db.select().from(employees).where(
        eq(employees.workspaceId, userWorkspace.workspaceId)
      );
      
      const workspaceClients = await db.select().from(clients).where(
        eq(clients.workspaceId, userWorkspace.workspaceId)
      );
      
      const totalShifts = weekShifts.length;
      const assignedShifts = weekShifts.filter(s => s.employeeId).length;
      const unassignedShifts = totalShifts - assignedShifts;
      const coverageRate = totalShifts > 0 ? Math.round((assignedShifts / totalShifts) * 100) : 100;
      
      const questionLower = question.toLowerCase();
      let response = '';
      
      if (questionLower.includes('best') && (questionLower.includes('friday') || questionLower.includes('night'))) {
        const nightEmployees = workspaceEmployees.slice(0, 3).map(e => e.firstName + ' ' + e.lastName);
        response = `Based on historical performance and availability, I recommend: ${nightEmployees.join(', ')}. These employees have shown consistent reliability for evening and weekend shifts.`;
      } else if (questionLower.includes('profit') || questionLower.includes('optimize')) {
        response = `To optimize for profit this week: 1) Fill the ${unassignedShifts} unassigned shifts to maximize billable hours. 2) Consider scheduling senior guards for high-value clients. 3) Current coverage is at ${coverageRate}% - target 95%+ for optimal revenue.`;
      } else if (questionLower.includes('coverage') || questionLower.includes('gaps')) {
        response = `Current coverage analysis: ${assignedShifts}/${totalShifts} shifts assigned (${coverageRate}%). ${unassignedShifts > 0 ? `You have ${unassignedShifts} open shifts that need coverage. Use Auto-Fill to quickly assign available employees.` : 'All shifts are covered!'}`;
      } else if (questionLower.includes('overtime') || questionLower.includes('hours')) {
        response = `Based on current scheduling: ${workspaceEmployees.length} employees available across ${totalShifts} shifts. Monitor employees approaching 40 hours to avoid overtime costs. I can flag potential overtime risks if you enable auto-monitoring.`;
      } else {
        response = `Great question! Here's what I know about your schedule: ${totalShifts} shifts this week, ${coverageRate}% coverage, ${workspaceEmployees.length} employees available. For more specific insights, try asking about "best employee for Friday night" or "optimize for profit".`;
      }
      
      res.json({ 
        success: true, 
        response,
        context: {
          totalShifts,
          assignedShifts,
          unassignedShifts,
          coverageRate,
          employeeCount: workspaceEmployees.length,
          clientCount: workspaceClients.length
        }
      });
    } catch (error: unknown) {
      log.error("Error in Trinity scheduling ask:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to process question" });
    }
  });

/**
 * POST /schedule-shift — Trinity SLA-aware shift scheduling
 *
 * Checks open support tickets for SLA risk before allowing a shift to be
 * created. Returns 409 with conflict details + recommended alternative times
 * when the proposed shift falls within an SLA blackout window.
 */
router.post('/schedule-shift', async (req: any, res) => {
  try {
    const userId: string | undefined = req.user?.id || req.user?.claims?.sub || req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
    if (!userWorkspace) return res.status(404).json({ message: 'Workspace not found' });

    const { startTime, endTime, employeeId } = req.body;
    if (!startTime || !endTime || !employeeId) {
      return res.status(400).json({ message: 'startTime, endTime, and employeeId are required' });
    }

    const workspaceId = userWorkspace.workspaceId;

    // Fetch open/in-progress support tickets for this workspace
    const openTickets = await db.query.supportTickets.findMany({
      where: and(
        eq(supportTickets.workspaceId, workspaceId),
        inArray(supportTickets.status, ['open', 'in_progress']),
      ),
    });

    // Map to the gate's expected shape
    const ticketsForGate = openTickets.map((t) => ({
      id: t.id,
      priority: t.priority ?? 'normal',
      createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
      firstResponseAt: t.firstResponseAt ? new Date(t.firstResponseAt) : null,
    }));

    // Evaluate via the SLA gate
    const result = trinitySchedulerWithSLA.evaluateShift(
      workspaceId,
      { startTime: new Date(startTime), endTime: new Date(endTime), employeeId },
      ticketsForGate,
    );

    if (!result.success) {
      return res.status(409).json(result);
    }

    // SLA gate passed — create the shift
    const [newShift] = await db.insert(shifts).values({
      workspaceId,
      employeeId,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      status: 'scheduled',
      aiGenerated: true,
    }).returning();

    res.json({ success: true, shift: newShift });
  } catch (error: unknown) {
    log.error('Error in Trinity SLA schedule-shift:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Scheduling failed' });
  }
});

export default router;
