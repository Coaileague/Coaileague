import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import { storage } from './storage';
import { formatUserDisplayName } from './utils/formatUserDisplayName';
import { generateGreeting, generateStaffIntroduction, getAiResponse, shouldBotRespond, generateQueueWelcome, generateStaffQueueAlert } from './services/aiBot';
import { parseSlashCommand, validateCommand, getHelpText, COMMAND_REGISTRY } from '@shared/commands';
import { queueManager } from './services/helpOsQueue';
import type { ChatMessage } from '@shared/schema';

interface WebSocketClient extends WebSocket {
  userId?: string;
  userName?: string;
  workspaceId?: string;
  conversationId?: string;
  userStatus?: 'online' | 'away' | 'busy';
  userType?: 'staff' | 'subscriber' | 'org_user' | 'guest';
  isAlive?: boolean;
  pingInterval?: NodeJS.Timeout;
  ipAddress?: string;
  userAgent?: string;
}

interface ChatMessagePayload {
  type: 'chat_message';
  conversationId: string;
  message: string;
  senderName: string;
  senderType: 'customer' | 'support' | 'system';
}

interface JoinConversationPayload {
  type: 'join_conversation';
  conversationId: string;
  userId: string; // Will be validated server-side
}

interface TypingPayload {
  type: 'typing';
  userId: string;
  userName: string;
  isStaff: boolean;
  isTyping: boolean;
}

interface StatusChangePayload {
  type: 'status_change';
  userId: string;
  status: 'online' | 'away' | 'busy';
}

interface KickUserPayload {
  type: 'kick_user';
  conversationId?: string;
  targetUserId: string;
  reason?: string;
  commandId?: string; // IRC-style command tracking for acknowledgments
}

interface RequestSecurePayload {
  type: 'request_secure';
  targetUserId: string;
  requestType: string;
  message?: string;
}

interface SecureResponsePayload {
  type: 'secure_response';
  data: any;
}

interface ReleaseSpectatorPayload {
  type: 'release_spectator';
  targetUserId: string;
}

interface TransferUserPayload {
  type: 'transfer_user';
  targetUserId: string;
  commandId?: string; // IRC-style command tracking
}

interface SilenceUserPayload {
  type: 'silence_user';
  targetUserId: string;
  duration?: number;
  reason?: string;
  commandId?: string; // IRC-style command tracking
}

interface GiveVoicePayload {
  type: 'give_voice';
  targetUserId: string;
  commandId?: string; // IRC-style command tracking
}

type WebSocketMessage = ChatMessagePayload | JoinConversationPayload | TypingPayload | StatusChangePayload | KickUserPayload | RequestSecurePayload | SecureResponsePayload | ReleaseSpectatorPayload | TransferUserPayload | SilenceUserPayload | GiveVoicePayload;

// In-memory MOTD storage (staff can update)
let currentMOTD = "Welcome to WorkforceOS HelpDesk Support Network - Your satisfaction is our priority - 24/7/365";

// GLOBAL CONNECTION TRACKING for Platform Stats
const globalConnections = {
  allUsers: new Map<string, WebSocketClient>(), // userId -> WebSocket
  staffUsers: new Set<string>(), // staff user IDs
  subscriberUsers: new Set<string>(), // subscriber user IDs
  totalConnections: 0
};

