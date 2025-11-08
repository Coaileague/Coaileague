/**
 * ScheduleOS™ - INTELLIGENT AUTO-SCHEDULING ENGINE
 * 
 * Integrates with ALL WorkforceOS™ systems for comprehensive scheduling:
 * - TalentOS™: Performance scores, attendance rates, composite scores
 * - ClockOS™: Tardiness, no-call-no-show, time entry violations
 * - BillOS™: Automatic client billing from scheduled hours
 * - Geo-Compliance: Location-based assignment (employee address to job site distance)
 * - Availability: Day/time preferences, max hours
 * - Years of Service: Seniority-based prioritization
 * - Disciplinary Tracking: Compliance violations, GPS violations
 * - Risk Forecasting: Warns when scheduling unreliable employees
 * - Auto-Replacement: Finds backup when employee denies assignment
 * - Penalty Queue: Denied assignments send employee to back of pool
 */

import OpenAI from 'openai';
import { db } from "../db";
import { 
  employees, shifts, timeEntries, clients, performanceReviews,
  timeEntryDiscrepancies, onboardingApplications, employeeAvailability
} from "@shared/schema";
import { eq, and, gte, lte, sql, desc, count } from "drizzle-orm";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface ScheduleRequest {
  workspaceId: string;
  userId?: string; // Track which user initiated AI scheduling (for billing)
  weekStartDate: Date;
  clientIds?: string[];
  shiftRequirements: {
    title: string;
    clientId: string;
    startTime: Date;
    endTime: Date;
    requiredEmployees: number;
    requiredSkills?: string[];
    jobSiteAddress?: string;
    jobSiteLatitude?: number;
    jobSiteLongitude?: number;
  }[];
}

interface EmployeeIntelligence {
  employeeId: string;
  employeeName: string;
  
  // TalentOS™ Performance Data
  performanceScore: number; // 0-100 from latest review
  performanceTier: string; // 'exceptional', 'exceeds', 'meets', 'needs_improvement', 'unsatisfactory'
  attendanceRate: number; // Percentage
  compositeScore: number; // Overall TalentOS™ score
  
  // ClockOS™ Attendance & Punctuality
  tardyCount: number; // Last 90 days
  noCallNoShowCount: number; // Last 90 days
  onTimeClockInRate: number; // Percentage
  totalHoursWorked: number; // Last 90 days
  
  // Disciplinary & Compliance
  gpsViolations: number; // Geo-compliance violations
  complianceViolations: number; // From performance reviews
  safetyIncidents: number; // From performance reviews
  
  // Availability & Preferences (NEW: from employeeAvailability table with time windows)
  availability: {
    monday: { available: boolean; startTime?: string; endTime?: string };
    tuesday: { available: boolean; startTime?: string; endTime?: string };
    wednesday: { available: boolean; startTime?: string; endTime?: string };
    thursday: { available: boolean; startTime?: string; endTime?: string };
    friday: { available: boolean; startTime?: string; endTime?: string };
    saturday: { available: boolean; startTime?: string; endTime?: string };
    sunday: { available: boolean; startTime?: string; endTime?: string };
  };
  preferredShiftTime: string; // 'morning', 'afternoon', 'evening', 'night'
  maxHoursPerWeek: number;
  
  // Seniority & Experience
  yearsOfService: number;
  employmentStartDate: Date;
  
  // Location Data (for distance-based assignment)
  homeAddress: string;
  homeCity: string;
  homeState: string;
  homeZipCode: string;
  
  // Assignment History (for penalty queue)
  deniedShiftsLast30Days: number;
  lastDenialDate?: Date | null;
  penaltyQueuePosition: number; // Higher = back of queue
  
  // Calculated Scores
  reliabilityScore: number; // 0-100 composite of all factors
  riskScore: number; // 0-100 (higher = riskier to schedule)
}

