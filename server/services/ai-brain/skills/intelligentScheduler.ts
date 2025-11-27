import { BaseSkill } from './base-skill';
import type {
  SkillManifest,
  SkillContext,
  SkillResult,
} from './types';

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
      author: 'AutoForce Platform',
      category: 'scheduling',
      requiredTier: 'professional',
      requiredRole: ['owner', 'admin', 'manager'],
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

      const candidates = await this.fetchCandidateEmployees(context, params);
      logs.push(`[IntelligentScheduler] Found ${candidates.length} potential candidates`);

      if (candidates.length === 0) {
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
          metadata: { warning: 'No candidates available for this shift' },
        };
      }

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
        logs.push(
          `  Rank #${c.rank}: ${c.employeeName} - Score: ${c.scores.finalScore.toFixed(2)} ` +
          `(Employee: ${c.scores.employeeScore.toFixed(1)}, ` +
          `Proximity: ${c.scores.proximityScore.toFixed(1)}, ` +
          `Relationship: ${c.scores.relationshipScore.toFixed(1)})`
        );
      });

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
          processingTimeMs: Date.now(),
        },
      };
    } catch (error: any) {
      logs.push(`[IntelligentScheduler] Error: ${error.message}`);
      return {
        success: false,
        error: error.message || 'Failed to execute intelligent scheduler',
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
    const mockCandidates: EmployeeCandidate[] = [
      {
        employeeId: 'emp-001',
        employeeName: 'John Smith',
        reliabilityRating: 0.95,
        skills: ['first-aid', 'security', 'customer-service'],
        attendanceRate: 0.98,
        performanceRating: 0.92,
        homeLocation: { lat: params.shiftLocation.lat + 0.02, lng: params.shiftLocation.lng + 0.01 },
        previousShiftsWithClient: 15,
        avgClientRating: 4.8,
      },
      {
        employeeId: 'emp-002',
        employeeName: 'Sarah Johnson',
        reliabilityRating: 0.88,
        skills: ['security', 'patrol', 'emergency-response'],
        attendanceRate: 0.95,
        performanceRating: 0.90,
        homeLocation: { lat: params.shiftLocation.lat + 0.05, lng: params.shiftLocation.lng - 0.02 },
        previousShiftsWithClient: 8,
        avgClientRating: 4.5,
      },
      {
        employeeId: 'emp-003',
        employeeName: 'Michael Chen',
        reliabilityRating: 0.92,
        skills: ['first-aid', 'cpr', 'security'],
        attendanceRate: 0.99,
        performanceRating: 0.88,
        homeLocation: { lat: params.shiftLocation.lat - 0.1, lng: params.shiftLocation.lng + 0.08 },
        previousShiftsWithClient: 3,
        avgClientRating: 4.2,
      },
      {
        employeeId: 'emp-004',
        employeeName: 'Emily Davis',
        reliabilityRating: 0.85,
        skills: ['customer-service', 'communication', 'first-aid'],
        attendanceRate: 0.90,
        performanceRating: 0.94,
        homeLocation: { lat: params.shiftLocation.lat + 0.15, lng: params.shiftLocation.lng - 0.1 },
        previousShiftsWithClient: 0,
        avgClientRating: 3.0,
      },
      {
        employeeId: 'emp-005',
        employeeName: 'Robert Wilson',
        reliabilityRating: 0.97,
        skills: ['security', 'first-aid', 'emergency-response', 'patrol'],
        attendanceRate: 0.96,
        performanceRating: 0.91,
        homeLocation: { lat: params.shiftLocation.lat - 0.03, lng: params.shiftLocation.lng + 0.02 },
        previousShiftsWithClient: 22,
        avgClientRating: 4.9,
      },
      {
        employeeId: 'emp-006',
        employeeName: 'Jennifer Martinez',
        reliabilityRating: 0.80,
        skills: ['security', 'customer-service'],
        attendanceRate: 0.85,
        performanceRating: 0.82,
        homeLocation: { lat: params.shiftLocation.lat + 0.25, lng: params.shiftLocation.lng + 0.2 },
        previousShiftsWithClient: 1,
        avgClientRating: 3.5,
      },
    ];

    return mockCandidates;
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
