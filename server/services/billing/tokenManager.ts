/**
 * Token Manager — canonical per-workspace AI token ledger.
 *
 * CoAIleague tracks AI usage as tokens against a monthly allowance. Paid
 * tiers are soft-capped (overage billed on the monthly invoice); free/trial
 * tiers are hard-capped.
 *
 * Exports:
 *   - TOKEN_COSTS            — per-feature token cost map
 *   - TOKEN_FREE_FEATURES    — features that bypass the token gate
 *   - SUPPORT_POOL_FEATURES  — features billed from the platform support pool
 *   - TIER_TOKEN_ALLOCATIONS — monthly token allowance per subscription tier
 *   - FEATURE_DISPLAY_NAMES  — human-readable labels for usage reports
 *   - getWorkspaceTierAllowance, isUnlimitedTokenUser helpers
 *   - TokenManager class (singleton `tokenManager`) — ledger read/record API
 */

import { createLogger } from '../../lib/logger';
import { scheduleNonBlocking } from '../../lib/scheduleNonBlocking';
import { BILLING } from '../../../shared/billingConfig';
import { db } from '../../db';
import { aiUsageEvents } from '@shared/schema';
import { workspaces } from '@shared/schema';
import { eq, and, gte, sql, desc } from 'drizzle-orm';
import crypto from 'crypto';

const log = createLogger('tokenManager');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenCheckResult {
  hasAllowance: boolean;
  currentBalance: number;
  required: number;
  shortfall: number;
  unlimited?: boolean;
}

export interface TokenUsageResult {
  success: boolean;
  usageEventId: string | null;
  newBalance: number;
  errorMessage?: string;
}

export interface WorkspaceTokenState {
  workspaceId: string;
  currentBalance: number;
  monthlyAllocation: number;
  periodStart: Date;
  periodEnd: Date;
  totalTokensUsed: number;
  inOverage: boolean;
  overageTokens: number;
  overageDollars: number;
}

export type TokenUsageEntry = {
  id: string;
  workspaceId: string;
  tokensUsed: number;
  featureKey: string | null;
  featureName: string | null;
  description: string;
  createdAt: Date | null;
};

// ---------------------------------------------------------------------------
// isUnlimitedTokenUser — always false; everyone is metered
// ---------------------------------------------------------------------------
export async function isUnlimitedTokenUser(_userId: string, _workspaceId: string): Promise<boolean> {
  return false;
}

// ---------------------------------------------------------------------------
// Monthly tier allowance lookup
// ---------------------------------------------------------------------------
export async function getWorkspaceTierAllowance(workspaceId: string): Promise<number> {
  try {
    const [ws] = await db.select({ subscriptionTier: workspaces.subscriptionTier })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    const tier = ((ws?.subscriptionTier as string) || 'free').toLowerCase();
    return TIER_TOKEN_ALLOCATIONS[tier as keyof typeof TIER_TOKEN_ALLOCATIONS] ?? 100;
  } catch {
    return 100;
  }
}

// ---------------------------------------------------------------------------
// Feature sets
// ---------------------------------------------------------------------------
export const TOKEN_FREE_FEATURES = new Set([
  'guest_demo',
  'public_demo',
]);

export const SUPPORT_POOL_FEATURES = new Set([
  'support_pool_chat', 'support_pool_ticket', 'helpai_chat',
  'bot_helpai_greeting', 'bot_helpai_response', 'bot_helpai_faq',
  'bot_helpai_escalation', 'faq_search', 'faq_embedding', 'faq_chat',
  'support_broadcast_analysis', 'helpdesk_ai_greeting', 'helpdesk_ai_response',
  'helpdesk_ai_analysis', 'helpai_dynamic_response', 'chatroom_hr_ai',
  'chatroom_trinity_summon',
]);

// ---------------------------------------------------------------------------
// Tier allowances (monthly token pool)
// ---------------------------------------------------------------------------
export const TIER_TOKEN_ALLOCATIONS = {
  'free':         BILLING.tiers.free.monthlyTokens,
  'trial':        BILLING.tiers.free.monthlyTokens,
  'starter':      BILLING.tiers.starter.monthlyTokens,
  'professional': BILLING.tiers.professional.monthlyTokens,
  'business':     BILLING.tiers.business.monthlyTokens,
  'enterprise':   BILLING.tiers.enterprise.monthlyTokens,
  'strategic':    500_000,
  'unlimited':    12_000,
} as const;

