/**
 * BEHAVIORAL MONITORING SERVICE
 * =============================
 * Tracks behavioral distribution of subagents to detect model drift
 * and anomalous decision-making patterns.
 * 
 * Capabilities:
 * - Decision Pattern Tracking: Monitor decision distributions over time
 * - Model Drift Detection: Identify when models subtly shift behavior
 * - Anomaly Detection: Flag unusual patterns that static guardrails miss
 * - Performance Regression: Detect degradation in output quality
 * - Cost Anomalies: Track unexpected credit consumption patterns
 * 
 * Fortune 500 Requirements:
 * - Continuous monitoring for all AI operations
 * - Statistical significance testing for drift
 * - Alerting and automatic remediation
 * - Complete behavioral audit trail
 */

import { platformEventBus, publishPlatformUpdate } from '../platformEventBus';
import { db } from '../../db';
import { systemAuditLogs } from '@shared/schema';
import { universalNotificationEngine } from '../universalNotificationEngine';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('behavioralMonitoringService');

// ============================================================================
// TYPES
// ============================================================================

export interface BehaviorSample {
  sampleId: string;
  timestamp: Date;
  
  // Source identification
  subagentId: string;
  modelTier: string;
  actionType: string;
  
  // Decision characteristics
  decisionCategory: string;
  confidenceScore: number;
  responseTime: number;
  tokenCount: number;
  
  // Outcome
  outcome: 'success' | 'partial_success' | 'failure' | 'error';
  userFeedback?: 'positive' | 'neutral' | 'negative';
  
  // Context
  workspaceId: string;
  userId: string;
  sessionId?: string;
}

export interface BehaviorProfile {
  subagentId: string;
  modelTier: string;
  
  // Statistical baselines
  baselineConfidence: StatisticalBaseline;
  baselineResponseTime: StatisticalBaseline;
  baselineTokenUsage: StatisticalBaseline;
  baselineSuccessRate: StatisticalBaseline;
  
  // Decision distribution
  decisionDistribution: Map<string, number>;
  
  // Temporal patterns
  hourlyPatterns: HourlyPattern[];
  
  // Quality metrics
  qualityScore: number;
  driftScore: number;
  anomalyCount: number;
  
  // Metadata
  sampleCount: number;
  windowStart: Date;
  windowEnd: Date;
  lastUpdated: Date;
}

export interface StatisticalBaseline {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  median: number;
  p95: number;
  sampleCount: number;
}

export interface HourlyPattern {
  hour: number;
  avgConfidence: number;
  avgResponseTime: number;
  requestCount: number;
  successRate: number;
}

export interface DriftDetection {
  driftId: string;
  timestamp: Date;
  
  // What drifted
  subagentId: string;
  modelTier: string;
  metricName: string;
  
  // Drift magnitude
  baselineValue: number;
  currentValue: number;
  deviationSigma: number;
  driftPercentage: number;
  
  // Significance
  isSignificant: boolean;
  pValue: number;
  sampleSize: number;
  
  // Impact assessment
  severity: 'low' | 'medium' | 'high' | 'critical';
  potentialImpact: string;
  
  // Recommended action
  recommendedAction: string;
  autoRemediationAvailable: boolean;
}

export interface AnomalyDetection {
  anomalyId: string;
  timestamp: Date;
  
  // What is anomalous
  subagentId: string;
  sampleId: string;
  anomalyType: 'confidence' | 'latency' | 'cost' | 'decision' | 'quality';
  
  // Details
  observedValue: number;
  expectedRange: { min: number; max: number };
  deviationScore: number;
  
  // Context
  context: Record<string, any>;
  
  // Classification
  severity: 'low' | 'medium' | 'high' | 'critical';
  isActionable: boolean;
  suggestedAction?: string;
}

export interface MonitoringConfig {
  sampleWindowMs: number;
  driftThresholdSigma: number;
  anomalyThresholdSigma: number;
  minSamplesForBaseline: number;
  alertCooldownMs: number;
  enableAutoRemediation: boolean;
}

