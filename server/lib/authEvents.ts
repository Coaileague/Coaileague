/**
 * authEvents — lightweight event bus for auth lifecycle signals.
 *
 * Auth is a foundation domain and must have zero upward dependencies.
 * Higher-level domains (Trinity, Analytics) subscribe here instead of
 * being imported into auth.ts directly.
 *
 * Usage:
 *   Publisher (auth.ts):   authEvents.emit('login.success', payload)
 *   Subscriber (trinity):  authEvents.on('login.success', handler)
 */
import { EventEmitter } from 'events';

export interface AuthLoginSuccessPayload {
  userId: string;
  endpoint: string;
  method: string;
  workspaceId: string | null;
}

export interface AuthLoginFailedPayload {
  endpoint: string;
  method: string;
  reason: 'no_session' | 'user_not_found' | 'account_locked' | 'bad_password' | 'mfa_required';
  ipAddress?: string;
}

export interface AuthEventMap {
  'login.success': AuthLoginSuccessPayload;
  'login.failed': AuthLoginFailedPayload;
  'logout': { userId: string };
  'session.expired': { userId: string };
}

class AuthEventBus extends EventEmitter {
  emit<K extends keyof AuthEventMap>(event: K, payload: AuthEventMap[K]): boolean {
    return super.emit(event as string, payload);
  }
  on<K extends keyof AuthEventMap>(event: K, listener: (payload: AuthEventMap[K]) => void): this {
    return super.on(event as string, listener);
  }
  once<K extends keyof AuthEventMap>(event: K, listener: (payload: AuthEventMap[K]) => void): this {
    return super.once(event as string, listener);
  }
}

export const authEvents = new AuthEventBus();
// Prevent memory leaks from many Trinity subscribers
authEvents.setMaxListeners(50);
