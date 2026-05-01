import { db } from '../db';
import { pool } from '../db';
import {
  channelBridges,
  bridgeConversations,
  bridgeMessages,
  chatConversations,
  chatMessages,
  chatParticipants,
  employees,
  users,
} from '@shared/schema';
import type {
  ChannelBridge,
  BridgeConversation,
  BridgeMessage,
  InsertBridgeMessage,
} from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { ChatServerHub } from './ChatServerHub';
import { createLogger } from '../lib/logger';
import crypto from 'crypto';
import { universalAudit, AUDIT_ACTIONS } from './universalAuditService';
import { EMAIL, PLATFORM } from '../config/platformConfig';
import { sendEmail } from '../email';

const log = createLogger('MessageBridge');

type ChannelType = 'sms' | 'whatsapp' | 'email' | 'messenger';
type Direction = 'inbound' | 'outbound';
type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'read';

interface InboundMessageParams {
  bridgeId: string;
  channelType: ChannelType;
  senderIdentity: string;
  message: string;
  metadata?: Record<string, unknown>;
  externalMessageId?: string;
  senderDisplayName?: string;
  attachmentUrl?: string;
  messageType?: string;
}

interface OutboundMessageParams {
  bridgeConversationId: string;
  workspaceId: string;
  message: string;
  channelType: ChannelType;
  senderId?: string;
  senderName?: string;
  attachmentUrl?: string;
}

interface ResolvedContact {
  userId?: string;
  employeeId?: string;
  displayName?: string;
  email?: string;
  phone?: string;
}

interface ProviderAdapter {
  send(params: {
    to: string;
    message: string;
    from?: string;
    attachmentUrl?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ externalMessageId: string; providerResponse: Record<string, any> }>;
}

class MessageBridgeService {
  private providerAdapters: Map<string, ProviderAdapter> = new Map();

  constructor() {
    this.registerDefaultAdapters();
  }

  private registerDefaultAdapters(): void {
    this.providerAdapters.set('email', {
      async send(params) {
        log.info('Email provider: send requested', { to: params.to });
        try {
          const result = await sendEmail({
            to: params.to,
            subject: `New message from ${PLATFORM.name}`,
            html: params.message,
            text: params.message,
            from: params.from || EMAIL.senders.noreply,
          });
          return {
            externalMessageId: result.id || `email-${Date.now()}`,
            providerResponse: result,
          };
        } catch (error: any) {
          log.error('Email send failed', { error: (error instanceof Error ? error.message : String(error)) });
          return {
            externalMessageId: `email-failed-${Date.now()}`,
            providerResponse: { status: 'failed', error: (error instanceof Error ? error.message : String(error)) },
          };
        }
      },
    });

    this.providerAdapters.set('sms', {
      async send(params) {
        log.info('SMS provider: send requested', { to: params.to });
        const twilioSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioToken = process.env.TWILIO_AUTH_TOKEN;
        const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
        if (!twilioSid || !twilioToken || !twilioFrom) {
          log.warn('Twilio credentials not configured, SMS send stubbed');
          return {
            externalMessageId: `sms-stub-${Date.now()}`,
            providerResponse: { status: 'stubbed', reason: 'no_credentials' },
          };
        }
        try {
          const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
          const body = new URLSearchParams({
            To: params.to,
            From: params.from || twilioFrom,
            Body: params.message,
          });
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
          });
          const data = await response.json() as any;
          return {
            externalMessageId: data.sid || `sms-${Date.now()}`,
            providerResponse: data,
          };
        } catch (error: any) {
          log.error('SMS send failed', { error: (error instanceof Error ? error.message : String(error)) });
          return {
            externalMessageId: `sms-failed-${Date.now()}`,
            providerResponse: { status: 'failed', error: (error instanceof Error ? error.message : String(error)) },
          };
        }
      },
    });

