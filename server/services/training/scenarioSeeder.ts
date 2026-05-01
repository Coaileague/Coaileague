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
import {
  shifts,
  employees,
  clients,
  clientRates,
  trainingScenarios,
  trainingRuns
} from '@shared/schema';
import { eq, and, inArray, isNotNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { broadcastToWorkspace } from '../../websocket';
import { automationExecutionTracker } from '../orchestration/automationExecutionTracker';
import { trinityAutonomousScheduler, RunAssignmentTracker } from '../scheduling/trinityAutonomousScheduler';

export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'meta' | 'extreme' | 'org';

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
  org: {
    name: 'Real Org Data — Live Acme Staffing Simulation',
    description: 'Training shifts generated directly from real client contracts and employee pay rates. No synthetic data — Trinity practices on actual org staffing patterns.',
    difficulty: 'org',
    shiftsToCreate: 0, // computed dynamically from real client portfolio
    constraintConfig: {
      availabilityConflicts: 5,
      certificationRequirements: 5,
      clientPreferences: 5,
      clientExclusions: 3,
      travelPayIssues: 4,
      overtimeRisks: 6,
      lowScoreEmployees: 3,
    },
  },
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
  meta: {
    name: 'META Training - Strategic Mastery',
    description: 'Advanced scenarios with competing priorities, budget constraints, multi-site coordination, and strategic trade-offs. 150 shifts across 14 days.',
    difficulty: 'meta',
    shiftsToCreate: 150,
    constraintConfig: {
      availabilityConflicts: 8,
      certificationRequirements: 9,
      clientPreferences: 8,
      clientExclusions: 7,
      travelPayIssues: 9,
      overtimeRisks: 8,
      lowScoreEmployees: 7,
    },
  },
  extreme: {
    name: 'EXTREME Training - Fortune 500 Enterprise Scale',
    description: 'Enterprise volume scaled to workforce capacity across 7 days, all constraints at max, impossible trade-offs, emergency scenarios, and crisis management. Shift count auto-scales to ~80% of workforce capacity to test scheduling under pressure without mathematically impossible OT scenarios.',
    difficulty: 'extreme',
    shiftsToCreate: 0,
    constraintConfig: {
      availabilityConflicts: 10,
      certificationRequirements: 10,
      clientPreferences: 10,
      clientExclusions: 10,
      travelPayIssues: 10,
      overtimeRisks: 10,
      lowScoreEmployees: 10,
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

// Maps client company name keywords to appropriate shift titles
function getClientShiftTitle(companyName: string): string {
  const name = companyName.toLowerCase();
  if (name.includes('bank') || name.includes('financial') || name.includes('credit')) return 'Bank Security Officer';
  if (name.includes('medical') || name.includes('hospital') || name.includes('clinic') || name.includes('health')) return 'Healthcare Security Officer';
  if (name.includes('distribution') || name.includes('warehouse') || name.includes('logistics') || name.includes('supply')) return 'Warehouse Security Officer';
  if (name.includes('event') || name.includes('stadium') || name.includes('arena') || name.includes('camp')) return 'Event Security Officer';
  if (name.includes('retail') || name.includes('store') || name.includes('shop') || name.includes('mart')) return 'Retail Loss Prevention Officer';
  if (name.includes('school') || name.includes('university') || name.includes('college') || name.includes('academy')) return 'Campus Security Officer';
  if (name.includes('airport') || name.includes('transit') || name.includes('port')) return 'Transportation Security Officer';
  if (name.includes('hotel') || name.includes('resort') || name.includes('hospitality')) return 'Hospitality Security Officer';
  if (name.includes('tech') || name.includes('data') || name.includes('software')) return 'Corporate Security Officer';
  return 'Security Officer';
}

export class ScenarioSeederService {
  /**
   * Seed training shifts using real org data — real client rates, real employee pay rates,
   * real Acme staffing patterns. Trinity trains on actual org data instead of synthetic values.
   */
  async seedWithOrgData(workspaceId: string): Promise<{
    scenarioId: string;
    runId: string;
    shiftsCreated: number;
    employeesAvailable: number;
    clientsAvailable: number;
    clientRatesUsed: number;
  }> {
    // Fetch active employees with real hourly rates
    const activeEmployees = await db.select().from(employees).where(
      and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true))
    );
    if (activeEmployees.length === 0) {
      throw new Error(`No active employees found in workspace ${workspaceId}.`);
    }

    // Fetch active clients
    const activeClients = await db.select().from(clients).where(
      and(eq(clients.workspaceId, workspaceId), eq(clients.isActive, true))
    );
    if (activeClients.length === 0) {
      throw new Error(`No active clients found in workspace ${workspaceId}.`);
    }

    // Fetch client rates — one billable rate per client (first active rate wins)
    const allClientRates = await db.select().from(clientRates).where(
      and(eq(clientRates.workspaceId, workspaceId), eq(clientRates.isActive, true))
    );

    // Build map: clientId → billable rate (decimal)
    const clientRatesMap = new Map<string, number>();
    for (const cr of allClientRates) {
      if (!clientRatesMap.has(cr.clientId) && cr.billableRate) {
        clientRatesMap.set(cr.clientId, parseFloat(cr.billableRate));
      }
    }

    // Default fallback rate for clients without a rate record
    const DEFAULT_RATE = 28.00;

    // Classify clients by tier based on their actual bill rate
    // Enterprise ($35+): 24/7 coverage — 3 shifts/day × 7 days = 21 shifts each
    // Mid-size ($25-35): Business hours — 2 shifts/day × 7 days = 14 shifts each
    // Small (<$25): Daytime only — 1 shift/day × 5 days = 5 shifts each
    type ClientTier = 'enterprise' | 'midsize' | 'small';
    const clientTiers = new Map<string, ClientTier>();
    for (const client of activeClients) {
      const rate = clientRatesMap.get(client.id) ?? DEFAULT_RATE;
      if (rate >= 35) clientTiers.set(client.id, 'enterprise');
      else if (rate >= 25) clientTiers.set(client.id, 'midsize');
      else clientTiers.set(client.id, 'small');
    }

    // Shift hours by tier
    const TIER_HOURS: Record<ClientTier, number[]> = {
      enterprise: [0, 8, 16],   // 24/7 coverage: midnight, day, evening
      midsize:    [8, 16],       // Business hours: day and evening shifts
      small:      [9],           // Daytime only: single morning shift
    };
    const TIER_DAYS: Record<ClientTier, number> = {
      enterprise: 7,
      midsize:    7,
      small:      5,
    };
    const SHIFT_DURATION_HOURS = 8; // Standard 8-hour shift

    // Average pay rate from real employee data (used as default payRate on shifts)
    const avgPayRate = activeEmployees.reduce((sum, e) => {
      return sum + (e.hourlyRate ? parseFloat(e.hourlyRate) : 20.00);
    }, 0) / activeEmployees.length;

    const config = { ...SCENARIO_PRESETS['org'] };
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    // Create scenario record
    const [scenario] = await db.insert(trainingScenarios).values({
      workspaceId,
      name: config.name,
      description: config.description,
      difficulty: 'org',
      totalShifts: 0, // will update after generating
      constraintComplexity: 5,
      employeeVariety: activeEmployees.length,
      clientVariety: activeClients.length,
      hasAvailabilityConflicts: true,
      hasCertificationRequirements: true,
      hasClientPreferences: true,
      hasClientExclusions: true,
      hasTravelPayConstraints: true,
      hasOvertimeRisks: true,
      hasLowScoreEmployees: true,
      isActive: true,
    }).returning();

    // Generate shifts mirroring real Acme staffing patterns
    const shiftsData: any[] = [];
    const employeeIds = activeEmployees.map(e => e.id);
    let shiftIndex = 0;

    for (const client of activeClients) {
      const tier = clientTiers.get(client.id) ?? 'midsize';
      const billRate = clientRatesMap.get(client.id) ?? DEFAULT_RATE;
      const shiftHours = TIER_HOURS[tier];
      const numDays = TIER_DAYS[tier];
      const title = getClientShiftTitle(client.companyName || '');

      for (let day = 0; day < numDays; day++) {
        for (const hour of shiftHours) {
          const shiftDate = new Date(startDate);
          shiftDate.setDate(shiftDate.getDate() + day);

          const startTime = new Date(shiftDate);
          startTime.setHours(hour, 0, 0, 0);

          const endTime = new Date(startTime);
          endTime.setHours(endTime.getHours() + SHIFT_DURATION_HOURS);

          // Apply realistic constraints proportional to tier complexity
          const constraints = this.generateConstraints(config, activeEmployees, shiftIndex);

          shiftsData.push({
            workspaceId,
            employeeId: null,
            clientId: client.id,
            title,
            description: `${tier.charAt(0).toUpperCase() + tier.slice(1)}-tier shift for ${client.companyName} — org training scenario`,
            startTime,
            endTime,
            status: 'draft',
            aiGenerated: false,
            isTrainingShift: true,
            scenarioId: scenario.id,
            difficultyLevel: 'org',
            // Real rates — no hardcoding
            contractRate: billRate.toFixed(2),
            billRate: billRate.toFixed(2),
            payRate: avgPayRate.toFixed(2),
            travelPay: constraints.hasTravelPay ? this.randomDecimal(10, 30).toString() : null,
            travelDistanceMiles: constraints.hasTravelPay ? this.randomDecimal(5, 25).toString() : null,
            requiredCertifications: constraints.certifications,
            preferredEmployeeIds: constraints.preferredEmployees,
            excludedEmployeeIds: constraints.excludedEmployees,
            minimumScore: constraints.minimumScore?.toString() || null,
            riskScore: constraints.riskScore.toString(),
            riskFactors: constraints.riskFactors,
          });

          shiftIndex++;
        }
      }
    }

    // Create training run
    const [run] = await db.insert(trainingRuns).values({
      workspaceId,
      scenarioId: scenario.id,
      difficulty: 'org',
      status: 'pending',
      totalShifts: shiftsData.length,
      assignedShifts: 0,
      failedShifts: 0,
      confidenceStart: '0.5000',
    }).returning();

    // Insert all shifts in batches
    const BATCH_SIZE = 100;
    for (let i = 0; i < shiftsData.length; i += BATCH_SIZE) {
      await db.insert(shifts).values(shiftsData.slice(i, i + BATCH_SIZE));
    }

    console.log(`[ScenarioSeeder] Org mode: created ${shiftsData.length} training shifts from ${activeClients.length} real Acme clients (${clientRatesMap.size} with real rates)`);

    return {
      scenarioId: scenario.id,
      runId: run.id,
      shiftsCreated: shiftsData.length,
      employeesAvailable: activeEmployees.length,
      clientsAvailable: activeClients.length,
      clientRatesUsed: clientRatesMap.size,
    };
  }

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
    // Org mode uses real org data — route to dedicated method
    if (difficulty === 'org') {
      return this.seedWithOrgData(workspaceId);
    }

    const config = { ...SCENARIO_PRESETS[difficulty] };
    
    const existingEmployees = await db.select().from(employees).where(eq(employees.workspaceId, workspaceId));
    const existingClients = await db.select().from(clients).where(eq(clients.workspaceId, workspaceId));
    
    if (existingEmployees.length === 0) {
      throw new Error(`No employees found in workspace ${workspaceId}. Please add employees before seeding training scenarios.`);
    }
    
    if (existingClients.length === 0) {
      throw new Error(`No clients found in workspace ${workspaceId}. Please add clients before seeding training scenarios.`);
    }

    // Fetch real client rates for non-org modes too
    const allRates = await db.select().from(clientRates).where(
      and(eq(clientRates.workspaceId, workspaceId), eq(clientRates.isActive, true))
    );
    const clientRatesMap = new Map<string, number>();
    for (const cr of allRates) {
      if (!clientRatesMap.has(cr.clientId) && cr.billableRate) {
        clientRatesMap.set(cr.clientId, parseFloat(cr.billableRate));
      }
    }

    if (config.shiftsToCreate === 0 || difficulty === 'extreme') {
      const avgShiftHours = 7;
      const maxWeeklyHoursPerEmployee = 40;
      const shiftsPerEmployee = Math.floor(maxWeeklyHoursPerEmployee / avgShiftHours);
      const workforceCapacity = existingEmployees.length * shiftsPerEmployee;
      config.shiftsToCreate = Math.max(20, Math.round(workforceCapacity * 0.85));
      console.log(`[ScenarioSeeder] Extreme mode: ${existingEmployees.length} employees × ${shiftsPerEmployee} shifts/emp × 0.85 = ${config.shiftsToCreate} shifts`);
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
    
    // Generate shifts based on difficulty using real client rates
    const shiftsToInsert = this.generateShifts(
      workspaceId,
      scenario.id,
      config,
      existingEmployees,
      existingClients,
      clientRatesMap
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
   * Generate shift data based on configuration.
   * Uses real client billing rates from clientRatesMap when available — no hardcoded rates.
   */
  private generateShifts(
    workspaceId: string,
    scenarioId: string,
    config: ScenarioConfig,
    employees: any[],
    clients: any[],
    clientRatesMap: Map<string, number> = new Map()
  ) {
    const shiftsData: any[] = [];
    const startDate = new Date();
    startDate.setHours(6, 0, 0, 0);
    
    const totalShifts = config.shiftsToCreate;
    const isEnterprise = totalShifts > 100;
    const totalDays = isEnterprise ? 7 : Math.max(14, Math.ceil(totalShifts / 3));
    const shiftsPerDay = Math.ceil(totalShifts / totalDays);
    const shiftStartHours = isEnterprise 
      ? [0, 4, 6, 7, 8, 10, 12, 14, 16, 18, 20, 22]
      : [6, 14, 22];
    
    for (let i = 0; i < config.shiftsToCreate; i++) {
      const client = clients[i % clients.length];
      const dayIndex = Math.floor(i / shiftsPerDay);
      const slotIndex = i % shiftsPerDay;
      
      const shiftDate = new Date(startDate);
      shiftDate.setDate(shiftDate.getDate() + dayIndex);
      
      const startHour = shiftStartHours[slotIndex % shiftStartHours.length];
      const startTime = new Date(shiftDate);
      startTime.setHours(startHour, Math.floor(Math.random() * 4) * 15, 0, 0);
      
      const shiftDuration = isEnterprise ? (4 + Math.floor(Math.random() * 5)) : 8;
      const endTime = new Date(startTime);
      endTime.setHours(endTime.getHours() + shiftDuration);
      
      // Apply constraints based on difficulty
      const constraints = this.generateConstraints(config, employees, i);

      // Use real client billing rate — fall back only if no rate found for this client
      const realRate = clientRatesMap.get(client.id);
      const contractRate = realRate
        ? realRate.toFixed(2)
        : this.randomDecimal(22, 45).toString(); // narrowed range if no real rate
      
      shiftsData.push({
        workspaceId,
        employeeId: null, // Open shift - Trinity needs to assign
        clientId: client.id,
        title: getClientShiftTitle(client.companyName || ''),
        description: `Training shift ${i + 1} — ${config.difficulty} difficulty`,
        startTime,
        endTime,
        status: 'draft',
        aiGenerated: false,
        isTrainingShift: true,
        scenarioId,
        difficultyLevel: config.difficulty,
        contractRate,
        billRate: contractRate,
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
      riskScore: this.randomDecimal(0.1, config.difficulty === 'extreme' ? 0.95 : config.difficulty === 'meta' ? 0.85 : config.difficulty === 'hard' ? 0.8 : config.difficulty === 'medium' ? 0.5 : 0.3),
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
        status: 'draft', // Use 'draft' as 'open' is not a valid shift_status enum
      })
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.isTrainingShift, true),
        eq(shifts.scenarioId, activeScenario.id)
      ))
      .returning();
    
    // Reset the training run metrics including thoughtLog
    await db.update(trainingRuns)
      .set({
        status: 'pending',
        assignedShifts: 0,
        failedShifts: 0,
        averageConfidence: null,
        totalCreditsUsed: null,
        thoughtLog: null,
        confidenceDelta: null,
        lessonsLearned: null,
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
   * This now actually processes shifts with AI and shows thinking patterns
   */
  async startTrainingRun(workspaceId: string, runId: string): Promise<void> {
    // Mark as running
    await db.update(trainingRuns)
      .set({
        status: 'running',
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(trainingRuns.id, runId));

    // Start async processing (don't await - let it run in background)
    this.processTrainingShifts(workspaceId, runId).catch(err => {
      console.error('[ScenarioSeeder] Training processing error:', err);
    });
  }

  /**
   * Process training shifts with AI-powered assignment and thinking patterns
   */
  private async processTrainingShifts(workspaceId: string, runId: string): Promise<void> {
    console.log(`[ScenarioSeeder] Starting training run ${runId}`);
    const startTime = Date.now();
    
    const [run] = await db.select().from(trainingRuns).where(eq(trainingRuns.id, runId)).limit(1);
    if (!run) {
      console.error('[ScenarioSeeder] Run not found:', runId);
      return;
    }

    const unassignedShifts = await db.select()
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.isTrainingShift, true),
        eq(shifts.scenarioId, run.scenarioId)
      ));

    const shiftsToProcess = unassignedShifts.filter(s => !s.employeeId);
    console.log(`[ScenarioSeeder] Found ${shiftsToProcess.length} shifts to process`);

    let executionId: string | undefined;
    try {
      executionId = await automationExecutionTracker.createExecution({
        workspaceId,
        actionType: 'schedule_publish',
        actionName: `Trinity Training Run (${shiftsToProcess.length} shifts)`,
        actionId: runId,
        triggeredBy: 'trinity_training',
        triggerSource: 'button_click',
        inputPayload: { runId, scenarioId: run.scenarioId, shiftCount: shiftsToProcess.length },
        requiresVerification: true,
      });
      await automationExecutionTracker.startExecution(executionId);
      console.log(`[ScenarioSeeder] Registered execution ${executionId} for training run ${runId}`);
    } catch (err: unknown) {
      console.error(`[ScenarioSeeder] Failed to register execution tracker:`, (err instanceof Error ? err.message : String(err)));
    }
    
    broadcastToWorkspace(workspaceId, {
      type: 'trinity_scheduling_started',
      sessionId: runId,
      executionId,
      totalShifts: shiftsToProcess.length,
      timestamp: Date.now(),
    });
    console.log(`[ScenarioSeeder] Broadcast trinity_scheduling_started to workspace ${workspaceId}`);

    const availableEmployees = await db.select().from(employees).where(eq(employees.workspaceId, workspaceId));
    
    if (availableEmployees.length === 0) {
      console.error('[ScenarioSeeder] No employees available');
      await this.completeTrainingRun(runId, {
        assignedShifts: 0,
        failedShifts: shiftsToProcess.length,
        averageConfidence: 0,
        totalCreditsUsed: 0,
        thoughtLog: ['Error: No employees available in workspace'],
        lessonsLearned: ['Ensure employees are added before training'],
      });
      return;
    }

    const allClients = await db.select().from(clients).where(eq(clients.workspaceId, workspaceId));
    console.log(`[ScenarioSeeder] Loaded ${availableEmployees.length} employees, ${allClients.length} clients`);

    const runTracker = new RunAssignmentTracker();

    let assignedCount = 0;
    let failedCount = 0;
    let totalConfidence = 0;
    const thoughtLog: string[] = [];
    const lessonsLearned: string[] = [];
    
    const shiftsToAutoAssign = shiftsToProcess.length;
    console.log(`[ScenarioSeeder] Will process ${shiftsToAutoAssign} shifts using real Trinity scheduling engine (rapid-fire mode)`);

    const BATCH_SIZE = 5;
    const BATCH_PAUSE_MS = 80;

    trinityAutonomousScheduler.clearScoringCache();

    for (let i = 0; i < shiftsToAutoAssign; i++) {
      const shift = shiftsToProcess[i];
      
      try {
        broadcastToWorkspace(workspaceId, {
          type: 'trinity_scheduling_progress',
          currentShiftId: shift.id,
          currentIndex: i + 1,
          totalShifts: shiftsToProcess.length,
          status: 'analyzing',
          message: `Analyzing: ${shift.title}`,
          shiftTitle: shift.title,
        });

        const evalResult = await trinityAutonomousScheduler.evaluateShiftForTraining(
          shift,
          availableEmployees,
          allClients,
          workspaceId,
          runTracker
        );

        if (evalResult.success && evalResult.employee) {
          const shiftStart = new Date(shift.startTime);
          const shiftEnd = new Date(shift.endTime);
          const shiftHours = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60 * 60);

          await db.update(shifts)
            .set({
              employeeId: evalResult.employee.id,
              status: 'scheduled',
              aiGenerated: true,
            })
            .where(eq(shifts.id, shift.id));

          runTracker.record({
            shiftId: shift.id,
            employeeId: evalResult.employee.id,
            startTime: shiftStart,
            endTime: shiftEnd,
            shiftHours,
          });
          
          assignedCount++;
          totalConfidence += evalResult.confidence;

          broadcastToWorkspace(workspaceId, {
            type: 'trinity_scheduling_progress',
            currentShiftId: shift.id,
            currentIndex: i + 1,
            totalShifts: shiftsToProcess.length,
            status: 'assigned',
            message: `Assigned ${evalResult.employee.firstName} ${evalResult.employee.lastName} to ${shift.title}`,
            employeeId: evalResult.employee.id,
            employeeName: `${evalResult.employee.firstName} ${evalResult.employee.lastName}`,
            confidence: evalResult.confidence,
          });

          broadcastToWorkspace(workspaceId, {
            type: 'trinity_thinking_step',
            currentShiftId: shift.id,
            currentIndex: i + 1,
            totalShifts: shiftsToProcess.length,
            step: 'decision',
            message: `Assigned ${evalResult.employee.firstName} ${evalResult.employee.lastName} — ${evalResult.reasoning}`,
            scoreBreakdown: evalResult.scoreBreakdown,
          });

          thoughtLog.push(`[${i + 1}] ${evalResult.employee.firstName} ${evalResult.employee.lastName} → ${shift.title} (${(evalResult.confidence * 100).toFixed(0)}%)`);
        } else {
          failedCount++;

          broadcastToWorkspace(workspaceId, {
            type: 'trinity_scheduling_progress',
            currentShiftId: shift.id,
            currentIndex: i + 1,
            totalShifts: shiftsToProcess.length,
            status: 'skipped',
            message: `Skipped: ${evalResult.reasoning}`,
          });

          thoughtLog.push(`[${i + 1}] SKIP ${shift.title}: ${evalResult.reasoning}`);
        }

        if ((i + 1) % BATCH_SIZE === 0 || i === shiftsToAutoAssign - 1) {
          await db.update(trainingRuns)
            .set({
              assignedShifts: assignedCount,
              failedShifts: failedCount,
              thoughtLog: thoughtLog.slice(-50),
              updatedAt: new Date(),
            })
            .where(eq(trainingRuns.id, runId));

          await new Promise<void>(resolve => setTimeout(resolve, BATCH_PAUSE_MS));
        }

      } catch (error: unknown) {
        failedCount++;
        thoughtLog.push(`[${i + 1}] ERROR ${shift.id}: ${(error instanceof Error ? error.message : String(error))}`);
        console.error(`[ScenarioSeeder] Error processing shift:`, (error instanceof Error ? error.message : String(error)));

        broadcastToWorkspace(workspaceId, {
          type: 'trinity_scheduling_progress',
          currentShiftId: shift.id,
          currentIndex: i + 1,
          totalShifts: shiftsToProcess.length,
          status: 'error',
          message: `Error: ${(error instanceof Error ? error.message : String(error))}`,
        });
      }
    }

    if (assignedCount > 0) {
      lessonsLearned.push(`Successfully assigned ${assignedCount} of ${shiftsToProcess.length} shifts`);
    }
    if (failedCount > 0) {
      lessonsLearned.push(`${failedCount} shifts could not be assigned — all candidates had conflicts`);
    }
    if (assignedCount > 0 && totalConfidence / assignedCount > 0.7) {
      lessonsLearned.push('Strong confidence scores — good employee-shift matching');
    }
    if (assignedCount > 0 && totalConfidence / assignedCount <= 0.5) {
      lessonsLearned.push('Low confidence — consider adding more employees or relaxing constraints');
    }

    await this.completeTrainingRun(runId, {
      assignedShifts: assignedCount,
      failedShifts: failedCount,
      averageConfidence: assignedCount > 0 ? totalConfidence / assignedCount : 0,
      totalCreditsUsed: shiftsToProcess.length * 0.01,
      thoughtLog,
      lessonsLearned,
    });

    if (executionId) {
      try {
        await automationExecutionTracker.completeExecution(executionId, {
          outputPayload: {
            assignedCount,
            failedCount,
            totalShifts: shiftsToProcess.length,
            averageConfidence: assignedCount > 0 ? totalConfidence / assignedCount : 0,
          },
          itemsProcessed: assignedCount,
          itemsFailed: failedCount,
          processingTimeMs: Date.now() - startTime,
          requiresVerification: true,
          aiSummary: `Trinity evaluated ${availableEmployees.length} employees across ${shiftsToProcess.length} shifts. ${assignedCount} assigned, ${failedCount} skipped due to conflicts.`,
        });
        console.log(`[ScenarioSeeder] Completed execution ${executionId} with pending_verification`);
      } catch (err: unknown) {
        console.error(`[ScenarioSeeder] Failed to complete execution tracker:`, (err instanceof Error ? err.message : String(err)));
      }
    }
    
    const openShiftsRemaining = failedCount;
    broadcastToWorkspace(workspaceId, {
      type: 'trinity_scheduling_completed',
      sessionId: runId,
      executionId,
      totalAssigned: assignedCount,
      totalFailed: failedCount,
      totalShifts: shiftsToProcess.length,
      openShiftsRemaining,
      duration: Date.now() - startTime,
      mutationCount: assignedCount,
      summary: {
        openShiftsFilled: assignedCount,
        openShiftsRemaining,
        shiftsCreated: 0,
        employeesSwapped: 0,
        shiftsEdited: 0,
        shiftsDeleted: 0,
      },
    });
    console.log(`[ScenarioSeeder] Training run completed: ${assignedCount} assigned, ${failedCount} failed`);
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
