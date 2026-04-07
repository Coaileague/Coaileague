/**
 * Bot Registry - Centralized definitions for all CoAIleague system bots
 * Single source of truth for bot capabilities, triggers, authorization, and deployment rules
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SYSTEM BOTS OVERVIEW
 * ═══════════════════════════════════════════════════════════════════════
 *
 * HelpAI Bot (Support/Command Bot)
 * ─────────────────────────────────
 * - Lives inside the HelpDesk chatroom as the primary AI help assistant
 * - Answers questions, solves end-user and org issues using real AI with platform knowledge
 * - On user entry: checks live if the user has an open support ticket; if not, assigns one
 * - Tracks ticket sync, ensures tickets are closed when users are helped
 * - Commanded by Support roles (support_agent+) to execute platform commands
 * - Operates with Deputy Admin bypass authority (platform level 6)
 * - NO destructive powers: soft-delete only, no hard deletes
 * - Can enter user-created and org-created chatrooms
 * - Can close, suspend (for investigations), or analyze room content (for audits)
 * - Can broadcast messages to rooms
 *
 * ReportBot (Workforce Report Analyzer)
 * ─────────────────────────────────────
 * - Analyzes reports submitted by officers via email or inline shift chatrooms
 * - Activated by supervisor via quick commands (e.g., /analyzereports)
 * - Searches for patterns across submitted officer reports, fetches and analyzes data
 * - Rewrites reports professionally and articulates the best possible version
 * - Creates PDF and places into the org document area
 * - Supervisors, managers, and org owners can view generated reports
 * - Supports workflow submission to clients via their portal
 *
 * MeetingBot (Meeting Recorder & Summarizer)
 * ──────────────────────────────────────────
 * - Enters a designated Meeting Room upon room creation by the org
 * - Records, analyzes, and summarizes the meeting in real-time
 * - Creates meeting minutes PDF upon meeting end
 * - Submits PDF to the org documents section for download, print, or view
 *
 * ClockBot (Time Tracking Assistant)
 * ──────────────────────────────────
 * - Manual clock-in/out when GPS is unavailable
 * - Supervisor override capabilities
 *
 * CleanupBot (Automated Maintenance)
 * ──────────────────────────────────
 * - Cron-triggered document retention and purging
 *
 * ═══════════════════════════════════════════════════════════════════════
 * BOT AUTHORIZATION TIERS
 * ═══════════════════════════════════════════════════════════════════════
 *
 * WORKFORCE BOTS (MeetingBot, ClockBot, ReportBot, CleanupBot):
 * - Check: Is user authenticated? + Is user in an organization?
 * - If both pass, bot responds and assists
 * - Available to all authenticated org members (commands gated by minRole)
 * - AI costs billed to org pool
 *
 * SUPPORT/PLATFORM BOTS (HelpAI):
 * - Dual-mode: responds to end-users for help AND to support roles for commands
 * - End-user mode: anyone entering HelpDesk gets greeted, ticket checked/assigned
 * - Command mode: only support roles (support_agent+) can issue platform commands
 * - HelpAI operates with Deputy Admin (level 6) bypass authority
 * - Soft-delete only — no destructive/hard-delete powers authorized
 * - Platform-level access for cross-org chatroom management
 */

import { createLogger } from '../lib/logger';
const log = createLogger('botRegistry');
import { RoomMode } from '@shared/types/chat';

export type BotAuthTier = 'workforce' | 'support';

export type BotPresence = 'persistent' | 'session' | 'on-demand';
export type BotCapability =
  | 'chat'
  | 'faq'
  | 'queue_management'
  | 'bug_reports'
  | 'ticket_auto_assign'
  | 'ticket_sync'
  | 'ticket_close'
  | 'chatroom_enter'
  | 'chatroom_close'
  | 'chatroom_suspend'
  | 'chatroom_audit'
  | 'chatroom_broadcast'
  | 'platform_command'
  | 'soft_delete'
  | 'transcription'
  | 'analysis'
  | 'pdf_generation'
  | 'action_items'
  | 'meeting_minutes'
  | 'document_routing'
  | 'report_detection'
  | 'report_pattern_analysis'
  | 'report_rewrite'
  | 'legal_cleanup'
  | 'routing'
  | 'client_portal_submit'
  | 'manual_clock'
  | 'supervisor_override'
  | 'flagging'
  | 'retention_policy'
  | 'purge'
  | 'archive';

