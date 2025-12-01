/**
 * Universal Animation Configuration
 * 
 * Centralized configuration for animation system including:
 * - Animation modes and their properties
 * - Seasonal theme definitions with date ranges
 * - AI Brain control settings
 * - Support console override settings
 */

import type { AnimationMode, SeasonalTheme } from '@/components/universal-animation-engine';

export interface AnimationModeConfig {
  id: AnimationMode;
  label: string;
  description: string;
  defaultDuration: number;
  color: string;
  useCase: string[];
}

export interface SeasonalThemeConfig {
  id: SeasonalTheme;
  label: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  enabled: boolean;
  festiveParticles?: boolean;
  specialEffects?: string[];
}

export interface AnimationControlConfig {
  enabled: boolean;
  minDuration: number;
  maxDuration: number;
  progressUpdateInterval: number;
  autoDismissOnClick: boolean;
  respectUserPreferences: boolean;
}

export const ANIMATION_MODES: Record<AnimationMode, AnimationModeConfig> = {
  idle: {
    id: 'idle',
    label: 'Standby',
    description: 'Gentle pulse animation for idle/waiting states',
    defaultDuration: 0,
    color: '#64748b',
    useCase: ['waiting', 'standby', 'paused']
  },
  search: {
    id: 'search',
    label: 'Scanning',
    description: 'Radar sweep for search and indexing operations',
    defaultDuration: 3000,
    color: '#10b981',
    useCase: ['search', 'indexing', 'scanning', 'finding']
  },
  analyze: {
    id: 'analyze',
    label: 'Analyzing',
    description: 'Neural network visualization for AI processing',
    defaultDuration: 4000,
    color: '#a855f7',
    useCase: ['ai-processing', 'analyzing', 'thinking', 'computing']
  },
  voice: {
    id: 'voice',
    label: 'Listening',
    description: 'Waveform bars for audio/voice processing',
    defaultDuration: 2500,
    color: '#f43f5e',
    useCase: ['voice', 'audio', 'listening', 'transcribing']
  },
  warp: {
    id: 'warp',
    label: 'Navigating',
    description: 'Tunnel effect for page/workspace transitions',
    defaultDuration: 1500,
    color: '#3b82f6',
    useCase: ['navigation', 'transition', 'loading', 'entering']
  },
  success: {
    id: 'success',
    label: 'Complete',
    description: 'Checkmark lock for successful completion',
    defaultDuration: 1000,
    color: '#eab308',
    useCase: ['success', 'complete', 'done', 'verified']
  },
  error: {
    id: 'error',
    label: 'Error',
    description: 'Glitch effect for error states',
    defaultDuration: 2000,
    color: '#ef4444',
    useCase: ['error', 'failed', 'critical', 'disconnected']
  }
};

export const SEASONAL_THEMES: SeasonalThemeConfig[] = [
  {
    id: 'default',
    label: 'Default',
    startMonth: 1,
    startDay: 1,
    endMonth: 12,
    endDay: 31,
    enabled: true
  },
  {
    id: 'winter',
    label: 'Winter Wonderland',
    startMonth: 12,
    startDay: 21,
    endMonth: 3,
    endDay: 20,
    enabled: true,
    festiveParticles: true,
    specialEffects: ['snowflakes', 'frost']
  },
  {
    id: 'spring',
    label: 'Spring Bloom',
    startMonth: 3,
    startDay: 21,
    endMonth: 6,
    endDay: 20,
    enabled: true,
    festiveParticles: true,
    specialEffects: ['flowers', 'butterflies']
  },
  {
    id: 'summer',
    label: 'Summer Vibes',
    startMonth: 6,
    startDay: 21,
    endMonth: 9,
    endDay: 22,
    enabled: true,
    festiveParticles: true,
    specialEffects: ['sunshine', 'waves']
  },
  {
    id: 'autumn',
    label: 'Autumn Harvest',
    startMonth: 9,
    startDay: 23,
    endMonth: 12,
    endDay: 20,
    enabled: true,
    festiveParticles: true,
    specialEffects: ['leaves', 'wind']
  },
  {
    id: 'holiday',
    label: 'Holiday Season',
    startMonth: 12,
    startDay: 15,
    endMonth: 1,
    endDay: 5,
    enabled: true,
    festiveParticles: true,
    specialEffects: ['snowflakes', 'lights', 'ornaments']
  },
  {
    id: 'halloween',
    label: 'Spooky Season',
    startMonth: 10,
    startDay: 15,
    endMonth: 11,
    endDay: 1,
    enabled: true,
    festiveParticles: true,
    specialEffects: ['bats', 'spiders', 'ghosts']
  },
  {
    id: 'valentines',
    label: 'Valentine\'s Day',
    startMonth: 2,
    startDay: 7,
    endMonth: 2,
    endDay: 21,
    enabled: true,
    festiveParticles: true,
    specialEffects: ['hearts', 'sparkles']
  }
];

