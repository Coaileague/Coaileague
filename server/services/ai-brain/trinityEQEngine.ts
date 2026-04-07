
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityEQEngine');
/**
 * Trinity EQ Engine — Emotional Intelligence Signal Analyzer
 * ============================================================
 * Real-time heuristic emotional signal detection that fires BEFORE
 * every Trinity response. Outputs EQ signals + amygdala priority score.
 *
 * Spec alignment: Phase 2-E (Emotional Intelligence Layer)
 * Brain region: AMYGDALA — priority and urgency weighting engine
 * sitting between all inputs and the Global Workspace.
 *
 * No AI model call — pure synchronous heuristic analysis for speed.
 * Wired into trinityChatService before response generation.
 * Publishes AMYGDALA activation to trinityConnectomeService.
 */

export type EQSignalType =
  | 'distress'
  | 'urgency'
  | 'frustration'
  | 'burnout'
  | 'confusion'
  | 'anxiety'
  | 'crisis'
  | 'appreciation'
  | 'client_dissatisfaction'
  | 'conflict_escalation'
  | 'disengagement';

export type EQTone =
  | 'standard'       // No signal detected — normal response
  | 'empathetic'     // Distress or frustration detected
  | 'urgent_action'  // Urgency or anxiety — lead with action
  | 'crisis_mode'    // Crisis signal — immediate escalation mode
  | 'clarifying'     // Confusion detected — simplify radically
  | 'warm'           // Appreciation — brief warmth
  | 'alert_manager'; // Burnout/disengagement — surface to supervisor

export interface EQSignal {
  signals: EQSignalType[];
  amygdalaPriority: number;        // 0.0 – 1.0 (feeds Global Workspace priority)
  toneDirective: EQTone;
  shouldFlag: boolean;             // Surface to manager/supervisor
  flagReason?: string;
  distressContext?: string;        // Short description for manager alert
  contextBlock: string;            // Injected into Trinity system prompt
}

// ─── Signal Pattern Dictionaries ───────────────────────────────────────────

const CRISIS_PATTERNS = [
  /\b(help me now|emergency|in danger|unsafe|active threat|weapon|shooting|fight|assault|bleeding|unconscious|call 911|officer down|panic)\b/i,
  /\b(i need help right now|someone is hurting|going to get attacked|need backup|send backup)\b/i,
];

