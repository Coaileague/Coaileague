export const HELP_DESK_CONFIG = {
  rooms: { 
    main: { 
      id: 'helpdesk' 
    } 
  },
  messages: {
    guestIntake: { 
      label: '[GUEST INTAKE]' 
    },
    queueUpdate: { 
      label: '\u23F3 Queue Update' 
    },
    ticketCreated: {
      title: 'Ticket Created',
      description: (id: string) =>
        `Ticket #${id} - HelpAI is analyzing your issue. An agent will be with you shortly.`,
    },
    ticketAssigned: {
      title: 'Agent Assigned',
      message: (id: string) =>
        `An agent is now helping you!\n\nTicket #${id} has been assigned. Your chat is no longer read-only.`,
      sender: 'HelpAI',
    },
  },
  roles: {
    supportStaff: [
      'root_admin',
      'deputy_admin',
      'support_manager',
      'sysop',
      'support',
    ],
  },
  display: {
    showProgressHeaderEscalated: true,
    showUserCount: true,
    showWaitTime: true,
  },
  system: {
    storagePrefix: 'chat:',
    sessionIdKey: 'chat-session-id',
    ticketIdKey: 'support_ticket_id',
    escalationDataKey: 'helpos_escalation',
    guestIntakeDataKey: 'guest_intake_data',
  },
  moderation: {
    allowBan: true,
    allowSilence: true,
    allowKick: true,
  },
  queue: {
    updateInterval: 60000,
    estimatedWaitTime: {
      min: 2,
      max: 3,
    },
  },
};

export const MAIN_ROOM_ID = HELP_DESK_CONFIG.rooms.main.id;

export const ROLE_PRIORITY: Record<string, number> = {
  'staff': 1,
  'bot': 5,
  'customer': 7,
  'guest': 9,
};

export type HelpDeskTicketStatus = 
  | 'new' 
  | 'assigned' 
  | 'investigating' 
  | 'waiting_user' 
  | 'resolved' 
  | 'escalated';

export type UserConnectionStatus = 
  | 'online' 
  | 'away' 
  | 'busy';

export type RoomStatus = 
  | 'open' 
  | 'closed' 
  | 'maintenance';

export interface GuestIntakeData {
  name: string;
  email: string;
  issueType: string;
  problemDescription: string;
}

export interface SecureRequestData {
  type: 'authenticate' | 'document' | 'photo' | 'signature' | 'info';
  requestedBy: string;
  message?: string;
}

export function isStaffRole(role: string): boolean {
  return HELP_DESK_CONFIG.roles.supportStaff.includes(role);
}

export function getUserRolePriority(role: string): number {
  return ROLE_PRIORITY[role] ?? 99;
}

export function sortUsersByRole<T extends { role: string; name: string }>(users: T[]): T[] {
  return [...users].sort((a, b) => {
    const aPriority = getUserRolePriority(a.role);
    const bPriority = getUserRolePriority(b.role);
    
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    
    return a.name.localeCompare(b.name);
  });
}

export function generateSessionId(): string {
  const stored = sessionStorage.getItem(HELP_DESK_CONFIG.system.sessionIdKey);
  if (stored) return stored;
  
  const newId = crypto.randomUUID();
  sessionStorage.setItem(HELP_DESK_CONFIG.system.sessionIdKey, newId);
  return newId;
}

export function getStoredEscalationData(): { 
  conversationId?: string; 
  guestName?: string; 
} | null {
  const data = sessionStorage.getItem(HELP_DESK_CONFIG.system.escalationDataKey);
  return data ? JSON.parse(data) : null;
}

export function getStoredGuestIntakeData(): GuestIntakeData {
  const stored = sessionStorage.getItem(HELP_DESK_CONFIG.system.guestIntakeDataKey);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      // If parse fails, return default
    }
  }
  
  const escalation = getStoredEscalationData();
  return {
    name: escalation?.guestName || '',
    email: '',
    issueType: '',
    problemDescription: ''
  };
}

export function saveGuestIntakeData(data: GuestIntakeData): void {
  sessionStorage.setItem(
    HELP_DESK_CONFIG.system.guestIntakeDataKey, 
    JSON.stringify(data)
  );
}

export function getStoredTicketNumber(): string | null {
  return sessionStorage.getItem(HELP_DESK_CONFIG.system.ticketIdKey);
}

export function saveTicketNumber(ticketId: string): void {
  sessionStorage.setItem(HELP_DESK_CONFIG.system.ticketIdKey, ticketId);
}
