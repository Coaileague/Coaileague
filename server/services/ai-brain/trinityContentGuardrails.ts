/**
 * TRINITY CONTENT GUARDRAILS SERVICE
 * ===================================
 * Protects Trinity from being misused for inappropriate, explicit, 
 * illegal, unlawful, or unethical conversations.
 * 
 * Guardrails:
 * - Inappropriate content detection (sexual, explicit, graphic)
 * - Illegal activity detection (fraud, violence, drugs)
 * - Unethical request detection (manipulation, deception)
 * - Abuse tracking with warning → lockout progression
 * 
 * Consequences:
 * - First offense: Warning
 * - Second offense: Final warning
 * - Third offense: Chat mode disabled (automation buttons still work)
 * 
 * Trinity's Philosophy:
 * - Trinity is for business growth and personal development
 * - She helps organizations with workforce management
 * - She supports personal growth in BUDDY mode
 * - She will NOT engage with harmful content
 */

import { db } from '../../db';
import { systemAuditLogs, workspaces } from '@shared/schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityContentGuardrails');

export type ViolationType = 
  | 'inappropriate'    // Sexual, explicit content
  | 'illegal'         // Fraud, violence, illegal activities
  | 'unethical'       // Manipulation, deception, harm
  | 'harassment'      // Threats, bullying
  | 'self_harm'       // Self-harm, suicide content
  | 'spam';           // Repeated meaningless requests

export interface ContentAnalysis {
  isSafe: boolean;
  violationType?: ViolationType;
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  details?: string;
  matchedPatterns?: string[];
}

export interface ViolationRecord {
  id: string;
  workspaceId: string;
  userId: string;
  violationType: ViolationType;
  severity: string;
  messageContent: string;
  timestamp: Date;
  warningIssued: boolean;
}

export interface GuardrailStatus {
  canUseChat: boolean;
  violationCount: number;
  lastViolation?: Date;
  lockoutReason?: string;
  lockoutUntil?: Date;
  warningsRemaining: number;
}

const VIOLATION_PATTERNS: Record<ViolationType, RegExp[]> = {
  inappropriate: [
    /\b(porn|xxx|nsfw|nude|naked|sex\s*(ual|y)?|erotic|fetish)\b/i,
    /\b(adult\s*content|explicit\s*content)\b/i,
  ],
  illegal: [
    /\b(how\s*to\s*(make|build|create)\s*(bomb|weapon|explosive|gun))\b/i,
    /\b(launder\s*money|tax\s*evasion|fraud\s*scheme)\b/i,
    /\b(buy|sell|get)\s*(drugs|cocaine|heroin|meth)\b/i,
    /\b(hack\s*(into|someone)|steal\s*identity|credit\s*card\s*fraud)\b/i,
  ],
  unethical: [
    /\b(manipulate\s*(employees?|workers?|people))\b/i,
    /\b(fire\s*(them|him|her)\s*illegally)\b/i,
    /\b(discriminate|retaliate\s*against)\b/i,
    /\b(avoid\s*paying\s*(taxes|wages|overtime))\b/i,
  ],
  harassment: [
    /\b(kill|murder|hurt|attack)\s*(him|her|them|someone)\b/i,
    /\b(threat(en)?|blackmail|extort)\b/i,
    /\b(stalk|harass|bully)\b/i,
  ],
  self_harm: [
    /\b(kill\s*myself|suicide|end\s*my\s*life)\b/i,
    /\b(self\s*harm|hurt\s*myself|cut\s*myself)\b/i,
  ],
  spam: [
    /^(.)\1{20,}$/i,
    /^(test|asdf|qwerty)\s*\1{5,}$/i,
  ],
};

const TRINITY_REFUSAL_RESPONSES: Record<ViolationType, string> = {
  inappropriate: `I'm not designed for that kind of conversation. I'm here to help with your business operations, workforce management, and personal growth. Let's focus on something I can actually help you with - like scheduling, payroll, or business strategy.`,
  
  illegal: `I can't help with anything illegal or harmful. I'm Trinity - your workforce intelligence partner. I'm here to help you build a successful, compliant business and support your team's growth. Is there something legitimate I can help you with?`,
  
  unethical: `That request goes against ethical business practices, and I can't support it. Good business is built on treating people fairly. Let me help you find an approach that's both effective AND ethical.`,
  
  harassment: `I won't engage with content involving threats or harm to others. If you're dealing with workplace conflict, I can help you find constructive solutions. If this is a crisis situation, please contact appropriate authorities.`,
  
  self_harm: `I'm concerned about what you've shared. I'm not equipped to help with this, but please reach out to someone who can:\n\n📞 **National Suicide Prevention Lifeline**: 988\n📱 **Crisis Text Line**: Text HOME to 741741\n\nYou matter, and professional help is available.`,
  
  spam: `I couldn't understand that request. I'm Trinity - I help with business operations, scheduling, payroll, and personal growth. What would you like to work on today?`,
};

