/**
 * Security Hardening Service - Q4 2026 Infrastructure
 * ====================================================
 * Advanced threat detection, intrusion prevention, and vulnerability scanning.
 * 
 * Features:
 * - Threat detection with pattern matching
 * - Intrusion prevention (IP blocking, rate limiting)
 * - Vulnerability scanning and reporting
 * - Security event logging
 * - Compliance checking
 */

type ThreatSeverity = 'low' | 'medium' | 'high' | 'critical';
type ThreatType = 'brute_force' | 'sql_injection' | 'xss' | 'csrf' | 'unauthorized_access' | 'data_exfiltration' | 'suspicious_pattern';

interface ThreatEvent {
  id: string;
  timestamp: Date;
  type: ThreatType;
  severity: ThreatSeverity;
  source: string; // IP or identifier
  target: string; // endpoint or resource
  description: string;
  blocked: boolean;
  metadata?: Record<string, any>;
}

interface BlockedEntity {
  id: string;
  type: 'ip' | 'user' | 'api_key';
  value: string;
  reason: string;
  blockedAt: Date;
  expiresAt?: Date;
  permanent: boolean;
}

interface VulnerabilityScan {
  id: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'running' | 'completed' | 'failed';
  findings: VulnerabilityFinding[];
  score: number; // 0-100
}

interface VulnerabilityFinding {
  id: string;
  severity: ThreatSeverity;
  category: string;
  title: string;
  description: string;
  remediation: string;
  affectedResource: string;
}

interface SecurityStats {
  totalThreats: number;
  threatsByType: Record<ThreatType, number>;
  threatsBySeverity: Record<ThreatSeverity, number>;
  blockedEntities: number;
  threatsBlocked: number;
  lastScan?: Date;
  securityScore: number;
}

interface ThreatPattern {
  id: string;
  name: string;
  pattern: RegExp;
  type: ThreatType;
  severity: ThreatSeverity;
  enabled: boolean;
}

class SecurityHardeningService {
  private initialized = false;
  private threats: Map<string, ThreatEvent> = new Map();
  private blockedEntities: Map<string, BlockedEntity> = new Map();
  private scans: Map<string, VulnerabilityScan> = new Map();
  private threatPatterns: Map<string, ThreatPattern> = new Map();
  
  // Rate limiting for threat sources
  private sourceAttempts: Map<string, { count: number; firstAttempt: Date }> = new Map();
  private blockThreshold = 10; // attempts before auto-block
  private blockWindowMs = 60000; // 1 minute window
  
  private cleanupInterval?: NodeJS.Timeout;
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Register default threat patterns
    this.registerDefaultPatterns();
    
    // Start cleanup of expired blocks
    this.startBlockCleanup();
    
