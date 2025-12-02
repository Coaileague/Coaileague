/**
 * Universal Chat Server Configuration
 * Complete centralized configuration for the entire chat system
 * Modify values here to customize all chat behavior - ZERO hardcoded values
 */

import { HELPAI } from '@shared/platformConfig';

export const CHAT_SERVER_CONFIG = {
  // ===== HELPAI BOT CONFIGURATION =====
  helpai: {
    name: HELPAI.name,
    fullName: HELPAI.fullName,
    userId: 'helpai-bot',
    greetings: {
      default: HELPAI.greetings.default,
      returning: HELPAI.greetings.returning,
      guest: HELPAI.greetings.guest,
      afterHours: HELPAI.greetings.afterHours,
    },
    messages: {
      ticketCreated: (displayName: string, ticketNumber: string, position: number, waitTime: number, waitingCount: number) =>
        `Welcome ${displayName}! Your ticket ${ticketNumber} has been created.\n\nYou're #${position} in queue with an estimated wait time of ${waitTime} minutes. ${waitingCount} users are currently waiting. A support staff member will assist you shortly.`,
      ticketCreatedSimple: (displayName: string, ticketNumber: string) =>
        `Welcome ${displayName}! Your ticket is ${ticketNumber}.`,
      escalationComplete: (ticketNumber: string, userName: string) =>
        `Great news! Your support request has been escalated. Ticket #${ticketNumber} has been created for ${userName}. A human support agent will be with you shortly.`,
      staffJoined: (staffName: string, staffRoleName: string) =>
        `${staffName} (${staffRoleName}) has joined the chat and is ready to help you.`,
      agentAssigned: (ticketNumber: string) =>
        `An agent is now helping you!\n\nTicket #${ticketNumber} has been assigned. Your chat is no longer read-only.`,
      queueUpdate: (userName: string, position: number, waitTime: number) =>
        `Queue Update: ${userName}, you are #${position} in line (Est. wait: ~${waitTime} min). Thank you for your patience!`,
      ticketClosed: (reason: string) =>
        `This ticket has been closed. Reason: ${reason}`,
    },
  },

  // ===== ROOM CONFIGURATION =====
  rooms: {
    // Main support room (must match support_rooms.slug in database)
    main: {
      id: 'helpdesk',
      slug: 'helpdesk',
      name: 'HelpAI Support',
      description: 'Live support chat powered by HelpAI',
      status: 'open' as const,
      visibility: 'public' as const,
    },
  },

  // ===== QUEUE SETTINGS =====
  queue: {
    // Queue update interval in milliseconds
    updateInterval: 60000, // 60 seconds
    
    // Default wait time estimate (in minutes)
    estimatedWaitTime: {
      min: 2,
      max: 3,
    },

    // Queue timeout (how long before a guest is removed)
    timeoutMinutes: 30,

    // Queue position calculation based on silenced users
    usesilencedUsersAsPosition: true,
  },

  // ===== MESSAGE TEMPLATES =====
  messages: {
    // Guest intake header
    guestIntake: {
      label: '[GUEST INTAKE]',
      fields: {
        ticket: 'Ticket',
        name: 'Name',
        email: 'Email',
        issueType: 'Issue Type',
        description: 'Description',
      },
    },

    // Queue update messages
    queueUpdate: {
      label: 'Queue Update',
      fields: {
        ticket: 'Ticket',
        waitTime: 'Wait Time',
        position: 'Position in Queue',
      },
      footer: 'HelpAI is reviewing your issue. An agent will be assigned shortly.',
    },

    // Ticket status messages
    ticketCreated: {
      title: 'Ticket Created',
      description: (ticketId: string) =>
        `Ticket #${ticketId} - HelpAI is analyzing your issue. An agent will be with you shortly.`,
    },

    ticketAssigned: {
      title: 'Agent Assigned',
      message: (ticketId: string) =>
        `An agent is now helping you!\n\nTicket #${ticketId} has been assigned. Your chat is no longer read-only.`,
      sender: 'HelpAI',
    },

    // Welcome/intro messages
    welcome: {
      title: 'Welcome to HelpAI Support',
      description:
        'Please provide some information so our support team can better assist you.',
    },

    // Form labels and placeholders
    form: {
      name: {
        label: 'Name',
        placeholder: 'Your name',
      },
      email: {
        label: 'Email',
        placeholder: 'your@email.com',
      },
      issueType: {
        label: 'Issue Type',
        placeholder: 'Select issue type',
      },
      problemDescription: {
        label: 'Describe Your Issue',
        placeholder: 'Tell us what you are experiencing...',
      },
      submitButton: 'Start Chat',
      submitButtonLoading: 'Creating Ticket...',
    },

    // Status messages
    status: {
      open: 'Open - Accepting Support Requests',
      closed: 'Closed - No Support Available',
      maintenance: 'Maintenance - System Updates',
    },

    // Error messages
    errors: {
      missingFields: 'Please fill in all fields to continue.',
      invalidName: 'Please enter your name.',
      invalidEmail: 'Please enter a valid email (must include @ and domain).',
      missingIssueType: 'Please select an issue type.',
      missingDescription: 'Please describe your issue.',
      ticketCreationFailed: 'Failed to create support ticket. Please try again.',
    },

    // Toast notifications
    toasts: {
      informationReceived: 'Information Received',
      ticketCreated: 'Ticket Created',
      errorCreatingTicket: 'Error Creating Ticket',
      roomStatusUpdated: 'Room Status Updated',
      userMuted: 'User Muted',
      userBanned: 'User Banned',
      userUnmuted: 'User Unmuted',
      userUnbanned: 'User Unbanned',
      cacheCleared: 'Cache Cleared',
      connectionReset: 'Connection Reset',
      testMessageSent: 'Test Message Sent',
    },
  },

  // ===== ISSUE TYPES =====
  issueTypes: [
    { value: 'billing', label: 'Billing & Payments' },
    { value: 'technical', label: 'Technical Issue' },
    { value: 'account', label: 'Account Help' },
    { value: 'feature', label: 'Feature Request' },
    { value: 'other', label: 'Other' },
  ],

  // ===== USER ROLES & PERMISSIONS =====
  roles: {
    // Priority ordering for user list (lower number = higher priority)
    priority: {
      root_admin: 0,
      bot: 1,
      deputy_admin: 2,
      support_manager: 3,
      sysop: 4,
      subscriber: 5,
      org_user: 6,
      guest: 7,
    },

    // Platform staff roles (for permission checks)
    platformStaff: [
      'root_admin',
      'deputy_admin',
      'deputy_assistant',
      'sysop',
      'support',
    ],

    // Support staff roles (for chat context)
    supportStaff: [
      'root_admin',
      'deputy_admin',
      'support_manager',
      'sysop',
      'support',
    ],
  },

  // ===== API ENDPOINTS =====
  endpoints: {
    // Support ticket creation
    createTicket: '/api/support/create-ticket',

    // Chat room operations
    rooms: '/api/chat/rooms',
    joinRooms: '/api/chat/rooms/join-bulk',

    // HelpDesk specific
    roomStatus: '/api/helpdesk/room/{roomId}/status',
    room: '/api/helpdesk/room/{roomId}',
    queue: '/api/helpdesk/queue',
    motd: '/api/helpdesk/motd',
    motdAcknowledge: '/api/helpdesk/motd/acknowledge',
    userContext: '/api/helpdesk/user-context/{userId}',

    // Promotional banners
    banners: '/api/promotional-banners',
    bannersById: '/api/promotional-banners/{id}',

    // Health check
    health: '/api/health',
  },

  // ===== VALIDATION RULES =====
  validation: {
    // Email regex pattern
    emailPattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,

    // Password requirements
    password: {
      minLength: 8,
      requireUppercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
    },

    // Message limits
    messageLength: {
      min: 1,
      max: 5000,
    },

    // Chat name length
    nameLength: {
      min: 1,
      max: 100,
    },
  },

  // ===== RATE LIMITING =====
  rateLimits: {
    // Chat message rate limit (requests per minute)
    chatMessages: 30,

    // Authentication attempts
    authAttempts: 5,

    // General API requests
    general: 100,
  },

  // ===== TIMEOUTS & DELAYS =====
  timeouts: {
    // How long to wait for WebSocket connection
    connectionTimeout: 5000, // 5 seconds

    // How long to keep a silent user before removing
    silenceTimeout: 300, // 5 minutes (in seconds)

    // Typing indicator timeout
    typingTimeout: 3000, // 3 seconds

    // Queue position update interval
    queueUpdateMs: 60000, // 60 seconds
  },

  // ===== FEATURE FLAGS =====
  features: {
    // Enable/disable seasonal animations
    seasonalAnimationsEnabled: true,

    // Enable/disable agreement modal
    agreementModalEnabled: false,

    // Enable/disable MOTD (Message of the Day)
    motdEnabled: true,

    // Enable/disable promotional banners
    bannersEnabled: true,

    // Enable/disable AI copilot
    aiCopilotEnabled: true,

    // Enable/disable sentiment analysis
    sentimentAnalysisEnabled: true,

    // Enable/disable user diagnostics
    userDiagnosticsEnabled: true,
  },

  // ===== DISPLAY SETTINGS =====
  display: {
    // Show/hide user count in header
    showUserCount: true,

    // Show/hide wait time estimate
    showWaitTime: true,

    // Show/hide queue position
    showQueuePosition: true,

    // Agents online threshold for showing status
    agentsOnlineThreshold: 1,

    // Show/hide context panel on desktop
    showContextPanelDesktop: true,

    // Show/hide progress header for escalated tickets
    showProgressHeaderEscalated: true,
  },

  // ===== NOTIFICATION SETTINGS =====
  notifications: {
    // Enable sound notifications
    soundEnabled: true,

    // Enable desktop notifications
    desktopEnabled: true,

    // Enable toast messages
    toastEnabled: true,

    // Notification duration (ms)
    duration: 4000,
  },

  // ===== ESCALATION SETTINGS =====
  escalation: {
    // Auto-escalate after this many minutes without response
    autoEscalateMinutes: 15,

    // Maximum escalation level
    maxLevel: 3,

    // Escalation reasons
    reasons: [
      'Customer frustration detected',
      'Technical complexity',
      'Billing dispute',
      'Account security issue',
      'Other',
    ],
  },

  // ===== MODERATION SETTINGS =====
  moderation: {
    // Enable/disable user silencing
    allowSilence: true,

    // Enable/disable user banning
    allowBan: true,

    // Enable/disable user kicking
    allowKick: true,

    // Silence reasons
    silenceReasons: [
      'Inappropriate language',
      'Spam',
      'Harassment',
      'Off-topic discussion',
      'Other',
    ],

    // Ban reasons
    banReasons: [
      'Repeated violations',
      'Severe harassment',
      'Threats',
      'Other',
    ],
  },

  // ===== MOBILE SETTINGS =====
  mobile: {
    // Breakpoint for mobile detection (px)
    breakpoint: 768, // 'md' breakpoint

    // Mobile chat height
    chatHeight: 'full',

    // Mobile-specific message limit
    messagesPerPage: 50,
  },

  // ===== SYSTEM SETTINGS =====
  system: {
    // Default timezone for timestamps
    timezone: 'UTC',

    // Date format (ISO 8601)
    dateFormat: 'yyyy-MM-dd HH:mm:ss',

    // Enable/disable debug logging
    debugLogging: false,

    // Enable/disable analytics
    analyticsEnabled: true,

    // Session storage prefix
    storagePrefix: 'chat:',

    // Session ID key
    sessionIdKey: 'chat-session-id',

    // Ticket ID storage key
    ticketIdKey: 'support_ticket_id',

    // Escalation data storage key
    escalationDataKey: 'helpai_escalation',
  },
};

