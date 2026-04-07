/**
 * Weapon Check Service
 * =====================
 * Track armed officer weapon assignments per shift.
 * Trinity blocks weapon assignment if armed endorsement is expired or missing.
 * All weapon records are permanent — never deleted.
 * Any discrepancy at shift end creates immediate alert to owner.
 *
 * Domain: ops
 * Tables: weapons, weapon_checkouts
 */

import { pool, db } from '../../db';
import { randomUUID } from 'crypto';
import { platformEventBus } from '../platformEventBus';
import { broadcastToWorkspace } from '../../websocket';
import { createLogger } from '../../lib/logger';
import { platformActionHub } from '../helpai/platformActionHub';
import { typedPool, typedPoolExec } from '../../lib/typedSql';
import { weaponCheckouts, weapons, employees } from '@shared/schema';
import { eq, sql, and, desc } from 'drizzle-orm';

const log = createLogger('WeaponCheckService');

export interface WeaponIssuance {
  workspaceId: string;
  weaponId: string;
  employeeId: string;
  shiftId?: string | null;
  issuedBy: string;
  conditionAtCheckout?: string;
  notes?: string | null;
}

export interface WeaponReturn {
  checkoutId: string;
  workspaceId: string;
  returnedBy: string;
  conditionAtCheckin: 'excellent' | 'good' | 'fair' | 'damaged';
  roundsExpended?: number;
  notes?: string | null;
}

class WeaponCheckService {
  private static instance: WeaponCheckService;

  static getInstance(): WeaponCheckService {
    if (!WeaponCheckService.instance) WeaponCheckService.instance = new WeaponCheckService();
    return WeaponCheckService.instance;
  }

  initialize() {
    this.registerTrinityActions();
    log.info('Weapon Check Service initialized — armed endorsement enforcement active');
  }

  async verifyArmedEndorsement(employeeId: string, workspaceId: string): Promise<{ valid: boolean; reason?: string }> {
    const rows = await typedPool(
      `SELECT is_armed, armed_license_verified, guard_card_expiry_date FROM employees WHERE id=$1 AND workspace_id=$2`,
      [employeeId, workspaceId]
    );
    if (!rows.length) return { valid: false, reason: 'Employee not found' };

    const emp = rows[0];
    if (!emp.is_armed) return { valid: false, reason: 'Employee does not have armed officer designation' };
    if (!emp.armed_license_verified) return { valid: false, reason: 'Armed license has not been verified' };

    if (emp.guard_card_expiry_date) {
      const expiry = new Date(emp.guard_card_expiry_date);
      if (expiry < new Date()) return { valid: false, reason: `Guard card expired on ${expiry.toLocaleDateString()}` };
    }

    return { valid: true };
  }

  async issueWeapon(data: WeaponIssuance): Promise<any> {
    // Block if armed endorsement is missing or expired
    const endorsement = await this.verifyArmedEndorsement(data.employeeId, data.workspaceId);
    if (!endorsement.valid) {
      await platformEventBus.publish({
        type: 'weapon_issuance_blocked',
        category: 'automation',
        title: 'Weapon Issuance Blocked',
        description: `Weapon issuance blocked for employee ${data.employeeId}: ${endorsement.reason}`,
        workspaceId: data.workspaceId,
        metadata: { weaponId: data.weaponId, employeeId: data.employeeId, reason: endorsement.reason },
      });
      throw new Error(`Weapon issuance blocked: ${endorsement.reason}`);
    }

    // Check weapon exists and is available
    const weaponRows = await typedPool(
      `SELECT * FROM weapons WHERE id=$1 AND workspace_id=$2`,
      [data.weaponId, data.workspaceId]
    );
    if (!weaponRows.length) throw new Error('Weapon not found');
    const weapon = weaponRows[0];

    // Check no active checkout for this weapon
    // Converted to Drizzle ORM: IS NULL
    const activeCheckoutRows = await db.select({ id: weaponCheckouts.id })
      .from(weaponCheckouts)
      .where(and(
        eq(weaponCheckouts.weaponId, data.weaponId),
        eq(weaponCheckouts.workspaceId, data.workspaceId),
        sql`${weaponCheckouts.checkedInAt} IS NULL`
      ))
      .limit(1);
    if (activeCheckoutRows.length) throw new Error('Weapon already checked out');

    const id = randomUUID();
    // Converted to Drizzle ORM
    await db.insert(weaponCheckouts).values({
      id,
      workspaceId: data.workspaceId,
      weaponId: data.weaponId,
      employeeId: data.employeeId,
      shiftId: data.shiftId || null,
      checkedOutAt: sql`now()`,
      conditionAtCheckout: data.conditionAtCheckout || 'good',
      notes: data.notes || null,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    });

    const rows = await typedPool(
      `SELECT wc.*, w.serial_number, w.make, w.model FROM weapon_checkouts wc JOIN weapons w ON w.id=wc.weapon_id WHERE wc.id=$1`,
      [id]
    );

    await platformEventBus.publish({
      type: 'weapon_issued',
      category: 'automation',
      title: `Weapon Issued — ${weapon.make} ${weapon.model}`,
      description: `Weapon ${weapon.serial_number} issued to officer for shift`,
      workspaceId: data.workspaceId,
      metadata: { checkoutId: id, weaponId: data.weaponId, employeeId: data.employeeId, serialNumber: weapon.serial_number },
    });

    log.info(`Weapon issued: ${weapon.serial_number} to employee ${data.employeeId}`);
    return rows[0];
  }

