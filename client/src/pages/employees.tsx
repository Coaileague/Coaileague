import { parseLocalDate, formatDate } from "@/lib/dates";
import { useEffect, useState, useMemo, memo, useCallback } from "react";
import { secureFetch } from "@/lib/csrf";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { CanonicalIdBadge } from "@/components/CanonicalIdBadge";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAsyncData } from "@/hooks/useAsyncData";
import { queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/apiClient";
import { PaginatedEmployeeListResponse } from "@shared/schemas/responses/employees";
import { queryKeys } from "@/config/queryKeys";
import { useMessage } from "@/hooks/useConfig";
import { SiQuickbooks } from "react-icons/si";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ListFilterBar, useListFilters, groupItems, type FilterConfig, type GroupByConfig } from "@/components/list-filter-bar";
import { 
  Plus, 
  Search,
  Users,
  Mail,
  Phone,
  DollarSign,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  Shield,
  MoreVertical,
  Edit,
  Trash2,
  RefreshCw,
  ArrowUpDown,
  Calendar,
  Loader2,
} from "lucide-react";
import { SortableHeader } from "@/components/ui/sortable-header";
import { useTableSort } from "@/hooks/use-table-sort";
import { SwipeToDelete } from "@/components/swipe-to-delete";
import { useIsMobile } from "@/hooks/use-mobile";
import { ResponsiveLoading } from "@/components/loading-indicators";
import {
  UniversalModal,
  UniversalModalHeader,
  UniversalModalTitle,
  UniversalModalDescription,
  UniversalModalFooter,
} from "@/components/ui/universal-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { insertEmployeeSchema, type Employee, type InsertEmployee } from "@shared/schema";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EmployeeEditDialog } from "@/components/employee-edit-dialog";
import { ROLE_LABELS, getRoleBadgeColor, normalizeRole } from "@/lib/roleHierarchy";
import { useSimpleMode } from "@/contexts/SimpleModeContext";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const employeesPageConfig: CanvasPageConfig = {
  id: 'employees',
  category: 'operations',
  title: 'Employees',
  subtitle: 'Manage your team members and their schedules',
};

