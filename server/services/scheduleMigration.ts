/**
 * Schedule Migration Service
 * Uses Gemini's multimodal vision capabilities to extract schedule data
 * from PDFs/images from external scheduling apps (Deputy, WhenIWork, GetSling)
 * With AI Guard Rails: Input validation, rate limiting, audit logging
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { usageMeteringService } from './billing/usageMetering';
import { aiCreditGateway } from './billing/aiCreditGateway';
import { aiGuardRails, type AIRequestContext } from './aiGuardRails';
import { z } from 'zod';
import { createLogger } from '../lib/logger';
const log = createLogger('scheduleMigration');


const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// Schema for extracted shift data
export const extractedShiftSchema = z.object({
  employeeName: z.string(),
  startDate: z.string(), // ISO date string
  startTime: z.string(), // HH:MM format
  endDate: z.string(),
  endTime: z.string(),
  position: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  confidence: z.number().min(0).max(1), // Extraction confidence per shift
});

export const migrationResponseSchema = z.object({
  shifts: z.array(extractedShiftSchema),
  patterns: z.object({
    discovered: z.array(z.string()), // Patterns AI discovered (e.g., "Never schedule Jane for >2 closing shifts")
    softConstraints: z.array(z.string()), // Detected soft rules
  }),
  summary: z.string(),
  extractionConfidence: z.number().min(0).max(100), // Overall extraction quality
  warnings: z.array(z.string()).optional(),
});

export type ExtractedShift = z.infer<typeof extractedShiftSchema>;
export type MigrationResponse = z.infer<typeof migrationResponseSchema>;

export interface ScheduleMigrationRequest {
  fileData: string; // Base64-encoded image or PDF
  mimeType: string; // image/png, image/jpeg, application/pdf
  sourceApp?: string; // Deputy, WhenIWork, GetSling, etc.
  workspaceId: string;
  userId?: string;
}

/**
 * Extract schedule data from uploaded file using Gemini Vision
 */
