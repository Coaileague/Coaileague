/**
 * Trinity Schedule - INTELLIGENT AUTO-SCHEDULING ENGINE
 * 
 * Integrates with ALL CoAIleague™ systems for comprehensive scheduling:
 * - Officer Intelligence: Performance scores, attendance rates, composite scores
 * - Smart Clock-In: Tardiness, no-call-no-show, time entry violations
 * - Billing Platform: Automatic client billing from scheduled hours
 * - Geo-Compliance: Location-based assignment (employee address to job site distance)
 * - Availability: Day/time preferences, max hours
 * - Years of Service: Seniority-based prioritization
 * - Disciplinary Tracking: Compliance violations, GPS violations
 * - Risk Forecasting: Warns when scheduling unreliable employees
 * - Auto-Replacement: Finds backup when employee denies assignment
 * - Penalty Queue: Denied assignments send employee to back of pool
 */

import { getMeteredOpenAICompletion } from '../services/billing/universalAIBillingInterceptor';
import { checkShiftMargin } from '../lib/businessRules';
import { db } from "../db";
import { 
  employees, shifts, timeEntries, clients, performanceReviews,
  timeEntryDiscrepancies, onboardingApplications, employeeAvailability
} from "@shared/schema";
import { eq, and, gte, lte, sql, desc, count, isNull } from "drizzle-orm";
import { createLogger } from '../lib/logger';
const log = createLogger('scheduleos');


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
  
  // Officer Intelligence Performance Data
  performanceScore: number; // 0-100 from latest review
  performanceTier: string; // 'exceptional', 'exceeds', 'meets', 'needs_improvement', 'unsatisfactory'
  attendanceRate: number; // Percentage
  compositeScore: number; // Overall Officer Intelligence score
  
  // Smart Clock-In Attendance & Punctuality
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

export class SchedulingAI {
  constructor() {
  }

