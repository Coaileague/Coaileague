/**
 * Bot Pool Manager - Manages bot instances across rooms
 * Handles deployment, routing, lifecycle, and resource limits
 */

import { BOT_REGISTRY, BotDefinition } from './registry';
import { RoomMode, ChatRoom } from '@shared/types/chat';
import { randomUUID } from 'crypto';
import { ircEmitter, IRC_EVENTS } from '../services/ircEventRegistry';
import { createLogger } from '../lib/logger';
const log = createLogger('botsPool');


export type BotInstanceStatus = 'active' | 'idle' | 'processing' | 'error' | 'terminating';

export interface BotInstance {
  id: string;
  botId: string;
  roomId: string;
  orgId: string;
  status: BotInstanceStatus;
  sessionData: Record<string, any>;
  startedAt: Date;
  lastActivityAt: Date;
  messageCount: number;
  errorCount: number;
}

export interface BotMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

class BotPoolManagerClass {
  private instances: Map<string, BotInstance> = new Map();
  private roomBots: Map<string, Set<string>> = new Map();
  private orgBotCounts: Map<string, Map<string, number>> = new Map();
  private timeoutCheckers: Map<string, NodeJS.Timeout> = new Map();

  async deployBot(botId: string, roomId: string, orgId: string): Promise<BotInstance> {
    const definition = BOT_REGISTRY[botId];
    if (!definition) {
      throw new Error(`Unknown bot: ${botId}`);
    }

    const existingInRoom = this.getBotInRoom(roomId, botId);
    if (existingInRoom) {
      log.info(`[BotPool] Bot ${botId} already deployed in room ${roomId}`);
      return existingInRoom;
    }

    const orgInstances = this.getOrgInstances(orgId, botId);
    if (orgInstances.length >= definition.limits.maxPerOrg) {
      throw new Error(`Max ${botId} instances (${definition.limits.maxPerOrg}) reached for org ${orgId}`);
    }

    const totalInstances = this.getBotInstances(botId);
    if (totalInstances.length >= definition.limits.maxConcurrentSessions) {
      throw new Error(`Max concurrent sessions (${definition.limits.maxConcurrentSessions}) reached for ${botId}`);
    }

    const instance: BotInstance = {
      id: `${botId}-${randomUUID().slice(0, 8)}`,
      botId,
      roomId,
      orgId,
      status: 'active',
      sessionData: {},
      startedAt: new Date(),
      lastActivityAt: new Date(),
      messageCount: 0,
      errorCount: 0
    };

    this.instances.set(instance.id, instance);

    if (!this.roomBots.has(roomId)) {
      this.roomBots.set(roomId, new Set());
    }
    this.roomBots.get(roomId)!.add(instance.id);

    if (!this.orgBotCounts.has(orgId)) {
      this.orgBotCounts.set(orgId, new Map());
    }
    const orgCounts = this.orgBotCounts.get(orgId)!;
    orgCounts.set(botId, (orgCounts.get(botId) || 0) + 1);

    ircEmitter.emit({
      event: IRC_EVENTS.JOIN,
      roomId,
      userId: instance.id,
      userName: definition.name,
      userRole: 'bot',
      isBot: true,
      timestamp: Date.now(),
    });

    log.info(`[BotPool] Deployed ${botId} (${instance.id}) to room ${roomId}`);

    if (definition.presence === 'session' && definition.limits.timeoutMinutes > 0) {
      this.scheduleTimeoutCheck(instance, definition.limits.timeoutMinutes);
    }

    return instance;
  }

