// Admin Support Dashboard - Non-technical customer support interface
// For support staff to help customers without using shell/SQL

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Search,
  Building2,
  Users,
  DollarSign,
  Ticket,
  Mail,
  CreditCard,
  Shield,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  AlertCircle,
} from "lucide-react";

interface CustomerSearchResult {
  workspace: {
    id: string;
    name: string;
    companyName?: string;
    subscriptionTier?: string;
    subscriptionStatus?: string;
  };
  owner: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
  subscription?: {
    plan: string;
    status: string;
  };
  stats: {
    employeeCount: number;
    clientCount: number;
    invoiceCount: number;
    activeTickets: number;
  };
}

interface WorkspaceDetail {
  workspace: any;
  owner: any;
  subscription?: any;
  users: Array<{ user: any; employee?: any }>;
  recentActivity: Array<{
    type: string;
    description: string;
    timestamp: string;
  }>;
  billing: {
    totalRevenue: string;
    paidInvoices: number;
    pendingInvoices: number;
    stripeConnected: boolean;
  };
  tickets: any[];
}

export default function AdminSupportPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<string | null>(null);
  const [actionData, setActionData] = useState<any>({});

  // Debounce search query
  useState(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  });

  // Fetch platform stats
  const { data: platformStats } = useQuery({
    queryKey: ["/api/admin/support/stats"],
    enabled: true,
  });

  // Search customers
  const { data: searchResults, isLoading: searchLoading } = useQuery<CustomerSearchResult[]>({
    queryKey: ["/api/admin/support/search", debouncedQuery],
    enabled: debouncedQuery.length >= 2,
  });

  // Get workspace detail
  const { data: workspaceDetail, isLoading: detailLoading } = useQuery<WorkspaceDetail>({
    queryKey: ["/api/admin/support/workspace", selectedWorkspace],
    enabled: !!selectedWorkspace,
  });

  // Mutations
  const changeRoleMutation = useMutation({
    mutationFn: (data: { employeeId: string; newRole: string }) =>
      apiRequest("/api/admin/support/change-role", "POST", data),
    onSuccess: () => {
      toast({ title: "Role updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/workspace", selectedWorkspace] });
      setActionDialog(null);
    },
  });

  const updateSubscriptionMutation = useMutation({
    mutationFn: (data: { workspaceId: string; newTier: string }) =>
      apiRequest("/api/admin/support/update-subscription", "POST", data),
    onSuccess: () => {
      toast({ title: "Subscription updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/workspace", selectedWorkspace] });
      setActionDialog(null);
    },
  });

  const createTicketMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("/api/admin/support/create-ticket", "POST", data),
    onSuccess: () => {
      toast({ title: "Support ticket created" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/workspace", selectedWorkspace] });
      setActionDialog(null);
    },
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Support Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Help customers with account, billing, and access issues
          </p>
        </div>
      </div>

      {/* Platform Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Workspaces</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-workspaces">
              {(platformStats as any)?.totalWorkspaces || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-subscriptions">
              {(platformStats as any)?.activeSubscriptions || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Tickets</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-tickets">
              {(platformStats as any)?.openTickets || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-revenue">
              ${(platformStats as any)?.totalRevenue || "0"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Search Customers</CardTitle>
          <CardDescription>
            Search by email, workspace name, or company name
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search for a customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-customers"
            />
          </div>

          {/* Search Results */}
          {searchLoading && (
            <div className="mt-4 text-center text-muted-foreground">
              Searching...
            </div>
          )}

          {searchResults && searchResults.length > 0 && (
            <div className="mt-4 space-y-3">
              {searchResults.map((result) => (
                <Card
                  key={result.workspace.id}
                  className="hover-elevate cursor-pointer"
                  onClick={() => setSelectedWorkspace(result.workspace.id)}
                  data-testid={`card-customer-${result.workspace.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{result.workspace.name}</h3>
                          <Badge variant="outline">
                            {result.subscription?.plan || "free"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {result.owner.email}
                        </p>
                        {result.workspace.companyName && (
                          <p className="text-sm text-muted-foreground">
                            {result.workspace.companyName}
                          </p>
                        )}
                      </div>

                      <div className="flex gap-4 text-sm">
                        <div className="text-center">
                          <div className="font-semibold">{result.stats.employeeCount}</div>
                          <div className="text-muted-foreground">Employees</div>
                        </div>
                        <div className="text-center">
                          <div className="font-semibold">{result.stats.clientCount}</div>
                          <div className="text-muted-foreground">Clients</div>
                        </div>
                        <div className="text-center">
                          <div className="font-semibold">{result.stats.activeTickets}</div>
                          <div className="text-muted-foreground">Tickets</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {searchResults && searchResults.length === 0 && debouncedQuery.length >= 2 && (
            <div className="mt-4 text-center text-muted-foreground">
              No customers found matching "{debouncedQuery}"
            </div>
          )}
        </CardContent>
      </Card>

      {/* Workspace Detail */}
      {selectedWorkspace && workspaceDetail && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{workspaceDetail.workspace.name}</CardTitle>
                <CardDescription>
                  {workspaceDetail.owner.email}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                onClick={() => setSelectedWorkspace(null)}
                data-testid="button-close-detail"
              >
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
                <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
                <TabsTrigger value="billing" data-testid="tab-billing">Billing</TabsTrigger>
                <TabsTrigger value="tickets" data-testid="tab-tickets">Tickets</TabsTrigger>
                <TabsTrigger value="actions" data-testid="tab-actions">Actions</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Subscription</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Badge>{workspaceDetail.subscription?.plan || "free"}</Badge>
                      <p className="text-sm text-muted-foreground mt-2">
                        Status: {workspaceDetail.subscription?.status || "active"}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Stripe</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {workspaceDetail.billing.stripeConnected ? (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-sm">Connected</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-500" />
                          <span className="text-sm">Not Connected</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Recent Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {workspaceDetail.recentActivity.slice(0, 5).map((activity, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-muted-foreground">
                            {new Date(activity.timestamp).toLocaleString()}
                          </span>
                          <span>{activity.description}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Users Tab */}
              <TabsContent value="users" className="space-y-4">
                {workspaceDetail.users.map((userEntry, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">
                            {userEntry.user.firstName} {userEntry.user.lastName}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {userEntry.user.email}
                          </p>
                          {userEntry.employee && (
                            <Badge variant="outline" className="mt-1">
                              {userEntry.employee.workspaceRole}
                            </Badge>
                          )}
                        </div>
                        {userEntry.employee && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setActionData({ employeeId: userEntry.employee.id });
                              setActionDialog("changeRole");
                            }}
                            data-testid={`button-change-role-${i}`}
                          >
                            Change Role
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              {/* Billing Tab */}
              <TabsContent value="billing" className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Total Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">
                        ${workspaceDetail.billing.totalRevenue}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Paid Invoices</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">
                        {workspaceDetail.billing.paidInvoices}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Pending Invoices</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">
                        {workspaceDetail.billing.pendingInvoices}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Tickets Tab */}
              <TabsContent value="tickets" className="space-y-4">
                {workspaceDetail.tickets.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No support tickets
                  </div>
                ) : (
                  workspaceDetail.tickets.map((ticket) => (
                    <Card key={ticket.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold">{ticket.subject}</p>
                              <Badge>{ticket.status}</Badge>
                              <Badge variant="outline">{ticket.priority}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {ticket.ticketNumber}
                            </p>
                            <p className="text-sm mt-2">{ticket.description}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              {/* Actions Tab */}
              <TabsContent value="actions" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Button
                    onClick={() => setActionDialog("updateSubscription")}
                    data-testid="button-update-subscription"
                  >
                    <TrendingUp className="mr-2 h-4 w-4" />
                    Update Subscription
                  </Button>

                  <Button
                    onClick={() => setActionDialog("createTicket")}
                    data-testid="button-create-ticket"
                  >
                    <Ticket className="mr-2 h-4 w-4" />
                    Create Support Ticket
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      toast({ title: "Feature coming soon", description: "Password reset email functionality requires Resend API key activation" });
                    }}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Send Password Reset
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      toast({ title: "Stripe diagnostics", description: `Connected: ${workspaceDetail.billing.stripeConnected}` });
                    }}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    Check Stripe Status
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Action Dialogs */}
      {/* Change Role Dialog */}
      <Dialog open={actionDialog === "changeRole"} onOpenChange={() => setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
            <DialogDescription>
              Update the workspace role for this user
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="newRole">New Role</Label>
              <Select
                value={actionData.newRole}
                onValueChange={(value) => setActionData({ ...actionData, newRole: value })}
              >
                <SelectTrigger id="newRole" data-testid="select-new-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                changeRoleMutation.mutate({
                  employeeId: actionData.employeeId,
                  newRole: actionData.newRole,
                })
              }
              disabled={changeRoleMutation.isPending}
              data-testid="button-confirm-change-role"
            >
              {changeRoleMutation.isPending ? "Updating..." : "Update Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Subscription Dialog */}
      <Dialog open={actionDialog === "updateSubscription"} onOpenChange={() => setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Subscription</DialogTitle>
            <DialogDescription>
              Change the subscription tier for this workspace
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="newTier">New Tier</Label>
              <Select
                value={actionData.newTier}
                onValueChange={(value) => setActionData({ ...actionData, newTier: value })}
              >
                <SelectTrigger id="newTier" data-testid="select-new-tier">
                  <SelectValue placeholder="Select tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                updateSubscriptionMutation.mutate({
                  workspaceId: selectedWorkspace!,
                  newTier: actionData.newTier,
                })
              }
              disabled={updateSubscriptionMutation.isPending}
              data-testid="button-confirm-update-subscription"
            >
              {updateSubscriptionMutation.isPending ? "Updating..." : "Update Subscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Ticket Dialog */}
      <Dialog open={actionDialog === "createTicket"} onOpenChange={() => setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Support Ticket</DialogTitle>
            <DialogDescription>
              Create a ticket on behalf of the customer
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="ticketSubject">Subject</Label>
              <Input
                id="ticketSubject"
                value={actionData.subject || ""}
                onChange={(e) => setActionData({ ...actionData, subject: e.target.value })}
                placeholder="Brief description of the issue"
                data-testid="input-ticket-subject"
              />
            </div>
            <div>
              <Label htmlFor="ticketDescription">Description</Label>
              <Textarea
                id="ticketDescription"
                value={actionData.description || ""}
                onChange={(e) => setActionData({ ...actionData, description: e.target.value })}
                placeholder="Detailed description..."
                data-testid="textarea-ticket-description"
              />
            </div>
            <div>
              <Label htmlFor="ticketType">Type</Label>
              <Select
                value={actionData.type}
                onValueChange={(value) => setActionData({ ...actionData, type: value })}
              >
                <SelectTrigger id="ticketType" data-testid="select-ticket-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="support">Support</SelectItem>
                  <SelectItem value="report_request">Report Request</SelectItem>
                  <SelectItem value="template_request">Template Request</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ticketPriority">Priority</Label>
              <Select
                value={actionData.priority}
                onValueChange={(value) => setActionData({ ...actionData, priority: value })}
              >
                <SelectTrigger id="ticketPriority" data-testid="select-ticket-priority">
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                createTicketMutation.mutate({
                  workspaceId: selectedWorkspace,
                  subject: actionData.subject,
                  description: actionData.description,
                  type: actionData.type,
                  priority: actionData.priority,
                })
              }
              disabled={createTicketMutation.isPending}
              data-testid="button-confirm-create-ticket"
            >
              {createTicketMutation.isPending ? "Creating..." : "Create Ticket"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
