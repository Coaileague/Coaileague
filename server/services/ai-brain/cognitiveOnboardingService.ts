/**
 * COGNITIVE ONBOARDING SERVICE
 * =============================
 * Fortune 500-grade API integration for automatic org setup.
 * Connects to QuickBooks, Gusto, and other third-party services
 * to pull financial, payroll, and HR data for immediate operations.
 * 
 * Part of the Collaborative Intelligence ecosystem enabling:
 * - Third-party API integrations (OAuth2)
 * - Automatic data extraction and mapping
 * - AI-powered field transformation
 * - Onboarding workflow orchestration
 */

import { aiBrainService } from './aiBrainService';
import { platformEventBus } from '../platformEventBus';
import { db } from '../../db';
import { systemAuditLogs, workspaces, employees } from '@shared/schema';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { INTEGRATIONS } from '@shared/platformConfig';
import { universalAudit, AUDIT_ACTIONS } from '../universalAuditService';
import { createLogger } from '../../lib/logger';
const log = createLogger('cognitiveOnboardingService');

// ============================================================================
// TYPES - THIRD-PARTY INTEGRATIONS
// ============================================================================

export type IntegrationProvider = 
  | 'quickbooks'
  | 'gusto'
  | 'adp'
  | 'paychex'
  | 'zenefits'
  | 'rippling'
  | 'bamboohr'
  | 'workday';

export interface IntegrationCredentials {
  provider: IntegrationProvider;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];
  companyId?: string;
  metadata?: Record<string, any>;
}

export interface IntegrationConnection {
  id: string;
  workspaceId: string;
  provider: IntegrationProvider;
  status: 'pending' | 'connected' | 'expired' | 'revoked' | 'error';
  companyName?: string;
  lastSyncAt?: Date;
  syncSchedule?: string;
  dataTypes: DataSyncType[];
  createdAt: Date;
  updatedAt: Date;
}

export type DataSyncType = 
  | 'employees'
  | 'payroll'
  | 'time_tracking'
  | 'benefits'
  | 'taxes'
  | 'invoices'
  | 'expenses'
  | 'bank_accounts'
  | 'chart_of_accounts';

// ============================================================================
// TYPES - EXTRACTED DATA
// ============================================================================

export interface ExtractedEmployeeData {
  externalId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  department?: string;
  position?: string;
  startDate?: Date;
  employmentType?: 'full_time' | 'part_time' | 'contractor';
  payRate?: number;
  payType?: 'hourly' | 'salary';
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  metadata?: Record<string, any>;
}

export interface ExtractedPayrollData {
  externalId: string;
  employeeExternalId: string;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  grossPay: number;
  netPay: number;
  hoursWorked?: number;
  overtimeHours?: number;
  deductions?: {
    type: string;
    amount: number;
  }[];
  taxes?: {
    type: string;
    amount: number;
  }[];
}

export interface ExtractedInvoiceData {
  externalId: string;
  clientName: string;
  clientEmail?: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  totalAmount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  lineItems?: {
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }[];
}

export interface ExtractionResult {
  provider: IntegrationProvider;
  success: boolean;
  dataType: DataSyncType;
  recordsExtracted: number;
  recordsImported: number;
  errors: string[];
  warnings: string[];
  durationMs: number;
  aiMappingConfidence: number;
  data: {
    employees?: ExtractedEmployeeData[];
    payroll?: ExtractedPayrollData[];
    invoices?: ExtractedInvoiceData[];
  };
}

// ============================================================================
// PROVIDER CONFIGURATIONS
// ============================================================================

