import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar,
  Clock,
  FileText,
  Download,
  Bell,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  User,
  Briefcase,
  MapPin,
  Phone,
  Mail,
  TrendingUp,
  Award,
} from "lucide-react";
import type { Employee, Shift, TimeEntry } from "@shared/schema";
import { ResponsiveSection } from "@/components/dashboard-shell";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { MetricsCardsSkeleton, TableSkeleton } from "@/components/loading-indicators/skeletons";

function EmployeePortalSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <MetricsCardsSkeleton count={4} columns={4} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Skeleton className="h-6 w-32" />
          <TableSkeleton rows={3} columns={2} showAvatar={false} />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-6 w-32" />
          <TableSkeleton rows={3} columns={2} showAvatar={false} />
        </div>
      </div>
    </div>
  );
}

export default function EmployeePortal() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  // Fetch employee data
  const { data: employees = [], isLoading: employeesLoading } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: shifts = [], isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: ["/api/shifts"],
  });

  const { data: timeEntries = [], isLoading: entriesLoading } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries"],
  });

  const isLoading = employeesLoading || shiftsLoading || entriesLoading;

  // Find current employee
  const currentEmployee = employees.find(emp => emp.email === user?.email);

  // Filter employee's shifts (this week)
  const today = new Date();
  const weekStart = new Date(today.setDate(today.getDate() - today.getDay()));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const myShifts = shifts.filter(shift => 
    shift.employeeId === currentEmployee?.id &&
    new Date(shift.startTime) >= weekStart &&
    new Date(shift.startTime) <= weekEnd
  );

  const myTimeEntries = timeEntries.filter(entry => entry.employeeId === currentEmployee?.id);

  // Calculate total hours this week
  const totalHoursThisWeek = myTimeEntries
    .filter(entry => {
      const entryDate = new Date(entry.clockIn);
      return entryDate >= weekStart && entryDate <= weekEnd && entry.clockOut;
    })
    .reduce((sum, entry) => sum + Number(entry.totalHours || 0), 0);

  const totalEarnings = myTimeEntries
    .filter(entry => entry.clockOut)
    .reduce((sum, entry) => sum + Number(entry.totalAmount || 0), 0);

  const formatShiftTime = (dateString: string | Date) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatShiftDate = (dateString: string | Date) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  if (isLoading) {
    return (
      <WorkspaceLayout maxWidth="7xl">
        <ResponsiveSection spacing="lg">
          <EmployeePortalSkeleton />
        </ResponsiveSection>
      </WorkspaceLayout>
    );
  }

  if (!currentEmployee) {
    return (
      <WorkspaceLayout maxWidth="7xl">
        <div className="p-8 text-center">
          <AlertCircle className="h-12 w-12 text-blue-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Employee Profile Not Found</h2>
          <p className="text-muted-foreground">
            You need to be registered as an employee to access the portal.
          </p>
        </div>
      </WorkspaceLayout>
    );
  }

  const initials = `${currentEmployee.firstName?.[0] || ''}${currentEmployee.lastName?.[0] || ''}`.toUpperCase();

  return (
    <WorkspaceLayout maxWidth="7xl">
      <ResponsiveSection spacing="lg">
          <div className="flex items-center gap-4 mb-4">
            <Avatar className="h-16 w-16 border-2 border-primary">
              <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h1 className="text-3xl font-bold">
                Welcome, {currentEmployee.firstName}!
              </h1>
              <p className="text-muted-foreground">
                Employee Portal · {currentEmployee.role || "Team Member"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon">
                <Bell className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-indigo-500">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <Clock className="h-5 w-5 text-indigo-500" />
                  <Badge variant="secondary">This Week</Badge>
                </div>
                <div className="text-2xl font-bold">{totalHoursThisWeek.toFixed(1)}h</div>
                <p className="text-sm text-muted-foreground">Hours Worked</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-primary">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  <Badge variant="secondary">Total</Badge>
                </div>
                <div className="text-2xl font-bold">${totalEarnings.toFixed(2)}</div>
                <p className="text-sm text-muted-foreground">Earnings</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <Calendar className="h-5 w-5 text-blue-500" />
                  <Badge variant="secondary">This Week</Badge>
                </div>
                <div className="text-2xl font-bold">{myShifts.length}</div>
                <p className="text-sm text-muted-foreground">Shifts</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-violet-500">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <Award className="h-5 w-5 text-violet-500" />
                  <Badge variant="secondary" className="bg-muted/10 text-primary">
                    Active
                  </Badge>
                </div>
                <div className="text-2xl font-bold">
                  {currentEmployee.onboardingStatus === 'completed' ? '100%' : '0%'}
                </div>
                <p className="text-sm text-muted-foreground">Profile Complete</p>
              </CardContent>
            </Card>
          </div>
      </ResponsiveSection>

      {/* Main Content */}
      <ResponsiveSection>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 lg:w-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="schedule">My Schedule</TabsTrigger>
            <TabsTrigger value="time">Time Entries</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5 text-indigo-500" />
                    Personal Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium">{currentEmployee.email}</p>
                    </div>
                  </div>
                  {currentEmployee.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Phone</p>
                        <p className="font-medium">{currentEmployee.phone}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Role</p>
                      <p className="font-medium">{currentEmployee.role || "Team Member"}</p>
                    </div>
                  </div>
                  {currentEmployee.hourlyRate && (
                    <div className="flex items-center gap-3">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Hourly Rate</p>
                        <p className="font-medium">${currentEmployee.hourlyRate}/hr</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Performance Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Total Shifts Worked</span>
                    <Badge variant="secondary">{shifts.filter(s => s.employeeId === currentEmployee.id).length}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Total Hours</span>
                    <Badge variant="secondary">{myTimeEntries.reduce((sum, e) => sum + Number(e.totalHours || 0), 0).toFixed(1)}h</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Total Earnings</span>
                    <Badge variant="secondary">${totalEarnings.toFixed(2)}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Status</span>
                    <Badge className="bg-muted/10 text-primary border-0">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Active
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="schedule" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>My Schedule - This Week</CardTitle>
                <CardDescription>Your assigned shifts for the current week</CardDescription>
              </CardHeader>
              <CardContent>
                {myShifts.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">No shifts scheduled this week</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {myShifts.map((shift) => (
                        <div
                          key={shift.id}
                          className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold">{formatShiftDate(shift.startTime)}</p>
                              <Badge variant="outline">
                                {formatShiftTime(shift.startTime)} - {formatShiftTime(shift.endTime)}
                              </Badge>
                            </div>
                            {shift.description && (
                              <p className="text-sm text-muted-foreground">{shift.description}</p>
                            )}
                          </div>
                          <Clock className="h-5 w-5 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="time" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Time Entries</CardTitle>
                <CardDescription>Your clock-in/clock-out history</CardDescription>
              </CardHeader>
              <CardContent>
                {myTimeEntries.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">No time entries yet</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {myTimeEntries.slice(0, 20).map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between p-4 rounded-lg border border-border"
                        >
                          <div className="flex-1">
                            <p className="font-semibold mb-1">
                              {new Date(entry.clockIn).toLocaleDateString()}
                            </p>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              <span>In: {new Date(entry.clockIn).toLocaleTimeString()}</span>
                              {entry.clockOut && (
                                <>
                                  <span>•</span>
                                  <span>Out: {new Date(entry.clockOut).toLocaleTimeString()}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">{Number(entry.totalHours || 0).toFixed(2)}h</div>
                            <div className="text-sm text-muted-foreground">${Number(entry.totalAmount || 0).toFixed(2)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Documents & Payslips</CardTitle>
                <CardDescription>Access your employment documents</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-blue-500" />
                      <div>
                        <p className="font-medium">Employment Contract</p>
                        <p className="text-sm text-muted-foreground">Signed on onboarding</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline">
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">Tax Documents (W-4/W-9)</p>
                        <p className="text-sm text-muted-foreground">On file</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline">
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border border-border opacity-50">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-blue-500" />
                      <div>
                        <p className="font-medium">Latest Payslip</p>
                        <p className="text-sm text-muted-foreground">Available after payroll processing</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" disabled>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </ResponsiveSection>
    </WorkspaceLayout>
  );
}
