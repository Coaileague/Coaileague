/**
 * Command Documentation API
 * Comprehensive IRC-style command reference with RBAC-aware display
 * 
 * Features:
 * - All commands from bot registry and system commands
 * - Role-based visibility with lock indicators
 * - Force command flagging for audit/transparency
 * - Categorized by: System, Bot, Moderation, Administrative
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../rbac';
import { BOT_REGISTRY, SYSTEM_COMMANDS, getSystemCommands, SystemCommand, BotCommand, BotDefinition } from '../bots/registry';
import { db } from '../db';
import { systemAuditLogs } from '@shared/schema';
import { platformMaintenanceService } from '../services/platformMaintenanceService';
import { requireAuth } from '../auth';
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('CommandDocumentation');


export const commandDocRouter = Router();

commandDocRouter.use(requireAuth);

// Role hierarchy for RBAC - aligned with platform role model
// Combines workspace roles and platform support tiers
const ROLE_HIERARCHY: Record<string, number> = {
  // Workspace roles (standard IRC-style)
  'user': 1,
  'voice': 2,
  'operator': 3,
  'manager': 4,
  'supervisor': 5,
  'org_admin': 6,
  // Platform support tiers
  'support_agent': 7,
  'support_manager': 8,
  'sysop': 9,
  // Platform admin roles
  'deputy_admin': 10,
  'root_admin': 11,
  // Bot and system roles (highest access)
  'system': 12,
  'bot': 12,
};

export interface DocumentedCommand {
  command: string;
  usage: string;
  description: string;
  category: 'system' | 'bot' | 'moderation' | 'administrative' | 'support';
  source: string; // Bot name or 'System'
  minRole: string;
  isForceCommand: boolean;
  isDestructive: boolean;
  isPunishment: boolean;
  requiresAudit: boolean;
  examples: string[];
  flags: string[];
}

// Force commands that bypass normal authorization - always flagged
const FORCE_COMMANDS = [
  '/forceclock',
  '/forcekick',
  '/forceban',
  '/forcemute',
  '/forceclose',
  '/forcemode',
  '/forcejoin',
  '/forcepart',
];

// Destructive commands that modify/delete data
const DESTRUCTIVE_COMMANDS = [
  '/kick',
  '/ban',
  '/mute',
  '/close',
  '/delete',
  '/purge',
  '/clear',
  '/wipe',
  '/remove',
  '/revoke',
];

// Punishment commands affecting users
const PUNISHMENT_COMMANDS = [
  '/kick',
  '/ban',
  '/mute',
  '/warn',
  '/timeout',
  '/suspend',
  '/demote',
];

// Commands that require audit logging
const AUDIT_REQUIRED_COMMANDS = [
  ...FORCE_COMMANDS,
  ...DESTRUCTIVE_COMMANDS,
  ...PUNISHMENT_COMMANDS,
  '/maintenance',
  '/broadcast',
  '/elevate',
  '/bypass',
];

/**
 * Get full command documentation with RBAC context
 */
