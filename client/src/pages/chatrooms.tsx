import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useEmployee } from "@/hooks/useEmployee";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { 
  MessageCircle, Users, Lock, Globe, Plus, Search, Loader2, Check, ArrowLeft, 
  RefreshCw, Crown, Building2, Wifi, Calendar, Briefcase, Video, MoreHorizontal,
  Pause, XCircle, Play, Archive, AlertTriangle, Eye, Filter, LayoutGrid, List
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { 
  ROOM_TYPES, 
  CHATROOM_UI, 
  ROOM_FILTERS, 
  OWNERSHIP_INDICATORS,
  LIVE_UPDATE_CONFIG,
  getRoomTypeConfig,
  getRoomOwnership,
  isSupportRole,
  type RoomOwnership
} from "@/config/chatroomsConfig";

interface ChatRoom {
  roomId?: string;
  name?: string;
  slug?: string;
  type?: string;
  participantsCount?: number;
  roomType?: string;
  workspaceId?: string;
  id?: string;
  subject?: string;
  conversationType?: string;
  visibility?: string;
  status: string;
  isParticipant?: boolean;
  participantRole?: string;
  lastMessageAt?: string;
  createdAt?: string;
  autoCloseAt?: string;
  isPlatformOwned?: boolean;
  createdBy?: string;
  workspaceLogo?: string;
  workspaceName?: string;
}

interface ChatRoomsResponse {
  rooms: ChatRoom[];
  [key: string]: any;
}

const normalizeRoom = (room: any): ChatRoom => {
  return {
    roomId: room.roomId || room.id,
    id: room.roomId || room.id,
    name: room.name || room.subject,
    subject: room.name || room.subject,
    slug: room.slug,
    type: room.type || (room.conversationType === 'shift_chat' ? 'shift' : room.conversationType),
    conversationType: room.conversationType,
    participantsCount: room.participantsCount,
    status: room.status,
    isParticipant: room.isParticipant,
    participantRole: room.participantRole,
    lastMessageAt: room.lastMessageAt,
    createdAt: room.createdAt,
    autoCloseAt: room.autoCloseAt,
    visibility: room.visibility,
    workspaceId: room.workspaceId,
    isPlatformOwned: room.isPlatformOwned,
    createdBy: room.createdBy,
    workspaceLogo: room.workspaceLogo,
    workspaceName: room.workspaceName,
  };
};

interface CreateRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function CreateRoomDialog({ open, onOpenChange, onSuccess }: CreateRoomDialogProps) {
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [roomType, setRoomType] = useState<string>("work");
  const [visibility, setVisibility] = useState<string>("workspace");
  const [duration, setDuration] = useState<string>("permanent");

  const createRoomMutation = useMutation({
    mutationFn: async (data: { subject: string; conversationType: string; visibility: string; autoCloseAt?: string }) => {
      return await apiRequest('POST', '/api/chat/rooms', data);
    },
    onSuccess: () => {
      toast({ title: "Room Created", description: "Your chatroom is now live" });
      queryClient.invalidateQueries({ queryKey: ['/api/chat/rooms'] });
      onSuccess();
      onOpenChange(false);
      setSubject("");
      setRoomType("work");
      setVisibility("workspace");
      setDuration("permanent");
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

    const typeMap: Record<string, string> = {
      'work': 'open_chat',
      'shift': 'shift_chat',
      'meeting': 'open_chat',
    };

    let autoCloseAt: string | undefined;
    if (duration !== 'permanent') {
      const hours = parseInt(duration);
      const closeDate = new Date();
      closeDate.setHours(closeDate.getHours() + hours);
      autoCloseAt = closeDate.toISOString();
    }

    createRoomMutation.mutate({
      subject: subject.trim(),
      conversationType: typeMap[roomType] || 'open_chat',
      visibility,
      autoCloseAt,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Create New Chatroom
          </DialogTitle>
          <DialogDescription>
            Start a conversation for your team, shift, or meeting
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="room-name">Room Name</Label>
            <Input
              id="room-name"
              placeholder="e.g., Morning Shift Chat, Team Standup"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              data-testid="input-room-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Room Type</Label>
              <Select value={roomType} onValueChange={setRoomType}>
                <SelectTrigger data-testid="select-room-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="work">
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-blue-500" />
                      Work
                    </div>
                  </SelectItem>
                  <SelectItem value="shift">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-amber-500" />
                      Shift
                    </div>
                  </SelectItem>
                  <SelectItem value="meeting">
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4 text-purple-500" />
                      Meeting
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger data-testid="select-visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workspace">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Organization
                    </div>
                  </SelectItem>
                  <SelectItem value="private">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      Private
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger data-testid="select-duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="permanent">Permanent</SelectItem>
                <SelectItem value="2">2 Hours (Shift)</SelectItem>
                <SelectItem value="4">4 Hours (Half Day)</SelectItem>
                <SelectItem value="8">8 Hours (Full Day)</SelectItem>
                <SelectItem value="24">24 Hours</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Temporary rooms auto-close after the selected duration
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={createRoomMutation.isPending} data-testid="button-create-room">
            {createRoomMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Create Room
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ModerateRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: ChatRoom | null;
  action: string;
  onSuccess: () => void;
}

function ModerateRoomDialog({ open, onOpenChange, room, action, onSuccess }: ModerateRoomDialogProps) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");

  const moderateMutation = useMutation({
    mutationFn: async (data: { action: string; reason: string }) => {
      return await apiRequest('POST', `/api/chat/rooms/${room?.id || room?.roomId}/moderate`, data);
    },
    onSuccess: (data: any) => {
      toast({ 
        title: "Action Complete", 
        description: data.message || `Room ${action} successful` 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/chat/rooms'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chat/rooms/platform/all'] });
      onSuccess();
      onOpenChange(false);
      setReason("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Action failed", variant: "destructive" });
    },
  });

  const actionLabels: Record<string, { title: string; description: string; icon: any; color: string }> = {
    suspend: { title: "Suspend Room", description: "Temporarily pause this room", icon: Pause, color: "text-amber-500" },
    close: { title: "Close Room", description: "Permanently close this room", icon: XCircle, color: "text-red-500" },
    reopen: { title: "Reopen Room", description: "Reactivate this room", icon: Play, color: "text-green-500" },
    archive: { title: "Archive Room", description: "Archive for records", icon: Archive, color: "text-slate-500" },
    warn: { title: "Send Warning", description: "Issue a warning to room", icon: AlertTriangle, color: "text-orange-500" },
  };

  const config = actionLabels[action] || actionLabels.warn;
  const ActionIcon = config.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${config.color}`}>
            <ActionIcon className="h-5 w-5" />
            {config.title}
          </DialogTitle>
          <DialogDescription>
            {config.description}: <strong>{room?.name || room?.subject}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              placeholder="Enter reason for this action..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[80px]"
              data-testid="input-moderation-reason"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            onClick={() => moderateMutation.mutate({ action, reason })} 
            disabled={moderateMutation.isPending}
            variant={action === 'close' ? 'destructive' : 'default'}
            data-testid="button-confirm-moderate"
          >
            {moderateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <ActionIcon className="h-4 w-4 mr-2" />
                Confirm
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoomOwnershipBadge({ ownership, workspaceLogo, workspaceName }: { 
  ownership: RoomOwnership; 
  workspaceLogo?: string;
  workspaceName?: string;
}) {
  const config = OWNERSHIP_INDICATORS[ownership];
  const Icon = config.icon;
  
  if (ownership === 'platform') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${config.className}`}>
            <Crown className="h-3 w-3" />
            <span className="hidden sm:inline">CoAIleague</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>{config.tooltip}</TooltipContent>
      </Tooltip>
    );
  }
  
  if (ownership === 'organization' && (workspaceLogo || workspaceName)) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5">
            <Avatar className="h-5 w-5">
              {workspaceLogo ? (
                <AvatarImage src={workspaceLogo} alt={workspaceName || 'Organization'} />
              ) : null}
              <AvatarFallback className="text-[8px] bg-emerald-500/20 text-emerald-500">
                {(workspaceName || 'ORG').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground hidden sm:inline max-w-[80px] truncate">
              {workspaceName}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent>{workspaceName || 'Organization channel'}</TooltipContent>
      </Tooltip>
    );
  }
  
  return null;
}

