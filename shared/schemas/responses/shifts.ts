import { z } from 'zod';

export const ShiftResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  employeeId: z.string().nullable(),
  clientId: z.string().nullable(),
  subClientId: z.string().nullable(),
  siteId: z.string().nullable(),
  billRate: z.string().nullable(),
  payRate: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  startTime: z.string(),
  endTime: z.string(),
  date: z.string().nullable(),
  aiGenerated: z.boolean().nullable(),
  isManuallyLocked: z.boolean().nullable(),
  requiresAcknowledgment: z.boolean().nullable(),
  replacementForShiftId: z.string().nullable(),
  autoReplacementAttempts: z.number().nullable(),
  aiConfidenceScore: z.string().nullable(),
  riskScore: z.string().nullable(),
  riskFactors: z.any().nullable(),
  acknowledgedAt: z.string().nullable(),
  deniedAt: z.string().nullable(),
  denialReason: z.string().nullable(),
  status: z.string(),
  isStaged: z.boolean().nullable(),
  stagedMetadata: z.any().nullable(),
  billableToClient: z.boolean().nullable(),
  hourlyRateOverride: z.string().nullable(),
  travelPay: z.string().nullable(),
  contractRate: z.string().nullable(),
  scenarioId: z.string().nullable(),
  difficultyLevel: z.string().nullable(),
  isTrainingShift: z.boolean().nullable(),
  requiredCertifications: z.any().nullable(),
  preferredEmployeeIds: z.any().nullable(),
  excludedEmployeeIds: z.any().nullable(),
  travelDistanceMiles: z.string().nullable(),
  minimumScore: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).passthrough();

export const ShiftListResponse = z.array(ShiftResponse);

export const PaginatedShiftListResponse = z.object({
  data: z.array(ShiftResponse),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }).passthrough(),
});

export type TShiftResponse = z.infer<typeof ShiftResponse>;
export type TShiftListResponse = z.infer<typeof ShiftListResponse>;
export type TPaginatedShiftListResponse = z.infer<typeof PaginatedShiftListResponse>;
