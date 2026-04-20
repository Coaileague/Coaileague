/**
 * Credit Manager — No-Op Stub
 *
 * The workspace_credits / credit_transactions / credit_packs tables were
 * permanently dropped (Phase 16). All public methods return harmless
 * unlimited-credit values so callers compile and run without changes.
 *
 * What IS preserved:
 *   - CREDIT_COSTS           — used by AI features for display / logging
 *   - CREDIT_EXEMPT_FEATURES — gate-check fast path
 *   - TIER_CREDIT_ALLOCATIONS / TIER_MONTHLY_CREDITS — used by billing reports
 *   - SUPPORT_POOL_FEATURES  — used by aiCreditGateway
 *   - FEATURE_DISPLAY_NAMES  — used by usage reports
 *   - isUnlimitedCreditUser  — always returns false (everyone is tracked)
 *   - CreditManager class    — all methods are no-ops
 *   - creditManager singleton — exported for backward compat
 */

import { createLogger } from '../../lib/logger';
import { scheduleNonBlocking } from '../../lib/scheduleNonBlocking';
import { BILLING } from '../../../shared/billingConfig';
import { db } from '../../db';
import { aiUsageEvents } from '@shared/schema';
import { workspaces } from '@shared/schema';
import { eq, and, gte, sql, desc } from 'drizzle-orm';
import crypto from 'crypto';

const log = createLogger('creditManager');

// ---------------------------------------------------------------------------
// Types (standalone — no longer derived from Drizzle tables)
// ---------------------------------------------------------------------------

export interface CreditCheckResult {
  hasEnoughCredits: boolean;
  currentBalance: number;
  required: number;
  shortfall: number;
  unlimitedCredits?: boolean;
}

export interface CreditDeductionResult {
  success: boolean;
  transactionId: string | null;
  newBalance: number;
  errorMessage?: string;
}

