import { z } from 'zod';

export const ClientOrgResponse = z.object({
  id: z.string(),
  name: z.string(),
  memberCount: z.number().nullable().optional(),
  clientCount: z.number().nullable().optional(),
  createdAt: z.string().nullable(),
  isOwner: z.boolean().nullable().optional(),
  canManage: z.boolean().nullable().optional(),
  subscriptionStatus: z.string().nullable().optional(),
  isSuspended: z.boolean().nullable().optional(),
  suspendedReason: z.string().nullable().optional(),
  isFrozen: z.boolean().nullable().optional(),
  frozenReason: z.string().nullable().optional(),
  isLocked: z.boolean().nullable().optional(),
  lockedReason: z.string().nullable().optional(),
  accountState: z.string().nullable().optional(),
  workspaceType: z.string().nullable().optional(),
  isPlatformSupport: z.boolean().nullable().optional(),
  isSubOrg: z.boolean().nullable().optional(),
  parentWorkspaceId: z.string().nullable().optional(),
  subOrgLabel: z.string().nullable().optional(),
  primaryOperatingState: z.string().nullable().optional(),
  operatingStates: z.array(z.string()).nullable().optional(),
}).passthrough();

export const ClientOrgListResponse = z.array(ClientOrgResponse);

export const ClientResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  type: z.string().nullable(),
  status: z.string().nullable(),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  billingAddress: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
}).passthrough();

export const ClientListResponse = z.array(ClientResponse);

export const PaginatedClientListResponse = z.object({
  data: z.array(ClientResponse.or(z.object({}).passthrough())),
  total: z.number().optional(),
  page: z.number().optional(),
  limit: z.number().optional(),
  hasMore: z.boolean().optional(),
}).passthrough();

export type TClientOrgResponse = z.infer<typeof ClientOrgResponse>;
export type TClientOrgListResponse = z.infer<typeof ClientOrgListResponse>;
