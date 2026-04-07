import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { useRoleLabels, useRoleLabelMutations, PLATFORM_DEFAULT_LABELS } from "@/hooks/use-role-labels";
import {
  Users, UserCog, Shield, Search, ChevronRight, Crown,
  Briefcase, ClipboardList, User as UserIcon, Tag, RotateCcw, Check
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  department?: string;
}

export default function RoleManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { workspaceRole } = useWorkspaceAccess();
  const { getRoleLabel, labels, isLoading: labelsLoading } = useRoleLabels();
  const { save: saveLabel, reset: resetLabel } = useRoleLabelMutations();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [newRole, setNewRole] = useState("");
  const [editingLabels, setEditingLabels] = useState<Record<string, string>>({});

  const isOwner = workspaceRole === 'org_owner' || workspaceRole === 'co_owner';

  // Fetch all employees in workspace
  const { data: employees = [], isLoading } = useQuery<{ data: Employee[] }, Error, Employee[]>({
    queryKey: ['/api/employees'],
    select: (res) => res?.data ?? [],
  });

  // Update employee role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async (data: { employeeId: string; role: string }) => {
      return await apiRequest('PATCH', `/api/employees/${data.employeeId}`, { role: data.role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
      toast({ title: "Role Updated", description: "Employee role has been successfully changed." });
      setSelectedEmployee(null);
      setNewRole("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update employee role", variant: "destructive" });
    },
  });

  const filteredEmployees = employees?.filter(emp =>
    `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'org_owner':
      case 'co_owner':
        return <Crown className="h-4 w-4 text-blue-600" />;
      case 'org_admin':
      case 'org_manager':
      case 'manager':
        return <Briefcase className="h-4 w-4 text-blue-500" />;
      case 'department_manager':
        return <ClipboardList className="h-4 w-4 text-blue-400" />;
      case 'supervisor':
        return <Shield className="h-4 w-4 text-blue-500" />;
      default:
        return <UserIcon className="h-4 w-4 text-slate-500" />;
    }
  };

  const getRoleBadgeVariant = (role: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (role) {
      case 'org_owner':
      case 'co_owner':
        return "default";
      case 'org_admin':
      case 'org_manager':
      case 'manager':
      case 'department_manager':
        return "secondary";
      default:
        return "outline";
    }
  };

  const handleRoleUpdate = () => {
    if (!selectedEmployee || !newRole) {
      toast({ title: "Error", description: "Please select a role", variant: "destructive" });
      return;
    }
    if (newRole === selectedEmployee.role) {
      toast({ title: "No Change", description: "Selected role is the same as current role", variant: "destructive" });
      return;
    }
    updateRoleMutation.mutate({ employeeId: selectedEmployee.id, role: newRole });
  };

  const handleSaveLabel = (role: string) => {
    const displayName = editingLabels[role]?.trim();
    if (!displayName) return;
    saveLabel.mutate({ role, displayName }, {
      onSuccess: () => {
        toast({ title: "Label Saved", description: `"${role}" now displays as "${displayName}"` });
        setEditingLabels(prev => { const n = { ...prev }; delete n[role]; return n; });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Failed to save label", variant: "destructive" });
      },
    });
  };

  const handleResetLabel = (role: string) => {
    resetLabel.mutate({ role }, {
      onSuccess: () => {
        toast({ title: "Label Reset", description: `"${role}" reset to "${PLATFORM_DEFAULT_LABELS[role]}"` });
        setEditingLabels(prev => { const n = { ...prev }; delete n[role]; return n; });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Failed to reset label", variant: "destructive" });
      },
    });
  };

  const pageConfig: CanvasPageConfig = {
    id: 'role-management',
    title: 'Role Management',
    subtitle: 'Manage employee roles and customise role display names for your organisation',
    category: 'admin',
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        {/* Row 1: Employee list + role change panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Employee List */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                All Employees
              </CardTitle>
              <CardDescription>Select an employee to manage their role</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or role..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-employee-search"
                />
              </div>

              <ScrollArea className="h-[500px]">
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading employees...</div>
                ) : filteredEmployees && filteredEmployees.length > 0 ? (
                  <div className="space-y-2">
                    {filteredEmployees.map((employee) => (
                      <div
                        key={employee.id}
                        className={`flex items-center justify-between gap-2 p-4 rounded-lg border hover-elevate cursor-pointer transition-colors ${
                          selectedEmployee?.id === employee.id ? 'border-primary bg-primary/5' : ''
                        }`}
                        onClick={() => { setSelectedEmployee(employee); setNewRole(employee.role); }}
                        data-testid={`employee-item-${employee.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {getRoleIcon(employee.role)}
                            <p className="font-medium text-sm">{employee.firstName} {employee.lastName}</p>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{employee.email}</p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge variant={getRoleBadgeVariant(employee.role)} className="text-xs">
                              {getRoleLabel(employee.role)}
                            </Badge>
                            {employee.department && (
                              <Badge variant="outline" className="text-xs">{employee.department}</Badge>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No employees found</p>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Role Update Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Change Role
              </CardTitle>
              <CardDescription>Promote or change employee role</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedEmployee ? (
                <div className="space-y-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm font-medium mb-1">
                      {selectedEmployee.firstName} {selectedEmployee.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground mb-2">{selectedEmployee.email}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">Current Role:</span>
                      <Badge variant={getRoleBadgeVariant(selectedEmployee.role)}>
                        {getRoleLabel(selectedEmployee.role)}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="role-select">New Role</Label>
                    <Select value={newRole} onValueChange={setNewRole}>
                      <SelectTrigger id="role-select" data-testid="select-new-role">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employee">{getRoleLabel('employee')}</SelectItem>
                        <SelectItem value="staff">{getRoleLabel('staff')}</SelectItem>
                        <SelectItem value="contractor">{getRoleLabel('contractor')}</SelectItem>
                        <SelectItem value="supervisor">{getRoleLabel('supervisor')}</SelectItem>
                        <SelectItem value="department_manager">{getRoleLabel('department_manager')}</SelectItem>
                        <SelectItem value="manager">{getRoleLabel('manager')}</SelectItem>
                        <SelectItem value="org_manager">{getRoleLabel('org_manager')}</SelectItem>
                        <SelectItem value="org_admin">{getRoleLabel('org_admin')}</SelectItem>
                        <SelectItem value="org_owner" disabled>{getRoleLabel('org_owner')} (Cannot Assign)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {newRole === 'org_admin' && "Can manage employees, run payroll, and configure the workspace"}
                      {newRole === 'org_manager' && "Visibility across all teams and operations"}
                      {newRole === 'manager' && "Can approve timesheets, shifts, and manage employees"}
                      {newRole === 'department_manager' && "Oversees their assigned department"}
                      {newRole === 'supervisor' && "Can oversee employees and approve time-off"}
                      {newRole === 'staff' && "General operational tasks"}
                      {newRole === 'employee' && "Standard field employee access"}
                      {newRole === 'contractor' && "Contract / temporary worker access"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Button
                      onClick={handleRoleUpdate}
                      disabled={updateRoleMutation.isPending || newRole === selectedEmployee.role}
                      className="w-full"
                      data-testid="button-update-role"
                    >
                      <UserCog className="h-4 w-4 mr-2" />
                      {updateRoleMutation.isPending ? "Updating..." : "Update Role"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => { setSelectedEmployee(null); setNewRole(""); }}
                      className="w-full"
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                  </div>

                  <div className="p-4 bg-muted/30 rounded-lg border border-dashed">
                    <p className="text-xs font-medium mb-2">Role Hierarchy:</p>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Crown className="h-3 w-3 text-yellow-500" />
                        {getRoleLabel('org_owner')}
                      </div>
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-3 w-3 text-blue-500" />
                        {getRoleLabel('manager')}
                      </div>
                      <div className="flex items-center gap-2">
                        <Shield className="h-3 w-3 text-blue-500" />
                        {getRoleLabel('supervisor')}
                      </div>
                      <div className="flex items-center gap-2">
                        <UserIcon className="h-3 w-3 text-muted-foreground" />
                        {getRoleLabel('employee')}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <UserCog className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Select an employee to manage their role</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Row 2: Role Label Customisation (owners only) */}
        {isOwner && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Role Display Labels
              </CardTitle>
              <CardDescription>
                Customise the display name for each role in your organisation. These labels appear everywhere employees see role names — rosters, notifications, shift rooms, and document blocks. The underlying permission level never changes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {labelsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading labels...</div>
              ) : (
                <div className="space-y-1">
                  {labels.map((entry, idx) => {
                    const editValue = editingLabels[entry.role] ?? entry.displayName;
                    const isDirty = editingLabels[entry.role] !== undefined && editingLabels[entry.role] !== entry.displayName;
                    return (
                      <div key={entry.role}>
                        {idx > 0 && <Separator className="my-3" />}
                        <div className="flex items-center gap-3 flex-wrap py-1">
                          {/* Role identifier — never changes */}
                          <div className="w-44 shrink-0">
                            <p className="text-sm font-medium">{entry.defaultLabel}</p>
                            <p className="text-xs text-muted-foreground font-mono">{entry.role}</p>
                          </div>

                          {/* Custom label input */}
                          <div className="flex-1 min-w-48">
                            <Input
                              value={editValue}
                              onChange={(e) => setEditingLabels(prev => ({ ...prev, [entry.role]: e.target.value }))}
                              placeholder={entry.defaultLabel}
                              maxLength={100}
                              className="h-9"
                              data-testid={`input-label-${entry.role}`}
                            />
                          </div>

                          {/* Status badge */}
                          {entry.isCustom && !isDirty && (
                            <Badge variant="secondary" className="text-xs shrink-0">Custom</Badge>
                          )}
                          {isDirty && (
                            <Badge variant="outline" className="text-xs shrink-0">Unsaved</Badge>
                          )}

                          {/* Save button */}
                          <Button
                            size="default"
                            onClick={() => handleSaveLabel(entry.role)}
                            disabled={!isDirty || saveLabel.isPending}
                            data-testid={`button-save-label-${entry.role}`}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Save
                          </Button>

                          {/* Reset to default */}
                          {entry.isCustom && !isDirty && (
                            <Button
                              variant="ghost"
                              size="default"
                              onClick={() => handleResetLabel(entry.role)}
                              disabled={resetLabel.isPending}
                              data-testid={`button-reset-label-${entry.role}`}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Reset
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </CanvasHubPage>
  );
}
