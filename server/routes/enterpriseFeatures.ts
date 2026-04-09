import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';
import { requirePlan } from '../tierGuards';
import { db } from '../db';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import {
  workspaces,
  insertWorkspaceBrandingSchema,
  vehicles,
  insertVehicleSchema,
  vehicleAssignments,
  insertVehicleAssignmentSchema,
  vehicleMaintenance,
  insertVehicleMaintenanceSchema,
  weapons,
  insertWeaponSchema,
  weaponCheckouts,
  insertWeaponCheckoutSchema,
  insertSsoConfigSchema,
  insertAccountManagerSchema,
  backgroundCheckProviders,
  employeeBackgroundChecks,
  insertBgCheckProviderSchema,
  insertBgCheckSchema,
  workspaceApiKeys,
  insertWorkspaceApiKeySchema,
  apiKeyUsageLogs,
  users
} from '@shared/schema';

interface AuthenticatedRequest extends Request {
  user?: any;
  workspaceId?: string;
}

function getWorkspaceId(req: AuthenticatedRequest): string | null {
  return req.workspaceId || req.user?.currentWorkspaceId || null;
}

function requireWorkspace(req: AuthenticatedRequest, res: Response): string | null {
  const wsId = getWorkspaceId(req);
  if (!wsId) {
    res.status(400).json({ message: 'No workspace selected' });
    return null;
  }
  return wsId;
}

export const enterpriseRouter = Router();

// All enterprise feature endpoints require authentication and Enterprise tier
enterpriseRouter.use(requireAuth);
enterpriseRouter.use(requirePlan('enterprise'));

// ============================================================================
// WHITE-LABEL BRANDING
// ============================================================================

enterpriseRouter.get('/branding', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const [ws] = await db.select({ blob: workspaces.brandingBlob }).from(workspaces).where(eq(workspaces.id, wsId)).limit(1);
    const branding = ws?.blob && Object.keys(ws.blob as object).length > 0 ? { ...ws.blob as object, workspaceId: wsId } : null;
    res.json(branding);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch branding' });
  }
});

enterpriseRouter.post('/branding', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const { primaryColor, secondaryColor, accentColor, logoUrl, faviconUrl, companyName, tagline, fontFamily, customCss } = req.body;
    const [ws] = await db.select({ blob: workspaces.brandingBlob }).from(workspaces).where(eq(workspaces.id, wsId)).limit(1);
    const current = ((ws?.blob || {}) as Record<string, any>);
    const updated = { ...current, workspaceId: wsId, updatedAt: new Date().toISOString() };
    if (primaryColor !== undefined) (updated as any).primaryColor = primaryColor;
    if (secondaryColor !== undefined) (updated as any).secondaryColor = secondaryColor;
    if (accentColor !== undefined) (updated as any).accentColor = accentColor;
    if (logoUrl !== undefined) (updated as any).logoUrl = logoUrl;
    if (faviconUrl !== undefined) (updated as any).faviconUrl = faviconUrl;
    if (companyName !== undefined) (updated as any).companyName = companyName;
    if (tagline !== undefined) (updated as any).tagline = tagline;
    if (fontFamily !== undefined) (updated as any).fontFamily = fontFamily;
    if (customCss !== undefined) (updated as any).customCss = customCss;
    await db.update(workspaces).set({ brandingBlob: updated }).where(eq(workspaces.id, wsId));
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Failed to save branding' });
  }
});

// ============================================================================
// FLEET / VEHICLE MANAGEMENT
// ============================================================================

enterpriseRouter.get('/vehicles', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const result = await db.select().from(vehicles).where(eq(vehicles.workspaceId, wsId)).orderBy(desc(vehicles.updatedAt));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch vehicles' });
  }
});

