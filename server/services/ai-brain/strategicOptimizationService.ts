/**
 * STRATEGIC BUSINESS OPTIMIZATION SERVICE
 * =========================================
 * Profit-First AI Decision Making for Trinity
 * 
 * This service transforms Trinity from operational automation to 
 * strategic business management with profit-first decision making.
 * 
 * Features:
 * - Employee scoring (reliability, satisfaction, experience weighted)
 * - Client tiering (enterprise, premium, standard, trial)
 * - Profit optimization per shift
 * - Risk-adjusted profit calculations
 * - Strategic matching (employee quality → client value)
 */

import { db } from '../../db';
import {
  employees,
  clients,
  shifts,
  timeEntries
} from '@shared/schema';
import { eq, and, gte, lte, desc, sql, count, avg } from 'drizzle-orm';

import { createLogger } from '../../lib/logger';
const log = createLogger('strategicOptimizationService');

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface EmployeeBusinessMetrics {
  employeeId: string;
  employeeName: string;
  
  // Scoring (0-100)
  overallScore: number;
  reliabilityScore: number;
  clientSatisfactionScore: number;
  experienceScore: number;
  attendanceScore: number;
  
  // Financial
  hourlyPayRate: number;
  effectiveCostPerHour: number;
  
  // Reliability Tracking
  totalShiftsAssigned: number;
  shiftsCompleted: number;
  noShows: number;
  lateArrivals: number;
  callIns: number;
  attendanceRate: number;
  
  // Client Feedback
  clientComplaints: number;
  clientPraise: number;
  
  // Trend
  recentPerformanceTrend: 'improving' | 'stable' | 'declining';
  
  // Geographic
  homeLatitude?: number;
  homeLongitude?: number;
  maxCommuteDistance?: number;
}

export interface ClientBusinessMetrics {
  clientId: string;
  clientName: string;
  
  // Tier (Strategic prioritization)
  strategicTier: 'enterprise' | 'premium' | 'standard' | 'trial';
  tierScore: number;
  
  // Financial Value
  monthlyRevenue: number;
  lifetimeValue: number;
  averageHourlyRate: number;
  paymentHistory: 'excellent' | 'good' | 'delayed' | 'problematic';
  averageProfitMargin: number;
  
  // Relationship
  yearsAsClient: number;
  satisfactionScore: number;
  complaintsReceived: number;
  praiseReceived: number;
  renewalProbability: number;
  
  // Strategic Flags
  isLegacyClient: boolean;
  isHighValue: boolean;
  isAtRisk: boolean;
  isGrowthAccount: boolean;
  profitabilityTrend: 'increasing' | 'stable' | 'decreasing';
  
  // Site Info
  siteDifficultyLevel: 'easy' | 'moderate' | 'difficult' | 'high-risk';
  requiredCertifications: string[];
  latitude?: number;
  longitude?: number;
}

export interface ShiftProfitMetrics {
  shiftId: string;
  employeeId: string;
  clientId: string;
  
  // Basic profit
  billableRate: number;
  employeeCost: number;
  profitPerHour: number;
  totalProfit: number;
  profitMargin: number;
  
  // Distance
  commuteMiles: number;
  estimatedFuelCost: number;
  netProfit: number;
  
  // Risk adjustment
  riskFactor: number;
  riskAdjustedProfit: number;
  
  // Recommendation
  recommendation: 'excellent' | 'good' | 'acceptable' | 'poor' | 'avoid';
  reasoning: string;
}

export interface StrategicAssignment {
  shiftId: string;
  employeeId: string;
  employeeName: string;
  clientId: string;
  clientName: string;
  clientTier: string;
  
  assignment: {
    billableRate: number;
    employeeCost: number;
    profitPerHour: number;
    totalProfit: number;
    commuteMiles: number;
    estimatedFuelCost: number;
  };
  
  reasoning: string;
  confidence: number;
}

