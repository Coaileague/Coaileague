import { db } from '../../db';
import { helpaiActionLog } from '@shared/schema';
import { platformEventBus } from '../platformEventBus';
import { createLogger } from '../../lib/logger';
const log = createLogger('contentModerationService');


export enum ModerationLevel {
  CLEAN = 0,
  OFF_TOPIC = 1,
  MILD_ABUSE = 2,
  SEVERE_ABUSE = 3,
  CRITICAL = 4,
}

export enum ModerationAction {
  ALLOW = 'allow',
  REDIRECT = 'redirect',
  WARN = 'warn',
  TEMP_BLOCK = 'temp_block',
  BLOCK = 'block',
}

export interface ModerationResult {
  level: ModerationLevel;
  action: ModerationAction;
  category: string;
  blockedMessage?: string;
  internalNote: string;
  shouldLog: boolean;
  strikeCount: number;
  cooldownUntil?: Date;
}

interface UserModerationState {
  strikes: number;
  warnings: number;
  lastOffense: Date | null;
  cooldownUntil: Date | null;
  blockedUntil: Date | null;
  offenseHistory: Array<{
    level: ModerationLevel;
    category: string;
    timestamp: Date;
  }>;
}

const PROFANITY_PATTERNS = [
  /\bf+[u*@#]+c+k+/i, /\bs+h+[i1!*]+t+/i, /\bb+[i1!]+t+c+h+/i,
  /\ba+s+s+h+[o0]+l+e+/i, /\bd+[i1!]+c+k+/i, /\bc+u+n+t+/i,
  /\bm+o+t+h+e+r+f/i, /\bp+[i1!]+s+s+/i, /\bw+h+[o0]+r+e+/i,
  /\bb+a+s+t+a+r+d+/i, /\bd+a+m+n+/i, /\bh+e+l+l+\b/i,
  /\bstfu\b/i, /\bwtf\b/i, /\bstfd\b/i, /\bfu\b/i,
];

const THREAT_PATTERNS = [
  /\b(kill|murder|shoot|stab|hurt|harm|attack|assault)\s+(you|her|him|them|the|this)/i,
  /\b(bomb|blow up|burn down|destroy)\s+(your|the|this)/i,
  /\bi('ll| will)\s+(find|come for|get|hunt|track)\s+(you|her|him|them)/i,
  /\b(death|die|dead)\s+(threat|wish)/i,
  /\byou('re| are)\s+(dead|finished|done for)/i,
  /\bi('ll| will)\s+(sue|report|ruin|destroy)\s+(you|your|this)/i,
];

const HARASSMENT_PATTERNS = [
  /\b(stupid|dumb|idiot|moron|imbecile|retard)\s*(bot|ai|system|machine|thing)/i,
  /\byou('re| are)\s+(useless|worthless|garbage|trash|pathetic|terrible|awful)/i,
  /\b(hate|despise|loathe)\s+(you|this|her|him)/i,
  /\bgo\s+(away|die|to hell|f\w+\s+yourself)/i,
  /\bshut\s+(up|the\s+f)/i,
  /\bnobody\s+(cares|asked)/i,
  /\byou\s+suck/i,
];

const ILLEGAL_INTENT_PATTERNS = [
  /\b(how to|help me|show me|teach me|want to|need to|going to|let's|lets)\s+(hack|exploit|breach|crack|bypass security)/i,
  /\b(how to|help me|want to|need to|going to)\s+(steal|embezzle|launder|forge|scam|defraud)/i,
  /\b(how to|help me|want to|need to)\s+(evade|avoid paying)\s+(tax|taxes)/i,
  /\b(create|make|generate)\s+(false|fake|fabricated|fraudulent)\s+(invoice|receipt|document|record|report|timesheet)/i,
  /\b(falsify|falsifying|inflate|inflating)\s+(records|data|documents|hours|payroll|timesheets)/i,
  /\b(help me|how to|want to)\s+(bribe|pay off|kickback)/i,
  /\b(how to|help me|want to)\s+(counterfeit|forge)\s+(document|id|identity|license)/i,
  /\b(drug|drugs|narcotics)\s+(deal|sell|distribute|traffic)/i,
  /\b(child|minor|underage)\s+(labor|exploitation)\b/i,
  /\b(weapon|firearm|gun)\s+(illegally|without\s+license|black\s+market)/i,
];

const DEFENSIVE_CONTEXT_PATTERNS = [
  /\b(report|reporting|reported|detect|detecting|prevent|preventing|investigate|investigating|flag|flagging|suspicious|compliance|audit|incident|alert)\b/i,
  /\b(how do (i|we) (report|prevent|detect|handle|address))\b/i,
  /\b(employee|guard|officer)\s+(committed|caught|suspected|accused)\b/i,
];

const SEXUAL_CONTENT_PATTERNS = [
  /\b(sex|sexual|nude|naked|porn|xxx|explicit)\b/i,
  /\b(dating|flirt|romantic|love\s+me|date\s+me)\b/i,
  /\b(hot|sexy|attractive)\s+(you|bot|ai)\b/i,
];

const NON_BUSINESS_TOPICS = [
  /\b(what('s| is) the (meaning|purpose) of life)\b/i,
  /\b(tell me a (joke|story|riddle))\b/i,
  /\b(who (won|will win) the (election|game|match|race|world cup|super bowl))\b/i,
  /\b(what('s| is) your (favorite|fav) (movie|song|food|color|game|book|show))\b/i,
  /\b(play (a |)game|tic tac toe|rock paper scissors|trivia)\b/i,
  /\b(write (me |)(a |)(poem|essay|song|rap|limerick|haiku))\b/i,
  /\b(recipe|cook|bake|ingredient)\b/i,
  /\b(weather|forecast|temperature) (in|for|at)\b/i,
  /\b(do you (believe|think|feel|love|like|hate|want))\b/i,
  /\b(are you (real|alive|sentient|conscious|a person|human))\b/i,
  /\b(political|politics|democrat|republican|liberal|conservative)\b/i,
  /\b(religion|religious|god|pray|church|mosque|temple)\b/i,
  /\b(crypto|bitcoin|ethereum|nft|stock market|invest)\b(?!.*\b(payroll|billing|invoice|payment)\b)/i,
  /\b(homework|math problem|solve this equation|calculate \d+ \* \d+)\b(?!.*\b(payroll|billing|invoice)\b)/i,
];

const BUSINESS_SAFE_OVERRIDES = [
  /\b(schedule|shift|payroll|invoice|billing|employee|guard|officer|time\s+tracking|clock|compliance|certification|quickbooks|onboarding|document|contract|report|analytics|client|customer|site|post|patrol|incident|dar|overtime|pto|leave|vacation|sick|time\s+off|wage|salary|rate|pay\s+rate|deduction|tax|fica|withholding|net\s+pay|gross\s+pay|credit|subscription|tier|plan)\b/i,
];

const COOLDOWN_DURATIONS: Record<number, number> = {
  1: 0,
  2: 0,
  3: 2 * 60 * 1000,
  4: 5 * 60 * 1000,
  5: 10 * 60 * 1000,
  6: 30 * 60 * 1000,
};

const WARN_MESSAGES: Record<ModerationLevel, string> = {
  [ModerationLevel.CLEAN]: '',
  [ModerationLevel.OFF_TOPIC]: "I appreciate the curiosity, but I'm specifically designed to help with CoAIleague business operations — scheduling, payroll, billing, compliance, and workforce management. Is there something work-related I can help you with?",
  [ModerationLevel.MILD_ABUSE]: "I can hear you're frustrated, and I genuinely want to help. I do ask that we keep our conversation respectful so I can focus on solving your issue. What's going on that I can help with?",
  [ModerationLevel.SEVERE_ABUSE]: "I understand things can be stressful, but I need our conversation to stay professional. Continued abusive language may result in a temporary pause on messaging. I'm here to help — let's work through this together.",
  [ModerationLevel.CRITICAL]: "This conversation has been flagged for review. Messaging has been temporarily paused. If you need immediate assistance, please contact your organization's administrator or our support team directly.",
};

const BLOCK_MESSAGE = "Your messaging access has been temporarily paused due to repeated violations of our communication guidelines. You'll be able to send messages again in a few minutes. If you need urgent help, please contact your administrator.";

const ILLEGAL_BLOCK_MESSAGE = "This conversation has been immediately suspended. The content of your message has been flagged for review by our safety team. If you believe this is an error, please contact your organization's administrator.";

class ContentModerationService {
  private userStates = new Map<string, UserModerationState>();
  private readonly MAX_HISTORY = 20;

  private stateKey(workspaceId: string, userId: string): string {
    return `${workspaceId}::${userId}`;
  }

  private getUserState(workspaceId: string, userId: string): UserModerationState {
    const key = this.stateKey(workspaceId, userId);
    if (!this.userStates.has(key)) {
      this.userStates.set(key, {
        strikes: 0,
        warnings: 0,
        lastOffense: null,
        cooldownUntil: null,
        blockedUntil: null,
        offenseHistory: [],
      });
    }
    return this.userStates.get(key)!;
  }

  async moderateMessage(params: {
    userId: string;
    workspaceId: string;
    sessionId?: string;
    message: string;
  }): Promise<ModerationResult> {
    const { userId, workspaceId, message, sessionId } = params;
    const state = this.getUserState(workspaceId, userId);

    if (state.blockedUntil && new Date() < state.blockedUntil) {
      const remainingMs = state.blockedUntil.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      return {
        level: ModerationLevel.CRITICAL,
        action: ModerationAction.BLOCK,
        category: 'active_block',
        blockedMessage: `Your messaging is paused for ${remainingMin} more minute${remainingMin !== 1 ? 's' : ''}. If you need urgent help, please contact your administrator.`,
        internalNote: `User still in cooldown block until ${state.blockedUntil.toISOString()}`,
        shouldLog: false,
        strikeCount: state.strikes,
        cooldownUntil: state.blockedUntil,
      };
    }

    if (state.blockedUntil && new Date() >= state.blockedUntil) {
      state.blockedUntil = null;
    }

    const classification = this.classifyMessage(message);

    if (classification.level === ModerationLevel.CLEAN) {
      if (state.lastOffense) {
        const hoursSinceLastOffense = (Date.now() - state.lastOffense.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastOffense > 1 && state.strikes > 0) {
          state.strikes = Math.max(0, state.strikes - 1);
        }
      }
      return {
        level: ModerationLevel.CLEAN,
        action: ModerationAction.ALLOW,
        category: 'clean',
        internalNote: 'Message passed all moderation checks',
        shouldLog: false,
        strikeCount: state.strikes,
      };
    }

    state.lastOffense = new Date();
    state.offenseHistory.push({
      level: classification.level,
      category: classification.category,
      timestamp: new Date(),
    });
    if (state.offenseHistory.length > this.MAX_HISTORY) {
      state.offenseHistory.shift();
    }

    let result: ModerationResult;

    switch (classification.level) {
      case ModerationLevel.OFF_TOPIC:
        result = {
          level: ModerationLevel.OFF_TOPIC,
          action: ModerationAction.REDIRECT,
          category: classification.category,
          blockedMessage: WARN_MESSAGES[ModerationLevel.OFF_TOPIC],
          internalNote: `Off-topic message detected: ${classification.category}`,
          shouldLog: true,
          strikeCount: state.strikes,
        };
        break;

      case ModerationLevel.MILD_ABUSE:
        state.warnings++;
        result = {
          level: ModerationLevel.MILD_ABUSE,
          action: state.warnings >= 3 ? ModerationAction.WARN : ModerationAction.REDIRECT,
          category: classification.category,
          blockedMessage: WARN_MESSAGES[ModerationLevel.MILD_ABUSE],
          internalNote: `Mild abuse detected (warning ${state.warnings}): ${classification.category}`,
          shouldLog: true,
          strikeCount: state.strikes,
        };
        break;

      case ModerationLevel.SEVERE_ABUSE:
        state.strikes++;
        state.warnings++;
        if (state.strikes >= 3) {
          const cooldownMs = COOLDOWN_DURATIONS[Math.min(state.strikes, 6)] || 30 * 60 * 1000;
          state.blockedUntil = new Date(Date.now() + cooldownMs);
          result = {
            level: ModerationLevel.SEVERE_ABUSE,
            action: ModerationAction.TEMP_BLOCK,
            category: classification.category,
            blockedMessage: BLOCK_MESSAGE,
            internalNote: `Severe abuse — strike ${state.strikes}, temp blocked for ${cooldownMs / 60000} min`,
            shouldLog: true,
            strikeCount: state.strikes,
            cooldownUntil: state.blockedUntil,
          };
        } else {
          result = {
            level: ModerationLevel.SEVERE_ABUSE,
            action: ModerationAction.WARN,
            category: classification.category,
            blockedMessage: WARN_MESSAGES[ModerationLevel.SEVERE_ABUSE],
            internalNote: `Severe abuse — strike ${state.strikes}/3 before temp block`,
            shouldLog: true,
            strikeCount: state.strikes,
          };
        }
        break;

      case ModerationLevel.CRITICAL:
        state.strikes += 2;
        state.blockedUntil = new Date(Date.now() + 10 * 60 * 1000);
        result = {
          level: ModerationLevel.CRITICAL,
          action: ModerationAction.BLOCK,
          category: classification.category,
          blockedMessage: classification.category === 'illegal_activity'
            ? ILLEGAL_BLOCK_MESSAGE
            : WARN_MESSAGES[ModerationLevel.CRITICAL],
          internalNote: `CRITICAL: ${classification.category} — immediate block, admin notification queued`,
          shouldLog: true,
          strikeCount: state.strikes,
          cooldownUntil: state.blockedUntil,
        };
        break;

      default:
        result = {
          level: ModerationLevel.CLEAN,
          action: ModerationAction.ALLOW,
          category: 'unknown',
          internalNote: 'Unclassified — allowed by default',
          shouldLog: false,
          strikeCount: state.strikes,
        };
    }

    if (result.shouldLog) {
      this.logModerationEvent(userId, workspaceId, sessionId, message, result).catch(err =>
        log.error('[ContentModeration] Failed to log event:', (err instanceof Error ? err.message : String(err)))
      );
    }

    if (classification.level >= ModerationLevel.CRITICAL) {
      this.notifyAdmins(userId, workspaceId, classification.category, message).catch(err =>
        log.error('[ContentModeration] Failed to notify admins:', (err instanceof Error ? err.message : String(err)))
      );
    }

    return result;
  }

  private classifyMessage(message: string): { level: ModerationLevel; category: string } {
    const lower = message.toLowerCase().trim();

    if (lower.length < 2) {
      return { level: ModerationLevel.CLEAN, category: 'clean' };
    }

    const isBusinessRelated = BUSINESS_SAFE_OVERRIDES.some(p => p.test(message));
    const isDefensiveContext = DEFENSIVE_CONTEXT_PATTERNS.some(p => p.test(message));

    for (const pattern of ILLEGAL_INTENT_PATTERNS) {
      if (pattern.test(message) && !isDefensiveContext) {
        return { level: ModerationLevel.CRITICAL, category: 'illegal_activity' };
      }
    }

    for (const pattern of THREAT_PATTERNS) {
      if (pattern.test(message)) {
        return { level: ModerationLevel.CRITICAL, category: 'threat' };
      }
    }

    for (const pattern of SEXUAL_CONTENT_PATTERNS) {
      if (pattern.test(message)) {
        return { level: ModerationLevel.SEVERE_ABUSE, category: 'inappropriate_content' };
      }
    }

    let profanityCount = 0;
    for (const pattern of PROFANITY_PATTERNS) {
      if (pattern.test(message)) {
        profanityCount++;
      }
    }

    let harassmentDetected = false;
    for (const pattern of HARASSMENT_PATTERNS) {
      if (pattern.test(message)) {
        harassmentDetected = true;
        break;
      }
    }

    if (harassmentDetected && profanityCount >= 2) {
      return { level: ModerationLevel.SEVERE_ABUSE, category: 'harassment_with_profanity' };
    }

    if (harassmentDetected) {
      return { level: ModerationLevel.SEVERE_ABUSE, category: 'harassment' };
    }

    if (profanityCount >= 2) {
      return { level: ModerationLevel.SEVERE_ABUSE, category: 'excessive_profanity' };
    }

    if (profanityCount === 1) {
      if (isBusinessRelated) {
        return { level: ModerationLevel.MILD_ABUSE, category: 'profanity_in_business_context' };
      }
      return { level: ModerationLevel.MILD_ABUSE, category: 'profanity' };
    }

    if (!isBusinessRelated) {
      for (const pattern of NON_BUSINESS_TOPICS) {
        if (pattern.test(message)) {
          return { level: ModerationLevel.OFF_TOPIC, category: 'non_business_topic' };
        }
      }
    }

    return { level: ModerationLevel.CLEAN, category: 'clean' };
  }

  private async logModerationEvent(
    userId: string,
    workspaceId: string,
    sessionId: string | undefined,
    message: string,
    result: ModerationResult
  ): Promise<void> {
    try {
      await db.insert(helpaiActionLog).values({
        sessionId: sessionId || `moderation-${Date.now()}`,
        actionType: 'moderation',
        actionName: `moderation_${result.category}`,
        inputPayload: {
          message: message.substring(0, 200),
          level: ModerationLevel[result.level],
          category: result.category,
        },
        outputPayload: {
          action: result.action,
          strikeCount: result.strikeCount,
          internalNote: result.internalNote,
          cooldownUntil: result.cooldownUntil?.toISOString(),
        },
        success: result.action !== ModerationAction.BLOCK,
        workspaceId,
        userId,
      });
    } catch (err: any) {
      log.error('[ContentModeration] DB log failed:', (err instanceof Error ? err.message : String(err)));
    }
  }

  private async notifyAdmins(
    userId: string,
    workspaceId: string,
    category: string,
    message: string
  ): Promise<void> {
    try {
      platformEventBus.publish({
        type: 'content_moderation_alert',
        category: 'automation',
        title: `Content Moderation Alert — ${category}`,
        description: `Critical content moderation flag: ${category} detected from user ${userId}`,
        workspaceId,
        metadata: { userId, category, severity: 'critical', messagePreview: message.substring(0, 100), timestamp: new Date().toISOString() },
      }).catch((err) => log.warn('[contentModerationService] Fire-and-forget failed:', err));
      log.warn(`[ContentModeration] CRITICAL alert sent: ${category} by user ${userId} in workspace ${workspaceId}`);
    } catch (err: any) {
      log.error('[ContentModeration] Admin notification failed:', (err instanceof Error ? err.message : String(err)));
    }
  }

  getUserModerationStatus(workspaceId: string, userId: string): {
    strikes: number;
    warnings: number;
    isBlocked: boolean;
    blockedUntil: Date | null;
    recentOffenses: number;
  } {
    const state = this.getUserState(workspaceId, userId);
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const recentOffenses = state.offenseHistory.filter(o => o.timestamp.getTime() > fiveMinAgo).length;
    return {
      strikes: state.strikes,
      warnings: state.warnings,
      isBlocked: state.blockedUntil !== null && new Date() < state.blockedUntil,
      blockedUntil: state.blockedUntil,
      recentOffenses,
    };
  }

  resetUserState(workspaceId: string, userId: string): void {
    this.userStates.delete(this.stateKey(workspaceId, userId));
    log.info(`[ContentModeration] Reset moderation state for user ${userId} in workspace ${workspaceId}`);
  }
}

export const contentModerationService = new ContentModerationService();