export interface BotCommand {
  name: string;
  usage: string;
  description?: string;
  minRole: 'user' | 'voice' | 'operator' | 'manager' | 'supervisor' | 'admin';
}

export interface BotTriggers {
  commands: string[];
  patterns: RegExp[];
  events: string[];
}

import { IRC_EVENTS } from '../services/ircEventRegistry';

export const BOT_TRIGGER_EVENTS = {
  JOIN: IRC_EVENTS.JOIN,
  PART: IRC_EVENTS.PART,
  MESSAGE: IRC_EVENTS.PRIVMSG,
  NOTICE: IRC_EVENTS.NOTICE,
  CRON: 'cron:trigger',
  ROOM_CREATED: 'room:created',
} as const;

export interface BotLimits {
  maxConcurrentSessions: number;
  maxPerOrg: number;
  timeoutMinutes: number;
}

export interface BotDefinition {
  id: string;
  name: string;
  description: string;
  avatar: string;
  authTier: BotAuthTier;
  platformRoleLevel?: number;
  destructiveAuth?: 'none' | 'soft_delete' | 'full';
  presence: BotPresence;
  targetModes: RoomMode[];
  capabilities: BotCapability[];
  commands: BotCommand[];
  triggers: BotTriggers;
  limits: BotLimits;
}