function getAllCommands(): DocumentedCommand[] {
  const commands: DocumentedCommand[] = [];
  
  // System commands
  for (const cmd of getSystemCommands()) {
    const cmdName = `/${cmd.name}`;
    commands.push({
      command: cmdName,
      usage: cmd.usage,
      description: cmd.description,
      category: determineCategory(cmdName, cmd.minRole),
      source: 'System',
      minRole: cmd.minRole,
      isForceCommand: FORCE_COMMANDS.includes(cmdName),
      isDestructive: DESTRUCTIVE_COMMANDS.includes(cmdName),
      isPunishment: PUNISHMENT_COMMANDS.includes(cmdName),
      requiresAudit: AUDIT_REQUIRED_COMMANDS.includes(cmdName),
      examples: generateExamples(cmdName, cmd.usage),
      flags: generateFlags(cmdName, cmd.minRole),
    });
  }
  
  // Bot commands
  for (const [botId, bot] of Object.entries(BOT_REGISTRY)) {
    for (const cmd of bot.commands) {
      const cmdName = `/${cmd.name}`;
      if (!commands.find(c => c.command === cmdName)) {
        commands.push({
          command: cmdName,
          usage: cmd.usage,
          description: cmd.description || '',
          category: determineCategory(cmdName, cmd.minRole),
          source: bot.name,
          minRole: cmd.minRole,
          isForceCommand: FORCE_COMMANDS.includes(cmdName),
          isDestructive: DESTRUCTIVE_COMMANDS.includes(cmdName),
          isPunishment: PUNISHMENT_COMMANDS.includes(cmdName),
          requiresAudit: AUDIT_REQUIRED_COMMANDS.includes(cmdName),
          examples: generateExamples(cmdName, cmd.usage),
          flags: generateFlags(cmdName, cmd.minRole),
        });
      }
    }
  }
  
  // Add moderation commands that bots/support can use
  const moderationCommands: Partial<DocumentedCommand>[] = [
    { command: '/kick', usage: '/kick @user [reason]', description: 'Remove user from room', minRole: 'operator' },
    { command: '/ban', usage: '/ban @user [duration] [reason]', description: 'Ban user from room', minRole: 'supervisor' },
    { command: '/mute', usage: '/mute @user [duration]', description: 'Prevent user from sending messages', minRole: 'operator' },
    { command: '/unmute', usage: '/unmute @user', description: 'Remove mute from user', minRole: 'operator' },
    { command: '/warn', usage: '/warn @user <reason>', description: 'Issue formal warning to user', minRole: 'operator' },
    { command: '/topic', usage: '/topic <new topic>', description: 'Change room topic', minRole: 'operator' },
    { command: '/mode', usage: '/mode <+/-flag>', description: 'Change room modes', minRole: 'manager' },
    { command: '/op', usage: '/op @user', description: 'Grant operator status', minRole: 'manager' },
    { command: '/deop', usage: '/deop @user', description: 'Remove operator status', minRole: 'manager' },
    { command: '/voice', usage: '/voice @user', description: 'Grant voice (speak) permission', minRole: 'operator' },
    { command: '/devoice', usage: '/devoice @user', description: 'Remove voice permission', minRole: 'operator' },
    { command: '/invite', usage: '/invite @user', description: 'Invite user to room', minRole: 'voice' },
    { command: '/close', usage: '/close [reason]', description: 'Close room to new participants', minRole: 'supervisor' },
    { command: '/open', usage: '/open', description: 'Reopen closed room', minRole: 'supervisor' },
  ];
  
  for (const mod of moderationCommands) {
    if (!commands.find(c => c.command === mod.command)) {
      commands.push({
        command: mod.command!,
        usage: mod.usage!,
        description: mod.description!,
        category: 'moderation',
        source: 'IRC',
        minRole: mod.minRole!,
        isForceCommand: FORCE_COMMANDS.includes(mod.command!),
        isDestructive: DESTRUCTIVE_COMMANDS.includes(mod.command!),
        isPunishment: PUNISHMENT_COMMANDS.includes(mod.command!),
        requiresAudit: AUDIT_REQUIRED_COMMANDS.includes(mod.command!),
        examples: generateExamples(mod.command!, mod.usage!),
        flags: generateFlags(mod.command!, mod.minRole!),
      });
    }
  }
  
  // Support/Admin commands
  const supportCommands: Partial<DocumentedCommand>[] = [
    { command: '/escalate', usage: '/escalate <reason>', description: 'Escalate to higher support tier', minRole: 'user' },
    { command: '/ticket', usage: '/ticket <description>', description: 'Create support ticket', minRole: 'user' },
    { command: '/resolve', usage: '/resolve [notes]', description: 'Mark ticket as resolved', minRole: 'operator' },
    { command: '/transfer', usage: '/transfer @agent', description: 'Transfer ticket to another agent', minRole: 'operator' },
    { command: '/priority', usage: '/priority <low|medium|high|urgent>', description: 'Set ticket priority', minRole: 'operator' },
    { command: '/assign', usage: '/assign @agent', description: 'Assign ticket to agent', minRole: 'supervisor' },
    { command: '/forcekick', usage: '/forcekick @user <reason>', description: 'Force remove user (bypasses normal checks)', minRole: 'supervisor' },
    { command: '/forceban', usage: '/forceban @user <duration> <reason>', description: 'Force ban user (bypasses normal checks)', minRole: 'admin' },
    { command: '/forcemute', usage: '/forcemute @user <duration> <reason>', description: 'Force mute user', minRole: 'supervisor' },
    { command: '/forceclose', usage: '/forceclose <reason>', description: 'Force close room', minRole: 'admin' },
    { command: '/forcemode', usage: '/forcemode <+/-flag> <reason>', description: 'Force mode change', minRole: 'admin' },
    { command: '/audit', usage: '/audit [@user|#room]', description: 'View audit log for user/room', minRole: 'supervisor' },
    { command: '/history', usage: '/history [@user|#room] [count]', description: 'View message history', minRole: 'supervisor' },
    { command: '/whois', usage: '/whois @user', description: 'View detailed user info', minRole: 'operator' },
    { command: '/elevate', usage: '/elevate <reason>', description: 'Request elevated permissions', minRole: 'supervisor' },
  ];
  
  for (const sup of supportCommands) {
    if (!commands.find(c => c.command === sup.command)) {
      commands.push({
        command: sup.command!,
        usage: sup.usage!,
        description: sup.description!,
        category: 'support',
        source: 'Support',
        minRole: sup.minRole!,
        isForceCommand: FORCE_COMMANDS.includes(sup.command!),
        isDestructive: DESTRUCTIVE_COMMANDS.includes(sup.command!),
        isPunishment: PUNISHMENT_COMMANDS.includes(sup.command!),
        requiresAudit: AUDIT_REQUIRED_COMMANDS.includes(sup.command!),
        examples: generateExamples(sup.command!, sup.usage!),
        flags: generateFlags(sup.command!, sup.minRole!),
      });
    }
  }
  
  return commands.sort((a, b) => {
    const catOrder = { system: 0, bot: 1, moderation: 2, support: 3, administrative: 4 };
    const catDiff = catOrder[a.category] - catOrder[b.category];
    if (catDiff !== 0) return catDiff;
    return a.command.localeCompare(b.command);
  });
}

