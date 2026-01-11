/**
 * My Tickets Page - User-facing ticket portal
 * 
 * Shows user's submitted support tickets with status tracking
 */

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Ticket, Clock, CheckCircle, AlertCircle, 
  MessageSquare, Loader2, Inbox, ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'wouter';

interface SupportTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  description?: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt?: string;
  resolvedAt?: string;
  resolution?: string;
}

export default function MyTickets() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: ticketsData, isLoading } = useQuery<{ tickets: SupportTicket[] }>({
    queryKey: ['/api/support/chat/my-tickets'],
    enabled: !!user,
  });

  const tickets = ticketsData?.tickets || [];

  const openTickets = tickets.filter(t => ['open', 'in_progress', 'pending'].includes(t.status));
  const resolvedTickets = tickets.filter(t => ['resolved', 'closed'].includes(t.status));

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">Open</Badge>;
      case 'in_progress':
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">In Progress</Badge>;
      case 'pending':
        return <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/30">Pending</Badge>;
      case 'resolved':
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">Resolved</Badge>;
      case 'closed':
        return <Badge variant="secondary">Closed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <Badge variant="destructive">Urgent</Badge>;
      case 'high':
        return <Badge className="bg-orange-500">High</Badge>;
      case 'normal':
        return <Badge variant="secondary">Normal</Badge>;
      case 'low':
        return <Badge variant="outline">Low</Badge>;
      default:
        return null;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!user) {
    return (
      <div className="container max-w-4xl mx-auto p-4">
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-8 text-center">
            <Ticket className="w-12 h-12 text-muted-foreground mb-3" />
            <h3 className="font-semibold">Sign in to view your tickets</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Please sign in to access your support ticket history.
            </p>
            <Button className="mt-4" onClick={() => setLocation('/login')}>
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Ticket className="w-6 h-6 text-primary" />
            My Support Tickets
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track and manage your support requests
          </p>
        </div>
        <Button onClick={() => setLocation('/support')}>
          <MessageSquare className="w-4 h-4 mr-2" />
          New Request
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{tickets.length}</div>
            <p className="text-xs text-muted-foreground">Total Tickets</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-500">{openTickets.length}</div>
            <p className="text-xs text-muted-foreground">Open</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-500">{resolvedTickets.length}</div>
            <p className="text-xs text-muted-foreground">Resolved</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open" className="gap-2">
            <AlertCircle className="w-4 h-4" />
            Open ({openTickets.length})
          </TabsTrigger>
          <TabsTrigger value="resolved" className="gap-2">
            <CheckCircle className="w-4 h-4" />
            Resolved ({resolvedTickets.length})
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-2">
            <Inbox className="w-4 h-4" />
            All ({tickets.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="mt-4">
          <TicketList 
            tickets={openTickets} 
            isLoading={isLoading}
            getStatusBadge={getStatusBadge}
            getPriorityBadge={getPriorityBadge}
            formatDate={formatDate}
          />
        </TabsContent>

        <TabsContent value="resolved" className="mt-4">
          <TicketList 
            tickets={resolvedTickets} 
            isLoading={isLoading}
            getStatusBadge={getStatusBadge}
            getPriorityBadge={getPriorityBadge}
            formatDate={formatDate}
          />
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <TicketList 
            tickets={tickets} 
            isLoading={isLoading}
            getStatusBadge={getStatusBadge}
            getPriorityBadge={getPriorityBadge}
            formatDate={formatDate}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TicketList({ 
  tickets, 
  isLoading, 
  getStatusBadge, 
  getPriorityBadge,
  formatDate 
}: {
  tickets: SupportTicket[];
  isLoading: boolean;
  getStatusBadge: (status: string) => React.ReactNode;
  getPriorityBadge: (priority: string) => React.ReactNode;
  formatDate: (date: string) => string;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tickets.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
          <Inbox className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <h3 className="font-semibold">No tickets found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            You don't have any support tickets in this category.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {tickets.map((ticket) => (
        <Card key={ticket.id} className="hover-elevate">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="font-mono text-xs">
                    #{ticket.ticketNumber}
                  </Badge>
                  {getStatusBadge(ticket.status)}
                  {getPriorityBadge(ticket.priority)}
                </div>
                <h3 className="font-medium mt-2">{ticket.subject}</h3>
                {ticket.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {ticket.description}
                  </p>
                )}
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Created {formatDate(ticket.createdAt)}
                  </span>
                  {ticket.resolvedAt && (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="w-3 h-3" />
                      Resolved {formatDate(ticket.resolvedAt)}
                    </span>
                  )}
                </div>
                {ticket.resolution && (
                  <div className="mt-3 p-2 bg-green-500/5 rounded border border-green-500/20">
                    <p className="text-xs font-medium text-green-600">Resolution:</p>
                    <p className="text-sm mt-1">{ticket.resolution}</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
