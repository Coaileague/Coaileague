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
  
  // Application structure terms (only specific technical phrases)
  'Root Application Logic': 'Core App',
  'root application logic': 'core app',
  'Root Component': 'Core Feature',
  'root component': 'core feature',
  'Application Logic Update': 'App Improvement',
  'application logic update': 'app improvement',
  'React Component': 'App Feature',
  'Vue Component': 'App Feature',
  'Angular Component': 'App Feature',
  'service worker': 'background helper',
  'Service Worker': 'Background Helper',
  'index.ts': 'main file',
  'index.js': 'main file',
  
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
  
  // Scheduling action names - convert snake_case to readable text
  'shift_duplicated': 'shift was copied',
  'shift_created': 'shift was created',
  'shift_updated': 'shift was updated',
  'shift_deleted': 'shift was removed',
  'shift_swapped': 'shift was swapped',
  'shift_assigned': 'shift was assigned',
  'shift_unassigned': 'shift was unassigned',
  'shift_published': 'shift was published',
  'schedule_published': 'schedule was published',
  'schedule_updated': 'schedule was updated',
  'employee_assigned': 'employee was assigned',
  'employee_unassigned': 'employee was unassigned',
  'timesheet_approved': 'timesheet was approved',
  'timesheet_rejected': 'timesheet was rejected',
  'clock_in': 'clocked in',
  'clock_out': 'clocked out',
  'break_start': 'break started',
  'break_end': 'break ended',
  'Advanced scheduling action': 'Scheduling update',
  'advanced scheduling action': 'scheduling update',
  
  // Internal processes
  'watchdog': 'monitoring',
  'Watchdog': 'Monitoring',
  'Service Watchdog': 'System Monitoring',
  
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
  'app Root Application Logic Update': 'App Startup Improved',
  'Root Application Logic Update': 'App Startup Improved',
  'Application Logic Update': 'App Improvement',
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
  // More common technical titles
  'Root Component Update': 'Core App Update',
  'Root Logic Changed': 'Core App Improved',
  'Service Initialization': 'Feature Starting Up',
  'Component Render Update': 'Visual Improvements',
  'State Management Update': 'Data Handling Improved',
  'Route Handler Update': 'Navigation Improved',
  'Middleware Update': 'System Processing Improved',
  'Schema Migration': 'Data Structure Update',
  'Index File Update': 'Main App Update',
  // Gap Intelligence scan titles
  'typescript_scan Scan - Review Recommended': 'Code Quality Check Complete',
  'eslint_scan Scan - Review Recommended': 'Code Style Check Complete',
  'dependency_scan Scan - Review Recommended': 'Software Updates Available',
  'security_scan Scan - Review Recommended': 'Security Check Complete',
  'Database Maintenance Failed': 'Database Optimization Issue',
  'Database Maintenance Complete': 'Database Optimized Successfully',
  'Automatic Payroll Processing Complete': 'Payroll Processed Successfully',
  'Automatic Payroll Processing Co...': 'Payroll Processed Successfully',
  'New core endpoints live': 'New Features Now Available',
  // Platform health notifications
  'Platform Health Degraded': 'System Performance Notice',
  'Service Watchdog Active': 'System Monitoring Active',
};

// HIGH-STAKES category templates ONLY - used for security/compliance/payroll where specific messaging is critical
// Normal notifications should NOT use templates - Trinity AI generates contextual content
const HIGH_STAKES_TEMPLATES: Record<string, (details?: string) => string> = {
  'security_patch': (details) => 
    `A security update was installed to protect your data${details ? ` - ${details}` : ''}.`,
  'compliance': (details) => 
    `A compliance matter requires attention${details ? `: ${details}` : ''}.`,
  'payroll_error': (details) => 
    `Payroll requires attention${details ? `: ${details}` : ''}.`,
};

/**
 * Convert snake_case or camelCase action names to readable text
 * e.g., "shift_duplicated" -> "shift duplicated", "timeOffApproved" -> "time off approved"
 */