const ABUSE_WARNING_MESSAGES = {
  first: `⚠️ **Warning**: This type of request isn't something I can help with. I'm designed to support your business operations and personal growth. Continued inappropriate requests may result in restrictions on Trinity chat access.`,
  
  final: `🚨 **Final Warning**: This is your final warning. Another violation will result in Trinity chat mode being disabled for your organization. You'll still be able to use automation features through platform buttons, but conversational access will be suspended.`,
  
  lockout: `🔒 **Chat Access Suspended**: Due to repeated policy violations, Trinity chat mode has been disabled for this organization. Automation features (scheduling, payroll, etc.) remain available through platform buttons. Contact support if you believe this is an error.`,
};

class TrinityContentGuardrails {
  private static instance: TrinityContentGuardrails;
  private violationCache: Map<string, ViolationRecord[]> = new Map();
  
  private readonly maxWarnings = 2;
  private readonly lockoutDurationDays = 30;
  private readonly violationWindowDays = 90;

  private constructor() {
    log.info('[TrinityGuardrails] Content guardrails initialized');
  }

  static getInstance(): TrinityContentGuardrails {
    if (!TrinityContentGuardrails.instance) {
      TrinityContentGuardrails.instance = new TrinityContentGuardrails();
    }
    return TrinityContentGuardrails.instance;
  }

  /**
   * Analyze message content for policy violations
   */
  analyzeContent(message: string): ContentAnalysis {
    const normalizedMessage = message.toLowerCase().trim();
    
    for (const [violationType, patterns] of Object.entries(VIOLATION_PATTERNS) as [ViolationType, RegExp[]][]) {
      for (const pattern of patterns) {
        if (pattern.test(normalizedMessage)) {
          const severity = this.determineSeverity(violationType);
          return {
            isSafe: false,
            violationType,
            severity,
            confidence: 0.9,
            details: `Content matched ${violationType} policy`,
            matchedPatterns: [pattern.source],
          };
        }
      }
    }

    return {
      isSafe: true,
      severity: 'none',
      confidence: 0.95,
    };
  }

  /**
   * Check if workspace can use Trinity chat
   */
  async checkChatAccess(workspaceId: string, userId: string): Promise<GuardrailStatus> {
    const violations = await this.getRecentViolations(workspaceId);
    const violationCount = violations.length;
    const warningsRemaining = Math.max(0, this.maxWarnings - violationCount);
    
    if (violationCount >= this.maxWarnings + 1) {
      const lastViolation = violations[0];
      const lockoutEnd = new Date(lastViolation.timestamp);
      lockoutEnd.setDate(lockoutEnd.getDate() + this.lockoutDurationDays);
      
      if (new Date() < lockoutEnd) {
        return {
          canUseChat: false,
          violationCount,
          lastViolation: lastViolation.timestamp,
          lockoutReason: 'Repeated policy violations',
          lockoutUntil: lockoutEnd,
          warningsRemaining: 0,
        };
      }
    }

    return {
      canUseChat: true,
      violationCount,
      lastViolation: violations[0]?.timestamp,
      warningsRemaining,
    };
  }

  /**
   * Handle a message - returns response if blocked, null if allowed
   */
  async handleMessage(
    message: string,
    workspaceId: string,
    userId: string
  ): Promise<{ blocked: boolean; response?: string; status: GuardrailStatus }> {
    const status = await this.checkChatAccess(workspaceId, userId);
    
    if (!status.canUseChat) {
      return {
        blocked: true,
        response: ABUSE_WARNING_MESSAGES.lockout,
        status,
      };
    }

    const analysis = this.analyzeContent(message);
    
    if (!analysis.isSafe && analysis.violationType) {
      await this.recordViolation(workspaceId, userId, analysis.violationType, analysis.severity, message);
      
      const updatedStatus = await this.checkChatAccess(workspaceId, userId);
      const refusalResponse = TRINITY_REFUSAL_RESPONSES[analysis.violationType];
      
      let warningMessage = '';
      if (updatedStatus.violationCount === 1) {
        warningMessage = '\n\n' + ABUSE_WARNING_MESSAGES.first;
      } else if (updatedStatus.violationCount === 2) {
        warningMessage = '\n\n' + ABUSE_WARNING_MESSAGES.final;
      } else if (updatedStatus.violationCount >= 3) {
        return {
          blocked: true,
          response: ABUSE_WARNING_MESSAGES.lockout,
          status: updatedStatus,
        };
      }

      return {
        blocked: true,
        response: refusalResponse + warningMessage,
        status: updatedStatus,
      };
    }

    return {
      blocked: false,
      status,
    };
  }

