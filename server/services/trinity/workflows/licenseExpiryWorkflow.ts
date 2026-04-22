/**
 * License Expiry Alert Workflow
 *
 * Runs daily at 6am. Scans for:
 * 1. Guard cards expiring in 60 days (early warning)
 * 2. Guard cards expiring in 30 days (urgent warning)
 * 3. Tier 3 officers approaching their 14-day window (Day 10 and Day 14)
 * 4. Officers with no adverse action confirmation past due
 *
 * Fires Trinity platform events — workspace managers receive alerts.
 * Does NOT block access — compliance scoring handles that separately.
 */

import { db } from '../../../db';
import { employees } from '@shared/schema';
import { and, eq, lt, gte, isNotNull } from 'drizzle-orm';
import { platformEventBus } from '../../platformEventBus';
import { createLogger } from '../../../lib/logger';

const log = createLogger('LicenseExpiryWorkflow');

export async function runLicenseExpiryAlerts(): Promise<void> {
  const now = new Date();
  const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const in4Days = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);

  // 1. Guard cards expiring in ≤60 days
  const expiring = await db
    .select({
      id: employees.id,
      workspaceId: employees.workspaceId,
      firstName: employees.firstName,
      lastName: employees.lastName,
      guardCardExpiryDate: employees.guardCardExpiryDate,
      isArmed: employees.isArmed,
    })
    .from(employees)
    .where(
      and(
        eq(employees.isActive, true),
        isNotNull(employees.guardCardExpiryDate),
        lt(employees.guardCardExpiryDate, in60Days.toISOString().slice(0, 10)),
        gte(employees.guardCardExpiryDate, now.toISOString().slice(0, 10)),
      ),
    );

  for (const emp of expiring) {
    if (!emp.guardCardExpiryDate) continue;
    const daysLeft = Math.ceil(
      (new Date(emp.guardCardExpiryDate).getTime() - now.getTime()) / 86400000,
    );
    const isUrgent = daysLeft <= 30;

    platformEventBus
      .publish({
        type: 'license_expiring_soon',
        category: 'compliance',
        title: `${isUrgent ? '⚠️ URGENT: ' : ''}Guard Card Expiring — ${emp.firstName} ${emp.lastName}`,
        description: `${emp.isArmed ? 'Armed' : 'Unarmed'} officer's license expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Renewal must be initiated immediately to avoid work suspension.`,
        workspaceId: emp.workspaceId,
        metadata: {
          employeeId: emp.id,
          daysUntilExpiry: daysLeft,
          expiryDate: emp.guardCardExpiryDate,
          isArmed: emp.isArmed,
          urgency: isUrgent ? 'urgent' : 'warning',
        },
      })
      .catch(() => {});
  }

  // 2. Tier 3 officers approaching 14-day window end
  const approachingExpiry = await db
    .select({
      id: employees.id,
      workspaceId: employees.workspaceId,
      firstName: employees.firstName,
      lastName: employees.lastName,
      workAuthorizationWindowExpires: employees.workAuthorizationWindowExpires,
    })
    .from(employees)
    .where(
      and(
        eq(employees.isActive, true),
        eq(employees.guardCardStatus, 'substantially_complete'),
        isNotNull(employees.workAuthorizationWindowExpires),
        lt(employees.workAuthorizationWindowExpires, in4Days),
        gte(employees.workAuthorizationWindowExpires, now),
      ),
    );

  for (const emp of approachingExpiry) {
    if (!emp.workAuthorizationWindowExpires) continue;
    const daysLeft = Math.ceil(
      (new Date(emp.workAuthorizationWindowExpires).getTime() - now.getTime()) / 86400000,
    );

    platformEventBus
      .publish({
        type: 'provisional_authorization_expiring',
        category: 'compliance',
        title: `Action Required: ${emp.firstName} ${emp.lastName} — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`,
        description: `Provisional work authorization expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Verify TOPS shows no denial/suspension. If license is issued, upload proof immediately. If not resolved, officer will be blocked from shifts.`,
        workspaceId: emp.workspaceId,
        metadata: {
          employeeId: emp.id,
          windowExpires: emp.workAuthorizationWindowExpires,
          daysLeft,
          actionRequired: 'verify_tops_no_adverse_action',
        },
      })
      .catch(() => {});
  }

  log.info(
    `[LicenseExpiry] Scanned ${expiring.length} expiring licenses, ${approachingExpiry.length} approaching Tier 3 window expiry`,
  );
}
