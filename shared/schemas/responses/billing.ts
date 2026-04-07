import { z } from 'zod';

export const BillingInvoiceResponse = z.object({
  id: z.string(),
  amount: z.union([z.string(), z.number()]).nullable(),
  status: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: z.string().nullable(),
  paidAt: z.string().nullable(),
}).passthrough();

export const BillingInvoiceListResponse = z.array(BillingInvoiceResponse);

export const UsageSummaryResponse = z.object({
  creditsUsed: z.union([z.string(), z.number()]).nullable(),
  creditsRemaining: z.union([z.string(), z.number()]).nullable(),
  billingCycle: z.string().nullable(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
}).passthrough();

export const AddonPlanResponse = z.object({
  id: z.string().optional(),
  name: z.string().nullable().optional(),
  price: z.union([z.string(), z.number()]).nullable().optional(),
  description: z.string().nullable().optional(),
}).passthrough();

export const AddonPlanListResponse = z.array(AddonPlanResponse);

export const CreditPackResponse = z.object({
  id: z.string(),
  name: z.string().nullable(),
  credits: z.number().nullable(),
  price: z.union([z.string(), z.number()]).nullable(),
  description: z.string().nullable(),
}).passthrough();

export const CreditPackListResponse = z.array(CreditPackResponse);

export const AutoRechargeConfigResponse = z.object({
  success: z.boolean(),
  config: z.object({
    enabled: z.boolean(),
    threshold: z.number(),
    amount: z.number(),
    creditPackId: z.string().nullable(),
  }),
}).passthrough();

export const SubscriptionResponse = z.object({
  id: z.string().optional(),
  status: z.string().nullable(),
  plan: z.string().nullable(),
  currentPeriodEnd: z.string().nullable(),
}).passthrough();

export type TBillingInvoiceListResponse = z.infer<typeof BillingInvoiceListResponse>;
export type TUsageSummaryResponse = z.infer<typeof UsageSummaryResponse>;