function humanizeActionName(text: string): string {
  // First handle snake_case
  let result = text.replace(/_/g, ' ');
  
  // Then handle camelCase - insert space before uppercase letters
  result = result.replace(/([a-z])([A-Z])/g, '$1 $2');
  
  // Convert to lowercase for cleaner reading
  result = result.toLowerCase();
  
  return result;
}

/**
 * Replace technical terms with human-friendly alternatives
 */
export function humanizeText(text: string): string {
  if (!text) return text;
  
  let result = text;
  
  result = sanitizeForEndUser(result);
  
  for (const [technical, human] of Object.entries(TECHNICAL_TO_HUMAN)) {
    const regex = new RegExp(`\\b${escapeRegex(technical)}\\b`, 'gi');
    result = result.replace(regex, human);
  }
  
  result = result.replace(/\b[a-z]+(?:_[a-z]+)+\b/gi, (match) => {
    return humanizeActionName(match);
  });
  
  return result;
}

/**
 * Humanize a notification title
 */
export function humanizeTitle(title: string): string {
  if (!title) return title;
  
  if (TITLE_REWRITES[title]) {
    return TITLE_REWRITES[title];
  }
  
  let cleaned = sanitizeForEndUser(title);
  
  if (TITLE_REWRITES[cleaned]) {
    return TITLE_REWRITES[cleaned];
  }
  
  if (/_scan\s+Scan\s*[-–]?\s*Review\s+Recommended/i.test(cleaned)) {
    return 'System Health Check Complete';
  }
  
  if (/\d+\s*error\(?s?\)?\s*detected\s*in/i.test(cleaned)) {
    return 'Code Quality Check Complete';
  }
  
  if (/maintenance\s+failed/i.test(cleaned)) {
    const subject = cleaned.replace(/\s+maintenance\s+failed/i, '');
    return `${subject} Optimization Issue`;
  }
  
  if (/_scan|_check|_audit/i.test(cleaned)) {
    return 'System Check Complete';
  }
  
  return humanizeText(cleaned);
}

/**
 * Generate a friendly message for a notification category
 * ONLY uses templates for high-stakes categories (security, compliance, payroll)
 * All other categories should use actual message content or AI-generated text
 */
export function getFriendlyMessage(category: string, details?: string): string {
  // Only use templates for high-stakes categories
  const template = HIGH_STAKES_TEMPLATES[category];
  if (template) {
    return template(details);
  }
  
  // For all other categories, use the actual message content (humanized)
  // NO generic fallback - return the real content
  return details 
    ? humanizeText(details) 
    : '';  // Empty string forces caller to use actual notification content
}

/**
 * Humanize an entire notification object
 * PRIORITY ORDER:
 * 1. The actual notification message (always humanized through universal system)
 * 2. High-stakes templates ONLY for security/compliance/payroll
 */
