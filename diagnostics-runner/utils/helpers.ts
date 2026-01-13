/**
 * Helper Utilities
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

export function generateId(): string {
  return randomBytes(8).toString('hex');
}

export function generateRunId(): string {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[-:T]/g, '')
    .replace(/\.\d{3}Z$/, '');
  return `run_${timestamp}_${generateId().slice(0, 6)}`;
}

export async function ensureDir(dirPath: string): Promise<void> {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

export function truncate(str: string, maxLength: number = 200): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 100);
}

export function categorySeverity(category: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
  switch (category) {
    case 'captcha_blocker':
    case 'page_error':
      return 'critical';
    case 'network_failure':
    case 'workflow_failure':
      return 'high';
    case 'console_error':
    case 'broken_image':
      return 'medium';
    case 'broken_link':
    case 'ui_error':
      return 'low';
    default:
      return 'info';
  }
}

export function getRecommendedFix(category: string, details?: string): string {
  switch (category) {
    case 'captcha_blocker':
      return 'Consider disabling CAPTCHA for test environment or implementing bypass token';
    case 'console_error':
      return 'Check browser console for JavaScript errors and fix the source';
    case 'network_failure':
      return `Fix API endpoint returning error status. Check server logs for details.`;
    case 'broken_image':
      return 'Verify image URL is correct and image file exists';
    case 'broken_link':
      return 'Update or remove the broken link';
    case 'ui_error':
      return 'Review UI for error messages and fix underlying issue';
    case 'workflow_failure':
      return 'Debug the workflow step that failed';
    case 'timeout':
      return 'Page is slow to load. Optimize performance or increase timeout';
    default:
      return 'Review and fix the issue';
  }
}
