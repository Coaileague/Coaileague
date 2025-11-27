/**
 * Client Onboarding Configuration
 * Integrated with platformConfig - zero hardcoding
 */

import { PLATFORM, ROLES, PERMISSIONS } from "./platformConfig";

export const ONBOARDING_PIPELINE = {
  stages: [
    {
      id: "prospect_contact",
      name: "Initial Contact",
      description: "Send outreach email",
      duration: "5 minutes",
      email_template: "prospectOutreach" as const,
    },
    {
      id: "demo_scheduled",
      name: "Demo Scheduled",
      description: "Send demo link and preparation materials",
      duration: "1 day",
      email_template: "demoScheduled" as const,
    },
    {
      id: "rfp_response",
      name: "RFP Response",
      description: "Send proposal document",
      duration: "3 days",
      email_template: "rfpResponse" as const,
      requiresApproval: true,
    },
    {
      id: "contract_negotiation",
      name: "Contract Negotiation",
      description: "Exchange and finalize service agreement",
      duration: "5-7 days",
      email_template: "contractReview" as const,
      requiresSignature: true,
    },
    {
      id: "contract_signed",
      name: "Contract Signed",
      description: "Payment processed, workspace created",
      duration: "1 day",
      automatedActions: ["create_workspace", "provision_features", "setup_integrations"],
    },
    {
      id: "onboarding_day1",
      name: "First Day Onboarding",
      description: "Send welcome email with setup checklist",
      duration: "real-time",
      email_template: "onboardingDay1" as const,
      automatedActions: ["send_welcome_kit", "schedule_kickoff_call"],
    },
  ],

  agreement_templates: [
    {
      id: "starter",
      name: "Startup Agreement",
      description: "For companies <50 employees",
      duration_months: 12,
      price_monthly: "$0",
      features: ["100 employees", "Basic AI scheduling", "Standard support"],
    },
    {
      id: "growth",
      name: "Growth Agreement",
      description: "For companies 50-500 employees",
      duration_months: 24,
      price_monthly: "$2,999",
      features: ["Unlimited employees", "Advanced AI features", "Priority support", "Compliance monitoring"],
    },
    {
      id: "enterprise",
      name: "Enterprise Agreement",
      description: "For companies 500+ employees",
      duration_months: 36,
      price_monthly: "Custom",
      features: ["Unlimited everything", "Dedicated account manager", "White-label option", "24/7 support"],
      requiresSignature: true,
    },
  ],

  client_roles: [
    { role: ROLES.WORKSPACE_OWNER, permissions: Object.values(PERMISSIONS) },
    { role: "admin", permissions: [PERMISSIONS.MANAGE_WORKSPACE, PERMISSIONS.MANAGE_USERS] },
    { role: "manager", permissions: [PERMISSIONS.VIEW_EMPLOYEES, PERMISSIONS.MANAGE_SCHEDULES] },
    { role: "employee", permissions: [PERMISSIONS.VIEW_SCHEDULES, PERMISSIONS.VIEW_TIMESHEETS] },
  ],

  onboarding_tasks: [
    { order: 1, title: "Invite Team Members", link: "/onboarding/team", duration: "10 min" },
    { order: 2, title: "Connect Integrations", link: "/onboarding/integrations", duration: "15 min" },
    { order: 3, title: "Create First Schedule", link: "/onboarding/schedule", duration: "20 min" },
    { order: 4, title: "Set Up AI Automation", link: "/onboarding/ai", duration: "10 min" },
    { order: 5, title: "Enable Compliance Monitoring", link: "/onboarding/compliance", duration: "5 min" },
  ],
} as const;

export const CONTRACT_STATUSES = {
  DRAFT: "draft",
  SENT_FOR_REVIEW: "sent_for_review",
  NEGOTIATION: "negotiation",
  READY_TO_SIGN: "ready_to_sign",
  SIGNED: "signed",
  ACTIVE: "active",
  EXPIRED: "expired",
} as const;

export function getOnboardingStageEmail(stageId: string): string {
  const stage = ONBOARDING_PIPELINE.stages.find((s) => s.id === stageId);
  return (stage as any)?.email_template || "prospectOutreach";
}

export function getContractTemplate(tier: string) {
  return ONBOARDING_PIPELINE.agreement_templates.find((t) => t.id === tier);
}
