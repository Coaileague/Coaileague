import { z } from 'zod';

export const WorkspaceResponse = z.object({
  id: z.string(),
  name: z.string().nullable(),
  ownerId: z.string().nullable(),
  plan: z.string().nullable(),
  status: z.string().nullable(),
  logoUrl: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
}).passthrough();

export const UserResponse = z.object({
  id: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  role: z.string().nullable(),
  createdAt: z.string().nullable(),
}).passthrough();

export const SessionResponse = z.object({
  user: UserResponse.optional(),
  workspace: WorkspaceResponse.optional(),
}).passthrough();

export const OnboardingStatusResponse = z.object({
  status: z.string().nullable().optional(),
  completed: z.boolean().optional(),
  steps: z.any().optional(),
}).passthrough();

export const MailboxResponse = z.object({
  messages: z.array(z.object({
    id: z.string().nullable().optional(),
    subject: z.string().nullable().optional(),
    body: z.string().nullable().optional(),
    readAt: z.string().nullable().optional(),
  }).passthrough()).optional(),
  unreadCount: z.number().optional(),
}).passthrough();

export type TWorkspaceResponse = z.infer<typeof WorkspaceResponse>;
export type TUserResponse = z.infer<typeof UserResponse>;
