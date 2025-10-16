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
                const isStaff = platformRole && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole);
                
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

            // Single consolidated log message
            if (payload.conversationId === MAIN_ROOM_ID) {
              console.log(`✅ ${displayName} joined HelpDesk (${userRoleInfo})`);
            } else {
              console.log(`${displayName} joined conversation ${payload.conversationId}`);
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
                    message: `🔐 **Authentication Request**\n\nPlease authenticate user: **${username}**\n\nThe user will receive instructions to verify their identity. This may include:\n• Confirming email address\n• Answering security questions\n• Providing account details\n\nWaiting for user verification...`,
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
                  // Verify organization/user credentials
                  const username = parsedCommand.args[0];
                  if (!username) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: 'Usage: /verify <username>',
                    }));
                    break;
                  }
                  
                  // Check if user exists in database
                  const user = await storage.getUserByUsername(username);
                  let verifyMsg: string;
                  
                  if (user) {
                    const workspace = await storage.getWorkspaceByOwnerId(user.id);
                    verifyMsg = `✅ **Verification Complete**\n\n**User:** ${user.username}\n**Name:** ${user.fullName || 'Not provided'}\n**Email:** ${user.email}\n**Organization:** ${workspace?.name || 'No workspace'}\n**Status:** Active\n\nUser credentials verified successfully.`;
                  } else {
                    verifyMsg = `❌ **Verification Failed**\n\nUser **${username}** not found in system.\n\nPossible reasons:\n• Username misspelled\n• Account not yet created\n• Account deleted\n\nPlease ask the user to provide correct credentials or create an account.`;
                  }
                  
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
                  // Send password reset link
                  const email = parsedCommand.args[0];
                  if (!email) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: 'Usage: /resetpass <email>',
                    }));
                    break;
                  }
                  
                  // Trigger password reset (creates reset token)
                  try {
                    await storage.createPasswordResetToken(email);
                    
                    const resetMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId,
                      senderId: 'ai-bot',
                      senderName: 'HelpOS™',
                      senderType: 'bot',
                      message: `📧 **Password Reset Initiated**\n\nA password reset link has been sent to:\n**${email}**\n\nThe user should:\n1. Check their email inbox (and spam folder)\n2. Click the reset link within 1 hour\n3. Create a new password\n\nIf they don't receive the email within 5 minutes, they can request another reset.`,
                      messageType: 'text',
                    });
                    
                    if (clients) {
                      clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                          client.send(JSON.stringify({ type: 'new_message', message: resetMsg }));
                        }
                      });
                    }
                  } catch (error: any) {
                    const errorMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId,
                      senderId: 'ai-bot',
                      senderName: 'HelpOS™',
                      senderType: 'bot',
                      message: `❌ **Password Reset Failed**\n\nUnable to send reset link to: **${email}**\n\nError: ${error.message || 'Email not found in system'}\n\nPlease verify the email address and try again.`,
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
                
                case 'close': {
                  // Close current ticket/session
                  const reason = parsedCommand.args.join(' ') || 'Session closed by staff';
                  
                  // System announcement: Ticket closed
                  const systemMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: null,
                    senderName: 'System',
                    senderType: 'system',
                    message: `*** ${displayName} has closed this ticket. Reason: ${reason}`,
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
                  
                  let statusMsg = `📊 **Ticket Status**\n\n`;
                  statusMsg += `**Status:** ${conversation?.status || 'Unknown'}\n`;
                  statusMsg += `**Ticket ID:** ${ws.conversationId}\n`;
                  
                  if (queueEntry) {
                    statusMsg += `\n**Queue Information:**\n`;
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
                    queueMsg = `⏳ **Queue Position**\n\nYou are currently **#${queueEntry.position}** in line.\n\n**Estimated wait:** ${Math.ceil(queueEntry.waitTimeMinutes)} minutes\n**Priority score:** ${queueEntry.priorityScore} points\n\nWe'll notify you when a support agent is available!`;
                  } else {
                    queueMsg = `✅ **Not in Queue**\n\nYou are not currently in the support queue. You may already be connected with a support agent, or your ticket has been resolved.`;
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
                  // Staff kicks a user from chat
                  const targetUsername = parsedCommand.args[0];
                  const reason = parsedCommand.args.slice(1).join(' ') || 'No reason provided';
                  
                  if (!targetUsername) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: 'Usage: /kick <username> [reason]',
                    }));
                    break;
                  }
                  
                  // System announcement
                  const kickMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: null,
                    senderName: 'System',
                    senderType: 'system',
                    message: `*** ${targetUsername} has been removed from the chat. Reason: ${reason}`,
                    messageType: 'text',
                    isSystemMessage: true,
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: kickMsg }));
                        // Send kick event to target user
                        if (client.userId === targetUsername) {
                          client.send(JSON.stringify({
                            type: 'kicked',
                            reason: reason,
                          }));
                          client.close(1000, `Kicked: ${reason}`);
                        }
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
                  
                  const muteMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: 'ai-bot',
                    senderName: 'HelpOS™',
                    senderType: 'bot',
                    message: `🔇 **User Muted**\n\n**${targetUsername}** has been muted for ${duration} minutes.\n\nThey can still read messages but cannot send messages during this time.`,
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
                  
                  const transferMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: null,
                    senderName: 'System',
                    senderType: 'system',
                    message: `*** ${displayName} is transferring this ticket to ${targetStaff}...`,
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
