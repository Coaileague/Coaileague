import { db } from '../../db';
import { 
  partnerConnections, 
  partnerDataMappings,
  employees,
  payrollRuns,
  payrollEntries
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { gustoOAuthService } from '../oauth/gusto';
import { withUsageTracking, withBatchUsageTracking } from '../../middleware/usageTracking';

/**
 * Gusto API Service
 * 
 * Handles all Gusto payroll operations:
 * - Employee sync
 * - Payroll run creation
 * - Compensation management
 * - Time tracking integration
 * 
 * All API calls are tracked for usage-based billing.
 */

const GUSTO_API_BASE = 'https://api.gusto.com/v1';

interface GustoEmployee {
  id?: string;
  first_name: string;
  last_name: string;
  email: string;
  ssn?: string;
  date_of_birth?: string;
  jobs?: Array<{
    title: string;
    rate?: number;
    payment_unit?: 'Hour' | 'Year';
  }>;
}

interface GustoPayroll {
  id?: string;
  company_id: string;
  pay_period: {
    start_date: string;
    end_date: string;
  };
  payroll_deadline?: string;
  processed?: boolean;
  totals?: {
    company_debit: string;
    employee_bonuses: string;
    employee_commissions: string;
    employee_tips: string;
    gross_pay: string;
    net_pay: string;
    reimbursements: string;
    taxes: string;
  };
}

interface GustoTimeActivity {
  employee_id: string;
  date: string;
  hours_worked: number;
  job_id?: string;
}

/**
 * Gusto Payroll Service
 */
export class GustoService {
  /**
   * Get active connection for workspace
   */
  private async getConnection(workspaceId: string) {
    const [connection] = await db.select()
      .from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'gusto'),
          eq(partnerConnections.status, 'connected')
        )
      )
      .limit(1);

    if (!connection) {
      throw new Error('No active Gusto connection found');
    }

    return connection;
  }

  /**
   * Get valid access token (refreshes if needed)
   */
  private async getAccessToken(connectionId: string): Promise<string> {
    return await gustoOAuthService.getValidAccessToken(connectionId);
  }

  /**
   * Make authenticated API request to Gusto
   */
  private async makeRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    accessToken: string,
    body?: any,
    requestId?: string
  ): Promise<T> {
    const url = `${GUSTO_API_BASE}${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gusto API error (${response.status}): ${error}`);
    }

    return await response.json();
  }

  /**
   * Get company ID from Gusto
   * 
   * Gusto requires a company_id for most operations.
   * This is typically stored in the connection metadata.
   */
  private async getCompanyId(connection: any): Promise<string> {
    // If stored in metadata, return it
    if (connection.metadata?.company_id) {
      return connection.metadata.company_id;
    }

    // Otherwise, fetch from Gusto API
    const accessToken = await this.getAccessToken(connection.id);
    const companies = await this.makeRequest<{ companies: Array<{ id: string }> }>(
      'GET',
      '/me',
      accessToken
    );

    if (!companies.companies || companies.companies.length === 0) {
      throw new Error('No Gusto companies found');
    }

    const companyId = companies.companies[0].id;

    // Store for future use
    await db.update(partnerConnections)
      .set({
        metadata: {
          ...connection.metadata,
          company_id: companyId,
        },
      })
      .where(eq(partnerConnections.id, connection.id));

    return companyId;
  }

  /**
   * Sync CoAIleague employee to Gusto
   * 
   * @param workspaceId - Workspace ID
   * @param employeeId - CoAIleague employee ID
   * @param userId - User performing sync
   * @returns Gusto employee ID
   */
  async syncEmployee(
    workspaceId: string,
    employeeId: string,
    userId: string
  ): Promise<string> {
    const connection = await this.getConnection(workspaceId);
    const accessToken = await this.getAccessToken(connection.id);
    const companyId = await this.getCompanyId(connection);

    // Get CoAIleague employee data
    const [employee] = await db.select()
      .from(employees)
      .where(
        and(
          eq(employees.id, employeeId),
          eq(employees.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (!employee) {
      throw new Error('Employee not found');
    }

    // Check if mapping exists
    const [existingMapping] = await db.select()
      .from(partnerDataMappings)
      .where(
        and(
          eq(partnerDataMappings.workspaceId, workspaceId),
          eq(partnerDataMappings.partnerType, 'gusto'),
          eq(partnerDataMappings.entityType, 'employee'),
          eq(partnerDataMappings.coaileagueEntityId, employeeId)
        )
      )
      .limit(1);

    // Prepare Gusto employee data
    const gustoEmployee: GustoEmployee = {
      first_name: employee.firstName,
      last_name: employee.lastName,
      email: employee.email,
      jobs: employee.payRate ? [
        {
          title: employee.position || 'Employee',
          rate: Number(employee.payRate),
          payment_unit: employee.payType === 'salary' ? 'Year' : 'Hour',
        },
      ] : undefined,
    };

    let gustoEmployeeId: string;

    // Create or update employee with tracking
    const createOrUpdateEmployee = withUsageTracking(
      async (requestId: string) => {
        if (existingMapping) {
          // Update existing employee
          const result = await this.makeRequest<GustoEmployee>(
            'PUT',
            `/companies/${companyId}/employees/${existingMapping.partnerEntityId}`,
            accessToken,
            gustoEmployee,
            requestId
          );
          gustoEmployeeId = result.id!;
        } else {
          // Create new employee
          const result = await this.makeRequest<GustoEmployee>(
            'POST',
            `/companies/${companyId}/employees`,
            accessToken,
            gustoEmployee,
            requestId
          );
          gustoEmployeeId = result.id!;
        }

        return { employeeId: gustoEmployeeId };
      },
      {
        workspaceId,
        userId,
        partnerType: 'gusto',
        partnerConnectionId: connection.id,
        operationType: existingMapping ? 'update' : 'create',
        featureKey: 'employee_sync',
        metadata: {
          employeeId,
          operation: existingMapping ? 'update' : 'create',
        },
      }
    );

    const result = await createOrUpdateEmployee();

    // Create or update mapping
    if (existingMapping) {
      await db.update(partnerDataMappings)
        .set({
          partnerEntityId: result.employeeId,
          partnerEntityName: `${employee.firstName} ${employee.lastName}`,
          syncStatus: 'synced',
          lastSyncAt: new Date(),
        })
        .where(eq(partnerDataMappings.id, existingMapping.id));
    } else {
      await db.insert(partnerDataMappings).values({
        workspaceId,
        partnerConnectionId: connection.id,
        partnerType: 'gusto',
        entityType: 'employee',
        coaileagueEntityId: employeeId,
        partnerEntityId: result.employeeId,
        partnerEntityName: `${employee.firstName} ${employee.lastName}`,
        syncStatus: 'synced',
        lastSyncAt: new Date(),
        mappingSource: 'auto',
        createdBy: userId,
      });
    }

    return result.employeeId;
  }

  /**
   * Create payroll run in Gusto
   * 
   * @param workspaceId - Workspace ID
   * @param payrollRunId - CoAIleague payroll run ID
   * @param userId - User performing operation
   * @returns Gusto payroll ID
   */
  async createPayrollRun(
    workspaceId: string,
    payrollRunId: string,
    userId: string
  ): Promise<string> {
    const connection = await this.getConnection(workspaceId);
    const accessToken = await this.getAccessToken(connection.id);
    const companyId = await this.getCompanyId(connection);

    // Get CoAIleague payroll run
    const [payrollRun] = await db.select()
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.id, payrollRunId),
          eq(payrollRuns.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (!payrollRun) {
      throw new Error('Payroll run not found');
    }

    // Create Gusto payroll
    const gustoPayroll: Partial<GustoPayroll> = {
      company_id: companyId,
      pay_period: {
        start_date: payrollRun.startDate.toISOString().split('T')[0],
        end_date: payrollRun.endDate.toISOString().split('T')[0],
      },
      payroll_deadline: payrollRun.payDate?.toISOString().split('T')[0],
    };

    const createGustoPayroll = withUsageTracking(
      async (requestId: string) => {
        const result = await this.makeRequest<GustoPayroll>(
          'POST',
          `/companies/${companyId}/payrolls`,
          accessToken,
          gustoPayroll,
          requestId
        );

        return { payrollId: result.id! };
      },
      {
        workspaceId,
        userId,
        partnerType: 'gusto',
        partnerConnectionId: connection.id,
        operationType: 'create_payroll',
        featureKey: 'payroll_creation',
        metadata: {
          payrollRunId,
          startDate: payrollRun.startDate,
          endDate: payrollRun.endDate,
        },
      }
    );

    const result = await createGustoPayroll();

    // Create mapping
    await db.insert(partnerDataMappings).values({
      workspaceId,
      partnerConnectionId: connection.id,
      partnerType: 'gusto',
      entityType: 'payroll_run',
      coaileagueEntityId: payrollRunId,
      partnerEntityId: result.payrollId,
      partnerEntityName: `Payroll ${payrollRun.startDate.toLocaleDateString()}`,
      syncStatus: 'synced',
      lastSyncAt: new Date(),
      mappingSource: 'auto',
      createdBy: userId,
    });

    return result.payrollId;
  }

  /**
   * Submit time activities to Gusto for payroll
   * 
   * @param workspaceId - Workspace ID
   * @param payrollRunId - CoAIleague payroll run ID
   * @param userId - User performing operation
   */
  async submitTimeActivities(
    workspaceId: string,
    payrollRunId: string,
    userId: string
  ): Promise<void> {
    const connection = await this.getConnection(workspaceId);
    const accessToken = await this.getAccessToken(connection.id);
    const companyId = await this.getCompanyId(connection);

    // Get payroll entries for this run
    const entries = await db.select()
      .from(payrollEntries)
      .where(eq(payrollEntries.payrollRunId, payrollRunId));

    if (entries.length === 0) {
      return; // No entries to submit
    }

    // Prepare time activities
    const timeActivities: GustoTimeActivity[] = [];

    for (const entry of entries) {
      // Get employee mapping
      const [employeeMapping] = await db.select()
        .from(partnerDataMappings)
        .where(
          and(
            eq(partnerDataMappings.workspaceId, workspaceId),
            eq(partnerDataMappings.partnerType, 'gusto'),
            eq(partnerDataMappings.entityType, 'employee'),
            eq(partnerDataMappings.coaileagueEntityId, entry.employeeId)
          )
        )
        .limit(1);

      if (!employeeMapping) {
        // Skip if employee not synced
        console.warn(`Employee ${entry.employeeId} not synced to Gusto`);
        continue;
      }

      timeActivities.push({
        employee_id: employeeMapping.partnerEntityId,
        date: entry.periodEnd.toISOString().split('T')[0],
        hours_worked: Number(entry.regularHours || 0) + Number(entry.overtimeHours || 0),
      });
    }

    if (timeActivities.length === 0) {
      return;
    }

    // Submit time activities using batch tracking
    const submitActivities = withBatchUsageTracking(
      async (batchId: string) => {
        // Gusto typically batches time activities
        await this.makeRequest(
          'POST',
          `/companies/${companyId}/time_activities`,
          accessToken,
          { time_activities: timeActivities },
          batchId
        );

        return { submitted: timeActivities.length };
      },
      {
        workspaceId,
        userId,
        partnerType: 'gusto',
        partnerConnectionId: connection.id,
        operationType: 'submit_time',
        featureKey: 'time_tracking',
        batchSize: timeActivities.length,
        metadata: {
          payrollRunId,
          entriesCount: timeActivities.length,
        },
      }
    );

    await submitActivities();
  }

  /**
   * Process payroll run (finalize and submit)
   * 
   * @param workspaceId - Workspace ID
   * @param payrollRunId - CoAIleague payroll run ID
   * @param userId - User performing operation
   */
  async processPayroll(
    workspaceId: string,
    payrollRunId: string,
    userId: string
  ): Promise<void> {
    const connection = await this.getConnection(workspaceId);
    const accessToken = await this.getAccessToken(connection.id);

    // Get payroll mapping
    const [payrollMapping] = await db.select()
      .from(partnerDataMappings)
      .where(
        and(
          eq(partnerDataMappings.workspaceId, workspaceId),
          eq(partnerDataMappings.partnerType, 'gusto'),
          eq(partnerDataMappings.entityType, 'payroll_run'),
          eq(partnerDataMappings.coaileagueEntityId, payrollRunId)
        )
      )
      .limit(1);

    if (!payrollMapping) {
      throw new Error('Payroll not synced to Gusto');
    }

    // Submit payroll for processing
    const processGustoPayroll = withUsageTracking(
      async (requestId: string) => {
        await this.makeRequest(
          'PUT',
          `/payrolls/${payrollMapping.partnerEntityId}/calculate`,
          accessToken,
          {},
          requestId
        );

        // Then submit
        await this.makeRequest(
          'PUT',
          `/payrolls/${payrollMapping.partnerEntityId}/submit`,
          accessToken,
          {},
          requestId
        );

        return { success: true };
      },
      {
        workspaceId,
        userId,
        partnerType: 'gusto',
        partnerConnectionId: connection.id,
        operationType: 'process_payroll',
        featureKey: 'payroll_processing',
        metadata: {
          payrollRunId,
        },
      }
    );

    await processGustoPayroll();

    // Update mapping status
    await db.update(partnerDataMappings)
      .set({
        syncStatus: 'synced',
        lastSyncAt: new Date(),
      })
      .where(eq(partnerDataMappings.id, payrollMapping.id));
  }
}

export const gustoService = new GustoService();