export interface WorkspaceCredits {
  id: string;
  workspaceId: string;
  currentBalance: number;
  monthlyAllocation: number;
  lastResetAt: Date | null;
  nextResetAt: Date | null;
  totalCreditsEarned: number;
  totalCreditsSpent: number;
  totalCreditsPurchased: number;
  purchasedCreditsBalance: number;
  rolloverEnabled: boolean | null;
  rolloverBalance: number | null;
  maxRolloverCredits: number | null;
  autoRechargeEnabled: boolean | null;
  autoRechargeThreshold: number | null;
  autoRechargeAmount: number | null;
  autoRechargeCreditPackId: string | null;
  lastAutoRechargeAt: Date | null;
  lowBalanceAlertEnabled: boolean | null;
  lowBalanceAlertThreshold: number | null;
  lastLowBalanceAlertAt: Date | null;
  inOverageMode: boolean | null;
  overageAccumulatorCredits: number | null;
  overageAccumulatorDollars: string | null;
  lastOverageNotificationAt: Date | null;
  overageBilledAt: Date | null;
  overageBilledCredits: number | null;
  isActive: boolean | null;
  isSuspended: boolean | null;
  suspendedReason: string | null;
  suspendedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type InsertCreditTransaction = {
  workspaceId: string;
  transactionType: string;
  amount: number;
  balanceAfter: number;
  featureKey?: string | null;
  featureName?: string | null;
  description?: string | null;
};

export type InsertWorkspaceCredits = Omit<WorkspaceCredits, 'id' | 'createdAt' | 'updatedAt'>;
export type CreditTransaction = { id: string; workspaceId: string; amount: number; balanceAfter: number; createdAt: Date | null };
export type InsertCreditPack = { name: string; creditsAmount: number; priceUsd: string };
export type CreditPack = InsertCreditPack & { id: string };

const UNLIMITED_BALANCE = 999_999_999;

export const UNLIMITED_CREDITS_BALANCE = UNLIMITED_BALANCE;

// ---------------------------------------------------------------------------
// isUnlimitedCreditUser — always false; everyone is metered
// ---------------------------------------------------------------------------
export async function isUnlimitedCreditUser(_userId: string, _workspaceId: string): Promise<boolean> {
  return false;
}

// ---------------------------------------------------------------------------
// getWorkspaceTierAllowance — returns monthly credit allocation for a workspace
// ---------------------------------------------------------------------------
export async function getWorkspaceTierAllowance(workspaceId: string): Promise<number> {
  try {
    const [ws] = await db.select({ subscriptionTier: workspaces.subscriptionTier })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    const tier = ((ws?.subscriptionTier as string) || 'free').toLowerCase();
    return TIER_CREDIT_ALLOCATIONS[tier as keyof typeof TIER_CREDIT_ALLOCATIONS] ?? 100;
  } catch {
    return 100;
  }
}

// ---------------------------------------------------------------------------
// CREDIT_EXEMPT_FEATURES
// ---------------------------------------------------------------------------
export const CREDIT_EXEMPT_FEATURES = new Set([
  'guest_demo',
  'public_demo',
]);

// ---------------------------------------------------------------------------
// SUPPORT_POOL_FEATURES
// ---------------------------------------------------------------------------
export const SUPPORT_POOL_FEATURES = new Set([
  'support_pool_chat', 'support_pool_ticket', 'helpai_chat',
  'bot_helpai_greeting', 'bot_helpai_response', 'bot_helpai_faq',
  'bot_helpai_escalation', 'faq_search', 'faq_embedding', 'faq_chat',
  'support_broadcast_analysis', 'helpdesk_ai_greeting', 'helpdesk_ai_response',
  'helpdesk_ai_analysis', 'helpai_dynamic_response', 'chatroom_hr_ai',
  'chatroom_trinity_summon',
]);

// ---------------------------------------------------------------------------
// TIER_CREDIT_ALLOCATIONS / TIER_MONTHLY_CREDITS
// ---------------------------------------------------------------------------
export const TIER_CREDIT_ALLOCATIONS = {
  'free':         BILLING.tiers.free.monthlyCredits,
  'trial':        BILLING.tiers.free.monthlyCredits,
  'starter':      BILLING.tiers.starter.monthlyCredits,
  'professional': BILLING.tiers.professional.monthlyCredits,
  'business':     BILLING.tiers.business.monthlyCredits,
  'enterprise':   BILLING.tiers.enterprise.monthlyCredits,
  'strategic':    500_000,
  'unlimited':    12_000,
} as const;

export const TIER_MONTHLY_CREDITS: Record<string, number> = TIER_CREDIT_ALLOCATIONS;


export const CREDIT_COSTS = {
  // =========================================================================
  // SESSION PROCESSING FEES — One-time flat cost per automation run
  // Charged once when a scheduling/payroll/invoicing session starts.
  // Covers AI reasoning overhead, demand analysis, conflict resolution.
  //
  // Rationale (Mar 2026 Rebalance):
  //   Scheduling: Trinity orchestrates demand analysis, conflict resolution,
  //     availability matching, gap alerting — minimum 250 cr reflects real AI
  //     compute and platform value even for small batches.
  //   Payroll: Compliance checks, tax logic, anomaly detection = 100 cr.
  //   Invoicing: Batch orchestration + gap analysis = 75 cr per batch.
  // =========================================================================
  'schedule_generation': 300,     // 300 cr flat per schedule generation run — one action, one charge (session overhead folded in)
  'payroll_session_fee': 100,     // 100 cr flat per payroll run (was 35) — compliance, tax validation, anomaly detection
  'invoicing_session_fee': 75,    // 75 cr flat per invoice batch (was 25) — batch orchestration + gap analysis

  // =========================================================================
  // AI SCHEDULING — Per-unit event billing (value-based)
  // 1 credit = $0.01. Per-shift rate = $0.20 — fraction of $3-10 manual dispatch.
  // =========================================================================
  'ai_scheduling': 20,            // Per shift assigned by Trinity (was 10) — 20 cr/shift
  'ai_schedule_optimization': 12, // Per optimization invocation
  'ai_shift_matching': 12,        // Per shift match invocation
  'ai_open_shift_fill': 20,       // Per shift assigned via auto-staffing (was 10) — 20 cr/shift

  // =========================================================================
  // AI INVOICING — Per-occurrence event billing (value-based)
  // Each invoice generated is a distinct AI event billed separately from the
  // batch session fee. Previously charged 6 cr ($0.06) per full invoice workflow
  // — repriced to reflect AR admin labor replacement ($15-40/invoice manual).
  //
  // 50 cr/invoice = $0.50 — still 30-80× cheaper than a manual AR admin.
  // =========================================================================
  'ai_invoice_full_workflow': 60,  // Per invoice: full lifecycle generate → review → send (was 6 → 60 cr)
  'ai_invoice_generation': 50,     // Per invoice: standalone AI invoice generation (was 6 → 50 cr)
  'ai_invoice_review': 15,         // Per invoice: AI review/edit pass (was 3 → 15 cr)
  'invoice_gap_analysis': 10,      // Processing fee: unbilled revenue gap analysis (was 5 → 10 cr)
  'invoice_reconciliation_insights': 10, // AI-powered reconciliation insight analysis

  // =========================================================================
  // AI PAYROLL — Per-occurrence event billing (value-based)
  // Payroll bureaus charge $3-15 per employee per run. Our per-employee rate
  // of 8 cr ($0.08/employee) is 40-180× cheaper than a payroll bureau.
  //
  // per_payroll_employee fires ONCE PER EMPLOYEE per payroll run, on top of
  // the session fee. This creates proper metered billing matching payroll
  // bureau SaaS models (ADP, Gusto, Paychex) which charge per-employee.
  // =========================================================================
  'per_payroll_employee': 8,      // NEW — per-employee per payroll run (was MISSING — 0 cr)
  'ai_payroll_processing': 8,     // Processing fee per payroll processing invocation (was 5 → 8 cr)
  'ai_payroll_verification': 6,   // Processing fee per payroll verification invocation (was 4 → 6 cr)
  'payroll_anomaly_insights': 5,  // Processing fee per anomaly check invocation (was 3 → 5 cr)
  
  // HR Document Requests — mass onboarding + targeted doc sends
  // Charged per document type per employee recipient. Covers email delivery + tracking overhead.
  // Full onboarding packet (5 cr) is higher due to multi-step orchestration across all doc types.
  'hr_document_request': 2,       // Per specific document request sent (I9, W4, W9, drug, guard card) — 2 cr each
  'hr_onboarding_invite': 5,      // Per full onboarding packet invitation sent — 5 cr each

  // Sales & CRM AI - billed per AI operation
  'sales_lead_gen': 20,           // AI prospect discovery: generates 5 potential clients with pain points (high-value)
  'sales_email': 5,               // AI-personalized outreach email per recipient

  // AI Communications - Gemini 3 Flash (no thinking for speed)
  'ai_chat_query': 3,             // HelpAI or QueryOS chat message
  'ai_email_generation': 4,       // Generate email content
  
  // AI Analytics - Gemini 3 Pro with thinking (complex reasoning)
  'ai_analytics_report': 15,      // Generate analytics report (Pro)
  'ai_predictions': 12,           // Predictive analytics (Pro)
  
  // AI Migration - Gemini 3 Pro Vision (multimodal, expensive)
  'ai_migration': 25,             // Gemini Vision data extraction (Pro Vision)
  
  // Inbound Opportunity Agent - Gemini 3 Flash with thinking
  'ai_email_classification': 2,   // Classify if email is shift request (Flash)
  'ai_shift_extraction': 5,       // Extract shift details from email (Flash)
  'ai_inbound_shift_matching': 4, // Match and rank employees for shift (Flash) - inbound agent
  'ai_match_approval': 3,         // AI approval of employee-shift match (Flash)
  'ai_contractor_email': 4,       // Generate contractor confirmation email (Flash)
  
  // Email Intelligence Service - Billed to org (used for email analysis)
  'email_intelligence_analysis': 3,    // Email analysis and classification (Flash)
  'email_intelligence_compose': 4,     // Smart compose suggestions (Flash)
  'email_intelligence_summary': 5,     // Thread summarization (Flash)
  'email_intelligence_reply': 4,       // Reply suggestions (Flash)
  'email_intelligence_compliance': 3,  // Compliance check (Flash)
  
  // Automation & Orchestration - Billed to org
  'automation_summary': 2,             // Automation execution summary (Flash)
  'automation_remediation': 3,         // Remediation step generation (Flash)
  'onboarding_task_generation': 4,     // Onboarding task generation (Flash)
  
  // Data Migration - Billed to org (expensive operations)
  'data_migration_mapping': 5,         // Column mapping analysis (Flash)
  'data_migration_extraction': 8,      // Data extraction from documents (Flash)
  'data_migration_compliance': 5,      // Compliance validation (Flash)
  
  // Document Pipeline - AI understanding/extraction
  'ai_document_processing': 10,        // Document understanding/extraction (Pro)
  
  // ==========================================================================
  // TRINITY STAFFING - Premier Automated Scheduling
  // Full workflow from email → staffed shift in minutes
  // ==========================================================================
  'trinity_staffing_scan': 8,           // Per hour of active email scanning (Flash)
  'trinity_staffing_parse': 12,         // Parse work request email (Flash with thinking)
  'trinity_staffing_auto_assign': 10,   // Processing fee per auto-assignment invocation
  'trinity_staffing_confirmation': 6,   // Generate client confirmation email (Flash)
  'trinity_staffing_cancellation': 3,   // Process cancellation notification (Flash)
  'trinity_staffing_escalation': 2,     // Escalation notification (minimal AI)
  
  // QuickBooks Integration - Gemini 3 Flash with thinking
  'quickbooks_sync': 5,           // Per sync run (initial or CDC poll)
  'quickbooks_error_analysis': 5, // Error analysis and retry strategy (Flash)
  
  // Financial Intelligence - Gemini 3 Pro (complex P&L analysis)
  'financial_pl_summary': 12,           // P&L dashboard summary generation (Pro)
  'financial_insights': 15,              // AI-powered financial insights (Pro)
  'financial_client_profitability': 10,  // Per-client profitability analysis (Pro)
  'financial_trend_analysis': 8,         // Trend comparison and forecasting (Pro)
  
  // Scheduling Subagent — processing fees (token usage billed separately)
  'schedule_optimization': 5,     // Processing fee per optimization invocation
  'strategic_schedule_optimization': 8, // Processing fee: profit-first premium optimization
  
  // Domain Operations - Gemini 3 Flash
  'log_analysis': 3,              // Log analysis (Flash)
  
  // RFP & Ethics - High-value document generation
  // Elite monetization is the per-proposal USD surcharge on trinity_rfp_generation
  // (see shared/config/premiumFeatures.ts eliteSurchargeCents). This credit value
  // covers only the raw Claude/Gemini token cost of the research → draft → validate
  // → refine pipeline so the elite USD surcharge is net value, not tokens.
  'rfp_proposal_generation': 10,  // token-cost only (was 30 pre-Apr-2026)
  'ethics_triage': 5,             // Ethics triage classification (Flash)

  // RMS & DAR - Field Operations AI
  'rms_narrative_polish': 5,      // RMS narrative polishing (Flash)
  'dar_ai_summary': 5,            // DAR AI summary generation (Flash)
  
  // AI Search - Low cost, high frequency
  'ai_search_query_optimization': 2, // Query optimization (Flash)
  'ai_search_summary': 2,         // Search result summary (Flash)
  
  // Platform Operations - System-level AI
  'platform_change_summary': 3,   // Platform change notification summary (Flash)
  'ai_notification': 2,           // AI notification generation (Flash)
  'ai_visual_qa': 5,              // Visual QA page scan (Pro Vision)
  
  // Financial Intelligence
  'pnl_analysis': 10,             // P&L analysis (Pro)
  'business_health_scan': 15,     // Business health scan (Pro)
  'compliance_audit': 8,          // Compliance audit check (Pro)
  'payroll_validation_insights': 3, // Payroll validation AI insights (Flash)
  
  // Automation Engine
  'automation_step_execution': 3, // Automation step execution (Flash)
  
  // Subagent Analysis (token usage billed separately on top)
  'invoice_subagent_analysis': 5, // Invoice subagent AI analysis (Flash)
  'payroll_subagent_analysis': 5, // Payroll subagent AI analysis (Flash)
  'scheduling_subagent_analysis': 5, // Scheduling subagent AI analysis (Flash)
  
  // Email AI
  'email_ai_summarization': 3,    // Email AI summarization (Flash)
  'ai_email_summarization': 3,    // Email summarization alt key (Flash)
  
  // Trinity Staffing - alt key
  'trinity_staffing': 10,         // Trinity staffing general (Flash)

  // General AI - Gemini 3 Flash
  'ai_general': 3,                // Generic AI operation (Flash)
  
  // Trinity Conversations - Low cost metered to org (platform absorbs NO costs)
  // Minimal credits so users barely notice but platform doesn't absorb AI costs
  'trinity_thought': 1,           // Trinity thought bubbles (Flash, minimal tokens)
  'trinity_chat': 2,              // Trinity conversations (Flash)
  'trinity_insight': 1,           // Trinity insights (Flash, minimal tokens)
  'trinity_ai_reasoning': 2,     // Trinity AI analytics decisions (Flash)
  'ai_trinity_orchestrator': 3,  // Trinity orchestrator meta-tasks (Flash)
  'ai_trinity_agent': 2,         // Trinity agent sub-tasks (Flash)
  'mascot_ask': 1,                // Mascot ask endpoint (Flash)
  'mascot_advice': 2,             // Mascot business advice (Flash)
  'mascot_insight': 1,            // Mascot insights (Flash)
  'mascot_business_advisor': 2,   // Mascot business advisor deep analysis (Flash)
  'mascot_personalized_greeting': 1, // Mascot personalized greeting (Flash)
  'mascot_org_insights': 2,       // Mascot organizational insights (Flash)
  'mascot_interaction': 1,        // Mascot general interaction (Flash)
  'mascot_chat_observe': 1,       // Mascot chat observation (Flash)
  'mascot_generate_tasks': 2,     // Mascot task generation (Flash)
  'helpai_chat': 2,               // HelpAI conversations (Flash)
  
  // ==========================================================================
  // TAX & COMPLIANCE SERVICES - Middleware Service Fees
  // These are billed as middleware prep fees when orgs generate tax forms
  // Pricing reflects value: CPA charges $200-500 per filing, we charge ~$25-50
  // ==========================================================================
  'tax_prep_941': 2500,           // $25 - Form 941 quarterly prep (aggregation + PDF)
  'tax_prep_940': 3500,           // $35 - Form 940 annual FUTA prep (complex annual calc)
  'tax_prep_w2': 500,             // $5 per W-2 generated (per employee)
  'tax_prep_1099': 500,           // $5 per 1099-NEC generated (per contractor)
  'tax_filing_assistance': 1000,  // $10 - Filing guidance and portal links per filing

  // Support Pool Features - Billed to org's monthly support allocation
  // Every org pays a base support fee that covers shared support infrastructure
  'support_pool_chat': 1,         // Support chat (billed from org support pool)
  'support_pool_ticket': 2,       // Support ticket AI (billed from org support pool)
  
  // ==========================================================================
  // CLAUDE / ANTHROPIC OPERATIONS (Premium AI - Higher cost due to API pricing)
  // Claude Sonnet: $3/1M input, $15/1M output tokens
  // Average request: ~2K input + ~4K output = $0.006 + $0.06 = $0.066
  // With 4x margin = $0.26 → 25-35 credits depending on complexity
  // ==========================================================================
  'claude_analysis': 25,          // Standard Claude analysis (Sonnet)
  'claude_strategic': 30,         // Strategic/complex reasoning (Sonnet)
  'claude_executive': 35,         // Executive summaries, board reports (Sonnet)
  'claude_premium_ai': 25,        // Generic Claude Premium AI feature
  'claude_rfp_response': 35,      // RFP response generation (high-value)
  'claude_capability_statement': 30, // Capability statement generation
  'claude_contract_review': 30,   // Contract review and analysis
  'claude_proposal': 30,          // Sales proposal generation
  
  // ==========================================================================
  // BOT AI OPERATIONS - Pool Fund Model (Workspace-funded)
  // All bot AI costs are billed to the workspace, not the platform
  // This ensures clients fund their end-user support
  // ==========================================================================
  
  // HelpAI Bot - Support chat and FAQ
  'bot_helpai_greeting': 1,       // Welcome message generation
  'bot_helpai_response': 2,       // Chat response generation
  'bot_helpai_faq': 1,            // FAQ lookup response
  'bot_helpai_escalation': 1,     // Escalation detection
  
  // MeetingBot - Meeting transcription and summarization
  'bot_meeting_transcription': 5, // Full meeting transcription
  'bot_meeting_summary': 4,       // Meeting summary generation
  'bot_meeting_action_items': 2,  // Action item extraction
  'bot_meeting_decisions': 2,     // Decision extraction
  
  // ReportBot - Incident report processing
  'bot_report_detection': 1,      // Detect if message is incident report
  'bot_report_cleanup': 3,        // Clean up unprofessional language
  'bot_report_summary': 4,        // Generate professional report
  'bot_report_routing': 1,        // Route report to correct team

  // Analytics & Report Generation - AI-powered executive summaries
  'report_summary': 15,           // AI executive summary for analytics report (GPT-4o-mini, premium)
  'report_auto_gen': 4,           // Auto-generated weekly status report (GPT-4o-mini, simple)
  
  // ClockBot - Time tracking assistance
  'bot_clock_validation': 1,      // Validate clock entry
  'bot_clock_summary': 2,         // Summarize clock entries
  'bot_clock_anomaly': 2,         // Detect clock anomalies
  
  // CleanupBot - Document retention
  'bot_cleanup_retention': 1,     // Apply retention policy
  'bot_cleanup_archive': 2,       // Archive document summary
  
  // Dynamic message generation - Minimal cost billed to org (platform absorbs NOTHING)
  'dynamic_message_generation': 1, // Dynamic bot messages (Flash, minimal)
  'dynamic_motd': 1,              // Dynamic MOTD (Flash, minimal)
  'helpai_dynamic_response': 1,   // HelpAI chit-chat (Flash, minimal)
  
  // ==========================================================================
  // PLATFORM SERVICE COSTS - Fortune 500 Cost Recovery Model
  // All platform infrastructure costs are passed through to workspaces with margin
  // This ensures the platform NEVER absorbs costs - clients fund everything they use
  // 
  // Pricing Model: Actual vendor cost × 3x margin = credits charged
  // 1 credit = $0.01 | All costs rounded up to nearest credit
  // 
  // RESEND EMAIL PRICING (Jan 2026):
  //   - $0.001 per email (first 100/day free, then $0.0025/email)
  //   - Domain: $0/month (included with account)
  //   - With 3x margin: ~1-3 credits per email
  // 
  // GOOGLE WORKSPACE PRICING (Jan 2026):
  //   - Business Starter: $6/user/month
  //   - Amortized per org: $3/org/month = 300 credits/month
  // 
  // TWILIO SMS PRICING (Jan 2026):
  //   - Outbound: $0.0079/segment
  //   - Inbound: $0.0075/segment
  //   - With 3x margin: ~3 credits per SMS
  // 
  // DOMAIN COSTS (Annual amortized monthly):
  //   - .com domain: ~$15/year = $1.25/month = 125 credits/month
  //   - Distributed across active orgs proportionally
  // ==========================================================================
  
  // Email Service Costs (Resend) - Per email with 3x margin
  'email_transactional': 1,          // Standard transactional email ($0.001 × 3 = ~1 credit)
  'email_marketing': 2,              // Marketing/bulk email ($0.0025 × 3 = ~2 credits)
  'email_inbound_processing': 3,     // Inbound email + AI processing ($0.001 + AI = ~3 credits)
  'email_with_attachment': 2,        // Email with attachments (larger payload)
  'email_staffing_confirmation': 2,  // Client confirmation emails (premium routing)
  'email_employee_notification': 1,  // Employee notifications
  'email_payroll_notification': 1,   // Payroll/paystub emails
  'email_invoice': 2,                // Invoice delivery emails
  'email_digest': 1,                 // Daily/weekly digest emails
  
  // SMS Service Costs (Twilio) - Per segment with 3x margin
  'sms_notification': 3,             // Standard SMS notification ($0.0079 × 3 = ~3 credits)
  'sms_shift_reminder': 3,           // Shift reminder SMS
  'sms_clock_reminder': 3,           // Clock-in/out reminder
  'sms_verification': 3,             // Verification code SMS
  'sms_escalation': 3,               // Escalation alert SMS
  'sms_inbound': 2,                  // Inbound SMS processing ($0.0075 × 3 = ~2 credits)
  
  // Platform Infrastructure Costs (Monthly amortized)
  // These are charged once per month per workspace as platform fees
  'platform_domain_fee': 25,         // Monthly domain cost share ($0.25/month per org)
  'platform_email_domain': 50,       // Monthly email domain fee ($0.50/month per org)
  'platform_google_workspace': 100,  // Google Workspace share ($1.00/month per org)
  'platform_infrastructure': 200,    // Infrastructure overhead ($2.00/month per org)

  // Premium Feature Gating - Generic keys for premium features routed through creditManager
  'premium_feature': 5,              // Generic premium feature (amountOverride used for actual cost)
  'trinity_meeting_recording': 5,    // Meeting recording per minute
  'trinity_staffing_request_parse': 8,  // Parse staffing request
  
  // Partner API & Usage Metering - Unified keys for legacy creditLedger callers
  'partner_api_call': 3,             // Generic partner API call (amountOverride used)
  'usage_metering': 2,              // Usage metering charge (amountOverride used)
  
  // FAQ & Helpdesk AI - Billed to Platform Support Pool (not individual orgs)
  'faq_search': 2,                   // FAQ search with AI (Flash)
  'faq_embedding': 1,                // FAQ embedding generation (minimal)
  'faq_chat': 2,                     // FAQ conversational AI (Flash)
  'support_broadcast_analysis': 2,   // Broadcast feedback analysis (Flash)
  
  // Guard Tour & Operations
  'guard_tour_scan': 1,              // Per checkpoint scan (GPS/QR/NFC)
  'equipment_checkout': 1,           // Per equipment checkout
  'equipment_return': 1,             // Per equipment return
  'equipment_maintenance': 1,        // Per maintenance log entry
  'post_order_creation': 1,          // Per post order created (overage)
  'document_signing_send': 3,        // Per document sent for signature
  'document_signing_verify': 1,      // Per signature verification
  
  // Employee Intelligence - PER-SEAT BILLING (Feb 2026 Update)
  'employee_behavior_scoring': 2,    // 2 credits per employee scored (per-seat billing)
  'employee_performance_report': 2,  // 2 credits per employee report (per-seat billing)
  
  // Bot Ecosystem (generic key)
  'bot_interaction': 2,              // Per generic bot interaction

  // Advanced Analytics & Reporting
  'advanced_analytics': 15,          // Per analytics report (Pro - complex analysis)
  'incident_management': 2,          // Per incident report (overage)
  'client_billing': 3,               // Per billing cycle (overage)
  
  // Push Notifications
  'push_notification': 1,            // Per notification (overage beyond tier cap)
  
  // Core Features - Overage Credits (deducted after tier cap hit)
  'basic_scheduling': 1,             // Per shift created (overage)
  'basic_time_tracking': 1,          // Per clock-in/out (overage)
  'employee_onboarding': 2,          // Per onboarding workflow (overage)
  'shift_marketplace': 1,            // Per marketplace posting (overage)
  'shift_swapping': 1,               // Per swap request (overage)
  'helpdesk_support': 1,             // Per support ticket (overage)
  'chatrooms': 1,                    // Per chatroom created (overage)
  'client_portal': 2,                // Per client portal access (overage)
  'client_portal_helpai_session': 10, // Per client DockChat session (AI sentiment + summary)

  // Elite Features - Overage Credits
  'security_compliance_vault': 3,    // Per vault operation (overage)
  'trinity_staffing_request': 5,     // Per individual staffing request (overage)
  'multi_state_compliance': 2,       // Per additional state (overage)
} as const;

// CREDIT_EXEMPT_FEATURES is defined once above (line ~113) — not re-exported here

// ============================================================================
// PLATFORM SUPPORT POOL - Shared credit pool for helpdesk/support AI operations
// ============================================================================
// All helpdesk, helpbot, FAQ AI, and support staff AI costs are paid from a
// shared pool funded by ALL organizations. This ensures:
// 1. No single org feels individual responsibility for help they receive
// 2. Platform doesn't absorb support AI costs
// 3. Support quality is consistent regardless of org tier
//
// Pool funding: Each org contributes a small allocation from their subscription
// Pool usage: Support bots, FAQ AI, helpdesk AI, support staff AI all draw from this
// ============================================================================

const SUPPORT_POOL_MONTHLY_ALLOCATION = (BILLING as any).supportPoolMonthlyCredits;

const SUPPORT_POOL_CONTRIBUTION_PER_TIER: Record<string, number> = {
  'free': 5,
  'trial': 5,
  'starter': 25,
  'professional': 75,
  'enterprise': 200,
  'unlimited': 200,
};

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
  
