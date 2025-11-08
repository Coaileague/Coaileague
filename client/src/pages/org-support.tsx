import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { 
  Ticket, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  XCircle,
  ArrowUp,
  Plus,
  MessageSquare
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SupportTicket {
  id: string;
  workspaceId: string;
  ticketNumber: string;
  type: string;
  priority: string;
  subject: string;
  description: string;
  status: string;
  isEscalated: boolean;
  escalatedAt?: string;
  escalatedBy?: string;
  escalatedReason?: string;
  platformAssignedTo?: string;
  resolution?: string;
  createdAt: string;
  updatedAt: string;
}

export default function OrgSupport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEscalateDialog, setShowEscalateDialog] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  
  // Check if user is org leader
  const isOrgLeader = ['org_owner', 'org_admin', 'department_manager'].includes((user as any)?.role || '');

  // Fetch org support tickets
  const { data: tickets = [], isLoading } = useQuery<SupportTicket[]>({
    queryKey: ["/api/support/tickets"],
  });

  // Create ticket mutation
  const createTicketMutation = useMutation({
    mutationFn: async (data: { subject: string; description: string; type: string; priority: string }) => {
      return await apiRequest("POST", "/api/support/tickets", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      setShowCreateDialog(false);
      toast({
        title: "Ticket Created",
        description: "Your support ticket has been submitted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create support ticket.",
        variant: "destructive",
      });
    },
  });

  // Escalate ticket mutation
  const escalateTicketMutation = useMutation({
    mutationFn: async ({ ticketId, reason }: { ticketId: string; reason: string }) => {
      return await apiRequest("POST", `/api/support/tickets/${ticketId}/escalate`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      setShowEscalateDialog(false);
      setSelectedTicket(null);
      toast({
        title: "Ticket Escalated",
        description: "Ticket has been escalated to AutoForce™ platform support.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Escalation Failed",
        description: error.message || "Failed to escalate ticket.",
        variant: "destructive",
      });
    },
  });

  const handleCreateTicket = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createTicketMutation.mutate({
      subject: formData.get("subject") as string,
      description: formData.get("description") as string,
      type: formData.get("type") as string,
      priority: formData.get("priority") as string,
    });
  };

  const handleEscalate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    if (selectedTicket) {
      escalateTicketMutation.mutate({
        ticketId: selectedTicket.id,
        reason: formData.get("reason") as string,
      });
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "bg-destructive text-destructive-foreground";
      case "high": return "bg-orange-500 text-white";
      case "normal": return "bg-blue-500 text-white";
      case "low": return "bg-gray-500 text-white";
      default: return "bg-gray-500 text-white";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "open": return <Clock className="w-4 h-4" />;
      case "in_progress": return <MessageSquare className="w-4 h-4" />;
      case "resolved": return <CheckCircle2 className="w-4 h-4" />;
      case "closed": return <XCircle className="w-4 h-4" />;
      default: return <Ticket className="w-4 h-4" />;
    }
  };

  const openTickets = tickets.filter(t => t.status === 'open' || t.status === 'in_progress');
  const resolvedTickets = tickets.filter(t => t.status === 'resolved' || t.status === 'closed');
  const escalatedTickets = tickets.filter(t => t.isEscalated);

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Organization Support</h1>
          <p className="text-muted-foreground">
            Manage internal support tickets and escalate to platform support when needed
          </p>
        </div>
        <Button 
          onClick={() => setShowCreateDialog(true)}
          className="gap-2"
          data-testid="button-create-ticket"
        >
          <Plus className="w-4 h-4" />
          New Ticket
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tickets.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Open Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{openTickets.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{resolvedTickets.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Escalated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{escalatedTickets.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tickets Tabs */}
      <Tabs defaultValue="open" className="space-y-4">
        <TabsList>
          <TabsTrigger value="open" data-testid="tab-open-tickets">Open ({openTickets.length})</TabsTrigger>
          <TabsTrigger value="resolved" data-testid="tab-resolved-tickets">Resolved ({resolvedTickets.length})</TabsTrigger>
          <TabsTrigger value="escalated" data-testid="tab-escalated-tickets">Escalated ({escalatedTickets.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                Loading tickets...
              </CardContent>
            </Card>
          ) : openTickets.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No open tickets
              </CardContent>
            </Card>
          ) : (
            openTickets.map((ticket) => (
              <Card key={ticket.id} data-testid={`ticket-card-${ticket.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{ticket.subject}</CardTitle>
                        {ticket.isEscalated && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Escalated
                          </Badge>
                        )}
                      </div>
                      <CardDescription>
                        #{ticket.ticketNumber} • Created {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={getPriorityColor(ticket.priority)}>
                        {ticket.priority}
                      </Badge>
                      <Badge variant="outline" className="gap-1">
                        {getStatusIcon(ticket.status)}
                        {ticket.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">{ticket.description}</p>
                  {isOrgLeader && !ticket.isEscalated && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        setSelectedTicket(ticket);
                        setShowEscalateDialog(true);
                      }}
                      data-testid={`button-escalate-${ticket.id}`}
                    >
                      <ArrowUp className="w-4 h-4" />
                      Escalate to Platform Support
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="resolved" className="space-y-4">
          {resolvedTickets.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No resolved tickets
              </CardContent>
            </Card>
          ) : (
            resolvedTickets.map((ticket) => (
              <Card key={ticket.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{ticket.subject}</CardTitle>
                      <CardDescription>
                        #{ticket.ticketNumber} • Resolved {ticket.resolution && formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="gap-1 bg-muted/30 text-primary border-primary">
                      <CheckCircle2 className="w-3 h-3" />
                      {ticket.status}
                    </Badge>
                  </div>
                </CardHeader>
                {ticket.resolution && (
                  <CardContent>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Resolution:</Label>
                      <p className="text-sm text-muted-foreground">{ticket.resolution}</p>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="escalated" className="space-y-4">
          {escalatedTickets.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No escalated tickets
              </CardContent>
            </Card>
          ) : (
            escalatedTickets.map((ticket) => (
              <Card key={ticket.id} className="border-orange-200 bg-orange-50/50">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{ticket.subject}</CardTitle>
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Escalated to Platform
                        </Badge>
                      </div>
                      <CardDescription>
                        #{ticket.ticketNumber} • Escalated {ticket.escalatedAt && formatDistanceToNow(new Date(ticket.escalatedAt), { addSuffix: true })}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="gap-1">
                      {getStatusIcon(ticket.status)}
                      {ticket.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">Escalation Reason:</Label>
                    <p className="text-sm text-muted-foreground mt-1">{ticket.escalatedReason}</p>
                  </div>
                  {ticket.resolution && (
                    <div>
                      <Label className="text-sm font-medium">Platform Resolution:</Label>
                      <p className="text-sm text-muted-foreground mt-1">{ticket.resolution}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Create Ticket Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent data-testid="dialog-create-ticket">
          <DialogHeader>
            <DialogTitle>Create Support Ticket</DialogTitle>
            <DialogDescription>
              Submit a new support request to your organization's support team
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateTicket} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject">Subject *</Label>
              <Input
                id="subject"
                name="subject"
                required
                placeholder="Brief description of the issue"
                data-testid="input-ticket-subject"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Type *</Label>
              <Select name="type" required defaultValue="support">
                <SelectTrigger data-testid="select-ticket-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="support">General Support</SelectItem>
                  <SelectItem value="technical">Technical Issue</SelectItem>
                  <SelectItem value="access">Access Request</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priority *</Label>
              <Select name="priority" required defaultValue="normal">
                <SelectTrigger data-testid="select-ticket-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                name="description"
                required
                placeholder="Provide detailed information about your request"
                rows={4}
                data-testid="input-ticket-description"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
                data-testid="button-cancel-create"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createTicketMutation.isPending}
                data-testid="button-submit-ticket"
              >
                {createTicketMutation.isPending ? "Creating..." : "Create Ticket"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Escalate Dialog */}
      <Dialog open={showEscalateDialog} onOpenChange={setShowEscalateDialog}>
        <DialogContent data-testid="dialog-escalate-ticket">
          <DialogHeader>
            <DialogTitle>Escalate to Platform Support</DialogTitle>
            <DialogDescription>
              Escalate this ticket to AutoForce™ platform support for advanced assistance
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEscalate} className="space-y-4">
            <div className="space-y-2">
              <Label>Ticket</Label>
              <div className="p-3 bg-muted rounded-md">
                <p className="font-medium">{selectedTicket?.subject}</p>
                <p className="text-sm text-muted-foreground">#{selectedTicket?.ticketNumber}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Escalation Reason *</Label>
              <Textarea
                id="reason"
                name="reason"
                required
                placeholder="Explain why this ticket needs platform support escalation"
                rows={4}
                data-testid="input-escalation-reason"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowEscalateDialog(false);
                  setSelectedTicket(null);
                }}
                data-testid="button-cancel-escalate"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={escalateTicketMutation.isPending}
                variant="destructive"
                data-testid="button-confirm-escalate"
              >
                {escalateTicketMutation.isPending ? "Escalating..." : "Escalate Ticket"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