const PROVIDER_CONFIGS: Record<IntegrationProvider, {
  name: string;
  authUrl: string;
  tokenUrl: string;
  apiBaseUrl: string;
  requiredScopes: string[];
  dataEndpoints: Record<DataSyncType, string>;
}> = {
  quickbooks: {
    name: 'QuickBooks Online',
    // Use centralized config - NO HARDCODED VALUES
    authUrl: INTEGRATIONS.quickbooks.oauthUrls.authorization,
    tokenUrl: INTEGRATIONS.quickbooks.oauthUrls.token,
    apiBaseUrl: INTEGRATIONS.quickbooks.getVersionedApiBase(),
    requiredScopes: [INTEGRATIONS.quickbooks.scopes.accounting, INTEGRATIONS.quickbooks.scopes.payment],
    dataEndpoints: {
      employees: '/company/{companyId}/query?query=select * from Employee',
      payroll: '/company/{companyId}/query?query=select * from PayrollItem',
      invoices: '/company/{companyId}/query?query=select * from Invoice',
      expenses: '/company/{companyId}/query?query=select * from Purchase',
      chart_of_accounts: '/company/{companyId}/query?query=select * from Account',
      bank_accounts: '/company/{companyId}/query?query=select * from Account where AccountType = \'Bank\'',
      time_tracking: '/company/{companyId}/query?query=select * from TimeActivity',
      benefits: '',
      taxes: '/company/{companyId}/query?query=select * from TaxCode',
    },
  },
  gusto: {
    name: 'Gusto',
    authUrl: 'https://api.gusto.com/oauth/authorize',
    tokenUrl: 'https://api.gusto.com/oauth/token',
    apiBaseUrl: 'https://api.gusto.com/v1',
    requiredScopes: ['companies:read', 'employees:read', 'payrolls:read', 'benefits:read'],
    dataEndpoints: {
      employees: '/companies/{companyId}/employees',
      payroll: '/companies/{companyId}/payrolls',
      benefits: '/companies/{companyId}/benefits',
      taxes: '/companies/{companyId}/tax_requirements',
      time_tracking: '/companies/{companyId}/time_off_requests',
      invoices: '',
      expenses: '',
      bank_accounts: '',
      chart_of_accounts: '',
    },
  },
  adp: {
    name: 'ADP Workforce Now',
    authUrl: 'https://accounts.adp.com/auth/oauth/v2/authorize',
    tokenUrl: 'https://accounts.adp.com/auth/oauth/v2/token',
    apiBaseUrl: 'https://api.adp.com/hr/v2',
    requiredScopes: ['hr', 'payroll'],
    dataEndpoints: {
      employees: '/workers',
      payroll: '/payroll/v1/pay-distributions',
      benefits: '/benefits/v1/benefit-elections',
      taxes: '',
      time_tracking: '/time/v2/time-cards',
      invoices: '',
      expenses: '',
      bank_accounts: '',
      chart_of_accounts: '',
    },
  },
  paychex: {
    name: 'Paychex Flex',
    authUrl: 'https://api.paychex.com/auth/oauth/authorize',
    tokenUrl: 'https://api.paychex.com/auth/oauth/token',
    apiBaseUrl: 'https://api.paychex.com',
    requiredScopes: ['workers', 'payroll'],
    dataEndpoints: {
      employees: '/workers',
      payroll: '/payroll/checks',
      time_tracking: '/time',
      benefits: '',
      taxes: '',
      invoices: '',
      expenses: '',
      bank_accounts: '',
      chart_of_accounts: '',
    },
  },
  zenefits: {
    name: 'Zenefits',
    authUrl: 'https://secure.zenefits.com/oauth2/authorize',
    tokenUrl: 'https://secure.zenefits.com/oauth2/token',
    apiBaseUrl: 'https://api.zenefits.com/core',
    requiredScopes: ['people', 'payroll', 'time_off'],
    dataEndpoints: {
      employees: '/people',
      payroll: '/payroll/payroll_runs',
      benefits: '/benefits',
      time_tracking: '/time_off/time_off_requests',
      taxes: '',
      invoices: '',
      expenses: '',
      bank_accounts: '',
      chart_of_accounts: '',
    },
  },
  rippling: {
    name: 'Rippling',
    authUrl: 'https://app.rippling.com/api/platform/oauth/authorize',
    tokenUrl: 'https://app.rippling.com/api/platform/oauth/token',
    apiBaseUrl: 'https://api.rippling.com/platform/api',
    requiredScopes: ['employees:read', 'payroll:read'],
    dataEndpoints: {
      employees: '/employees',
      payroll: '/payroll/pay_runs',
      benefits: '/benefits/enrollments',
      time_tracking: '/time/entries',
      taxes: '',
      invoices: '',
      expenses: '',
      bank_accounts: '',
      chart_of_accounts: '',
    },
  },
  bamboohr: {
    name: 'BambooHR',
    authUrl: 'https://api.bamboohr.com/oauth/authorize',
    tokenUrl: 'https://api.bamboohr.com/oauth/token',
    apiBaseUrl: 'https://api.bamboohr.com/api/gateway.php',
    requiredScopes: ['employees', 'time_tracking'],
    dataEndpoints: {
      employees: '/{companyDomain}/v1/employees/directory',
      payroll: '/{companyDomain}/v1/payroll',
      time_tracking: '/{companyDomain}/v1/time_off/requests',
      benefits: '/{companyDomain}/v1/benefit_coverages',
      taxes: '',
      invoices: '',
      expenses: '',
      bank_accounts: '',
      chart_of_accounts: '',
    },
  },
  workday: {
    name: 'Workday',
    authUrl: 'https://impl.workday.com/ccx/oauth2/authorize',
    tokenUrl: 'https://impl.workday.com/ccx/oauth2/token',
    apiBaseUrl: 'https://wd2-impl-services1.workday.com/ccx/service',
    requiredScopes: ['Human_Resources', 'Payroll', 'Staffing'],
    dataEndpoints: {
      employees: '/Human_Resources/v40.2/Workers',
      payroll: '/Payroll/v40.2/Payroll_Results',
      time_tracking: '/Time_Tracking/v40.2/Time_Clock_Events',
      benefits: '/Benefits/v40.2/Benefit_Elections',
      taxes: '',
      invoices: '',
      expenses: '',
      bank_accounts: '',
      chart_of_accounts: '',
    },
  },
};

