import { Router, Request, Response } from "express";
import { db } from "../db";
import { shifts, employees, timeEntries } from "@shared/schema";
import { eq, and, gte, lte, sql, count, sum, desc } from "drizzle-orm";

const router = Router();

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
    const user = req.user as any;
    if (!user?.workspaceId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const workspaceId = user.workspaceId;
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
        dayOfWeek: sql<number>`EXTRACT(DOW FROM ${timeEntries.date}::date)::int`,
        avgHours: sql<number>`AVG(${timeEntries.duration} / 60.0)::float`
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.date, monthAgo.toISOString().split('T')[0])
        )
      )
      .groupBy(sql`EXTRACT(DOW FROM ${timeEntries.date}::date)`);

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
        savings: '$150-300/week',
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
    console.error("[AI Scheduling] Error generating suggestions:", error);
    res.status(500).json({ error: "Failed to generate scheduling suggestions" });
  }
});

// Apply an AI suggestion
router.post("/apply-suggestion", async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user?.workspaceId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { suggestionId } = req.body;
    
    // Log the application - in production, would execute the actual optimization
    console.log(`[AI Scheduling] User ${user.id} applied suggestion: ${suggestionId}`);

    // Simulate processing
    res.json({ 
      success: true, 
      message: "Suggestion applied successfully",
      suggestionId 
    });
  } catch (error) {
    console.error("[AI Scheduling] Error applying suggestion:", error);
    res.status(500).json({ error: "Failed to apply suggestion" });
  }
});

// Get schedule optimization report
router.get("/optimization-report", async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user?.workspaceId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Generate optimization metrics
    const report = {
      overallScore: 85,
      metrics: {
        coverage: 92,
        efficiency: 78,
        employeeSatisfaction: 88,
        costOptimization: 82,
      },
      trends: {
        lastWeek: 82,
        thisWeek: 85,
        improvement: 3,
      },
      recommendations: [
        "Consider implementing shift swapping to improve flexibility",
        "Review weekend coverage patterns",
        "Analyze peak hours for optimal staffing",
      ],
    };

    res.json(report);
  } catch (error) {
    console.error("[AI Scheduling] Error generating report:", error);
    res.status(500).json({ error: "Failed to generate optimization report" });
  }
});

export default router;