function determineCategory(cmd: string, minRole: string): DocumentedCommand['category'] {
  if (FORCE_COMMANDS.includes(cmd) || ['admin', 'platform_admin'].includes(minRole)) {
    return 'administrative';
  }
  if (cmd.startsWith('/force') || ['supervisor'].includes(minRole)) {
    return 'support';
  }
  if (DESTRUCTIVE_COMMANDS.includes(cmd) || PUNISHMENT_COMMANDS.includes(cmd)) {
    return 'moderation';
  }
  return 'system';
}

function generateExamples(cmd: string, usage: string): string[] {
  const examples: Record<string, string[]> = {
    '/help': ['/help', '/help kick', '/help maintenance'],
    '/kick': ['/kick @johndoe', '/kick @johndoe Disruptive behavior'],
    '/ban': ['/ban @johndoe 24h Repeated violations', '/ban @johndoe permanent TOS violation'],
    '/mute': ['/mute @johndoe 1h', '/mute @johndoe 30m Spam'],
    '/maintenance': ['/maintenance on', '/maintenance off', '/maintenance status', '/maintenance on Database upgrade 30'],
    '/broadcast': ['/broadcast System will restart in 5 minutes'],
    '/clockme': ['/clockme in GPS not working', '/clockme out Leaving site'],
    '/forceclock': ['/forceclock @johndoe in Manual override requested'],
    '/meetingstart': ['/meetingstart Weekly Standup', '/meetingstart'],
    '/report': ['/report', '/incident theft'],
  };
  return examples[cmd] || [`${usage.replace(/\[.*?\]/g, '').replace(/<.*?>/g, 'value').trim()}`];
}

function generateFlags(cmd: string, minRole: string): string[] {
  const flags: string[] = [];
  if (FORCE_COMMANDS.includes(cmd)) flags.push('FORCE');
  if (DESTRUCTIVE_COMMANDS.includes(cmd)) flags.push('DESTRUCTIVE');
  if (PUNISHMENT_COMMANDS.includes(cmd)) flags.push('PUNISHMENT');
  if (AUDIT_REQUIRED_COMMANDS.includes(cmd)) flags.push('AUDIT_LOGGED');
  if (['supervisor', 'admin', 'platform_admin'].includes(minRole)) flags.push('ELEVATED');
  return flags;
}

/**
 * Check if user role can execute command
 */
function canExecuteCommand(userRole: string, commandMinRole: string): boolean {
  const userLevel = ROLE_HIERARCHY[userRole] || 1;
  const requiredLevel = ROLE_HIERARCHY[commandMinRole] || 1;
  return userLevel >= requiredLevel;
}

