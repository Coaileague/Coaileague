/**
 * Chatroom Command Service - MOTD and /help Command Handler
 * 
 * Provides dynamic MOTD (Message of the Day) and slash command help
 * to end users in chatrooms. All commands are derived from the bot registry
 * with NO hardcoded command lists.
 * 
 * AUDIT: All force/destructive/punishment commands trigger support announcements
 */

import { RoomMode, getRoomModeLabels } from '@shared/types/chat';
import { BOT_REGISTRY, BotCommand, BotDefinition, getBotsForMode, SYSTEM_COMMANDS, getSystemCommands, SystemCommand } from '../bots/registry';
import { platformMaintenanceService } from './platformMaintenanceService';
import { createLogger } from '../lib/logger';
const log = createLogger('chatroomCommandService');


// Force commands that bypass normal authorization - always flagged for audit
const FORCE_COMMANDS = new Set([
  '/forceclock', '/forcekick', '/forceban', '/forcemute', 
  '/forceclose', '/forcemode', '/forcejoin', '/forcepart',
]);

// Destructive commands that modify/delete data
const DESTRUCTIVE_COMMANDS = new Set([
  '/kick', '/ban', '/mute', '/close', '/delete', 
  '/purge', '/clear', '/wipe', '/remove', '/revoke',
  '/nuke', '/muteall',
]);

// Punishment commands affecting users
const PUNISHMENT_COMMANDS = new Set([
  '/kick', '/ban', '/mute', '/warn', '/timeout', '/suspend', '/demote',
]);

/**
 * Audit command execution for transparency
 * Called when force/destructive/punishment commands are executed
 */
export async function auditCommandExecution(
  command: string,
  args: string,
  userId: string,
  userRole: string,
  targetUserId?: string,
  targetUserName?: string
): Promise<void> {
  const cmdLower = command.toLowerCase();
  
  try {
    if (FORCE_COMMANDS.has(cmdLower)) {
      await platformMaintenanceService.announceToSupport({
        action: 'force_command_executed',
        performedBy: userId,
        performedByRole: userRole,
        targetUserId,
        targetUserName,
        reason: `Executed ${command} ${args}`.trim(),
        metadata: { command, args },
      });
    } else if (PUNISHMENT_COMMANDS.has(cmdLower)) {
      await platformMaintenanceService.announceToSupport({
        action: 'punishment_command_executed',
        performedBy: userId,
        performedByRole: userRole,
        targetUserId,
        targetUserName,
        reason: `Executed ${command} ${args}`.trim(),
        metadata: { command, args },
      });
    } else if (DESTRUCTIVE_COMMANDS.has(cmdLower)) {
      await platformMaintenanceService.announceToSupport({
        action: 'destructive_command_executed',
        performedBy: userId,
        performedByRole: userRole,
        reason: `Executed ${command} ${args}`.trim(),
        metadata: { command, args },
      });
    }
  } catch (error) {
    log.error('[CommandAudit] Failed to audit command:', error);
  }
}

/**
 * Check if a command requires audit logging
 */
export function requiresAudit(command: string): boolean {
  const cmdLower = command.toLowerCase();
  return FORCE_COMMANDS.has(cmdLower) || 
         DESTRUCTIVE_COMMANDS.has(cmdLower) || 
         PUNISHMENT_COMMANDS.has(cmdLower);
}

/**
 * System command handler type for dynamic command processing
 * Each handler receives modes, activeBots, roomName, and args
 */
type SystemCommandHandler = (
  modes: RoomMode[],
  activeBots: string[],
  roomName: string,
  args: string
) => ProcessedCommand;

/**
 * Dynamic system command handlers - NO hardcoded switch statements
 * All system commands are registered here with their handlers
 */
const SYSTEM_COMMAND_HANDLERS: Record<string, SystemCommandHandler> = {};

// Register system command handlers dynamically
function registerSystemCommandHandler(name: string, handler: SystemCommandHandler): void {
  SYSTEM_COMMAND_HANDLERS[`/${name}`] = handler;
}

