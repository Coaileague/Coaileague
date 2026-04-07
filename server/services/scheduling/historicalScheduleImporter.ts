/**
 * HISTORICAL SCHEDULE IMPORTER - Learn from Past Schedules
 * =========================================================
 * 
 * Allows organizations to:
 * 1. Upload historical schedules (CSV, JSON)
 * 2. Import from GetSling, WhenIWork, etc.
 * 3. Learn scheduling patterns from historical data
 * 4. Create recurring templates from patterns
 */

import { db } from '../../db';
import { shifts, employees, clients, scheduleTemplates } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { parse as csvParse } from 'csv-parse/sync';
import { createLogger } from '../../lib/logger';
const log = createLogger('historicalScheduleImporter');


interface ImportedShift {
  date: string;
  startTime: string;
  endTime: string;
  employeeName?: string;
  employeeId?: string;
  clientName?: string;
  clientId?: string;
  position?: string;
  notes?: string;
}

interface LearnedPattern {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  clientId: string | null;
  frequency: number;
  avgDuration: number;
  commonPositions: string[];
}

interface ImportResult {
  success: boolean;
  shiftsImported: number;
  patternsLearned: number;
  errors: string[];
  patterns: LearnedPattern[];
}

class HistoricalScheduleImporterService {
  private static instance: HistoricalScheduleImporterService;

  static getInstance(): HistoricalScheduleImporterService {
    if (!HistoricalScheduleImporterService.instance) {
      HistoricalScheduleImporterService.instance = new HistoricalScheduleImporterService();
    }
    return HistoricalScheduleImporterService.instance;
  }

  /**
   * Import historical schedule from CSV
   */
  async importFromCSV(
    workspaceId: string,
    csvContent: string,
    options: {
      createShifts: boolean;
      learnPatterns: boolean;
      dateFormat: 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'DD/MM/YYYY';
      timeFormat: '12h' | '24h';
    }
  ): Promise<ImportResult> {
    const errors: string[] = [];
    let shiftsImported = 0;

    try {
      // DoS guard: reject CSV files above 5 MB to prevent memory exhaustion
      // during synchronous parsing of maliciously large files.
      const MAX_CSV_BYTES = 5 * 1024 * 1024;
      if (Buffer.byteLength(csvContent, 'utf8') > MAX_CSV_BYTES) {
        return {
          success: false,
          shiftsImported: 0,
          errors: ['CSV file exceeds maximum allowed size of 5 MB'],
          warnings: [],
          patterns: [],
        };
      }

      // Parse CSV
      const records = csvParse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      log.info(`[HistoricalImporter] Parsed ${records.length} records from CSV`);

      // Map column names (flexible matching)
      const mappedRecords: ImportedShift[] = records.map((record: any, index: number) => {
        try {
          return this.mapCSVRecord(record, options);
        } catch (e: any) {
          errors.push(`Row ${index + 1}: ${e.message}`);
          return null;
        }
      }).filter(Boolean);

      // Get existing employees and clients for matching
      const [existingEmployees, existingClients] = await Promise.all([
        db.select().from(employees).where(eq(employees.workspaceId, workspaceId)),
        db.select().from(clients).where(eq(clients.workspaceId, workspaceId)),
      ]);

      const employeeNameMap = new Map(
        existingEmployees.map(e => [`${e.firstName} ${e.lastName}`.toLowerCase(), e.id])
      );
      const clientNameMap = new Map(
        existingClients.map(c => [c.companyName?.toLowerCase() || '', c.id])
      );

      // Process each record
      const importedShifts: any[] = [];

      for (const record of mappedRecords) {
        if (!record) continue;

        // Match employee
        let employeeId: string | null = null;
        if (record.employeeName) {
          employeeId = employeeNameMap.get(record.employeeName.toLowerCase()) || null;
        }

        // Match client
        let clientId: string | null = null;
        if (record.clientName) {
          clientId = clientNameMap.get(record.clientName.toLowerCase()) || null;
        }

        // Parse date and times
        const shiftDate = this.parseDate(record.date, options.dateFormat);
        const startTime = this.parseTime(record.startTime, shiftDate, options.timeFormat);
        const endTime = this.parseTime(record.endTime, shiftDate, options.timeFormat);

        if (!shiftDate || !startTime || !endTime) {
          errors.push(`Invalid date/time: ${record.date} ${record.startTime}-${record.endTime}`);
          continue;
        }

        importedShifts.push({
          workspaceId,
          employeeId,
          clientId,
          title: record.position || 'Imported Shift',
          description: record.notes || 'Imported from historical data',
          startTime,
          endTime,
          status: employeeId ? 'scheduled' : 'draft',
          aiGenerated: false,
          isHistoricalImport: true,
        });
      }

      // Create shifts if requested
      if (options.createShifts && importedShifts.length > 0) {
        await db.insert(shifts).values(importedShifts);
        shiftsImported = importedShifts.length;
      }

      // Learn patterns
      let patterns: LearnedPattern[] = [];
      if (options.learnPatterns) {
        patterns = this.analyzePatterns(importedShifts);
      }

      return {
        success: true,
        shiftsImported,
        patternsLearned: patterns.length,
        errors,
        patterns,
      };

    } catch (error: any) {
      log.error('[HistoricalImporter] Import failed:', error);
      return {
        success: false,
        shiftsImported: 0,
        patternsLearned: 0,
        errors: [(error instanceof Error ? error.message : String(error))],
        patterns: [],
      };
    }
  }

