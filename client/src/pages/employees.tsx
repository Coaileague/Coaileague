import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "lucide-react";
import { ResponsiveLoading } from "@/components/responsive-loading";
import { MobilePageWrapper } from "@/components/mobile-page-wrapper";
import { SwipeToDelete } from "@/components/swipe-to-delete";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { Employee } from "@shared/schema";

export default function Employees() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isApprovalDialogOpen, setIsApprovalDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [approvalPayRate, setApprovalPayRate] = useState("");
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "",
    hourlyRate: "",
  });

  const { data: employees, isLoading } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
    enabled: isAuthenticated,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/employees", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({
        title: "Success",
        description: "Employee added successfully",
      });
      setIsAddDialogOpen(false);
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        role: "",
        hourlyRate: "",
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
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to create employee",
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

  if (authLoading || !isAuthenticated) {
    return <ResponsiveLoading message="Loading Employees..." />;
  }

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  };

  const handleSubmit = () => {
    createMutation.mutate({
      ...formData,
      hourlyRate: formData.hourlyRate ? parseFloat(formData.hourlyRate) : undefined,
    });
  };

  const inviteMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      return await apiRequest("/api/onboarding/invite", "POST", { employeeId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({
        title: "Invitation Sent",
        description: "Onboarding invitation email has been sent successfully",
      });
      setIsInviteDialogOpen(false);
      setSelectedEmployee(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send invitation",
        variant: "destructive",
      });
    },
  });

  const handleSendInvite = () => {
    if (selectedEmployee?.id) {
      inviteMutation.mutate(selectedEmployee.id);
    }
  };

  const approveMutation = useMutation({
    mutationFn: async (data: { employeeId: string; hourlyRate: number }) => {
      return await apiRequest("POST", "/api/employees/approve", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
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
        title: "Error",
        description: error.message || "Failed to approve employee",
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
        <Badge variant="default" className="text-xs bg-orange-600 hover:bg-orange-700">
          <AlertCircle className="h-3 w-3 mr-1" />
          Pending Approval
        </Badge>
      );
    }
    if (status === 'completed') {
      return (
        <Badge variant="default" className="text-xs bg-blue-600 hover:bg-blue-700">
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

  const filteredEmployees = employees?.filter(emp =>
    `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const pendingApprovals = employees?.filter(emp => emp.onboardingStatus === 'pending_review') || [];

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
  };

  const handleDeleteEmployee = (employeeId: number | string) => {
    toast({
      title: "Delete Employee",
      description: "Employee deletion requires confirmation. Feature coming soon.",
    });
  };

  const pageContent = (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full h-full overflow-auto">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <div className="space-y-4 sm:space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-1" data-testid="text-employees-title">
                Employees
              </h2>
              <p className="text-sm sm:text-base text-[hsl(var(--cad-text-secondary))]" data-testid="text-employees-subtitle">
                Manage your team members and their schedules
              </p>
            </div>
          
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-employee">
                <Plus className="mr-2 h-4 w-4" />
                Add Employee
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6">
              <DialogHeader className="space-y-2 pb-3">
                <DialogTitle className="text-lg sm:text-xl">Add Employee</DialogTitle>
                <DialogDescription className="text-xs sm:text-sm">
                  Enter employee details
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                {/* Basic Info Section */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Basic Info</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="firstName" className="text-xs">First Name *</Label>
                      <Input 
                        id="firstName" 
                        placeholder="John" 
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        data-testid="input-employee-firstname"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="lastName" className="text-xs">Last Name *</Label>
                      <Input 
                        id="lastName" 
                        placeholder="Doe" 
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        data-testid="input-employee-lastname"
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Contact Section */}
                <div className="space-y-2 pt-2 border-t">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs">Email *</Label>
                    <Input 
                      id="email" 
                      type="email" 
                      placeholder="john@example.com" 
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      data-testid="input-employee-email"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-xs">Phone</Label>
                    <Input 
                      id="phone" 
                      placeholder="+1 (555) 123-4567" 
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      data-testid="input-employee-phone"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                {/* Employment Section - Leader/Admin Only */}
                <div className="space-y-2 pt-2 border-t">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employment Details</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="role" className="text-xs">Position</Label>
                      <Input 
                        id="role" 
                        placeholder="Security Guard" 
                        value={formData.role}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        data-testid="input-employee-role"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="hourlyRate" className="text-xs">Hourly Rate ($)</Label>
                      <Input 
                        id="hourlyRate" 
                        type="number" 
                        placeholder="25.00" 
                        value={formData.hourlyRate}
                        onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                        data-testid="input-employee-rate"
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2 pt-3">
                <Button 
                  variant="outline" 
                  onClick={() => setIsAddDialogOpen(false)}
                  className="w-full sm:w-auto h-9 text-sm"
                  data-testid="button-cancel-employee"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmit}
                  disabled={createMutation.isPending}
                  data-testid="button-save-employee"
                  className="w-full sm:w-auto h-9 text-sm"
                >
                  {createMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search employees..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-employees"
          />
        </div>

        {/* Pending Approvals Alert */}
        {pendingApprovals.length > 0 && (
          <Card className="border-orange-500/50 bg-orange-500/10" data-testid="alert-pending-approvals">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-orange-900 dark:text-orange-100">
                    {pendingApprovals.length} Employee{pendingApprovals.length > 1 ? 's' : ''} Pending Approval
                  </h4>
                  <p className="text-sm text-orange-800 dark:text-orange-200 mt-1">
                    These employees completed onboarding but need pay rates set before they can be activated for work. Click "Approve & Set Pay Rate" to review and activate them.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {pendingApprovals.map(emp => (
                      <Badge key={emp.id} variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100">
                        {emp.firstName} {emp.lastName}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-start gap-4 space-y-0 pb-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-24" />
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-20" />
                      <Skeleton className="h-5 w-24" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredEmployees.length === 0 && !searchQuery ? (
          <Card data-testid="card-no-employees">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Users className="h-16 w-16 text-muted-foreground opacity-20 mb-4" />
              <h3 className="text-lg font-medium mb-2">No employees yet</h3>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
                Add your first team member to start scheduling shifts and tracking hours
              </p>
              <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-first-employee">
                <Plus className="mr-2 h-4 w-4" />
                Add First Employee
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredEmployees.map((employee) => {
              const employeeCard = (
              <Card key={employee.id} className="hover-elevate" data-testid={`card-employee-${employee.id}`}>
                <CardHeader className="flex flex-row items-start gap-4 space-y-0 pb-4">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback style={{ backgroundColor: employee.color || '#3b82f6' }}>
                      {getInitials(employee.firstName, employee.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">
                      {employee.firstName} {employee.lastName}
                    </CardTitle>
                    {employee.employeeNumber && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ID: {employee.employeeNumber}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        {employee.role || "Employee"}
                      </Badge>
                      {getOnboardingStatusBadge(employee.onboardingStatus ?? undefined)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground truncate">{employee.email || "No email"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{employee.phone || "No phone"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      ${employee.hourlyRate || "0"}/hr
                    </span>
                  </div>
                  {employee.onboardingStatus === 'pending_review' && (
                    <Button
                      className="w-full mt-2 bg-orange-600 hover:bg-orange-700"
                      size="sm"
                      onClick={() => {
                        setSelectedEmployee(employee);
                        setApprovalPayRate(employee.hourlyRate || "");
                        setIsApprovalDialogOpen(true);
                      }}
                      data-testid={`button-approve-${employee.id}`}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-2" />
                      Approve & Set Pay Rate
                    </Button>
                  )}
                  {employee.onboardingStatus !== 'completed' && employee.onboardingStatus !== 'pending_review' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => {
                        setSelectedEmployee(employee);
                        setIsInviteDialogOpen(true);
                      }}
                      data-testid={`button-invite-${employee.id}`}
                    >
                      <Send className="h-3 w-3 mr-2" />
                      Send Onboarding Invite
                    </Button>
                  )}
                </CardContent>
              </Card>
              );

              // Wrap in swipe-to-delete on mobile
              if (isMobile) {
                return (
                  <SwipeToDelete 
                    key={employee.id}
                    onDelete={() => handleDeleteEmployee(employee.id)}
                  >
                    {employeeCard}
                  </SwipeToDelete>
                );
              }

              return employeeCard;
            })}
          </div>
        )}

        {/* Invite Dialog */}
        <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Onboarding Invitation</DialogTitle>
              <DialogDescription>
                This will send an email invitation to {selectedEmployee?.firstName} {selectedEmployee?.lastName} to begin their onboarding process.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee:</span>
                  <span className="font-medium">
                    {selectedEmployee?.firstName} {selectedEmployee?.lastName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium">{selectedEmployee?.email}</span>
                </div>
                {selectedEmployee?.employeeNumber && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Employee ID:</span>
                    <span className="font-medium">{selectedEmployee.employeeNumber}</span>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsInviteDialogOpen(false);
                  setSelectedEmployee(null);
                }}
                data-testid="button-cancel-invite"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendInvite}
                disabled={inviteMutation.isPending}
                data-testid="button-confirm-invite"
              >
                {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Approval Dialog */}
        <Dialog open={isApprovalDialogOpen} onOpenChange={setIsApprovalDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Approve Employee & Set Pay Rate</DialogTitle>
              <DialogDescription>
                {selectedEmployee?.firstName} {selectedEmployee?.lastName} has completed onboarding. Set their hourly pay rate to activate them for work.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee:</span>
                  <span className="font-medium">
                    {selectedEmployee?.firstName} {selectedEmployee?.lastName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium">{selectedEmployee?.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Role:</span>
                  <span className="font-medium">{selectedEmployee?.role || "Employee"}</span>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <Label htmlFor="payRate">Hourly Pay Rate * (Required)</Label>
                <div className="flex items-center gap-2 mt-2">
                  <DollarSign className="h-5 w-5 text-muted-foreground" />
                  <Input
                    id="payRate"
                    type="number"
                    step="0.01"
                    placeholder="25.00"
                    value={approvalPayRate}
                    onChange={(e) => setApprovalPayRate(e.target.value)}
                    data-testid="input-approval-pay-rate"
                  />
                  <span className="text-sm text-muted-foreground">/hour</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  This rate will be used for payroll calculations and time tracking
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsApprovalDialogOpen(false);
                  setSelectedEmployee(null);
                  setApprovalPayRate("");
                }}
                data-testid="button-cancel-approval"
              >
                Cancel
              </Button>
              <Button
                onClick={handleApproveEmployee}
                disabled={approveMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="button-confirm-approval"
              >
                {approveMutation.isPending ? "Approving..." : "Approve & Activate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <MobilePageWrapper 
        onRefresh={handleRefresh}
        enablePullToRefresh={true}
        withBottomNav={true}
      >
        {pageContent}
      </MobilePageWrapper>
    );
  }

  return pageContent;
}
