
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityVoice');
/**
 * TRINITY VOICE - First-Person Communication Policy
 * 
 * Ensures Trinity always speaks in first person ("I detected...", "I scheduled...")
 * rather than third person ("Trinity detected...", "Trinity scheduled...").
 * 
 * Voice Policy:
 * - Direct Trinity actions/decisions → First person: "I scheduled your shifts"
 * - System/automated outcomes → Neutral active: "Your shifts have been scheduled"
 * - Error/failure messages → Empathetic first person: "I ran into a problem with..."
 * - Email templates → Warm first person: "I'm here to help you get started"
 */

const THIRD_PERSON_PATTERN = /\bTrinity\s+(has|is|was|will|can|did|does|should|would|could|may|might|shall|need|detect|fix|process|schedul|creat|found|sent|appli|generat|monitor|analyz|reach|check|handl|assign|report|flag|identif|perform|trigger|execut|clean|optimiz|assess|complet|resolv|updat|ran|scan|notic|prepar|verified|calculated|determined|configured|evaluated|validated|proposed|approved|rejected)/i;

const REPLACEMENTS: [RegExp, string][] = [
  [/\bTrinity has\b/gi, "I've"],
  [/\bTrinity is\b/gi, "I'm"],
  [/\bTrinity was\b/gi, "I was"],
  [/\bTrinity will\b/gi, "I'll"],
  [/\bTrinity can\b/gi, "I can"],
  [/\bTrinity did\b/gi, "I"],
  [/\bTrinity does\b/gi, "I"],
  [/\bTrinity should\b/gi, "I should"],
  [/\bTrinity would\b/gi, "I'd"],
  [/\bTrinity could\b/gi, "I could"],
  [/\bTrinity may\b/gi, "I may"],
  [/\bTrinity might\b/gi, "I might"],
  [/\bTrinity cannot\b/gi, "I can't"],
  [/\bTrinity couldn't\b/gi, "I couldn't"],
  [/\bTrinity needs? to\b/gi, "I need to"],
  [/\bTrinity detected\b/gi, "I detected"],
  [/\bTrinity fixed\b/gi, "I fixed"],
  [/\bTrinity processed\b/gi, "I processed"],
  [/\bTrinity scheduled\b/gi, "I scheduled"],
  [/\bTrinity created\b/gi, "I created"],
  [/\bTrinity found\b/gi, "I found"],
  [/\bTrinity sent\b/gi, "I sent"],
  [/\bTrinity applied\b/gi, "I applied"],
  [/\bTrinity generated\b/gi, "I generated"],
  [/\bTrinity monitored\b/gi, "I monitored"],
  [/\bTrinity analyzed\b/gi, "I analyzed"],
  [/\bTrinity reached\b/gi, "I reached"],
  [/\bTrinity checked\b/gi, "I checked"],
  [/\bTrinity handled\b/gi, "I handled"],
  [/\bTrinity assigned\b/gi, "I assigned"],
  [/\bTrinity reported\b/gi, "I reported"],
  [/\bTrinity flagged\b/gi, "I flagged"],
  [/\bTrinity identified\b/gi, "I identified"],
  [/\bTrinity performed\b/gi, "I performed"],
  [/\bTrinity triggered\b/gi, "I triggered"],
  [/\bTrinity executed\b/gi, "I executed"],
  [/\bTrinity cleaned\b/gi, "I cleaned"],
  [/\bTrinity optimized\b/gi, "I optimized"],
  [/\bTrinity assessed\b/gi, "I assessed"],
  [/\bTrinity completed\b/gi, "I completed"],
  [/\bTrinity resolved\b/gi, "I resolved"],
  [/\bTrinity updated\b/gi, "I updated"],
  [/\bTrinity ran\b/gi, "I ran"],
  [/\bTrinity scanned\b/gi, "I scanned"],
  [/\bTrinity noticed\b/gi, "I noticed"],
  [/\bTrinity prepared\b/gi, "I prepared"],
  [/\bTrinity verified\b/gi, "I verified"],
  [/\bTrinity calculated\b/gi, "I calculated"],
  [/\bTrinity determined\b/gi, "I determined"],
  [/\bTrinity configured\b/gi, "I configured"],
  [/\bTrinity evaluated\b/gi, "I evaluated"],
  [/\bTrinity validated\b/gi, "I validated"],
  [/\bTrinity proposed\b/gi, "I proposed"],
  [/\bTrinity approved\b/gi, "I approved"],
  [/\bTrinity rejected\b/gi, "I rejected"],
];

/**
 * Convert third-person Trinity references to first-person.
 * "Trinity detected 3 issues" → "I detected 3 issues"
 * "Trinity has processed payroll" → "I've processed payroll"
 */
export function firstPerson(message: string): string {
  let result = message;
  for (const [pattern, replacement] of REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Convert to neutral system voice (no Trinity name, no "I").
 * Best for automated bulk messages and system notifications.
 * "Trinity scheduled you for 3 shifts" → "You've been scheduled for 3 shifts"
 * "Trinity detected a conflict" → "A scheduling conflict was detected"
 */
export function systemVoice(message: string): string {
  let result = message;
  result = result.replace(/\bTrinity scheduled you\b/gi, "You've been scheduled");
  result = result.replace(/\bTrinity sent you\b/gi, "You've received");
  result = result.replace(/\bTrinity detected\b/gi, "Detected");
  result = result.replace(/\bTrinity processed\b/gi, "Processed");
  result = result.replace(/\bTrinity generated\b/gi, "Generated");
  result = result.replace(/\bTrinity created\b/gi, "Created");
  result = result.replace(/\bTrinity completed\b/gi, "Completed");
  result = result.replace(/\bTrinity found\b/gi, "Found");
  result = result.replace(/\bTrinity\s+\w+/gi, (match) => {
    const verb = match.replace(/^Trinity\s+/i, '');
    return verb.charAt(0).toUpperCase() + verb.slice(1);
  });
  return result;
}

/**
 * Check if a message contains third-person Trinity references.
 * Returns true if the message needs rewriting.
 */
export function hasThirdPersonReference(message: string): boolean {
  return THIRD_PERSON_PATTERN.test(message);
}

/**
 * Auto-fix a message: detect third-person and convert to first-person.
 * Safe to call on any string - returns unchanged if no issues found.
 */
export function autoFixVoice(message: string): string {
  if (hasThirdPersonReference(message)) {
    return firstPerson(message);
  }
  return message;
}

/**
 * Format a Trinity action notification in first person.
 * Use for direct actions Trinity took on behalf of the user.
 */
export function actionMessage(action: string, detail: string): string {
  return `${action}. ${detail}`;
}

/**
 * Format a Trinity status update in first person.
 */
export function statusUpdate(what: string, result: string): string {
  return `I ${what} — ${result}`;
}

/**
 * Format a Trinity error/failure message with empathy.
 */
export function errorMessage(what: string, suggestion?: string): string {
  const base = `I ran into an issue ${what}.`;
  if (suggestion) {
    return `${base} ${suggestion}`;
  }
  return `${base} Let me know if you'd like me to try again.`;
}

/**
 * Format an event bus title - removes "Trinity" prefix from event titles.
 * "Trinity Scan Completed" → "Scan Completed"  
 * "Trinity Fix Applied" → "Fix Applied"
 */
export function eventTitle(title: string): string {
  return title.replace(/^Trinity\s+/i, '').trim();
}
