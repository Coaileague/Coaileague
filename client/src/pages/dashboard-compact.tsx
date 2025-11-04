import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { 
  Users, MapPin, Tag, Settings, DollarSign, Briefcase, Clock, CheckCircle, Square, Bell, FileText,
  Calendar, BarChart3, GraduationCap, Receipt, UserPlus, TrendingUp, Grid3x3
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTransition } from "@/contexts/transition-context";
import { MobileLoading } from "@/components/mobile-loading";
import { MobilePageWrapper } from "@/components/mobile-page-wrapper";
import { queryClient } from "@/lib/queryClient";
import { useIsMobile } from "@/hooks/use-mobile";

export default function DashboardCompact() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { showTransition, hideTransition } = useTransition();
  const isMobile = useIsMobile();

  const { data: stats } = useQuery({
    queryKey: ['/api/analytics/stats'],
    enabled: isAuthenticated,
  });

  const { data: allEmployees } = useQuery<any[]>({
    queryKey: ['/api/employees'],
    enabled: isAuthenticated,
  });

  const { data: clients } = useQuery<any[]>({
    queryKey: ['/api/clients'],
    enabled: isAuthenticated,
  });

  const { data: timeEntries } = useQuery<any[]>({
    queryKey: ['/api/time-entries'],
    enabled: isAuthenticated,
  });

  const currentEmployee = allEmployees?.find((emp: any) => emp.userId === user?.id);
  const workspaceRole = currentEmployee?.workspaceRole || 'employee';

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

  // Stat cards - Sling style
  const statCards = [
    {
      icon: Users,
      label: "EMPLOYEES",
      value: totalEmployees,
      color: "text-blue-500",
      link: "/employees",
      testid: "stat-employees"
    },
    {
      icon: Briefcase,
      label: "POSITIONS",
      value: totalPositions,
      color: "text-emerald-500",
      link: "/employees",
      testid: "stat-positions"
    },
    {
      icon: MapPin,
      label: "LOCATIONS",
      value: totalLocations,
      color: "text-purple-500",
      link: "/clients",
      testid: "stat-locations"
    },
    {
      icon: Users,
      label: "GROUPS",
      value: totalGroups,
      color: "text-orange-500",
      link: "/clients",
      testid: "stat-groups"
    },
    {
      icon: Tag,
      label: "TAGS",
      value: totalTags,
      color: "text-pink-500",
      link: "/employees",
      testid: "stat-tags"
    },
    {
      icon: Bell,
      label: "ANNOUNCEMENTS",
      value: 0,
      color: "text-yellow-500",
      link: "/communication",
      testid: "stat-announcements"
    },
    {
      icon: DollarSign,
      label: "LABOR COST",
      value: `$${laborCost.toFixed(2)}`,
      color: "text-green-500",
      link: "/payroll",
      testid: "stat-labor-cost"
    },
    {
      icon: Settings,
      label: "SETTINGS",
      value: "",
      color: "text-gray-500",
      link: "/settings",
      testid: "stat-settings"
    }
  ];

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

  // Quick Access Menu Items
  const quickAccessFeatures = [
    { icon: Calendar, label: "Schedule", link: "/schedule", color: "text-blue-500", testid: "quick-schedule" },
    { icon: Clock, label: "Time Clock", link: "/time-tracking", color: "text-emerald-500", testid: "quick-timeclock" },
    { icon: Receipt, label: "Invoices", link: "/invoices", color: "text-purple-500", testid: "quick-invoices" },
    { icon: DollarSign, label: "Payroll", link: "/payroll-dashboard", color: "text-green-500", testid: "quick-payroll" },
    { icon: UserPlus, label: "Hiring", link: "/employees", color: "text-orange-500", testid: "quick-hiring" },
    { icon: GraduationCap, label: "Training", link: "/training-os", color: "text-indigo-500", testid: "quick-training" },
    { icon: BarChart3, label: "Analytics", link: "/analytics", color: "text-pink-500", testid: "quick-analytics" },
    { icon: Grid3x3, label: "All Features", link: "/os-family-platform", color: "text-gray-500", testid: "quick-all" }
  ];

  const dashboardContent = (
    <div className="min-h-screen bg-background">
      {/* Quick Access Menu */}
      <div className="border-b bg-muted/30 px-3 sm:px-4 py-3 sm:py-4">
        <div className="flex items-center gap-2 mb-2 sm:mb-3">
          <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
          <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-wide">Quick Access</h2>
        </div>
        <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 mobile-scroll">
          {quickAccessFeatures.map((feature) => (
            <Button
              key={feature.link}
              variant="outline"
              size="sm"
              className="flex-col h-auto min-h-[64px] sm:min-h-[72px] min-w-[72px] sm:min-w-[80px] px-2 sm:px-3 py-2 sm:py-3 gap-1 sm:gap-2 hover-elevate whitespace-nowrap"
              asChild
            >
              <Link href={feature.link} data-testid={feature.testid}>
                <feature.icon className={`h-5 w-5 sm:h-6 sm:w-6 ${feature.color} shrink-0`} />
                <span className="text-[10px] sm:text-xs font-medium leading-tight">{feature.label}</span>
              </Link>
            </Button>
          ))}
        </div>
      </div>

      {/* Sling-style Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-px bg-border">
        {statCards.map((stat, index) => (
          <Link key={index} href={stat.link} className="block touch-target">
            <Card className="rounded-none border-0 hover-elevate cursor-pointer h-full transition-all" data-testid={stat.testid}>
              <CardContent className="p-3 sm:p-4 lg:p-6 text-center flex flex-col items-center justify-center h-full min-h-[100px] sm:min-h-[120px]">
                <stat.icon className={`h-6 w-6 sm:h-8 sm:w-8 lg:h-10 lg:w-10 mb-1 sm:mb-2 ${stat.color} shrink-0`} />
                <p className="text-[10px] sm:text-xs uppercase text-muted-foreground font-semibold tracking-wide mb-0.5 sm:mb-1 break-anywhere">
                  {stat.label}
                </p>
                <p className="text-sm sm:text-lg lg:text-2xl font-bold break-anywhere">
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Blue Banner (No shifts scheduled) */}
      {workspaceRole !== 'employee' && (
        <div className="bg-blue-600 text-white px-3 sm:px-4 py-3 sm:py-4 flex items-center gap-2 sm:gap-3">
          <Square className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
          <p className="text-xs sm:text-sm font-medium break-anywhere">
            {(stats as any)?.upcomingShifts > 0 
              ? `You have ${(stats as any)?.upcomingShifts} shifts scheduled` 
              : "You don't have any shifts scheduled"}
          </p>
        </div>
      )}

      {/* Notifications & Roster Tabs */}
      <div className="mobile-container p-3 sm:p-4">
        <Tabs defaultValue="notifications" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 touch-target">
            <TabsTrigger value="notifications" className="text-xs sm:text-sm" data-testid="tab-notifications">
              NOTIFICATIONS
            </TabsTrigger>
            <TabsTrigger value="roster" className="text-xs sm:text-sm" data-testid="tab-roster">
              ROSTER
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="notifications" className="space-y-2 sm:space-y-3 mt-3 sm:mt-4">
            {notifications.map((notif, index) => (
              <Card key={index} className="hover-elevate touch-friendly" data-testid={`notification-${index}`}>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className={`p-1.5 sm:p-2 rounded-full bg-muted ${notif.color} shrink-0`}>
                      <notif.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm break-anywhere">{notif.message}</p>
                      {notif.time && (
                        <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
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
              <CardContent className="p-6 text-center">
                <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Employee roster view coming soon
                </p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setLocation("/employees")}
                  data-testid="button-view-employees"
                >
                  View All Employees
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );

  return isMobile ? (
    <MobilePageWrapper>
      {dashboardContent}
    </MobilePageWrapper>
  ) : (
    dashboardContent
  );
}
