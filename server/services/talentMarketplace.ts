/**
 * TALENTOS™ - INTERNAL TALENT MARKETPLACE
 * 
 * Stops employees from leaving by creating internal opportunities.
 * Integrates with PredictionOS™ to track high-risk employee viewing behavior.
 */

import { storage } from "../storage";

// ============================================================================
// HIGH-RISK EMPLOYEE TRACKING
// ============================================================================

/**
 * Track when employee views a bid (with high-risk detection)
 */
export async function trackBidView(
  bidId: string,
  employeeId: string,
  workspaceId: string
): Promise<{ isHighRisk: boolean; interventionRequired: boolean }> {
  const employee = await storage.getEmployeeById(employeeId);
  if (!employee) {
    throw new Error('Employee not found');
  }

  // Get turnover risk score from PredictionOS™
  const turnoverRiskScore = await getPredictionScore(employeeId, workspaceId);
  const isHighRisk = turnoverRiskScore > 70;

  if (isHighRisk) {
    const bid = await storage.getInternalBidById(bidId);
    if (!bid) {
      throw new Error('Bid not found');
    }

    // Update bid with high-risk viewer tracking
    const currentViewers = bid.highRiskViewers as string[] || [];
    if (!currentViewers.includes(employeeId)) {
      currentViewers.push(employeeId);
      
      await storage.updateInternalBid(bidId, workspaceId, {
        highRiskViewCount: (bid.highRiskViewCount || 0) + 1,
        highRiskViewers: currentViewers,
        lastHighRiskViewAt: new Date(),
      });

      // Create alert for manager
      await createManagerAlert(bid, employee, turnoverRiskScore);
    }

    return {
      isHighRisk: true,
      interventionRequired: true,
    };
  }

  return {
    isHighRisk: false,
    interventionRequired: false,
  };
}

/**
 * Get PredictionOS™ turnover risk score
 */
async function getPredictionScore(
  employeeId: string,
  workspaceId: string
): Promise<number> {
  // Query latest turnover prediction
  const predictions = await storage.getTurnoverPredictions(workspaceId, {
    employeeId,
    limit: 1,
  });

  if (predictions && predictions.length > 0) {
    return predictions[0].riskScore || 0;
  }

  return 0; // No prediction available
}

/**
 * Create manager alert for high-risk employee viewing marketplace
 */
async function createManagerAlert(
  bid: any,
  employee: any,
  riskScore: number
): Promise<void> {
  // Log to audit trail for SupportOS™ integration
  await storage.createAuditLog({
    workspaceId: employee.workspaceId,
    userId: employee.id,
    userName: `${employee.firstName} ${employee.lastName}`,
    userRole: employee.role || 'employee',
    action: 'high_risk_marketplace_view',
    entityType: 'internal_bid',
    entityId: bid.id,
    entityDescription: `High-risk employee (${riskScore}% turnover risk) viewing internal bid: ${bid.title}`,
    metadata: {
      type: 'retention_alert',
      bidId: bid.id,
      bidTitle: bid.title,
      employeeId: employee.id,
      turnoverRiskScore: riskScore,
      alertLevel: 'urgent',
      suggestedAction: 'Immediate 1-on-1 intervention recommended',
    },
  });

  console.log(`[RETENTION ALERT] High-risk employee ${employee.id} (${riskScore}% risk) viewing bid ${bid.id}`);
}

// ============================================================================
// SKILL MATCHING & APPLICATION PROCESSING
// ============================================================================

/**
 * Calculate skill match percentage for application
 */
export async function calculateSkillMatch(
  employeeId: string,
  bidId: string
): Promise<{
  matchPercentage: number;
  matchingSkills: string[];
  missingSkills: string[];
}> {
  const employee = await storage.getEmployeeById(employeeId);
  const bid = await storage.getInternalBidById(bidId);

  if (!employee || !bid) {
    throw new Error('Employee or bid not found');
  }

  const requiredSkills = (bid.requiredSkills as string[]) || [];
  const requiredCerts = (bid.requiredCertifications as string[]) || [];
  const employeeSkills = (employee.skills as string[]) || [];
  const employeeCerts = (employee.certifications as string[]) || [];

  // Combine requirements
  const allRequirements = [...requiredSkills, ...requiredCerts];
  const employeeQualifications = [...employeeSkills, ...employeeCerts];

  // Calculate matches
  const matchingSkills = allRequirements.filter(req =>
    employeeQualifications.some(qual =>
      qual.toLowerCase().includes(req.toLowerCase()) ||
      req.toLowerCase().includes(qual.toLowerCase())
    )
  );

  const missingSkills = allRequirements.filter(req =>
    !matchingSkills.includes(req)
  );

  const matchPercentage = allRequirements.length > 0
    ? (matchingSkills.length / allRequirements.length) * 100
    : 100;

  return {
    matchPercentage,
    matchingSkills,
    missingSkills,
  };
}

