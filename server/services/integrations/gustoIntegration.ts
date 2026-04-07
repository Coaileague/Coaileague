/**
 * Gusto OAuth Integration Service
 * 
 * This is a stub implementation for Gusto Payroll integration.
 * To enable full functionality:
 * 1. Register a developer account at https://dev.gusto.com/
 * 2. Create an application and obtain API credentials
 * 3. Set environment variables: GUSTO_CLIENT_ID, GUSTO_CLIENT_SECRET
 * 
 * Gap #P1: Gusto OAuth integration requires manual API key setup
 * as there is no Replit integration available for Gusto.
 */

import { db } from '../../db';
import { eq, and } from 'drizzle-orm';
import { payrollRuns, payrollEntries } from '@shared/schema';
import { getAppBaseUrl } from '../../utils/getAppBaseUrl';
import { createLogger } from '../../lib/logger';
const log = createLogger('gustoIntegration');


const GUSTO_SANDBOX_URL = 'https://api.gusto-demo.com';
const GUSTO_PRODUCTION_URL = 'https://api.gusto.com';
const GUSTO_AUTH_URL = 'https://api.gusto.com/oauth/authorize';
const GUSTO_TOKEN_URL = 'https://api.gusto.com/oauth/token';

export interface GustoConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: 'sandbox' | 'production';
}

export interface GustoCredentials {
  workspaceId: string;
  accessToken: string;
  refreshToken: string;
  companyId: string;
  expiresAt: Date;
}

export interface GustoEmployee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  department?: string;
  jobTitle?: string;
  payRate: number;
  payRateUnit: 'Hour' | 'Year';
}

export interface GustoPayroll {
  id: string;
  payPeriodStartDate: string;
  payPeriodEndDate: string;
  checkDate: string;
  processed: boolean;
  employees: Array<{
    employeeId: string;
    grossPay: number;
    netPay: number;
    taxes: number;
    deductions: number;
  }>;
}

export class GustoIntegration {
  private config: GustoConfig | null = null;
  
  constructor() {
    this.loadConfig();
  }
  
  private loadConfig(): void {
    const clientId = process.env.GUSTO_CLIENT_ID;
    const clientSecret = process.env.GUSTO_CLIENT_SECRET;
    const redirectUri = process.env.GUSTO_REDIRECT_URI || `${process.env.REPLIT_DEPLOYMENT_URL || getAppBaseUrl()}/api/integrations/gusto/callback`;
    const environment = (process.env.GUSTO_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';
    
    if (clientId && clientSecret) {
      this.config = { clientId, clientSecret, redirectUri, environment };
      log.info('[Gusto] Configuration loaded successfully');
    } else {
      log.info('[Gusto] Missing credentials - integration not configured');
    }
  }
  
  isConfigured(): boolean {
    return this.config !== null;
  }
  
  getAuthorizationUrl(state: string): string {
    if (!this.config) {
      throw new Error('Gusto integration not configured. Set GUSTO_CLIENT_ID and GUSTO_CLIENT_SECRET.');
    }
    
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      state,
    });
    
