/**
 * Trinity Empire Mode - Growth Strategist Service
 * 
 * Upgrades Trinity from COO (operations) to CSO (Chief Strategy Officer).
 * Proactively analyzes org data to find "Money Leaks" and "Growth Gaps",
 * then recommends specific CoAIleague tools to fix them.
 * 
 * The 4 Pillars of Empire Mode:
 * 1. Cashflow Optimization ("Money Hunt") - Analyze overdue invoices
 * 2. B2B Matchmaker (Networking) - Find complementary businesses
 * 3. Sales Velocity (Growth) - Analyze lead conversion rates
 * 4. Tool Expansion (Upsell) - Identify manual friction points
 */

import crypto from 'crypto';
import { db } from '../../db';
import { 
  invoices, 
  workspaces, 
  employees,
  timeEntries,
  clients,
  notifications,
  supportTickets,
} from '@shared/schema';
import { eq, and, gte, lte, lt, count, sql, desc, ne } from 'drizzle-orm';
import { subDays, differenceInDays, startOfWeek, endOfWeek } from 'date-fns';
import { createLogger } from '../../lib/logger';
import { aiWorkboardTasks } from '@shared/schema';
const log = createLogger('growthStrategist');

export interface StrategyCard {
  id: string;
  type: 'CASHFLOW_ALERT' | 'NETWORKING' | 'SALES_VELOCITY' | 'TOOL_EXPANSION' | 'EFFICIENCY' | 'GROWTH_TIP';
  pillar: 'cashflow' | 'networking' | 'sales' | 'tools';
  priority: 'high' | 'medium' | 'low';
  title: string;
  subtitle: string;
  impact: string;
  estimatedROI: number | null;
  proposal: string;
  actionFunction: string;
  actionLabel: string;
  trinityQuote: string;
  createdAt: Date;
  expiresAt: Date | null;
  dismissed: boolean;
}

export interface EmpireScore {
  total: number;
  breakdown: {
    cashflow: number;
    networking: number;
    sales: number;
    efficiency: number;
  };
  trend: 'improving' | 'stable' | 'declining';
  lastUpdated: Date;
}

export interface EmpireScanResult {
  orgId: string;
  orgName: string;
  empireScore: EmpireScore;
  cashOnTable: number;
  opportunities: StrategyCard[];
  weeklyPotential: number;
  monthlyPotential: number;
  scanCompletedAt: Date;
}

const CONSULTANT_QUOTES = {
  cashflow: [
    "I've found money sitting on the table. Let's go get it.",
    "Your cash is out there. Let me help you bring it home.",
    "I see revenue that's waiting to be collected. Shall we?",
  ],
  networking: [
    "I know a guy... well, another AI actually. Their Org needs exactly what you sell.",
    "There's a perfect match out there. Want me to bridge the connection?",
    "I've spotted a networking goldmine. Ready to expand your reach?",
  ],
  sales: [
    "Speed is the new currency in sales. Let me help you move faster.",
    "Your competitors are responding in 5 minutes. Let's match that.",
    "Every minute of delay costs you conversions. I can fix that.",
  ],
  tools: [
    "You're paying a human to do a robot's job. Let me take over.",
    "I've found a way to improve your margins. Interested?",
    "There's automation opportunity here. Your team could focus on what matters.",
  ],
};

function getRandomQuote(pillar: keyof typeof CONSULTANT_QUOTES): string {
  const quotes = CONSULTANT_QUOTES[pillar];
  return quotes[Math.floor(Math.random() * quotes.length)];
}