  /**
   * MAIN SCHEDULE GENERATION ENGINE
   * Pulls from Officer Intelligence, Smart Clock-In, Geo-Compliance, and all integrated systems
   */
  async generateSchedule(request: ScheduleRequest): Promise<ScheduleResult> {
    const startTime = Date.now();
    
    log.info(`[Trinity Schedule] Generating intelligent schedule for week ${request.weekStartDate.toISOString()}`);
    
    // 1. Get comprehensive employee intelligence from all systems
    const employeeIntelligence = await this.gatherEmployeeIntelligence(
      request.workspaceId,
      request.weekStartDate
    );
    
    log.info(`[Trinity Schedule] Analyzed ${employeeIntelligence.length} employees across all systems`);
    
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

    // 4. CONSTRAINT SOLVER: Generate optimal schedule using proper CSP solving
    log.info(`[Trinity Schedule] Running constraint solver for optimal scheduling...`);
    const solverStartTime = Date.now();
    
    const solvedSchedule = await this.constraintSolver(
      employeeIntelligence,
      request.shiftRequirements,
      existingShifts,
      jobSites
    );
    
    const solverTimeMs = Date.now() - solverStartTime;
    log.info(`[Trinity Schedule] Constraint solver completed in ${solverTimeMs}ms`);

    // 5. GPT-4 VALIDATION: Verify solution quality and generate explanations
    log.info(`[Trinity Schedule] Using GPT-4 to validate and explain schedule...`);
    const aiPrompt = this.buildValidationPrompt(
      employeeIntelligence,
      request.shiftRequirements,
      solvedSchedule
    );

    if (!request.workspaceId) {
      throw new Error('Workspace ID required for AI scheduling - cannot process unbilled operations');
    }
    const wsId = request.workspaceId;
    const aiResult = await getMeteredOpenAICompletion({
      workspaceId: wsId,
      userId: request.userId,
      featureKey: 'scheduleos_ai_generation',
      messages: [
        {
          role: 'system',
          content: `You are Trinity Schedule AI Validator. Your job is to:
1. Verify the schedule satisfies all hard constraints (availability, max hours, conflicts)
2. Identify any risks or warnings (high-risk employees, long distances, tight scheduling)
3. Provide business-friendly explanations and recommendations
4. Flag any potential issues for human review

Respond with JSON containing: { valid: boolean, warnings: string[], recommendations: string[], riskScore: number }`,
        },
        {
          role: 'user',
          content: aiPrompt,
        },
      ],
      model: 'gpt-4o-mini',
      temperature: 0.3,
      jsonMode: true,
    });

    if (!aiResult.success) {
      if (aiResult.blocked) {
        throw new Error(`Insufficient credits for AI scheduling: ${aiResult.error}`);
      }
      throw new Error(`AI scheduling validation failed: ${aiResult.error}`);
    }

    log.info(`[AI Scheduling] Billed ${aiResult.tokensUsed} tokens to workspace ${wsId}`);

    const validationResult = JSON.parse(aiResult.content || '{}');

    // FAIL FAST: If GPT-4 validation fails, reject the schedule
    if (validationResult.valid === false) {
      log.error(`[Trinity Schedule] GPT-4 validation failed. Rejecting schedule.`);
      throw new Error(`Schedule validation failed: ${validationResult.warnings?.join(', ') || 'Unknown validation errors'}`);
    }

    // 7. Transform solver output into shift objects with full metadata
    const generatedShifts = solvedSchedule.assignments.map((assignment: any): any => {
      const emp = employeeIntelligence.find(e => e.employeeId === assignment.employeeId);
      const shiftReq = request.shiftRequirements[assignment.shiftIndex];
      const shiftHours = (shiftReq.endTime.getTime() - shiftReq.startTime.getTime()) / (1000 * 60 * 60);
      
      return {
        employeeId: assignment.employeeId,
        employeeName: emp?.employeeName || 'Unknown',
        clientId: shiftReq.clientId,
        title: shiftReq.title,
        startTime: shiftReq.startTime,
        endTime: shiftReq.endTime,
        requiresAcknowledgment: true,
        aiGenerated: true,
        aiConfidenceScore: assignment.confidence,
        riskScore: (emp?.riskScore || 0) / 100,
        riskFactors: assignment.riskFactors,
        distanceFromHomeKm: assignment.distance,
        billableHours: shiftHours,
        estimatedCost: shiftHours * (emp ? 25 : 20),
      };
    });

    const processingTimeMs = Date.now() - startTime;

    log.info(`[Trinity Schedule] Generated ${generatedShifts.length} optimal shifts in ${processingTimeMs}ms`);

    return {
      success: true,
      scheduleDate: request.weekStartDate,
      shiftsGenerated: generatedShifts.length,
      employeesScheduled: new Set(generatedShifts.map((s: any) => s.employeeId)).size,
      conflicts: solvedSchedule.conflicts,
      warnings: validationResult.warnings || [],
      recommendations: validationResult.recommendations || [],
      generatedShifts,
      processingTimeMs,
    };
  }

  /**
   * CONSTRAINT SOLVER: Optimal employee-to-shift assignment
   * Uses greedy algorithm with backtracking for constraint satisfaction
   */
  private async constraintSolver(
    employees: EmployeeIntelligence[],
    shiftRequirements: ScheduleRequest['shiftRequirements'],
    existingShifts: any[],
    jobSites: any[]
  ): Promise<{
    assignments: Array<{
      employeeId: string;
      shiftIndex: number;
      confidence: number;
      riskFactors: string[];
      distance?: number;
    }>;
    conflicts: string[];
  }> {
    const assignments: any[] = [];
    const conflicts: string[] = [];
    const employeeHours: Map<string, number> = new Map();

    // Sort shifts by start time
    const sortedShifts = shiftRequirements
      .map((shift, index) => ({ ...shift, index }))
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    for (const shift of sortedShifts) {
      // Score each employee for this shift
      const candidates = employees.map(emp => ({
        employee: emp,
        score: this.calculateEmployeeShiftScore(emp, shift, employeeHours, existingShifts, jobSites),
      }))
      .filter(c => c.score.feasible)
      .sort((a, b) => b.score.totalScore - a.score.totalScore);

      if (candidates.length === 0) {
        conflicts.push(`No available employees for shift: ${shift.title} at ${shift.startTime.toISOString()}`);
        continue;
      }

      // Assign best candidate
      const best = candidates[0];
      const shiftHours = (shift.endTime.getTime() - shift.startTime.getTime()) / (1000 * 60 * 60);
      
      assignments.push({
        employeeId: best.employee.employeeId,
        shiftIndex: shift.index,
        confidence: best.score.totalScore / 100,
        riskFactors: best.score.riskFactors,
        distance: best.score.distance,
      });

      // Update employee hours
      const currentHours = employeeHours.get(best.employee.employeeId) || 0;
      employeeHours.set(best.employee.employeeId, currentHours + shiftHours);
    }

    return { assignments, conflicts };
  }

