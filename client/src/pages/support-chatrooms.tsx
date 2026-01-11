/**
 * Support Chatrooms Page - Staff view of all org chatrooms
 * 
 * Allows platform support staff to monitor and join org chatrooms
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  MessageSquare, Users, Building2, Search, 
  RefreshCw, Loader2, ExternalLink, Clock, 
  AlertCircle, Eye, Download
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useLocation } from 'wouter';

interface OrgChatroom {
  id: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  roomType: string;
  memberCount: number;
  messageCount: number;
  lastActivity?: string;
  status: 'active' | 'idle' | 'archived';
}

export default function SupportChatrooms() {
  const [searchQuery, setSearchQuery] = useState('');
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: chatroomsData, isLoading, refetch } = useQuery<{ rooms: OrgChatroom[] }>({
    queryKey: ['/api/chat/rooms/all-orgs'],
    refetchInterval: 30000,
  });

  const chatrooms = chatroomsData?.rooms || [];
  
  const filteredRooms = chatrooms.filter(room => 
    room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    room.workspaceName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeRooms = filteredRooms.filter(r => r.status === 'active');
  const idleRooms = filteredRooms.filter(r => r.status === 'idle');

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'No activity';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const handleExportHistory = async (roomId: string, roomName: string) => {
    try {
      const res = await fetch(`/api/chat/rooms/${roomId}/export`);
      if (!res.ok) throw new Error('Export failed');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-history-${roomName}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Export Complete',
        description: `Chat history for ${roomName} has been downloaded.`,
      });
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: 'Could not export chat history. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary" />
            Organization Chatrooms
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitor and support all organization chatrooms
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search rooms or orgs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{chatrooms.length}</div>
            <p className="text-xs text-muted-foreground">Total Rooms</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-500">{activeRooms.length}</div>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-muted-foreground">{idleRooms.length}</div>
            <p className="text-xs text-muted-foreground">Idle</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {new Set(chatrooms.map(r => r.workspaceId)).size}
            </div>
            <p className="text-xs text-muted-foreground">Organizations</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All Rooms ({filteredRooms.length})</TabsTrigger>
          <TabsTrigger value="active" className="gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Active ({activeRooms.length})
          </TabsTrigger>
          <TabsTrigger value="idle">Idle ({idleRooms.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <RoomList 
            rooms={filteredRooms}
            isLoading={isLoading}
            formatDate={formatDate}
            onExport={handleExportHistory}
            setLocation={setLocation}
          />
        </TabsContent>

        <TabsContent value="active" className="mt-4">
          <RoomList 
            rooms={activeRooms}
            isLoading={isLoading}
            formatDate={formatDate}
            onExport={handleExportHistory}
            setLocation={setLocation}
          />
        </TabsContent>

        <TabsContent value="idle" className="mt-4">
          <RoomList 
            rooms={idleRooms}
            isLoading={isLoading}
            formatDate={formatDate}
            onExport={handleExportHistory}
            setLocation={setLocation}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RoomList({ 
  rooms, 
  isLoading,
  formatDate,
  onExport,
  setLocation,
}: {
  rooms: OrgChatroom[];
  isLoading: boolean;
  formatDate: (date?: string) => string;
  onExport: (roomId: string, roomName: string) => void;
  setLocation: (path: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!rooms.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
          <MessageSquare className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <h3 className="font-semibold">No chatrooms found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            No organization chatrooms match your search criteria.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-3">
      {rooms.map((room) => (
        <Card key={room.id} className="hover-elevate">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "w-2 h-2 rounded-full",
                    room.status === 'active' && "bg-green-500",
                    room.status === 'idle' && "bg-muted-foreground",
                    room.status === 'archived' && "bg-red-500",
                  )} />
                  <h3 className="font-medium truncate">{room.name}</h3>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <Building2 className="w-3 h-3" />
                  <span className="truncate">{room.workspaceName}</span>
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {room.memberCount} members
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    {room.messageCount} messages
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDate(room.lastActivity)}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLocation(`/org-chat/${room.id}`)}
                >
                  <Eye className="w-3 h-3 mr-1" />
                  View
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onExport(room.id, room.name)}
                >
                  <Download className="w-3 h-3 mr-1" />
                  Export
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
