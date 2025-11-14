/**
 * Org Chat Hub
 * 
 * Unified communication hub for workspace users
 * Combines existing private-messages functionality with room listing
 * 
 * Features:
 * - Organization-scoped chatrooms
 * - Shift-based employee communication
 * - Manager<->Employee messaging
 * - Task assignment and productivity tracking
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useEmployee } from '@/hooks/useEmployee';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  MessageSquare, 
  Users, 
  Plus,
  Clock
} from 'lucide-react';

interface ChatRoom {
  id: string;
  name: string;
  description: string;
  activeUsers: number;
  lastActivity: string;
  type: 'general' | 'shift' | 'department';
}

export default function OrgChatHub() {
  const { employee } = useEmployee();
  const [, setLocation] = useLocation();
  
  // Fetch organization chatrooms
  const { data: rooms = [], isLoading } = useQuery<ChatRoom[]>({
    queryKey: ['/api/org-chatrooms'],
    enabled: !!employee
  });
  
  if (!employee) {
    return <ResponsiveLoading message="Loading profile..." />;
  }
  
  if (isLoading) {
    return <ResponsiveLoading message="Loading chatrooms..." />;
  }
  
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
              <h1 className="text-2xl font-bold">Organization Chat</h1>
              <p className="text-sm text-muted-foreground">
                {employee.firstName} {employee.lastName} • {employee.employeeNumber}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="gap-1">
            <MessageSquare className="w-3 h-3" />
            {rooms.length} Active Rooms
          </Badge>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="hover-elevate cursor-pointer" onClick={() => setLocation('/private-messages')}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Direct Messages
                </CardTitle>
                <CardDescription>Private 1-on-1 conversations</CardDescription>
              </CardHeader>
            </Card>
            
            <Card className="hover-elevate cursor-pointer">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Team Channels
                </CardTitle>
                <CardDescription>Department and team chats</CardDescription>
              </CardHeader>
            </Card>
            
            <Card className="hover-elevate cursor-pointer">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Shift Chat
                </CardTitle>
                <CardDescription>Active shift communications</CardDescription>
              </CardHeader>
            </Card>
          </div>
          
          {/* Active Chatrooms */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Active Chatrooms</h2>
              <Button size="sm" variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Create Room
              </Button>
            </div>
            
            {rooms.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No active chatrooms</p>
                  <p className="text-sm">Create a room to start collaborating</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {rooms.map((room) => (
                  <Card key={room.id} className="hover-elevate cursor-pointer">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{room.name}</CardTitle>
                          <CardDescription className="line-clamp-2">{room.description}</CardDescription>
                        </div>
                        <Badge variant="outline" className="ml-2">
                          {room.type}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Users className="w-4 h-4" />
                          <span>{room.activeUsers} active</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(room.lastActivity).toLocaleTimeString()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