export async function extractScheduleFromFile(
  request: ScheduleMigrationRequest
): Promise<MigrationResponse> {
  if (!genAI) {
    throw new Error("Gemini API key not configured - schedule migration unavailable");
  }

  // Guard Rails: Create request context
  const requestContext: AIRequestContext = {
    workspaceId: request.workspaceId,
    userId: request.userId || 'system',
    organizationId: 'platform',
    requestId: crypto.randomUUID().slice(0, 8),
    timestamp: new Date(),
    operation: 'schedule_migration'
  };

  // Guard Rails: Validate file data (size check)
  const validation = aiGuardRails.validateRequest(
    `File migration: ${request.mimeType}`,
    requestContext,
    'schedule_migration'
  );
  if (!validation.isValid) {
    throw new Error(`Schedule migration validation failed: ${validation.errors.join(', ')}`);
  }

  const authResult = await aiCreditGateway.preAuthorize(
    request.workspaceId,
    request.userId,
    'ai_migration'
  );
  if (!authResult.authorized) {
    throw new Error(`Schedule migration blocked: ${authResult.reason}`);
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const systemPrompt = `You are CoAIleague AI Scheduling™ Migration Assistant.

**MISSION**: Extract schedule data from ${request.sourceApp || "external scheduling app"} screenshots/PDFs.

**ANALYSIS TASKS**:
1. **OCR & Table Extraction**: Identify tables/grids with schedule data (Date, Employee, Start Time, End Time, Position, Location)
2. **Pattern Recognition**: Detect scheduling patterns and soft constraints from historical data:
   - Employee preferences (e.g., "Jane never works >2 closing shifts in a row")
   - Workload balancing patterns
   - Shift rotation rules
   - Client/location preferences
3. **Data Structuring**: Convert to structured JSON format

**QUALITY STANDARDS**:
- extractionConfidence: 0-100% (based on image clarity, table structure quality, data completeness)
- confidence (per shift): 0-1 (how certain you are about this individual extraction)
- warnings: Flag ambiguous data, unreadable sections, or missing fields

**OUTPUT FORMAT** (JSON only, no markdown):
{
  "shifts": [
    {
      "employeeName": "John Doe",
      "startDate": "2025-01-15",
      "startTime": "09:00",
      "endDate": "2025-01-15",
      "endTime": "17:00",
      "position": "Technician",
      "location": "Site A",
      "notes": "",
      "confidence": 0.98
    }
  ],
  "patterns": {
    "discovered": [
      "Employee 'Jane Smith' consistently avoids weekend shifts",
      "Lead Technician role always assigned to employees with 5+ years experience"
    ],
    "softConstraints": [
      "Balance shifts evenly across team members",
      "Avoid scheduling same employee for closing then opening (clopening)"
    ]
  },
  "summary": "Extracted 24 shifts from Deputy schedule export. Detected balanced workload distribution pattern.",
  "extractionConfidence": 95,
  "warnings": ["Row 12: End time partially obscured, estimated as 17:00"]
}

**IMPORTANT**:
- Return ONLY valid JSON (no markdown code blocks)
- Set low confidence for ambiguous data
- Flag unreadable sections in warnings array`;

  try {
    // Prepare vision input - CRITICAL: Must use proper Gemini Vision format
    const parts = [
      { text: systemPrompt },
      {
        inlineData: {
          mimeType: request.mimeType,
          data: request.fileData, // base64-encoded data
        },
      },
    ];

    const result = await model.generateContent({ contents: [{ role: 'user', parts }] }); // withGemini
    const response = result.response;
    const text = response.text();

    // Parse and validate response
    let jsonData: any;
    try {
      // Strip markdown code blocks if present
      const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
      jsonData = JSON.parse(cleanedText);
    } catch (parseError) {
      log.error("Failed to parse Gemini response:", text);
      throw new Error("AI returned invalid JSON format");
    }

    const validatedResponse = migrationResponseSchema.parse(jsonData);

    // Finalize billing through credit gateway (pre-authorized above)
    const usage = response.usageMetadata;
    const totalTokens = (usage?.promptTokenCount || 0) + (usage?.candidatesTokenCount || 0);

    await aiCreditGateway.finalizeBilling(
      (authResult as any).effectiveWorkspaceId,
      request.userId,
      'ai_migration',
      totalTokens,
      { model: 'gemini-2.5-flash', sourceApp: request.sourceApp }
    ).catch(err => log.error('[ScheduleMigration] Billing error:', err));

    if (totalTokens > 0 && request.workspaceId) {
      const { aiMeteringService } = await import('./billing/aiMeteringService');
      aiMeteringService.recordAiCall({
        workspaceId: request.workspaceId,
        modelName: 'gemini-2.5-flash',
        callType: 'schedule_migration_vision',
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        triggeredByUserId: request.userId,
      });
      await usageMeteringService.recordUsage({
        workspaceId: request.workspaceId,
        userId: request.userId,
        featureKey: 'scheduleos_migration',
        usageType: 'token',
        usageAmount: totalTokens,
        usageUnit: 'tokens',
        activityType: 'schedule_migration_vision',
        metadata: {
          model: 'gemini-2.5-flash',
          sourceApp: request.sourceApp,
          shiftsExtracted: validatedResponse.shifts.length,
          extractionConfidence: validatedResponse.extractionConfidence,
          promptTokens: usage?.promptTokenCount,
          completionTokens: usage?.candidatesTokenCount,
        }
      });
      log.info(`📸 Schedule Migration (Vision) - ${totalTokens} tokens - ${validatedResponse.shifts.length} shifts extracted`);
    }

    return validatedResponse;
  } catch (error: any) {
    log.error("Schedule migration error:", error);
    throw new Error(`Failed to extract schedule: ${(error instanceof Error ? error.message : String(error))}`);
  }
}
