import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { 
  Users, Activity, DollarSign, 
  FileText, Calendar, Clock, TrendingUp, Briefcase 
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTransition } from "@/contexts/transition-context";

export default function DashboardCompact() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { showTransition, hideTransition } = useTransition();

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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const firstName = user?.firstName || user?.email?.split('@')[0] || 'User';
  const totalEmployees = (stats as any)?.totalEmployees || 0;
  const activeToday = (stats as any)?.activeToday || 0;
  const totalRevenue = (stats as any)?.totalRevenue || 0;
  const totalShifts = (stats as any)?.upcomingShifts || 0;

  return (
    <div className="p-3 max-w-[1920px] mx-auto">
      {/* COMPACT HEADER - Actions Front */}
      <div className="flex items-center justify-between mb-3 bg-gradient-to-r from-indigo-900 to-blue-900 text-white p-3 rounded-lg">
        <div>
          <h1 className="text-lg font-bold">Welcome back, {firstName}</h1>
          <p className="text-xs opacity-75">
            {workspaceRole === 'owner' ? 'Manage your entire workforce' : 
             workspaceRole === 'manager' ? 'Oversee your team' :
             'Track your time and tasks'}
          </p>
        </div>
        
        {/* QUICK ACTIONS - Always Visible */}
        <div className="flex items-center gap-2">
          {(workspaceRole === 'owner' || workspaceRole === 'manager') && (
            <>
              <Link href="/employees">
                <Button size="sm" variant="outline" className="bg-white/10 border-white/20 hover:bg-white/20 text-white h-7 text-xs" data-testid="button-manage-employees">
                  <Users className="h-3 w-3 mr-1" />
                  Employees
                </Button>
              </Link>
              <Link href="/schedules">
                <Button size="sm" variant="outline" className="bg-white/10 border-white/20 hover:bg-white/20 text-white h-7 text-xs" data-testid="button-schedules">
                  <Calendar className="h-3 w-3 mr-1" />
                  Schedules
                </Button>
              </Link>
              <Link href="/time-tracking">
                <Button size="sm" variant="outline" className="bg-white/10 border-white/20 hover:bg-white/20 text-white h-7 text-xs" data-testid="button-time-tracking">
                  <Clock className="h-3 w-3 mr-1" />
                  Time
                </Button>
              </Link>
              <Link href="/invoices">
                <Button size="sm" variant="outline" className="bg-white/10 border-white/20 hover:bg-white/20 text-white h-7 text-xs" data-testid="button-invoices">
                  <FileText className="h-3 w-3 mr-1" />
                  Invoices
                </Button>
              </Link>
            </>
          )}
          {workspaceRole === 'employee' && (
            <Link href="/time-tracking">
              <Button size="sm" variant="outline" className="bg-white/10 border-white/20 hover:bg-white/20 text-white h-7 text-xs" data-testid="button-clock-in">
                <Clock className="h-3 w-3 mr-1" />
                Clock In/Out
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* COMPACT STATS - Single row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        {[
          { icon: Users, label: "Total Employees", value: totalEmployees, color: "text-indigo-600", testid: "stat-employees" },
          { icon: Activity, label: "Active Today", value: activeToday, color: "text-purple-600", testid: "stat-active" },
          { icon: DollarSign, label: "Total Revenue", value: `$${totalRevenue.toFixed(2)}`, color: "text-emerald-600", testid: "stat-revenue" },
          { icon: Calendar, label: "Upcoming Shifts", value: totalShifts, color: "text-blue-600", testid: "stat-shifts" },
        ].map((stat, i) => (
          <Card key={i} className="hover-elevate">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-muted-foreground truncate">{stat.label}</div>
                  <div className="text-base font-bold" data-testid={stat.testid}>{stat.value}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* QUICK LINKS SECTION - Compact grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Link href="/employees" className="block">
          <Card className="hover-elevate active-elevate-2 cursor-pointer h-full">
            <CardContent className="p-3 text-center">
              <Users className="h-6 w-6 mx-auto mb-1 text-indigo-500" />
              <div className="text-xs font-medium">Employees</div>
              <div className="text-[10px] text-muted-foreground">Manage team</div>
            </CardContent>
          </Card>
        </Link>
        
        <Link href="/schedules" className="block">
          <Card className="hover-elevate active-elevate-2 cursor-pointer h-full">
            <CardContent className="p-3 text-center">
              <Calendar className="h-6 w-6 mx-auto mb-1 text-blue-500" />
              <div className="text-xs font-medium">Scheduling</div>
              <div className="text-[10px] text-muted-foreground">Plan shifts</div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/time-tracking" className="block">
          <Card className="hover-elevate active-elevate-2 cursor-pointer h-full">
            <CardContent className="p-3 text-center">
              <Clock className="h-6 w-6 mx-auto mb-1 text-purple-500" />
              <div className="text-xs font-medium">Time Tracking</div>
              <div className="text-[10px] text-muted-foreground">Track hours</div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/invoices" className="block">
          <Card className="hover-elevate active-elevate-2 cursor-pointer h-full">
            <CardContent className="p-3 text-center">
              <FileText className="h-6 w-6 mx-auto mb-1 text-emerald-500" />
              <div className="text-xs font-medium">Invoices</div>
              <div className="text-[10px] text-muted-foreground">Billing</div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/clients" className="block">
          <Card className="hover-elevate active-elevate-2 cursor-pointer h-full">
            <CardContent className="p-3 text-center">
              <Briefcase className="h-6 w-6 mx-auto mb-1 text-cyan-500" />
              <div className="text-xs font-medium">Clients</div>
              <div className="text-[10px] text-muted-foreground">Manage clients</div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/analytics" className="block">
          <Card className="hover-elevate active-elevate-2 cursor-pointer h-full">
            <CardContent className="p-3 text-center">
              <TrendingUp className="h-6 w-6 mx-auto mb-1 text-amber-500" />
              <div className="text-xs font-medium">Analytics</div>
              <div className="text-[10px] text-muted-foreground">Insights</div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/sales-crm" className="block">
          <Card className="hover-elevate active-elevate-2 cursor-pointer h-full">
            <CardContent className="p-3 text-center">
              <TrendingUp className="h-6 w-6 mx-auto mb-1 text-violet-500" />
              <div className="text-xs font-medium">Sales CRM</div>
              <div className="text-[10px] text-muted-foreground">AI leads</div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/live-chat" className="block">
          <Card className="hover-elevate active-elevate-2 cursor-pointer h-full">
            <CardContent className="p-3 text-center">
              <Users className="h-6 w-6 mx-auto mb-1 text-blue-500" />
              <div className="text-xs font-medium">Live Support</div>
              <div className="text-[10px] text-muted-foreground">Help desk</div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
