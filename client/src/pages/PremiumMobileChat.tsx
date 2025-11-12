import { useState, useRef, useEffect } from "react";
import { AppShellMobile } from "@/components/mobile/AppShellMobile";
import { MessageBubble, TypingIndicator, ParticipantDrawer, MacrosDrawer } from "@/components/chat";
import { useChatroomWebSocket } from "@/hooks/use-chatroom-websocket";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Users, Zap, Send, Paperclip, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PremiumMobileChat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messageText, setMessageText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [macrosOpen, setMacrosOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  const isStaff = user?.platformRole &&
    ['root_admin', 'deputy_admin', 'support_manager', 'sysop', 'support_agent'].includes(user.platformRole);

  const {
    messages,
    isConnected,
    error,
    typingUserInfo,
    onlineUsers,
    sendMessage,
    sendTyping,
    readReceipts,
    conversationParticipants,
  } = useChatroomWebSocket(
    user?.id,
    user?.firstName && user?.lastName 
      ? `${user.firstName} ${user.lastName}` 
      : user?.email?.split('@')[0] || 'User'
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleTyping = (text: string) => {
    setMessageText(text);
    
    if (!isTyping && text.length > 0) {
      setIsTyping(true);
      sendTyping(true);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      sendTyping(false);
    }, 2000);
  };

  const handleSendMessage = () => {
    if (!messageText.trim()) return;

    const senderName = user?.firstName && user?.lastName 
      ? `${user.firstName} ${user.lastName}` 
      : user?.email?.split('@')[0] || 'User';

    const senderType = isStaff ? 'support' : 'customer';

    sendMessage(messageText.trim(), senderName, senderType);
    setMessageText("");
    
    if (isTyping) {
      setIsTyping(false);
      sendTyping(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  const handleMacroSelect = (macroText: string) => {
    setMessageText(macroText);
    toast({
      title: "Macro inserted",
      description: "Review and send when ready",
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const displayParticipants = conversationParticipants.get('main-chatroom-workforceos') || onlineUsers;

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <AppShellMobile title="Premium Chat" showBack={true}>
        {/* Action Buttons */}
        <div className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b-2 border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Quick Actions
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setParticipantsOpen(true)}
              className="h-8 px-3 gap-1.5"
              data-testid="button-participants"
            >
              <Users className="h-3.5 w-3.5" />
              <span className="text-xs">Participants</span>
            </Button>
            {isStaff && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMacrosOpen(true)}
                className="h-8 px-3 gap-1.5 relative"
                data-testid="button-macros"
              >
                <Zap className="h-3.5 w-3.5" />
                <span className="text-xs">Macros</span>
              </Button>
            )}
          </div>
        </div>

        {/* Connection Status Banner */}
        {!isConnected && (
          <div className="px-4 py-2 bg-amber-100 dark:bg-amber-900/30 border-b-2 border-amber-200 dark:border-amber-800" data-testid="banner-disconnected">
            <p className="text-xs text-amber-800 dark:text-amber-300 text-center font-medium">
              Reconnecting to chat...
            </p>
          </div>
        )}

        {error && (
          <div className="px-4 py-2 bg-red-100 dark:bg-red-900/30 border-b-2 border-red-200 dark:border-red-800" data-testid="banner-error">
            <p className="text-xs text-red-800 dark:text-red-300 text-center font-medium">
              {error}
            </p>
          </div>
        )}

        {/* Messages Container */}
        <div 
          className="flex-1 overflow-y-auto px-4 py-4 space-y-1" 
          data-testid="div-messages-container"
        >
          {messages.length === 0 && isConnected && (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-100 to-cyan-100 dark:from-emerald-900/30 dark:to-cyan-900/30 flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
                Welcome to Premium Chat
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-xs">
                Start a conversation with support or your team
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isCurrentUser={msg.senderId === user?.id}
              readReceipt={readReceipts.get(msg.id)}
              showAvatar={true}
            />
          ))}

          {typingUserInfo && (
            <TypingIndicator 
              userName={typingUserInfo.name} 
              isStaff={typingUserInfo.isStaff}
            />
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        <div className="border-t-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <Textarea
                value={messageText}
                onChange={(e) => handleTyping(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Type a message..."
                className="min-h-[44px] max-h-32 resize-none border-2 border-slate-200 dark:border-slate-700 rounded-2xl pr-10"
                rows={1}
                data-testid="textarea-message"
              />
              <Button
                size="icon"
                variant="ghost"
                className="absolute bottom-1 right-1 h-8 w-8"
                data-testid="button-attach"
                onClick={() => {
                  toast({
                    title: "File uploads coming soon",
                    description: "Premium file sharing will be available soon",
                  });
                }}
              >
                <Paperclip className="h-4 w-4 text-slate-500" />
              </Button>
            </div>
            
            <Button
              onClick={handleSendMessage}
              disabled={!messageText.trim() || !isConnected}
              className="h-11 w-11 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
              size="icon"
              data-testid="button-send"
            >
              {!isConnected ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>

          {/* Online Users Count */}
          <div className="flex items-center justify-center gap-2 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-slate-600 dark:text-slate-400" data-testid="text-online-count">
                {onlineUsers.length} online
              </span>
            </div>
            {isStaff && (
              <>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <Badge 
                  variant="secondary" 
                  className="h-4 px-1.5 text-[10px] bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                  data-testid="badge-support-agent"
                >
                  SUPPORT AGENT
                </Badge>
              </>
            )}
          </div>
        </div>
      </AppShellMobile>

      {/* Drawers */}
      <ParticipantDrawer
        open={participantsOpen}
        onOpenChange={setParticipantsOpen}
        participants={displayParticipants}
        conversationTitle="Premium Chat"
      />

      {isStaff && (
        <MacrosDrawer
          open={macrosOpen}
          onOpenChange={setMacrosOpen}
          onSelectMacro={handleMacroSelect}
        />
      )}
    </div>
  );
}