/**
 * Process bid application with auto-calculated matching
 */
export async function processBidApplication(
  bidId: string,
  employeeId: string,
  workspaceId: string,
  applicationData: {
    coverLetter?: string;
    whyInterested?: string;
    relevantExperience?: string;
  }
): Promise<any> {
  // Calculate skill match
  const skillMatch = await calculateSkillMatch(employeeId, bidId);

  // Get turnover risk score
  const turnoverRiskScore = await getPredictionScore(employeeId, workspaceId);
  const isHighRisk = turnoverRiskScore > 70;

  // Create application
  const application = await storage.createBidApplication({
    workspaceId,
    bidId,
    employeeId,
    coverLetter: applicationData.coverLetter,
    whyInterestedText: applicationData.whyInterested,
    relevantExperience: applicationData.relevantExperience,
    skillMatchPercentage: skillMatch.matchPercentage.toFixed(2),
    matchingSkills: skillMatch.matchingSkills,
    missingSkills: skillMatch.missingSkills,
    turnoverRiskScore,
    isHighRisk,
    status: 'pending',
  });

  // If high-risk employee applied, flag for immediate intervention
  if (isHighRisk) {
    const employee = await storage.getEmployeeById(employeeId);
    const bid = await storage.getInternalBidById(bidId);
    
    await storage.updateBidApplication(application.id, {
      interventionTriggered: true,
    });

    // Alert manager
    await createApplicationInterventionAlert(bid, employee, turnoverRiskScore);
  }

  return application;
}

/**
 * Create intervention alert when high-risk employee applies
 */
async function createApplicationInterventionAlert(
  bid: any,
  employee: any,
  riskScore: number
): Promise<void> {
  await storage.createAuditLog({
    workspaceId: employee.workspaceId,
    userId: employee.id,
    userName: `${employee.firstName} ${employee.lastName}`,
    userRole: employee.role || 'employee',
    action: 'high_risk_application',
    entityType: 'bid_application',
    entityId: bid.id,
    entityDescription: `High-risk employee (${riskScore}% turnover risk) applied to internal bid: ${bid.title}`,
    metadata: {
      type: 'retention_intervention',
      bidId: bid.id,
      bidTitle: bid.title,
      employeeId: employee.id,
      turnoverRiskScore: riskScore,
      alertLevel: 'critical',
      suggestedAction: 'URGENT: Employee is actively looking for new opportunities. Immediate retention action required.',
    },
  });

  console.log(`[CRITICAL RETENTION ALERT] High-risk employee ${employee.id} (${riskScore}% risk) APPLIED to bid ${bid.id}`);
}

// ============================================================================
// BID RECOMMENDATIONS
// ============================================================================

/**
 * Get recommended bids for employee based on skills/certs
 */
export async function getRecommendedBids(
  employeeId: string,
  workspaceId: string
): Promise<any[]> {
  const employee = await storage.getEmployeeById(employeeId);
  if (!employee) {
    throw new Error('Employee not found');
  }

  const allBids = await storage.getInternalBids(workspaceId, { status: 'open' });
  
  // Calculate match scores for all bids
  const bidsWithScores = await Promise.all(
    allBids.map(async (bid) => {
      const skillMatch = await calculateSkillMatch(employeeId, bid.id);
      return {
        ...bid,
        matchPercentage: skillMatch.matchPercentage,
        matchingSkills: skillMatch.matchingSkills,
        missingSkills: skillMatch.missingSkills,
      };
    })
  );

  // Sort by match percentage (highest first)
  return bidsWithScores
    .filter(bid => bid.matchPercentage >= 50) // At least 50% match
    .sort((a, b) => b.matchPercentage - a.matchPercentage);
}
