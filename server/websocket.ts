import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { storage } from './storage';
import { formatUserDisplayName } from './utils/formatUserDisplayName';
import { generateGreeting, generateStaffIntroduction, getAiResponse, shouldBotRespond, generateQueueWelcome, generateStaffQueueAlert } from './services/aiBot';
import { parseSlashCommand, validateCommand, getHelpText, COMMAND_REGISTRY } from '@shared/commands';
import { queueManager } from './services/helpOsQueue';
import type { ChatMessage } from '@shared/schema';

interface WebSocketClient extends WebSocket {
  userId?: string;
  workspaceId?: string;
  conversationId?: string;
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
  isTyping: boolean;
}

type WebSocketMessage = ChatMessagePayload | JoinConversationPayload | TypingPayload;

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws/chat'
  });

  // Track active connections by conversation ID
  const conversationClients = new Map<string, Set<WebSocketClient>>();

  wss.on('connection', (ws: WebSocketClient) => {
    console.log('New WebSocket connection established');

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
            if (payload.conversationId === MAIN_ROOM_ID) {
              // This is the main HelpDesk public chatroom - all authenticated users allowed
              try {
                const platformRole = await storage.getUserPlatformRole(payload.userId);
                const isStaff = platformRole && ['root', 'platform_admin', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole);
                
                if (isStaff) {
                  console.log(`${displayName} joined HelpOS (platform staff - role: ${platformRole})`);
                } else {
                  console.log(`${displayName} joined HelpOS (guest/customer)`);
                }
              } catch (staffCheckError) {
                // Error checking staff status - allow access anyway (degraded mode)
                console.error('Failed to verify staff status:', staffCheckError);
                console.log(`User ${payload.userId} joined HelpOS (degraded mode)`);
              }
            }

            // Associate this client with the conversation
            ws.userId = payload.userId;
            ws.workspaceId = conversation.workspaceId;
            ws.conversationId = payload.conversationId;

            if (!conversationClients.has(payload.conversationId)) {
              conversationClients.set(payload.conversationId, new Set());
            }
            conversationClients.get(payload.conversationId)!.add(ws);

            // Send conversation history
            const messages = await storage.getChatMessagesByConversation(payload.conversationId);
            ws.send(JSON.stringify({
              type: 'conversation_history',
              messages,
            }));

            // Mark messages as read
            await storage.markMessagesAsRead(payload.conversationId, payload.userId);

            // HELPDESK ANNOUNCEMENTS: System + HelpOS™
            if (payload.conversationId === MAIN_ROOM_ID) {
              try {
                const platformRole = await storage.getUserPlatformRole(payload.userId);
                const isStaff = platformRole && ['root', 'platform_admin', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole);
                
                // 1. SYSTEM announcement (IRC-style): User joined
                const systemJoinMessage = await storage.createChatMessage({
                  conversationId: payload.conversationId,
                  senderId: null,
                  senderName: 'System',
                  senderType: 'system',
                  message: `*** ${displayName} has joined the HelpDesk`,
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

                // 2. HELPOS™ announcement (AI Bot): Different for staff vs customers
                if (isStaff) {
                  // Staff: Show queue status alert
                  const queueStatus = await queueManager.getQueueStatus();
                  const staffAlert = await generateStaffQueueAlert(
                    queueStatus.waitingCount,
                    queueStatus.beingHelpedCount,
                    queueStatus.averageWaitMinutes
                  );
                  
                  const botMessage = await storage.createChatMessage({
                    conversationId: payload.conversationId,
                    senderId: 'ai-bot',
                    senderName: 'HelpOS™',
                    senderType: 'bot',
                    message: staffAlert,
                    messageType: 'text',
                  });

                  // Broadcast HelpOS message
                  if (clients) {
                    const botPayload = JSON.stringify({
                      type: 'new_message',
                      message: botMessage,
                    });
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(botPayload);
                      }
                    });
                  }
                } else {
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
                    
                    const botMessage = await storage.createChatMessage({
                      conversationId: payload.conversationId,
                      senderId: 'ai-bot',
                      senderName: 'HelpOS™',
                      senderType: 'bot',
                      message: welcomeMessage,
                      messageType: 'text',
                    });

                    await queueManager.markWelcomeSent(queueEntry.id);

                    // Broadcast HelpOS welcome
                    if (clients) {
                      const botPayload = JSON.stringify({
                        type: 'new_message',
                        message: botMessage,
                      });
                      clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                          client.send(botPayload);
                        }
                      });
                    }
                  }
                }
              } catch (announceError) {
                console.error('Failed to send join announcements:', announceError);
              }
            }

            console.log(`${displayName} joined conversation ${payload.conversationId}`);
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
                const isStaff = platformRole && ['root', 'platform_admin', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole);
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
              
              switch (parsedCommand.command) {
                case 'intro': {
                  // AI bot introduces staff to customer
                  const introMessage = await generateStaffIntroduction(displayName, '');
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
                
                case 'help': {
                  const platformRole = await storage.getUserPlatformRole(ws.userId);
                  const isStaff = !!(platformRole && ['root', 'platform_admin', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole));
                  const helpText = getHelpText(isStaff);
                  
                  ws.send(JSON.stringify({
                    type: 'system_message',
                    message: helpText,
                  }));
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

            // Save message to database
            const savedMessage = await storage.createChatMessage({
              conversationId: ws.conversationId, // Use server-bound conversation, not client payload
              senderId: ws.userId,
              senderName: displayName, // Use server-formatted display name
              senderType: payload.senderType,
              message: payload.message,
              messageType: 'text',
            });

            // Broadcast to all clients in this conversation
            const clients = conversationClients.get(ws.conversationId);
            if (clients) {
              const messagePayload = JSON.stringify({
                type: 'new_message',
                message: savedMessage,
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
                const isSubscriber = !!(platformRole && ['root', 'platform_admin', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole));
                
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

            // Broadcast typing status to other clients in same conversation
            const clients = conversationClients.get(ws.conversationId);
            if (clients) {
              const typingPayload = JSON.stringify({
                type: 'user_typing',
                userId: ws.userId,
                isTyping: payload.isTyping,
              });

              clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(typingPayload);
                }
              });
            }
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
            senderName: 'System',
            senderType: 'system',
            message: `${displayName} has left the chatroom`,
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
    });
  });

  console.log('WebSocket server initialized on /ws/chat');
  return wss;
}