interface ScheduleResult {
  success: boolean;
  scheduleDate: Date;
  shiftsGenerated: number;
  employeesScheduled: number;
  conflicts: string[];
  warnings: string[]; // Risk warnings
  recommendations: string[];
  generatedShifts: Array<{
    employeeId: string;
    employeeName: string;
    clientId: string;
    title: string;
    startTime: Date;
    endTime: Date;
    requiresAcknowledgment: boolean;
    aiGenerated: true;
    aiConfidenceScore: number;
    riskScore: number;
    riskFactors: string[];
    distanceFromHomeKm?: number;
    billableHours: number;
    estimatedCost: number;
  }>;
  processingTimeMs: number;
}

// ============================================================================
// SCHEDULEOS™ AI ENGINE
// ============================================================================

export class ScheduleOSAI {
  private openai: OpenAI;

  constructor() {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    
    this.openai = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }

  /**
   * MAIN SCHEDULE GENERATION ENGINE
   * Pulls from TalentOS™, ClockOS™, Geo-Compliance, and all integrated systems
   */
  async generateSchedule(request: ScheduleRequest): Promise<ScheduleResult> {
    const startTime = Date.now();
    
    console.log(`[ScheduleOS™] Generating intelligent schedule for week ${request.weekStartDate.toISOString()}`);
    
    // 1. Get comprehensive employee intelligence from all systems
    const employeeIntelligence = await this.gatherEmployeeIntelligence(
      request.workspaceId,
      request.weekStartDate
    );
    
    console.log(`[ScheduleOS™] Analyzed ${employeeIntelligence.length} employees across all systems`);
    
    // 2. Get job site data for location-based assignment
    const jobSites = await this.getJobSiteData(request.clientIds || [], request.workspaceId);
    
    // 3. Check existing shifts to avoid conflicts
    const weekEndDate = new Date(request.weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 7);
    
    const existingShifts: any[] = await db
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.workspaceId, request.workspaceId),
          gte(shifts.startTime, request.weekStartDate),
          lte(shifts.startTime, weekEndDate)
        )
      );

    // 4. Build comprehensive AI prompt with all intelligence data
    const aiPrompt = this.buildIntelligentSchedulingPrompt(
      employeeIntelligence,
      request.shiftRequirements,
      existingShifts,
      jobSites
    );

    // 5. Call GPT-4 for intelligent scheduling
    console.log(`[ScheduleOS™] Calling GPT-4 for AI-powered scheduling...`);
    const aiResponse = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are ScheduleOS™, the most advanced AI workforce scheduling system ever built. You integrate data from TalentOS™ (performance scores), ClockOS™ (attendance/tardiness), geo-compliance (location tracking), and disciplinary records to generate optimal schedules.