    this.providerAdapters.set('whatsapp', {
      async send(params) {
        log.info('WhatsApp provider: send requested', { to: params.to });
        const twilioSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioToken = process.env.TWILIO_AUTH_TOKEN;
        const twilioWhatsApp = process.env.TWILIO_WHATSAPP_NUMBER;
        if (!twilioSid || !twilioToken || !twilioWhatsApp) {
          log.warn('Twilio WhatsApp credentials not configured, send stubbed');
          return {
            externalMessageId: `wa-stub-${Date.now()}`,
            providerResponse: { status: 'stubbed', reason: 'no_credentials' },
          };
        }
        try {
          const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
          const to = params.to.startsWith('whatsapp:') ? params.to : `whatsapp:${params.to}`;
          const from = twilioWhatsApp.startsWith('whatsapp:') ? twilioWhatsApp : `whatsapp:${twilioWhatsApp}`;
          const body = new URLSearchParams({ To: to, From: from, Body: params.message });
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
          });
          const data = await response.json() as any;
          return {
            externalMessageId: data.sid || `wa-${Date.now()}`,
            providerResponse: data,
          };
        } catch (error: any) {
          log.error('WhatsApp send failed', { error: (error instanceof Error ? error.message : String(error)) });
          return {
            externalMessageId: `wa-failed-${Date.now()}`,
            providerResponse: { status: 'failed', error: (error instanceof Error ? error.message : String(error)) },
          };
        }
      },
    });

    this.providerAdapters.set('messenger', {
      async send(params) {
        log.warn('Messenger channel not supported — use WhatsApp or SMS for external messaging', {
          recipient: (params as any).recipientIdentity,
          channel: 'messenger',
          suggestion: 'Configure a WhatsApp or SMS bridge instead',
        });
        return {
          externalMessageId: `msg-unsupported-${Date.now()}`,
          providerResponse: {
            status: 'failed',
            error: 'channel_unsupported',
            reason: 'Facebook Messenger requires a Meta Business API integration. Use WhatsApp (Twilio) or SMS for external messaging instead.',
            fallback: 'whatsapp_or_sms',
          },
        };
      },
    });
  }

  registerProviderAdapter(channelType: string, adapter: ProviderAdapter): void {
    this.providerAdapters.set(channelType, adapter);
    log.info('Provider adapter registered', { channelType });
  }

  generateWebhookSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  async findBridgeByWebhookSecret(secret: string, channelType: ChannelType): Promise<ChannelBridge | null> {
    const results = await db.select().from(channelBridges).where(
      and(
        eq(channelBridges.webhookSecret, secret),
        eq(channelBridges.channelType, channelType),
        eq(channelBridges.status, 'active'),
      ),
    ).limit(1);
    return results[0] || null;
  }

  async findBridgeByDestination(channelType: ChannelType, destination: string): Promise<ChannelBridge | null> {
    if (channelType === 'email') {
      const results = await db.select().from(channelBridges).where(
        and(
          eq(channelBridges.channelType, channelType),
          eq(channelBridges.emailAddress, destination),
          eq(channelBridges.status, 'active'),
        ),
      ).limit(1);
      return results[0] || null;
    }
    if (channelType === 'sms' || channelType === 'whatsapp') {
      const normalized = destination.replace(/[^+\d]/g, '');
      const results = await db.select().from(channelBridges).where(
        and(
          eq(channelBridges.channelType, channelType),
          eq(channelBridges.phoneNumber, normalized),
          eq(channelBridges.status, 'active'),
        ),
      ).limit(1);
      return results[0] || null;
    }
    return null;
  }

  async receiveInbound(params: InboundMessageParams): Promise<{
    bridgeConversation: BridgeConversation;
    chatMessageId: string;
    bridgeMessageId: string;
  }> {
    const { bridgeId, channelType, senderIdentity, message, metadata, externalMessageId, senderDisplayName, attachmentUrl, messageType } = params;

    const bridges = await db.select().from(channelBridges).where(
      and(
        eq(channelBridges.id, bridgeId),
        eq(channelBridges.status, 'active'),
      ),
    );

    if (bridges.length === 0) {
      throw new Error(`No active bridge found with ID: ${bridgeId}`);
    }

    const bridge = bridges[0];

    if (externalMessageId) {
      const existing = await db.select().from(bridgeMessages).where(
        and(
          eq(bridgeMessages.externalMessageId, externalMessageId),
          eq(bridgeMessages.channelType, channelType),
        ),
      ).limit(1);
      if (existing.length > 0) {
        log.info('Duplicate inbound message detected, skipping', { externalMessageId, channelType });
        const conv = await db.select().from(bridgeConversations).where(
          eq(bridgeConversations.id, existing[0].bridgeConversationId),
        ).limit(1);
        return {
          bridgeConversation: conv[0],
          chatMessageId: existing[0].chatMessageId || existing[0].id,
          bridgeMessageId: existing[0].id,
        };
      }
    }

    const bridgeConv = await this.getOrCreateBridgeConversation(
      channelType,
      senderIdentity,
      bridge.workspaceId,
      bridge.id,
      senderDisplayName,
    );

    if (!bridgeConv.conversationId) {
      throw new Error('Bridge conversation missing internal conversation mapping');
    }

    const contact = await this.resolveContact(channelType, senderIdentity, bridge.workspaceId);

    const [chatMsg] = await db.insert(chatMessages).values({
      conversationId: bridgeConv.conversationId,
      senderId: contact?.userId || null,
      senderName: senderDisplayName || contact?.displayName || senderIdentity,
      senderType: 'customer',
      message,
      messageType: messageType || 'text',
      isSystemMessage: false,
      attachmentUrl: attachmentUrl || null,
    }).returning();

    const [bridgeMsg] = await db.insert(bridgeMessages).values({
      bridgeConversationId: bridgeConv.id,
      workspaceId: bridge.workspaceId,
      chatMessageId: chatMsg.id,
      direction: 'inbound' as Direction,
      channelType,
      externalMessageId: externalMessageId || null,
      senderIdentity,
      messageContent: message,
      messageType: messageType || 'text',
      attachmentUrl: attachmentUrl || null,
      deliveryStatus: 'delivered' as DeliveryStatus,
      providerResponse: metadata || null,
    }).returning();

    await db.update(bridgeConversations)
      .set({
        lastMessageAt: new Date(),
        messageCount: sql`${bridgeConversations.messageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(bridgeConversations.id, bridgeConv.id));

    await db.update(channelBridges)
      .set({
        lastActivityAt: new Date(),
        messageCount: sql`${channelBridges.messageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(channelBridges.id, bridge.id));

    await db.update(chatConversations)
      .set({
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(chatConversations.id, bridgeConv.conversationId));

    try {
      ChatServerHub.emitBatchedEvent({
        type: 'chat_message',
        conversationId: bridgeConv.conversationId,
        workspaceId: bridge.workspaceId,
        payload: {
          id: chatMsg.id,
          conversationId: bridgeConv.conversationId,
          senderId: contact?.userId || null,
          senderName: senderDisplayName || contact?.displayName || senderIdentity,
          senderType: 'customer',
          message,
          messageType: messageType || 'text',
          channelType,
          bridgeSource: true,
          externalIdentifier: senderIdentity,
          bridgeChannelType: channelType,
          createdAt: chatMsg.createdAt,
        },
      });
    } catch (wsError) {
      log.warn('Failed to emit WebSocket event for inbound bridge message', { error: wsError });
    }

    log.info('Inbound bridge message processed', {
      channelType,
      senderIdentity,
      bridgeConversationId: bridgeConv.id,
      chatMessageId: chatMsg.id,
    });

    try {
      await universalAudit.log({
        workspaceId: bridge.workspaceId,
        actorId: contact?.userId || null,
        actorType: 'system',
        action: AUDIT_ACTIONS.MESSAGE_BRIDGE_INBOUND,
        entityType: 'bridge_messages',
        entityId: bridgeMsg.id,
        entityName: `${channelType} from ${senderDisplayName || senderIdentity}`,
        changeType: 'create',
        metadata: {
          channelType,
          senderIdentity,
          bridgeId,
          bridgeConversationId: bridgeConv.id,
          chatMessageId: chatMsg.id,
          externalMessageId,
        },
        sourceRoute: `/api/bridges/webhook/${channelType}/${bridgeId}`,
      });
    } catch (err) {
      log.warn('[MessageBridgeService] Audit log failed (inbound):', err);
    }

    return {
      bridgeConversation: bridgeConv,
      chatMessageId: chatMsg.id,
      bridgeMessageId: bridgeMsg.id,
    };
  }

  async sendOutbound(params: OutboundMessageParams): Promise<{
    bridgeMessage: BridgeMessage;
    deliveryStatus: DeliveryStatus;
  }> {
    const { bridgeConversationId, workspaceId, message, channelType, senderId, senderName, attachmentUrl } = params;

    const bridgeConvs = await db.select().from(bridgeConversations).where(
      and(
        eq(bridgeConversations.id, bridgeConversationId),
        eq(bridgeConversations.workspaceId, workspaceId),
      ),
    );

    if (bridgeConvs.length === 0) {
      throw new Error(`No bridge conversation found for ID ${bridgeConversationId} in workspace ${workspaceId}`);
    }

    const bridgeConv = bridgeConvs[0];

    if (!bridgeConv.conversationId) {
      throw new Error('Bridge conversation has no linked chat conversation');
    }

    const bridgeConfigs = await db.select().from(channelBridges).where(
      and(
        eq(channelBridges.id, bridgeConv.bridgeId),
        eq(channelBridges.workspaceId, workspaceId),
      ),
    );

    if (bridgeConfigs.length === 0) {
      throw new Error(`Bridge config not found for bridge ID: ${bridgeConv.bridgeId}`);
    }

    const bridgeConfig = bridgeConfigs[0];

    if (bridgeConfig.status !== 'active') {
      throw new Error(`Bridge ${bridgeConfig.id} is not active (status: ${bridgeConfig.status})`);
    }

    const [chatMsg] = await db.insert(chatMessages).values({
      conversationId: bridgeConv.conversationId,
      senderId: senderId || null,
      senderName: senderName || 'System',
      senderType: 'support',
      message,
      messageType: 'text',
      isSystemMessage: false,
      attachmentUrl: attachmentUrl || null,
    }).returning();

    let deliveryStatus: DeliveryStatus = 'pending';
    let externalMessageId: string | null = null;
    let providerResponse: Record<string, any> | null = null;

    const adapter = this.providerAdapters.get(channelType);
    if (adapter) {
      try {
        const fromAddress = channelType === 'email'
          ? bridgeConfig.emailAddress || undefined
          : bridgeConfig.phoneNumber || undefined;

        const result = await adapter.send({
          to: bridgeConv.externalIdentifier,
          message,
          from: fromAddress,
          attachmentUrl: attachmentUrl || undefined,
          metadata: bridgeConfig.providerConfig || undefined,
        });

        externalMessageId = result.externalMessageId;
        providerResponse = result.providerResponse;
        deliveryStatus = providerResponse?.status === 'failed' ? 'failed' : 'sent';
      } catch (sendError: any) {
        log.error('Outbound send failed', { channelType, error: sendError.message });
        deliveryStatus = 'failed';
        providerResponse = { error: sendError.message };
      }
    } else {
      log.warn('No provider adapter for channel type', { channelType });
      deliveryStatus = 'failed';
      providerResponse = { error: 'no_adapter_configured' };
    }

    const [bridgeMsg] = await db.insert(bridgeMessages).values({
      bridgeConversationId: bridgeConv.id,
      workspaceId: bridgeConv.workspaceId,
      chatMessageId: chatMsg.id,
      direction: 'outbound' as Direction,
      channelType,
      externalMessageId,
      senderIdentity: null,
      messageContent: message,
      messageType: 'text',
      attachmentUrl: attachmentUrl || null,
      deliveryStatus,
      providerResponse,
    }).returning();

    await db.update(bridgeConversations)
      .set({
        lastMessageAt: new Date(),
        messageCount: sql`${bridgeConversations.messageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(bridgeConversations.id, bridgeConv.id));

    await db.update(channelBridges)
      .set({
        lastActivityAt: new Date(),
        messageCount: sql`${channelBridges.messageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(channelBridges.id, bridgeConv.bridgeId));

    try {
      ChatServerHub.emitBatchedEvent({
        type: 'chat_message',
        conversationId: bridgeConv.conversationId,
        workspaceId: bridgeConv.workspaceId,
        payload: {
          id: chatMsg.id,
          conversationId: bridgeConv.conversationId,
          senderId: senderId || null,
          senderName: senderName || 'System',
          senderType: 'support',
          message,
          messageType: 'text',
          channelType,
          bridgeSource: true,
          bridgeChannelType: channelType,
          bridgeDeliveryStatus: deliveryStatus,
          deliveryStatus,
          createdAt: chatMsg.createdAt,
        },
      });
    } catch (wsError) {
      log.warn('Failed to emit WebSocket event for outbound bridge message', { error: wsError });
    }

    log.info('Outbound bridge message sent', {
      channelType,
      bridgeConversationId: bridgeConv.id,
      deliveryStatus,
      bridgeMessageId: bridgeMsg.id,
    });

    try {
      await universalAudit.log({
        workspaceId: bridgeConv.workspaceId,
        actorId: senderId || null,
        actorType: senderId ? 'user' : 'system',
        action: AUDIT_ACTIONS.MESSAGE_BRIDGE_OUTBOUND,
        entityType: 'bridge_messages',
        entityId: bridgeMsg.id,
        entityName: `${channelType} to ${bridgeConv.externalIdentifier}`,
        changeType: 'create',
        metadata: {
          channelType,
          bridgeConversationId: bridgeConv.id,
          deliveryStatus,
          externalMessageId,
          chatMessageId: chatMsg.id,
        },
        sourceRoute: 'POST /api/bridges/send',
      });
    } catch (err) {
      log.warn('[MessageBridgeService] Audit log failed (outbound):', err);
    }

    return {
      bridgeMessage: bridgeMsg,
      deliveryStatus,
    };
  }

  async resolveContact(
    channelType: ChannelType,
    identifier: string,
    workspaceId?: string,
  ): Promise<ResolvedContact | null> {
    try {
      if (channelType === 'email') {
        const userResults = await db.select().from(users).where(eq(users.email, identifier)).limit(1);
        if (userResults.length > 0) {
          const user = userResults[0];
          return {
            userId: user.id,
            displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || identifier,
            email: user.email || undefined,
          };
        }

        if (workspaceId) {
          const empResults = await db.select().from(employees).where(
            and(eq(employees.email, identifier), eq(employees.workspaceId, workspaceId)),
          ).limit(1);
          if (empResults.length > 0) {
            const emp = empResults[0];
            return {
              employeeId: emp.id,
              userId: emp.userId || undefined,
              displayName: `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || identifier,
              email: emp.email || undefined,
            };
          }
        }
      }

      if (channelType === 'sms' || channelType === 'whatsapp') {
        const normalizedPhone = identifier.replace(/[^+\d]/g, '');

        const userResults = await db.select().from(users).where(eq(users.phone, normalizedPhone)).limit(1);
        if (userResults.length > 0) {
          const user = userResults[0];
          return {
            userId: user.id,
            displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.phone || identifier,
            phone: user.phone || undefined,
          };
        }

        if (workspaceId) {
          const empResults = await db.select().from(employees).where(
            and(eq(employees.phone, normalizedPhone), eq(employees.workspaceId, workspaceId)),
          ).limit(1);
          if (empResults.length > 0) {
            const emp = empResults[0];
            return {
              employeeId: emp.id,
              userId: emp.userId || undefined,
              displayName: `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || identifier,
              phone: emp.phone || undefined,
            };
          }
        }
      }
    } catch (error) {
      log.warn('Contact resolution failed', { channelType, identifier, error });
    }

    return null;
  }

  async getOrCreateBridgeConversation(
    channelType: ChannelType,
    senderIdentity: string,
    workspaceId: string,
    bridgeId?: string,
    senderDisplayName?: string,
  ): Promise<BridgeConversation> {
    const existing = await db.select().from(bridgeConversations).where(
      and(
        eq(bridgeConversations.channelType, channelType),
        eq(bridgeConversations.externalIdentifier, senderIdentity),
        eq(bridgeConversations.workspaceId, workspaceId),
        eq(bridgeConversations.status, 'active'),
      ),
    ).limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    if (!bridgeId) {
      const bridges = await db.select().from(channelBridges).where(
        and(
          eq(channelBridges.workspaceId, workspaceId),
          eq(channelBridges.channelType, channelType),
          eq(channelBridges.status, 'active'),
        ),
      ).limit(1);

      if (bridges.length === 0) {
        throw new Error(`No active ${channelType} bridge configured for workspace ${workspaceId}`);
      }
      bridgeId = bridges[0].id;
    }

    const contact = await this.resolveContact(channelType, senderIdentity, workspaceId);

    const channelLabel = channelType.charAt(0).toUpperCase() + channelType.slice(1);
    const displayName = senderDisplayName || contact?.displayName || senderIdentity;

    const [chatConv] = await db.insert(chatConversations).values({
      workspaceId,
      customerName: displayName,
      customerId: contact?.userId || null,
      subject: `${channelLabel} conversation with ${displayName}`,
      status: 'active',
      conversationType: 'open_chat',
      lastMessageAt: new Date(),
    }).returning();

    const [bridgeConv] = await db.insert(bridgeConversations).values({
      bridgeId,
      workspaceId,
      conversationId: chatConv.id,
      channelType,
      externalIdentifier: senderIdentity,
      externalDisplayName: senderDisplayName || contact?.displayName || null,
      resolvedUserId: contact?.userId || null,
      resolvedEmployeeId: contact?.employeeId || null,
      status: 'active',
      metadata: {
        channelType,
        createdFrom: 'bridge_inbound',
        initialContactResolution: contact ? 'resolved' : 'unresolved',
      },
    }).returning();

    log.info('Created new bridge conversation', {
      bridgeConversationId: bridgeConv.id,
      chatConversationId: chatConv.id,
      channelType,
      senderIdentity,
    });

    return bridgeConv;
  }

  async updateDeliveryStatus(
    bridgeMessageId: string,
    deliveryStatus: DeliveryStatus,
    providerResponse?: Record<string, unknown>,
  ): Promise<void> {
    const updates: Record<string, unknown> = {
      deliveryStatus,
      updatedAt: new Date(),
    };
    if (providerResponse) {
      updates.providerResponse = providerResponse;
    }

    await db.update(bridgeMessages)
      .set(updates)
      .where(eq(bridgeMessages.id, bridgeMessageId));

    log.info('Bridge message delivery status updated', { bridgeMessageId, deliveryStatus });
  }

  async getActiveBridges(workspaceId: string): Promise<ChannelBridge[]> {
    return db.select().from(channelBridges).where(
      and(
        eq(channelBridges.workspaceId, workspaceId),
        eq(channelBridges.status, 'active'),
      ),
    );
  }

  async getBridgeConversations(workspaceId: string, limit = 50, offset = 0): Promise<BridgeConversation[]> {
    return db.select().from(bridgeConversations)
      .where(eq(bridgeConversations.workspaceId, workspaceId))
      .orderBy(sql`${bridgeConversations.lastMessageAt} DESC NULLS LAST`)
      .limit(limit)
      .offset(offset);
  }

  async getBridgeMessages(
    bridgeConversationId: string,
    limit = 50,
    offset = 0,
  ): Promise<BridgeMessage[]> {
    return db.select().from(bridgeMessages)
      .where(eq(bridgeMessages.bridgeConversationId, bridgeConversationId))
      .orderBy(sql`${bridgeMessages.createdAt} DESC`)
      .limit(limit)
      .offset(offset);
  }
}

export const messageBridgeService = new MessageBridgeService();