// ============================================================================
// SCORING CONSTANTS - Weights for composite scores
// ============================================================================

const EMPLOYEE_SCORE_WEIGHTS = {
  reliability: 0.40,     // Most important - affects client retention
  satisfaction: 0.30,    // Client feedback
  experience: 0.15,      // Tenure and expertise
  attendance: 0.15,      // Consistency
};

const CLIENT_TIER_WEIGHTS = {
  revenue: 0.30,         // Monthly revenue contribution
  loyalty: 0.25,         // Years as client
  satisfaction: 0.20,    // Client satisfaction score
  profitability: 0.15,   // Profit margin
  retention: 0.10,       // Renewal probability
};

const TIER_THRESHOLDS = {
  enterprise: 80,
  premium: 60,
  standard: 40,
  trial: 0,
};

const EMPLOYEE_TIER_REQUIREMENTS = {
  enterprise: 85,    // Only assign employees with score 85+
  premium: 75,       // Employees with score 75+
  standard: 60,      // Employees with score 60+
  trial: 50,         // Training opportunities - score 50+
};

// IRS standard mileage rate for 2026 (estimated)
const MILEAGE_COST_PER_MILE = 0.67;

// ============================================================================
// STRATEGIC OPTIMIZATION SERVICE
// ============================================================================

class StrategicOptimizationService {
  private static instance: StrategicOptimizationService;

  static getInstance(): StrategicOptimizationService {
    if (!StrategicOptimizationService.instance) {
      StrategicOptimizationService.instance = new StrategicOptimizationService();
    }
    return StrategicOptimizationService.instance;
  }

  // ===========================================================================
  // EMPLOYEE SCORING
  // ===========================================================================

  /**
   * Calculate comprehensive employee score (0-100)
   * Weighted composite of reliability, satisfaction, experience, attendance
   */
  calculateEmployeeScore(metrics: {
    noShows: number;
    callIns: number;
    lateArrivals: number;
    totalShiftsAssigned: number;
    shiftsCompleted: number;
    clientComplaints: number;
    clientPraise: number;
    yearsExperience: number;
    attendanceRate: number;
  }): number {
    const reliabilityScore = this.calculateReliabilityScore(metrics);
    const satisfactionScore = this.calculateSatisfactionScore(metrics);
    const experienceScore = this.calculateExperienceScore(metrics.yearsExperience);
    const attendanceScore = metrics.attendanceRate;

    const overallScore = 
      reliabilityScore * EMPLOYEE_SCORE_WEIGHTS.reliability +
      satisfactionScore * EMPLOYEE_SCORE_WEIGHTS.satisfaction +
      experienceScore * EMPLOYEE_SCORE_WEIGHTS.experience +
      attendanceScore * EMPLOYEE_SCORE_WEIGHTS.attendance;

    return Math.max(0, Math.min(100, Math.round(overallScore * 100) / 100));
  }

