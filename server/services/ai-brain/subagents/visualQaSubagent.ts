
import { createLogger } from '../../../lib/logger';
const log = createLogger('visualQaSubagent');
/**
 * VISUAL QA SUBAGENT
 * Visual QA is a deferred capability. The subagent preserves its full
 * interface contract and returns a graceful "disabled" status so callers
 * (autonomousScheduler, toolCapabilityRegistry) handle it without errors.
 * When enabled, it will integrate with a screenshot + vision model pipeline.
 */

export const ANOMALY_CATEGORIES = [
  'broken_icon',
  'layout_shift',
  'text_overlap',
  'missing_element',
  'color_mismatch',
  'font_issue',
  'alignment_error',
  'responsive_issue',
  'z_index_problem',
  'spacing_issue',
  'visual_regression',
] as const;

export type AnomalyCategory = typeof ANOMALY_CATEGORIES[number];

export interface VisualAnomaly {
  category: AnomalyCategory;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description: string;
  confidence: number;
  boundingBox?: { y_min: number; x_min: number; y_max: number; x_max: number };
  elementType?: string;
  suggestedFix?: string;
  suggestedCss?: string;
}

export interface VisualAnalysisResult {
  anomalies: VisualAnomaly[];
  summary: string;
  overallSeverity: 'critical' | 'high' | 'medium' | 'low' | 'none';
  selfHealable: boolean;
}

export interface VqaCheckOptions {
  workspaceId: string;
  pageUrl: string;
  pageName?: string;
  viewport?: { width: number; height: number; deviceName?: string };
  triggeredBy?: string;
  triggerSource?: 'manual' | 'scheduled' | 'trinity' | 'monitoring';
  compareToBaseline?: boolean;
}

export interface VqaCheckResult {
  runId: string;
  status: string;
  anomalies: VisualAnomaly[];
  summary: string;
  selfHealAttempted: boolean;
  selfHealSuccess?: boolean;
}

class VisualQaSubagent {
  async runCheck(_options: VqaCheckOptions): Promise<VqaCheckResult> {
    return {
      runId: 'stub',
      status: 'disabled',
      anomalies: [],
      summary: 'Visual QA is currently disabled.',
      selfHealAttempted: false,
    };
  }

  /** Alias used by autonomousScheduler — maps legacy call signature to runCheck */
  async runVisualCheck(options: {
    url?: string;
    pageUrl?: string;
    workspaceId: string;
    triggerSource?: string;
    triggeredBy?: string | null;
    pageName?: string;
  }): Promise<{ findings: VisualAnomaly[]; anomalies: VisualAnomaly[]; summary: string; status: string; runId: string }> {
    return {
      runId: 'stub',
      status: 'disabled',
      findings: [],
      anomalies: [],
      summary: 'Visual QA is currently disabled.',
    };
  }

  async setBaseline(_workspaceId: string, _pageUrl: string, _pageName?: string): Promise<{ baselineId: string }> {
    return { baselineId: 'stub' };
  }

  async getRunHistory(_workspaceId: string, _limit?: number): Promise<any[]> {
    return [];
  }

  async getFindings(_runId: string): Promise<any[]> {
    return [];
  }

  async acknowledgeFindings(_findingIds: string[]): Promise<void> {
    return;
  }
}

export const visualQaSubagent = new VisualQaSubagent();