export function humanizeNotification(notification: {
  title: string;
  message?: string;
  category?: string;
}): { title: string; message: string } {
  const friendlyTitle = humanizeTitle(notification.title);
  
  // PRIORITY 1: Use the actual message content (always humanized through universal system)
  if (notification.message) {
    return {
      title: friendlyTitle,
      message: humanizeText(notification.message),
    };
  }
  
  // PRIORITY 2: ONLY for high-stakes categories, use template
  if (notification.category && HIGH_STAKES_TEMPLATES[notification.category]) {
    return {
      title: friendlyTitle,
      message: getFriendlyMessage(notification.category),
    };
  }
  
  // Default: just return the title as both - no generic fallback
  return {
    title: friendlyTitle,
    message: friendlyTitle,
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

const CAMEL_CASE_SERVICE_MAP: Record<string, string> = {
  'trinityMemoryService': "Trinity's memory system",
  'trinityThoughtEngine': "Trinity's thinking system",
  'trinityNotificationBridge': "Trinity's notification system",
  'trinityPersona': "Trinity's personality system",
  'trinityFastDiagnostic': "Trinity's diagnostic tool",
  'platformChangeMonitor': 'platform monitoring',
  'aiNotificationService': 'notification system',
  'universalNotificationEngine': 'notification system',
  'autonomousScheduler': 'auto-scheduling',
  'aiBrainMasterOrchestrator': 'AI coordinator',
  'behavioralMonitoringService': 'performance tracker',
  'elevatedSessionGuardian': 'security monitor',
  'shiftMonitoringService': 'shift monitor',
  'coveragePipeline': 'coverage system',
  'seasonalSubagent': 'seasonal themes',
  'featureRegistryService': 'feature tracker',
  'platformMaintenanceService': 'maintenance system',
  'healthService': 'health monitor',
  'broadcastService': 'broadcast system',
  'chatServerHub': 'chat system',
  'emailIntelligenceService': 'email system',
  'gpsGeofenceService': 'location service',
  'issueDetectionService': 'issue detector',
  'incidentRoutingService': 'incident router',
  'helpAIBotService': 'Help AI assistant',
  'meetingBotService': 'meeting assistant',
  'reportBotService': 'report assistant',
  'clockBotService': 'clock assistant',
  'cleanupBotService': 'cleanup assistant',
  'serviceWatchdog': 'system monitoring',
};

function humanizeCamelCaseServiceName(name: string): string {
  if (CAMEL_CASE_SERVICE_MAP[name]) {
    return CAMEL_CASE_SERVICE_MAP[name];
  }
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\s+/, '')
    .replace(/\s+service$/i, ' system')
    .toLowerCase()
    .trim();
}

export function sanitizeForEndUser(text: string): string {
  if (!text) return text;
  let result = text;

  result = result.replace(/`([^`]+)`/g, (_, content) => {
    const cleaned = content.replace(/\.(ts|tsx|js|jsx|json|css|html|md)$/i, '');
    if (/[\/\\]/.test(cleaned)) {
      const fileName = cleaned.split(/[\/\\]/).pop() || '';
      return humanizeCamelCaseServiceName(fileName);
    }
    if (/^[a-z][a-zA-Z]+(?:Service|Engine|Monitor|Hub|Bridge|Manager|Handler|Controller|Provider|Factory|Registry|Orchestrator|Subagent|Agent|Bot|Guard|Guardian|Pipeline|Processor|Queue|Scheduler|Resolver|Dispatcher|Router|Validator|Parser|Builder|Mapper|Adapter|Connector|Client|Worker|Tracker|Watcher|Listener|Observer|Decorator|Wrapper)$/i.test(cleaned)) {
      return humanizeCamelCaseServiceName(cleaned);
    }
    return cleaned;
  });

  result = result.replace(/(?:^|\s|["'(])([a-zA-Z0-9._\-\/]+)\.(ts|tsx|js|jsx|json|css|html|md)\b/g, (match, name) => {
    const prefix = match.match(/^[\s"'(]/)?.[0] || '';
    const parts = name.split(/[\/\\]/);
    const fileName = parts[parts.length - 1];
    return prefix + humanizeCamelCaseServiceName(fileName);
  });

  result = result.replace(/(?:^|\s)((?:server|client|shared|src|components|services|routes|pages|hooks|lib|config|utils)\/[a-zA-Z0-9._\-\/]+)/g, (match) => {
    const prefix = match.match(/^\s/)?.[0] || '';
    return prefix + 'the system';
  });

  result = result.replace(/\b([a-z][a-zA-Z]+(?:Service|Engine|Monitor|Hub|Bridge|Manager|Handler|Controller|Provider|Factory|Registry|Orchestrator|Subagent|Agent|Guard|Guardian|Pipeline|Processor|Scheduler|Router))\b/g, (_, name) => {
    return humanizeCamelCaseServiceName(name);
  });

  result = result.replace(/\b(edge cases? in data persistence|runtime errors?|data processing within the automation pipeline|context state during operations|incomplete memory fragments|input validation|data validation|null checks?|type guards?|error boundaries?)\b/gi, (match) => {
    const lower = match.toLowerCase();
    if (lower.includes('edge case')) return 'uncommon situations';
    if (lower.includes('runtime error')) return 'unexpected error';
    if (lower.includes('automation pipeline')) return 'behind the scenes';
    if (lower.includes('context state')) return 'how information is managed';
    if (lower.includes('memory fragment')) return 'stored information';
    if (lower.includes('input validation') || lower.includes('data validation')) return 'data checking';
    if (lower.includes('null check') || lower.includes('type guard')) return 'safety check';
    if (lower.includes('error boundar')) return 'error handling';
    return match;
  });

  result = result.replace(/\s{2,}/g, ' ').trim();

  return result;
}

function identifyFeatureArea(title: string, message: string): string {
  const combined = `${title} ${message}`.toLowerCase();
  const areas: Array<[RegExp, string]> = [
    [/schedul|shift|calendar|roster/i, 'scheduling'],
    [/payroll|wage|salary|compensation|pay run/i, 'payroll'],
    [/invoic|billing|charge|payment/i, 'billing and payments'],
    [/employee|staff|team member|worker|guard/i, 'employee management'],
    [/client|customer|account/i, 'client management'],
    [/chat|message|conversation|helpdesk|support ticket/i, 'messaging'],
    [/notif|alert|remind|bell/i, 'notifications'],
    [/report|analytic|dashboard|metric|insight/i, 'reporting and analytics'],
    [/time\s?track|clock|timesheet|attendance/i, 'time tracking'],
    [/complia|certif|licens|regulat|audit/i, 'compliance'],
    [/onboard|training|orientation/i, 'onboarding'],
    [/secur|login|auth|password|access/i, 'security'],
    [/document|file|upload|contract/i, 'document management'],
    [/trinity|ai|brain|automat/i, 'Trinity intelligence'],
    [/app\s?manage|feature|platform/i, 'the platform'],
  ];
  for (const [pattern, area] of areas) {
    if (pattern.test(combined)) return area;
  }
  return 'the platform';
}

function deriveWhyItMatters(title: string, message: string, category?: string): string {
  const area = identifyFeatureArea(title, message);
  const lowerTitle = (title || '').toLowerCase();
  const lowerMsg = (message || '').toLowerCase();
  const combined = `${lowerTitle} ${lowerMsg}`;
  const lowerCategory = (category || '').toLowerCase();
  
  if (combined.includes('bug') || combined.includes('fix') || combined.includes('resolv') || combined.includes('issue') || lowerCategory.includes('bugfix')) {
    const explanations: Record<string, string> = {
      'scheduling': 'When scheduling has issues, it can lead to missed shifts and confused employees. This fix keeps your operations on track.',
      'payroll': 'Payroll accuracy is critical - even small errors can affect employee trust and legal compliance.',
      'billing and payments': 'Payment processing needs to be reliable. This fix ensures transactions go through correctly.',
      'employee management': 'Your team relies on accurate records. This fix ensures employee data stays consistent and up to date.',
      'time tracking': 'Accurate time records are essential for fair pay and labor compliance.',
      'compliance': 'Compliance gaps can expose your business to regulatory risk. This fix helps keep you covered.',
      'messaging': 'Reliable communication keeps your team connected. This fix ensures messages reach the right people.',
    };
    return explanations[area] || `This fix addresses an issue that could affect how ${area} works for your team.`;
  }
  
  if (combined.includes('new') || combined.includes('added') || combined.includes('feature') || combined.includes('live') || lowerCategory.includes('feature')) {
    const explanations: Record<string, string> = {
      'scheduling': 'This gives you more control over how shifts are created and managed, saving your team time every week.',
      'payroll': 'This adds new tools to help you process pay more efficiently and with greater accuracy.',
      'billing and payments': 'This expands your payment capabilities, giving you more flexibility in how you handle billing.',
      'employee management': 'This gives you better tools to manage your workforce and keep employee information organized.',
      'time tracking': 'This makes it easier to track hours, so your records stay accurate without extra effort.',
      'compliance': 'New compliance tools help you stay ahead of regulatory requirements and avoid costly gaps.',
      'reporting and analytics': 'Better reporting means clearer insights into your business performance.',
      'the platform': 'These new capabilities expand what you can accomplish in the platform.',
    };
    return explanations[area] || `This new capability in ${area} is designed to make your day-to-day operations smoother.`;
  }
  
  if (combined.includes('improv') || combined.includes('enhanc') || combined.includes('updat') || combined.includes('better') || combined.includes('faster') || combined.includes('optim')) {
    const explanations: Record<string, string> = {
      'scheduling': 'Smoother scheduling means less time spent on admin and more time focused on your operations.',
      'payroll': 'Payroll improvements help ensure your team gets paid accurately and on time, every time.',
      'billing and payments': 'Faster, more reliable payment processing means less friction for your business.',
      'employee management': 'These improvements make it easier to keep your team organized and informed.',
      'Trinity intelligence': "Trinity is getting smarter - these improvements help her assist you more effectively.",
      'security': 'Stronger security protections help keep your data and your team safe.',
      'the platform': 'These improvements make the overall experience faster and more reliable.',
    };
    return explanations[area] || `This improvement to ${area} makes things work better behind the scenes so you can focus on what matters.`;
  }
  
  if (lowerCategory.includes('security')) {
    return 'Security updates protect your organization from evolving threats. These changes help keep your data, employees, and clients safe.';
  }
  
  return `This update to ${area} helps keep your operations running smoothly and your team productive.`;
}

function deriveWhatTrinityDid(title: string, message: string, category?: string): string {
  const area = identifyFeatureArea(title, message);
  const lowerTitle = (title || '').toLowerCase();
  const lowerMsg = (message || '').toLowerCase();
  const combined = `${lowerTitle} ${lowerMsg}`;
  const lowerCategory = (category || '').toLowerCase();
  
  if (combined.includes('bug') || combined.includes('fix') || combined.includes('resolv') || lowerCategory.includes('bugfix') || lowerCategory.includes('hotpatch')) {
    return `Trinity identified the root cause, applied a targeted fix to ${area}, and verified everything is working correctly.`;
  }
  
  if (combined.includes('new') || combined.includes('added') || combined.includes('feature') || combined.includes('live') || lowerCategory.includes('feature')) {
    return `Trinity configured and activated the new ${area} capabilities, running checks to ensure they integrate smoothly with your existing setup.`;
  }
  
  if (combined.includes('improv') || combined.includes('enhanc') || combined.includes('optim') || lowerCategory.includes('improvement')) {
    return `Trinity fine-tuned ${area} performance, tested the changes, and confirmed everything is running better than before.`;
  }
  
  if (lowerCategory.includes('security')) {
    return 'Trinity applied security patches, verified all access controls are intact, and confirmed your data remains protected.';
  }
  
  if (combined.includes('maintenance') || lowerCategory.includes('maintenance')) {
    return `Trinity performed routine maintenance on ${area} to keep things running at peak performance.`;
  }
  
  return `Trinity reviewed the changes to ${area}, validated they work correctly, and deployed them seamlessly.`;
}

function deriveWhatToExpect(title: string, message: string, category?: string): string {
  const area = identifyFeatureArea(title, message);
  const lowerTitle = (title || '').toLowerCase();
  const lowerMsg = (message || '').toLowerCase();
  const combined = `${lowerTitle} ${lowerMsg}`;
  const lowerCategory = (category || '').toLowerCase();
  
  if (combined.includes('bug') || combined.includes('fix') || combined.includes('resolv') || lowerCategory.includes('bugfix')) {
    return `The issue has been resolved. ${area.charAt(0).toUpperCase() + area.slice(1)} should now work as expected - no action needed on your end.`;
  }
  
  if (combined.includes('new') || combined.includes('added') || combined.includes('feature') || combined.includes('live') || lowerCategory.includes('feature')) {
    return `The new ${area} features are live and ready to use. Take a look next time you're in that area - you might find it saves you some time.`;
  }
  
  if (combined.includes('improv') || combined.includes('enhanc') || combined.includes('optim') || lowerCategory.includes('improvement')) {
    return `You should notice ${area} feels smoother and more responsive. No changes needed on your end.`;
  }
  
  if (lowerCategory.includes('security')) {
    return 'Your account and data are protected with the latest security measures. No action required.';
  }
  
  return `Everything is running normally. ${area.charAt(0).toUpperCase() + area.slice(1)} continues to work as expected.`;
}