// ---------------------------------------------------------------------------
// Per-feature token cost map
// 1 token-unit = $0.01 in pricing material.
// ---------------------------------------------------------------------------
export const TOKEN_COSTS = {
  // Session processing fees
  'schedule_generation': 300,
  'payroll_session_fee': 100,
  'invoicing_session_fee': 75,

  // AI Scheduling
  'ai_scheduling': 20,
  'ai_schedule_optimization': 12,
  'ai_shift_matching': 12,
  'ai_open_shift_fill': 20,

  // AI Invoicing
  'ai_invoice_full_workflow': 60,
  'ai_invoice_generation': 50,
  'ai_invoice_review': 15,
  'invoice_gap_analysis': 10,
  'invoice_reconciliation_insights': 10,

  // AI Payroll
  'per_payroll_employee': 8,
  'ai_payroll_processing': 8,
  'ai_payroll_verification': 6,
  'payroll_anomaly_insights': 5,

  // HR Document Requests
  'hr_document_request': 2,
  'hr_onboarding_invite': 5,

  // Sales & CRM
  'sales_lead_gen': 20,
  'sales_email': 5,

  // AI Communications
  'ai_chat_query': 3,
  'ai_email_generation': 4,

  // AI Analytics
  'ai_analytics_report': 15,
  'ai_predictions': 12,

  // AI Migration
  'ai_migration': 25,

  // Inbound Opportunity Agent
  'ai_email_classification': 2,
  'ai_shift_extraction': 5,
  'ai_inbound_shift_matching': 4,
  'ai_match_approval': 3,
  'ai_contractor_email': 4,

  // Email Intelligence
  'email_intelligence_analysis': 3,
  'email_intelligence_compose': 4,
  'email_intelligence_summary': 5,
  'email_intelligence_reply': 4,
  'email_intelligence_compliance': 3,

  // Automation & Orchestration
  'automation_summary': 2,
  'automation_remediation': 3,
  'onboarding_task_generation': 4,

  // Data Migration
  'data_migration_mapping': 5,
  'data_migration_extraction': 8,
  'data_migration_compliance': 5,

  // Document Pipeline
  'ai_document_processing': 10,

  // Trinity Staffing
  'trinity_staffing_scan': 8,
  'trinity_staffing_parse': 12,
  'trinity_staffing_auto_assign': 10,
  'trinity_staffing_confirmation': 6,
  'trinity_staffing_cancellation': 3,
  'trinity_staffing_escalation': 2,

  // QuickBooks
  'quickbooks_sync': 5,
  'quickbooks_error_analysis': 5,

  // Financial Intelligence
  'financial_pl_summary': 12,
  'financial_insights': 15,
  'financial_client_profitability': 10,
  'financial_trend_analysis': 8,

  // Scheduling Subagent
  'schedule_optimization': 5,
  'strategic_schedule_optimization': 8,

  // Domain Operations
  'log_analysis': 3,

  // RFP & Ethics - High-value document generation
  // Elite monetization is the per-proposal USD surcharge on trinity_rfp_generation
  // (see shared/config/premiumFeatures.ts eliteSurchargeCents). This token value
  // covers only the raw Claude/Gemini token cost of the research → draft → validate
  // → refine pipeline so the elite USD surcharge is net value, not tokens.
  'rfp_proposal_generation': 10,  // token-cost only (was 30 pre-Apr-2026)
  'ethics_triage': 5,

  // RMS & DAR
  'rms_narrative_polish': 5,
  'dar_ai_summary': 5,

  // AI Search
  'ai_search_query_optimization': 2,
  'ai_search_summary': 2,

  // Platform Operations
  'platform_change_summary': 3,
  'ai_notification': 2,
  'ai_visual_qa': 5,

  // Financial Intelligence
  'pnl_analysis': 10,
  'business_health_scan': 15,
  'compliance_audit': 8,
  'payroll_validation_insights': 3,

  // Automation Engine
  'automation_step_execution': 3,

  // Subagent Analysis
  'invoice_subagent_analysis': 5,
  'payroll_subagent_analysis': 5,
  'scheduling_subagent_analysis': 5,

  // Email AI
  'email_ai_summarization': 3,
  'ai_email_summarization': 3,

  // Trinity Staffing alt
  'trinity_staffing': 10,

  // General
  'ai_general': 3,

  // Trinity Conversations
  'trinity_thought': 1,
  'trinity_chat': 2,
  'trinity_insight': 1,
  'trinity_ai_reasoning': 2,
  'ai_trinity_orchestrator': 3,
  'ai_trinity_agent': 2,
  'mascot_ask': 1,
  'mascot_advice': 2,
  'mascot_insight': 1,
  'mascot_business_advisor': 2,
  'mascot_personalized_greeting': 1,
  'mascot_org_insights': 2,
  'mascot_interaction': 1,
  'mascot_chat_observe': 1,
  'mascot_generate_tasks': 2,
  'helpai_chat': 2,

  // Tax & Compliance
  'tax_prep_941': 2500,
  'tax_prep_940': 3500,
  'tax_prep_w2': 500,
  'tax_prep_1099': 500,
  'tax_filing_assistance': 1000,

  // Support Pool
  'support_pool_chat': 1,
  'support_pool_ticket': 2,

  // Trinity premium features
  'trinity_analysis': 25,
  'trinity_strategic': 30,
  'trinity_executive': 35,
  'trinity_premium_ai': 25,
  'trinity_rfp_response': 35,
  'trinity_capability_statement': 30,
  'trinity_contract_review': 30,
  'trinity_proposal': 30,

  // Bots
  'bot_helpai_greeting': 1,
  'bot_helpai_response': 2,
  'bot_helpai_faq': 1,
  'bot_helpai_escalation': 1,
  'bot_meeting_transcription': 5,
  'bot_meeting_summary': 4,
  'bot_meeting_action_items': 2,
  'bot_meeting_decisions': 2,
  'bot_report_detection': 1,
  'bot_report_cleanup': 3,
  'bot_report_summary': 4,
  'bot_report_routing': 1,

  // Analytics & Reports
  'report_summary': 15,
  'report_auto_gen': 4,

  // ClockBot
  'bot_clock_validation': 1,
  'bot_clock_summary': 2,
  'bot_clock_anomaly': 2,

  // CleanupBot
  'bot_cleanup_retention': 1,
  'bot_cleanup_archive': 2,

  // Dynamic
  'dynamic_message_generation': 1,
  'dynamic_motd': 1,
  'helpai_dynamic_response': 1,

  // Platform Services
  'email_transactional': 1,
  'email_marketing': 2,
  'email_inbound_processing': 3,
  'email_with_attachment': 2,
  'email_staffing_confirmation': 2,
  'email_employee_notification': 1,
  'email_payroll_notification': 1,
  'email_invoice': 2,
  'email_digest': 1,

  'sms_notification': 3,
  'sms_shift_reminder': 3,
  'sms_clock_reminder': 3,
  'sms_verification': 3,
  'sms_escalation': 3,
  'sms_inbound': 2,

  'platform_domain_fee': 25,
  'platform_email_domain': 50,
  'platform_google_workspace': 100,
  'platform_infrastructure': 200,

  // Premium Feature Gating
  'premium_feature': 5,
  'trinity_meeting_recording': 5,
  'trinity_staffing_request_parse': 8,

  // Partner API & Metering
  'partner_api_call': 3,
  'usage_metering': 2,

  // FAQ & Helpdesk
  'faq_search': 2,
  'faq_embedding': 1,
  'faq_chat': 2,
  'support_broadcast_analysis': 2,

  // Guard Tour & Operations
  'guard_tour_scan': 1,
  'equipment_checkout': 1,
  'equipment_return': 1,
  'equipment_maintenance': 1,
  'post_order_creation': 1,
  'document_signing_send': 3,
  'document_signing_verify': 1,

  // Employee Intelligence
  'employee_behavior_scoring': 2,
  'employee_performance_report': 2,

  // Bot Ecosystem
  'bot_interaction': 2,

  // Advanced Analytics
  'advanced_analytics': 15,
  'incident_management': 2,
  'client_billing': 3,

  // Push Notifications
  'push_notification': 1,

  // Core Features (overage)
  'basic_scheduling': 1,
  'basic_time_tracking': 1,
  'employee_onboarding': 2,
  'shift_marketplace': 1,
  'shift_swapping': 1,
  'helpdesk_support': 1,
  'chatrooms': 1,
  'client_portal': 2,
  'client_portal_helpai_session': 10,

  // Elite Features (overage)
  'security_compliance_vault': 3,
  'trinity_staffing_request': 5,
  'multi_state_compliance': 2,
} as const;

