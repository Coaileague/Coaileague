/**
 * HelpAI Registry Service - Phases 2-5
 * Manages the master API registry, payload validation, and API discovery
 */

import { db } from '../../db';
import {
  helpaiRegistry,
  type InsertHelpaiRegistry,
  type HelpaiRegistry,
} from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { createLogger } from '../../lib/logger';
const log = createLogger('helpaiRegistryService');


export interface APIRegistryPayload {
  apiName: string;
  apiVersion: string;
  apiEndpoint: string;
  apiCategory: string;
  description?: string;
  requestSchema?: Record<string, unknown>;
  responseSchema?: Record<string, unknown>;
  requiredScopes?: string[];
  rateLimitPerMinute?: number;
  rateLimitPerDay?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface RegistryValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedPayload?: APIRegistryPayload;
}

export class HelpaiRegistryService {
  /**
   * Register a new API in the registry
   */
  async registerAPI(
    payload: APIRegistryPayload,
    createdBy: string
  ): Promise<HelpaiRegistry> {
    const validation = this.validateAPIPayload(payload);
    if (!validation.isValid) {
      throw new Error(`Invalid API payload: ${validation.errors.join(', ')}`);
    }

    const sanitized = validation.sanitizedPayload!;

    const [registry] = await db
      .insert(helpaiRegistry)
      .values({
        apiName: sanitized.apiName,
        apiVersion: sanitized.apiVersion,
        apiEndpoint: sanitized.apiEndpoint,
        apiCategory: sanitized.apiCategory,
        description: sanitized.description,
        requestSchema: sanitized.requestSchema as any,
        responseSchema: sanitized.responseSchema as any,
        requiredScopes: sanitized.requiredScopes,
        rateLimitPerMinute: sanitized.rateLimitPerMinute,
        rateLimitPerDay: sanitized.rateLimitPerDay,
        tags: sanitized.tags,
        metadata: sanitized.metadata as any,
        isActive: true,
        isPublic: true,
        createdBy,
      })
      .returning();

    log.info(`✅ [HelpAI Registry] Registered API: ${sanitized.apiName} v${sanitized.apiVersion}`);
    return registry;
  }

  /**
   * Validate API payload against schema
   */
  validateAPIPayload(payload: any): RegistryValidationResult {
    const errors: string[] = [];

    // Required fields
    if (!payload.apiName || typeof payload.apiName !== 'string') {
      errors.push('apiName is required and must be a string');
    }
    if (!payload.apiVersion || typeof payload.apiVersion !== 'string') {
      errors.push('apiVersion is required and must be a string (e.g., "1.0.0")');
    }
    if (!payload.apiEndpoint || typeof payload.apiEndpoint !== 'string') {
      errors.push('apiEndpoint is required and must be a valid URL');
    }
    if (!payload.apiCategory || typeof payload.apiCategory !== 'string') {
      errors.push('apiCategory is required (hr, payroll, scheduling, compliance)');
    }

    // Validate URL format
    if (payload.apiEndpoint && typeof payload.apiEndpoint === 'string') {
      try {
        new URL(payload.apiEndpoint);
      } catch (e) {
        errors.push('apiEndpoint must be a valid URL');
      }
    }

    // Validate category
    const validCategories = ['hr', 'payroll', 'scheduling', 'compliance', 'benefits', 'time_tracking'];
    if (payload.apiCategory && !validCategories.includes(payload.apiCategory)) {
      errors.push(
        `apiCategory must be one of: ${validCategories.join(', ')}`
      );
    }

    // Optional validations
    if (payload.rateLimitPerMinute && payload.rateLimitPerMinute < 1) {
      errors.push('rateLimitPerMinute must be at least 1');
    }
    if (payload.rateLimitPerDay && payload.rateLimitPerDay < 1) {
      errors.push('rateLimitPerDay must be at least 1');
    }

    // Validate JSON schemas if provided
    if (payload.requestSchema && typeof payload.requestSchema !== 'object') {
      errors.push('requestSchema must be a valid JSON object');
    }
    if (payload.responseSchema && typeof payload.responseSchema !== 'object') {
      errors.push('responseSchema must be a valid JSON object');
    }

    if (errors.length > 0) {
      return { isValid: false, errors };
    }

    // Sanitize and return
    const sanitized: APIRegistryPayload = {
      apiName: payload.apiName.toUpperCase(),
      apiVersion: payload.apiVersion.trim(),
      apiEndpoint: payload.apiEndpoint.trim(),
      apiCategory: payload.apiCategory.toLowerCase(),
      description: payload.description?.toString().trim(),
      requestSchema: payload.requestSchema,
      responseSchema: payload.responseSchema,
      requiredScopes: Array.isArray(payload.requiredScopes)
        ? payload.requiredScopes
        : undefined,
      rateLimitPerMinute: payload.rateLimitPerMinute || 60,
      rateLimitPerDay: payload.rateLimitPerDay || 10000,
      tags: Array.isArray(payload.tags) ? payload.tags : undefined,
      metadata: typeof payload.metadata === 'object' ? payload.metadata : undefined,
    };

    return { isValid: true, errors: [], sanitizedPayload: sanitized };
  }