export const BOT_REGISTRY: Record<string, BotDefinition> = {
  helpai: {
    id: 'helpai',
    name: 'HelpAI',
    description: 'AI help assistant, support command bot, and right-hand supervisor of all system bots. Greets end-users, auto-assigns tickets, resolves issues with real AI and Trinity layered intelligence. Executes platform commands for support staff. Deputy Admin bypass authority, soft-delete only. Has platform-wide access like Trinity for cross-org data visibility. All actions audit-tracked with who/why/against-whom. Financial actions require supervisor approval.',
    avatar: '/bots/helpai.png',
    authTier: 'support',
    platformRoleLevel: 6,
    destructiveAuth: 'soft_delete',
    presence: 'persistent',
    targetModes: [RoomMode.SUP, RoomMode.ORG],
    capabilities: [
      'chat', 'faq', 'queue_management', 'bug_reports',
      'ticket_auto_assign', 'ticket_sync', 'ticket_close',
      'chatroom_enter', 'chatroom_close', 'chatroom_suspend',
      'chatroom_audit', 'chatroom_broadcast',
      'platform_command', 'soft_delete',
      'cross_org_data_access' as BotCapability,
      'platform_wide_search' as BotCapability,
      'bot_supervision' as BotCapability,
      'trinity_intelligence' as BotCapability,
    ],
    commands: [
      { name: 'help', usage: '/help <question>', minRole: 'user', description: 'Get help from AI assistant' },
      { name: 'faq', usage: '/faq <topic>', minRole: 'user', description: 'Search knowledge base FAQs' },
      { name: 'bug', usage: '/bug <description>', minRole: 'user', description: 'Report a bug or issue' },
      { name: 'status', usage: '/status', minRole: 'user', description: 'Check your ticket status' },
      { name: 'ticket', usage: '/ticket [number]', minRole: 'user', description: 'View or resume a ticket' },
      { name: 'closeticket', usage: '/closeticket <number> [reason]', minRole: 'operator', description: 'Close a resolved ticket' },
      { name: 'enterroom', usage: '/enterroom <roomId>', minRole: 'supervisor', description: 'Enter a user or org chatroom' },
      { name: 'closeroom', usage: '/closeroom <roomId> [reason]', minRole: 'supervisor', description: 'Close a chatroom' },
      { name: 'suspendroom', usage: '/suspendroom <roomId> <reason>', minRole: 'supervisor', description: 'Suspend a room for investigation' },
      { name: 'auditroom', usage: '/auditroom <roomId>', minRole: 'supervisor', description: 'Analyze room content for audit' },
      { name: 'broadcast', usage: '/broadcast <roomId|all> <message>', minRole: 'supervisor', description: 'Broadcast message to room(s)' },
      { name: 'lookup', usage: '/lookup <userId|email>', minRole: 'operator', description: 'Look up user info across all orgs' },
      { name: 'softdelete', usage: '/softdelete <resource> <id> <reason>', minRole: 'admin', description: 'Soft-delete a resource (no hard deletes, requires reason and audit trail)' },
      { name: 'orgdata', usage: '/orgdata <orgId> <dataType>', minRole: 'operator', description: 'View org data (employees, payroll, documents, expenses, etc.)' },
      { name: 'freezeuser', usage: '/freezeuser <userId> <reason>', minRole: 'supervisor', description: 'Freeze individual user account (requires approval for financial impact)' },
      { name: 'escalate', usage: '/escalate <ticketId> <severity>', minRole: 'operator', description: 'Escalate to appropriate specialist based on severity' },
    ],
    triggers: {
      commands: ['/help', '/faq', '/bug', '/status', '/ticket', '/closeticket', '/enterroom', '/closeroom', '/suspendroom', '/auditroom', '/broadcast', '/lookup', '/softdelete', '/orgdata', '/freezeuser', '/escalate'],
      patterns: [/@helpai/i, /help me/i, /how do i/i, /i need help/i, /support/i],
      events: [BOT_TRIGGER_EVENTS.JOIN, BOT_TRIGGER_EVENTS.MESSAGE],
    },
    limits: {
      maxConcurrentSessions: 100,
      maxPerOrg: 5,
      timeoutMinutes: 0,
    },
  },

  meetingbot: {
    id: 'meetingbot',
    name: 'MeetingBot',
    description: 'Auto-enters Meeting Rooms on creation. Records, analyzes, and summarizes meetings. Creates meeting minutes PDF and submits to org documents for download, print, or view.',
    avatar: '/bots/meetingbot.png',
    authTier: 'workforce',
    destructiveAuth: 'none',
    presence: 'session',
    targetModes: [RoomMode.MET],
    capabilities: ['transcription', 'analysis', 'pdf_generation', 'action_items', 'meeting_minutes', 'document_routing'],
    commands: [
      { name: 'meetingstart', usage: '/meetingstart [title]', minRole: 'manager', description: 'Start recording the meeting' },
      { name: 'meetingend', usage: '/meetingend', minRole: 'manager', description: 'End meeting, generate minutes PDF, submit to documents' },
      { name: 'meetingpause', usage: '/meetingpause', minRole: 'manager', description: 'Pause recording' },
      { name: 'meetingcontinue', usage: '/meetingcontinue', minRole: 'manager', description: 'Resume recording' },
      { name: 'actionitem', usage: '/actionitem <description> @user', minRole: 'user', description: 'Add action item to minutes' },
      { name: 'decision', usage: '/decision <what was decided>', minRole: 'user', description: 'Record a decision' },
      { name: 'note', usage: '/note <text>', minRole: 'user', description: 'Add a note to the meeting record' },
    ],
    triggers: {
      commands: ['/meetingstart', '/meetingend', '/meetingpause', '/meetingcontinue', '/actionitem', '/decision', '/note'],
      patterns: [],
      events: [BOT_TRIGGER_EVENTS.ROOM_CREATED, BOT_TRIGGER_EVENTS.MESSAGE],
    },
    limits: {
      maxConcurrentSessions: 50,
      maxPerOrg: 10,
      timeoutMinutes: 120,
    },
  },

  reportbot: {
    id: 'reportbot',
    name: 'ReportBot',
    description: 'Analyzes officer reports submitted via email or inline shift chatrooms. Activated by supervisor quick commands. Searches report patterns, fetches and analyzes data, rewrites professionally, creates PDF, and places into org document area. Supports workflow submission to clients via portal.',
    avatar: '/bots/reportbot.png',
    authTier: 'workforce',
    destructiveAuth: 'none',
    presence: 'persistent',
    targetModes: [RoomMode.FIELD],
    capabilities: [
      'report_detection', 'report_pattern_analysis', 'report_rewrite',
      'legal_cleanup', 'pdf_generation', 'document_routing',
      'routing', 'analysis', 'client_portal_submit',
    ],
    commands: [
      { name: 'report', usage: '/report', minRole: 'user', description: 'Start an incident report inline' },
      { name: 'incident', usage: '/incident <type>', minRole: 'user', description: 'Log incident by type' },
      { name: 'endreport', usage: '/endreport', minRole: 'user', description: 'Finalize and submit report' },
      { name: 'analyzereports', usage: '/analyzereports [shift|date|officer]', minRole: 'supervisor', description: 'Analyze submitted reports, detect patterns, generate professional summary PDF' },
      { name: 'submitreport', usage: '/submitreport <reportId>', minRole: 'manager', description: 'Submit finalized report to client portal' },
      { name: 'reviewreport', usage: '/reviewreport <reportId>', minRole: 'supervisor', description: 'Review and edit a generated report before submission' },
    ],
    triggers: {
      commands: ['/report', '/incident', '/endreport', '/analyzereports', '/submitreport', '/reviewreport'],
      patterns: [
        /incident report/i,
        /reporting an incident/i,
        /suspicious activity/i,
        /medical emergency/i,
        /alarm activation/i,
        /unauthorized (entry|access)/i,
        /property damage/i,
        /vehicle accident/i,
        /trespasser/i,
        /theft/i,
        /assault/i,
      ],
      events: [BOT_TRIGGER_EVENTS.MESSAGE],
    },
    limits: {
      maxConcurrentSessions: 100,
      maxPerOrg: 20,
      timeoutMinutes: 30,
    },
  },

  clockbot: {
    id: 'clockbot',
    name: 'ClockBot',
    description: 'Manual clock-in/out assistance when GPS unavailable. Supervisor override capabilities.',
    avatar: '/bots/clockbot.png',
    authTier: 'workforce',
    destructiveAuth: 'none',
    presence: 'persistent',
    targetModes: [RoomMode.FIELD, RoomMode.ORG],
    capabilities: ['manual_clock', 'supervisor_override', 'flagging'],
    commands: [
      { name: 'clockme', usage: '/clockme <in|out> [reason]', minRole: 'user', description: 'Manual clock in/out' },
      { name: 'forceclock', usage: '/forceclock @user <in|out> <reason>', minRole: 'supervisor', description: 'Force clock for employee' },
      { name: 'clockstatus', usage: '/clockstatus [@user]', minRole: 'user', description: 'Check clock status' },
    ],
    triggers: {
      commands: ['/clockme', '/forceclock', '/clockstatus'],
      patterns: [/can't clock in/i, /gps (not working|down|broken)/i],
      events: [BOT_TRIGGER_EVENTS.MESSAGE],
    },
    limits: {
      maxConcurrentSessions: 200,
      maxPerOrg: 50,
      timeoutMinutes: 0,
    },
  },

  cleanupbot: {
    id: 'cleanupbot',
    name: 'CleanupBot',
    description: 'Automated document retention and purging via cron schedule.',
    avatar: '/bots/cleanupbot.png',
    authTier: 'workforce',
    destructiveAuth: 'soft_delete',
    presence: 'on-demand',
    targetModes: [],
    capabilities: ['retention_policy', 'purge', 'archive'],
    commands: [],
    triggers: {
      commands: [],
      patterns: [],
      events: [BOT_TRIGGER_EVENTS.CRON],
    },
    limits: {
      maxConcurrentSessions: 1,
      maxPerOrg: 1,
      timeoutMinutes: 0,
    },
  },
};

export interface SystemCommand {
  name: string;
  usage: string;
  description: string;
  minRole: 'user' | 'voice' | 'operator' | 'manager' | 'supervisor' | 'admin';
}

export const SYSTEM_COMMANDS: SystemCommand[] = [
  {
    name: 'help',
    usage: '/help [command]',
    description: 'Show available commands or details about a specific command',
    minRole: 'user',
  },
  {
    name: 'motd',
    usage: '/motd',
    description: 'Show the message of the day with room info',
    minRole: 'user',
  },
  {
    name: 'commands',
    usage: '/commands',
    description: 'List all available commands in this room',
    minRole: 'user',
  },
  {
    name: 'bots',
    usage: '/bots',
    description: 'Show active bots in this room',
    minRole: 'user',
  },
  {
    name: 'who',
    usage: '/who',
    description: 'List participants in this room',
    minRole: 'user',
  },
  {
    name: 'maintenance',
    usage: '/maintenance <on|off|status> [reason] [minutes]',
    description: 'Control platform maintenance mode (support only)',
    minRole: 'supervisor',
  },
  {
    name: 'broadcast',
    usage: '/broadcast <message>',
    description: 'Send platform-wide announcement (support only)',
    minRole: 'supervisor',
  },
];

export function getSystemCommands(): SystemCommand[] {
  return SYSTEM_COMMANDS;
}

export function getBotById(botId: string): BotDefinition | undefined {
  return BOT_REGISTRY[botId];
}

export function getBotsForMode(mode: RoomMode): BotDefinition[] {
  return Object.values(BOT_REGISTRY).filter(bot =>
    bot.targetModes.includes(mode)
  );
}

export function getPersistentBots(): BotDefinition[] {
  return Object.values(BOT_REGISTRY).filter(bot =>
    bot.presence === 'persistent'
  );
}

export function getSessionBots(): BotDefinition[] {
  return Object.values(BOT_REGISTRY).filter(bot =>
    bot.presence === 'session'
  );
}

export function getBotCommands(botId: string): BotCommand[] {
  return BOT_REGISTRY[botId]?.commands || [];
}

export function getAllBotCommands(): BotCommand[] {
  return Object.values(BOT_REGISTRY).flatMap(bot => bot.commands);
}

export function getWorkforceBots(): BotDefinition[] {
  return Object.values(BOT_REGISTRY).filter(bot => bot.authTier === 'workforce');
}

export function getSupportBots(): BotDefinition[] {
  return Object.values(BOT_REGISTRY).filter(bot => bot.authTier === 'support');
}

export function canCommandBot(
  botId: string,
  userRole: string,
  isAuthenticated: boolean,
  isInOrg: boolean
): { allowed: boolean; reason?: string } {
  const bot = BOT_REGISTRY[botId];
  if (!bot) {
    return { allowed: false, reason: 'Bot not found' };
  }

  if (!isAuthenticated) {
    return { allowed: false, reason: 'Authentication required' };
  }

  if (bot.authTier === 'workforce') {
    if (!isInOrg) {
      return { allowed: false, reason: 'Organization membership required' };
    }
    return { allowed: true };
  }

  if (bot.authTier === 'support') {
    const supportRoles = ['radmin', 'coadmin', 'sysop', 'support_manager', 'support_agent'];
    if (!supportRoles.includes(userRole)) {
      return { allowed: false, reason: 'Support role required for command mode' };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: 'Unknown auth tier' };
}

export function canBotPerformDestructiveAction(botId: string): boolean {
  const bot = BOT_REGISTRY[botId];
  if (!bot) return false;
  return bot.destructiveAuth === 'soft_delete';
}

log.info('[BotRegistry] Initialized with', Object.keys(BOT_REGISTRY).length, 'bot definitions');
log.info('[BotRegistry] Workforce bots:', getWorkforceBots().map(b => b.name).join(', '));
log.info('[BotRegistry] Support bots:', getSupportBots().map(b => b.name).join(', '));
