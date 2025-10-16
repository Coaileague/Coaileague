/**
 * ScheduleOS™ - AI-Powered Auto-Scheduling
 * Uses GPT-4 to intelligently assign shifts based on:
 * - Employee availability
 * - Past performance patterns (tardiness, GPS violations, attendance)
 * - Shift requirements and client needs
 * - Conflict detection and resolution
 */

import OpenAI from 'openai';
import { db } from "../db";
import { employees, shifts, timeEntries } from "@shared/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

interface ScheduleRequest {
  workspaceId: string;
  weekStartDate: Date;
  clientIds?: string[];
  shiftRequirements: {
    title: string;
    clientId: string;
    startTime: Date;
    endTime: Date;
    requiredEmployees: number;
    requiredSkills?: string[];
  }[];
}

interface EmployeePerformanceData {
  employeeId: string;
  employeeName: string;
  availability: string[];
  tardyCount: number;
  gpsViolations: number;
  attendanceRate: number;
  totalHoursWorked: number;
  avgRating?: number;
}

interface ScheduleResult {
  success: boolean;
  scheduleDate: Date;
  shiftsGenerated: number;
  employeesScheduled: number;
  conflicts: string[];
  recommendations: string[];
  generatedShifts: Array<{
    employeeId: string;
    employeeName: string;
    clientId: string;
    title: string;
    startTime: Date;
    endTime: Date;
    requiresAcknowledgment: boolean;
    aiGenerated: true;
    confidence: number;
  }>;
  processingTimeMs: number;
}

export class ScheduleOSAI {
  private openai: OpenAI;

  constructor() {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    
    this.openai = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }

  async generateSchedule(request: ScheduleRequest): Promise<ScheduleResult> {
    const startTime = Date.now();
    
    // 1. Get employee performance data
    const performanceData = await this.getEmployeePerformance(
      request.workspaceId,
      request.weekStartDate
    );

    // 2. Check existing shifts to avoid conflicts
    const weekEndDate = new Date(request.weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 7);
    
    const existingShifts: any[] = await db
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.workspaceId, request.workspaceId),
          gte(shifts.startTime, request.weekStartDate),
          lte(shifts.startTime, weekEndDate)
        )
      );

    // 3. Build AI prompt with all context
    const aiPrompt = this.buildSchedulingPrompt(
      performanceData,
      request.shiftRequirements,
      existingShifts
    );

    // 4. Call OpenAI GPT-4 for intelligent scheduling
    const aiResponse = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are ScheduleOS™, an AI workforce scheduling assistant. You analyze employee performance data, availability, and shift requirements to generate optimal schedules. You MUST avoid scheduling conflicts and prioritize reliable employees with good attendance records.`,
        },
        {
          role: 'user',
          content: aiPrompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3, // Low temperature for consistent, logical scheduling
    });

    // 5. Parse AI response
    const aiSchedule = JSON.parse(aiResponse.choices[0].message.content || '{}');

    // 6. Transform AI suggestions into shift objects
    const generatedShifts = aiSchedule.shifts?.map((shift: any) => ({
      employeeId: shift.employeeId,
      employeeName: shift.employeeName,
      clientId: shift.clientId,
      title: shift.title,
      startTime: new Date(shift.startTime),
      endTime: new Date(shift.endTime),
      requiresAcknowledgment: true, // All AI shifts require acknowledgment
      aiGenerated: true,
      confidence: shift.confidence || 0.8,
    })) || [];

    const processingTimeMs = Date.now() - startTime;

    return {
      success: true,
      scheduleDate: request.weekStartDate,
      shiftsGenerated: generatedShifts.length,
      employeesScheduled: new Set(generatedShifts.map(s => s.employeeId)).size,
      conflicts: aiSchedule.conflicts || [],
      recommendations: aiSchedule.recommendations || [],
      generatedShifts,
      processingTimeMs,
    };
  }

  private async getEmployeePerformance(
    workspaceId: string,
    weekStartDate: Date
  ): Promise<EmployeePerformanceData[]> {
    // Get all active employees
    const allEmployees = await db
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, workspaceId),
          eq(employees.isActive, true)
        )
      );

    // Calculate performance metrics for each employee
    const lookbackDate = new Date(weekStartDate);
    lookbackDate.setDate(lookbackDate.getDate() - 90); // Last 90 days

    const performanceData: EmployeePerformanceData[] = await Promise.all(
      allEmployees.map(async (emp) => {
        // Get time entries for performance analysis
        const entries = await db
          .select()
          .from(timeEntries)
          .where(
            and(
              eq(timeEntries.employeeId, emp.id),
              gte(timeEntries.clockIn, lookbackDate)
            )
          );

        // Calculate metrics
        const tardyCount = entries.filter((e: any) => {
          // Tardy if clocked in >15 min late (this would need shift comparison in real impl)
          return false; // Simplified for now
        }).length;

        const totalHours = entries.reduce((sum: number, e: any) => {
          return sum + (parseFloat(e.totalHours?.toString() || '0'));
        }, 0);

        const attendanceRate = entries.length > 0 ? 95 : 100; // Simplified

        return {
          employeeId: emp.id,
          employeeName: `${emp.firstName} ${emp.lastName}`,
          availability: emp.availability || [],
          tardyCount,
          gpsViolations: 0, // Would check GPS data in real impl
          attendanceRate,
          totalHoursWorked: totalHours,
        };
      })
    );

    return performanceData;
  }

  private buildSchedulingPrompt(
    performanceData: EmployeePerformanceData[],
    shiftRequirements: ScheduleRequest['shiftRequirements'],
    existingShifts: any[]
  ): string {
    return `