  async returnWeapon(data: WeaponReturn): Promise<any> {
    // Converted to Drizzle ORM
    await db.update(weaponCheckouts).set({
      checkedInAt: sql`now()`,
      conditionAtCheckin: data.conditionAtCheckin,
      notes: data.notes || null,
      updatedAt: sql`now()`,
    }).where(and(eq(weaponCheckouts.id, data.checkoutId), eq(weaponCheckouts.workspaceId, data.workspaceId)));

    const rows = await typedPool(
      `SELECT wc.*, w.serial_number, w.make, w.model FROM weapon_checkouts wc JOIN weapons w ON w.id=wc.weapon_id WHERE wc.id=$1`,
      [data.checkoutId]
    );
    if (!rows.length) throw new Error('Checkout record not found');
    const checkout = rows[0];

    if (data.conditionAtCheckin === 'damaged') {
      log.warn(`Weapon damage reported: ${checkout.serial_number} — owner notification via WebSocket broadcast`);
      await platformEventBus.publish({
        type: 'weapon_damage_reported',
        category: 'automation',
        title: `Weapon Damage — ${checkout.serial_number}`,
        description: `Weapon returned with damage: ${data.notes || 'No description'}`,
        workspaceId: data.workspaceId,
        metadata: { checkoutId: data.checkoutId, serialNumber: checkout.serial_number, notes: data.notes },
      });
    }

    await platformEventBus.publish({
      type: 'weapon_returned',
      category: 'automation',
      title: `Weapon Returned — ${checkout.serial_number}`,
      description: `Weapon ${checkout.serial_number} returned in ${data.conditionAtCheckin} condition`,
      workspaceId: data.workspaceId,
      metadata: { checkoutId: data.checkoutId, condition: data.conditionAtCheckin, serialNumber: checkout.serial_number },
    });

    return checkout;
  }

  async getActiveCheckouts(workspaceId: string): Promise<any[]> {
    // Converted to Drizzle ORM: LEFT JOIN → db.leftJoin()
    const result = await db
      .select({
        id: weaponCheckouts.id,
        workspaceId: weaponCheckouts.workspaceId,
        weaponId: weaponCheckouts.weaponId,
        employeeId: weaponCheckouts.employeeId,
        shiftId: weaponCheckouts.shiftId,
        checkedOutAt: weaponCheckouts.checkedOutAt,
        checkedInAt: weaponCheckouts.checkedInAt,
        conditionAtCheckout: weaponCheckouts.conditionAtCheckout,
        conditionAtCheckin: weaponCheckouts.conditionAtCheckin,
        notes: weaponCheckouts.notes,
        createdAt: weaponCheckouts.createdAt,
        updatedAt: weaponCheckouts.updatedAt,
        serialNumber: weapons.serialNumber,
        make: weapons.make,
        model: weapons.model,
        officerName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`
      })
      .from(weaponCheckouts)
      .innerJoin(weapons, eq(weapons.id, weaponCheckouts.weaponId))
      .leftJoin(employees, eq(employees.id, weaponCheckouts.employeeId))
      .where(and(
        eq(weaponCheckouts.workspaceId, workspaceId),
        sql`${weaponCheckouts.checkedInAt} IS NULL`
      ))
      .orderBy(desc(weaponCheckouts.checkedOutAt));

    return result;
  }

  async listWeapons(workspaceId: string): Promise<any[]> {
    // Converted to Drizzle ORM: ORDER BY
    return await db.select().from(weapons).where(eq(weapons.workspaceId, workspaceId)).orderBy(weapons.make, weapons.model);
  }

  private registerTrinityActions() {
    platformActionHub.registerAction({
      actionId: 'safety.weapon_checkout.active',
      name: 'List Active Weapon Checkouts',
      category: 'safety',
      description: 'List all weapons currently checked out to officers.',
      requiredRoles: ['manager', 'supervisor', 'owner'],
      handler: async (request) => {
        const checkouts = await this.getActiveCheckouts(request.workspaceId!);
        return { success: true, actionId: request.actionId, message: `${checkouts.length} weapon(s) currently issued`, data: { checkouts } };
      },
    });

    platformActionHub.registerAction({
      actionId: 'safety.weapon_checkout.verify_endorsement',
      name: 'Verify Officer Armed Endorsement',
      category: 'safety',
      description: 'Verify that an officer has a valid armed endorsement before issuing a weapon.',
      requiredRoles: ['manager', 'supervisor', 'owner'],
      handler: async (request) => {
        const { employeeId } = request.payload || {};
        if (!employeeId) return { success: false, actionId: request.actionId, message: 'employeeId required', data: null };
        const result = await this.verifyArmedEndorsement(employeeId, request.workspaceId!);
        return { success: true, actionId: request.actionId, message: result.valid ? 'Armed endorsement valid' : `Blocked: ${result.reason}`, data: result };
      },
    });

    platformActionHub.registerAction({
      actionId: 'external.weapon_checkout.audit',
      name: 'Weapon Audit Report',
      category: 'external',
      description: 'Generate a weapon accountability audit for all weapons in the workspace.',
      requiredRoles: ['owner', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        const [weapons, checkouts] = await Promise.all([
          this.listWeapons(request.workspaceId!),
          this.getActiveCheckouts(request.workspaceId!),
        ]);
        return { success: true, actionId: request.actionId, message: `Weapon audit: ${weapons.length} total, ${checkouts.length} currently issued`, data: { weapons, activeCheckouts: checkouts } };
      },
    });
  }
}

export const weaponCheckService = WeaponCheckService.getInstance();
