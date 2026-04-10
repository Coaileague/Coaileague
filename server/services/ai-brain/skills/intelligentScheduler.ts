import { BaseSkill } from './base-skill';
import type {
  SkillManifest,
  SkillContext,
  SkillResult,
} from './types';
import { db } from '../../../db';
import { employees, employeeSkills, shifts, contractorPool, contractorSkills } from '@shared/schema';
import { eq, and, inArray, count, isNotNull } from 'drizzle-orm';
import { createLogger } from '../../../lib/logger';
import { PLATFORM } from '../../../config/platformConfig';

const log = createLogger('IntelligentScheduler');

interface ShiftLocation {
  lat: number;
  lng: number;
}

interface SchedulerInputParams {
  shiftId: string;
  clientId: string;
  requiredSkills: string[];
  shiftLocation: ShiftLocation;
  preferredStartTime: Date;
  duration: number;
}

interface EmployeeCandidate {
  employeeId: string;
  employeeName: string;
  reliabilityRating: number;
  skills: string[];
  attendanceRate: number;
  performanceRating: number;
  homeLocation: ShiftLocation;
  previousShiftsWithClient: number;
  avgClientRating: number;
  isContractor?: boolean;
}

interface ScoreBreakdown {
  employeeScore: number;
  proximityScore: number;
  relationshipScore: number;
  finalScore: number;
  details: {
    reliability: number;
    skillMatchPercent: number;
    attendance: number;
    performance: number;
    distanceMiles: number;
    previousShifts: number;
    avgClientRating: number;
  };
}

interface CandidateResult {
  employeeId: string;
  employeeName: string;
  rank: number;
  scores: ScoreBreakdown;
  recommended: boolean;
}

interface SchedulerResult {
  shiftId: string;
  clientId: string;
  candidates: CandidateResult[];
  totalCandidatesEvaluated: number;
  generatedAt: Date;
}

const EARTH_RADIUS_MILES = 3958.8;
const EMPLOYEE_SCORE_WEIGHT = 0.40;
const PROXIMITY_SCORE_WEIGHT = 0.35;
const RELATIONSHIP_SCORE_WEIGHT = 0.25;

export class IntelligentSchedulerSkill extends BaseSkill {
  getManifest(): SkillManifest {
    return {
      id: 'intelligent-scheduler',
      name: 'Intelligent Shift Scheduler',
      version: '1.0.0',
      description: 'AI-based employee assignment for shift scheduling using weighted scoring across employee qualifications, proximity, and client relationship history',
      author: PLATFORM.name + " Platform",
      category: 'scheduling',
      requiredTier: 'professional',
      requiredRole: ['org_owner', 'co_owner', 'manager', 'supervisor'],
      capabilities: [
        'employee-scoring',
        'proximity-calculation',
        'relationship-analysis',
        'candidate-ranking',
        'shift-optimization',
      ],
      dependencies: [],
      apiEndpoints: ['/api/ai-brain/skills/intelligent-scheduler/execute'],
      eventSubscriptions: ['shift.created', 'shift.updated', 'employee.availability.changed'],
    };
  }