function generateCardId(): string {
  return `empire-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
}

class GrowthStrategistService {
  private scanCache: Map<string, { result: EmpireScanResult; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour

  async runWeeklyStrategyScan(workspaceId: string): Promise<EmpireScanResult> {
    const cached = this.scanCache.get(workspaceId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result;
    }

    log.info(`[GrowthStrategist] Running Empire Mode scan for workspace ${workspaceId}`);

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    });

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const opportunities: StrategyCard[] = [];

    const [cashflowCards, salesCards, toolCards] = await Promise.all([
      this.analyzeReceivables(workspaceId),
      this.analyzeSalesVelocity(workspaceId),
      this.scanForToolOpportunities(workspaceId),
    ]);

    opportunities.push(...cashflowCards, ...salesCards, ...toolCards);

    opportunities.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    const empireScore = await this.calculateEmpireScore(workspaceId, opportunities);
    const cashOnTable = this.calculateCashOnTable(opportunities);

    const result: EmpireScanResult = {
      orgId: workspaceId,
      orgName: workspace.name || 'Your Organization',
      empireScore,
      cashOnTable,
      opportunities,
      weeklyPotential: Math.round(cashOnTable * 0.25),
      monthlyPotential: cashOnTable,
      scanCompletedAt: new Date(),
    };

    this.scanCache.set(workspaceId, { result, timestamp: Date.now() });
    log.info(`[GrowthStrategist] Scan complete: ${opportunities.length} opportunities, Empire Score: ${empireScore.total}`);

    return result;
  }

  async analyzeReceivables(workspaceId: string): Promise<StrategyCard[]> {
    const cards: StrategyCard[] = [];
    const now = new Date();
    const thirtyDaysAgo = subDays(now, 30);
    const sixtyDaysAgo = subDays(now, 60);

    try {
      const overdueInvoices = await db.select({
        id: invoices.id,
        total: invoices.total,
        dueDate: invoices.dueDate,
        status: invoices.status,
        clientId: invoices.clientId,
      })
        .from(invoices)
        .where(and(
          eq(invoices.workspaceId, workspaceId),
          eq(invoices.status, 'sent'),
          lt(invoices.dueDate, now)
        ));

      const totalOverdue = overdueInvoices.reduce((sum, inv) => {
        return sum + (parseFloat(inv.total || '0'));
      }, 0);

      const thirtyPlusOverdue = overdueInvoices.filter(inv => 
        inv.dueDate && differenceInDays(now, new Date(inv.dueDate)) >= 30
      );

      const sixtyPlusOverdue = overdueInvoices.filter(inv => 
        inv.dueDate && differenceInDays(now, new Date(inv.dueDate)) >= 60
      );

      if (totalOverdue >= 500) {
        const estimatedRecovery = Math.round(totalOverdue * 0.4);
        
        cards.push({
          id: generateCardId(),
          type: 'CASHFLOW_ALERT',
          pillar: 'cashflow',
          priority: totalOverdue >= 5000 ? 'high' : totalOverdue >= 1000 ? 'medium' : 'low',
          title: 'Recover Overdue Revenue',
          subtitle: `${overdueInvoices.length} invoice${overdueInvoices.length !== 1 ? 's' : ''} past due`,
          impact: `$${totalOverdue.toLocaleString()} in pending cash`,
          estimatedROI: estimatedRecovery,
          proposal: `I noticed you have $${totalOverdue.toLocaleString()} in overdue invoices. Shall I activate automated follow-up reminders? Based on my data, this can recover ~40% of overdue cash within 7 days.`,
          actionFunction: 'activate_dunning_agent',
          actionLabel: 'Activate Auto-Follow-Up',
          trinityQuote: getRandomQuote('cashflow'),
          createdAt: new Date(),
          expiresAt: null,
          dismissed: false,
        });
      }

      if (thirtyPlusOverdue.length >= 3) {
        const agingTotal = thirtyPlusOverdue.reduce((sum, inv) => sum + parseFloat(inv.total || '0'), 0);
        
        cards.push({
          id: generateCardId(),
          type: 'CASHFLOW_ALERT',
          pillar: 'cashflow',
          priority: 'high',
          title: 'Aging Receivables Alert',
          subtitle: `${thirtyPlusOverdue.length} invoices 30+ days overdue`,
          impact: `$${agingTotal.toLocaleString()} at risk`,
          estimatedROI: Math.round(agingTotal * 0.3),
          proposal: `${thirtyPlusOverdue.length} invoices are 30+ days overdue, totaling $${agingTotal.toLocaleString()}. I recommend escalating these to a more aggressive collection workflow. Want me to draft personalized follow-up sequences?`,
          actionFunction: 'escalate_collections',
          actionLabel: 'Escalate Collections',
          trinityQuote: "Time is money, and we're running out of both on these invoices.",
          createdAt: new Date(),
          expiresAt: null,
          dismissed: false,
        });
      }
    } catch (error) {
      log.error('[GrowthStrategist] Error analyzing receivables:', error);
    }

    return cards;
  }

  async analyzeSalesVelocity(workspaceId: string): Promise<StrategyCard[]> {
    const cards: StrategyCard[] = [];

    try {
      const weekStart = startOfWeek(new Date());
      const weekEnd = endOfWeek(new Date());
      
      const weeklyTickets = await db.select({ 
        count: count(),
        avgResponseTime: sql<number>`AVG(EXTRACT(EPOCH FROM (updated_at - created_at)))`,
      })
        .from(supportTickets)
        .where(and(
          eq(supportTickets.workspaceId, workspaceId),
          gte(supportTickets.createdAt, weekStart),
          lte(supportTickets.createdAt, weekEnd)
        ));

      const ticketCount = weeklyTickets[0]?.count || 0;
      const avgResponseSeconds = weeklyTickets[0]?.avgResponseTime || 0;
      const avgResponseHours = avgResponseSeconds / 3600;

      if (avgResponseHours > 4 && ticketCount >= 5) {
        const potentialIncrease = 0.2;
        
        cards.push({
          id: generateCardId(),
          type: 'SALES_VELOCITY',
          pillar: 'sales',
          priority: avgResponseHours > 24 ? 'high' : 'medium',
          title: 'Response Time Opportunity',
          subtitle: `Average: ${avgResponseHours.toFixed(1)} hours`,
          impact: `Industry standard is 5 minutes. Faster responses = 20% higher close rates.`,
          estimatedROI: null,
          proposal: `Your average response time is ${avgResponseHours.toFixed(1)} hours. Industry leaders respond in 5 minutes. I recommend enabling AI-assisted instant replies to draft immediate responses for approval. This typically increases close rates by 20%.`,
          actionFunction: 'enable_instant_reply',
          actionLabel: 'Enable Instant Replies',
          trinityQuote: getRandomQuote('sales'),
          createdAt: new Date(),
          expiresAt: null,
          dismissed: false,
        });
      }

      const clientsWithNoRecentActivity = await db.select({
        id: clients.id,
        firstName: clients.firstName,
        lastName: clients.lastName,
      })
        .from(clients)
        .where(eq(clients.workspaceId, workspaceId))
        .limit(100);

      const inactiveClients = [];
      for (const client of clientsWithNoRecentActivity) {
        const recentInvoices = await db.select({ count: count() })
          .from(invoices)
          .where(and(
            eq(invoices.clientId, client.id),
            gte(invoices.createdAt, subDays(new Date(), 90))
          ));
        
        if (recentInvoices[0]?.count === 0) {
          inactiveClients.push(client);
        }
        
        if (inactiveClients.length >= 5) break;
      }

      if (inactiveClients.length >= 3) {
        cards.push({
          id: generateCardId(),
          type: 'SALES_VELOCITY',
          pillar: 'sales',
          priority: 'medium',
          title: 'Client Re-Engagement Opportunity',
          subtitle: `${inactiveClients.length} clients inactive 90+ days`,
          impact: 'Re-engaging dormant clients has 5x higher conversion than new leads',
          estimatedROI: null,
          proposal: `I've identified ${inactiveClients.length} clients who haven't had activity in 90+ days. Would you like me to draft personalized re-engagement campaigns? Dormant client reactivation has a 5x higher success rate than cold outreach.`,
          actionFunction: 'draft_reengagement_campaign',
          actionLabel: 'Start Re-Engagement',
          trinityQuote: "Your best new customers are your old customers. Let's reconnect.",
          createdAt: new Date(),
          expiresAt: null,
          dismissed: false,
        });
      }
    } catch (error) {
      log.error('[GrowthStrategist] Error analyzing sales velocity:', error);
    }

    return cards;
  }

  async scanForToolOpportunities(workspaceId: string): Promise<StrategyCard[]> {
    const cards: StrategyCard[] = [];

    try {
      const manualTimeEntries = await db.select({ count: count() })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, subDays(new Date(), 30))
        ));

      const entryCount = manualTimeEntries[0]?.count || 0;

      if (entryCount >= 100) {
        const hoursPerWeek = Math.round(entryCount / 4 * 0.5);
        const monthlySavings = hoursPerWeek * 4 * 25;
        
        cards.push({
          id: generateCardId(),
          type: 'TOOL_EXPANSION',
          pillar: 'tools',
          priority: 'medium',
          title: 'Automate Time Tracking Reports',
          subtitle: `${entryCount} manual entries this month`,
          impact: `Save ~${hoursPerWeek} hours/week on reporting`,
          estimatedROI: monthlySavings,
          proposal: `You're processing ${entryCount} time entries manually each month. I can automate weekly reports, saving approximately ${hoursPerWeek} hours per week. That's ~$${monthlySavings}/month in recovered productivity.`,
          actionFunction: 'enable_auto_reports',
          actionLabel: 'Enable Auto-Reports',
          trinityQuote: getRandomQuote('tools'),
          createdAt: new Date(),
          expiresAt: null,
          dismissed: false,
        });
      }

      const aiTasks = await db.select({ count: count() })
        .from(aiWorkboardTasks)
        .where(and(
          eq(aiWorkboardTasks.workspaceId, workspaceId),
          gte(aiWorkboardTasks.createdAt, subDays(new Date(), 30))
        ));

      const aiUsage = aiTasks[0]?.count || 0;

      if (aiUsage < 10) {
        cards.push({
          id: generateCardId(),
          type: 'TOOL_EXPANSION',
          pillar: 'tools',
          priority: 'low',
          title: 'Unlock AI Automation Potential',
          subtitle: 'Low AI feature utilization detected',
          impact: 'AI automation typically saves 10+ hours/week',
          estimatedROI: 2500,
          proposal: `Your team is barely scratching the surface of our AI capabilities. Most similar organizations save 10+ hours per week with AI scheduling, document processing, and automated insights. Want a personalized AI adoption plan?`,
          actionFunction: 'get_ai_adoption_plan',
          actionLabel: 'Get AI Adoption Plan',
          trinityQuote: "You have a superpower at your fingertips. Let me show you how to use it.",
          createdAt: new Date(),
          expiresAt: null,
          dismissed: false,
        });
      }

      const creditUsage = await db.execute<{ totalCredits: number }>(sql`
        SELECT COALESCE(SUM(tokens_total), 0)::int AS "totalCredits"
        FROM token_usage_log
        WHERE workspace_id = ${workspaceId}
          AND timestamp >= ${subDays(new Date(), 30).toISOString()}
      `);
      const monthlyCredits = Number((creditUsage as any)?.rows?.[0]?.totalCredits ?? 0);

      if (monthlyCredits > 5000) {
        cards.push({
          id: generateCardId(),
          type: 'EFFICIENCY',
          pillar: 'tools',
          priority: 'medium',
          title: 'Trinity Credit Optimization',
          subtitle: `${monthlyCredits.toLocaleString()} credits used this month`,
          impact: 'Upgrade to save 20% on AI operations',
          estimatedROI: Math.round(monthlyCredits * 0.002 * 0.2 * 12),
          proposal: `You're a power user! With ${monthlyCredits.toLocaleString()} credits used this month, upgrading to Trinity Pro would save you ~20% on AI operations. Want me to calculate your exact savings?`,
          actionFunction: 'calculate_upgrade_savings',
          actionLabel: 'Calculate Savings',
          trinityQuote: "You're getting serious value from me. Let's make it even more efficient.",
          createdAt: new Date(),
          expiresAt: null,
          dismissed: false,
        });
      }
    } catch (error) {
      log.error('[GrowthStrategist] Error scanning for tool opportunities:', error);
    }

    return cards;
  }

  async calculateEmpireScore(workspaceId: string, opportunities: StrategyCard[]): Promise<EmpireScore> {
    let cashflowScore = 100;
    let networkingScore = 75;
    let salesScore = 100;
    let efficiencyScore = 100;

    for (const opp of opportunities) {
      const deduction = opp.priority === 'high' ? 20 : opp.priority === 'medium' ? 10 : 5;
      
      switch (opp.pillar) {
        case 'cashflow':
          cashflowScore = Math.max(0, cashflowScore - deduction);
          break;
        case 'networking':
          networkingScore = Math.max(0, networkingScore - deduction);
          break;
        case 'sales':
          salesScore = Math.max(0, salesScore - deduction);
          break;
        case 'tools':
          efficiencyScore = Math.max(0, efficiencyScore - deduction);
          break;
      }
    }

    const total = Math.round(
      (cashflowScore * 0.35) + 
      (networkingScore * 0.15) + 
      (salesScore * 0.25) + 
      (efficiencyScore * 0.25)
    );

    return {
      total,
      breakdown: {
        cashflow: cashflowScore,
        networking: networkingScore,
        sales: salesScore,
        efficiency: efficiencyScore,
      },
      trend: 'stable',
      lastUpdated: new Date(),
    };
  }

  calculateCashOnTable(opportunities: StrategyCard[]): number {
    return opportunities.reduce((total, opp) => {
      return total + (opp.estimatedROI || 0);
    }, 0);
  }

  async getStrategySummary(workspaceId: string): Promise<{
    empireScore: number;
    cashOnTable: number;
    topOpportunity: StrategyCard | null;
    opportunityCount: number;
    trinityInsight: string;
  }> {
    const scan = await this.runWeeklyStrategyScan(workspaceId);
    
    const insights = [
      `Your Empire Score is ${scan.empireScore.total}/100. ${scan.empireScore.total >= 80 ? "You're crushing it!" : scan.empireScore.total >= 60 ? "Room for growth - let's optimize." : "We have work to do together."}`,
      `I've identified $${scan.cashOnTable.toLocaleString()} in potential monthly value waiting to be captured.`,
      `${scan.opportunities.length} strategic opportunities detected. The highest priority: ${scan.opportunities[0]?.title || 'All clear!'}`,
    ];

    return {
      empireScore: scan.empireScore.total,
      cashOnTable: scan.cashOnTable,
      topOpportunity: scan.opportunities[0] || null,
      opportunityCount: scan.opportunities.length,
      trinityInsight: insights[Math.floor(Math.random() * insights.length)],
    };
  }

  dismissOpportunity(workspaceId: string, cardId: string): boolean {
    const cached = this.scanCache.get(workspaceId);
    if (cached) {
      const card = cached.result.opportunities.find(o => o.id === cardId);
      if (card) {
        card.dismissed = true;
        return true;
      }
    }
    return false;
  }

  clearCache(workspaceId?: string): void {
    if (workspaceId) {
      this.scanCache.delete(workspaceId);
    } else {
      this.scanCache.clear();
    }
  }
}

export const growthStrategist = new GrowthStrategistService();
