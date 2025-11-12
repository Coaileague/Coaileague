import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Users, UserCog, Shield, Search, ChevronRight, Crown,
  Briefcase, ClipboardList, User as UserIcon
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [newRole, setNewRole] = useState("");

  // Fetch all employees in workspace
  const { data: employees, isLoading } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  // Update employee role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async (data: { employeeId: string; role: string }) => {
      return await apiRequest('PATCH', `/api/employees/${data.employeeId}`, { role: data.role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
      toast({
        title: "Role Updated",
        description: "Employee role has been successfully changed.",
      });
      setSelectedEmployee(null);
      setNewRole("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update employee role",
        variant: "destructive",
      });
    },
  });

  const filteredEmployees = employees?.filter(emp =>
    `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Crown className="h-4 w-4 text-blue-600" />;
      case 'manager':
        return <Briefcase className="h-4 w-4 text-blue-500" />;
      case 'hr_manager':
        return <ClipboardList className="h-4 w-4 text-blue-400" />;
      case 'supervisor':
        return <Shield className="h-4 w-4 text-blue-500" />;
      case 'employee':
        return <UserIcon className="h-4 w-4 text-slate-500" />;
      default:
        return <UserIcon className="h-4 w-4 text-slate-500" />;
    }
  };

  const getRoleBadgeVariant = (role: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (role) {
      case 'owner':
        return "default";
      case 'manager':
      case 'hr_manager':
        return "secondary";
      default:
        return "outline";
    }
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'owner':
        return 'Owner';
      case 'manager':
        return 'Manager';
      case 'hr_manager':
        return 'HR Manager';
      case 'supervisor':
        return 'Supervisor';
      case 'employee':
        return 'Employee';
      default:
        return role;
    }
  };

  const handleRoleUpdate = () => {
    if (!selectedEmployee || !newRole) {
      toast({
        title: "Error",
        description: "Please select a role",
        variant: "destructive",
      });
      return;
    }

    if (newRole === selectedEmployee.role) {
      toast({
        title: "No Change",
        description: "Selected role is the same as current role",
        variant: "destructive",
      });
      return;
    }

    updateRoleMutation.mutate({
      employeeId: selectedEmployee.id,
      role: newRole,
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <UserCog className="h-8 w-8 text-primary" />
          Role Management
        </h1>
        <p className="text-muted-foreground mt-2">
          Promote employees to Manager, HR Manager, or Supervisor roles
        </p>
      </div>

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
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-employee-search"
              />
            </div>

            {/* Employee List */}
            <ScrollArea className="h-[500px]">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading employees...
                </div>
              ) : filteredEmployees && filteredEmployees.length > 0 ? (
                <div className="space-y-2">
                  {filteredEmployees.map((employee) => (
                    <div
                      key={employee.id}
                      className={`flex items-center justify-between p-4 rounded-lg border hover-elevate cursor-pointer transition-colors ${
                        selectedEmployee?.id === employee.id
                          ? 'border-primary bg-primary/5'
                          : ''
                      }`}
                      onClick={() => {
                        setSelectedEmployee(employee);
                        setNewRole(employee.role);
                      }}
                      data-testid={`employee-item-${employee.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {getRoleIcon(employee.role)}
                          <p className="font-medium text-sm">
                            {employee.firstName} {employee.lastName}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {employee.email}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant={getRoleBadgeVariant(employee.role)} className="text-xs">
                            {getRoleDisplayName(employee.role)}
                          </Badge>
                          {employee.department && (
                            <Badge variant="outline" className="text-xs">
                              {employee.department}
                            </Badge>
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
                {/* Selected Employee Info */}
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium mb-1">
                    {selectedEmployee.firstName} {selectedEmployee.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">
                    {selectedEmployee.email}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Current Role:</span>
                    <Badge variant={getRoleBadgeVariant(selectedEmployee.role)}>
                      {getRoleDisplayName(selectedEmployee.role)}
                    </Badge>
                  </div>
                </div>

                {/* Role Selection */}
                <div className="space-y-2">
                  <Label htmlFor="role-select">New Role</Label>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger id="role-select" data-testid="select-new-role">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Employee</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="hr_manager">HR Manager</SelectItem>
                      <SelectItem value="owner" disabled>
                        Owner (Cannot Assign)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {newRole === 'manager' && "Managers can approve timesheets, shifts, and manage employees"}
                    {newRole === 'hr_manager' && "HR Managers have access to sensitive documents and compliance data"}
                    {newRole === 'supervisor' && "Supervisors can oversee employees and approve time-off"}
                    {newRole === 'employee' && "Standard employee access level"}
                  </p>
                </div>

                {/* Action Buttons */}
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
                    onClick={() => {
                      setSelectedEmployee(null);
                      setNewRole("");
                    }}
                    className="w-full"
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                </div>

                {/* Role Hierarchy Info */}
                <div className="p-4 bg-muted/30 rounded-lg border border-dashed">
                  <p className="text-xs font-medium mb-2">Role Hierarchy:</p>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Crown className="h-3 w-3 text-yellow-500" />
                      Owner (Organization Level)
                    </div>
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-3 w-3 text-blue-500" />
                      Manager
                    </div>
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-3 w-3 text-purple-500" />
                      HR Manager
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="h-3 w-3 text-green-500" />
                      Supervisor
                    </div>
                    <div className="flex items-center gap-2">
                      <UserIcon className="h-3 w-3 text-gray-500" />
                      Employee
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
    </div>
  );
}
