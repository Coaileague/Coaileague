/**
 * QuickBooks Phase 3: Intelligence & Compliance Service
 * ======================================================
 * Implements advanced automation features for all service industries:
 * 
 * 1. 1099/W-2 Prep - Auto-flag contractors vs employees for tax time
 * 2. Industry Templates - Pre-built service catalogs per industry
 * 3. Multi-Location Rollups - Franchise/branch P&L reporting
 * 4. Home Health EVV - Electronic Visit Verification billing codes
 * 5. Financial Watchdog - AI reconciliation with discrepancy alerts
 */

import { db } from '../../db';
import {
  employees,
  clients,
  invoices,
  timeEntries,
  workspaces,
  partnerConnections,
  industryServiceTemplates,
  workspaceServiceCatalog,
  evvBillingCodes,
  evvVisitRecords,
  businessLocations,
  locationPnlSnapshots,
  reconciliationFindings,
  reconciliationRuns,
  workerTaxClassificationHistory,
  InsertIndustryServiceTemplate,
  InsertReconciliationFinding,
  InsertReconciliationRun,
  InsertWorkerTaxClassificationHistory,
} from '@shared/schema';
import { eq, and, gte, lte, desc, sql, isNull, ne } from 'drizzle-orm';
import { quickbooksOAuthService } from '../oauth/quickbooks';
import { platformEventBus } from '../platformEventBus';
import { auditLogger } from '../audit-logger';
import { INTEGRATIONS } from '@shared/platformConfig';
import { createLogger } from '../../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../billing/billingConstants';
const log = createLogger('quickbooksPhase3Service');


const QBO_API_BASE = INTEGRATIONS.quickbooks.getCompanyApiBase();

