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
  | 'whisper'    // Send private message to user (staff only)
  | 'privmsg'    // IRC-style private message (everyone)
  | 'auth'       // Request user authentication
  | 'verify'     // Verify user organization
  | 'resetpass'  // Send password reset
  | 'resetemail' // Reset user email address
  | 'lock'       // Lock user account
  | 'unlock'     // Unlock user account
  | 'requestinfo'// Request verification info from user
  | 'escalate'   // Escalate to human support
  | 'resolve'    // Resolve/close ticket
  | 'userinfo'   // Get user account details
  | 'sessions'   // View/revoke user sessions
  | 'status'     // Check ticket status (customer)
  | 'queue'      // Check queue position (customer)
  | 'ask'        // Ask AI knowledge base (everyone)
  | 'suspend'    // Suspend staff member (deputy_admin+)
  | 'reactivate' // Reactivate suspended staff (deputy_admin+)
  | 'broadcast'  // Send announcement to all (root/deputy_admin)
  | 'restart'    // Restart chat services (root/deputy_admin)
  | 'staffstatus'// Check staff member status
  | 'motd'       // Set Message of the Day (staff only)
  | 'banner'     // Update announcement banner (staff only)
  | 'approve'    // Approve pending destructive action
  | 'ratelimits' // View rate limit status
  | 'pendingapprovals' // View pending approval requests
  | 'resetpassword' // Send password reset email
  | 'help'       // Show available commands
  | 'commands'   // Quick command list
  | 'bots'       // Show available bots
  | 'who'        // List room participants
  | 'me'         // IRC-style action message
  | 'away'       // Set away status
  | 'back'       // Return from away status
  | 'helpai'     // Invoke HelpAI bot for assistance
  | 'dm'         // Direct message shortcut (alias for privmsg)
  | 'screenshot' // Send a screenshot to support
  | 'verifyme'   // Request account verification (customer)
  | 'issue'      // Report an issue
  | 'mention'    // Mention a user in chat
  | 'trinity'    // Summon Trinity AI for inline assistance
  | 'meetingstart'  // Start meeting recording (MeetingBot)
  | 'meetingend'    // End meeting, generate minutes (MeetingBot)
  | 'meetingpause'  // Pause meeting recording (MeetingBot)
  | 'meetingcontinue' // Resume meeting recording (MeetingBot)
  | 'actionitem'    // Add action item to meeting minutes (MeetingBot)
  | 'decision'      // Record a decision in meeting (MeetingBot)
  | 'note'          // Add note to meeting record (MeetingBot)
  | 'report'        // Start inline incident report (ReportBot)
  | 'incident'      // Log incident by type (ReportBot)
  | 'endreport'     // Finalize and submit report (ReportBot)
  | 'analyzereports' // Analyze reports, generate summary (ReportBot)
  | 'clockme'       // Manual clock in/out (ClockBot)
  | 'forceclock'    // Force clock for employee (ClockBot)
  | 'clockstatus'   // Check clock status (ClockBot)
  | 'nuke'          // Nuke/reset a bugged room (platform staff only)
  | 'reopen'        // Reopen a closed conversation (agent/management only)
  | 'muteall';      // Mute all non-staff users in a room (staff only)

// Message display kinds for MSN-style color coding
export type MessageKind = 'public' | 'system' | 'private' | 'action';

