/**
 * Processing Metrics Service - Track automation processing duration and performance
 */

export interface ProcessingMetric {
  automationType: string; // 'schedule', 'payroll', 'onboarding', 'survey'
  startTime: Date;
  endTime?: Date;
  durationMs: number;
  recordsProcessed: number;
  successCount: number;
  failureCount: number;
  averageTimePerRecord: number;
  status: 'running' | 'completed' | 'failed';
}

interface ProcessingSession {
  sessionId: string;
  metrics: ProcessingMetric[];
  startTime: Date;
}

const activeSessions = new Map<string, ProcessingSession>();
const completedMetrics: ProcessingMetric[] = [];

/**
 * Start tracking a processing operation
 */
export function startProcessing(
  sessionId: string,
  automationType: string
): ProcessingMetric {
  const metric: ProcessingMetric = {
    automationType,
    startTime: new Date(),
    durationMs: 0,
    recordsProcessed: 0,
    successCount: 0,
    failureCount: 0,
    averageTimePerRecord: 0,
    status: 'running',
  };

  if (!activeSessions.has(sessionId)) {
    activeSessions.set(sessionId, {
      sessionId,
      metrics: [],
      startTime: new Date(),
    });
  }

  activeSessions.get(sessionId)!.metrics.push(metric);
  return metric;
}

/**
 * End tracking a processing operation
 */
export function endProcessing(
  sessionId: string,
  automationType: string,
  recordsProcessed: number,
  successCount: number,
  failureCount: number
): ProcessingMetric | null {
  const session = activeSessions.get(sessionId);
  if (!session) return null;

  const metric = session.metrics.find(m => m.automationType === automationType && m.status === 'running');
  if (!metric) return null;

  metric.endTime = new Date();
  metric.durationMs = metric.endTime.getTime() - metric.startTime.getTime();
  metric.recordsProcessed = recordsProcessed;
  metric.successCount = successCount;
  metric.failureCount = failureCount;
  metric.status = failureCount === 0 ? 'completed' : 'failed';
  metric.averageTimePerRecord = recordsProcessed > 0 ? Math.round(metric.durationMs / recordsProcessed) : 0;

  completedMetrics.push({ ...metric });
  return metric;
}

/**
 * Get processing metrics for a session
 */
export function getSessionMetrics(sessionId: string): ProcessingMetric[] {
  const session = activeSessions.get(sessionId);
  return session ? session.metrics : [];
}

/**
 * Get average processing duration for automation type
 */
export function getAverageProcessingDuration(automationType: string): number {
  const relevant = completedMetrics.filter(m => m.automationType === automationType);
  if (relevant.length === 0) return 0;
  
  const totalDuration = relevant.reduce((sum, m) => sum + m.durationMs, 0);
  return Math.round(totalDuration / relevant.length);
}

/**
 * Get processing success rate for automation type
 */
export function getSuccessRate(automationType: string): number {
  const relevant = completedMetrics.filter(m => m.automationType === automationType);
  if (relevant.length === 0) return 100;
  
  const successful = relevant.filter(m => m.status === 'completed').length;
  return Math.round((successful / relevant.length) * 100);
}

/**
 * Get recent processing metrics
 */
export function getRecentMetrics(hours: number = 24): ProcessingMetric[] {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  return completedMetrics.filter(m => m.endTime && m.endTime > cutoff);
}

export const processingMetricsService = {
  startProcessing,
  endProcessing,
  getSessionMetrics,
  getAverageProcessingDuration,
  getSuccessRate,
  getRecentMetrics,
};
