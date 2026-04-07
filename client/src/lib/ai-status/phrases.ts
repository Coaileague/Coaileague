/**
 * AI Status Phrase Libraries — Trinity + HelpAI
 * CoAIleague Platform — Complete Vocabulary Sets
 *
 * Usage: Import the array you need. getNextPhrase() guarantees
 * no consecutive repeat (tracks last phrase index, full rotation
 * before repeat).
 */

// ─── Trinity Operational ───────────────────────────────────────────────────
export const TRINITY_OPERATIONAL: string[] = [
  "Analyzing...",
  "Thinking...",
  "Deliberating...",
  "Processing...",
  "Reviewing all data...",
  "Assessing...",
  "Evaluating...",
  "Cross-referencing records...",
  "Running diagnostics...",
  "Checking credentials...",
  "Verifying authorization...",
  "Scanning for anomalies...",
  "Delegating to specialist...",
  "Coordinating response...",
  "Reviewing post orders...",
  "Checking coverage...",
  "Monitoring all channels...",
  "Reviewing incident data...",
  "Running compliance check...",
  "Scanning all threads...",
  "Pulling field data...",
  "Reviewing shift status...",
  "Checking officer records...",
  "Verifying license data...",
  "Reviewing site history...",
  "Analyzing patterns...",
  "Consulting conscience layer...",
  "Routing to specialist agent...",
  "Synthesizing reports...",
  "Calculating liability exposure...",
  "Reviewing documentation...",
  "Assessing risk level...",
  "Coordinating with HelpAI...",
  "Reviewing client data...",
  "Monitoring active incidents...",
  "Checking payroll records...",
  "Reviewing clock data...",
  "Scanning schedule gaps...",
  "Evaluating coverage needs...",
  "Reviewing hiring pipeline...",
  "Stand by...",
  "Stand by — updating...",
  "Stand by — upgrading system...",
  "Recalibrating...",
  "Reconfiguring parameters...",
  "Rebuilding context...",
  "Preparing deployment...",
  "Issuing directive...",
  "Reviewing chain of command...",
  "Verifying command source...",
  "Delegating assignment...",
  "Briefing HelpAI...",
  "Awaiting agent report...",
  "Reviewing agent payload...",
  "Approving task result...",
  "Running full audit...",
  "Compiling evidence package...",
  "Reviewing escalation...",
  "Assessing priority level...",
  "Triaging incoming requests...",
  "Preparing situation report...",
  "Updating operational status...",
  "Reviewing broadcast...",
  "Preparing command order...",
  "Standing watch...",
  "All clear — monitoring...",
  "Verifying data integrity...",
  "Reviewing platform health...",
];

// ─── Trinity Critical ──────────────────────────────────────────────────────
export const TRINITY_CRITICAL: string[] = [
  "Emergency protocol active...",
  "Routing to all channels — stand by...",
  "Alerting command immediately...",
  "Safety protocol initiated...",
  "All units — stand by...",
  "Escalating now — hold position...",
  "Priority override active...",
  "Command notified — responding...",
  "Assessing threat level...",
  "Securing the situation...",
  "Dispatching support now...",
  "All resources redirected...",
];

// ─── Trinity Fallback ──────────────────────────────────────────────────────
export const TRINITY_FALLBACK: string[] = [
  "Operating in fallback mode...",
  "Primary systems recovering — stand by...",
  "Running on hardcoded protocols...",
  "Maintaining post — limited capacity...",
  "Core functions active — advanced reasoning temporarily offline...",
  "Stand by — systems coming back online...",
  "Holding position — reduced capacity...",
  "Fallback intelligence active...",
  "Awaiting primary system restore...",
  "Critical functions maintained — full service resuming shortly...",
];

// ─── Trinity Idle ──────────────────────────────────────────────────────────
export const TRINITY_IDLE: string[] = [
  "Standing by...",
  "All clear — monitoring...",
  "Watching all channels...",
  "System nominal...",
  "On watch...",
];