  async execute(
    context: SkillContext,
    params: SchedulerInputParams
  ): Promise<SkillResult<SchedulerResult>> {
    const logs: string[] = [];
    const startTime = Date.now();
    logs.push(`[IntelligentScheduler] Starting execution for shift ${params.shiftId}`);

    try {
      if (!params.shiftId || !params.clientId || !params.shiftLocation) {
        return {
          success: false,
          error: 'Missing required parameters: shiftId, clientId, and shiftLocation are required',
          logs,
        };
      }

      if (!params.requiredSkills || params.requiredSkills.length === 0) {
        logs.push('[IntelligentScheduler] Warning: No required skills specified, will match all employees');
      }

      // Step 1: Try internal employees first
      const employeeCandidates = await this.fetchCandidateEmployees(context, params);
      logs.push(`[IntelligentScheduler] Found ${employeeCandidates.length} internal employee candidates`);

      let allCandidates = employeeCandidates;

      // Step 2: If less than 5 internal candidates, fall back to contractor pool
      if (employeeCandidates.length < 5) {
        const contractorCandidates = await this.fetchContractorCandidates(context, params);
        logs.push(`[IntelligentScheduler] Contractor pool added ${contractorCandidates.length} candidates`);
        allCandidates = [...employeeCandidates, ...contractorCandidates];
      }

      if (allCandidates.length === 0) {
        return {
          success: true,
          data: {
            shiftId: params.shiftId,
            clientId: params.clientId,
            candidates: [],
            totalCandidatesEvaluated: 0,
            generatedAt: new Date(),
          },
          logs,
          metadata: { warning: 'No candidates available for this shift (internal or contractor pool)' },
        };
      }

      const candidates = allCandidates;

      const scoredCandidates: CandidateResult[] = candidates.map((candidate) => {
        const scores = this.calculateScores(candidate, params);
        return {
          employeeId: candidate.employeeId,
          employeeName: candidate.employeeName,
          rank: 0,
          scores,
          recommended: scores.finalScore >= 70,
        };
      });

      scoredCandidates.sort((a, b) => b.scores.finalScore - a.scores.finalScore);

      scoredCandidates.forEach((candidate, index) => {
        candidate.rank = index + 1;
      });

      const topCandidates = scoredCandidates.slice(0, 5);
      logs.push(`[IntelligentScheduler] Returning top ${topCandidates.length} candidates`);

      topCandidates.forEach((c) => {
        const type = scoredCandidates.find(sc => sc.employeeId === c.employeeId)?.employeeId?.includes('contractor') 
          ? '(Contractor)' 
          : '(Employee)';
        logs.push(
          `  Rank #${c.rank}: ${c.employeeName} ${type} - Score: ${c.scores.finalScore.toFixed(2)} ` +
          `(Employee: ${c.scores.employeeScore.toFixed(1)}, ` +
          `Proximity: ${c.scores.proximityScore.toFixed(1)}, ` +
          `Relationship: ${c.scores.relationshipScore.toFixed(1)})`
        );
      });

      try {
        const { creditManager } = await import('../../../services/billing/creditManager');
        await creditManager.deductCredits({
          workspaceId: context.workspaceId,
          userId: context.userId || 'ai-brain',
          featureKey: 'ai_shift_matching',
          // @ts-expect-error — TS migration: fix in refactoring sprint
          featureName: 'Intelligent Shift Matching',
          description: `AI shift matching for shift ${params.shiftId.substring(0, 8)} — ${candidates.length} candidates scored`,
          quantity: 1,
        });
        logs.push(`[IntelligentScheduler] Billed 1 × ai_shift_matching credit`);
      } catch (creditErr: any) {
        logs.push(`[IntelligentScheduler] Credit billing failed (non-blocking): ${creditErr.message}`);
      }

      return {
        success: true,
        data: {
          shiftId: params.shiftId,
          clientId: params.clientId,
          candidates: topCandidates,
          totalCandidatesEvaluated: candidates.length,
          generatedAt: new Date(),
        },
        logs,
        metadata: {
          weights: {
            employee: EMPLOYEE_SCORE_WEIGHT,
            proximity: PROXIMITY_SCORE_WEIGHT,
            relationship: RELATIONSHIP_SCORE_WEIGHT,
          },
          processingTimeMs: Date.now() - startTime,
        },
      };
    } catch (error: any) {
      logs.push(`[IntelligentScheduler] Error: ${(error instanceof Error ? error.message : String(error))}`);
      return {
        success: false,
        error: (error instanceof Error ? error.message : String(error)) || 'Failed to execute intelligent scheduler',
        logs,
      };
    }
  }

  private calculateScores(
    candidate: EmployeeCandidate,
    params: SchedulerInputParams
  ): ScoreBreakdown {
    const skillMatchPercent = this.calculateSkillMatch(candidate.skills, params.requiredSkills);
    const employeeScore = this.calculateEmployeeScore(
      candidate.reliabilityRating,
      skillMatchPercent,
      candidate.attendanceRate,
      candidate.performanceRating
    );

    const distanceMiles = this.calculateHaversineDistance(
      candidate.homeLocation,
      params.shiftLocation
    );
    const proximityScore = this.calculateProximityScore(distanceMiles);

    const relationshipScore = this.calculateRelationshipScore(
      candidate.previousShiftsWithClient,
      candidate.avgClientRating
    );

    const finalScore =
      employeeScore * EMPLOYEE_SCORE_WEIGHT +
      proximityScore * PROXIMITY_SCORE_WEIGHT +
      relationshipScore * RELATIONSHIP_SCORE_WEIGHT;

    return {
      employeeScore,
      proximityScore,
      relationshipScore,
      finalScore,
      details: {
        reliability: candidate.reliabilityRating,
        skillMatchPercent,
        attendance: candidate.attendanceRate,
        performance: candidate.performanceRating,
        distanceMiles,
        previousShifts: candidate.previousShiftsWithClient,
        avgClientRating: candidate.avgClientRating,
      },
    };
  }

  private calculateEmployeeScore(
    reliability: number,
    skillMatch: number,
    attendance: number,
    performance: number
  ): number {
    const normalizedReliability = Math.min(1, Math.max(0, reliability));
    const normalizedSkillMatch = Math.min(1, Math.max(0, skillMatch));
    const normalizedAttendance = Math.min(1, Math.max(0, attendance));
    const normalizedPerformance = Math.min(1, Math.max(0, performance));

    const score =
      (normalizedReliability * 0.3 +
        normalizedSkillMatch * 0.4 +
        normalizedAttendance * 0.2 +
        normalizedPerformance * 0.1) *
      100;

    return Math.round(score * 100) / 100;
  }