  /**
   * Calculate reliability score based on no-shows, call-ins, late arrivals
   */
  calculateReliabilityScore(metrics: {
    noShows: number;
    callIns: number;
    lateArrivals: number;
    totalShiftsAssigned: number;
  }): number {
    const totalShifts = Math.max(metrics.totalShiftsAssigned, 1);
    const totalIssues = metrics.noShows + metrics.callIns + metrics.lateArrivals;
    const issueRate = totalIssues / totalShifts;

    // Base score starts at 100, decreases with issues
    let score = 100 - (issueRate * 100);

    // Extra penalty for no-shows (more severe than call-ins)
    const noShowPenalty = metrics.noShows * 5;
    score -= noShowPenalty;

    // Extra penalty for call-ins (less severe but still impactful)
    const callInPenalty = metrics.callIns * 2;
    score -= callInPenalty;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate client satisfaction score based on complaints and praise
   */
  calculateSatisfactionScore(metrics: {
    clientComplaints: number;
    clientPraise: number;
  }): number {
    const totalFeedback = metrics.clientComplaints + metrics.clientPraise;
    
    // No feedback = neutral score of 75
    if (totalFeedback === 0) return 75;

    const positiveRatio = metrics.clientPraise / totalFeedback;
    const baseScore = positiveRatio * 100;

    // Additional penalty per complaint (complaints hurt more than praise helps)
    const complaintPenalty = metrics.clientComplaints * 3;

    return Math.max(0, Math.min(100, baseScore - complaintPenalty));
  }

  /**
   * Calculate experience score based on years of experience
   */
  calculateExperienceScore(yearsExperience: number): number {
    // 0 years = 50, 1 year = 65, 2 years = 75, 3+ years = 85+
    if (yearsExperience === 0) return 50;
    if (yearsExperience < 1) return 50 + (yearsExperience * 15);
    if (yearsExperience < 2) return 65 + ((yearsExperience - 1) * 10);
    if (yearsExperience < 3) return 75 + ((yearsExperience - 2) * 10);
    // Cap at 95 for 5+ years
    return Math.min(95, 85 + ((yearsExperience - 3) * 2.5));
  }

  // ===========================================================================
  // CLIENT TIERING
  // ===========================================================================

  /**
   * Calculate client tier based on revenue, loyalty, satisfaction, profitability
   */
  calculateClientTier(metrics: {
    monthlyRevenue: number;
    yearsAsClient: number;
    satisfactionScore: number;
    averageProfitMargin: number;
    renewalProbability: number;
  }): { tier: 'enterprise' | 'premium' | 'standard' | 'trial'; tierScore: number } {
    // Normalize revenue (assume $100k/month = max score contribution)
    const revenueScore = Math.min(100, (metrics.monthlyRevenue / 1000) * 1);
    
    // Loyalty score (10 points per year, max 100)
    const loyaltyScore = Math.min(100, metrics.yearsAsClient * 10);
    
    // Direct satisfaction score (already 0-100)
    const satisfactionScoreNorm = metrics.satisfactionScore;
    
    // Profit margin score (assume 50% margin = perfect score)
    const profitScore = Math.min(100, metrics.averageProfitMargin * 2);
    
    // Retention score (direct 0-100)
    const retentionScore = metrics.renewalProbability;

    const tierScore = 
      revenueScore * CLIENT_TIER_WEIGHTS.revenue +
      loyaltyScore * CLIENT_TIER_WEIGHTS.loyalty +
      satisfactionScoreNorm * CLIENT_TIER_WEIGHTS.satisfaction +
      profitScore * CLIENT_TIER_WEIGHTS.profitability +
      retentionScore * CLIENT_TIER_WEIGHTS.retention;

    let tier: 'enterprise' | 'premium' | 'standard' | 'trial';
    if (tierScore >= TIER_THRESHOLDS.enterprise) {
      tier = 'enterprise';
    } else if (tierScore >= TIER_THRESHOLDS.premium) {
      tier = 'premium';
    } else if (tierScore >= TIER_THRESHOLDS.standard) {
      tier = 'standard';
    } else {
      tier = 'trial';
    }

    return { tier, tierScore: Math.round(tierScore * 100) / 100 };
  }

  /**
   * Determine if client should be flagged as legacy (2+ years)
   */
  isLegacyClient(yearsAsClient: number): boolean {
    return yearsAsClient >= 2;
  }

  /**
   * Determine if client is at-risk (satisfaction declining)
   */
  isAtRiskClient(satisfactionScore: number, complaintsReceived: number): boolean {
    // At-risk if satisfaction below 70 OR more than 2 recent complaints
    return satisfactionScore < 70 || complaintsReceived > 2;
  }

  // ===========================================================================
  // PROFIT OPTIMIZATION
  // ===========================================================================

  /**
   * Calculate shift profit metrics for employee-client assignment
   */
  calculateShiftProfit(params: {
    billableRate: number;
    employeeCostPerHour: number;
    shiftDurationHours: number;
    employeeLatitude?: number;
    employeeLongitude?: number;
    clientLatitude?: number;
    clientLongitude?: number;
    employeeScore: number;
    clientTier: 'enterprise' | 'premium' | 'standard' | 'trial';
    clientIsAtRisk: boolean;
    employeeNoShows: number;
    employeeCallIns: number;
    employeeClientComplaints: number;
  }): ShiftProfitMetrics {
    // Base profit calculation
    const profitPerHour = params.billableRate - params.employeeCostPerHour;
    const totalProfit = profitPerHour * params.shiftDurationHours;
    const profitMargin = (profitPerHour / params.billableRate) * 100;

    // Distance calculation (if GPS coordinates available)
    let commuteMiles = 0;
    if (params.employeeLatitude && params.employeeLongitude && 
        params.clientLatitude && params.clientLongitude) {
      commuteMiles = this.calculateDistance(
        params.employeeLatitude,
        params.employeeLongitude,
        params.clientLatitude,
        params.clientLongitude
      );
    }

    const estimatedFuelCost = commuteMiles * MILEAGE_COST_PER_MILE;
    const netProfit = totalProfit - estimatedFuelCost;

    // Risk factor calculation
    const riskFactor = this.calculateRiskFactor({
      employeeScore: params.employeeScore,
      clientTier: params.clientTier,
      clientIsAtRisk: params.clientIsAtRisk,
      commuteMiles,
      noShows: params.employeeNoShows,
      callIns: params.employeeCallIns,
      clientComplaints: params.employeeClientComplaints,
    });

    const riskAdjustedProfit = netProfit * (1 - riskFactor);

    // Generate recommendation
    const { recommendation, reasoning } = this.generateProfitRecommendation({
      profitMargin,
      riskFactor,
      employeeScore: params.employeeScore,
      clientTier: params.clientTier,
      commuteMiles,
    });

    return {
      shiftId: '',  // To be filled by caller
      employeeId: '',
      clientId: '',
      billableRate: params.billableRate,
      employeeCost: params.employeeCostPerHour,
      profitPerHour,
      totalProfit,
      profitMargin: Math.round(profitMargin * 100) / 100,
      commuteMiles: Math.round(commuteMiles * 10) / 10,
      estimatedFuelCost: Math.round(estimatedFuelCost * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      riskFactor: Math.round(riskFactor * 100) / 100,
      riskAdjustedProfit: Math.round(riskAdjustedProfit * 100) / 100,
      recommendation,
      reasoning,
    };
  }

  /**
   * Calculate risk factor for employee-client assignment (0-0.5, capped at 50%)
   */
  calculateRiskFactor(params: {
    employeeScore: number;
    clientTier: 'enterprise' | 'premium' | 'standard' | 'trial';
    clientIsAtRisk: boolean;
    commuteMiles: number;
    noShows: number;
    callIns: number;
    clientComplaints: number;
  }): number {
    let risk = 0;

    // Employee reliability issues
    if (params.noShows > 0) risk += 0.05 * params.noShows;
    if (params.callIns > 2) risk += 0.02 * params.callIns;
    if (params.clientComplaints > 0) risk += 0.10 * params.clientComplaints;

    // Employee-client tier mismatch risk
    const minRequiredScore = EMPLOYEE_TIER_REQUIREMENTS[params.clientTier];
    if (params.employeeScore < minRequiredScore) {
      const scoreDiff = minRequiredScore - params.employeeScore;
      risk += scoreDiff * 0.01; // 1% risk per point below requirement
    }

    // High-value/at-risk client with subpar employee
    if (params.clientTier === 'enterprise' && params.employeeScore < 85) {
      risk += 0.15;
    }
    if (params.clientIsAtRisk && params.employeeScore < 90) {
      risk += 0.20;
    }

    // Long commute risk
    if (params.commuteMiles > 20) risk += 0.10;
    if (params.commuteMiles > 30) risk += 0.20;

    // Cap at 50% max risk
    return Math.min(0.5, risk);
  }

  /**
   * Generate profit recommendation based on metrics
   */
  generateProfitRecommendation(params: {
    profitMargin: number;
    riskFactor: number;
    employeeScore: number;
    clientTier: string;
    commuteMiles: number;
  }): { recommendation: 'excellent' | 'good' | 'acceptable' | 'poor' | 'avoid'; reasoning: string } {
    const { profitMargin, riskFactor, employeeScore, clientTier, commuteMiles } = params;

    // Build reasoning
    const reasons: string[] = [];

    if (profitMargin >= 40) {
      reasons.push(`High profit margin (${profitMargin.toFixed(1)}%)`);
    } else if (profitMargin < 15) {
      reasons.push(`Low profit margin (${profitMargin.toFixed(1)}%)`);
    }

    if (riskFactor > 0.3) {
      reasons.push(`High risk factor (${(riskFactor * 100).toFixed(0)}%)`);
    }

    if (commuteMiles > 20) {
      reasons.push(`Long commute (${commuteMiles.toFixed(1)} miles)`);
    }

    const minScore = EMPLOYEE_TIER_REQUIREMENTS[clientTier as keyof typeof EMPLOYEE_TIER_REQUIREMENTS] || 50;
    if (employeeScore >= minScore + 10) {
      reasons.push(`Employee exceeds tier requirement (${employeeScore}/${minScore})`);
    } else if (employeeScore < minScore) {
      reasons.push(`Employee below tier requirement (${employeeScore}/${minScore})`);
    }

    // Determine recommendation
    let recommendation: 'excellent' | 'good' | 'acceptable' | 'poor' | 'avoid';
    
    if (profitMargin >= 35 && riskFactor < 0.15 && employeeScore >= minScore) {
      recommendation = 'excellent';
    } else if (profitMargin >= 25 && riskFactor < 0.25 && employeeScore >= minScore - 5) {
      recommendation = 'good';
    } else if (profitMargin >= 15 && riskFactor < 0.35) {
      recommendation = 'acceptable';
    } else if (profitMargin >= 5 || riskFactor < 0.4) {
      recommendation = 'poor';
    } else {
      recommendation = 'avoid';
    }

    return {
      recommendation,
      reasoning: reasons.length > 0 ? reasons.join('; ') : 'Standard assignment',
    };
  }

  // ===========================================================================
  // STRATEGIC MATCHING
  // ===========================================================================

  /**
   * Get minimum required employee score for client tier
   */
  getMinimumEmployeeScoreForClient(clientTier: 'enterprise' | 'premium' | 'standard' | 'trial'): number {
    return EMPLOYEE_TIER_REQUIREMENTS[clientTier];
  }

  /**
   * Check if employee meets requirements for client tier
   */
  isEmployeeQualifiedForClient(
    employeeScore: number,
    clientTier: 'enterprise' | 'premium' | 'standard' | 'trial',
    clientIsAtRisk: boolean
  ): boolean {
    const minScore = EMPLOYEE_TIER_REQUIREMENTS[clientTier];
    
    // At-risk clients require higher-than-normal employee scores
    if (clientIsAtRisk) {
      return employeeScore >= Math.max(minScore, 90);
    }
    
    return employeeScore >= minScore;
  }

  /**
   * Rank employees for a shift based on profit optimization
   */
  rankEmployeesForShift(
    employees: EmployeeBusinessMetrics[],
    client: ClientBusinessMetrics,
    shiftDurationHours: number
  ): Array<{
    employee: EmployeeBusinessMetrics;
    profitMetrics: ShiftProfitMetrics;
    rank: number;
  }> {
    const rankings = employees
      .map(employee => {
        const profitMetrics = this.calculateShiftProfit({
          billableRate: client.averageHourlyRate,
          employeeCostPerHour: employee.effectiveCostPerHour,
          shiftDurationHours,
          employeeLatitude: employee.homeLatitude,
          employeeLongitude: employee.homeLongitude,
          clientLatitude: client.latitude,
          clientLongitude: client.longitude,
          employeeScore: employee.overallScore,
          clientTier: client.strategicTier,
          clientIsAtRisk: client.isAtRisk,
          employeeNoShows: employee.noShows,
          employeeCallIns: employee.callIns,
          employeeClientComplaints: employee.clientComplaints,
        });

        return { employee, profitMetrics };
      })
      // Sort by risk-adjusted profit (highest first)
      .sort((a, b) => b.profitMetrics.riskAdjustedProfit - a.profitMetrics.riskAdjustedProfit)
      // Add ranking
      .map((item, index) => ({ ...item, rank: index + 1 }));

    return rankings;
  }

  // ===========================================================================
  // UTILITY FUNCTIONS
  // ===========================================================================

  /**
   * Calculate distance between two GPS coordinates (Haversine formula)
   * Returns distance in miles
   */
  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  // ===========================================================================
  // DATABASE OPERATIONS
  // ===========================================================================

  /**
   * Get enriched employee metrics for strategic scheduling
   */
  async getEmployeeBusinessMetrics(workspaceId: string): Promise<EmployeeBusinessMetrics[]> {
    // employee_metrics table merged into employees JSONB blobs
    const results = await db
      .select({
        employee: employees,
      })
      .from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.isActive, true)
      ));

