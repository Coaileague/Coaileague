import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MobileLoading } from "@/components/mobile-loading";
import { MobilePageWrapper, MobilePageHeader } from "@/components/mobile-page-wrapper";
import { MobileBottomSheet } from "@/components/mobile-bottom-sheet";
import { useIsMobile, useMobile } from "@/hooks/use-mobile";
import { DataStreamIndicator } from "@/components/loading-indicators";
import {
  MessageSquare, Send, Search, UserPlus, MoreVertical,
  Eye, Sparkles, CheckCheck, Circle, Lock, Zap,
  Paperclip, X, FileText, Image as ImageIcon, Download, ArrowLeft
} from "lucide-react";
import { MessageAttachment } from "@/components/message-attachment";
import { CameraCapture } from "@/components/camera-capture";
import { usePasteImageHandler, PasteImageHint } from "@/components/paste-image-handler";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  recipientId: string;
  recipientName: string;
  recipientRole?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount?: number;
  isOnline?: boolean;
}

interface PrivateMessage {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  attachmentUrl?: string;
  attachmentName?: string;
}

export default function PrivateMessages() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { isMobile: isMobileDevice, isIOS } = useMobile();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const [showNewChatSheet, setShowNewChatSheet] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle pasted images with validation
  usePasteImageHandler({
    onImagePaste: (file) => {
      if (!validateFile(file)) return;
      setAttachedFile(file);
      toast({
        title: "Image pasted",
        description: `${file.name} ready to send`,
      });
    },
    enabled: !!selectedConversation,
  });

  // Fetch all conversations (DM threads)
  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<Conversation[]>({
    queryKey: ['/api/private-messages/conversations'],
    enabled: !!user,
    refetchInterval: 5000, // Poll for new messages
    select: (data: any[]) => {
      if (!Array.isArray(data)) return [];
      return data.map((conv) => ({
        id: conv.id,
        recipientId: conv.recipientId,
        recipientName: conv.recipientName || "User",
        recipientRole: conv.recipientRole,
        lastMessage: conv.lastMessage,
        lastMessageAt: conv.lastMessageAt,
        unreadCount: conv.unreadCount || 0,
        isOnline: conv.isOnline || false,
      }));
    },
  });

  // Fetch messages for selected conversation
  const { data: messages = [], isLoading: messagesLoading } = useQuery<PrivateMessage[]>({
    queryKey: ['/api/private-messages', selectedConversation],
    enabled: !!selectedConversation,
    refetchInterval: 3000, // Poll for new messages
    select: (data: any[]) => {
      if (!Array.isArray(data)) return [];
      return data.map((msg) => ({
        id: msg.id,
        senderId: msg.senderId,
        senderName: msg.senderName,
        recipientId: msg.recipientId,
        message: msg.message,
        createdAt: msg.createdAt,
        isRead: msg.isRead || false,
        attachmentUrl: msg.attachmentUrl,
        attachmentName: msg.attachmentName,
      }));
    },
  });

  // Search users for new conversation
  const { data: searchResults = [], isLoading: searchLoading } = useQuery({
    queryKey: ['/api/users/search', searchQuery],
    queryFn: async () => {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    enabled: searchQuery.length > 2,
    select: (data: any[]) => {
      if (!Array.isArray(data)) return [];
      return data.filter((u: any) => u.id !== user?.id); // Exclude self
    },
  });

  // Send private message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ recipientId, message, attachmentUrl, attachmentName }: { 
      recipientId: string; 
      message: string;
      attachmentUrl?: string;
      attachmentName?: string;
    }) => {
      return await apiRequest('/api/private-messages/send', 'POST', {
        recipientId,
        message,
        attachmentUrl,
        attachmentName,
        senderName: `${user?.firstName} ${user?.lastName}`.trim() || user?.email,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/private-messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/private-messages/conversations'] });
      setMessageText("");
      setAttachedFile(null);
      scrollToBottom();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    },
  });

  // Start new conversation
  const startConversationMutation = useMutation({
    mutationFn: async (recipientId: string) => {
      return await apiRequest('/api/private-messages/start', 'POST', { recipientId });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/private-messages/conversations'] });
      setSelectedConversation(data.conversationId);
      setShowNewChatDialog(false);
      setSearchQuery("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start conversation",
        variant: "destructive",
      });
    },
  });

  // Mark messages as read
  const markAsReadMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      return await apiRequest(`/api/private-messages/${conversationId}/mark-read`, 'POST', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/private-messages/conversations'] });
    },
  });

  // Centralized file validation (max 10MB, allowed types)
  const validateFile = (file: File): boolean => {
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum file size is 10MB",
        variant: "destructive",
      });
      return false;
    }

    // Check file type (including camera formats like HEIC/HEIF)
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
      'image/bmp', 'image/svg+xml',
      'application/pdf', 'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Supported: images, PDF, Word documents, text files",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!validateFile(file)) return;
    setAttachedFile(file);
  };

  const handleRemoveAttachment = () => {
    setAttachedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadFile = async (file: File): Promise<{ url: string; name: string } | null> => {
    try {
      setUploadingFile(true);
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/private-messages/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      return {
        url: data.fileUrl,
        name: data.fileName,
      };
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Could not upload file",
        variant: "destructive",
      });
      return null;
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!messageText.trim() && !attachedFile) || !selectedConversation) return;

    const conversation = conversations.find((c) => c.id === selectedConversation);
    if (!conversation) return;

    let attachmentUrl: string | undefined;
    let attachmentName: string | undefined;

    // Upload file if attached
    if (attachedFile) {
      const result = await uploadFile(attachedFile);
      if (result) {
        attachmentUrl = result.url;
        attachmentName = result.name;
      } else {
        return; // Don't send message if file upload failed
      }
    }

    sendMessageMutation.mutate({
      recipientId: conversation.recipientId,
      message: messageText.trim() || '[File attached]',
      attachmentUrl,
      attachmentName,
    });
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Mark as read when opening conversation
  useEffect(() => {
    if (selectedConversation) {
      markAsReadMutation.mutate(selectedConversation);
    }
  }, [selectedConversation]);

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/private-messages/conversations'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/private-messages', selectedConversation] }),
    ]);
  };

  if (authLoading) {
    return <MobileLoading fullScreen message="Loading Messages..." />;
  }

  const filteredConversations = conversations.filter((conv) =>
    conv.recipientName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentConversation = conversations.find((c) => c.id === selectedConversation);

  // Mobile: show conversation list OR chat, Desktop: show both
  const showConversationsList = !isMobileDevice || !selectedConversation;
  const showChatArea = !isMobileDevice || selectedConversation;

  const pageContent = (
    <div className="flex h-[calc(100vh-4rem)] gap-0">
      {/* Conversations Sidebar */}
      <div className={cn(
        "flex flex-col bg-card border-r",
        isMobileDevice ? "w-full" : "w-80",
        !showConversationsList && "hidden"
      )}>
        {/* Sidebar Header */}
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                <Lock className="h-4 w-4 text-white" />
              </div>
              <h2 className="font-semibold text-lg">Private Messages</h2>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => isMobileDevice ? setShowNewChatSheet(true) : setShowNewChatDialog(true)}
              className="mobile-touch-target"
              data-testid="button-new-chat"
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-conversations"
            />
          </div>
        </div>

        {/* Conversations List */}
        <ScrollArea className="flex-1">
          {conversationsLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm mb-2">No conversations yet</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNewChatDialog(true)}
              >
                <UserPlus className="h-3 w-3 mr-1" />
                Start New Chat
              </Button>
            </div>
          ) : (
            <div className="p-2">
              {filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv.id)}
                  data-testid={`conversation-${conv.id}`}
                  className={`w-full p-3 rounded-lg mb-1 text-left transition-colors ${
                    selectedConversation === conv.id
                      ? "bg-purple-500/10 border border-purple-500/20"
                      : "hover-elevate"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="text-xs bg-gradient-to-br from-purple-500 to-pink-600 text-white">
                          {conv.recipientName.split(" ").map((n) => n[0]).join("").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {conv.isOnline && (
                        <Circle className="absolute bottom-0 right-0 h-3 w-3 fill-green-500 text-green-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate">{conv.recipientName}</span>
                        <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-purple-500/20 text-purple-700 dark:text-purple-300">
                          whispered
                        </Badge>
                      </div>
                      {conv.lastMessage && (
                        <p className="text-xs text-muted-foreground truncate">
                          {conv.lastMessage}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        {conv.lastMessageAt && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(conv.lastMessageAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                        {(conv.unreadCount ?? 0) > 0 && (
                          <Badge variant="default" className="h-5 px-1.5 text-xs bg-purple-600">
                            {conv.unreadCount}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className={cn(
        "flex-1 flex flex-col bg-background",
        !showChatArea && "hidden"
      )}>
        {!selectedConversation ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground px-4">
            <Lock className="h-12 sm:h-16 w-12 sm:w-16 mb-4 opacity-50" />
            <h3 className="text-base sm:text-lg font-medium mb-2 text-center">Select a conversation</h3>
            <p className="text-xs sm:text-sm text-center">Choose a private chat or start a new one</p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className={cn(
              "h-16 border-b px-4 flex items-center justify-between bg-purple-500/5",
              isIOS && "mobile-safe-area-top"
            )}>
              <div className="flex items-center gap-3">
                {/* Mobile Back Button */}
                {isMobileDevice && (
                  <button
                    onClick={() => setSelectedConversation(null)}
                    className="mobile-touch-target p-2 -ml-2 hover-elevate active-elevate-2 rounded-lg mr-1"
                    data-testid="button-back-to-list"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                )}
                <div className="relative">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="text-xs bg-gradient-to-br from-purple-500 to-pink-600 text-white">
                      {currentConversation?.recipientName.split(" ").map((n) => n[0]).join("").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {currentConversation?.isOnline && (
                    <Circle className="absolute bottom-0 right-0 h-3 w-3 fill-green-500 text-green-500" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold">{currentConversation?.recipientName}</h3>
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-purple-500/20 text-purple-700 dark:text-purple-300">
                      <Lock className="h-2.5 w-2.5 mr-1" />
                      whispered
                    </Badge>
                    {currentConversation?.recipientRole && (
                      <Badge variant="outline" className="h-5 px-1.5 text-xs">
                        {currentConversation.recipientRole}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <Button size="icon" variant="ghost" data-testid="button-conversation-options">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4 bg-purple-500/[0.02]">
              {messagesLoading ? (
                <div className="flex flex-col items-center justify-center h-full space-y-4">
                  <DataStreamIndicator progress={75} height="h-32" />
                  <p className="text-sm text-muted-foreground">Loading messages...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Sparkles className="h-12 w-12 mb-3 opacity-50" />
                  <p className="text-sm">Start your private conversation</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => {
                    const isOwnMessage = msg.senderId === user?.id;
                    return (
                      <div key={msg.id} className={`flex gap-3 ${isOwnMessage ? "flex-row-reverse" : ""}`}>
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className={`text-xs ${
                            isOwnMessage 
                              ? "bg-purple-600 text-white" 
                              : "bg-gradient-to-br from-purple-500 to-pink-600 text-white"
                          }`}>
                            {msg.senderName.split(" ").map((n) => n[0]).join("").toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className={`flex-1 max-w-[70%] ${isOwnMessage ? "items-end" : ""}`}>
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="text-sm font-medium">{msg.senderName}</span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(msg.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {msg.isRead && isOwnMessage && (
                              <CheckCheck className="h-3 w-3 text-purple-500" />
                            )}
                          </div>
                          <div
                            className={`p-3 rounded-lg ${
                              isOwnMessage
                                ? "bg-purple-600 text-white"
                                : "bg-purple-100 dark:bg-purple-950/50 border border-purple-200/50 dark:border-purple-800/50"
                            }`}
                          >
                            {msg.attachmentUrl && (
                              <div className="mb-2">
                                <MessageAttachment
                                  url={msg.attachmentUrl}
                                  name={msg.attachmentName}
                                />
                              </div>
                            )}
                            {msg.message && msg.message !== '[File attached]' && (
                              <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Message Input */}
            <div className="p-4 border-t bg-purple-500/5">
              {/* Attachment Preview */}
              {attachedFile && (
                <div className="mb-3 flex items-center gap-2 p-2 bg-purple-100 dark:bg-purple-950/50 border border-purple-200/50 dark:border-purple-800/50 rounded-lg">
                  {attachedFile.type.startsWith('image/') ? (
                    <ImageIcon className="h-4 w-4 text-purple-600" />
                  ) : (
                    <FileText className="h-4 w-4 text-purple-600" />
                  )}
                  <span className="text-sm flex-1 truncate">{attachedFile.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {(attachedFile.size / 1024).toFixed(1)} KB
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleRemoveAttachment}
                    className="h-6 w-6"
                    data-testid="button-remove-attachment"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}

              <form onSubmit={handleSendMessage} className="flex gap-2">
                <div className="flex flex-col gap-2 flex-1">
                  <Textarea
                    placeholder="Send a private message..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                    className="min-h-[60px] max-h-[120px] resize-none"
                    data-testid="input-message"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileSelect}
                    className="hidden"
                    accept="image/*,application/pdf,.doc,.docx,.txt"
                    data-testid="input-file"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile}
                    data-testid="button-attach-file"
                    title="Attach file"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <CameraCapture
                    onCapture={(file) => {
                      if (!validateFile(file)) return;
                      setAttachedFile(file);
                      toast({
                        title: "Photo captured",
                        description: `${file.name} ready to send`,
                      });
                    }}
                  />
                  <Button
                    type="submit"
                    disabled={(!messageText.trim() && !attachedFile) || sendMessageMutation.isPending || uploadingFile}
                    data-testid="button-send-message"
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {uploadingFile ? (
                      <DataStreamIndicator progress={50} height="h-4" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </form>
              <div className="flex items-center justify-between gap-2 mt-2">
                <div className="flex items-center gap-2">
                  <Lock className="h-3 w-3 text-purple-500" />
                  <p className="text-xs text-muted-foreground">
                    End-to-end encrypted · Only you and {currentConversation?.recipientName} can see these messages
                  </p>
                </div>
                <PasteImageHint show={!!selectedConversation} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* New Chat Dialog (Desktop) */}
      <Dialog open={showNewChatDialog && !isMobileDevice} onOpenChange={setShowNewChatDialog}>
        <DialogContent data-testid="dialog-new-chat">
          <DialogHeader>
            <DialogTitle>Start New Private Chat</DialogTitle>
            <DialogDescription>
              Search for a user to start a private conversation
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-users"
              />
            </div>

            {searchQuery.length > 2 && (
              <ScrollArea className="h-[300px]">
                {searchLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Eye className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No users found</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {searchResults.map((result: any) => (
                      <button
                        key={result.id}
                        onClick={() => startConversationMutation.mutate(result.id)}
                        disabled={startConversationMutation.isPending}
                        className="w-full p-3 rounded-lg hover-elevate text-left"
                        data-testid={`user-${result.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="text-xs">
                              {result.firstName?.[0]}{result.lastName?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {result.firstName} {result.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {result.email}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            )}

            {searchQuery.length <= 2 && (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Type 3+ characters to search</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* New Chat Bottom Sheet (Mobile) */}
      <MobileBottomSheet 
        isOpen={showNewChatSheet} 
        onClose={() => setShowNewChatSheet(false)}
        title="Start New Private Chat"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 mobile-touch-target"
              data-testid="input-search-users-mobile"
            />
          </div>

          {searchQuery.length > 2 && (
            <div className="max-h-[400px] overflow-y-auto smooth-scroll">
              {searchLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Eye className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No users found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {searchResults.map((result: any) => (
                    <button
                      key={result.id}
                      onClick={() => {
                        startConversationMutation.mutate(result.id);
                        setShowNewChatSheet(false);
                      }}
                      disabled={startConversationMutation.isPending}
                      className="mobile-touch-target w-full p-3 rounded-lg hover-elevate active-elevate-2 text-left"
                      data-testid={`user-${result.id}-mobile`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="text-xs">
                            {result.firstName?.[0]}{result.lastName?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {result.firstName} {result.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {result.email}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {searchQuery.length <= 2 && (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Type 3+ characters to search</p>
            </div>
          )}
        </div>
      </MobileBottomSheet>
    </div>
  );

  if (isMobile) {
    return (
      <MobilePageWrapper 
        onRefresh={handleRefresh}
        enablePullToRefresh={true}
        withBottomNav={true}
      >
        {pageContent}
      </MobilePageWrapper>
    );
  }

  return pageContent;
}