  private calculateSkillMatch(employeeSkills: string[], requiredSkills: string[]): number {
    if (!requiredSkills || requiredSkills.length === 0) {
      return 1.0;
    }

    if (!employeeSkills || employeeSkills.length === 0) {
      return 0;
    }

    const normalizedEmployeeSkills = employeeSkills.map((s) => s.toLowerCase().trim());
    const normalizedRequiredSkills = requiredSkills.map((s) => s.toLowerCase().trim());

    const matchedSkills = normalizedRequiredSkills.filter((skill) =>
      normalizedEmployeeSkills.includes(skill)
    );

    return matchedSkills.length / normalizedRequiredSkills.length;
  }

  private calculateHaversineDistance(
    point1: ShiftLocation,
    point2: ShiftLocation
  ): number {
    const toRadians = (degrees: number): number => degrees * (Math.PI / 180);

    const lat1 = toRadians(point1.lat);
    const lat2 = toRadians(point2.lat);
    const deltaLat = toRadians(point2.lat - point1.lat);
    const deltaLng = toRadians(point2.lng - point1.lng);

    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = EARTH_RADIUS_MILES * c;

    return Math.round(distance * 100) / 100;
  }

  private calculateProximityScore(distanceMiles: number): number {
    const score = Math.max(0, 100 - distanceMiles * 5);
    return Math.round(score * 100) / 100;
  }

  private calculateRelationshipScore(
    previousShifts: number,
    avgClientRating: number
  ): number {
    const safeRating = Math.max(0, Math.min(5, avgClientRating || 3));
    const safeShifts = Math.max(0, previousShifts || 0);

    const score = Math.min(100, safeShifts * 10 + (safeRating - 3) * 25);

    return Math.round(Math.max(0, score) * 100) / 100;
  }

  private async fetchCandidateEmployees(
    context: SkillContext,
    params: SchedulerInputParams
  ): Promise<EmployeeCandidate[]> {
    try {
      // Query employees from database (onboarding completed)
      const activeEmployees = await db
        .select({
          id: employees.id,
          firstName: employees.firstName,
          lastName: employees.lastName,
          onboardingStatus: employees.onboardingStatus,
          workspaceId: employees.workspaceId,
          city: employees.city,
          state: employees.state,
        })
        .from(employees)
        .where(
          and(
            eq(employees.workspaceId, context.workspaceId),
            eq(employees.onboardingStatus, 'completed')
          )
        )
        .limit(50);

      if (activeEmployees.length === 0) {
        return [];
      }

      const candidates: EmployeeCandidate[] = [];
      const employeeIds = activeEmployees.map(e => e.id);

      // Batch fetch skills for all employees
      const allSkills = await db
        .select({
          employeeId: employeeSkills.employeeId,
          skillName: employeeSkills.skillName,
        })
        .from(employeeSkills)
        .where(inArray(employeeSkills.employeeId, employeeIds));

      // Group skills by employee
      const skillsByEmployee: Record<string, string[]> = {};
      for (const skill of allSkills) {
        if (!skillsByEmployee[skill.employeeId]) {
          skillsByEmployee[skill.employeeId] = [];
        }
        skillsByEmployee[skill.employeeId].push(skill.skillName);
      }

      // Get shift history with client from shifts table (employeeId on shifts)
      const clientShiftHistory = await db
        .select({
          employeeId: shifts.employeeId,
          shiftCount: count(shifts.id),
        })
        .from(shifts)
        .where(
          and(
            inArray(shifts.employeeId, employeeIds),
            eq(shifts.clientId, params.clientId)
          )
        )
        .groupBy(shifts.employeeId);

      const shiftCountByEmployee: Record<string, number> = {};
      for (const history of clientShiftHistory) {
        if (history.employeeId) {
          shiftCountByEmployee[history.employeeId] = Number(history.shiftCount);
        }
      }

      // Build candidate list from real employee data
      for (const emp of activeEmployees) {
        const empSkills = skillsByEmployee[emp.id] || [];
        const shiftCount = shiftCountByEmployee[emp.id] || 0;
        
        const homeLocation = {
          lat: parseFloat((emp as any).homeLatitude || (emp as any).latitude || '0') || params.shiftLocation.lat,
          lng: parseFloat((emp as any).homeLongitude || (emp as any).longitude || '0') || params.shiftLocation.lng,
        };

        const compositeScore = parseFloat((emp as any).compositeScore || '0');
        const attendanceVal = parseFloat((emp as any).attendanceRate || '0');
        const perfRating = parseFloat((emp as any).performanceRating || '0');

        candidates.push({
          employeeId: emp.id,
          employeeName: `${emp.firstName} ${emp.lastName}`,
          reliabilityRating: compositeScore > 0 ? Math.min(1, compositeScore / 100) : (attendanceVal > 0 ? Math.min(1, attendanceVal / 100) : 0.6),
          skills: empSkills,
          attendanceRate: attendanceVal > 0 ? Math.min(1, attendanceVal / 100) : ((emp as any).status === 'active' ? 0.7 : 0.5),
          performanceRating: perfRating > 0 ? Math.min(1, perfRating / 5) : ((emp as any).status === 'active' ? 0.6 : 0.4),
          homeLocation,
          previousShiftsWithClient: shiftCount,
          avgClientRating: parseFloat((emp as any).qualityScore || '0') > 0 ? Math.min(5, parseFloat((emp as any).qualityScore) / 20) : 3.5,
          isContractor: false,
        });
      }

      return candidates;
    } catch (error) {
      log.error('[IntelligentScheduler] Error fetching candidates from database:', error);
      // Return empty array on error - don't use mock data in production
      return [];
    }
  }

