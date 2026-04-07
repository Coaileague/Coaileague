import { z } from 'zod';

const decimalStr = z.string().nullable();
const isoDate = z.string().nullable();

export const InvoiceResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string(),
  invoiceNumber: z.string(),
  issueDate: isoDate,
  dueDate: isoDate,
  subtotal: z.string(),
  taxRate: decimalStr,
  taxAmount: decimalStr,
  total: z.string(),
  platformFeePercentage: decimalStr,
  platformFeeAmount: decimalStr,
  businessAmount: decimalStr,
  status: z.string(),
  paidAt: isoDate,
  amountPaid: decimalStr,
  paymentIntentId: z.string().nullable(),
  stripeInvoiceId: z.string().nullable(),
  sentAt: isoDate,
  notes: z.string().nullable(),
  externalInvoiceNumber: z.string().nullable(),
  agencyPONumber: z.string().nullable(),
  agencyReferenceNumber: z.string().nullable(),
  externalClientId: z.string().nullable(),
  viewedAt: isoDate,
  portalAccessToken: z.string().nullable(),
  deliveryConfirmed: z.boolean().nullable(),
  resentAfterDeliveryFailure: z.boolean().nullable(),
  quickbooksInvoiceId: z.string().nullable(),
  quickbooksSyncStatus: z.string().nullable(),
  quickbooksLastSync: isoDate,
  primaryServiceId: z.string().nullable(),
  paymentReference: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  billingCycle: z.string().nullable(),
  netTerms: z.number().nullable(),
  reminderSentAt: isoDate,
  secondReminderSentAt: isoDate,
  paymentMethod: z.string().nullable(),
  voidReason: z.string().nullable(),
  voidedAt: isoDate,
  voidedBy: z.string().nullable(),
}).passthrough();

export const InvoiceListResponse = z.array(InvoiceResponse);

export const PaginatedInvoiceListResponse = z.object({
  data: InvoiceListResponse,
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

export const InvoiceLineItemResponse = z.object({
  id: z.string(),
  invoiceId: z.string(),
  description: z.string(),
  quantity: z.union([z.string(), z.number()]).nullable(),
  unitPrice: z.union([z.string(), z.number()]).nullable(),
  totalPrice: z.union([z.string(), z.number()]).nullable(),
  serviceDate: z.string().nullable(),
  employeeId: z.string().nullable(),
  createdAt: z.string(),
}).passthrough();

export const InvoiceLineItemListResponse = z.array(InvoiceLineItemResponse);

export type TInvoiceResponse = z.infer<typeof InvoiceResponse>;
export type TInvoiceListResponse = z.infer<typeof InvoiceListResponse>;
export type TInvoiceLineItemResponse = z.infer<typeof InvoiceLineItemResponse>;