CRITICAL RULES:
1. ALWAYS prioritize reliable employees (high performance, low tardiness, good attendance)
2. NEVER schedule employees with high risk scores for critical shifts
3. Account for travel distance - prefer employees closer to job sites
4. Respect availability and max hours per week
5. Flag ANY risky assignments (high tardiness, far distance, low performance)
6. Employees in penalty queue (recent denials) should be last choice
7. Calculate exact billable hours and warn about scheduling risks`,
        },
        {
          role: 'user',
          content: aiPrompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2, // Very low temperature for consistent, logical scheduling
    });

    // USAGE-BASED BILLING: Track AI token usage for customer billing
    const { usageMeteringService } = await import('../services/billing/usageMetering');
    const tokenUsage = aiResponse.usage;
    if (tokenUsage && request.workspaceId) {
      await usageMeteringService.recordUsage({
        workspaceId: request.workspaceId,
        userId: request.userId,
        featureKey: 'scheduleos_ai_generation',
        units: tokenUsage.total_tokens,
        metadata: {
          model: 'gpt-4',
          promptTokens: tokenUsage.prompt_tokens,
          completionTokens: tokenUsage.completion_tokens,
          shiftsGenerated: request.shiftRequirements.length,
        },
      });
      console.log(`[ScheduleOS™] Billed ${tokenUsage.total_tokens} tokens to workspace ${request.workspaceId}`);
    }

    // 6. Parse AI response
    const aiSchedule = JSON.parse(aiResponse.choices[0].message.content || '{}');

    // 7. Transform AI suggestions into shift objects with full metadata
    const generatedShifts = (aiSchedule.shifts || []).map((shift: any): any => {
      const emp = employeeIntelligence.find(e => e.employeeId === shift.employeeId);
      const shiftHours = (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / (1000 * 60 * 60);
      
      return {
        employeeId: shift.employeeId,
        employeeName: shift.employeeName,
        clientId: shift.clientId,
        title: shift.title,
        startTime: new Date(shift.startTime),
        endTime: new Date(shift.endTime),
        requiresAcknowledgment: true,
        aiGenerated: true,
        aiConfidenceScore: shift.confidence || 0.85,
        riskScore: shift.riskScore || (emp?.riskScore || 0) / 100,
        riskFactors: shift.riskFactors || [],
        distanceFromHomeKm: shift.distanceKm,
        billableHours: shiftHours,
        estimatedCost: shiftHours * (emp ? 25 : 20), // Simplified cost estimate
      };
    });

    const processingTimeMs = Date.now() - startTime;

    console.log(`[ScheduleOS™] Generated ${generatedShifts.length} shifts in ${processingTimeMs}ms`);

    return {
      success: true,
      scheduleDate: request.weekStartDate,
      shiftsGenerated: generatedShifts.length,
      employeesScheduled: new Set(generatedShifts.map((s: any) => s.employeeId)).size,
      conflicts: aiSchedule.conflicts || [],
      warnings: aiSchedule.warnings || [], // NEW: Risk warnings
      recommendations: aiSchedule.recommendations || [],
      generatedShifts,
      processingTimeMs,
    };
  }

  /**
   * GATHER COMPREHENSIVE EMPLOYEE INTELLIGENCE
   * Pulls from TalentOS™, ClockOS™, Geo-Compliance, Onboarding, and all integrated systems
   */
  private async gatherEmployeeIntelligence(
    workspaceId: string,
    weekStartDate: Date
  ): Promise<EmployeeIntelligence[]> {
    // Get all active employees
    const allEmployees = await db
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, workspaceId),
          eq(employees.isActive, true)
        )
      );

    const lookbackDate = new Date(weekStartDate);
    lookbackDate.setDate(lookbackDate.getDate() - 90); // Last 90 days for performance analysis

    const employeeIntelligence: EmployeeIntelligence[] = await Promise.all(
      allEmployees.map(async (emp) => {
        // ==================================================================
        // TALENTOS™ PERFORMANCE DATA
        // ==================================================================
        const [latestReview] = await db
          .select()
          .from(performanceReviews)
          .where(eq(performanceReviews.employeeId, emp.id))
          .orderBy(desc(performanceReviews.createdAt))
          .limit(1);

        const performanceScore = latestReview?.compositeScore 
          ? parseFloat(latestReview.compositeScore.toString()) 
          : 70; // Default to "meets expectations"
        
        const attendanceRate = latestReview?.attendanceRate
          ? parseFloat(latestReview.attendanceRate.toString())
          : 95;

        // ==================================================================
        // CLOCKOS™ ATTENDANCE & TARDINESS DATA
        // ==================================================================
        const timeEntriesData = await db
          .select()
          .from(timeEntries)
          .where(
            and(
              eq(timeEntries.employeeId, emp.id),
              gte(timeEntries.clockIn, lookbackDate)
            )
          );

        // Calculate tardiness (clocked in >15 min late)
        const shiftsForEmployee = await db
          .select()
          .from(shifts)
          .where(
            and(
              eq(shifts.employeeId, emp.id),
              gte(shifts.startTime, lookbackDate)
            )
          );

        let tardyCount = 0;
        let onTimeCount = 0;
        for (const shift of shiftsForEmployee) {
          const timeEntry = timeEntriesData.find((te: any) => {
            const clockInTime = new Date(te.clockIn);
            const shiftStart = new Date(shift.startTime);
            const timeDiff = Math.abs(clockInTime.getTime() - shiftStart.getTime());
            return timeDiff < 30 * 60 * 1000; // Within 30 minutes of shift start
          });

          if (timeEntry) {
            const clockInTime = new Date(timeEntry.clockIn);
            const shiftStart = new Date(shift.startTime);
            const minutesLate = (clockInTime.getTime() - shiftStart.getTime()) / (1000 * 60);
            
            if (minutesLate > 15) {
              tardyCount++;
            } else {
              onTimeCount++;
            }
          }
        }

        const totalShifts = shiftsForEmployee.length;
        const onTimeClockInRate = totalShifts > 0 ? (onTimeCount / totalShifts) * 100 : 100;

        // Calculate no-call-no-show (scheduled shift with no time entry)
        const noCallNoShowCount = shiftsForEmployee.filter((shift: any) => {
          const hasTimeEntry = timeEntriesData.some((te: any) => {
            const clockInTime = new Date(te.clockIn);
            const shiftStart = new Date(shift.startTime);
            const timeDiff = Math.abs(clockInTime.getTime() - shiftStart.getTime());
            return timeDiff < 4 * 60 * 60 * 1000; // Within 4 hours
          });
          return !hasTimeEntry && shift.status === 'scheduled';
        }).length;

        const totalHours = timeEntriesData.reduce((sum: number, e: any) => {
          return sum + (parseFloat(e.totalHours?.toString() || '0'));
        }, 0);

        // ==================================================================
        // GEO-COMPLIANCE & DISCIPLINARY DATA
        // ==================================================================
        const [gpsViolationsResult] = await db
          .select({ count: count() })
          .from(timeEntryDiscrepancies)
          .where(
            and(
              eq(timeEntryDiscrepancies.employeeId, emp.id),
              eq(timeEntryDiscrepancies.discrepancyType, 'location_mismatch')
            )
          );

        const gpsViolations = gpsViolationsResult?.count || 0;
        const complianceViolations = latestReview?.complianceViolations || 0;
        const safetyIncidents = latestReview?.safetyIncidents || 0;

        // ==================================================================
        // AVAILABILITY & PREFERENCES (NEW: from employeeAvailability table)
        // ==================================================================
        const [onboardingData] = await db
          .select()
          .from(onboardingApplications)
          .where(eq(onboardingApplications.email, emp.email || ''))
          .limit(1);

        // Pull detailed availability from employeeAvailability table
        const availabilityRecords = await db
          .select()
          .from(employeeAvailability)
          .where(eq(employeeAvailability.employeeId, emp.id));

        // Build availability map with time windows
        const availabilityMap: any = {
          monday: { available: false },
          tuesday: { available: false },
          wednesday: { available: false },
          thursday: { available: false },
          friday: { available: false },
          saturday: { available: false },
          sunday: { available: false },
        };

        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        
        for (const record of availabilityRecords) {
          const dayName = dayNames[record.dayOfWeek];
          availabilityMap[dayName] = {
            available: true,
            startTime: record.startTime,
            endTime: record.endTime,
          };
        }

        // Fallback to onboarding data if no detailed availability exists
        if (availabilityRecords.length === 0) {
          availabilityMap.monday = { available: onboardingData?.availableMonday ?? true };
          availabilityMap.tuesday = { available: onboardingData?.availableTuesday ?? true };
          availabilityMap.wednesday = { available: onboardingData?.availableWednesday ?? true };
          availabilityMap.thursday = { available: onboardingData?.availableThursday ?? true };
          availabilityMap.friday = { available: onboardingData?.availableFriday ?? true };
          availabilityMap.saturday = { available: onboardingData?.availableSaturday ?? false };
          availabilityMap.sunday = { available: onboardingData?.availableSunday ?? false };
        }

        const availability = availabilityMap;

        // ==================================================================
        // YEARS OF SERVICE & SENIORITY
        // ==================================================================
        const employmentStartDate = new Date(emp.createdAt || new Date());
        const yearsOfService = (new Date().getTime() - employmentStartDate.getTime()) / (1000 * 60 * 60 * 24 * 365);

        // ==================================================================
        // SHIFT DENIAL TRACKING (for penalty queue)
        // ==================================================================
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [deniedShiftsResult] = await db
          .select({ count: count() })
          .from(shifts)
          .where(
            and(
              eq(shifts.employeeId, emp.id),
              sql`${shifts.deniedAt} IS NOT NULL`,
              gte(shifts.deniedAt, thirtyDaysAgo)
            )
          );

        const deniedShiftsLast30Days = deniedShiftsResult?.count || 0;

        // Get last denial date
        const [lastDeniedShift] = await db
          .select()
          .from(shifts)
          .where(
            and(
              eq(shifts.employeeId, emp.id),
              sql`${shifts.deniedAt} IS NOT NULL`
            )
          )
          .orderBy(desc(shifts.deniedAt))
          .limit(1);

        const lastDenialDate = lastDeniedShift?.deniedAt;

        // Calculate penalty queue position (higher = more recent denials = back of queue)
        const penaltyQueuePosition = deniedShiftsLast30Days * 100;

        // ==================================================================
        // CALCULATE RELIABILITY & RISK SCORES
        // ==================================================================
        const reliabilityScore = this.calculateReliabilityScore({
          performanceScore,
          attendanceRate,
          onTimeClockInRate,
          tardyCount,
          noCallNoShowCount,
          gpsViolations,
          complianceViolations,
          yearsOfService,
        });

        const riskScore = 100 - reliabilityScore; // Inverse of reliability

        return {
          employeeId: emp.id,
          employeeName: `${emp.firstName} ${emp.lastName}`,
          
          // TalentOS™ data
          performanceScore,
          performanceTier: latestReview?.performanceTier || 'meets',
          attendanceRate,
          compositeScore: performanceScore,
          
          // ClockOS™ data
          tardyCount,
          noCallNoShowCount,
          onTimeClockInRate,
          totalHoursWorked: totalHours,
          
          // Disciplinary data
          gpsViolations: typeof gpsViolations === 'number' ? gpsViolations : 0,
          complianceViolations: typeof complianceViolations === 'number' ? complianceViolations : 0,
          safetyIncidents: typeof safetyIncidents === 'number' ? safetyIncidents : 0,
          
          // Availability
          availability,
          preferredShiftTime: onboardingData?.preferredShiftTime || 'any',
          maxHoursPerWeek: onboardingData?.maxHoursPerWeek || 40,
          
          // Seniority
          yearsOfService,
          employmentStartDate,
          
          // Location data
          homeAddress: onboardingData?.address || 'Unknown',
          homeCity: onboardingData?.city || '',
          homeState: onboardingData?.state || '',
          homeZipCode: onboardingData?.zipCode || '',
          
          // Penalty queue
          deniedShiftsLast30Days,
          lastDenialDate,
          penaltyQueuePosition,
          
          // Scores
          reliabilityScore,
          riskScore,
        };
      })
    );

    // Sort by reliability (best first) and penalty queue (recent denials last)
    return employeeIntelligence.sort((a: EmployeeIntelligence, b: EmployeeIntelligence) => {
      // First sort by penalty queue (fewer denials = higher priority)
      if (a.penaltyQueuePosition !== b.penaltyQueuePosition) {
        return a.penaltyQueuePosition - b.penaltyQueuePosition;
      }
      // Then by reliability
      return b.reliabilityScore - a.reliabilityScore;
    });
  }

  /**
   * CALCULATE COMPREHENSIVE RELIABILITY SCORE
   */
  private calculateReliabilityScore(factors: {
    performanceScore: number;
    attendanceRate: number;
    onTimeClockInRate: number;
    tardyCount: number;
    noCallNoShowCount: number;
    gpsViolations: number;
    complianceViolations: number;
    yearsOfService: number;
  }): number {
    const {
      performanceScore,
      attendanceRate,
      onTimeClockInRate,
      tardyCount,
      noCallNoShowCount,
      gpsViolations,
      complianceViolations,
      yearsOfService,
    } = factors;

    // Weighted scoring system
    let score = 0;

    // Performance (30% weight)
    score += (performanceScore / 100) * 30;

    // Attendance (25% weight)
    score += (attendanceRate / 100) * 25;

    // Punctuality (20% weight)
    score += (onTimeClockInRate / 100) * 20;

    // Penalties for violations
    score -= Math.min(tardyCount * 0.5, 5); // Max -5 points for tardiness
    score -= noCallNoShowCount * 3; // -3 points per no-call-no-show
    score -= gpsViolations * 2; // -2 points per GPS violation
    score -= complianceViolations * 1.5; // -1.5 points per compliance violation

    // Bonus for years of service (up to +10 points)
    score += Math.min(yearsOfService * 2, 10);

    // Clamp between 0-100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * GET JOB SITE DATA FOR LOCATION-BASED ASSIGNMENT
   */
  private async getJobSiteData(clientIds: string[], workspaceId: string): Promise<any[]> {
    if (clientIds.length === 0) {
      return await db.select().from(clients).where(eq(clients.workspaceId, workspaceId));
    }

    return await db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.workspaceId, workspaceId),
          sql`${clients.id} = ANY(${clientIds})`
        )
      );
  }

  /**
   * BUILD COMPREHENSIVE AI PROMPT WITH ALL INTELLIGENCE DATA
   */
  private buildIntelligentSchedulingPrompt(
    employeeIntelligence: EmployeeIntelligence[],
    shiftRequirements: ScheduleRequest['shiftRequirements'],
    existingShifts: any[],
    jobSites: any[]
  ): string {
    return `
