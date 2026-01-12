/**
 * Trinity Training Scenario Seeder
 * =================================
 * Seeds training shifts with varying difficulty levels for Trinity AI confidence building
 * 
 * Difficulty Levels:
 * - Easy: Simple shifts, no conflicts, clear matches
 * - Medium: Some availability conflicts, basic skill requirements
 * - Hard: Complex constraints, client preferences/exclusions, travel pay issues, low-score employees
 */

import { db } from '../../db';
import { shifts, employees, clients, trainingScenarios, trainingRuns, trainingAttempts } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

interface ScenarioConfig {
  name: string;
  description: string;
  difficulty: DifficultyLevel;
  shiftsToCreate: number;
  constraintConfig: {
    availabilityConflicts: number; // 0-10, percentage of shifts with conflicts
    certificationRequirements: number; // 0-10
    clientPreferences: number; // 0-10
    clientExclusions: number; // 0-10
    travelPayIssues: number; // 0-10
    overtimeRisks: number; // 0-10
    lowScoreEmployees: number; // 0-10
  };
}

const SCENARIO_PRESETS: Record<DifficultyLevel, ScenarioConfig> = {
  easy: {
    name: 'Easy Training - Getting Started',
    description: 'Simple shifts with clear employee matches. No conflicts or complex constraints.',
    difficulty: 'easy',
    shiftsToCreate: 50,
    constraintConfig: {
      availabilityConflicts: 0,
      certificationRequirements: 1,
      clientPreferences: 0,
      clientExclusions: 0,
      travelPayIssues: 0,
      overtimeRisks: 0,
      lowScoreEmployees: 0,
    },
  },
  medium: {
    name: 'Medium Training - Building Skills',
    description: 'Shifts with some availability conflicts, basic skill requirements, and moderate complexity.',
    difficulty: 'medium',
    shiftsToCreate: 50,
    constraintConfig: {
      availabilityConflicts: 3,
      certificationRequirements: 4,
      clientPreferences: 2,
      clientExclusions: 1,
      travelPayIssues: 2,
      overtimeRisks: 2,
      lowScoreEmployees: 2,
    },
  },
  hard: {
    name: 'Hard Training - Master Challenge',
    description: 'Complex scheduling with multiple conflicting constraints, client exclusions, travel pay issues, and low-score employees.',
    difficulty: 'hard',
    shiftsToCreate: 50,
    constraintConfig: {
      availabilityConflicts: 7,
      certificationRequirements: 8,
      clientPreferences: 6,
      clientExclusions: 5,
      travelPayIssues: 7,
      overtimeRisks: 6,
      lowScoreEmployees: 5,
    },
  },
};

const CERTIFICATIONS = [
  'Armed Guard License',
  'Unarmed Guard License',
  'CPR/First Aid',
  'Fire Safety',
  'Crowd Control',
  'Executive Protection',
  'K-9 Handler',
  'HAZMAT Certified',
];

const SHIFT_TITLES = [
  'Security Patrol',
  'Front Desk Guard',
  'Event Security',
  'Night Watch',
  'Executive Protection',
  'Access Control',
  'Parking Lot Patrol',
  'Warehouse Security',
  'Retail Loss Prevention',
  'Hospital Security',
];

