import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Users,
  Shield,
  Clock,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Activity,
  RefreshCw,
  UserCog,
  Calendar,
  Mail,
  FileText,
  ArrowUpRight,
  Lock,
  Unlock,
  UserX,
  ListTodo,
  Search,
  MoreVertical,
  Phone,
  MapPin,
  AlertOctagon,
  CheckCircle,
  XCircle,
  Eye,
  ExternalLink,
  Home
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

interface LeaderStats {
  headcount: {
    total: number;
    active: number;
    onLeave: number;
    pendingOnboarding: number;
  };
  compliance: {
    compliant: number;
    expiringSoon: number;
    overdue: number;
  };
  pendingApprovals: {
    scheduleSwaps: number;
    timeAdjustments: number;
    ptoRequests: number;
  };
  recentActivity: {
    actionCount: number;
    escalationCount: number;
  };
}

interface PendingTask {
  id: string;
  type: 'schedule_swap' | 'time_adjustment' | 'pto_request' | 'compliance_review';
  title: string;
  description: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  employee: {
    id: string;
    name: string;
  };
  requestedAt: string;
}

interface RecentAction {
  id: string;
  action: string;
  targetEmployee: string;
  performedBy: string;
  performedAt: string;
  status: 'completed' | 'pending' | 'failed';
}

// Form schemas
const resetPasswordSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  reason: z.string().min(10, "Reason must be at least 10 characters"),
});

const unlockAccountSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  reason: z.string().min(10, "Reason must be at least 10 characters"),
});

const updateContactSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  phone: z.string().optional(),
  address: z.string().optional(),
  reason: z.string().min(10, "Reason must be at least 10 characters"),
});

const escalationSchema = z.object({
  category: z.enum(['billing', 'compliance', 'technical', 'security', 'employee_issue', 'system_error', 'feature_request', 'other']),
  title: z.string().min(5, "Title must be at least 5 characters"),
  description: z.string().min(20, "Description must be at least 20 characters"),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
});