// Get color class for message kind (MSN-style)
export function getMessageColorClass(kind: MessageKind): string {
  switch (kind) {
    case 'public': return 'text-blue-600';      // Blue for public messages
    case 'system': return 'text-red-600';       // Red for system messages
    case 'private': return 'text-purple-600';   // Purple for DMs
    case 'action': return 'text-green-600';     // Green for actions taken
    default: return 'text-foreground';
  }
}

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
  requiresEmergencyPrivileges?: boolean; // root/deputy_admin only
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
  whisper: {
    command: 'whisper',
    description: 'Send a private message to a specific user (only they can see it)',
    usage: '/whisper <userId> <message>',
    requiresStaff: true,
    minArgs: 2,
    maxArgs: 100,
  },
  privmsg: {
    command: 'privmsg',
    description: 'Send a private message to another user (IRC-style)',
    usage: '/privmsg <username> <message>',
    requiresStaff: false,
    minArgs: 2,
    maxArgs: 100,
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
  ask: {
    command: 'ask',
    description: 'Ask AI assistant about policies, procedures, and FAQs',
    usage: '/ask <your question>',
    requiresStaff: false,
    minArgs: 1,
    maxArgs: 100,
  },
  help: {
    command: 'help',
    description: 'Show available commands or details about a specific command',
    usage: '/help [command]',
    requiresStaff: false,
    minArgs: 0,
    maxArgs: 1,
  },
  commands: {
    command: 'commands',
    description: 'Quick list of all available commands',
    usage: '/commands',
    requiresStaff: false,
    minArgs: 0,
    maxArgs: 0,
  },
  bots: {
    command: 'bots',
    description: 'Show available bots and their status in this room',
    usage: '/bots',
    requiresStaff: false,
    minArgs: 0,
    maxArgs: 0,
  },
  who: {
    command: 'who',
    description: 'List participants in this room',
    usage: '/who',
    requiresStaff: false,
    minArgs: 0,
    maxArgs: 0,
  },
  suspend: {
    command: 'suspend',
    description: 'Suspend a staff member (deputy_admin+ only)',
    usage: '/suspend <staff_username> [reason]',
    requiresStaff: true,
    requiresEmergencyPrivileges: true,
    minArgs: 1,
    maxArgs: 10,
  },
  reactivate: {
    command: 'reactivate',
    description: 'Reactivate a suspended staff member (deputy_admin+ only)',
    usage: '/reactivate <staff_username>',
    requiresStaff: true,
    requiresEmergencyPrivileges: true,
    minArgs: 1,
    maxArgs: 1,
  },
  broadcast: {
    command: 'broadcast',
    description: 'Send announcement to all users (root/deputy_admin)',
    usage: '/broadcast <message>',
    requiresStaff: true,
    requiresEmergencyPrivileges: true,
    minArgs: 1,
    maxArgs: 50,
  },
  restart: {
    command: 'restart',
    description: 'Restart chat services (root/deputy_admin emergency)',
    usage: '/restart',
    requiresStaff: true,
    requiresEmergencyPrivileges: true,
    minArgs: 0,
    maxArgs: 0,
  },
  staffstatus: {
    command: 'staffstatus',
    description: 'Check staff member status and privileges',
    usage: '/staffstatus [staff_username]',
    requiresStaff: true,
    minArgs: 0,
    maxArgs: 5,
  },
  motd: {
    command: 'motd',
    description: 'Set the Message of the Day shown to all users',
    usage: '/motd <message>',
    requiresStaff: true,
    minArgs: 1,
    maxArgs: 100,
  },
  banner: {
    command: 'banner',
    description: 'Update the announcement banner message visible to all users',
    usage: '/banner <message>',
    requiresStaff: true,
    minArgs: 1,
    maxArgs: 100,
  },
  resetemail: {
    command: 'resetemail',
    description: 'Reset user email address (requires verification)',
    usage: '/resetemail <userId> <newEmail>',
    requiresStaff: true,
    minArgs: 2,
    maxArgs: 2,
  },
  resetpassword: {
    command: 'resetpassword',
    description: 'Send password reset email to user',
    usage: '/resetpassword <userId>',
    requiresStaff: true,
    minArgs: 1,
    maxArgs: 1,
  },
  approve: {
    command: 'approve',
    description: 'Approve a pending destructive action request (root_admin/co_admin only)',
    usage: '/approve <approvalId>',
    requiresStaff: true,
    minArgs: 1,
    maxArgs: 1,
  },
  ratelimits: {
    command: 'ratelimits',
    description: 'View your current rate limit status for destructive actions',
    usage: '/ratelimits',
    requiresStaff: true,
    minArgs: 0,
    maxArgs: 0,
  },
  pendingapprovals: {
    command: 'pendingapprovals',
    description: 'View pending approval requests (root_admin/co_admin only)',
    usage: '/pendingapprovals',
    requiresStaff: true,
    minArgs: 0,
    maxArgs: 0,
  },
  lock: {
    command: 'lock',
    description: 'Lock user account (prevent login)',
    usage: '/lock <userId> [reason]',
    requiresStaff: true,
    minArgs: 1,
    maxArgs: 10,
  },
  unlock: {
    command: 'unlock',
    description: 'Unlock user account',
    usage: '/unlock <userId>',
    requiresStaff: true,
    minArgs: 1,
    maxArgs: 1,
  },
  requestinfo: {
    command: 'requestinfo',
    description: 'Request verification information from user',
    usage: '/requestinfo <userId> <infoType>',
    requiresStaff: true,
    minArgs: 2,
    maxArgs: 5,
  },
  escalate: {
    command: 'escalate',
    description: 'Escalate current session to human support',
    usage: '/escalate [priority] [reason]',
    requiresStaff: false,
    minArgs: 0,
    maxArgs: 10,
  },
  resolve: {
    command: 'resolve',
    description: 'Mark ticket as resolved and close session',
    usage: '/resolve [resolution notes]',
    requiresStaff: true,
    minArgs: 0,
    maxArgs: 20,
  },
  userinfo: {
    command: 'userinfo',
    description: 'Get user account details and status',
    usage: '/userinfo <userId or email>',
    requiresStaff: true,
    minArgs: 1,
    maxArgs: 1,
  },
  sessions: {
    command: 'sessions',
    description: 'View or revoke user sessions',
    usage: '/sessions <userId> [revoke]',
    requiresStaff: true,
    minArgs: 1,
    maxArgs: 2,
  },
  me: {
    command: 'me',
    description: 'Send an action message (e.g., "* User waves hello")',
    usage: '/me <action>',
    requiresStaff: false,
    minArgs: 1,
    maxArgs: 100,
  },
  away: {
    command: 'away',
    description: 'Set your status to away with optional message',
    usage: '/away [reason]',
    requiresStaff: false,
    minArgs: 0,
    maxArgs: 50,
  },
  back: {
    command: 'back',
    description: 'Return from away status',
    usage: '/back',
    requiresStaff: false,
    minArgs: 0,
    maxArgs: 0,
  },
  helpai: {
    command: 'helpai',
    description: 'Invoke HelpAI bot for assistance in the current chat',
    usage: '/helpai [question]',
    requiresStaff: false,
    minArgs: 0,
    maxArgs: 100,
  },
  dm: {
    command: 'dm',
    description: 'Send a direct message to another user',
    usage: '/dm <username> <message>',
    requiresStaff: false,
    minArgs: 2,
    maxArgs: 100,
  },
  screenshot: {
    command: 'screenshot',
    description: 'Send a screenshot to support staff',
    usage: '/screenshot [description]',
    requiresStaff: false,
    minArgs: 0,
    maxArgs: 50,
  },
  verifyme: {
    command: 'verifyme',
    description: 'Request verification of your account',
    usage: '/verifyme',
    requiresStaff: false,
    minArgs: 0,
    maxArgs: 0,
  },
  issue: {
    command: 'issue',
    description: 'Report an issue to support staff',
    usage: '/issue <description>',
    requiresStaff: false,
    minArgs: 1,
    maxArgs: 100,
  },
  mention: {
    command: 'mention',
    description: 'Mention a user in the chat',
    usage: '/mention <username> [message]',
    requiresStaff: false,
    minArgs: 1,
    maxArgs: 100,
  },
  trinity: {
    command: 'trinity',
    description: 'Summon Trinity AI for inline assistance (staff only). Trinity is the platform orchestrator who can help with commands, user issues, system status, and more.',
    usage: '/trinity <question or command>',
    requiresStaff: true,
    minArgs: 1,
    maxArgs: 100,
  },
  meetingstart: {
    command: 'meetingstart',
    description: 'Start recording the meeting (MeetingBot)',
    usage: '/meetingstart [title]',
    requiresStaff: false,
    minArgs: 0,
    maxArgs: 20,
  },
  meetingend: {
    command: 'meetingend',
    description: 'End meeting and generate minutes summary (MeetingBot)',
    usage: '/meetingend',
    requiresStaff: false,
    minArgs: 0,
    maxArgs: 0,
  },
  meetingpause: {
    command: 'meetingpause',
    description: 'Pause the meeting recording (MeetingBot)',
    usage: '/meetingpause',
    requiresStaff: false,
    minArgs: 0,
    maxArgs: 0,
  },
  meetingcontinue: {
    command: 'meetingcontinue',
    description: 'Resume the meeting recording (MeetingBot)',
    usage: '/meetingcontinue',
    requiresStaff: false,
    minArgs: 0,
    maxArgs: 0,
  },
  actionitem: {
    command: 'actionitem',
    description: 'Add an action item to meeting minutes (MeetingBot)',
    usage: '/actionitem <description> @user',
    requiresStaff: false,
    minArgs: 1,
    maxArgs: 100,
  },
  decision: {
    command: 'decision',
    description: 'Record a decision made during meeting (MeetingBot)',
    usage: '/decision <what was decided>',
    requiresStaff: false,
    minArgs: 1,
    maxArgs: 100,
  },
  note: {
    command: 'note',
    description: 'Add a note to the meeting record (MeetingBot)',
    usage: '/note <text>',
    requiresStaff: false,
    minArgs: 1,
    maxArgs: 100,
  },
  report: {
    command: 'report',
    description: 'Start an inline incident report (ReportBot)',
    usage: '/report',
    requiresStaff: false,
    minArgs: 0,
    maxArgs: 0,
  },
  incident: {
    command: 'incident',
    description: 'Log an incident by type (ReportBot)',
    usage: '/incident <type>',
    requiresStaff: false,
    minArgs: 1,
    maxArgs: 10,
  },
  endreport: {
    command: 'endreport',
    description: 'Finalize and submit the current report (ReportBot)',
    usage: '/endreport',
    requiresStaff: false,
    minArgs: 0,
    maxArgs: 0,
  },
  analyzereports: {
    command: 'analyzereports',
    description: 'Analyze submitted reports and generate professional summary (ReportBot, supervisor+)',
    usage: '/analyzereports [shift|date|officer]',
    requiresStaff: false,
    minArgs: 0,
    maxArgs: 5,
  },
  clockme: {
    command: 'clockme',
    description: 'Manual clock in or out when GPS is unavailable (ClockBot)',
    usage: '/clockme <in|out> [reason]',
    requiresStaff: false,
    minArgs: 1,
    maxArgs: 10,
  },
  forceclock: {
    command: 'forceclock',
    description: 'Force clock in/out for an employee (ClockBot, supervisor+)',
    usage: '/forceclock @user <in|out> <reason>',
    requiresStaff: false,
    minArgs: 3,
    maxArgs: 20,
  },
  clockstatus: {
    command: 'clockstatus',
    description: 'Check clock-in/out status (ClockBot)',
    usage: '/clockstatus [@user]',
    requiresStaff: false,
    minArgs: 0,
    maxArgs: 1,
  },
  nuke: {
    command: 'nuke',
    description: 'Nuke/reset a bugged or glitched room - archives all messages, removes participants, recreates clean (platform staff only)',
    usage: '/nuke <reason>',
    requiresStaff: true,
    requiresEmergencyPrivileges: true,
    minArgs: 1,
    maxArgs: 50,
  },
  reopen: {
    command: 'reopen',
    description: 'Reopen a closed conversation so end users can chat again',
    usage: '/reopen [reason]',
    requiresStaff: true,
    minArgs: 0,
    maxArgs: 20,
  },
  muteall: {
    command: 'muteall',
    description: 'Mute all non-staff users in a room (IRCX-style)',
    usage: '/muteall [reason]',
    requiresStaff: true,
    minArgs: 0,
    maxArgs: 20,
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

/**
 * Generate condensed help text suitable for system messages
 */
export function getHelpTextCondensed(isStaff: boolean): string {
  const commands = Object.values(COMMAND_REGISTRY)
    .filter(cmd => !cmd.requiresStaff || isStaff);
  
  const lines = ['━━━━ Available Commands ━━━━', ''];
  
  if (isStaff) {
    lines.push('Staff Commands:');
    const staffCmds = commands.filter(c => c.requiresStaff);
    for (const cmd of staffCmds) {
      lines.push(`  /${cmd.command.padEnd(15)} ${cmd.description}`);
    }
    lines.push('');
  }
  
  lines.push('User Commands:');
  const userCmds = commands.filter(c => !c.requiresStaff);
  for (const cmd of userCmds) {
    lines.push(`  /${cmd.command.padEnd(15)} ${cmd.description}`);
  }
  
  lines.push('');
  lines.push('Type /help <command> for detailed usage');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  return lines.join('\n');
}

/**
 * Get help for a specific command
 */
export function getCommandHelp(commandName: string): string | null {
  const cmdKey = commandName.replace(/^\//, '').toLowerCase();
  const cmd = COMMAND_REGISTRY[cmdKey as SlashCommand];
  
  if (!cmd) {
    return null;
  }
  
  return [
    `━━━━ Command Help ━━━━`,
    `Command: /${cmd.command}`,
    `Usage: ${cmd.usage}`,
    `Description: ${cmd.description}`,
    `Requires Staff: ${cmd.requiresStaff ? 'Yes' : 'No'}`,
    cmd.requiresEmergencyPrivileges ? 'Requires: Emergency Privileges' : '',
    `━━━━━━━━━━━━━━━━━━━━━━`,
  ].filter(Boolean).join('\n');
}