const DEFAULT_CONFIG: MonitoringConfig = {
  sampleWindowMs: 24 * 60 * 60 * 1000, // 24 hours
  driftThresholdSigma: 2.0,
  anomalyThresholdSigma: 3.0,
  minSamplesForBaseline: 50,
  alertCooldownMs: 60 * 60 * 1000, // 1 hour
  enableAutoRemediation: false,
};

// ============================================================================
// BEHAVIORAL MONITORING SERVICE CLASS
// ============================================================================

class BehavioralMonitoringService {
  private static instance: BehavioralMonitoringService;
  private config: MonitoringConfig = DEFAULT_CONFIG;
  
  // In-memory storage (would be database-backed in production)
  private samples: Map<string, BehaviorSample[]> = new Map();
  private profiles: Map<string, BehaviorProfile> = new Map();
  private recentDrifts: DriftDetection[] = [];
  private recentAnomalies: AnomalyDetection[] = [];
  private alertCooldowns: Map<string, Date> = new Map();

  private constructor() {
    log.info('[BehavioralMonitoring] Initializing model drift detection...');
    this.startPeriodicAnalysis();
  }

  static getInstance(): BehavioralMonitoringService {
    if (!BehavioralMonitoringService.instance) {
      BehavioralMonitoringService.instance = new BehavioralMonitoringService();
    }
    return BehavioralMonitoringService.instance;
  }

  /**
   * Record a behavior sample
   */
  async recordSample(sample: Omit<BehaviorSample, 'sampleId'>): Promise<void> {
    const fullSample: BehaviorSample = {
      ...sample,
      sampleId: `sample-${crypto.randomUUID()}`,
    };

    // Store sample
    const key = `${sample.subagentId}-${sample.modelTier}`;
    const samples = this.samples.get(key) || [];
    samples.push(fullSample);
    
    // Limit stored samples
    if (samples.length > 10000) {
      samples.shift();
    }
    this.samples.set(key, samples);

    // Check for anomalies in real-time
    await this.checkForAnomalies(fullSample);

    // Update profile periodically (not on every sample)
    if (samples.length % 10 === 0) {
      await this.updateProfile(sample.subagentId, sample.modelTier);
    }
  }

  /**
   * Check sample for anomalies
   */
  private async checkForAnomalies(sample: BehaviorSample): Promise<void> {
    const key = `${sample.subagentId}-${sample.modelTier}`;
    const profile = this.profiles.get(key);
    
    if (!profile || profile.sampleCount < this.config.minSamplesForBaseline) {
      return; // Not enough baseline data
    }

    const anomalies: AnomalyDetection[] = [];

    // Check confidence anomaly
    const confidenceDeviation = this.calculateDeviation(
      sample.confidenceScore,
      profile.baselineConfidence
    );
    if (confidenceDeviation > this.config.anomalyThresholdSigma) {
      anomalies.push({
        anomalyId: `anomaly-${crypto.randomUUID()}`,
        timestamp: new Date(),
        subagentId: sample.subagentId,
        sampleId: sample.sampleId,
        anomalyType: 'confidence',
        observedValue: sample.confidenceScore,
        expectedRange: {
          min: profile.baselineConfidence.mean - 2 * profile.baselineConfidence.stdDev,
          max: profile.baselineConfidence.mean + 2 * profile.baselineConfidence.stdDev,
        },
        deviationScore: confidenceDeviation,
        context: { actionType: sample.actionType },
        severity: confidenceDeviation > 4 ? 'high' : 'medium',
        isActionable: true,
        suggestedAction: 'Review model output quality',
      });
    }

    // Check latency anomaly
    const latencyDeviation = this.calculateDeviation(
      sample.responseTime,
      profile.baselineResponseTime
    );
    if (latencyDeviation > this.config.anomalyThresholdSigma) {
      anomalies.push({
        anomalyId: `anomaly-${crypto.randomUUID()}`,
        timestamp: new Date(),
        subagentId: sample.subagentId,
        sampleId: sample.sampleId,
        anomalyType: 'latency',
        observedValue: sample.responseTime,
        expectedRange: {
          min: profile.baselineResponseTime.min,
          max: profile.baselineResponseTime.p95,
        },
        deviationScore: latencyDeviation,
        context: { actionType: sample.actionType },
        severity: latencyDeviation > 4 ? 'high' : 'low',
        isActionable: latencyDeviation > 4,
        suggestedAction: 'Check model tier or network issues',
      });
    }

    // Check token usage anomaly
    const tokenDeviation = this.calculateDeviation(
      sample.tokenCount,
      profile.baselineTokenUsage
    );
    if (tokenDeviation > this.config.anomalyThresholdSigma) {
      anomalies.push({
        anomalyId: `anomaly-${crypto.randomUUID()}`,
        timestamp: new Date(),
        subagentId: sample.subagentId,
        sampleId: sample.sampleId,
        anomalyType: 'cost',
        observedValue: sample.tokenCount,
        expectedRange: {
          min: profile.baselineTokenUsage.min,
          max: profile.baselineTokenUsage.p95,
        },
        deviationScore: tokenDeviation,
        context: { actionType: sample.actionType },
        severity: tokenDeviation > 4 ? 'high' : 'medium',
        isActionable: true,
        suggestedAction: 'Review prompt efficiency or task complexity',
      });
    }

    // Store and alert for significant anomalies
    for (const anomaly of anomalies) {
      this.recentAnomalies.push(anomaly);
      if (this.recentAnomalies.length > 1000) {
        this.recentAnomalies.shift();
      }

      if (anomaly.severity === 'high' || anomaly.severity === 'critical') {
        await this.alertAnomaly(anomaly);
      }
    }
  }

