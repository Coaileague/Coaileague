/**
 * Abuse Detection Service
 * Protects support staff from verbal abuse with warnings, kicks, and bans
 */

// Comprehensive abuse/profanity word list (expandable)
const ABUSE_PATTERNS = [
  // Profanity
  /\bf+u+c+k+\w*/gi,
  /\bs+h+i+t+\w*/gi,
  /\bc+u+n+t+\w*/gi,
  /\ba+s+s+h+o+l+e+\w*/gi,
  /\bb+i+t+c+h+\w*/gi,
  /\bd+a+m+n+\w*/gi,
  /\bc+r+a+p+\w*/gi,
  /\bh+e+l+l+\b/gi,
  
  // Slurs and hate speech (basic detection)
  /\bn+i+g+g+\w*/gi,
  /\bf+a+g+g+\w*/gi,
  /\br+e+t+a+r+d+\w*/gi,
  
  // Threats
  /\bkill\s+(you|yourself|staff|support)\b/gi,
  /\bhurt\s+(you|staff|support)\b/gi,
  /\battack\s+(you|staff|support)\b/gi,
  /\bdie\s+(support|staff|bitch|motherfucker)\b/gi,
  
  // Direct insults
  /\bstupid\s+(staff|support|agent|bitch)\b/gi,
  /\bidiot\s+(staff|support|agent)\b/gi,
  /\bmoron\s+(staff|support|agent)\b/gi,
  /\buseless\s+(staff|support|agent)\b/gi,
  
  // Harassment patterns
  /\bget\s+(fired|out|lost)\b/gi,
  /\bdo\s+your\s+job\b/gi,
  /\bworthless\s+(staff|support|agent|piece)\b/gi,
];

export interface AbuseDetectionResult {
  isAbusive: boolean;
  matchedPatterns: string[];
  severity: 'low' | 'medium' | 'high';
}

/**
 * Detect abusive content in a message
 */
export function detectAbuse(message: string): AbuseDetectionResult {
  const matchedPatterns: string[] = [];
  
  for (const pattern of ABUSE_PATTERNS) {
    if (pattern.test(message)) {
      matchedPatterns.push(pattern.source);
    }
  }
  
  // Determine severity based on matches
  let severity: 'low' | 'medium' | 'high' = 'low';
  
  if (matchedPatterns.length >= 3) {
    severity = 'high';
  } else if (matchedPatterns.length >= 2) {
    severity = 'medium';
  } else if (matchedPatterns.length >= 1) {
    severity = 'low';
  }
  
  // Check for severe patterns (threats, slurs)
  const severePatterns = [
    /\bkill\b/gi,
    /\bhurt\b/gi,
    /\battack\b/gi,
    /\bn+i+g+g+\w*/gi,
    /\bf+a+g+g+\w*/gi,
  ];
  
  for (const pattern of severePatterns) {
    if (pattern.test(message)) {
      severity = 'high';
      break;
    }
  }
  
  return {
    isAbusive: matchedPatterns.length > 0,
    matchedPatterns,
    severity,
  };
}

/**
 * Get appropriate warning message based on violation count and severity
 */
export function getWarningMessage(violationCount: number, severity: 'low' | 'medium' | 'high'): string {
  if (violationCount === 1) {
    return `⚠️ WARNING #${violationCount}: Please be respectful to support staff. Abusive language is not tolerated. Further violations may result in removal from chat.`;
  } else if (violationCount === 2) {
    return `⚠️ FINAL WARNING #${violationCount}: You have been warned multiple times. One more violation will result in immediate removal from this chat.`;
  } else {
    return `🚫 VIOLATION LIMIT EXCEEDED: You have been removed from chat due to repeated abusive behavior. Multiple violations may result in a permanent ban.`;
  }
}

/**
 * Determine action based on violation count
 */
export function determineAction(violationCount: number, severity: 'low' | 'medium' | 'high'): 'warn' | 'kick' | 'ban' {
  // Immediate kick for high severity
  if (severity === 'high' && violationCount >= 1) {
    return 'kick';
  }
  
  // Standard escalation
  if (violationCount >= 5) {
    return 'ban';
  } else if (violationCount >= 3) {
    return 'kick';
  } else {
    return 'warn';
  }
}
