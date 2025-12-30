import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useEmployee } from "@/hooks/useEmployee";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageCircle, Plus, Search, Loader2, ArrowLeft, Headphones } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { isSupportRole } from "@/config/chatroomsConfig";

interface ChatRoom {
  roomId?: string;
  name?: string;
  slug?: string;
  type?: string;
  participantsCount?: number;
  id?: string;
  subject?: string;
  conversationType?: string;
  visibility?: string;
  status: string;
  isParticipant?: boolean;
  lastMessageAt?: string;
  createdAt?: string;
  isPlatformOwned?: boolean;
  lastMessage?: string;
  unreadCount?: number;
  workspaceName?: string;
}

const normalizeRoom = (room: any): ChatRoom => {
  return {
    roomId: room.roomId || room.id,
    id: room.roomId || room.id,
    name: room.name || room.subject,
    subject: room.name || room.subject,
    slug: room.slug,
    type: room.type || room.conversationType,
    conversationType: room.conversationType,
    participantsCount: room.participantsCount,
    status: room.status,
    isParticipant: room.isParticipant,
    lastMessageAt: room.lastMessageAt,
    createdAt: room.createdAt,
    visibility: room.visibility,
    isPlatformOwned: room.isPlatformOwned,
    lastMessage: room.lastMessage,
    unreadCount: room.unreadCount || 0,
    workspaceName: room.workspaceName,
  };
};

const DEFAULT_HELPDESK_ROOM: ChatRoom = {
  roomId: 'helpdesk',
  id: 'helpdesk',
  name: 'Help Desk',
  subject: 'Help Desk',
  slug: 'helpdesk',
  type: 'support',
  conversationType: 'dm_support',
  participantsCount: 2,
  status: 'open',
  isParticipant: false,
  visibility: 'public',
  isPlatformOwned: true,
  lastMessageAt: new Date().toISOString(),
  lastMessage: 'Tap to chat with Trinity AI',
  unreadCount: 0,
};

