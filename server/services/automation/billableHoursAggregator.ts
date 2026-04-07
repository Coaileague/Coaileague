import { db } from "server/db";
import { timeEntries, employees, clients, clientRates, workspaces, shifts } from "@shared/schema";
import { and, eq, gte, lte, isNull, isNotNull, or, sql, inArray } from "drizzle-orm";
import { resolveRates, bucketHours, calculateAmount, roundHours } from "./rateResolver";
import { isHolidayDate } from "./holidayDetector";
import { BILLING } from "../../config/platformConfig";
import { createLogger } from "../../lib/logger";

const log = createLogger('billable-hours-aggregator');

/**
 * Billable Hours Aggregation Service
 * 
 * Automatically collects approved, unbilled time entries for a billing period
 * and prepares them for invoice generation. This is the "data collection" 
 * automation that feeds into Billing Platform.
 * 
 * CRITICAL: Overtime must be calculated at the employee level (tracking weekly
 * hours across all clients), but the output is grouped by client (for invoicing).
 * 
 * Algorithm:
 * 1. Batch-load workspace settings and client rates (eliminate N+1 queries)
 * 2. Group entries by employee FIRST (to track weekly hours)
 * 3. Sort chronologically within each employee (for deterministic OT)
 * 4. Calculate overtime using workspace rules and weekly accumulator
 * 5. Restructure output by client (for invoice line items)
 * 
 * Key Features:
 * - Finds approved, unbilled entries (status='approved', billedAt IS NULL)
 * - Applies workspace overtime rules (daily/weekly thresholds)
 * - Calculates billing amounts (regular, OT, holiday)
 * - Uses rate resolution precedence (entry → employee → client → workspace)
 * - Validates data completeness
 */

export interface BillableHoursSummary {
  workspaceId: string;
  periodStart: Date;
  periodEnd: Date;
  clientSummaries: ClientBillableSummary[];
  totalBillableAmount: number;
  warnings: string[];
  entriesProcessed: number;
}

export interface ClientBillableSummary {
  clientId: string;
  clientName: string;
  entries: TimeEntryBillable[];
  totalHours: number;
  totalRegularHours: number;
  totalOvertimeHours: number;
  totalHolidayHours: number;
  totalAmount: number;
  warnings: string[];
}

export interface TimeEntryBillable {
  timeEntryId: string;
  employeeId: string;
  employeeName: string;
  clockIn: Date;
  clockOut: Date;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  holidayHours: number;
  billingRate: number;
  amount: number;
  rateSource: string;
  manuallyEdited?: boolean;
  manualEditReason?: string | null;
}

/**
 * Aggregate billable hours for a workspace in a given period
 * 
 * CRITICAL: Overtime calculation requires employee-level tracking, so we:
 * 1. Group by employee FIRST (to track weekly hours)
 * 2. Sort chronologically (for deterministic OT)
 * 3. Calculate OT using workspace rules
 * 4. Then restructure output by client (for invoice generation)
 */
