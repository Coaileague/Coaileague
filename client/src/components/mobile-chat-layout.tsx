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
import { WorkforceOSLogo } from "./workforceos-logo";
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
}

export function MobileChatLayout({
  messages,
  users,
  currentUser,
  onSendMessage,
  onCommandExecute,
}: MobileChatLayoutProps) {
  const [inputMessage, setInputMessage] = useState("");
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

  const renderMessage = (msg: ChatMessage) => {
    const isSystem = msg.senderType === 'system';
    const isBot = msg.senderType === 'bot';

    if (isSystem) {
      return (
        <div key={msg.id} className="py-1.5 px-3 text-xs text-muted-foreground italic text-center">
          {msg.message}
        </div>
      );
    }

    if (isBot) {
      return (
        <div key={msg.id} className="py-2 px-3 bg-blue-500/10 border-l-2 border-blue-500">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-3.5 h-3.5">
              <WorkforceOSLogo />
            </div>
            <span className="text-xs font-bold text-blue-400">{msg.senderName}</span>
          </div>
          <div className="text-sm whitespace-pre-wrap pl-5">{msg.message}</div>
        </div>
      );
    }

    return (
      <div key={msg.id} className="py-2 px-3">
        <div className="text-xs font-semibold mb-0.5" data-testid={`message-sender-${msg.id}`}>
          {msg.senderName}
        </div>
        <div className="text-sm whitespace-pre-wrap">{msg.message}</div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Mobile Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b bg-gradient-to-r from-blue-900 to-slate-900 text-white">
        <SupportCommandDrawer
          onCommandSelect={onCommandExecute}
          users={users}
          isStaff={currentUser.isStaff}
        />
        <div className="flex items-center gap-2 flex-1 justify-center">
          <div className="w-6 h-6">
            <WorkforceOSLogo />
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
