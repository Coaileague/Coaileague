/**
 * CoAIleague Employee Scoring Service
 * 
 * Implements weighted scoring algorithm for AI-powered shift matching.
 * 
 * Pipeline:
 * 1. Hard Filters (availability, credentials, OT thresholds)
 * 2. Weighted Scoring (0-1 normalized composite score)
 * 3. Gemini AI Final Recommendation
 * 
 * Weighted Factors:
 * - Skills Match: 0.25
 * - Certifications: 0.15
 * - Performance: 0.15
 * - Reliability: 0.10
 * - Distance: 0.10
 * - Pay Margin: 0.10
 * - OT Risk: 0.10
 * - Contractor Status: 0.05
 */

import { db } from "../../db";
import { 
  employees, 
  employeeSkills, 
  employeeCertifications, 
  employeeMetrics,
  shifts,
  clients,
  type EmployeeSkill,
  type EmployeeCertification
} from "@shared/schema";
import { eq, and, sql, gte, lte, isNull, or } from "drizzle-orm";

export interface ScoringWeights {
  skills: number;
  certifications: number;
  performance: number;
  reliability: number;
  distance: number;
  payMargin: number;
  overtimeRisk: number;
  contractorStatus: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  skills: 0.25,
  certifications: 0.15,
  performance: 0.15,
  reliability: 0.10,
  distance: 0.10,
  payMargin: 0.10,
  overtimeRisk: 0.10,
  contractorStatus: 0.05,
};

export interface EmployeeCandidate {
  employeeId: string;
  firstName: string;
  lastName: string;
  role: string | null;
  hourlyRate: string | null;
  
  // CRITICAL: Full employee object for direct use in AI Fill
  // This ensures only vetted candidates (passed hard filters) reach Gemini
  fullEmployee: any; // Type: Employee from schema
  
  // Scores (0-1 normalized)
  skillsScore: number;
  certificationsScore: number;
  performanceScore: number;
  reliabilityScore: number;
  distanceScore: number;
  payMarginScore: number;
  overtimeRiskScore: number;
  contractorStatusScore: number;
  
  // Composite
  compositeScore: number;
  
  // Metadata
  matchReasons: string[];
  concerns: string[];
  
  // Raw data for Gemini context
  skills: string[];
  certifications: string[];
  yearsExperience: number;
  shiftsCompleted: number;
  distanceMiles: number | null;
  isContractor: boolean;
}

export interface ShiftRequirements {
  shiftId: string;
  requiredSkills?: string[];
  preferredSkills?: string[];
  requiredCertifications?: string[];
  maxDistance?: number;
  maxPayRate?: number;
  clientLocation?: { latitude: number; longitude: number };
}

/**
 * Calculate Haversine distance between two points
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Normalize a value to 0-1 range (higher is better)
 */
function normalize(value: number, min: number, max: number, invert = false): number {
  if (max === min) return 0.5;
  const normalized = (value - min) / (max - min);
  return invert ? 1 - normalized : normalized;
}

/**
 * Score employees for a shift based on weighted factors
 */