function CreateRoomDialog({ open, onOpenChange, onSuccess }: { open: boolean; onOpenChange: (o: boolean) => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [roomType, setRoomType] = useState("work");

  const createRoomMutation = useMutation({
    mutationFn: async (data: { subject: string; conversationType: string; visibility: string }) => {
      return await apiRequest('POST', '/api/chat/rooms', data);
    },
    onSuccess: () => {
      toast({ title: "Room Created", description: "Your chatroom is now live" });
      queryClient.invalidateQueries({ queryKey: ['/api/chat/rooms'] });
      onSuccess();
      onOpenChange(false);
      setSubject("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create room", variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!subject.trim()) {
      toast({ title: "Required", description: "Please enter a room name", variant: "destructive" });
      return;
    }
    createRoomMutation.mutate({
      subject: subject.trim(),
      conversationType: roomType === 'shift' ? 'shift_chat' : 'open_chat',
      visibility: 'workspace',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            New Chat
          </DialogTitle>
          <DialogDescription>
            Create a new group chat for your team
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="room-name">Chat Name</Label>
            <Input
              id="room-name"
              placeholder="e.g., Morning Team, Project Alpha"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="min-h-[44px]"
              data-testid="input-room-name"
            />
          </div>
          <div className="space-y-2">
            <Label>Chat Type</Label>
            <Select value={roomType} onValueChange={setRoomType}>
              <SelectTrigger className="min-h-[44px]" data-testid="select-room-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="work">Team Chat</SelectItem>
                <SelectItem value="shift">Shift Chat</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-[44px]">
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={createRoomMutation.isPending} className="min-h-[44px]" data-testid="button-create-room">
            {createRoomMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConversationItem({ room, onClick }: { room: ChatRoom; onClick: () => void }) {
  const isHelpDesk = room.slug === 'helpdesk';
  const hasUnread = (room.unreadCount || 0) > 0;
  
  const getAvatar = () => {
    if (isHelpDesk) {
      return (
        <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shrink-0">
          <Headphones className="h-6 w-6 text-primary-foreground" />
        </div>
      );
    }
    return (
      <Avatar className="w-12 h-12 shrink-0">
        <AvatarFallback className="bg-muted text-lg">
          {(room.name || 'C')[0].toUpperCase()}
        </AvatarFallback>
      </Avatar>
    );
  };

  const getTimeDisplay = () => {
    if (!room.lastMessageAt) return '';
    try {
      return formatDistanceToNow(new Date(room.lastMessageAt), { addSuffix: false });
    } catch {
      return '';
    }
  };

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover-elevate active-elevate-2 transition-colors border-b border-border/50 min-h-[72px] text-left"
      data-testid={`button-chat-${room.id}`}
    >
      {getAvatar()}
      
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <span className={`font-semibold truncate ${hasUnread ? 'text-foreground' : 'text-foreground/90'}`}>
            {room.name || 'Chat'}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {getTimeDisplay()}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className={`text-sm truncate ${hasUnread ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
            {room.lastMessage || (isHelpDesk ? 'Tap to chat with Trinity AI' : 'No messages yet')}
          </p>
          {hasUnread && (
            <Badge className="bg-primary text-primary-foreground min-w-[20px] h-5 text-xs px-1.5 shrink-0">
              {room.unreadCount}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

export default function Chatrooms() {
  const { user } = useAuth();
  const { employee } = useEmployee();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  
  const hasSupportRole = isSupportRole(user?.platformRole);
  const userWorkspaceId = employee?.workspaceId;

  const { data: roomsData, isLoading, error, refetch } = useQuery<{ rooms: ChatRoom[] }>({
    queryKey: ['/api/chat/rooms'],
    staleTime: 10000,
    refetchInterval: 15000,
  });

  const filteredRooms = useMemo(() => {
    let normalized = (roomsData?.rooms || []).map(normalizeRoom);
    
    const hasHelpDesk = normalized.some(r => r.slug === 'helpdesk' || r.id === 'helpdesk');
    if (!hasHelpDesk) {
      normalized = [DEFAULT_HELPDESK_ROOM, ...normalized];
    }
    
    // For non-support roles, show rooms they're participants of or their workspace rooms
    // Support roles see all rooms
    if (!hasSupportRole) {
      normalized = normalized.filter((r: ChatRoom) => 
        r.slug === 'helpdesk' || r.isParticipant || r.status === 'open'
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      normalized = normalized.filter((r: ChatRoom) => {
        const name = (r.name || r.subject || '').toLowerCase();
        return name.includes(query);
      });
    }

    normalized.sort((a, b) => {
      if (a.slug === 'helpdesk') return -1;
      if (b.slug === 'helpdesk') return 1;
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });

    return normalized;
  }, [roomsData?.rooms, searchQuery, hasSupportRole, userWorkspaceId]);

  const handleOpenChat = (room: ChatRoom) => {
    if (room.slug === 'helpdesk') {
      setLocation('/helpdesk');
    } else {
      setLocation(`/chat/${room.id || room.roomId}`);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="flex items-center gap-2 px-2 py-2 border-b bg-card shrink-0">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setLocation("/dashboard")}
          data-testid="button-back"
          className="h-11 w-11 shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        
        <h1 className="text-lg font-semibold flex-1">Chats</h1>
        
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setCreateDialogOpen(true)}
          data-testid="button-new-chat"
          className="h-11 w-11"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </header>

      <div className="px-3 py-2 border-b bg-card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 min-h-[44px] bg-muted/50 border-0"
            data-testid="input-search"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="text-center py-12 px-4">
            <p className="text-muted-foreground">Unable to load chats</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3 min-h-[44px]">
              Try Again
            </Button>
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="text-center py-12 px-4">
            <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No chats found</p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setCreateDialogOpen(true)} 
              className="mt-3 min-h-[44px]"
              data-testid="button-start-chat"
            >
              <Plus className="h-4 w-4 mr-2" />
              Start a new chat
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {filteredRooms.map((room) => (
              <ConversationItem
                key={room.id || room.roomId}
                room={room}
                onClick={() => handleOpenChat(room)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      <CreateRoomDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => refetch()}
      />
    </div>
  );
}
