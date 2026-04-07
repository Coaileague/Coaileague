import { z } from 'zod';

// RC7 (Phase 2): Request-body validation schemas for financial API endpoints.
// These schemas validate the HTTP layer — separate from the DB insert schemas in shared/schema.ts.
// All monetary fields are validated as strings (our financial value contract) or numbers
// that the endpoint converts through toFinancialString before any arithmetic.

// ─── Invoice PATCH ───────────────────────────────────────────────────────────

export const invoiceUpdateBodySchema = z.object({
  status: z.enum(['draft', 'sent', 'pending', 'partial', 'paid', 'overdue', 'cancelled', 'void', 'refunded', 'disputed', 'failed']).optional(),
  voidReason: z.string().min(5, 'voidReason must be at least 5 characters').max(2000).optional(),
  totalAmount: z.string().regex(/^\d+(\.\d{1,4})?$/, 'totalAmount must be a positive decimal string').optional(),
  subtotal: z.string().regex(/^\d+(\.\d{1,4})?$/, 'subtotal must be a positive decimal string').optional(),
  taxAmount: z.string().regex(/^\d+(\.\d{1,4})?$/, 'taxAmount must be a non-negative decimal string').optional(),
  notes: z.string().max(2000).optional(),
  dueDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
}).strict();

// ─── Mark-paid ───────────────────────────────────────────────────────────────

const PAYMENT_METHODS = ['manual', 'check', 'ach', 'wire', 'cash', 'credit_card', 'zelle', 'venmo', 'other'] as const;

export const markPaidBodySchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS).optional().default('manual'),
  paymentDate: z.string().optional(),
  notes: z.string().max(2000).optional(),
  referenceNumber: z.string().max(255).optional(),
});

// ─── Partial payment ─────────────────────────────────────────────────────────

export const partialPaymentBodySchema = z.object({
  amount: z.number().positive('amount must be a positive number'),
  paymentMethod: z.enum(PAYMENT_METHODS).optional().default('manual'),
  payerEmail: z.string().email().optional().or(z.literal('')),
  payerName: z.string().max(255).optional(),
  notes: z.string().max(2000).optional(),
});

// ─── Credit memo ─────────────────────────────────────────────────────────────

export const creditMemoBodySchema = z.object({
  originalInvoiceId: z.string().uuid('originalInvoiceId must be a valid UUID'),
  amount: z.number().positive('amount must be a positive number'),
  reason: z.string().min(1, 'reason is required').max(2000),
});

// ─── Adjustment (invoice) ─────────────────────────────────────────────────────

const ADJUSTMENT_TYPES = ['credit', 'discount', 'refund', 'correction', 'late_fee', 'write_off'] as const;

export const invoiceAdjustmentBodySchema = z.object({
  invoiceId: z.string().uuid('invoiceId must be a valid UUID'),
  adjustmentType: z.enum(ADJUSTMENT_TYPES).optional().default('correction'),
  description: z.string().max(2000).optional(),
  // Amount arrives as a number from clients; positive-only enforced by the existing
  // parsedAmount check, but Zod catches type errors before that code runs.
  amount: z.number().positive('amount must be a positive number'),
  reason: z.string().max(2000).optional(),
});

// ─── Late fees ────────────────────────────────────────────────────────────────

export const applyLateFeesBodySchema = z.object({
  gracePeriodDays: z.number().int().min(0).max(365).optional().default(0),
  lateFeeType: z.enum(['flat', 'percentage']).optional().default('flat'),
  lateFeeAmount: z.number().positive('lateFeeAmount must be a positive number').optional(),
});

// ─── Payroll ─────────────────────────────────────────────────────────────────

export const payrollGenerateBodySchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'periodStart must be YYYY-MM-DD'),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'periodEnd must be YYYY-MM-DD'),
  employeeIds: z.array(z.string().uuid()).optional(),
  includeOvertime: z.boolean().optional().default(true),
  notes: z.string().max(2000).optional(),
});
