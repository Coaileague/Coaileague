/**
 * Priority Message Service
 * Handles priority messages with acknowledgment and escalation
 */

import {
  PriorityMessage,
  MessagePriority,
  MessageEscalation,
  MessageAck,
  PRIORITY_CONFIG
} from '@shared/types/fieldOperations';
import { fieldOpsConfigRegistry } from '@shared/config/fieldOperationsConfig';
import { createLogger } from '../../lib/logger';
const log = createLogger('priorityMessageService');


interface SendPriorityParams {
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  priority: MessagePriority;
  requiresAck?: boolean;
  ackDeadlineMinutes?: number;
}

class PriorityMessageService {
  private messages: Map<string, PriorityMessage> = new Map();
  private escalationChains: Map<string, string[]> = new Map();
  private pendingAcks: Set<string> = new Set();
  
  async sendPriorityMessage(params: SendPriorityParams, orgId: string): Promise<PriorityMessage> {
    const { roomId, senderId, senderName, content, priority, requiresAck, ackDeadlineMinutes } = params;
    const config = fieldOpsConfigRegistry.getConfig(orgId);
    
    const message: PriorityMessage = {
      id: this.generateId(),
      roomId,
      senderId,
      senderName,
      content,
      timestamp: new Date(),
      priority,
      requiresAck: requiresAck ?? priority >= MessagePriority.URGENT,
      ackDeadlineMinutes: ackDeadlineMinutes ?? this.getDefaultDeadline(priority, config)
    };
    
    if (priority >= MessagePriority.URGENT && config.priorityMessages.escalationEnabled) {
      const chain = await this.getEscalationChain(roomId, senderId);
      message.escalation = {
        enabled: true,
        chain,
        currentLevel: 0
      };
    }
    
    this.messages.set(message.id, message);
    
    if (message.requiresAck) {
      this.pendingAcks.add(message.id);
      this.scheduleAckCheck(message, config);
    }
    
    if (priority === MessagePriority.PANIC) {
      await this.triggerPanicProtocol(message);
    }
    
    log.info(`[PriorityMessage] Sent ${MessagePriority[priority]} message: ${message.id}`);
    
    return message;
  }
  
  async acknowledgeMessage(messageId: string, userId: string, userName: string, response?: string): Promise<void> {
    const message = this.messages.get(messageId);
    if (!message) throw new Error(`Message not found: ${messageId}`);
    
    message.ack = {
      acknowledged: true,
      acknowledgedBy: userName,
      acknowledgedAt: new Date(),
      response
    };
    
    this.pendingAcks.delete(messageId);
    this.messages.set(messageId, message);
    
    log.info(`[PriorityMessage] Message ${messageId} acknowledged by ${userName}`);
  }
  
  async checkUnacknowledged(): Promise<void> {
    const now = Date.now();
    
    for (const messageId of this.pendingAcks) {
      const message = this.messages.get(messageId);
      if (!message || message.ack?.acknowledged) {
        this.pendingAcks.delete(messageId);
        continue;
      }
      
      const deadlineMs = (message.ackDeadlineMinutes || 30) * 60 * 1000;
      const elapsed = now - message.timestamp.getTime();
      
      if (elapsed > deadlineMs) {
        await this.escalate(message);
      }
    }
  }
  
  private async escalate(message: PriorityMessage): Promise<void> {
    const { escalation } = message;
    if (!escalation) return;
    
    escalation.currentLevel++;
    
    if (escalation.currentLevel >= escalation.chain.length) {
      await this.triggerMaxEscalation(message);
      return;
    }
    
    const nextRecipient = escalation.chain[escalation.currentLevel];
    escalation.escalatedAt = new Date();
    
    this.messages.set(message.id, message);
    
    log.info(`[PriorityMessage] Escalated message ${message.id} to level ${escalation.currentLevel}`);
  }
  
  private async triggerMaxEscalation(message: PriorityMessage): Promise<void> {
    log.info(`[PriorityMessage] MAX ESCALATION reached for message ${message.id}`);
  }
  
  private async triggerPanicProtocol(message: PriorityMessage): Promise<void> {
    log.info(`[PriorityMessage] PANIC protocol triggered by message ${message.id}`);
  }
  
  private async getEscalationChain(roomId: string, senderId: string): Promise<string[]> {
    return this.escalationChains.get(roomId) || [];
  }
  
  setEscalationChain(roomId: string, chain: string[]): void {
    this.escalationChains.set(roomId, chain);
  }
  
  private getDefaultDeadline(priority: MessagePriority, config: any): number {
    const deadlines = config.priorityMessages.defaultAckDeadlines;
    switch (priority) {
      case MessagePriority.IMPORTANT: return deadlines.important;
      case MessagePriority.URGENT: return deadlines.urgent;
      case MessagePriority.EMERGENCY: return deadlines.emergency;
      case MessagePriority.PANIC: return deadlines.panic;
      default: return 60;
    }
  }
  
  private scheduleAckCheck(message: PriorityMessage, config: any): void {
    const deadlineMs = (message.ackDeadlineMinutes || 30) * 60 * 1000;
    setTimeout(() => this.checkMessageAck(message.id), deadlineMs);
  }
  
  private async checkMessageAck(messageId: string): Promise<void> {
    const message = this.messages.get(messageId);
    if (!message || message.ack?.acknowledged) return;
    
    await this.escalate(message);
  }
  
  async getUnacknowledged(roomId?: string): Promise<PriorityMessage[]> {
    const messages = Array.from(this.messages.values()).filter(
      m => !m.ack?.acknowledged && this.pendingAcks.has(m.id)
    );
    
    if (roomId) {
      return messages.filter(m => m.roomId === roomId);
    }
    
    return messages;
  }
  
  async get(messageId: string): Promise<PriorityMessage | undefined> {
    return this.messages.get(messageId);
  }
  
  private generateId(): string {
    return `pmsg_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`;
  }
}

export const priorityMessageService = new PriorityMessageService();