  // ============================================================================
  // CONTRACTOR POOL FALLBACK (Gap - Add when internal employees insufficient)
  // ============================================================================

  private async fetchContractorCandidates(
    context: SkillContext,
    params: SchedulerInputParams
  ): Promise<EmployeeCandidate[]> {
    try {
      // Query active contractors (1099 pool - globally available, not org-specific)
      const activeContractors = await db
        .select({
          id: contractorPool.id,
          firstName: contractorPool.firstName,
          lastName: contractorPool.lastName,
          isActive: contractorPool.isActive,
          homeLatitude: contractorPool.homeLatitude,
          homeLongitude: contractorPool.homeLongitude,
        })
        .from(contractorPool)
        .where(eq(contractorPool.isActive, true))
        .limit(50);

      if (activeContractors.length === 0) {
        return [];
      }

      const candidates: EmployeeCandidate[] = [];
      const contractorIds = activeContractors.map(c => c.id);

      // Batch fetch contractor skills
      const allContractorSkills = await db
        .select({
          contractorId: contractorSkills.contractorId,
          skillName: contractorSkills.skillName,
        })
        .from(contractorSkills)
        .where(inArray(contractorSkills.contractorId, contractorIds));

      // Group skills by contractor
      const skillsByContractor: Record<string, string[]> = {};
      for (const skill of allContractorSkills) {
        if (!skillsByContractor[skill.contractorId]) {
          skillsByContractor[skill.contractorId] = [];
        }
        skillsByContractor[skill.contractorId].push(skill.skillName);
      }

      // Build contractor candidate list from real data
      for (const contractor of activeContractors) {
        const contractorSkillSet = skillsByContractor[contractor.id] || [];
        
        const homeLocation = {
          lat: contractor.homeLatitude ? parseFloat(contractor.homeLatitude) : params.shiftLocation.lat,
          lng: contractor.homeLongitude ? parseFloat(contractor.homeLongitude) : params.shiftLocation.lng,
        };

        const cRating = parseFloat((contractor as any).reliabilityScore || (contractor as any).rating || '0');
        const normalizedRating = cRating > 10 ? Math.min(1, cRating / 100) : (cRating > 0 ? Math.min(1, cRating / 5) : 0);

        candidates.push({
          employeeId: `contractor-${contractor.id}`,
          employeeName: `${contractor.firstName} ${contractor.lastName}`,
          reliabilityRating: normalizedRating > 0 ? normalizedRating : 0.55,
          skills: contractorSkillSet,
          attendanceRate: (contractor as any).isActive ? 0.65 : 0.4,
          performanceRating: normalizedRating > 0 ? normalizedRating : 0.5,
          homeLocation,
          previousShiftsWithClient: 0,
          avgClientRating: 3.0,
          isContractor: true,
        });
      }

      return candidates;
    } catch (error) {
      log.error('[IntelligentScheduler] Error fetching contractor candidates:', error);
      return [];
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: any }> {
    return {
      healthy: this.config.enabled,
      details: {
        skillId: this.getManifest().id,
        version: this.getManifest().version,
        weights: {
          employee: EMPLOYEE_SCORE_WEIGHT,
          proximity: PROXIMITY_SCORE_WEIGHT,
          relationship: RELATIONSHIP_SCORE_WEIGHT,
        },
      },
    };
  }

  async getStats(): Promise<Record<string, any>> {
    return {
      ...await super.getStats(),
      algorithm: 'weighted-scoring',
      weights: {
        employee: EMPLOYEE_SCORE_WEIGHT,
        proximity: PROXIMITY_SCORE_WEIGHT,
        relationship: RELATIONSHIP_SCORE_WEIGHT,
      },
      haversineRadiusMiles: EARTH_RADIUS_MILES,
    };
  }
}

export default IntelligentSchedulerSkill;