  // Claude Premium
  'claude_analysis': 'Premium Analysis',
  'claude_strategic': 'Strategic Planning',
  'claude_executive': 'Executive Summary',
  'rfp_proposal_generation': 'RFP Proposal Draft',
  'claude_rfp_response': 'RFP Response',
  'claude_capability_statement': 'Capability Statement',
  'claude_contract_review': 'Contract Review',
  'claude_proposal': 'Proposal Generation',
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
  
  // Fallback pattern
  'ai_general': 'AI Operation',
};


// ---------------------------------------------------------------------------
// Tier cap policy
// ---------------------------------------------------------------------------
const HARD_CAP_TIERS = new Set(['free', 'trial', 'starter']);

// ---------------------------------------------------------------------------
// CreditManager — live implementations backed by aiUsageEvents
// (workspace_credits / credit_transactions / credit_packs tables dropped)
// ---------------------------------------------------------------------------
export class CreditManager {

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

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
      const allocation = TIER_CREDIT_ALLOCATIONS[tier as keyof typeof TIER_CREDIT_ALLOCATIONS] ?? 100;
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

  private buildAccount(workspaceId: string, allocation: number, used: number): WorkspaceCredits {
    const now = new Date();
    const periodStart = this.getPeriodStart();
    const nextReset = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 1);
    const balance = allocation - used;
    const overageCredits = Math.max(0, -balance);
    return {
      id: workspaceId,
      workspaceId,
      currentBalance: balance,
      monthlyAllocation: allocation,
      lastResetAt: periodStart,
      nextResetAt: nextReset,
      totalCreditsEarned: allocation,
      totalCreditsSpent: used,
      totalCreditsPurchased: 0,
      purchasedCreditsBalance: 0,
      rolloverEnabled: false,
      rolloverBalance: 0,
      maxRolloverCredits: 0,
      autoRechargeEnabled: false,
      autoRechargeThreshold: null,
      autoRechargeAmount: null,
      autoRechargeCreditPackId: null,
      lastAutoRechargeAt: null,
      lowBalanceAlertEnabled: true,
      lowBalanceAlertThreshold: Math.floor(allocation * 0.1),
      lastLowBalanceAlertAt: null,
      inOverageMode: used > allocation,
      overageAccumulatorCredits: overageCredits,
      overageAccumulatorDollars: (overageCredits * 0.01).toFixed(2),
      lastOverageNotificationAt: null,
      overageBilledAt: null,
      overageBilledCredits: 0,
      isActive: true,
      isSuspended: false,
      suspendedReason: null,
      suspendedAt: null,
      createdAt: periodStart,
      updatedAt: now,
    };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async initializeCredits(workspaceId: string, subscriptionTier: string = 'free'): Promise<WorkspaceCredits> {
    const tier = subscriptionTier.toLowerCase();
    const allocation = TIER_CREDIT_ALLOCATIONS[tier as keyof typeof TIER_CREDIT_ALLOCATIONS] ?? 100;
    const used = await this.getPeriodUsage(workspaceId, this.getPeriodStart());
    return this.buildAccount(workspaceId, allocation, used);
  }

