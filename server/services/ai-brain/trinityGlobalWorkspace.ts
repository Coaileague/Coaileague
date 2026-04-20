/**
 * TRINITY GLOBAL WORKSPACE
 * =========================
 * Biological analog: Global Workspace Theory (Baars, 1988).
 *
 * When any brain region detects something important, it broadcasts to the
 * global workspace. All other regions can read it and incorporate it into
 * their processing. This is how human brains create unified conscious
 * experience.
 *
 * In Trinity:
 *   • Limbic detects frustration → broadcast → PFC adjusts urgency → Memory
 *     tags event emotionally → Thought engine shifts response strategy.
 *   • Prefrontal detects CRISIS → broadcast → entire chat flow shifts to
 *     stabilization posture.
 *   • Somatic marker fires → broadcast → Thought engine elevates deliberation.
 *
 * This service is IN-MEMORY and non-persistent by design. Signals decay over
 * a 30-minute window and only high-intensity signals contribute to the
 * active-context block injected into Trinity's system prompt.
 *
 * It complements `trinityConnectomeService.broadcastToGlobalWorkspace()` —
 * that one emits to the platform event bus for cross-service subscribers;
 * this one keeps the rolling window needed to build a per-workspace context
 * snapshot on demand.
 */

import { createLogger } from '../../lib/logger';
import { broadcastToGlobalWorkspace, type BrainRegion } from './trinityConnectomeService';

const log = createLogger('trinityGlobalWorkspace');

export type WorkspaceSignalSource =
  | 'limbic'
  | 'somatic'
  | 'prefrontal'
  | 'thalamus'
  | 'memory'
  | 'temporal'
  | 'social'
  | 'narrative'
  | 'hypothesis'
  | 'reflection';

export interface WorkspaceSignal {
  source: WorkspaceSignalSource;
  type: string;
  intensity: number;            // 0 – 10
  workspaceId: string;
  userId?: string;
  payload: Record<string, unknown>;
  timestamp: Date;
}

const SIGNAL_WINDOW_MS = 30 * 60 * 1000;    // 30 minutes
const MAX_SIGNALS_PER_WORKSPACE = 50;
const HIGH_INTENSITY_THRESHOLD = 7;

const BRAIN_REGION_BY_SOURCE: Record<WorkspaceSignalSource, BrainRegion> = {
  limbic:     'AMYGDALA',
  somatic:    'AMYGDALA',
  prefrontal: 'PREFRONTAL_CORTEX',
  thalamus:   'GLOBAL_WORKSPACE',
  memory:     'HIPPOCAMPUS',
  temporal:   'HIPPOCAMPUS',
  social:     'HIPPOCAMPUS',
  narrative:  'WERNICKE_BROCA',
  hypothesis: 'PREFRONTAL_CORTEX',
  reflection: 'PREFRONTAL_CORTEX',
};

class TrinityGlobalWorkspace {
  private signals: Map<string, WorkspaceSignal[]> = new Map();

  /**
   * Broadcast a signal from a brain region. Signals are kept in the rolling
   * 30-minute window and the top 50 are retained per workspace.
   *
   * Also propagates to the connectome's platformEventBus so cross-service
   * subscribers (other brains) can react immediately.
   */
  broadcast(signal: WorkspaceSignal): void {
    if (!signal.workspaceId) return;

    const existing = this.signals.get(signal.workspaceId) ?? [];
    existing.push(signal);
    if (existing.length > MAX_SIGNALS_PER_WORKSPACE) existing.shift();
    this.signals.set(signal.workspaceId, existing);

    try {
      broadcastToGlobalWorkspace(
        BRAIN_REGION_BY_SOURCE[signal.source],
        `${signal.source}.${signal.type}`,
        signal.payload,
        signal.workspaceId,
        Math.min(1, signal.intensity / 10),
      );
    } catch (err: any) {
      log.warn('[GlobalWorkspace] Connectome broadcast failed (non-fatal):', err?.message);
    }
  }

  /** Return signals fired within the last 30 min for a workspace. */
  getActiveSignals(workspaceId: string): WorkspaceSignal[] {
    const cutoff = new Date(Date.now() - SIGNAL_WINDOW_MS);
    const fresh = (this.signals.get(workspaceId) ?? [])
      .filter(s => s.timestamp > cutoff)
      .sort((a, b) => b.intensity - a.intensity);
    if (fresh.length !== (this.signals.get(workspaceId) ?? []).length) {
      this.signals.set(workspaceId, fresh);
    }
    return fresh;
  }

  /**
   * Build a prompt-injection block summarising currently active
   * high-intensity cognitive signals. Returns '' if nothing is hot.
   */
  buildContextBlock(workspaceId: string): string {
    const signals = this.getActiveSignals(workspaceId);
    const highIntensity = signals.filter(s => s.intensity >= HIGH_INTENSITY_THRESHOLD);
    if (highIntensity.length === 0) return '';

    const lines = highIntensity.slice(0, 6).map(s => {
      const ago = Math.max(1, Math.round((Date.now() - s.timestamp.getTime()) / 60000));
      const payloadSnippet = Object.entries(s.payload)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .slice(0, 3)
        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 60)}`)
        .join(', ');
      return `- [${s.source.toUpperCase()}] ${s.type} (${s.intensity}/10, ${ago}m ago)${payloadSnippet ? ` — ${payloadSnippet}` : ''}`;
    });

    return `\nACTIVE COGNITIVE SIGNALS (Global Workspace — cross-region awareness):\n${lines.join('\n')}`;
  }

  /** Get count of active signals by source for diagnostics. */
  getSignalSummary(workspaceId: string): Record<string, number> {
    const summary: Record<string, number> = {};
    for (const s of this.getActiveSignals(workspaceId)) {
      summary[s.source] = (summary[s.source] ?? 0) + 1;
    }
    return summary;
  }

  /** Explicit clear — used by tests and session-boundary resets. */
  clear(workspaceId: string): void {
    this.signals.delete(workspaceId);
  }
}

export const trinityGlobalWorkspace = new TrinityGlobalWorkspace();
