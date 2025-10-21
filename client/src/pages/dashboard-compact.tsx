import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { 
  Users, Activity, DollarSign, 
  FileText, Calendar, Clock, TrendingUp, Briefcase, AlertTriangle, Brain 
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  const currentEmployee = allEmployees?.find((emp: any) => emp.userId === user?.id);
  const workspaceRole = currentEmployee?.workspaceRole || 'employee';

  // PredictionOS™ - Fetch turnover predictions for Owner/Manager
  const { data: turnoverData } = useQuery({
    queryKey: ['/api/predict/turnover/workspace'],
    enabled: isAuthenticated && (workspaceRole === 'owner' || workspaceRole === 'manager'),
  });

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
  const totalEmployees = (stats as any)?.totalEmployees || 0;
  const activeToday = (stats as any)?.activeToday || 0;
  const totalRevenue = (stats as any)?.totalRevenue || 0;
  const totalShifts = (stats as any)?.upcomingShifts || 0;
  
  // PredictionOS™ metrics
  const totalTurnoverCost = (turnoverData as any)?.totalTurnoverCost || 0;
  const highRiskCount = (turnoverData as any)?.highRiskCount || 0;

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/stats'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/predict/turnover/workspace'] }),
    ]);
  };

  const dashboardContent = (
    <div className="p-3 sm:p-4 md:p-6 max-w-[1920px] mx-auto space-y-3">
      {/* MOBILE-FIRST HEADER */}
      <div className="bg-gradient-to-r from-indigo-900 to-blue-900 text-white p-4 sm:p-6 rounded-xl shadow-lg">
        <div className="mb-4">
          <h1 className="text-xl sm:text-2xl font-bold">Welcome back, {firstName}</h1>
          <p className="text-sm opacity-90 mt-1">
            {workspaceRole === 'owner' ? 'Manage your entire workforce' : 
             workspaceRole === 'manager' ? 'Oversee your team' :
             'Track your time and tasks'}
          </p>
        </div>
        
        {/* QUICK ACTIONS - MOBILE FIRST (Grid Layout for Thumb Access) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {(workspaceRole === 'owner' || workspaceRole === 'manager') && (
            <>
              <Link href="/schedule" className="block">
                <Button 
                  className="w-full touch-target bg-white/20 hover:bg-white/30 border border-white/30 text-white justify-start sm:justify-center h-auto py-3 px-3" 
                  data-testid="button-schedules"
                >
                  <div className="flex flex-col items-start sm:flex-row sm:items-center gap-1 sm:gap-2 w-full">
                    <Calendar className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm font-medium">Schedule</span>
                  </div>
                </Button>
              </Link>
              
              <Link href="/time-tracking" className="block">
                <Button 
                  className="w-full touch-target bg-white/20 hover:bg-white/30 border border-white/30 text-white justify-start sm:justify-center h-auto py-3 px-3" 
                  data-testid="button-time-tracking"
                >
                  <div className="flex flex-col items-start sm:flex-row sm:items-center gap-1 sm:gap-2 w-full">
                    <Clock className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm font-medium">Time Clock</span>
                  </div>
                </Button>
              </Link>
              
              <Link href="/reports" className="block">
                <Button 
                  className="w-full touch-target bg-white/20 hover:bg-white/30 border border-white/30 text-white justify-start sm:justify-center h-auto py-3 px-3" 
                  data-testid="button-reports"
                >
                  <div className="flex flex-col items-start sm:flex-row sm:items-center gap-1 sm:gap-2 w-full">
                    <FileText className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm font-medium">Reports</span>
                  </div>
                </Button>
              </Link>
              
              <Link href="/employees" className="block">
                <Button 
                  className="w-full touch-target bg-white/20 hover:bg-white/30 border border-white/30 text-white justify-start sm:justify-center h-auto py-3 px-3" 
                  data-testid="button-manage-employees"
                >
                  <div className="flex flex-col items-start sm:flex-row sm:items-center gap-1 sm:gap-2 w-full">
                    <Users className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm font-medium">Employees</span>
                  </div>
                </Button>
              </Link>
            </>
          )}
          {workspaceRole === 'employee' && (
            <>
              <Link href="/time-tracking" className="block col-span-2">
                <Button 
                  className="w-full touch-target bg-emerald-500/30 hover:bg-emerald-500/40 border-2 border-emerald-400/50 text-white justify-center h-auto py-4 px-4" 
                  data-testid="button-clock-in"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="h-6 w-6" />
                    <span className="text-base font-bold">Clock In/Out</span>
                  </div>
                </Button>
              </Link>
              
              <Link href="/schedule" className="block">
                <Button 
                  className="w-full touch-target bg-white/20 hover:bg-white/30 border border-white/30 text-white justify-start h-auto py-3 px-3" 
                  data-testid="button-my-schedule"
                >
                  <div className="flex flex-col items-start gap-1 w-full">
                    <Calendar className="h-5 w-5" />
                    <span className="text-sm font-medium">My Schedule</span>
                  </div>
                </Button>
              </Link>
              
              <Link href="/my-paychecks" className="block">
                <Button 
                  className="w-full touch-target bg-white/20 hover:bg-white/30 border border-white/30 text-white justify-start h-auto py-3 px-3" 
                  data-testid="button-paychecks"
                >
                  <div className="flex flex-col items-start gap-1 w-full">
                    <DollarSign className="h-5 w-5" />
                    <span className="text-sm font-medium">Paychecks</span>
                  </div>
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* SIMPLIFIED STATS - Role-relevant metrics only */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="hover-elevate">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground truncate">Employees</div>
                <div className="text-2xl font-bold" data-testid="stat-employees">{totalEmployees}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Activity className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground truncate">Active Today</div>
                <div className="text-2xl font-bold" data-testid="stat-active">{activeToday}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground truncate">Revenue</div>
                <div className="text-2xl font-bold" data-testid="stat-revenue">${totalRevenue.toFixed(0)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
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
        {dashboardContent}
      </MobilePageWrapper>
    );
  }

  return dashboardContent;
}
