// Core insert schemas and types
// Tables have been moved to domain files — this file is kept for backwards-compatible re-exports only.
// DO NOT add pgTable definitions here — domain files are the source of truth.
//   workspaces / workspaceThemes / workspaceInvites → shared/schema/domains/orgs/index.ts
//   employees                                        → shared/schema/domains/workforce/index.ts

import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

import { workspaces, workspaceThemes, workspaceInvites } from './domains/orgs';
import { employees } from './domains/workforce';

export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type Workspace = typeof workspaces.$inferSelect;

const dateOrString = z.union([z.date(), z.string().transform(v => new Date(v))]).optional().nullable();

export const insertEmployeeSchema = createInsertSchema(employees).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  version: true,
}).extend({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address").min(1, "Email is required"),
  phone: z.string().regex(/^[+]?[0-9\s-().]{7,15}$/, "Invalid phone number").optional().or(z.literal("")),
  hourlyRate: z.union([z.string(), z.number()]).transform(val => typeof val === 'number' ? val.toString() : val).optional(),
  overtimeRate: z.union([z.string(), z.number()]).transform(val => typeof val === 'number' ? val.toString() : val).optional(),
  doubletimeRate: z.union([z.string(), z.number()]).transform(val => typeof val === 'number' ? val.toString() : val).optional(),
  payAmount: z.union([z.string(), z.number()]).transform(val => typeof val === 'number' ? val.toString() : val).optional(),
  latitude: z.union([z.string(), z.number()]).transform(val => typeof val === 'number' ? val.toString() : val).optional(),
  longitude: z.union([z.string(), z.number()]).transform(val => typeof val === 'number' ? val.toString() : val).optional(),
  hireDate: dateOrString,
  terminationDate: dateOrString,
  dateOfBirth: dateOrString,
  guardCardNumber: z.string().min(1, "License number is required for officers"),
  guardCardExpiryDate: z.union([z.date(), z.string().transform(v => new Date(v))]),
});

export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

export const insertWorkspaceThemeSchema = createInsertSchema(workspaceThemes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWorkspaceTheme = z.infer<typeof insertWorkspaceThemeSchema>;
export type WorkspaceTheme = typeof workspaceThemes.$inferSelect;

export const insertWorkspaceInviteSchema = createInsertSchema(workspaceInvites).omit({
  id: true,
  createdAt: true,
  acceptedAt: true,
  acceptedByUserId: true,
});

export type InsertWorkspaceInvite = z.infer<typeof insertWorkspaceInviteSchema>;
export type WorkspaceInvite = typeof workspaceInvites.$inferSelect;
