import { useState, useEffect } from "react";
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
  Home,
  Radio,
  RefreshCw,
  TrendingUp,
  ClipboardList,
  Building,
  Siren,
  ClockAlert,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UniversalModal, UniversalModalDescription, UniversalModalFooter, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
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
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

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
  const [activeTab, setActiveTab] = useState("command-center");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Dialog states
  const [resetPasswordDialog, setResetPasswordDialog] = useState(false);
  const [unlockAccountDialog, setUnlockAccountDialog] = useState(false);
  const [updateContactDialog, setUpdateContactDialog] = useState(false);
  const [escalationDialog, setEscalationDialog] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);

  // Trinity welcome greeting on first login (from invite accept flow)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('firstLogin') === '1') {
      const name = params.get('name') || 'there';
      const org = params.get('org') || 'your organization';
      const role = params.get('role') || 'Manager';
      const firstName = name.split(' ')[0];
      toast({
        title: `Welcome, ${firstName}!`,
        description: `You're now logged in as ${role} at ${org}. Your Command Center is ready.`,
        duration: 6000,
      });
      // Clean up the URL params without a full reload
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
    }
  }, []);

  // Fetch Manager Command Center
  const { data: commandCenter, isLoading: commandCenterLoading, refetch: refetchCommandCenter } = useQuery<any>({
    queryKey: ['/api/manager/command-center'],
    refetchInterval: 30000,
    retry: false,
  });

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
  const { data: employees = [] } = useQuery<{ data: any[] }, Error, any[]>({
    queryKey: ['/api/employees'],
    select: (res) => res?.data ?? [],
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

  const pageConfig: CanvasPageConfig = {
    id: 'leaders-hub',
    title: 'Leaders Hub',
    subtitle: 'Self-service employee management · Approvals · Support escalation',
    category: 'operations',
  };

  return (
    <CanvasHubPage config={pageConfig}>
      {/* Tabbed Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6" data-testid="tabs-leaders-hub">
          <TabsTrigger value="command-center" className="text-xs sm:text-sm" data-testid="tab-command-center">
            <Radio className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2 shrink-0" />
            <span className="truncate">Command</span>
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="text-xs sm:text-sm" data-testid="tab-dashboard">
            <Home className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2 shrink-0" />
            <span className="truncate">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="people" className="text-xs sm:text-sm" data-testid="tab-people">
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2 shrink-0" />
            <span className="truncate">People</span>
          </TabsTrigger>
          <TabsTrigger value="scheduling" className="text-xs sm:text-sm" data-testid="tab-scheduling">
            <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2 shrink-0" />
            <span className="truncate">Schedule</span>
          </TabsTrigger>
          <TabsTrigger value="issues" className="text-xs sm:text-sm" data-testid="tab-issues">
            <AlertOctagon className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2 shrink-0" />
            <span className="truncate">Issues</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="text-xs sm:text-sm" data-testid="tab-reports">
            <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2 shrink-0" />
            <span className="truncate">Reports</span>
          </TabsTrigger>
        </TabsList>

        {/* Command Center Tab */}
        <TabsContent value="command-center" className="space-y-6 mt-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-base font-semibold" data-testid="text-command-center-heading">Manager Command Center</h3>
              <p className="text-xs text-muted-foreground">Live operations overview — refreshes every 30 seconds</p>
            </div>
            <Button size="icon" variant="ghost" onClick={() => refetchCommandCenter()} data-testid="button-refresh-command-center">
              <RefreshCw className={`h-4 w-4 ${commandCenterLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {commandCenterLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : commandCenter ? (
            <>
              {/* Active Alerts Banner */}
              {commandCenter.activeAlerts?.count > 0 && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 flex items-start gap-3" data-testid="alert-active-alerts">
                  <Siren className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-destructive">{commandCenter.activeAlerts.count} Active Alert{commandCenter.activeAlerts.count !== 1 ? 's' : ''}</p>
                    {commandCenter.activeAlerts.missedClockIns?.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {commandCenter.activeAlerts.missedClockIns.length} officer{commandCenter.activeAlerts.missedClockIns.length !== 1 ? 's' : ''} missed clock-in
                      </p>
                    )}
                    {commandCenter.activeAlerts.openIncidents?.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {commandCenter.activeAlerts.openIncidents.length} open incident{commandCenter.activeAlerts.openIncidents.length !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Coverage */}
                <Card data-testid="card-coverage">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
                    <CardTitle className="text-sm font-medium">Shift Coverage</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="stat-clocked-in">{commandCenter.todayShifts?.clockedIn ?? 0}</div>
                    <p className="text-xs text-muted-foreground">of {commandCenter.todayShifts?.total ?? 0} shifts clocked in</p>
                    {commandCenter.todayShifts?.notClockedIn > 0 && (
                      <Badge variant="destructive" className="mt-2 text-xs" data-testid="badge-not-clocked-in">
                        {commandCenter.todayShifts.notClockedIn} not clocked in
                      </Badge>
                    )}
                  </CardContent>
                </Card>

                {/* Pending Actions */}
                <Card data-testid="card-pending-actions">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
                    <CardTitle className="text-sm font-medium">Pending Actions</CardTitle>
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="stat-pending-total">{commandCenter.pendingActions?.total ?? 0}</div>
                    <div className="space-y-1 mt-2">
                      {commandCenter.pendingActions?.timesheets > 0 && (
                        <p className="text-xs text-muted-foreground flex justify-between">
                          <span>Timesheets</span>
                          <span className="font-medium text-foreground">{commandCenter.pendingActions.timesheets}</span>
                        </p>
                      )}
                      {commandCenter.pendingActions?.incidents > 0 && (
                        <p className="text-xs text-muted-foreground flex justify-between">
                          <span>Incidents</span>
                          <span className="font-medium text-foreground">{commandCenter.pendingActions.incidents}</span>
                        </p>
                      )}
                      {commandCenter.pendingActions?.documentsToSign > 0 && (
                        <p className="text-xs text-muted-foreground flex justify-between">
                          <span>Docs to sign</span>
                          <span className="font-medium text-foreground">{commandCenter.pendingActions.documentsToSign}</span>
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Missed Clock-ins */}
                <Card data-testid="card-missed-clockins">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
                    <CardTitle className="text-sm font-medium">Missed Clock-ins</CardTitle>
                    <ClockAlert className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${(commandCenter.activeAlerts?.missedClockIns?.length ?? 0) > 0 ? 'text-destructive' : ''}`} data-testid="stat-missed-clockins">
                      {commandCenter.activeAlerts?.missedClockIns?.length ?? 0}
                    </div>
                    {commandCenter.activeAlerts?.missedClockIns?.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {commandCenter.activeAlerts.missedClockIns.slice(0, 3).map((m: any, i: number) => (
                          <p key={i} className="text-xs text-muted-foreground">
                            Site: {m.siteName || 'Unknown'} — <span className="text-destructive">{m.minutesLate}m late</span>
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-emerald-600 mt-1 dark:text-emerald-400">All officers clocked in on time</p>
                    )}
                  </CardContent>
                </Card>

                {/* Open Incidents */}
                <Card data-testid="card-open-incidents">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
                    <CardTitle className="text-sm font-medium">Open Incidents</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${(commandCenter.pendingActions?.incidents ?? 0) > 0 ? 'text-amber-500' : ''}`} data-testid="stat-open-incidents">
                      {commandCenter.pendingActions?.incidents ?? 0}
                    </div>
                    {commandCenter.activeAlerts?.openIncidents?.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {commandCenter.activeAlerts.openIncidents.slice(0, 3).map((inc: any, i: number) => (
                          <p key={i} className="text-xs text-muted-foreground truncate">
                            {inc.title}
                            {inc.severity && <Badge variant="outline" className="ml-1 text-xs">{inc.severity}</Badge>}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-emerald-600 mt-1 dark:text-emerald-400">No open incidents</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Trinity Brief */}
              {commandCenter.trinityBrief?.items?.length > 0 && (
                <Card data-testid="card-trinity-brief">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      <div>
                        <CardTitle className="text-sm">Trinity Morning Brief</CardTitle>
                        <CardDescription className="text-xs">Top items from today's AI summary</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {commandCenter.trinityBrief.items.map((item: any, i: number) => (
                      <div key={i} className="flex items-start gap-2.5 text-sm" data-testid={`trinity-brief-item-${i}`}>
                        <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium text-xs">{item.title}</p>
                          <p className="text-xs text-muted-foreground">{item.message}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Today's Officers Table */}
              {commandCenter.todayShifts?.officers?.length > 0 && (
                <Card data-testid="card-todays-officers">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-3">
                        <Building className="h-5 w-5 text-primary" />
                        <div>
                          <CardTitle className="text-sm">Today's Officers</CardTitle>
                          <CardDescription className="text-xs">{commandCenter.todayShifts.total} scheduled shifts</CardDescription>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1.5">
                      {commandCenter.todayShifts.officers.slice(0, 10).map((officer: any, i: number) => (
                        <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/40 text-xs" data-testid={`officer-row-${i}`}>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${officer.clockedIn ? 'bg-emerald-500' : officer.missedAlert ? 'bg-destructive' : 'bg-muted-foreground'}`} />
                            <span className="text-muted-foreground">{officer.siteName || 'Unknown Site'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">
                              {officer.startTime ? new Date(officer.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                            <Badge variant={officer.clockedIn ? 'default' : officer.missedAlert ? 'destructive' : 'secondary'} className="text-xs">
                              {officer.clockedIn ? 'Clocked In' : officer.missedAlert ? 'Alert' : 'Pending'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                      {commandCenter.todayShifts.total > 10 && (
                        <p className="text-xs text-muted-foreground text-center pt-1">+ {commandCenter.todayShifts.total - 10} more shifts</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {commandCenter.todayShifts?.total === 0 && (
                <div className="text-center py-12 text-muted-foreground" data-testid="empty-no-shifts">
                  <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No shifts scheduled for today</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Radio className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Command center data unavailable</p>
              <p className="text-xs mt-1">Make sure you have manager permissions</p>
            </div>
          )}
        </TabsContent>

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
                                      {/* @ts-ignore */}
                                      {task.employee.firstName ? `${task.employee.firstName} ${task.employee.lastName || ''}`.trim() : task.employee.email}
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
      <UniversalModal open={resetPasswordDialog} onOpenChange={setResetPasswordDialog}>
        <UniversalModalContent size="md" data-testid="dialog-reset-password">
          <UniversalModalHeader>
            <UniversalModalTitle>Reset Employee Password</UniversalModalTitle>
            <UniversalModalDescription>
              Reset the password for the selected employee. A new temporary password will be generated.
            </UniversalModalDescription>
          </UniversalModalHeader>
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
              <UniversalModalFooter>
                <Button type="button" variant="outline" onClick={() => setResetPasswordDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={resetPasswordMutation.isPending} data-testid="button-confirm-reset">
                  {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
                </Button>
              </UniversalModalFooter>
            </form>
          </Form>
        </UniversalModalContent>
      </UniversalModal>

      {/* Unlock Account Dialog */}
      <UniversalModal open={unlockAccountDialog} onOpenChange={setUnlockAccountDialog}>
        <UniversalModalContent size="md" data-testid="dialog-unlock-account">
          <UniversalModalHeader>
            <UniversalModalTitle>Unlock Employee Account</UniversalModalTitle>
            <UniversalModalDescription>
              Unlock the account for the selected employee who has been locked due to failed login attempts.
            </UniversalModalDescription>
          </UniversalModalHeader>
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
              <UniversalModalFooter>
                <Button type="button" variant="outline" onClick={() => setUnlockAccountDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={unlockAccountMutation.isPending} data-testid="button-confirm-unlock">
                  {unlockAccountMutation.isPending ? "Unlocking..." : "Unlock Account"}
                </Button>
              </UniversalModalFooter>
            </form>
          </Form>
        </UniversalModalContent>
      </UniversalModal>

      {/* Update Contact Dialog */}
      <UniversalModal open={updateContactDialog} onOpenChange={setUpdateContactDialog}>
        <UniversalModalContent size="md" data-testid="dialog-update-contact">
          <UniversalModalHeader>
            <UniversalModalTitle>Update Contact Information</UniversalModalTitle>
            <UniversalModalDescription>
              Update phone number or address for the selected employee.
            </UniversalModalDescription>
          </UniversalModalHeader>
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
                      <Input placeholder="Enter phone number" {...field} data-testid="input-phone" />
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
              <UniversalModalFooter>
                <Button type="button" variant="outline" onClick={() => setUpdateContactDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateContactMutation.isPending} data-testid="button-confirm-update">
                  {updateContactMutation.isPending ? "Updating..." : "Update Contact"}
                </Button>
              </UniversalModalFooter>
            </form>
          </Form>
        </UniversalModalContent>
      </UniversalModal>

      {/* Escalation Dialog */}
      <UniversalModal open={escalationDialog} onOpenChange={setEscalationDialog}>
        <UniversalModalContent size="xl" data-testid="dialog-escalation">
          <UniversalModalHeader>
            <UniversalModalTitle>Create Escalation Ticket</UniversalModalTitle>
            <UniversalModalDescription>
              Escalate an issue to platform support. All fields are required for proper routing.
            </UniversalModalDescription>
          </UniversalModalHeader>
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
              <UniversalModalFooter>
                <Button type="button" variant="outline" onClick={() => setEscalationDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={escalationMutation.isPending} data-testid="button-confirm-escalation">
                  {escalationMutation.isPending ? "Creating..." : "Create Escalation"}
                </Button>
              </UniversalModalFooter>
            </form>
          </Form>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
