import { useState, useRef, useEffect } from "react";
import { AppShellMobile } from "@/components/mobile/AppShellMobile";
import { MessageBubble, TypingIndicator, ParticipantDrawer, MacrosDrawer } from "@/components/chat";
import { useChatroomWebSocket } from "@/hooks/use-chatroom-websocket";
import { useNavigationProtection } from "@/hooks/use-navigation-protection";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Users, Zap, Send, Paperclip, Loader2, X, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// Available conversations for selection
const AVAILABLE_CONVERSATIONS = [
  { id: 'main-chatroom-workforceos', name: 'General Support', description: 'Main support room' },
  { id: 'premium-support', name: 'Premium Support', description: 'For premium members' },
  { id: 'technical-support', name: 'Technical Help', description: 'Technical issues' },
];

export default function PremiumMobileChat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messageText, setMessageText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [macrosOpen, setMacrosOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState('main-chatroom-workforceos');
  const [conversationSelectorOpen, setConversationSelectorOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      : user?.email?.split('@')[0] || 'User',
    selectedConversationId
  );

  const selectedConversation = AVAILABLE_CONVERSATIONS.find(c => c.id === selectedConversationId) 
    || AVAILABLE_CONVERSATIONS[0];

  // Navigation protection - prevent accidental disconnects from live chat
  useNavigationProtection({
    currentRoute: '/premium-chat',
    shouldProtect: isConnected || messages.length > 0,
  });

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

  const handleSendMessage = async () => {
    if (!messageText.trim() && selectedFiles.length === 0) return;

    const senderName = user?.firstName && user?.lastName 
      ? `${user.firstName} ${user.lastName}` 
      : user?.email?.split('@')[0] || 'User';

    const senderType = isStaff ? 'support' : 'customer';

    // Upload files first if any
    if (selectedFiles.length > 0) {
      const uploadedUrls = await uploadFiles();
      if (uploadedUrls.length > 0) {
        // Add file URLs to message (no emoji - violates guidelines)
        const fileMessage = uploadedUrls.map((url, i) => `File ${i + 1}: ${url}`).join('\n');
        const fullMessage = messageText.trim() 
          ? `${messageText.trim()}\n\nAttached files:\n${fileMessage}`
          : `Attached files:\n${fileMessage}`;
        
        sendMessage(fullMessage, senderName, senderType);
      }
      setSelectedFiles([]);
    } else {
      sendMessage(messageText.trim(), senderName, senderType);
    }
    
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    if (selectedFiles.length + files.length > 5) {
      toast({
        title: "Too many files",
        description: "Maximum 5 files per message",
        variant: "destructive",
      });
      return;
    }

    const validFiles = files.filter(file => {
      if (file.size > 25 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds 25MB limit`,
          variant: "destructive",
        });
        return false;
      }
      return true;
    });

    setSelectedFiles([...selectedFiles, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const uploadFiles = async (): Promise<string[]> => {
    if (selectedFiles.length === 0) return [];
    
    setIsUploading(true);
    try {
      const formData = new FormData();
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });
      formData.append('conversationId', selectedConversationId);
      formData.append('isPublic', 'false');

      const response = await fetch('/api/chat/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const data = await response.json() as { uploadedFiles: Array<{ id: string; filename: string; storageUrl: string }> };
      return data.uploadedFiles.map((f: { storageUrl: string }) => f.storageUrl);
    } catch (error) {
      console.error('File upload error:', error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload files",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsUploading(false);
    }
  };

  const displayParticipants = conversationParticipants.get(selectedConversationId) || onlineUsers;

  const handleConversationSwitch = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    setConversationSelectorOpen(false);
    toast({
      title: "Switched conversation",
      description: AVAILABLE_CONVERSATIONS.find(c => c.id === conversationId)?.name,
    });
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <AppShellMobile title="Premium Chat" showBack={true}>
        {/* Action Buttons */}
        <div className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b-2 border-slate-200 dark:border-slate-800 px-4 py-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Quick Actions
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConversationSelectorOpen(true)}
                className="h-8 px-3 gap-1.5"
                data-testid="button-change-room"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="text-xs">Rooms</span>
              </Button>
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
          
          {/* Current Room Badge */}
          <div className="flex items-center justify-center">
            <Badge 
              variant="outline" 
              className="text-xs px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
              data-testid="badge-current-room"
            >
              <MessageSquare className="h-3 w-3 mr-1" />
              {selectedConversation.name}
            </Badge>
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
          {/* Selected Files Display */}
          {selectedFiles.length > 0 && (
            <div className="mb-3 space-y-2">
              {selectedFiles.map((file, index) => (
                <div 
                  key={index}
                  className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-800 rounded-lg"
                  data-testid={`file-preview-${index}`}
                >
                  <Paperclip className="h-4 w-4 text-slate-500" />
                  <span className="text-sm text-slate-700 dark:text-slate-300 flex-1 truncate">
                    {file.name}
                  </span>
                  <span className="text-xs text-slate-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => removeFile(index)}
                    data-testid={`button-remove-file-${index}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

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
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.rar"
                onChange={handleFileSelect}
                className="hidden"
                data-testid="input-file"
              />
              <Button
                size="icon"
                variant="ghost"
                className="absolute bottom-1 right-1 h-8 w-8"
                data-testid="button-attach"
                onClick={() => fileInputRef.current?.click()}
                disabled={selectedFiles.length >= 5}
              >
                <Paperclip className="h-4 w-4 text-slate-500" />
              </Button>
            </div>
            
            <Button
              onClick={handleSendMessage}
              disabled={(!messageText.trim() && selectedFiles.length === 0) || !isConnected || isUploading}
              className="h-11 w-11 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
              size="icon"
              data-testid="button-send"
            >
              {!isConnected || isUploading ? (
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

      {/* Conversation Selector */}
      <Sheet open={conversationSelectorOpen} onOpenChange={setConversationSelectorOpen}>
        <SheetContent side="bottom" className="h-[60vh] rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-slate-900 dark:text-slate-100">Select Chat Room</SheetTitle>
            <SheetDescription className="text-slate-600 dark:text-slate-400">
              Choose a conversation to join
            </SheetDescription>
          </SheetHeader>
          
          <div className="mt-6 space-y-3">
            {AVAILABLE_CONVERSATIONS.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => handleConversationSwitch(conversation.id)}
                className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                  selectedConversationId === conversation.id
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700'
                }`}
                data-testid={`button-select-room-${conversation.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${
                    selectedConversationId === conversation.id
                      ? 'bg-emerald-100 dark:bg-emerald-900/40'
                      : 'bg-slate-100 dark:bg-slate-700'
                  }`}>
                    <MessageSquare className={`h-5 w-5 ${
                      selectedConversationId === conversation.id
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`} />
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-semibold text-sm ${
                      selectedConversationId === conversation.id
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-slate-900 dark:text-slate-100'
                    }`}>
                      {conversation.name}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      {conversation.description}
                    </p>
                  </div>
                  {selectedConversationId === conversation.id && (
                    <div className="flex items-center">
                      <Badge variant="default" className="bg-emerald-600 text-white text-[10px] px-2 py-0.5">
                        Active
                      </Badge>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