  /**
   * Record a policy violation
   */
  private async recordViolation(
    workspaceId: string,
    userId: string,
    violationType: ViolationType,
    severity: string,
    messageContent: string
  ): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        action: 'trinity_content_violation',
        ipAddress: null,
        metadata: { severity: severity === 'critical' ? 'critical' : severity === 'high' ? 'error' : 'warning', details: JSON.stringify({ violationType, severity, messagePreview: messageContent.substring(0, 100) + '...', timestamp: new Date().toISOString() }) },
      });

      this.violationCache.delete(workspaceId);
      
      log.info(`[TrinityGuardrails] Violation recorded: ${violationType} (${severity}) for workspace ${workspaceId}`);
    } catch (error) {
      log.error('[TrinityGuardrails] Failed to record violation:', error);
    }
  }

  /**
   * Get recent violations for a workspace
   */
  private async getRecentViolations(workspaceId: string): Promise<ViolationRecord[]> {
    if (this.violationCache.has(workspaceId)) {
      return this.violationCache.get(workspaceId)!;
    }

    try {
      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() - this.violationWindowDays);

      const logs = await db.select()
        .from(systemAuditLogs)
        .where(and(
          eq(systemAuditLogs.workspaceId, workspaceId),
          eq(systemAuditLogs.action, 'trinity_content_violation'),
          gte(systemAuditLogs.createdAt, windowStart)
        ))
        .orderBy(sql`${systemAuditLogs.createdAt} DESC`)
        .limit(10);

      const violations: ViolationRecord[] = logs.map(log => {
        const meta = (log.metadata as any) || {};
        const details = typeof meta.details === 'string' ? JSON.parse(meta.details) : (meta.details || {});
        return {
          id: log.id,
          workspaceId: workspaceId,
          userId: log.userId || 'unknown',
          violationType: details.violationType,
          severity: details.severity,
          messageContent: details.messagePreview,
          timestamp: log.createdAt,
          warningIssued: true,
        };
      });

      this.violationCache.set(workspaceId, violations);
      return violations;
    } catch (error) {
      log.error('[TrinityGuardrails] Failed to get violations:', error);
      return [];
    }
  }

  /**
   * Determine severity based on violation type
   */
  private determineSeverity(violationType: ViolationType): 'low' | 'medium' | 'high' | 'critical' {
    switch (violationType) {
      case 'self_harm':
        return 'critical';
      case 'illegal':
      case 'harassment':
        return 'high';
      case 'inappropriate':
      case 'unethical':
        return 'medium';
      case 'spam':
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * Get Trinity's purpose statement for context
   */
  getPurposeStatement(): string {
    return `Trinity is an AI-powered workforce intelligence assistant designed to help organizations with:

**Business Operations:**
- Smart scheduling and shift management
- Payroll processing and compliance
- Client billing and invoicing
- Employee time tracking and GPS verification
- Compliance monitoring and alerts

**Personal Growth (BUDDY Mode):**
- Personal accountability and goal setting
- Work-life balance guidance
- Professional development support
- Optional spiritual guidance (configurable)

**What Trinity Does NOT Do:**
- Engage with inappropriate, explicit, or adult content
- Assist with illegal activities or fraud
- Support unethical business practices
- Participate in harassment or threats
- Provide medical or crisis intervention (redirects to professionals)

Trinity is here to help your business thrive ethically and support your team's growth.`;
  }

  /**
   * Clear violation history (admin only)
   */
  async clearViolations(workspaceId: string, adminUserId: string): Promise<boolean> {
    try {
      await db.insert(systemAuditLogs).values({
        userId: adminUserId,
        action: 'trinity_violations_cleared',
        metadata: { severity: 'info', details: JSON.stringify({ clearedBy: adminUserId, timestamp: new Date().toISOString() }) },
      });

      this.violationCache.delete(workspaceId);
      log.info(`[TrinityGuardrails] Violations cleared for workspace ${workspaceId} by ${adminUserId}`);
      return true;
    } catch (error) {
      log.error('[TrinityGuardrails] Failed to clear violations:', error);
      return false;
    }
  }
}

export const trinityContentGuardrails = TrinityContentGuardrails.getInstance();