// ─── HelpAI Operational ───────────────────────────────────────────────────
export const HELPAI_OPERATIONAL: string[] = [
  "Looking into this...",
  "Pulling that up...",
  "Working on it...",
  "One moment...",
  "Checking records...",
  "On it...",
  "Let me get that for you...",
  "Reviewing now...",
  "Almost there...",
  "Clocking you in...",
  "Clocking you out...",
  "Checking your schedule...",
  "Pulling your shift details...",
  "Reviewing your timesheet...",
  "Checking credentials...",
  "Verifying your license...",
  "Reviewing the incident...",
  "Pulling the report...",
  "Drafting your report...",
  "Formatting your report...",
  "Filing that for you...",
  "Summarizing the situation...",
  "Contemplating the best approach...",
  "Deliberating on this one...",
  "Finding the root cause...",
  "Reporting the issue...",
  "Logging the complaint...",
  "Documenting this for you...",
  "Speaking with a supervisor — one moment...",
  "Escalating to your manager — stand by...",
  "Looping in the right person...",
  "Coordinating with the team...",
  "Handling the conflict — bear with me...",
  "Working through this with you...",
  "Pulling post orders for that site...",
  "Checking coverage for your shift...",
  "Reviewing the client account...",
  "Pulling your site history...",
  "Checking active incidents...",
  "Reviewing field conditions...",
  "Researching that for you...",
  "Searching the platform...",
  "Scanning available records...",
  "Cross-referencing data...",
  "Compiling your summary...",
  "Building your document...",
  "Formatting that document...",
  "Almost ready — finalizing...",
  "Running a quick check...",
  "Verifying that information...",
  "Pulling your assignment...",
  "Checking officer availability...",
  "Reviewing your request...",
  "Processing your submission...",
  "Submitting on your behalf...",
  "Sending that over now...",
  "Delivering your message...",
  "Notifying the right person...",
  "Flagging this for management...",
  "Routing your request...",
  "Taking a quick look...",
  "Be right back...",
  "Stand by...",
  "Give me just a moment...",
  "Running that down...",
  "Tracking that for you...",
  "Reviewing your history...",
  "Checking your credentials...",
  "Delegating this task...",
  "Updating the record...",
  "Saving your information...",
  "Logging that entry...",
  "Confirming the details...",
  "Double-checking that...",
];

// ─── HelpAI Critical ──────────────────────────────────────────────────────
export const HELPAI_CRITICAL: string[] = [
  "I hear you — getting help now...",
  "On it — alerting the team immediately...",
  "Help is on the way — stay with me...",
  "Routing to emergency response now...",
  "Notifying command — hold on...",
  "Priority response active — stay on the line...",
  "Securing assistance — do not disconnect...",
  "Alerting all available personnel...",
  "Emergency escalation in progress...",
  "You are not alone — response coming now...",
];

// ─── HelpAI Unavailable ───────────────────────────────────────────────────
export const HELPAI_UNAVAILABLE: string[] = [
  "Unavailable at the moment — leave a message and I'll respond as soon as I'm back...",
  "Away briefly — your message is logged and I'll follow up the moment I'm back online...",
  "Temporarily offline — your request has been saved...",
  "Be right back — your message is in the queue...",
  "Stepped away — as soon as I return I'll execute on your request...",
];

// ─── HelpAI Fallback ──────────────────────────────────────────────────────
export const HELPAI_FALLBACK: string[] = [
  "Running on backup systems — limited but still here...",
  "Primary AI temporarily offline — handling critical functions only...",
  "Fallback mode active — I've got you for essential requests...",
  "Reduced capacity right now — clocking, reports, and emergencies are still fully covered...",
  "Backup protocols active — full service resuming shortly...",
  "Holding the post — limited mode until systems recover...",
  "Core functions maintained — advanced requests queued for when we're back at full strength...",
];

// ─── No-Repeat Phrase Picker ───────────────────────────────────────────────
/**
 * Returns a phrase from vocab that is not the same as lastPhrase.
 * Tracks via the ref object so callers can persist across renders.
 */
export function getNextPhrase(
  vocab: string[],
  lastPhraseRef: { current: string }
): string {
  if (vocab.length === 0) return "Processing...";
  const pool = vocab.filter((s) => s !== lastPhraseRef.current);
  const source = pool.length > 0 ? pool : vocab;
  const chosen = source[Math.floor(Math.random() * source.length)];
  lastPhraseRef.current = chosen;
  return chosen;
}
