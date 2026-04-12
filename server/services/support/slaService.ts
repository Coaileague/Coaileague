/**
 * SLA Service — Phase 9
 *
 * Computes SLA response and resolution deadlines from ticket priority.
 * All SLA windows are based on calendar hours (not business hours).
 *
 * Priority → response target / resolution target:
 *   urgent  →  1 h  /  4 h
 *   high    →  4 h  /  24 h
 *   normal  →  24 h /  72 h
 *   low     →  72 h / 168 h  (7 days)
 */

export interface SlaTargets {
  responseTimeTarget: Date;
  resolutionTimeTarget: Date;
}

const SLA_HOURS: Record<string, { response: number; resolution: number }> = {
  urgent: { response: 1,  resolution: 4   },
  high:   { response: 4,  resolution: 24  },
  normal: { response: 24, resolution: 72  },
  low:    { response: 72, resolution: 168 },
};

const DEFAULT_SLA = SLA_HOURS['normal'];

/**
 * Compute the SLA response and resolution deadline timestamps.
 *
 * @param priority - Ticket priority: 'urgent' | 'high' | 'normal' | 'low'
 * @param from     - Reference instant (typically new Date() at ticket creation)
 * @returns        - { responseTimeTarget, resolutionTimeTarget }
 */
export function computeSlaTargets(priority: string, from: Date): SlaTargets {
  const sla = SLA_HOURS[priority] ?? DEFAULT_SLA;
  const MS_PER_HOUR = 60 * 60 * 1000;
  return {
    responseTimeTarget:  new Date(from.getTime() + sla.response   * MS_PER_HOUR),
    resolutionTimeTarget: new Date(from.getTime() + sla.resolution * MS_PER_HOUR),
  };
}
