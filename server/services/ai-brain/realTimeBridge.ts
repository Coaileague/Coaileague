/**
 * RealTimeBridge - Normalized WebSocket payload layer for AI Brain
 * 
 * Provides:
 * - Consistent message shapes for Trinity/HelpAI/Backend
 * - Workflow progress streaming
 * - Notification acknowledgements
 * - Cross-agent event broadcasting
 */

import { aiBrainEvents } from './internalEventEmitter';
import { RunStatus } from './workflowLedger';

export type BroadcastChannel = 'workflow' | 'notification' | 'mascot' | 'helpai' | 'system';

export interface WorkflowProgressPayload {
  runId: string;
  actionId: string;
  status: RunStatus;
  progress?: number;
  currentStep?: string;
  message?: string;
  timestamp: string;
}

export interface NotificationPayload {
  type: 'notification_update' | 'notification_count' | 'notification_cleared';
  counts?: {
    total: number;
    unread: number;
    byType: Record<string, number>;
  };
  notification?: {
    id: string;
    type: string;
    title: string;
    message?: string;
  };
  timestamp: string;
}

export interface MascotPayload {
  type: 'thought' | 'reaction' | 'command' | 'navigation';
  content?: string;
  emotion?: string;
  action?: string;
  targetPosition?: { x: number; y: number };
  duration?: number;
  timestamp: string;
}

export interface HelpAIPayload {
  type: 'message' | 'typing' | 'action_result' | 'suggestion';
  content?: string;
  actionId?: string;
  result?: any;
  suggestions?: string[];
  timestamp: string;
}

export interface SystemPayload {
  type: 'health' | 'alert' | 'maintenance' | 'update';
  severity?: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  data?: any;
  timestamp: string;
}

export type BridgePayload = 
  | { channel: 'workflow'; data: WorkflowProgressPayload }
  | { channel: 'notification'; data: NotificationPayload }
  | { channel: 'mascot'; data: MascotPayload }
  | { channel: 'helpai'; data: HelpAIPayload }
  | { channel: 'system'; data: SystemPayload };

class RealTimeBridgeService {
  private static instance: RealTimeBridgeService;
  private subscribers: Map<BroadcastChannel, Set<(payload: any) => void>> = new Map();

  private constructor() {
    this.initializeEventListeners();
  }

  static getInstance(): RealTimeBridgeService {
    if (!RealTimeBridgeService.instance) {
      RealTimeBridgeService.instance = new RealTimeBridgeService();
    }
    return RealTimeBridgeService.instance;
  }

  private initializeEventListeners() {
    aiBrainEvents.on('workflow_created', (data: any) => {
      this.broadcastWorkflowProgress({
        runId: data.runId,
        actionId: data.actionId,
        status: 'queued',
        message: `Workflow ${data.actionId} created`,
        timestamp: new Date().toISOString(),
      });
    });

    aiBrainEvents.on('workflow_started', (data: any) => {
      this.broadcastWorkflowProgress({
        runId: data.runId,
        actionId: data.actionId,
        status: 'running',
        progress: 0,
        message: `Workflow ${data.actionId} started`,
        timestamp: new Date().toISOString(),
      });
    });

    aiBrainEvents.on('workflow_completed', (data: any) => {
      this.broadcastWorkflowProgress({
        runId: data.runId,
        actionId: data.actionId,
        status: 'completed',
        progress: 100,
        message: data.slaMet ? 'Completed successfully' : 'Completed (SLA missed)',
        timestamp: new Date().toISOString(),
      });
    });

    aiBrainEvents.on('workflow_failed', (data: any) => {
      this.broadcastWorkflowProgress({
        runId: data.runId,
        actionId: data.actionId,
        status: 'failed',
        message: data.error,
        timestamp: new Date().toISOString(),
      });
    });

    aiBrainEvents.on('trinity_command', (data: any) => {
      this.broadcastMascot({
        type: data.type || 'command',
        content: data.content,
        emotion: data.emotion,
        action: data.action,
        timestamp: new Date().toISOString(),
      });
    });

    aiBrainEvents.on('send_notification', (data: any) => {
      this.broadcastNotification({
        type: 'notification_update',
        notification: {
          id: data.id,
          type: data.type,
          title: data.title,
          message: data.message,
        },
        timestamp: new Date().toISOString(),
      });
    });
  }

