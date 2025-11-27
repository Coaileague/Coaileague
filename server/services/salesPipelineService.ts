/**
 * Sales Pipeline Service
 * Manages deals, activities, and pipeline tracking for orgs and platform
 */

import { SALES_STAGES, DEAL_PIPELINE, DEAL_SIZE_CATEGORIES } from "@shared/salesPipelineConfig";

export interface Deal {
  id: string;
  workspaceId?: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  stage: string;
  value: number;
  closeProbability: number;
  expectedCloseDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SalesActivity {
  id: string;
  dealId: string;
  type: string;
  description: string;
  notes?: string;
  createdAt: Date;
  createdBy: string;
}

export interface SalesMetrics {
  totalDeals: number;
  dealsInProgress: number;
  totalPipelineValue: number;
  closedWonValue: number;
  averageDealSize: number;
  conversionRate: number;
  averageSalesCycle: number;
}

class SalesService {
  // Calculate deal metrics
  calculateMetrics(deals: Deal[]): SalesMetrics {
    const totalDeals = deals.length;
    const dealsInProgress = deals.filter((d) => d.stage !== SALES_STAGES.CLOSED_WON && d.stage !== SALES_STAGES.CLOSED_LOST).length;
    const totalPipelineValue = deals
      .filter((d) => d.stage !== SALES_STAGES.CLOSED_WON && d.stage !== SALES_STAGES.CLOSED_LOST)
      .reduce((sum, d) => sum + d.value, 0);
    const closedWonValue = deals
      .filter((d) => d.stage === SALES_STAGES.CLOSED_WON)
      .reduce((sum, d) => sum + d.value, 0);
    const averageDealSize = totalDeals > 0 ? deals.reduce((sum, d) => sum + d.value, 0) / totalDeals : 0;
    const closedDeals = deals.filter((d) => d.stage === SALES_STAGES.CLOSED_WON || d.stage === SALES_STAGES.CLOSED_LOST).length;
    const conversionRate = closedDeals > 0 ? (deals.filter((d) => d.stage === SALES_STAGES.CLOSED_WON).length / closedDeals) * 100 : 0;

    return {
      totalDeals,
      dealsInProgress,
      totalPipelineValue,
      closedWonValue,
      averageDealSize,
      conversionRate,
      averageSalesCycle: 30, // Placeholder
    };
  }

  // Categorize deal by size
  categorizeDealSize(value: number): string {
    for (const [_, category] of Object.entries(DEAL_SIZE_CATEGORIES)) {
      if (value >= category.min && value < category.max) return category.label;
    }
    return DEAL_SIZE_CATEGORIES.ENTERPRISE.label;
  }

  // Get deal health score
  getDealHealthScore(deal: Deal): number {
    let score = 50;
    if (deal.closeProbability > 75) score += 25;
    else if (deal.closeProbability > 50) score += 15;
    else if (deal.closeProbability > 25) score += 5;
    return Math.min(score, 100);
  }

  // Get pipeline distribution
  getPipelineDistribution(deals: Deal[]) {
    const distribution: Record<string, number> = {};
    DEAL_PIPELINE.forEach((stage) => {
      distribution[stage.name] = deals.filter((d) => d.stage === stage.id).length;
    });
    return distribution;
  }
}

export const salesService = new SalesService();