enterpriseRouter.post('/vehicles', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const { make, model, year, vin, licensePlate, color, status, currentMileage, assignedEmployeeId, insuranceExpiry, registrationExpiry, lastMaintenanceAt, nextMaintenanceDue, fuelType, notes } = req.body;
    const safeValues: Record<string, any> = { workspaceId: wsId };
    if (make !== undefined) safeValues.make = make;
    if (model !== undefined) safeValues.model = model;
    if (year !== undefined) safeValues.year = year;
    if (vin !== undefined) safeValues.vin = vin;
    if (licensePlate !== undefined) safeValues.licensePlate = licensePlate;
    if (color !== undefined) safeValues.color = color;
    if (status !== undefined) safeValues.status = status;
    if (currentMileage !== undefined) safeValues.currentMileage = currentMileage;
    if (assignedEmployeeId !== undefined) safeValues.assignedEmployeeId = assignedEmployeeId;
    if (insuranceExpiry !== undefined) safeValues.insuranceExpiry = insuranceExpiry;
    if (registrationExpiry !== undefined) safeValues.registrationExpiry = registrationExpiry;
    if (lastMaintenanceAt !== undefined) safeValues.lastMaintenanceAt = lastMaintenanceAt;
    if (nextMaintenanceDue !== undefined) safeValues.nextMaintenanceDue = nextMaintenanceDue;
    if (fuelType !== undefined) safeValues.fuelType = fuelType;
    if (notes !== undefined) safeValues.notes = notes;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const [created] = await db.insert(vehicles).values(safeValues).returning();
    res.json(created);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create vehicle' });
  }
});

enterpriseRouter.patch('/vehicles/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const { make, model, year, licensePlate, vin, color, status, mileage, lastMaintenanceDate, insuranceExpiry, notes } = req.body;
    const safeUpdates: Record<string, any> = { updatedAt: new Date() };
    if (make !== undefined) safeUpdates.make = make;
    if (model !== undefined) safeUpdates.model = model;
    if (year !== undefined) safeUpdates.year = year;
    if (licensePlate !== undefined) safeUpdates.licensePlate = licensePlate;
    if (vin !== undefined) safeUpdates.vin = vin;
    if (color !== undefined) safeUpdates.color = color;
    if (status !== undefined) safeUpdates.status = status;
    if (mileage !== undefined) safeUpdates.mileage = mileage;
    if (lastMaintenanceDate !== undefined) safeUpdates.lastMaintenanceDate = lastMaintenanceDate;
    if (insuranceExpiry !== undefined) safeUpdates.insuranceExpiry = insuranceExpiry;
    if (notes !== undefined) safeUpdates.notes = notes;
    const [updated] = await db.update(vehicles)
      .set(safeUpdates)
      .where(and(eq(vehicles.id, req.params.id), eq(vehicles.workspaceId, wsId)))
      .returning();
    if (!updated) return res.status(404).json({ message: 'Vehicle not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update vehicle' });
  }
});

enterpriseRouter.delete('/vehicles/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    await db.delete(vehicles).where(and(eq(vehicles.id, req.params.id), eq(vehicles.workspaceId, wsId)));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete vehicle' });
  }
});

enterpriseRouter.get('/vehicles/:id/assignments', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const logs = await db.select().from(vehicleAssignments)
      .where(and(eq(vehicleAssignments.vehicleId, req.params.id), eq(vehicleAssignments.workspaceId, wsId)))
      .orderBy(desc(vehicleAssignments.checkoutDate));
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch vehicle assignments' });
  }
});

enterpriseRouter.post('/vehicles/:id/assignments', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const { id: _id, workspaceId: _ws, vehicleId: _vid, ...bodyData } = req.body;
    const [log] = await db.insert(vehicleAssignments).values({
      ...bodyData, vehicleId: req.params.id, workspaceId: wsId,
    }).returning();
    res.json(log);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create vehicle assignment' });
  }
});

enterpriseRouter.get('/vehicles/:id/maintenance', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const records = await db.select().from(vehicleMaintenance)
      .where(and(eq(vehicleMaintenance.vehicleId, req.params.id), eq(vehicleMaintenance.workspaceId, wsId)))
      .orderBy(desc(vehicleMaintenance.createdAt));
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch maintenance records' });
  }
});

enterpriseRouter.post('/vehicles/:id/maintenance', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const { id: _id2, workspaceId: _ws2, vehicleId: _vid2, ...bodyData2 } = req.body;
    const [record] = await db.insert(vehicleMaintenance).values({
      ...bodyData2, vehicleId: req.params.id, workspaceId: wsId,
    }).returning();
    res.json(record);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create maintenance record' });
  }
});

// ============================================================================
// ARMORY / WEAPON MANAGEMENT
// ============================================================================

enterpriseRouter.get('/weapons', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const result = await db.select().from(weapons).where(eq(weapons.workspaceId, wsId)).orderBy(desc(weapons.createdAt));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch weapons' });
  }
});

