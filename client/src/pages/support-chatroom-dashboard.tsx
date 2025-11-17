/**
 * Support Chatroom Dashboard
 * 
 * RBAC: Only accessible to support roles (root_admin, support_manager, support_agent)
 * 
 * Features:
 * - List all active chatrooms with live stats
 * - HelpDesk platform room always visible with special badge
 * - Management actions: close, suspend, open rooms
 * - Live updating user counts
 * - Shows org name, org ID, creator ID
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useEmployee } from '@/hooks/useEmployee';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Bot, 
  MessageSquare, 
  Users, 
  XCircle, 
  PauseCircle, 
  PlayCircle,
  ArrowLeft,
  RefreshCw
} from 'lucide-react';
import Error403 from './error-403';

interface ChatRoom {
  id: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  creatorId: string;
  creatorName: string;
  activeUsers: number;
  status: 'active' | 'closed' | 'suspended';
  createdAt: string;
}

export default function SupportChatroomDashboard() {
  const { employee } = useEmployee();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  
  // RBAC check - only support roles can access
  const platformRole = (employee as any)?.platformRole;
  const isSupport = platformRole === 'root_admin' || 
                    platformRole === 'support_manager' || 
                    platformRole === 'support_agent' ||
                    platformRole === 'support';
  
  // Fetch all chatrooms
  const { data: rooms = [], isLoading, refetch } = useQuery<ChatRoom[]>({
    queryKey: ['/api/support/chatrooms'],
    refetchInterval: 5000, // Live updates every 5 seconds
    enabled: isSupport
  });
  
  // Close room mutation
  const closeRoomMutation = useMutation({
    mutationFn: async (roomId: string) => {
      const response = await fetch('/api/support/chatrooms/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ roomId })
      });
      if (!response.ok) throw new Error('Failed to close room');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Room Closed',
        description: 'Chatroom has been successfully closed'
      });
      queryClient.invalidateQueries({ queryKey: ['/api/support/chatrooms'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to close chatroom',
        variant: 'destructive'
      });
    }
  });
  
  // Suspend room mutation
  const suspendRoomMutation = useMutation({
    mutationFn: async (roomId: string) => {
      const response = await fetch('/api/support/chatrooms/suspend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ roomId })
      });
      if (!response.ok) throw new Error('Failed to suspend room');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Room Suspended',
        description: 'Chatroom has been temporarily suspended'
      });
      queryClient.invalidateQueries({ queryKey: ['/api/support/chatrooms'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to suspend chatroom',
        variant: 'destructive'
      });
    }
  });
  
  // Reopen room mutation
  const reopenRoomMutation = useMutation({
    mutationFn: async (roomId: string) => {
      const response = await fetch('/api/support/chatrooms/reopen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ roomId })
      });
      if (!response.ok) throw new Error('Failed to reopen room');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Room Reopened',
        description: 'Chatroom has been reopened'
      });
      queryClient.invalidateQueries({ queryKey: ['/api/support/chatrooms'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to reopen chatroom',
        variant: 'destructive'
      });
    }
  });
  
  if (!employee) {
    return <ResponsiveLoading message="Loading profile..." />;
  }
  
  if (!isSupport) {
    return <Error403 />;
  }
  
  if (isLoading) {
    return <ResponsiveLoading message="Loading chatrooms..." />;
  }
  
  // Separate HelpDesk platform room from org rooms
  const helpDeskRoom = rooms.find(r => r.name === 'HelpDesk' || r.workspaceId === 'autoforce-platform-workspace');
  const orgRooms = rooms.filter(r => r.id !== helpDeskRoom?.id);
  
  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation('/')}
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Live Chatroom Management</h1>
              <p className="text-sm text-muted-foreground">Monitor and manage all active chatrooms</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <MessageSquare className="w-3 h-3" />
              {rooms.length} Active Rooms
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              data-testid="button-refresh"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* HelpDesk Platform Room */}
        {helpDeskRoom && (
          <Card className="border-2 border-primary/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 flex items-center justify-center">
                    <Bot className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">HelpDesk</CardTitle>
                    <CardDescription>Platform-owned support room • Always open</CardDescription>
                  </div>
                </div>
                <Badge className="bg-gradient-to-r from-blue-600 to-blue-500">Platform Owned</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant="outline" className="mt-1">
                    <PlayCircle className="w-3 h-3 mr-1" />
                    Active
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Active Users</p>
                  <p className="text-sm font-bold mt-1 flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {helpDeskRoom.activeUsers}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Organization</p>
                  <p className="text-sm font-medium mt-1">AutoForce™ Platform</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm mt-1">{new Date(helpDeskRoom.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Organization Chatrooms Table */}
        <Card>
          <CardHeader>
            <CardTitle>Organization Chatrooms</CardTitle>
            <CardDescription>Manage workspace-specific communication channels</CardDescription>
          </CardHeader>
          <CardContent>
            {orgRooms.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No active organization chatrooms</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Room Name</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Org ID</TableHead>
                    <TableHead>Creator</TableHead>
                    <TableHead>Users Online</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgRooms.map((room) => (
                    <TableRow key={room.id}>
                      <TableCell className="font-medium">{room.name}</TableCell>
                      <TableCell>{room.workspaceName}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{room.workspaceId}</code>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {room.creatorName}
                          <p className="text-xs text-muted-foreground">{room.creatorId}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          <span className="font-bold">{room.activeUsers}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {room.status === 'active' && (
                          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                            <PlayCircle className="w-3 h-3 mr-1" />
                            Active
                          </Badge>
                        )}
                        {room.status === 'suspended' && (
                          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                            <PauseCircle className="w-3 h-3 mr-1" />
                            Suspended
                          </Badge>
                        )}
                        {room.status === 'closed' && (
                          <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">
                            <XCircle className="w-3 h-3 mr-1" />
                            Closed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          {room.status === 'active' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => suspendRoomMutation.mutate(room.id)}
                                disabled={suspendRoomMutation.isPending}
                                data-testid={`button-suspend-${room.id}`}
                              >
                                <PauseCircle className="w-4 h-4 mr-1" />
                                Suspend
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => closeRoomMutation.mutate(room.id)}
                                disabled={closeRoomMutation.isPending}
                                data-testid={`button-close-${room.id}`}
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Close
                              </Button>
                            </>
                          )}
                          {(room.status === 'suspended' || room.status === 'closed') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => reopenRoomMutation.mutate(room.id)}
                              disabled={reopenRoomMutation.isPending}
                              data-testid={`button-reopen-${room.id}`}
                            >
                              <PlayCircle className="w-4 h-4 mr-1" />
                              Reopen
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