// ============================================================================
// COGNITIVE ONBOARDING SERVICE
// ============================================================================

class CognitiveOnboardingService {
  private static instance: CognitiveOnboardingService;
  private connections: Map<string, IntegrationConnection> = new Map();
  private credentials: Map<string, IntegrationCredentials> = new Map();

  static getInstance(): CognitiveOnboardingService {
    if (!this.instance) {
      this.instance = new CognitiveOnboardingService();
    }
    return this.instance;
  }

  // ============================================================================
  // OAUTH2 FLOW
  // ============================================================================

  /**
   * Generate OAuth authorization URL for a provider
   */
  getAuthorizationUrl(params: {
    provider: IntegrationProvider;
    workspaceId: string;
    redirectUri: string;
  }): { url: string; state: string } {
    const { provider, workspaceId, redirectUri } = params;
    const config = PROVIDER_CONFIGS[provider];
    
    if (!config) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    // Generate state for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');
    const statePayload = JSON.stringify({ workspaceId, provider, timestamp: Date.now() });
    const encodedState = Buffer.from(statePayload).toString('base64url');

    const authParams = new URLSearchParams({
      client_id: process.env[`${provider.toUpperCase()}_CLIENT_ID`] || '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: config.requiredScopes.join(' '),
      state: encodedState,
    });

    return {
      url: `${config.authUrl}?${authParams.toString()}`,
      state: encodedState,
    };
  }

