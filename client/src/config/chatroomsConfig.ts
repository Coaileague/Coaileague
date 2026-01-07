/**
 * Chatrooms Configuration - Central dynamic configuration for chat room system
 * Easy to edit, no hardcoded values, synced with platform color scheme
 */

import { Building2, HeartHandshake, Briefcase, Video, MessageCircle, Shield, Crown, LucideIcon, Users, Headphones, Bot, Calendar } from "lucide-react";

export type RoomType = 'support' | 'work' | 'meeting' | 'org' | 'shift' | 'dm_support' | 'dm_bot' | 'open_chat' | 'platform';

export type RoomVisibility = 'workspace' | 'public' | 'private' | 'platform';

export type RoomOwnership = 'platform' | 'organization' | 'user';

export interface RoomTypeConfig {
  type: RoomType;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  borderColor: string;
  badgeVariant: 'default' | 'secondary' | 'outline' | 'destructive';
}

export interface ChatroomUIConfig {
  pageTitle: string;
  pageDescription: string;
  supportRoleTitle: string;
  supportRoleDescription: string;
  emptyStateTitle: string;
  emptyStateDescription: string;
  searchPlaceholder: string;
  platformBrandName: string;
  platformBrandTagline: string;
}

export interface FilterConfig {
  id: string;
  label: string;
  filter: (room: any, options: { isParticipant?: boolean }) => boolean;
}

export const ROOM_TYPES: Record<RoomType, RoomTypeConfig> = {
  support: {
    type: 'support',
    label: 'Support',
    description: 'Customer support and helpdesk',
    icon: Headphones,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/30',
    badgeVariant: 'secondary',
  },
  work: {
    type: 'work',
    label: 'Work',
    description: 'Team collaboration and projects',
    icon: Briefcase,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    badgeVariant: 'default',
  },
  meeting: {
    type: 'meeting',
    label: 'Meeting',
    description: 'Scheduled meetings and calls',
    icon: Video,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    badgeVariant: 'secondary',
  },
  org: {
    type: 'org',
    label: 'Organization',
    description: 'Company-wide announcements',
    icon: Building2,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    badgeVariant: 'outline',
  },
  shift: {
    type: 'shift',
    label: 'Shift',
    description: 'Shift-based team communication',
    icon: Calendar,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    badgeVariant: 'outline',
  },
  dm_support: {
    type: 'dm_support',
    label: 'Support DM',
    description: 'Direct support conversation',
    icon: HeartHandshake,
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
    borderColor: 'border-pink-500/30',
    badgeVariant: 'secondary',
  },
  dm_bot: {
    type: 'dm_bot',
    label: 'Ask Trinity',
    description: 'Trinity AI-powered help',
    icon: Bot,
    color: 'text-teal-400',
    bgColor: 'bg-teal-500/10',
    borderColor: 'border-teal-500/30',
    badgeVariant: 'default',
  },
  open_chat: {
    type: 'open_chat',
    label: 'Open Chat',
    description: 'Public discussion room',
    icon: MessageCircle,
    color: 'text-slate-500',
    bgColor: 'bg-slate-500/10',
    borderColor: 'border-slate-500/30',
    badgeVariant: 'outline',
  },
  platform: {
    type: 'platform',
    label: 'Platform',
    description: 'Official platform channel',
    icon: Crown,
    color: 'text-amber-400',
    bgColor: 'bg-gradient-to-br from-amber-500/10 to-orange-500/10',
    borderColor: 'border-amber-500/40',
    badgeVariant: 'default',
  },
};

export const CHATROOM_UI: ChatroomUIConfig = {
  pageTitle: 'Chatrooms',
  pageDescription: 'Discover and join team conversations, automation channels, and work schedule discussions',
  supportRoleTitle: 'All Organization Chatrooms',
  supportRoleDescription: 'View active chatrooms platform-wide: support, work, meeting, and organization channels',
  emptyStateTitle: 'No rooms available',
  emptyStateDescription: 'Check back soon for new discussions',
  searchPlaceholder: 'Search rooms by name...',
  platformBrandName: 'CoAIleague',
  platformBrandTagline: 'Official Platform Channel',
};

export const ROOM_FILTERS: FilterConfig[] = [
  {
    id: 'all',
    label: 'All Rooms',
    filter: () => true,
  },
  {
    id: 'available',
    label: 'Available',
    filter: (room, { isParticipant }) => !isParticipant,
  },
  {
    id: 'joined',
    label: 'My Rooms',
    filter: (room, { isParticipant }) => !!isParticipant,
  },
  {
    id: 'support',
    label: 'Support',
    filter: (room) => room.type === 'support' || room.conversationType === 'dm_support',
  },
  {
    id: 'work',
    label: 'Work',
    filter: (room) => room.type === 'work' || room.conversationType === 'shift_chat',
  },
  {
    id: 'meeting',
    label: 'Meetings',
    filter: (room) => room.type === 'meeting',
  },
];

export const SUPPORT_ROLES = [
  'root_admin',
  'deputy_admin', 
  'sysop',
  'support_manager',
  'support_agent',
] as const;

export const OWNERSHIP_INDICATORS = {
  platform: {
    icon: Crown,
    label: 'Platform',
    tooltip: 'Official CoAIleague channel',
    className: 'text-amber-400 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-amber-500/40',
    color: 'text-amber-400',
  },
  organization: {
    icon: Building2,
    label: 'Organization',
    tooltip: 'Organization channel',
    className: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
    color: 'text-emerald-500',
  },
  user: {
    icon: Users,
    label: 'Team',
    tooltip: 'Team channel',
    className: 'text-blue-500 bg-blue-500/10 border-blue-500/30',
    color: 'text-blue-500',
  },
};

export const LIVE_UPDATE_CONFIG = {
  refetchInterval: 30000,
  staleTime: 15000,
  enablePolling: true,
};

export function getRoomTypeConfig(type?: string, conversationType?: string): RoomTypeConfig {
  if (type && ROOM_TYPES[type as RoomType]) {
    return ROOM_TYPES[type as RoomType];
  }
  
  switch (conversationType) {
    case 'shift_chat':
      return ROOM_TYPES.shift;
    case 'dm_support':
      return ROOM_TYPES.dm_support;
    case 'dm_bot':
      return ROOM_TYPES.dm_bot;
    case 'open_chat':
      return ROOM_TYPES.open_chat;
    default:
      return ROOM_TYPES.open_chat;
  }
}

export function getRoomOwnership(room: any): RoomOwnership {
  if (room.isPlatformOwned || room.createdBy === 'platform' || room.type === 'platform') {
    return 'platform';
  }
  if (room.workspaceId) {
    return 'organization';
  }
  return 'user';
}

export function isSupportRole(platformRole?: string | null): boolean {
  return !!platformRole && SUPPORT_ROLES.includes(platformRole as any);
}
