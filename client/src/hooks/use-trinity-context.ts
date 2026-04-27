// Stub — use-trinity-context removed; callers migrated to useTrinityMode
export interface TrinityContext { mode: string; workspaceId?: string; }
export function useTrinityContext(): TrinityContext { return { mode: 'standard' }; }
