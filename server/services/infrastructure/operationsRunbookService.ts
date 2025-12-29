/**
 * Operations Runbook Service - 2026 Launch Hardening
 * 
 * Incident response procedures, playbooks, and operational documentation
 * for the platform operations team.
 */

interface Runbook {
  id: string;
  title: string;
  description: string;
  category: 'incident' | 'maintenance' | 'recovery' | 'security' | 'escalation';
  severity: 'p1' | 'p2' | 'p3' | 'p4';
  triggerConditions: string[];
  steps: RunbookStep[];
  estimatedDuration: number;
  requiredRoles: string[];
  relatedServices: string[];
  lastUpdated: Date;
  version: string;
  owner: string;
  reviewedBy?: string;
  reviewedAt?: Date;
}

interface RunbookStep {
  order: number;
  title: string;
  description: string;
  action: 'manual' | 'automated' | 'verification' | 'decision';
  command?: string;
  expectedOutcome: string;
  rollbackStep?: number;
  timeout?: number;
  automationScript?: string;
}

interface IncidentResponse {
  id: string;
  runbookId: string;
  incidentId: string;
  startedAt: Date;
  currentStep: number;
  status: 'in_progress' | 'completed' | 'failed' | 'escalated';
  responders: string[];
  stepResults: StepResult[];
  notes: string[];
  completedAt?: Date;
  resolution?: string;
}

interface StepResult {
  stepOrder: number;
  status: 'pending' | 'success' | 'failed' | 'skipped';
  startedAt?: Date;
  completedAt?: Date;
  output?: string;
  executedBy?: string;
}

interface RunbookStats {
  totalRunbooks: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  recentExecutions: number;
  averageResolutionTime: number;
}

