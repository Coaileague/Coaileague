/**
 * Sales & Marketing Pipeline Configuration
 * For organizations to track their sales + root to attract new orgs
 */

export const SALES_STAGES = {
  PROSPECT: "prospect",
  QUALIFIED: "qualified",
  DEMO_SCHEDULED: "demo_scheduled",
  PROPOSAL: "proposal",
  NEGOTIATION: "negotiation",
  CLOSED_WON: "closed_won",
  CLOSED_LOST: "closed_lost",
} as const;

export const DEAL_PIPELINE = [
  { id: "prospect", name: "Prospect", order: 1, color: "gray" },
  { id: "qualified", name: "Qualified Lead", order: 2, color: "blue" },
  { id: "demo_scheduled", name: "Demo Scheduled", order: 3, color: "cyan" },
  { id: "proposal", name: "Proposal Sent", order: 4, color: "green" },
  { id: "negotiation", name: "Negotiating", order: 5, color: "yellow" },
  { id: "closed_won", name: "Closed Won", order: 6, color: "emerald" },
  { id: "closed_lost", name: "Closed Lost", order: 7, color: "red" },
];

export const DEAL_SIZE_CATEGORIES = {
  SMALL: { min: 0, max: 5000, label: "$0 - $5K", tier: "starter" },
  MEDIUM: { min: 5000, max: 25000, label: "$5K - $25K", tier: "growth" },
  LARGE: { min: 25000, max: 100000, label: "$25K - $100K", tier: "enterprise" },
  ENTERPRISE: { min: 100000, max: Infinity, label: "$100K+", tier: "enterprise" },
} as const;

export const SALES_METRICS = {
  CONVERSION_RATE: "conversion_rate",
  AVG_DEAL_SIZE: "avg_deal_size",
  SALES_CYCLE_DAYS: "sales_cycle_days",
  REVENUE_WON: "revenue_won",
} as const;

export const MARKETING_CAMPAIGNS_ROOT = [
  {
    id: "platform_awareness",
    name: "Platform Awareness",
    description: "Attract new organizations to CoAIleague",
    type: "inbound",
  },
  {
    id: "case_study",
    name: "Case Studies",
    description: "Showcase successful implementations",
    type: "content",
  },
  {
    id: "partner_referral",
    name: "Partner Referral Program",
    description: "Generate leads through partnerships",
    type: "partnership",
  },
  {
    id: "webinar_series",
    name: "Webinar Series",
    description: "Educational webinars for C-suite executives",
    type: "webinar",
  },
];

export const ORG_SALES_ACTIVITIES = [
  { id: "email", name: "Email Outreach", icon: "Mail" },
  { id: "call", name: "Sales Call", icon: "Phone" },
  { id: "meeting", name: "In-Person Meeting", icon: "Users" },
  { id: "proposal", name: "Send Proposal", icon: "FileText" },
  { id: "demo", name: "Product Demo", icon: "Monitor" },
  { id: "negotiation", name: "Negotiate Terms", icon: "Handshake" },
];
