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
import { MessageCircle, Users, Lock, Globe, Plus, Search, Loader2, Check, ArrowLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface ChatRoom {
  // New unified format
  roomId?: string;
  name?: string;
  slug?: string;
  type?: 'support' | 'work' | 'meeting' | 'org';
  participantsCount?: number;
  roomType?: string;
  workspaceId?: string;
  
  // Legacy format (backward compatibility)
  id?: string;
  subject?: string;
  conversationType?: 'open_chat' | 'shift_chat' | 'dm_user' | 'dm_support' | 'dm_bot';
  visibility?: 'workspace' | 'public' | 'private';
  
  // Common fields
  status: string;
  isParticipant?: boolean;
  participantRole?: string;
  lastMessageAt?: string;
  createdAt?: string;
  autoCloseAt?: string;
}

interface ChatRoomsResponse {
  rooms: ChatRoom[];
  [key: string]: any;
}

// Helper to normalize room data between old and new formats
const normalizeRoom = (room: any): ChatRoom => {
  return {
    roomId: room.roomId || room.id,
    id: room.roomId || room.id,
    name: room.name || room.subject,
    subject: room.name || room.subject,
    slug: room.slug,
    type: room.type || (room.conversationType === 'shift_chat' ? 'work' : room.conversationType),
    conversationType: room.conversationType,
    participantsCount: room.participantsCount,
    status: room.status,
    isParticipant: room.isParticipant,
    participantRole: room.participantRole,
    lastMessageAt: room.lastMessageAt,
    createdAt: room.createdAt,
    autoCloseAt: room.autoCloseAt,
    visibility: room.visibility,
  };
};

export default function Chatrooms() {
  const { user } = useAuth();
  const { employee } = useEmployee();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<'all' | 'available' | 'joined'>('all');

  // Check if user has support role (can see platform-wide rooms)
  const isSupportRole = user?.platformRole && ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'].includes(user.platformRole);
  const userWorkspaceId = employee?.workspaceId;

  // Fetch all chatrooms
  const { data: roomsData, isLoading, error } = useQuery<ChatRoomsResponse>({
    queryKey: ['/api/chat/rooms'],
    staleTime: 30000,
  });

  // Join multiple rooms mutation
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

  // Filter and search rooms
  const filteredRooms = useMemo(() => {
    if (!roomsData?.rooms) return [];

    // Normalize all rooms to use new format
    let normalized = roomsData.rooms.map(normalizeRoom);
    let filtered = normalized;

    // RBAC: Filter by workspace if user is not support role
    if (!isSupportRole && userWorkspaceId) {
      filtered = filtered.filter((r: ChatRoom) => 
        r.workspaceId === userWorkspaceId || !r.workspaceId
      );
    }

    // Apply type filter
    if (filterType === 'joined') {
      filtered = filtered.filter((r: ChatRoom) => r.isParticipant);
    } else if (filterType === 'available') {
      filtered = filtered.filter((r: ChatRoom) => !r.isParticipant);
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((r: ChatRoom) => {
        const nameOrSubject = (r.name || r.subject || '').toLowerCase();
        const roomSlug = (r.slug || '').toLowerCase();
        return nameOrSubject.includes(query) || roomSlug.includes(query);
      });
    }

    return filtered;
  }, [roomsData?.rooms, filterType, searchQuery, isSupportRole, userWorkspaceId]);

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

  const getIconForType = (type?: string, conversationType?: string) => {
    // Handle new format (type field)
    if (type) {
      switch (type) {
        case 'support':
          return <MessageCircle className="h-4 w-4" />;
        case 'work':
          return <Users className="h-4 w-4" />;
        case 'meeting':
          return <Users className="h-4 w-4" />;
        case 'org':
          return <Users className="h-4 w-4" />;
        default:
          return <MessageCircle className="h-4 w-4" />;
      }
    }
    // Handle legacy format (conversationType field)
    switch (conversationType) {
      case 'shift_chat':
        return <Users className="h-4 w-4" />;
      case 'dm_support':
        return <MessageCircle className="h-4 w-4" />;
      case 'dm_bot':
        return <MessageCircle className="h-4 w-4" />;
      default:
        return <MessageCircle className="h-4 w-4" />;
    }
  };

  const getVisibilityIcon = (visibility?: string) => {
    return visibility === 'private' ? (
      <Lock className="h-3 w-3" />
    ) : (
      <Globe className="h-3 w-3" />
    );
  };

  const getRoomLabel = (type?: string, conversationType?: string) => {
    // Handle new format (type field)
    if (type) {
      switch (type) {
        case 'support':
          return 'Support';
        case 'work':
          return 'Work';
        case 'meeting':
          return 'Meeting';
        case 'org':
          return 'Organization';
        default:
          return 'Chat';
      }
    }
    // Handle legacy format (conversationType field)
    switch (conversationType) {
      case 'shift_chat':
        return 'Shift';
      case 'dm_support':
        return 'Support';
      case 'dm_bot':
        return 'Bot';
      case 'open_chat':
        return 'Open';
      default:
        return 'Chat';
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header with Back Button */}
        <div className="mb-8 flex items-center gap-3">
          <Button
            size="icon"
            variant="outline"
            onClick={() => setLocation("/")}
            data-testid="button-back-to-home"
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold mb-2">
              {isSupportRole ? 'All Organization Chatrooms' : 'Chatrooms'}
            </h1>
            <p className="text-muted-foreground">
              {isSupportRole 
                ? 'View active chatrooms platform-wide: support, work, meeting, and organization channels'
                : 'Discover and join team conversations, automation channels, and work schedule discussions'
              }
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="mb-6 space-y-4">
          {/* Search and Filters */}
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search rooms by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-room-search"
                />
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2">
              <Button
                variant={filterType === 'all' ? 'default' : 'outline'}
                onClick={() => setFilterType('all')}
                data-testid="button-filter-all"
              >
                All Rooms
              </Button>
              <Button
                variant={filterType === 'available' ? 'default' : 'outline'}
                onClick={() => setFilterType('available')}
                data-testid="button-filter-available"
              >
                Available to Join
              </Button>
              <Button
                variant={filterType === 'joined' ? 'default' : 'outline'}
                onClick={() => setFilterType('joined')}
                data-testid="button-filter-joined"
              >
                My Rooms ({(roomsData?.rooms || []).filter((r: ChatRoom) => r.isParticipant).length || 0})
              </Button>
            </div>

            {/* Bulk Actions */}
            {selectedRooms.size > 0 && (
              <div className="flex gap-2 p-4 bg-muted rounded-lg items-center justify-between">
                <span className="text-sm font-medium">
                  {selectedRooms.size} room{selectedRooms.size !== 1 ? 's' : ''} selected
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedRooms(new Set())}
                    data-testid="button-clear-selection"
                  >
                    Clear
                  </Button>
                  <Button
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
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-primary" />
              <p className="text-muted-foreground">Loading chatrooms...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="pt-6">
              <p className="text-destructive font-medium">Failed to load chatrooms</p>
              <p className="text-sm text-muted-foreground">Please try again later</p>
            </CardContent>
          </Card>
        )}

        {/* Rooms Grid */}
        {!isLoading && !error && (
          <>
            {filteredRooms.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="pt-12 text-center pb-12">
                  <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                  <p className="text-muted-foreground font-medium mb-2">
                    {searchQuery ? 'No rooms match your search' : 'No rooms available'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {filterType === 'available'
                      ? 'You are already a member of all available rooms'
                      : 'Check back soon for new discussions'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRooms.map((room: ChatRoom) => (
                  <Card
                    key={room.id || room.roomId}
                    className={`cursor-pointer transition-all hover-elevate ${
                      room.id && selectedRooms.has(room.id) ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => {
                      if (!room.isParticipant) {
                        handleSelectRoom(room.id);
                      }
                    }}
                    data-testid={`card-room-${room.id || room.roomId}`}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="text-primary mt-1 shrink-0">
                            {getIconForType(room.type, room.conversationType)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base line-clamp-2" data-testid={`text-room-name-${room.id}`}>
                              {room.name || room.subject}
                            </CardTitle>
                            <CardDescription className="mt-1 text-xs">
                              {room.createdAt 
                                ? `Created ${formatDistanceToNow(new Date(room.createdAt), { addSuffix: true })}`
                                : 'Room'}
                            </CardDescription>
                          </div>
                        </div>
                        {room.isParticipant && (
                          <Badge variant="secondary" className="shrink-0">
                            <Check className="h-3 w-3 mr-1" />
                            Joined
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs" data-testid={`badge-type-${room.id}`}>
                              {getRoomLabel(room.type, room.conversationType)}
                            </Badge>
                            {room.participantsCount !== undefined && (
                              <Badge variant="outline" className="text-xs flex items-center gap-1" data-testid={`badge-participants-${room.id}`}>
                                <Users className="h-3 w-3" />
                                {room.participantsCount}
                              </Badge>
                            )}
                            {room.visibility && (
                              <Badge variant="outline" className="text-xs flex items-center gap-1">
                                {getVisibilityIcon(room.visibility)}
                                {room.visibility}
                              </Badge>
                            )}
                          </div>
                          {!room.isParticipant && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                handleSelectRoom(room.id);
                              }}
                              data-testid={`button-select-room-${room.id || room.roomId}`}
                              className="shrink-0"
                            >
                              {room.id && selectedRooms.has(room.id) ? 'Selected' : 'Select'}
                            </Button>
                          )}
                        </div>
                        {room.lastMessageAt && (
                          <p className="text-xs text-muted-foreground">
                            Last activity {formatDistanceToNow(new Date(room.lastMessageAt), { addSuffix: true })}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Results Summary */}
            <div className="mt-6 text-center text-sm text-muted-foreground">
              Showing {filteredRooms.length} of {(roomsData?.rooms || []).length || 0} room{(roomsData?.rooms || []).length !== 1 ? 's' : ''} {!isSupportRole && userWorkspaceId && '(organization only)'}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
