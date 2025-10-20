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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MobileLoading } from "@/components/mobile-loading";
import {
  MessageSquare, Plus, Users, Hash, Lock, Unlock, Search,
  Send, MoreVertical, Settings, UserPlus, Shield, Archive,
  Bell, BellOff, Trash2, Edit, Pin, Sparkles, CheckCheck
} from "lucide-react";

interface ChatRoom {
  id: string;
  name: string;
  description?: string;
  type: "public" | "private" | "team";
  memberCount?: number;
  unreadCount?: number;
  lastMessage?: string;
  lastMessageAt?: string;
  isPinned?: boolean;
  isMuted?: boolean;
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  message: string;
  createdAt: string;
  isPrivateMessage?: boolean;
  recipientId?: string;
}

export default function CommunicationOS() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // New room form
  const [newRoom, setNewRoom] = useState({
    name: "",
    description: "",
    type: "public" as "public" | "private" | "team",
  });

  // Fetch user's workspace
  const { data: workspace } = useQuery({
    queryKey: ['/api/workspace'],
    enabled: !!user,
  });

  // Fetch all organization chat rooms
  const { data: rooms = [], isLoading: roomsLoading } = useQuery<ChatRoom[]>({
    queryKey: ['/api/chat/conversations'],
    enabled: !!workspace,
    select: (data: any[]) =>
      data.map((conv) => ({
        id: conv.id,
        name: conv.customerName || `Room ${conv.id.slice(0, 8)}`,
        description: conv.description,
        type: conv.type || "public",
        memberCount: conv.participantCount || 0,
        unreadCount: conv.unreadCount || 0,
        lastMessage: conv.lastMessage,
        lastMessageAt: conv.updatedAt,
        isPinned: false,
        isMuted: conv.isSilenced || false,
      })),
  });

  // Fetch messages for selected room
  const { data: messages = [], isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: ['/api/chat/conversations', selectedRoom, 'messages'],
    enabled: !!selectedRoom,
    refetchInterval: 3000, // Poll every 3 seconds for new messages
  });

  // Create new room mutation
  const createRoomMutation = useMutation({
    mutationFn: async (roomData: typeof newRoom) => {
      return await apiRequest('/api/chat/conversations', 'POST', {
        customerName: roomData.name,
        description: roomData.description,
        type: roomData.type,
        status: 'active',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'] });
      setShowCreateDialog(false);
      setNewRoom({ name: "", description: "", type: "public" });
      toast({
        title: "Room created",
        description: "Your new chat room is ready",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create room",
        variant: "destructive",
      });
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      return await apiRequest(`/api/chat/conversations/${selectedRoom}/messages`, 'POST', {
        message,
        senderName: `${user?.firstName} ${user?.lastName}`.trim() || user?.email,
        senderType: 'customer',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations', selectedRoom, 'messages'] });
      setMessageText("");
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

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedRoom) return;
    sendMessageMutation.mutate(messageText.trim());
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-select first room
  useEffect(() => {
    if (rooms.length > 0 && !selectedRoom) {
      setSelectedRoom(rooms[0].id);
    }
  }, [rooms, selectedRoom]);

  if (authLoading) {
    return <MobileLoading fullScreen message="Loading CommunicationOS™..." />;
  }

  const filteredRooms = rooms.filter((room) =>
    room.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentRoom = rooms.find((r) => r.id === selectedRoom);

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0">
      {/* Rooms Sidebar */}
      <div className="w-80 border-r flex flex-col bg-card">
        {/* Sidebar Header */}
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-lg">CommunicationOS™</h2>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowCreateDialog(true)}
              data-testid="button-create-room"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search rooms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-rooms"
            />
          </div>
        </div>

        {/* Rooms List */}
        <ScrollArea className="flex-1">
          {roomsLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No rooms found</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreateDialog(true)}
                className="mt-3"
              >
                <Plus className="h-3 w-3 mr-1" />
                Create First Room
              </Button>
            </div>
          ) : (
            <div className="p-2">
              {filteredRooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => setSelectedRoom(room.id)}
                  data-testid={`room-${room.id}`}
                  className={`w-full p-3 rounded-lg mb-1 text-left transition-colors ${
                    selectedRoom === room.id
                      ? "bg-primary/10 border border-primary/20"
                      : "hover-elevate"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                      {room.type === "private" ? (
                        <Lock className="h-5 w-5 text-white" />
                      ) : room.type === "team" ? (
                        <Users className="h-5 w-5 text-white" />
                      ) : (
                        <Hash className="h-5 w-5 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate">{room.name}</span>
                        {room.isPinned && <Pin className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                        {room.isMuted && <BellOff className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                      </div>
                      {room.lastMessage && (
                        <p className="text-xs text-muted-foreground truncate">
                          {room.lastMessage}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {room.memberCount || 0}
                        </span>
                        {(room.unreadCount || 0) > 0 && (
                          <Badge variant="default" className="h-5 px-1.5 text-xs">
                            {room.unreadCount}
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
      <div className="flex-1 flex flex-col bg-background">
        {!selectedRoom ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <MessageSquare className="h-16 w-16 mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">Select a room to start chatting</h3>
            <p className="text-sm">Choose from your organization's rooms on the left</p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="h-16 border-b px-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                  {currentRoom?.type === "private" ? (
                    <Lock className="h-5 w-5 text-white" />
                  ) : currentRoom?.type === "team" ? (
                    <Users className="h-5 w-5 text-white" />
                  ) : (
                    <Hash className="h-5 w-5 text-white" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold">{currentRoom?.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {currentRoom?.memberCount || 0} members
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowRoomSettings(true)}
                  data-testid="button-room-settings"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {messagesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-3">
                      <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                        <div className="h-16 bg-muted rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Sparkles className="h-12 w-12 mb-3 opacity-50" />
                  <p className="text-sm">No messages yet. Start the conversation!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => {
                    const isOwnMessage = msg.senderId === user?.id;
                    return (
                      <div key={msg.id} className={`flex gap-3 ${isOwnMessage ? "flex-row-reverse" : ""}`}>
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
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
                          </div>
                          <div
                            className={`p-3 rounded-lg ${
                              isOwnMessage
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
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
            <div className="p-4 border-t">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Textarea
                  placeholder={`Message #${currentRoom?.name || "room"}...`}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                  className="flex-1 min-h-[60px] max-h-[120px] resize-none"
                  data-testid="input-message"
                />
                <Button
                  type="submit"
                  disabled={!messageText.trim() || sendMessageMutation.isPending}
                  data-testid="button-send-message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
              <p className="text-xs text-muted-foreground mt-2">
                Press <kbd className="px-1 py-0.5 rounded bg-muted">Enter</kbd> to send, <kbd className="px-1 py-0.5 rounded bg-muted">Shift+Enter</kbd> for new line
              </p>
            </div>
          </>
        )}
      </div>

      {/* Create Room Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent data-testid="dialog-create-room">
          <DialogHeader>
            <DialogTitle>Create New Room</DialogTitle>
            <DialogDescription>
              Create a new chat room for your organization
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="room-name">Room Name *</Label>
              <Input
                id="room-name"
                placeholder="e.g., General, Marketing, Engineering"
                value={newRoom.name}
                onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
                data-testid="input-room-name"
              />
            </div>
            <div>
              <Label htmlFor="room-description">Description (Optional)</Label>
              <Textarea
                id="room-description"
                placeholder="What's this room about?"
                value={newRoom.description}
                onChange={(e) => setNewRoom({ ...newRoom, description: e.target.value })}
                data-testid="input-room-description"
              />
            </div>
            <div>
              <Label htmlFor="room-type">Room Type *</Label>
              <Select
                value={newRoom.type}
                onValueChange={(value: any) => setNewRoom({ ...newRoom, type: value })}
              >
                <SelectTrigger id="room-type" data-testid="select-room-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">
                    <div className="flex items-center gap-2">
                      <Hash className="h-4 w-4" />
                      <span>Public - Anyone in org can join</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="private">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      <span>Private - Invite only</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="team">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span>Team - Department specific</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createRoomMutation.mutate(newRoom)}
              disabled={!newRoom.name.trim() || createRoomMutation.isPending}
              data-testid="button-create-room-submit"
            >
              {createRoomMutation.isPending ? "Creating..." : "Create Room"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
