import { EventEmitter } from 'events';
import type { ChatDockServerEvent } from './chatDockEventProtocol';
import { isChatDockServerEventType, stampChatDockServerEvent } from './chatDockEventProtocol';

export const CHAT_DOCK_PUBSUB_CHANNEL = 'chatdock:events:v1';

export type ChatDockEventHandler = (event: ChatDockServerEvent & { sentAt: string }) => void | Promise<void>;

export interface ChatDockPubSub {
  publish(event: ChatDockServerEvent): Promise<void>;
  subscribe(handler: ChatDockEventHandler): Promise<() => Promise<void> | void>;
  close?(): Promise<void>;
}

export interface RedisPublisherLike {
  publish(channel: string, message: string): Promise<unknown> | unknown;
}

export interface RedisSubscriberLike {
  subscribe(channel: string): Promise<unknown> | unknown;
  unsubscribe(channel: string): Promise<unknown> | unknown;
  on(event: 'message', handler: (channel: string, message: string) => void): unknown;
  off?: (event: 'message', handler: (channel: string, message: string) => void) => unknown;
  removeListener?: (event: 'message', handler: (channel: string, message: string) => void) => unknown;
}

export class LocalChatDockPubSub implements ChatDockPubSub {
  private readonly emitter = new EventEmitter();

  async publish(event: ChatDockServerEvent): Promise<void> {
    this.emitter.emit(CHAT_DOCK_PUBSUB_CHANNEL, stampChatDockServerEvent(event));
  }

  async subscribe(handler: ChatDockEventHandler): Promise<() => void> {
    const wrapped = (event: ChatDockServerEvent & { sentAt: string }) => {
      void handler(event);
    };

    this.emitter.on(CHAT_DOCK_PUBSUB_CHANNEL, wrapped);
    return () => {
      this.emitter.off(CHAT_DOCK_PUBSUB_CHANNEL, wrapped);
    };
  }
}

export class RedisChatDockPubSub implements ChatDockPubSub {
  constructor(
    private readonly publisher: RedisPublisherLike,
    private readonly subscriber: RedisSubscriberLike,
    private readonly channel: string = CHAT_DOCK_PUBSUB_CHANNEL,
  ) {}

  async publish(event: ChatDockServerEvent): Promise<void> {
    await this.publisher.publish(this.channel, JSON.stringify(stampChatDockServerEvent(event)));
  }

  async subscribe(handler: ChatDockEventHandler): Promise<() => Promise<void>> {
    const wrapped = (channel: string, message: string) => {
      if (channel !== this.channel) return;

      const event = parseChatDockPubSubMessage(message);
      if (!event) return;
      void handler(event);
    };

    this.subscriber.on('message', wrapped);
    await this.subscriber.subscribe(this.channel);

    return async () => {
      await this.subscriber.unsubscribe(this.channel);
      if (this.subscriber.off) {
        this.subscriber.off('message', wrapped);
      } else {
        this.subscriber.removeListener?.('message', wrapped);
      }
    };
  }
}

export function createLocalChatDockPubSub(): ChatDockPubSub {
  return new LocalChatDockPubSub();
}

export function createRedisChatDockPubSub(
  publisher: RedisPublisherLike,
  subscriber: RedisSubscriberLike,
  channel: string = CHAT_DOCK_PUBSUB_CHANNEL,
): ChatDockPubSub {
  return new RedisChatDockPubSub(publisher, subscriber, channel);
}

export function parseChatDockPubSubMessage(message: string): (ChatDockServerEvent & { sentAt: string }) | null {
  try {
    const parsed = JSON.parse(message) as Partial<ChatDockServerEvent> & { sentAt?: string };
    if (!isChatDockServerEventType(parsed.type)) return null;
    return stampChatDockServerEvent(parsed as ChatDockServerEvent);
  } catch {
    return null;
  }
}
