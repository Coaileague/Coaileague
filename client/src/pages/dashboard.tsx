import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { 
  Users, CheckCircle, Target, Activity, DollarSign, 
  FileText, Calendar, Clock, ArrowRight 
} from "lucide-react";
import { Link, useLocation } from "wouter";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading, user } = useAuth();

  // Fetch workspace stats
  const { data: stats } = useQuery({
    queryKey: ['/api/analytics/stats'],
    enabled: isAuthenticated,
  });

  // Fetch employees to determine user's workspace role
  const { data: allEmployees } = useQuery<any[]>({
    queryKey: ['/api/employees'],
    enabled: isAuthenticated,
  });

  // Determine current user's workspace role
  const currentEmployee = allEmployees?.find((emp: any) => emp.userId === user?.id);
  const workspaceRole = currentEmployee?.workspaceRole || 'employee';

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = '/api/login';
    }
  }, [isAuthenticated, isLoading]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[hsl(var(--cad-background))] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[hsl(var(--cad-blue))] border-t-transparent rounded-full" />
      </div>
    );
  }

  const firstName = user?.firstName || user?.email?.split('@')[0] || 'User';
  const totalEmployees = (stats as any)?.totalEmployees || 0;
  const activeToday = (stats as any)?.activeToday || 0;
  const totalRevenue = (stats as any)?.totalRevenue || 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full h-full overflow-auto">
        <div className="space-y-4 sm:space-y-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2" data-testid="text-welcome">
              Welcome back, {firstName}
            </h2>
            <p className="text-sm sm:text-base text-[hsl(var(--cad-text-secondary))]">
              {workspaceRole === 'owner' ? 'Manage your entire workforce' : 
               workspaceRole === 'manager' ? 'Oversee your team performance' :
               'Track your time and tasks'}
            </p>
          </div>

            {/* Metrics Grid - Real Data Only */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              <div className="card-interactive p-4 sm:p-6 hover-lift animate-slide-up" data-testid="card-employees">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                    <Users className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-400" />
                  </div>
                </div>
                <p className="text-slate-400 text-xs sm:text-sm mb-1">Total Employees</p>
                <p className="text-2xl sm:text-3xl font-bold gradient-text">{totalEmployees}</p>
              </div>

              <div className="card-interactive p-4 sm:p-6 hover-lift animate-slide-up" style={{ animationDelay: '0.1s' }} data-testid="card-active">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-purple-400" />
                  </div>
                </div>
                <p className="text-slate-400 text-xs sm:text-sm mb-1">Active Today</p>
                <p className="text-2xl sm:text-3xl font-bold gradient-text">{activeToday}</p>
              </div>

              <div className="card-interactive p-4 sm:p-6 hover-lift animate-slide-up" style={{ animationDelay: '0.2s' }} data-testid="card-revenue">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400" />
                  </div>
                </div>
                <p className="text-slate-400 text-xs sm:text-sm mb-1">Revenue</p>
                <p className="text-2xl sm:text-3xl font-bold gradient-text">${(totalRevenue / 1000).toFixed(1)}K</p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <Link href="/employees">
                <button className="w-full bg-[hsl(var(--cad-surface))] border border-[hsl(var(--cad-border))] rounded-xl p-4 text-left hover-elevate active-elevate-2 transition-all" data-testid="button-manage-employees">
                  <Users className="w-8 h-8 text-[hsl(var(--cad-blue))] mb-3" />
                  <h4 className="font-bold mb-1">Manage Employees</h4>
                  <p className="text-sm text-[hsl(var(--cad-text-secondary))] mb-2">View and edit employee records</p>
                  <div className="flex items-center text-[hsl(var(--cad-blue))] text-sm font-semibold">
                    View all <ArrowRight className="w-4 h-4 ml-1" />
                  </div>
                </button>
              </Link>

              <Link href="/schedule">
                <button className="w-full bg-[hsl(var(--cad-surface))] border border-[hsl(var(--cad-border))] rounded-xl p-4 text-left hover-elevate active-elevate-2 transition-all" data-testid="button-schedule">
                  <Calendar className="w-8 h-8 text-[hsl(var(--cad-blue))] mb-3" />
                  <h4 className="font-bold mb-1">Schedule</h4>
                  <p className="text-sm text-[hsl(var(--cad-text-secondary))] mb-2">Manage shifts and assignments</p>
                  <div className="flex items-center text-[hsl(var(--cad-blue))] text-sm font-semibold">
                    Open <ArrowRight className="w-4 h-4 ml-1" />
                  </div>
                </button>
              </Link>

              <Link href="/time-tracking">
                <button className="w-full bg-[hsl(var(--cad-surface))] border border-[hsl(var(--cad-border))] rounded-xl p-4 text-left hover-elevate active-elevate-2 transition-all" data-testid="button-time-tracking">
                  <Clock className="w-8 h-8 text-[hsl(var(--cad-blue))] mb-3" />
                  <h4 className="font-bold mb-1">Time Tracking</h4>
                  <p className="text-sm text-[hsl(var(--cad-text-secondary))] mb-2">Review and approve time entries</p>
                  <div className="flex items-center text-[hsl(var(--cad-blue))] text-sm font-semibold">
                    Review <ArrowRight className="w-4 h-4 ml-1" />
                  </div>
                </button>
              </Link>

              <Link href="/invoices">
                <button className="w-full bg-[hsl(var(--cad-surface))] border border-[hsl(var(--cad-border))] rounded-xl p-4 text-left hover-elevate active-elevate-2 transition-all" data-testid="button-invoices">
                  <FileText className="w-8 h-8 text-[hsl(var(--cad-blue))] mb-3" />
                  <h4 className="font-bold mb-1">Invoices</h4>
                  <p className="text-sm text-[hsl(var(--cad-text-secondary))] mb-2">Generate and send invoices</p>
                  <div className="flex items-center text-[hsl(var(--cad-blue))] text-sm font-semibold">
                    Create <ArrowRight className="w-4 h-4 ml-1" />
                  </div>
                </button>
              </Link>
            </div>
          </div>
        </div>
  );
}
