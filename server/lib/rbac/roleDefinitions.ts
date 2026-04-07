// ============================================================================
// Re-export shim — canonical RBAC definitions live in shared/lib/rbac/
// ============================================================================
// This file used to hold the canonical role definitions (Phase 9 F-10).
// In Phase J of the platform debug pass (2026-04-07) the canonical definitions
// were moved to `shared/lib/rbac/roleDefinitions.ts` so client code, server
// code, and `shared/types.ts` can all import from a single source — eliminating
// the duplicate WorkspaceRole type that previously lived in shared/types.ts.
//
// All existing imports from `server/lib/rbac/roleDefinitions` continue to work
// unchanged via this re-export. New code should prefer
// `import { WorkspaceRole } from '@shared/lib/rbac/roleDefinitions'` directly.
// ============================================================================

export * from '@shared/lib/rbac/roleDefinitions';
export type { WorkspaceRole, PlatformRole } from '@shared/lib/rbac/roleDefinitions';