export async function scoreEmployeesForShift(
  workspaceId: string,
  requirements: ShiftRequirements,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): Promise<EmployeeCandidate[]> {
  
  // Load shift details
  const shift = await db.query.shifts.findFirst({
    where: eq(shifts.id, requirements.shiftId),
    with: {
      client: true,
    },
  });

  if (!shift) {
    throw new Error("Shift not found");
  }

  // Determine client location
  let clientLat: number | null = null;
  let clientLon: number | null = null;
  
  if (requirements.clientLocation) {
    clientLat = requirements.clientLocation.latitude;
    clientLon = requirements.clientLocation.longitude;
  } else if (shift.client?.latitude && shift.client?.longitude) {
    clientLat = parseFloat(shift.client.latitude);
    clientLon = parseFloat(shift.client.longitude);
  }

  // Load all active employees with their skills, certifications, and metrics
  const activeEmployees = await db
    .select({
      employee: employees,
      metrics: employeeMetrics,
    })
    .from(employees)
    .leftJoin(employeeMetrics, eq(employeeMetrics.employeeId, employees.id))
    .where(
      and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.isActive, true)
      )
    );

  // Load skills and certifications separately for each employee
  const candidates: EmployeeCandidate[] = [];

  for (const { employee, metrics } of activeEmployees) {
    // Load skills
    const skillsData = await db.query.employeeSkills.findMany({
      where: eq(employeeSkills.employeeId, employee.id),
    });

    // Load certifications
    const certsData = await db.query.employeeCertifications.findMany({
      where: and(
        eq(employeeCertifications.employeeId, employee.id),
        or(
          eq(employeeCertifications.status, "verified"),
          eq(employeeCertifications.status, "active")
        )
      ),
    });

    // =====================================================
    // HARD FILTERS
    // =====================================================

    // Filter: Check OT threshold
    const currentOT = parseFloat(employee.overtimeHoursThisWeek || "0");
    const maxOT = metrics?.maxWeeklyHours || 40;
    if (currentOT >= maxOT) {
      continue; // Skip - already at OT limit
    }

    // Filter: Check required certifications
    if (requirements.requiredCertifications && requirements.requiredCertifications.length > 0) {
      const employeeCertNames = certsData.map((c: EmployeeCertification) => c.certificationName.toLowerCase());
      const hasAllRequired = requirements.requiredCertifications.every((reqCert) =>
        employeeCertNames.some((empCert: string) => empCert.includes(reqCert.toLowerCase()))
      );
      if (!hasAllRequired) {
        continue; // Skip - missing required certifications
      }
    }

    // Filter: Check distance
    let distanceMiles: number | null = null;
    if (clientLat && clientLon && metrics?.homeLatitude && metrics?.homeLongitude) {
      distanceMiles = calculateDistance(
        parseFloat(metrics.homeLatitude),
        parseFloat(metrics.homeLongitude),
        clientLat,
        clientLon
      );
      
      const maxDist = requirements.maxDistance || metrics.preferredMaxDistance || 50;
      if (distanceMiles > maxDist) {
        continue; // Skip - too far
      }
    }

    // =====================================================
    // WEIGHTED SCORING
    // =====================================================

    const matchReasons: string[] = [];
    const concerns: string[] = [];

    // 1. Skills Score (0.25)
    let skillsScore = 0;
    const employeeSkillNames = skillsData.map((s: EmployeeSkill) => s.skillName.toLowerCase());
    const requiredSkills = requirements.requiredSkills || [];
    const preferredSkills = requirements.preferredSkills || [];
    const allDesiredSkills = [...requiredSkills, ...preferredSkills];

    if (allDesiredSkills.length > 0) {
      const matchedSkills = allDesiredSkills.filter((skill) =>
        employeeSkillNames.some((empSkill: string) => empSkill.includes(skill.toLowerCase()))
      );
      skillsScore = matchedSkills.length / allDesiredSkills.length;
      
      if (matchedSkills.length > 0) {
        matchReasons.push(`Has ${matchedSkills.length}/${allDesiredSkills.length} required skills`);
      } else {
        concerns.push("Missing key skills for this shift");
      }
    } else {
      skillsScore = 0.5; // Neutral if no skills specified
    }

    // 2. Certifications Score (0.15)
    let certsScore = 0;
    const certCount = certsData.length;
    if (certCount > 0) {
      certsScore = Math.min(certCount / 5, 1); // Normalize to 5 certs = 1.0
      matchReasons.push(`${certCount} verified certifications`);
    } else {
      certsScore = 0;
      concerns.push("No verified certifications on file");
    }

    // 3. Performance Score (0.15)
    const perfScore = (employee.performanceScore || 85) / 100;
    if (perfScore >= 0.9) {
      matchReasons.push("Excellent performance history");
    } else if (perfScore < 0.7) {
      concerns.push("Below-average performance score");
    }

    // 4. Reliability Score (0.10)
    const reliabilityScore = metrics?.reliabilityScore 
      ? parseFloat(metrics.reliabilityScore) 
      : 0.85;
    if (reliabilityScore >= 0.95) {
      matchReasons.push("Outstanding reliability");
    } else if (reliabilityScore < 0.70) {
      concerns.push("Reliability concerns (tardiness/no-shows)");
    }

    // 5. Distance Score (0.10)
    let distanceScore = 0.5; // Neutral if no location data
    if (distanceMiles !== null) {
      distanceScore = normalize(distanceMiles, 0, 100, true); // Closer is better
      if (distanceMiles < 10) {
        matchReasons.push(`Close proximity (${distanceMiles.toFixed(1)} miles)`);
      } else if (distanceMiles > 50) {
        concerns.push(`Long commute (${distanceMiles.toFixed(1)} miles)`);
      }
    }

    // 6. Pay Margin Score (0.10)
    let payMarginScore = 0.5; // Neutral if no rate data
    const employeeRate = employee.hourlyRate ? parseFloat(employee.hourlyRate) : 0;
    const maxPayRate = requirements.maxPayRate || 100;
    if (employeeRate > 0) {
      // Lower pay is better for margin (inverted)
      payMarginScore = normalize(employeeRate, 0, maxPayRate, true);
      if (employeeRate > maxPayRate) {
        concerns.push(`Pay rate exceeds budget ($${employeeRate}/hr vs $${maxPayRate}/hr max)`);
      }
    }

    // 7. Overtime Risk Score (0.10)
    const overtimeRiskScore = normalize(currentOT, 0, maxOT, true); // Less OT is better
    if (currentOT > 35) {
      concerns.push(`High OT risk (${currentOT}hrs this week)`);
    } else if (currentOT < 10) {
      matchReasons.push("Low overtime hours this week");
    }

    // 8. Contractor Status Score (0.05)
    const isContractor = employee.workspaceRole === "contractor" || false;
    const contractorStatusScore = isContractor ? 0 : 1; // Prefer internal employees
    if (isContractor) {
      concerns.push("External contractor (higher cost)");
    }

    // =====================================================
    // COMPOSITE SCORE
    // =====================================================

    const compositeScore =
      skillsScore * weights.skills +
      certsScore * weights.certifications +
      perfScore * weights.performance +
      reliabilityScore * weights.reliability +
      distanceScore * weights.distance +
      payMarginScore * weights.payMargin +
      overtimeRiskScore * weights.overtimeRisk +
      contractorStatusScore * weights.contractorStatus;

    candidates.push({
      employeeId: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      role: employee.role,
      hourlyRate: employee.hourlyRate,
      
      // CRITICAL: Include full employee object to ensure only vetted candidates reach Gemini
      fullEmployee: employee,
      
      skillsScore,
      certificationsScore: certsScore,
      performanceScore: perfScore,
      reliabilityScore,
      distanceScore,
      payMarginScore,
      overtimeRiskScore,
      contractorStatusScore,
      
      compositeScore,
      
      matchReasons,
      concerns,
      
      skills: skillsData.map((s: EmployeeSkill) => s.skillName),
      certifications: certsData.map((c: EmployeeCertification) => c.certificationName),
      yearsExperience: metrics?.yearsExperience ? parseFloat(metrics.yearsExperience) : 0,
      shiftsCompleted: metrics?.shiftsCompleted || 0,
      distanceMiles,
      isContractor,
    });
  }

  // Sort by composite score (highest first)
  candidates.sort((a, b) => b.compositeScore - a.compositeScore);

  return candidates;
}