export const ANIMATION_CONTROL_CONFIG: AnimationControlConfig = {
  enabled: true,
  minDuration: 500,
  maxDuration: 10000,
  progressUpdateInterval: 50,
  autoDismissOnClick: true,
  respectUserPreferences: true
};

export const ORCHESTRATOR_MESSAGES = {
  warp: [
    { p: 0.2, msg: 'Initializing workspace...' },
    { p: 0.5, msg: 'Loading resources...' },
    { p: 0.8, msg: 'Almost ready...' }
  ],
  search: [
    { p: 0.2, msg: 'Scanning database...' },
    { p: 0.5, msg: 'Indexing results...' },
    { p: 0.8, msg: 'Finalizing search...' }
  ],
  analyze: [
    { p: 0.2, msg: 'Initializing AI agents...' },
    { p: 0.5, msg: 'Processing context...' },
    { p: 0.8, msg: 'Generating insights...' }
  ],
  voice: [
    { p: 0.2, msg: 'Capturing audio...' },
    { p: 0.5, msg: 'Transcribing speech...' },
    { p: 0.8, msg: 'Processing language...' }
  ],
  success: [
    { p: 1.0, msg: 'Operation complete!' }
  ],
  error: [
    { p: 0.5, msg: 'Operation failed' }
  ],
  idle: [
    { p: 0.5, msg: 'Standing by...' }
  ]
};

export function getCurrentSeasonalTheme(): SeasonalTheme {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  for (const theme of SEASONAL_THEMES) {
    if (!theme.enabled || theme.id === 'default') continue;

    const inRange = isDateInRange(month, day, theme.startMonth, theme.startDay, theme.endMonth, theme.endDay);
    if (inRange) {
      return theme.id;
    }
  }

  return 'default';
}

function isDateInRange(
  month: number,
  day: number,
  startMonth: number,
  startDay: number,
  endMonth: number,
  endDay: number
): boolean {
  const current = month * 100 + day;
  const start = startMonth * 100 + startDay;
  const end = endMonth * 100 + endDay;

  if (start <= end) {
    return current >= start && current <= end;
  } else {
    return current >= start || current <= end;
  }
}

export function getOrchestratorMessages(mode: AnimationMode) {
  return ORCHESTRATOR_MESSAGES[mode] || ORCHESTRATOR_MESSAGES.warp;
}

export function getModeForScenario(scenario: string): AnimationMode {
  const scenarioModeMap: Record<string, AnimationMode> = {
    login: 'warp',
    logout: 'warp',
    navigation: 'warp',
    transition: 'warp',
    search: 'search',
    indexing: 'search',
    'ai-processing': 'analyze',
    analyzing: 'analyze',
    thinking: 'analyze',
    voice: 'voice',
    audio: 'voice',
    listening: 'voice',
    success: 'success',
    complete: 'success',
    error: 'error',
    failed: 'error'
  };

  return scenarioModeMap[scenario.toLowerCase()] || 'warp';
}
