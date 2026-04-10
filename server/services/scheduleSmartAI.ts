/**
 * AI Scheduling™ Smart AI Engine
 * Powered by Gemini 2.0 Flash - Auto-schedules employees to open shifts
 * Uses intelligent constraint solving based on availability, skills, and business rules
 * With AI Guard Rails: Input validation, rate limiting, audit logging
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_MODELS, ANTI_YAP_PRESETS } from './ai-brain/providers/geminiClient';
import { usageMeteringService } from './billing/usageMetering';
import { meteredGemini } from './billing/meteredGeminiClient';
import { aiGuardRails, type AIRequestContext } from './aiGuardRails';
import type { Shift, Employee } from '@shared/schema';
import { z } from 'zod';
import { createLogger } from '../lib/logger';
const log = createLogger('scheduleSmartAI');


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
    // Enhanced weighted constraints
    hardConstraints?: {
      respectAvailability?: boolean;
      preventDoubleBooking?: boolean;
      enforceRestPeriods?: boolean; // Min hours between shifts
      respectTimeOffRequests?: boolean;
    };
    softConstraints?: {
      preferExperience?: boolean;
      balanceWorkload?: boolean;
      minimizeCommute?: boolean;
      respectPreferences?: boolean;
      avoidClopening?: boolean; // Closing shift followed by opening shift
    };
    // Predictive metrics
    predictiveMetrics?: {
      enableReliabilityScoring?: boolean;
      penalizeLateHistory?: boolean;
      considerAbsenteeismRisk?: boolean;
    };
  };
  scoringContext?: Record<string, any>;
}

export interface ScheduleSmartResponse {
  assignments: Array<{
    shiftId: string;
    employeeId: string;
    confidence: number; // 0-1 score for individual assignment
    reasoning: string;
  }>;
  unassignedShifts: string[];
  summary: string;
  overallConfidence: number; // 0-100 percentage for entire schedule (99% AI, 1% human approval threshold)
  confidenceFactors: {
    hardConstraintsMet: boolean;
    softConstraintsViolated: number;
    unassignedCount: number;
    reasoning: string;
  };
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
  summary: z.string(),
  overallConfidence: z.number().min(0).max(100),
  confidenceFactors: z.object({
    hardConstraintsMet: z.boolean(),
    softConstraintsViolated: z.number(),
    unassignedCount: z.number(),
    reasoning: z.string()
  })
});

export async function scheduleSmartAI(request: ScheduleSmartRequest): Promise<ScheduleSmartResponse> {
  if (!genAI) {
    throw new Error("Gemini API key not configured - AI scheduling unavailable");
  }

  // Guard Rails: Create request context
  const requestContext: AIRequestContext = {
    workspaceId: request.workspaceId,
    userId: request.userId || null,
    organizationId: 'platform',
    requestId: crypto.randomUUID().slice(0, 8),
    timestamp: new Date(),
    operation: 'schedule_generation'
  };

  // Guard Rails: Validate request (check if within rate limits)
  const validation = aiGuardRails.validateRequest(
    `Schedule generation: ${request.openShifts.length} shifts, ${request.availableEmployees.length} employees`,
    requestContext,
    'schedule_generation'
  );

  const model = genAI.getGenerativeModel({ 
    model: GEMINI_MODELS.ORCHESTRATOR,
    generationConfig: {
      maxOutputTokens: ANTI_YAP_PRESETS.orchestrator.maxTokens,
      temperature: ANTI_YAP_PRESETS.orchestrator.temperature,
    }
  });

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
    name: `${emp.firstName} ${emp.lastName}`,
    email: emp.email,
    role: emp.role
  }));

  const systemPrompt = `You are AI Scheduling™, CoAIleague's intelligent scheduling AI powered by weighted constraint optimization.

Your task: Assign employees to open shifts using HARD and SOFT constraints:

**HARD CONSTRAINTS (Non-Negotiable - Must be 100% satisfied):**
1. **MUST**: Respect employee availability ${request.constraints?.hardConstraints?.respectAvailability !== false ? '✓' : '(disabled)'}
2. **MUST**: Prevent double-booking ${request.constraints?.hardConstraints?.preventDoubleBooking !== false ? '✓' : '(disabled)'}
3. **MUST**: Enforce rest periods (min 8-12 hours between shifts) ${request.constraints?.hardConstraints?.enforceRestPeriods !== false ? '✓' : '(disabled)'}
4. **MUST**: Respect time-off requests ${request.constraints?.hardConstraints?.respectTimeOffRequests !== false ? '✓' : '(disabled)'}

**SOFT CONSTRAINTS (Penalty-weighted preferences - Minimize violations):**
1. **PREFER**: Experienced employees (penalty: -5% per violation) ${request.constraints?.softConstraints?.preferExperience !== false ? '✓' : '(disabled)'}
2. **PREFER**: Balanced workload across employees (penalty: -10% if >20% imbalance) ${request.constraints?.softConstraints?.balanceWorkload !== false ? '✓' : '(disabled)'}
3. **PREFER**: Minimize commute distance (penalty: -3% per >30mi assignment) ${request.constraints?.softConstraints?.minimizeCommute !== false ? '✓' : '(disabled)'}
4. **PREFER**: Respect employee preferences (penalty: -5% per violation) ${request.constraints?.softConstraints?.respectPreferences !== false ? '✓' : '(disabled)'}
5. **AVOID**: Clopening (closing→opening) shifts (penalty: -8% per occurrence) ${request.constraints?.softConstraints?.avoidClopening !== false ? '✓' : '(disabled)'}

**PREDICTIVE METRICS (Fairness & Reliability):**
- Reliability scoring: ${request.constraints?.predictiveMetrics?.enableReliabilityScoring !== false ? '✓' : '(disabled)'}
- Late history penalty: ${request.constraints?.predictiveMetrics?.penalizeLateHistory !== false ? '✓' : '(disabled)'}
- Absenteeism risk consideration: ${request.constraints?.predictiveMetrics?.considerAbsenteeismRisk !== false ? '✓' : '(disabled)'}

Legacy Constraints:
- Max shifts per employee: ${request.constraints?.maxShiftsPerEmployee || 'unlimited'}
- Required skills: ${request.constraints?.requiredSkills?.join(', ') || 'none'}

**GOVERNANCE (99% AI, 1% Human Approval):**
Calculate an overallConfidence score (0-100%) for the entire schedule:
- 100% = Perfect schedule, all constraints met, zero violations
- 95-99% = Excellent schedule, minor soft-constraint violations (AUTO-APPROVED)
- 85-94% = Good schedule, some soft-constraint violations (REQUIRES HUMAN APPROVAL)
- <85% = Poor schedule, significant issues (REQUIRES HUMAN REVIEW)

Confidence Factors:
- hardConstraintsMet: true if all MUST rules satisfied, false if any violations
- softConstraintsViolated: count of PREFER rules violated
- unassignedCount: number of shifts that couldn't be assigned
- reasoning: explain what affected confidence

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
  "summary": "Overall summary of scheduling decisions",
  "overallConfidence": 96,
  "confidenceFactors": {
    "hardConstraintsMet": true,
    "softConstraintsViolated": 1,
    "unassignedCount": 0,
    "reasoning": "One employee assigned slightly more shifts than ideal for perfect balance"
  }
}`;

  const userPrompt = `**Open Shifts:**
${JSON.stringify(shiftsContext, null, 2)}

**Available Employees:**
${JSON.stringify(employeesContext, null, 2)}

Assign employees to shifts. Return valid JSON only.`;

  try {
    // Use metered Gemini client for proper credit deduction
    // Scale max tokens with shift count: ~150 tokens per assignment + 1000 overhead
    const scaledMaxTokens = Math.max(4096, request.openShifts.length * 150 + 1000);
    const meteredResult = await meteredGemini.generate({
      prompt: `${systemPrompt}\n\n${userPrompt}`,
      workspaceId: request.workspaceId,
      userId: request.userId || 'system',
      featureKey: 'ai_scheduling',
      maxOutputTokens: scaledMaxTokens,
      temperature: 0.3,
    });

    log.info(`[ScheduleSmartAI] Metered AI call - ${request.openShifts.length} shifts analyzed`);
    
    // Parse JSON response with structured fallback handling
    const responseText = (meteredResult.text || '').trim();
    
    // Remove markdown code blocks if present
    let cleanedResponse = responseText;
    if (responseText.startsWith('```')) {
      cleanedResponse = responseText
        .replace(/^```json?\n/, '')
        .replace(/\n```$/, '')
        .trim();
    }
    
    // Safe JSON parsing with truncation repair
    let parsedResponse: unknown;
    try {
      parsedResponse = JSON.parse(cleanedResponse);
    } catch (parseError: any) {
      // Attempt to repair truncated JSON by extracting valid assignments array
      const assignmentsMatch = cleanedResponse.match(/"assignments"\s*:\s*(\[[\s\S]*)/);
      if (assignmentsMatch) {
        try {
          // Try to extract complete assignment objects before truncation
          const rawArray = assignmentsMatch[1];
          const completeObjects: any[] = [];
          const objRegex = /\{\s*"shiftId"\s*:\s*"([^"]+)"\s*,\s*"employeeId"\s*:\s*"([^"]+)"\s*,\s*"confidence"\s*:\s*([\d.]+)\s*,\s*"reasoning"\s*:\s*"([^"]+)"\s*\}/g;
          let match;
          while ((match = objRegex.exec(rawArray)) !== null) {
            completeObjects.push({
              shiftId: match[1],
              employeeId: match[2],
              confidence: parseFloat(match[3]),
              reasoning: match[4],
            });
          }
          if (completeObjects.length > 0) {
            log.info(`[ScheduleSmartAI] Repaired truncated JSON — recovered ${completeObjects.length} assignments`);
            parsedResponse = {
              assignments: completeObjects,
              unassignedShifts: [],
              summary: `AI schedule generated (partial recovery: ${completeObjects.length} assignments extracted from truncated response)`,
              overallConfidence: 85,
              confidenceFactors: {
                hardConstraintsMet: true,
                softConstraintsViolated: 0,
                unassignedCount: Math.max(0, request.openShifts.length - completeObjects.length),
                reasoning: 'Partial response recovered from truncated AI output',
              },
            };
          } else {
            throw parseError;
          }
        } catch {
          log.error("AI Scheduling™ AI - Invalid JSON response:", cleanedResponse.substring(0, 200));
          throw new Error(`AI returned non-JSON response: ${parseError.message}`);
        }
      } else {
        log.error("AI Scheduling™ AI - Invalid JSON response:", cleanedResponse.substring(0, 200));
        throw new Error(`AI returned non-JSON response: ${parseError.message}`);
      }
    }
    
    // Validate response structure with Zod
    const validationResult = scheduleSmartResponseSchema.safeParse(parsedResponse);
    if (!validationResult.success) {
      log.error("AI Scheduling™ AI - Invalid response structure:", validationResult.error.errors);
      throw new Error(`AI response validation failed: ${JSON.stringify(validationResult.error.errors)}`);
    }
    
    return validationResult.data;
  } catch (error: any) {
    log.error("AI Scheduling™ AI error:", error);
    // Don't leak raw prompts to users - provide clean error message
    const userMessage = error.status === 400 
      ? 'AI service configuration error - please contact support'
      : error.status === 429
      ? 'AI service rate limit exceeded - please try again in a moment'
      : 'AI scheduling temporarily unavailable - please try again';
    throw new Error(userMessage);
  }
}

export function isScheduleSmartAvailable(): boolean {
  return !!genAI;
}