    this.initialized = true;
    console.log('[SecurityHardening] Service initialized with threat detection active');
  }
  
  /**
   * Analyze a request for potential threats
   */
  analyzeRequest(
    source: string,
    target: string,
    payload: string | Record<string, any>
  ): {
    safe: boolean;
    threats: ThreatEvent[];
    blocked: boolean;
  } {
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const detectedThreats: ThreatEvent[] = [];
    
    // Check if source is blocked
    if (this.isBlocked(source)) {
      return { safe: false, threats: [], blocked: true };
    }
    
    // Check against threat patterns
    for (const pattern of this.threatPatterns.values()) {
      if (!pattern.enabled) continue;
      
      if (pattern.pattern.test(payloadStr)) {
        const threat = this.recordThreat(
          pattern.type,
          pattern.severity,
          source,
          target,
          `Detected ${pattern.name} pattern`
        );
        detectedThreats.push(threat);
      }
    }
    
    // Track attempts for rate limiting
    if (detectedThreats.length > 0) {
      this.trackAttempt(source);
    }
    
    // Auto-block if threshold exceeded
    const blocked = this.checkAutoBlock(source);
    
    return {
      safe: detectedThreats.length === 0 && !blocked,
      threats: detectedThreats,
      blocked,
    };
  }
  
  /**
   * Record a threat event
   */
  recordThreat(
    type: ThreatType,
    severity: ThreatSeverity,
    source: string,
    target: string,
    description: string,
    metadata?: Record<string, any>
  ): ThreatEvent {
    const threat: ThreatEvent = {
      id: `threat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      type,
      severity,
      source,
      target,
      description,
      blocked: this.isBlocked(source),
      metadata,
    };
    
    this.threats.set(threat.id, threat);
    
    // Internal event: security_threat_detected
    
    // Auto-block on critical threats
    if (severity === 'critical') {
      this.blockEntity('ip', source, 'Critical threat detected', 24 * 60 * 60 * 1000);
    }
    
    console.log(`[SecurityHardening] Threat detected: ${type} (${severity}) from ${source}`);
    
    return threat;
  }
  
  /**
   * Block an entity (IP, user, or API key)
   */
  blockEntity(
    type: 'ip' | 'user' | 'api_key',
    value: string,
    reason: string,
    durationMs?: number
  ): BlockedEntity {
    const entity: BlockedEntity = {
      id: `block-${Date.now()}`,
      type,
      value,
      reason,
      blockedAt: new Date(),
      expiresAt: durationMs ? new Date(Date.now() + durationMs) : undefined,
      permanent: !durationMs,
    };
    
    this.blockedEntities.set(`${type}:${value}`, entity);
    
    // Internal event: entity_blocked
    
    console.log(`[SecurityHardening] Blocked ${type}: ${value} - ${reason}`);
    
    return entity;
  }
  
  /**
   * Unblock an entity
   */
  unblockEntity(type: 'ip' | 'user' | 'api_key', value: string): boolean {
    const key = `${type}:${value}`;
    if (this.blockedEntities.has(key)) {
      this.blockedEntities.delete(key);
      console.log(`[SecurityHardening] Unblocked ${type}: ${value}`);
      return true;
    }
    return false;
  }
  
  /**
   * Check if an entity is blocked
   */
  isBlocked(value: string, type?: 'ip' | 'user' | 'api_key'): boolean {
    if (type) {
      return this.blockedEntities.has(`${type}:${value}`);
    }
    
    // Check all types
    return (
      this.blockedEntities.has(`ip:${value}`) ||
      this.blockedEntities.has(`user:${value}`) ||
      this.blockedEntities.has(`api_key:${value}`)
    );
  }
  
  /**
   * Run a vulnerability scan
   */
  async runVulnerabilityScan(): Promise<VulnerabilityScan> {
    const scan: VulnerabilityScan = {
      id: `scan-${Date.now()}`,
      startedAt: new Date(),
      status: 'running',
      findings: [],
      score: 100,
    };
    
    this.scans.set(scan.id, scan);
    
    try {
      // Simulate scanning various areas
      await this.scanDependencies(scan);
      await this.scanConfiguration(scan);
      await this.scanEndpoints(scan);
      
      // Calculate score
      scan.score = this.calculateSecurityScore(scan.findings);
      scan.status = 'completed';
    } catch (error: any) {
      scan.status = 'failed';
      console.error('[SecurityHardening] Vulnerability scan failed:', error);
    }
    
    scan.completedAt = new Date();
    
    // Internal event: vulnerability_scan_completed
    
    return scan;
  }
  
  /**
   * Get security statistics
   */
  getStats(): SecurityStats {
    const threats = Array.from(this.threats.values());
    
    const threatsByType: Record<ThreatType, number> = {
      brute_force: 0,
      sql_injection: 0,
      xss: 0,
      csrf: 0,
      unauthorized_access: 0,
      data_exfiltration: 0,
      suspicious_pattern: 0,
    };
    
    const threatsBySeverity: Record<ThreatSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };
    
    let threatsBlocked = 0;
    
    for (const threat of threats) {
      threatsByType[threat.type]++;
      threatsBySeverity[threat.severity]++;
      if (threat.blocked) threatsBlocked++;
    }
    
    const scans = Array.from(this.scans.values())
      .filter(s => s.status === 'completed')
      .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0));
    
    return {
      totalThreats: threats.length,
      threatsByType,
      threatsBySeverity,
      blockedEntities: this.blockedEntities.size,
      threatsBlocked,
      lastScan: scans[0]?.completedAt,
      securityScore: scans[0]?.score || 100,
    };
  }
  
  /**
   * Get recent threats
   */
  getRecentThreats(limit = 50): ThreatEvent[] {
    return Array.from(this.threats.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }
  
  /**
   * Get blocked entities
   */
  getBlockedEntities(): BlockedEntity[] {
    return Array.from(this.blockedEntities.values());
  }
  
  /**
   * Get latest scan results
   */
  getLatestScan(): VulnerabilityScan | null {
    const scans = Array.from(this.scans.values())
      .filter(s => s.status === 'completed')
      .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0));
    
    return scans[0] || null;
  }
  
  /**
   * Get health status
   */
  getHealth(): {
    healthy: boolean;
    securityScore: number;
    activeThreats: number;
    blockedSources: number;
    issues: string[];
  } {
    const stats = this.getStats();
    const issues: string[] = [];
    
    // Check for recent high/critical threats
    const recentThreats = Array.from(this.threats.values())
      .filter(t => t.timestamp.getTime() > Date.now() - 60 * 60 * 1000) // Last hour
      .filter(t => t.severity === 'high' || t.severity === 'critical');
    
    if (recentThreats.length > 0) {
      issues.push(`${recentThreats.length} high/critical threats in last hour`);
    }
    
    if (stats.securityScore < 80) {
      issues.push(`Low security score: ${stats.securityScore}/100`);
    }
    
    if (stats.blockedEntities > 100) {
      issues.push(`High number of blocked entities: ${stats.blockedEntities}`);
    }
    
    return {
      healthy: issues.length === 0 && stats.securityScore >= 80,
      securityScore: stats.securityScore,
      activeThreats: recentThreats.length,
      blockedSources: stats.blockedEntities,
      issues,
    };
  }
  
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    console.log('[SecurityHardening] Service shut down');
  }
  
  // Private methods
  
  private registerDefaultPatterns(): void {
    const patterns: Array<{
      name: string;
      pattern: RegExp;
      type: ThreatType;
      severity: ThreatSeverity;
    }> = [
      {
        name: 'SQL Injection',
        pattern: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|OR|AND)\b.*=.*('|"))|(--)|(;.*DROP)/i,
        type: 'sql_injection',
        severity: 'high',
      },
      {
        name: 'XSS Attack',
        pattern: /<script[^>]*>|javascript:|on\w+\s*=/i,
        type: 'xss',
        severity: 'high',
      },
      {
        name: 'Path Traversal',
        pattern: /\.\.[\/\\]/,
        type: 'suspicious_pattern',
        severity: 'medium',
      },
      {
        name: 'Command Injection',
        pattern: /[;&|`$]|(\|\|)|(&&)/,
        type: 'suspicious_pattern',
        severity: 'high',
      },
      {
        name: 'LDAP Injection',
        pattern: /[()\\*]/,
        type: 'suspicious_pattern',
        severity: 'medium',
      },
    ];
    
    for (const p of patterns) {
      this.threatPatterns.set(p.name, {
        id: `pattern-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        name: p.name,
        pattern: p.pattern,
        type: p.type,
        severity: p.severity,
        enabled: true,
      });
    }
    
    console.log(`[SecurityHardening] Registered ${patterns.length} threat patterns`);
  }
  
  private trackAttempt(source: string): void {
    const data = this.sourceAttempts.get(source);
    const now = new Date();
    
    if (!data || now.getTime() - data.firstAttempt.getTime() > this.blockWindowMs) {
      this.sourceAttempts.set(source, { count: 1, firstAttempt: now });
    } else {
      data.count++;
    }
  }
  
  private checkAutoBlock(source: string): boolean {
    const data = this.sourceAttempts.get(source);
    if (!data) return false;
    
    if (data.count >= this.blockThreshold) {
      this.blockEntity('ip', source, 'Automatic block: Too many threat attempts', 60 * 60 * 1000);
      this.sourceAttempts.delete(source);
      return true;
    }
    
    return false;
  }
  
  private startBlockCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entity] of this.blockedEntities.entries()) {
        if (entity.expiresAt && entity.expiresAt.getTime() < now) {
          this.blockedEntities.delete(key);
          console.log(`[SecurityHardening] Block expired for ${entity.type}: ${entity.value}`);
        }
      }
    }, 60000); // Check every minute
  }
  
  private async scanDependencies(scan: VulnerabilityScan): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 50));
    // In production, would check npm audit, etc.
  }
  
  private async scanConfiguration(scan: VulnerabilityScan): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Check for common misconfigurations
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
      scan.findings.push({
        id: `finding-${Date.now()}-1`,
        severity: 'high',
        category: 'Configuration',
        title: 'Weak Session Secret',
        description: 'Session secret should be at least 32 characters',
        remediation: 'Set a strong SESSION_SECRET environment variable',
        affectedResource: 'Session Management',
      });
    }
  }
  
  private async scanEndpoints(scan: VulnerabilityScan): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 50));
    // In production, would test endpoints for vulnerabilities
  }
  
  private calculateSecurityScore(findings: VulnerabilityFinding[]): number {
    let score = 100;
    
    for (const finding of findings) {
      switch (finding.severity) {
        case 'critical':
          score -= 25;
          break;
        case 'high':
          score -= 15;
          break;
        case 'medium':
          score -= 10;
          break;
        case 'low':
          score -= 5;
          break;
      }
    }
    
    return Math.max(0, score);
  }
}

export const securityHardeningService = new SecurityHardeningService();