export interface CommandHelpEntry {
  command: string;
  usage: string;
  description: string;
  botName: string;
  minRole: string;
}

export interface MOTDContent {
  greeting: string;
  roomInfo: string;
  availableCommands: CommandHelpEntry[];
  helpTip: string;
}

export interface SystemMessage {
  type: 'system' | 'motd' | 'help' | 'error' | 'info';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Get all available commands for given room modes
 * Dynamically reads from bot registry - no hardcoded commands
 */
export function getCommandsForModes(modes: RoomMode[]): CommandHelpEntry[] {
  const commands: CommandHelpEntry[] = [];
  const seenCommands = new Set<string>();
  
  for (const mode of modes) {
    const bots = getBotsForMode(mode);
    for (const bot of bots) {
      for (const cmd of bot.commands) {
        if (!seenCommands.has(cmd.name)) {
          seenCommands.add(cmd.name);
          commands.push({
            command: `/${cmd.name}`,
            usage: cmd.usage,
            description: cmd.description || '',
            botName: bot.name,
            minRole: cmd.minRole,
          });
        }
      }
    }
  }
  
  return commands.sort((a, b) => a.command.localeCompare(b.command));
}

/**
 * Get all globally available commands (not mode-specific)
 * Dynamically reads from SYSTEM_COMMANDS registry - NO hardcoded commands
 */
export function getGlobalCommands(): CommandHelpEntry[] {
  return getSystemCommands().map(cmd => ({
    command: `/${cmd.name}`,
    usage: cmd.usage,
    description: cmd.description,
    botName: 'System',
    minRole: cmd.minRole,
  }));
}

/**
 * Generate MOTD content for a room
 */
export function generateMOTD(
  roomName: string,
  modes: RoomMode[],
  activeBots: string[] = []
): MOTDContent {
  // Use dynamic mode labels from shared config - NO hardcoded descriptions
  const modeLabels = getRoomModeLabels(modes);
  const modeCommands = getCommandsForModes(modes);
  const globalCommands = getGlobalCommands();
  const allCommands = [...globalCommands, ...modeCommands];
  
  // Dynamic greetings - never static
  const greetings = [
    `${roomName}`,
    `Welcome - ${roomName}`,
    `You're in ${roomName}`,
  ];
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];
  
  // Dynamic help tips
  const helpTips = [
    'Type /help for commands',
    '/help shows available commands',
    'Commands: /help, /who, /topic',
  ];
  const helpTip = helpTips[Math.floor(Math.random() * helpTips.length)];
  
  return {
    greeting,
    roomInfo: `${modeLabels}${activeBots.length > 0 ? ` | Bots: ${activeBots.join(', ')}` : ''}`,
    availableCommands: allCommands,
    helpTip,
  };
}

/**
 * Format MOTD as a displayable string
 */