// ---------------------------------------------------------------------------
// Feature display names
// ---------------------------------------------------------------------------
export const FEATURE_DISPLAY_NAMES: Record<string, string> = {
  // Scheduling
  'ai_scheduling': 'Smart Scheduling',
  'ai_schedule_optimization': 'Schedule Optimization',
  'ai_shift_matching': 'Shift Matching',
  'ai_open_shift_fill': 'Open Shift Auto-Fill',
  'schedule_optimization': 'Schedule Optimization',
  'strategic_schedule_optimization': 'Strategic Scheduling',
  'schedule_generation': 'Schedule Generation',

  // Invoicing & Billing
  'ai_invoice_full_workflow': 'Auto-Invoice (Generate + Send)',
  'ai_invoice_generation': 'Invoice Generation',
  'ai_invoice_review': 'Invoice Review',
  'invoice_gap_analysis': 'Revenue Gap Analysis',
  'invoicing_session_fee': 'Invoice Session Fee',

  // Payroll
  'ai_payroll_processing': 'Payroll Processing',
  'ai_payroll_verification': 'Payroll Verification',
  'payroll_anomaly_insights': 'Payroll Anomaly Detection',
  'payroll_session_fee': 'Payroll Session Fee',
  'per_payroll_employee': 'Per-Employee Payroll Processing',

  // Email & Communications
  'ai_email_classification': 'Email Sorting',
  'ai_email_generation': 'Email Drafting',
  'ai_shift_extraction': 'Shift Request Parsing',
  'ai_contractor_email': 'Contractor Confirmation',
  'email_intelligence_analysis': 'Email Analysis',
  'email_intelligence_compose': 'Smart Compose',
  'email_intelligence_summary': 'Email Summary',
  'email_intelligence_reply': 'Reply Suggestions',

  // Trinity Conversations
  'trinity_thought': 'Trinity Insight',
  'trinity_chat': 'Trinity Chat',
  'trinity_insight': 'Trinity Tip',
  'trinity_ai_reasoning': 'Trinity AI Decision',
  'mascot_ask': 'Quick Ask',
  'mascot_advice': 'Business Advice',
  'mascot_insight': 'Smart Insight',
  'helpai_chat': 'Help Chat',
  'ai_chat_query': 'AI Chat',

  // Staffing Automation
  'trinity_staffing_scan': 'Email Monitoring',
  'trinity_staffing_parse': 'Request Parsing',
  'trinity_staffing_request_parse': 'Request Parsing',
  'trinity_staffing_auto_assign': 'Auto-Assignment',
  'trinity_staffing_confirmation': 'Client Confirmation',
  'trinity_staffing_cancellation': 'Cancellation Processing',
  'trinity_meeting_recording': 'Meeting Recording',
  'premium_feature': 'Premium Feature',
  'partner_api_call': 'Partner API',
  'usage_metering': 'Usage Charge',

  // Analytics & Insights
  'ai_analytics_report': 'Analytics Report',
  'ai_predictions': 'Predictive Analytics',
  'financial_pl_summary': 'P&L Summary',
  'financial_insights': 'Financial Insights',
  'financial_client_profitability': 'Client Profitability',
  'financial_trend_analysis': 'Trend Analysis',

  // Trinity Premium
  'trinity_analysis': 'Trinity Analysis',
  'trinity_strategic': 'Trinity Strategic Planning',
  'trinity_executive': 'Trinity Executive Summary',
  'rfp_proposal_generation': 'RFP Proposal Draft',
  'trinity_rfp_response': 'Trinity RFP Response',
  'trinity_capability_statement': 'Trinity Capability Statement',
  'trinity_contract_review': 'Trinity Contract Review',
  'trinity_proposal': 'Trinity Proposal Generation',
  'sales_lead_gen': 'AI Lead Discovery',
  'sales_email': 'AI Sales Email',

  // Bots
  'bot_helpai_response': 'Help Response',
  'bot_meeting_summary': 'Meeting Summary',
  'bot_report_summary': 'Report Summary',

  // Dynamic content
  'dynamic_motd': 'Daily Message',
  'dynamic_message_generation': 'Dynamic Message',

  // Platform services
  'email_transactional': 'Email Sent',
  'sms_notification': 'SMS Sent',

  // Fallback
  'ai_general': 'AI Operation',
};