  async getCreditsAccount(workspaceId: string): Promise<WorkspaceCredits | null> {
    try {
      const { allocation } = await this.getTierAllocation(workspaceId);
      const used = await this.getPeriodUsage(workspaceId, this.getPeriodStart());
      return this.buildAccount(workspaceId, allocation, used);
    } catch (err) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      log.error({ workspaceId, err }, 'creditManager.getCreditsAccount failed');
      return null;
    }
  }

  async getBalance(workspaceId: string): Promise<number> {
    const account = await this.getCreditsAccount(workspaceId);
    return account?.currentBalance ?? UNLIMITED_BALANCE;
  }

  async checkCredits(workspaceId: string, featureKey: string, _userId?: string, quantity: number = 1): Promise<CreditCheckResult> {
    const cost = ((CREDIT_COSTS as Record<string, number>)[featureKey] ?? 0) * quantity;
    if (CREDIT_EXEMPT_FEATURES.has(featureKey)) {
      return { hasEnoughCredits: true, currentBalance: UNLIMITED_BALANCE, required: 0, shortfall: 0, unlimitedCredits: true };
    }
    try {
      const { tier, allocation } = await this.getTierAllocation(workspaceId);
      const used = await this.getPeriodUsage(workspaceId, this.getPeriodStart());
      const balance = allocation - used;

      // OMEGA-L2: LOW CREDIT (<10%) NDS ALERT — fire async, non-blocking.
      // Fires once when balance drops into the warning zone so org owners can
      // act before hitting 0 and triggering the degraded-mode brain block.
      if (HARD_CAP_TIERS.has(tier) && allocation > 0) {
        const threshold = Math.floor(allocation * 0.1);
        if (balance <= threshold && balance > 0) {
          scheduleNonBlocking('credit.low-balance-alert', async () => {
            const { onLowBalance } = await import('../billing/upsellService');
            await onLowBalance(workspaceId, balance, allocation);
          });
        }
      }

      if (HARD_CAP_TIERS.has(tier) && balance < cost) {
        return { hasEnoughCredits: false, currentBalance: Math.max(0, balance), required: cost, shortfall: Math.max(0, cost - balance) };
      }
      return { hasEnoughCredits: true, currentBalance: balance, required: cost, shortfall: 0 };
    } catch {
      return { hasEnoughCredits: true, currentBalance: UNLIMITED_BALANCE, required: cost, shortfall: 0 };
    }
  }

  async deductCredits(params: { workspaceId: string; featureKey: string; quantity?: number; userId?: string; description?: string; metadata?: Record<string, unknown> }): Promise<CreditDeductionResult> {
    const { workspaceId, featureKey, quantity = 1, userId, description, metadata } = params;
    const cost = ((CREDIT_COSTS as Record<string, number>)[featureKey] ?? 0) * quantity;
    if (cost <= 0 || CREDIT_EXEMPT_FEATURES.has(featureKey)) {
      return { success: true, transactionId: null, newBalance: UNLIMITED_BALANCE };
    }
    try {
      const id = crypto.randomUUID();
      await db.insert(aiUsageEvents).values({
        id,
        workspaceId,
        userId: userId || undefined,
        featureKey,
        usageType: 'credit_deduction',
        usageAmount: String(cost),
        usageUnit: 'credits',
        activityType: featureKey,
        creditsDeducted: cost,
        metadata: description ? { description, ...(metadata || {}) } : metadata,
      });
      const { allocation } = await this.getTierAllocation(workspaceId);
      const used = await this.getPeriodUsage(workspaceId, this.getPeriodStart());
      return { success: true, transactionId: id, newBalance: allocation - used };
    } catch (err) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      log.error({ workspaceId, featureKey, err }, 'creditManager.deductCredits failed');
      return { success: false, transactionId: null, newBalance: 0, errorMessage: String(err) };
    }
  }

  async addCredits(_params: { workspaceId: string; amount: number; transactionType?: string; description?: string }): Promise<CreditDeductionResult> {
    // Flat seat-fee model: credits are tier-allocated, not purchased individually
    return { success: true, transactionId: null, newBalance: UNLIMITED_BALANCE };
  }

  async addPurchasedCredits(params: { workspaceId: string; amount: number; creditPackId?: string; stripePaymentIntentId?: string; amountPaid?: number }): Promise<CreditDeductionResult> {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    log.info({ workspaceId: params.workspaceId, amount: params.amount }, 'creditManager.addPurchasedCredits no-op');
    return { success: true, transactionId: null, newBalance: UNLIMITED_BALANCE };
  }

  async refundCredits(params: { workspaceId: string; amount: number; description?: string }): Promise<CreditDeductionResult> {
    return { success: true, transactionId: null, newBalance: UNLIMITED_BALANCE };
  }

  async updateTierAllocation(workspaceId: string, _newTier: string, _tx?: unknown): Promise<void> {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    log.info({ workspaceId }, 'creditManager.updateTierAllocation no-op');
  }

  async downgradeCreditsOnCancellation(workspaceId: string, _tx?: unknown): Promise<void> {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    log.info({ workspaceId }, 'creditManager.downgradeCreditsOnCancellation no-op');
  }

  async getTransactionHistory(workspaceId: string, limit: number = 50, _offset: number = 0): Promise<CreditTransaction[]> {
    try {
      const rows = await db.select()
        .from(aiUsageEvents)
        .where(eq(aiUsageEvents.workspaceId, workspaceId))
        .orderBy(desc(aiUsageEvents.createdAt))
        .limit(Math.min(limit, 200));
      return rows.map(r => ({
        id: r.id,
        workspaceId: r.workspaceId,
        transactionType: 'deduction' as const,
        amount: -(r.creditsDeducted ?? 0),
        balanceAfter: 0,
        featureKey: r.featureKey,
        featureName: r.activityType || r.featureKey,
        description: (r as any).metadata?.description || '',
        actorType: 'AI' as const,
        createdAt: r.createdAt,
      }));
    } catch {
      return [];
    }
  }

  async getMonthlyUsageBreakdown(workspaceId: string): Promise<Array<{ featureKey: string; totalCredits: number; requestCount: number }>> {
    try {
      const periodStart = this.getPeriodStart();
      const rows = await db.select({
        featureKey: aiUsageEvents.featureKey,
        totalCredits: sql<number>`COALESCE(SUM(${aiUsageEvents.creditsDeducted}), 0)::int`,
        requestCount: sql<number>`COUNT(*)::int`,
      })
        .from(aiUsageEvents)
        .where(and(
          eq(aiUsageEvents.workspaceId, workspaceId),
          gte(aiUsageEvents.createdAt, periodStart),
        ))
        .groupBy(aiUsageEvents.featureKey);
      return rows.map(r => ({ featureKey: r.featureKey, totalCredits: Number(r.totalCredits), requestCount: Number(r.requestCount) }));
    } catch {
      return [];
    }
  }

  async getSupportPoolBalance(): Promise<number> {
    return UNLIMITED_BALANCE;
  }

  async contributeSupportPool(_params: { workspaceId: string; amount: number }): Promise<void> {}

  async deductFromSupportPool(_params: { featureKey: string; amount: number }): Promise<CreditDeductionResult> {
    return { success: true, transactionId: null, newBalance: UNLIMITED_BALANCE };
  }

  async resetSupportPool(): Promise<void> {
    log.info('creditManager.resetSupportPool no-op');
  }

  async handleMonthlyReset(_workspaceId: string): Promise<void> {}

  async enableAutoRecharge(_workspaceId: string, _config: unknown): Promise<void> {}

  async disableAutoRecharge(_workspaceId: string): Promise<void> {}

  async triggerAutoRecharge(_workspaceId: string): Promise<CreditDeductionResult> {
    return { success: true, transactionId: null, newBalance: UNLIMITED_BALANCE };
  }

  async suspendCredits(_workspaceId: string, _reason: string): Promise<void> {}
  async unsuspendCredits(_workspaceId: string): Promise<void> {}

  async getOverageReport(workspaceId: string): Promise<{ overageCredits: number; overageDollars: number }> {
    try {
      const { allocation } = await this.getTierAllocation(workspaceId);
      const used = await this.getPeriodUsage(workspaceId, this.getPeriodStart());
      const overageCredits = Math.max(0, used - allocation);
      return { overageCredits, overageDollars: +(overageCredits * 0.01).toFixed(2) };
    } catch {
      return { overageCredits: 0, overageDollars: 0 };
    }
  }

  async clearOverage(_workspaceId: string): Promise<void> {}

  async repairNextResetAt(_workspaceId: string, _nextResetAt: Date): Promise<void> {}
}

export const creditManager = new CreditManager();
