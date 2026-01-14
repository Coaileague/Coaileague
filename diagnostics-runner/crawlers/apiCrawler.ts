/**
 * API CRAWLER - Trinity Debug Triad
 * ==================================
 * Specialized crawler for backend API testing.
 * 
 * Tests:
 * - API endpoint availability
 * - Authentication flows
 * - Request/response validation
 * - Error handling
 * - Rate limiting behavior
 * - Database operations (via API)
 */

import { 
  TriadIssue, 
  APICrawlerResult, 
  APITestCase, 
  APITestResult,
  CrawlerProgress 
} from '../config/triadTypes';
import { generateId } from '../utils/helpers';

interface APICrawlerConfig {
  baseUrl: string;
  runId: string;
  outputDir: string;
  credentials?: {
    username: string;
    password: string;
    bypassSecret?: string;
  };
  onProgress?: (progress: CrawlerProgress) => void;
}

export class APICrawler {
  private config: APICrawlerConfig;
  private issues: TriadIssue[] = [];
  private testResults: APITestResult[] = [];
  private authToken: string | null = null;
  private sessionCookie: string | null = null;
  
  constructor(config: APICrawlerConfig) {
    this.config = config;
  }
  
  private emitProgress(status: string, progress: number) {
    if (this.config.onProgress) {
      this.config.onProgress({
        crawlerType: 'api',
        progress,
        status,
        issuesFound: this.issues.length
      });
    }
  }
  
  async run(): Promise<APICrawlerResult> {
    console.log('[APICrawler] Starting API tests...');
    
    const testCases = this.getTestCases();
    const totalTests = testCases.length;
    let completedTests = 0;
    
    if (this.config.credentials) {
      await this.authenticate();
    }
    
    for (const testCase of testCases) {
      this.emitProgress(`Testing: ${testCase.name}`, (completedTests / totalTests) * 100);
      
      const result = await this.executeTest(testCase);
      this.testResults.push(result);
      
      if (!result.success) {
        this.createIssueFromResult(result);
      }
      
      completedTests++;
    }
    
    const responseTimes = this.testResults.map(r => r.responseTime);
    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
      : 0;
    
    const slowestEndpoints = this.testResults
      .filter(r => r.success)
      .sort((a, b) => b.responseTime - a.responseTime)
      .slice(0, 5)
      .map(r => ({ endpoint: r.testCase.endpoint, responseTime: r.responseTime }));
    
    console.log(`[APICrawler] Completed. Tested ${totalTests} endpoints, found ${this.issues.length} issues.`);
    
    return {
      endpointsTestedCount: totalTests,
      testResults: this.testResults,
      issues: this.issues,
      authFlowsTestedCount: this.config.credentials ? 2 : 0,
      averageResponseTime: avgResponseTime,
      slowestEndpoints
    };
  }
  
  private getTestCases(): APITestCase[] {
    const base = this.config.baseUrl;
    
    return [
      {
        id: 'health-check',
        name: 'Health Check Endpoint',
        endpoint: '/api/health',
        method: 'GET',
        expectedStatus: 200,
        requiresAuth: false,
        description: 'Basic server health check'
      },
      {
        id: 'health-summary',
        name: 'Health Summary',
        endpoint: '/api/health/summary',
        method: 'GET',
        expectedStatus: 200,
        requiresAuth: false,
        description: 'Detailed health summary'
      },
      {
        id: 'auth-check',
        name: 'Auth Status Check',
        endpoint: '/api/auth/check',
        method: 'GET',
        expectedStatus: [200, 401],
        requiresAuth: false,
        description: 'Check authentication status'
      },
      {
        id: 'mascot-seasonal',
        name: 'Seasonal State',
        endpoint: '/api/mascot/seasonal/state',
        method: 'GET',
        expectedStatus: 200,
        requiresAuth: false,
        description: 'Trinity mascot seasonal state'
      },
      {
        id: 'runtime-flags',
        name: 'Runtime Flags',
        endpoint: '/api/runtime-flags',
        method: 'GET',
        expectedStatus: 200,
        requiresAuth: false,
        description: 'Trinity runtime configuration flags'
      },
      {
        id: 'workspaces-list',
        name: 'List Workspaces',
        endpoint: '/api/workspaces/all',
        method: 'GET',
        expectedStatus: [200, 401],
        requiresAuth: true,
        description: 'Get user workspaces'
      },
      {
        id: 'current-workspace',
        name: 'Current Workspace',
        endpoint: '/api/workspaces/current',
        method: 'GET',
        expectedStatus: [200, 401, 404],
        requiresAuth: true,
        description: 'Get current workspace context'
      },
      {
        id: 'employees-list',
        name: 'List Employees',
        endpoint: '/api/employees',
        method: 'GET',
        expectedStatus: [200, 401],
        requiresAuth: true,
        description: 'Get employee list'
      },
      {
        id: 'schedules-current',
        name: 'Current Schedules',
        endpoint: '/api/shifts',
        method: 'GET',
        expectedStatus: [200, 401],
        requiresAuth: true,
        description: 'Get current schedules/shifts'
      },
      {
        id: 'notifications-list',
        name: 'Notifications',
        endpoint: '/api/notifications',
        method: 'GET',
        expectedStatus: [200, 401],
        requiresAuth: true,
        description: 'Get user notifications'
      },
      {
        id: 'invoices-list',
        name: 'Invoices List',
        endpoint: '/api/invoices',
        method: 'GET',
        expectedStatus: [200, 401],
        requiresAuth: true,
        description: 'Get invoice list'
      },
      {
        id: 'billing-config',
        name: 'Billing Configuration',
        endpoint: '/api/billing/status',
        method: 'GET',
        expectedStatus: [200, 401, 404],
        requiresAuth: true,
        description: 'Get billing configuration'
      },
      {
        id: 'ai-brain-status',
        name: 'AI Brain Status',
        endpoint: '/api/trinity/status',
        method: 'GET',
        expectedStatus: [200, 401, 404],
        requiresAuth: true,
        description: 'Trinity AI Brain system status'
      },
      {
        id: 'stripe-config',
        name: 'Stripe Configuration',
        endpoint: '/api/stripe/config',
        method: 'GET',
        expectedStatus: [200, 401],
        requiresAuth: false,
        description: 'Public Stripe configuration'
      },
      {
        id: 'pricing-tiers',
        name: 'Pricing Tiers',
        endpoint: '/api/billing/plans',
        method: 'GET',
        expectedStatus: [200, 404],
        requiresAuth: false,
        description: 'Get subscription pricing tiers'
      }
    ];
  }
  