You are ScheduleOS™, the world's most advanced AI workforce scheduling system. Generate an optimal schedule using comprehensive employee intelligence data.

═══════════════════════════════════════════════════════════════════════════════
EMPLOYEE INTELLIGENCE (Integrated from TalentOS™, ClockOS™, Geo-Compliance)
═══════════════════════════════════════════════════════════════════════════════
${employeeIntelligence.map((emp: EmployeeIntelligence, idx: number) => `
${idx + 1}. ${emp.employeeName} (ID: ${emp.employeeId})
   ├─ RELIABILITY SCORE: ${emp.reliabilityScore.toFixed(1)}/100 ⭐ | RISK SCORE: ${emp.riskScore.toFixed(1)}/100 ⚠️
   ├─ Performance: ${emp.performanceScore.toFixed(0)}/100 (${emp.performanceTier})
   ├─ Attendance: ${emp.attendanceRate.toFixed(1)}% | On-Time Clock-In: ${emp.onTimeClockInRate.toFixed(1)}%
   ├─ Tardiness: ${emp.tardyCount} times (90d) | No-Call-No-Show: ${emp.noCallNoShowCount} times
   ├─ Violations: ${emp.gpsViolations} GPS, ${emp.complianceViolations} compliance, ${emp.safetyIncidents} safety
   ├─ Years of Service: ${emp.yearsOfService.toFixed(1)} years (joined ${emp.employmentStartDate.toLocaleDateString()})
   ├─ Location: ${emp.homeCity}, ${emp.homeState} ${emp.homeZipCode}
   ├─ Availability: ${Object.entries(emp.availability)
     .filter(([_, v]: any) => v.available)
     .map(([k, v]: any) => {
       const day = k.substring(0, 3).toUpperCase();
       return v.startTime && v.endTime ? `${day} (${v.startTime}-${v.endTime})` : day;
     })
     .join(', ')}
   ├─ Preferred Shift: ${emp.preferredShiftTime} | Max Hours/Week: ${emp.maxHoursPerWeek}
   ├─ Total Hours (90d): ${emp.totalHoursWorked.toFixed(1)}
   └─ ${emp.deniedShiftsLast30Days > 0 ? `⚠️ PENALTY QUEUE: Denied ${emp.deniedShiftsLast30Days} shifts (last: ${emp.lastDenialDate?.toLocaleDateString()})` : '✓ No recent denials'}
`).join('\n')}