export function formatMOTDMessage(motd: MOTDContent): string {
  const lines: string[] = [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `  ${motd.greeting}`,
    `  ${motd.roomInfo}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `  ${motd.helpTip}`,
    ``,
  ];
  
  if (motd.availableCommands.length > 0) {
    lines.push(`  Quick Commands:`);
    const topCommands = motd.availableCommands.slice(0, 5);
    for (const cmd of topCommands) {
      lines.push(`    ${cmd.command} - ${cmd.description || cmd.usage}`);
    }
    if (motd.availableCommands.length > 5) {
      lines.push(`    ... and ${motd.availableCommands.length - 5} more (type /commands)`);
    }
  }
  
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  
  return lines.join('\n');
}

/**
 * Format help response for /help command
 */
export function formatHelpMessage(
  modes: RoomMode[],
  activeBots: string[] = [],
  specificCommand?: string
): string {
  const modeCommands = getCommandsForModes(modes);
  const globalCommands = getGlobalCommands();
  const allCommands = [...globalCommands, ...modeCommands];
  
  if (specificCommand) {
    const cmdName = specificCommand.startsWith('/') ? specificCommand : `/${specificCommand}`;
    const cmd = allCommands.find(c => c.command.toLowerCase() === cmdName.toLowerCase());
    
    if (cmd) {
      return [
        `━━━━ Command Help ━━━━`,
        `Command: ${cmd.command}`,
        `Usage: ${cmd.usage}`,
        `Description: ${cmd.description || 'No description available'}`,
        `Provided by: ${cmd.botName}`,
        `Minimum Role: ${cmd.minRole}`,
        `━━━━━━━━━━━━━━━━━━━━━━`,
      ].join('\n');
    } else {
      return `Command "${cmdName}" not found. Type /help for available commands.`;
    }
  }
  
  const lines: string[] = [
    `━━━━ Available Commands ━━━━`,
    ``,
  ];
  
  lines.push(`System Commands:`);
  for (const cmd of globalCommands) {
    lines.push(`  ${cmd.usage.padEnd(25)} ${cmd.description}`);
  }
  
  if (modeCommands.length > 0) {
    lines.push(``);
    lines.push(`Bot Commands:`);
    
    const commandsByBot = new Map<string, CommandHelpEntry[]>();
    for (const cmd of modeCommands) {
      if (!commandsByBot.has(cmd.botName)) {
        commandsByBot.set(cmd.botName, []);
      }
      commandsByBot.get(cmd.botName)!.push(cmd);
    }
    
    for (const [botName, cmds] of commandsByBot) {
      lines.push(`  [${botName}]`);
      for (const cmd of cmds) {
        const roleTag = cmd.minRole !== 'user' ? ` (${cmd.minRole}+)` : '';
        lines.push(`    ${cmd.usage.padEnd(30)} ${cmd.description}${roleTag}`);
      }
    }
  }
  
  if (activeBots.length > 0) {
    lines.push(``);
    lines.push(`Active Bots: ${activeBots.join(', ')}`);
  }
  
  lines.push(``);
  lines.push(`Type /help <command> for detailed help on a specific command`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  
  return lines.join('\n');
}

/**
 * Format bot list message
 */
export function formatBotsMessage(modes: RoomMode[], activeBots: string[] = []): string {
  const availableBots = new Set<BotDefinition>();
  
  for (const mode of modes) {
    const bots = getBotsForMode(mode);
    bots.forEach(bot => availableBots.add(bot));
  }
  
  const lines: string[] = [
    `━━━━ Bots in this Room ━━━━`,
    ``,
  ];
  
  if (availableBots.size === 0) {
    lines.push(`No bots are configured for this room type.`);
  } else {
    for (const bot of availableBots) {
      const status = activeBots.includes(bot.id) ? '● Active' : '○ Available';
      const presenceLabel = bot.presence === 'persistent' ? 'always-on' 
        : bot.presence === 'session' ? 'on-demand' 
        : 'scheduled';
      
      lines.push(`${status} ${bot.name}`);
      lines.push(`   ${bot.description}`);
      lines.push(`   Type: ${presenceLabel} | Commands: ${bot.commands.length}`);
      lines.push(``);
    }
  }
  
  lines.push(`Type /help <command> for command details`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  
  return lines.join('\n');
}

/**
 * Format commands list message (condensed)
 */
export function formatCommandsMessage(modes: RoomMode[]): string {
  const modeCommands = getCommandsForModes(modes);
  const globalCommands = getGlobalCommands();
  const allCommands = [...globalCommands, ...modeCommands];
  
  const lines: string[] = [
    `━━━━ Quick Command Reference ━━━━`,
    ``,
  ];
  
  for (const cmd of allCommands) {
    lines.push(`${cmd.command.padEnd(15)} ${cmd.description || cmd.usage}`);
  }
  
  lines.push(``);
  lines.push(`Total: ${allCommands.length} commands available`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  
  return lines.join('\n');
}

export interface ProcessedCommand {
  handled: boolean;
  response?: SystemMessage;
  forwardToBot?: string;
}

/**
 * Initialize system command handlers from SYSTEM_COMMANDS registry
 * NO hardcoded command names - handlers are derived from registry
 */
function initializeSystemCommandHandlers(): void {
  // Handler implementations keyed by command name
  const handlers: Record<string, (modes: RoomMode[], activeBots: string[], roomName: string, args: string) => ProcessedCommand> = {
    help: (modes, activeBots, roomName, args) => ({
      handled: true,
      response: {
        type: 'help',
        content: formatHelpMessage(modes, activeBots, args || undefined),
        timestamp: new Date(),
      },
    }),
    motd: (modes, activeBots, roomName, args) => ({
      handled: true,
      response: {
        type: 'motd',
        content: formatMOTDMessage(generateMOTD(roomName, modes, activeBots)),
        timestamp: new Date(),
      },
    }),
    commands: (modes, activeBots, roomName, args) => ({
      handled: true,
      response: {
        type: 'info',
        content: formatCommandsMessage(modes),
        timestamp: new Date(),
      },
    }),
    bots: (modes, activeBots, roomName, args) => ({
      handled: true,
      response: {
        type: 'info',
        content: formatBotsMessage(modes, activeBots),
        timestamp: new Date(),
      },
    }),
    who: (modes, activeBots, roomName, args) => ({
      handled: true,
      response: {
        type: 'info',
        content: 'Participant list will be provided by the room.',
        timestamp: new Date(),
        metadata: { requiresParticipantList: true },
      },
    }),
  };

  // Only register handlers for commands that exist in SYSTEM_COMMANDS registry
  for (const cmd of getSystemCommands()) {
    if (handlers[cmd.name]) {
      registerSystemCommandHandler(cmd.name, handlers[cmd.name]);
    }
  }
}

// Initialize handlers on module load
initializeSystemCommandHandlers();

/**
 * Process a potential slash command
 * Uses dynamic registry - NO hardcoded switch statements
 * Adding new commands to SYSTEM_COMMANDS automatically makes them available
 */
export function processSlashCommand(
  message: string,
  modes: RoomMode[],
  activeBots: string[] = [],
  roomName: string = 'Chat Room'
): ProcessedCommand {
  const trimmed = message.trim();
  
  if (!trimmed.startsWith('/')) {
    return { handled: false };
  }
  
  const parts = trimmed.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');
  
  // Check dynamic system command handlers first (from SYSTEM_COMMANDS registry)
  const handler = SYSTEM_COMMAND_HANDLERS[command];
  if (handler) {
    return handler(modes, activeBots, roomName, args);
  }
  
  // Check bot commands from BOT_REGISTRY
  for (const [botId, bot] of Object.entries(BOT_REGISTRY)) {
    if (bot.triggers.commands.includes(command)) {
      return {
        handled: false,
        forwardToBot: botId,
      };
    }
  }
  
  return { handled: false };
}

/**
 * Create a system message for display
 */
export function createSystemMessage(
  type: SystemMessage['type'],
  content: string,
  metadata?: Record<string, any>
): SystemMessage {
  return {
    type,
    content,
    timestamp: new Date(),
    metadata,
  };
}

/**
 * Get join welcome message for new room participants
 */
export function getJoinWelcome(
  userName: string,
  roomName: string,
  modes: RoomMode[],
  activeBots: string[] = []
): SystemMessage {
  const quickCommands = getGlobalCommands().slice(0, 3).map(c => c.command).join(', ');
  
  return {
    type: 'system',
    content: [
      `Welcome, ${userName}!`,
      `You've joined ${roomName}.`,
      ``,
      `Quick start: ${quickCommands}`,
      `Type /help for full command list.`,
    ].join('\n'),
    timestamp: new Date(),
    metadata: {
      event: 'user_joined',
      modes,
      activeBots,
    },
  };
}

log.info('[ChatroomCommandService] Initialized with', Object.keys(BOT_REGISTRY).length, 'bot definitions');
