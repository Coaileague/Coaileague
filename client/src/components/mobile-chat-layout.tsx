/**
 * Mobile-Optimized Chat Layout
 * Simplified interface with hamburger menu for commands
 */

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send } from "lucide-react";
import { SupportCommandDrawer } from "./support-command-drawer";
import { MobileUserActionSheet } from "./mobile-user-action-sheet";
import { CoAIleagueLogo } from "./workforceos-logo";
import { StaffNameDisplay } from "./staff-name-display";
import { MessageTextWithIcons } from "./message-text-with-icons";
import type { ChatMessage } from "@shared/schema";

interface User {
  id: string;
  name: string;
  role: 'staff' | 'customer' | 'guest';
  platformRole?: string;
}

interface MobileChatLayoutProps {
  messages: ChatMessage[];
  users: User[];
  currentUser: { id: string; name: string; isStaff: boolean };
  onSendMessage: (message: string) => void;
  onCommandExecute: (command: string) => void;
  // WebSocket command functions for IRC-style acknowledgments
  onKickUser?: (userId: string, reason?: string) => void;
  onSilenceUser?: (userId: string, duration?: number, reason?: string) => void;
  onGiveVoice?: (userId: string) => void;
}

export function MobileChatLayout({
  messages,
  users,
  currentUser,
  onSendMessage,
  onCommandExecute,
  onKickUser,
  onSilenceUser,
  onGiveVoice,
}: MobileChatLayoutProps) {
  const [inputMessage, setInputMessage] = useState("");
  const [selectedUser, setSelectedUser] = useState<{ username: string; userId: string; role: 'staff' | 'customer' | 'guest' } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const handleUsernameClick = (msg: ChatMessage) => {
    // Only staff can tap usernames to open action sheet
    if (!currentUser.isStaff || !msg.senderId) return;
    
    // Can't act on system or bot messages
    if (msg.senderType === 'system' || msg.senderType === 'bot') return;
    
    // Can't act on yourself
    if (msg.senderId === currentUser.id) return;

    const user = users.find(u => u.id === msg.senderId);
    if (user && msg.senderId) {
      setSelectedUser({
        username: msg.senderName,
        userId: msg.senderId,
        role: user.role,
      });
    }
  };

  const renderMessage = (msg: ChatMessage) => {
    const isSystem = msg.senderType === 'system';
    const isBot = msg.senderType === 'bot';
    const isClickable = currentUser.isStaff && !isSystem && !isBot && msg.senderId !== currentUser.id;

    if (isSystem) {
      return (
        <div key={msg.id} className="py-1.5 px-3 text-xs text-muted-foreground italic text-center">
          <MessageTextWithIcons text={msg.message} />
        </div>
      );
    }

    if (isBot) {
      return (
        <div key={msg.id} className="py-2 px-3 bg-blue-500/10 rounded-lg">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-3.5 h-3.5">
              <CoAIleagueLogo />
            </div>
            <StaffNameDisplay name={msg.senderName || 'HelpOS™'} className="text-xs font-bold text-blue-400" />
          </div>
          <div className="text-sm whitespace-pre-wrap pl-5">{msg.message}</div>
        </div>
      );
    }

    return (
      <div key={msg.id} className="py-2 px-3">
        <div 
          className={`text-xs font-semibold mb-0.5 ${isClickable ? 'text-blue-500 active:text-blue-600 cursor-pointer' : ''}`}
          data-testid={`message-sender-${msg.id}`}
          onClick={() => isClickable && handleUsernameClick(msg)}
        >
          <StaffNameDisplay name={msg.senderName || 'Unknown'} />
          {isClickable && <span className="ml-1 text-[10px] text-muted-foreground">(tap for actions)</span>}
        </div>
        <div className="text-sm whitespace-pre-wrap">{msg.message}</div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Mobile User Action Sheet */}
      <MobileUserActionSheet
        open={selectedUser !== null}
        onOpenChange={(open) => !open && setSelectedUser(null)}
        username={selectedUser?.username || ''}
        userId={selectedUser?.userId || ''}
        userRole={selectedUser?.role || 'guest'}
        isStaff={currentUser.isStaff}
        onCommandExecute={onCommandExecute}
        onKickUser={onKickUser}
        onSilenceUser={onSilenceUser}
        onGiveVoice={onGiveVoice}
      />

      {/* Mobile Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b bg-gradient-to-r from-blue-900 to-slate-900 text-white">
        <SupportCommandDrawer
          onCommandSelect={onCommandExecute}
          users={users}
          isStaff={currentUser.isStaff}
        />
        <div className="flex items-center gap-2 flex-1 justify-center">
          <div className="w-6 h-6">
            <CoAIleagueLogo />
          </div>
          <span className="text-sm font-bold">Support Chat</span>
        </div>
        <div className="w-10" /> {/* Spacer for centering */}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="min-h-full pb-2">
          {messages.map(renderMessage)}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t p-2 bg-card">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Message..."
            className="flex-1 text-sm"
            data-testid="input-message"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!inputMessage.trim()}
            data-testid="button-send"
            className="flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