═══════════════════════════════════════════════════════════════════════════════
SHIFT REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════════
${shiftRequirements.map((req, idx) => `
${idx + 1}. ${req.title}
   - Client: ${req.clientId}
   - Time: ${req.startTime.toLocaleString()} → ${req.endTime.toLocaleString()}
   - Employees Needed: ${req.requiredEmployees}
   - Skills Required: ${req.requiredSkills?.join(', ') || 'None'}
   - Job Site: ${req.jobSiteAddress || 'Not specified'}
`).join('\n')}

═══════════════════════════════════════════════════════════════════════════════
JOB SITES (for location-based assignment)
═══════════════════════════════════════════════════════════════════════════════
${jobSites.map(site => `
- ${site.name}: ${site.address || 'Address unknown'} ${site.latitude && site.longitude ? `(${site.latitude}, ${site.longitude})` : ''}
`).join('\n')}

═══════════════════════════════════════════════════════════════════════════════
EXISTING SHIFTS (avoid conflicts)
═══════════════════════════════════════════════════════════════════════════════
${existingShifts.length > 0 ? existingShifts.map((s: any) => `
- Employee ${s.employeeId}: ${new Date(s.startTime).toLocaleString()} → ${new Date(s.endTime).toLocaleString()}
`).join('\n') : 'None'}