const DISTRESS_PATTERNS = [
  /\b(can't (make|do|handle)|need help|overwhelmed|exhausted|sick|quitting|resign(ing)?|stressed|anxious|scared|dangerous|not safe)\b/i,
  /\b(falling apart|breaking down|can't take|too much|done with|had enough|losing it|can't cope)\b/i,
  /\b(nobody cares|no one listens|nothing works|always ignored|never helped)\b/i,
];

const URGENCY_PATTERNS = [
  /\b(urgent|asap|immediately|right now|right away|critical|time sensitive|emergency|now|instantly|this minute)\b/i,
  /\b(boss is asking|client is waiting|shift starts|shift already started|late|going to be late|missed)\b/i,
];

const FRUSTRATION_PATTERNS = [
  /\b(again|still|why(?: is| does| won't| can't)?|never works|this is ridiculous|unfair|stupid system|terrible|awful|broken)\b/i,
  /!!+|[A-Z]{4,}/.source, // Caps or multiple exclamation marks
  /\b(same (problem|issue|error) (again|as before)|keep (getting|seeing|having)|how many times)\b/i,
];

const BURNOUT_PATTERNS = [
  /\b(burnt? out|burned out|exhausted|can't anymore|too many shifts|overworked|no days off|never off|always working)\b/i,
  /\b(don't care anymore|going through motions|why bother|what's the point|morale is low)\b/i,
];

const CONFUSION_PATTERNS = [
  /\b(i don't understand|what does this mean|confused|how (does|do)|which one|not sure|explain|clarify)\b/i,
  /\b(same question|asked before|still don't get|help me understand|what am i supposed to)\b/i,
];

const ANXIETY_PATTERNS = [
  /\b(worried|anxious|nervous|stressed about|what if|not sure if|might (miss|fail|lose|get fired))\b/i,
  /\b(my boss|my manager|they're going to|going to get in trouble|get me fired|in trouble)\b/i,
];

const CLIENT_DISSATISFACTION_PATTERNS = [
  /\b(unacceptable|poor service|disappointed|not happy|complaint|filing (a )?(complaint|report)|dispute|unhappy with|let down|failed to)\b/i,
  /\b(this is not what (we|i) (paid|contracted|agreed)|breach of contract|will terminate|pulling (our )?contract)\b/i,
];

const CONFLICT_ESCALATION_PATTERNS = [
  /\b(argument|confrontation|altercation|threatening|verbal (abuse|attack)|won't listen|ignoring (me|orders|policy))\b/i,
  /\b(escalat(e|ing|ed)|supervisor (needs|must|should) know|this needs to go higher)\b/i,
];

const DISENGAGEMENT_PATTERNS = [
  /\b(whatever|don't (care|bother)|forget it|never mind|doesn't matter|useless)\b/i,
  /\b(not (going|planning) to|won't (be|show|come)|thinking of (leaving|quitting|resigning))\b/i,
];

const APPRECIATION_PATTERNS = [
  /\b(thank(s| you)|appreciate|helpful|great job|perfect|exactly what|you're amazing|love this|this works)\b/i,
];

// ─── Signal Matcher ─────────────────────────────────────────────────────────

function matchPatterns(text: string, patterns: (RegExp | string)[]): boolean {
  return patterns.some(p => {
    const re = typeof p === 'string' ? new RegExp(p, 'i') : p;
    return re.test(text);
  });
}

// ─── Priority Calculator ────────────────────────────────────────────────────

function computePriority(signals: EQSignalType[]): number {
  if (signals.includes('crisis')) return 0.95;
  if (signals.includes('distress') && signals.includes('urgency')) return 0.85;
  if (signals.includes('conflict_escalation')) return 0.80;
  if (signals.includes('client_dissatisfaction')) return 0.75;
  if (signals.includes('distress')) return 0.70;
  if (signals.includes('burnout') && signals.includes('disengagement')) return 0.70;
  if (signals.includes('urgency')) return 0.65;
  if (signals.includes('frustration') && signals.includes('anxiety')) return 0.60;
  if (signals.includes('burnout')) return 0.55;
  if (signals.includes('frustration')) return 0.50;
  if (signals.includes('anxiety')) return 0.45;
  if (signals.includes('confusion')) return 0.35;
  if (signals.includes('disengagement')) return 0.40;
  if (signals.includes('appreciation')) return 0.10;
  return 0.20; // baseline
}

// ─── Tone Resolver ──────────────────────────────────────────────────────────

function resolveTone(signals: EQSignalType[], priority: number): EQTone {
  if (signals.includes('crisis')) return 'crisis_mode';
  if (priority >= 0.80) return 'alert_manager';
  if (signals.includes('distress') || signals.includes('conflict_escalation')) return 'empathetic';
  if (signals.includes('urgency') || signals.includes('anxiety')) return 'urgent_action';
  if (signals.includes('burnout') || signals.includes('disengagement')) return 'empathetic';
  if (signals.includes('client_dissatisfaction')) return 'empathetic';
  if (signals.includes('frustration')) return 'empathetic';
  if (signals.includes('confusion')) return 'clarifying';
  if (signals.includes('appreciation')) return 'warm';
  return 'standard';
}

// ─── Context Block Builder ───────────────────────────────────────────────────

function buildContextBlock(signals: EQSignalType[], tone: EQTone, priority: number): string {
  if (signals.length === 0) return '';

  const lines: string[] = [
    `[AMYGDALA SIGNAL — Priority: ${(priority * 100).toFixed(0)}%]`,
    `Detected signals: ${signals.join(', ')}`,
    `Required tone: ${tone.toUpperCase().replace('_', ' ')}`,
  ];

  const instructions: Record<EQTone, string> = {
    crisis_mode:   'IMMEDIATE ACTION MODE. Short sentences. Clear steps. Get them to safety first. No pleasantries whatsoever.',
    alert_manager: 'This officer may be in distress or disengaging. Respond warmly and empathetically. Internally flag this for supervisor awareness.',
    empathetic:    'Validate their feelings FIRST before solving. "I hear you — that\'s genuinely difficult." Then offer help.',
    urgent_action: 'Lead with the ACTION, not the explanation. "Here\'s what to do right now:" — explanation comes after.',
    clarifying:    'Simplify radically. One step at a time. No information dumps.',
    warm:          'Brief, warm acknowledgment. Stay available. "Happy to help — anything else you need?"',
    standard:      'Standard professional tone.',
  };

  lines.push(`Tone directive: ${instructions[tone]}`);
  return lines.join('\n');
}

// ─── Main EQ Analyze Function ────────────────────────────────────────────────

export interface EQContext {
  userId?: string;
  userRole?: string;
  workspaceId?: string;
  userName?: string;
}

export function analyzeEQ(messageText: string, ctx: EQContext = {}): EQSignal {
  const signals: EQSignalType[] = [];

  // Run all pattern checks
  if (matchPatterns(messageText, CRISIS_PATTERNS)) signals.push('crisis');
  if (matchPatterns(messageText, DISTRESS_PATTERNS)) signals.push('distress');
  if (matchPatterns(messageText, URGENCY_PATTERNS)) signals.push('urgency');
  if (matchPatterns(messageText, FRUSTRATION_PATTERNS)) signals.push('frustration');
  if (matchPatterns(messageText, BURNOUT_PATTERNS)) signals.push('burnout');
  if (matchPatterns(messageText, CONFUSION_PATTERNS)) signals.push('confusion');
  if (matchPatterns(messageText, ANXIETY_PATTERNS)) signals.push('anxiety');
  if (matchPatterns(messageText, CLIENT_DISSATISFACTION_PATTERNS)) signals.push('client_dissatisfaction');
  if (matchPatterns(messageText, CONFLICT_ESCALATION_PATTERNS)) signals.push('conflict_escalation');
  if (matchPatterns(messageText, DISENGAGEMENT_PATTERNS)) signals.push('disengagement');
  if (matchPatterns(messageText, APPRECIATION_PATTERNS)) signals.push('appreciation');

  const amygdalaPriority = computePriority(signals);
  const toneDirective = resolveTone(signals, amygdalaPriority);

  // Flag for manager/supervisor surfacing
  const shouldFlag =
    signals.includes('crisis') ||
    signals.includes('disengagement') ||
    (signals.includes('burnout') && amygdalaPriority > 0.5) ||
    (signals.includes('distress') && amygdalaPriority > 0.6) ||
    signals.includes('conflict_escalation');

  const flagReason = shouldFlag
    ? signals.includes('crisis')
      ? 'CRISIS signal detected — immediate supervisor escalation required'
      : signals.includes('disengagement')
      ? 'Officer disengagement pattern — proactive supervisor check-in recommended'
      : signals.includes('conflict_escalation')
      ? 'Conflict escalation detected — supervisor awareness required'
      : 'Elevated distress or burnout signal — supervisor awareness recommended'
    : undefined;

  const distressContext = shouldFlag
    ? `${ctx.userName || ctx.userId || 'Officer'} (${ctx.userRole || 'unknown role'}) — signals: ${signals.join(', ')} — priority ${(amygdalaPriority * 100).toFixed(0)}%`
    : undefined;

  const contextBlock = buildContextBlock(signals, toneDirective, amygdalaPriority);

  return {
    signals,
    amygdalaPriority,
    toneDirective,
    shouldFlag,
    flagReason,
    distressContext,
    contextBlock,
  };
}

// ─── Singleton-style export ──────────────────────────────────────────────────

export const trinityEQEngine = {
  analyze: analyzeEQ,

  /** Returns true if this signal should trigger Amygdala broadcast to Global Workspace */
  shouldBroadcast(signal: EQSignal): boolean {
    return signal.amygdalaPriority >= 0.40;
  },

  /** Format a distress flag for the platform event bus */
  buildDistressEvent(signal: EQSignal, ctx: EQContext) {
    return {
      type: 'officer_distress_flag' as const,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      userName: ctx.userName,
      role: ctx.userRole,
      signals: signal.signals,
      priority: signal.amygdalaPriority,
      reason: signal.flagReason,
      context: signal.distressContext,
      timestamp: new Date().toISOString(),
    };
  },
};
