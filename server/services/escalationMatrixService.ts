/**
 * Escalation Matrix Service - SLA-based escalation level calculation
 */

import { db } from "../db";
import { workspaces } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface EscalationLevel {
  level: number; // 0-3
  name: string;
  description: string;
  slaMinutes: number;
  requiredRoles: string[];
  notificationChannels: string[];
  responseTimeTarget: number; // minutes
}

export interface EscalationMatrix {
  critical: EscalationLevel;
  high: EscalationLevel;
  medium: EscalationLevel;
  low: EscalationLevel;
}

const DEFAULT_ESCALATION_MATRIX: EscalationMatrix = {
  critical: {
    level: 3,
    name: 'Executive',
    description: 'Immediate executive escalation required',
    slaMinutes: 15,
    requiredRoles: ['owner', 'sysop'],
    notificationChannels: ['email', 'sms', 'slack'],
    responseTimeTarget: 5,
  },
  high: {
    level: 2,
    name: 'Manager',
    description: 'Manager escalation required',
    slaMinutes: 60,
    requiredRoles: ['manager', 'supervisor'],
    notificationChannels: ['email', 'slack'],
    responseTimeTarget: 15,
  },
  medium: {
    level: 1,
    name: 'Team Lead',
    description: 'Team lead assignment recommended',
    slaMinutes: 240,
    requiredRoles: ['supervisor', 'support_agent'],
    notificationChannels: ['email'],
    responseTimeTarget: 30,
  },
  low: {
    level: 0,
    name: 'Standard',
    description: 'Standard handling by support team',
    slaMinutes: 1440,
    requiredRoles: ['support_agent'],
    notificationChannels: ['email'],
    responseTimeTarget: 120,
  },
};

/**
 * Get escalation level for a priority
 */
export function getEscalationLevel(
  priority: 'critical' | 'high' | 'medium' | 'low'
): EscalationLevel {
  return DEFAULT_ESCALATION_MATRIX[priority];
}

/**
 * Get full escalation matrix for workspace
 */
export async function getEscalationMatrix(workspaceId: string): Promise<EscalationMatrix> {
  // In the future, this could load from workspace configuration
  // For now, return defaults
  return DEFAULT_ESCALATION_MATRIX;
}

/**
 * Check if SLA is breached
 */
export function checkSLABreach(
  priority: 'critical' | 'high' | 'medium' | 'low',
  ageMinutes: number
): {
  breached: boolean;
  minutesUntilBreach: number;
  breachPercentage: number;
} {
  const escalation = getEscalationLevel(priority);
  const breached = ageMinutes > escalation.slaMinutes;
  const minutesUntilBreach = escalation.slaMinutes - ageMinutes;
  const breachPercentage = Math.round((ageMinutes / escalation.slaMinutes) * 100);

  return {
    breached,
    minutesUntilBreach: Math.max(0, minutesUntilBreach),
    breachPercentage: Math.min(100, breachPercentage),
  };
}

/**
 * Get recommended escalation action
 */
export function getEscalationAction(
  priority: 'critical' | 'high' | 'medium' | 'low',
  ageMinutes: number
): {
  action: string;
  escalateTo: string;
  urgency: 'immediate' | 'soon' | 'monitor';
} {
  const sla = checkSLABreach(priority, ageMinutes);
  const escalation = getEscalationLevel(priority);

  if (sla.breached) {
    return {
      action: 'ESCALATE_IMMEDIATELY',
      escalateTo: escalation.requiredRoles[0],
      urgency: 'immediate',
    };
  }

  if (sla.breachPercentage > 80) {
    return {
      action: 'PREPARE_ESCALATION',
      escalateTo: escalation.requiredRoles[0],
      urgency: 'soon',
    };
  }

  return {
    action: 'MONITOR',
    escalateTo: escalation.requiredRoles[0],
    urgency: 'monitor',
  };
}

export const escalationMatrixService = {
  getEscalationLevel,
  getEscalationMatrix,
  checkSLABreach,
  getEscalationAction,
};
