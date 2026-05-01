/**
 * RECURRING SCHEDULE TEMPLATES - Automated Shift Generation
 * ==========================================================
 * 
 * Features:
 * 1. Weekly recurring templates
 * 2. Pattern-based shift generation
 * 3. Automatic shift creation for future weeks
 * 4. Template management (create, update, delete)
 */

import { db } from '../../db';
import { shifts, clients, scheduleTemplates as templatesTable } from '@shared/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
const log = createLogger('recurringScheduleTemplates');


interface TemplateShift {
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  startTime: string; // HH:MM format
  endTime: string;   // HH:MM format
  title: string;
  clientId: string | null;
  position?: string;
  requiredEmployees: number;
  notes?: string;
}

interface ScheduleTemplate {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  shifts: TemplateShift[];
  isActive: boolean;
  createdAt: Date;
  lastApplied: Date | null;
}

interface GenerationResult {
  success: boolean;
  shiftsCreated: number;
  weekStart: Date;
  weekEnd: Date;
  errors: string[];
}

class RecurringScheduleTemplateService {
  private static instance: RecurringScheduleTemplateService;

  static getInstance(): RecurringScheduleTemplateService {
    if (!RecurringScheduleTemplateService.instance) {
      RecurringScheduleTemplateService.instance = new RecurringScheduleTemplateService();
    }
    return RecurringScheduleTemplateService.instance;
  }

  /**
   * Create a new schedule template
   */
  async createTemplate(
    workspaceId: string,
    name: string,
    description: string,
    templateShifts: TemplateShift[]
  ): Promise<ScheduleTemplate> {
    const [template] = await db.insert(templatesTable).values({
      workspaceId,
      name,
      description,
      shiftPatterns: templateShifts as any,
    }).returning();

    log.info(`[RecurringTemplates] Created template "${name}" with ${templateShifts.length} shifts`);

    return template as unknown as ScheduleTemplate;
  }

