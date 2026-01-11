import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  MessageSquare,
  Users,
  LogIn,
  LogOut,
  UserPlus,
  Volume2,
  VolumeX,
  Settings,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ColorfulCelticKnot } from "@/components/ui/colorful-celtic-knot";
import { Loader2 } from "lucide-react";

interface RoomMember {
  id: string;
  name: string;
  role: string;
  status: 'online' | 'away' | 'busy';
  isStaff?: boolean;
}

interface LiveRoom {
  id: string;
  roomName: string;
  slug: string;
  workspaceId: string;
  status: 'active' | 'suspended' | 'archived';
  maxMembers: number;
  currentMembers: number;
  onlineMembers: RoomMember[];
  isJoined: boolean;
  unreadCount: number;
  lastActivity: string;
}

interface LiveRoomBrowserProps {
  onRoomSelect?: (roomId: string, roomName: string) => void;
  filterByOrg?: boolean; // For end users - show only org rooms
  compact?: boolean; // Compact mode for mobile
}

export function LiveRoomBrowser({ onRoomSelect, filterByOrg = false, compact = false }: LiveRoomBrowserProps) {
  const { user, isLoading: isAuthLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

  // Fetch live rooms with user counts - enabled once auth is resolved and user is authenticated
  const { data: rooms, isLoading: isRoomsLoading, isError } = useQuery<LiveRoom[]>({
    queryKey: ['/api/comm-os/rooms/live'],
    enabled: isAuthenticated && !isAuthLoading,
    refetchInterval: 5000, // Poll every 5 seconds for live updates
    retry: 2, // Retry failed requests
  });

  // Join room mutation
  const joinRoomMutation = useMutation({
    mutationFn: async (roomId: string) => {
      const res = await fetch(`/api/comm-os/rooms/${roomId}/join`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data, roomId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/comm-os/rooms/live'] });
      const room = rooms?.find(r => r.id === roomId);
      toast({
        title: "Joined Room",
        description: `You're now in ${room?.roomName || 'the room'}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Join Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Leave room mutation
  const leaveRoomMutation = useMutation({
    mutationFn: async (roomId: string) => {
      const res = await fetch(`/api/comm-os/rooms/${roomId}/leave`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data, roomId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/comm-os/rooms/live'] });
      const room = rooms?.find(r => r.id === roomId);
      toast({
        title: "Left Room",
        description: `You left ${room?.roomName || 'the room'}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Leave Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-muted/30';
      case 'suspended': return 'bg-yellow-500';
      case 'archived': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getUserStatusColor = (status: 'online' | 'away' | 'busy') => {
    switch (status) {
      case 'online': return 'bg-muted/30';
      case 'away': return 'bg-yellow-500';
      case 'busy': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  // Show loading state while auth is loading or rooms are fetching
  if (isAuthLoading || isRoomsLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 gap-3">
        <ColorfulCelticKnot size="lg" state={isAuthLoading ? "focused" : "listening"} animated={true} animationSpeed="normal" />
        <p className="text-sm text-muted-foreground">
          {isAuthLoading ? 'Checking authentication...' : 'Loading rooms...'}
        </p>
      </div>
    );
  }

  // Show login prompt if not authenticated (after auth loading completes)
  if (!isAuthenticated) {
    return (
      <Card>
        <CardContent className="p-12 text-center space-y-4">
          <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto" />
          <div>
            <p className="text-muted-foreground font-medium">Sign in to view chat rooms</p>
            <p className="text-sm text-muted-foreground mt-1">Authentication is required to access live chat</p>
          </div>
          <Button 
            onClick={() => window.location.href = '/auth'}
            className="mt-4"
            data-testid="button-login-to-chat"
          >
            Sign In
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Show error state
  if (isError) {
    return (
      <Card>
        <CardContent className="p-12 text-center space-y-4">
          <MessageSquare className="h-12 w-12 text-destructive mx-auto" />
          <div>
            <p className="text-destructive font-medium">Failed to load chat rooms</p>
            <p className="text-sm text-muted-foreground mt-1">Please try again later</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!rooms || rooms.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center space-y-4">
          <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">No chat rooms available</p>
          <p className="text-sm text-muted-foreground">Check back later or contact support</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Active Rooms</h2>
          <p className="text-sm text-muted-foreground">
            {rooms.length} room{rooms.length !== 1 ? 's' : ''} available
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <div className="h-2 w-2 rounded-full bg-muted/30 animate-pulse" />
          Live
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => (
          <Card
            key={room.id}
            className={`hover-elevate cursor-pointer transition-all ${
              selectedRoom === room.id ? 'ring-2 ring-primary' : ''
            }`}
            onClick={() => setSelectedRoom(room.id === selectedRoom ? null : room.id)}
            data-testid={`room-card-${room.slug}`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className={`h-3 w-3 rounded-full ${getStatusColor(room.status)} shrink-0`} />
                  <CardTitle className="text-base truncate">{room.roomName}</CardTitle>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      data-testid={`button-room-menu-${room.slug}`}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem data-testid={`button-settings-${room.slug}`}>
                      <Settings className="h-4 w-4 mr-2" />
                      Room Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <VolumeX className="h-4 w-4 mr-2" />
                      Mute Notifications
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <CardDescription className="flex items-center gap-2 text-xs">
                <Users className="h-3 w-3" />
                <span>
                  {room.currentMembers} / {room.maxMembers} members
                </span>
                {room.onlineMembers.length > 0 && (
                  <span className="text-primary">
                    • {room.onlineMembers.length} online
                  </span>
                )}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3">
              {/* Online Members List */}
              {room.onlineMembers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Online Now</p>
                  <div className="flex flex-wrap gap-2">
                    {room.onlineMembers.slice(0, 5).map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center gap-1.5 bg-muted px-2 py-1 rounded-md"
                        data-testid={`member-${member.id}`}
                      >
                        <div className="relative">
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-xs">
                              {getInitials(member.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div
                            className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background ${getUserStatusColor(member.status)}`}
                          />
                        </div>
                        <span className="text-xs">{member.name.split(' ')[0]}</span>
                        {member.isStaff && (
                          <Badge variant="outline" className="h-4 text-[10px] px-1">
                            Staff
                          </Badge>
                        )}
                      </div>
                    ))}
                    {room.onlineMembers.length > 5 && (
                      <div className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md">
                        <UserPlus className="h-3 w-3" />
                        <span className="text-xs">+{room.onlineMembers.length - 5}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Unread Messages Badge */}
              {room.unreadCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {room.unreadCount} unread
                </Badge>
              )}

              {/* Action Buttons */}
              <div className={compact ? "space-y-2" : "flex gap-2"}>
                {onRoomSelect && (
                  <Button
                    className={compact ? "w-full" : "flex-1"}
                    variant="default"
                    onClick={async (e) => {
                      e.stopPropagation();
                      // Auto-join if not already a member, then navigate
                      if (!room.isJoined) {
                        try {
                          await joinRoomMutation.mutateAsync(room.id);
                        } catch (error) {
                          toast({
                            title: "Failed to join room",
                            description: "Please try again",
                            variant: "destructive",
                          });
                          return;
                        }
                      }
                      onRoomSelect(room.id, room.roomName);
                    }}
                    disabled={joinRoomMutation.isPending}
                    data-testid={`button-enter-${room.slug}`}
                  >
                    {joinRoomMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <MessageSquare className="h-4 w-4 mr-2" />
                    )}
                    {room.isJoined ? "Enter Chat" : "Join & Enter"}
                  </Button>
                )}
                {!compact && (
                  <Button
                    className={onRoomSelect ? "" : "w-full"}
                    variant={room.isJoined ? "outline" : "secondary"}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (room.isJoined) {
                        leaveRoomMutation.mutate(room.id);
                      } else {
                        joinRoomMutation.mutate(room.id);
                      }
                    }}
                    disabled={joinRoomMutation.isPending || leaveRoomMutation.isPending}
                    data-testid={room.isJoined ? `button-leave-${room.slug}` : `button-join-${room.slug}`}
                  >
                    {room.isJoined ? (
                      <>
                        <LogOut className="h-4 w-4 mr-2" />
                        Leave
                      </>
                    ) : (
                      <>
                        <LogIn className="h-4 w-4 mr-2" />
                        Join
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