  private async authenticate(): Promise<void> {
    if (!this.config.credentials) return;
    
    console.log('[APICrawler] Authenticating...');
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      if (this.config.credentials.bypassSecret) {
        headers['X-Diagnostics-Runner'] = this.config.credentials.bypassSecret;
      }
      
      const response = await fetch(`${this.config.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          email: this.config.credentials.username,
          password: this.config.credentials.password,
          rememberMe: true
        })
      });
      
      if (response.ok) {
        const cookies = response.headers.get('set-cookie');
        if (cookies) {
          this.sessionCookie = cookies;
        }
        console.log('[APICrawler] Authentication successful');
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.warn('[APICrawler] Authentication failed:', response.status, errorData);
        
        this.issues.push({
          id: generateId(),
          category: 'workflow_failure',
          severity: 'critical',
          url: `${this.config.baseUrl}/api/auth/login`,
          message: `Authentication failed: ${response.status}`,
          details: JSON.stringify(errorData),
          statusCode: response.status,
          timestamp: new Date().toISOString(),
          crawlerType: 'api',
          subsystem: 'auth',
          reproducible: true
        });
      }
    } catch (error: any) {
      console.error('[APICrawler] Authentication error:', error.message);
      this.issues.push({
        id: generateId(),
        category: 'network_failure',
        severity: 'critical',
        url: `${this.config.baseUrl}/api/auth/login`,
        message: `Authentication request failed: ${error.message}`,
        timestamp: new Date().toISOString(),
        crawlerType: 'api',
        subsystem: 'auth',
        reproducible: true
      });
    }
  }
  
  private async executeTest(testCase: APITestCase): Promise<APITestResult> {
    const startTime = Date.now();
    const url = `${this.config.baseUrl}${testCase.endpoint}`;
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'TrinityDiagnosticsTriad/1.0 APICrawler',
        ...testCase.headers
      };
      
      if (testCase.requiresAuth && this.sessionCookie) {
        headers['Cookie'] = this.sessionCookie;
      }
      
      if (this.config.credentials?.bypassSecret) {
        headers['X-Diagnostics-Runner'] = this.config.credentials.bypassSecret;
      }
      
      const response = await fetch(url, {
        method: testCase.method,
        headers,
        body: testCase.body ? JSON.stringify(testCase.body) : undefined
      });
      
      const responseTime = Date.now() - startTime;
      let responseBody: any = null;
      
      try {
        const text = await response.text();
        responseBody = text ? JSON.parse(text) : null;
      } catch {
      }
      
      const expectedStatuses = Array.isArray(testCase.expectedStatus) 
        ? testCase.expectedStatus 
        : [testCase.expectedStatus];
      
      const statusMatch = expectedStatuses.includes(response.status);
      
      let validationPassed = true;
      if (statusMatch && testCase.validateResponse && responseBody) {
        validationPassed = testCase.validateResponse(responseBody);
      }
      
      return {
        testCase,
        success: statusMatch && validationPassed,
        statusCode: response.status,
        responseTime,
        responseBody,
        timestamp: new Date().toISOString()
      };
      
    } catch (error: any) {
      return {
        testCase,
        success: false,
        statusCode: 0,
        responseTime: Date.now() - startTime,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  private createIssueFromResult(result: APITestResult): void {
    const severity = result.statusCode >= 500 ? 'critical' 
                   : result.statusCode === 0 ? 'critical'
                   : result.statusCode >= 400 ? 'high' 
                   : 'medium';
    
    let subsystem: TriadIssue['subsystem'] = 'backend';
    if (result.testCase.endpoint.includes('/auth')) subsystem = 'auth';
    if (result.testCase.endpoint.includes('/ai-brain')) subsystem = 'ai';
    if (result.testCase.endpoint.includes('/stripe')) subsystem = 'integration';
    
    this.issues.push({
      id: generateId(),
      category: result.error ? 'network_failure' : 'workflow_failure',
      severity,
      url: `${this.config.baseUrl}${result.testCase.endpoint}`,
      message: result.error 
        ? `API request failed: ${result.error}` 
        : `${result.testCase.name} - Unexpected status ${result.statusCode}`,
      details: result.error || JSON.stringify(result.responseBody),
      statusCode: result.statusCode,
      requestUrl: result.testCase.endpoint,
      timestamp: result.timestamp,
      crawlerType: 'api',
      subsystem,
      reproducible: true
    });
  }
}