    return results.map(r => {
      const emp = r.employee;
      const m: Record<string, any> | null = null; // employee_metrics merged into employees JSONB

      const noShows = m?.noShowCount || 0;
      const callIns = m?.lastMinuteCancellations || 0;
      const lateArrivals = m?.tardinessCount || 0;
      const totalShiftsAssigned = m?.totalShiftsAssigned || m?.shiftsCompleted || 0;
      const shiftsCompleted = m?.shiftsCompleted || 0;
      const clientComplaints = m?.clientComplaints || 0;
      const clientPraise = m?.clientPraise || 0;
      const attendanceRate = parseFloat(m?.attendanceRate?.toString() || '95');
      const yearsExperience = parseFloat(m?.yearsExperience?.toString() || '0');

      const overallScore = this.calculateEmployeeScore({
        noShows,
        callIns,
        lateArrivals,
        totalShiftsAssigned,
        shiftsCompleted,
        clientComplaints,
        clientPraise,
        yearsExperience,
        attendanceRate,
      });

      return {
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        overallScore,
        reliabilityScore: this.calculateReliabilityScore({ noShows, callIns, lateArrivals, totalShiftsAssigned }),
        clientSatisfactionScore: this.calculateSatisfactionScore({ clientComplaints, clientPraise }),
        experienceScore: this.calculateExperienceScore(yearsExperience),
        attendanceScore: attendanceRate,
        hourlyPayRate: parseFloat(emp.hourlyRate?.toString() || '0'),
        effectiveCostPerHour: parseFloat(m?.effectiveCostPerHour?.toString() || emp.hourlyRate?.toString() || '0') * 1.25, // Default 25% overhead
        totalShiftsAssigned,
        shiftsCompleted,
        noShows,
        lateArrivals,
        callIns,
        attendanceRate,
        clientComplaints,
        clientPraise,
        recentPerformanceTrend: (m?.recentPerformanceTrend as 'improving' | 'stable' | 'declining') || 'stable',
        homeLatitude: emp.latitude ? parseFloat(emp.latitude.toString()) : undefined,
        homeLongitude: emp.longitude ? parseFloat(emp.longitude.toString()) : undefined,
        maxCommuteDistance: m?.preferredMaxDistance || 50,
      };
    });
  }

  /**
   * Get enriched client metrics for strategic scheduling
   */
  async getClientBusinessMetrics(workspaceId: string): Promise<ClientBusinessMetrics[]> {
    const results = await db
      .select()
      .from(clients)
      .where(and(
        eq(clients.workspaceId, workspaceId),
        eq(clients.isActive, true)
      ));

    const now = new Date();

    return results.map(c => {
      const clientSince = c.clientSince || c.createdAt || now;
      const yearsAsClient = (now.getTime() - new Date(clientSince).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      
      const monthlyRevenue = parseFloat(c.monthlyRevenue?.toString() || '0');
      const satisfactionScore = parseFloat(c.satisfactionScore?.toString() || '80');
      const averageProfitMargin = parseFloat(c.averageProfitMargin?.toString() || '30');
      const renewalProbability = parseFloat(c.renewalProbability?.toString() || '75');
      
      const { tier, tierScore } = this.calculateClientTier({
        monthlyRevenue,
        yearsAsClient,
        satisfactionScore,
        averageProfitMargin,
        renewalProbability,
      });

      return {
        clientId: c.id,
        clientName: c.companyName || `${c.firstName} ${c.lastName}`,
        strategicTier: tier,
        tierScore,
        monthlyRevenue,
        lifetimeValue: parseFloat(c.lifetimeValue?.toString() || '0'),
        averageHourlyRate: parseFloat(c.contractRate?.toString() || '0'),
        paymentHistory: (c.paymentHistory as 'excellent' | 'good' | 'delayed' | 'problematic') || 'good',
        averageProfitMargin,
        yearsAsClient: Math.round(yearsAsClient * 10) / 10,
        satisfactionScore,
        complaintsReceived: c.complaintsReceived || 0,
        praiseReceived: c.praiseReceived || 0,
        renewalProbability,
        isLegacyClient: c.isLegacyClient || this.isLegacyClient(yearsAsClient),
        isHighValue: c.isHighValue || false,
        isAtRisk: c.isAtRisk || this.isAtRiskClient(satisfactionScore, c.complaintsReceived || 0),
        isGrowthAccount: c.isGrowthAccount || false,
        profitabilityTrend: (c.profitabilityTrend as 'increasing' | 'stable' | 'decreasing') || 'stable',
        siteDifficultyLevel: (c.siteDifficultyLevel as 'easy' | 'moderate' | 'difficult' | 'high-risk') || 'moderate',
        requiredCertifications: c.requiredCertifications || [],
        latitude: c.latitude ? parseFloat(c.latitude.toString()) : undefined,
        longitude: c.longitude ? parseFloat(c.longitude.toString()) : undefined,
      };
    });
  }

  /**
   * Generate strategic scheduling context for Gemini prompt
   */
  async generateStrategicContext(workspaceId: string): Promise<{
    employees: EmployeeBusinessMetrics[];
    clients: ClientBusinessMetrics[];
    summary: {
      totalEmployees: number;
      topPerformers: number;
      problematicEmployees: number;
      enterpriseClients: number;
      atRiskClients: number;
      legacyClients: number;
    };
  }> {
    const [employeeMetrics, clientMetrics] = await Promise.all([
      this.getEmployeeBusinessMetrics(workspaceId),
      this.getClientBusinessMetrics(workspaceId),
    ]);

    return {
      employees: employeeMetrics,
      clients: clientMetrics,
      summary: {
        totalEmployees: employeeMetrics.length,
        topPerformers: employeeMetrics.filter(e => e.overallScore >= 85).length,
        problematicEmployees: employeeMetrics.filter(e => e.overallScore < 60 || e.noShows > 2).length,
        enterpriseClients: clientMetrics.filter(c => c.strategicTier === 'enterprise').length,
        atRiskClients: clientMetrics.filter(c => c.isAtRisk).length,
        legacyClients: clientMetrics.filter(c => c.isLegacyClient).length,
      },
    };
  }
}

export const strategicOptimizationService = StrategicOptimizationService.getInstance();
export default strategicOptimizationService;
