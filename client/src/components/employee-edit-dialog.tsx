import { secureFetch } from "@/lib/csrf";
import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/config/queryKeys";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  getAssignableRoles,
  canModifyUser,
  canAssignRole,
  isProtectedRole,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  getRoleBadgeColor,
  normalizeRole,
  getRolePermissions,
  getRoleTier,
  type WorkspaceRole
} from "@/lib/roleHierarchy";

import {
  UniversalModal,
  UniversalModalHeader,
  UniversalModalTitle,
  UniversalModalDescription,
  UniversalModalFooter,
} from "@/components/ui/universal-modal";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  User,
  Mail,
  Phone,
  DollarSign,
  Shield,
  UserMinus,
  UserX,
  Crown,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  Check,
  Briefcase,
  Building,
  Users,
  UserCheck,
  Link2Off,
  X,
  MapPin,
  Star,
  Clock,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

import type { Employee } from "@shared/schema";
import {
  POSITION_REGISTRY,
  POSITION_CATEGORIES,
  getPositionById,
  getWorkspaceRoleForPosition,
  type PositionDefinition,
  type PositionCategory,
} from "@shared/positionRegistry";

interface EmployeeEditDialogProps {
  employee: Employee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserRole: WorkspaceRole | string | null | undefined;
}

export function EmployeeEditDialog({
  employee,
  open,
  onOpenChange,
  currentUserRole,
}: EmployeeEditDialogProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState("details");
  const [confirmAction, setConfirmAction] = useState<'suspend' | 'remove' | 'promote' | 'demote' | 'terminate' | 'reactivate' | null>(null);
  const [overageWarning, setOverageWarning] = useState<{ message: string; projectedMonthlyCharge: string } | null>(null);
  const [pendingRole, setPendingRole] = useState<WorkspaceRole | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "",
    position: "",
    organizationalTitle: "staff",
    hourlyRate: "",
    payType: "hourly", // hourly, salary, commission, contractor
    payFrequency: "biweekly", // weekly, biweekly, semimonthly, monthly
    hireDate: "",
    workspaceRole: "staff" as WorkspaceRole,
    // Scheduling intelligence fields
    isArmed: false,
    travelRadiusMiles: 25,
    availabilityMode: "open" as "open" | "restricted" | "unavailable",
  });

  const positionsByCategory = POSITION_CATEGORIES.map(cat => ({
    ...cat,
    positions: POSITION_REGISTRY.filter(p => p.category === cat.id),
  }));

  // Reset form when employee changes
  useEffect(() => {
    if (employee) {
      const hireDateStr = (employee as any).hireDate
        ? new Date((employee as any).hireDate).toISOString().split('T')[0]
        : "";
      setFormData({
        firstName: employee.firstName || "",
        lastName: employee.lastName || "",
        email: employee.email || "",
        phone: employee.phone || "",
        role: employee.role || "",
        position: (employee as any).position || "",
        organizationalTitle: (employee as any).organizationalTitle || "staff",
        hourlyRate: employee.hourlyRate?.toString() || "",
        payType: (employee as any).payType || "hourly",
        payFrequency: (employee as any).payFrequency || "biweekly",
        hireDate: hireDateStr,
        workspaceRole: (employee.workspaceRole || "staff") as WorkspaceRole,
        isArmed: (employee as any).isArmed ?? false,
        travelRadiusMiles: (employee as any).travelRadiusMiles ?? 25,
        availabilityMode: ((employee as any).availabilityMode ?? "open") as "open" | "restricted" | "unavailable",
      });
      setActiveTab("details");
    }
  }, [employee]);

  const assignableRoles = getAssignableRoles(currentUserRole);
  const canModify = canModifyUser(currentUserRole, employee?.workspaceRole);
  const isOwnerProtected = isProtectedRole(employee?.workspaceRole);
  const permissions = getRolePermissions(currentUserRole);

  // Edit mutation
  const editMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Record<string, any> }) => {
      const response = await secureFetch(`/api/employees/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data.updates),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to update employee');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
      toast({ title: "Success", description: "Employee updated successfully" });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Role change mutation
  const roleChangeMutation = useMutation({
    mutationFn: async ({ employeeId, newRole }: { employeeId: string; newRole: string }) => {
      const response = await secureFetch(`/api/employees/${employeeId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ workspaceRole: newRole }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to change role');
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
      const roleName = ROLE_LABELS[variables.newRole as WorkspaceRole] || variables.newRole;
      toast({ 
        title: "Role Updated", 
        description: `${employee?.firstName} is now a ${roleName}` 
      });
      setConfirmAction(null);
      setPendingRole(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setConfirmAction(null);
      setPendingRole(null);
    },
  });

  // Reactivate mutation — checks seat overage before completing
  const reactivateMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const response = await secureFetch(`/api/employees/${employeeId}/access`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'Failed to reactivate employee');
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
      if (data?.seatOverageWarning) {
        setOverageWarning(data.seatOverageWarning);
      }
      toast({
        title: 'Employee Reactivated',
        description: `${employee?.firstName} ${employee?.lastName} has been reactivated${data?.seatOverageWarning ? ' — overage billing will apply' : ''}.`,
      });
      setConfirmAction(null);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setConfirmAction(null);
    },
  });

  // Suspend mutation (uses access toggle endpoint)
  const suspendMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const response = await secureFetch(`/api/employees/${employeeId}/access`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: false }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to suspend employee');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
      toast({ 
        title: "Employee Suspended", 
        description: `${employee?.firstName} ${employee?.lastName} has been suspended` 
      });
      setConfirmAction(null);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setConfirmAction(null);
    },
  });

  // Remove mutation
  const removeMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const response = await secureFetch(`/api/employees/${employeeId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to remove employee');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
      toast({ 
        title: "Employee Removed", 
        description: `${employee?.firstName} ${employee?.lastName} has been removed` 
      });
      setConfirmAction(null);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setConfirmAction(null);
    },
  });

  // ── Reporting line queries ────────────────────────────────────────────────

  const { data: currentAssignments = [], isLoading: assignmentsLoading } = useQuery<any[]>({
    queryKey: ['/api/manager-assignments/employee', employee?.id],
    queryFn: async () => {
      if (!employee?.id) return [];
      const r = await fetch(`/api/manager-assignments/employee/${employee.id}`, { credentials: 'include' });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!employee?.id && open && activeTab === 'reporting',
  });

  const { data: allEmployees = [] } = useQuery<any[]>({
    queryKey: ['/api/employees'],
    queryFn: async () => {
      const r = await fetch('/api/employees', { credentials: 'include' });
      if (!r.ok) return [];
      const res = await r.json();
      return res?.data ?? [];
    },
    enabled: open && activeTab === 'reporting',
  });

  const eligibleManagers = allEmployees.filter(
    (e) =>
      e.id !== employee?.id &&
      ['org_owner', 'co_owner', 'manager', 'department_manager', 'supervisor'].includes(e.workspaceRole)
  );

  const [selectedManagerId, setSelectedManagerId] = useState<string>('');

  const assignManagerMutation = useMutation({
    mutationFn: async ({ managerId, employeeId }: { managerId: string; employeeId: string }) => {
      const r = await secureFetch('/api/manager-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ managerId, employeeId }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to assign manager');
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/manager-assignments/employee', employee?.id] });
      setSelectedManagerId('');
      toast({ title: 'Reporting line set', description: `${employee?.firstName} now reports to the selected manager.` });
    },
    onError: (e: Error) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    },
  });

  const removeAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const r = await secureFetch(`/api/manager-assignments/${assignmentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!r.ok && r.status !== 204) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to remove assignment');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/manager-assignments/employee', employee?.id] });
      toast({ title: 'Reporting line removed' });
    },
    onError: (e: Error) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    },
  });

  // ─────────────────────────────────────────────────────────────────────────

  const terminateMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const response = await secureFetch(`/api/employees/${employeeId}/access`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: false }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to terminate employee');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
      toast({
        title: "Employment Terminated",
        description: `${employee?.firstName} ${employee?.lastName}'s employment has been terminated.`,
      });
      setConfirmAction(null);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setConfirmAction(null);
    },
  });

  const handleSave = () => {
    if (!employee?.id) return;
    const updates: Record<string, any> = {
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: formData.phone || undefined,
      role: formData.role || undefined,
      organizationalTitle: formData.organizationalTitle || "staff",
      hourlyRate: formData.hourlyRate ? parseFloat(formData.hourlyRate) : undefined,
      payType: formData.payType,
      payFrequency: formData.payFrequency,
      hireDate: formData.hireDate ? new Date(formData.hireDate).toISOString() : undefined,
      isArmed: formData.isArmed,
      travelRadiusMiles: formData.travelRadiusMiles,
      availabilityMode: formData.availabilityMode,
    };
    if (formData.position) {
      updates.position = formData.position;
    }
    editMutation.mutate({ id: employee.id, updates });
  };

  const handleRoleChange = (newRole: WorkspaceRole) => {
    if (!employee?.id) return;
    
    // Security check: verify user has permission to modify this employee and assign this role
    if (!canModify) {
      toast({ title: "Permission Denied", description: "You cannot modify this employee's role", variant: "destructive" });
      setPendingRole(null);
      return;
    }
    if (!canAssignRole(currentUserRole, newRole)) {
      toast({ title: "Permission Denied", description: "You cannot assign this role level", variant: "destructive" });
      setPendingRole(null);
      return;
    }
    if (isOwnerProtected) {
      toast({ title: "Protected Role", description: "Organization Owner cannot be demoted", variant: "destructive" });
      setPendingRole(null);
      return;
    }
    
    // Determine if it's a promotion or demotion using role hierarchy
    const currentLevel = getRoleTier(employee.workspaceRole);
    const newLevel = getRoleTier(newRole);

    setPendingRole(newRole);
    setConfirmAction(newLevel < currentLevel ? 'promote' : 'demote');
  };

  const confirmRoleChange = () => {
    if (!employee?.id || !pendingRole) return;
    
    // Re-validate permissions before making the API call
    if (!canModify || !canAssignRole(currentUserRole, pendingRole) || isOwnerProtected) {
      toast({ title: "Permission Denied", description: "You cannot perform this action", variant: "destructive" });
      setPendingRole(null);
      setConfirmAction(null);
      return;
    }
    
    roleChangeMutation.mutate({ employeeId: employee.id, newRole: pendingRole });
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || 'U';
  };

  // Content for both Dialog and Drawer
  const handleClose = () => {
    if (formData.firstName !== (employee?.firstName || "") ||
        formData.lastName !== (employee?.lastName || "") ||
        formData.email !== (employee?.email || "") ||
        formData.phone !== (employee?.phone || "") ||
        formData.role !== (employee?.role || "") ||
        formData.position !== ((employee as any)?.position || "") ||
        formData.organizationalTitle !== ((employee as any)?.organizationalTitle || "staff") ||
        formData.hourlyRate !== (employee?.hourlyRate?.toString() || "") ||
        formData.payType !== ((employee as any)?.payType || "hourly") ||
        formData.payFrequency !== ((employee as any)?.payFrequency || "biweekly") ||
        formData.isArmed !== ((employee as any)?.isArmed ?? false) ||
        formData.travelRadiusMiles !== ((employee as any)?.travelRadiusMiles ?? 25) ||
        formData.availabilityMode !== ((employee as any)?.availabilityMode ?? "open")) {
      if (!confirm('You have unsaved changes. Discard them?')) return;
    }
    onOpenChange(false);
  };

  const content = (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-3 mb-3 shrink-0 px-1">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback 
            style={{ backgroundColor: employee?.color || '#3b82f6' }}
            className="text-white font-medium text-sm"
          >
            {employee ? getInitials(employee.firstName, employee.lastName) : 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">
            {employee?.firstName} {employee?.lastName}
          </h3>
          <div className="flex items-center gap-1.5 flex-wrap">
            {employee?.employeeNumber && (
              <span className="text-xs text-muted-foreground">
                {employee.employeeNumber}
              </span>
            )}
            <Badge 
              variant="outline" 
              className={`text-[10px] leading-tight ${getRoleBadgeColor(employee?.workspaceRole)}`}
            >
              {ROLE_LABELS[normalizeRole(employee?.workspaceRole)] || 'Staff'}
            </Badge>
            {!employee?.isActive && (
              <Badge variant="destructive" className="text-[10px] leading-tight">Inactive</Badge>
            )}
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="grid w-full grid-cols-4 shrink-0">
          <TabsTrigger value="details" className="text-xs gap-1" data-testid="tab-details">
            <User className="h-3.5 w-3.5 shrink-0 hidden sm:block" />
            Details
          </TabsTrigger>
          <TabsTrigger value="role" className="text-xs gap-1" data-testid="tab-role">
            <Shield className="h-3.5 w-3.5 shrink-0 hidden sm:block" />
            Role
          </TabsTrigger>
          <TabsTrigger value="reporting" className="text-xs gap-1" data-testid="tab-reporting">
            <Users className="h-3.5 w-3.5 shrink-0 hidden sm:block" />
            Reports To
          </TabsTrigger>
          <TabsTrigger value="actions" className="text-xs gap-1" data-testid="tab-actions">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 hidden sm:block" />
            Actions
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 min-h-0 mt-3 overflow-y-auto pr-1">
          <TabsContent value="details" className="mt-0 space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label htmlFor="edit-firstName" className="text-xs flex items-center gap-1">
                  <User className="h-3 w-3 shrink-0" /> First Name
                </Label>
                <Input
                  id="edit-firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  data-testid="input-edit-firstname"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-lastName" className="text-xs flex items-center gap-1">
                  <User className="h-3 w-3 shrink-0" /> Last Name
                </Label>
                <Input
                  id="edit-lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  data-testid="input-edit-lastname"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-email" className="text-xs flex items-center gap-1">
                <Mail className="h-3 w-3 shrink-0" /> Email
              </Label>
              <Input
                id="edit-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                data-testid="input-edit-email"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-phone" className="text-xs flex items-center gap-1">
                <Phone className="h-3 w-3 shrink-0" /> Phone
              </Label>
              <Input
                id="edit-phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                data-testid="input-edit-phone"
              />
            </div>

            <Separator />

            <div className="grid grid-cols-1 gap-2.5">
              <div className="space-y-1">
                <Label htmlFor="edit-position" className="text-xs flex items-center gap-1">
                  <Briefcase className="h-3 w-3 shrink-0" /> Position
                </Label>
                <Select
                  value={formData.position}
                  onValueChange={(value) => {
                    const pos = getPositionById(value);
                    setFormData({
                      ...formData,
                      position: value,
                      role: pos?.label || formData.role,
                    });
                  }}
                >
                  <SelectTrigger data-testid="select-edit-position">
                    <SelectValue placeholder="Select position">
                      {formData.position && (() => {
                        const pos = getPositionById(formData.position);
                        if (!pos) return formData.position;
                        return (
                          <span className="flex items-center gap-1.5 truncate">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: pos.color }}
                            />
                            <span className="truncate">{pos.label}</span>
                          </span>
                        );
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[40dvh]">
                    {positionsByCategory.map(cat => (
                      <SelectGroup key={cat.id}>
                        <SelectLabel className="flex items-center gap-1.5 text-xs">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: cat.color }}
                          />
                          {cat.label}
                        </SelectLabel>
                        {cat.positions.map(pos => (
                          <SelectItem
                            key={pos.id}
                            value={pos.id}
                            data-testid={`option-position-${pos.id}`}
                          >
                            <span className="flex items-center gap-1.5 w-full">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: pos.color }}
                              />
                              <span className="truncate flex-1">{pos.label}</span>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                Lv{pos.authorityLevel}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                {formData.position && (() => {
                  const pos = getPositionById(formData.position);
                  if (!pos) return null;
                  return (
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Lv {pos.authorityLevel} · {pos.armedStatus !== 'n/a' ? pos.armedStatus : 'Non-field'} · {pos.workspaceRole}
                    </p>
                  );
                })()}
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-hourlyRate" className="text-xs flex items-center gap-1">
                  <DollarSign className="h-3 w-3 shrink-0" /> Hourly Rate
                </Label>
                <Input
                  id="edit-hourlyRate"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={formData.hourlyRate}
                  onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                  data-testid="input-edit-rate"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="edit-payType" className="text-xs flex items-center gap-1">
                    <DollarSign className="h-3 w-3 shrink-0" /> Pay Type
                  </Label>
                  <Select
                    value={formData.payType}
                    onValueChange={(value) => setFormData({ ...formData, payType: value })}
                  >
                    <SelectTrigger id="edit-payType" className="text-xs" data-testid="select-edit-pay-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="salary">Salary</SelectItem>
                      <SelectItem value="commission">Commission</SelectItem>
                      <SelectItem value="contractor">Contractor (1099)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-payFrequency" className="text-xs">Pay Frequency</Label>
                  <Select
                    value={formData.payFrequency}
                    onValueChange={(value) => setFormData({ ...formData, payFrequency: value })}
                  >
                    <SelectTrigger id="edit-payFrequency" className="text-xs" data-testid="select-edit-pay-frequency">
                      <SelectValue />
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
              <div className="space-y-1">
                <Label htmlFor="edit-hireDate" className="text-xs flex items-center gap-1">
                  <Briefcase className="h-3 w-3 shrink-0" /> Hire Date
                </Label>
                <Input
                  id="edit-hireDate"
                  type="date"
                  value={formData.hireDate}
                  onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                  data-testid="input-edit-hire-date"
                />
              </div>
            </div>

            <Separator />

            {/* Scheduling Intelligence */}
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Star className="h-3 w-3 shrink-0" /> Scheduling
              </p>

              <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                <div>
                  <p className="text-xs font-medium flex items-center gap-1">
                    <Shield className="h-3 w-3 shrink-0" /> Armed Officer
                  </p>
                  <p className="text-[11px] text-muted-foreground">Eligible for armed post assignments</p>
                </div>
                <Switch
                  checked={formData.isArmed}
                  onCheckedChange={(v) => setFormData({ ...formData, isArmed: v })}
                  data-testid="switch-employee-armed"
                />
              </div>

              {(employee as any)?.armedLicenseVerified !== undefined && (
                <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                  <div>
                    <p className="text-xs font-medium flex items-center gap-1">
                      <Check className="h-3 w-3 shrink-0" /> License Verified
                    </p>
                    <p className="text-[11px] text-muted-foreground">Armed license cleared by compliance</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={(employee as any).armedLicenseVerified
                      ? "text-green-700 border-green-400 bg-green-50 dark:text-green-400 dark:bg-green-950/30"
                      : "text-muted-foreground"
                    }
                    data-testid="status-license-verified"
                  >
                    {(employee as any).armedLicenseVerified ? "Verified" : "Pending"}
                  </Badge>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label htmlFor="edit-travelRadius" className="text-xs flex items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0" /> Travel Radius (mi)
                  </Label>
                  <Input
                    id="edit-travelRadius"
                    type="number"
                    min={0}
                    max={200}
                    inputMode="numeric"
                    value={formData.travelRadiusMiles}
                    onChange={(e) => setFormData({ ...formData, travelRadiusMiles: parseInt(e.target.value) || 25 })}
                    data-testid="input-edit-travel-radius"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit-schedulingScore" className="text-xs flex items-center gap-1">
                    <Star className="h-3 w-3 shrink-0" /> Scheduling Score
                  </Label>
                  <div
                    className="flex items-center h-9 px-3 rounded-md border bg-muted/40 gap-2"
                    data-testid="display-scheduling-score"
                  >
                    <span className="text-sm font-semibold">
                      {(employee as any)?.schedulingScore ?? 75}
                    </span>
                    <span className="text-xs text-muted-foreground">/ 100</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-availabilityMode" className="text-xs flex items-center gap-1">
                  <Clock className="h-3 w-3 shrink-0" /> Availability Mode
                </Label>
                <Select
                  value={formData.availabilityMode}
                  onValueChange={(v) => setFormData({ ...formData, availabilityMode: v as "open" | "restricted" | "unavailable" })}
                >
                  <SelectTrigger id="edit-availabilityMode" data-testid="select-edit-availability-mode">
                    <SelectValue placeholder="Select availability" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open — available for all shifts</SelectItem>
                    <SelectItem value="restricted">Restricted — preferred hours only</SelectItem>
                    <SelectItem value="unavailable">Unavailable — do not schedule</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="role" className="mt-0 space-y-3">
            <div className="rounded-lg border p-2.5 bg-muted/30">
              <div className="flex items-center gap-2 mb-1.5">
                <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="text-xs font-medium">Current Role</span>
              </div>
              <Badge 
                variant="outline" 
                className={`${getRoleBadgeColor(employee?.workspaceRole)} text-xs`}
              >
                {ROLE_LABELS[normalizeRole(employee?.workspaceRole)] || 'Staff'}
              </Badge>
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
                {ROLE_DESCRIPTIONS[normalizeRole(employee?.workspaceRole)] || 'Standard employee access'}
              </p>
            </div>

            {isOwnerProtected && (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-2.5">
                <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                  <Shield className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-xs font-medium">Protected Role</span>
                </div>
                <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-1 leading-snug">
                  Organization Owner cannot be demoted or removed.
                </p>
              </div>
            )}

            {canModify && !isOwnerProtected && assignableRoles.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Change Role</Label>
                <div className="grid gap-1.5">
                  {assignableRoles.map((role) => {
                    const isCurrentRole = normalizeRole(employee?.workspaceRole) === normalizeRole(role);
                    const currentLevel = getRoleTier(employee?.workspaceRole);
                    const roleLevel = getRoleTier(role);
                    const isPromotion = roleLevel < currentLevel;
                    
                    return (
                      <Button
                        key={role}
                        variant={isCurrentRole ? "secondary" : "outline"}
                        className={`justify-start h-auto py-2 px-2.5 ${isCurrentRole ? 'border border-primary' : ''}`}
                        disabled={isCurrentRole || roleChangeMutation.isPending}
                        onClick={() => handleRoleChange(role)}
                        data-testid={`button-role-${role}`}
                      >
                        <div className="flex items-center gap-2 w-full min-w-0">
                          {isPromotion ? (
                            <ChevronUp className="h-3.5 w-3.5 text-green-500 shrink-0" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                          )}
                          <div className="flex-1 text-left min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-xs truncate">{ROLE_LABELS[role]}</span>
                              {isCurrentRole && <Check className="h-3 w-3 text-primary shrink-0" />}
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate leading-snug">
                              {ROLE_DESCRIPTIONS[role]}
                            </p>
                          </div>
                        </div>
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {!canModify && (
              <div className="rounded-lg border p-2.5 bg-muted/50">
                <p className="text-xs text-muted-foreground">
                  You don't have permission to change this employee's role.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="reporting" className="mt-0 space-y-3">
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">
                  Set who {employee?.firstName} reports to. Their manager or supervisor will be notified of requests
                  and will appear in Trinity's escalation routing.
                </p>
              </div>

              {/* Current reporting lines */}
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <UserCheck className="h-3 w-3 shrink-0" /> Current Manager / Supervisor
                </Label>
                {assignmentsLoading ? (
                  <Skeleton className="h-10 w-full rounded-md" />
                ) : currentAssignments.length === 0 ? (
                  <div className="rounded-md border border-dashed p-3 text-center">
                    <p className="text-xs text-muted-foreground">No manager assigned yet</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {currentAssignments.map((a) => {
                      const mgr = allEmployees.find((e) => e.id === a.managerId);
                      const label = mgr
                        ? `${mgr.firstName} ${mgr.lastName}`
                        : a.managerId;
                      return (
                        <div
                          key={a.id}
                          className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                          data-testid={`reporting-assignment-${a.id}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar className="h-6 w-6 shrink-0">
                              <AvatarFallback className="text-[10px]">
                                {(mgr?.firstName?.[0] || '') + (mgr?.lastName?.[0] || '')}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{label}</p>
                              {mgr?.workspaceRole && (
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {ROLE_LABELS[mgr.workspaceRole as WorkspaceRole] || mgr.workspaceRole}
                                </p>
                              )}
                            </div>
                          </div>
                          {canModify && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeAssignmentMutation.mutate(a.id)}
                              disabled={removeAssignmentMutation.isPending}
                              data-testid={`button-remove-assignment-${a.id}`}
                              title="Remove reporting line"
                            >
                              <Link2Off className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Assign new manager */}
              {canModify && (
                <div className="space-y-1.5 pt-1 border-t">
                  <Label className="text-xs flex items-center gap-1">
                    <Users className="h-3 w-3 shrink-0" /> Assign Manager / Supervisor
                  </Label>
                  <div className="flex gap-2">
                    <Select value={selectedManagerId} onValueChange={setSelectedManagerId}>
                      <SelectTrigger className="flex-1 text-xs" data-testid="select-manager-assign">
                        <SelectValue placeholder="Select a manager or supervisor..." />
                      </SelectTrigger>
                      <SelectContent>
                        {eligibleManagers.length === 0 ? (
                          <SelectItem value="__none__" disabled>No eligible managers found</SelectItem>
                        ) : (
                          eligibleManagers.map((mgr) => (
                            <SelectItem key={mgr.id} value={mgr.id}>
                              {mgr.firstName} {mgr.lastName} — {ROLE_LABELS[mgr.workspaceRole as WorkspaceRole] || mgr.workspaceRole}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <Button
                      size="default"
                      disabled={!selectedManagerId || assignManagerMutation.isPending}
                      onClick={() => {
                        if (employee?.id && selectedManagerId) {
                          assignManagerMutation.mutate({ managerId: selectedManagerId, employeeId: employee.id });
                        }
                      }}
                      data-testid="button-assign-manager"
                    >
                      {assignManagerMutation.isPending ? 'Assigning...' : 'Assign'}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Only managers, department managers, supervisors, and owners are shown.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="actions" className="mt-0 space-y-3">
            {canModify && !isOwnerProtected ? (
              <>
                {permissions.canSuspendUsers && !employee?.isActive && (
                  <div className="rounded-lg border border-green-500/30 p-2.5">
                    <div className="flex items-start gap-2.5">
                      <div className="p-1.5 rounded-md bg-green-500/10 shrink-0">
                        <UserCheck className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-xs text-green-700 dark:text-green-400">Reactivate Employee</h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                          Restore access. If your workspace is above its seat limit, overage billing applies.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-1.5 border-green-500/40 text-green-700 dark:text-green-400"
                          onClick={() => setConfirmAction('reactivate')}
                          disabled={reactivateMutation.isPending}
                          data-testid="button-reactivate-employee"
                        >
                          Reactivate
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {permissions.canSuspendUsers && (
                  <div className="rounded-lg border p-2.5">
                    <div className="flex items-start gap-2.5">
                      <div className="p-1.5 rounded-md bg-orange-500/10 shrink-0">
                        <UserMinus className="h-3.5 w-3.5 text-orange-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-xs">Suspend Employee</h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                          Temporarily disable access. Can be reactivated later.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-1.5"
                          onClick={() => setConfirmAction('suspend')}
                          disabled={!employee?.isActive}
                          data-testid="button-suspend-employee"
                        >
                          {employee?.isActive ? 'Suspend' : 'Already Suspended'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {permissions.canSuspendUsers && (
                  <div className="rounded-lg border border-orange-500/30 p-2.5">
                    <div className="flex items-start gap-2.5">
                      <div className="p-1.5 rounded-md bg-orange-500/10 shrink-0">
                        <UserMinus className="h-3.5 w-3.5 text-orange-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-xs text-orange-600 dark:text-orange-400">Terminate Employment</h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                          Formally end employment. Records termination date and deactivates access.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-1.5 border-orange-500/40 text-orange-600 dark:text-orange-400"
                          onClick={() => setConfirmAction('terminate')}
                          disabled={!(employee?.isActive)}
                          data-testid="button-terminate-employee"
                        >
                          {employee?.isActive ? 'Terminate Employment' : 'Already Terminated'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {permissions.canRemoveUsers && (
                  <div className="rounded-lg border border-destructive/30 p-2.5">
                    <div className="flex items-start gap-2.5">
                      <div className="p-1.5 rounded-md bg-destructive/10 shrink-0">
                        <UserX className="h-3.5 w-3.5 text-destructive" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-xs text-destructive">Remove Employee</h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                          Permanently remove from organization. Cannot be undone.
                        </p>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="mt-1.5"
                          onClick={() => setConfirmAction('remove')}
                          data-testid="button-remove-employee"
                        >
                          Remove Permanently
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {!permissions.canSuspendUsers && !permissions.canRemoveUsers && (
                  <div className="rounded-lg border p-2.5 bg-muted/50">
                    <p className="text-xs text-muted-foreground">
                      No administrative actions available for your role.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-lg border p-2.5 bg-muted/50">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Shield className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-xs leading-snug">
                    {isOwnerProtected 
                      ? "Organization Owner cannot be suspended or removed."
                      : "You don't have permission to perform these actions."}
                  </span>
                </div>
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );

  const footer = (
    <>
      <Button
        variant="outline"
        onClick={() => onOpenChange(false)}
        className="flex-1 min-w-0"
        data-testid="button-cancel-edit"
      >
        Cancel
      </Button>
      <Button
        onClick={handleSave}
        disabled={editMutation.isPending}
        className="flex-1 min-w-0"
        data-testid="button-save-edit"
      >
        {editMutation.isPending ? "Saving..." : "Save"}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Edit Employee</DrawerTitle>
              <DrawerDescription>
                Update employee info and access
              </DrawerDescription>
            </DrawerHeader>
            <div
              data-vaul-no-drag
              className="px-4 pb-2 flex-1 min-h-0 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
            >
              {content}
            </div>
            <DrawerFooter className="flex-row">
              {footer}
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

        <ConfirmationDialogs
          confirmAction={confirmAction}
          setConfirmAction={setConfirmAction}
          employee={employee}
          pendingRole={pendingRole}
          confirmRoleChange={confirmRoleChange}
          suspendMutation={suspendMutation}
          removeMutation={removeMutation}
          roleChangeMutation={roleChangeMutation}
          terminateMutation={terminateMutation}
          reactivateMutation={reactivateMutation}
          overageWarning={overageWarning}
        />
      </>
    );
  }

  return (
    <>
      <UniversalModal open={open} onOpenChange={(open) => { if (!open) handleClose(); else onOpenChange(true); }} size="lg" className="flex flex-col">
          <UniversalModalHeader>
            <div className="flex items-center justify-between w-full">
              <UniversalModalTitle>Edit Employee</UniversalModalTitle>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 -mr-2"
                onClick={handleClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <UniversalModalDescription>
              Update employee information and manage access
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="flex-1 min-h-0 overflow-y-auto py-2">
            {content}
          </div>
          <UniversalModalFooter className="flex-row gap-2">
            {footer}
          </UniversalModalFooter>
      </UniversalModal>

      <ConfirmationDialogs
        confirmAction={confirmAction}
        setConfirmAction={setConfirmAction}
        employee={employee}
        pendingRole={pendingRole}
        confirmRoleChange={confirmRoleChange}
        suspendMutation={suspendMutation}
        removeMutation={removeMutation}
        roleChangeMutation={roleChangeMutation}
        terminateMutation={terminateMutation}
        reactivateMutation={reactivateMutation}
        overageWarning={overageWarning}
      />
    </>
  );
}

// Extracted confirmation dialogs component
function ConfirmationDialogs({
  confirmAction,
  setConfirmAction,
  employee,
  pendingRole,
  confirmRoleChange,
  suspendMutation,
  removeMutation,
  roleChangeMutation,
  terminateMutation,
  reactivateMutation,
  overageWarning,
}: {
  confirmAction: 'suspend' | 'remove' | 'promote' | 'demote' | 'terminate' | 'reactivate' | null;
  setConfirmAction: (action: 'suspend' | 'remove' | 'promote' | 'demote' | 'terminate' | 'reactivate' | null) => void;
  employee: Employee | null;
  pendingRole: WorkspaceRole | null;
  confirmRoleChange: () => void;
  suspendMutation: any;
  removeMutation: any;
  roleChangeMutation: any;
  terminateMutation: any;
  reactivateMutation: any;
  overageWarning: { message: string; projectedMonthlyCharge: string } | null;
}) {
  return (
    <>
      <AlertDialog open={confirmAction === 'terminate'} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="w-[min(90vw,24rem)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm text-orange-600 dark:text-orange-400">Terminate Employment?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              This will formally end {employee?.firstName} {employee?.lastName}'s employment, record today's termination date, and disable their access. This action can be reviewed in HR records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel data-testid="button-cancel-terminate">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => employee?.id && terminateMutation.mutate(employee.id)}
              disabled={terminateMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
              data-testid="button-confirm-terminate"
            >
              {terminateMutation.isPending ? "Terminating..." : "Terminate Employment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAction === 'reactivate'} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="w-[min(90vw,24rem)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Reactivate Employee?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              This will restore {employee?.firstName} {employee?.lastName}'s access to the platform.
              {overageWarning && (
                <span className="block mt-2 font-medium text-amber-600 dark:text-amber-400">
                  Seat overage: {overageWarning.message} ({overageWarning.projectedMonthlyCharge})
                </span>
              )}
              {!overageWarning && (
                <span className="block mt-1">If your workspace is above its seat limit, overage billing will apply.</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel data-testid="button-cancel-reactivate">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => employee?.id && reactivateMutation.mutate(employee.id)}
              disabled={reactivateMutation.isPending}
              data-testid="button-confirm-reactivate"
            >
              {reactivateMutation.isPending ? "Reactivating..." : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAction === 'suspend'} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="w-[min(90vw,24rem)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Suspend Employee?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              This will temporarily disable {employee?.firstName} {employee?.lastName}'s access.
              They won't be able to clock in or view schedules until reactivated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel data-testid="button-cancel-suspend">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => employee?.id && suspendMutation.mutate(employee.id)}
              disabled={suspendMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
              data-testid="button-confirm-suspend"
            >
              {suspendMutation.isPending ? "Suspending..." : "Suspend"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAction === 'remove'} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="w-[min(90vw,24rem)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm text-destructive">Remove Permanently?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              This will permanently remove {employee?.firstName} {employee?.lastName} and all their data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel data-testid="button-cancel-remove">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => employee?.id && removeMutation.mutate(employee.id)}
              disabled={removeMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-remove"
            >
              {removeMutation.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAction === 'promote' || confirmAction === 'demote'} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="w-[min(90vw,24rem)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              {confirmAction === 'promote' ? 'Promote Employee?' : 'Demote Employee?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              {confirmAction === 'promote' 
                ? `Promote ${employee?.firstName} to ${pendingRole ? ROLE_LABELS[pendingRole] : 'a higher role'}. They will gain additional permissions.`
                : `Demote ${employee?.firstName} to ${pendingRole ? ROLE_LABELS[pendingRole] : 'a lower role'}. They will lose some permissions.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel data-testid="button-cancel-role-change">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRoleChange}
              className={confirmAction === 'promote' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}
              data-testid="button-confirm-role-change"
            >
              {roleChangeMutation.isPending ? "Updating..." : confirmAction === 'promote' ? 'Promote' : 'Demote'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