═══════════════════════════════════════════════════════════════════════════════
YOUR CRITICAL RESPONSIBILITIES
═══════════════════════════════════════════════════════════════════════════════
1. ✅ PRIORITIZE HIGH-RELIABILITY EMPLOYEES (score >80) for all shifts
2. ⚠️ FLAG RISKY ASSIGNMENTS (reliability <60, high tardiness, far from job site)
3. 📍 PREFER EMPLOYEES CLOSER TO JOB SITES when possible
4. 🚫 PENALTY QUEUE: Employees with recent denials should be LAST choice
5. 📅 RESPECT AVAILABILITY: Never schedule on unavailable days
6. ⏰ RESPECT MAX HOURS: Don't exceed maxHoursPerWeek
7. 🚨 WARN about scheduling unreliable employees (high tardiness, no-call-no-show, violations)
8. 💰 CALCULATE BILLABLE HOURS accurately for BillOS™ integration
9. 🔄 AVOID CONFLICTS with existing shifts
10. 📊 PROVIDE CLEAR RISK WARNINGS for each risky assignment

═══════════════════════════════════════════════════════════════════════════════
RESPONSE FORMAT (JSON)
═══════════════════════════════════════════════════════════════════════════════
{
  "shifts": [
    {
      "employeeId": "employee_id",
      "employeeName": "Employee Name",
      "clientId": "client_id",
      "title": "Shift Title",
      "startTime": "2025-10-20T08:00:00Z",
      "endTime": "2025-10-20T16:00:00Z",
      "confidence": 0.92,
      "riskScore": 15,
      "riskFactors": ["employee_15_min_from_site"],
      "distanceKm": 8.5,
      "reasoning": "High reliability (92/100), excellent attendance, close to job site"
    }
  ],
  "conflicts": ["List unavoidable scheduling conflicts"],
  "warnings": [
    "⚠️ WARNING: Assigned Employee X (reliability: 45/100) to critical shift - high tardiness history",
    "⚠️ WARNING: Employee Y lives 45km from job site - may be late"
  ],
  "recommendations": [
    "Consider hiring more employees for peak coverage",
    "Employee X (3 no-call-no-shows) should receive disciplinary warning",
    "Schedule backup employees for high-risk shifts"
  ]
}
`;
  }
}

export const scheduleOSAI = new ScheduleOSAI();
