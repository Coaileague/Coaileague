import crypto from 'crypto';

/**
 * PLATFORM MAINTENANCE SERVICE
 * ============================
 * Enterprise-grade maintenance mode for CoAIleague platform.
 * 
 * Features:
 * - Lock platform during maintenance (end users can't log in)
 * - Broadcast announcements to all connected users
 * - Support roles + bots can bypass maintenance lock
 * - HelpAI can activate/deactivate via command
 * - All actions are audited and transparent to support staff
 * 
 * Transparency:
 * - Support roles see all moderation actions (kicks, bans, room closures)
 * - All destructive actions are logged and announced
 * - Nothing happens in secret
 */

import { db } from '../db';
import { systemAuditLogs, maintenanceAlerts } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { broadcastPlatformUpdateGlobal, broadcastToWorkspace } from '../websocket';
import { universalNotificationEngine } from './universalNotificationEngine';
import { ircEmitter } from './ircEventRegistry';
import { PLATFORM, HELPAI } from '@shared/platformConfig';
import { createLogger } from '../lib/logger';
const log = createLogger('platformMaintenanceService');


// Maintenance state (in-memory for speed, persisted to DB for durability)
interface MaintenanceState {
  isActive: boolean;
  activatedAt: Date | null;
  activatedBy: string | null;
  reason: string;
  estimatedEndTime: Date | null;
  bypassTokens: Set<string>; // Session tokens that can bypass
  allowedRoles: string[]; // Roles that can still access
}

const state: MaintenanceState = {
  isActive: false,
  activatedAt: null,
  activatedBy: null,
  reason: '',
  estimatedEndTime: null,
  bypassTokens: new Set(),
  allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'system'],
};

// Support announcement types for transparency
export type SupportAuditAction = 
  | 'user_kicked'
  | 'user_banned'
  | 'user_muted'
  | 'room_closed'
  | 'room_mode_changed'
  | 'message_deleted'
  | 'user_flagged'
  | 'maintenance_started'
  | 'maintenance_ended'
  | 'platform_broadcast'
  | 'unauthorized_command_attempt'
  | 'force_command_executed'
  | 'destructive_command_executed'
  | 'punishment_command_executed';

export interface SupportAuditEvent {
  action: SupportAuditAction;
  targetUserId?: string;
  targetUserName?: string;
  targetRoomId?: string;
  targetRoomName?: string;
  performedBy: string;
  performedByRole: string;
  reason: string;
  metadata?: Record<string, unknown>;
}

class PlatformMaintenanceService {
  private supportChannelId = 'support-announcements';
  
  /**
   * Activate maintenance mode
   * Locks platform for end users, bots and support can still operate
   */
  async activateMaintenance(
    activatedBy: string,
    reason: string,
    estimatedMinutes?: number,
    bypassToken?: string
  ): Promise<{ success: boolean; message: string }> {
    if (state.isActive) {
      return { success: false, message: 'Maintenance mode is already active' };
    }
    
    state.isActive = true;
    state.activatedAt = new Date();
    state.activatedBy = activatedBy;
    state.reason = reason;
    state.estimatedEndTime = estimatedMinutes 
      ? new Date(Date.now() + estimatedMinutes * 60 * 1000)
      : null;
    
    if (bypassToken) {
      state.bypassTokens.add(bypassToken);
    }
    
    // Persist to database
    try {
      await db.insert(maintenanceAlerts).values({
        title: 'Maintenance Mode Activated',
        description: reason,
        severity: 'warning',
        scheduledStartTime: state.activatedAt || new Date(),
        scheduledEndTime: state.estimatedEndTime || new Date(Date.now() + 3600000),
        createdById: activatedBy,
        affectedServices: ['platform'],
        status: 'in_progress',
      });
    } catch (err) {
      log.error('[Maintenance] Failed to persist to DB:', err);
    }
    
    // Broadcast to all connected users
    await this.broadcastMaintenanceNotice(true, reason, state.estimatedEndTime);
    
    // Announce to support staff
    await this.announceToSupport({
      action: 'maintenance_started',
      performedBy: activatedBy,
      performedByRole: 'system',
      reason,
      metadata: { estimatedMinutes },
    });
    
    log.info(`[Maintenance] ACTIVATED by ${activatedBy}: ${reason}`);
    return { success: true, message: `Maintenance mode activated. Reason: ${reason}` };
  }
  