// Export individual config sections for convenience
export const CHAT_ROOMS = CHAT_SERVER_CONFIG.rooms;
export const CHAT_QUEUE = CHAT_SERVER_CONFIG.queue;
export const CHAT_MESSAGES = CHAT_SERVER_CONFIG.messages;
export const CHAT_ROLES = CHAT_SERVER_CONFIG.roles;
export const CHAT_ENDPOINTS = CHAT_SERVER_CONFIG.endpoints;
export const CHAT_VALIDATION = CHAT_SERVER_CONFIG.validation;
export const CHAT_RATE_LIMITS = CHAT_SERVER_CONFIG.rateLimits;
export const CHAT_TIMEOUTS = CHAT_SERVER_CONFIG.timeouts;
export const CHAT_FEATURES = CHAT_SERVER_CONFIG.features;
export const CHAT_DISPLAY = CHAT_SERVER_CONFIG.display;
export const CHAT_NOTIFICATIONS = CHAT_SERVER_CONFIG.notifications;
export const CHAT_ESCALATION = CHAT_SERVER_CONFIG.escalation;
export const CHAT_MODERATION = CHAT_SERVER_CONFIG.moderation;
export const CHAT_MOBILE = CHAT_SERVER_CONFIG.mobile;
export const CHAT_SYSTEM = CHAT_SERVER_CONFIG.system;