  /**
   * Update behavior profile
   */
  private async updateProfile(subagentId: string, modelTier: string): Promise<void> {
    const key = `${subagentId}-${modelTier}`;
    const samples = this.samples.get(key) || [];
    
    if (samples.length < this.config.minSamplesForBaseline) {
      return;
    }

    // Filter to window
    const windowStart = new Date(Date.now() - this.config.sampleWindowMs);
    const windowSamples = samples.filter(s => s.timestamp >= windowStart);

    if (windowSamples.length < this.config.minSamplesForBaseline) {
      return;
    }

    // Calculate baselines
    const confidenceScores = windowSamples.map(s => s.confidenceScore);
    const responseTimes = windowSamples.map(s => s.responseTime);
    const tokenCounts = windowSamples.map(s => s.tokenCount);
    const successRates = windowSamples.map(s => s.outcome === 'success' ? 1 : 0);

    // Calculate decision distribution
    const decisionDistribution = new Map<string, number>();
    for (const sample of windowSamples) {
      const count = decisionDistribution.get(sample.decisionCategory) || 0;
      decisionDistribution.set(sample.decisionCategory, count + 1);
    }

    // Calculate hourly patterns
    const hourlyPatterns = this.calculateHourlyPatterns(windowSamples);

    const existingProfile = this.profiles.get(key);
    const newProfile: BehaviorProfile = {
      subagentId,
      modelTier,
      baselineConfidence: this.calculateBaseline(confidenceScores),
      baselineResponseTime: this.calculateBaseline(responseTimes),
      baselineTokenUsage: this.calculateBaseline(tokenCounts),
      baselineSuccessRate: this.calculateBaseline(successRates),
      decisionDistribution,
      hourlyPatterns,
      qualityScore: this.calculateQualityScore(windowSamples),
      driftScore: existingProfile ? this.calculateDriftScore(existingProfile, windowSamples) : 0,
      anomalyCount: this.recentAnomalies.filter(a => a.subagentId === subagentId).length,
      sampleCount: windowSamples.length,
      windowStart,
      windowEnd: new Date(),
      lastUpdated: new Date(),
    };

    // Check for drift before updating
    if (existingProfile && existingProfile.sampleCount >= this.config.minSamplesForBaseline) {
      await this.checkForDrift(existingProfile, newProfile);
    }

    this.profiles.set(key, newProfile);
  }