  /**
   * Map CSV record to ImportedShift
   */
  private mapCSVRecord(record: any, options: any): ImportedShift {
    // Flexible column name matching
    const getField = (names: string[]): string => {
      for (const name of names) {
        const value = record[name] || record[name.toLowerCase()] || record[name.toUpperCase()];
        if (value) return value;
      }
      return '';
    };

    return {
      date: getField(['date', 'Date', 'shift_date', 'ShiftDate', 'day']),
      startTime: getField(['start', 'Start', 'start_time', 'StartTime', 'clock_in', 'ClockIn', 'from']),
      endTime: getField(['end', 'End', 'end_time', 'EndTime', 'clock_out', 'ClockOut', 'to']),
      employeeName: getField(['employee', 'Employee', 'employee_name', 'EmployeeName', 'name', 'staff']),
      clientName: getField(['client', 'Client', 'client_name', 'ClientName', 'site', 'location']),
      position: getField(['position', 'Position', 'role', 'Role', 'job', 'Job', 'title']),
      notes: getField(['notes', 'Notes', 'comments', 'Comments', 'description']),
    };
  }

  /**
   * Parse date string
   */
  private parseDate(dateStr: string, format: string): Date | null {
    if (!dateStr) return null;

    try {
      const parts = dateStr.split(/[\/\-\.]/);
      if (parts.length !== 3) return null;

      let year: number, month: number, day: number;

      switch (format) {
        case 'MM/DD/YYYY':
          [month, day, year] = parts.map(Number);
          break;
        case 'DD/MM/YYYY':
          [day, month, year] = parts.map(Number);
          break;
        case 'YYYY-MM-DD':
        default:
          [year, month, day] = parts.map(Number);
          break;
      }

      // Handle 2-digit years
      if (year < 100) {
        year += year > 50 ? 1900 : 2000;
      }

      return new Date(year, month - 1, day);
    } catch {
      return null;
    }
  }

  /**
   * Parse time string
   */
  private parseTime(timeStr: string, baseDate: Date, format: string): Date | null {
    if (!timeStr || !baseDate) return null;

    try {
      let hours: number, minutes: number = 0;

      if (format === '12h') {
        // Handle 12-hour format (e.g., "9:00 AM", "5:30 PM")
        const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm)?/i);
        if (!match) return null;

        hours = parseInt(match[1]);
        minutes = parseInt(match[2] || '0');
        const meridiem = (match[3] || 'AM').toUpperCase();

        if (meridiem === 'PM' && hours !== 12) hours += 12;
        if (meridiem === 'AM' && hours === 12) hours = 0;
      } else {
        // Handle 24-hour format (e.g., "09:00", "17:30")
        const match = timeStr.match(/(\d{1,2}):(\d{2})/);
        if (!match) return null;

        hours = parseInt(match[1]);
        minutes = parseInt(match[2]);
      }

      const result = new Date(baseDate);
      result.setHours(hours, minutes, 0, 0);
      return result;
    } catch {
      return null;
    }
  }

  /**
   * Analyze patterns from imported shifts
   */
  private analyzePatterns(importedShifts: any[]): LearnedPattern[] {
    const patternMap = new Map<string, {
      count: number;
      totalDuration: number;
      positions: string[];
      clientId: string | null;
      dayOfWeek: number;
      startHour: number;
      endHour: number;
    }>();

    for (const shift of importedShifts) {
      const startTime = new Date(shift.startTime);
      const endTime = new Date(shift.endTime);
      const dayOfWeek = startTime.getDay();
      const startHour = startTime.getHours();
      const endHour = endTime.getHours();
      const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);

      const key = `${dayOfWeek}-${startHour}-${shift.clientId || 'any'}`;

      const existing = patternMap.get(key) || {
        count: 0,
        totalDuration: 0,
        positions: [],
        clientId: shift.clientId,
        dayOfWeek,
        startHour,
        endHour,
      };

      existing.count++;
      existing.totalDuration += duration;
      if (shift.title && !existing.positions.includes(shift.title)) {
        existing.positions.push(shift.title);
      }

      patternMap.set(key, existing);
    }

    // Convert to LearnedPattern array
    return Array.from(patternMap.values())
      .filter(p => p.count >= 2) // Only patterns that occur at least twice
      .map(p => ({
        dayOfWeek: p.dayOfWeek,
        startHour: p.startHour,
        endHour: p.endHour,
        clientId: p.clientId,
        frequency: p.count,
        avgDuration: p.totalDuration / p.count,
        commonPositions: p.positions,
      }))
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Generate recurring template from learned patterns
   */
  async generateTemplateFromPatterns(
    workspaceId: string,
    patterns: LearnedPattern[],
    templateName: string
  ): Promise<{
    templateId: string;
    shiftsInTemplate: number;
  }> {
    if (patterns.length === 0) {
      return { templateId: '', shiftsInTemplate: 0 };
    }

    const shiftPatterns = patterns.map(p => ({
      clientId: p.clientId,
      dayOfWeek: p.dayOfWeek,
      startTimeOffset: p.startHour * 60,
      endTimeOffset: p.endHour * 60,
      title: p.commonPositions?.[0] || `Shift (${p.dayOfWeek}d ${p.startHour}:00-${p.endHour}:00)`,
      description: `Learned pattern: ${p.frequency} occurrences, avg ${p.avgDuration.toFixed(1)}h`,
    }));

    const [template] = await db.insert(scheduleTemplates).values({
      workspaceId,
      name: templateName,
      description: `Auto-generated from ${patterns.length} learned patterns`,
      shiftPatterns,
    }).returning();

    return {
      templateId: template.id,
      shiftsInTemplate: shiftPatterns.length,
    };
  }
}

export const historicalScheduleImporter = HistoricalScheduleImporterService.getInstance();
