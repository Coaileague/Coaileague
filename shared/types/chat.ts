/**
 * Chat Types - Room Modes and Chat Room Interfaces
 * mIRC-style room modes for bot routing and management
 */

export enum RoomMode {
  ORG = 'org',       // +org - Organization general rooms
  MET = 'met',       // +met - Meeting rooms
  SUP = 'sup',       // +sup - Support/helpdesk rooms
  FIELD = 'field',   // +field - Field officer shift rooms
  COAI = 'coai',     // +coai - Platform internal rooms
}

/**
 * Room Mode Configuration - Dynamic metadata for each mode
 * NO hardcoded descriptions elsewhere - this is the single source of truth
 */
export interface RoomModeConfig {
  mode: RoomMode;
  label: string;
  description: string;
  icon: string;
  defaultBots: string[];
}

export const ROOM_MODE_CONFIG: Record<RoomMode, RoomModeConfig> = {
  [RoomMode.ORG]: {
    mode: RoomMode.ORG,
    label: 'Organization Chat',
    description: 'General organization communication channel',
    icon: 'building',
    defaultBots: [],
  },
  [RoomMode.MET]: {
    mode: RoomMode.MET,
    label: 'Meeting Room',
    description: 'Structured meeting with agenda and minutes',
    icon: 'users',
    defaultBots: ['meeting'],
  },
  [RoomMode.SUP]: {
    mode: RoomMode.SUP,
    label: 'Support Helpdesk',
    description: 'Customer support with AI assistance',
    icon: 'headphones',
    defaultBots: ['helpai'],
  },
  [RoomMode.FIELD]: {
    mode: RoomMode.FIELD,
    label: 'Field Operations',
    description: 'Field staff shift coordination and reporting',
    icon: 'map-pin',
    defaultBots: ['clock', 'report'],
  },
  [RoomMode.COAI]: {
    mode: RoomMode.COAI,
    label: 'Platform Internal',
    description: 'CoAIleague platform internal operations',
    icon: 'shield',
    defaultBots: ['cleanup'],
  },
};

/**
 * Get mode description dynamically from config
 */
export function getRoomModeLabel(mode: RoomMode): string {
  return ROOM_MODE_CONFIG[mode]?.label || mode;
}

/**
 * Get mode descriptions for multiple modes
 */
export function getRoomModeLabels(modes: RoomMode[]): string {
  return modes.map(m => getRoomModeLabel(m)).join(' | ');
}

export interface RoomParticipant {
  userId: string;
  userName: string;
  role: 'owner' | 'operator' | 'voice' | 'user' | 'guest';
  joinedAt: Date;
  lastSeen: Date;
  status: 'online' | 'away' | 'idle' | 'offline';
  isBot?: boolean;
}

export interface RoomSettings {
  autoCloseIdleMinutes?: number;
  requireApproval?: boolean;
  reportDetectionEnabled?: boolean;
  shiftId?: string;
  queueEnabled?: boolean;
  maxQueueSize?: number;
  moderated?: boolean;
  inviteOnly?: boolean;
  maxParticipants?: number;
}

export interface ChatRoom {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  modes: RoomMode[];
  settings: RoomSettings;
  activeBots: string[];
  participants: RoomParticipant[];
  topic?: string;
  createdAt: Date;
  createdBy: string;
  lastActivity?: Date;
  status: 'active' | 'archived' | 'closed';
}

export interface CreateRoomParams {
  orgId: string;
  name: string;
  type: 'general' | 'meeting' | 'helpdesk' | 'shift' | 'internal';
  userId: string;
  description?: string;
  settings?: Partial<RoomSettings>;
  shiftId?: string;
}

export function generateRoomId(params: CreateRoomParams): string {
  const { orgId, type, shiftId } = params;
  const timestamp = Date.now().toString(36);
  
  switch (type) {
    case 'general':
      return `org:${orgId}:general`;
    case 'helpdesk':
      return `org:${orgId}:helpdesk`;
    case 'meeting':
      return `org:${orgId}:meeting:${timestamp}`;
    case 'shift':
      return `org:${orgId}:shift:${shiftId || timestamp}`;
    case 'internal':
      return `coai:internal:${timestamp}`;
    default:
      return `org:${orgId}:room:${timestamp}`;
  }
}

export function getDefaultSettings(modes: RoomMode[]): RoomSettings {
  const settings: RoomSettings = {};
  
  if (modes.includes(RoomMode.MET)) {
    settings.autoCloseIdleMinutes = 60;
    settings.requireApproval = true;
  }
  
  if (modes.includes(RoomMode.FIELD)) {
    settings.reportDetectionEnabled = true;
  }
  
  if (modes.includes(RoomMode.SUP)) {
    settings.queueEnabled = true;
    settings.maxQueueSize = 50;
  }
  
  return settings;
}

export function getModesForType(type: CreateRoomParams['type'], orgId: string): RoomMode[] {
  const modes: RoomMode[] = [];
  
  switch (type) {
    case 'meeting':
      modes.push(RoomMode.MET);
      break;
    case 'helpdesk':
      modes.push(RoomMode.SUP);
      break;
    case 'shift':
      modes.push(RoomMode.FIELD, RoomMode.ORG);
      break;
    case 'general':
      modes.push(RoomMode.ORG);
      break;
    case 'internal':
      modes.push(RoomMode.COAI);
      break;
  }
  
  if (orgId === 'coai') {
    modes.push(RoomMode.COAI);
  }
  
  return modes;
}