function RoomCard({ 
  room, 
  isSelected, 
  onSelect, 
  onJoin 
}: { 
  room: ChatRoom; 
  isSelected: boolean;
  onSelect: () => void;
  onJoin: () => void;
}) {
  const typeConfig = getRoomTypeConfig(room.type, room.conversationType);
  const ownership = getRoomOwnership(room);
  const Icon = typeConfig.icon;
  
  return (
    <Card
      className={`cursor-pointer transition-all hover-elevate ${
        isSelected ? 'ring-2 ring-primary shadow-md' : ''
      } ${room.isParticipant ? 'opacity-75' : ''}`}
      onClick={() => {
        if (!room.isParticipant) {
          onSelect();
        }
      }}
      data-testid={`card-room-${room.id || room.roomId}`}
    >
      <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
            <div className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${typeConfig.bgColor}`}>
              <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${typeConfig.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm sm:text-base line-clamp-2" data-testid={`text-room-name-${room.id}`}>
                {room.name || room.subject}
              </CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <RoomOwnershipBadge 
                  ownership={ownership} 
                  workspaceLogo={room.workspaceLogo}
                  workspaceName={room.workspaceName}
                />
              </div>
            </div>
          </div>
          {room.isParticipant && (
            <Badge variant="secondary" className="shrink-0 text-xs">
              <Check className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Joined</span>
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-2 sm:pt-3">
        <div className="space-y-2 sm:space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-1.5 sm:gap-2 flex-wrap">
              <Badge 
                variant={typeConfig.badgeVariant} 
                className={`text-xs ${typeConfig.bgColor} ${typeConfig.color} border ${typeConfig.borderColor}`}
                data-testid={`badge-type-${room.id}`}
              >
                {typeConfig.label}
              </Badge>
              {room.participantsCount !== undefined && (
                <Badge variant="outline" className="text-xs flex items-center gap-1" data-testid={`badge-participants-${room.id}`}>
                  <Users className="h-3 w-3" />
                  {room.participantsCount}
                </Badge>
              )}
              {room.visibility && (
                <Badge variant="outline" className="text-xs flex items-center gap-1">
                  {room.visibility === 'private' ? (
                    <Lock className="h-3 w-3" />
                  ) : (
                    <Globe className="h-3 w-3" />
                  )}
                  <span className="hidden sm:inline">{room.visibility}</span>
                </Badge>
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-between gap-2">
            {room.lastMessageAt ? (
              <p className="text-xs text-muted-foreground">
                Active {formatDistanceToNow(new Date(room.lastMessageAt), { addSuffix: true })}
              </p>
            ) : room.createdAt ? (
              <p className="text-xs text-muted-foreground">
                Created {formatDistanceToNow(new Date(room.createdAt), { addSuffix: true })}
              </p>
            ) : (
              <span />
            )}
            
            {!room.isParticipant && (
              <Button
                size="sm"
                variant={isSelected ? "default" : "outline"}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                }}
                data-testid={`button-select-room-${room.id || room.roomId}`}
                className="shrink-0 text-xs h-8"
              >
                {isSelected ? 'Selected' : 'Select'}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Chatrooms() {
  const { user } = useAuth();
  const { employee } = useEmployee();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [moderateDialogOpen, setModerateDialogOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [moderateAction, setModerateAction] = useState('');
  const [orgFilter, setOrgFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const hasSupportRole = isSupportRole(user?.platformRole);
  const userWorkspaceId = employee?.workspaceId;

  const { data: workspacesData } = useQuery<{ workspaces: { id: string; name: string; slug: string }[] }>({
    queryKey: ['/api/chat/rooms/workspaces'],
    enabled: hasSupportRole,
  });

  const { data: platformRoomsData, isLoading: platformLoading, refetch: refetchPlatform } = useQuery<{ rooms: ChatRoom[] }>({
    queryKey: ['/api/chat/rooms/platform/all', { orgFilter, categoryFilter, search: searchQuery, status: statusFilter }],
    enabled: hasSupportRole && viewMode === 'table',
    staleTime: LIVE_UPDATE_CONFIG.staleTime,
  });

  const handleModerate = (room: ChatRoom, action: string) => {
    setSelectedRoom(room);
    setModerateAction(action);
    setModerateDialogOpen(true);
  };

  const { data: roomsData, isLoading, error, refetch, isFetching } = useQuery<ChatRoomsResponse>({
    queryKey: ['/api/chat/rooms'],
    staleTime: LIVE_UPDATE_CONFIG.staleTime,
    refetchInterval: LIVE_UPDATE_CONFIG.enablePolling ? LIVE_UPDATE_CONFIG.refetchInterval : false,
  });

  const joinRoomsMutation = useMutation({
    mutationFn: async (roomIds: string[]) => {
      const response = await apiRequest('POST', '/api/chat/rooms/join-bulk', {
        roomIds,
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `Joined ${selectedRooms.size} room(s)`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/chat/rooms'] });
      setSelectedRooms(new Set());
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to join rooms",
        variant: "destructive",
      });
    },
  });

  const filteredRooms = useMemo(() => {
    if (!roomsData?.rooms) return [];

    let normalized = roomsData.rooms.map(normalizeRoom);
    let filtered = normalized;

    if (!hasSupportRole && userWorkspaceId) {
      filtered = filtered.filter((r: ChatRoom) => 
        r.workspaceId === userWorkspaceId || !r.workspaceId
      );
    }

    const currentFilter = ROOM_FILTERS.find(f => f.id === activeFilter);
    if (currentFilter) {
      filtered = filtered.filter((r: ChatRoom) => 
        currentFilter.filter(r, { isParticipant: r.isParticipant })
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((r: ChatRoom) => {
        const nameOrSubject = (r.name || r.subject || '').toLowerCase();
        const roomSlug = (r.slug || '').toLowerCase();
        const workspaceName = (r.workspaceName || '').toLowerCase();
        return nameOrSubject.includes(query) || roomSlug.includes(query) || workspaceName.includes(query);
      });
    }

    return filtered;
  }, [roomsData?.rooms, activeFilter, searchQuery, hasSupportRole, userWorkspaceId]);

  const handleSelectRoom = (roomId: string | undefined) => {
    if (!roomId) return;
    const newSelected = new Set(selectedRooms);
    if (newSelected.has(roomId)) {
      newSelected.delete(roomId);
    } else {
      newSelected.add(roomId);
    }
    setSelectedRooms(newSelected);
  };

  const handleJoinSelected = () => {
    if (selectedRooms.size === 0) {
      toast({
        title: "No rooms selected",
        description: "Please select at least one room to join",
      });
      return;
    }
    joinRoomsMutation.mutate(Array.from(selectedRooms));
  };

  const joinedCount = (roomsData?.rooms || []).filter((r: ChatRoom) => r.isParticipant).length;

  return (
    <div className="min-h-screen bg-background pb-24 sm:pb-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        
        <div className="mb-4 sm:mb-6 flex items-start gap-3">
          <Button
            size="icon"
            variant="outline"
            onClick={() => setLocation("/")}
            data-testid="button-back-to-home"
            className="shrink-0 h-9 w-9 sm:h-10 sm:w-10"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">
                {hasSupportRole ? CHATROOM_UI.supportRoleTitle : CHATROOM_UI.pageTitle}
              </h1>
              <div className="flex items-center gap-1.5 text-emerald-500">
                <Wifi className="h-3 w-3 animate-pulse" />
                <span className="text-xs font-medium">Live</span>
              </div>
            </div>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 line-clamp-2">
              {hasSupportRole 
                ? CHATROOM_UI.supportRoleDescription
                : CHATROOM_UI.pageDescription
              }
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasSupportRole && (
              <div className="flex items-center border rounded-md">
                <Button
                  size="icon"
                  variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                  onClick={() => setViewMode('grid')}
                  className="h-9 w-9 rounded-r-none"
                  data-testid="button-view-grid"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                  onClick={() => setViewMode('table')}
                  className="h-9 w-9 rounded-l-none"
                  data-testid="button-view-table"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            )}
            <Button
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
              data-testid="button-open-create-room"
            >
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">New Room</span>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => viewMode === 'table' ? refetchPlatform() : refetch()}
              disabled={isFetching || platformLoading}
              className="shrink-0"
              data-testid="button-refresh-rooms"
            >
              <RefreshCw className={`h-4 w-4 ${(isFetching || platformLoading) ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={CHATROOM_UI.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10 sm:h-11"
              data-testid="input-room-search"
            />
          </div>

          <ScrollArea className="w-full">
            <Tabs value={activeFilter} onValueChange={setActiveFilter} className="w-full">
              <TabsList className="inline-flex h-9 sm:h-10 w-auto min-w-full sm:min-w-0 gap-1 bg-muted/50 p-1">
                {ROOM_FILTERS.slice(0, 4).map((filter) => (
                  <TabsTrigger 
                    key={filter.id} 
                    value={filter.id}
                    className="text-xs sm:text-sm px-3 sm:px-4 whitespace-nowrap"
                    data-testid={`button-filter-${filter.id}`}
                  >
                    {filter.label}
                    {filter.id === 'joined' && joinedCount > 0 && (
                      <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">
                        {joinedCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </ScrollArea>

          {selectedRooms.size > 0 && (
            <div className="flex gap-2 p-3 sm:p-4 bg-primary/5 border border-primary/20 rounded-lg items-center justify-between">
              <span className="text-sm font-medium">
                {selectedRooms.size} room{selectedRooms.size !== 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedRooms(new Set())}
                  data-testid="button-clear-selection"
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  onClick={handleJoinSelected}
                  disabled={joinRoomsMutation.isPending}
                  data-testid="button-join-selected"
                >
                  {joinRoomsMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Join Selected
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12 sm:py-16">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-primary" />
              <p className="text-muted-foreground">Loading chatrooms...</p>
            </div>
          </div>
        )}

        {error && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="pt-6 text-center">
              <p className="text-destructive font-medium">Failed to load chatrooms</p>
              <p className="text-sm text-muted-foreground mt-1">Please try again later</p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => refetch()}
                className="mt-4"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {hasSupportRole && viewMode === 'table' ? (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              <Select value={orgFilter} onValueChange={setOrgFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-org-filter">
                  <Building2 className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="All Organizations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Organizations</SelectItem>
                  {workspacesData?.workspaces?.map((ws) => (
                    <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[150px]" data-testid="select-category-filter">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="work">Work</SelectItem>
                  <SelectItem value="shift">Shift</SelectItem>
                  <SelectItem value="support">Support</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {platformLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <Card>
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Room</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Participants</TableHead>
                        <TableHead>Created By</TableHead>
                        <TableHead>Last Active</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(platformRoomsData?.rooms || []).map((room) => {
                        const typeConfig = getRoomTypeConfig(room.conversationType);
                        const TypeIcon = typeConfig.icon;
                        return (
                          <TableRow key={room.id} data-testid={`row-room-${room.id}`}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className={`p-1.5 rounded ${typeConfig.bgColor}`}>
                                  <TypeIcon className={`h-4 w-4 ${typeConfig.color}`} />
                                </div>
                                <div>
                                  <p className="font-medium truncate max-w-[200px]">{room.name}</p>
                                  <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                    {room.workspaceId?.slice(0, 8)}...
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`${typeConfig.bgColor} ${typeConfig.color}`}>
                                {typeConfig.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={room.status === 'active' ? 'default' : room.status === 'suspended' ? 'secondary' : 'outline'}
                                className={room.status === 'active' ? 'bg-green-500/10 text-green-500 border-green-500/30' : ''}
                              >
                                {room.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {room.participantsCount || 0}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{room.createdBy || 'Unknown'}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {room.lastMessageAt 
                                ? formatDistanceToNow(new Date(room.lastMessageAt), { addSuffix: true })
                                : 'Never'
                              }
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="icon" variant="ghost" data-testid={`button-room-actions-${room.id}`}>
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => setLocation(`/chat/${room.id}`)}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Room
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {room.status === 'active' && (
                                    <>
                                      <DropdownMenuItem onClick={() => handleModerate(room, 'suspend')}>
                                        <Pause className="h-4 w-4 mr-2 text-amber-500" />
                                        Suspend
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleModerate(room, 'warn')}>
                                        <AlertTriangle className="h-4 w-4 mr-2 text-orange-500" />
                                        Send Warning
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                  {room.status === 'suspended' && (
                                    <DropdownMenuItem onClick={() => handleModerate(room, 'reopen')}>
                                      <Play className="h-4 w-4 mr-2 text-green-500" />
                                      Reopen
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => handleModerate(room, 'archive')}>
                                    <Archive className="h-4 w-4 mr-2" />
                                    Archive
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    onClick={() => handleModerate(room, 'close')}
                                    className="text-destructive"
                                  >
                                    <XCircle className="h-4 w-4 mr-2" />
                                    Close Room
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {(platformRoomsData?.rooms || []).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            No rooms found matching your filters
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </Card>
            )}

            <div className="mt-4 text-center text-sm text-muted-foreground">
              Showing {(platformRoomsData?.rooms || []).length} rooms platform-wide
            </div>
          </>
        ) : (
          <>
            {!isLoading && !error && (
              <>
                {filteredRooms.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="pt-12 text-center pb-12">
                      <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                      <p className="text-muted-foreground font-medium mb-2">
                        {searchQuery ? 'No rooms match your search' : CHATROOM_UI.emptyStateTitle}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {activeFilter === 'available'
                          ? 'You are already a member of all available rooms'
                          : CHATROOM_UI.emptyStateDescription}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {filteredRooms.map((room: ChatRoom) => (
                      <RoomCard
                        key={room.id || room.roomId}
                        room={room}
                        isSelected={!!(room.id && selectedRooms.has(room.id))}
                        onSelect={() => handleSelectRoom(room.id)}
                        onJoin={() => {
                          if (room.id) {
                            joinRoomsMutation.mutate([room.id]);
                          }
                        }}
                      />
                    ))}
                  </div>
                )}

                <div className="mt-6 text-center text-xs sm:text-sm text-muted-foreground">
                  Showing {filteredRooms.length} of {(roomsData?.rooms || []).length || 0} room{(roomsData?.rooms || []).length !== 1 ? 's' : ''} 
                  {!hasSupportRole && userWorkspaceId && ' (organization only)'}
                  {isFetching && !isLoading && (
                    <span className="ml-2 text-primary">
                      <RefreshCw className="h-3 w-3 inline animate-spin" /> Updating...
                    </span>
                  )}
                </div>
              </>
            )}

            {isLoading && (
              <div className="flex items-center justify-center py-12 sm:py-16">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-primary" />
                  <p className="text-muted-foreground">Loading chatrooms...</p>
                </div>
              </div>
            )}

            {error && (
              <Card className="border-destructive/50 bg-destructive/5">
                <CardContent className="pt-6 text-center">
                  <p className="text-destructive font-medium">Failed to load chatrooms</p>
                  <p className="text-sm text-muted-foreground mt-1">Please try again later</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => refetch()}
                    className="mt-4"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      <CreateRoomDialog 
        open={createDialogOpen} 
        onOpenChange={setCreateDialogOpen} 
        onSuccess={() => {}} 
      />
      
      <ModerateRoomDialog
        open={moderateDialogOpen}
        onOpenChange={setModerateDialogOpen}
        room={selectedRoom}
        action={moderateAction}
        onSuccess={() => {}}
      />
    </div>
  );
}
