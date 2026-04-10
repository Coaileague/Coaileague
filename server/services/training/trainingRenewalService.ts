/**
 * Training Certificate Renewal Service
 * ======================================
 * Daily cron: scan all workspaces for expiring/expired training certs,
 * publish events, create interventions, notify officers and managers.
 */

import { db } from '../../db';
import {
  trainingModules,
  officerTrainingCertificates,
  trainingInterventions,
  employees,
  workspaces,
  users,
} from '@shared/schema';
import { eq, and, lte, gte, lt, or } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import { storage } from '../../storage';
import { createLogger } from '../../lib/logger';
const log = createLogger('trainingRenewalService');


const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

export interface RenewalScanResult {
  workspacesScanned: number;
  expiredFound: number;
  expiringSoonFound: number;
  notificationsCreated: number;
  interventionsCreated: number;
  errors: number;
}

/**
 * Run renewal scan across all active workspaces.
 * Called daily at 7 AM by autonomousScheduler.
 */
export async function runTrainingRenewalScan(): Promise<RenewalScanResult> {
  const result: RenewalScanResult = {
    workspacesScanned: 0,
    expiredFound: 0,
    expiringSoonFound: 0,
    notificationsCreated: 0,
    interventionsCreated: 0,
    errors: 0,
  };

  const activeWorkspaces = await db
    .select({ id: workspaces.id, name: workspaces.name, ownerId: workspaces.ownerId })
    .from(workspaces)
    .where(and(eq(workspaces.isSuspended, false), eq(workspaces.isFrozen, false)));

  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + THIRTY_DAYS_MS);

  for (const ws of activeWorkspaces) {
    try {
      result.workspacesScanned++;

      // Get required modules
      const requiredModules = await db
        .select({ id: trainingModules.id, title: trainingModules.title })
        .from(trainingModules)
        .where(and(
          or(eq(trainingModules.isPlatformDefault, true), eq(trainingModules.workspaceId, ws.id)),
          eq(trainingModules.isRequired, true),
        ));

      if (requiredModules.length === 0) continue;
      const moduleIds = requiredModules.map(m => m.id);

      // Get active officers
      const activeOfficers = await db
        .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName, userId: employees.userId })
        .from(employees)
        .where(and(eq(employees.workspaceId, ws.id), eq(employees.status, 'active')));

      for (const officer of activeOfficers) {
        try {
          const certs = await db
            .select({ moduleId: officerTrainingCertificates.moduleId, expiresAt: officerTrainingCertificates.expiresAt, certificateNumber: officerTrainingCertificates.certificateNumber })
            .from(officerTrainingCertificates)
            .where(and(
              eq(officerTrainingCertificates.employeeId, officer.id),
              eq(officerTrainingCertificates.workspaceId, ws.id),
              eq(officerTrainingCertificates.isValid, true),
            ));

          const certByModule = new Map(certs.map(c => [c.moduleId, c]));

          for (const mod of requiredModules) {
            const cert = certByModule.get(mod.id);

            if (!cert) continue; // No cert = not started, handled by compliance score

            const expiry = new Date(cert.expiresAt);
            const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / 86400000);

            const officerName = `${officer.firstName} ${officer.lastName}`;

            if (daysLeft < 0) {
              // EXPIRED
              result.expiredFound++;

              // Mark cert invalid
              await db
                .update(officerTrainingCertificates)
                .set({ isValid: false })
                .where(and(
                  eq(officerTrainingCertificates.moduleId, mod.id),
                  eq(officerTrainingCertificates.employeeId, officer.id),
                  eq(officerTrainingCertificates.workspaceId, ws.id),
                ))
                .catch(() => null);

              // Publish expired event
              try {
                platformEventBus.publish({
                  type: 'training_certificate_expired',
                  category: 'workforce',
                  title: `${officerName} training certificate expired`,
                  description: `${mod.title} certificate #${cert.certificateNumber} expired ${Math.abs(daysLeft)} days ago`,
                  workspaceId: ws.id,
                  metadata: {
                    workspaceId: ws.id,
                    employeeId: officer.id,
                    moduleId: mod.id,
                    moduleTitle: mod.title,
                    certNumber: cert.certificateNumber,
                    expiredDaysAgo: Math.abs(daysLeft),
                    officerName,
                  },
                }).catch((err) => log.warn('[trainingRenewalService] Fire-and-forget failed:', err));
              } catch { /* non-fatal */ }

              // Create intervention if not already open
              const existing = await db
                .select({ id: trainingInterventions.id })
                .from(trainingInterventions)
                .where(and(
                  eq(trainingInterventions.employeeId, officer.id),
                  eq(trainingInterventions.workspaceId, ws.id),
                  eq(trainingInterventions.moduleId, mod.id),
                  eq(trainingInterventions.completed, false),
                ))
                .limit(1);

              if (existing.length === 0) {
                // @ts-expect-error — TS migration: fix in refactoring sprint
                await db.insert(trainingInterventions).values({
                  workspaceId: ws.id,
                  employeeId: officer.id,
                  moduleId: mod.id,
                  attemptId: null,
                  consistentlyMissedTopics: ['Certificate Renewal Required'],
                  completed: false,
                }).catch(() => null);
                result.interventionsCreated++;
              }

              // In-app notification for officer
              if (officer.userId) {
                try {
                  await storage.createNotification({
                    workspaceId: ws.id,
                    userId: officer.userId,
                    type: 'compliance_alert',
                    title: `Training Certificate Expired: ${mod.title}`,
                    message: `Your ${mod.title} certification expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''} ago. Retake required immediately.`,
                    actionUrl: '/training-certification',
                    isRead: false,
                    metadata: { source: 'training_renewal_scan', moduleId: mod.id, certNumber: cert.certificateNumber },
                  });
                  result.notificationsCreated++;
                } catch { /* non-fatal */ }
              }

            } else if (daysLeft <= 30) {
              // EXPIRING SOON
              result.expiringSoonFound++;

              platformEventBus.publish({
                type: 'certification_expiring',
                category: 'workforce',
                title: `${officerName} training cert expiring in ${daysLeft} days`,
                description: `${mod.title} expires ${expiry.toLocaleDateString()}`,
                workspaceId: ws.id,
                metadata: {
                  workspaceId: ws.id,
                  employeeId: officer.id,
                  moduleId: mod.id,
                  moduleTitle: mod.title,
                  certNumber: cert.certificateNumber,
                  daysUntilExpiry: daysLeft,
                  officerName,
                },
              }).catch((err) => log.warn('[trainingRenewalService] Fire-and-forget failed:', err));

              // Only notify at 30, 14, 7, 3 day marks to avoid notification fatigue
              const reminderDays = [30, 14, 7, 3];
              if (!reminderDays.includes(daysLeft)) continue;

              if (officer.userId) {
                try {
                  await storage.createNotification({
                    workspaceId: ws.id,
                    userId: officer.userId,
                    type: 'certification_expiring',
                    title: `Training Renewal Reminder: ${mod.title}`,
                    message: `Your ${mod.title} certification expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Schedule your renewal now.`,
                    actionUrl: '/training-certification',
                    isRead: false,
                    metadata: { source: 'training_renewal_scan', moduleId: mod.id, daysLeft },
                  });
                  result.notificationsCreated++;
                } catch { /* non-fatal */ }
              }
            }
          }
        } catch { result.errors++; }
      }
    } catch { result.errors++; }
  }

  return result;
}