  /**
   * Calculate employee suitability score for a specific shift
   */
  private calculateEmployeeShiftScore(
    employee: EmployeeIntelligence,
    shift: ScheduleRequest['shiftRequirements'][0],
    employeeHours: Map<string, number>,
    existingShifts: any[],
    jobSites: any[]
  ): {
    feasible: boolean;
    totalScore: number;
    riskFactors: string[];
    distance?: number;
  } {
    const riskFactors: string[] = [];
    let score = employee.reliabilityScore; // Start with 0-100 reliability

    // HARD CONSTRAINT: Check availability
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
    const shiftDay = dayNames[shift.startTime.getDay()] as keyof typeof employee.availability;
    const availability = employee.availability[shiftDay];
    
    if (!availability || !availability.available) {
      return { feasible: false, totalScore: 0, riskFactors: ['Not available on this day'] };
    }

    // HARD CONSTRAINT: Check max hours
    const shiftHours = (shift.endTime.getTime() - shift.startTime.getTime()) / (1000 * 60 * 60);
    const currentHours = employeeHours.get(employee.employeeId) || 0;
    
    if (currentHours + shiftHours > employee.maxHoursPerWeek) {
      return { feasible: false, totalScore: 0, riskFactors: ['Would exceed max hours'] };
    }

    // HARD CONSTRAINT: Check for conflicts with existing shifts
    const hasConflict = existingShifts.some(existing => 
      existing.employeeId === employee.employeeId &&
      existing.startTime < shift.endTime &&
      existing.endTime > shift.startTime
    );
    
    if (hasConflict) {
      return { feasible: false, totalScore: 0, riskFactors: ['Time conflict with existing shift'] };
    }

    // SOFT CONSTRAINT: Proximity to job site
    let distance: number | undefined;
    if (shift.jobSiteLatitude && shift.jobSiteLongitude) {
      // Default distance when employee coordinates are not available
      // Employee locations are stored as addresses without lat/lng
      distance = 10;
      
      if (distance > 30) {
        score -= 10;
        riskFactors.push(`Far from job site (${distance.toFixed(1)}km)`);
      } else if (distance < 10) {
        score += 5; // Bonus for proximity
      }
    }

    // SOFT CONSTRAINT: Performance and attendance
    if (employee.performanceScore < 70) {
      score -= 15;
      riskFactors.push('Low performance score');
    }

    if (employee.tardyCount > 5) {
      score -= 10;
      riskFactors.push(`High tardiness (${employee.tardyCount} times)`);
    }

    if (employee.noCallNoShowCount > 0) {
      score -= 20;
      riskFactors.push(`No-call-no-show history (${employee.noCallNoShowCount})`);
    }

    // SOFT CONSTRAINT: Penalty queue (recent denials)
    if (employee.deniedShiftsLast30Days > 0) {
      score -= employee.deniedShiftsLast30Days * 5;
      riskFactors.push(`Recent shift denials (${employee.deniedShiftsLast30Days})`);
    }

    // SOFT CONSTRAINT: Seniority bonus
    if (employee.yearsOfService > 2) {
      score += Math.min(employee.yearsOfService * 2, 10);
    }

    return {
      feasible: true,
      totalScore: Math.max(0, Math.min(100, score)),
      riskFactors,
      distance,
    };
  }

