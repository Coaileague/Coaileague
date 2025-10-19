/**
 * Desktop IRC/MSN-Style Chat Layout
 * Full-featured chat with user sidebar, right-click menus, and rich UI
 */

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Send, Users, Settings } from "lucide-react";
import { UserContextMenu } from "./user-context-menu";
import { WorkforceOSLogo } from "./workforceos-logo";
import { StaffNameDisplay } from "./staff-name-display";
import { MessageTextWithIcons } from "./message-text-with-icons";
import type { ChatMessage } from "@shared/schema";

interface User {
  id: string;
  name: string;
  role: 'staff' | 'customer' | 'guest';
  platformRole?: string;
  isTyping?: boolean;
}

interface DesktopChatLayoutProps {
  messages: ChatMessage[];
  users: User[];
  currentUser: { id: string; name: string; isStaff: boolean };
  onSendMessage: (message: string) => void;
  onCommandExecute: (command: string) => void;
}

export function DesktopChatLayout({
  messages,
  users,
  currentUser,
  onSendMessage,
  onCommandExecute,
}: DesktopChatLayoutProps) {
  const [inputMessage, setInputMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showUserList, setShowUserList] = useState(true);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    
    onSendMessage(inputMessage);
    setInputMessage("");
  };

  const renderMessage = (msg: ChatMessage) => {
    const isSystem = msg.senderType === 'system' || msg.senderId === 'system' || msg.senderId === null;
    const isBot = msg.senderType === 'bot';
    const isOwnMessage = msg.senderId === currentUser.id;
    const isPrivate = (msg as any).isPrivateMessage || false;

    // SERVER/SYSTEM MESSAGE - Modern centered style without avatar
    if (isSystem) {
      return (
        <div key={msg.id} className="flex justify-center py-3 px-3">
          <div className="bg-gradient-to-r from-slate-800/40 via-slate-700/60 to-slate-800/40 rounded-lg px-4 py-2.5 max-w-[80%] border border-slate-600/30 backdrop-blur-sm">
            <div className="flex items-center gap-2 justify-center mb-1">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">System</span>
            </div>
            <div className="text-sm text-slate-200 text-center leading-relaxed">
              <MessageTextWithIcons text={msg.message} />
            </div>
          </div>
        </div>
      );
    }

    if (isBot) {
      return (
        <div key={msg.id} className="py-2 px-3 bg-blue-500/5 border-l-2 border-blue-500">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-4 h-4">
              <WorkforceOSLogo />
            </div>
            <StaffNameDisplay name={msg.senderName || 'HelpOS™'} className="text-xs font-bold text-blue-400" />
            <span className="text-[10px] text-muted-foreground">
              {new Date(msg.createdAt || new Date()).toLocaleTimeString()}
            </span>
          </div>
          <div className="text-sm whitespace-pre-wrap pl-6">{msg.message}</div>
        </div>
      );
    }

    return (
      <div
        key={msg.id}
        className={`py-2 px-3 hover-elevate ${isOwnMessage ? 'bg-accent/20' : ''}`}
      >
        <div className="flex items-start gap-2 flex-wrap">
          <UserContextMenu
            username={msg.senderName || 'Unknown'}
            isStaff={currentUser.isStaff}
            onCommandExecute={onCommandExecute}
          >
            <StaffNameDisplay
              name={msg.senderName || 'Unknown'}
              className="text-sm font-semibold cursor-pointer hover:underline"
            />
          </UserContextMenu>
          {/* Private Message Indicator with Glow Effect */}
          {isPrivate && (
            <span className="text-[10px] font-bold text-purple-400 px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/30 animate-pulse-glow" data-testid="badge-private-message-desktop">
              whispered
            </span>
          )}
          <span className="text-[10px] text-muted-foreground mt-0.5">
            {new Date(msg.createdAt || new Date()).toLocaleTimeString()}
          </span>
        </div>
        <div className="text-sm mt-1 ml-0 whitespace-pre-wrap">{msg.message}</div>
      </div>
    );
  };

  return (
    <div className="flex h-full bg-background">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8">
              <WorkforceOSLogo />
            </div>
            <div>
              <h2 className="text-lg font-bold" data-testid="chat-title">
                WorkforceOS Support
              </h2>
              <p className="text-xs text-muted-foreground">
                {users.length} {users.length === 1 ? 'user' : 'users'} online
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowUserList(!showUserList)}
              data-testid="button-toggle-userlist"
              title="Toggle User List"
            >
              <Users className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              data-testid="button-settings"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Messages Area */}
        <ScrollArea className="flex-1 p-0">
          <div className="min-h-full">
            {messages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t p-4 bg-card">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type a message... (use /help for commands)"
              className="flex-1"
              data-testid="input-message"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!inputMessage.trim()}
              data-testid="button-send"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
          <div className="mt-2 text-[10px] text-muted-foreground">
            Right-click usernames for quick actions • Slash commands available
          </div>
        </div>
      </div>

      {/* User List Sidebar (IRC-style) */}
      {showUserList && (
        <>
          <Separator orientation="vertical" />
          <div className="w-64 flex flex-col bg-card border-l">
            <div className="p-3 border-b">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Users className="w-4 h-4" />
                Online Users ({users.length})
              </h3>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-0.5">
                {users.map((user) => (
                  <UserContextMenu
                    key={user.id}
                    username={user.name}
                    isStaff={currentUser.isStaff}
                    onCommandExecute={onCommandExecute}
                  >
                    <div
                      className="px-3 py-2 rounded hover-elevate cursor-pointer flex items-center gap-2"
                      data-testid={`user-list-item-${user.id}`}
                    >
                      <div className={`w-2 h-2 rounded-full ${
                        user.role === 'staff' ? 'bg-blue-500' : 'bg-green-500'
                      }`} />
                      <span className="text-sm flex-1 truncate">{user.name}</span>
                      {user.isTyping && (
                        <span className="text-[10px] text-muted-foreground italic">
                          typing...
                        </span>
                      )}
                    </div>
                  </UserContextMenu>
                ))}
              </div>
            </ScrollArea>
          </div>
        </>
      )}
      
      {/* Glow animation for private message indicators */}
      <style>{`
        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 8px rgba(168, 85, 247, 0.4), 0 0 12px rgba(168, 85, 247, 0.2);
            border-color: rgba(168, 85, 247, 0.3);
          }
          50% {
            box-shadow: 0 0 16px rgba(168, 85, 247, 0.6), 0 0 24px rgba(168, 85, 247, 0.3);
            border-color: rgba(168, 85, 247, 0.5);
          }
        }
        .animate-pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