  /**
   * Deactivate maintenance mode
   */
  async deactivateMaintenance(
    deactivatedBy: string
  ): Promise<{ success: boolean; message: string }> {
    if (!state.isActive) {
      return { success: false, message: 'Maintenance mode is not active' };
    }
    
    const duration = state.activatedAt 
      ? Math.round((Date.now() - state.activatedAt.getTime()) / 60000)
      : 0;
    
    state.isActive = false;
    state.activatedAt = null;
    state.activatedBy = null;
    state.reason = '';
    state.estimatedEndTime = null;
    state.bypassTokens.clear();
    
    // Broadcast all clear
    await this.broadcastMaintenanceNotice(false);
    
    // Announce to support staff
    await this.announceToSupport({
      action: 'maintenance_ended',
      performedBy: deactivatedBy,
      performedByRole: 'system',
      reason: `Maintenance completed after ${duration} minutes`,
    });
    
    log.info(`[Maintenance] DEACTIVATED by ${deactivatedBy} after ${duration} minutes`);
    return { success: true, message: `Maintenance mode deactivated. Duration: ${duration} minutes` };
  }
  
  /**
   * Check if a user can access the platform
   * Returns false if maintenance is active and user doesn't have bypass
   */
  canAccess(
    userId: string,
    userRole: string,
    platformRole?: string,
    sessionToken?: string
  ): { allowed: boolean; reason?: string } {
    if (!state.isActive) {
      return { allowed: true };
    }
    
    // Check bypass token
    if (sessionToken && state.bypassTokens.has(sessionToken)) {
      return { allowed: true };
    }
    
    // Check allowed roles
    const allRoles = [userRole, platformRole].filter(Boolean) as string[];
    if (allRoles.some(role => state.allowedRoles.includes(role))) {
      return { allowed: true };
    }
    
    // System users always bypass
    if (userId === 'system' || userId === (HELPAI as any).userId || userId.startsWith('bot_')) {
      return { allowed: true };
    }
    
    return {
      allowed: false,
      reason: `Platform is under maintenance: ${state.reason}. Please try again later.`,
    };
  }
  
  /**
   * Get current maintenance status
   */
  getStatus(): {
    isActive: boolean;
    reason: string;
    activatedAt: Date | null;
    activatedBy: string | null;
    estimatedEndTime: Date | null;
  } {
    return {
      isActive: state.isActive,
      reason: state.reason,
      activatedAt: state.activatedAt,
      activatedBy: state.activatedBy,
      estimatedEndTime: state.estimatedEndTime,
    };
  }
  
  /**
   * Generate a bypass token for HelpAI/bots
   */
  generateBypassToken(forUser: string): string {
    const token = `bypass_${forUser}_${Date.now()}_${crypto.randomUUID()}`;
    state.bypassTokens.add(token);
    return token;
  }
  
  /**
   * Broadcast maintenance notice to all connected users
   */
  private async broadcastMaintenanceNotice(
    starting: boolean,
    reason?: string,
    estimatedEnd?: Date | null
  ): Promise<void> {
    const title = starting 
      ? `${PLATFORM.name} Maintenance` 
      : `${PLATFORM.name} Back Online`;
    
    const message = starting
      ? `The platform is undergoing scheduled maintenance. ${reason || ''}${estimatedEnd ? ` Expected completion: ${estimatedEnd.toLocaleTimeString()}.` : ''}`
      : `Maintenance complete. All services are now available.`;
    
    // Use Universal Notification Engine for platform-wide broadcast
    try {
      await universalNotificationEngine.sendPlatformUpdate({
        title,
        summary: message,
        type: 'announcement',
        priority: starting ? 'high' : 'normal',
        metadata: {
          isMaintenance: true,
          maintenanceActive: starting,
          skipFeatureCheck: true,
        },
      });
    } catch (err) {
      log.error('[Maintenance] Failed to create platform update:', err);
    }
    
    // Also broadcast via WebSocket for immediate delivery
    broadcastPlatformUpdateGlobal({
      id: `maintenance_${Date.now()}`,
      title,
      summary: message,
      type: 'announcement',
      priority: starting ? 'high' : 'normal',
    });
  }
  
