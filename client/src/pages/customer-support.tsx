import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  LifeBuoy,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  Plus,
  Search,
  Filter,
} from "lucide-react";

interface SupportTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export default function CustomerSupport() {
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    subject: "",
    description: "",
    type: "support",
    priority: "normal",
  });

  // Fetch all tickets for current workspace
  const { data: tickets = [], isLoading } = useQuery<SupportTicket[]>({
    queryKey: ["/api/support/tickets"],
  });

  // Create ticket mutation
  const createTicketMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await apiRequest("POST", "/api/support/tickets", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      toast({
        title: "Success",
        description: "Support ticket created successfully",
      });
      setFormData({
        subject: "",
        description: "",
        type: "support",
        priority: "normal",
      });
      setIsCreating(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!formData.subject.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide a subject",
        variant: "destructive",
      });
      return;
    }

    if (!formData.description.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide a description",
        variant: "destructive",
      });
      return;
    }

    createTicketMutation.mutate(formData);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; icon: any }> = {
      open: { variant: "default", icon: AlertCircle },
      in_progress: { variant: "secondary", icon: Clock },
      resolved: { variant: "outline", icon: CheckCircle2 },
      closed: { variant: "outline", icon: CheckCircle2 },
    };

    const config = variants[status] || variants.open;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status.replace("_", " ").toUpperCase()}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      low: "bg-slate-500",
      normal: "bg-blue-500",
      high: "bg-orange-500",
      urgent: "bg-red-500",
    };

    return (
      <Badge className={`${colors[priority] || colors.normal} text-white`}>
        {priority.toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full h-full overflow-auto">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-1" data-testid="text-support-title">
              Customer Support
            </h2>
            <p className="text-sm sm:text-base text-[hsl(var(--cad-text-secondary))]">
              Submit tickets and track support requests
            </p>
          </div>

          <Button
            onClick={() => setIsCreating(!isCreating)}
            className="bg-[hsl(var(--cad-blue))] hover:bg-[hsl(var(--cad-blue))]/90"
            data-testid="button-create-ticket"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Ticket
          </Button>
        </div>

        {/* Create Ticket Form */}
        {isCreating && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LifeBuoy className="h-5 w-5 text-[hsl(var(--cad-blue))]" />
                Create Support Ticket
              </CardTitle>
              <CardDescription>
                Describe your issue and our support team will assist you
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger id="type" data-testid="select-ticket-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="support">General Support</SelectItem>
                      <SelectItem value="report_request">Report Request</SelectItem>
                      <SelectItem value="template_request">Template Request</SelectItem>
                      <SelectItem value="billing">Billing Question</SelectItem>
                      <SelectItem value="technical">Technical Issue</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value) => setFormData({ ...formData, priority: value })}
                  >
                    <SelectTrigger id="priority" data-testid="select-ticket-priority">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Subject *</Label>
                <Input
                  id="subject"
                  placeholder="Brief description of your issue"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  data-testid="input-ticket-subject"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Provide detailed information about your issue..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={6}
                  data-testid="textarea-ticket-description"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleSubmit}
                  disabled={createTicketMutation.isPending}
                  className="bg-[hsl(var(--cad-blue))] hover:bg-[hsl(var(--cad-blue))]/90"
                  data-testid="button-submit-ticket"
                >
                  <Send className="mr-2 h-4 w-4" />
                  {createTicketMutation.isPending ? "Submitting..." : "Submit Ticket"}
                </Button>
                <Button variant="outline" onClick={() => setIsCreating(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tickets List */}
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList className="bg-[hsl(var(--cad-chrome))]">
            <TabsTrigger value="all" data-testid="tab-all-tickets">All Tickets</TabsTrigger>
            <TabsTrigger value="open" data-testid="tab-open-tickets">Open</TabsTrigger>
            <TabsTrigger value="in_progress" data-testid="tab-progress-tickets">In Progress</TabsTrigger>
            <TabsTrigger value="resolved" data-testid="tab-resolved-tickets">Resolved</TabsTrigger>
          </TabsList>

          {["all", "open", "in_progress", "resolved"].map((status) => (
            <TabsContent key={status} value={status} className="space-y-4">
              {isLoading ? (
                <div className="text-center py-12 text-[hsl(var(--cad-text-secondary))]">
                  Loading tickets...
                </div>
              ) : tickets.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <MessageSquare className="h-12 w-12 mx-auto mb-4 text-[hsl(var(--cad-text-tertiary))]" />
                    <p className="text-[hsl(var(--cad-text-secondary))]">
                      No support tickets found. Create one to get started.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {tickets
                    .filter((ticket) => status === "all" || ticket.status === status)
                    .map((ticket) => (
                      <Card key={ticket.id} className="hover-elevate" data-testid={`ticket-${ticket.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="font-mono text-sm text-[hsl(var(--cad-text-tertiary))]">
                                  {ticket.ticketNumber}
                                </span>
                                {getStatusBadge(ticket.status)}
                                {getPriorityBadge(ticket.priority)}
                              </div>

                              <h3 className="font-semibold text-[hsl(var(--cad-text-primary))] mb-1">
                                {ticket.subject}
                              </h3>

                              <p className="text-sm text-[hsl(var(--cad-text-secondary))] line-clamp-2">
                                {ticket.description}
                              </p>

                              <div className="flex items-center gap-4 mt-3 text-xs text-[hsl(var(--cad-text-tertiary))]">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {new Date(ticket.createdAt).toLocaleDateString()}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  {ticket.type.replace("_", " ")}
                                </Badge>
                              </div>
                            </div>

                            <Button variant="outline" size="sm">
                              View Details
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>

        {/* Help Resources */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-[hsl(var(--cad-blue))]" />
              Need Help?
            </CardTitle>
            <CardDescription>
              Get support through multiple channels
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">📧 Email Support</h4>
                <p className="text-sm text-[hsl(var(--cad-text-secondary))]">
                  support@workforceos.com
                </p>
                <p className="text-xs text-[hsl(var(--cad-text-tertiary))]">
                  Response within 24 hours
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-sm">📞 Phone Support</h4>
                <p className="text-sm text-[hsl(var(--cad-text-secondary))]">
                  1-800-WORKFORCE
                </p>
                <p className="text-xs text-[hsl(var(--cad-text-tertiary))]">
                  Mon-Fri 9AM-6PM EST
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-sm">💬 Live Chat</h4>
                <p className="text-sm text-[hsl(var(--cad-text-secondary))]">
                  Available in-app
                </p>
                <p className="text-xs text-[hsl(var(--cad-text-tertiary))]">
                  Enterprise plans only
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