// Industry template definitions
const INDUSTRY_TEMPLATES: Omit<InsertIndustryServiceTemplate, 'id' | 'createdAt'>[] = [
  // Security Guard Services
  { industryKey: 'security', serviceName: 'Armed Security Guard', serviceCode: 'SEC-ARM', description: 'Licensed armed security officer', defaultRate: '35.00', rateType: 'hourly', unitLabel: 'hour', taxable: false },
  { industryKey: 'security', serviceName: 'Unarmed Security Guard', serviceCode: 'SEC-UNA', description: 'Unarmed security patrol officer', defaultRate: '22.00', rateType: 'hourly', unitLabel: 'hour', taxable: false },
  { industryKey: 'security', serviceName: 'Event Security', serviceCode: 'SEC-EVT', description: 'Special event security coverage', defaultRate: '28.00', rateType: 'hourly', unitLabel: 'hour', taxable: false },
  { industryKey: 'security', serviceName: 'Mobile Patrol', serviceCode: 'SEC-MOB', description: 'Vehicle patrol service', defaultRate: '45.00', rateType: 'hourly', unitLabel: 'hour', taxable: false },
  { industryKey: 'security', serviceName: 'Executive Protection', serviceCode: 'SEC-EXE', description: 'VIP/Executive protection detail', defaultRate: '75.00', rateType: 'hourly', unitLabel: 'hour', taxable: false },

  // Cleaning Services
  { industryKey: 'cleaning', serviceName: 'Standard Office Cleaning', serviceCode: 'CLN-OFF', description: 'Regular office cleaning service', defaultRate: '35.00', rateType: 'hourly', unitLabel: 'hour', taxable: true },
  { industryKey: 'cleaning', serviceName: 'Deep Cleaning', serviceCode: 'CLN-DEP', description: 'Thorough deep cleaning service', defaultRate: '50.00', rateType: 'hourly', unitLabel: 'hour', taxable: true },
  { industryKey: 'cleaning', serviceName: 'Floor Care/Stripping', serviceCode: 'CLN-FLR', description: 'Floor stripping and waxing', defaultRate: '0.35', rateType: 'per_unit', unitLabel: 'sqft', taxable: true },
  { industryKey: 'cleaning', serviceName: 'Window Cleaning', serviceCode: 'CLN-WIN', description: 'Interior/exterior window cleaning', defaultRate: '5.00', rateType: 'per_unit', unitLabel: 'window', taxable: true },
  { industryKey: 'cleaning', serviceName: 'Post-Construction Cleanup', serviceCode: 'CLN-CON', description: 'Construction site cleanup', defaultRate: '65.00', rateType: 'hourly', unitLabel: 'hour', taxable: true },

  // Home Health Care
  { industryKey: 'home_health', serviceName: 'Personal Care Aide', serviceCode: 'HH-PCA', description: 'Personal care assistance', defaultRate: '25.00', rateType: 'hourly', unitLabel: 'hour', evvRequired: true, evvBillingCode: 'T1019', taxable: false },
  { industryKey: 'home_health', serviceName: 'Home Health Aide', serviceCode: 'HH-HHA', description: 'Certified home health aide', defaultRate: '28.00', rateType: 'hourly', unitLabel: 'hour', evvRequired: true, evvBillingCode: 'G0156', taxable: false },
  { industryKey: 'home_health', serviceName: 'Skilled Nursing Visit', serviceCode: 'HH-SNV', description: 'RN/LPN skilled nursing visit', defaultRate: '85.00', rateType: 'flat', unitLabel: 'visit', evvRequired: true, evvBillingCode: 'G0299', taxable: false },
  { industryKey: 'home_health', serviceName: 'Respite Care', serviceCode: 'HH-RSP', description: 'Caregiver relief respite', defaultRate: '22.00', rateType: 'hourly', unitLabel: 'hour', evvRequired: true, evvBillingCode: 'T1005', taxable: false },
  { industryKey: 'home_health', serviceName: 'Companion Care', serviceCode: 'HH-CMP', description: 'Non-medical companionship', defaultRate: '20.00', rateType: 'hourly', unitLabel: 'hour', evvRequired: false, taxable: false },

  // HVAC Services
  { industryKey: 'hvac', serviceName: 'HVAC Service Call', serviceCode: 'HVAC-SVC', description: 'Diagnostic service call', defaultRate: '95.00', rateType: 'flat', unitLabel: 'call', taxable: true },
  { industryKey: 'hvac', serviceName: 'AC Repair', serviceCode: 'HVAC-ACR', description: 'Air conditioning repair', defaultRate: '125.00', rateType: 'hourly', unitLabel: 'hour', taxable: true },
  { industryKey: 'hvac', serviceName: 'Heating Repair', serviceCode: 'HVAC-HTR', description: 'Furnace/heating repair', defaultRate: '125.00', rateType: 'hourly', unitLabel: 'hour', taxable: true },
  { industryKey: 'hvac', serviceName: 'System Installation', serviceCode: 'HVAC-INS', description: 'New HVAC system install', defaultRate: '150.00', rateType: 'hourly', unitLabel: 'hour', taxable: true },
  { industryKey: 'hvac', serviceName: 'Preventive Maintenance', serviceCode: 'HVAC-PM', description: 'Seasonal maintenance tune-up', defaultRate: '149.00', rateType: 'flat', unitLabel: 'visit', taxable: true },

  // Plumbing Services
  { industryKey: 'plumbing', serviceName: 'Plumbing Service Call', serviceCode: 'PLM-SVC', description: 'Diagnostic service call', defaultRate: '85.00', rateType: 'flat', unitLabel: 'call', taxable: true },
  { industryKey: 'plumbing', serviceName: 'Drain Cleaning', serviceCode: 'PLM-DRN', description: 'Drain clearing/cleaning', defaultRate: '175.00', rateType: 'flat', unitLabel: 'drain', taxable: true },
  { industryKey: 'plumbing', serviceName: 'Pipe Repair', serviceCode: 'PLM-PIP', description: 'Pipe repair/replacement', defaultRate: '110.00', rateType: 'hourly', unitLabel: 'hour', taxable: true },
  { industryKey: 'plumbing', serviceName: 'Water Heater Service', serviceCode: 'PLM-WH', description: 'Water heater repair/install', defaultRate: '125.00', rateType: 'hourly', unitLabel: 'hour', taxable: true },
  { industryKey: 'plumbing', serviceName: 'Emergency Plumbing', serviceCode: 'PLM-EMG', description: '24/7 emergency service', defaultRate: '175.00', rateType: 'hourly', unitLabel: 'hour', taxable: true },

  // Painting Services
  { industryKey: 'painting', serviceName: 'Interior Painting', serviceCode: 'PNT-INT', description: 'Interior wall painting', defaultRate: '3.50', rateType: 'per_unit', unitLabel: 'sqft', taxable: true },
  { industryKey: 'painting', serviceName: 'Exterior Painting', serviceCode: 'PNT-EXT', description: 'Exterior house painting', defaultRate: '4.00', rateType: 'per_unit', unitLabel: 'sqft', taxable: true },
  { industryKey: 'painting', serviceName: 'Cabinet Refinishing', serviceCode: 'PNT-CAB', description: 'Kitchen cabinet refinishing', defaultRate: '75.00', rateType: 'hourly', unitLabel: 'hour', taxable: true },
  { industryKey: 'painting', serviceName: 'Deck Staining', serviceCode: 'PNT-DCK', description: 'Deck staining/sealing', defaultRate: '2.50', rateType: 'per_unit', unitLabel: 'sqft', taxable: true },
  { industryKey: 'painting', serviceName: 'Commercial Painting', serviceCode: 'PNT-COM', description: 'Commercial space painting', defaultRate: '55.00', rateType: 'hourly', unitLabel: 'hour', taxable: true },

  // Landscaping Services
  { industryKey: 'landscaping', serviceName: 'Lawn Mowing', serviceCode: 'LND-MOW', description: 'Regular lawn mowing', defaultRate: '45.00', rateType: 'flat', unitLabel: 'visit', taxable: true },
  { industryKey: 'landscaping', serviceName: 'Landscape Design', serviceCode: 'LND-DES', description: 'Custom landscape design', defaultRate: '85.00', rateType: 'hourly', unitLabel: 'hour', taxable: true },
  { industryKey: 'landscaping', serviceName: 'Tree Trimming', serviceCode: 'LND-TRE', description: 'Tree/shrub trimming', defaultRate: '75.00', rateType: 'hourly', unitLabel: 'hour', taxable: true },
  { industryKey: 'landscaping', serviceName: 'Irrigation Install', serviceCode: 'LND-IRR', description: 'Sprinkler system installation', defaultRate: '95.00', rateType: 'hourly', unitLabel: 'hour', taxable: true },
  { industryKey: 'landscaping', serviceName: 'Snow Removal', serviceCode: 'LND-SNO', description: 'Snow plowing/removal', defaultRate: '125.00', rateType: 'flat', unitLabel: 'visit', taxable: true },

  // Electrical Services
  { industryKey: 'electrical', serviceName: 'Electrical Service Call', serviceCode: 'ELE-SVC', description: 'Diagnostic service call', defaultRate: '95.00', rateType: 'flat', unitLabel: 'call', taxable: true },
  { industryKey: 'electrical', serviceName: 'Outlet Installation', serviceCode: 'ELE-OUT', description: 'New outlet/switch install', defaultRate: '150.00', rateType: 'flat', unitLabel: 'outlet', taxable: true },
  { industryKey: 'electrical', serviceName: 'Panel Upgrade', serviceCode: 'ELE-PNL', description: 'Electrical panel upgrade', defaultRate: '135.00', rateType: 'hourly', unitLabel: 'hour', taxable: true },
  { industryKey: 'electrical', serviceName: 'Lighting Installation', serviceCode: 'ELE-LIT', description: 'Light fixture installation', defaultRate: '85.00', rateType: 'flat', unitLabel: 'fixture', taxable: true },
  { industryKey: 'electrical', serviceName: 'Wiring Repair', serviceCode: 'ELE-WIR', description: 'Electrical wiring repair', defaultRate: '125.00', rateType: 'hourly', unitLabel: 'hour', taxable: true },
];

