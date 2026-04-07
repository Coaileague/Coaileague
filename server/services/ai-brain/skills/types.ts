import type { AuthenticatedRequest } from '../../../rbac';
import type { Response } from 'express';

/**
 * AI Brain Skill Metadata
 */
export interface SkillManifest {
  id: string; // Unique skill identifier (e.g., 'document-ocr', 'predictive-analytics')
  name: string; // Human-readable name
  version: string; // Semantic version
  description: string; // Skill description
  author: string; // Skill author
  category: SkillCategory;
  requiredTier?: 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic'; // Minimum subscription tier
  requiredRole?: string[]; // Required workspace roles
  capabilities: string[]; // List of capabilities this skill provides
  dependencies?: string[]; // Other skill IDs this skill depends on
  apiEndpoints?: string[]; // Exposed API endpoints
  eventSubscriptions?: string[]; // Events this skill listens to
}

export type SkillCategory =
  | 'analytics' // Predictive analytics, forecasting, insights
  | 'automation' // Task automation, workflow automation
  | 'communication' // Email, SMS, notifications
  | 'document-processing' // OCR, PDF generation, document parsing
  | 'intelligence' // AI insights, recommendations
  | 'integration' // Third-party integrations
  | 'scheduling' // Scheduling optimization, conflict resolution
  | 'compliance' // Compliance monitoring, audit trails
  | 'reporting'; // Report generation, data visualization

/**
 * Skill execution context - passed to all skill methods
 */
export interface SkillContext {
  userId: string;
  workspaceId: string;
  employeeId?: string;
  workspaceRole?: string;
  platformRole?: string;
  subscriptionTier?: string;
  req?: AuthenticatedRequest;
  res?: Response;
}

/**
 * Skill execution result
 */
export interface SkillResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, any>;
  logs?: string[];
}

/**
 * Event emitted by skills
 */
export interface SkillEvent {
  skillId: string;
  eventType: string;
  payload: any;
  timestamp: Date;
  context: SkillContext;
}

/**
 * Skill configuration options
 */
export interface SkillConfig {
  enabled: boolean;
  settings?: Record<string, any>;
}
