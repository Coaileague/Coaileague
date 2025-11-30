/**
 * QuickBooks OAuth Integration Service
 * 
 * This is a stub implementation for QuickBooks Online integration.
 * To enable full functionality:
 * 1. Register an app at https://developer.intuit.com/
 * 2. Set environment variables: QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET
 * 3. Configure OAuth redirect URI in your QuickBooks app settings
 * 
 * Gap #P1: QuickBooks OAuth integration requires manual API key setup
 * as there is no Replit integration available for QuickBooks.
 */

import { db } from '../../db';
import { eq, and } from 'drizzle-orm';

const QUICKBOOKS_SANDBOX_URL = 'https://sandbox-quickbooks.api.intuit.com';
const QUICKBOOKS_PRODUCTION_URL = 'https://quickbooks.api.intuit.com';
const QUICKBOOKS_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const QUICKBOOKS_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

export interface QuickBooksConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: 'sandbox' | 'production';
}

export interface QuickBooksCredentials {
  workspaceId: string;
  accessToken: string;
  refreshToken: string;
  realmId: string;
  expiresAt: Date;
}

export class QuickBooksIntegration {
  private config: QuickBooksConfig | null = null;
  
  constructor() {
    this.loadConfig();
  }
  
  private loadConfig(): void {
    const clientId = process.env.QUICKBOOKS_CLIENT_ID;
    const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
    const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI || `${process.env.REPLIT_DEPLOYMENT_URL || 'http://localhost:5000'}/api/integrations/quickbooks/callback`;
    const environment = (process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';
    
    if (clientId && clientSecret) {
      this.config = { clientId, clientSecret, redirectUri, environment };
      console.log('[QuickBooks] Configuration loaded successfully');
    } else {
      console.log('[QuickBooks] Missing credentials - integration not configured');
    }
  }
  
  isConfigured(): boolean {
    return this.config !== null;
  }
  
  getAuthorizationUrl(state: string): string {
    if (!this.config) {
      throw new Error('QuickBooks integration not configured. Set QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET.');
    }
    
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      redirect_uri: this.config.redirectUri,
      state,
    });
    
    return `${QUICKBOOKS_AUTH_URL}?${params.toString()}`;
  }
  
  async exchangeCodeForTokens(code: string, realmId: string): Promise<QuickBooksCredentials | null> {
    if (!this.config) {
      throw new Error('QuickBooks integration not configured');
    }
    
    try {
      const basicAuth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
      
      const response = await fetch(QUICKBOOKS_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.config.redirectUri,
        }).toString(),
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.error('[QuickBooks] Token exchange failed:', error);
        return null;
      }
      
      const tokens = await response.json();
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
      
      return {
        workspaceId: '', // Will be set by caller
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        realmId,
        expiresAt,
      };
    } catch (error) {
      console.error('[QuickBooks] Error exchanging code for tokens:', error);
      return null;
    }
  }
  
  async refreshAccessToken(credentials: QuickBooksCredentials): Promise<QuickBooksCredentials | null> {
    if (!this.config) {
      throw new Error('QuickBooks integration not configured');
    }
    
    try {
      const basicAuth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
      
      const response = await fetch(QUICKBOOKS_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: credentials.refreshToken,
        }).toString(),
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.error('[QuickBooks] Token refresh failed:', error);
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
      console.error('[QuickBooks] Error refreshing token:', error);
      return null;
    }
  }
  
  private getBaseUrl(): string {
    return this.config?.environment === 'production' 
      ? QUICKBOOKS_PRODUCTION_URL 
      : QUICKBOOKS_SANDBOX_URL;
  }
  
  async syncInvoicesToQuickBooks(credentials: QuickBooksCredentials, invoices: any[]): Promise<{ success: boolean; synced: number; errors: string[] }> {
    if (!this.config) {
      return { success: false, synced: 0, errors: ['QuickBooks integration not configured'] };
    }
    
    const errors: string[] = [];
    let synced = 0;
    
    for (const invoice of invoices) {
      try {
        const qbInvoice = this.mapInvoiceToQuickBooks(invoice);
        const response = await fetch(
          `${this.getBaseUrl()}/v3/company/${credentials.realmId}/invoice?minorversion=65`,
          {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${credentials.accessToken}`,
            },
            body: JSON.stringify(qbInvoice),
          }
        );
        
        if (response.ok) {
          synced++;
          console.log(`[QuickBooks] Synced invoice ${invoice.id}`);
        } else {
          const error = await response.text();
          errors.push(`Invoice ${invoice.id}: ${error}`);
        }
      } catch (error) {
        errors.push(`Invoice ${invoice.id}: ${error}`);
      }
    }
    
    return { success: errors.length === 0, synced, errors };
  }
  
  private mapInvoiceToQuickBooks(invoice: any): any {
    return {
      Line: [{
        Amount: parseFloat(invoice.total),
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          ItemRef: { value: '1' },
          Qty: 1,
          UnitPrice: parseFloat(invoice.total),
        },
      }],
      CustomerRef: {
        value: invoice.clientId,
        name: invoice.clientName,
      },
      DocNumber: invoice.invoiceNumber,
      TxnDate: invoice.issueDate?.toISOString().split('T')[0],
      DueDate: invoice.dueDate?.toISOString().split('T')[0],
    };
  }
  
  async getCompanyInfo(credentials: QuickBooksCredentials): Promise<any | null> {
    if (!this.config) {
      return null;
    }
    
    try {
      const response = await fetch(
        `${this.getBaseUrl()}/v3/company/${credentials.realmId}/companyinfo/${credentials.realmId}?minorversion=65`,
        {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${credentials.accessToken}`,
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        return data.CompanyInfo;
      }
      
      return null;
    } catch (error) {
      console.error('[QuickBooks] Error getting company info:', error);
      return null;
    }
  }
}

export const quickbooksIntegration = new QuickBooksIntegration();
