/**
 * Shared slash command definitions and parsing
 * Used by both client (validation) and server (execution)
 */

export type SlashCommand = 
  | 'intro'      // AI bot introduces staff to customer
  | 'welcome'    // Send welcome message
  | 'close'      // Close conversation
  | 'assign'     // Assign conversation to staff
  | 'transfer'   // Transfer to another staff member
  | 'mute'       // Mute a user
  | 'kick'       // Remove user from chat
  | 'auth'       // Request user authentication
  | 'verify'     // Verify user organization
  | 'resetpass'  // Send password reset
  | 'status'     // Check ticket status (customer)
  | 'queue'      // Check queue position (customer)
  | 'help';      // Show available commands

export interface ParsedCommand {
  command: SlashCommand;
  args: string[];
  rawMessage: string;
}

export interface CommandDefinition {
  command: SlashCommand;
  description: string;
  usage: string;
  requiresStaff: boolean;
  minArgs?: number;
  maxArgs?: number;
}

/**
 * Command registry - defines all available slash commands
 */
export const COMMAND_REGISTRY: Record<SlashCommand, CommandDefinition> = {
  intro: {
    command: 'intro',
    description: 'AI bot introduces you to the customer and requests their info',
    usage: '/intro',
    requiresStaff: true,
    minArgs: 0,
    maxArgs: 0,
  },
  welcome: {
    command: 'welcome',
    description: 'Send welcome message to customer',
    usage: '/welcome [customer name]',
    requiresStaff: true,
    minArgs: 0,
    maxArgs: 5,
  },
  close: {
    command: 'close',
    description: 'Close the current conversation',
    usage: '/close [reason]',
    requiresStaff: true,
    minArgs: 0,
    maxArgs: 10,
  },
  assign: {
    command: 'assign',
    description: 'Assign conversation to yourself or another staff member',
    usage: '/assign [staff name]',
    requiresStaff: true,
    minArgs: 0,
    maxArgs: 5,
  },
  transfer: {
    command: 'transfer',
    description: 'Transfer conversation to another staff member',
    usage: '/transfer <staff name>',
    requiresStaff: true,
    minArgs: 1,
    maxArgs: 5,
  },
  mute: {
    command: 'mute',
    description: 'Mute a user temporarily',
    usage: '/mute <username> [duration in minutes]',
    requiresStaff: true,
    minArgs: 1,
    maxArgs: 2,
  },
  kick: {
    command: 'kick',
    description: 'Remove a user from the chatroom',
    usage: '/kick <username> [reason]',
    requiresStaff: true,
    minArgs: 1,
    maxArgs: 10,
  },
  auth: {
    command: 'auth',
    description: 'Request user authentication (triggers auth popup for user)',
    usage: '/auth <username>',
    requiresStaff: true,
    minArgs: 1,
    maxArgs: 1,
  },
  verify: {
    command: 'verify',
    description: 'Verify user organization credentials',
    usage: '/verify <username>',
    requiresStaff: true,
    minArgs: 1,
    maxArgs: 1,
  },
  resetpass: {
    command: 'resetpass',
    description: 'Send password reset link to user email',
    usage: '/resetpass <email>',
    requiresStaff: true,
    minArgs: 1,
    maxArgs: 1,
  },
  status: {
    command: 'status',
    description: 'Check your ticket status and information',
    usage: '/status',
    requiresStaff: false,
    minArgs: 0,
    maxArgs: 0,
  },
  queue: {
    command: 'queue',
    description: 'Check your position in the support queue',
    usage: '/queue',
    requiresStaff: false,
    minArgs: 0,
    maxArgs: 0,
  },
  help: {
    command: 'help',
    description: 'Show available commands',
    usage: '/help',
    requiresStaff: false,
    minArgs: 0,
    maxArgs: 0,
  },
};

/**
 * Parse a message to detect and extract slash command
 * Returns null if message is not a command
 */
export function parseSlashCommand(message: string): ParsedCommand | null {
  const trimmed = message.trim();
  
  // Must start with /
  if (!trimmed.startsWith('/')) {
    return null;
  }
  
  // Split into command and args
  const parts = trimmed.slice(1).split(/\s+/);
  const commandName = parts[0].toLowerCase();
  const args = parts.slice(1);
  
  // Check if valid command
  if (!(commandName in COMMAND_REGISTRY)) {
    return null;
  }
  
  return {
    command: commandName as SlashCommand,
    args,
    rawMessage: trimmed,
  };
}

/**
 * Validate command arguments
 */
export function validateCommand(parsed: ParsedCommand): { valid: boolean; error?: string } {
  const def = COMMAND_REGISTRY[parsed.command];
  
  // Check minimum args
  if (def.minArgs !== undefined && parsed.args.length < def.minArgs) {
    return {
      valid: false,
      error: `Command /${parsed.command} requires at least ${def.minArgs} argument(s). Usage: ${def.usage}`,
    };
  }
  
  // Check maximum args
  if (def.maxArgs !== undefined && parsed.args.length > def.maxArgs) {
    return {
      valid: false,
      error: `Command /${parsed.command} accepts at most ${def.maxArgs} argument(s). Usage: ${def.usage}`,
    };
  }
  
  return { valid: true };
}

/**
 * Generate help text for all available commands
 */
export function getHelpText(isStaff: boolean): string {
  const commands = Object.values(COMMAND_REGISTRY)
    .filter(cmd => !cmd.requiresStaff || isStaff);
  
  let help = '**Available Commands:**\n\n';
  commands.forEach(cmd => {
    help += `**/${cmd.command}** - ${cmd.description}\n`;
    help += `Usage: \`${cmd.usage}\`\n\n`;
  });
  
  return help;
}
