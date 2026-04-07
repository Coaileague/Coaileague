// ═══════════════════════════════════════════════════════════════
// Phase 8: Notification Delivery Tracking
// ═══════════════════════════════════════════════════════════════
// Persists every outbound notification attempt for retry, idempotency,
// and audit purposes. Replaces all fire-and-forget email/SMS/WS sends.

import { pgTable, varchar, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const notificationDeliveries = pgTable('notification_deliveries', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: text('workspace_id').notNull(),
  recipientUserId: text('recipient_user_id').notNull(),
  notificationType: text('notification_type').notNull(),
  channel: text('channel').notNull(),
  subject: text('subject'),
  payload: jsonb('payload').notNull().default({}),
  idempotencyKey: text('idempotency_key').unique(),
  status: text('status').notNull().default('pending'),
  attemptCount: integer('attempt_count').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  lastError: text('last_error'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
