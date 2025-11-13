/**
 * ScheduleOS™ Smart AI Engine
 * Powered by Gemini 2.0 Flash - Auto-schedules employees to open shifts
 * Uses intelligent constraint solving based on availability, skills, and business rules
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { usageMeteringService } from './billing/usageMetering';
import type { Shift, Employee } from '@shared/schema';
import { z } from 'zod';

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface ScheduleSmartRequest {
  openShifts: Shift[];
  availableEmployees: Employee[];
  workspaceId: string;
  userId?: string;
  constraints?: {
    maxShiftsPerEmployee?: number;
    requiredSkills?: string[];
    preferExperience?: boolean;
    balanceWorkload?: boolean;
  };
}

export interface ScheduleSmartResponse {
  assignments: Array<{
    shiftId: string;
    employeeId: string;
    confidence: number; // 0-1 score
    reasoning: string;
  }>;
  unassignedShifts: string[];
  summary: string;
}

// Zod schema for validating Gemini AI responses
const scheduleSmartResponseSchema = z.object({
  assignments: z.array(z.object({
    shiftId: z.string(),
    employeeId: z.string(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string()
  })),
  unassignedShifts: z.array(z.string()),
  summary: z.string()
});

export async function scheduleSmartAI(request: ScheduleSmartRequest): Promise<ScheduleSmartResponse> {
  if (!genAI) {
    throw new Error("Gemini API key not configured - AI scheduling unavailable");
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  // Build context for Gemini
  const shiftsContext = request.openShifts.map((shift, idx) => ({
    index: idx,
    id: shift.id,
    start: shift.startTime,
    end: shift.endTime,
    clientId: shift.clientId,
    description: shift.description
  }));

  const employeesContext = request.availableEmployees.map((emp, idx) => ({
    index: idx,
    id: emp.id,
    name: emp.name,
    email: emp.email,
    role: emp.role
  }));

  const systemPrompt = `You are ScheduleOS™, AutoForce's intelligent scheduling AI.

Your task: Assign employees to open shifts based on these rules:
1. **MUST**: Respect employee availability (if provided)
2. **MUST**: Balance workload across employees (avoid overloading one person)
3. **PREFER**: Assign employees with matching skills/roles
4. **PREFER**: Minimize gaps between shifts for same employee
5. **AVOID**: Double-booking (one employee, one shift at a time)

Constraints:
- Max shifts per employee: ${request.constraints?.maxShiftsPerEmployee || 'unlimited'}
- Required skills: ${request.constraints?.requiredSkills?.join(', ') || 'none'}
- Prefer experience: ${request.constraints?.preferExperience !== false}
- Balance workload: ${request.constraints?.balanceWorkload !== false}

Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "assignments": [
    {
      "shiftId": "shift-id-here",
      "employeeId": "employee-id-here",
      "confidence": 0.95,
      "reasoning": "Brief reason for this assignment"
    }
  ],
  "unassignedShifts": ["shift-id-if-cant-assign"],
  "summary": "Overall summary of scheduling decisions"
}`;

  const userPrompt = `**Open Shifts:**
${JSON.stringify(shiftsContext, null, 2)}

**Available Employees:**
${JSON.stringify(employeesContext, null, 2)}

Assign employees to shifts. Return valid JSON only.`;

  try {
    const chat = model.startChat({
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.3, // Lower temperature for more deterministic scheduling
      },
      systemInstruction: systemPrompt,
    });

    const result = await chat.sendMessage(userPrompt);
    const response = result.response;
    
    // Record token usage for billing
    const usage = response.usageMetadata;
    const totalTokens = (usage?.promptTokenCount || 0) + (usage?.candidatesTokenCount || 0);
    
    if (totalTokens > 0 && request.workspaceId) {
      await usageMeteringService.recordUsage({
        workspaceId: request.workspaceId,
        userId: request.userId,
        featureKey: 'scheduleos_smart_ai',
        usageType: 'token',
        usageAmount: totalTokens,
        usageUnit: 'tokens',
        activityType: 'ai_schedule_assignment',
        metadata: {
          model: 'gemini-2.0-flash-exp',
          shiftsCount: request.openShifts.length,
          employeesCount: request.availableEmployees.length,
          promptTokens: usage?.promptTokenCount,
          completionTokens: usage?.candidatesTokenCount,
        }
      });
      console.log(`🧠 ScheduleOS™ AI - ${totalTokens} tokens - ${request.openShifts.length} shifts analyzed`);
    }
    
    // Parse JSON response with structured fallback handling
    const responseText = response.text().trim();
    
    // Remove markdown code blocks if present
    let cleanedResponse = responseText;
    if (responseText.startsWith('```')) {
      cleanedResponse = responseText
        .replace(/^```json?\n/, '')
        .replace(/\n```$/, '')
        .trim();
    }
    
    // Safe JSON parsing with error handling
    let parsedResponse: unknown;
    try {
      parsedResponse = JSON.parse(cleanedResponse);
    } catch (parseError: any) {
      console.error("ScheduleOS™ AI - Invalid JSON response:", cleanedResponse);
      throw new Error(`AI returned non-JSON response: ${parseError.message}`);
    }
    
    // Validate response structure with Zod
    const validationResult = scheduleSmartResponseSchema.safeParse(parsedResponse);
    if (!validationResult.success) {
      console.error("ScheduleOS™ AI - Invalid response structure:", validationResult.error.errors);
      throw new Error(`AI response validation failed: ${JSON.stringify(validationResult.error.errors)}`);
    }
    
    return validationResult.data;
  } catch (error: any) {
    console.error("ScheduleOS™ AI error:", error);
    throw new Error(`AI scheduling error: ${error.message || 'Unknown error'}`);
  }
}

export function isScheduleSmartAvailable(): boolean {
  return !!genAI;
}