    return `${GUSTO_AUTH_URL}?${params.toString()}`;
  }
  
  async exchangeCodeForTokens(code: string): Promise<GustoCredentials | null> {
    if (!this.config) {
      throw new Error('Gusto integration not configured');
    }
    
    try {
      const response = await fetch(GUSTO_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code,
          redirect_uri: this.config.redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        log.error('[Gusto] Token exchange failed:', error);
        return null;
      }
      
      const tokens = await response.json();
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
      
      const companies = await this.getCompanies(tokens.access_token);
      const companyId = companies.length > 0 ? companies[0].id : '';
      
      return {
        workspaceId: '', // Intentionally empty — caller sets workspaceId when storing the connection
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        companyId,
        expiresAt,
      };
    } catch (error) {
      log.error('[Gusto] Error exchanging code for tokens:', error);
      return null;
    }
  }
  
  async refreshAccessToken(credentials: GustoCredentials): Promise<GustoCredentials | null> {
    if (!this.config) {
      throw new Error('Gusto integration not configured');
    }
    
    try {
      const response = await fetch(GUSTO_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: credentials.refreshToken,
          grant_type: 'refresh_token',
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        log.error('[Gusto] Token refresh failed:', error);
        return null;
      }
      
      const tokens = await response.json();
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
      
      return {
        ...credentials,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || credentials.refreshToken,
        expiresAt,
      };
    } catch (error) {
      log.error('[Gusto] Error refreshing token:', error);
      return null;
    }
  }
  
  private getBaseUrl(): string {
    return this.config?.environment === 'production' 
      ? GUSTO_PRODUCTION_URL 
      : GUSTO_SANDBOX_URL;
  }
  
  async getCompanies(accessToken: string): Promise<Array<{ id: string; name: string }>> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/v1/me`, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      
      if (!response.ok) {
        return [];
      }
      
      const data = await response.json();
      return (data.roles || [])
        .filter((role: any) => role.type === 'Company')
        .map((role: any) => ({
          id: role.company.uuid,
          name: role.company.name,
        }));
    } catch (error) {
      log.error('[Gusto] Error getting companies:', error);
      return [];
    }
  }
  
  async getEmployees(credentials: GustoCredentials): Promise<GustoEmployee[]> {
    try {
      const response = await fetch(
        `${this.getBaseUrl()}/v1/companies/${credentials.companyId}/employees`,
        {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${credentials.accessToken}`,
          },
        }
      );
      
      if (!response.ok) {
        log.error('[Gusto] Failed to get employees');
        return [];
      }
      
      const employees = await response.json();
      return employees.map((emp: any) => ({
        id: emp.uuid,
        firstName: emp.first_name,
        lastName: emp.last_name,
        email: emp.email,
        department: emp.department?.title,
        jobTitle: emp.jobs?.[0]?.title,
        payRate: emp.jobs?.[0]?.rate || 0,
        payRateUnit: emp.jobs?.[0]?.payment_unit === 'Hour' ? 'Hour' : 'Year',
      }));
    } catch (error) {
      log.error('[Gusto] Error getting employees:', error);
      return [];
    }
  }
  
  async getPayrolls(credentials: GustoCredentials, startDate?: Date, endDate?: Date): Promise<GustoPayroll[]> {
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('start_date', startDate.toISOString().split('T')[0]);
      if (endDate) params.set('end_date', endDate.toISOString().split('T')[0]);
      
      const url = `${this.getBaseUrl()}/v1/companies/${credentials.companyId}/payrolls?${params.toString()}`;
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${credentials.accessToken}`,
        },
      });
      
      if (!response.ok) {
        log.error('[Gusto] Failed to get payrolls');
        return [];
      }
      
      const payrolls = await response.json();
      return payrolls.map((payroll: any) => ({
        id: payroll.uuid,
        payPeriodStartDate: payroll.pay_period.start_date,
        payPeriodEndDate: payroll.pay_period.end_date,
        checkDate: payroll.check_date,
        processed: payroll.processed,
        employees: (payroll.employee_compensations || []).map((comp: any) => ({
          employeeId: comp.employee_uuid,
          grossPay: parseFloat(comp.gross_pay || '0'),
          netPay: parseFloat(comp.net_pay || '0'),
          taxes: parseFloat(comp.taxes?.employee || '0'),
          deductions: parseFloat(comp.deductions?.employee || '0'),
        })),
      }));
    } catch (error) {
      log.error('[Gusto] Error getting payrolls:', error);
      return [];
    }
  }
  
  async syncEmployeesToGusto(
    credentials: GustoCredentials,
    employees: Array<{
      firstName: string;
      lastName: string;
      email: string;
      dateOfBirth: string;
      ssn: string;
    }>
  ): Promise<{ success: boolean; synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;
    
    for (const employee of employees) {
      try {
        const response = await fetch(
          `${this.getBaseUrl()}/v1/companies/${credentials.companyId}/employees`,
          {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${credentials.accessToken}`,
            },
            body: JSON.stringify({
              first_name: employee.firstName,
              last_name: employee.lastName,
              email: employee.email,
              date_of_birth: employee.dateOfBirth,
              ssn: employee.ssn,
            }),
          }
        );
        
        if (response.ok) {
          synced++;
          log.info(`[Gusto] Synced employee ${employee.email}`);
        } else {
          const error = await response.text();
          errors.push(`${employee.email}: ${error}`);
        }
      } catch (error) {
        errors.push(`${employee.email}: ${error}`);
      }
    }
    
    return { success: errors.length === 0, synced, errors };
  }
  
  async importPayrollToCoAIleague(
    credentials: GustoCredentials,
    payrollId: string,
    workspaceId: string
  ): Promise<{ success: boolean; imported: number; errors: string[]; payrollRunId?: string }> {
    const payrolls = await this.getPayrolls(credentials);
    const payroll = payrolls.find(p => p.id === payrollId);

    if (!payroll) {
      return { success: false, imported: 0, errors: ['Payroll not found'] };
    }

    let imported = 0;
    const errors: string[] = [];

    const periodStart = new Date(payroll.payPeriodStartDate);
    const periodEnd = new Date(payroll.payPeriodEndDate);
    const totalGross = payroll.employees.reduce((s, e) => s + e.grossPay, 0);
    const totalNet = payroll.employees.reduce((s, e) => s + e.netPay, 0);

    const [existingRun] = await db
      .select({ id: payrollRuns.id })
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.workspaceId, workspaceId),
        eq(payrollRuns.periodStart, periodStart),
        eq(payrollRuns.periodEnd, periodEnd),
      ))
      .limit(1)
      .catch(() => []);

    let runId: string;
    if (existingRun) {
      runId = existingRun.id;
    } else {
      const [newRun] = await db
        .insert(payrollRuns)
        .values({
          workspaceId,
          periodStart,
          periodEnd,
          status: 'processed',
          totalGrossPay: totalGross.toFixed(2),
          totalNetPay: totalNet.toFixed(2),
          notes: `Imported from Gusto payroll ${payrollId}`,
        } as any)
        .returning({ id: payrollRuns.id });
      runId = newRun.id;
    }

    for (const emp of payroll.employees) {
      try {
        const regularHours = emp.grossPay > 0
          ? (emp.grossPay / Math.max(1, emp.grossPay / 40)).toFixed(2)
          : '40.00';
        const hourlyRate = emp.grossPay > 0
          ? (emp.grossPay / parseFloat(regularHours)).toFixed(2)
          : '0.00';

        await db
          .insert(payrollEntries)
          .values({
            payrollRunId: runId,
            employeeId: emp.employeeId,
            workspaceId,
            regularHours,
            overtimeHours: '0.00',
            hourlyRate,
            grossPay: emp.grossPay.toFixed(2),
            federalTax: (emp.taxes * 0.6).toFixed(2),
            stateTax: (emp.taxes * 0.2).toFixed(2),
            socialSecurity: (emp.taxes * 0.124).toFixed(2),
            medicare: (emp.taxes * 0.029).toFixed(2),
            netPay: emp.netPay.toFixed(2),
            workerType: 'employee',
            disbursementMethod: 'gusto',
            paidPeriodStart: periodStart,
            paidPeriodEnd: periodEnd,
            notes: `Gusto import: payroll ${payrollId}`,
          } as any)
          .onConflictDoNothing();
        imported++;
      } catch (error) {
        errors.push(`Employee ${emp.employeeId}: ${error}`);
      }
    }

    return { success: errors.length === 0, imported, errors, payrollRunId: runId };
  }
}

export const gustoIntegration = new GustoIntegration();
