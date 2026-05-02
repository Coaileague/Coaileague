/**
 * SECURITY TEST — Trinity Conscience Principle 8 (Public Safety Boundary)
 *
 * Verifies that the conscience layer hard-refuses any action whose semantics
 * imply Trinity dialing 911, dispatching responders, or guaranteeing safety.
 *
 * Principle 8 must run BEFORE the role / financial / privacy principles so
 * that even an org_owner with payload.confirmed=true cannot push such an
 * action through.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock the workspaces table lookup (Principle 7) so it never blocks our test.
vi.mock('../../server/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ status: 'active' }],
        }),
      }),
    }),
  },
}));
vi.mock('@shared/schema', () => ({
  workspaces: { id: { __name: 'id' }, status: { __name: 'status' } },
}));
vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('drizzle-orm');
  return { ...actual, eq: () => ({}) };
});

import { evaluateConscience } from '../../server/services/ai-brain/trinityConscience';

const WS = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('trinityConscience — Principle 8: PUBLIC_SAFETY_BOUNDARY', () => {
  it.each([
    'safety.call_911',
    'safety.dispatch_911',
    'emergency.call_911',
    'emergency.dispatch',
    'emergency.dispatch_responders',
    'emergency.contact_police',
    'emergency.contact_fire',
    'emergency.contact_ems',
    'dispatch.911',
    'dispatch.police',
    'panic.call_911',
    'safety.guarantee',
  ])('blocks %s outright', async (actionId) => {
    const result = await evaluateConscience({
      actionId,
      workspaceId: WS,
      userId: 'user-1',
      userRole: 'org_owner',
      callerType: 'user',
      payload: { confirmed: true, intentConfirmed: true }, // even with full confirmation
    });
    expect(result.verdict).toBe('block');
    expect(result.principle).toBe('PUBLIC_SAFETY_BOUNDARY');
    expect(result.reason).toMatch(/911|emergency|safety/i);
    expect(result.reason).toMatch(/human supervisor/i);
  });

  it('blocks pattern-matched action IDs (e.g. *.guarantee_safety)', async () => {
    const result = await evaluateConscience({
      actionId: 'site.guarantee_safety',
      workspaceId: WS,
      userId: 'user-1',
      userRole: 'org_owner',
      callerType: 'user',
    });
    expect(result.verdict).toBe('block');
    expect(result.principle).toBe('PUBLIC_SAFETY_BOUNDARY');
  });

  it('does NOT block panic notification (notification only, no dispatch)', async () => {
    // Panic alert *notification* is allowed — it's just paging the human
    // supervisor. Only actual 911-dial / dispatch verbs are blocked.
    const result = await evaluateConscience({
      actionId: 'panic.notify_supervisor',
      workspaceId: WS,
      userId: 'user-1',
      userRole: 'org_owner',
      callerType: 'user',
    });
    expect(result.verdict).not.toBe('block');
  });

  it('does NOT block normal scheduling actions', async () => {
    const result = await evaluateConscience({
      actionId: 'scheduling.fill_open_shift',
      workspaceId: WS,
      userId: 'user-1',
      userRole: 'manager',
      callerType: 'user',
    });
    expect(result.verdict).not.toBe('block');
  });
});