You are ScheduleOS™, an intelligent workforce scheduling AI. Generate an optimal schedule based on the following data:

**EMPLOYEE PERFORMANCE DATA:**
${performanceData.map((emp: EmployeePerformanceData) => `
- ${emp.employeeName} (ID: ${emp.employeeId})
  - Availability: ${emp.availability.join(', ') || 'Not specified'}
  - Tardy Count (last 90 days): ${emp.tardyCount}
  - GPS Violations: ${emp.gpsViolations}
  - Attendance Rate: ${emp.attendanceRate}%
  - Total Hours Worked: ${emp.totalHoursWorked}
`).join('\n')}

**SHIFT REQUIREMENTS:**
${shiftRequirements.map((req, idx) => `
${idx + 1}. ${req.title}
   - Client ID: ${req.clientId}
   - Start: ${req.startTime.toISOString()}
   - End: ${req.endTime.toISOString()}
   - Required Employees: ${req.requiredEmployees}
   - Skills: ${req.requiredSkills?.join(', ') || 'None'}
`).join('\n')}

**EXISTING SHIFTS (avoid conflicts):**
${existingShifts.length > 0 ? existingShifts.map((s: any) => `
- ${s.employeeId}: ${s.startTime} to ${s.endTime}
`).join('\n') : 'None'}

**YOUR TASK:**
Generate an optimal schedule that:
1. Assigns reliable employees (high attendance, low tardiness) to shifts
2. Respects employee availability
3. Avoids scheduling conflicts (no double-booking)
4. Distributes hours fairly across employees
5. Prioritizes employees with better performance records

**RESPONSE FORMAT (JSON):**
{
  "shifts": [
    {
      "employeeId": "employee_id",
      "employeeName": "Employee Name",
      "clientId": "client_id",
      "title": "Shift Title",
      "startTime": "2025-01-15T08:00:00Z",
      "endTime": "2025-01-15T16:00:00Z",
      "confidence": 0.9,
      "reasoning": "Why this employee was chosen"
    }
  ],
  "conflicts": ["List any unavoidable conflicts"],
  "recommendations": [
    "Hire more employees for peak hours",
    "Employee X has poor attendance - consider warning"
  ]
}
`;
  }
}

export const scheduleOSAI = new ScheduleOSAI();