  /**
   * Announce audit events to support staff only
   * Keeps all moderation actions transparent
   */
  async announceToSupport(event: SupportAuditEvent): Promise<void> {
    const timestamp = new Date().toISOString();
    
    // Format message based on action type
    const messages: Record<SupportAuditAction, string> = {
      user_kicked: `${event.performedBy} kicked ${event.targetUserName || event.targetUserId} from ${event.targetRoomName || 'room'}. Reason: ${event.reason}`,
      user_banned: `${event.performedBy} banned ${event.targetUserName || event.targetUserId}. Reason: ${event.reason}`,
      user_muted: `${event.performedBy} muted ${event.targetUserName || event.targetUserId}. Reason: ${event.reason}`,
      room_closed: `${event.performedBy} closed room ${event.targetRoomName || event.targetRoomId}. Reason: ${event.reason}`,
      room_mode_changed: `${event.performedBy} changed mode for ${event.targetRoomName || event.targetRoomId}. ${event.reason}`,
      message_deleted: `${event.performedBy} deleted message from ${event.targetUserName || event.targetUserId}. Reason: ${event.reason}`,
      user_flagged: `${event.performedBy} flagged ${event.targetUserName || event.targetUserId}. Reason: ${event.reason}`,
      maintenance_started: `MAINTENANCE STARTED by ${event.performedBy}. ${event.reason}`,
      maintenance_ended: `MAINTENANCE ENDED by ${event.performedBy}. ${event.reason}`,
      platform_broadcast: `PLATFORM BROADCAST by ${event.performedBy}: ${event.reason}`,
      unauthorized_command_attempt: `SECURITY ALERT: ${event.performedBy} attempted unauthorized command. ${event.reason}`,
      force_command_executed: `FORCE COMMAND: ${event.performedBy} executed force command. ${event.reason}`,
      destructive_command_executed: `DESTRUCTIVE: ${event.performedBy} executed destructive command. ${event.reason}`,
      punishment_command_executed: `PUNISHMENT: ${event.performedBy} executed punishment on ${event.targetUserName || event.targetUserId}. ${event.reason}`,
    };
    
    const message = messages[event.action] || `${event.action}: ${event.reason}`;
    
    // Log to audit table
    try {
      await db.insert(systemAuditLogs).values({
        action: event.action,
        entityType: 'moderation',
        metadata: { performedBy: event.performedBy, performedByRole: event.performedByRole, targetId: event.targetUserId || event.targetRoomId, targetType: event.targetUserId ? 'user' : 'room',
        details: {
          ...event,
          message,
          timestamp,
        }, severity: this.getActionSeverity(event.action) },
      });
    } catch (err) {
      log.error('[SupportAudit] Failed to log:', err);
    }
    
    // Emit IRC event for support channel
    (ircEmitter as any).systemMessage({
      roomId: this.supportChannelId,
      content: `[AUDIT] ${message}`,
      metadata: {
        auditAction: event.action,
        performedBy: event.performedBy,
        timestamp,
      },
    });
    
    // Send notification to support roles
    try {
      await universalNotificationEngine.sendNotification({
        workspaceId: '*', // Platform-wide
        idempotencyKey: `notif-${Date.now()}`,
          type: 'system',
        title: 'Support Audit',
        message,
        severity: this.getActionSeverity(event.action) as any,
        targetRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
        metadata: {
          auditEvent: event,
          skipFeatureCheck: true,
        },
      });
    } catch (err) {
      log.error('[SupportAudit] Failed to notify:', err);
    }
    
    log.info(`[SupportAudit] ${event.action}: ${message}`);
  }
  
