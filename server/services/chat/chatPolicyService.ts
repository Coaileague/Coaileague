/**
 * chatPolicyService.ts — Shared Chat Access Policy
 * ==================================================
 * Single source of truth for chat/DM permission logic.
 * Route files defer to these helpers instead of each embedding
 * their own hard-coded role lists and reserved-name checks.
 *
 * Codex handoff: eliminates policy drift across chat-management.ts,
 * chat-rooms.ts, and privateMessageRoutes.ts
 */

// ── Role classifications ───────────────────────────────────────────────────

/** Platform staff who can cross-connect to any workspace for support */
export const SUPPORT_STAFF_ROLES = [
  'root_admin', 'deputy_admin', 'support_manager', 'support_agent',
  'sysop', 'compliance_officer',
] as const;
export type SupportStaffRole = typeof SUPPORT_STAFF_ROLES[number];

/** Workspace-level management roles */
export const MANAGER_ROLES = [
  'org_owner', 'co_owner', 'org_manager', 'manager',
  'department_manager', 'supervisor',
] as const;

/** Roles that cannot receive unsolicited DMs from non-staff users */
export const PROTECTED_DM_TARGET_ROLES = [
  'root_admin', 'deputy_admin', 'support_manager', 'support_agent',
  'helpai', 'trinity', 'reportbot', 'clockbot',
] as const;

// ── Reserved room names (declarative, not route-local) ─────────────────────
export const RESERVED_ROOM_NAMES = new Set([
  'helpdesk', 'help-desk', 'helpai', 'help-ai',
  'trinity', 'support', 'system', 'admin', 'root',
  'broadcast', 'announcements', 'general',
]);

export const RESERVED_ROOM_PREFIXES = ['sys-', 'bot-', 'helpai-', 'trinity-'];

// ── Policy helpers ─────────────────────────────────────────────────────────

/**
 * True if the workspace role is platform support staff.
 * Support staff can cross-workspace and have elevated chat access.
 */
export function isSupportStaffRole(role: string | null | undefined): boolean {
  return SUPPORT_STAFF_ROLES.includes(role as SupportStaffRole);
}

/**
 * True if the workspace role is a protected target for DMs.
 * Non-staff users cannot initiate unsolicited DMs to these roles.
 */
export function isProtectedDirectMessageRole(role: string | null | undefined): boolean {
  return PROTECTED_DM_TARGET_ROLES.includes(role as any);
}

/**
 * True if the room name is exempt from reserved-name blocking.
 * Platform staff can always create rooms with reserved names.
 */
export function isReservedRoomNameExempt(
  roomName: string,
  creatorRole: string | null | undefined,
): boolean {
  if (isSupportStaffRole(creatorRole)) return true;
  return false;
}

/**
 * True if the room name collides with a reserved system name.
 */
export function isReservedRoomName(name: string): boolean {
  const normalized = name.toLowerCase().trim().replace(/\s+/g, '-');
  if (RESERVED_ROOM_NAMES.has(normalized)) return true;
  if (RESERVED_ROOM_PREFIXES.some(p => normalized.startsWith(p))) return true;
  return false;
}

/**
 * Returns whether the given role can manage DM lifecycle
 * (create, close, reopen DM conversations).
 */
export function canManageDirectMessageLifecycle(
  actorRole: string | null | undefined,
  actorId: string,
  conversationParticipantIds: string[],
): { allowed: boolean; reason?: string } {
  // Support staff can always manage
  if (isSupportStaffRole(actorRole)) {
    return { allowed: true };
  }
  // Participants can manage their own conversations
  if (conversationParticipantIds.includes(actorId)) {
    return { allowed: true };
  }
  // Managers can manage within their workspace
  if (MANAGER_ROLES.includes(actorRole as any)) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Not a participant or manager' };
}

/**
 * Returns the lifecycle access policy for a room action (close/reopen).
 * Centralized so both POST /close and POST /reopen use the same rules.
 */
export function getRoomLifecycleAccessPolicy(
  actorRole: string | null | undefined,
  actorId: string,
  roomOwnerId: string | null | undefined,
  roomType: string | null | undefined,
): { allowed: boolean; reason?: string } {
  // Support staff can always manage rooms
  if (isSupportStaffRole(actorRole)) {
    return { allowed: true };
  }
  // Owner/manager can manage any room in their workspace
  if (['org_owner', 'co_owner', 'org_manager', 'manager'].includes(actorRole ?? '')) {
    return { allowed: true };
  }
  // Room creator/owner can manage their own room
  if (roomOwnerId && roomOwnerId === actorId) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: 'Only managers or the room owner can close/reopen this room',
  };
}
