import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/config/queryKeys";
import { useIsMobile } from "@/hooks/use-mobile";
import { 
  getAssignableRoles, 
  canModifyUser, 
  isProtectedRole,
  ROLE_LABELS, 
  ROLE_DESCRIPTIONS,
  getRoleBadgeColor,
  normalizeRole,
  getRolePermissions,
  type WorkspaceRole 
} from "@/lib/roleHierarchy";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
} from "lucide-react";

import type { Employee } from "@shared/schema";

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
  const [confirmAction, setConfirmAction] = useState<'suspend' | 'remove' | 'promote' | 'demote' | null>(null);
  const [pendingRole, setPendingRole] = useState<WorkspaceRole | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "",
    organizationalTitle: "staff",
    hourlyRate: "",
    workspaceRole: "staff" as WorkspaceRole,
  });

  // Reset form when employee changes
  useEffect(() => {
    if (employee) {
      setFormData({
        firstName: employee.firstName || "",
        lastName: employee.lastName || "",
        email: employee.email || "",
        phone: employee.phone || "",
        role: employee.role || "",
        organizationalTitle: (employee as any).organizationalTitle || "staff",
        hourlyRate: employee.hourlyRate?.toString() || "",
        workspaceRole: (employee.workspaceRole || "staff") as WorkspaceRole,
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
      const response = await fetch(`/api/employees/${data.id}`, {
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
      const response = await fetch(`/api/employees/${employeeId}/role`, {
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

  // Suspend mutation (uses access toggle endpoint)
  const suspendMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const response = await fetch(`/api/employees/${employeeId}/access`, {
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
      const response = await fetch(`/api/employees/${employeeId}`, {
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

  const handleSave = () => {
    if (!employee?.id) return;
    editMutation.mutate({
      id: employee.id,
      updates: {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone || undefined,
        role: formData.role || undefined,
        organizationalTitle: formData.organizationalTitle || "staff",
        hourlyRate: formData.hourlyRate ? parseFloat(formData.hourlyRate) : undefined,
      },
    });
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
    
    const currentTier = normalizeRole(employee.workspaceRole);
    const newTier = normalizeRole(newRole);
    
    // Determine if it's a promotion or demotion
    const currentLevel = { org_owner: 1, co_owner: 2, manager: 3, supervisor: 4, staff: 5 }[currentTier] || 5;
    const newLevel = { org_owner: 1, co_owner: 2, manager: 3, supervisor: 4, staff: 5 }[newTier] || 5;
    
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
  const content = (
    <div className="flex flex-col h-full">
      {/* Header with employee avatar */}
      <div className="flex items-center gap-3 mb-4">
        <Avatar className="h-12 w-12">
          <AvatarFallback 
            style={{ backgroundColor: employee?.color || '#3b82f6' }}
            className="text-white font-medium"
          >
            {employee ? getInitials(employee.firstName, employee.lastName) : 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">
            {employee?.firstName} {employee?.lastName}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            {employee?.employeeNumber && (
              <span className="text-xs text-muted-foreground">
                {employee.employeeNumber}
              </span>
            )}
            <Badge 
              variant="outline" 
              className={`text-xs ${getRoleBadgeColor(employee?.workspaceRole)}`}
            >
              {ROLE_LABELS[normalizeRole(employee?.workspaceRole)] || 'Staff'}
            </Badge>
            {!employee?.isActive && (
              <Badge variant="destructive" className="text-xs">Inactive</Badge>
            )}
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="details" className="text-xs sm:text-sm">
            <User className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Details
          </TabsTrigger>
          <TabsTrigger value="role" className="text-xs sm:text-sm">
            <Shield className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Role
          </TabsTrigger>
          <TabsTrigger value="actions" className="text-xs sm:text-sm">
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Actions
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1 mt-4">
          {/* Details Tab */}
          <TabsContent value="details" className="mt-0 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-firstName" className="text-xs flex items-center gap-1">
                  <User className="h-3 w-3" /> First Name
                </Label>
                <Input
                  id="edit-firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="h-9"
                  data-testid="input-edit-firstname"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-lastName" className="text-xs flex items-center gap-1">
                  <User className="h-3 w-3" /> Last Name
                </Label>
                <Input
                  id="edit-lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="h-9"
                  data-testid="input-edit-lastname"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-email" className="text-xs flex items-center gap-1">
                <Mail className="h-3 w-3" /> Email
              </Label>
              <Input
                id="edit-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="h-9"
                data-testid="input-edit-email"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-phone" className="text-xs flex items-center gap-1">
                <Phone className="h-3 w-3" /> Phone
              </Label>
              <Input
                id="edit-phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="h-9"
                data-testid="input-edit-phone"
              />
            </div>

            <Separator className="my-3" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-role" className="text-xs flex items-center gap-1">
                  <Briefcase className="h-3 w-3" /> Position
                </Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger className="h-9" data-testid="select-edit-position">
                    <SelectValue placeholder="Select position" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Security Guard">Security Guard</SelectItem>
                    <SelectItem value="Security Officer">Security Officer</SelectItem>
                    <SelectItem value="Plumber">Plumber</SelectItem>
                    <SelectItem value="Electrician">Electrician</SelectItem>
                    <SelectItem value="HVAC Technician">HVAC Technician</SelectItem>
                    <SelectItem value="Cleaner">Cleaner</SelectItem>
                    <SelectItem value="Maintenance Technician">Maintenance Technician</SelectItem>
                    <SelectItem value="Landscaper">Landscaper</SelectItem>
                    <SelectItem value="Caregiver">Caregiver</SelectItem>
                    <SelectItem value="Driver">Driver</SelectItem>
                    <SelectItem value="Warehouse Worker">Warehouse Worker</SelectItem>
                    <SelectItem value="Team Lead">Team Lead</SelectItem>
                    <SelectItem value="General Manager">General Manager</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-hourlyRate" className="text-xs flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> Hourly Rate
                </Label>
                <Input
                  id="edit-hourlyRate"
                  type="number"
                  step="0.01"
                  value={formData.hourlyRate}
                  onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                  className="h-9"
                  data-testid="input-edit-rate"
                />
              </div>
            </div>
          </TabsContent>

          {/* Role Tab */}
          <TabsContent value="role" className="mt-0 space-y-4">
            <div className="rounded-lg border p-3 bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">Current Role</span>
              </div>
              <Badge 
                variant="outline" 
                className={`${getRoleBadgeColor(employee?.workspaceRole)} text-sm py-1 px-3`}
              >
                {ROLE_LABELS[normalizeRole(employee?.workspaceRole)] || 'Staff'}
              </Badge>
              <p className="text-xs text-muted-foreground mt-2">
                {ROLE_DESCRIPTIONS[normalizeRole(employee?.workspaceRole)] || 'Standard employee access'}
              </p>
            </div>

            {isOwnerProtected && (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <Shield className="h-4 w-4" />
                  <span className="text-sm font-medium">Protected Role</span>
                </div>
                <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-1">
                  Organization Owner cannot be demoted or removed. This ensures the organization always has an owner.
                </p>
              </div>
            )}

            {canModify && !isOwnerProtected && assignableRoles.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">Change Role</Label>
                <div className="grid gap-2">
                  {assignableRoles.map((role) => {
                    const isCurrentRole = normalizeRole(employee?.workspaceRole) === normalizeRole(role);
                    const currentLevel = { org_owner: 1, co_owner: 2, manager: 3, supervisor: 4, staff: 5 }[normalizeRole(employee?.workspaceRole)] || 5;
                    const roleLevel = { org_owner: 1, co_owner: 2, manager: 3, supervisor: 4, staff: 5 }[normalizeRole(role)] || 5;
                    const isPromotion = roleLevel < currentLevel;
                    
                    return (
                      <Button
                        key={role}
                        variant={isCurrentRole ? "secondary" : "outline"}
                        className={`justify-start h-auto py-2.5 px-3 ${isCurrentRole ? 'border-2 border-primary' : ''}`}
                        disabled={isCurrentRole || roleChangeMutation.isPending}
                        onClick={() => handleRoleChange(role)}
                        data-testid={`button-role-${role}`}
                      >
                        <div className="flex items-center gap-3 w-full">
                          {isPromotion ? (
                            <ChevronUp className="h-4 w-4 text-green-500 shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-orange-500 shrink-0" />
                          )}
                          <div className="flex-1 text-left">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{ROLE_LABELS[role]}</span>
                              {isCurrentRole && <Check className="h-3.5 w-3.5 text-primary" />}
                            </div>
                            <p className="text-xs text-muted-foreground">
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
              <div className="rounded-lg border p-3 bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  You don't have permission to change this employee's role.
                </p>
              </div>
            )}
          </TabsContent>

          {/* Actions Tab */}
          <TabsContent value="actions" className="mt-0 space-y-4">
            {canModify && !isOwnerProtected ? (
              <>
                {/* Suspend Action */}
                {permissions.canSuspendUsers && (
                  <div className="rounded-lg border p-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-orange-500/10">
                        <UserMinus className="h-4 w-4 text-orange-500" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-sm">Suspend Employee</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Temporarily disable access. Employee can be reactivated later.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 text-orange-600 border-orange-500/30 hover:bg-orange-500/10"
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

                {/* Remove Action */}
                {permissions.canRemoveUsers && (
                  <div className="rounded-lg border border-destructive/30 p-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-destructive/10">
                        <UserX className="h-4 w-4 text-destructive" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-sm text-destructive">Remove Employee</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Permanently remove from organization. This action cannot be undone.
                        </p>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="mt-2"
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
                  <div className="rounded-lg border p-3 bg-muted/50">
                    <p className="text-sm text-muted-foreground">
                      No administrative actions available for your role.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-lg border p-3 bg-muted/50">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Shield className="h-4 w-4" />
                  <span className="text-sm">
                    {isOwnerProtected 
                      ? "Organization Owner cannot be suspended or removed."
                      : "You don't have permission to perform these actions."}
                  </span>
                </div>
              </div>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );

  // Footer with save button
  const footer = (
    <div className="flex flex-col sm:flex-row gap-2 w-full">
      <Button
        variant="outline"
        onClick={() => onOpenChange(false)}
        className="w-full sm:w-auto"
        data-testid="button-cancel-edit"
      >
        Cancel
      </Button>
      <Button
        onClick={handleSave}
        disabled={editMutation.isPending}
        className="w-full sm:w-auto"
        data-testid="button-save-edit"
      >
        {editMutation.isPending ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );

  // Use Drawer for mobile, Dialog for desktop
  if (isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent className="max-h-[90vh]">
            <DrawerHeader className="pb-0">
              <DrawerTitle>Edit Employee</DrawerTitle>
              <DrawerDescription>
                Update employee information and manage access
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4 py-2 flex-1 overflow-hidden">
              {content}
            </div>
            <DrawerFooter className="pt-2">
              {footer}
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

        {/* Confirmation Dialogs */}
        <ConfirmationDialogs
          confirmAction={confirmAction}
          setConfirmAction={setConfirmAction}
          employee={employee}
          pendingRole={pendingRole}
          confirmRoleChange={confirmRoleChange}
          suspendMutation={suspendMutation}
          removeMutation={removeMutation}
          roleChangeMutation={roleChangeMutation}
        />
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="lg" className="max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
            <DialogDescription>
              Update employee information and manage access
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden py-2">
            {content}
          </div>
          <DialogFooter>
            {footer}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialogs */}
      <ConfirmationDialogs
        confirmAction={confirmAction}
        setConfirmAction={setConfirmAction}
        employee={employee}
        pendingRole={pendingRole}
        confirmRoleChange={confirmRoleChange}
        suspendMutation={suspendMutation}
        removeMutation={removeMutation}
        roleChangeMutation={roleChangeMutation}
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
}: {
  confirmAction: 'suspend' | 'remove' | 'promote' | 'demote' | null;
  setConfirmAction: (action: 'suspend' | 'remove' | 'promote' | 'demote' | null) => void;
  employee: Employee | null;
  pendingRole: WorkspaceRole | null;
  confirmRoleChange: () => void;
  suspendMutation: any;
  removeMutation: any;
  roleChangeMutation: any;
}) {
  return (
    <>
      {/* Suspend Confirmation */}
      <AlertDialog open={confirmAction === 'suspend'} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend Employee?</AlertDialogTitle>
            <AlertDialogDescription>
              This will temporarily disable {employee?.firstName} {employee?.lastName}'s access to the organization.
              They will not be able to clock in, view schedules, or access any features until reactivated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-suspend">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => employee?.id && suspendMutation.mutate(employee.id)}
              className="bg-orange-600 hover:bg-orange-700"
              data-testid="button-confirm-suspend"
            >
              {suspendMutation.isPending ? "Suspending..." : "Suspend"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Confirmation */}
      <AlertDialog open={confirmAction === 'remove'} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Remove Employee Permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {employee?.firstName} {employee?.lastName} from your organization.
              All their data, time entries, and history will be deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => employee?.id && removeMutation.mutate(employee.id)}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-remove"
            >
              {removeMutation.isPending ? "Removing..." : "Remove Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Role Change Confirmation */}
      <AlertDialog open={confirmAction === 'promote' || confirmAction === 'demote'} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'promote' ? 'Promote Employee?' : 'Demote Employee?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'promote' 
                ? `This will promote ${employee?.firstName} ${employee?.lastName} to ${pendingRole ? ROLE_LABELS[pendingRole] : 'a higher role'}. They will gain additional permissions.`
                : `This will demote ${employee?.firstName} ${employee?.lastName} to ${pendingRole ? ROLE_LABELS[pendingRole] : 'a lower role'}. They will lose some permissions.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
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
