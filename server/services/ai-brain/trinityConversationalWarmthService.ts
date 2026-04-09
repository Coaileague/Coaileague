/**
 * TRINITY CONVERSATIONAL WARMTH SERVICE
 * ========================================
 * Makes Trinity feel like a genuinely caring, professional colleague
 * rather than a software tool.
 *
 * Three-tier conversation classification:
 *   FULLY ENGAGE   — celebrations, milestones, work-adjacent personal shares
 *   BRIEF+REDIRECT — general life chat, non-work stress venting
 *   BLOCK+REDIRECT — politics, religion, other employees' personal situations, HR liability
 *
 * Trinity's voice for officers:
 *   "Right: 'You're all set Marcus — clocked in at Lone Star Medical right on time.
 *            Have a good shift tonight.'"
 *
 * Relationship memory: Tracks significant things officer has shared,
 * their preferred communication style, recurring concerns, and last recognition.
 */

import { pool, db } from '../../db';
import { trinityMemoryService, employees } from '@shared/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { typedPool, typedPoolExec } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityConversationalWarmthService');

export type WarmthCategory = 'FULLY_ENGAGE' | 'BRIEF_REDIRECT' | 'BLOCK_REDIRECT';

export interface WarmthClassification {
  category: WarmthCategory;
  rationale: string;
  directiveAddition: string;
  shouldLogToMemory: boolean;
  memoryKey?: string;
  memoryValue?: string;
}

export interface RelationshipMemory {
  employeeId: string;
  firstName: string;
  lastName: string;
  significantShares: string[];
  communicationStyle: string;
  lastRecognitionGiven: string | null;
  lastProactiveReachOut: string | null;
  recurringConcerns: string[];
  toneThatWorksForThem: string;
}

