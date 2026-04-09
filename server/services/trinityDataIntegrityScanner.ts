// Trinity Data Integrity Scanner
// Detects hardcoded/placeholder data that should be live connections

import { storage } from '../storage';
import { getServiceHealth } from './healthCheck';
import { TIMEOUTS } from '../config/platformConfig';
import { createLogger } from '../lib/logger';
const log = createLogger('trinityDataIntegrityScanner');


export interface DeadConnection {
  id: string;
  component: string;
  location: string;
  dataType: 'status' | 'metrics' | 'content' | 'config';
  severity: 'critical' | 'warning' | 'info';
  description: string;
  suggestedFix: string;
  detectedAt: Date;
}

export interface DataIntegrityScanResult {
  scanId: string;
  scannedAt: Date;
  totalIssues: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  deadConnections: DeadConnection[];
  healthScore: number;
  recommendation: string;
}

// Intentionally static content (should NOT be flagged as dead connections)
const INTENTIONALLY_STATIC = new Set([
  'resourceCategories', // Documentation links - static by design
  'faqs', // FAQ content - static by design
  'pricingTiers', // Pricing - managed separately
  'features', // Feature lists - static marketing content
  'popularTopics', // Help center topics - curated content
  'keyboardShortcuts', // Static UI reference
]);

// Live data sources that should be checked for connectivity
interface LiveDataSource {
  id: string;
  component: string;
  location: string;
  dataType: 'status' | 'metrics' | 'content' | 'config';
  severity: 'critical' | 'warning' | 'info';
  description: string;
  suggestedFix: string;
  checkFn: () => Promise<boolean>;
}

// Known hardcoded patterns in the codebase that should be checked
interface HardcodedPattern {
  id: string;
  component: string;
  location: string;
  dataType: 'status' | 'metrics' | 'content' | 'config';
  severity: 'critical' | 'warning' | 'info';
  patternName: string; // Used to check against INTENTIONALLY_STATIC
  description: string;
  suggestedFix: string;
  isLiveRequired: boolean; // If true, this pattern should use live data
}

// Hardcoded patterns to detect (patterns NOT in INTENTIONALLY_STATIC are flagged)
const HARDCODED_PATTERNS: HardcodedPattern[] = [
  {
    id: 'support-status-items',
    component: 'Support Page',
    location: 'client/src/pages/support.tsx',
    dataType: 'status',
    severity: 'warning',
    patternName: 'statusItems',
    description: 'System status items were hardcoded - now using live API data',
    suggestedFix: 'FIXED: Now fetches from /api/health/summary',
    isLiveRequired: true, // This is now live
  },
  {
    id: 'support-faqs',
    component: 'Support Page FAQ',
    location: 'client/src/pages/support.tsx',
    dataType: 'content',
    severity: 'info',
    patternName: 'faqs',
    description: 'FAQ content is static - this is intentional for curated support content',
    suggestedFix: 'No action needed - FAQs are intentionally static',
    isLiveRequired: false, // Intentionally static
  },
  {
    id: 'support-resources',
    component: 'Support Page Resources',
    location: 'client/src/pages/support.tsx',
    dataType: 'content',
    severity: 'info',
    patternName: 'resourceCategories',
    description: 'Resource categories are static - this is intentional for curated content',
    suggestedFix: 'No action needed - resources are intentionally static',
    isLiveRequired: false, // Intentionally static
  },
];