export async function aggregateBillableHours(params: {
  workspaceId: string;
  startDate: Date;
  endDate: Date;
  clientId?: string;
}): Promise<BillableHoursSummary> {
  const { workspaceId, startDate, endDate, clientId } = params;

  log.info(`Aggregating for workspace ${workspaceId} from ${startDate.toISOString()} to ${endDate.toISOString()}`);

  // Get workspace settings for overtime rules, holiday calendar, and default rates
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }

  // Apply workspace overtime rules and default rates
  const enableDailyOT = workspace.enableDailyOvertime || false;
  const dailyOTThreshold = parseFloat(workspace.dailyOvertimeThreshold || "8.00");
  const weeklyOTThreshold = parseFloat(workspace.weeklyOvertimeThreshold || "40.00");
  const workspaceDefaultRate = workspace.defaultBillableRate;
  
  // Holiday calendar and timezone for timezone-aware holiday detection
  const holidayCalendar = workspace.holidayCalendar as any[] || [];
  const workspaceTimezone = workspace.timezone || "America/New_York";

  // Find all approved, unbilled time entries in period
  // Training guard: LEFT JOIN shifts and exclude entries linked to training shifts
  // so seeded training data never flows into real client invoices.
  const approvedEntries = await db
    .select({
      timeEntry: timeEntries,
      employee: employees,
      client: clients,
    })
    .from(timeEntries)
    .leftJoin(employees, eq(timeEntries.employeeId, employees.id))
    .leftJoin(clients, eq(timeEntries.clientId, clients.id))
    .leftJoin(shifts, eq(timeEntries.shiftId, shifts.id))
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.status, 'approved'),
        isNull(timeEntries.billedAt),
        isNotNull(timeEntries.clockOut),
        gte(timeEntries.clockIn, startDate),
        lte(timeEntries.clockIn, endDate),
        eq(timeEntries.billableToClient, true),
        or(isNull(timeEntries.shiftId), eq(shifts.isTrainingShift, false)),
        ...(clientId ? [eq(timeEntries.clientId, clientId)] : [])
      )
    );

  log.info(`Found ${approvedEntries.length} approved, unbilled entries`);

  if (approvedEntries.length === 0) {
    return {
      workspaceId,
      periodStart: startDate,
      periodEnd: endDate,
      clientSummaries: [],
      totalBillableAmount: 0,
      warnings: ['No approved, unbilled time entries found in this period'],
      entriesProcessed: 0,
    };
  }

  // Batch-load all unique client rates to eliminate N+1 queries
  const uniqueClientIds = Array.from(new Set(approvedEntries.map(e => e.timeEntry.clientId).filter(Boolean) as string[]));
  let clientRatesMap = new Map<string, string>();
  
  if (uniqueClientIds.length > 0) {
    const clientRatesList = await db
      .select()
      .from(clientRates)
      .where(
        and(
          eq(clientRates.isActive, true),
          sql`${clientRates.clientId} IN (${sql.join(uniqueClientIds.map(id => sql`${id}`), sql.raw(', '))})`
        )
      );
    
    clientRatesMap = new Map(clientRatesList.map(cr => [cr.clientId, cr.billableRate]));
  }

  const warnings: string[] = [];
  
  // STEP 1: Group entries by employee (for overtime calculation)
  const employeeGroups = new Map<string, typeof approvedEntries>();
  for (const entry of approvedEntries) {
    const employeeId = entry.timeEntry.employeeId;
    if (!employeeGroups.has(employeeId)) {
      employeeGroups.set(employeeId, []);
    }
    employeeGroups.get(employeeId)!.push(entry);
  }

  // STEP 2: Process each employee's entries chronologically, calculating OT
  interface ProcessedEntry {
    timeEntryId: string;
    employeeId: string;
    employeeName: string;
    clientId: string | null;
    clientName: string | null;
    shiftId: string | null;
    clockIn: Date;
    clockOut: Date;
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    holidayHours: number;
    billingRate: number;
    amount: number;
    rateSource: string;
  }

  const allProcessedEntries: ProcessedEntry[] = [];

  for (const [employeeId, entries] of Array.from(employeeGroups)) {
    const employee = entries[0].employee;
    
    if (!employee) {
      warnings.push(`Employee ${employeeId} not found - skipping entries`);
      continue;
    }

    const employeeName = `${employee.firstName} ${employee.lastName}`;

    // Sort entries chronologically for deterministic overtime calculation
    const sortedEntries = entries.sort((a, b) => 
      a.timeEntry.clockIn.getTime() - b.timeEntry.clockIn.getTime()
    );

    let weeklyHoursSoFar = 0;
    let currentWeekStart: Date | null = null;

    // Helper: Get start of ISO week (Monday at midnight) for a given date
    const getWeekStart = (date: Date): Date => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
      d.setDate(diff);
      d.setHours(0, 0, 0, 0); // Normalize to midnight for consistent comparison
      return d;
    };

    for (const entry of sortedEntries) {
      const { timeEntry, client } = entry;

      // Reset weekly hours when crossing week boundary (FLSA compliance)
      const entryWeekStart = getWeekStart(timeEntry.clockIn);
      if (currentWeekStart === null || entryWeekStart.getTime() !== currentWeekStart.getTime()) {
        weeklyHoursSoFar = 0;
        currentWeekStart = entryWeekStart;
      }

      // Validate entry has required data
      if (!timeEntry.clockOut) {
        warnings.push(`Time entry ${timeEntry.id} missing clock-out - skipping`);
        continue;
      }

      if (!timeEntry.totalHours) {
        warnings.push(`Time entry ${timeEntry.id} missing total hours - skipping`);
        continue;
      }

      // Resolve billing rate using batch-loaded client rates
      const clientBillableRate = timeEntry.clientId ? clientRatesMap.get(timeEntry.clientId) : undefined;
      
      const resolved = resolveRates({
        timeEntry,
        employeeHourlyRate: employee.hourlyRate,
        clientBillableRate,
        workspaceDefaultRate,
      });

      if (resolved.hasWarning) {
        warnings.push(resolved.warningMessage!);
      }

      // Calculate hours bucketing (regular, OT, holiday) using workspace settings
      const totalHours = parseFloat(timeEntry.totalHours);
      
      // Timezone-aware holiday detection using workspace holiday calendar
      const isHoliday = isHolidayDate(timeEntry.clockIn, holidayCalendar, workspaceTimezone);
      
      const hoursBucket = bucketHours({
        totalHours,
        weeklyHoursSoFar,
        enableDailyOvertime: enableDailyOT,
        weeklyOvertimeThreshold: weeklyOTThreshold,
        isHoliday,
      });

      // Update weekly hours accumulator for next entry
      weeklyHoursSoFar += totalHours;

      // Calculate billable amount using configurable multipliers (env OVERTIME_MULTIPLIER / DOUBLE_TIME_MULTIPLIER)
      const regularAmount = calculateAmount(hoursBucket.regularHours, resolved.billingRate);
      const overtimeAmount = calculateAmount(hoursBucket.overtimeHours, resolved.billingRate * BILLING.overtimeMultiplier);
      const holidayAmount = calculateAmount(hoursBucket.holidayHours, resolved.billingRate * BILLING.doubleTimeMultiplier);
      const totalAmount = regularAmount + overtimeAmount + holidayAmount;

      allProcessedEntries.push({
        timeEntryId: timeEntry.id,
        employeeId,
        employeeName,
        clientId: timeEntry.clientId,
        clientName: client?.companyName || null,
        shiftId: timeEntry.shiftId || null,
        clockIn: timeEntry.clockIn,
        clockOut: timeEntry.clockOut,
        totalHours,
        regularHours: hoursBucket.regularHours,
        overtimeHours: hoursBucket.overtimeHours,
        holidayHours: hoursBucket.holidayHours,
        billingRate: resolved.billingRate,
        amount: totalAmount,
        rateSource: resolved.rateSource,
        manuallyEdited: timeEntry.manuallyEdited || false,
        manualEditReason: (timeEntry as any).manualEditReason || null,
      });
    }
  }

  // STEP 3: Restructure processed entries by client for invoice generation
  // SC2 FIX: Entries missing clientId but having a shiftId can recover the client
  // by looking up the shift. This prevents billable hours from falling into a black hole.
  const orphanedEntries = allProcessedEntries.filter(e => !e.clientId && e.shiftId);
  if (orphanedEntries.length > 0) {
    const orphanShiftIds = [...new Set(orphanedEntries.map(e => e.shiftId!))] ;
    const recoveredShifts = await db
      .select({ id: shifts.id, clientId: shifts.clientId })
      .from(shifts)
      .where(inArray(shifts.id, orphanShiftIds));
    const shiftClientMap = new Map(recoveredShifts.map(s => [s.id, s.clientId]));

    // Batch-load recovered clients to get their names
    const recoveredClientIds = [...new Set(recoveredShifts.map(s => s.clientId).filter(Boolean) as string[])];
    let recoveredClientNames = new Map<string, string>();
    if (recoveredClientIds.length > 0) {
      const recoveredClients = await db
        .select({ id: clients.id, companyName: clients.companyName })
        .from(clients)
        .where(inArray(clients.id, recoveredClientIds));
      recoveredClientNames = new Map(recoveredClients.map(c => [c.id, c.companyName]));
    }

    for (const entry of orphanedEntries) {
      const resolvedClientId = shiftClientMap.get(entry.shiftId!);
      if (resolvedClientId) {
        entry.clientId = resolvedClientId;
        entry.clientName = recoveredClientNames.get(resolvedClientId) || null;
        // Persist the fix so future runs don't encounter the same orphan
        await db
          .update(timeEntries)
          .set({ clientId: resolvedClientId, updatedAt: new Date() })
          .where(eq(timeEntries.id, entry.timeEntryId));
        warnings.push(`[SC2-RECOVERED] Time entry ${entry.timeEntryId} missing clientId — recovered from shift ${entry.shiftId} → client ${resolvedClientId}`);
      } else {
        warnings.push(`[SC2-UNRECOVERABLE] Time entry ${entry.timeEntryId} has billableToClient=true but no clientId and shift ${entry.shiftId} has no client — entry cannot be invoiced. Assign a client to the shift.`);
      }
    }
  }

  // Entries still without clientId after recovery attempt — log and skip
  const clientGroups = new Map<string, ProcessedEntry[]>();
  for (const entry of allProcessedEntries) {
    if (!entry.clientId) {
      warnings.push(`[SC2-SKIP] Time entry ${entry.timeEntryId} has billableToClient=true but no clientId and no shift — cannot invoice. Assign a client or shift to this entry.`);
      continue;
    }
    if (!clientGroups.has(entry.clientId)) {
      clientGroups.set(entry.clientId, []);
    }
    clientGroups.get(entry.clientId)!.push(entry);
  }

  const clientSummaries: ClientBillableSummary[] = [];
  let totalBillableAmount = 0;

  for (const [clientId, entries] of Array.from(clientGroups)) {
    const clientName = entries[0].clientName || 'Unassigned Client';
    
    let clientTotalHours = 0;
    let clientTotalRegularHours = 0;
    let clientTotalOvertimeHours = 0;
    let clientTotalHolidayHours = 0;
    let clientTotalAmount = 0;

    const clientBillable: TimeEntryBillable[] = entries.map(entry => {
      clientTotalHours += entry.totalHours;
      clientTotalRegularHours += entry.regularHours;
      clientTotalOvertimeHours += entry.overtimeHours;
      clientTotalHolidayHours += entry.holidayHours;
      clientTotalAmount += entry.amount;

      return {
        timeEntryId: entry.timeEntryId,
        employeeId: entry.employeeId,
        employeeName: entry.employeeName,
        clockIn: entry.clockIn,
        clockOut: entry.clockOut,
        totalHours: entry.totalHours,
        regularHours: entry.regularHours,
        overtimeHours: entry.overtimeHours,
        holidayHours: entry.holidayHours,
        billingRate: entry.billingRate,
        amount: entry.amount,
        rateSource: entry.rateSource,
        manuallyEdited: (entry as any).manuallyEdited || false,
        manualEditReason: (entry as any).manualEditReason || null,
      };
    });

    clientSummaries.push({
      clientId,
      clientName,
      entries: clientBillable,
      totalHours: roundHours(clientTotalHours),
      totalRegularHours: roundHours(clientTotalRegularHours),
      totalOvertimeHours: roundHours(clientTotalOvertimeHours),
      totalHolidayHours: roundHours(clientTotalHolidayHours),
      totalAmount: clientTotalAmount,
      warnings: [],
    });

    totalBillableAmount += clientTotalAmount;
  }

  log.info(`Processed ${approvedEntries.length} entries, $${totalBillableAmount.toFixed(2)} total billable`);

  return {
    workspaceId,
    periodStart: startDate,
    periodEnd: endDate,
    clientSummaries,
    totalBillableAmount,
    warnings,
    entriesProcessed: approvedEntries.length,
  };
}

