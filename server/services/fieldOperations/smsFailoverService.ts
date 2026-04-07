/**
 * SMS Failover Service
 * Backup delivery for urgent messages when primary channels fail
 * Wired to real smsService for Twilio delivery
 */

import { MessagePriority } from '@shared/types/fieldOperations';
import { fieldOpsConfigRegistry } from '@shared/config/fieldOperationsConfig';
import { sendSMS as sendRealSMS } from '../smsService'; // infra
import { createLogger } from '../../lib/logger';
const log = createLogger('smsFailoverService');


interface SendParams {
  userId: string;
  userName: string;
  phone?: string;
  message: string;
  priority: MessagePriority;
  orgId: string;
}

interface PendingMessage {
  id: string;
  userId: string;
  message: string;
  priority: MessagePriority;
  sentAt: Date;
  delivered: boolean;
}

class SMSFailoverService {
  private pendingMessages: Map<string, PendingMessage[]> = new Map();
  private userPhones: Map<string, string> = new Map();
  private lastSeen: Map<string, Date> = new Map();
  
  async sendWithFailover(params: SendParams): Promise<boolean> {
    const { userId, userName, phone, message, priority, orgId } = params;
    const config = fieldOpsConfigRegistry.getConfig(orgId);
    
    const delivered = await this.tryPrimaryDelivery(userId, message);
    
    if (!delivered && priority >= MessagePriority.URGENT && config.priorityMessages.smsFailoverEnabled) {
      const userPhone = phone || this.userPhones.get(userId);
      if (userPhone) {
        await this.sendSMS(userId, userName, userPhone, message, orgId); // infra
        return true;
      } else {
        log.warn(`[SMSFailover] No phone number for user ${userId}`);
        return false;
      }
    }
    
    return delivered;
  }
  
  async checkAndFailover(userId: string, orgId: string): Promise<void> {
    const config = fieldOpsConfigRegistry.getConfig(orgId);
    
    if (!config.priorityMessages.smsFailoverEnabled) return;
    
    const lastSeenTime = this.lastSeen.get(userId);
    const failoverMinutes = config.priorityMessages.smsFailoverAfterMinutes;
    
    if (lastSeenTime && Date.now() - lastSeenTime.getTime() > failoverMinutes * 60 * 1000) {
      const pendingUrgent = this.getPendingUrgent(userId);
      
      if (pendingUrgent.length > 0) {
        const userPhone = this.userPhones.get(userId);
        if (userPhone) {
          const summary = this.summarizeMessages(pendingUrgent);
          await this.sendSMS(userId, 'User', userPhone, summary, orgId); // infra
        }
      }
    }
  }
  
  async trackDelivery(userId: string, messageId: string, delivered: boolean): Promise<void> {
    const pending = this.pendingMessages.get(userId) || [];
    const message = pending.find(m => m.id === messageId);
    
    if (message) {
      message.delivered = delivered;
      this.pendingMessages.set(userId, pending);
    }
  }
  
  async updateLastSeen(userId: string): Promise<void> {
    this.lastSeen.set(userId, new Date());
  }
  
  setUserPhone(userId: string, phone: string): void {
    this.userPhones.set(userId, phone);
  }
  
  addPendingMessage(userId: string, message: PendingMessage): void {
    const pending = this.pendingMessages.get(userId) || [];
    pending.push(message);
    this.pendingMessages.set(userId, pending);
  }
  
  private async tryPrimaryDelivery(userId: string, message: string): Promise<boolean> {
    const lastSeen = this.lastSeen.get(userId);
    
    if (!lastSeen) return false;
    
    const minutesSinceLastSeen = (Date.now() - lastSeen.getTime()) / 60000;
    return minutesSinceLastSeen < 1;
  }
  
  private getPendingUrgent(userId: string): PendingMessage[] {
    const pending = this.pendingMessages.get(userId) || [];
    return pending.filter(m => !m.delivered && m.priority >= MessagePriority.URGENT);
  }
  
  private summarizeMessages(messages: PendingMessage[]): string {
    if (messages.length === 1) {
      return messages[0].message;
    }
    
    return `You have ${messages.length} urgent messages waiting. Please check the app.`;
  }
  
  private async sendSMS(userId: string, userName: string, phone: string, message: string, orgId: string): Promise<void> { // infra
    const truncatedMessage = message.substring(0, 160);
    
    log.info(`[SMSFailover] Sending SMS to user ${userId} (${truncatedMessage.length} chars)`);
    
    const result = await sendRealSMS({
      to: phone,
      body: `[URGENT] ${truncatedMessage}`,
      workspaceId: orgId,
      userId,
      type: 'failover',
      metadata: { failover: true, userName, priority: 'urgent' },
    });
    
    if (result.success) {
      log.info(`[SMSFailover] SMS delivered for user ${userId} via Twilio: ${result.messageId}`);
    } else {
      log.warn(`[SMSFailover] SMS delivery failed for user ${userId}: ${result.error}`);
    }
  }
}

export const smsFailoverService = new SMSFailoverService();
