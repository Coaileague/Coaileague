import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { 
  Users, MapPin, Tag, Settings, DollarSign, Briefcase, Clock, CheckCircle, Square, Bell, FileText,
  Calendar, BarChart3, GraduationCap, Receipt, UserPlus, TrendingUp, Grid3x3, AlertTriangle
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTransition } from "@/contexts/transition-context";
import { MobileLoading } from "@/components/mobile-loading";
import { MobilePageWrapper } from "@/components/mobile-page-wrapper";
import { queryClient } from "@/lib/queryClient";
import { useIsMobile } from "@/hooks/use-mobile";
import { HexGridLoader } from "@/components/loading-indicators";

export default function DashboardCompact() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { showTransition, hideTransition } = useTransition();
  const isMobile = useIsMobile();
  const [showBackgroundSync, setShowBackgroundSync] = useState(false);

  const { data: stats, isRefetching: statsRefetching } = useQuery({
    queryKey: ['/api/analytics/stats'],
    enabled: isAuthenticated,
  });

  const { data: allEmployees, isRefetching: employeesRefetching } = useQuery<any[]>({
    queryKey: ['/api/employees'],
    enabled: isAuthenticated,
  });

  const { data: clients, isRefetching: clientsRefetching } = useQuery<any[]>({
    queryKey: ['/api/clients'],
    enabled: isAuthenticated,
  });

  const { data: timeEntries, isRefetching: timeEntriesRefetching} = useQuery<any[]>({
    queryKey: ['/api/time-entries'],
    enabled: isAuthenticated,
  });

  const currentEmployee = allEmployees?.find((emp: any) => emp.userId === user?.id);
  const workspaceRole = currentEmployee?.workspaceRole || 'employee';
  const isManager = ['owner', 'manager'].includes(workspaceRole);

  // Manager-only queries for approval widgets
  const { data: pendingExpenses = [] } = useQuery<any[]>({
    queryKey: ['/api/expenses'],
    enabled: isAuthenticated && isManager,
  });

  const { data: expiringI9s = [] } = useQuery<any[]>({
    queryKey: ['/api/i9-records/expiring'],
    enabled: isAuthenticated && isManager,
  });

  const { data: policies = [] } = useQuery<any[]>({
    queryKey: ['/api/policies'],
    enabled: isAuthenticated && isManager,
  });

  // Show hex grid loader when any data is refetching
  useEffect(() => {
    const isRefetching = statsRefetching || employeesRefetching || clientsRefetching || timeEntriesRefetching;
    
    if (isRefetching) {
      setShowBackgroundSync(true);
    } else {
      // Only hide after refetching completes (with small delay for smooth transition)
      const timer = setTimeout(() => setShowBackgroundSync(false), 500);
      return () => clearTimeout(timer);
    }
  }, [statsRefetching, employeesRefetching, clientsRefetching, timeEntriesRefetching]);

  useEffect(() => {
    showTransition({
      status: "loading",
      message: "Loading Dashboard...",
      submessage: "Preparing your workspace",
      duration: 1500,
      onComplete: hideTransition
    });
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = '/api/login';
    }
  }, [isAuthenticated, isLoading]);

  if (isLoading || !isAuthenticated) {
    return <MobileLoading fullScreen message="Loading Dashboard..." />;
  }

  const firstName = user?.firstName || user?.email?.split('@')[0] || 'User';
  const totalEmployees = allEmployees?.length || 0;
  const totalClients = clients?.length || 0;
  
  // Count unique positions/roles
  const positions = new Set(allEmployees?.map(emp => emp.role || 'Employee').filter(Boolean));
  const totalPositions = positions.size;
  
  // Count unique locations (from clients)
  const locations = new Set(clients?.map(client => client.location || client.city).filter(Boolean));
  const totalLocations = locations.size || totalClients; // Fallback to client count
  
  // Groups - could be departments or teams (for now, using clients as groups)
  const totalGroups = totalClients || 0;
  
  // Tags - for now, count active vs inactive employees
  const totalTags = 5; // Placeholder: Active, Inactive, Full-time, Part-time, Contractor
  
  // Calculate labor cost from recent time entries
  const recentTimeEntries = timeEntries?.filter((entry: any) => entry.billingStatus !== 'paid') || [];
  const laborCost = recentTimeEntries.reduce((sum: number, entry: any) => {
    const hours = entry.clockOut && entry.clockIn 
      ? (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60)
      : 0;
    const rate = parseFloat(entry.hourlyRate || '0');
    return sum + (hours * rate);
  }, 0);

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  // Count active time entries (clocked in)
  const activeTimeEntries = timeEntries?.filter((entry: any) => entry.status === 'active') || [];
  const clockedInCount = activeTimeEntries.length;

  // Sample notifications
  const notifications = [
    {
      type: "timesheet",
      message: `Hello ${firstName}, the following items need your attention`,
      time: null,
      icon: Clock,
      color: "text-blue-500"
    },
    ...(recentTimeEntries.slice(0, 3).map((entry: any) => {
      const employee = allEmployees?.find(emp => emp.id === entry.employeeId);
      const client = clients?.find(c => c.id === entry.clientId);
      return {
        type: "activity",
        message: `${employee?.firstName || 'Employee'} clocked ${entry.clockOut ? 'out' : 'in'} at ${client?.name || 'Location'}`,
        time: new Date(entry.clockIn),
        icon: entry.clockOut ? CheckCircle : Clock,
        color: entry.clockOut ? "text-green-500" : "text-blue-500"
      };
    }))
  ];

  // Role-based stat cards
  const getStatCardsForRole = () => {
    const isManager = ['owner', 'manager'].includes(workspaceRole);
    
    if (isManager) {
      return [
        { icon: Users, label: "EMPLOYEES", value: totalEmployees, color: "text-blue-500", link: "/employees", testid: "stat-employees" },
        { icon: Briefcase, label: "CLIENTS", value: totalClients, color: "text-emerald-500", link: "/clients", testid: "stat-clients" },
        { icon: DollarSign, label: "LABOR COST", value: `$${laborCost.toFixed(2)}`, color: "text-green-500", link: "/payroll", testid: "stat-labor-cost" },
        { icon: Calendar, label: "CLOCKED IN", value: clockedInCount, color: "text-orange-500", link: "/time-tracking", testid: "stat-clocked-in" }
      ];
    } else {
      return [
        { icon: Calendar, label: "MY SHIFTS", value: (stats as any)?.upcomingShifts || 0, color: "text-blue-500", link: "/schedule", testid: "stat-my-shifts" },
        { icon: Clock, label: "HOURS THIS WEEK", value: "0", color: "text-emerald-500", link: "/time-tracking", testid: "stat-hours" },
        { icon: GraduationCap, label: "TRAINING", value: "0", color: "text-indigo-500", link: "/training", testid: "stat-training" },
        { icon: Receipt, label: "EXPENSES", value: "0", color: "text-purple-500", link: "/expenses", testid: "stat-expenses" }
      ];
    }
  };

  const roleStatCards = getStatCardsForRole();

  const dashboardContent = (
    <div className="min-h-screen bg-background">
      {/* Mobile: Greeting Section - Sling style */}
      <div className="md:hidden bg-gradient-to-br from-primary/90 to-primary text-white px-5 py-6">
        <h1 className="text-xl font-semibold mb-1" data-testid="greeting-message">
          {getGreeting()} {firstName}
        </h1>
        <p className="text-sm opacity-90">
          You have no unread notifications
        </p>
      </div>

      {/* Mobile: Quick Status Card */}
      {isMobile && (
        <div className="bg-primary/10 border-l-4 border-primary mx-4 my-4 p-4 rounded-r-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-full">
              <Calendar className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">
                {clockedInCount > 0 
                  ? `${clockedInCount} ${clockedInCount === 1 ? 'person' : 'people'} currently clocked in`
                  : (stats as any)?.upcomingShifts > 0 
                    ? `You have ${(stats as any)?.upcomingShifts} shifts scheduled` 
                    : "You don't have any shifts scheduled"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Role-Based Stats Grid - Cleaner, focused */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4 sm:px-6 py-6">
        {roleStatCards.map((stat, index) => (
          <Link key={index} href={stat.link} className="block" data-testid={`link-${stat.testid}`}>
            <Card className="hover-elevate cursor-pointer h-full transition-all">
              <CardContent className="p-6 text-center flex flex-col items-center justify-center">
                <stat.icon className={`h-10 w-10 mb-3 ${stat.color}`} />
                <p className="text-xs uppercase text-muted-foreground font-semibold tracking-wide mb-2">
                  {stat.label}
                </p>
                <p className="text-2xl font-bold">
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Mobile: Today's Roster Quick Link */}
      {isMobile && (
        <div className="px-4 mb-4">
          <Button
            variant="ghost"
            className="w-full justify-between text-primary hover:bg-primary/10 h-12"
            asChild
          >
            <Link href="/schedule" data-testid="button-todays-roster">
              <span className="font-medium">Today's roster</span>
              <span className="text-xl">&gt;</span>
            </Link>
          </Button>
        </div>
      )}

      {/* Manager Approval Widgets */}
      {isManager && (pendingExpenses.filter((e: any) => e.status === 'pending').length > 0 || expiringI9s.length > 0) && (
        <div className="px-4 sm:px-6 py-4">
          <h2 className="text-lg font-semibold mb-4">Pending Approvals</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingExpenses.filter((e: any) => e.status === 'pending').length > 0 && (
              <Link href="/expense-approvals">
                <Card className="hover-elevate cursor-pointer">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Receipt className="h-4 w-4 text-purple-500" />
                        Expense Approvals
                      </span>
                      <Badge variant="destructive">{pendingExpenses.filter((e: any) => e.status === 'pending').length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">Review and approve employee expenses</p>
                  </CardContent>
                </Card>
              </Link>
            )}
            {expiringI9s.length > 0 && (
              <Link href="/i9-compliance">
                <Card className="hover-elevate cursor-pointer">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                        I-9 Expiring
                      </span>
                      <Badge variant="destructive">{expiringI9s.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">Work authorizations expiring soon</p>
                  </CardContent>
                </Card>
              </Link>
            )}
            {policies.filter((p: any) => p.status === 'draft').length > 0 && (
              <Link href="/policies">
                <Card className="hover-elevate cursor-pointer">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-500" />
                        Draft Policies
                      </span>
                      <Badge>{policies.filter((p: any) => p.status === 'draft').length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">Policies ready to publish</p>
                  </CardContent>
                </Card>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Activity Feed / Notifications - Cleaner mobile formatting */}
      <div className="mobile-container px-4 sm:px-4 py-2 sm:py-4">
        {/* Mobile: Simple title instead of tabs */}
        {isMobile ? (
          <>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">Activity Feed</h2>
            <div className="space-y-2">
              {notifications.map((notif, index) => (
                <div 
                  key={index} 
                  className="bg-card border rounded-lg p-4 hover-elevate touch-friendly"
                  data-testid={`notification-${index}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-full bg-muted/50 ${notif.color} shrink-0`}>
                      <notif.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-relaxed">{notif.message}</p>
                      {notif.time && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {notif.time.toLocaleDateString()} • {notif.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          /* Desktop: Keep tabs */
          <Tabs defaultValue="notifications" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2 touch-target h-12 sm:h-10">
              <TabsTrigger value="notifications" className="text-sm sm:text-sm" data-testid="tab-notifications">
                NOTIFICATIONS
              </TabsTrigger>
              <TabsTrigger value="roster" className="text-sm sm:text-sm" data-testid="tab-roster">
                ROSTER
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="notifications" className="space-y-3 sm:space-y-3 mt-4 sm:mt-4">
              {notifications.map((notif, index) => (
                <Card key={index} className="hover-elevate touch-friendly" data-testid={`notification-${index}`}>
                  <CardContent className="p-4 sm:p-4">
                    <div className="flex items-start gap-3 sm:gap-3">
                      <div className={`p-2 sm:p-2 rounded-full bg-muted ${notif.color} shrink-0`}>
                        <notif.icon className="h-5 w-5 sm:h-5 sm:w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm sm:text-sm break-anywhere leading-relaxed">{notif.message}</p>
                        {notif.time && (
                          <p className="text-xs sm:text-xs text-muted-foreground mt-1 sm:mt-1">
                            {notif.time.toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="roster" className="space-y-3 mt-4">
              <Card>
                <CardContent className="p-8 sm:p-6 text-center">
                  <Users className="h-14 w-14 sm:h-12 sm:w-12 mx-auto mb-4 sm:mb-3 text-muted-foreground" />
                  <p className="text-sm sm:text-sm text-muted-foreground mb-4 sm:mb-4">
                    Employee roster view coming soon
                  </p>
                  <Button 
                    variant="outline" 
                    className="w-full sm:w-auto min-h-[48px] sm:min-h-[44px]"
                    onClick={() => setLocation("/employees")}
                    data-testid="button-view-employees"
                  >
                    View All Employees
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Background Sync Indicator - Hex Grid */}
      {showBackgroundSync && (
        <div className="fixed bottom-4 right-4 z-50 pointer-events-none" data-testid="background-sync-indicator">
          <div className="bg-background/95 backdrop-blur-sm border rounded-lg p-4 shadow-lg pointer-events-auto">
            <HexGridLoader active={showBackgroundSync} />
            <p className="text-xs text-muted-foreground mt-2 text-center">Syncing data...</p>
          </div>
        </div>
      )}
      
      {isMobile ? (
        <MobilePageWrapper>
          {dashboardContent}
        </MobilePageWrapper>
      ) : (
        dashboardContent
      )}
    </>
  );
}
