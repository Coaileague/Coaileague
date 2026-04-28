/**
 * SECURITY TEST STUBS — Notification Ack Ownership (IDOR)
 * Domain: Notifications
 * Stub: Claude wires to test runner after verifying the API contract.
 *
 * Risk: A user who knows another user's notification ID can acknowledge it
 * (or dismiss it) because the PATCH /api/notifications/:id/ack endpoint
 * only validates that the caller is authenticated, not that the notification
 * belongs to them.
 *
 * What each test must assert:
 *  - A caller authenticated as User A can ACK their own notification → 200
 *  - A caller authenticated as User A CANNOT ACK User B's notification → 403
 *  - After a failed cross-user ACK attempt, the notification remains unread
 *  - The isRead field on the database row must not change after a rejected attempt
 *
 * Files under test:
 *  server/routes/notificationRoutes.ts  — PATCH /:id/ack (or /read)
 */

import { describe, it, expect } from 'vitest';

describe('Notification ACK ownership guard (IDOR)', () => {
  it.todo('owner can ACK their own notification');
  it.todo('non-owner cannot ACK another user notification (returns 403)');
  it.todo('rejected ACK leaves notification.isRead unchanged in DB');
  it.todo('bulk ACK endpoint rejects any ID not belonging to caller');
});