// ---------------------------------------------------------------------------
// Tier cap policy
// ---------------------------------------------------------------------------
const HARD_CAP_TIERS = new Set(['free', 'trial', 'starter']);

// ---------------------------------------------------------------------------
// TokenManager — reads/records against aiUsageEvents
// ---------------------------------------------------------------------------
export class TokenManager {

  private getPeriodStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }

  private async getTierAllocation(workspaceId: string): Promise<{ tier: string; allocation: number }> {
    try {
      const [ws] = await db.select({ subscriptionTier: workspaces.subscriptionTier })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      const tier = ((ws?.subscriptionTier as string) || 'free').toLowerCase();
      const allocation = TIER_TOKEN_ALLOCATIONS[tier as keyof typeof TIER_TOKEN_ALLOCATIONS] ?? 100;
      return { tier, allocation };
    } catch {
      return { tier: 'free', allocation: 100 };
    }
  }

  private async getPeriodUsage(workspaceId: string, periodStart: Date): Promise<number> {
    try {
      const [row] = await db.select({
        total: sql<number>`COALESCE(SUM(${aiUsageEvents.creditsDeducted}), 0)::int`,
      })
        .from(aiUsageEvents)
        .where(and(
          eq(aiUsageEvents.workspaceId, workspaceId),
          gte(aiUsageEvents.createdAt, periodStart),
        ));
      return Number(row?.total ?? 0);
    } catch {
      return 0;
    }
  }

  private buildState(workspaceId: string, allocation: number, used: number): WorkspaceTokenState {
    const periodStart = this.getPeriodStart();
    const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 1);
    const balance = allocation - used;
    const overageTokens = Math.max(0, -balance);
    return {
      workspaceId,
      currentBalance: balance,
      monthlyAllocation: allocation,
      periodStart,
      periodEnd,
      totalTokensUsed: used,
      inOverage: used > allocation,
      overageTokens,
      overageDollars: +(overageTokens * 0.01).toFixed(2),
    };
  }

  async getWorkspaceState(workspaceId: string): Promise<WorkspaceTokenState | null> {
    try {
      const { allocation } = await this.getTierAllocation(workspaceId);
      const used = await this.getPeriodUsage(workspaceId, this.getPeriodStart());
      return this.buildState(workspaceId, allocation, used);
    } catch (err) {
      log.error({ workspaceId, err } as any, 'tokenManager.getWorkspaceState failed');
      return null;
    }
  }

  async getBalance(workspaceId: string): Promise<number> {
    const state = await this.getWorkspaceState(workspaceId);
    return state?.currentBalance ?? 0;
  }

  async checkTokens(workspaceId: string, featureKey: string, _userId?: string, quantity: number = 1): Promise<TokenCheckResult> {
    const cost = ((TOKEN_COSTS as Record<string, number>)[featureKey] ?? 0) * quantity;
    if (TOKEN_FREE_FEATURES.has(featureKey)) {
      return { hasAllowance: true, currentBalance: Number.MAX_SAFE_INTEGER, required: 0, shortfall: 0, unlimited: true };
    }
    try {
      const { tier, allocation } = await this.getTierAllocation(workspaceId);
      const used = await this.getPeriodUsage(workspaceId, this.getPeriodStart());
      const balance = allocation - used;

      // Low-balance NDS alert — fires once when balance drops into the warning zone.
      if (HARD_CAP_TIERS.has(tier) && allocation > 0) {
        const threshold = Math.floor(allocation * 0.1);
        if (balance <= threshold && balance > 0) {
          scheduleNonBlocking('token.low-balance-alert', async () => {
            const { onLowBalance } = await import('./upsellService');
            await onLowBalance(workspaceId, balance, allocation);
          });
        }
      }

      if (HARD_CAP_TIERS.has(tier) && balance < cost) {
        return { hasAllowance: false, currentBalance: Math.max(0, balance), required: cost, shortfall: Math.max(0, cost - balance) };
      }
      return { hasAllowance: true, currentBalance: balance, required: cost, shortfall: 0 };
    } catch {
      return { hasAllowance: true, currentBalance: 0, required: cost, shortfall: 0 };
    }
  }

  async recordUsage(params: { workspaceId: string; featureKey: string; quantity?: number; userId?: string; description?: string; metadata?: Record<string, unknown> }): Promise<TokenUsageResult> {
    const { workspaceId, featureKey, quantity = 1, userId, description, metadata } = params;
    const cost = ((TOKEN_COSTS as Record<string, number>)[featureKey] ?? 0) * quantity;
    if (cost <= 0 || TOKEN_FREE_FEATURES.has(featureKey)) {
      return { success: true, usageEventId: null, newBalance: 0 };
    }
    try {
      const id = crypto.randomUUID();
      await db.insert(aiUsageEvents).values({
        id,
        workspaceId,
        userId: userId || undefined,
        featureKey,
        usageType: 'token_usage',
        usageAmount: String(cost),
        usageUnit: 'tokens',
        activityType: featureKey,
        creditsDeducted: cost,
        metadata: description ? { description, ...(metadata || {}) } : metadata,
      });
      const { allocation } = await this.getTierAllocation(workspaceId);
      const used = await this.getPeriodUsage(workspaceId, this.getPeriodStart());
      return { success: true, usageEventId: id, newBalance: allocation - used };
    } catch (err) {
      log.error({ workspaceId, featureKey, err } as any, 'tokenManager.recordUsage failed');
      return { success: false, usageEventId: null, newBalance: 0, errorMessage: String(err) };
    }
  }

  async getUsageHistory(workspaceId: string, limit: number = 50): Promise<TokenUsageEntry[]> {
    try {
      const rows = await db.select()
        .from(aiUsageEvents)
        .where(eq(aiUsageEvents.workspaceId, workspaceId))
        .orderBy(desc(aiUsageEvents.createdAt))
        .limit(Math.min(limit, 200));
      return rows.map(r => ({
        id: r.id,
        workspaceId: r.workspaceId,
        tokensUsed: r.creditsDeducted ?? 0,
        featureKey: r.featureKey,
        featureName: r.activityType || r.featureKey,
        description: (r as any).metadata?.description || '',
        createdAt: r.createdAt,
      }));
    } catch {
      return [];
    }
  }

  async getMonthlyBreakdown(workspaceId: string): Promise<Array<{ featureKey: string; tokensUsed: number; requestCount: number }>> {
    try {
      const periodStart = this.getPeriodStart();
      const rows = await db.select({
        featureKey: aiUsageEvents.featureKey,
        tokensUsed: sql<number>`COALESCE(SUM(${aiUsageEvents.creditsDeducted}), 0)::int`,
        requestCount: sql<number>`COUNT(*)::int`,
      })
        .from(aiUsageEvents)
        .where(and(
          eq(aiUsageEvents.workspaceId, workspaceId),
          gte(aiUsageEvents.createdAt, periodStart),
        ))
        .groupBy(aiUsageEvents.featureKey);
      return rows.map(r => ({ featureKey: r.featureKey, tokensUsed: Number(r.tokensUsed), requestCount: Number(r.requestCount) }));
    } catch {
      return [];
    }
  }

  async getOverageReport(workspaceId: string): Promise<{ overageTokens: number; overageDollars: number }> {
    try {
      const { allocation } = await this.getTierAllocation(workspaceId);
      const used = await this.getPeriodUsage(workspaceId, this.getPeriodStart());
      const overageTokens = Math.max(0, used - allocation);
      return { overageTokens, overageDollars: +(overageTokens * 0.01).toFixed(2) };
    } catch {
      return { overageTokens: 0, overageDollars: 0 };
    }
  }
}

export const tokenManager = new TokenManager();
