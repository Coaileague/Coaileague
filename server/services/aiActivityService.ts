/**
 * AI Activity Service - Real-time AI state tracking for Trinity mascot
 * 
 * Emits AI activity events that Trinity listens to for mode changes:
 * - SEARCHING: AI is fetching/querying data
 * - THINKING: AI is processing/reasoning
 * - ANALYZING: AI is analyzing patterns/data
 * - CODING: AI is generating/editing code
 * - LISTENING: AI is waiting for input
 * - SUCCESS: AI completed task successfully
 * - ERROR: AI encountered an error
 * - IDLE: No active AI operations
 */

import { broadcastToAllClients } from '../websocket';

export type AIActivityState = 
  | 'IDLE'
  | 'SEARCHING'
  | 'THINKING'
  | 'ANALYZING'
  | 'CODING'
  | 'UPLOADING'
  | 'LISTENING'
  | 'SUCCESS'
  | 'ERROR'
  | 'ADVISING';

export interface AIActivityEvent {
  type: 'ai_activity';
  state: AIActivityState;
  source: string;
  workspaceId?: string;
  userId?: string;
  message?: string;
  progress?: number;
  timestamp: string;
}

class AIActivityService {
  private static instance: AIActivityService;
  private currentState: AIActivityState = 'IDLE';
  private stateStack: { state: AIActivityState; source: string }[] = [];
  private stateTimeout: NodeJS.Timeout | null = null;

  static getInstance(): AIActivityService {
    if (!this.instance) {
      this.instance = new AIActivityService();
    }
    return this.instance;
  }

  getCurrentState(): AIActivityState {
    return this.currentState;
  }

  /**
   * Set AI activity state and broadcast to all connected clients
   */
  setState(
    state: AIActivityState,
    source: string,
    options: {
      workspaceId?: string;
      userId?: string;
      message?: string;
      progress?: number;
      duration?: number;
    } = {}
  ): void {
    const previousState = this.currentState;
    this.currentState = state;

    if (this.stateTimeout) {
      clearTimeout(this.stateTimeout);
      this.stateTimeout = null;
    }

    const event: AIActivityEvent = {
      type: 'ai_activity',
      state,
      source,
      workspaceId: options.workspaceId,
      userId: options.userId,
      message: options.message,
      progress: options.progress,
      timestamp: new Date().toISOString(),
    };

    broadcastToAllClients(event);

    console.log(`[AIActivity] ${source}: ${previousState} -> ${state}${options.message ? ` (${options.message})` : ''}`);

    if (options.duration && state !== 'IDLE') {
      this.stateTimeout = setTimeout(() => {
        this.setState('IDLE', source, { workspaceId: options.workspaceId });
      }, options.duration);
    }
  }

  /**
   * Push a new state onto the stack (for nested operations)
   */
  pushState(state: AIActivityState, source: string, options: { workspaceId?: string; userId?: string; message?: string } = {}): void {
    this.stateStack.push({ state: this.currentState, source });
    this.setState(state, source, options);
  }

  /**
   * Pop the current state and restore the previous one
   */
  popState(source: string, options: { workspaceId?: string } = {}): void {
    const previous = this.stateStack.pop();
    if (previous) {
      this.setState(previous.state, source, options);
    } else {
      this.setState('IDLE', source, options);
    }
  }

  /**
   * Convenience methods for common AI activities
   */
  startSearching(source: string, options: { workspaceId?: string; userId?: string; message?: string } = {}): void {
    this.setState('SEARCHING', source, { ...options, message: options.message || 'Searching...' });
  }

  startThinking(source: string, options: { workspaceId?: string; userId?: string; message?: string } = {}): void {
    this.setState('THINKING', source, { ...options, message: options.message || 'Processing...' });
  }

  startAnalyzing(source: string, options: { workspaceId?: string; userId?: string; message?: string } = {}): void {
    this.setState('ANALYZING', source, { ...options, message: options.message || 'Analyzing...' });
  }

  startCoding(source: string, options: { workspaceId?: string; userId?: string; message?: string } = {}): void {
    this.setState('CODING', source, { ...options, message: options.message || 'Generating code...' });
  }

  startAdvising(source: string, options: { workspaceId?: string; userId?: string; message?: string } = {}): void {
    this.setState('ADVISING', source, { ...options, message: options.message || 'Preparing advice...' });
  }

  complete(source: string, options: { workspaceId?: string; userId?: string; message?: string; duration?: number } = {}): void {
    this.setState('SUCCESS', source, { 
      ...options, 
      message: options.message || 'Completed!',
      duration: options.duration || 2000
    });
  }

  error(source: string, options: { workspaceId?: string; userId?: string; message?: string; duration?: number } = {}): void {
    this.setState('ERROR', source, { 
      ...options, 
      message: options.message || 'Something went wrong',
      duration: options.duration || 3000
    });
  }

  idle(source: string, options: { workspaceId?: string } = {}): void {
    this.setState('IDLE', source, options);
  }
}

export const aiActivityService = AIActivityService.getInstance();
export default aiActivityService;