  async terminateBot(instanceId: string, reason: 'manual' | 'timeout' | 'error' | 'complete'): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      log.warn(`[BotPool] Cannot terminate unknown instance: ${instanceId}`);
      return;
    }

    instance.status = 'terminating';
    const definition = BOT_REGISTRY[instance.botId];

    ircEmitter.emit({
      event: IRC_EVENTS.PART,
      roomId: instance.roomId,
      userId: instance.id,
      userName: definition?.name || instance.botId,
      reason: `Bot terminated: ${reason}`,
      timestamp: Date.now(),
    });

    if (reason === 'timeout' || reason === 'complete') {
      await this.triggerBotOutput(instance);
    }

    const timeout = this.timeoutCheckers.get(instanceId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeoutCheckers.delete(instanceId);
    }

    this.instances.delete(instanceId);
    this.roomBots.get(instance.roomId)?.delete(instanceId);

    const orgCounts = this.orgBotCounts.get(instance.orgId);
    if (orgCounts) {
      const count = orgCounts.get(instance.botId) || 0;
      if (count > 1) {
        orgCounts.set(instance.botId, count - 1);
      } else {
        orgCounts.delete(instance.botId);
      }
    }

    log.info(`[BotPool] Terminated ${instance.botId} (${instanceId}), reason: ${reason}`);
  }

  async routeMessage(roomId: string, message: BotMessage): Promise<void> {
    const botInstanceIds = this.roomBots.get(roomId);
    if (!botInstanceIds || botInstanceIds.size === 0) return;

    for (const instanceId of botInstanceIds) {
      const instance = this.instances.get(instanceId);
      if (!instance || instance.status === 'terminating') continue;

      const definition = BOT_REGISTRY[instance.botId];
      if (!definition) continue;

      if (this.shouldTrigger(definition, message.content)) {
        instance.lastActivityAt = new Date();
        instance.messageCount++;
        
        try {
          instance.status = 'processing';
          await this.handleBotMessage(instance, message);
          instance.status = 'active';
        } catch (error) {
          instance.errorCount++;
          instance.status = 'error';
          log.error(`[BotPool] Error in ${instance.botId}:`, error);
          
          if (instance.errorCount >= 5) {
            await this.terminateBot(instanceId, 'error');
          }
        }
      }
    }
  }

  private shouldTrigger(definition: BotDefinition, content: string): boolean {
    if (content.startsWith('/')) {
      const cmd = content.split(' ')[0].toLowerCase();
      if (definition.triggers.commands.includes(cmd)) return true;
    }

    for (const pattern of definition.triggers.patterns) {
      if (pattern.test(content)) return true;
    }

    return false;
  }

  private async handleBotMessage(instance: BotInstance, message: BotMessage): Promise<void> {
    log.info(`[BotPool] ${instance.botId} processing message in ${instance.roomId}`);
  }

  private async triggerBotOutput(instance: BotInstance): Promise<void> {
    log.info(`[BotPool] Triggering output pipeline for ${instance.botId}`);
  }

  private scheduleTimeoutCheck(instance: BotInstance, timeoutMinutes: number): void {
    const timeoutMs = timeoutMinutes * 60 * 1000;
    
    const checkTimeout = () => {
      const inst = this.instances.get(instance.id);
      if (!inst) return;
      
      const idleTime = Date.now() - inst.lastActivityAt.getTime();
      if (idleTime >= timeoutMs) {
        log.info(`[BotPool] ${inst.botId} timed out in ${inst.roomId}`);
        this.terminateBot(inst.id, 'timeout');
      } else {
        const nextCheck = Math.min(timeoutMs - idleTime + 1000, timeoutMs);
        this.timeoutCheckers.set(instance.id, setTimeout(checkTimeout, nextCheck));
      }
    };
    
    this.timeoutCheckers.set(instance.id, setTimeout(checkTimeout, timeoutMs));
  }

  getBotInRoom(roomId: string, botId: string): BotInstance | undefined {
    const instanceIds = this.roomBots.get(roomId);
    if (!instanceIds) return undefined;
    
    for (const id of instanceIds) {
      const instance = this.instances.get(id);
      if (instance?.botId === botId) return instance;
    }
    return undefined;
  }

  getRoomBots(roomId: string): BotInstance[] {
    const instanceIds = this.roomBots.get(roomId);
    if (!instanceIds) return [];
    
    return Array.from(instanceIds)
      .map(id => this.instances.get(id))
      .filter((inst): inst is BotInstance => inst !== undefined);
  }

  getBotInstances(botId: string): BotInstance[] {
    return Array.from(this.instances.values()).filter(inst => inst.botId === botId);
  }

  getOrgInstances(orgId: string, botId: string): BotInstance[] {
    return Array.from(this.instances.values()).filter(
      inst => inst.orgId === orgId && inst.botId === botId
    );
  }

  getAllInstances(): BotInstance[] {
    return Array.from(this.instances.values());
  }

  getStats(): {
    totalInstances: number;
    instancesByBot: Record<string, number>;
    instancesByOrg: Record<string, number>;
    roomsWithBots: number;
  } {
    const instancesByBot: Record<string, number> = {};
    const instancesByOrg: Record<string, number> = {};
    
    for (const instance of this.instances.values()) {
      instancesByBot[instance.botId] = (instancesByBot[instance.botId] || 0) + 1;
      instancesByOrg[instance.orgId] = (instancesByOrg[instance.orgId] || 0) + 1;
    }
    
    return {
      totalInstances: this.instances.size,
      instancesByBot,
      instancesByOrg,
      roomsWithBots: this.roomBots.size
    };
  }

  async autoDeployBotsForRoom(room: ChatRoom): Promise<BotInstance[]> {
    const deployed: BotInstance[] = [];
    
    for (const mode of room.modes) {
      const bots = Object.values(BOT_REGISTRY).filter(
        bot => bot.targetModes.includes(mode) && bot.presence === 'persistent'
      );
      
      for (const bot of bots) {
        try {
          const instance = await this.deployBot(bot.id, room.id, room.orgId);
          deployed.push(instance);
        } catch (error) {
          log.error(`[BotPool] Failed to auto-deploy ${bot.id}:`, error);
        }
      }
    }
    
    return deployed;
  }

  shutdown(): void {
    log.info('[BotPool] Shutting down...');
    
    for (const timeout of this.timeoutCheckers.values()) {
      clearTimeout(timeout);
    }
    this.timeoutCheckers.clear();
    
    for (const instanceId of this.instances.keys()) {
      this.terminateBot(instanceId, 'manual');
    }
    
    log.info('[BotPool] Shutdown complete');
  }
}

export const botPool = new BotPoolManagerClass();

log.info('[BotPool] Bot Pool Manager initialized');