export class ScenarioSeederService {
  /**
   * Seed training shifts for a given difficulty level
   */
  async seedScenario(
    workspaceId: string, 
    difficulty: DifficultyLevel
  ): Promise<{
    scenarioId: string;
    runId: string;
    shiftsCreated: number;
    employeesAvailable: number;
    clientsAvailable: number;
  }> {
    const config = SCENARIO_PRESETS[difficulty];
    
    // Get existing employees and clients for this workspace
    const existingEmployees = await db.select().from(employees).where(eq(employees.workspaceId, workspaceId));
    const existingClients = await db.select().from(clients).where(eq(clients.workspaceId, workspaceId));
    
    if (existingEmployees.length === 0) {
      throw new Error('No employees found. Please add employees before seeding training scenarios.');
    }
    
    if (existingClients.length === 0) {
      throw new Error('No clients found. Please add clients before seeding training scenarios.');
    }
    
    // Create training scenario record
    const [scenario] = await db.insert(trainingScenarios).values({
      workspaceId,
      name: config.name,
      description: config.description,
      difficulty: config.difficulty,
      totalShifts: config.shiftsToCreate,
      constraintComplexity: Math.ceil(Object.values(config.constraintConfig).reduce((a, b) => a + b, 0) / 7),
      employeeVariety: existingEmployees.length,
      clientVariety: existingClients.length,
      hasAvailabilityConflicts: config.constraintConfig.availabilityConflicts > 0,
      hasCertificationRequirements: config.constraintConfig.certificationRequirements > 0,
      hasClientPreferences: config.constraintConfig.clientPreferences > 0,
      hasClientExclusions: config.constraintConfig.clientExclusions > 0,
      hasTravelPayConstraints: config.constraintConfig.travelPayIssues > 0,
      hasOvertimeRisks: config.constraintConfig.overtimeRisks > 0,
      hasLowScoreEmployees: config.constraintConfig.lowScoreEmployees > 0,
      isActive: true,
    }).returning();
    
    // Create training run record
    const [run] = await db.insert(trainingRuns).values({
      workspaceId,
      scenarioId: scenario.id,
      difficulty: config.difficulty,
      status: 'pending',
      totalShifts: config.shiftsToCreate,
      assignedShifts: 0,
      failedShifts: 0,
      confidenceStart: '0.5000',
    }).returning();
    
    // Generate shifts based on difficulty
    const shiftsToInsert = this.generateShifts(
      workspaceId,
      scenario.id,
      config,
      existingEmployees,
      existingClients
    );
    
    // Insert all shifts
    await db.insert(shifts).values(shiftsToInsert);
    
    console.log(`[ScenarioSeeder] Created ${shiftsToInsert.length} training shifts for ${difficulty} difficulty`);
    
    return {
      scenarioId: scenario.id,
      runId: run.id,
      shiftsCreated: shiftsToInsert.length,
      employeesAvailable: existingEmployees.length,
      clientsAvailable: existingClients.length,
    };
  }
  
  /**
   * Generate shift data based on configuration
   */
  private generateShifts(
    workspaceId: string,
    scenarioId: string,
    config: ScenarioConfig,
    employees: any[],
    clients: any[]
  ) {
    const shiftsData: any[] = [];
    const startDate = new Date();
    startDate.setHours(6, 0, 0, 0);
    startDate.setDate(startDate.getDate() + 1); // Start tomorrow
    
    for (let i = 0; i < config.shiftsToCreate; i++) {
      const client = clients[i % clients.length];
      const shiftDate = new Date(startDate);
      shiftDate.setDate(shiftDate.getDate() + Math.floor(i / 4)); // 4 shifts per day
      
      const hourOffset = (i % 4) * 6; // 6, 12, 18, 24 (wraps)
      const startTime = new Date(shiftDate);
      startTime.setHours(6 + hourOffset, 0, 0, 0);
      
      const endTime = new Date(startTime);
      endTime.setHours(endTime.getHours() + 8); // 8-hour shifts
      
      // Apply constraints based on difficulty
      const constraints = this.generateConstraints(config, employees, i);
      
      shiftsData.push({
        workspaceId,
        employeeId: null, // Open shift - Trinity needs to assign
        clientId: client.id,
        title: SHIFT_TITLES[i % SHIFT_TITLES.length],
        description: `Training shift ${i + 1} - ${config.difficulty} difficulty`,
        startTime,
        endTime,
        status: 'draft',
        aiGenerated: false,
        isTrainingShift: true,
        scenarioId,
        difficultyLevel: config.difficulty,
        contractRate: this.randomDecimal(25, 75).toString(), // $25-75/hr contract rate
        travelPay: constraints.hasTravelPay ? this.randomDecimal(10, 50).toString() : null,
        travelDistanceMiles: constraints.hasTravelPay ? this.randomDecimal(5, 50).toString() : null,
        requiredCertifications: constraints.certifications,
        preferredEmployeeIds: constraints.preferredEmployees,
        excludedEmployeeIds: constraints.excludedEmployees,
        minimumScore: constraints.minimumScore?.toString() || null,
        riskScore: constraints.riskScore.toString(),
        riskFactors: constraints.riskFactors,
      });
    }
    
    return shiftsData;
  }
  