/**
 * Get top N candidates for Gemini AI recommendation
 */
export function getTopCandidates(
  candidates: EmployeeCandidate[],
  count = 5
): EmployeeCandidate[] {
  return candidates.slice(0, count);
}

/**
 * Format candidates for Gemini AI prompt
 */
export function formatCandidatesForAI(
  candidates: EmployeeCandidate[]
): string {
  return candidates
    .map((c, idx) => {
      return `
Candidate ${idx + 1}: ${c.firstName} ${c.lastName} (${c.role || "N/A"})
- Composite Score: ${(c.compositeScore * 100).toFixed(1)}%
- Skills: ${c.skills.join(", ") || "None listed"}
- Certifications: ${c.certifications.join(", ") || "None"}
- Experience: ${c.yearsExperience} years, ${c.shiftsCompleted} shifts completed
- Distance: ${c.distanceMiles ? `${c.distanceMiles.toFixed(1)} miles` : "Unknown"}
- Pay Rate: ${c.hourlyRate ? `$${c.hourlyRate}/hr` : "N/A"}
- Match Reasons: ${c.matchReasons.join("; ") || "None"}
- Concerns: ${c.concerns.join("; ") || "None"}

Score Breakdown:
  - Skills: ${(c.skillsScore * 100).toFixed(0)}%
  - Certifications: ${(c.certificationsScore * 100).toFixed(0)}%
  - Performance: ${(c.performanceScore * 100).toFixed(0)}%
  - Reliability: ${(c.reliabilityScore * 100).toFixed(0)}%
  - Distance: ${(c.distanceScore * 100).toFixed(0)}%
  - Pay Margin: ${(c.payMarginScore * 100).toFixed(0)}%
  - OT Risk: ${(c.overtimeRiskScore * 100).toFixed(0)}%
  - Contractor: ${(c.contractorStatusScore * 100).toFixed(0)}%
`;
    })
    .join("\n---\n");
}