  /**
   * Check for behavioral drift
   */
  private async checkForDrift(
    oldProfile: BehaviorProfile,
    newProfile: BehaviorProfile
  ): Promise<void> {
    const drifts: DriftDetection[] = [];

    // Check confidence drift
    const confidenceDrift = this.detectMetricDrift(
      'confidence',
      oldProfile.baselineConfidence,
      newProfile.baselineConfidence
    );
    if (confidenceDrift) {
      drifts.push({
        ...confidenceDrift,
        subagentId: newProfile.subagentId,
        modelTier: newProfile.modelTier,
      });
    }

    // Check response time drift
    const responseDrift = this.detectMetricDrift(
      'responseTime',
      oldProfile.baselineResponseTime,
      newProfile.baselineResponseTime
    );
    if (responseDrift) {
      drifts.push({
        ...responseDrift,
        subagentId: newProfile.subagentId,
        modelTier: newProfile.modelTier,
      });
    }

    // Check success rate drift
    const successDrift = this.detectMetricDrift(
      'successRate',
      oldProfile.baselineSuccessRate,
      newProfile.baselineSuccessRate
    );
    if (successDrift) {
      drifts.push({
        ...successDrift,
        subagentId: newProfile.subagentId,
        modelTier: newProfile.modelTier,
      });
    }

    // Store and alert for significant drifts
    for (const drift of drifts) {
      this.recentDrifts.push(drift);
      if (this.recentDrifts.length > 500) {
        this.recentDrifts.shift();
      }

      if (drift.severity === 'high' || drift.severity === 'critical') {
        await this.alertDrift(drift);
      }
    }
  }

  /**
   * Detect drift for a specific metric
   */
  private detectMetricDrift(
    metricName: string,
    oldBaseline: StatisticalBaseline,
    newBaseline: StatisticalBaseline
  ): Omit<DriftDetection, 'subagentId' | 'modelTier'> | null {
    const deviationSigma = Math.abs(newBaseline.mean - oldBaseline.mean) / oldBaseline.stdDev;
    
    if (deviationSigma < this.config.driftThresholdSigma) {
      return null;
    }

    const driftPercentage = ((newBaseline.mean - oldBaseline.mean) / oldBaseline.mean) * 100;
    
    // Simple p-value approximation using z-score
    const pValue = 2 * (1 - this.normalCDF(deviationSigma));
    
    const severity = this.assessDriftSeverity(deviationSigma, metricName);

    return {
      driftId: `drift-${crypto.randomUUID()}`,
      timestamp: new Date(),
      metricName,
      baselineValue: oldBaseline.mean,
      currentValue: newBaseline.mean,
      deviationSigma,
      driftPercentage,
      isSignificant: pValue < 0.05,
      pValue,
      sampleSize: newBaseline.sampleCount,
      severity,
      potentialImpact: this.assessDriftImpact(metricName, driftPercentage),
      recommendedAction: this.recommendDriftAction(metricName, severity),
      autoRemediationAvailable: this.config.enableAutoRemediation && severity !== 'critical',
    };
  }

  /**
   * Calculate statistical baseline
   */
  private calculateBaseline(values: number[]): StatisticalBaseline {
    const sorted = [...values].sort((a, b) => a - b);
    const n = values.length;
    
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    
    return {
      mean,
      stdDev: stdDev || 0.001, // Prevent division by zero
      min: sorted[0] || 0,
      max: sorted[n - 1] || 0,
      median: sorted[Math.floor(n / 2)] || 0,
      p95: sorted[Math.floor(n * 0.95)] || 0,
      sampleCount: n,
    };
  }

  /**
   * Calculate deviation from baseline
   */
  private calculateDeviation(value: number, baseline: StatisticalBaseline): number {
    if (baseline.stdDev === 0) return 0;
    return Math.abs(value - baseline.mean) / baseline.stdDev;
  }

  /**
   * Calculate quality score
   */
  private calculateQualityScore(samples: BehaviorSample[]): number {
    if (samples.length === 0) return 0;
    
    const successCount = samples.filter(s => s.outcome === 'success').length;
    const avgConfidence = samples.reduce((sum, s) => sum + s.confidenceScore, 0) / samples.length;
    
    return (successCount / samples.length) * 0.7 + avgConfidence * 0.3;
  }

