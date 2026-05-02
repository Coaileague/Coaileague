/**
 * Zod validation schemas for Gemini AI responses
 * Ensures type safety and provides fallback handling for malformed responses
 */

import { z } from 'zod';

// Schedule Decision Schema
export const shiftSchema = z.object({
  employeeId: z.string(),
  clientId: z.string().nullable().optional(),
  startTime: z.string(), // ISO 8601
  endTime: z.string(),
  role: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export const conflictSchema = z.object({
  type: z.string(),
  description: z.string(),
  severity: z.enum(['high', 'medium', 'low']),
});

export const scheduleDecisionSchema = z.object({
  shifts: z.array(shiftSchema),
  conflicts: z.array(conflictSchema),
  overallConfidence: z.number().min(0).max(1),
  requiresApproval: z.boolean(),
});

export type ValidatedScheduleDecision = z.infer<typeof scheduleDecisionSchema>;

// Invoice Decision Schema
export const invoiceLineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  rate: z.number(),
  amount: z.number(),
  timeEntryIds: z.array(z.string()),
});

export const invoiceDecisionSchema = z.object({
  clientId: z.string(),
  lineItems: z.array(invoiceLineItemSchema),
  subtotal: z.number(),
  total: z.number(),
  confidence: z.number().min(0).max(1),
  requiresApproval: z.boolean(),
  anomalies: z.array(z.string()),
});

export type ValidatedInvoiceDecision = z.infer<typeof invoiceDecisionSchema>;

// Payroll Decision Schema
export const payrollDecisionSchema = z.object({
  employeeId: z.string(),
  regularHours: z.number(),
  overtimeHours: z.number(),
  regularPay: z.number(),
  overtimePay: z.number(),
  totalPay: z.number(),
  deductions: z.record(z.number()),
  netPay: z.number(),
  confidence: z.number().min(0).max(1),
  requiresApproval: z.boolean(),
  warnings: z.array(z.string()),
});

export type ValidatedPayrollDecision = z.infer<typeof payrollDecisionSchema>;

/**
 * Fallback decisions for when Gemini responses fail validation
 */
export const createFallbackScheduleDecision = (): ValidatedScheduleDecision => ({
  shifts: [],
  conflicts: [{
    type: 'validation_error',
    description: 'AI response validation failed - manual review required',
    severity: 'high',
  }],
  overallConfidence: 0.0,
  requiresApproval: true,
});

export const createFallbackInvoiceDecision = (clientId: string): ValidatedInvoiceDecision => ({
  clientId,
  lineItems: [],
  subtotal: 0,
  total: 0,
  confidence: 0.0,
  requiresApproval: true,
  anomalies: ['AI validation failed - manual review required'],
});

export const createFallbackPayrollDecision = (employeeId: string): ValidatedPayrollDecision => ({
  employeeId,
  regularHours: '0',
  overtimeHours: '0',
  regularPay: 0,
  overtimePay: 0,
  totalPay: 0,
  deductions: {},
  netPay: 0,
  confidence: 0.0,
  requiresApproval: true,
  warnings: ['AI validation failed - manual review required'],
});
