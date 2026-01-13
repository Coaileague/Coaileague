/**
 * Diagnostics Runner Configuration
 * All settings for crawl mode, workflow mode, and report generation
 */

export interface DiagnosticsConfig {
  baseUrl: string;
  maxPages: number;
  pageTimeout: number;
  workflowTimeout: number;
  enableVideo: boolean;
  enableTrace: boolean;
  enableScreenshots: boolean;
  checkExternalLinks: boolean;
  retryAttempts: number;
  testUsername?: string;
  testPassword?: string;
  diagBypassCaptcha: boolean;
  outputDir: string;
  destructiveKeywords: string[];
  errorKeywords: string[];
  captchaSelectors: string[];
}

export function loadConfig(): DiagnosticsConfig {
  return {
    baseUrl: process.env.DIAG_BASE_URL || process.env.BASE_URL || 'https://coaileague.replit.app',
    maxPages: parseInt(process.env.MAX_PAGES || '300', 10),
    pageTimeout: parseInt(process.env.PAGE_TIMEOUT || '30000', 10),
    workflowTimeout: parseInt(process.env.WORKFLOW_TIMEOUT || '60000', 10),
    enableVideo: process.env.ENABLE_VIDEO === 'true',
    enableTrace: process.env.ENABLE_TRACE === 'true',
    enableScreenshots: process.env.ENABLE_SCREENSHOTS !== 'false',
    checkExternalLinks: process.env.CHECK_EXTERNAL_LINKS === 'true',
    retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '2', 10),
    testUsername: process.env.TEST_USERNAME,
    testPassword: process.env.TEST_PASSWORD,
    diagBypassCaptcha: process.env.DIAG_BYPASS_CAPTCHA === 'true',
    outputDir: process.env.DIAG_OUTPUT_DIR || './diagnostics-runner/output',
    destructiveKeywords: [
      'delete', 'remove', 'logout', 'unsubscribe', 'cancel', 
      'destroy', 'pay', 'confirm payment', 'sign out', 'deactivate'
    ],
    errorKeywords: [
      'error', 'failed', 'exception', '404', '500', 
      'something went wrong', 'not found', 'internal server error',
      'unexpected error', 'oops', 'unable to'
    ],
    captchaSelectors: [
      'iframe[src*="recaptcha"]',
      'iframe[src*="hcaptcha"]',
      '[id*="captcha"]',
      '[class*="captcha"]',
      '[id*="recaptcha"]',
      '[class*="recaptcha"]',
      '[id*="hcaptcha"]',
      '[class*="hcaptcha"]',
      '.g-recaptcha',
      '.h-captcha'
    ]
  };
}

export const config = loadConfig();