  /**
   * Create template from existing week's schedule
   */
  async createTemplateFromWeek(
    workspaceId: string,
    weekStartDate: Date,
    templateName: string
  ): Promise<ScheduleTemplate> {
    const weekStart = new Date(weekStartDate);
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // Get all shifts for the week
    const weekShifts = await db.select()
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        gte(shifts.startTime, weekStart),
        lte(shifts.startTime, weekEnd)
      ));

    // Convert to template shifts
    const templateShifts: TemplateShift[] = weekShifts.map(shift => {
      const startTime = new Date(shift.startTime);
      const endTime = new Date(shift.endTime);

      return {
        dayOfWeek: startTime.getDay(),
        startTime: `${startTime.getHours().toString().padStart(2, '0')}:${startTime.getMinutes().toString().padStart(2, '0')}`,
        endTime: `${endTime.getHours().toString().padStart(2, '0')}:${endTime.getMinutes().toString().padStart(2, '0')}`,
        title: shift.title || 'Shift',
        clientId: shift.clientId,
        position: shift.title || undefined,
        requiredEmployees: 1,
        notes: (shift as any).notes || undefined,
      };
    });

    return this.createTemplate(workspaceId, templateName, `Template created from week of ${weekStart.toLocaleDateString()}`, templateShifts);
  }

  /**
   * Apply template to generate shifts for a specific week
   */
  async applyTemplate(
    templateId: string,
    targetWeekStart: Date,
    options: {
      overwriteExisting: boolean;
      assignEmployees: boolean;
    }
  ): Promise<GenerationResult> {
    const [template] = await db.select()
      .from(templatesTable)
      .where(eq(templatesTable.id, templateId))
      .limit(1);

    if (!template) {
      return {
        success: false,
        shiftsCreated: 0,
        weekStart: targetWeekStart,
        weekEnd: targetWeekStart,
        errors: ['Template not found'],
      };
    }

    const errors: string[] = [];
    const shiftsToCreate: any[] = [];

    // Calculate the week's dates
    const weekStart = new Date(targetWeekStart);
    weekStart.setHours(0, 0, 0, 0);
    // Adjust to Monday if not already
    const dayOfWeek = weekStart.getDay();
    if (dayOfWeek !== 1) {
      weekStart.setDate(weekStart.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    }

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // Check for existing shifts if not overwriting
    if (!options.overwriteExisting) {
      const existingShifts = await db.select()
        .from(shifts)
        .where(and(
          eq(shifts.workspaceId, template.workspaceId),
          gte(shifts.startTime, weekStart),
          lte(shifts.startTime, weekEnd)
        ));

      if (existingShifts.length > 0) {
        errors.push(`Week already has ${existingShifts.length} shifts. Use overwrite option to replace.`);
        return {
          success: false,
          shiftsCreated: 0,
          weekStart,
          weekEnd,
          errors,
        };
      }
    }

    // Generate shifts from template
    for (const templateShift of (template.shiftPatterns || []) as unknown as TemplateShift[]) {
      // Calculate the actual date for this shift
      const shiftDate = new Date(weekStart);
      const daysToAdd = templateShift.dayOfWeek === 0 ? 6 : templateShift.dayOfWeek - 1; // Monday = 0 offset
      shiftDate.setDate(shiftDate.getDate() + daysToAdd);

      // Parse start and end times
      const [startHour, startMin] = templateShift.startTime.split(':').map(Number);
      const [endHour, endMin] = templateShift.endTime.split(':').map(Number);

      const startTime = new Date(shiftDate);
      startTime.setHours(startHour, startMin, 0, 0);

      const endTime = new Date(shiftDate);
      endTime.setHours(endHour, endMin, 0, 0);

      // Handle overnight shifts
      if (endTime <= startTime) {
        endTime.setDate(endTime.getDate() + 1);
      }

      // Create shifts for required number of employees
      for (let i = 0; i < templateShift.requiredEmployees; i++) {
        shiftsToCreate.push({
          workspaceId: template.workspaceId,
          employeeId: null, // Will be assigned by autonomous scheduler
          clientId: templateShift.clientId,
          title: templateShift.title,
          position: templateShift.position,
          description: templateShift.notes || `Generated from template: ${template.name}`,
          startTime,
          endTime,
          status: 'draft',
          aiGenerated: true,
          isFromTemplate: true,
          templateId: template.id,
        });
      }
    }

    // Delete existing shifts if overwriting
    if (options.overwriteExisting) {
      await db.delete(shifts)
        .where(and(
          eq(shifts.workspaceId, template.workspaceId),
          gte(shifts.startTime, weekStart),
          lte(shifts.startTime, weekEnd),
          sql`${shifts.isFromTemplate} = true`
        ));
    }

    // Insert new shifts
    if (shiftsToCreate.length > 0) {
      await db.insert(shifts).values(shiftsToCreate);
    }

    // Update template usage count
    await db.update(templatesTable)
      .set({ updatedAt: new Date() })
      .where(eq(templatesTable.id, templateId));

    log.info(`[RecurringTemplates] Applied template "${template.name}" - created ${shiftsToCreate.length} shifts`);

    return {
      success: true,
      shiftsCreated: shiftsToCreate.length,
      weekStart,
      weekEnd,
      errors,
    };
  }

  /**
   * Get all templates for a workspace
   */
  async getWorkspaceTemplates(workspaceId: string): Promise<ScheduleTemplate[]> {
    const results = await db.select()
      .from(templatesTable)
      .where(eq(templatesTable.workspaceId, workspaceId));
    return results as unknown as ScheduleTemplate[];
  }

  /**
   * Get template by ID
   */
  async getTemplate(templateId: string): Promise<ScheduleTemplate | undefined> {
    const [template] = await db.select()
      .from(templatesTable)
      .where(eq(templatesTable.id, templateId))
      .limit(1);
    return template as unknown as ScheduleTemplate | undefined;
  }

  /**
   * Delete template
   */
  async deleteTemplate(templateId: string): Promise<boolean> {
    const result = await db.delete(templatesTable)
      .where(eq(templatesTable.id, templateId))
      .returning();
    return result.length > 0;
  }

  /**
   * Update template
   */
  async updateTemplate(
    templateId: string,
    updates: Partial<Pick<ScheduleTemplate, 'name' | 'description'>>
  ): Promise<ScheduleTemplate | null> {
    const dbUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    const [updated] = await db.update(templatesTable)
      .set(dbUpdates)
      .where(eq(templatesTable.id, templateId))
      .returning();
    
    return (updated as unknown as ScheduleTemplate) || null;
  }

  /**
   * Generate next week's schedule automatically
   */
  async generateNextWeek(workspaceId: string): Promise<{
    templatesApplied: number;
    totalShiftsCreated: number;
    results: GenerationResult[];
  }> {
    const activeTemplates = await this.getWorkspaceTemplates(workspaceId);

    if (activeTemplates.length === 0) {
      return {
        templatesApplied: 0,
        totalShiftsCreated: 0,
        results: [],
      };
    }

    // Calculate next week's start
    const now = new Date();
    const daysUntilNextMonday = (8 - now.getDay()) % 7 || 7;
    const nextWeekStart = new Date(now);
    nextWeekStart.setDate(nextWeekStart.getDate() + daysUntilNextMonday);
    nextWeekStart.setHours(0, 0, 0, 0);

    const results: GenerationResult[] = [];
    let totalShiftsCreated = 0;

    for (const template of activeTemplates) {
      const result = await this.applyTemplate(template.id, nextWeekStart, {
        overwriteExisting: false,
        assignEmployees: false,
      });

      results.push(result);
      if (result.success) {
        totalShiftsCreated += result.shiftsCreated;
      }
    }

    return {
      templatesApplied: activeTemplates.length,
      totalShiftsCreated,
      results,
    };
  }
}

export const recurringScheduleTemplates = RecurringScheduleTemplateService.getInstance();
