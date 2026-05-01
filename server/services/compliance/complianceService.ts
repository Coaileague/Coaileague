import { db } from '../../db';
import { aiProactiveAlerts } from '../../../shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';

const log = createLogger('ComplianceService');

export interface CreateAlertParams {
  workspaceId: string;
  title: string;
  description?: string;
  severity: 'info' | 'warning' | 'high' | 'critical' | 'urgent';
  status?: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
  createdBy?: string;
}

type DbSeverity = 'low' | 'medium' | 'high' | 'critical';

function mapSeverity(s: string): DbSeverity {
  if (s === 'info') return 'low';
  if (s === 'warning') return 'medium';
  if (s === 'urgent') return 'critical';
  return s as DbSeverity;
}

export const complianceService = {
  async createAlert(params: CreateAlertParams) {
    const { workspaceId, title, description, severity, relatedEntityId, relatedEntityType, createdBy } = params;

    const dedupeHash = `compliance-${workspaceId}-${title}-${Date.now()}`.slice(0, 64);

    try {
      const [alert] = await db.insert(aiProactiveAlerts).values({
        workspaceId,
        alertType: 'compliance_violation',
        severity: mapSeverity(severity),
        status: 'queued',
        dedupeHash,
        payload: {
          title,
          description: description || title,
          relatedEntityId,
          relatedEntityType,
          createdBy,
          source: 'trinity_compliance_action',
        },
        contextSnapshot: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      log.info('Compliance alert created', { workspaceId, title, severity });
      return alert;
    } catch (err: unknown) {
      log.error('createAlert failed', { workspaceId, title, error: err?.message });
      throw err;
    }
  },

  async getActiveAlerts(workspaceId: string) {
    return db.select()
      .from(aiProactiveAlerts)
      .where(and(
        eq(aiProactiveAlerts.workspaceId, workspaceId),
        inArray(aiProactiveAlerts.status, ['queued', 'dispatched']),
      ))
      .limit(50);
  },
};