enterpriseRouter.post('/weapons', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const { serialNumber, weaponType, make, model, caliber, status, assignedEmployeeId, purchaseDate, lastInspectionAt, nextInspectionDue, certificateExpiry, condition, notes } = req.body;
    const safeValues: Record<string, any> = { workspaceId: wsId };
    if (serialNumber !== undefined) safeValues.serialNumber = serialNumber;
    if (weaponType !== undefined) safeValues.weaponType = weaponType;
    if (make !== undefined) safeValues.make = make;
    if (model !== undefined) safeValues.model = model;
    if (caliber !== undefined) safeValues.caliber = caliber;
    if (status !== undefined) safeValues.status = status;
    if (assignedEmployeeId !== undefined) safeValues.assignedEmployeeId = assignedEmployeeId;
    if (purchaseDate !== undefined) safeValues.purchaseDate = purchaseDate;
    if (lastInspectionAt !== undefined) safeValues.lastInspectionAt = lastInspectionAt;
    if (nextInspectionDue !== undefined) safeValues.nextInspectionDue = nextInspectionDue;
    if (certificateExpiry !== undefined) safeValues.certificateExpiry = certificateExpiry;
    if (condition !== undefined) safeValues.condition = condition;
    if (notes !== undefined) safeValues.notes = notes;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const [created] = await db.insert(weapons).values(safeValues).returning();
    res.json(created);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create weapon' });
  }
});

enterpriseRouter.patch('/weapons/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const { type, serialNumber, make, model, caliber, status, assignedEmployeeId, lastInspectionDate, notes } = req.body;
    const safeWeaponUpdates: Record<string, any> = { updatedAt: new Date() };
    if (type !== undefined) safeWeaponUpdates.type = type;
    if (serialNumber !== undefined) safeWeaponUpdates.serialNumber = serialNumber;
    if (make !== undefined) safeWeaponUpdates.make = make;
    if (model !== undefined) safeWeaponUpdates.model = model;
    if (caliber !== undefined) safeWeaponUpdates.caliber = caliber;
    if (status !== undefined) safeWeaponUpdates.status = status;
    if (assignedEmployeeId !== undefined) safeWeaponUpdates.assignedEmployeeId = assignedEmployeeId;
    if (lastInspectionDate !== undefined) safeWeaponUpdates.lastInspectionDate = lastInspectionDate;
    if (notes !== undefined) safeWeaponUpdates.notes = notes;
    const [updated] = await db.update(weapons)
      .set(safeWeaponUpdates)
      .where(and(eq(weapons.id, req.params.id), eq(weapons.workspaceId, wsId)))
      .returning();
    if (!updated) return res.status(404).json({ message: 'Weapon not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update weapon' });
  }
});

enterpriseRouter.delete('/weapons/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    await db.delete(weapons).where(and(eq(weapons.id, req.params.id), eq(weapons.workspaceId, wsId)));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete weapon' });
  }
});

enterpriseRouter.get('/weapons/checkouts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const result = await db.select().from(weaponCheckouts)
      .where(eq(weaponCheckouts.workspaceId, wsId))
      .orderBy(desc(weaponCheckouts.checkedOutAt));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch checkouts' });
  }
});

enterpriseRouter.post('/weapons/:id/checkout', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const { id: _idWc, workspaceId: _wsWc, weaponId: _wid, ...bodyWc } = req.body;
    const checkout = await db.transaction(async (tx) => {
      const [newCheckout] = await tx.insert(weaponCheckouts).values({
        ...bodyWc, weaponId: req.params.id, workspaceId: wsId,
      }).returning();
      await tx.update(weapons).set({ status: 'checked_out', assignedEmployeeId: req.body.employeeId, updatedAt: new Date() })
        .where(and(eq(weapons.id, req.params.id), eq(weapons.workspaceId, wsId)));
      return newCheckout;
    });
    res.json(checkout);
  } catch (err) {
    res.status(500).json({ message: 'Failed to checkout weapon' });
  }
});

enterpriseRouter.post('/weapons/:id/checkin', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const activeCheckout = await db.select().from(weaponCheckouts)
      .where(and(
        eq(weaponCheckouts.weaponId, req.params.id),
        eq(weaponCheckouts.workspaceId, wsId),
        isNull(weaponCheckouts.checkedInAt),
      ));
    await db.transaction(async (tx) => {
      if (activeCheckout.length > 0) {
        await tx.update(weaponCheckouts).set({
          checkedInAt: new Date(),
          checkinSignature: req.body.checkinSignature,
          conditionAtCheckin: req.body.conditionAtCheckin,
        }).where(eq(weaponCheckouts.id, activeCheckout[0].id));
      }
      await tx.update(weapons).set({ status: 'available', assignedEmployeeId: null, updatedAt: new Date() })
        .where(and(eq(weapons.id, req.params.id), eq(weapons.workspaceId, wsId)));
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to checkin weapon' });
  }
});

