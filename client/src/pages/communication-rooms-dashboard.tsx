
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, Search, Users, Hash, Lock, MessageSquare, 
  Settings, Trash2, Archive, MoreVertical, Pin
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocation } from "wouter";

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
  status?: string;
}

export default function CommunicationRoomsDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newRoom, setNewRoom] = useState({
    name: "",
    description: "",
    type: "public" as "public" | "private" | "team",
  });

  // Fetch all organization chat rooms
  const { data: rooms = [], isLoading } = useQuery<ChatRoom[]>({
    queryKey: ['/api/chat/conversations'],
    enabled: !!user,
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
        status: conv.status
      })),
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
  });

  // Delete room mutation
  const deleteRoomMutation = useMutation({
    mutationFn: async (roomId: string) => {
      return await apiRequest(`/api/chat/conversations/${roomId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'] });
      toast({
        title: "Room deleted",
        description: "Chat room has been removed",
      });
    },
  });

  const filteredRooms = rooms.filter((room) =>
    room.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenRoom = (roomId: string) => {
    navigate(`/communication?room=${roomId}`);
  };

  return (
    <div className="container mx-auto p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Organization Chat Rooms</h1>
          <p className="text-muted-foreground mt-1">
            Manage internal team communication channels
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Room
        </Button>
      </div>

      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search rooms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-3/4 mb-2" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : filteredRooms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <MessageSquare className="h-16 w-16 text-muted-foreground opacity-20 mb-4" />
            <h3 className="text-lg font-medium mb-2">No rooms found</h3>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
              {searchQuery ? "Try a different search term" : "Create your first chat room to get started"}
            </p>
            {!searchQuery && (
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create First Room
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredRooms.map((room) => (
            <Card 
              key={room.id} 
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => handleOpenRoom(room.id)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
                      {room.type === "private" ? (
                        <Lock className="h-5 w-5 text-white" />
                      ) : room.type === "team" ? (
                        <Users className="h-5 w-5 text-white" />
                      ) : (
                        <Hash className="h-5 w-5 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate flex items-center gap-2">
                        {room.name}
                        {room.isPinned && <Pin className="h-3 w-3 text-muted-foreground" />}
                      </CardTitle>
                      <CardDescription className="truncate">
                        {room.description || "No description"}
                      </CardDescription>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenRoom(room.id); }}>
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Open Room
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                        <Archive className="mr-2 h-4 w-4" />
                        Archive
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteRoomMutation.mutate(room.id);
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {room.memberCount || 0}
                    </span>
                    <Badge variant={room.type === "private" ? "secondary" : "default"}>
                      {room.type}
                    </Badge>
                  </div>
                  {(room.unreadCount || 0) > 0 && (
                    <Badge variant="default" className="ml-2">
                      {room.unreadCount}
                    </Badge>
                  )}
                </div>
                {room.lastMessage && (
                  <p className="text-xs text-muted-foreground mt-2 truncate">
                    {room.lastMessage}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Room Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
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
              />
            </div>
            <div>
              <Label htmlFor="room-description">Description (Optional)</Label>
              <Textarea
                id="room-description"
                placeholder="What's this room about?"
                value={newRoom.description}
                onChange={(e) => setNewRoom({ ...newRoom, description: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="room-type">Room Type *</Label>
              <Select
                value={newRoom.type}
                onValueChange={(value: any) => setNewRoom({ ...newRoom, type: value })}
              >
                <SelectTrigger id="room-type">
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
            >
              {createRoomMutation.isPending ? "Creating..." : "Create Room"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
