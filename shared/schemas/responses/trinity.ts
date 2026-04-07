import { z } from 'zod';

export const TrinityActionResponse = z.object({
  success: z.boolean(),
  message: z.string().nullable().optional(),
  data: z.any().optional(),
}).passthrough();

export const TrinityMessageResponse = z.object({
  id: z.string().optional(),
  content: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  timestamp: z.string().nullable().optional(),
}).passthrough();

export const TrinityMemoryResponse = z.object({
  memories: z.array(z.object({
    id: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
    type: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
  }).passthrough()).optional(),
  total: z.number().optional(),
}).passthrough();

export const TrinityKnowledgeResponse = z.object({
  nodes: z.array(z.object({
    id: z.string().nullable().optional(),
    label: z.string().nullable().optional(),
    type: z.string().nullable().optional(),
  }).passthrough()).optional(),
}).passthrough();

export const TrinityDiagnosticsResponse = z.object({
  status: z.string().nullable().optional(),
  checks: z.any().optional(),
}).passthrough();

export type TTrinityActionResponse = z.infer<typeof TrinityActionResponse>;