/**
 * Structured breakdown for notification details
 * Provides clear Problem → Issue → Solution → Outcome format
 */
export interface StructuredBreakdown {
  problem: string;    // What went wrong or changed
  issue: string;      // Why this matters to you
  solution: string;   // What Trinity did or recommends
  outcome: string;    // What you can expect now
}

/**
 * Generate structured breakdown from notification data
 * Trinity presents info in clear, actionable sections
 * 
 * PRIORITY ORDER:
 * 1. AI-generated metadata fields (technicalSummary, impact, resolution, endUserSummary)
 * 2. The actual notification message/title (humanized)
 * 3. Only use generic fallbacks as last resort
 */
export function generateStructuredBreakdown(
  title: string,
  message: string,
  category?: string,
  metadata?: {
    technicalSummary?: string;
    endUserSummary?: string;
    resolution?: string;
    impact?: string;
    fixApplied?: boolean;
    actionRequired?: boolean;
    aiEnriched?: boolean;
    technicalDetails?: string;
    brokenDescription?: string;
    impactDescription?: string;
    detailedCategory?: string;
    sourceName?: string;
    source?: string;
  }
): StructuredBreakdown {
  const effectiveTechnicalSummary = metadata?.technicalSummary || metadata?.brokenDescription || metadata?.technicalDetails;
  const effectiveImpact = metadata?.impact || metadata?.impactDescription;
  const effectiveEndUserSummary = metadata?.endUserSummary;
  const effectiveResolution = metadata?.resolution;
  
  if (metadata?.aiEnriched || (effectiveTechnicalSummary && effectiveEndUserSummary)) {
    return {
      problem: sanitizeForEndUser(effectiveTechnicalSummary || humanizeText(title)),
      issue: sanitizeForEndUser(effectiveImpact || deriveWhyItMatters(title, message, category)),
      solution: sanitizeForEndUser(effectiveResolution || deriveWhatTrinityDid(title, message, category)),
      outcome: sanitizeForEndUser(effectiveEndUserSummary || humanizeText(message)),
    };
  }
  
  const humanizedTitle = humanizeText(title);
  const humanizedMessage = humanizeText(message);
  
  let breakdown: StructuredBreakdown = {
    problem: humanizedTitle || 'A platform event occurred.',
    issue: deriveWhyItMatters(title, message, category),
    solution: deriveWhatTrinityDid(title, message, category),
    outcome: effectiveEndUserSummary 
      ? sanitizeForEndUser(effectiveEndUserSummary)
      : deriveWhatToExpect(title, message, category),
  };
  
  // PRIORITY 3: Only use templates for very specific, well-understood categories
  // where the template genuinely adds value over the raw message
  const lowerTitle = title.toLowerCase();
  const lowerMessage = message.toLowerCase();
  const lowerCategory = category?.toLowerCase() || '';
  
  // Scheduling-specific: Provide clear, contextual explanations
  if (lowerTitle.includes('shift') || lowerTitle.includes('schedule') || 
      lowerMessage.includes('shift') || lowerMessage.includes('schedule') ||
      lowerCategory.includes('scheduling')) {
    // Determine the specific action for better context
    const isCreated = lowerTitle.includes('created') || lowerMessage.includes('created');
    const isDuplicated = lowerTitle.includes('duplicated') || lowerTitle.includes('copied') || 
                         lowerMessage.includes('duplicated') || lowerMessage.includes('copied');
    const isDeleted = lowerTitle.includes('deleted') || lowerTitle.includes('removed') ||
                      lowerMessage.includes('deleted') || lowerMessage.includes('removed');
    const isUpdated = lowerTitle.includes('updated') || lowerMessage.includes('updated');
    const isSwapped = lowerTitle.includes('swapped') || lowerMessage.includes('swapped');
    const isPublished = lowerTitle.includes('published') || lowerMessage.includes('published');
    
    if (isDuplicated) {
      breakdown.issue = 'A shift was copied to save you time when creating similar shifts.';
      breakdown.solution = 'Trinity copied the shift details including time, location, and requirements.';
      breakdown.outcome = 'The new shift is ready in your schedule. You can edit it if needed.';
    } else if (isCreated) {
      breakdown.issue = 'A new shift has been added to the schedule.';
      breakdown.solution = 'Trinity added the shift to the calendar.';
      breakdown.outcome = 'The shift is now visible in the schedule.';
    } else if (isDeleted) {
      breakdown.issue = 'A shift was removed from the schedule.';
      breakdown.solution = 'Trinity removed the shift and notified any assigned employees.';
      breakdown.outcome = 'The schedule has been updated. Employees have been notified.';
    } else if (isUpdated) {
      breakdown.issue = 'Schedule changes have been saved.';
      breakdown.solution = 'Trinity updated the shift details.';
      breakdown.outcome = 'Your schedule reflects the latest changes.';
    } else if (isSwapped) {
      breakdown.issue = 'Two employees have swapped their shifts.';
      breakdown.solution = 'Trinity processed the shift swap request.';
      breakdown.outcome = 'Both employees have been notified of their new assignments.';
    } else if (isPublished) {
      breakdown.issue = 'The schedule has been published and is now visible to employees.';
      breakdown.solution = 'Trinity published the schedule and sent notifications.';
      breakdown.outcome = 'Employees can now view their upcoming shifts.';
    } else {
      breakdown.issue = 'A scheduling update was processed.';
      breakdown.solution = 'Trinity handled this scheduling change automatically.';
      breakdown.outcome = 'Your schedule is up to date.';
    }
  }
  // Security-specific: Templates add important context about data protection
  else if (lowerCategory.includes('security') || lowerTitle.includes('security') || lowerTitle.includes('patch')) {
    breakdown.issue = 'Security updates protect your data and user access.';
    breakdown.solution = 'Trinity installed the latest security measures.';
    breakdown.outcome = 'Your system is now protected with the latest updates.';
  }
  // Payroll-specific: High-stakes, needs clear outcome
  else if (lowerTitle.includes('payroll') || lowerCategory.includes('payroll')) {
    breakdown.issue = 'Payroll accuracy directly affects employee compensation.';
    breakdown.solution = metadata?.fixApplied 
      ? 'Trinity resolved this automatically.' 
      : 'Trinity flagged this for your review.';
    breakdown.outcome = metadata?.fixApplied 
      ? 'Payroll is processing correctly.'
      : 'Please verify the payroll details.';
  }
  // Compliance-specific: Legal implications need clear action
  else if (lowerTitle.includes('compliance') || lowerTitle.includes('certification') || lowerTitle.includes('license')) {
    breakdown.issue = 'Compliance matters affect your business standing.';
    breakdown.solution = 'Trinity flagged this for your attention.';
    breakdown.outcome = 'Review and update records as needed.';
  }
  
  if (effectiveTechnicalSummary) {
    breakdown.problem = sanitizeForEndUser(humanizeText(effectiveTechnicalSummary));
  }
  if (effectiveImpact) {
    breakdown.issue = sanitizeForEndUser(humanizeText(effectiveImpact));
  }
  if (effectiveResolution) {
    breakdown.solution = sanitizeForEndUser(humanizeText(effectiveResolution));
  }
  if (effectiveEndUserSummary) {
    breakdown.outcome = sanitizeForEndUser(effectiveEndUserSummary);
  }
  
  // Adjust outcome based on action required
  if (metadata?.actionRequired) {
    breakdown.outcome = 'Please review and take action on this item.';
  }
  
  return breakdown;
}

export default {
  humanizeText,
  humanizeTitle,
  getFriendlyMessage,
  humanizeNotification,
  generateEndUserSummary,
  containsTechnicalJargon,
  generateStructuredBreakdown,
  sanitizeForEndUser,
};