  /**
   * Send a platform-wide broadcast message
   * For downtime notices, announcements, etc.
   */
  async broadcastPlatformMessage(
    sender: string,
    title: string,
    message: string,
    priority: 'low' | 'normal' | 'high' | 'critical' = 'normal'
  ): Promise<{ success: boolean; reachedCount: number }> {
    // Create platform update
    try {
      await universalNotificationEngine.sendPlatformUpdate({
        title,
        summary: message,
        type: 'announcement',
        priority,
        metadata: {
          sender,
          skipFeatureCheck: true,
        },
      });
    } catch (err) {
      log.error('[Broadcast] Failed to create platform update:', err);
    }
    
    // WebSocket broadcast
    broadcastPlatformUpdateGlobal({
      id: `broadcast_${Date.now()}`,
      title,
      summary: message,
      type: 'announcement',
      priority,
    });
    
    // Log the broadcast
    await this.announceToSupport({
      action: 'platform_broadcast',
      performedBy: sender,
      performedByRole: 'system',
      reason: `${title}: ${message}`,
    });
    
    return { success: true, reachedCount: -1 }; // -1 means all connected
  }
  
  private getActionSeverity(action: SupportAuditAction): 'info' | 'warning' | 'error' | 'critical' {
    const severities: Record<SupportAuditAction, 'info' | 'warning' | 'error' | 'critical'> = {
      user_kicked: 'warning',
      user_banned: 'error',
      user_muted: 'info',
      room_closed: 'warning',
      room_mode_changed: 'info',
      message_deleted: 'warning',
      user_flagged: 'warning',
      maintenance_started: 'critical',
      maintenance_ended: 'info',
      platform_broadcast: 'info',
    };
    return severities[action] || 'info';
  }
}

export const platformMaintenanceService = new PlatformMaintenanceService();

// HelpAI Command Handler for maintenance
export const HELPAI_MAINTENANCE_COMMANDS = {
  '/maintenance': {
    usage: '/maintenance <on|off|status> [reason] [minutes]',
    description: 'Control platform maintenance mode',
    minRole: 'sysop',
    async execute(args: string[], userId: string, userRole: string): Promise<string> {
      const [action, ...rest] = args;
      
      switch (action?.toLowerCase()) {
        case 'on':
        case 'start':
        case 'enable': {
          const reason = rest.filter(r => isNaN(parseInt(r))).join(' ') || 'Scheduled maintenance';
          const minutes = parseInt(rest.find(r => !isNaN(parseInt(r))) || '');
          const result = await platformMaintenanceService.activateMaintenance(
            userId,
            reason,
            isNaN(minutes) ? undefined : minutes
          );
          return result.message;
        }
        
        case 'off':
        case 'stop':
        case 'disable': {
          const result = await platformMaintenanceService.deactivateMaintenance(userId);
          return result.message;
        }
        
        case 'status':
        default: {
          const status = platformMaintenanceService.getStatus();
          if (!status.isActive) {
            return 'Platform is operating normally. No maintenance active.';
          }
          const eta = status.estimatedEndTime 
            ? ` ETA: ${status.estimatedEndTime.toLocaleTimeString()}`
            : '';
          return `MAINTENANCE ACTIVE since ${status.activatedAt?.toLocaleTimeString()}. Reason: ${status.reason}${eta}`;
        }
      }
    },
  },
  
  '/broadcast': {
    usage: '/broadcast <message>',
    description: 'Send platform-wide announcement',
    minRole: 'support_manager',
    async execute(args: string[], userId: string): Promise<string> {
      const message = args.join(' ');
      if (!message) {
        return 'Usage: /broadcast <message>';
      }
      await platformMaintenanceService.broadcastPlatformMessage(
        userId,
        'Platform Announcement',
        message,
        'high'
      );
      return `Broadcast sent: ${message}`;
    },
  },
};