  /**
   * Generate constraints for a shift based on difficulty config
   */
  private generateConstraints(
    config: ScenarioConfig,
    employees: any[],
    shiftIndex: number
  ) {
    const cc = config.constraintConfig;
    const employeeIds = employees.map(e => e.id);
    
    // Randomly apply constraints based on config levels (0-10)
    const hasCertifications = Math.random() * 10 < cc.certificationRequirements;
    const hasPreferences = Math.random() * 10 < cc.clientPreferences;
    const hasExclusions = Math.random() * 10 < cc.clientExclusions;
    const hasTravelPay = Math.random() * 10 < cc.travelPayIssues;
    const hasMinScore = Math.random() * 10 < cc.lowScoreEmployees;
    
    // Generate risk factors
    const riskFactors: string[] = [];
    if (cc.overtimeRisks > 0 && Math.random() * 10 < cc.overtimeRisks) {
      riskFactors.push('overtime_risk');
    }
    if (hasTravelPay) {
      riskFactors.push('high_travel_cost');
    }
    if (cc.availabilityConflicts > 0 && Math.random() * 10 < cc.availabilityConflicts) {
      riskFactors.push('availability_conflict');
    }
    
    return {
      certifications: hasCertifications 
        ? this.randomSubset(CERTIFICATIONS, 1, 3) 
        : [],
      preferredEmployees: hasPreferences 
        ? this.randomSubset(employeeIds, 1, Math.min(3, employeeIds.length)) 
        : [],
      excludedEmployees: hasExclusions 
        ? this.randomSubset(employeeIds, 1, Math.min(2, employeeIds.length)) 
        : [],
      hasTravelPay,
      minimumScore: hasMinScore ? this.randomDecimal(0.6, 0.9) : null,
      riskScore: this.randomDecimal(0.1, config.difficulty === 'hard' ? 0.8 : config.difficulty === 'medium' ? 0.5 : 0.3),
      riskFactors,
    };
  }
  