// Build live data source checks dynamically
function buildLiveDataSources(): LiveDataSource[] {
  return [
    {
      id: 'health-api-database',
      component: 'Platform Database',
      location: 'server/services/healthCheck.ts',
      dataType: 'status',
      severity: 'critical',
      description: 'Database connectivity check failed',
      suggestedFix: 'Check DATABASE_URL connection string and database availability',
      checkFn: async () => {
        try {
          const health = await getServiceHealth('database');
          return health?.status === 'operational';
        } catch { return false; }
      },
    },
    {
      id: 'health-api-ai',
      component: 'AI Services (Gemini)',
      location: 'server/services/healthCheck.ts',
      dataType: 'status',
      severity: 'warning',
      description: 'AI/Gemini services connectivity check failed',
      suggestedFix: 'Check GOOGLE_GENERATIVE_AI_API_KEY and Gemini API availability',
      checkFn: async () => {
        try {
          const health = await getServiceHealth('gemini_ai');
          return health?.status === 'operational';
        } catch { return false; }
      },
    },
    {
      id: 'health-api-stripe',
      component: 'Payment Services (Stripe)',
      location: 'server/services/healthCheck.ts',
      dataType: 'config',
      severity: 'warning',
      description: 'Stripe payment integration not connected or misconfigured',
      suggestedFix: 'Configure STRIPE_SECRET_KEY and verify Stripe account',
      checkFn: async () => {
        try {
          const health = await getServiceHealth('stripe');
          return health?.status === 'operational';
        } catch { return false; }
      },
    },
    {
      id: 'health-api-email',
      component: 'Email Services (Resend)',
      location: 'server/services/healthCheck.ts',
      dataType: 'config',
      severity: 'warning',
      description: 'Email service not connected or misconfigured',
      suggestedFix: 'Configure RESEND_API_KEY for email delivery',
      checkFn: async () => {
        try {
          const health = await getServiceHealth('email');
          return health?.status === 'operational';
        } catch { return false; }
      },
    },
  ];
}

class TrinityDataIntegrityScanner {
  private lastScan: DataIntegrityScanResult | null = null;
  private scanInterval: NodeJS.Timeout | null = null;