  /**
   * Calculate drift score
   */
  private calculateDriftScore(oldProfile: BehaviorProfile, samples: BehaviorSample[]): number {
    const newMeanConfidence = samples.reduce((sum, s) => sum + s.confidenceScore, 0) / samples.length;
    const confidenceDrift = this.calculateDeviation(newMeanConfidence, oldProfile.baselineConfidence);
    
    return Math.min(1, confidenceDrift / 5); // Normalize to 0-1
  }

  /**
   * Calculate hourly patterns
   */
  private calculateHourlyPatterns(samples: BehaviorSample[]): HourlyPattern[] {
    const hourlyBuckets = new Map<number, BehaviorSample[]>();
    
    for (const sample of samples) {
      const hour = sample.timestamp.getHours();
      const bucket = hourlyBuckets.get(hour) || [];
      bucket.push(sample);
      hourlyBuckets.set(hour, bucket);
    }

    return Array.from(hourlyBuckets.entries()).map(([hour, hourSamples]) => ({
      hour,
      avgConfidence: hourSamples.reduce((sum, s) => sum + s.confidenceScore, 0) / hourSamples.length,
      avgResponseTime: hourSamples.reduce((sum, s) => sum + s.responseTime, 0) / hourSamples.length,
      requestCount: hourSamples.length,
      successRate: hourSamples.filter(s => s.outcome === 'success').length / hourSamples.length,
    }));
  }

  /**
   * Standard normal CDF approximation
   */
  private normalCDF(z: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }

  /**
   * Assess drift severity
   */
  private assessDriftSeverity(sigma: number, metricName: string): DriftDetection['severity'] {
    const criticalMetrics = ['successRate', 'confidence'];
    const isCritical = criticalMetrics.includes(metricName);
    
    if (sigma > 4 || (isCritical && sigma > 3)) return 'critical';
    if (sigma > 3 || (isCritical && sigma > 2.5)) return 'high';
    if (sigma > 2.5) return 'medium';
    return 'low';
  }

  /**
   * Assess drift impact
   */
  private assessDriftImpact(metricName: string, driftPercentage: number): string {
    const direction = driftPercentage > 0 ? 'increase' : 'decrease';
    
    switch (metricName) {
      case 'confidence':
        return `${Math.abs(driftPercentage).toFixed(1)}% ${direction} in model confidence may affect decision quality`;
      case 'responseTime':
        return `${Math.abs(driftPercentage).toFixed(1)}% ${direction} in response time may impact user experience`;
      case 'successRate':
        return `${Math.abs(driftPercentage).toFixed(1)}% ${direction} in success rate may indicate model degradation`;
      default:
        return `${Math.abs(driftPercentage).toFixed(1)}% ${direction} detected`;
    }
  }

  /**
   * Recommend action for drift
   */
  private recommendDriftAction(metricName: string, severity: DriftDetection['severity']): string {
    if (severity === 'critical') {
      return 'Immediate investigation required. Consider pausing affected operations.';
    }
    
    switch (metricName) {
      case 'confidence':
        return 'Review recent model outputs and validate decision quality';
      case 'responseTime':
        return 'Check for rate limiting, network issues, or increased load';
      case 'successRate':
        return 'Analyze recent failures and review error patterns';
      default:
        return 'Monitor closely and investigate if trend continues';
    }
  }

  /**
   * Alert on anomaly
   */
  private async alertAnomaly(anomaly: AnomalyDetection): Promise<void> {
    const cooldownKey = `anomaly-${anomaly.subagentId}-${anomaly.anomalyType}`;
    const lastAlert = this.alertCooldowns.get(cooldownKey);
    
    if (lastAlert && Date.now() - lastAlert.getTime() < this.config.alertCooldownMs) {
      return; // In cooldown
    }

    this.alertCooldowns.set(cooldownKey, new Date());

    // Log to audit
    await this.logBehavioralEvent('anomaly_detected', anomaly);

    // Publish platform event
    platformEventBus.publish('ai_brain_action', {
      action: 'behavioral_anomaly',
      anomalyId: anomaly.anomalyId,
      subagentId: anomaly.subagentId,
      anomalyType: anomaly.anomalyType,
      severity: anomaly.severity,
      deviationScore: anomaly.deviationScore,
    });

    log.info(`[BehavioralMonitoring] Anomaly detected: ${anomaly.anomalyType} in ${anomaly.subagentId} (severity: ${anomaly.severity})`);
  }