// ============================================================================
// SSO CONFIGURATION
// ============================================================================

enterpriseRouter.get('/sso', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const [ws] = await db.select({ blob: workspaces.ssoConfigBlob }).from(workspaces).where(eq(workspaces.id, wsId)).limit(1);
    const config = ws?.blob && Object.keys(ws.blob as object).length > 0 ? { ...ws.blob as object, workspaceId: wsId } : null;
    res.json(config);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch SSO config' });
  }
});

enterpriseRouter.post('/sso', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const [ws] = await db.select({ blob: workspaces.ssoConfigBlob }).from(workspaces).where(eq(workspaces.id, wsId)).limit(1);
    const current = ((ws?.blob || {}) as Record<string, any>);
    const updated = { ...current, ...req.body, workspaceId: wsId, updatedAt: new Date().toISOString() };
    await db.update(workspaces).set({ ssoConfigBlob: updated }).where(eq(workspaces.id, wsId));
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Failed to save SSO config' });
  }
});

// ============================================================================
// DEDICATED ACCOUNT MANAGER
// ============================================================================

enterpriseRouter.get('/account-manager', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    // Account managers stored as JSONB array in workspaces.featureStatesBlob.accountManagers
    const [ws] = await db.select({ blob: workspaces.featureStatesBlob }).from(workspaces).where(eq(workspaces.id, wsId)).limit(1);
    const featureStates = ((ws?.blob || {}) as Record<string, any>);
    const managers = (featureStates.accountManagers || []) as any[];
    // Enrich with user data if managerUserId present
    const enriched = await Promise.all(managers.filter(m => m.status === 'active').map(async (m: any) => {
      if (m.managerUserId) {
        const [u] = await db.select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
          .from(users).where(eq(users.id, m.managerUserId)).limit(1);
        return { ...m, managerFirstName: u?.firstName, managerLastName: u?.lastName, managerEmail: u?.email };
      }
      return m;
    }));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch account managers' });
  }
});

enterpriseRouter.post('/account-manager', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const [ws] = await db.select({ blob: workspaces.featureStatesBlob }).from(workspaces).where(eq(workspaces.id, wsId)).limit(1);
    const featureStates = ((ws?.blob || {}) as Record<string, any>);
    const managers = (featureStates.accountManagers || []) as any[];
    const newManager = {
      id: `am-${randomUUID()}`,
      workspaceId: wsId,
      assignedBy: req.user?.id,
      assignedAt: new Date().toISOString(),
      status: 'active',
      ...req.body,
    };
    featureStates.accountManagers = [...managers, newManager];
    await db.update(workspaces).set({ featureStatesBlob: featureStates }).where(eq(workspaces.id, wsId));
    res.json(newManager);
  } catch (err) {
    res.status(500).json({ message: 'Failed to assign account manager' });
  }
});

// ============================================================================
// BACKGROUND CHECKS
// ============================================================================

enterpriseRouter.get('/background-checks/providers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const providers = await db.select().from(backgroundCheckProviders).where(eq(backgroundCheckProviders.workspaceId, wsId));
    res.json(providers);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch providers' });
  }
});

enterpriseRouter.post('/background-checks/providers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const { providerName, apiEndpoint, isActive } = req.body;
    const safeValues: Record<string, any> = { workspaceId: wsId };
    if (providerName !== undefined) safeValues.providerName = providerName;
    if (apiEndpoint !== undefined) safeValues.apiEndpoint = apiEndpoint;
    if (isActive !== undefined) safeValues.isActive = isActive;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const [created] = await db.insert(backgroundCheckProviders).values(safeValues).returning();
    res.json(created);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create provider' });
  }
});

enterpriseRouter.get('/background-checks', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const checks = await db.select().from(employeeBackgroundChecks)
      .where(eq(employeeBackgroundChecks.workspaceId, wsId))
      .orderBy(desc(employeeBackgroundChecks.requestedAt));
    res.json(checks);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch background checks' });
  }
});

enterpriseRouter.post('/background-checks', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const [check] = await db.insert(employeeBackgroundChecks).values({
      ...req.body, workspaceId: wsId, requestedBy: req.user?.id,
    }).returning();
    res.json(check);
  } catch (err) {
    res.status(500).json({ message: 'Failed to request background check' });
  }
});