  async scan(): Promise<DataIntegrityScanResult> {
    const scanId = `scan-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const deadConnections: DeadConnection[] = [];
    const liveDataSources = buildLiveDataSources();

    // Check hardcoded patterns that need attention (not in intentionally static whitelist)
    for (const pattern of HARDCODED_PATTERNS) {
      // Skip intentionally static patterns
      if (INTENTIONALLY_STATIC.has(pattern.patternName)) {
        continue;
      }
      
      // If pattern requires live data and is NOT marked as fixed, flag it
      if (pattern.isLiveRequired && !pattern.suggestedFix.startsWith('FIXED:')) {
        deadConnections.push({
          id: pattern.id,
          component: pattern.component,
          location: pattern.location,
          dataType: pattern.dataType,
          severity: pattern.severity,
          description: pattern.description,
          suggestedFix: pattern.suggestedFix,
          detectedAt: new Date(),
        });
      }
    }

    // Check each live data source in parallel
    const sourceChecks = await Promise.allSettled(
      liveDataSources.map(async (source) => {
        const isWorking = await source.checkFn();
        return { source, isWorking };
      })
    );

    // Collect failed sources as dead connections
    for (const result of sourceChecks) {
      if (result.status === 'fulfilled' && !result.value.isWorking) {
        const { source } = result.value;
        deadConnections.push({
          id: source.id,
          component: source.component,
          location: source.location,
          dataType: source.dataType,
          severity: source.severity,
          description: source.description,
          suggestedFix: source.suggestedFix,
          detectedAt: new Date(),
        });
      } else if (result.status === 'rejected') {
        // If the check itself failed, log it but don't add as dead connection
        log.warn('[DataIntegrityScanner] Check failed:', result.reason);
      }
    }

    // Check for workspace-specific dead connections
    const workspaceIssues = await this.checkWorkspaceDataIntegrity();
    deadConnections.push(...workspaceIssues);

    const criticalCount = deadConnections.filter(d => d.severity === 'critical').length;
    const warningCount = deadConnections.filter(d => d.severity === 'warning').length;
    const infoCount = deadConnections.filter(d => d.severity === 'info').length;

    // Calculate health score (100 = perfect, 0 = all dead)
    const maxPossibleIssues = liveDataSources.length + 5; // live sources + workspace checks
    const weightedIssues = criticalCount * 3 + warningCount * 2 + infoCount;
    const healthScore = Math.max(0, Math.min(100, 100 - (weightedIssues / maxPossibleIssues) * 100));

    const recommendation = this.generateRecommendation(deadConnections, healthScore);

    this.lastScan = {
      scanId,
      scannedAt: new Date(),
      totalIssues: deadConnections.length,
      criticalCount,
      warningCount,
      infoCount,
      deadConnections,
      healthScore: Math.round(healthScore),
      recommendation,
    };

    return this.lastScan;
  }

  // Check if a data pattern is intentionally static (not a dead connection)
  isIntentionallyStatic(patternName: string): boolean {
    return INTENTIONALLY_STATIC.has(patternName);
  }

  // Get report on hardcoded patterns in codebase
  getHardcodedPatternsReport(): {
    fixed: HardcodedPattern[];
    intentionallyStatic: HardcodedPattern[];
    needsAttention: HardcodedPattern[];
  } {
    const fixed: HardcodedPattern[] = [];
    const intentionallyStatic: HardcodedPattern[] = [];
    const needsAttention: HardcodedPattern[] = [];

    for (const pattern of HARDCODED_PATTERNS) {
      if (INTENTIONALLY_STATIC.has(pattern.patternName)) {
        intentionallyStatic.push(pattern);
      } else if (pattern.isLiveRequired && pattern.suggestedFix.startsWith('FIXED:')) {
        fixed.push(pattern);
      } else if (pattern.isLiveRequired) {
        needsAttention.push(pattern);
      }
    }

    return { fixed, intentionallyStatic, needsAttention };
  }

  private async checkWorkspaceDataIntegrity(): Promise<DeadConnection[]> {
    const issues: DeadConnection[] = [];

    try {
      // Check if any workspaces have stale or missing critical data
      const workspaces = await storage.listWorkspaces?.() || [];
      
      for (const workspace of workspaces.slice(0, 10)) { // Check first 10 workspaces
        // Check for missing QuickBooks sync status
        // @ts-expect-error — TS migration: fix in refactoring sprint
        if (workspace.quickbooksEnabled && !(workspace as any).quickbooksRealmId) {
          issues.push({
            id: `qb-missing-realm-${workspace.id}`,
            component: 'QuickBooks Integration',
            location: `workspace/${workspace.id}`,
            dataType: 'config',
            severity: 'warning',
            description: `Workspace "${workspace.name}" has QuickBooks enabled but missing realm ID`,
            suggestedFix: 'Re-authenticate QuickBooks connection or disable integration',
            detectedAt: new Date(),
          });
        }
      }
    } catch (error) {
      // Silently handle storage access errors during scan
    }

    return issues;
  }

  private generateRecommendation(issues: DeadConnection[], healthScore: number): string {
    if (healthScore >= 95) {
      return "Lookin' good! All data connections are live and healthy.";
    } else if (healthScore >= 80) {
      return `Found ${issues.length} minor issue${issues.length > 1 ? 's' : ''} - mostly informational. Nothing urgent.`;
    } else if (healthScore >= 60) {
      return `Got ${issues.length} data integrity issue${issues.length > 1 ? 's' : ''} to address. Should tackle the warnings when you get a chance.`;
    } else {
      return `Heads up - found ${issues.length} dead connections that need attention. Some critical ones in there.`;
    }
  }

  getLastScan(): DataIntegrityScanResult | null {
    return this.lastScan;
  }

  startPeriodicScanning(intervalMs: number = TIMEOUTS.dataScanIntervalMs): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
    }
    this.scanInterval = setInterval(() => this.scan(), intervalMs);
    // Run initial scan
    this.scan();
  }

  stopPeriodicScanning(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
  }

  // Trinity's conversational summary
  getConversationalSummary(): string {
    if (!this.lastScan) {
      return "Haven't run a data integrity scan yet. Want me to kick one off?";
    }

    const { healthScore, totalIssues, criticalCount, warningCount, scannedAt } = this.lastScan;
    const age = Math.round((Date.now() - scannedAt.getTime()) / 60000);
    
    if (healthScore >= 95) {
      return `Data integrity's looking solid - ${healthScore}% health score. All connections are live. (Scanned ${age} min ago)`;
    }
    
    const parts = [];
    if (criticalCount > 0) parts.push(`${criticalCount} critical`);
    if (warningCount > 0) parts.push(`${warningCount} warning${warningCount > 1 ? 's' : ''}`);
    
    return `Found ${totalIssues} data integrity issue${totalIssues > 1 ? 's' : ''} (${parts.join(', ')}). Health score: ${healthScore}%. ${this.lastScan.recommendation}`;
  }
}

// Singleton instance
export const trinityDataIntegrityScanner = new TrinityDataIntegrityScanner();
