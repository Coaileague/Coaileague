/**
 * Support Module - Domain aggregator for platform support functionality
 * 
 * This module provides a unified entry point for support hierarchy,
 * help desk, ticketing, and chat services.
 * 
 * Services:
 * - HelpOS/HelpAI: AI-powered support assistance
 * - Chat Server Hub: Unified chat gateway
 * - Ticket Service: Support ticket management
 * - Platform Support: 3-tier support hierarchy
 * 
 * Routes: server/routes/helpDesk.ts, server/routes/tickets.ts
 */

// Module documentation for IDE navigation
export const SUPPORT_MODULE = {
  services: {
    helpBot: '../../ai/help-bot',
    helpos: '../../services/helposService',
    chatServerHub: '../../services/chatServerHub',
    ticketService: '../../services/ticketService',
    platformSupport: '../../services/platformSupportService',
  },
  routes: {
    helpDesk: '../../routes/helpDesk',
    tickets: '../../routes/tickets',
    chatRooms: '../../routes/chat-rooms',
    chatUploads: '../../routes/chat-uploads',
  },
  schema: {
    types: 'shared/schema.ts',
    entities: ['tickets', 'chatRooms', 'chatMessages', 'supportSessions'],
  },
  hierarchy: {
    levels: ['root_admin', 'co_admin', 'sysops'],
    features: ['cross-org access', 'org freeze', 'immutable audit logs'],
  },
} as const;
