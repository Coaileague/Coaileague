import { createLogger } from '../../lib/logger';
const log = createLogger('internalEventEmitter');

/**
 * Internal Event Emitter for AI Brain services
 * 
 * A simple event emitter for internal AI Brain communication
 * that doesn't need to go through the platform event bus.
 */

type EventHandler = (data: any) => void;

class InternalEventEmitter {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: string, data?: any): void {
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      eventHandlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          log.error(`[InternalEventEmitter] Error in handler for ${event}:`, error);
        }
      });
    }

    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach(handler => {
        try {
          handler({ event, data });
        } catch (error) {
          log.error(`[InternalEventEmitter] Error in wildcard handler:`, error);
        }
      });
    }
  }

  once(event: string, handler: EventHandler): void {
    const wrapper = (data: any) => {
      this.off(event, wrapper);
      handler(data);
    };
    this.on(event, wrapper);
  }

  clear(event?: string): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }
}

export const aiBrainEvents = new InternalEventEmitter();
