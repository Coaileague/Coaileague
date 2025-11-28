/**
 * What's New Service - Dynamic Platform Updates Feed
 * Provides API for platform announcements, features, and updates
 */

import { db } from '../db';
import { isFeatureEnabled, PLATFORM } from '@shared/platformConfig';

export interface PlatformUpdate {
  id: string;
  title: string;
  description: string;
  date: string;
  category: 'feature' | 'improvement' | 'bugfix' | 'security' | 'announcement';
  badge?: string;
  version?: string;
  learnMoreUrl?: string;
  isNew?: boolean;
  priority?: number;
}

const platformUpdates: PlatformUpdate[] = [
  {
    id: 'sms-notifications-2025-11-28',
    title: 'SMS Notifications',
    description: 'Receive shift reminders, schedule changes, and approval notifications via SMS. Connect your Twilio account to enable text message alerts for your entire team.',
    date: '2025-11-28',
    category: 'feature',
    badge: 'NEW',
    version: '2.1.0',
    isNew: true,
    priority: 1,
  },
  {
    id: 'calendar-sync-2025-11-28',
    title: 'Calendar Integration',
    description: 'Export your schedule to Google Calendar, Outlook, or any calendar app with ICS support. One-click sync keeps your personal calendar updated with work shifts.',
    date: '2025-11-28',
    category: 'feature',
    badge: 'NEW',
    version: '2.1.0',
    isNew: true,
    priority: 2,
  },
  {
    id: 'timesheet-reports-2025-11-28',
    title: 'Timesheet Reports & Export',
    description: 'Generate comprehensive timesheet reports with one click. Export to CSV for payroll processing, compliance audits, or client billing.',
    date: '2025-11-28',
    category: 'feature',
    badge: 'NEW',
    version: '2.1.0',
    isNew: true,
    priority: 3,
  },
  {
    id: 'shift-swapping-2025-11-28',
    title: 'Shift Swapping',
    description: 'Employees can now request to swap shifts with coworkers. Managers receive swap requests for approval, making schedule flexibility easier than ever.',
    date: '2025-11-28',
    category: 'feature',
    badge: 'NEW',
    version: '2.1.0',
    isNew: true,
    priority: 4,
  },
  {
    id: 'recurring-shifts-2025-11-28',
    title: 'Recurring Shifts',
    description: 'Create weekly or bi-weekly recurring shifts that automatically populate your schedule. Save hours of scheduling time with pattern-based shift creation.',
    date: '2025-11-28',
    category: 'feature',
    badge: 'NEW',
    version: '2.1.0',
    isNew: true,
    priority: 5,
  },
  {
    id: 'mobile-schedule-2025-11-20',
    title: 'Mobile-First AI Scheduling',
    description: 'Completely redesigned mobile scheduling experience with week navigation, real-time stats cards (hours, cost, overtime, open shifts), swipe-friendly day tabs, and streamlined shift creation.',
    date: '2025-11-20',
    category: 'feature',
    version: '2.0.5',
  },
  {
    id: 'analytics-platform-2025-11-04',
    title: 'AI Analytics Platform',
    description: 'Launch of autonomous AI analytics with real-time insights, cost-saving recommendations, and anomaly detection. Get actionable recommendations with confidence scores.',
    date: '2025-11-04',
    category: 'feature',
    version: '2.0.0',
  },
  {
    id: 'natural-language-search-2025-11-04',
    title: 'Natural Language Search',
    description: 'Search your entire workforce database using natural language. Ask questions like "Show me employees hired this month" and get instant results.',
    date: '2025-11-04',
    category: 'feature',
    version: '2.0.0',
  },
  {
    id: 'gamification-2025-11-15',
    title: 'Employee Gamification',
    description: 'Boost engagement with achievements, points, leaderboards, and streak tracking. Recognize top performers and motivate your team.',
    date: '2025-11-15',
    category: 'feature',
    version: '2.0.3',
  },
  {
    id: 'animated-logo-2025-11-05',
    title: 'CoAIleague Brand Refresh',
    description: 'New animated logo featuring the AI network gradient design representing autonomous workforce management at scale.',
    date: '2025-11-05',
    category: 'improvement',
    version: '2.0.1',
  },
  {
    id: 'security-2025-11-03',
    title: 'Security Enhancements',
    description: 'Improved authentication flow with account locking, password complexity requirements, and session management upgrades.',
    date: '2025-11-03',
    category: 'security',
    version: '2.0.0',
  },
];

export function getUpdates(options?: {
  limit?: number;
  category?: string;
  includeAll?: boolean;
}): PlatformUpdate[] {
  if (!isFeatureEnabled('enableWhatsNew')) {
    return [];
  }

  let updates = [...platformUpdates];

  if (options?.category) {
    updates = updates.filter(u => u.category === options.category);
  }

  updates.sort((a, b) => {
    if (a.priority && b.priority) return a.priority - b.priority;
    if (a.priority) return -1;
    if (b.priority) return 1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  if (options?.limit && !options?.includeAll) {
    updates = updates.slice(0, options.limit);
  }

  return updates;
}

export function getLatestUpdates(count: number = 5): PlatformUpdate[] {
  return getUpdates({ limit: count });
}

export function getNewFeatures(): PlatformUpdate[] {
  return platformUpdates.filter(u => u.isNew === true);
}

export function getUpdateById(id: string): PlatformUpdate | undefined {
  return platformUpdates.find(u => u.id === id);
}

export function getUpdatesByCategory(category: PlatformUpdate['category']): PlatformUpdate[] {
  return getUpdates({ category });
}

export function getUpdateStats() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const recentUpdates = platformUpdates.filter(
    u => new Date(u.date) >= thirtyDaysAgo
  );

  return {
    total: platformUpdates.length,
    recentCount: recentUpdates.length,
    newFeatures: platformUpdates.filter(u => u.isNew).length,
    byCategory: {
      feature: platformUpdates.filter(u => u.category === 'feature').length,
      improvement: platformUpdates.filter(u => u.category === 'improvement').length,
      bugfix: platformUpdates.filter(u => u.category === 'bugfix').length,
      security: platformUpdates.filter(u => u.category === 'security').length,
      announcement: platformUpdates.filter(u => u.category === 'announcement').length,
    },
    latestVersion: PLATFORM.version,
  };
}

export function addUpdate(update: Omit<PlatformUpdate, 'id'>): PlatformUpdate {
  const id = `${update.title.toLowerCase().replace(/\s+/g, '-')}-${update.date}`;
  const newUpdate = { ...update, id };
  platformUpdates.unshift(newUpdate);
  return newUpdate;
}