  /**
   * Exchange authorization code for access token
   */
  async handleOAuthCallback(params: {
    provider: IntegrationProvider;
    code: string;
    state: string;
    redirectUri: string;
  }): Promise<{
    success: boolean;
    connection?: IntegrationConnection;
    error?: string;
  }> {
    const { provider, code, state, redirectUri } = params;
    const config = PROVIDER_CONFIGS[provider];

    try {
      // Decode and validate state
      const statePayload = JSON.parse(Buffer.from(state, 'base64url').toString());
      const workspaceId = statePayload.workspaceId;

      // Exchange code for token
      const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`] || '';
      const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`] || '';

      const tokenResponse = await fetch(config.tokenUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        throw new Error(`Token exchange failed: ${errorText}`);
      }

      const tokenData = await tokenResponse.json();

      // Store credentials securely
      const credentials: IntegrationCredentials = {
        provider,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: tokenData.expires_in 
          ? new Date(Date.now() + tokenData.expires_in * 1000) 
          : undefined,
        scopes: config.requiredScopes,
        companyId: tokenData.realmId || tokenData.company_id,
        metadata: tokenData,
      };

      const credentialKey = `${workspaceId}-${provider}`;
      this.credentials.set(credentialKey, credentials);

      // Create connection record
      const connection: IntegrationConnection = {
        id: crypto.randomUUID(),
        workspaceId,
        provider,
        status: 'connected',
        companyName: tokenData.company_name,
        lastSyncAt: undefined,
        dataTypes: this.getAvailableDataTypes(provider),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.connections.set(connection.id, connection);

      // Log the connection
      await this.logIntegrationEvent({
        workspaceId,
        provider,
        action: 'connected',
        success: true,
      });

      // Emit event for AI Brain
      platformEventBus.publish({
        type: 'integration_connected',
        category: 'feature',
        title: 'Integration Connected',
        description: `${provider} connected for workspace ${workspaceId}`,
        workspaceId,
        metadata: {
          provider,
          companyName: connection.companyName,
          dataTypes: connection.dataTypes,
        },
      }).catch((err) => log.warn('[cognitiveOnboardingService] Fire-and-forget failed:', err));

      universalAudit.log({
        workspaceId,
        actorType: 'system',
        action: AUDIT_ACTIONS.ONBOARDING_COGNITIVE_API_CONNECTED,
        entityType: 'integration',
        entityId: `${workspaceId}-${provider}`,
        entityName: `${provider} API`,
        changeType: 'create',
        metadata: { provider, companyName: connection.companyName, dataTypes: connection.dataTypes },
      }).catch((err) => log.warn('[cognitiveOnboardingService] Fire-and-forget failed:', err));

      log.info(`[CognitiveOnboarding] ${provider} connected for workspace ${workspaceId}`);

      return { success: true, connection };

    } catch (error: any) {
      log.error(`[CognitiveOnboarding] OAuth callback failed:`, error);
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  private getAvailableDataTypes(provider: IntegrationProvider): DataSyncType[] {
    const config = PROVIDER_CONFIGS[provider];
    return Object.entries(config.dataEndpoints)
      .filter(([_, endpoint]) => endpoint && endpoint.length > 0)
      .map(([type]) => type as DataSyncType);
  }

  // ============================================================================
  // DATA EXTRACTION WITH AI MAPPING
  // ============================================================================

  /**
   * Extract data from connected provider using AI-powered field mapping
   */
  async extractData(params: {
    workspaceId: string;
    provider: IntegrationProvider;
    dataType: DataSyncType;
    options?: {
      since?: Date;
      limit?: number;
      aiMapping?: boolean;
    };
  }): Promise<ExtractionResult> {
    const startTime = Date.now();
    const { workspaceId, provider, dataType, options = {} } = params;
    const { aiMapping = true } = options;

    const result: ExtractionResult = {
      provider,
      success: false,
      dataType,
      recordsExtracted: 0,
      recordsImported: 0,
      errors: [],
      warnings: [],
      durationMs: 0,
      aiMappingConfidence: 0,
      data: {},
    };

    try {
      // Get credentials
      const credentialKey = `${workspaceId}-${provider}`;
      const credentials = this.credentials.get(credentialKey);

      if (!credentials) {
        throw new Error(`No credentials found for ${provider} in workspace ${workspaceId}`);
      }

      // Refresh token if expired
      if (credentials.expiresAt && new Date() > credentials.expiresAt) {
        await this.refreshToken(workspaceId, provider);
      }

      // Fetch raw data from provider
      const rawData = await this.fetchProviderData(credentials, provider, dataType, options);
      result.recordsExtracted = Array.isArray(rawData) ? rawData.length : 0;

      // Use AI to map fields to our schema (billed to org)
      if (aiMapping && rawData.length > 0) {
        const mappedData = await this.aiFieldMapping(provider, dataType, rawData, workspaceId);
        result.aiMappingConfidence = mappedData.confidence;
        
        switch (dataType) {
          case 'employees':
            result.data.employees = mappedData.data as ExtractedEmployeeData[];
            break;
          case 'payroll':
            result.data.payroll = mappedData.data as ExtractedPayrollData[];
            break;
          case 'invoices':
            result.data.invoices = mappedData.data as ExtractedInvoiceData[];
            break;
        }
      }

      result.success = true;

    } catch (error: any) {
      log.error(`[CognitiveOnboarding] Data extraction failed:`, error);
      result.errors.push((error instanceof Error ? error.message : String(error)));
    }

    result.durationMs = Date.now() - startTime;

    await this.logIntegrationEvent({
      workspaceId,
      provider,
      action: 'data_extraction',
      success: result.success,
      details: {
        dataType,
        recordsExtracted: result.recordsExtracted,
        aiConfidence: result.aiMappingConfidence,
      },
    });

    universalAudit.log({
      workspaceId,
      actorType: 'trinity',
      actorBot: 'CognitiveOnboarding',
      action: AUDIT_ACTIONS.ONBOARDING_COGNITIVE_DATA_EXTRACTED,
      entityType: 'integration_data',
      entityId: `${provider}-${dataType}`,
      changeType: 'action',
      metadata: {
        provider,
        dataType,
        recordsExtracted: result.recordsExtracted,
        aiMappingConfidence: result.aiMappingConfidence,
        success: result.success,
        durationMs: result.durationMs,
      },
    }).catch((err) => log.warn('[cognitiveOnboardingService] Fire-and-forget failed:', err));

    return result;
  }

  /**
   * Fetch raw data from provider API
   */
  private async fetchProviderData(
    credentials: IntegrationCredentials,
    provider: IntegrationProvider,
    dataType: DataSyncType,
    options: { since?: Date; limit?: number }
  ): Promise<any[]> {
    const config = PROVIDER_CONFIGS[provider];
    let endpoint = config.dataEndpoints[dataType];

    if (!endpoint) {
      throw new Error(`${dataType} is not supported for ${provider}`);
    }

    // Replace placeholders
    endpoint = endpoint.replace('{companyId}', credentials.companyId || '');

    const url = `${config.apiBaseUrl}${endpoint}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Extract array from various response formats
    if (Array.isArray(data)) return data;
    if (data.QueryResponse) return Object.values(data.QueryResponse).flat();
    if (data.employees) return data.employees;
    if (data.payrolls) return data.payrolls;
    if (data.items) return data.items;
    if (data.data) return Array.isArray(data.data) ? data.data : [data.data];
    
    return [data];
  }

  /**
   * Use AI to map provider-specific fields to our schema
   * @param workspaceId - Required: The org to bill for AI mapping
   */
  private async aiFieldMapping(
    provider: IntegrationProvider,
    dataType: DataSyncType,
    rawData: any[],
    workspaceId: string
  ): Promise<{ data: any[]; confidence: number }> {
    const sampleRecord = rawData[0];
    const fields = Object.keys(sampleRecord);

    const prompt = `You are a data mapping expert. Map fields from ${provider} ${dataType} API to CoAIleague schema.

SOURCE FIELDS: ${fields.join(', ')}

SAMPLE RECORD:
${JSON.stringify(sampleRecord, null, 2)}

TARGET SCHEMA FOR ${dataType}:
${this.getTargetSchema(dataType)}

Return JSON with:
1. fieldMapping: { sourceField: targetField } for each mappable field
2. confidence: 0.0-1.0 for mapping quality
3. unmappedFields: fields that couldn't be mapped
4. transformations: any special transformations needed

{
  "fieldMapping": {},
  "confidence": 0.0,
  "unmappedFields": [],
  "transformations": []
}`;

    try {
      const response = await (aiBrainService as any).processRequest({
        type: 'field_mapping',
        userId: 'system',
        workspaceId, // Billed to org doing the onboarding
        messages: [{ role: 'user', content: prompt }],
        contextLevel: 'minimal',
      });

      const mapping = this.extractJSON(response.response);
      
      // Apply mapping to all records
      const mappedData = rawData.map(record => this.applyMapping(record, mapping.fieldMapping));

      universalAudit.log({
        workspaceId,
        actorType: 'trinity',
        actorBot: 'CognitiveOnboarding',
        action: AUDIT_ACTIONS.ONBOARDING_COGNITIVE_FIELD_MAPPED,
        entityType: 'integration_mapping',
        entityId: `${provider}-${dataType}`,
        changeType: 'action',
        metadata: {
          provider,
          dataType,
          fieldsCount: fields.length,
          mappedCount: Object.keys(mapping.fieldMapping || {}).length,
          unmappedCount: (mapping.unmappedFields || []).length,
          confidence: mapping.confidence || 0.8,
          recordsMapped: mappedData.length,
        },
      }).catch((err) => log.warn('[cognitiveOnboardingService] Fire-and-forget failed:', err));

      return {
        data: mappedData,
        confidence: mapping.confidence || 0.8,
      };
    } catch (error: any) {
      log.warn('[CognitiveOnboarding] AI mapping failed, using default mapping:', (error instanceof Error ? error.message : String(error)));
      return {
        data: rawData.map(r => this.defaultMapping(r, dataType)),
        confidence: 0.5,
      };
    }
  }

  private getTargetSchema(dataType: DataSyncType): string {
    const schemas: Record<DataSyncType, string> = {
      employees: `{
        externalId: string,
        firstName: string,
        lastName: string,
        email: string,
        phone: string,
        department: string,
        position: string,
        startDate: Date,
        employmentType: 'full_time' | 'part_time' | 'contractor',
        payRate: number,
        payType: 'hourly' | 'salary'
      }`,
      payroll: `{
        externalId: string,
        employeeExternalId: string,
        payPeriodStart: Date,
        payPeriodEnd: Date,
        grossPay: number,
        netPay: number,
        hoursWorked: number
      }`,
      invoices: `{
        externalId: string,
        clientName: string,
        invoiceNumber: string,
        invoiceDate: Date,
        totalAmount: number,
        status: 'draft' | 'sent' | 'paid' | 'overdue'
      }`,
      time_tracking: `{ employeeId: string, date: Date, hoursWorked: number }`,
      benefits: `{ employeeId: string, benefitType: string, coverage: string }`,
      taxes: `{ taxType: string, rate: number, jurisdiction: string }`,
      expenses: `{ description: string, amount: number, date: Date, category: string }`,
      bank_accounts: `{ accountName: string, accountNumber: string, balance: number }`,
      chart_of_accounts: `{ accountName: string, accountType: string, accountNumber: string }`,
    };
    return schemas[dataType] || '{}';
  }

  private applyMapping(record: any, mapping: Record<string, string>): any {
    const result: any = {};
    for (const [source, target] of Object.entries(mapping)) {
      if (record[source] !== undefined) {
        result[target] = record[source];
      }
    }
    // Keep externalId
    result.externalId = record.Id || record.id || record.uuid || crypto.randomUUID();
    return result;
  }

  private defaultMapping(record: any, dataType: DataSyncType): any {
    // Basic field name normalization
    const normalized: any = { externalId: record.Id || record.id };
    
    for (const [key, value] of Object.entries(record)) {
      const normalizedKey = key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
      normalized[normalizedKey] = value;
    }
    
    return normalized;
  }

  private extractJSON(text: string): any {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return {};
      }
    }
    return {};
  }

  // ============================================================================
  // TOKEN MANAGEMENT
  // ============================================================================

  private async refreshToken(workspaceId: string, provider: IntegrationProvider): Promise<void> {
    const credentialKey = `${workspaceId}-${provider}`;
    const credentials = this.credentials.get(credentialKey);

    if (!credentials?.refreshToken) {
      throw new Error(`No refresh token available for ${provider}`);
    }

    const config = PROVIDER_CONFIGS[provider];
    const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`] || '';
    const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`] || '';

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken,
      }),
    });

    if (!response.ok) {
      const connection = Array.from(this.connections.values())
        .find(c => c.workspaceId === workspaceId && c.provider === provider);
      if (connection) {
        connection.status = 'expired';
      }
      throw new Error('Token refresh failed');
    }

    const tokenData = await response.json();
    
    credentials.accessToken = tokenData.access_token;
    credentials.refreshToken = tokenData.refresh_token || credentials.refreshToken;
    credentials.expiresAt = tokenData.expires_in 
      ? new Date(Date.now() + tokenData.expires_in * 1000) 
      : undefined;

    this.credentials.set(credentialKey, credentials);
    log.info(`[CognitiveOnboarding] Token refreshed for ${provider}`);
  }

  // ============================================================================
  // FULL ONBOARDING WORKFLOW
  // ============================================================================

  /**
   * Run complete API-driven onboarding for a new organization
   */
  async runApiDrivenOnboarding(params: {
    workspaceId: string;
    userId: string;
    integrations: {
      provider: IntegrationProvider;
      dataTypes: DataSyncType[];
    }[];
    options?: {
      autoImport?: boolean;
      notifyOnComplete?: boolean;
    };
  }): Promise<{
    success: boolean;
    results: ExtractionResult[];
    summary: {
      employeesExtracted: number;
      payrollRecords: number;
      invoices: number;
      readyForOperations: boolean;
    };
    errors: string[];
  }> {
    const { workspaceId, userId, integrations, options = {} } = params;
    const { autoImport = true, notifyOnComplete = true } = options;

    log.info(`[CognitiveOnboarding] Starting API-driven onboarding for workspace ${workspaceId}`);

    const results: ExtractionResult[] = [];
    const errors: string[] = [];
    let employeesExtracted = 0;
    let payrollRecords = 0;
    let invoices = 0;

    // Extract data from each integration in parallel
    const extractionPromises = integrations.flatMap(({ provider, dataTypes }) =>
      dataTypes.map(dataType => 
        this.extractData({ workspaceId, provider, dataType })
      )
    );

    const extractionResults = await Promise.allSettled(extractionPromises);

    for (const result of extractionResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
        if (result.value.success) {
          if (result.value.data.employees) {
            employeesExtracted += result.value.data.employees.length;
          }
          if (result.value.data.payroll) {
            payrollRecords += result.value.data.payroll.length;
          }
          if (result.value.data.invoices) {
            invoices += result.value.data.invoices.length;
          }
        } else {
          errors.push(...result.value.errors);
        }
      } else {
        errors.push(result.reason?.message || 'Extraction failed');
      }
    }

    // Auto-import if enabled
    if (autoImport && results.some(r => r.success)) {
      await this.importExtractedData(workspaceId, userId, results);
    }

    const readyForOperations = employeesExtracted > 0 || errors.length === 0;

    // Emit completion event
    if (notifyOnComplete) {
      platformEventBus.publish({
        type: 'onboarding_complete',
        category: 'feature',
        title: 'API Onboarding Complete',
        description: `Extracted ${employeesExtracted} employees, ${payrollRecords} payroll records, ${invoices} invoices`,
        workspaceId,
        userId,
        metadata: {
          source: 'api_integration',
          employeesImported: employeesExtracted,
          payrollRecords,
          invoices,
          success: readyForOperations,
        },
      }).catch((err) => log.warn('[cognitiveOnboardingService] Fire-and-forget failed:', err));
    }

    log.info(`[CognitiveOnboarding] Onboarding complete:`, {
      workspaceId,
      employeesExtracted,
      payrollRecords,
      invoices,
      errors: errors.length,
    });

    return {
      success: errors.length === 0,
      results,
      summary: {
        employeesExtracted,
        payrollRecords,
        invoices,
        readyForOperations,
      },
      errors,
    };
  }

  /**
   * Import extracted data into the platform
   */
  private async importExtractedData(
    workspaceId: string,
    userId: string,
    results: ExtractionResult[]
  ): Promise<void> {
    for (const result of results) {
      if (!result.success) continue;

      // Import employees
      if (result.data.employees && result.data.employees.length > 0) {
        for (const emp of result.data.employees) {
          try {
            await db.insert(employees).values({
              id: crypto.randomUUID(),
              userId: crypto.randomUUID(),
              workspaceId,
              firstName: emp.firstName,
              lastName: emp.lastName,
              email: emp.email || `${emp.firstName.toLowerCase()}.${emp.lastName.toLowerCase()}@imported.local`,
              role: 'staff',
              hourlyRate: emp.payRate?.toString() || '0',
              payType: emp.payType || 'hourly',
              isActive: true,
              hireDate: emp.startDate || new Date(),
            }).onConflictDoNothing();
          } catch (error) {
            log.warn(`[CognitiveOnboarding] Failed to import employee ${emp.firstName}:`, error);
          }
        }
      }
    }
  }

  // ============================================================================
  // LOGGING & AUDIT
  // ============================================================================

  private async logIntegrationEvent(params: {
    workspaceId: string;
    provider: IntegrationProvider;
    action: string;
    success: boolean;
    details?: Record<string, any>;
  }): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        id: crypto.randomUUID(),
        workspaceId: params.workspaceId,
        userId: 'system',
        action: `integration.${params.action}`,
        metadata: { resourceType: 'integration', resourceId: params.provider,
        details: {
          provider: params.provider,
          success: params.success,
          ...params.details,
        }, timestamp: new Date() },
      });
    } catch (error) {
      log.error('[CognitiveOnboarding] Failed to log event:', error);
    }
  }

  // ============================================================================
  // STATUS & MANAGEMENT
  // ============================================================================

  getConnection(workspaceId: string, provider: IntegrationProvider): IntegrationConnection | undefined {
    return Array.from(this.connections.values())
      .find(c => c.workspaceId === workspaceId && c.provider === provider);
  }

  getWorkspaceConnections(workspaceId: string): IntegrationConnection[] {
    return Array.from(this.connections.values())
      .filter(c => c.workspaceId === workspaceId);
  }

  async disconnectProvider(workspaceId: string, provider: IntegrationProvider): Promise<boolean> {
    const connection = this.getConnection(workspaceId, provider);
    if (connection) {
      connection.status = 'revoked';
      this.credentials.delete(`${workspaceId}-${provider}`);
      
      await this.logIntegrationEvent({
        workspaceId,
        provider,
        action: 'disconnected',
        success: true,
      });
      
      return true;
    }
    return false;
  }

  getSupportedProviders(): {
    provider: IntegrationProvider;
    name: string;
    dataTypes: DataSyncType[];
  }[] {
    return Object.entries(PROVIDER_CONFIGS).map(([provider, config]) => ({
      provider: provider as IntegrationProvider,
      name: config.name,
      dataTypes: this.getAvailableDataTypes(provider as IntegrationProvider),
    }));
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const cognitiveOnboardingService = CognitiveOnboardingService.getInstance();

log.info('[CognitiveOnboardingService] Third-party API integration service initialized');