  /**
   * Get all active APIs in the registry
   */
  async getAllActiveAPIs(): Promise<HelpaiRegistry[]> {
    return db.query.helpaiRegistry.findMany({
      where: eq(helpaiRegistry.isActive, true),
    });
  }

  /**
   * Get APIs by category
   */
  async getAPIsByCategory(category: string): Promise<HelpaiRegistry[]> {
    return db.query.helpaiRegistry.findMany({
      where: and(
        eq(helpaiRegistry.isActive, true),
        eq(helpaiRegistry.apiCategory, category.toLowerCase())
      ),
    });
  }

  /**
   * Get a specific API by name
   */
  async getAPIByName(apiName: string): Promise<HelpaiRegistry | null> {
    const results = await db.query.helpaiRegistry.findMany({
      where: eq(helpaiRegistry.apiName, apiName.toUpperCase()),
      limit: 1,
    });
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Get APIs by tag
   */
  async getAPIsByTag(tag: string): Promise<HelpaiRegistry[]> {
    const results = await db
      .select()
      .from(helpaiRegistry)
      .where(
        and(
          eq(helpaiRegistry.isActive, true),
          // PostgreSQL array contains check would happen here
          // For now, we'll filter in-memory for simplicity
        )
      );

    return results.filter(api => api.tags && api.tags.includes(tag));
  }

  /**
   * Update API registry entry
   */
  async updateAPI(
    apiName: string,
    updates: Partial<APIRegistryPayload>,
    updatedBy: string
  ): Promise<HelpaiRegistry | null> {
    const existing = await this.getAPIByName(apiName);
    if (!existing) {
      throw new Error(`API not found: ${apiName}`);
    }

    // Validate updates
    const merged = { ...existing, ...updates };
    const validation = this.validateAPIPayload(merged);
    if (!validation.isValid) {
      throw new Error(`Invalid API updates: ${validation.errors.join(', ')}`);
    }

    const [updated] = await db
      .update(helpaiRegistry)
      .set({
        ...updates,
        updatedBy,
        updatedAt: new Date(),
      })
      .where(eq(helpaiRegistry.id, existing.id))
      .returning();

    log.info(`✅ [HelpAI Registry] Updated API: ${apiName}`);
    return updated;
  }

  /**
   * Disable an API
   */
  async disableAPI(apiName: string, updatedBy: string): Promise<void> {
    const existing = await this.getAPIByName(apiName);
    if (!existing) {
      throw new Error(`API not found: ${apiName}`);
    }

    await db
      .update(helpaiRegistry)
      .set({
        isActive: false,
        updatedBy,
        updatedAt: new Date(),
      })
      .where(eq(helpaiRegistry.id, existing.id));

    log.info(`✅ [HelpAI Registry] Disabled API: ${apiName}`);
  }

  /**
   * Get registry statistics
   */
  async getRegistryStats(): Promise<{
    totalAPIs: number;
    activeAPIs: number;
    categoryCounts: Record<string, number>;
    totalRegistrations: number;
  }> {
    const allAPIs = await db
      .select()
      .from(helpaiRegistry);

    const activeAPIs = allAPIs.filter(api => api.isActive);
    const categories: Record<string, number> = {};

    allAPIs.forEach(api => {
      categories[api.apiCategory] = (categories[api.apiCategory] || 0) + 1;
    });

    return {
      totalAPIs: allAPIs.length,
      activeAPIs: activeAPIs.length,
      categoryCounts: categories,
      totalRegistrations: allAPIs.length,
    };
  }
}

export const helpaiRegistryService = new HelpaiRegistryService();
