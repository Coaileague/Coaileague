/**
 * Human-Friendly Copy Service
 * 
 * Translates technical jargon into everyday language that normal users can understand.
 * Used by Trinity AI, AI Brain, and all notification systems.
 */

// Technical terms to human-friendly translations
const TECHNICAL_TO_HUMAN: Record<string, string> = {
  // API/Backend terms
  'API': 'connection',
  'API Routes': 'connections',
  'endpoint': 'feature',
  'endpoints': 'features',
  'backend': 'system',
  'frontend': 'interface',
  'database': 'data storage',
  'server': 'system',
  'client': 'app',
  'webhook': 'automatic update',
  'webhooks': 'automatic updates',
  
  // Development terms
  'CI/CD': 'automatic updates',
  'pipeline': 'process',
  'pipelines': 'processes',
  'deployment': 'update',
  'deployments': 'updates',
  'build': 'setup',
  'builds': 'setups',
  'runtime': 'running',
  'configuration': 'settings',
  'config': 'settings',
  'dependency': 'required feature',
  'dependencies': 'required features',
  'framework': 'system',
  'module': 'feature',
  'modules': 'features',
  
  // Technical operations
  'initialization': 'startup',
  'initializing': 'starting up',
  'initialized': 'ready',
  'optimization': 'improvement',
  'optimized': 'improved',
  'refactored': 'improved',
  'refactoring': 'improving',
  'migration': 'upgrade',
  'migrating': 'upgrading',
  'deprecated': 'outdated',
  'deprecation': 'phase-out',
  
  // Data terms
  'schema': 'data structure',
  'query': 'search',
  'queries': 'searches',
  'payload': 'data',
  'response': 'result',
  'request': 'action',
  'requests': 'actions',
  'cache': 'saved data',
  'caching': 'saving for quick access',
  
  // Error/Status terms
  'exception': 'error',
  'timeout': 'took too long',
  'latency': 'delay',
  'throttling': 'rate limiting',
  'rate limit': 'usage limit',
  
  // CoAIleague specific
  'orchestration': 'automation',
  'orchestrator': 'coordinator',
  'subagent': 'assistant',
  'workflow': 'process',
  'workflows': 'processes',
  'AI Brain': 'Trinity AI',
  
  // Infrastructure
  'infrastructure': 'system',
  'architecture': 'design',
  'scalability': 'growth capacity',
  'redundancy': 'backup systems',
  'failover': 'backup switch',
  
  // Security
  'authentication': 'login',
  'authorization': 'permissions',
  'credentials': 'login details',
  'token': 'access key',
  'tokens': 'access keys',
  'session': 'login session',
  'encryption': 'protection',
};

// Title rewrites - maps technical titles to friendly versions
const TITLE_REWRITES: Record<string, string> = {
  'Client Application Root Logic Update': 'App Startup Improved',
  'New API Routes: Workflow Data Access': 'Dashboard Loads Faster Now',
  'Core Platform Dependency & Framework Upgrade': 'System Performance Boost',
  'Database Query Optimization': 'Faster Data Loading',
  'WebSocket Connection Improvements': 'Real-Time Updates Enhanced',
  'Authentication Token Refresh': 'Login Security Updated',
  'Cache Invalidation Update': 'Data Freshness Improved',
  'API Rate Limiting Adjustment': 'System Capacity Increased',
  'Server-Side Rendering Enhancement': 'Pages Load Faster',
  'Memory Optimization': 'App Runs Smoother',
  'Error Handling Improvement': 'Better Error Messages',
  'Security Patch Applied': 'Security Update Installed',
  'Performance Monitoring Update': 'System Health Check Improved',
};

// Category-based message templates
const FRIENDLY_TEMPLATES: Record<string, (details?: string) => string> = {
  'improvement': (details) => 
    `We made some behind-the-scenes improvements${details ? ` to ${details}` : ''}. Everything works the same, just better!`,
  'feature_release': (details) => 
    `Great news! ${details || 'A new feature is now available'}.`,
  'maintenance': (details) => 
    `We're doing some maintenance${details ? ` on ${details}` : ''}. Your work won't be affected.`,
  'security_patch': (details) => 
    `We installed a security update to keep your data safe.`,
  'performance': (details) => 
    `We improved how fast things load${details ? `, especially ${details}` : ''}.`,
  'bug_fix': (details) => 
    `We fixed an issue${details ? ` with ${details}` : ''}. Thanks for your patience!`,
};

