import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  MessageSquare, 
  Users, 
  Clock, 
  Search, 
  ArrowRight,
  Loader2,
  MessageCircle,
  Shield,
  Sparkles
} from "lucide-react";

interface ChatroomData {
  id: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  conversationType: string;
  participantCount: number;
  unreadCount: number;
  lastMessageAt: string;
  createdAt: string;
  status: string;
}

export function SupportChatroomList() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [sortBy, setSortBy] = useState("recent");

  // Fetch all open chatrooms across all organizations
  const { data: chatrooms, isLoading } = useQuery<ChatroomData[]>({
    queryKey: ["/api/support/chatrooms", filterType, sortBy],
    refetchInterval: 5000, // Refresh every 5 seconds for live updates
  });

  const handleJoinRoom = (chatroomId: string) => {
    // Navigate to the chatroom - support will auto-join with admin/owner access
    setLocation(`/comm-os?room=${chatroomId}`);
  };

  // Filter chatrooms based on search query
  const filteredChatrooms = chatrooms?.filter(room => {
    const matchesSearch = 
      room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      room.workspaceName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = filterType === "all" || room.conversationType === filterType;
    
    return matchesSearch && matchesFilter;
  }) || [];

  // Sort chatrooms
  const sortedChatrooms = [...filteredChatrooms].sort((a, b) => {
    if (sortBy === "recent") {
      return new Date(b.lastMessageAt || b.createdAt).getTime() - new Date(a.lastMessageAt || a.createdAt).getTime();
    } else if (sortBy === "participants") {
      return b.participantCount - a.participantCount;
    } else if (sortBy === "name") {
      return a.name.localeCompare(b.name);
    }
    return 0;
  });

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
    return `${Math.floor(diffMinutes / 1440)}d ago`;
  };

  return (
    <div className="container max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Shield className="h-6 w-6 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              Support Command Center
            </h1>
            <p className="text-sm text-muted-foreground">
              Live chatroom monitoring across all organizations
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="hover-elevate">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Rooms</CardTitle>
              <MessageSquare className="h-4 w-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {chatrooms?.length || 0}
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Participants</CardTitle>
              <Users className="h-4 w-4 text-teal-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {chatrooms?.reduce((sum, room) => sum + room.participantCount, 0) || 0}
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Unread Messages</CardTitle>
              <MessageCircle className="h-4 w-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {chatrooms?.reduce((sum, room) => sum + room.unreadCount, 0) || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Chatroom Filters</CardTitle>
          <CardDescription>Search and filter active chatrooms</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by room name or organization..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-chatrooms"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-filter-type">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="group">Group Chat</SelectItem>
                <SelectItem value="support">Support</SelectItem>
                <SelectItem value="team">Team</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-sort-by">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most Recent</SelectItem>
                <SelectItem value="participants">Most Active</SelectItem>
                <SelectItem value="name">Name (A-Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Chatroom Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Active Chatrooms</CardTitle>
              <CardDescription>
                Click any room to join with admin access
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-emerald-500/50 text-emerald-400">
              <Sparkles className="h-3 w-3 mr-1" />
              Live Updates
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            </div>
          ) : sortedChatrooms.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                {searchQuery || filterType !== "all" 
                  ? "No chatrooms match your filters" 
                  : "No active chatrooms at the moment"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Room Name</TableHead>
                    <TableHead>Ownership</TableHead>
                    <TableHead className="text-center">Users</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedChatrooms.map((room) => {
                    const isOpen = room.status === 'active' || room.status === 'open';
                    const isPlatformOwned = room.workspaceId === 'wfms-support';
                    
                    return (
                      <TableRow 
                        key={room.id} 
                        className="hover-elevate cursor-pointer"
                        onClick={() => handleJoinRoom(room.id)}
                        data-testid={`row-chatroom-${room.id}`}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div 
                              className={`h-2.5 w-2.5 rounded-full ${
                                isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                              }`}
                              title={isOpen ? 'Open' : 'Closed'}
                            />
                            <span className="text-xs text-muted-foreground">
                              {isOpen ? 'Open' : 'Closed'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-emerald-500" />
                            {room.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          {isPlatformOwned ? (
                            <Badge variant="outline" className="border-emerald-500/50 text-emerald-400">
                              <Shield className="h-3 w-3 mr-1" />
                              Platform
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {room.workspaceName}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium">{room.participantCount}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            <span className="text-sm">{formatTime(room.lastMessageAt || room.createdAt)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJoinRoom(room.id);
                            }}
                            data-testid={`button-join-${room.id}`}
                          >
                            Join
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