enterpriseRouter.patch('/background-checks/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const { status: checkStatus, result, notes: checkNotes, completedAt, provider, reportUrl } = req.body;
    const safeBgUpdates: Record<string, any> = {};
    if (checkStatus !== undefined) safeBgUpdates.status = checkStatus;
    if (result !== undefined) safeBgUpdates.result = result;
    if (checkNotes !== undefined) safeBgUpdates.notes = checkNotes;
    if (completedAt !== undefined) safeBgUpdates.completedAt = completedAt;
    if (provider !== undefined) safeBgUpdates.provider = provider;
    if (reportUrl !== undefined) safeBgUpdates.reportUrl = reportUrl;
    const [updated] = await db.update(employeeBackgroundChecks)
      .set(safeBgUpdates)
      .where(and(eq(employeeBackgroundChecks.id, req.params.id), eq(employeeBackgroundChecks.workspaceId, wsId)))
      .returning();
    if (!updated) return res.status(404).json({ message: 'Check not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update background check' });
  }
});

// ============================================================================
// PUBLIC API KEY MANAGEMENT
// ============================================================================

enterpriseRouter.get('/api-keys', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const keys = await db.select({
      id: workspaceApiKeys.id,
      name: workspaceApiKeys.name,
      keyPrefix: workspaceApiKeys.keyPrefix,
      permissions: workspaceApiKeys.permissions,
      rateLimit: workspaceApiKeys.rateLimit,
      rateLimitWindow: workspaceApiKeys.rateLimitWindow,
      totalRequests: workspaceApiKeys.totalRequests,
      lastUsedAt: workspaceApiKeys.lastUsedAt,
      expiresAt: workspaceApiKeys.expiresAt,
      isActive: workspaceApiKeys.isActive,
      createdAt: workspaceApiKeys.createdAt,
    }).from(workspaceApiKeys)
      .where(eq(workspaceApiKeys.workspaceId, wsId))
      .orderBy(desc(workspaceApiKeys.createdAt));
    res.json(keys);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch API keys' });
  }
});

enterpriseRouter.post('/api-keys', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const rawKey = `coa_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 8);
    const [created] = await db.insert(workspaceApiKeys).values({
      workspaceId: wsId,
      name: req.body.name || 'API Key',
      keyHash,
      keyPrefix,
      permissions: req.body.permissions || ['read'],
      rateLimit: req.body.rateLimit || 1000,
      rateLimitWindow: req.body.rateLimitWindow || 'hour',
      expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
      createdBy: req.user?.id,
    }).returning();
    res.json({ ...created, rawKey });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create API key' });
  }
});

enterpriseRouter.patch('/api-keys/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const { name: keyName, isActive, permissions, rateLimit, expiresAt: keyExpiry } = req.body;
    const safeKeyUpdates: Record<string, any> = { updatedAt: new Date() };
    if (keyName !== undefined) safeKeyUpdates.name = keyName;
    if (isActive !== undefined) safeKeyUpdates.isActive = isActive;
    if (permissions !== undefined) safeKeyUpdates.permissions = permissions;
    if (rateLimit !== undefined) safeKeyUpdates.rateLimit = rateLimit;
    if (keyExpiry !== undefined) safeKeyUpdates.expiresAt = keyExpiry;
    const [updated] = await db.update(workspaceApiKeys)
      .set(safeKeyUpdates)
      .where(and(eq(workspaceApiKeys.id, req.params.id), eq(workspaceApiKeys.workspaceId, wsId)))
      .returning();
    if (!updated) return res.status(404).json({ message: 'API key not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update API key' });
  }
});

enterpriseRouter.delete('/api-keys/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    await db.update(workspaceApiKeys)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(workspaceApiKeys.id, req.params.id), eq(workspaceApiKeys.workspaceId, wsId)));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to revoke API key' });
  }
});

enterpriseRouter.get('/api-keys/:id/usage', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsId = requireWorkspace(req, res);
    if (!wsId) return;
    const logs = await db.select().from(apiKeyUsageLogs)
      .where(and(eq(apiKeyUsageLogs.apiKeyId, req.params.id), eq(apiKeyUsageLogs.workspaceId, wsId)))
      .orderBy(desc(apiKeyUsageLogs.createdAt))
      .limit(100);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch usage logs' });
  }
});
