// Auth insert schemas and types
// Tables have been moved to shared/schema/domains/auth/index.ts
// This file is kept for backwards-compatible re-exports of types and insert schemas only.
// DO NOT add pgTable definitions here — domain files are the source of truth.

import { createInsertSchema } from "drizzle-zod";
import { users, authTokens, authSessions } from './domains/auth';

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export type AuthToken = typeof authTokens.$inferSelect;
export type InsertAuthToken = typeof authTokens.$inferInsert;

export type AuthSession = typeof authSessions.$inferSelect;
export type InsertAuthSession = typeof authSessions.$inferInsert;

export const insertAuthTokenSchema = createInsertSchema(authTokens).omit({
  id: true,
  createdAt: true,
});

export const insertAuthSessionSchema = createInsertSchema(authSessions).omit({
  id: true,
  createdAt: true,
  lastActivityAt: true,
});