/**
 * GET /api/commands
 * Get all commands with RBAC context for current user
 */
commandDocRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userRole = (req.user)?.workspaceRole || req.user?.role || 'user';
    const allCommands = getAllCommands();
    
    // Add access info for each command
    const commandsWithAccess = allCommands.map(cmd => ({
      ...cmd,
      canExecute: canExecuteCommand(userRole, cmd.minRole),
      locked: !canExecuteCommand(userRole, cmd.minRole),
    }));
    
    // Group by category
    const categorized = {
      system: commandsWithAccess.filter(c => c.category === 'system'),
      bot: commandsWithAccess.filter(c => c.category === 'bot'),
      moderation: commandsWithAccess.filter(c => c.category === 'moderation'),
      support: commandsWithAccess.filter(c => c.category === 'support'),
      administrative: commandsWithAccess.filter(c => c.category === 'administrative'),
    };
    
    res.json({
      success: true,
      userRole,
      totalCommands: allCommands.length,
      accessibleCommands: commandsWithAccess.filter(c => c.canExecute).length,
      lockedCommands: commandsWithAccess.filter(c => c.locked).length,
      commands: commandsWithAccess,
      categorized,
      roleHierarchy: ROLE_HIERARCHY,
    });
  } catch (error: unknown) {
    log.error('[CommandDoc] Error getting commands:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/commands/categories
 * Get command categories with counts
 */
commandDocRouter.get('/categories', async (req: AuthenticatedRequest, res: Response) => {
  const allCommands = getAllCommands();
  const userRole = (req.user)?.workspaceRole || req.user?.role || 'user';
  
  const categories = {
    system: { 
      name: 'System Commands', 
      description: 'Core commands available everywhere',
      icon: 'terminal',
      count: allCommands.filter(c => c.category === 'system').length,
      accessible: allCommands.filter(c => c.category === 'system' && canExecuteCommand(userRole, c.minRole)).length,
    },
    bot: { 
      name: 'Bot Commands', 
      description: 'Commands handled by AI bots',
      icon: 'bot',
      count: allCommands.filter(c => c.category === 'bot').length,
      accessible: allCommands.filter(c => c.category === 'bot' && canExecuteCommand(userRole, c.minRole)).length,
    },
    moderation: { 
      name: 'Moderation', 
      description: 'Room and user management',
      icon: 'shield',
      count: allCommands.filter(c => c.category === 'moderation').length,
      accessible: allCommands.filter(c => c.category === 'moderation' && canExecuteCommand(userRole, c.minRole)).length,
    },
    support: { 
      name: 'Support Tools', 
      description: 'Support staff utilities',
      icon: 'headset',
      count: allCommands.filter(c => c.category === 'support').length,
      accessible: allCommands.filter(c => c.category === 'support' && canExecuteCommand(userRole, c.minRole)).length,
    },
    administrative: { 
      name: 'Administrative', 
      description: 'Platform administration',
      icon: 'settings',
      count: allCommands.filter(c => c.category === 'administrative').length,
      accessible: allCommands.filter(c => c.category === 'administrative' && canExecuteCommand(userRole, c.minRole)).length,
    },
  };
  
  res.json({ success: true, categories });
});

/**
 * POST /api/commands/validate
 * Validate if user can execute command and flag if unauthorized
 */
commandDocRouter.post('/validate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { command, args } = req.body;
    const userId = req.user?.id || 'anonymous';
    const userRole = (req.user)?.workspaceRole || req.user?.role || 'user';
    
    const cmdName = command.startsWith('/') ? command.split(' ')[0] : `/${command.split(' ')[0]}`;
    const allCommands = getAllCommands();
    const cmdDef = allCommands.find(c => c.command.toLowerCase() === cmdName.toLowerCase());
    
    if (!cmdDef) {
      return res.json({
        success: true,
        valid: false,
        reason: 'UNKNOWN_COMMAND',
        message: `Unknown command: ${cmdName}`,
      });
    }
    
    const canExecute = canExecuteCommand(userRole, cmdDef.minRole);
    
    // If cannot execute, flag for audit and announce to support
    if (!canExecute) {
      await db.insert(systemAuditLogs).values({
        workspaceId: 'system',
        userId,
        action: 'unauthorized_command_attempt',
        entityType: 'command',
        entityId: cmdName,
        changes: {
          command: cmdName,
          args,
          userRole,
          requiredRole: cmdDef.minRole,
          timestamp: new Date().toISOString(),
        },
        metadata: {
          flagType: 'UNAUTHORIZED_ACCESS',
          severity: cmdDef.isForceCommand ? 'high' : 'medium',
        },
        ipAddress: req.ip || '127.0.0.1',
      });
      
      // Announce to support staff for transparency
      await platformMaintenanceService.announceToSupport({
        action: 'unauthorized_command_attempt',
        performedBy: userId,
        performedByRole: userRole,
        reason: `Attempted ${cmdName} (requires ${cmdDef.minRole}, has ${userRole})`,
        metadata: { command: cmdName, args, requiredRole: cmdDef.minRole },
      });
      
      return res.json({
        success: true,
        valid: false,
        reason: 'INSUFFICIENT_ROLE',
        message: `This command requires ${cmdDef.minRole} role or higher`,
        requiredRole: cmdDef.minRole,
        userRole,
        flagged: true,
        flagType: 'unauthorized_attempt',
      });
    }
    
    // If force command, flag for audit even if authorized
    if (cmdDef.isForceCommand || cmdDef.requiresAudit) {
      await db.insert(systemAuditLogs).values({
        workspaceId: 'system',
        userId,
        action: 'audited_command_execution',
        entityType: 'command',
        entityId: cmdName,
        changes: {
          command: cmdName,
          args,
          userRole,
          flags: cmdDef.flags,
          timestamp: new Date().toISOString(),
        },
        metadata: {
          flagType: cmdDef.isForceCommand ? 'FORCE_COMMAND' : 'AUDIT_REQUIRED',
          severity: cmdDef.isDestructive || cmdDef.isPunishment ? 'high' : 'medium',
        },
        ipAddress: req.ip || '127.0.0.1',
      });
      
      // Announce force/destructive/punishment commands to support for transparency
      if (cmdDef.isForceCommand) {
        await platformMaintenanceService.announceToSupport({
          action: 'force_command_executed',
          performedBy: userId,
          performedByRole: userRole,
          reason: `Executed ${cmdName} ${args || ''}`.trim(),
          metadata: { command: cmdName, args, flags: cmdDef.flags },
        });
      } else if (cmdDef.isDestructive) {
        await platformMaintenanceService.announceToSupport({
          action: 'destructive_command_executed',
          performedBy: userId,
          performedByRole: userRole,
          reason: `Executed ${cmdName} ${args || ''}`.trim(),
          metadata: { command: cmdName, args },
        });
      } else if (cmdDef.isPunishment) {
        await platformMaintenanceService.announceToSupport({
          action: 'punishment_command_executed',
          performedBy: userId,
          performedByRole: userRole,
          reason: `Executed ${cmdName} ${args || ''}`.trim(),
          metadata: { command: cmdName, args },
        });
      }
    }
    
    res.json({
      success: true,
      valid: true,
      command: cmdDef,
      canExecute: true,
      flagged: cmdDef.requiresAudit,
      flagType: cmdDef.isForceCommand ? 'force_command' : cmdDef.requiresAudit ? 'audit_logged' : null,
    });
  } catch (error: unknown) {
    log.error('[CommandDoc] Validation error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/commands/search
 * Search commands by keyword
 */
commandDocRouter.get('/search', async (req: AuthenticatedRequest, res: Response) => {
  const { q } = req.query;
  const userRole = (req.user)?.workspaceRole || req.user?.role || 'user';
  
  if (!q || typeof q !== 'string') {
    return res.json({ success: true, results: [] });
  }
  
  const query = q.toLowerCase();
  const allCommands = getAllCommands();
  
  const results = allCommands.filter(cmd => 
    cmd.command.toLowerCase().includes(query) ||
    cmd.description.toLowerCase().includes(query) ||
    cmd.usage.toLowerCase().includes(query) ||
    cmd.source.toLowerCase().includes(query)
  ).map(cmd => ({
    ...cmd,
    canExecute: canExecuteCommand(userRole, cmd.minRole),
    locked: !canExecuteCommand(userRole, cmd.minRole),
  }));
  
  res.json({ success: true, results, query: q });
});

log.info('[CommandDocRouter] Initialized with comprehensive command documentation');