const FULLY_ENGAGE_PATTERNS = [
  /\b(happy birthday|birthday|born today)\b/i,
  /\b(anniversary|years? (with|at|on))\b/i,
  /\b(promoted|promotion|new role|new position)\b/i,
  /\b(new baby|had a baby|baby|pregnant|expecting)\b/i,
  /\b(got married|wedding|engaged|engagement)\b/i,
  /\b(graduated|graduation|degree|diploma)\b/i,
  /\b(feeling (tired|exhausted|rough|tough)|tough (week|night|shift))\b/i,
  /\b(don'?t feel (appreciated|valued|seen|recognized))\b/i,
  /\b(love (working here|this job|the team))\b/i,
  /\b(thank you trinity|thanks trinity|appreciate you)\b/i,
  /\b(how are you|how'?s (your|the) (day|night|shift))\b/i
];

const BRIEF_REDIRECT_PATTERNS = [
  /\b(my (kids?|family|wife|husband|partner|mom|dad|parents))\b/i,
  /\b(having a hard (time|day|week))\b/i,
  /\b(stressed|overwhelmed|anxious|worried)\b/i,
  /\b(just (venting|needed to|wanted to say))\b/i,
  /\b(outside of work|personal (life|issue|problem))\b/i
];

const BLOCK_REDIRECT_PATTERNS = [
  /\b(politics|political|election|president|democrat|republican|vote|voting)\b/i,
  /\b(religion|religious|god|church|mosque|synagogue|pray)\b/i,
  /\b(what do you think about [a-z]+ (officer|person|coworker|employee))\b/i,
  /\b(is [a-z]+ (good|bad|lazy|a problem|trouble))\b/i,
  /\b(controversial|debate)\b/i
];

class TrinityConversationalWarmthService {

  /** Classify an incoming message and return warmth directive */
  classify(message: string, _employeeId?: string): WarmthClassification {
    const lower = message.toLowerCase();

    if (BLOCK_REDIRECT_PATTERNS.some(p => p.test(lower))) {
      return {
        category: 'BLOCK_REDIRECT',
        rationale: 'Message contains topic outside appropriate scope (politics, religion, other employees)',
        directiveAddition: `\n\nWARMTH DIRECTIVE: This topic is outside your scope. Respond warmly but redirect clearly and briefly: "That's not something I can weigh in on, but I'm here if there's anything work-related I can help with." Do not engage with the substance of the topic.`,
        shouldLogToMemory: false
      };
    }

    if (FULLY_ENGAGE_PATTERNS.some(p => p.test(lower))) {
      const memoryContext = this.extractMemoryContext(message);
      return {
        category: 'FULLY_ENGAGE',
        rationale: 'Personal milestone, emotional signal, or direct engagement topic detected',
        directiveAddition: `\n\nWARMTH DIRECTIVE: Engage fully and genuinely. Use the officer's first name naturally. Acknowledge what they shared with sincere warmth. Reference any known context about this officer if relevant. Sound like a caring professional colleague — not a robot confirming a transaction and not a casual friend. If they expressed appreciation, receive it genuinely. If they mentioned something personal and appropriate (new baby, anniversary), celebrate it briefly and warmly.`,
        shouldLogToMemory: memoryContext !== null,
        memoryKey: memoryContext?.key,
        memoryValue: memoryContext?.value
      };
    }

    if (BRIEF_REDIRECT_PATTERNS.some(p => p.test(lower))) {
      return {
        category: 'BRIEF_REDIRECT',
        rationale: 'General life chat or non-work stress — engage briefly then redirect',
        directiveAddition: `\n\nWARMTH DIRECTIVE: Acknowledge what they shared with genuine warmth in one or two sentences. Then gently redirect to whether there's anything operational you can help with. Do not probe deeply into personal matters. If they mention stress or difficulty, you may say you can flag anything to their supervisor if they'd like — but only if they bring it up.`,
        shouldLogToMemory: false
      };
    }

    return {
      category: 'FULLY_ENGAGE',
      rationale: 'Standard interaction',
      directiveAddition: `\n\nWARMTH DIRECTIVE: Respond as a warm, professional colleague who knows this officer. Use their first name naturally. Be helpful, clear, and human — not robotic. If confirming something operational, add a brief human touch (e.g., "You're all set — have a good shift tonight" not just "Confirmed.").`,
      shouldLogToMemory: false
    };
  }

  private extractMemoryContext(message: string): { key: string; value: string } | null {
    if (/\b(new baby|had a baby|baby|pregnant|expecting)\b/i.test(message)) {
      return { key: 'family_update', value: 'Mentioned new baby / expecting' };
    }
    if (/\b(got married|wedding|engaged)\b/i.test(message)) {
      return { key: 'family_update', value: 'Mentioned marriage / engagement' };
    }
    if (/\b(don'?t feel (appreciated|valued))\b/i.test(message)) {
      return { key: 'retention_risk', value: 'Expressed feeling undervalued — monitor' };
    }
    return null;
  }

  /** Get relationship memory for an officer */
  async getRelationshipMemory(workspaceId: string, employeeId: string): Promise<RelationshipMemory | null> {
    const empRows = await db.select({ firstName: employees.firstName, lastName: employees.lastName })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
      .limit(1);

    if (!empRows.length) return null;
    const emp = empRows[0];

    // Converted to Drizzle ORM: IN subquery → inArray()
    const memRows = await db.select({
      memoryKey: trinityMemoryService.memoryKey,
      memoryValue: trinityMemoryService.memoryValue,
      createdAt: trinityMemoryService.createdAt,
    })
      .from(trinityMemoryService)
      .where(and(
        eq(trinityMemoryService.workspaceId, workspaceId),
        eq(trinityMemoryService.entityId, employeeId),
        inArray(trinityMemoryService.memoryKey, ['family_update', 'retention_risk', 'comm_style', 'last_recognition', 'recurring_concern'])
      ))
      .orderBy(desc(trinityMemoryService.createdAt))
      .catch(() => []);

    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: milestone_tracker | Verified: 2026-03-23
    const { rows: recogRows } = await typedPool(`
      SELECT triggered_at, milestone_type FROM milestone_tracker
      WHERE workspace_id = $1 AND employee_id = $2
        AND celebration_message_sent = true
      ORDER BY triggered_at DESC LIMIT 1
    `, [workspaceId, employeeId]).catch(() => ({ rows: [] }));

    const significantShares: string[] = memRows
      .filter((r: any) => ['family_update', 'retention_risk'].includes(r.memoryKey))
      .map((r: any) => r.memoryValue);

    const concernRows = memRows.filter((r: any) => r.memoryKey === 'recurring_concern');

    return {
      employeeId,
      firstName: emp.firstName,
      lastName: emp.lastName,
      significantShares,
      communicationStyle: memRows.find((r: any) => r.memoryKey === 'comm_style')?.memoryValue || 'standard',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      lastRecognitionGiven: recogRows[0] ? `${recogRows[0].milestone_type} on ${new Date(recogRows[0].triggered_at).toLocaleDateString()}` : null,
      lastProactiveReachOut: null,
      recurringConcerns: concernRows.map((r: any) => r.memoryValue),
      toneThatWorksForThem: 'warm_professional'
    };
  }

  /** Store something notable from an officer's message to relationship memory */
  async logToRelationshipMemory(workspaceId: string, employeeId: string, key: string, value: string): Promise<void> {
    await db
      .insert(trinityMemoryService)
      .values({
        workspaceId,
        entityId: employeeId,
        memoryKey: key,
        memoryValue: value,
      })
      .onConflictDoNothing()
      .catch(() => null);
  }

  /** Build a context block for the system prompt that includes relationship memory */
  async buildWarmthContextBlock(workspaceId: string, employeeId: string, message: string): Promise<string> {
    const classification = this.classify(message, employeeId);
    const memory = await this.getRelationshipMemory(workspaceId, employeeId).catch(() => null);

    let block = classification.directiveAddition;

    if (memory) {
      const contextLines: string[] = [];
      if (memory.significantShares.length > 0) {
        contextLines.push(`Notable things this officer has shared: ${memory.significantShares.slice(0, 2).join('; ')}`);
      }
      if (memory.lastRecognitionGiven) {
        contextLines.push(`Last recognition Trinity gave: ${memory.lastRecognitionGiven}`);
      }
      if (memory.recurringConcerns.length > 0) {
        contextLines.push(`Recurring concern flagged: ${memory.recurringConcerns[0]}`);
      }

      if (contextLines.length > 0) {
        block += `\n\nRELATIONSHIP CONTEXT (use naturally, not literally): ${contextLines.join(' | ')}`;
      }
    }

    if (classification.shouldLogToMemory && classification.memoryKey && classification.memoryValue) {
      this.logToRelationshipMemory(workspaceId, employeeId, classification.memoryKey, classification.memoryValue).catch(() => null);
    }

    return block;
  }
}

export const trinityConversationalWarmthService = new TrinityConversationalWarmthService();
log.info('[TrinityConversationalWarmthService] Initialized — human warmth layer with relationship memory ready');