export default function LeadersHub() {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Dialog states
  const [resetPasswordDialog, setResetPasswordDialog] = useState(false);
  const [unlockAccountDialog, setUnlockAccountDialog] = useState(false);
  const [updateContactDialog, setUpdateContactDialog] = useState(false);
  const [escalationDialog, setEscalationDialog] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);

  // Fetch leader dashboard stats
  const { data: stats, isLoading: statsLoading } = useQuery<LeaderStats>({
    queryKey: ['/api/leaders/stats', refreshKey],
  });

  // Fetch pending tasks
  const { data: pendingTasks = [], isLoading: tasksLoading } = useQuery<PendingTask[]>({
    queryKey: ['/api/leaders/pending-tasks', refreshKey],
  });

  // Fetch recent actions
  const { data: recentActions = [], isLoading: actionsLoading } = useQuery<RecentAction[]>({
    queryKey: ['/api/leaders/recent-actions', refreshKey],
  });

  // Fetch employees (for People tab)
  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['/api/employees'],
  });

  // Fetch escalation tickets
  const { data: escalations = [] } = useQuery<any[]>({
    queryKey: ['/api/leaders/escalations'],
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'destructive';
      case 'high': return 'default';
      case 'normal': return 'secondary';
      case 'low': return 'outline';
      default: return 'secondary';
    }
  };

  const getTaskIcon = (type: string) => {
    switch (type) {
      case 'schedule_swap': return Calendar;
      case 'time_adjustment': return Clock;
      case 'pto_request': return FileCheck;
      case 'compliance_review': return Shield;
      default: return ListTodo;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'default';
      case 'in_progress': return 'secondary';
      case 'resolved': return 'outline';
      default: return 'secondary';
    }
  };

  // Form handlers
  const resetPasswordForm = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { employeeId: "", reason: "" },
  });

  const unlockAccountForm = useForm({
    resolver: zodResolver(unlockAccountSchema),
    defaultValues: { employeeId: "", reason: "" },
  });

  const updateContactForm = useForm({
    resolver: zodResolver(updateContactSchema),
    defaultValues: { employeeId: "", phone: "", address: "", reason: "" },
  });

  const escalationForm = useForm({
    resolver: zodResolver(escalationSchema),
    defaultValues: {
      category: 'other' as const,
      title: "",
      description: "",
      priority: 'normal' as const,
    },
  });

  // Mutations
  const resetPasswordMutation = useMutation({
    mutationFn: async (data: z.infer<typeof resetPasswordSchema>) => {
      return await apiRequest('POST', '/api/leaders/reset-password', data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Password reset successfully" });
      setResetPasswordDialog(false);
      resetPasswordForm.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/leaders/recent-actions'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const unlockAccountMutation = useMutation({
    mutationFn: async (data: z.infer<typeof unlockAccountSchema>) => {
      return await apiRequest('POST', '/api/leaders/unlock-account', data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Account unlocked successfully" });
      setUnlockAccountDialog(false);
      unlockAccountForm.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/leaders/recent-actions'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async (data: z.infer<typeof updateContactSchema>) => {
      return await apiRequest('PATCH', '/api/leaders/update-contact', data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Contact information updated successfully" });
      setUpdateContactDialog(false);
      updateContactForm.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/leaders/recent-actions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const escalationMutation = useMutation({
    mutationFn: async (data: z.infer<typeof escalationSchema>) => {
      return await apiRequest('POST', '/api/leaders/escalate', data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Escalation ticket created successfully" });
      setEscalationDialog(false);
      escalationForm.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/leaders/escalations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leaders/recent-actions'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredEmployees = employees.filter((emp: any) =>
    emp.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-600 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <UserCog className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-leaders-hub-title">Leaders Hub</h1>
            <p className="text-sm text-muted-foreground">
              Self-service employee management · Approvals · Support escalation
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setRefreshKey(prev => prev + 1)}
          data-testid="button-refresh-leaders"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabbed Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-5" data-testid="tabs-leaders-hub">
          <TabsTrigger value="dashboard" data-testid="tab-dashboard">
            <Home className="h-4 w-4 mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="people" data-testid="tab-people">
            <Users className="h-4 w-4 mr-2" />
            People
          </TabsTrigger>
          <TabsTrigger value="scheduling" data-testid="tab-scheduling">
            <Calendar className="h-4 w-4 mr-2" />
            Scheduling
          </TabsTrigger>
          <TabsTrigger value="issues" data-testid="tab-issues">
            <AlertOctagon className="h-4 w-4 mr-2" />
            Issues
          </TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports">
            <FileText className="h-4 w-4 mr-2" />
            Reports
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6 mt-6">
          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-blue-500">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Team Headcount</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-headcount-total">
                  {statsLoading ? "..." : stats?.headcount.total || 0}
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground mt-2">
                  <div>
                    <span className="font-medium text-primary">{stats?.headcount.active || 0}</span> active
                  </div>
                  <div>
                    <span className="font-medium text-blue-600">{stats?.headcount.onLeave || 0}</span> on leave
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-primary">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Compliance</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-compliance-total">
                  {statsLoading ? "..." : `${stats?.compliance.compliant || 0}/${stats?.headcount.total || 0}`}
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground mt-2">
                  {stats?.compliance.expiringSoon ? (
                    <div className="flex items-center gap-1 text-blue-600">
                      <AlertTriangle className="h-3 w-3" />
                      {stats.compliance.expiringSoon} expiring
                    </div>
                  ) : null}
                  {stats?.compliance.overdue ? (
                    <div className="flex items-center gap-1 text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      {stats.compliance.overdue} overdue
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-blue-500">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-pending-approvals">
                  {statsLoading ? "..." : (
                    (stats?.pendingApprovals.scheduleSwaps || 0) +
                    (stats?.pendingApprovals.timeAdjustments || 0) +
                    (stats?.pendingApprovals.ptoRequests || 0)
                  )}
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground mt-2">
                  <div>{stats?.pendingApprovals.scheduleSwaps || 0} swaps</div>
                  <div>{stats?.pendingApprovals.timeAdjustments || 0} time</div>
                  <div>{stats?.pendingApprovals.ptoRequests || 0} PTO</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-violet-500">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-recent-actions">
                  {statsLoading ? "..." : stats?.recentActivity.actionCount || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {stats?.recentActivity.escalationCount || 0} escalations to support
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Pending Tasks */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>Pending Tasks</CardTitle>
                  <CardDescription>Items requiring your attention</CardDescription>
                </div>
                {pendingTasks.length > 0 && (
                  <Badge variant="secondary" data-testid="badge-pending-count">
                    {pendingTasks.length} pending
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                {tasksLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : pendingTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <CheckCircle2 className="h-12 w-12 mb-2 text-primary" />
                    <p>All caught up! No pending tasks.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingTasks.map((task) => {
                      const TaskIcon = getTaskIcon(task.type);
                      return (
                        <Card
                          key={task.id}
                          className="hover-elevate cursor-pointer"
                          data-testid={`card-task-${task.id}`}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex gap-3 flex-1">
                                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                  <TaskIcon className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-semibold truncate">{task.title}</h4>
                                    <Badge variant={getPriorityColor(task.priority) as any} className="shrink-0">
                                      {task.priority}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                      <UserX className="h-3 w-3" />
                                      {task.employee.name}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {new Date(task.requestedAt).toLocaleDateString()}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <Button size="sm" variant="ghost" data-testid={`button-view-task-${task.id}`}>
                                <ArrowUpRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* People Tab */}
        <TabsContent value="people" className="space-y-6 mt-6">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employees..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-employees"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setResetPasswordDialog(true)} data-testid="button-reset-password-dialog">
                <Lock className="h-4 w-4 mr-2" />
                Reset Password
              </Button>
              <Button onClick={() => setUnlockAccountDialog(true)} data-testid="button-unlock-account-dialog">
                <Unlock className="h-4 w-4 mr-2" />
                Unlock Account
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Employee Directory</CardTitle>
              <CardDescription>Manage your team members</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No employees found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEmployees.map((employee: any) => (
                      <TableRow key={employee.id} data-testid={`row-employee-${employee.id}`}>
                        <TableCell className="font-medium">
                          {employee.firstName} {employee.lastName}
                        </TableCell>
                        <TableCell>{employee.email}</TableCell>
                        <TableCell>{employee.phone || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={employee.isLocked ? "destructive" : "outline"}>
                            {employee.isLocked ? 'Locked' : 'Active'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" data-testid={`button-actions-${employee.id}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedEmployee(employee);
                                  resetPasswordForm.setValue('employeeId', employee.id);
                                  setResetPasswordDialog(true);
                                }}
                                data-testid={`menu-reset-password-${employee.id}`}
                              >
                                <Lock className="h-4 w-4 mr-2" />
                                Reset Password
                              </DropdownMenuItem>
                              {employee.isLocked && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedEmployee(employee);
                                    unlockAccountForm.setValue('employeeId', employee.id);
                                    setUnlockAccountDialog(true);
                                  }}
                                  data-testid={`menu-unlock-${employee.id}`}
                                >
                                  <Unlock className="h-4 w-4 mr-2" />
                                  Unlock Account
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedEmployee(employee);
                                  updateContactForm.setValue('employeeId', employee.id);
                                  updateContactForm.setValue('phone', employee.phone || '');
                                  updateContactForm.setValue('address', employee.address || '');
                                  setUpdateContactDialog(true);
                                }}
                                data-testid={`menu-update-contact-${employee.id}`}
                              >
                                <Phone className="h-4 w-4 mr-2" />
                                Update Contact
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scheduling Tab */}
        <TabsContent value="scheduling" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Pending Approvals</CardTitle>
              <CardDescription>Review and approve schedule changes, time adjustments, and PTO requests</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="swaps">
                <TabsList>
                  <TabsTrigger value="swaps" data-testid="tab-schedule-swaps">
                    Schedule Swaps ({stats?.pendingApprovals.scheduleSwaps || 0})
                  </TabsTrigger>
                  <TabsTrigger value="time" data-testid="tab-time-adjustments">
                    Time Adjustments ({stats?.pendingApprovals.timeAdjustments || 0})
                  </TabsTrigger>
                  <TabsTrigger value="pto" data-testid="tab-pto-requests">
                    PTO Requests ({stats?.pendingApprovals.ptoRequests || 0})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="swaps" className="mt-4">
                  <div className="text-center text-muted-foreground py-8">
                    No pending schedule swaps
                  </div>
                </TabsContent>
                <TabsContent value="time" className="mt-4">
                  <div className="text-center text-muted-foreground py-8">
                    No pending time adjustments
                  </div>
                </TabsContent>
                <TabsContent value="pto" className="mt-4">
                  <div className="text-center text-muted-foreground py-8">
                    No pending PTO requests
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Issues Tab */}
        <TabsContent value="issues" className="space-y-6 mt-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Escalation Tickets</h2>
              <p className="text-sm text-muted-foreground">Escalate issues to platform support</p>
            </div>
            <Button onClick={() => setEscalationDialog(true)} data-testid="button-create-escalation">
              <Mail className="h-4 w-4 mr-2" />
              Create Escalation
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Active Escalations</CardTitle>
              <CardDescription>Track your support tickets</CardDescription>
            </CardHeader>
            <CardContent>
              {escalations.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No escalation tickets found
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ticket #</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {escalations.map((ticket: any) => (
                      <TableRow key={ticket.id} data-testid={`row-ticket-${ticket.id}`}>
                        <TableCell className="font-mono text-sm">{ticket.ticketNumber}</TableCell>
                        <TableCell className="font-medium">{ticket.title}</TableCell>
                        <TableCell className="capitalize">{ticket.category?.replace('_', ' ')}</TableCell>
                        <TableCell>
                          <Badge variant={getPriorityColor(ticket.priority) as any}>
                            {ticket.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusColor(ticket.status) as any}>
                            {ticket.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(ticket.createdAt).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Audit Trail</CardTitle>
              <CardDescription>View your recent leader actions and activity history</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                {actionsLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : recentActions.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No recent actions to display
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentActions.map((action) => (
                      <div
                        key={action.id}
                        className="flex items-start gap-4 p-3 rounded-lg hover-elevate"
                        data-testid={`action-item-${action.id}`}
                      >
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                          action.status === 'completed' ? 'bg-muted/10 text-primary' :
                          action.status === 'pending' ? 'bg-blue-500/10 text-blue-600' :
                          'bg-destructive/10 text-destructive'
                        }`}>
                          {action.status === 'completed' && <CheckCircle2 className="h-4 w-4" />}
                          {action.status === 'pending' && <Clock className="h-4 w-4" />}
                          {action.status === 'failed' && <AlertCircle className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{action.action}</p>
                          <p className="text-sm text-muted-foreground">
                            Target: {action.targetEmployee}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(action.performedAt).toLocaleString()}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          {action.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordDialog} onOpenChange={setResetPasswordDialog}>
        <DialogContent size="md" data-testid="dialog-reset-password">
          <DialogHeader>
            <DialogTitle>Reset Employee Password</DialogTitle>
            <DialogDescription>
              Reset the password for the selected employee. A new temporary password will be generated.
            </DialogDescription>
          </DialogHeader>
          <Form {...resetPasswordForm}>
            <form onSubmit={resetPasswordForm.handleSubmit((data) => resetPasswordMutation.mutate(data))} className="space-y-4">
              <FormField
                control={resetPasswordForm.control}
                name="employeeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-employee-reset">
                          <SelectValue placeholder="Select an employee" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {employees.map((emp: any) => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.firstName} {emp.lastName} ({emp.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={resetPasswordForm.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Explain why this password reset is necessary..."
                        {...field}
                        data-testid="input-reset-reason"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setResetPasswordDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={resetPasswordMutation.isPending} data-testid="button-confirm-reset">
                  {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Unlock Account Dialog */}
      <Dialog open={unlockAccountDialog} onOpenChange={setUnlockAccountDialog}>
        <DialogContent size="md" data-testid="dialog-unlock-account">
          <DialogHeader>
            <DialogTitle>Unlock Employee Account</DialogTitle>
            <DialogDescription>
              Unlock the account for the selected employee who has been locked due to failed login attempts.
            </DialogDescription>
          </DialogHeader>
          <Form {...unlockAccountForm}>
            <form onSubmit={unlockAccountForm.handleSubmit((data) => unlockAccountMutation.mutate(data))} className="space-y-4">
              <FormField
                control={unlockAccountForm.control}
                name="employeeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-employee-unlock">
                          <SelectValue placeholder="Select an employee" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {employees.filter((emp: any) => emp.isLocked).map((emp: any) => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.firstName} {emp.lastName} ({emp.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={unlockAccountForm.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Explain why this account unlock is necessary..."
                        {...field}
                        data-testid="input-unlock-reason"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setUnlockAccountDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={unlockAccountMutation.isPending} data-testid="button-confirm-unlock">
                  {unlockAccountMutation.isPending ? "Unlocking..." : "Unlock Account"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Update Contact Dialog */}
      <Dialog open={updateContactDialog} onOpenChange={setUpdateContactDialog}>
        <DialogContent size="md" data-testid="dialog-update-contact">
          <DialogHeader>
            <DialogTitle>Update Contact Information</DialogTitle>
            <DialogDescription>
              Update phone number or address for the selected employee.
            </DialogDescription>
          </DialogHeader>
          <Form {...updateContactForm}>
            <form onSubmit={updateContactForm.handleSubmit((data) => updateContactMutation.mutate(data))} className="space-y-4">
              <FormField
                control={updateContactForm.control}
                name="employeeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-employee-contact">
                          <SelectValue placeholder="Select an employee" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {employees.map((emp: any) => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.firstName} {emp.lastName} ({emp.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={updateContactForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="(555) 123-4567" {...field} data-testid="input-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={updateContactForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Street address, city, state, ZIP" {...field} data-testid="input-address" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={updateContactForm.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Explain why this contact update is necessary..."
                        {...field}
                        data-testid="input-contact-reason"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setUpdateContactDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateContactMutation.isPending} data-testid="button-confirm-update">
                  {updateContactMutation.isPending ? "Updating..." : "Update Contact"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Escalation Dialog */}
      <Dialog open={escalationDialog} onOpenChange={setEscalationDialog}>
        <DialogContent size="xl" data-testid="dialog-escalation">
          <DialogHeader>
            <DialogTitle>Create Escalation Ticket</DialogTitle>
            <DialogDescription>
              Escalate an issue to platform support. All fields are required for proper routing.
            </DialogDescription>
          </DialogHeader>
          <Form {...escalationForm}>
            <form onSubmit={escalationForm.handleSubmit((data) => escalationMutation.mutate(data))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={escalationForm.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-category">
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="billing">Billing</SelectItem>
                          <SelectItem value="compliance">Compliance</SelectItem>
                          <SelectItem value="technical">Technical</SelectItem>
                          <SelectItem value="security">Security</SelectItem>
                          <SelectItem value="employee_issue">Employee Issue</SelectItem>
                          <SelectItem value="system_error">System Error</SelectItem>
                          <SelectItem value="feature_request">Feature Request</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={escalationForm.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-priority">
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={escalationForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Brief summary of the issue" {...field} data-testid="input-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={escalationForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Provide detailed information about the issue..."
                        rows={6}
                        {...field}
                        data-testid="input-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEscalationDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={escalationMutation.isPending} data-testid="button-confirm-escalation">
                  {escalationMutation.isPending ? "Creating..." : "Create Escalation"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