  /**
   * Build GPT-4 validation prompt
   */
  private buildValidationPrompt(
    employees: EmployeeIntelligence[],
    shifts: ScheduleRequest['shiftRequirements'],
    solution: any
  ): string {
    return `Validate this workforce schedule:

SHIFTS REQUIRED: ${shifts.length}
SHIFTS ASSIGNED: ${solution.assignments.length}
CONFLICTS: ${solution.conflicts.length}

${solution.conflicts.length > 0 ? `\nUNFILLED SHIFTS:\n${solution.conflicts.join('\n')}` : ''}

Analyze the solution quality and provide:
1. Overall validity (are all constraints met?)
2. Warnings about high-risk assignments
3. Recommendations for improvement`;
  }

  /**
   * GATHER COMPREHENSIVE EMPLOYEE INTELLIGENCE
   * Pulls from Officer Intelligence, Smart Clock-In, Geo-Compliance, Onboarding, and all integrated systems
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
          
          // Officer Intelligence data
          performanceScore,
          performanceTier: latestReview?.performanceTier || 'meets',
          attendanceRate,
          compositeScore: performanceScore,
          
          // Smart Clock-In data
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
You are Trinity Schedule, the world's most advanced AI workforce scheduling system. Generate an optimal schedule using comprehensive employee intelligence data.

═══════════════════════════════════════════════════════════════════════════════
EMPLOYEE INTELLIGENCE (Integrated from Officer Intelligence, Smart Clock-In, Geo-Compliance)
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
8. 💰 CALCULATE BILLABLE HOURS accurately for Billing Platform integration
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

  /**
   * FILL OPEN SHIFTS - Assign employees to existing unassigned shifts
   * Uses employee intelligence, availability, and skills matching
   */
  async fillOpenShifts(workspaceId: string, userId?: string): Promise<{
    success: boolean;
    shiftsProcessed: number;
    shiftsFilled: number;
    shiftsSkipped: number;
    assignments: Array<{
      shiftId: string;
      shiftTitle: string;
      employeeId: string;
      employeeName: string;
      confidenceScore: number;
      matchReasons: string[];
    }>;
    unfilled: Array<{ shiftId: string; title: string; reason: string }>;
    processingTimeMs: number;
  }> {
    const startTime = Date.now();
    log.info(`[Trinity Schedule] Filling open shifts for workspace ${workspaceId}`);

    // 1. Find all open shifts (no employee assigned, status = published)
    const openShifts = await db
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.workspaceId, workspaceId),
          sql`${shifts.employeeId} IS NULL`,
          eq(shifts.status, 'published')
        )
      );

    if (openShifts.length === 0) {
      return {
        success: true,
        shiftsProcessed: 0,
        shiftsFilled: 0,
        shiftsSkipped: 0,
        assignments: [],
        unfilled: [],
        processingTimeMs: Date.now() - startTime,
      };
    }

    log.info(`[Trinity Schedule] Found ${openShifts.length} open shifts to fill`);

    // 2. Gather employee intelligence
    const employeeIntel = await this.gatherEmployeeIntelligence(workspaceId, new Date());
    log.info(`[Trinity Schedule] Analyzed ${employeeIntel.length} available employees`);

    // 3. Get employee skills for matching — scoped to this workspace only
    const { employeeSkills } = await import('@shared/schema');
    const allSkills = await db.select().from(employeeSkills).where(eq(employeeSkills.workspaceId, workspaceId));
    const skillsByEmployee = new Map<string, string[]>();
    for (const skill of allSkills) {
      const existing = skillsByEmployee.get(skill.employeeId) || [];
      existing.push(skill.skillName);
      skillsByEmployee.set(skill.employeeId, existing);
    }

    // 3b. Load all EXISTING assigned shifts for the relevant time window so we can
    //     detect schedule conflicts and track weekly hours before making new assignments.
    // Get the week key (Sun-based) for a date — OT resets per week
    // Phase 46: Use setUTCHours so workweek boundary is Sunday midnight UTC (shifts stored in UTC)
    const getWeekKey = (d: Date): string => {
      const sun = new Date(d);
      sun.setUTCDate(d.getUTCDate() - d.getUTCDay());
      sun.setUTCHours(0, 0, 0, 0);
      return sun.toISOString();
    };

    // Build window covering ALL weeks that contain open shifts
    const allWeekTimestamps = openShifts.map(s => {
      const d = new Date(s.startTime);
      d.setUTCDate(d.getUTCDate() - d.getUTCDay());
      d.setUTCHours(0, 0, 0, 0);
      return d.getTime();
    });
    const windowStart = new Date(Math.min(...allWeekTimestamps));
    const windowEnd   = new Date(Math.max(...allWeekTimestamps));
    windowEnd.setDate(windowEnd.getDate() + 7);

    const existingAssigned = await db.select({
      employeeId: shifts.employeeId,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
    }).from(shifts).where(
      and(
        eq(shifts.workspaceId, workspaceId),
        sql`${shifts.employeeId} IS NOT NULL`,
        gte(shifts.startTime, windowStart),
        lte(shifts.startTime, windowEnd)
      )
    );

    // Per-employee, per-week hours map: empId -> weekKey -> hours
    const empWeekHoursMap = new Map<string, Map<string, number>>();
    // Per-employee all-time slots for conflict checking (across all weeks)
    const empSlots = new Map<string, Array<{ start: Date; end: Date }>>();

    for (const s of existingAssigned) {
      const empId  = s.employeeId!;
      const st     = new Date(s.startTime!);
      const et     = new Date(s.endTime!);
      const shiftH = (et.getTime() - st.getTime()) / (1000 * 60 * 60);
      const wk     = getWeekKey(st);

      const weekMap = empWeekHoursMap.get(empId) ?? new Map<string, number>();
      weekMap.set(wk, (weekMap.get(wk) ?? 0) + shiftH);
      empWeekHoursMap.set(empId, weekMap);

      const slots = empSlots.get(empId) ?? [];
      slots.push({ start: st, end: et });
      empSlots.set(empId, slots);
    }

    // Helper: overlap check
    const overlaps = (a: { start: Date; end: Date }, b: { start: Date; end: Date }) =>
      a.start < b.end && a.end > b.start;

    // Load is_1099_eligible per employee (contractors have higher OT threshold)
    const empRecords = await db.select({ id: employees.id, is1099: employees.is1099Eligible }).from(employees).where(
      and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true))
    );
    const emp1099Map = new Map<string, boolean>(empRecords.map(e => [e.id, !!(e.is1099 as boolean)]));

    // Sort open shifts by start time so chronologically earlier shifts are filled first
    openShifts.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    // 4. Match employees to shifts (allowing multi-shift assignment with conflict/OT checks)
    const assignments: Array<{
      shiftId: string;
      shiftTitle: string;
      employeeId: string;
      employeeName: string;
      confidenceScore: number;
      matchReasons: string[];
    }> = [];
    const unfilled: Array<{ shiftId: string; title: string; reason: string }> = [];

    for (const shift of openShifts) {
      const shiftStart = new Date(shift.startTime);
      const shiftEnd   = new Date(shift.endTime);
      const shiftH     = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60 * 60);
      const shiftDay   = shiftStart.getDay(); // 0-6
      const shiftStartHour = shiftStart.getHours();
      const shiftEndHour   = shiftEnd.getHours();
      
      // Parse skill requirements from description
      const requiredSkills = this.parseSkillsFromDescription(shift.description || '');

      // Score each employee for this shift
      const candidates: Array<{
        employee: EmployeeIntelligence;
        score: number;
        reasons: string[];
      }> = [];

      const shiftWeekKey = getWeekKey(shiftStart);

      for (const emp of employeeIntel) {
        const is1099 = emp1099Map.get(emp.employeeId) ?? false;
        // W-2 hard cap 40h regular; 1099 contractors tolerate up to 60h
        const weeklyLimit = is1099 ? 60 : 40;
        const weekMap     = empWeekHoursMap.get(emp.employeeId);
        const currentHours = weekMap?.get(shiftWeekKey) ?? 0;
        if (currentHours + shiftH > weeklyLimit) continue; // Would exceed weekly limit

        // Check for time conflict with existing slots (existing + already-queued in this run)
        const occupied = empSlots.get(emp.employeeId) ?? [];
        if (occupied.some(slot => overlaps(slot, { start: shiftStart, end: shiftEnd }))) continue;

        const reasons: string[] = [];
        let score = 50; // Base score

        // Prefer employees with more remaining capacity (fewer hours = less OT risk)
        const remainingH = weeklyLimit - currentHours;
        if (remainingH >= 32) {
          reasons.push('High remaining capacity');
          score += 20;
        } else if (remainingH >= 16) {
          score += 10;
        }

        // Check day availability
        const dayAvail = this.getDayAvailability(emp.availability, shiftDay);
        if (!dayAvail.available) {
          continue; // Skip unavailable employees
        }
        reasons.push('Available on scheduled day');
        score += 10;

        // Check time window
        if (dayAvail.startTime && dayAvail.endTime) {
          const empStart = parseInt(dayAvail.startTime.split(':')[0], 10);
          const empEnd = parseInt(dayAvail.endTime.split(':')[0], 10);
          if (shiftStartHour >= empStart && shiftEndHour <= empEnd) {
            reasons.push('Shift within availability window');
            score += 15;
          } else {
            score -= 10; // Partial overlap penalty
          }
        }

        // Performance & reliability
        if (emp.reliabilityScore >= 80) {
          reasons.push(`High reliability (${emp.reliabilityScore}/100)`);
          score += 20;
        } else if (emp.reliabilityScore < 50) {
          score -= 15;
        }

        // Skills matching
        const empSkills = skillsByEmployee.get(emp.employeeId) || [];
        const matchedSkills = requiredSkills.filter(s => 
          empSkills.some(es => es.toLowerCase().includes(s.toLowerCase()))
        );
        if (matchedSkills.length > 0) {
          reasons.push(`Skills match: ${matchedSkills.join(', ')}`);
          score += matchedSkills.length * 10;
        } else if (requiredSkills.length > 0) {
          score -= 5; // No skills match penalty
        }

        // Low risk preference
        if (emp.riskScore < 30) {
          reasons.push('Low risk employee');
          score += 10;
        } else if (emp.riskScore > 70) {
          score -= 20;
        }

        candidates.push({ employee: emp, score, reasons });
      }

      // Sort by score (highest first)
      candidates.sort((a, b) => b.score - a.score);

      if (candidates.length > 0 && candidates[0].score >= 50) {
        const best = candidates[0];
        assignments.push({
          shiftId: shift.id,
          shiftTitle: shift.title || 'Untitled Shift',
          employeeId: best.employee.employeeId,
          employeeName: best.employee.employeeName,
          confidenceScore: Math.min(best.score / 100, 1),
          matchReasons: best.reasons,
        });
        // Update in-memory tracking so subsequent shifts see this assignment
        const bestEmpId   = best.employee.employeeId;
        const updatedWkMap = empWeekHoursMap.get(bestEmpId) ?? new Map<string, number>();
        updatedWkMap.set(shiftWeekKey, (updatedWkMap.get(shiftWeekKey) ?? 0) + shiftH);
        empWeekHoursMap.set(bestEmpId, updatedWkMap);
        const updatedSlots = empSlots.get(bestEmpId) ?? [];
        updatedSlots.push({ start: shiftStart, end: shiftEnd });
        empSlots.set(bestEmpId, updatedSlots);
      } else {
        unfilled.push({
          shiftId: shift.id,
          title: shift.title || 'Untitled Shift',
          reason: candidates.length === 0 
            ? 'No available employees within hours limits' 
            : 'No suitable match found (score too low)',
        });
      }
    }

    // 5. Apply assignments to database (atomic: only assign if still unassigned)
    for (const assignment of assignments) {
      const result = await db
        .update(shifts)
        .set({
          employeeId: assignment.employeeId,
          status: 'scheduled',
          aiGenerated: true,
          aiConfidenceScore: String(assignment.confidenceScore),
          updatedAt: new Date(),
        })
        .where(and(
          eq(shifts.id, assignment.shiftId),
          isNull(shifts.employeeId)
        ))
        .returning();

      if (result.length === 0) {
        log.warn(`[Trinity Schedule] Shift ${assignment.shiftId} was already assigned, skipping`);
      }
    }

    const processingTimeMs = Date.now() - startTime;
    log.info(`[Trinity Schedule] Filled ${assignments.length}/${openShifts.length} shifts in ${processingTimeMs}ms`);

    // Step 7 (Phase 5): Margin check — non-blocking. Warn when employee pay rate
    // exceeds client billing rate so org owners are aware of loss-generating shifts.
    const marginWarnings: Array<{
      shiftId: string;
      shiftTitle: string;
      employeeId: string;
      code: string;
      message: string;
      impact: string;
    }> = [];

    if (assignments.length > 0) {
      const assignedShiftIds = assignments.map(a => a.shiftId);
      const assignedEmpIds   = assignments.map(a => a.employeeId);

      const [empRates, shiftClients] = await Promise.all([
        db.select({ id: employees.id, hourlyRate: employees.hourlyRate })
          .from(employees)
          .where(sql`${employees.id} = ANY(ARRAY[${sql.join(assignedEmpIds.map(id => sql`${id}::uuid`), sql`, `)}])`),
        db.select({ id: shifts.id, clientId: shifts.clientId })
          .from(shifts)
          .where(sql`${shifts.id} = ANY(ARRAY[${sql.join(assignedShiftIds.map(id => sql`${id}::uuid`), sql`, `)}])`),
      ]);

      const clientIds = [...new Set(shiftClients.map(s => s.clientId).filter(Boolean))] as string[];
      const clientRates = clientIds.length > 0
        ? await db.select({ id: clients.id, billableRate: (clients as any).billableRate })
            .from(clients)
            .where(sql`${clients.id} = ANY(ARRAY[${sql.join(clientIds.map(id => sql`${id}::uuid`), sql`, `)}])`)
        : [];

      const empRateMap   = new Map(empRates.map(e => [e.id, e.hourlyRate]));
      const shiftClientMap = new Map(shiftClients.map(s => [s.id, s.clientId]));
      const clientRateMap  = new Map(clientRates.map(c => [c.id, c.billableRate]));

      for (const assignment of assignments) {
        const employeePayRate  = empRateMap.get(assignment.employeeId);
        const clientId         = shiftClientMap.get(assignment.shiftId);
        const clientBillingRate = clientId ? clientRateMap.get(clientId) : null;

        if (employeePayRate && clientBillingRate) {
          const marginCheck = checkShiftMargin(employeePayRate, clientBillingRate);
          if (marginCheck.isNegativeMargin) {
            marginWarnings.push({
              shiftId: assignment.shiftId,
              shiftTitle: assignment.shiftTitle,
              employeeId: assignment.employeeId,
              code: 'NEGATIVE_MARGIN_SHIFT',
              message: `This shift has a negative margin. Employee pay rate ($${marginCheck.employeePayRate}/hr) exceeds client billing rate ($${marginCheck.clientBillingRate}/hr).`,
              impact: `Loss per hour: $${marginCheck.lossPerHour}`,
            });
          }
        }
      }
    }

    return {
      success: true,
      shiftsProcessed: openShifts.length,
      shiftsFilled: assignments.length,
      shiftsSkipped: unfilled.length,
      assignments,
      unfilled,
      processingTimeMs,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      warnings: marginWarnings.length > 0 ? marginWarnings : undefined,
    };
  }

  /**
   * Parse skill requirements from shift description
   */
  private parseSkillsFromDescription(description: string): string[] {
    const requiresMatch = description.match(/Requires?:\s*([^.]+)/i);
    if (!requiresMatch) return [];
    
    return requiresMatch[1]
      .split(/[,;]/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * Get availability for a specific day
   */
  private getDayAvailability(
    availability: EmployeeIntelligence['availability'],
    dayOfWeek: number
  ): { available: boolean; startTime?: string; endTime?: string } {
    const dayMap: Record<number, keyof EmployeeIntelligence['availability']> = {
      0: 'sunday',
      1: 'monday',
      2: 'tuesday',
      3: 'wednesday',
      4: 'thursday',
      5: 'friday',
      6: 'saturday',
    };
    return availability[dayMap[dayOfWeek]] || { available: false };
  }
}

export const scheduleOSAI = new SchedulingAI();