  /**
   * Clear training shift assignments (re-open shifts for next training run)
   * This nullifies employeeId but keeps the shifts intact
   */
  async clearAssignments(workspaceId: string): Promise<{
    shiftsCleared: number;
    runReset: boolean;
  }> {
    // Get active scenario
    const [activeScenario] = await db.select()
      .from(trainingScenarios)
      .where(and(
        eq(trainingScenarios.workspaceId, workspaceId),
        eq(trainingScenarios.isActive, true)
      ))
      .limit(1);
    
    if (!activeScenario) {
      return { shiftsCleared: 0, runReset: false };
    }
    
    // Clear employee assignments on training shifts (re-open them)
    const clearedShifts = await db.update(shifts)
      .set({
        employeeId: null,
        status: 'draft',
      })
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.isTrainingShift, true),
        eq(shifts.scenarioId, activeScenario.id)
      ))
      .returning();
    
    // Reset the training run metrics
    await db.update(trainingRuns)
      .set({
        status: 'pending',
        assignedShifts: 0,
        failedShifts: 0,
        averageConfidence: null,
        totalCreditsUsed: null,
        startedAt: null,
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(trainingRuns.scenarioId, activeScenario.id));
    
    console.log(`[ScenarioSeeder] Cleared ${clearedShifts.length} shift assignments for next training run`);
    
    return {
      shiftsCleared: clearedShifts.length,
      runReset: true,
    };
  }
  
  /**
   * Delete all training data for a workspace (full reset)
   */
  async resetTraining(workspaceId: string): Promise<{
    shiftsDeleted: number;
    scenariosDeleted: number;
    runsDeleted: number;
  }> {
    // Delete training shifts
    const deletedShifts = await db.delete(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.isTrainingShift, true)
      ))
      .returning();
    
    // Delete training runs
    const deletedRuns = await db.delete(trainingRuns)
      .where(eq(trainingRuns.workspaceId, workspaceId))
      .returning();
    
    // Delete training scenarios
    const deletedScenarios = await db.delete(trainingScenarios)
      .where(eq(trainingScenarios.workspaceId, workspaceId))
      .returning();
    
    console.log(`[ScenarioSeeder] Full reset: ${deletedShifts.length} shifts, ${deletedScenarios.length} scenarios, ${deletedRuns.length} runs deleted`);
    
    return {
      shiftsDeleted: deletedShifts.length,
      scenariosDeleted: deletedScenarios.length,
      runsDeleted: deletedRuns.length,
    };
  }
  
  /**
   * Get current training status
   */
  async getTrainingStatus(workspaceId: string): Promise<{
    hasActiveScenario: boolean;
    currentScenario: any | null;
    currentRun: any | null;
    shiftsRemaining: number;
    shiftsAssigned: number;
  }> {
    const [activeScenario] = await db.select()
      .from(trainingScenarios)
      .where(and(
        eq(trainingScenarios.workspaceId, workspaceId),
        eq(trainingScenarios.isActive, true)
      ))
      .limit(1);
    
    if (!activeScenario) {
      return {
        hasActiveScenario: false,
        currentScenario: null,
        currentRun: null,
        shiftsRemaining: 0,
        shiftsAssigned: 0,
      };
    }
    
    const [currentRun] = await db.select()
      .from(trainingRuns)
      .where(eq(trainingRuns.scenarioId, activeScenario.id))
      .limit(1);
    
    // Count unassigned training shifts
    const trainingShifts = await db.select()
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.isTrainingShift, true),
        eq(shifts.scenarioId, activeScenario.id)
      ));
    
    const unassigned = trainingShifts.filter(s => !s.employeeId);
    const assigned = trainingShifts.filter(s => s.employeeId);
    
    return {
      hasActiveScenario: true,
      currentScenario: activeScenario,
      currentRun: currentRun || null,
      shiftsRemaining: unassigned.length,
      shiftsAssigned: assigned.length,
    };
  }
  
  /**
   * Start a training run - Trinity attempts to fill all open shifts
   */
  async startTrainingRun(workspaceId: string, runId: string): Promise<void> {
    await db.update(trainingRuns)
      .set({
        status: 'running',
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(trainingRuns.id, runId));
  }
  
  /**
   * Complete a training run with metrics
   */
  async completeTrainingRun(
    runId: string,
    metrics: {
      assignedShifts: number;
      failedShifts: number;
      averageConfidence: number;
      totalCreditsUsed: number;
      thoughtLog: string[];
      lessonsLearned: string[];
    }
  ): Promise<void> {
    const [run] = await db.select().from(trainingRuns).where(eq(trainingRuns.id, runId)).limit(1);
    
    const confidenceStart = Number(run?.confidenceStart || 0.5);
    const confidenceDelta = metrics.averageConfidence - confidenceStart;
    
    await db.update(trainingRuns)
      .set({
        status: 'completed',
        assignedShifts: metrics.assignedShifts,
        failedShifts: metrics.failedShifts,
        averageConfidence: metrics.averageConfidence.toFixed(4),
        totalCreditsUsed: metrics.totalCreditsUsed.toFixed(2),
        confidenceEnd: metrics.averageConfidence.toFixed(4),
        confidenceDelta: confidenceDelta.toFixed(4),
        thoughtLog: metrics.thoughtLog,
        lessonsLearned: metrics.lessonsLearned,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(trainingRuns.id, runId));
  }
  
  // Utility methods
  private randomDecimal(min: number, max: number): number {
    return Math.round((Math.random() * (max - min) + min) * 100) / 100;
  }
  
  private randomSubset<T>(array: T[], min: number, max: number): T[] {
    const count = Math.floor(Math.random() * (max - min + 1)) + min;
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }
}

export const scenarioSeederService = new ScenarioSeederService();