// Export function to get live connection stats
export function getLiveConnectionStats() {
  return {
    totalConnections: globalConnections.totalConnections,
    chatUsers: globalConnections.subscriberUsers.size,
    chatStaff: globalConnections.staffUsers.size,
    allActiveUsers: globalConnections.allUsers.size
  };
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws/chat',
    clientTracking: true,
    maxPayload: 10 * 1024 * 1024, // 10MB max payload
  });

  // Track active connections by conversation ID
  const conversationClients = new Map<string, Set<WebSocketClient>>();
  
  // Track removed simulated users (so they don't re-appear on reconnect)
  const removedSimulatedUsers = new Set<string>();

  wss.on('connection', (ws: WebSocketClient, request: IncomingMessage) => {
    // Extract IP address and user agent from request
    const ipAddress = (request.headers['x-forwarded-for'] as string)?.split(',')[0].trim() 
      || request.socket.remoteAddress 
      || 'unknown';
    const userAgent = request.headers['user-agent'] || 'unknown';
    
    // Store for audit trail
    ws.ipAddress = ipAddress;
    ws.userAgent = userAgent;
    
    console.log(`New WebSocket connection from ${ipAddress}`);
    
    // Initialize heartbeat
    ws.isAlive = true;
    
    // Handle pong responses (heartbeat)
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    
    // Start heartbeat interval (30 seconds)
    ws.pingInterval = setInterval(() => {
      if (ws.isAlive === false) {
        console.log('WebSocket connection terminated due to no heartbeat');
        clearInterval(ws.pingInterval);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    }, 30000);

    ws.on('message', async (data: string) => {
      try {
        const payload: WebSocketMessage = JSON.parse(data.toString());

        switch (payload.type) {
          case 'join_conversation': {
            // SECURITY: Verify conversation exists before allowing join
            const conversation = await storage.getChatConversation(payload.conversationId);
            if (!conversation) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Conversation not found',
              }));
              return;
            }

            // Get user display info for formatted name
            const userInfo = await storage.getUserDisplayInfo(payload.userId);
            const displayName = userInfo ? formatUserDisplayName({
              firstName: userInfo.firstName,
              lastName: userInfo.lastName,
              email: userInfo.email || undefined,
              platformRole: userInfo.platformRole || undefined,
              workspaceRole: userInfo.workspaceRole || undefined,
            }) : 'User';

            // HELPDESK ACCESS CONTROL: For the main HelpDesk room (public IRC-style chatroom)
            const MAIN_ROOM_ID = 'main-chatroom-workforceos';
            let userRoleInfo = '';
            if (payload.conversationId === MAIN_ROOM_ID) {
              // This is the main HelpDesk public chatroom - all authenticated users allowed
              try {
                const platformRole = await storage.getUserPlatformRole(payload.userId);
                const isStaff = platformRole && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole);
                
                if (isStaff) {
                  userRoleInfo = `platform staff - ${platformRole}`;
                } else {
                  userRoleInfo = 'guest/customer';
                }
              } catch (staffCheckError) {
                // Error checking staff status - allow access anyway (degraded mode)
                console.error('Failed to verify staff status:', staffCheckError);
                userRoleInfo = 'degraded mode';
              }
            }

            // Determine user type and set initial status
            const platformRole = await storage.getUserPlatformRole(payload.userId).catch(() => null);
            const isStaff = platformRole && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole);
            
            let userType: 'staff' | 'subscriber' | 'org_user' | 'guest' = 'guest';
            if (isStaff) {
              userType = 'staff';
            } else if (conversation.workspaceId) {
              // Users in a workspace are organization users
              userType = 'org_user';
            }

            // Associate this client with the conversation
            ws.userId = payload.userId;
            ws.userName = displayName;
            ws.workspaceId = conversation.workspaceId;
            ws.conversationId = payload.conversationId;
            ws.userStatus = 'online'; // Default status
            ws.userType = userType;

            // Check if user already has an active connection in this room
            const existingClients = conversationClients.get(payload.conversationId);
            const userAlreadyInRoom = existingClients ? Array.from(existingClients).some(
              client => client.userId === payload.userId && client.readyState === WebSocket.OPEN
            ) : false;

            if (!conversationClients.has(payload.conversationId)) {
              conversationClients.set(payload.conversationId, new Set());
            }
            conversationClients.get(payload.conversationId)!.add(ws);

            // GLOBAL TRACKING: Add to platform-wide stats
            globalConnections.totalConnections++;
            globalConnections.allUsers.set(payload.userId, ws);
            if (userType === 'staff') {
              globalConnections.staffUsers.add(payload.userId);
            } else if (userType === 'org_user' || userType === 'guest') {
              // Track non-staff users as subscribers
              globalConnections.subscriberUsers.add(payload.userId);
            }

            // Send conversation history
            const messages = await storage.getChatMessagesByConversation(payload.conversationId);
            ws.send(JSON.stringify({
              type: 'conversation_history',
              messages,
            }));

            // Mark messages as read
            await storage.markMessagesAsRead(payload.conversationId, payload.userId);

            // Broadcast updated user list to all clients in this conversation
            const broadcastUserList = async () => {
              const clients = conversationClients.get(payload.conversationId);
              if (clients) {
                const onlineUsers = [];

                // Add simulation/test users (for testing features)
                if (payload.conversationId === MAIN_ROOM_ID) {
                  // HelpOS AI Bot - Always first in list (check if removed)
                  if (!removedSimulatedUsers.has('helpos-ai-bot')) {
                    onlineUsers.push({
                      id: 'helpos-ai-bot',
                      name: 'HelpOS',
                      role: 'bot',
                      status: 'online',
                      userType: 'staff'
                    });
                  }
                  
                  // Support Staff Team (check if removed)
                  if (!removedSimulatedUsers.has('sim-staff-1')) {
                    onlineUsers.push({
                      id: 'sim-staff-1',
                      name: 'Sarah Martinez',
                      role: 'deputy_admin',
                      status: 'online',
                      userType: 'staff'
                    });
                  }
                  if (!removedSimulatedUsers.has('sim-staff-2')) {
                    onlineUsers.push({
                      id: 'sim-staff-2',
                      name: 'Mike Chen',
                      role: 'sysop',
                      status: 'online',
                      userType: 'staff'
                    });
                  }
                  if (!removedSimulatedUsers.has('sim-staff-3')) {
                    onlineUsers.push({
                      id: 'sim-staff-3',
                      name: 'Emily Taylor',
                      role: 'deputy_assistant',
                      status: 'online',
                      userType: 'staff'
                    });
                  }
                  if (!removedSimulatedUsers.has('sim-staff-4')) {
                    onlineUsers.push({
                      id: 'sim-staff-4',
                      name: 'David Kim',
                      role: 'sysop',
                      status: 'busy',
                      userType: 'staff'
                    });
                  }
                  
                  // 10 Users with Different Issues (check if removed)
                  
                  // User 1 - Password Reset Issue
                  if (!removedSimulatedUsers.has('sim-user-1')) {
                    onlineUsers.push({
                      id: 'sim-user-1',
                      name: 'Jennifer Lopez',
                      role: 'guest',
                      status: 'online',
                      userType: 'org_user'
                    });
                  }
                  
                  // User 2 - Billing Question
                  if (!removedSimulatedUsers.has('sim-user-2')) {
                    onlineUsers.push({
                      id: 'sim-user-2',
                      name: 'Robert Johnson',
                      role: 'guest',
                      status: 'online',
                      userType: 'subscriber'
                    });
                  }
                  
                  // User 3 - Account Locked
                  if (!removedSimulatedUsers.has('sim-user-3')) {
                    onlineUsers.push({
                      id: 'sim-user-3',
                      name: 'Maria Garcia',
                      role: 'guest',
                      status: 'online',
                      userType: 'org_user'
                    });
                  }
                  
                  // User 4 - Schedule/Shift Help
                  if (!removedSimulatedUsers.has('sim-user-4')) {
                    onlineUsers.push({
                      id: 'sim-user-4',
                      name: 'James Wilson',
                      role: 'guest',
                      status: 'online',
                      userType: 'org_user'
                    });
                  }
                  
                  // User 5 - Payroll Question
                  if (!removedSimulatedUsers.has('sim-user-5')) {
                    onlineUsers.push({
                      id: 'sim-user-5',
                      name: 'Lisa Anderson',
                      role: 'guest',
                      status: 'away',
                      userType: 'subscriber'
                    });
                  }
                  
                  // User 6 - Feature Request
                  if (!removedSimulatedUsers.has('sim-user-6')) {
                    onlineUsers.push({
                      id: 'sim-user-6',
                      name: 'Michael Brown',
                      role: 'guest',
                      status: 'online',
                      userType: 'subscriber'
                    });
                  }
                  
                  // User 7 - Bug Report
                  if (!removedSimulatedUsers.has('sim-user-7')) {
                    onlineUsers.push({
                      id: 'sim-user-7',
                      name: 'Patricia Davis',
                      role: 'guest',
                      status: 'online',
                      userType: 'org_user'
                    });
                  }
                  
                  // User 8 - Invoice Issue
                  if (!removedSimulatedUsers.has('sim-user-8')) {
                    onlineUsers.push({
                      id: 'sim-user-8',
                      name: 'Christopher Lee',
                      role: 'guest',
                      status: 'online',
                      userType: 'subscriber'
                    });
                  }
                  
                  // User 9 - Onboarding Help
                  if (!removedSimulatedUsers.has('sim-user-9')) {
                    onlineUsers.push({
                      id: 'sim-user-9',
                      name: 'Amanda White',
                      role: 'guest',
                      status: 'online',
                      userType: 'guest'
                    });
                  }
                  
                  // User 10 - Time Tracking Question
                  if (!removedSimulatedUsers.has('sim-user-10')) {
                    onlineUsers.push({
                      id: 'sim-user-10',
                      name: 'Daniel Martinez',
                      role: 'guest',
                      status: 'online',
                      userType: 'org_user'
                    });
                  }
                }

                // Add real users
                const clientArray = Array.from(clients);
                for (const client of clientArray) {
                  if (client.userId && client.readyState === WebSocket.OPEN) {
                    const userRole = await storage.getUserPlatformRole(client.userId);
                    const isStaff = userRole && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(userRole);
                    
                    onlineUsers.push({
                      id: client.userId,
                      name: client.userName || 'User',
                      role: userRole || 'guest',
                      status: client.userStatus || 'online',
                      userType: client.userType || 'guest'
                    });
                  }
                }
                
                // Users are already filtered above - no need for additional filter
                const filteredUsers = onlineUsers;

                const userListPayload = JSON.stringify({
                  type: 'user_list_update',
                  users: filteredUsers,
                  count: filteredUsers.length
                });

                clients.forEach((client) => {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(userListPayload);
                  }
                });
              }
            };

            await broadcastUserList();

            // HELPDESK ANNOUNCEMENTS: System + HelpOS™ (only if user is joining for the first time)
            if (payload.conversationId === MAIN_ROOM_ID && !userAlreadyInRoom) {
              try {
                const platformRole = await storage.getUserPlatformRole(payload.userId);
                const isStaff = platformRole && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole);
                
                // Format role display for join message
                const getRoleDisplayText = (role: string) => {
                  switch(role) {
                    case 'root': return '(Admin)';
                    case 'deputy_admin': return '(Deputy)';
                    case 'deputy_assistant': return '(Assistant)';
                    case 'sysop': return '(Sysop)';
                    default: return '';
                  }
                };
                
                const roleText = isStaff ? ` ${getRoleDisplayText(platformRole)}` : '';
                
                // 1. SYSTEM announcement (IRC-style): User joined with role badge for staff
                const systemJoinMessage = await storage.createChatMessage({
                  conversationId: payload.conversationId,
                  senderId: null,
                  senderName: 'Server',
                  senderType: 'system',
                  message: `${displayName}${roleText} has joined the HelpDesk`,
                  messageType: 'text',
                  isSystemMessage: true,
                });

                // Broadcast system message
                const clients = conversationClients.get(payload.conversationId);
                if (clients) {
                  const systemPayload = JSON.stringify({
                    type: 'new_message',
                    message: systemJoinMessage,
                  });
                  clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                      client.send(systemPayload);
                    }
                  });
                }

                // 2. HELPOS™ announcement (AI Bot): Only for customers (not staff)
                if (!isStaff) {
                  // Customer: Add to queue and send welcome with position
                  // Generate ticket number if needed
                  const ticketNumber = `TKT-${Date.now().toString().slice(-6)}`;
                  
                  const queueEntry = await queueManager.enqueue({
                    conversationId: payload.conversationId,
                    userId: payload.userId,
                    ticketNumber,
                    userName: displayName,
                    workspaceId: ws.workspaceId,
                  });

                  await queueManager.updateQueuePositions();
                  const updatedEntry = await queueManager.getQueueEntry(payload.conversationId);
                  
                  if (updatedEntry) {
                    const queueStatus = await queueManager.getQueueStatus();
                    const welcomeMessage = await generateQueueWelcome(
                      displayName,
                      queueEntry.ticketNumber,
                      updatedEntry.queuePosition || 1,
                      updatedEntry.estimatedWaitMinutes || 5,
                      queueStatus.waitingCount
                    );
                    
                    // EPHEMERAL welcome message - NOT saved to database to prevent doubles
                    // Create message object for WebSocket only
                    const botMessage = {
                      id: `temp-${Date.now()}`,
                      conversationId: payload.conversationId,
                      senderId: 'ai-bot',
                      senderName: 'HelpOS™',
                      senderType: 'bot',
                      message: welcomeMessage,
                      messageType: 'text',
                      createdAt: new Date(),
                      isPrivateMessage: true,
                      recipientId: payload.userId,
                      isSystemMessage: false,
                      attachmentUrl: null,
                      attachmentName: null,
                      isRead: false,
                      readAt: null,
                    };

                    await queueManager.markWelcomeSent(queueEntry.id);

                    // Send PRIVATE HelpOS welcome DM (only to this user, ephemeral)
                    const privateWelcome = JSON.stringify({
                      type: 'private_message',
                      message: botMessage,
                      from: 'HelpOS™',
                    });
                    if (ws.readyState === WebSocket.OPEN) {
                      ws.send(privateWelcome);
                    }
                  }
                }
              } catch (announceError) {
                console.error('Failed to send join announcements:', announceError);
                
                // FALLBACK: Send basic welcome if queue system fails
                try {
                  const clients = conversationClients.get(payload.conversationId);
                  const fallbackMessage = await storage.createChatMessage({
                    conversationId: payload.conversationId,
                    senderId: null,
                    senderName: 'System',
                    senderType: 'system',
                    message: `Welcome to HelpDesk! Support staff will assist you shortly.`,
                    messageType: 'text',
                    isSystemMessage: true,
                  });

                  if (clients) {
                    const fallbackPayload = JSON.stringify({
                      type: 'new_message',
                      message: fallbackMessage,
                    });
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(fallbackPayload);
                      }
                    });
                  }
                } catch (fallbackError) {
                  console.error('Fallback welcome also failed:', fallbackError);
                }
              }
            }

            // HelpOS greets everyone who joins (only send to the joining user, not the entire room, and only if first time joining)
            if (payload.conversationId === MAIN_ROOM_ID && !userAlreadyInRoom) {
              try {
                // Format role display for welcome message
                const getRoleDisplayText = (role: string) => {
                  switch(role) {
                    case 'root': return ' (Admin)';
                    case 'deputy_admin': return ' (Deputy)';
                    case 'deputy_assistant': return ' (Assistant)';
                    case 'sysop': return ' (Sysop)';
                    default: return '';
                  }
                };
                
                const roleText = isStaff ? getRoleDisplayText(platformRole) : '';
                
                // Determine greeting based on user type
                let greeting = '';
                if (isStaff) {
                  greeting = `Welcome back, ${displayName}${roleText}! Support chat is active. Right-click users for quick actions.`;
                } else {
                  greeting = `Welcome! Please wait to be helped. You cannot send messages right now - wait, gather your thoughts, evidence, and problem details. We will be with you shortly.`;
                }

                // Send welcome message ONLY to the joining user (not saved to DB)
                const welcomePayload = JSON.stringify({
                  type: 'private_message',
                  message: {
                    id: `welcome-${Date.now()}`,
                    createdAt: new Date(),
                    conversationId: payload.conversationId,
                    senderId: 'helpos-ai-bot',
                    senderName: 'HelpOS™',
                    senderType: 'bot',
                    message: greeting,
                    messageType: 'text',
                    isSystemMessage: false,
                  },
                });
                
                // Send ONLY to the user who just joined
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(welcomePayload);
                }
              } catch (greetError) {
                console.error('HelpOS greeting failed:', greetError);
              }
            }

            // Single consolidated log message (only for NEW joins, not reconnections)
            if (!userAlreadyInRoom) {
              if (payload.conversationId === MAIN_ROOM_ID) {
                console.log(`✅ ${displayName} joined HelpDesk (${userRoleInfo})`);
              } else {
                console.log(`${displayName} joined conversation ${payload.conversationId}`);
              }
            }
            break;
          }

          case 'chat_message': {
            if (!ws.conversationId || !ws.userId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Must join a conversation first',
              }));
              return;
            }

            // SECURITY: Enforce that message goes to the joined conversation only
            if (payload.conversationId !== ws.conversationId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Cannot send message to different conversation',
              }));
              return;
            }

            // Get user display info for formatted name (server-side formatting for security)
            const userInfo = await storage.getUserDisplayInfo(ws.userId);
            const displayName = userInfo ? formatUserDisplayName({
              firstName: userInfo.firstName,
              lastName: userInfo.lastName,
              email: userInfo.email || undefined,
              platformRole: userInfo.platformRole || undefined,
              workspaceRole: userInfo.workspaceRole || undefined,
            }) : payload.senderName || 'User';

            // SLASH COMMAND HANDLER: Check if message is a command
            const parsedCommand = parseSlashCommand(payload.message);
            if (parsedCommand) {
              // Validate command
              const validation = validateCommand(parsedCommand);
              if (!validation.valid) {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: validation.error,
                }));
                return;
              }

              // Check if user has permission for staff commands
              const commandDef = COMMAND_REGISTRY[parsedCommand.command];
              if (commandDef.requiresStaff) {
                const platformRole = await storage.getUserPlatformRole(ws.userId);
                const isStaff = platformRole && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole);
                if (!isStaff) {
                  ws.send(JSON.stringify({
                    type: 'error',
                    message: 'You do not have permission to use this command.',
                  }));
                  return;
                }
              }

              // Execute command
              const clients = conversationClients.get(ws.conversationId);
              
              // Get staff member info for command execution
              const staffInfo = await storage.getUserDisplayInfo(ws.userId);
              const staffDisplayName = staffInfo ? formatUserDisplayName({
                firstName: staffInfo.firstName,
                lastName: staffInfo.lastName,
                email: staffInfo.email || undefined,
                platformRole: staffInfo.platformRole || undefined,
                workspaceRole: staffInfo.workspaceRole || undefined,
              }) : ws.userName || 'Support Staff';
              
              const staffRole = staffInfo?.platformRole || 'support';
              const staffRoleName = staffRole === 'root' ? 'Senior Support Administrator' :
                                  staffRole === 'deputy_admin' ? 'Support Manager' :
                                  staffRole === 'deputy_assistant' ? 'Senior Support Agent' :
                                  staffRole === 'sysop' ? 'Support Agent' : 'Support Team Member';
              
              switch (parsedCommand.command) {
                case 'intro': {
                  // AI bot introduces staff to customer with role and identity
                  const introMessage = `📢 ${staffDisplayName} (${staffRoleName}) is now ready to assist you!\n\nℹ️ To help you better, please share:\n• Your full name\n• Organization/Company name\n• Brief description of how we can help\n\n💬 Our support team is here to help with any questions about WorkforceOS!`;
                  
                  const botMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: 'ai-bot',
                    senderName: 'HelpOS™',
                    senderType: 'bot',
                    message: introMessage,
                    messageType: 'text',
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: botMsg }));
                      }
                    });
                  }
                  break;
                }
                
                case 'auth': {
                  // Request user authentication
                  const username = parsedCommand.args[0];
                  if (!username) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: 'Usage: /auth <username>',
                    }));
                    break;
                  }
                  
                  const authMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: 'ai-bot',
                    senderName: 'HelpOS™',
                    senderType: 'bot',
                    message: `🔐 Authentication Request\n\nPlease authenticate user: ${username}\n\nThe user will receive instructions to verify their identity. This may include:\n• Confirming email address\n• Answering security questions\n• Providing account details\n\nWaiting for user verification...`,
                    messageType: 'text',
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: authMsg }));
                      }
                    });
                  }
                  break;
                }
                
                case 'verify': {
                  // TODO: Implement user verification when storage methods are available
                  const verifyMsg = `⚠️ Command Not Yet Implemented\n\nThe /verify command is currently under development. Please use alternative verification methods or contact a system administrator.`;
                  
                  const botMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: 'ai-bot',
                    senderName: 'HelpOS™',
                    senderType: 'bot',
                    message: verifyMsg,
                    messageType: 'text',
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: botMsg }));
                      }
                    });
                  }
                  break;
                }
                
                case 'resetpass': {
                  // TODO: Implement password reset when storage methods are available
                  const resetMsg = `⚠️ Command Not Yet Implemented\n\nThe /resetpass command is currently under development. Please use the standard password reset flow on the login page.`;
                  
                  const botMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: 'ai-bot',
                    senderName: 'HelpOS™',
                    senderType: 'bot',
                    message: resetMsg,
                    messageType: 'text',
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: botMsg }));
                      }
                    });
                  }
                  break;
                }
                
                case 'close': {
                  // Close current ticket/session
                  const reason = parsedCommand.args.join(' ') || 'Session closed by staff';
                  
                  // System announcement: Ticket closed
                  const systemMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: null,
                    senderName: 'Server',
                    senderType: 'system',
                    message: `${displayName} closed ticket. Reason: ${reason}`,
                    messageType: 'text',
                    isSystemMessage: true,
                  });
                  
                  // Remove from queue if present
                  await queueManager.dequeue(ws.conversationId, 'resolved');
                  
                  // Close conversation
                  await storage.closeChatConversation(ws.conversationId);
                  
                  // Broadcast closure
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ 
                          type: 'new_message', 
                          message: systemMsg 
                        }));
                        // Trigger feedback request on client side
                        client.send(JSON.stringify({
                          type: 'request_feedback',
                          conversationId: ws.conversationId,
                        }));
                      }
                    });
                  }
                  break;
                }
                
                case 'status': {
                  // Customer checks their ticket status
                  const conversation = await storage.getChatConversation(ws.conversationId);
                  const queueEntry = await queueManager.getPosition(ws.conversationId);
                  
                  let statusMsg = `📊 Ticket Status\n\n`;
                  statusMsg += `Status: ${conversation?.status || 'Unknown'}\n`;
                  statusMsg += `Ticket ID: ${ws.conversationId}\n`;
                  
                  if (queueEntry) {
                    statusMsg += `\nQueue Information:\n`;
                    statusMsg += `• Position: #${queueEntry.position}\n`;
                    statusMsg += `• Priority Score: ${queueEntry.priorityScore}\n`;
                    statusMsg += `• Wait Time: ${Math.floor(queueEntry.waitTimeMinutes)} minutes\n`;
                  }
                  
                  const botMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: 'ai-bot',
                    senderName: 'HelpOS™',
                    senderType: 'bot',
                    message: statusMsg,
                    messageType: 'text',
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: botMsg }));
                      }
                    });
                  }
                  break;
                }
                
                case 'queue': {
                  // Customer checks queue position
                  const queueEntry = await queueManager.getPosition(ws.conversationId);
                  
                  let queueMsg: string;
                  if (queueEntry) {
                    queueMsg = `⏳ Queue Position\n\nYou are currently #${queueEntry.position} in line.\n\nEstimated wait: ${Math.ceil(queueEntry.waitTimeMinutes)} minutes\nPriority score: ${queueEntry.priorityScore} points\n\nWe'll notify you when a support agent is available!`;
                  } else {
                    queueMsg = `✅ Not in Queue\n\nYou are not currently in the support queue. You may already be connected with a support agent, or your ticket has been resolved.`;
                  }
                  
                  const botMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: 'ai-bot',
                    senderName: 'HelpOS™',
                    senderType: 'bot',
                    message: queueMsg,
                    messageType: 'text',
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: botMsg }));
                      }
                    });
                  }
                  break;
                }
                
                case 'kick': {
                  // Staff kicks a user from chat (with hierarchy protection)
                  const { checkStaffActionAuthorization } = await import('./services/staffHierarchy');
                  
                  const targetUsername = parsedCommand.args[0];
                  const reason = parsedCommand.args.slice(1).join(' ') || 'No reason provided';
                  
                  if (!targetUsername) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: 'Usage: /kick <username> [reason]',
                    }));
                    break;
                  }
                  
                  // Find target user role
                  const targetRole = await storage.getUserPlatformRole(targetUsername);
                  const actorRole = await storage.getUserPlatformRole(ws.userId);
                  
                  // Check hierarchy authorization
                  const authCheck = checkStaffActionAuthorization(actorRole, targetRole, 'kick');
                  if (!authCheck.authorized) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: authCheck.reason || 'You cannot kick this user.',
                    }));
                    break;
                  }
                  
                  // Check if target user is actually connected
                  let userFound = false;
                  let wasConnected = false;
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.userId === targetUsername && client.readyState === WebSocket.OPEN) {
                        userFound = true;
                        wasConnected = true;
                        // Send kick event to target user
                        client.send(JSON.stringify({
                          type: 'kicked',
                          reason: reason,
                        }));
                        client.close(1000, `Kicked: ${reason}`);
                      }
                    });
                  }
                  
                  // System announcement with appropriate feedback
                  const kickMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: null,
                    senderName: 'Server',
                    senderType: 'system',
                    message: wasConnected 
                      ? `✅ ${staffDisplayName} (${staffRoleName}) removed ${targetUsername} from chat. Reason: ${reason}`
                      : `⚠️ Command executed: ${staffDisplayName} (${staffRoleName}) attempted to kick ${targetUsername} (user not currently connected or is simulated/test user). Reason: ${reason}`,
                    messageType: 'text',
                    isSystemMessage: true,
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: kickMsg }));
                      }
                    });
                  }
                  break;
                }
                
                case 'mute': {
                  // Staff mutes a user temporarily
                  const targetUsername = parsedCommand.args[0];
                  const duration = parsedCommand.args[1] || '5'; // minutes
                  
                  if (!targetUsername) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: 'Usage: /mute <username> [duration_in_minutes]',
                    }));
                    break;
                  }
                  
                  // Check if target user is actually connected
                  let userConnected = false;
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.userId === targetUsername && client.readyState === WebSocket.OPEN) {
                        userConnected = true;
                        // Send mute notification to target user
                        client.send(JSON.stringify({
                          type: 'muted',
                          duration: duration,
                        }));
                        // Send voice_removed event for animated status bar
                        client.send(JSON.stringify({
                          type: 'voice_removed',
                        }));
                      }
                    });
                  }
                  
                  const muteMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: 'ai-bot',
                    senderName: 'HelpOS™',
                    senderType: 'bot',
                    message: userConnected
                      ? `🔇 User Muted\n\n${targetUsername} has been muted for ${duration} minutes.\n\nThey can still read messages but cannot send messages during this time.`
                      : `⚠️ Mute Command Executed\n\nAttempted to mute ${targetUsername} for ${duration} minutes.\n\n⚠️ *Note: User not currently connected or is a simulated/test user. Command worked but had no active target.*`,
                    messageType: 'text',
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: muteMsg }));
                      }
                    });
                  }
                  break;
                }
                
                case 'whisper': {
                  // Send private message to specific user (staff only)
                  const targetUserId = parsedCommand.args[0];
                  const privateMessage = parsedCommand.args.slice(1).join(' ');
                  
                  if (!targetUserId || !privateMessage) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: 'Usage: /whisper <userId> <message>',
                    }));
                    break;
                  }
                  
                  // Find target user by userId
                  let targetClient: any = null;
                  let targetUserName: string = targetUserId;
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.userId === targetUserId && client.readyState === WebSocket.OPEN) {
                        targetClient = client;
                        targetUserName = client.userName || targetUserId;
                      }
                    });
                  }
                  
                  if (!targetClient) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: `User "${targetUserId}" not found or not currently online. Use /users to see online users and their IDs.`,
                    }));
                    break;
                  }
                  
                  // Create private message (saved to database with isPrivateMessage = true)
                  const whisperMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: ws.userId!,
                    senderName: displayName,
                    senderType: 'user',
                    message: privateMessage,
                    messageType: 'text',
                    isPrivateMessage: true,
                    recipientId: targetUserId,
                  });
                  
                  // Send to target user only
                  if (targetClient.readyState === WebSocket.OPEN) {
                    targetClient.send(JSON.stringify({
                      type: 'new_message',
                      message: whisperMsg,
                    }));
                  }
                  
                  // Send confirmation back to sender (so they see what they sent)
                  ws.send(JSON.stringify({
                    type: 'new_message',
                    message: whisperMsg,
                  }));
                  
                  console.log(`✅ Whisper delivered: ${displayName} → ${targetUserName}: "${privateMessage.substring(0, 50)}..."`);
                  break;
                }
                
                case 'transfer': {
                  // Transfer ticket to another staff member
                  const targetStaff = parsedCommand.args[0];
                  
                  if (!targetStaff) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: 'Usage: /transfer <staff_username>',
                    }));
                    break;
                  }
                  
                  // Check if target staff is actually connected
                  let staffConnected = false;
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.userId === targetStaff && client.readyState === WebSocket.OPEN) {
                        staffConnected = true;
                        // Notify target staff of transfer
                        client.send(JSON.stringify({
                          type: 'transfer_assigned',
                          from: displayName,
                        }));
                      }
                    });
                  }
                  
                  const transferMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: null,
                    senderName: 'Server',
                    senderType: 'system',
                    message: staffConnected
                      ? `✅ ${staffDisplayName} (${staffRoleName}) transferred ticket to ${targetStaff}`
                      : `⚠️ ${staffDisplayName} (${staffRoleName}) attempted transfer to ${targetStaff} (staff member not currently online or is simulated/test user)`,
                    messageType: 'text',
                    isSystemMessage: true,
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: transferMsg }));
                      }
                    });
                  }
                  break;
                }
                
                case 'help': {
                  const platformRole = await storage.getUserPlatformRole(ws.userId);
                  const isStaff = !!(platformRole && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole));
                  const helpText = getHelpText(isStaff);
                  
                  ws.send(JSON.stringify({
                    type: 'system_message',
                    message: helpText,
                  }));
                  break;
                }
                
                case 'motd': {
                  // Update Message of the Day
                  const newMOTD = parsedCommand.args.join(' ');
                  currentMOTD = newMOTD;
                  
                  // Broadcast IRC-style MOTD update to all users in conversation
                  const motdUpdateMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: null,
                    senderName: 'irc.wfos.com',
                    senderType: 'system',
                    message: `MOTD updated by ${displayName}: ${newMOTD}`,
                    messageType: 'text',
                    isSystemMessage: true,
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ 
                          type: 'motd_update',
                          motd: newMOTD,
                          message: motdUpdateMsg 
                        }));
                      }
                    });
                  }
                  break;
                }
                
                case 'banner': {
                  // Update announcement banner message
                  const bannerMessage = parsedCommand.args.join(' ');
                  
                  // Broadcast banner update to all users in conversation
                  const bannerUpdateMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: null,
                    senderName: 'System',
                    senderType: 'system',
                    message: `📢 Banner updated by ${displayName}`,
                    messageType: 'text',
                    isSystemMessage: true,
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ 
                          type: 'banner_update',
                          bannerMessage,
                          staffName: displayName,
                          message: bannerUpdateMsg 
                        }));
                      }
                    });
                  }
                  break;
                }
                
                case 'ask': {
                  // AI Knowledge Retrieval - Ask questions about policies, procedures, FAQs
                  const query = parsedCommand.args.join(' ');
                  
                  if (!query || query.trim().length === 0) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: 'Usage: /ask <your question>\n\nExample: /ask What is the vacation policy?',
                    }));
                    break;
                  }
                  
                  // Send "thinking" indicator
                  const thinkingMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: 'ai-bot',
                    senderName: 'KnowledgeOS™',
                    senderType: 'bot',
                    message: `🔍 Searching knowledge base for: "${query}"...`,
                    messageType: 'text',
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: thinkingMsg }));
                      }
                    });
                  }
                  
                  try {
                    // Import required modules
                    const { db } = await import('./db');
                    const { knowledgeArticles, knowledgeQueries } = await import('@shared/schema');
                    const { eq, or } = await import('drizzle-orm');
                    
                    // Get workspace ID
                    const workspaceId = ws.workspaceId || null;
                    const startTime = Date.now();
                    
                    // Search relevant knowledge articles (public articles available to all)
                    const relevantArticles = await db
                      .select()
                      .from(knowledgeArticles)
                      .where(eq(knowledgeArticles.isPublic, true))
                      .limit(5);
                    
                    // Build context from articles
                    const context = relevantArticles
                      .map((article: any, idx: number) => `[Article ${idx + 1}: ${article.title}]\n${article.content}`)
                      .join('\n\n');
                    
                    let aiResponse = '';
                    
                    // Try AI if available
                    if (process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
                      try {
                        const { default: OpenAI } = await import('openai');
                        const openai = new OpenAI({ 
                          apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
                          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
                        });
                        
                        const completion = await openai.chat.completions.create({
                          model: 'gpt-4',
                          messages: [
                            {
                              role: 'system',
                              content: `You are a helpful HR assistant for WorkforceOS. Answer employee questions about company policies, procedures, and benefits using the provided knowledge base. Be concise, friendly, and accurate. If you don't know the answer, say so and suggest contacting HR.`
                            },
                            {
                              role: 'user',
                              content: `Context from knowledge base:\n${context}\n\nEmployee question: ${query}`
                            }
                          ],
                          temperature: 0.3,
                          max_tokens: 500,
                        });
                        
                        aiResponse = completion.choices[0]?.message?.content || '';
                      } catch (aiError) {
                        console.error('AI generation error:', aiError);
                      }
                    }
                    
                    // Fallback if AI unavailable
                    if (!aiResponse) {
                      aiResponse = relevantArticles.length > 0
                        ? `I found ${relevantArticles.length} related articles:\n\n${relevantArticles.map((a: any) => `• ${a.title}\n  ${a.summary || a.content.substring(0, 200)}...`).join('\n\n')}`
                        : "I couldn't find any relevant information in the knowledge base. Please contact HR or your manager for assistance.";
                    }
                    
                    // Log the query
                    await db.insert(knowledgeQueries).values({
                      workspaceId,
                      userId: ws.userId,
                      query,
                      response: aiResponse,
                      responseTime: Date.now() - startTime,
                      articlesRetrieved: relevantArticles.map((a: any) => a.id),
                    });
                    
                    // Format response with article references
                    let formattedResponse = `🤖 **Answer**\n\n${aiResponse}`;
                    
                    if (relevantArticles.length > 0) {
                      formattedResponse += `\n\n📚 **Sources:**\n${relevantArticles.slice(0, 3).map((a: any, idx: number) => 
                        `${idx + 1}. ${a.title}`
                      ).join('\n')}`;
                    }
                    
                    const knowledgeMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId,
                      senderId: 'ai-bot',
                      senderName: 'KnowledgeOS™',
                      senderType: 'bot',
                      message: formattedResponse,
                      messageType: 'text',
                    });
                    
                    if (clients) {
                      clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                          client.send(JSON.stringify({ type: 'new_message', message: knowledgeMsg }));
                        }
                      });
                    }
                  } catch (error) {
                    console.error('Error in /ask command:', error);
                    
                    const errorMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId,
                      senderId: 'ai-bot',
                      senderName: 'KnowledgeOS™',
                      senderType: 'bot',
                      message: `⚠️ I'm sorry, I encountered an error while searching for an answer. Please try again or contact support.`,
                      messageType: 'text',
                    });
                    
                    if (clients) {
                      clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                          client.send(JSON.stringify({ type: 'new_message', message: errorMsg }));
                        }
                      });
                    }
                  }
                  break;
                }
                
                default:
                  ws.send(JSON.stringify({
                    type: 'error',
                    message: `Command /${parsedCommand.command} is not yet implemented.`,
                  }));
              }
              
              return; // Don't save command as regular message
            }

            // ABUSE DETECTION: Check for verbal abuse to protect support staff
            const { detectAbuse, getWarningMessage, determineAction } = await import('./services/abuseDetection');
            const abuseResult = detectAbuse(payload.message);
            
            if (abuseResult.isAbusive) {
              // Get current violation count
              const currentViolationCount = await storage.getUserViolationCount(ws.userId);
              const newViolationCount = currentViolationCount + 1;
              
              // Determine action
              const action = determineAction(newViolationCount, abuseResult.severity);
              const warningMsg = getWarningMessage(newViolationCount, abuseResult.severity);
              
              // Log violation
              const violation = await storage.createAbuseViolation({
                userId: ws.userId,
                conversationId: ws.conversationId,
                violationType: abuseResult.severity === 'high' ? 'threat' : 'profanity',
                severity: abuseResult.severity,
                detectedPatterns: abuseResult.matchedPatterns,
                originalMessage: payload.message,
                action,
                warningMessage: warningMsg,
                detectedBy: 'system',
                userViolationCount: newViolationCount,
                isBanned: action === 'ban',
                bannedUntil: action === 'ban' ? null : undefined, // null = permanent ban
                banReason: action === 'ban' ? `Repeated abusive behavior (${newViolationCount} violations)` : undefined,
              });
              
              // Broadcast Server warning to chatroom
              const serverWarning = await storage.createChatMessage({
                conversationId: ws.conversationId,
                senderId: null,
                senderName: 'Server',
                senderType: 'system',
                message: warningMsg,
                messageType: 'text',
                isSystemMessage: true,
              });
              
              const clients = conversationClients.get(ws.conversationId);
              if (clients) {
                const warningPayload = JSON.stringify({
                  type: 'new_message',
                  message: serverWarning,
                });
                clients.forEach((client) => {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(warningPayload);
                  }
                });
              }
              
              // Take action
              if (action === 'kick' || action === 'ban') {
                // Remove user from chatroom
                conversationClients.get(ws.conversationId)?.delete(ws);
                
                // Send kick notification
                const kickMessage = await storage.createChatMessage({
                  conversationId: ws.conversationId,
                  senderId: null,
                  senderName: 'Server',
                  senderType: 'system',
                  message: `${displayName} has been ${action === 'ban' ? 'banned' : 'removed'} from chat for abusive behavior`,
                  messageType: 'text',
                  isSystemMessage: true,
                });
                
                if (clients) {
                  const kickPayload = JSON.stringify({
                    type: 'new_message',
                    message: kickMessage,
                  });
                  clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                      client.send(kickPayload);
                    }
                  });
                }
                
                // Disconnect the abusive user
                ws.close(1008, action === 'ban' ? 'Banned for abusive behavior' : 'Kicked for abusive behavior');
              }
              
              return; // Don't save the abusive message
            }

            // Save message to database
            const savedMessage = await storage.createChatMessage({
              conversationId: ws.conversationId, // Use server-bound conversation, not client payload
              senderId: ws.userId,
              senderName: displayName, // Use server-formatted display name
              senderType: payload.senderType,
              message: payload.message,
              messageType: 'text',
            });

            // Enrich message with user's platform role for frontend display
            const userPlatformRole = await storage.getUserPlatformRole(ws.userId).catch(() => null);
            const enrichedMessage = {
              ...savedMessage,
              role: userPlatformRole || 'guest', // Add role for frontend superscript badges
              userType: ws.userType || 'guest', // Add userType for avatar display
            };

            // Broadcast to all clients in this conversation
            const clients = conversationClients.get(ws.conversationId);
            if (clients) {
              const messagePayload = JSON.stringify({
                type: 'new_message',
                message: enrichedMessage, // Send enriched message with role and userType
              });

              clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(messagePayload);
                }
              });
            }

            // AI BOT Q&A: ENABLED with cost tracking (subscriber pays model)
            const MAIN_ROOM_ID = 'main-chatroom-workforceos';
            if (ws.conversationId === MAIN_ROOM_ID && shouldBotRespond(payload.message)) {
              try {
                // Determine if user is subscriber or free guest
                const platformRole = await storage.getUserPlatformRole(ws.userId);
                const isSubscriber = !!(platformRole && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole));
                
                // Get conversation history (last 5 messages for context)
                const recentMessages = await storage.getChatMessagesByConversation(ws.conversationId);
                const conversationHistory = recentMessages
                  .slice(-5)
                  .filter(m => m.senderType !== 'system')
                  .map(m => ({
                    role: m.senderType === 'bot' ? 'assistant' as const : 'user' as const,
                    content: m.message
                  }));

                // Get AI response with cost tracking
                const aiResponse = await getAiResponse(
                  ws.userId,
                  ws.workspaceId || 'platform-external',
                  ws.conversationId,
                  payload.message,
                  conversationHistory,
                  isSubscriber
                );

                // Save AI response to database
                const aiMessage = await storage.createChatMessage({
                  conversationId: ws.conversationId,
                  senderId: 'ai-bot',
                  senderName: 'HelpOS™',
                  senderType: 'bot',
                  message: aiResponse.message,
                  messageType: 'text',
                });

                // Log cost for debugging (subscriber pays)
                if (aiResponse.tokenUsage) {
                  console.log(`AI Response Cost: $${aiResponse.tokenUsage.totalCost.toFixed(6)} (${aiResponse.tokenUsage.totalTokens} tokens)`);
                }

                // Broadcast AI response to all clients
                if (clients) {
                  const aiPayload = JSON.stringify({
                    type: 'new_message',
                    message: aiMessage,
                  });
                  clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                      client.send(aiPayload);
                    }
                  });
                }
              } catch (aiError) {
                console.error('AI Bot Q&A error:', aiError);
              }
            }
            break;
          }

          case 'typing': {
            if (!ws.conversationId || !ws.userId) {
              return;
            }

            // Broadcast typing status to ALL clients in same conversation (including sender for debug)
            const clients = conversationClients.get(ws.conversationId);
            if (clients) {
              const typingPayload = JSON.stringify({
                type: 'user_typing',
                userId: ws.userId,
                typingUserName: payload.userName || ws.userName || 'User',
                typingUserIsStaff: payload.isStaff || ws.userType === 'staff',
                isTyping: payload.isTyping,
              });

              // Broadcast to all clients (they'll filter out their own typing indicator)
              clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(typingPayload);
                }
              });
            }
            break;
          }

          case 'status_change': {
            if (!ws.conversationId || !ws.userId || !ws.userName) {
              return;
            }

            // Update user's status
            ws.userStatus = payload.status;

            // Create system message for status change
            const statusMessage: ChatMessage = {
              id: Date.now().toString(),
              conversationId: ws.conversationId,
              senderId: null,
              senderName: 'System',
              message: `${ws.userName} is now ${payload.status === 'online' ? 'Available' : payload.status === 'away' ? 'Away' : 'Busy'}`,
              senderType: 'system',
              messageType: 'text',
              isSystemMessage: true,
              isPrivateMessage: false,
              recipientId: null,
              attachmentUrl: null,
              attachmentName: null,
              createdAt: new Date(),
              isRead: false,
              readAt: null,
            };

            // Save status change message
            try {
              await storage.createChatMessage({
                conversationId: ws.conversationId,
                senderId: null,
                senderName: 'System',
                message: statusMessage.message,
                senderType: 'system',
              });
            } catch (err) {
              console.error('Failed to save status change message:', err);
            }

            // Broadcast status change to all clients in this conversation
            const clients = conversationClients.get(ws.conversationId);
            if (clients) {
              clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: 'new_message',
                    message: statusMessage,
                  }));
                  client.send(JSON.stringify({
                    type: 'status_change',
                    userId: ws.userId,
                    userName: ws.userName,
                    status: payload.status,
                  }));
                }
              });
            }
            break;
          }

          case 'kick_user': {
            if (!ws.conversationId || !ws.userId) {
              return;
            }

            // SECURITY: Only platform staff (root, deputy admins) can kick users
            const kickerRole = await storage.getUserPlatformRole(ws.userId).catch(() => null);
            const canKick = kickerRole && ['root', 'deputy_admin'].includes(kickerRole);
            
            if (!canKick) {
              // IRC-style command acknowledgment for permission denied
              ws.send(JSON.stringify({
                type: 'command_ack',
                commandId: payload.commandId,
                action: 'kick_user',
                success: false,
                error: 'PERMISSION_DENIED',
                message: 'You do not have permission to kick users',
              }));
              return;
            }

            // PROTECTION: Check if target user can be kicked
            const targetRole = await storage.getUserPlatformRole(payload.targetUserId).catch(() => null);
            const rawTargetInfo = await storage.getUserDisplayInfo(payload.targetUserId).catch(() => null);
            const targetUserInfo = rawTargetInfo ? {
              ...rawTargetInfo,
              email: rawTargetInfo.email ?? undefined,
            } : null;
            const targetDisplayName = targetUserInfo ? formatUserDisplayName(targetUserInfo) : 'User';
            
            // Only root can kick root
            if (targetRole === 'root' && kickerRole !== 'root') {
              // Send public error message visible to all in chat
              const errorMessage: ChatMessage = {
                id: Date.now().toString(),
                conversationId: ws.conversationId,
                senderId: null,
                senderName: 'System',
                message: `❌ DENIED: Cannot remove ${targetDisplayName}. Root administrators cannot be removed by non-root users.`,
                senderType: 'system',
                messageType: 'text',
                isSystemMessage: true,
                isPrivateMessage: false,
                recipientId: null,
                attachmentUrl: null,
                attachmentName: null,
                createdAt: new Date(),
                isRead: false,
                readAt: null,
              };
              
              // Broadcast error to all clients
              const clients = conversationClients.get(ws.conversationId);
              if (clients) {
                clients.forEach((client) => {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                      type: 'new_message',
                      message: errorMessage,
                    }));
                  }
                });
              }
              
              // Also save to database
              try {
                await storage.createChatMessage({
                  conversationId: ws.conversationId,
                  senderId: null,
                  senderName: 'System',
                  message: errorMessage.message,
                  senderType: 'system',
                  isSystemMessage: true,
                });
              } catch (err) {
                console.error('Failed to save error message:', err);
              }
              
              // IRC-style command acknowledgment for root protection
              ws.send(JSON.stringify({
                type: 'command_ack',
                commandId: payload.commandId,
                action: 'kick_user',
                success: false,
                error: 'TARGET_PROTECTED',
                message: `Cannot remove ${targetDisplayName}. Root administrators cannot be removed by non-root users.`,
              }));
              return;
            }
            
            // Deputy admins can only kick non-staff users
            if (targetRole && ['deputy_admin', 'deputy_assistant', 'sysop'].includes(targetRole) && kickerRole === 'deputy_admin') {
              const errorMessage: ChatMessage = {
                id: Date.now().toString(),
                conversationId: ws.conversationId,
                senderId: null,
                senderName: 'System',
                message: `❌ DENIED: Cannot remove ${targetDisplayName}. Staff members cannot remove other staff members.`,
                senderType: 'system',
                messageType: 'text',
                isSystemMessage: true,
                isPrivateMessage: false,
                recipientId: null,
                attachmentUrl: null,
                attachmentName: null,
                createdAt: new Date(),
                isRead: false,
                readAt: null,
              };
              
              // Broadcast error to all clients
              const clients = conversationClients.get(ws.conversationId);
              if (clients) {
                clients.forEach((client) => {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                      type: 'new_message',
                      message: errorMessage,
                    }));
                  }
                });
              }
              
              // Also save to database
              try {
                await storage.createChatMessage({
                  conversationId: ws.conversationId,
                  senderId: null,
                  senderName: 'System',
                  message: errorMessage.message,
                  senderType: 'system',
                  isSystemMessage: true,
                });
              } catch (err) {
                console.error('Failed to save error message:', err);
              }
              
              // IRC-style command acknowledgment for staff protection
              ws.send(JSON.stringify({
                type: 'command_ack',
                commandId: payload.commandId,
                action: 'kick_user',
                success: false,
                error: 'TARGET_PROTECTED',
                message: `Cannot remove ${targetDisplayName}. Staff members cannot remove other staff members.`,
              }));
              return;
            }

            // Find the target user's connection
            const clients = conversationClients.get(ws.conversationId);
            if (!clients) return;

            let targetClient: WebSocketClient | null = null;
            let targetUserName = 'User';
            let isSimulatedUser = payload.targetUserId.startsWith('sim-user-');

            for (const client of Array.from(clients)) {
              if (client.userId === payload.targetUserId) {
                targetClient = client;
                targetUserName = client.userName || 'User';
                break;
              }
            }

            // If not found as a connected client but is a simulated user, handle removal
            if (!targetClient && !isSimulatedUser) {
              // IRC-style command acknowledgment for user not found
              ws.send(JSON.stringify({
                type: 'command_ack',
                commandId: payload.commandId,
                action: 'kick_user',
                success: false,
                error: 'USER_NOT_FOUND',
                message: 'User not found in this room',
              }));
              return;
            }

            // For simulated users, find their name from the hardcoded list
            if (isSimulatedUser && !targetClient) {
              const simUserNames: Record<string, string> = {
                'sim-user-1': 'Jennifer Lopez',
                'sim-user-2': 'Robert Johnson',
                'sim-user-3': 'Maria Garcia',
                'sim-user-4': 'James Wilson',
                'sim-user-5': 'Lisa Anderson',
                'sim-user-6': 'Michael Brown',
                'sim-user-7': 'Sarah Thompson',
                'sim-user-8': 'Christopher Lee',
                'sim-user-9': 'Amanda White',
                'sim-user-10': 'Daniel Martinez',
                'sim-bot-helpos': 'HelpOS™ AI',
                'sim-staff-1': 'Sarah Martinez',
                'sim-staff-2': 'Mike Chen',
                'sim-staff-3': 'Emily Taylor',
              };
              targetUserName = simUserNames[payload.targetUserId] || 'Simulated User';
            }

            // Create kick message
            const reason = payload.reason || 'violation of chat rules';
            const kickMessage: ChatMessage = {
              id: Date.now().toString(),
              conversationId: ws.conversationId,
              senderId: null,
              senderName: 'System',
              message: `${targetUserName} has been removed from the chat (Reason: ${reason})`,
              senderType: 'system',
              messageType: 'text',
              isSystemMessage: true,
              isPrivateMessage: false,
              recipientId: null,
              attachmentUrl: null,
              attachmentName: null,
              createdAt: new Date(),
              isRead: false,
              readAt: null,
            };

            // Save kick message
            try {
              await storage.createChatMessage({
                conversationId: ws.conversationId,
                senderId: null,
                senderName: 'System',
                message: kickMessage.message,
                senderType: 'system',
              });
            } catch (err) {
              console.error('Failed to save kick message:', err);
            }

            // Broadcast kick message to all clients FIRST
            clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'new_message',
                  message: kickMessage,
                }));
              }
            });

            // Handle simulated user removal
            if (isSimulatedUser) {
              // Add to removed list so they don't appear in future broadcasts
              removedSimulatedUsers.add(payload.targetUserId);
              console.log(`✅ Simulated user ${targetUserName} (${payload.targetUserId}) removed by ${ws.userName}`);
            } else {
              // DISCONNECT the real user
              if (targetClient && targetClient.readyState === WebSocket.OPEN) {
                targetClient.send(JSON.stringify({
                  type: 'kicked',
                  reason: reason,
                  message: `You have been removed from the chat for: ${reason}`,
                }));
                targetClient.close(1000, `Kicked: ${reason}`);
              }

              // Remove from clients list
              if (targetClient) {
                clients.delete(targetClient);
              }
              console.log(`✅ Real user ${targetUserName} kicked by ${ws.userName} - Reason: ${reason}`);
            }

            // Broadcast updated user list after removal (includes real users + filtered simulated users)
            const realUsers = Array.from(clients)
              .filter(c => c.userId && c.userName)
              .map(c => ({
                id: c.userId!,
                name: c.userName!,
                role: c.workspaceId || 'guest',
                status: c.userStatus || 'online',
                userType: c.userType || 'guest',
              }));

            // Recreate simulated users list and filter out removed ones
            const simulatedUsers: any[] = [];
            
            if (payload.conversationId === 'main-chatroom-workforceos' || ws.conversationId === 'main-chatroom-workforceos') {
              // HelpOS AI Bot
              if (!removedSimulatedUsers.has('sim-bot-helpos')) {
                simulatedUsers.push({
                  id: 'sim-bot-helpos',
                  name: 'HelpOS™ AI',
                  role: 'bot',
                  status: 'online',
                  userType: 'staff'
                });
              }
              
              // Add other simulated users if not removed
              const simUsers = [
                { id: 'sim-staff-1', name: 'Sarah Martinez', role: 'deputy_admin', userType: 'staff' },
                { id: 'sim-staff-2', name: 'Mike Chen', role: 'sysop', userType: 'staff' },
                { id: 'sim-staff-3', name: 'Emily Taylor', role: 'deputy_assistant', userType: 'staff' },
                { id: 'sim-user-1', name: 'Jennifer Lopez', role: 'guest', userType: 'org_user' },
                { id: 'sim-user-2', name: 'Robert Johnson', role: 'guest', userType: 'subscriber' },
                { id: 'sim-user-3', name: 'Maria Garcia', role: 'guest', userType: 'org_user' },
                { id: 'sim-user-4', name: 'James Wilson', role: 'guest', userType: 'org_user' },
                { id: 'sim-user-5', name: 'Lisa Anderson', role: 'guest', userType: 'subscriber' },
                { id: 'sim-user-6', name: 'Michael Brown', role: 'guest', userType: 'org_user' },
                { id: 'sim-user-7', name: 'Sarah Thompson', role: 'guest', userType: 'subscriber' },
                { id: 'sim-user-8', name: 'Christopher Lee', role: 'guest', userType: 'org_user' },
                { id: 'sim-user-9', name: 'Amanda White', role: 'guest', userType: 'guest' },
                { id: 'sim-user-10', name: 'Daniel Martinez', role: 'guest', userType: 'org_user' },
              ];
              
              simUsers.forEach(user => {
                if (!removedSimulatedUsers.has(user.id)) {
                  simulatedUsers.push({ ...user, status: 'online' });
                }
              });
            }

            const allUsers = [...realUsers, ...simulatedUsers];

            clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'user_list_update',
                  users: allUsers,
                  count: allUsers.length,
                }));
              }
            });

            // ===================================================================
            // AUDITOS™ - Log the moderation action for compliance tracking
            // ===================================================================
            try {
              const kickerInfo = await storage.getUserDisplayInfo(ws.userId);
              const kickerDisplayName = kickerInfo ? formatUserDisplayName({
                firstName: kickerInfo.firstName,
                lastName: kickerInfo.lastName,
                email: kickerInfo.email || undefined,
                platformRole: kickerInfo.platformRole || undefined,
                workspaceRole: kickerInfo.workspaceRole || undefined,
              }) : ws.userName || 'Unknown';

              await storage.createAuditLog({
                commandId: payload.commandId || null, // IRC-style command tracking
                userId: ws.userId,
                userEmail: kickerInfo?.email || ws.userName || 'unknown',
                userRole: kickerRole || 'unknown',
                action: 'kick_user',
                actionDescription: `${kickerDisplayName} removed ${targetUserName} from chat`,
                entityType: 'user',
                entityId: payload.targetUserId,
                targetId: payload.targetUserId,
                targetName: targetUserName,
                targetType: 'user',
                conversationId: ws.conversationId,
                reason: reason,
                metadata: {
                  commandPayload: {
                    type: 'kick_user',
                    targetUserId: payload.targetUserId,
                    reason: reason,
                  },
                  isSimulatedUser: isSimulatedUser,
                },
                ipAddress: ws.ipAddress || null,
                userAgent: ws.userAgent || null,
                success: true,
                errorMessage: null,
              });
            } catch (auditErr) {
              console.error('AuditOS™ failed to log kick action:', auditErr);
            }

            // ===================================================================
            // IRC-STYLE COMMAND ACKNOWLEDGMENT - Send success response to originating client
            // ===================================================================
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'command_ack',
                commandId: payload.commandId,
                action: 'kick_user',
                success: true,
                message: `✓ ${targetUserName} removed from chat`,
                targetUserId: payload.targetUserId,
                targetName: targetUserName,
              }));
            }

            break;
          }

          case 'silence_user': {
            // Mute/silence a user temporarily with IRC-style acknowledgments
            if (!ws.conversationId || !ws.userId) {
              return;
            }

            // SECURITY: Only platform staff can silence users
            const silencerRole = await storage.getUserPlatformRole(ws.userId).catch(() => null);
            const canSilence = silencerRole && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(silencerRole);
            
            if (!canSilence) {
              // IRC-STYLE COMMAND ACKNOWLEDGMENT - Permission denied
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'command_ack',
                  commandId: payload.commandId,
                  action: 'silence_user',
                  success: false,
                  message: '✗ Permission denied - Staff role required',
                  errorType: 'PERMISSION_DENIED',
                }));
              }

              // Log failed attempt to AuditOS™
              try {
                const silencerInfo = await storage.getUserDisplayInfo(ws.userId);
                await storage.createAuditLog({
                  commandId: payload.commandId || null,
                  userId: ws.userId,
                  userEmail: silencerInfo?.email || ws.userName || 'unknown',
                  userRole: silencerRole || 'unknown',
                  action: 'silence_user',
                  actionDescription: `Permission denied: ${ws.userName} attempted to silence user`,
                  entityType: 'user',
                  entityId: payload.targetUserId || 'unknown',
                  targetId: payload.targetUserId || null,
                  targetName: null,
                  targetType: 'user',
                  conversationId: ws.conversationId,
                  reason: payload.reason || null,
                  metadata: {
                    commandPayload: {
                      type: 'silence_user',
                      targetUserId: payload.targetUserId,
                      duration: payload.duration,
                      reason: payload.reason,
                    },
                  },
                  ipAddress: ws.ipAddress || null,
                  userAgent: ws.userAgent || null,
                  success: false,
                  errorMessage: 'Permission denied - Staff role required',
                });
              } catch (auditErr) {
                console.error('AuditOS™ failed to log silence attempt:', auditErr);
              }
              return;
            }

            const clients = conversationClients.get(ws.conversationId);
            if (!clients) {
              // IRC acknowledgment - Conversation not found
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'command_ack',
                  commandId: payload.commandId,
                  action: 'silence_user',
                  success: false,
                  message: '✗ Conversation not found',
                  errorType: 'NOT_FOUND',
                }));
              }
              return;
            }

            // Find target user
            let targetUserName = 'User';
            for (const client of Array.from(clients)) {
              if (client.userId === payload.targetUserId) {
                targetUserName = client.userName || 'User';
                break;
              }
            }

            // Create system announcement message
            const duration = payload.duration || 5;
            const reason = payload.reason || 'Chat violation';
            const silenceMessage: ChatMessage = {
              id: Date.now().toString(),
              conversationId: ws.conversationId,
              senderId: null,
              senderName: 'System',
              message: `🔇 ${targetUserName} has been silenced for ${duration} minutes by ${ws.userName}. Reason: ${reason}`,
              senderType: 'system',
              messageType: 'text',
              isSystemMessage: true,
              isPrivateMessage: false,
              recipientId: null,
              attachmentUrl: null,
              attachmentName: null,
              createdAt: new Date(),
              isRead: false,
              readAt: null,
            };

            // Save and broadcast the silence message FIRST
            try {
              await storage.createChatMessage({
                conversationId: ws.conversationId,
                senderId: null,
                senderName: 'System',
                message: silenceMessage.message,
                senderType: 'system',
              });
            } catch (err) {
              console.error('Failed to save silence message:', err);
            }

            // Broadcast to all clients
            clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'new_message',
                  message: silenceMessage,
                }));
              }
            });

            console.log(`🔇 ${targetUserName} silenced by ${ws.userName} for ${duration} minutes - Reason: ${reason}`);

            // ===================================================================
            // AUDITOS™ - Log the moderation action for compliance tracking
            // ===================================================================
            try {
              const silencerInfo = await storage.getUserDisplayInfo(ws.userId);
              const silencerDisplayName = silencerInfo ? formatUserDisplayName({
                firstName: silencerInfo.firstName,
                lastName: silencerInfo.lastName,
                email: silencerInfo.email || undefined,
                platformRole: silencerInfo.platformRole || undefined,
                workspaceRole: silencerInfo.workspaceRole || undefined,
              }) : ws.userName || 'Unknown';

              await storage.createAuditLog({
                commandId: payload.commandId || null, // IRC-style command tracking
                userId: ws.userId,
                userEmail: silencerInfo?.email || ws.userName || 'unknown',
                userRole: silencerRole || 'unknown',
                action: 'silence_user',
                actionDescription: `${silencerDisplayName} silenced ${targetUserName} for ${duration} minutes`,
                entityType: 'user',
                entityId: payload.targetUserId,
                targetId: payload.targetUserId,
                targetName: targetUserName,
                targetType: 'user',
                conversationId: ws.conversationId,
                reason: reason,
                metadata: {
                  commandPayload: {
                    type: 'silence_user',
                    targetUserId: payload.targetUserId,
                    duration: duration,
                    reason: reason,
                  },
                  durationMinutes: duration,
                },
                ipAddress: ws.ipAddress || null,
                userAgent: ws.userAgent || null,
                success: true,
                errorMessage: null,
              });
            } catch (auditErr) {
              console.error('AuditOS™ failed to log silence action:', auditErr);
            }

            // ===================================================================
            // IRC-STYLE COMMAND ACKNOWLEDGMENT - Send success response to originating client
            // ===================================================================
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'command_ack',
                commandId: payload.commandId,
                action: 'silence_user',
                success: true,
                message: `✓ ${targetUserName} silenced for ${duration} minutes`,
                targetUserId: payload.targetUserId,
                targetName: targetUserName,
                duration: duration,
              }));
            }

            break;
          }

          case 'give_voice': {
            // Unmute a user (give them voice back) with IRC-style acknowledgments
            if (!ws.conversationId || !ws.userId) {
              return;
            }

            // SECURITY: Only platform staff can give voice
            const staffRole = await storage.getUserPlatformRole(ws.userId).catch(() => null);
            const canGiveVoice = staffRole && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(staffRole);
            
            if (!canGiveVoice) {
              // IRC-STYLE COMMAND ACKNOWLEDGMENT - Permission denied
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'command_ack',
                  commandId: payload.commandId,
                  action: 'give_voice',
                  success: false,
                  message: '✗ Permission denied - Staff role required',
                  errorType: 'PERMISSION_DENIED',
                }));
              }

              // Log failed attempt to AuditOS™
              try {
                const staffInfo = await storage.getUserDisplayInfo(ws.userId);
                await storage.createAuditLog({
                  commandId: payload.commandId || null,
                  userId: ws.userId,
                  userEmail: staffInfo?.email || ws.userName || 'unknown',
                  userRole: staffRole || 'unknown',
                  action: 'give_voice',
                  actionDescription: `Permission denied: ${ws.userName} attempted to unmute user`,
                  entityType: 'user',
                  entityId: payload.targetUserId || 'unknown',
                  targetId: payload.targetUserId || null,
                  targetName: null,
                  targetType: 'user',
                  conversationId: ws.conversationId,
                  reason: null,
                  metadata: {
                    commandPayload: {
                      type: 'give_voice',
                      targetUserId: payload.targetUserId,
                    },
                  },
                  ipAddress: ws.ipAddress || null,
                  userAgent: ws.userAgent || null,
                  success: false,
                  errorMessage: 'Permission denied - Staff role required',
                });
              } catch (auditErr) {
                console.error('AuditOS™ failed to log give_voice attempt:', auditErr);
              }
              return;
            }

            const clients = conversationClients.get(ws.conversationId);
            if (!clients) {
              // IRC acknowledgment - Conversation not found
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'command_ack',
                  commandId: payload.commandId,
                  action: 'give_voice',
                  success: false,
                  message: '✗ Conversation not found',
                  errorType: 'NOT_FOUND',
                }));
              }
              return;
            }

            // Find target user
            let targetUserName = 'User';
            for (const client of Array.from(clients)) {
              if (client.userId === payload.targetUserId) {
                targetUserName = client.userName || 'User';
                break;
              }
            }

            // Create system announcement message
            const unmuteMessage: ChatMessage = {
              id: Date.now().toString(),
              conversationId: ws.conversationId,
              senderId: null,
              senderName: 'System',
              message: `🔊 ${targetUserName} has been unmuted by ${ws.userName} and can now speak.`,
              senderType: 'system',
              messageType: 'text',
              isSystemMessage: true,
              isPrivateMessage: false,
              recipientId: null,
              attachmentUrl: null,
              attachmentName: null,
              createdAt: new Date(),
              isRead: false,
              readAt: null,
            };

            // Save and broadcast the unmute message FIRST
            try {
              await storage.createChatMessage({
                conversationId: ws.conversationId,
                senderId: null,
                senderName: 'System',
                message: unmuteMessage.message,
                senderType: 'system',
              });
            } catch (err) {
              console.error('Failed to save unmute message:', err);
            }

            // Broadcast to all clients
            clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'new_message',
                  message: unmuteMessage,
                }));
              }
            });

            console.log(`🔊 ${targetUserName} unmuted by ${ws.userName}`);

            // ===================================================================
            // AUDITOS™ - Log the moderation action for compliance tracking
            // ===================================================================
            try {
              const staffInfo = await storage.getUserDisplayInfo(ws.userId);
              const staffDisplayName = staffInfo ? formatUserDisplayName({
                firstName: staffInfo.firstName,
                lastName: staffInfo.lastName,
                email: staffInfo.email || undefined,
                platformRole: staffInfo.platformRole || undefined,
                workspaceRole: staffInfo.workspaceRole || undefined,
              }) : ws.userName || 'Unknown';

              await storage.createAuditLog({
                commandId: payload.commandId || null, // IRC-style command tracking
                userId: ws.userId,
                userEmail: staffInfo?.email || ws.userName || 'unknown',
                userRole: staffRole || 'unknown',
                action: 'give_voice',
                actionDescription: `${staffDisplayName} unmuted ${targetUserName}`,
                entityType: 'user',
                entityId: payload.targetUserId,
                targetId: payload.targetUserId,
                targetName: targetUserName,
                targetType: 'user',
                conversationId: ws.conversationId,
                reason: null,
                metadata: {
                  commandPayload: {
                    type: 'give_voice',
                    targetUserId: payload.targetUserId,
                  },
                },
                ipAddress: ws.ipAddress || null,
                userAgent: ws.userAgent || null,
                success: true,
                errorMessage: null,
              });
            } catch (auditErr) {
              console.error('AuditOS™ failed to log give_voice action:', auditErr);
            }

            // ===================================================================
            // IRC-STYLE COMMAND ACKNOWLEDGMENT - Send success response to originating client
            // ===================================================================
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'command_ack',
                commandId: payload.commandId,
                action: 'give_voice',
                success: true,
                message: `✓ ${targetUserName} can now speak`,
                targetUserId: payload.targetUserId,
                targetName: targetUserName,
              }));
            }

            break;
          }

          case 'ban_user': {
            // Permanently ban a user from chat (platform staff only)
            if (!ws.conversationId || !ws.userId) {
              return;
            }

            // Check if user has staff permissions
            const staffInfo = await storage.getUserById(ws.userId);
            const isStaff = staffInfo?.platformRole && ['root', 'admin', 'deputy', 'assistant', 'sysop'].includes(staffInfo.platformRole);
            
            if (!isStaff) {
              ws.send(JSON.stringify({
                type: 'error',
                message: '⛔ Permission denied - Staff role required for banning users',
              }));
              return;
            }

            // Get target user info
            const targetUser = await storage.getUserById(payload.targetUserId);
            const targetUserName = targetUser ? `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.trim() || targetUser.email || 'Unknown' : 'Unknown';
            
            // Get staff display name
            const staffRole = staffInfo?.platformRole || 'unknown';
            const staffDisplayName = staffInfo ? formatUserDisplayName({
              firstName: staffInfo.firstName,
              lastName: staffInfo.lastName,
              email: staffInfo.email || undefined,
              platformRole: staffInfo.platformRole || undefined,
              workspaceRole: staffInfo.workspaceRole || undefined,
            }) : ws.userName || 'Unknown';

            // Audit log the ban action
            try {
              await storage.createAuditLog({
                commandId: payload.commandId || null,
                userId: ws.userId,
                userEmail: staffInfo?.email || ws.userName || 'unknown',
                userRole: staffRole || 'unknown',
                action: 'ban_user',
                actionDescription: `${staffDisplayName} permanently banned ${targetUserName}`,
                entityType: 'user',
                entityId: payload.targetUserId,
                targetId: payload.targetUserId,
                targetName: targetUserName,
                targetType: 'user',
                conversationId: ws.conversationId,
                reason: payload.reason || null,
                metadata: {
                  commandPayload: {
                    type: 'ban_user',
                    targetUserId: payload.targetUserId,
                    reason: payload.reason,
                  },
                },
                ipAddress: ws.ipAddress || null,
                userAgent: ws.userAgent || null,
                success: true,
                errorMessage: null,
              });
            } catch (auditErr) {
              console.error('AuditOS™ failed to log ban action:', auditErr);
            }

            // Find and disconnect target user from all conversations
            const clients = conversationClients.get(ws.conversationId);
            if (clients) {
              for (const client of Array.from(clients)) {
                if (client.userId === payload.targetUserId) {
                  // Send ban notification to target user
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                      type: 'banned',
                      reason: payload.reason || 'Violation of chat policies',
                      message: '🚫 You have been permanently banned from chat by platform staff',
                      bannedBy: staffDisplayName,
                    }));
                  }
                  
                  // Remove from conversation and close connection
                  clients.delete(client);
                  client.close();
                  console.log(`🚫 ${payload.targetUserId} has been permanently banned by ${staffDisplayName}`);
                }
              }
            }

            // Add to permanently banned users list (in-memory tracking)
            removedSimulatedUsers.add(payload.targetUserId);

            // Broadcast ban announcement to room
            const reason = payload.reason ? ` (Reason: ${payload.reason})` : '';
            broadcastToConversation(ws.conversationId, {
              type: 'system_message',
              message: `🚫 ${targetUserName} has been permanently banned by ${staffDisplayName}${reason}`,
              timestamp: new Date().toISOString(),
            }, ws.userId);

            // Send success acknowledgment
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'command_ack',
                commandId: payload.commandId,
                action: 'ban_user',
                success: true,
                message: `✓ ${targetUserName} has been permanently banned`,
                targetUserId: payload.targetUserId,
                targetName: targetUserName,
              }));
            }

            break;
          }

          case 'request_secure': {
            // Staff requests secure information from a user
            if (!ws.conversationId || !ws.userId) {
              return;
            }

            // Find target user's connection
            const clients = conversationClients.get(ws.conversationId);
            if (!clients) return;

            let targetClient: WebSocketClient | null = null;
            for (const client of Array.from(clients)) {
              if (client.userId === payload.targetUserId) {
                targetClient = client;
                break;
              }
            }

            if (!targetClient || targetClient.readyState !== WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Target user not found or offline',
              }));
              return;
            }

            // Send secure request to target user
            targetClient.send(JSON.stringify({
              type: 'secure_request',
              requestType: payload.requestType,
              requestedBy: ws.userName || 'Support Staff',
              message: payload.message || '',
            }));

            console.log(`🔐 ${ws.userName} requested ${payload.requestType} from user ${payload.targetUserId}`);
            break;
          }

          case 'secure_response': {
            // User responds with secure information
            if (!ws.conversationId || !ws.userId) {
              return;
            }

            // Find staff members in the room to send the response to
            const clients = conversationClients.get(ws.conversationId);
            if (!clients) return;

            // Send to all staff members
            clients.forEach((client) => {
              if (client.userId !== ws.userId && client.readyState === WebSocket.OPEN) {
                // Only send to staff (check if they have platform role)
                client.send(JSON.stringify({
                  type: 'secure_data_received',
                  fromUser: ws.userName || 'User',
                  fromUserId: ws.userId,
                  data: payload.data,
                }));
              }
            });

            console.log(`📥 Secure data received from ${ws.userName}`);
            break;
          }

          case 'release_spectator': {
            // Release user from spectator/hold mode
            if (!ws.conversationId || !ws.userId) {
              return;
            }

            const clients = conversationClients.get(ws.conversationId);
            if (!clients) return;

            let targetClient: WebSocketClient | null = null;
            for (const client of Array.from(clients)) {
              if (client.userId === payload.targetUserId) {
                targetClient = client;
                break;
              }
            }

            if (!targetClient || targetClient.readyState !== WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Target user not found',
              }));
              return;
            }

            // Notify target they're released from hold (legacy)
            targetClient.send(JSON.stringify({
              type: 'spectator_released',
              releasedBy: ws.userName || 'Support Staff',
            }));

            // Send voice_granted event for new animated status
            targetClient.send(JSON.stringify({
              type: 'voice_granted',
            }));

            console.log(`🎤 ${ws.userName} released ${payload.targetUserId} from hold`);
            break;
          }

          case 'transfer_user': {
            // Transfer user to another agent
            if (!ws.conversationId || !ws.userId) {
              return;
            }

            // Create transfer announcement
            const transferMessage: ChatMessage = {
              id: Date.now().toString(),
              conversationId: ws.conversationId,
              senderId: null,
              senderName: 'System',
              message: `${ws.userName} has transferred the customer to the next available agent`,
              senderType: 'system',
              messageType: 'text',
              isSystemMessage: true,
              isPrivateMessage: false,
              recipientId: null,
              attachmentUrl: null,
              attachmentName: null,
              createdAt: new Date(),
              isRead: false,
              readAt: null,
            };

            // Save and broadcast
            try {
              await storage.createChatMessage({
                conversationId: ws.conversationId,
                senderId: null,
                senderName: 'System',
                message: transferMessage.message,
                senderType: 'system',
              });

              const clients = conversationClients.get(ws.conversationId);
              if (clients) {
                clients.forEach((client) => {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                      type: 'new_message',
                      message: transferMessage,
                    }));
                  }
                });
              }
            } catch (err) {
              console.error('Failed to save transfer message:', err);
            }

            console.log(`🔄 ${ws.userName} transferred user ${payload.targetUserId}`);
            break;
          }
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Failed to process message',
        }));
      }
    });

    ws.on('close', async () => {
      // Clean up heartbeat interval
      if (ws.pingInterval) {
        clearInterval(ws.pingInterval);
      }

      // GLOBAL TRACKING CLEANUP: Remove from platform-wide stats
      if (ws.userId) {
        globalConnections.totalConnections = Math.max(0, globalConnections.totalConnections - 1);
        globalConnections.allUsers.delete(ws.userId);
        globalConnections.staffUsers.delete(ws.userId);
        globalConnections.subscriberUsers.delete(ws.userId);
      }
      
      // Send leave announcement for main chatroom
      const MAIN_ROOM_ID = 'main-chatroom-workforceos';
      if (ws.conversationId === MAIN_ROOM_ID && ws.userId) {
        try {
          // Get user display info for leave announcement
          const userInfo = await storage.getUserDisplayInfo(ws.userId);
          const displayName = userInfo ? formatUserDisplayName({
            firstName: userInfo.firstName,
            lastName: userInfo.lastName,
            email: userInfo.email || undefined,
            platformRole: userInfo.platformRole || undefined,
            workspaceRole: userInfo.workspaceRole || undefined,
          }) : 'User';

          // Create leave announcement
          const leaveAnnouncement = await storage.createChatMessage({
            conversationId: ws.conversationId,
            senderId: ws.userId,
            senderName: 'Server',
            senderType: 'system',
            message: `${displayName} has left the HelpDesk`,
            messageType: 'text',
            isSystemMessage: true,
          });

          // Broadcast leave announcement to remaining clients
          const clients = conversationClients.get(ws.conversationId);
          if (clients) {
            const announcementPayload = JSON.stringify({
              type: 'new_message',
              message: leaveAnnouncement,
            });
            clients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(announcementPayload);
              }
            });
          }

          console.log(`${displayName} left conversation ${ws.conversationId}`);
        } catch (error) {
          console.error('Error sending leave announcement:', error);
        }
      }

      // Remove client from conversation
      if (ws.conversationId) {
        const clients = conversationClients.get(ws.conversationId);
        if (clients) {
          clients.delete(ws);
          if (clients.size === 0) {
            conversationClients.delete(ws.conversationId);
          }
        }
      }
      console.log('WebSocket connection closed');
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      // Clean up heartbeat interval on error
      if (ws.pingInterval) {
        clearInterval(ws.pingInterval);
      }
    });
  });

  // REALISTIC CHAT SIMULATION: Generate realistic conversation flow
  const MAIN_ROOM_ID = 'main-chatroom-workforceos';
  let simulationRunning = false;
  
  async function startChatSimulation() {
    if (simulationRunning) return;
    simulationRunning = true;
    
    const clients = conversationClients.get(MAIN_ROOM_ID);
    if (!clients || clients.size === 0) {
      simulationRunning = false;
      return;
    }

    // Realistic conversation scenarios
    const scenarios = [
      // Scenario 1: Password reset help
      { sender: 'sim-user-1', name: 'Jennifer Lopez', type: 'customer', message: 'Hi, I forgot my password and the reset email never came through. Can someone help?' },
      { sender: 'helpos-ai-bot', name: 'HelpOS', type: 'bot', message: 'Jennifer - I see you need password reset help. Sarah Martinez is our password specialist. Alerting her now.' },
      { sender: 'sim-staff-1', name: 'Sarah Martinez', type: 'support', message: 'Hi Jennifer! I can help with that. Can you confirm the email address on your account?' },
      { sender: 'sim-user-1', name: 'Jennifer Lopez', type: 'customer', message: 'Yes, it is jennifer.lopez@company.com' },
      { sender: 'sim-staff-1', name: 'Sarah Martinez', type: 'support', message: 'Perfect! I just resent the password reset link. Please check your spam folder as well. It should arrive in 2-3 minutes.' },
      { sender: 'sim-user-1', name: 'Jennifer Lopez', type: 'customer', message: 'Got it! Thank you so much for the quick help!' },
      
      // Scenario 2: Billing question
      { sender: 'sim-user-2', name: 'Robert Johnson', type: 'customer', message: 'I have a question about my invoice. I was charged twice this month.' },
      { sender: 'helpos-ai-bot', name: 'HelpOS', type: 'bot', message: 'Robert - Billing issue detected. Mike Chen handles billing inquiries. Routing your request now.' },
      { sender: 'sim-staff-2', name: 'Mike Chen', type: 'support', message: 'Hi Robert, I am looking at your account now. Can you provide your invoice number?' },
      { sender: 'sim-user-2', name: 'Robert Johnson', type: 'customer', message: 'Invoice #INV-2024-1234 and #INV-2024-1235' },
      { sender: 'sim-staff-2', name: 'Mike Chen', type: 'support', message: 'I see the duplicate charge. This was a processing error on our end. I am issuing a full refund for the duplicate charge right now. You should see it in 3-5 business days.' },
      { sender: 'sim-user-2', name: 'Robert Johnson', type: 'customer', message: 'That is great! Thank you for resolving this so quickly.' },
      
      // Scenario 3: Account locked
      { sender: 'sim-user-3', name: 'Maria Garcia', type: 'customer', message: 'My account is locked after too many failed login attempts. How do I unlock it?' },
      { sender: 'helpos-ai-bot', name: 'HelpOS', type: 'bot', message: 'Maria - Account security issue. Emily Taylor specializes in account access. Connecting you now.' },
      { sender: 'sim-staff-3', name: 'Emily Taylor', type: 'support', message: 'Hi Maria! I can unlock your account. For security, can you verify the last 4 digits of your phone number?' },
      { sender: 'sim-user-3', name: 'Maria Garcia', type: 'customer', message: '4567' },
      { sender: 'sim-staff-3', name: 'Emily Taylor', type: 'support', message: 'Perfect! Your account is now unlocked. I also reset your password for security. Check your email for the new temporary password.' },
      { sender: 'sim-user-3', name: 'Maria Garcia', type: 'customer', message: 'Thank you! I can log in now!' },
      
      // Scenario 4: Schedule question
      { sender: 'sim-user-4', name: 'James Wilson', type: 'customer', message: 'I need help with ScheduleOS. How do I assign shifts to multiple employees at once?' },
      { sender: 'sim-staff-1', name: 'Sarah Martinez', type: 'support', message: 'Hi James! You can use the drag-and-drop feature. Just hold Shift and click multiple employees, then drag a shift template onto the selection.' },
      { sender: 'sim-user-4', name: 'James Wilson', type: 'customer', message: 'Oh wow, that is so much easier! Thank you!' },
      
      // Scenario 5: Feature request
      { sender: 'sim-user-5', name: 'Linda Brown', type: 'customer', message: 'Is there a way to export timesheet data to Excel? I need it for my accountant.' },
      { sender: 'sim-staff-2', name: 'Mike Chen', type: 'support', message: 'Yes! Go to TrackOS > Reports > Export. You can choose Excel, CSV, or PDF format.' },
      { sender: 'sim-user-5', name: 'Linda Brown', type: 'customer', message: 'Perfect! Found it. This is exactly what I needed.' },
      
      // Scenario 6: Technical issue
      { sender: 'sim-user-6', name: 'Michael Davis', type: 'customer', message: 'The mobile app keeps crashing when I try to clock in. Is this a known issue?' },
      { sender: 'helpos-ai-bot', name: 'HelpOS', type: 'bot', message: 'Michael - Technical issue detected. David Kim is our mobile specialist but currently busy. Sarah will assist.' },
      { sender: 'sim-staff-1', name: 'Sarah Martinez', type: 'support', message: 'Hi Michael! What device and OS version are you using?' },
      { sender: 'sim-user-6', name: 'Michael Davis', type: 'customer', message: 'iPhone 14, iOS 17.2' },
      { sender: 'sim-staff-1', name: 'Sarah Martinez', type: 'support', message: 'Try clearing the app cache: Settings > Apps > WorkforceOS > Clear Cache. If that does not work, uninstall and reinstall the app. Your data is saved in the cloud.' },
      { sender: 'sim-user-6', name: 'Michael Davis', type: 'customer', message: 'Clearing cache fixed it! Thanks!' },
      
      // Scenario 7: Upgrade question
      { sender: 'sim-user-7', name: 'Patricia Miller', type: 'customer', message: 'What is the difference between Professional and Enterprise plans?' },
      { sender: 'sim-staff-3', name: 'Emily Taylor', type: 'support', message: 'Great question! Enterprise includes AI auto-scheduling, advanced analytics, and priority support. Professional has all core features like time tracking and invoicing. Would you like me to send you a detailed comparison?' },
      { sender: 'sim-user-7', name: 'Patricia Miller', type: 'customer', message: 'Yes please! That would be helpful.' },
      { sender: 'sim-staff-3', name: 'Emily Taylor', type: 'support', message: 'Just emailed you the comparison guide. Let me know if you have questions!' },
      
      // Scenario 8: Integration question
      { sender: 'sim-user-8', name: 'Christopher Lee', type: 'customer', message: 'Can WorkforceOS integrate with QuickBooks for payroll?' },
      { sender: 'helpos-ai-bot', name: 'HelpOS', type: 'bot', message: 'Christopher - Integration inquiry. Mike Chen is our integration expert.' },
      { sender: 'sim-staff-2', name: 'Mike Chen', type: 'support', message: 'Yes! We have a direct QuickBooks integration. Go to Settings > Integrations > QuickBooks and follow the OAuth connection flow. Takes about 2 minutes.' },
      { sender: 'sim-user-8', name: 'Christopher Lee', type: 'customer', message: 'Excellent! I will set that up now.' },
      
      // Scenario 9: Report question
      { sender: 'sim-user-9', name: 'Sarah Anderson', type: 'customer', message: 'How do I create custom reports in ReportOS?' },
      { sender: 'sim-staff-1', name: 'Sarah Martinez', type: 'support', message: 'Hi Sarah! Go to ReportOS > Templates > Create New. You can add custom fields, set required fields, and even require photo uploads.' },
      { sender: 'sim-user-9', name: 'Sarah Anderson', type: 'customer', message: 'Can I require employees to submit daily reports?' },
      { sender: 'sim-staff-1', name: 'Sarah Martinez', type: 'support', message: 'Absolutely! In the template settings, enable "Mandatory Daily Submission" and set the deadline time. Employees will get automated reminders.' },
      { sender: 'sim-user-9', name: 'Sarah Anderson', type: 'customer', message: 'This is fantastic! Thank you!' },
      
      // Scenario 10: Compliance question
      { sender: 'sim-user-10', name: 'Daniel Martinez', type: 'customer', message: 'I need to pull audit logs for a compliance review. Where can I find those?' },
      { sender: 'sim-staff-3', name: 'Emily Taylor', type: 'support', message: 'Hi Daniel! As an Owner, go to Settings > Audit Logs. You can filter by date range, user, and action type, then export to PDF or CSV.' },
      { sender: 'sim-user-10', name: 'Daniel Martinez', type: 'customer', message: 'Perfect! Found everything I need. Your platform is very thorough!' },
      
      // HelpOS provides stats
      { sender: 'helpos-ai-bot', name: 'HelpOS', type: 'bot', message: 'Support stats: 10 issues resolved today. Average response time: 2 minutes. Customer satisfaction: 98%. Great work team!' },
    ];

    // Send messages with realistic timing
    let messageIndex = 0;
    const sendNextMessage = async () => {
      if (messageIndex >= scenarios.length) {
        console.log('Chat simulation completed');
        simulationRunning = false;
        return;
      }

      const scenario = scenarios[messageIndex];
      messageIndex++;

      try {
        // Create and broadcast message
        const chatMessage = await storage.createChatMessage({
          conversationId: MAIN_ROOM_ID,
          senderId: scenario.sender,
          senderName: scenario.name,
          senderType: scenario.type as 'customer' | 'support' | 'system' | 'bot',
          message: scenario.message,
          messageType: 'text',
        });

        // Broadcast to all connected clients
        const clients = conversationClients.get(MAIN_ROOM_ID);
        if (clients) {
          const payload = JSON.stringify({
            type: 'new_message',
            message: chatMessage,
          });
          clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(payload);
            }
          });
        }

        // Realistic delay between messages (3-8 seconds)
        const delay = Math.random() * 5000 + 3000;
        setTimeout(sendNextMessage, delay);
      } catch (error) {
        console.error('Simulation message error:', error);
        setTimeout(sendNextMessage, 1000);
      }
    };

    // Start sending messages
    setTimeout(sendNextMessage, 5000); // Start after 5 seconds
  }

  // Start simulation when first user joins the main room
  // DISABLED: Simulation was causing FK constraint violations with non-existent users
  // setInterval(() => {
  //   const clients = conversationClients.get(MAIN_ROOM_ID);
  //   if (clients && clients.size > 0 && !simulationRunning) {
  //     startChatSimulation();
  //   }
  // }, 10000); // Check every 10 seconds

  console.log('WebSocket server initialized on /ws/chat');
  return wss;
}