// Common EVV billing codes by state (example for major states)
const EVV_BILLING_CODES = [
  { stateCode: 'TX', billingCode: 'T1019', description: 'Personal Care Services', serviceCategory: 'personal_care', unitDurationMinutes: 15, medicaidRate: '4.50' },
  { stateCode: 'TX', billingCode: 'G0156', description: 'Home Health Aide Services', serviceCategory: 'home_health_aide', unitDurationMinutes: 15, medicaidRate: '5.25' },
  { stateCode: 'TX', billingCode: 'T1005', description: 'Respite Care Services', serviceCategory: 'respite', unitDurationMinutes: 15, medicaidRate: '4.00' },
  { stateCode: 'CA', billingCode: 'T1019', description: 'Personal Care Services', serviceCategory: 'personal_care', unitDurationMinutes: 15, medicaidRate: '5.50' },
  { stateCode: 'CA', billingCode: 'G0156', description: 'Home Health Aide Services', serviceCategory: 'home_health_aide', unitDurationMinutes: 15, medicaidRate: '6.00' },
  { stateCode: 'NY', billingCode: 'T1019', description: 'Personal Care Services', serviceCategory: 'personal_care', unitDurationMinutes: 15, medicaidRate: '6.25' },
  { stateCode: 'NY', billingCode: 'G0299', description: 'Skilled Nursing Visit', serviceCategory: 'skilled_nursing', unitDurationMinutes: 60, medicaidRate: '85.00', requiresPhysicianOrder: true },
  { stateCode: 'FL', billingCode: 'T1019', description: 'Personal Care Services', serviceCategory: 'personal_care', unitDurationMinutes: 15, medicaidRate: '4.25' },
  { stateCode: 'FL', billingCode: 'T1005', description: 'Respite Care Services', serviceCategory: 'respite', unitDurationMinutes: 15, medicaidRate: '3.75' },
];