class OperationsRunbookService {
  private runbooks: Map<string, Runbook> = new Map();
  private responses: Map<string, IncidentResponse> = new Map();
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.seedRunbooks();
    this.initialized = true;
    console.log('[OperationsRunbook] Service initialized with incident response procedures');
  }

  private seedRunbooks(): void {
    const now = new Date();
    const runbooks: Runbook[] = [
      {
        id: 'rb-db-failover',
        title: 'Database Failover Procedure',
        description: 'Steps to failover to database replica during primary outage',
        category: 'recovery',
        severity: 'p1',
        triggerConditions: ['Primary database unreachable', 'Database health check failing', 'Connection pool exhausted'],
        steps: [
          { order: 1, title: 'Confirm Outage', description: 'Verify database is actually down, not a monitoring false positive', action: 'verification', expectedOutcome: 'Database status confirmed', timeout: 60 },
          { order: 2, title: 'Notify Stakeholders', description: 'Send initial incident notification', action: 'manual', expectedOutcome: 'Stakeholders notified via Slack/email', timeout: 120 },
          { order: 3, title: 'Initiate Failover', description: 'Trigger failover to replica', action: 'automated', command: 'npm run db:failover', expectedOutcome: 'Replica promoted to primary', automationScript: 'scripts/db-failover.sh', timeout: 300 },
          { order: 4, title: 'Update Connection Strings', description: 'Point application to new primary', action: 'automated', expectedOutcome: 'Application connecting to new primary', timeout: 60 },
          { order: 5, title: 'Verify Data Integrity', description: 'Run data consistency checks', action: 'verification', expectedOutcome: 'No data loss detected', timeout: 300 },
          { order: 6, title: 'Monitor Recovery', description: 'Watch metrics for 15 minutes', action: 'verification', expectedOutcome: 'System stable, no errors', timeout: 900 },
          { order: 7, title: 'Send Resolution Notice', description: 'Notify stakeholders of resolution', action: 'manual', expectedOutcome: 'Resolution communicated', timeout: 60 }
        ],
        estimatedDuration: 30,
        requiredRoles: ['sysop', 'root_admin'],
        relatedServices: ['PostgreSQL Database', 'Connection Pooling', 'Disaster Recovery'],
        lastUpdated: now,
        version: '1.0',
        owner: 'platform-ops'
      },
      {
        id: 'rb-circuit-breaker',
        title: 'Circuit Breaker Trip Response',
        description: 'Response procedure when a circuit breaker trips',
        category: 'incident',
        severity: 'p2',
        triggerConditions: ['Circuit breaker in OPEN state', 'External service unavailable', 'High error rate on external calls'],
        steps: [
          { order: 1, title: 'Identify Affected Service', description: 'Determine which circuit breaker tripped', action: 'verification', expectedOutcome: 'Service identified', timeout: 60 },
          { order: 2, title: 'Check External Status', description: 'Verify if external service is actually down', action: 'manual', expectedOutcome: 'External status confirmed', timeout: 120 },
          { order: 3, title: 'Enable Fallback Mode', description: 'Activate fallback behavior if not automatic', action: 'decision', expectedOutcome: 'Fallback active', timeout: 60 },
          { order: 4, title: 'Monitor Half-Open State', description: 'Wait for circuit to transition to half-open', action: 'verification', expectedOutcome: 'Circuit in half-open state', timeout: 600 },
          { order: 5, title: 'Verify Recovery', description: 'Confirm service has recovered', action: 'verification', expectedOutcome: 'Circuit closed, service healthy', timeout: 300 }
        ],
        estimatedDuration: 20,
        requiredRoles: ['sysop', 'support_agent'],
        relatedServices: ['Circuit Breaker', 'Stripe', 'Gemini', 'Resend'],
        lastUpdated: now,
        version: '1.0',
        owner: 'platform-ops'
      },
      {
        id: 'rb-security-incident',
        title: 'Security Incident Response',
        description: 'Response to detected security threats or breaches',
        category: 'security',
        severity: 'p1',
        triggerConditions: ['Threat detected by Security Hardening', 'Unauthorized access attempt', 'Data breach suspected'],
        steps: [
          { order: 1, title: 'Assess Threat Level', description: 'Determine severity and scope of incident', action: 'verification', expectedOutcome: 'Threat level assessed', timeout: 300 },
          { order: 2, title: 'Isolate Affected Systems', description: 'Contain the incident if necessary', action: 'decision', expectedOutcome: 'Affected systems isolated', timeout: 300 },
          { order: 3, title: 'Notify Security Team', description: 'Alert security personnel immediately', action: 'manual', expectedOutcome: 'Security team engaged', timeout: 60 },
          { order: 4, title: 'Preserve Evidence', description: 'Capture logs and forensic data', action: 'automated', command: 'npm run security:preserve-logs', expectedOutcome: 'Evidence preserved', timeout: 600 },
          { order: 5, title: 'Block Threat Actor', description: 'Add IP/user to blocklist', action: 'manual', expectedOutcome: 'Threat actor blocked', timeout: 120 },
          { order: 6, title: 'Investigate Root Cause', description: 'Analyze how breach occurred', action: 'manual', expectedOutcome: 'Root cause identified', timeout: 3600 },
          { order: 7, title: 'Implement Remediation', description: 'Fix vulnerabilities', action: 'manual', expectedOutcome: 'Vulnerabilities patched', timeout: 7200 },
          { order: 8, title: 'Document Incident', description: 'Create incident report', action: 'manual', expectedOutcome: 'Incident documented', timeout: 1800 }
        ],
        estimatedDuration: 240,
        requiredRoles: ['root_admin', 'compliance_officer'],
        relatedServices: ['Security Hardening', 'Audit Trail Export', 'Log Aggregation'],
        lastUpdated: now,
        version: '1.0',
        owner: 'security-team'
      },
      {
        id: 'rb-sla-breach',
        title: 'SLA Breach Response',
        description: 'Response when SLA targets are not being met',
        category: 'escalation',
        severity: 'p2',
        triggerConditions: ['SLA compliance below target', 'Latency exceeds thresholds', 'Uptime drops below SLA'],
        steps: [
          { order: 1, title: 'Identify SLA Breach', description: 'Determine which SLA is affected', action: 'verification', expectedOutcome: 'SLA breach identified', timeout: 60 },
          { order: 2, title: 'Assess Impact', description: 'Determine affected customers and severity', action: 'verification', expectedOutcome: 'Impact assessed', timeout: 300 },
          { order: 3, title: 'Notify Account Managers', description: 'Alert customer-facing teams', action: 'manual', expectedOutcome: 'Account managers notified', timeout: 120 },
          { order: 4, title: 'Implement Mitigation', description: 'Take immediate action to restore SLA', action: 'decision', expectedOutcome: 'Mitigation in progress', timeout: 600 },
          { order: 5, title: 'Monitor Recovery', description: 'Track SLA metrics during recovery', action: 'verification', expectedOutcome: 'SLA metrics improving', timeout: 1800 },
          { order: 6, title: 'Document Resolution', description: 'Record cause and resolution', action: 'manual', expectedOutcome: 'Resolution documented', timeout: 300 }
        ],
        estimatedDuration: 60,
        requiredRoles: ['sysop', 'support_manager'],
        relatedServices: ['SLA Monitoring', 'Health Check Aggregation', 'Metrics Dashboard'],
        lastUpdated: now,
        version: '1.0',
        owner: 'platform-ops'
      },
      {
        id: 'rb-backup-restore',
        title: 'Backup Restore Procedure',
        description: 'Steps to restore from backup in case of data loss',
        category: 'recovery',
        severity: 'p1',
        triggerConditions: ['Data corruption detected', 'Accidental data deletion', 'Disaster recovery activated'],
        steps: [
          { order: 1, title: 'Assess Data Loss', description: 'Determine scope of data loss', action: 'verification', expectedOutcome: 'Data loss scope identified', timeout: 300 },
          { order: 2, title: 'Stop Write Operations', description: 'Prevent further data changes', action: 'automated', command: 'npm run db:read-only', expectedOutcome: 'Database in read-only mode', timeout: 60 },
          { order: 3, title: 'Select Backup Point', description: 'Choose appropriate backup to restore', action: 'decision', expectedOutcome: 'Backup point selected', timeout: 300 },
          { order: 4, title: 'Verify Backup Integrity', description: 'Check backup file integrity', action: 'automated', command: 'npm run backup:verify', expectedOutcome: 'Backup verified', timeout: 600 },
          { order: 5, title: 'Perform Restore', description: 'Restore data from backup', action: 'automated', command: 'npm run db:restore', expectedOutcome: 'Data restored', timeout: 3600, rollbackStep: 2 },
          { order: 6, title: 'Verify Data Integrity', description: 'Run consistency checks', action: 'verification', expectedOutcome: 'Data integrity verified', timeout: 600 },
          { order: 7, title: 'Resume Operations', description: 'Enable write operations', action: 'automated', command: 'npm run db:read-write', expectedOutcome: 'Normal operations resumed', timeout: 60 },
          { order: 8, title: 'Notify Stakeholders', description: 'Communicate resolution', action: 'manual', expectedOutcome: 'Stakeholders informed', timeout: 120 }
        ],
        estimatedDuration: 120,
        requiredRoles: ['root_admin', 'sysop'],
        relatedServices: ['Backup Service', 'Disaster Recovery', 'PostgreSQL Database'],
        lastUpdated: now,
        version: '1.0',
        owner: 'platform-ops'
      },
      {
        id: 'rb-scheduled-maintenance',
        title: 'Scheduled Maintenance Procedure',
        description: 'Standard procedure for planned maintenance windows',
        category: 'maintenance',
        severity: 'p3',
        triggerConditions: ['Scheduled maintenance window', 'System update required', 'Infrastructure upgrade'],
        steps: [
          { order: 1, title: 'Pre-Maintenance Notification', description: 'Send 24h advance notice', action: 'manual', expectedOutcome: 'Users notified', timeout: 300 },
          { order: 2, title: 'Backup Current State', description: 'Create pre-maintenance backup', action: 'automated', command: 'npm run backup:full', expectedOutcome: 'Backup completed', timeout: 1800 },
          { order: 3, title: 'Enable Maintenance Mode', description: 'Display maintenance page', action: 'automated', command: 'npm run maintenance:enable', expectedOutcome: 'Maintenance mode active', timeout: 60 },
          { order: 4, title: 'Perform Maintenance', description: 'Execute planned changes', action: 'manual', expectedOutcome: 'Changes applied', timeout: 7200 },
          { order: 5, title: 'Run Health Checks', description: 'Verify system health', action: 'automated', command: 'npm run health:check', expectedOutcome: 'All checks passing', timeout: 300 },
          { order: 6, title: 'Disable Maintenance Mode', description: 'Restore normal operations', action: 'automated', command: 'npm run maintenance:disable', expectedOutcome: 'System accessible', timeout: 60 },
          { order: 7, title: 'Monitor Post-Maintenance', description: 'Watch for issues', action: 'verification', expectedOutcome: 'No issues detected', timeout: 1800 },
          { order: 8, title: 'Send Completion Notice', description: 'Notify users of completion', action: 'manual', expectedOutcome: 'Users notified', timeout: 120 }
        ],
        estimatedDuration: 180,
        requiredRoles: ['sysop'],
        relatedServices: ['All Services'],
        lastUpdated: now,
        version: '1.0',
        owner: 'platform-ops'
      }
    ];

    runbooks.forEach(rb => {
      this.runbooks.set(rb.id, rb);
    });

    console.log(`[OperationsRunbook] Seeded ${runbooks.length} runbooks`);
  }

  async startResponse(runbookId: string, incidentId: string, responders: string[]): Promise<IncidentResponse | null> {
    const runbook = this.runbooks.get(runbookId);
    if (!runbook) return null;

    const response: IncidentResponse = {
      id: `response-${Date.now()}`,
      runbookId,
      incidentId,
      startedAt: new Date(),
      currentStep: 1,
      status: 'in_progress',
      responders,
      stepResults: runbook.steps.map(step => ({
        stepOrder: step.order,
        status: 'pending'
      })),
      notes: []
    };

    this.responses.set(response.id, response);
    console.log(`[OperationsRunbook] Started response for ${runbook.title} (incident: ${incidentId})`);
    return response;
  }

  async completeStep(responseId: string, stepOrder: number, output: string, executedBy: string): Promise<IncidentResponse | null> {
    const response = this.responses.get(responseId);
    if (!response) return null;

    const stepResult = response.stepResults.find(sr => sr.stepOrder === stepOrder);
    if (!stepResult) return null;

    stepResult.status = 'success';
    stepResult.completedAt = new Date();
    stepResult.output = output;
    stepResult.executedBy = executedBy;

    if (stepOrder === response.currentStep) {
      response.currentStep++;
    }

    const runbook = this.runbooks.get(response.runbookId);
    if (runbook && response.currentStep > runbook.steps.length) {
      response.status = 'completed';
      response.completedAt = new Date();
      console.log(`[OperationsRunbook] Response completed for incident ${response.incidentId}`);
    }

    return response;
  }

  async failStep(responseId: string, stepOrder: number, reason: string): Promise<IncidentResponse | null> {
    const response = this.responses.get(responseId);
    if (!response) return null;

    const stepResult = response.stepResults.find(sr => sr.stepOrder === stepOrder);
    if (!stepResult) return null;

    stepResult.status = 'failed';
    stepResult.completedAt = new Date();
    stepResult.output = reason;

    response.notes.push(`Step ${stepOrder} failed: ${reason}`);
    console.log(`[OperationsRunbook] Step ${stepOrder} failed for response ${responseId}`);

    return response;
  }

  async escalateResponse(responseId: string, reason: string): Promise<IncidentResponse | null> {
    const response = this.responses.get(responseId);
    if (!response) return null;

    response.status = 'escalated';
    response.notes.push(`Escalated: ${reason}`);
    console.log(`[OperationsRunbook] Response ${responseId} escalated: ${reason}`);

    return response;
  }

  async addNote(responseId: string, note: string): Promise<IncidentResponse | null> {
    const response = this.responses.get(responseId);
    if (!response) return null;

    response.notes.push(`[${new Date().toISOString()}] ${note}`);
    return response;
  }

  getRunbook(id: string): Runbook | null {
    return this.runbooks.get(id) || null;
  }

  listRunbooks(category?: string): Runbook[] {
    const runbooks = Array.from(this.runbooks.values());
    if (category) {
      return runbooks.filter(rb => rb.category === category);
    }
    return runbooks;
  }

  getResponse(id: string): IncidentResponse | null {
    return this.responses.get(id) || null;
  }

  listResponses(status?: string): IncidentResponse[] {
    const responses = Array.from(this.responses.values());
    if (status) {
      return responses.filter(r => r.status === status);
    }
    return responses;
  }

  getStats(): RunbookStats {
    const runbooks = Array.from(this.runbooks.values());
    const responses = Array.from(this.responses.values());
    
    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    
    runbooks.forEach(rb => {
      byCategory[rb.category] = (byCategory[rb.category] || 0) + 1;
      bySeverity[rb.severity] = (bySeverity[rb.severity] || 0) + 1;
    });

    const completed = responses.filter(r => r.status === 'completed' && r.completedAt);
    const resolutionTimes = completed.map(r => 
      r.completedAt!.getTime() - r.startedAt.getTime()
    );
    const avgResolution = resolutionTimes.length > 0
      ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length / 60000
      : 0;

    return {
      totalRunbooks: runbooks.length,
      byCategory,
      bySeverity,
      recentExecutions: responses.length,
      averageResolutionTime: Math.round(avgResolution)
    };
  }

  getHealth(): { healthy: boolean; runbookCount: number; activeResponses: number } {
    return {
      healthy: this.initialized,
      runbookCount: this.runbooks.size,
      activeResponses: Array.from(this.responses.values()).filter(r => r.status === 'in_progress').length
    };
  }

  async shutdown(): Promise<void> {
    console.log('[OperationsRunbook] Service shutdown');
  }
}

export const operationsRunbookService = new OperationsRunbookService();