/**
 * Mark time entries as billed after invoice creation
 */
export async function markEntriesAsBilled(params: {
  timeEntryIds: string[];
  invoiceId: string;
}): Promise<void> {
  const { timeEntryIds, invoiceId } = params;

  let markedCount = 0;
  for (const entryId of timeEntryIds) {
    const result = await db
      .update(timeEntries)
      .set({
        billedAt: new Date(),
        invoiceId,
        updatedAt: new Date(),
      })
      .where(and(eq(timeEntries.id, entryId), isNull(timeEntries.billedAt)))
      .returning();
    
    if (result.length > 0) {
      markedCount++;
    } else {
      log.warn(`Entry ${entryId} already billed - skipping (race condition guard)`);
    }
  }

  log.info(`Marked ${markedCount}/${timeEntryIds.length} entries as billed (invoice ${invoiceId})`);
}

/**
 * Unmark time entries when a draft invoice is cancelled/rejected
 * Restores entries to unbilled state so they can be picked up by the next invoice generation
 */
export async function unmarkEntriesAsBilled(invoiceId: string): Promise<number> {
  const result = await db
    .update(timeEntries)
    .set({
      billedAt: null,
      invoiceId: null,
      updatedAt: new Date(),
    })
    .where(eq(timeEntries.invoiceId, invoiceId))
    .returning();

  log.info(`Unmarked ${result.length} entries from cancelled invoice ${invoiceId}`);
  return result.length;
}
