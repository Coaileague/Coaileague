import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { storage } from './storage';
import { formatUserDisplayName } from './utils/formatUserDisplayName';
import { generateGreeting } from './services/aiBot';
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
                  console.log(`${displayName} joined HelpDesk (platform staff - role: ${platformRole})`);
                } else {
                  console.log(`${displayName} joined HelpDesk (guest/customer)`);
                }
              } catch (staffCheckError) {
                // Error checking staff status - allow access anyway (degraded mode)
                console.error('Failed to verify staff status:', staffCheckError);
                console.log(`User ${payload.userId} joined HelpDesk (degraded mode)`);
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

            // BROADCAST SYSTEM ANNOUNCEMENT: User joined
            if (payload.conversationId === MAIN_ROOM_ID) {
              const joinAnnouncement = await storage.createChatMessage({
                conversationId: payload.conversationId,
                senderId: payload.userId,
                senderName: 'System',
                senderType: 'system',
                message: `${displayName} has joined the chatroom`,
                messageType: 'text',
                isSystemMessage: true,
              });

              // Broadcast join announcement to all clients
              const clients = conversationClients.get(payload.conversationId);
              if (clients) {
                const announcementPayload = JSON.stringify({
                  type: 'new_message',
                  message: joinAnnouncement,
                });
                clients.forEach((client) => {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(announcementPayload);
                  }
                });
              }

              // AI BOT: Send greeting message to new user
              try {
                const isGuest = !userInfo?.platformRole && !userInfo?.workspaceRole;
                const greeting = await generateGreeting(displayName, isGuest);
                
                const greetingMessage = await storage.createChatMessage({
                  conversationId: payload.conversationId,
                  senderId: 'ai-bot',
                  senderName: 'AI Assistant',
                  senderType: 'bot',
                  message: greeting,
                  messageType: 'text',
                });

                // Send greeting to all clients
                if (clients) {
                  const greetingPayload = JSON.stringify({
                    type: 'new_message',
                    message: greetingMessage,
                  });
                  clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                      client.send(greetingPayload);
                    }
                  });
                }
              } catch (greetingError) {
                console.error('Failed to send AI greeting:', greetingError);
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

            // AI BOT Q&A: DISABLED FOR NOW (just greeting on join)
            // User requested to only show greeting, no question answering yet
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