/**
 * Replace technical terms with human-friendly alternatives
 */
export function humanizeText(text: string): string {
  if (!text) return text;
  
  let result = text;
  
  // Apply term replacements (case-insensitive)
  for (const [technical, human] of Object.entries(TECHNICAL_TO_HUMAN)) {
    const regex = new RegExp(`\\b${escapeRegex(technical)}\\b`, 'gi');
    result = result.replace(regex, human);
  }
  
  return result;
}

/**
 * Humanize a notification title
 */
export function humanizeTitle(title: string): string {
  if (!title) return title;
  
  // Check for exact title rewrites first
  if (TITLE_REWRITES[title]) {
    return TITLE_REWRITES[title];
  }
  
  // Apply general term replacements
  return humanizeText(title);
}

/**
 * Generate a friendly message for a notification category
 */
export function getFriendlyMessage(category: string, details?: string): string {
  const template = FRIENDLY_TEMPLATES[category];
  if (template) {
    return template(details);
  }
  
  // Default friendly message
  return details 
    ? humanizeText(details) 
    : 'We made some updates to improve your experience.';
}

/**
 * Humanize an entire notification object
 */
export function humanizeNotification(notification: {
  title: string;
  message?: string;
  category?: string;
  metadata?: { endUserSummary?: string; technicalSummary?: string };
}): { title: string; message: string } {
  const friendlyTitle = humanizeTitle(notification.title);
  
  // Prefer endUserSummary if available
  let friendlyMessage = notification.metadata?.endUserSummary;
  
  if (!friendlyMessage) {
    // Try to generate from category
    if (notification.category && FRIENDLY_TEMPLATES[notification.category]) {
      friendlyMessage = getFriendlyMessage(notification.category, notification.message);
    } else {
      // Fall back to humanizing the message
      friendlyMessage = humanizeText(notification.message || '');
    }
  }
  
  return {
    title: friendlyTitle,
    message: friendlyMessage,
  };
}

/**
 * Generate end-user summary from technical description
 * Used by AI Brain when creating notifications
 */
export function generateEndUserSummary(technicalDescription: string, category?: string): string {
  // Common patterns and their friendly translations
  const patterns: Array<{ pattern: RegExp; replacement: string }> = [
    {
      pattern: /updated? the platform's? (main )?loading sequence/i,
      replacement: 'We improved how the app starts up, so it loads more reliably every time.',
    },
    {
      pattern: /updated? the platform's? internal connections/i,
      replacement: 'We improved how your dashboard gets data, so everything loads faster.',
    },
    {
      pattern: /upgraded? the underlying software engine/i,
      replacement: 'We updated the core system to keep everything running smoothly.',
    },
    {
      pattern: /affects the entire platform's? build process/i,
      replacement: 'This update makes the whole system more reliable.',
    },
    {
      pattern: /impacts? all development teams/i,
      replacement: 'This improvement helps everyone who uses the platform.',
    },
    {
      pattern: /API route/i,
      replacement: 'connection to your data',
    },
    {
      pattern: /workflow (data|information)/i,
      replacement: 'your work information',
    },
  ];
  
  let result = technicalDescription;
  
  for (const { pattern, replacement } of patterns) {
    if (pattern.test(technicalDescription)) {
      return replacement;
    }
  }
  
  // If no pattern matched, apply general humanization
  return humanizeText(result);
}

/**
 * Check if text contains technical jargon
 */
export function containsTechnicalJargon(text: string): boolean {
  if (!text) return false;
  
  const jargonPatterns = [
    /\bAPI\b/i,
    /\bCI\/CD\b/i,
    /\bpipeline\b/i,
    /\bendpoint\b/i,
    /\bwebhook\b/i,
    /\bschema\b/i,
    /\bdeployment\b/i,
    /\bbackend\b/i,
    /\bfrontend\b/i,
    /\binfrastructure\b/i,
    /\barchitecture\b/i,
    /\brefactor/i,
    /\boptimiz/i,
    /\bmigrat/i,
  ];
  
  return jargonPatterns.some(pattern => pattern.test(text));
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default {
  humanizeText,
  humanizeTitle,
  getFriendlyMessage,
  humanizeNotification,
  generateEndUserSummary,
  containsTechnicalJargon,
};