  /**
   * Alert on drift
   */
  private async alertDrift(drift: DriftDetection): Promise<void> {
    const cooldownKey = `drift-${drift.subagentId}-${drift.metricName}`;
    const lastAlert = this.alertCooldowns.get(cooldownKey);
    
    if (lastAlert && Date.now() - lastAlert.getTime() < this.config.alertCooldownMs) {
      return; // In cooldown
    }

    this.alertCooldowns.set(cooldownKey, new Date());

    // Log to audit
    await this.logBehavioralEvent('drift_detected', drift);

    // Publish platform event
    platformEventBus.publish('ai_brain_action', {
      action: 'behavioral_drift',
      driftId: drift.driftId,
      subagentId: drift.subagentId,
      metricName: drift.metricName,
      severity: drift.severity,
      driftPercentage: drift.driftPercentage,
    });

    log.info(`[BehavioralMonitoring] Drift detected: ${drift.metricName} in ${drift.subagentId} (severity: ${drift.severity}, ${drift.driftPercentage.toFixed(1)}% change)`);
  }

  /**
   * Log behavioral event
   */
  private async logBehavioralEvent(eventType: string, data: any): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        workspaceId: 'system',
        id: crypto.randomUUID(),
        entityType: 'behavior',
        entityId: data.anomalyId || data.driftId,
        action: eventType,
        metadata: { timestamp: new Date(), eventType: `behavioral_monitoring_${eventType}`, details: JSON.stringify(data), severity: data.severity === 'critical' ? 'high' : data.severity === 'high' ? 'medium' : 'low' },
      });
    } catch (error) {
      log.error('[BehavioralMonitoring] Failed to log event:', error);
    }
  }

  /**
   * Start periodic analysis
   */
  private startPeriodicAnalysis(): void {
    setInterval(async () => {
      try {
        for (const [key] of this.samples) {
          const [subagentId, modelTier] = key.split('-');
          await this.updateProfile(subagentId, modelTier);
        }
      } catch (error: any) {
        log.warn('[BehavioralMonitoring] Analysis failed (will retry):', error?.message || 'unknown');
      }
    }, 5 * 60 * 1000).unref();
  }

  /**
   * Get behavior profile
   */
  getProfile(subagentId: string, modelTier: string): BehaviorProfile | undefined {
    return this.profiles.get(`${subagentId}-${modelTier}`);
  }

  /**
   * Get all profiles
   */
  getAllProfiles(): BehaviorProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Get recent drifts
   */
  getRecentDrifts(limit: number = 50): DriftDetection[] {
    return this.recentDrifts.slice(-limit);
  }

  /**
   * Get recent anomalies
   */
  getRecentAnomalies(limit: number = 100): AnomalyDetection[] {
    return this.recentAnomalies.slice(-limit);
  }

  /**
   * Get health summary
   */
  getHealthSummary(): {
    profileCount: number;
    totalSamples: number;
    recentAnomalies: number;
    recentDrifts: number;
    overallHealth: 'healthy' | 'warning' | 'critical';
  } {
    let totalSamples = 0;
    for (const samples of this.samples.values()) {
      totalSamples += samples.length;
    }

    const recentAnomalies = this.recentAnomalies.filter(
      a => Date.now() - a.timestamp.getTime() < 60 * 60 * 1000
    ).length;

    const recentDrifts = this.recentDrifts.filter(
      d => Date.now() - d.timestamp.getTime() < 60 * 60 * 1000
    ).length;

    let overallHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (recentDrifts > 0 || recentAnomalies > 5) overallHealth = 'warning';
    if (this.recentDrifts.some(d => d.severity === 'critical') || recentAnomalies > 20) {
      overallHealth = 'critical';
    }

    return {
      profileCount: this.profiles.size,
      totalSamples,
      recentAnomalies,
      recentDrifts,
      overallHealth,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export const behavioralMonitoringService = BehavioralMonitoringService.getInstance();
