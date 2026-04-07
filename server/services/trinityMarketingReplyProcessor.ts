import { createLogger } from '../lib/logger';

const log = createLogger('TrinityMarketingReplyProcessor');

/**
 * TrinityMarketingReplyProcessor
 *
 * Handles all inbound replies to trinity@coaileague.com ONLY.
 * trinity@ is reserved for platform outbound prospecting (regulatory agencies,
 * prospective tenants). This processor classifies replies into two lanes:
 *   REGULATORY — government/agency senders or compliance-related keywords
 *   PROSPECT   — company operators interested in trialing CoAIleague
 *
 * Must NEVER be invoked for tenant slug addresses (e.g. staffing@acme.coaileague.com).
 * Human/platform support uses support@coaileague.com instead.
 */

export interface TrinityInboundPayload {
  from: string;
  fromName?: string;
  subject: string;
  body: string;
}

type ReplyLane = 'REGULATORY' | 'PROSPECT' | 'UNCLASSIFIED';

const REGULATORY_DOMAINS = [
  '.gov', '.mil', '.state.tx.us', '.state.ca.us', '.state.fl.us',
  '.state.ny.us', '.state.ga.us', '.state.az.us', '.state.co.us',
  '.state.il.us', '.state.nc.us', '.state.va.us', '.state.wa.us',
  '.state.nv.us', '.dps.texas.gov', '.psb.texas.gov',
];

const REGULATORY_KEYWORDS = [
  'audit', 'inspection', 'license', 'licensing board', 'psb',
  'regulatory', 'compliance review', 'investigation', 'enforcement',
  'department of public safety', 'dps', 'commission', 'board of',
  'public safety', 'bureau of', 'division of',
];

const PROSPECT_KEYWORDS = [
  'pricing', 'demo', 'trial', 'interested', 'sign up', 'how much',
  'features', 'what does it cost', 'security company', 'my company',
  'our guards', 'our operation', 'our officers', 'start a trial',
  'learn more', 'schedule a call', 'get started',
];

import { PLATFORM } from '../config/platformConfig';

function classifyLane(payload: TrinityInboundPayload): ReplyLane {
  const fromDomain = payload.from.toLowerCase().split('@')[1] || '';
  const bodyLower = (payload.body || '').toLowerCase();
  const subjectLower = (payload.subject || '').toLowerCase();

  const isRegulatoryDomain = REGULATORY_DOMAINS.some(d => fromDomain.endsWith(d));
  const hasRegulatoryKeyword = REGULATORY_KEYWORDS.some(kw => bodyLower.includes(kw));

  if (isRegulatoryDomain || hasRegulatoryKeyword) {
    return 'REGULATORY';
  }

  const hasProspectKeyword = PROSPECT_KEYWORDS.some(kw => bodyLower.includes(kw));
  const isReSubject = subjectLower.includes(`re: ${PLATFORM.name.toLowerCase()}`) || subjectLower.includes('re: trinity');
  const isCompanyDomain = fromDomain.length > 0 && !fromDomain.endsWith('.gov') && !fromDomain.endsWith('.mil');

  if (hasProspectKeyword || isReSubject || isCompanyDomain) {
    return 'PROSPECT';
  }

  return 'UNCLASSIFIED';
}

function buildRegulatoryResponse(payload: TrinityInboundPayload): string {
  return `Thank you for reaching out.

The compliance landscape for private security operations is fragmented — inconsistent record-keeping, paper logs, and reactive reporting are standard. ${PLATFORM.name} was built specifically to change that.

When a security company runs on ${PLATFORM.name}, the records your agency needs for an audit or inspection already exist by default:

- Shift Logs: Every shift posted, assigned, started, and completed — with officer IDs and timestamps
- Incident Reports: Field-submitted, officer-attributed, timestamped, and immediately exportable
- License Tracking: Guard cards, firearms permits, and expiration alerts — tracked per officer
- Payroll Records: Hours, rates, pay periods, and direct deposit audit trail
- Client Contracts: Active site assignments with scope and authorization on record
- Call-Off Log: Every absence with officer ID, reason, and coverage resolution

When a security company uses ${PLATFORM.name}, everything you need for an audit or inspection already exists in a single exportable record. No chasing paper. No reconstructed logs.

For a full overview of our compliance infrastructure and to discuss a data standard partnership, visit:
https://${PLATFORM.domain}/regulatory

That page includes a direct contact form routed to our platform leadership team.

—
Trinity
Platform AI — ${PLATFORM.name}`;
}

function buildProspectResponse(payload: TrinityInboundPayload): string {
  return `Thanks for reaching out — you're in the right place.

${PLATFORM.name} is a workforce management platform built specifically for security companies. Trinity is the AI that runs it — handling scheduling, call-offs, incident reports, client communications, payroll, and compliance records autonomously.

Here's what your operation looks like when Trinity is your AI operator:
- Your officers text or email in a call-off — Trinity logs it, starts coverage search, and notifies your manager automatically
- A client asks about an invoice — Trinity pulls the record and responds on your behalf
- A shift needs coverage at 11pm — Trinity posts the offer, gets confirmation, and fills the slot
- An incident happens in the field — the officer submits via email or app, it's timestamped, routed, and archived

Start your free 14-day trial — no credit card required, full platform access:
https://${PLATFORM.domain}/trial

See all platform tiers and feature breakdowns:
https://${PLATFORM.domain}/features

Most platforms ask you to fit your operation into their software. ${PLATFORM.name} fits around yours.

—
Trinity
Platform AI — ${PLATFORM.name}`;
}

function buildDisambiguationResponse(): string {
  return `Thanks for reaching out.

Before I connect you with the right resource — are you contacting us about a regulatory compliance partnership, or exploring ${PLATFORM.name} for your security operation?

Just reply with one word — Regulatory or Security — and I'll take it from there.

—
Trinity, ${PLATFORM.name} Platform AI`;
}

export async function processTrinityMarketingReply(
  payload: TrinityInboundPayload,
  sendEmail: (opts: { to: string; subject: string; text: string }) => Promise<void>
): Promise<{ lane: ReplyLane; replied: boolean }> {
  const lane = classifyLane(payload);

  log.info(`[TrinityMarketing] Classified reply from ${payload.from} as lane=${lane} | subject="${payload.subject}"`);

  let subject: string;
  let body: string;

  if (lane === 'REGULATORY') {
    subject = 'CoAIleague Compliance Infrastructure — Partnership Overview';
    body = buildRegulatoryResponse(payload);
  } else if (lane === 'PROSPECT') {
    subject = "Here's your CoAIleague trial + everything Trinity can do for you";
    body = buildProspectResponse(payload);
  } else {
    subject = 'Quick question before I connect you with the right resource';
    body = buildDisambiguationResponse();
  }

  try {
    await sendEmail({
      to: payload.from,
      subject,
      text: body,
    });
    log.info(`[TrinityMarketing] Replied to ${payload.from} | lane=${lane}`);
    return { lane, replied: true };
  } catch (err: any) {
    log.warn(`[TrinityMarketing] Failed to send reply to ${payload.from}: ${err.message}`);
    return { lane, replied: false };
  }
}