const getOnboardingStatusBadge = (status?: string) => {
  if (!status || status === 'not_started') {
    return (
      <Badge variant="secondary" className="text-xs">
        <Clock className="h-3 w-3 mr-1" />
        Not Started
      </Badge>
    );
  }
  if (status === 'in_progress') {
    return (
      <Badge variant="default" className="text-xs">
        <Clock className="h-3 w-3 mr-1" />
        In Progress
      </Badge>
    );
  }
  if (status === 'pending_review') {
    return (
      <Badge variant="default" className="text-xs bg-orange-600">
        <AlertCircle className="h-3 w-3 mr-1" />
        Pending Approval
      </Badge>
    );
  }
  if (status === 'completed') {
    return (
      <Badge variant="default" className="text-xs bg-blue-600">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Completed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs">
      {status}
    </Badge>
  );
};

  const EmployeeCard = memo(({ employee, getInitials, canManage, isMobile, handleEditEmployee, setSelectedEmployee, setIsInviteDialogOpen, user, setApprovalPayRate, setIsApprovalDialogOpen, handleDeleteEmployee, managerMap, isAnyMutationPending, inviteMutation, approveMutation, deleteMutation, isSelected, onToggleSelect }: {
    employee: Employee;
    getInitials: (f: string, l: string) => string;
    canManage: boolean;
    isMobile: boolean;
    handleEditEmployee: (e: Employee) => void;
    setSelectedEmployee: (e: Employee | null) => void;
    setIsInviteDialogOpen: (o: boolean) => void;
    user: any;
    setApprovalPayRate: (r: string) => void;
    setIsApprovalDialogOpen: (o: boolean) => void;
    handleDeleteEmployee: (e: Employee) => void;
    managerMap: Record<string, string>;
    isAnyMutationPending: boolean;
    inviteMutation: any;
    approveMutation: any;
    deleteMutation: any;
    isSelected: boolean;
    onToggleSelect: (id: string) => void;
  }) => {
    return (
      <Card className={`hover-elevate transition-colors ${isSelected ? 'border-primary bg-primary/5' : ''}`} data-testid={`card-employee-${employee.id}`}>
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            <div className="pt-1">
              <Checkbox 
                checked={isSelected} 
                onCheckedChange={() => onToggleSelect(employee.id)}
                data-testid={`checkbox-select-employee-${employee.id}`}
              />
            </div>
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarFallback style={{ backgroundColor: employee.color || '#3b82f6' }} className="text-sm font-semibold text-white">
                {getInitials(employee.firstName, employee.lastName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0" data-testid={`text-employee-name-${employee.id}`}>
                  <div className="text-sm max-sm:![font-size:14px] font-medium truncate text-foreground">
                    <div className="truncate max-w-[180px] min-w-0" title={`${employee.firstName} ${employee.lastName}`}>
                      {employee.firstName} {employee.lastName}
                    </div>
                    {employee.email && (
                      <div className="text-[10px] text-muted-foreground truncate max-w-[180px]" title={employee.email}>
                        {employee.email}
                      </div>
                    )}
                  </div>
                  {employee.employeeNumber && (
                    <CanonicalIdBadge
                      id={employee.employeeNumber}
                      size="sm"
                    />
                  )}
                </div>
                {canManage && <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className={isMobile ? "h-8 w-8 min-h-[44px] min-w-[44px] shrink-0 -mt-1 -mr-1" : "h-6 w-6 shrink-0 -mt-1 -mr-1"}
                      style={isMobile ? { touchAction: 'manipulation' } : undefined}
                      data-testid={`button-employee-menu-${employee.id}`}
                      aria-label="Employee menu"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className={isMobile ? "min-w-[180px]" : ""}>
                    <DropdownMenuItem 
                      onClick={() => handleEditEmployee(employee)}
                      className={isMobile ? "py-2.5" : "text-xs"}
                      data-testid={`button-edit-employee-${employee.id}`}
                    >
                      <Edit className="h-3.5 w-3.5 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    {employee.onboardingStatus !== 'completed' && employee.onboardingStatus !== 'pending_review' && employee.id !== user?.employeeId && !employee.userId && (
                      <DropdownMenuItem 
                        onClick={() => {
                          setSelectedEmployee(employee);
                          setIsInviteDialogOpen(true);
                        }}
                        disabled={isAnyMutationPending}
                        className={isMobile ? "py-2.5" : "text-xs"}
                        data-testid={`menu-invite-${employee.id}`}
                      >
                        {inviteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-2" />}
                        Send Invite
                      </DropdownMenuItem>
                    )}
                    {employee.onboardingStatus === 'pending_review' && (
                      <DropdownMenuItem 
                        onClick={() => {
                          setSelectedEmployee(employee);
                          setApprovalPayRate(employee.hourlyRate || "");
                          setIsApprovalDialogOpen(true);
                        }}
                        disabled={isAnyMutationPending}
                        className={isMobile ? "py-2.5 text-orange-600 dark:text-orange-400" : "text-xs text-orange-600 dark:text-orange-400"}
                        data-testid={`menu-approve-${employee.id}`}
                      >
                        {approveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-2" />}
                        Approve
                      </DropdownMenuItem>
                    )}
                    <Link href={`/employees/${employee.id}/hr-record`}>
                      <DropdownMenuItem
                        className={isMobile ? "py-2.5" : "text-xs"}
                        data-testid={`button-hr-record-${employee.id}`}
                      >
                        <Shield className="h-3.5 w-3.5 mr-2" />
                        HR Record
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem 
                          onSelect={(e) => e.preventDefault()}
                          disabled={isAnyMutationPending}
                          className={`text-destructive focus:text-destructive ${isMobile ? "py-2.5" : "text-xs"}`}
                          data-testid={`button-delete-employee-${employee.id}`}
                        >
                          {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-2" />}
                          Deactivate
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Deactivate Employee?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to deactivate {employee.firstName} {employee.lastName}? This will revoke their access and remove them from active schedules. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleDeleteEmployee(employee)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Deactivate
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </DropdownMenuContent>
                </DropdownMenu>}
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                  <div className="truncate max-w-[120px] min-w-0">
                    {employee.role || "Employee"}
                  </div>
                </Badge>
                {employee.workspaceRole && employee.workspaceRole !== 'staff' && employee.workspaceRole !== 'employee' && (
                  <Badge 
                    variant="outline" 
                    className={`text-[10px] h-5 px-1.5 ${getRoleBadgeColor(employee.workspaceRole)}`}
                  >
                    {ROLE_LABELS[normalizeRole(employee.workspaceRole)] || employee.workspaceRole}
                  </Badge>
                )}
                {getOnboardingStatusBadge(employee.onboardingStatus ?? undefined)}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground pt-1">
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  <div className="truncate max-w-[200px] min-w-0">
                    <span className="truncate max-w-[120px]">{employee.email || "—"}</span>
                  </div>
                </span>
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  ${employee.hourlyRate || "0"}/hr
                </span>
                {managerMap[employee.id] && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground" data-testid={`text-reports-to-${employee.id}`}>
                    <Users className="h-3 w-3 shrink-0" />
                    Reports to: <div className="truncate max-w-[180px] min-w-0 inline-block align-bottom"><span className="font-medium truncate max-w-[90px]">{managerMap[employee.id]}</span></div>
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* Desktop only: Show action buttons (mobile uses 3-dot menu) */}
          {!isMobile && employee.onboardingStatus === 'pending_review' && (
            <Button
              className="w-full mt-2 bg-orange-600 hover:bg-orange-700"
              size="sm"
              onClick={() => {
                setSelectedEmployee(employee);
                setApprovalPayRate(employee.hourlyRate || "");
                setIsApprovalDialogOpen(true);
              }}
              disabled={isAnyMutationPending}
              data-testid={`button-approve-${employee.id}`}
            >
              {approveMutation.isPending ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-2" />}
              Approve & Set Pay Rate
            </Button>
          )}
          {canManage && !isMobile && employee.onboardingStatus !== 'completed' && employee.onboardingStatus !== 'pending_review' && employee.id !== user?.employeeId && !employee.userId && (
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2"
              onClick={() => {
                setSelectedEmployee(employee);
                setIsInviteDialogOpen(true);
              }}
              disabled={isAnyMutationPending}
              data-testid={`button-invite-${employee.id}`}
            >
              {inviteMutation.isPending ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <Send className="h-3 w-3 mr-2" />}
              Send Onboarding Invite
            </Button>
          )}
        </CardContent>
      </Card>
    );
  });

export default function Employees() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { workspaceId, workspaceRole, isPlatformStaff } = useWorkspaceAccess();
  const canManage = ['org_owner', 'co_owner', 'admin', 'manager', 'department_manager', 'supervisor', 'root_admin', 'sysop'].includes(workspaceRole || '') || isPlatformStaff;
  const isMobile = useIsMobile();
  const { isSimpleMode } = useSimpleMode();
  const {
    searchValue: searchQuery,
    setSearchValue: setSearchQuery,
    filterValues: empFilterValues,
    handleFilterChange: handleEmpFilterChange,
    groupByValue: empGroupBy,
    setGroupByValue: setEmpGroupBy,
  } = useListFilters({ role: "__all__", workspaceRole: "__all__", onboardingStatus: "__all__", status: "__all__" }, true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isApprovalDialogOpen, setIsApprovalDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkNotifyOpen, setIsBulkNotifyOpen] = useState(false);
  const [bulkNotifyData, setBulkNotifyData] = useState({ title: "", message: "" });
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(() => {
    const employeeId = new URLSearchParams(window.location.search).get('employee');
    if (employeeId && employees.length > 0) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      return employees.find(e => e.id === employeeId) || null;
    }
    return null;
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selectedEmployee) {
      params.set('employee', selectedEmployee.id);
      setIsEditDialogOpen(true);
    } else {
      params.delete('employee');
    }
    const newSearch = params.toString();
    if (newSearch !== window.location.search.replace(/^\?/, "")) {
      const { pathname } = window.location;
      window.history.replaceState(null, '', `${pathname}${newSearch ? `?${newSearch}` : ""}`);
    }
  }, [selectedEmployee]);
  const [approvalPayRate, setApprovalPayRate] = useState("");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "",
    organizationalTitle: "staff",
    hourlyRate: "",
  });
  const [formData, setFormData] = useState<Partial<Employee>>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "",
    organizationalTitle: "staff", // Hierarchy: staff, supervisor, manager, director, owner
    hourlyRate: "",
    payType: "hourly", // hourly, salary, commission, contractor
    payFrequency: "biweekly", // weekly, biweekly, semimonthly, monthly
    workspaceRole: "staff", // Default to staff role
    // @ts-expect-error — TS migration: fix in refactoring sprint
    platformRole: "", // Empty = no platform role
  });
  
  // Get messages from config
  const successMsg = useMessage('create.success', { entity: 'Employee' });

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const employeesQuery = useQuery<any>({
    queryKey: ['/api/employees', workspaceId, page],
    queryFn: async () => {
      const result = await apiGet(`employees.list`, { workspaceId, page, limit: PAGE_SIZE });
      const parsed = PaginatedEmployeeListResponse.safeParse(result);
      return parsed.success ? parsed.data : result;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isEmpty: isEmployeesEmpty,
  } = useAsyncData(employeesQuery, (d) => !d?.data?.length);

  const employees = data?.data || [];
  const pagination = data?.pagination || { total: 0, totalPages: 0 };

  const { data: allAssignments = [], isError: isErrorAssignments, error: errorAssignments } = useQuery<any[]>({
    queryKey: ['/api/manager-assignments', workspaceId],
    queryFn: async () => {
      const r = await fetch(`/api/manager-assignments?workspaceId=${workspaceId}`, { credentials: 'include' });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const managerMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (!allAssignments) return map;
    for (const a of allAssignments) {
      const mgr = (employees as Employee[]).find((e) => e.id === a.managerId);
      if (mgr) {
        map[a.employeeId] = `${mgr.firstName} ${mgr.lastName}`;
      }
    }
    return map;
  }, [allAssignments, employees]);

  // Show error toast when query fails
  useEffect(() => {
    if (isError && error) {
      toast({
        title: "Failed to Load Employees",
        description: error instanceof Error ? error.message : "Unable to fetch employee data. Please try again.",
        variant: "destructive",
        action: (
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-retry-employees">
            Retry
          </Button>
        ),
      });
    }
  }, [isError, error, toast, refetch]);

  const createMutation = useMutation({
    mutationFn: (data: any) => apiPost('employees.create', { ...data, workspaceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/workspace/health'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trinity/context'] });
      toast({
        title: "Employee Added",
        description: successMsg,
      });
      setIsAddDialogOpen(false);
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        role: "",
        organizationalTitle: "staff",
        hourlyRate: "",
        payType: "hourly",
        payFrequency: "biweekly",
        workspaceRole: "staff",
        // @ts-expect-error — TS migration: fix in refactoring sprint
        platformRole: "",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
        }, 500);
        return;
      }
      toast({
        title: "Creation Failed",
        description: error instanceof Error ? error.message : "Failed to create employee record. Please verify all details.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, authLoading, toast]);

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  const handleSubmit = () => {
    // Validate email requirement for platform roles
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (formData.platformRole && !formData.email) {
      toast({
        title: "Email Required",
        description: "Email address is required when assigning a platform role",
        variant: "destructive",
      });
      return;
    }
    
    const validatedData = insertEmployeeSchema.parse({
      ...formData,
      hourlyRate: formData.hourlyRate ? parseFloat(formData.hourlyRate as string).toString() : undefined,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      platformRole: formData.platformRole || undefined,
      workspaceId: workspaceId!,
      isActive: true, // NEW: align with backend expectations for new employees
      workerType: formData.payType === 'contractor' ? 'contractor' : 'employee',
    });

    createMutation.mutate(validatedData);
  };

  const inviteMutation = useMutation({
    mutationFn: async (employee: Employee) => {
      const response = await secureFetch('/api/onboarding/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: employee.email,
          firstName: employee.firstName,
          lastName: employee.lastName,
          role: employee.role || null,
          workspaceRole: employee.workspaceRole || 'staff',
          workspaceId,
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to send invitation');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees', workspaceId] });
      toast({
        title: "Invitation Sent",
        description: `Onboarding invitation email has been sent to ${data.email || selectedEmployee?.email}`,
      });
      setIsInviteDialogOpen(false);
      setSelectedEmployee(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Invitation Failed",
        description: error instanceof Error ? error.message : "Failed to send onboarding invitation. Please check the email address.",
        variant: "destructive",
      });
    },
  });

  const handleSendInvite = () => {
    if (selectedEmployee && selectedEmployee.email) {
      inviteMutation.mutate(selectedEmployee);
    } else {
      toast({
        title: "Missing Email",
        description: "Employee email is required to send an invitation",
        variant: "destructive",
      });
    }
  };

  const approveMutation = useMutation({
    mutationFn: (data: { employeeId: string; hourlyRate: number }) => apiPost('employees.create', { ...data, workspaceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/workspace/health'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trinity/context'] });
      toast({
        title: "Employee Approved",
        description: "Employee has been approved and activated with pay rate set",
      });
      setIsApprovalDialogOpen(false);
      setSelectedEmployee(null);
      setApprovalPayRate("");
    },
    onError: (error: Error) => {
      toast({
        title: "Approval Failed",
        description: error instanceof Error ? error.message : "Failed to approve employee. Please verify the pay rate.",
        variant: "destructive",
      });
    },
  });

  const handleApproveEmployee = () => {
    if (!selectedEmployee?.id) return;
    
    const rate = parseFloat(approvalPayRate);
    if (isNaN(rate) || rate <= 0) {
      toast({
        title: "Invalid Pay Rate",
        description: "Please enter a valid hourly rate greater than 0",
        variant: "destructive",
      });
      return;
    }

    approveMutation.mutate({
      employeeId: selectedEmployee.id,
      hourlyRate: rate,
    });
  };

  const employeeFilterConfigs: FilterConfig[] = useMemo(() => {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const roles = [...new Set((employees || []).map(e => e.role).filter(Boolean))] as string[];
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const wsRoles = [...new Set((employees || []).map(e => e.workspaceRole).filter(Boolean))] as string[];
    return [
      {
        key: "role",
        label: "Positions",
        placeholder: "Position",
        options: roles.sort().map(r => ({ value: r, label: r })),
      },
      {
        key: "workspaceRole",
        label: "Roles",
        placeholder: "Organization Role",
        options: wsRoles.sort().map(r => ({ value: r, label: ROLE_LABELS[normalizeRole(r)] || r })),
      },
      {
        key: "onboardingStatus",
        label: "Onboarding",
        placeholder: "Onboarding Status",
        options: [
          { value: "not_started", label: "Not Started" },
          { value: "in_progress", label: "In Progress" },
          { value: "pending_review", label: "Pending Approval" },
          { value: "completed", label: "Completed" },
        ],
      },
      {
        key: "status",
        label: "Status",
        placeholder: "Active Status",
        options: [
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ],
      },
    ];
  }, [employees]);

  const employeeGroupByOptions: GroupByConfig[] = [
    { key: "role", label: "Position" },
    { key: "workspaceRole", label: "Organization Role" },
    { key: "onboardingStatus", label: "Onboarding Status" },
  ];

  const filteredEmployees = useMemo(() => {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    return (employees || []).filter(emp => {
      const matchesSearch = !searchQuery || `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = !empFilterValues.role || empFilterValues.role === "__all__" || emp.role === empFilterValues.role;
      const matchesWsRole = !empFilterValues.workspaceRole || empFilterValues.workspaceRole === "__all__" || emp.workspaceRole === empFilterValues.workspaceRole;
      const matchesOnboarding = !empFilterValues.onboardingStatus || empFilterValues.onboardingStatus === "__all__" || (emp.onboardingStatus || "not_started") === empFilterValues.onboardingStatus;
      const matchesStatus = !empFilterValues.status || empFilterValues.status === "__all__" ||
        (empFilterValues.status === "active" ? emp.isActive !== false : emp.isActive === false);
      return matchesSearch && matchesRole && matchesWsRole && matchesOnboarding && matchesStatus;
    });
  }, [employees, searchQuery, empFilterValues]);

  const { 
    sorted: sortedEmployees, 
    sortKey, 
    sortDir, 
    toggleSort 
  } = useTableSort<Employee>(filteredEmployees, 'lastName', 'asc');

  const paginatedEmployees = useMemo(() => {
    return sortedEmployees.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }, [sortedEmployees, page]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, empFilterValues]);

  const groupedEmployees = useMemo(() => {
    return groupItems(paginatedEmployees, empGroupBy, (emp) => {
      if (empGroupBy === "role") return emp.role || "No Position";
      if (empGroupBy === "workspaceRole") return ROLE_LABELS[normalizeRole(emp.workspaceRole || "staff")] || emp.workspaceRole || "Staff";
      if (empGroupBy === "onboardingStatus") {
        const s = emp.onboardingStatus || "not_started";
        return s === "not_started" ? "Not Started" : s === "in_progress" ? "In Progress" : s === "pending_review" ? "Pending Approval" : "Completed";
      }
      return "";
    });
  }, [paginatedEmployees, empGroupBy]);

  // @ts-expect-error — TS migration: fix in refactoring sprint
  const pendingApprovals = employees?.filter(emp => emp.onboardingStatus === 'pending_review') || [];

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['/api/employees', workspaceId] });
  };

  // Edit mutation - uses direct fetch to properly handle path params
  const editMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<Employee> }) => {
      const response = await secureFetch(`/api/employees/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...data.updates, workspaceId }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to update employee');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees', workspaceId] });
      toast({
        title: "Employee Updated",
        description: "Employee records have been successfully updated.",
      });
      setIsEditDialogOpen(false);
      setSelectedEmployee(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update employee details. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete mutation - uses direct fetch to properly handle path params
  const deleteMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const response = await secureFetch(`/api/employees/${employeeId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ workspaceId }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to delete employee');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees', workspaceId] });
      toast({
        title: "Employee Removed",
        description: "The employee record has been successfully deleted from the workspace.",
      });
      setIsDeleteDialogOpen(false);
      setSelectedEmployee(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to remove employee record. They may have active assignments.",
        variant: "destructive",
      });
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(employees.map((e: any) => e.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const bulkNotifyMutation = useMutation({
    mutationFn: (data: { employeeIds: string[]; title: string; message: string; workspaceId: string }) => 
      apiPost('/api/employees/bulk-notify', data),
    onSuccess: () => {
      toast({
        title: "Notifications Sent",
        description: `Bulk notification sent to ${selectedIds.size} employees.`,
      });
      setIsBulkNotifyOpen(false);
      setBulkNotifyData({ title: "", message: "" });
      deselectAll();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send notifications",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleBulkNotify = () => {
    if (selectedIds.size === 0) return;
    bulkNotifyMutation.mutate({
      employeeIds: Array.from(selectedIds),
      title: bulkNotifyData.title,
      message: bulkNotifyData.message,
      workspaceId: workspaceId!,
    });
  };

  const handleExportCSV = () => {
    const selectedEmployees = employees.filter((e: any) => selectedIds.has(e.id));
    const headers = ["First Name", "Last Name", "Email", "Phone", "Role", "Hourly Rate"];
    const csvRows = [
      headers.join(","),
      ...selectedEmployees.map((e: any) => [
        e.firstName,
        e.lastName,
        e.email,
        e.phone || "",
        e.role || "",
        e.hourlyRate || "0"
      ].map(v => `"${v}"`).join(","))
    ];
    
    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `employees_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isAnyMutationPending = createMutation.isPending || inviteMutation.isPending || approveMutation.isPending || deleteMutation.isPending || bulkNotifyMutation.isPending;

  const handleEditEmployee = useCallback((employee: Employee) => {
    setSelectedEmployee(employee);
    setEditFormData({
      firstName: employee.firstName || "",
      lastName: employee.lastName || "",
      email: employee.email || "",
      phone: employee.phone || "",
      role: employee.role || "",
      organizationalTitle: (employee as Employee).organizationalTitle || "staff",
      hourlyRate: employee.hourlyRate?.toString() || "",
    });
    setIsEditDialogOpen(true);
  }, []);

  const handleEditSubmit = () => {
    if (!selectedEmployee?.id) return;
    editMutation.mutate({
      id: selectedEmployee.id,
      updates: {
        firstName: editFormData.firstName,
        lastName: editFormData.lastName,
        email: editFormData.email,
        phone: editFormData.phone || undefined,
        role: editFormData.role || undefined,
        organizationalTitle: editFormData.organizationalTitle || "staff",
        hourlyRate: editFormData.hourlyRate ? editFormData.hourlyRate.toString() : undefined,
      },
    });
  };

  const handleDeleteEmployee = useCallback((employee: Employee) => {
    setSelectedEmployee(employee);
    setIsDeleteDialogOpen(true);
  }, []);

  const confirmDeleteEmployee = () => {
    if (selectedEmployee?.id) {
      deleteMutation.mutate(selectedEmployee.id);
    }
  };

  if (isLoading) {
    return (
      <CanvasHubPage config={employeesPageConfig}>
        <div className="space-y-3 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </CanvasHubPage>
    );
  }

  if (isError) return (
    <CanvasHubPage config={employeesPageConfig}>
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Failed to load data. Please refresh."}
        </p>
      </div>
    </CanvasHubPage>
  );

  const headerActions = (
    <div className="flex items-center gap-2">
      {employees.length > 0 && (
        <div className="flex items-center gap-2 mr-2 border-r pr-2">
          <Checkbox 
            checked={selectedIds.size === employees.length && employees.length > 0}
            onCheckedChange={(checked) => checked ? selectAll() : deselectAll()}
            data-testid="checkbox-select-all"
          />
          <span className="text-xs text-muted-foreground hidden sm:inline">Select All</span>
        </div>
      )}
      <Link href="/quickbooks-import">
        <Button variant="outline" data-testid="button-import-quickbooks" className="gap-2">
          <SiQuickbooks className="h-4 w-4 text-[#2CA01C]" />
          <span className="hidden sm:inline">Import from QuickBooks</span>
          <span className="sm:hidden">Import</span>
        </Button>
      </Link>
    
      <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-employee">
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Add Employee</span>
            <span className="sm:hidden">Add</span>
          </Button>
          <UniversalModal open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} size="md">
              <UniversalModalHeader className="space-y-1.5 pb-2">
                <UniversalModalTitle className="text-base sm:text-lg">Add Employee</UniversalModalTitle>
                <UniversalModalDescription className="text-xs sm:text-sm">
                  Enter employee details
                </UniversalModalDescription>
              </UniversalModalHeader>
              <div className="space-y-3 py-2">
                {/* Basic Info Section */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Basic Info</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="firstName" className="text-xs">First Name <span className="text-destructive" aria-hidden="true">*</span></Label>
                      <Input 
                        id="firstName" 
                        placeholder="John" 
                        value={formData.firstName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, firstName: e.target.value })}
                        data-testid="input-employee-firstname"
                        className="h-9 text-sm"
                        aria-required="true"
                        aria-describedby="firstName-error"
                      />
                      {(!formData.firstName && createMutation.isError) && (
                        <p id="firstName-error" className="text-xs text-destructive mt-1" role="alert">First name is required</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="lastName" className="text-xs">Last Name <span className="text-destructive" aria-hidden="true">*</span></Label>
                      <Input 
                        id="lastName" 
                        placeholder="Doe" 
                        value={formData.lastName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, lastName: e.target.value })}
                        data-testid="input-employee-lastname"
                        className="h-9 text-sm"
                        aria-required="true"
                        aria-describedby="lastName-error"
                      />
                      {(!formData.lastName && createMutation.isError) && (
                        <p id="lastName-error" className="text-xs text-destructive mt-1" role="alert">Last name is required</p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-xs">Email <span className="text-destructive" aria-hidden="true">*</span></Label>
                      <Input 
                        id="email" 
                        type="email"
                        placeholder="john.doe@example.com" 
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        data-testid="input-employee-email"
                        className="h-9 text-sm"
                        aria-required="true"
                        aria-describedby="email-error"
                      />
                      {(!formData.email && createMutation.isError) && (
                        <p id="email-error" className="text-xs text-destructive mt-1" role="alert">Email is required</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Role & Pay Section */}
                <div className="space-y-2 border-t pt-3">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role & Pay</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="role" className="text-xs">Position</Label>
                      <Input 
                        id="role" 
                        placeholder="e.g. Developer" 
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        value={formData.role}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        data-testid="input-employee-role"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="workspaceRole" className="text-xs">Organization Role <span className="text-destructive" aria-hidden="true">*</span></Label>
                      <Select 
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        value={formData.workspaceRole} 
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        onValueChange={(val) => setFormData({ ...formData, workspaceRole: val })}
                      >
                        <SelectTrigger id="workspaceRole" className="h-9 text-sm" data-testid="select-workspace-role">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="staff">Staff</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="hourlyRate" className="text-xs">Hourly Rate ($)</Label>
                      <Input 
                        id="hourlyRate" 
                        type="number"
                        placeholder="0.00" 
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        value={formData.hourlyRate}
                        onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                        data-testid="input-employee-rate"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="payFrequency" className="text-xs">Pay Frequency</Label>
                      <Select 
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        value={formData.payFrequency} 
                        onValueChange={(val) => setFormData({ ...formData, payFrequency: val })}
                      >
                        <SelectTrigger id="payFrequency" className="h-9 text-sm" data-testid="select-pay-frequency">
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                          <SelectItem value="semimonthly">Semi-Monthly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
              <UniversalModalFooter className="pt-2">
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} className="h-9 text-sm">Cancel</Button>
                <Button 
                  onClick={handleSubmit} 
                  disabled={createMutation.isPending}
                  data-testid="button-confirm-add"
                  className="h-9 text-sm"
                >
                  {createMutation.isPending && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                  Add Employee
                </Button>
              </UniversalModalFooter>
          </UniversalModal>
    </div>
  );

  const employeesToDisplay = paginatedEmployees;

  const totalPages = pagination.totalPages;

  return (
    // @ts-expect-error — TS migration: fix in refactoring sprint
    <CanvasHubPage config={employeesPageConfig} headerActions={headerActions}>
      <div className="space-y-6">
        <ListFilterBar
          filters={employeeFilterConfigs}
          groupByOptions={employeeGroupByOptions}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          filterValues={empFilterValues}
          onFilterChange={handleEmpFilterChange}
          groupByValue={empGroupBy}
          onGroupByChange={setEmpGroupBy}
          data-testid="input-search-employees"
        />

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-3/4" />
                      <div className="h-3 bg-muted rounded w-1/2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : pagination.total === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-lg">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No employees yet</h3>
            <p className="text-muted-foreground mb-4">Add your first employee to get started</p>
            <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-first-employee">Add Employee</Button>
          </div>
        ) : employeesToDisplay.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
              <h3 className="text-base font-medium mb-1">No matching employees</h3>
              <p className="text-sm text-muted-foreground">Try adjusting your filters or search term</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Header with Sorting */}
            {!isSimpleMode && !isMobile && (
              <div className="grid grid-cols-[1fr_200px_150px_100px_120px_48px] gap-4 px-6 py-3 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
                <div className="flex items-center">
                  <SortableHeader column="lastName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                    Employee
                  </SortableHeader>
                </div>
                <div className="flex items-center">
                  <SortableHeader column="role" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                    Position
                  </SortableHeader>
                </div>
                <div className="flex items-center">
                  // @ts-ignore — TS migration: fix in refactoring sprint
                  <SortableHeader column="startDate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                    Hire Date
                  </SortableHeader>
                </div>
                <div className="flex items-center">
                  <SortableHeader column="hourlyRate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                    Pay Rate
                  </SortableHeader>
                </div>
                <div className="flex items-center">Status</div>
                <div className="text-right flex items-center justify-end">Actions</div>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mobile-cols-1 overflow-x-auto">
              {employeesToDisplay.map((employee: Employee) => {
                const employeeCard = (
                  // @ts-expect-error — TS migration: fix in refactoring sprint
                  <EmployeeCard
                    key={employee.id}
                    employee={employee}
                    getInitials={getInitials}
                    canManage={canManage}
                    isMobile={isMobile}
                    handleEditEmployee={handleEditEmployee}
                    setSelectedEmployee={setSelectedEmployee}
                    setIsInviteDialogOpen={setIsInviteDialogOpen}
                    user={user}
                    setApprovalPayRate={setApprovalPayRate}
                    setIsApprovalDialogOpen={setIsApprovalDialogOpen}
                    handleDeleteEmployee={handleDeleteEmployee}
                    managerMap={managerMap}
                    isAnyMutationPending={isAnyMutationPending}
                    inviteMutation={inviteMutation}
                    approveMutation={approveMutation}
                    deleteMutation={deleteMutation}
                  />
                );

                // Wrap in swipe-to-delete on mobile
                if (isMobile) {
                  return (
                    <SwipeToDelete 
                      key={employee.id}
                      onDelete={() => handleDeleteEmployee(employee)}
                      data-testid={`swipe-delete-${employee.id}`}
                    >
                      <EmployeeCard
                        employee={employee}
                        getInitials={getInitials}
                        canManage={canManage}
                        isMobile={isMobile}
                        handleEditEmployee={handleEditEmployee}
                        setSelectedEmployee={setSelectedEmployee}
                        setIsInviteDialogOpen={setIsInviteDialogOpen}
                        user={user}
                        setApprovalPayRate={setApprovalPayRate}
                        setIsApprovalDialogOpen={setIsApprovalDialogOpen}
                        handleDeleteEmployee={handleDeleteEmployee}
                        managerMap={managerMap}
                        isAnyMutationPending={isAnyMutationPending}
                        inviteMutation={inviteMutation}
                        approveMutation={approveMutation}
                        deleteMutation={deleteMutation}
                        isSelected={selectedIds.has(employee.id)}
                        onToggleSelect={toggleSelect}
                      />
                    </SwipeToDelete>
                  );
                }
                return (
                  <EmployeeCard
                    key={employee.id}
                    employee={employee}
                    getInitials={getInitials}
                    canManage={canManage}
                    isMobile={isMobile}
                    handleEditEmployee={handleEditEmployee}
                    setSelectedEmployee={setSelectedEmployee}
                    setIsInviteDialogOpen={setIsInviteDialogOpen}
                    user={user}
                    setApprovalPayRate={setApprovalPayRate}
                    setIsApprovalDialogOpen={setIsApprovalDialogOpen}
                    handleDeleteEmployee={handleDeleteEmployee}
                    managerMap={managerMap}
                    isAnyMutationPending={isAnyMutationPending}
                    inviteMutation={inviteMutation}
                    approveMutation={approveMutation}
                    deleteMutation={deleteMutation}
                    isSelected={selectedIds.has(employee.id)}
                    onToggleSelect={toggleSelect}
                  />
                );
              })}
            </div>

            {selectedIds.size > 0 && (
              <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[40] w-[95%] max-w-2xl">
                <Card className="shadow-lg border-primary/20 bg-background/95 backdrop-blur-sm">
                  <CardContent className="p-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="bg-primary text-primary-foreground">
                        {selectedIds.size}
                      </Badge>
                      <span className="text-sm font-medium hidden sm:inline">Employees selected</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => setIsBulkNotifyOpen(true)}
                        data-testid="button-bulk-notify"
                        className="h-8"
                      >
                        <Send className="mr-2 h-3.5 w-3.5" />
                        Notify
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={handleExportCSV}
                        data-testid="button-bulk-export"
                        className="h-8"
                      >
                        // @ts-ignore — TS migration: fix in refactoring sprint
                        <Download className="mr-2 h-3.5 w-3.5" />
                        Export
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={deselectAll}
                        data-testid="button-bulk-deselect"
                        className="h-8"
                      >
                        // @ts-ignore — TS migration: fix in refactoring sprint
                        <X className="mr-2 h-3.5 w-3.5" />
                        Deselect
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <UniversalModal open={isBulkNotifyOpen} onOpenChange={setIsBulkNotifyOpen} size="md">
              <UniversalModalHeader>
                <UniversalModalTitle>Bulk Notification</UniversalModalTitle>
                <UniversalModalDescription>
                  Send a notification to {selectedIds.size} selected employees.
                </UniversalModalDescription>
              </UniversalModalHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="bulk-title">Title</Label>
                  <Input 
                    id="bulk-title"
                    placeholder="Enter notification title"
                    value={bulkNotifyData.title}
                    onChange={(e) => setBulkNotifyData(prev => ({ ...prev, title: e.target.value }))}
                    data-testid="input-bulk-notify-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bulk-message">Message</Label>
                  <Textarea 
                    id="bulk-message"
                    placeholder="Enter notification message"
                    value={bulkNotifyData.message}
                    onChange={(e) => setBulkNotifyData(prev => ({ ...prev, message: e.target.value }))}
                    data-testid="textarea-bulk-notify-message"
                    className="min-h-[100px]"
                  />
                </div>
              </div>
              <UniversalModalFooter>
                <Button variant="outline" onClick={() => setIsBulkNotifyOpen(false)}>Cancel</Button>
                <Button 
                  onClick={handleBulkNotify} 
                  disabled={bulkNotifyMutation.isPending || !bulkNotifyData.title || !bulkNotifyData.message}
                  data-testid="button-confirm-bulk-notify"
                >
                  {bulkNotifyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send Notification
                </Button>
              </UniversalModalFooter>
            </UniversalModal>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 px-2 border-t pt-4">
                <div className="text-sm text-muted-foreground">
                  Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(pagination.total, page * PAGE_SIZE)} of {pagination.total} employees
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(prev => Math.max(1, prev - 1))}
                    disabled={page === 1}
                    data-testid="button-pagination-prev"
                  >
                    Previous
                  </Button>
                  <div className="text-xs text-muted-foreground mx-2">
                    Page {page} of {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={page >= totalPages}
                    data-testid="button-pagination-next"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will deactivate the employee record for {selectedEmployee?.firstName} {selectedEmployee?.lastName}. 
                The record will remain in the system but will no longer be considered active.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDeleteEmployee}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                Deactivate
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <UniversalModal open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen} size="sm">
          <UniversalModalHeader>
            <UniversalModalTitle>Send Onboarding Invitation</UniversalModalTitle>
            <UniversalModalDescription>
              Send an email invitation to {selectedEmployee?.firstName} {selectedEmployee?.lastName} to complete their onboarding profile.
            </UniversalModalDescription>
          </UniversalModalHeader>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleSendInvite} 
              disabled={inviteMutation.isPending}
              data-testid="button-confirm-invite"
            >
              {inviteMutation.isPending && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              Send Invitation
            </Button>
          </UniversalModalFooter>
        </UniversalModal>

        <UniversalModal open={isApprovalDialogOpen} onOpenChange={setIsApprovalDialogOpen} size="sm">
          <UniversalModalHeader>
            <UniversalModalTitle>Approve Employee Onboarding</UniversalModalTitle>
            <UniversalModalDescription>
              Review and approve onboarding for {selectedEmployee?.firstName} {selectedEmployee?.lastName}. 
              Set their hourly pay rate to complete the activation.
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="approvalPayRate">Hourly Pay Rate ($)</Label>
              <Input 
                id="approvalPayRate" 
                type="number" 
                placeholder="e.g. 25.00" 
                value={approvalPayRate}
                onChange={(e) => setApprovalPayRate(e.target.value)}
                data-testid="input-approval-pay-rate"
                aria-describedby="approvalPayRate-error"
                aria-required="true"
              />
              {(!approvalPayRate && approveMutation.isError) && (
                <p id="approvalPayRate-error" className="text-xs text-destructive mt-1" role="alert">Pay rate is required for approval</p>
              )}
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setIsApprovalDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleApproveEmployee} 
              disabled={approveMutation.isPending}
              data-testid="button-confirm-approval"
            >
              {approveMutation.isPending && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              Approve & Activate
            </Button>
          </UniversalModalFooter>
        </UniversalModal>

        {selectedEmployee && (
          // @ts-expect-error — TS migration: fix in refactoring sprint
          <EmployeeEditDialog
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            employee={selectedEmployee}
          />
        )}
      </div>
    </CanvasHubPage>
  );
}
