/**
 * QuickBooks OAuth 2.0 Discovery Document Service
 * 
 * Implements dynamic endpoint discovery as per Intuit's OpenID Connect specification.
 * This ensures compliance with Intuit's OAuth 2.0 requirements and handles
 * endpoint changes automatically.
 * 
 * @see https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-openid-discovery-doc
 */

import { INTEGRATIONS } from '@shared/platformConfig';

// Use centralized config - NO HARDCODED VALUES
const DISCOVERY_URLS = INTEGRATIONS.quickbooks.discoveryUrls;

// Fallback endpoints from centralized config (used when discovery fetch fails)
const FALLBACK_ENDPOINTS = {
  authorization_endpoint: INTEGRATIONS.quickbooks.oauthUrls.authorization,
  token_endpoint: INTEGRATIONS.quickbooks.oauthUrls.token,
  userinfo_endpoint: INTEGRATIONS.quickbooks.oauthUrls.userinfo,
  revocation_endpoint: INTEGRATIONS.quickbooks.oauthUrls.revoke,
  jwks_uri: INTEGRATIONS.quickbooks.oauthUrls.jwks,
};

const FALLBACK_ENDPOINTS_SANDBOX = {
  authorization_endpoint: INTEGRATIONS.quickbooks.oauthUrls.authorization,
  token_endpoint: INTEGRATIONS.quickbooks.oauthUrls.token,
  userinfo_endpoint: INTEGRATIONS.quickbooks.oauthUrls.userinfoSandbox,
  revocation_endpoint: INTEGRATIONS.quickbooks.oauthUrls.revoke,
  jwks_uri: INTEGRATIONS.quickbooks.oauthUrls.jwks,
};

export interface IntuitDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  revocation_endpoint: string;
  jwks_uri: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
}

interface CachedDiscovery {
  document: IntuitDiscoveryDocument;
  fetchedAt: Date;
  expiresAt: Date;
}

class QuickBooksDiscoveryService {
  private cache: Map<'production' | 'sandbox', CachedDiscovery> = new Map();
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly FETCH_TIMEOUT_MS = 10000; // 10 seconds
  
  async getDiscoveryDocument(environment: 'production' | 'sandbox' = 'production'): Promise<IntuitDiscoveryDocument> {
    const cached = this.cache.get(environment);
    if (cached && cached.expiresAt > new Date()) {
      console.log(`[QB Discovery] Using cached ${environment} discovery document`);
      return cached.document;
    }
    
    try {
      const document = await this.fetchDiscoveryDocument(environment);
      
      this.cache.set(environment, {
        document,
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + this.CACHE_TTL_MS),
      });
      
      console.log(`[QB Discovery] Fetched fresh ${environment} discovery document`);
      return document;
    } catch (error) {
      console.warn(`[QB Discovery] Failed to fetch ${environment} discovery document, using fallback:`, error);
      return this.getFallbackEndpoints(environment);
    }
  }
  
  private async fetchDiscoveryDocument(environment: 'production' | 'sandbox'): Promise<IntuitDiscoveryDocument> {
    const url = DISCOVERY_URLS[environment];
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.FETCH_TIMEOUT_MS);
    
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const document = await response.json() as IntuitDiscoveryDocument;
      
      if (!document.authorization_endpoint || !document.token_endpoint) {
        throw new Error('Invalid discovery document: missing required endpoints');
      }
      
      return document;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  
  private getFallbackEndpoints(environment: 'production' | 'sandbox'): IntuitDiscoveryDocument {
    const endpoints = environment === 'production' ? FALLBACK_ENDPOINTS : FALLBACK_ENDPOINTS_SANDBOX;
    
    return {
      // Use centralized config - NO HARDCODED VALUES
      issuer: INTEGRATIONS.quickbooks.oauthUrls.issuer,
      ...endpoints,
      scopes_supported: [
        'openid',
        'profile',
        'email',
        'phone',
        'address',
        INTEGRATIONS.quickbooks.scopes.accounting,
        INTEGRATIONS.quickbooks.scopes.payment,
      ],
      response_types_supported: ['code'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    };
  }
  
  async getAuthorizationEndpoint(environment: 'production' | 'sandbox' = 'production'): Promise<string> {
    const document = await this.getDiscoveryDocument(environment);
    return document.authorization_endpoint;
  }
  
  async getTokenEndpoint(environment: 'production' | 'sandbox' = 'production'): Promise<string> {
    const document = await this.getDiscoveryDocument(environment);
    return document.token_endpoint;
  }
  
  async getRevocationEndpoint(environment: 'production' | 'sandbox' = 'production'): Promise<string> {
    const document = await this.getDiscoveryDocument(environment);
    return document.revocation_endpoint;
  }
  
  async getUserInfoEndpoint(environment: 'production' | 'sandbox' = 'production'): Promise<string> {
    const document = await this.getDiscoveryDocument(environment);
    return document.userinfo_endpoint;
  }
  
  clearCache(environment?: 'production' | 'sandbox'): void {
    if (environment) {
      this.cache.delete(environment);
    } else {
      this.cache.clear();
    }
    console.log(`[QB Discovery] Cache cleared${environment ? ` for ${environment}` : ''}`);
  }
  
  getCacheStatus(): { production: boolean; sandbox: boolean } {
    const now = new Date();
    return {
      production: this.cache.has('production') && this.cache.get('production')!.expiresAt > now,
      sandbox: this.cache.has('sandbox') && this.cache.get('sandbox')!.expiresAt > now,
    };
  }
}

export const quickbooksDiscovery = new QuickBooksDiscoveryService();