  subscribe(channel: BroadcastChannel, callback: (payload: any) => void): () => void {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }
    this.subscribers.get(channel)!.add(callback);

    return () => {
      this.subscribers.get(channel)?.delete(callback);
    };
  }

  private broadcast(channel: BroadcastChannel, data: any) {
    const subscribers = this.subscribers.get(channel);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[RealTimeBridge] Subscriber error on ${channel}:`, error);
        }
      });
    }

    aiBrainEvents.emit('realtime_broadcast', { channel, data });
  }

  broadcastWorkflowProgress(payload: WorkflowProgressPayload) {
    this.broadcast('workflow', payload);
  }

  broadcastNotification(payload: NotificationPayload) {
    this.broadcast('notification', payload);
  }

  broadcastMascot(payload: MascotPayload) {
    this.broadcast('mascot', payload);
  }

  broadcastHelpAI(payload: HelpAIPayload) {
    this.broadcast('helpai', payload);
  }

  broadcastSystem(payload: SystemPayload) {
    this.broadcast('system', payload);
  }

  broadcastWorkflowStep(
    runId: string,
    actionId: string,
    stepNumber: number,
    totalSteps: number,
    stepName: string,
    status: 'running' | 'completed' | 'failed'
  ) {
    const progress = Math.round((stepNumber / totalSteps) * 100);
    
    this.broadcastWorkflowProgress({
      runId,
      actionId,
      status: status === 'failed' ? 'failed' : 'running',
      progress,
      currentStep: stepName,
      message: `Step ${stepNumber}/${totalSteps}: ${stepName}`,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastNotificationCounts(counts: { total: number; unread: number; byType: Record<string, number> }) {
    this.broadcastNotification({
      type: 'notification_count',
      counts,
      timestamp: new Date().toISOString(),
    });
  }

  triggerMascotReaction(emotion: string, content?: string, duration?: number) {
    this.broadcastMascot({
      type: 'reaction',
      emotion,
      content,
      duration: duration || 3000,
      timestamp: new Date().toISOString(),
    });
  }

  triggerMascotThought(content: string, duration?: number) {
    this.broadcastMascot({
      type: 'thought',
      content,
      duration: duration || 5000,
      timestamp: new Date().toISOString(),
    });
  }

  streamHelpAITyping(isTyping: boolean) {
    this.broadcastHelpAI({
      type: 'typing',
      content: isTyping ? 'thinking...' : '',
      timestamp: new Date().toISOString(),
    });
  }

  sendHelpAIMessage(content: string, suggestions?: string[]) {
    this.broadcastHelpAI({
      type: 'message',
      content,
      suggestions,
      timestamp: new Date().toISOString(),
    });
  }

  sendActionResult(actionId: string, result: any) {
    this.broadcastHelpAI({
      type: 'action_result',
      actionId,
      result,
      timestamp: new Date().toISOString(),
    });
  }

  sendSystemAlert(severity: 'info' | 'warning' | 'error' | 'critical', message: string, data?: any) {
    this.broadcastSystem({
      type: 'alert',
      severity,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  getChannelStats(): Record<BroadcastChannel, number> {
    const stats: Record<BroadcastChannel, number> = {
      workflow: 0,
      notification: 0,
      mascot: 0,
      helpai: 0,
      system: 0,
    };

    for (const [channel, subscribers] of this.subscribers) {
      stats[channel] = subscribers.size;
    }

    return stats;
  }
}

export const realTimeBridge = RealTimeBridgeService.getInstance();
