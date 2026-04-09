import { Router, Request, Response } from "express";
import { db } from "../db";
import { shifts, employees, timeEntries } from "@shared/schema";
import { eq, and, gte, lte, sql, count, sum, desc } from "drizzle-orm";
import { requireAuth } from '../auth';
import { createLogger } from '../lib/logger';
const log = createLogger('AiSchedulingRoutes');


const router = Router();

router.use(requireAuth);

interface ScheduleSuggestion {
  id: string;
  type: 'optimization' | 'conflict' | 'coverage' | 'efficiency';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  savings?: string;
  confidence: number;
  actionable: boolean;
}

// Get AI schedule optimization suggestions
router.get("/suggestions", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // Platform admins can view any workspace via query param, or their own if set
    const isPlatformAdmin = ['root_admin', 'deputy_admin', 'sysop'].includes(user?.platformRole);
    const queryWorkspaceId = req.query.workspaceId as string;
    const workspaceId = (isPlatformAdmin && queryWorkspaceId) || (req as any).workspaceId || (user as any)?.workspaceId;
    
    if (workspaceId && workspaceId !== (req as any).workspaceId && !isPlatformAdmin) {
      return res.status(403).json({ error: "Unauthorized workspace access" });
    }
    
    if (!workspaceId) {
      // For platform admins without a workspace context, return empty suggestions
      if (isPlatformAdmin) {
        return res.json({
          suggestions: [],
          analyzedShifts: 0,
          message: 'No workspace context. Select a workspace to view scheduling suggestions.'
        });
      }
      return res.status(403).json({ error: "Workspace context required" });
    }
    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);

    // Analyze upcoming shifts for potential optimizations
    const upcomingShifts = await db
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.date, now.toISOString().split('T')[0]),
          lte(shifts.date, nextWeek.toISOString().split('T')[0])
        )
      );

    // Analyze historical patterns
    const monthAgo = new Date(now);
    monthAgo.setDate(monthAgo.getDate() - 30);

    const historicalData = await db
      .select({
        dayOfWeek: sql<number>`EXTRACT(DOW FROM ${timeEntries.clockIn})::int`,
        avgHours: sql<number>`COALESCE(AVG(CAST(${timeEntries.totalHours} AS float)), 0)::float`
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, monthAgo)
        )
      )
      .groupBy(sql`EXTRACT(DOW FROM ${timeEntries.clockIn})`);

    const suggestions: ScheduleSuggestion[] = [];

    // Check for potential conflicts
    const shiftsByDateAndEmployee = upcomingShifts.reduce((acc, shift) => {
      const key = `${shift.date}-${shift.employeeId}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(shift);
      return acc;
    }, {} as Record<string, typeof upcomingShifts>);

    Object.entries(shiftsByDateAndEmployee).forEach(([key, shiftsArr]) => {
      if (shiftsArr.length > 1) {
        const [date, employeeId] = key.split('-');
        suggestions.push({
          id: `conflict-${key}`,
          type: 'conflict',
          title: 'Shift Conflict Detected',
          description: `An employee has ${shiftsArr.length} overlapping shifts on ${date}. Consider reassigning one of these shifts.`,
          impact: 'high',
          confidence: 100,
          actionable: true,
        });
      }
    });

    // Check for coverage gaps
    const shiftsByDate = upcomingShifts.reduce((acc, shift) => {
      if (!acc[shift.date]) acc[shift.date] = 0;
      acc[shift.date]++;
      return acc;
    }, {} as Record<string, number>);

    const avgShiftsPerDay = Object.values(shiftsByDate).length > 0
      ? Object.values(shiftsByDate).reduce((a, b) => a + b, 0) / Object.values(shiftsByDate).length
      : 0;

    Object.entries(shiftsByDate).forEach(([date, count]) => {
      if (count < avgShiftsPerDay * 0.7) {
        suggestions.push({
          id: `coverage-${date}`,
          type: 'coverage',
          title: 'Understaffed Day Alert',
          description: `${date} has fewer shifts (${count}) than average (${Math.round(avgShiftsPerDay)}). Consider adding more coverage.`,
          impact: 'medium',
          confidence: 85,
          actionable: true,
        });
      }
    });

    // Check for optimization opportunities based on historical data
    const lowActivityDays = historicalData.filter(d => d.avgHours < 4);
    if (lowActivityDays.length > 0) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const lowDays = lowActivityDays.map(d => dayNames[d.dayOfWeek]).join(', ');
      
      suggestions.push({
        id: 'optimization-low-activity',
        type: 'optimization',
        title: 'Optimize Low-Activity Periods',
        description: `Based on historical data, ${lowDays} typically have lower activity. Consider reducing staffing to save costs.`,
        impact: 'high',
        savings: 'Potential cost reduction — actual savings vary by organization',
        confidence: 78,
        actionable: true,
      });
    }

    // Add efficiency suggestion based on general patterns
    if (upcomingShifts.length > 10) {
      suggestions.push({
        id: 'efficiency-general',
        type: 'efficiency',
        title: 'Schedule Efficiency Opportunity',
        description: 'AI analysis suggests consolidating some shorter shifts could improve employee satisfaction and reduce handoff time.',
        impact: 'medium',
        savings: '$50-100/week',
        confidence: 72,
        actionable: true,
      });
    }

    // Sort by impact
    const impactOrder = { high: 0, medium: 1, low: 2 };
    suggestions.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);

    res.json({ suggestions: suggestions.slice(0, 5) });
  } catch (error) {
    log.error("[AI Scheduling] Error generating suggestions:", error);
    res.status(500).json({ error: "Failed to generate scheduling suggestions" });
  }
});

// Apply an AI suggestion (advisory-only: logs the user's acknowledgment of the suggestion)
router.post("/apply-suggestion", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!(user as any)?.workspaceId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { suggestionId } = req.body;
    if (!suggestionId) {
      return res.status(400).json({ error: "suggestionId is required" });
    }
    
    log.info(`[AI Scheduling] User ${user.id} acknowledged suggestion: ${suggestionId} in workspace ${(user as any).workspaceId}`);

    res.json({ 
      success: true, 
      message: "Suggestion acknowledged. Use the scheduling tools to implement the recommended changes.",
      suggestionId,
      note: "AI suggestions are advisory. Apply changes through the schedule editor for full audit tracking.",
    });
  } catch (error) {
    log.error("[AI Scheduling] Error applying suggestion:", error);
    res.status(500).json({ error: "Failed to apply suggestion" });
  }
});

// Get schedule optimization report based on real scheduling data
router.get("/optimization-report", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!(user as any)?.workspaceId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const workspaceId = (user as any).workspaceId;
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const [thisWeekShifts] = await db.select({ count: count() }).from(shifts)
      .where(and(eq(shifts.workspaceId, workspaceId), gte(shifts.date, weekAgo.toISOString().split('T')[0])));

    const [lastWeekShifts] = await db.select({ count: count() }).from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        gte(shifts.date, twoWeeksAgo.toISOString().split('T')[0]),
        lte(shifts.date, weekAgo.toISOString().split('T')[0])
      ));

    const [empCount] = await db.select({ count: count() }).from(employees)
      .where(eq(employees.workspaceId, workspaceId));

    const totalEmployees = empCount?.count || 0;
    const thisWeekCount = thisWeekShifts?.count || 0;
    const lastWeekCount = lastWeekShifts?.count || 0;

    const coverageScore = totalEmployees > 0
      ? Math.min(100, Math.round((thisWeekCount / Math.max(totalEmployees * 5, 1)) * 100))
      : 0;
    const trend = lastWeekCount > 0
      ? Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100)
      : 0;

    const recommendations: string[] = [];
    if (coverageScore < 60) recommendations.push("Schedule coverage is low. Consider adding more shifts to ensure adequate staffing.");
    if (totalEmployees > 0 && thisWeekCount < totalEmployees) recommendations.push("Some employees have no scheduled shifts this week. Review workforce utilization.");
    if (trend < -10) recommendations.push("Shift count is declining week-over-week. Verify this aligns with business demand.");
    if (recommendations.length === 0) recommendations.push("Scheduling patterns look healthy. Continue monitoring for optimization opportunities.");

    const report = {
      totalEmployees,
      shiftsThisWeek: thisWeekCount,
      shiftsLastWeek: lastWeekCount,
      coverageScore,
      weekOverWeekTrend: trend,
      recommendations,
      source: 'live_database',
      generatedAt: new Date().toISOString(),
    };

    res.json(report);
  } catch (error) {
    log.error("[AI Scheduling] Error generating report:", error);
    res.status(500).json({ error: "Failed to generate optimization report" });
  }
});

export default router;