export class QuickBooksPhase3Service {
  
  // ========================================================================
  // 1. 1099/W-2 PREP - Contractor vs Employee Classification
  // ========================================================================
  
  /**
   * Sync vendor 1099 status from QuickBooks and classify workers
   */
  async syncVendorTaxClassifications(workspaceId: string): Promise<{
    synced: number;
    flagged: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let synced = 0;
    let flagged = 0;
    
    try {
      const [connection] = await db.select()
        .from(partnerConnections)
        .where(and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'quickbooks'),
          eq(partnerConnections.status, 'connected')
        ))
        .limit(1);
      
      if (!connection) {
        return { synced: 0, flagged: 0, errors: ['No QuickBooks connection found'] };
      }
      
      const accessToken = await quickbooksOAuthService.getValidAccessToken(connection.id);
      const realmId = connection.realmId;
      
      // Fetch vendors with 1099 flag from QuickBooks
      const vendorResponse = await fetch(
        `${QBO_API_BASE}/${realmId}/query?query=SELECT * FROM Vendor WHERE Active = true`,
        {
          signal: AbortSignal.timeout(15000),
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );
      
      if (!vendorResponse.ok) {
        errors.push(`Failed to fetch vendors: ${vendorResponse.statusText}`);
        return { synced, flagged, errors };
      }
      
      const vendorData = await vendorResponse.json();
      const vendors = vendorData?.QueryResponse?.Vendor || [];
      
      const currentYear = new Date().getFullYear();
      
      for (const vendor of vendors) {
        // Find matching employee by QBO vendor ID or email
        const matchingEmployees = await db.select()
          .from(employees)
          .where(and(
            eq(employees.workspaceId, workspaceId),
            eq(employees.quickbooksVendorId, vendor.Id)
          ));
        
        if (matchingEmployees.length === 0 && vendor.PrimaryEmailAddr?.Address) {
          // Try matching by email
          const emailMatches = await db.select()
            .from(employees)
            .where(and(
              eq(employees.workspaceId, workspaceId),
              eq(employees.email, vendor.PrimaryEmailAddr.Address)
            ));
          matchingEmployees.push(...emailMatches);
        }
        
        for (const emp of matchingEmployees) {
          const newClassification = vendor.Vendor1099 ? '1099_contractor' : 'w2_employee';
          const prevClassification = emp.workerType === 'contractor' ? '1099_contractor' : 'w2_employee';
          
          // Update employee record
          await db.update(employees)
            .set({
              quickbooksVendorId: vendor.Id,
              is1099Eligible: vendor.Vendor1099 || false,
              workerType: vendor.Vendor1099 ? 'contractor' : emp.workerType,
            })
            .where(eq(employees.id, emp.id));
          
          // Log classification history
          if (prevClassification !== newClassification) {
            await db.insert(workerTaxClassificationHistory).values({
              workspaceId,
              employeeId: emp.id,
              previousClassification: prevClassification,
              newClassification,
              changeSource: 'qbo_sync',
              qboVendorId: vendor.Id,
              is1099Eligible: vendor.Vendor1099 || false,
              taxYear: currentYear,
              effectiveDate: new Date().toISOString().split('T')[0],
            });
            flagged++;
          }
          
          synced++;
        }
      }
      
      await (auditLogger as any).log({
        action: 'qbo_tax_classification_sync',
        details: { workspaceId, synced, flagged },
        severity: 'info',
      });
      
      return { synced, flagged, errors };
    } catch (error: any) {
      errors.push((error instanceof Error ? error.message : String(error)));
      return { synced, flagged, errors };
    }
  }
  
  /**
   * Get workers flagged as 1099 contractors for tax prep
   */
  async get1099Workers(workspaceId: string, taxYear: number): Promise<any[]> {
    const workers = await db.select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
      workerType: employees.workerType,
      is1099Eligible: employees.is1099Eligible,
      quickbooksVendorId: employees.quickbooksVendorId,
    })
    .from(employees)
    .where(and(
      eq(employees.workspaceId, workspaceId),
      eq(employees.is1099Eligible, true),
      eq(employees.isActive, true)
    ));
    
    return workers;
  }
  
  // ========================================================================
  // 2. INDUSTRY TEMPLATES - Pre-built Service Catalogs
  // ========================================================================
  
  /**
   * Seed industry templates (run once or on demand)
   */
  async seedIndustryTemplates(): Promise<{ inserted: number }> {
    let inserted = 0;
    
    for (const template of INDUSTRY_TEMPLATES) {
      // Check if exists
      const existing = await db.select()
        .from(industryServiceTemplates)
        .where(and(
          eq(industryServiceTemplates.industryKey, template.industryKey),
          eq(industryServiceTemplates.serviceCode, template.serviceCode || '')
        ))
        .limit(1);
      
      if (existing.length === 0) {
        await db.insert(industryServiceTemplates).values(template);
        inserted++;
      }
    }
    
    log.info(`[Phase3] Seeded ${inserted} industry templates`);
    return { inserted };
  }
  
  /**
   * Get templates for a specific industry
   */
  async getIndustryTemplates(industryKey: string): Promise<any[]> {
    return await db.select()
      .from(industryServiceTemplates)
      .where(and(
        eq(industryServiceTemplates.industryKey, industryKey),
        eq(industryServiceTemplates.isActive, true)
      ))
      .orderBy(industryServiceTemplates.sortOrder);
  }
  
  /**
   * Import industry templates into workspace catalog
   */
  async importTemplatesToWorkspace(workspaceId: string, industryKey: string): Promise<{ imported: number }> {
    const templates = await this.getIndustryTemplates(industryKey);
    let imported = 0;
    
    for (const template of templates) {
      // Check if already imported
      const existing = await db.select()
        .from(workspaceServiceCatalog)
        .where(and(
          eq(workspaceServiceCatalog.workspaceId, workspaceId),
          eq(workspaceServiceCatalog.templateId, template.id)
        ))
        .limit(1);
      
      if (existing.length === 0) {
        await db.insert(workspaceServiceCatalog).values({
          workspaceId,
          templateId: template.id,
          serviceName: template.serviceName,
          serviceCode: template.serviceCode,
          description: template.description,
          defaultRate: template.defaultRate,
          rateType: template.rateType,
          unitLabel: template.unitLabel,
          evvRequired: template.evvRequired,
          evvBillingCode: template.evvBillingCode,
          taxable: template.taxable,
        });
        imported++;
      }
    }
    
    await (auditLogger as any).log({
      action: 'industry_templates_imported',
      details: { workspaceId, industryKey, imported },
      severity: 'info',
    });
    
    return { imported };
  }
  
  /**
   * Sync workspace catalog to QuickBooks Items
   */
  async syncCatalogToQuickBooks(workspaceId: string): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;
    
    try {
      const [connection] = await db.select()
        .from(partnerConnections)
        .where(and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'quickbooks'),
          eq(partnerConnections.status, 'connected')
        ))
        .limit(1);
      
      if (!connection) {
        return { synced: 0, errors: ['No QuickBooks connection'] };
      }
      
      const catalog = await db.select()
        .from(workspaceServiceCatalog)
        .where(and(
          eq(workspaceServiceCatalog.workspaceId, workspaceId),
          eq(workspaceServiceCatalog.isActive, true),
          isNull(workspaceServiceCatalog.qboItemId)
        ));
      
      const accessToken = await quickbooksOAuthService.getValidAccessToken(connection.id);
      const realmId = connection.realmId;
      
      for (const item of catalog) {
        try {
          // Create Item in QuickBooks
          const qboItem = {
            Name: item.serviceName.substring(0, 100), // QBO max 100 chars
            Type: 'Service',
            Description: item.description || item.serviceName,
            UnitPrice: parseFloat(item.defaultRate || '0'),
            Taxable: item.taxable,
            IncomeAccountRef: { value: '1' }, // Default income account - should be configured
          };
          
          const response = await fetch(`${QBO_API_BASE}/${realmId}/item`, {
            method: 'POST',
            signal: AbortSignal.timeout(15000),
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify(qboItem),
          });
          
          if (response.ok) {
            const result = await response.json();
            await db.update(workspaceServiceCatalog)
              .set({
                qboItemId: result.Item.Id,
                qboItemSyncToken: result.Item.SyncToken,
                qboLastSynced: new Date(),
              })
              .where(eq(workspaceServiceCatalog.id, item.id));
            synced++;
          } else {
            errors.push(`Failed to create QBO item for ${item.serviceName}`);
          }
        } catch (e: any) {
          errors.push(`Error syncing ${item.serviceName}: ${e.message}`);
        }
      }
      
      return { synced, errors };
    } catch (error: any) {
      errors.push((error instanceof Error ? error.message : String(error)));
      return { synced, errors };
    }
  }
  
  // ========================================================================
  // 3. MULTI-LOCATION ROLLUPS - Franchise/Branch P&L
  // ========================================================================
  
  /**
   * Create or update location P&L snapshot
   */
  async generateLocationPnlSnapshot(
    workspaceId: string,
    locationId: string,
    periodType: 'daily' | 'weekly' | 'monthly',
    periodStart: Date,
    periodEnd: Date
  ): Promise<any> {
    // Get location
    const [location] = await db.select()
      .from(businessLocations)
      .where(eq(businessLocations.id, locationId));
    
    if (!location) {
      throw new Error('Location not found');
    }
    
    // Calculate metrics from time entries and invoices for this location
    // This would join with shifts/assignments that have location assignments
    const snapshot = {
      workspaceId,
      locationId,
      periodType,
      periodStart: periodStart.toISOString().split('T')[0],
      periodEnd: periodEnd.toISOString().split('T')[0],
      totalRevenue: '0',
      invoicedAmount: '0',
      collectedAmount: '0',
      totalLabor: '0',
      totalMaterials: '0',
      totalOverhead: '0',
      grossProfit: '0',
      netProfit: '0',
      profitMargin: '0',
    };
    
    // Upsert snapshot
    await db.insert(locationPnlSnapshots)
      .values(snapshot)
      .onConflictDoUpdate({
        target: [locationPnlSnapshots.locationId, locationPnlSnapshots.periodType, locationPnlSnapshots.periodStart],
        set: snapshot,
      });
    
    return snapshot;
  }
  
  /**
   * Get rollup P&L across all locations
   */
  async getMultiLocationRollup(workspaceId: string, periodType: string, periodStart: Date): Promise<any[]> {
    return await db.select()
      .from(locationPnlSnapshots)
      .innerJoin(businessLocations, eq(locationPnlSnapshots.locationId, businessLocations.id))
      .where(and(
        eq(locationPnlSnapshots.workspaceId, workspaceId),
        eq(locationPnlSnapshots.periodType, periodType),
        eq(locationPnlSnapshots.periodStart, periodStart.toISOString().split('T')[0])
      ));
  }
  
  // ========================================================================
  // 4. HOME HEALTH EVV - Electronic Visit Verification
  // ========================================================================
  
  /**
   * Seed EVV billing codes
   */
  async seedEvvBillingCodes(): Promise<{ inserted: number }> {
    let inserted = 0;
    
    for (const code of EVV_BILLING_CODES) {
      const existing = await db.select()
        .from(evvBillingCodes)
        .where(and(
          eq(evvBillingCodes.stateCode, code.stateCode),
          eq(evvBillingCodes.billingCode, code.billingCode)
        ))
        .limit(1);
      
      if (existing.length === 0) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(evvBillingCodes).values({ ...code, workspaceId: PLATFORM_WORKSPACE_ID });
        inserted++;
      }
    }
    
    log.info(`[Phase3] Seeded ${inserted} EVV billing codes`);
    return { inserted };
  }
  
  /**
   * Get EVV codes for a state
   */
  async getEvvCodes(stateCode: string): Promise<any[]> {
    return await db.select()
      .from(evvBillingCodes)
      .where(and(
        eq(evvBillingCodes.stateCode, stateCode.toUpperCase()),
        eq(evvBillingCodes.isActive, true)
      ));
  }
  
  /**
   * Validate EVV visit data before invoicing
   */
  async validateEvvVisit(visitId: string): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    const [visit] = await db.select()
      .from(evvVisitRecords)
      .where(eq(evvVisitRecords.id, visitId));
    
    if (!visit) {
      return { valid: false, issues: ['Visit not found'] };
    }
    
    // Check GPS verification
    if (!visit.gpsVerified) {
      issues.push('GPS location not verified');
    }
    
    // Check client signature
    if (!visit.clientSignature) {
      issues.push('Client signature missing');
    }
    
    // Check actual times recorded
    if (!visit.actualStart || !visit.actualEnd) {
      issues.push('Actual visit times not recorded');
    }
    
    // Check billing code
    if (!visit.billingCodeId) {
      issues.push('EVV billing code not assigned');
    }
    
    return { valid: issues.length === 0, issues };
  }
  
  // ========================================================================
  // 5. FINANCIAL WATCHDOG - AI Reconciliation
  // ========================================================================
  
  /**
   * Run full reconciliation scan between CoAIleague and QuickBooks
   */
  async runReconciliationScan(
    workspaceId: string,
    periodStart: Date,
    periodEnd: Date,
    triggeredBy?: string
  ): Promise<{
    runId: string;
    findingsCount: number;
    criticalCount: number;
    totalDiscrepancy: number;
  }> {
    const runId = crypto.randomUUID();
    const findings: InsertReconciliationFinding[] = [];
    
    // Create run record
    const [run] = await db.insert(reconciliationRuns).values({
      id: runId,
      workspaceId,
      runType: triggeredBy ? 'manual' : 'scheduled',
      startedAt: new Date(),
      periodStart: periodStart.toISOString().split('T')[0],
      periodEnd: periodEnd.toISOString().split('T')[0],
      triggeredBy,
    }).returning();
    
    try {
      const [connection] = await db.select()
        .from(partnerConnections)
        .where(and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'quickbooks'),
          eq(partnerConnections.status, 'connected')
        ))
        .limit(1);
      
      if (!connection) {
        await db.update(reconciliationRuns)
          .set({ status: 'failed', errorMessage: 'No QuickBooks connection' })
          .where(eq(reconciliationRuns.id, runId));
        return { runId, findingsCount: 0, criticalCount: 0, totalDiscrepancy: 0 };
      }
      
      const accessToken = await quickbooksOAuthService.getValidAccessToken(connection.id);
      const realmId = connection.realmId;
      
      // 1. Check Invoice mismatches
      const localInvoices = await db.select()
        .from(invoices)
        .where(and(
          eq(invoices.workspaceId, workspaceId),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          gte(invoices.issueDate, periodStart.toISOString().split('T')[0]),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          lte(invoices.issueDate, periodEnd.toISOString().split('T')[0])
        ));
      
      // Fetch QBO invoices
      const qboInvoiceResponse = await fetch(
        `${QBO_API_BASE}/${realmId}/query?query=SELECT * FROM Invoice WHERE TxnDate >= '${periodStart.toISOString().split('T')[0]}' AND TxnDate <= '${periodEnd.toISOString().split('T')[0]}'`,
        {
          signal: AbortSignal.timeout(15000),
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );
      
      if (qboInvoiceResponse.ok) {
        const qboData = await qboInvoiceResponse.json();
        const qboInvoices = qboData?.QueryResponse?.Invoice || [];
        
        // Check for invoices in CoAIleague but not in QBO
        for (const localInv of localInvoices) {
          const qboMatch = qboInvoices.find((q: any) => 
            q.DocNumber === localInv.invoiceNumber || 
            q.PrivateNote?.includes(localInv.id)
          );
          
          if (!qboMatch && localInv.status !== 'draft') {
            findings.push({
              workspaceId,
              runId,
              findingType: 'invoice_mismatch',
              severity: 'high',
              entityType: 'invoice',
              localEntityId: localInv.id,
              description: `Invoice ${localInv.invoiceNumber} exists in CoAIleague but not found in QuickBooks`,
              suggestedAction: 'Create invoice in QuickBooks or mark as synced',
              confidence: '0.90',
              autoFixable: true,
            });
          } else if (qboMatch) {
            // Check amount mismatch
            const localAmount = parseFloat(localInv.total || '0');
            const qboAmount = parseFloat(qboMatch.TotalAmt || '0');
            
            if (Math.abs(localAmount - qboAmount) > 0.01) {
              findings.push({
                workspaceId,
                runId,
                findingType: 'invoice_mismatch',
                severity: Math.abs(localAmount - qboAmount) > 100 ? 'critical' : 'medium',
                entityType: 'invoice',
                localEntityId: localInv.id,
                qboEntityId: qboMatch.Id,
                fieldName: 'TotalAmount',
                localValue: localAmount.toString(),
                qboValue: qboAmount.toString(),
                discrepancyAmount: (localAmount - qboAmount).toFixed(2),
                description: `Invoice ${localInv.invoiceNumber} amount mismatch: CoAIleague $${localAmount} vs QuickBooks $${qboAmount}`,
                suggestedAction: 'Review and reconcile the invoice amounts',
                confidence: '0.95',
              });
            }
          }
        }
      }
      
      // 2. Check for duplicate entries
      const duplicateCheck = await db.select()
        .from(invoices)
        .where(and(
          eq(invoices.workspaceId, workspaceId),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          gte(invoices.issueDate, periodStart.toISOString().split('T')[0])
        ));
      
      const invoicesByClient = new Map<string, any[]>();
      for (const inv of duplicateCheck) {
        const key = `${inv.clientId}-${inv.issueDate}-${inv.total}`;
        if (!invoicesByClient.has(key)) {
          invoicesByClient.set(key, []);
        }
        invoicesByClient.get(key)!.push(inv);
      }
      
      for (const [key, invs] of invoicesByClient) {
        if (invs.length > 1) {
          findings.push({
            workspaceId,
            runId,
            findingType: 'duplicate_entry',
            severity: 'medium',
            entityType: 'invoice',
            localEntityId: invs[0].id,
            description: `Potential duplicate invoices detected: ${invs.map(i => i.invoiceNumber).join(', ')}`,
            suggestedAction: 'Review and void duplicate invoices',
            confidence: '0.85',
          });
        }
      }
      
      // Insert findings
      if (findings.length > 0) {
        await db.insert(reconciliationFindings).values(findings);
      }
      
      // Update run with results
      const criticalCount = findings.filter(f => f.severity === 'critical').length;
      const highCount = findings.filter(f => f.severity === 'high').length;
      const totalDiscrepancy = findings
        .filter(f => f.discrepancyAmount)
        .reduce((sum, f) => sum + Math.abs(parseFloat(f.discrepancyAmount || '0')), 0);
      
      await db.update(reconciliationRuns)
        .set({
          status: 'completed',
          completedAt: new Date(),
          findingsCount: findings.length,
          criticalCount,
          highCount,
          mediumCount: findings.filter(f => f.severity === 'medium').length,
          lowCount: findings.filter(f => f.severity === 'low').length,
          totalDiscrepancyAmount: totalDiscrepancy.toFixed(2),
        })
        .where(eq(reconciliationRuns.id, runId));
      
      // Emit event for notifications
      if (criticalCount > 0 || highCount > 0) {
        platformEventBus.publish({
          type: 'quickbooks_operation_failed',
          category: 'partner',
          title: `Reconciliation Alert: ${criticalCount} Critical, ${highCount} High`,
          description: `Financial watchdog scan found discrepancies totalling $${totalDiscrepancy.toFixed(2)}`,
          workspaceId,
          metadata: { runId, criticalCount, highCount, totalDiscrepancy },
        }).catch((err) => log.warn('[quickbooksPhase3Service] Fire-and-forget failed:', err));
      }
      
      await (auditLogger as any).log({
        action: 'financial_watchdog_scan',
        details: { workspaceId, runId, findingsCount: findings.length, criticalCount },
        severity: criticalCount > 0 ? 'warning' : 'info',
      });
      
      return {
        runId,
        findingsCount: findings.length,
        criticalCount,
        totalDiscrepancy,
      };
    } catch (error: any) {
      await db.update(reconciliationRuns)
        .set({ status: 'failed', errorMessage: (error instanceof Error ? error.message : String(error)) })
        .where(eq(reconciliationRuns.id, runId));
      throw error;
    }
  }
  
  /**
   * Get open reconciliation findings
   */
  async getOpenFindings(workspaceId: string): Promise<any[]> {
    return await db.select()
      .from(reconciliationFindings)
      .where(and(
        eq(reconciliationFindings.workspaceId, workspaceId),
        eq(reconciliationFindings.status, 'open')
      ))
      .orderBy(
        desc(sql`CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END`),
        desc(reconciliationFindings.createdAt)
      );
  }
  
  /**
   * Resolve a finding
   */
  async resolveFinding(findingId: string, userId: string, notes: string): Promise<void> {
    await db.update(reconciliationFindings)
      .set({
        status: 'resolved',
        resolvedBy: userId,
        resolvedAt: new Date(),
        resolutionNotes: notes,
      })
      .where(eq(reconciliationFindings.id, findingId));
  }
  
  // ========================================================================
  // INITIALIZATION
  // ========================================================================
  
  /**
   * Initialize Phase 3 features - seed templates and EVV codes
   */
  async initialize(): Promise<void> {
    log.info('[QuickBooks Phase 3] Initializing Intelligence & Compliance features...');
    
    try {
      const templateResult = await this.seedIndustryTemplates();
      log.info(`[QuickBooks Phase 3] Industry templates: ${templateResult.inserted} seeded`);
      
      const evvResult = await this.seedEvvBillingCodes();
      log.info(`[QuickBooks Phase 3] EVV billing codes: ${evvResult.inserted} seeded`);
      
      log.info('[QuickBooks Phase 3] Initialization complete');
    } catch (error: any) {
      log.error('[QuickBooks Phase 3] Initialization error:', (error instanceof Error ? error.message : String(error)));
    }
  }
}

// Singleton export
export const quickbooksPhase3Service = new QuickBooksPhase3Service();

// Auto-initialize on import
quickbooksPhase3Service.initialize().catch((err: unknown) => {
  log.error('QuickBooks Phase 3 auto-initialize failed', err);
});
