/**
 * HelpOS Settings Service - Configure HelpOS bot behavior
 */

export interface HelposBotSettings {
  isEnabled: boolean;
  aiProvider: 'gemini' | 'openai';
  temperament: 'formal' | 'friendly' | 'professional';
  responseTimeoutMs: number;
  maxContextTokens: number;
  enableLogging: boolean;
  enableUserFeedback: boolean;
}

const DEFAULT_SETTINGS: HelposBotSettings = {
  isEnabled: true,
  aiProvider: 'gemini',
  temperament: 'professional',
  responseTimeoutMs: 30000,
  maxContextTokens: 4096,
  enableLogging: true,
  enableUserFeedback: true,
};

const settingsMap = new Map<string, HelposBotSettings>();

/**
 * Get HelpOS bot settings for workspace
 */
export function getHelposSettings(workspaceId: string): HelposBotSettings {
  if (settingsMap.has(workspaceId)) {
    return settingsMap.get(workspaceId)!;
  }
  return DEFAULT_SETTINGS;
}

/**
 * Update HelpOS bot settings
 */
export function updateHelposSettings(
  workspaceId: string,
  updates: Partial<HelposBotSettings>
): HelposBotSettings {
  const current = getHelposSettings(workspaceId);
  const updated = { ...current, ...updates };
  settingsMap.set(workspaceId, updated);
  return updated;
}

/**
 * Enable/disable HelpOS bot
 */
export function toggleHelposBot(workspaceId: string, enabled: boolean): HelposBotSettings {
  const settings = getHelposSettings(workspaceId);
  settings.isEnabled = enabled;
  settingsMap.set(workspaceId, settings);
  return settings;
}

/**
 * Reset settings to defaults
 */
export function resetHelposSettings(workspaceId: string): HelposBotSettings {
  settingsMap.delete(workspaceId);
  return DEFAULT_SETTINGS;
}

export const helposSettingsService = {
  getHelposSettings,
  updateHelposSettings,
  toggleHelposBot,
  resetHelposSettings,
};
