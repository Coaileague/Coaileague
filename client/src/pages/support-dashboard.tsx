import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  MessageSquare, Users, Clock, CheckCircle, AlertCircle,
  Mic, MicOff, ExternalLink, Bot, Sparkles, TrendingUp,
  Activity, Headphones
} from "lucide-react";
import type { ChatConversation } from "@shared/schema";
import { WFLogoCompact } from "@/components/wf-logo";

export default function SupportDashboard() {
  const { toast } = useToast();

  // Fetch all conversations
  const { data: conversations = [], isLoading } = useQuery<ChatConversation[]>({
    queryKey: ["/api/chat/conversations"],
    refetchInterval: 3000, // Poll every 3 seconds
  });

  const grantVoice = useMutation({
    mutationFn: async (conversationId: string) => {
      return await apiRequest(`/api/chat/conversations/${conversationId}/grant-voice`, "POST", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      toast({
        title: "Voice Granted",
        description: "User can now send messages",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to grant voice",
        variant: "destructive",
      });
    },
  });

  const closeConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      return await apiRequest(`/api/chat/conversations/${conversationId}/close`, "POST", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      toast({
        title: "Conversation Closed",
        description: "Conversation has been closed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to close conversation",
        variant: "destructive",
      });
    },
  });

  // Statistics
  const activeConversations = conversations.filter(c => c.status === 'active');
  const silencedUsers = conversations.filter(c => c.isSilenced && c.status === 'active');
  const resolvedToday = conversations.filter(c => 
    c.resolvedAt && new Date(c.resolvedAt).toDateString() === new Date().toDateString()
  );
  const urgentConversations = conversations.filter(c => 
    c.priority === 'urgent' && c.status === 'active'
  );

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'high': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'normal': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'resolved': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'closed': return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  return (
    <ScrollArea className="h-full w-full">
      <div className="flex flex-col gap-6 p-4 md:p-6 max-w-7xl mx-auto pb-8">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-blue-900 to-indigo-800 flex items-center justify-center shadow-lg shadow-blue-900/30 p-2">
              <WFLogoCompact size={28} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Support Dashboard</h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                Manage support conversations and help users in real-time
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Conversations</CardTitle>
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeConversations.length}</div>
            <p className="text-xs text-muted-foreground">
              Currently in progress
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Silenced Users</CardTitle>
            <MicOff className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{silencedUsers.length}</div>
            <p className="text-xs text-muted-foreground">
              Waiting for voice permission
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Urgent Tickets</CardTitle>
            <AlertCircle className="w-4 h-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{urgentConversations.length}</div>
            <p className="text-xs text-muted-foreground">
              Require immediate attention
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved Today</CardTitle>
            <CheckCircle className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{resolvedToday.length}</div>
            <p className="text-xs text-muted-foreground">
              Tickets closed today
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Quick Actions
          </CardTitle>
          <CardDescription>
            Jump to common support tasks
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/support/chat">
            <Button className="bg-indigo-600 hover:bg-indigo-700" data-testid="button-live-chat">
              <MessageSquare className="w-4 h-4 mr-2" />
              Open Live Chat
            </Button>
          </Link>
          <Link href="/support/tickets">
            <Button variant="outline" data-testid="button-all-tickets">
              <Users className="w-4 h-4 mr-2" />
              View All Tickets
            </Button>
          </Link>
          <Button variant="outline" disabled>
            <Bot className="w-4 h-4 mr-2" />
            AI Bot Settings
            <Sparkles className="w-3 h-3 ml-1 text-purple-500" />
          </Button>
        </CardContent>
      </Card>

      {/* Active Conversations List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Active Conversations
            {activeConversations.length > 0 && (
              <Badge variant="outline" className="ml-2">
                {activeConversations.length}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Users currently waiting for support
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading conversations...
            </div>
          ) : activeConversations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No active conversations at the moment</p>
              <p className="text-sm mt-1">You're all caught up!</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {activeConversations.map((conv) => (
                  <Card key={conv.id} className="border-2">
                    <CardContent className="pt-6">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="flex-1 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-base">
                              {conv.customerName || 'Anonymous User'}
                            </h3>
                            <Badge variant="outline" className={getPriorityColor(conv.priority || 'normal')}>
                              {conv.priority || 'normal'}
                            </Badge>
                            <Badge variant="outline" className={getStatusColor(conv.status)}>
                              {conv.status}
                            </Badge>
                            {conv.isSilenced && (
                              <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
                                <MicOff className="w-3 h-3 mr-1" />
                                Silenced
                              </Badge>
                            )}
                          </div>

                          {conv.subject && (
                            <p className="text-sm text-muted-foreground">
                              Subject: {conv.subject}
                            </p>
                          )}

                          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                            {conv.customerEmail && (
                              <span>Email: {conv.customerEmail}</span>
                            )}
                            {conv.createdAt && (
                              <span>
                                Created: {new Date(conv.createdAt).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {conv.isSilenced && (
                            <Button
                              size="sm"
                              onClick={() => grantVoice.mutate(conv.id)}
                              disabled={grantVoice.isPending}
                              className="bg-green-600 hover:bg-green-700"
                              data-testid={`button-grant-voice-${conv.id}`}
                            >
                              <Mic className="w-3 h-3 mr-1" />
                              Grant Voice
                            </Button>
                          )}
                          <Link href="/support/chat">
                            <Button size="sm" variant="outline" data-testid={`button-open-chat-${conv.id}`}>
                              <ExternalLink className="w-3 h-3 mr-1" />
                              Open Chat
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => closeConversation.mutate(conv.id)}
                            disabled={closeConversation.isPending}
                            data-testid={`button-close-${conv.id}`}
                          >
                            Close
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Help Bot Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-purple-500" />
            AI Help Bot Status
            <Sparkles className="w-4 h-4 text-purple-500" />
          </CardTitle>
          <CardDescription>
            Automated assistance powered by AI
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">help_bot is online and ready</p>
              <p className="text-xs text-muted-foreground">
                Greeting users and providing AI-powered assistance 24/7
              </p>
            </div>
            <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">
              <Activity className="w-3 h-3 mr-1" />
              Active
            </Badge>
          </div>
        </CardContent>
      </Card>
      </div>
    </ScrollArea>
  );
}
