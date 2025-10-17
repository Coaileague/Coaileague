import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { 
  Users, Activity, DollarSign, 
  FileText, Calendar, Clock, ArrowRight 
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { WorkforceOSLogo } from "@/components/workforceos-logo";

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
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const firstName = user?.firstName || user?.email?.split('@')[0] || 'User';
  const totalEmployees = (stats as any)?.totalEmployees || 0;
  const activeToday = (stats as any)?.activeToday || 0;
  const totalRevenue = (stats as any)?.totalRevenue || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 relative overflow-hidden">
      {/* Animated background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full filter blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-cyan-600/10 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="relative z-10 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Branded Header with Logo */}
        <div className="mb-8">
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-6 sm:p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="transform hover:scale-105 transition-transform duration-300">
                <WorkforceOSLogo size="lg" showText={false} />
              </div>
              <div className="flex-1">
                <h2 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-white via-blue-100 to-indigo-200 bg-clip-text text-transparent mb-1" data-testid="text-welcome">
                  Welcome back, {firstName}
                </h2>
                <p className="text-slate-300 text-sm sm:text-base">
                  {workspaceRole === 'owner' ? '🎯 Manage your entire workforce with WorkforceOS' : 
                   workspaceRole === 'manager' ? '📊 Oversee your team performance' :
                   '⏰ Track your time and tasks'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Metrics Grid - Animated Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {/* Total Employees Card */}
          <div className="group backdrop-blur-xl bg-gradient-to-br from-indigo-500/10 to-blue-500/5 border border-indigo-500/20 rounded-2xl p-6 hover:border-indigo-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/20 animate-in fade-in slide-in-from-bottom-4" data-testid="card-employees">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-indigo-500/20 rounded-xl group-hover:scale-110 transition-transform">
                <Users className="w-6 h-6 text-indigo-400" />
              </div>
              <div className="h-2 w-2 bg-indigo-400 rounded-full animate-pulse"></div>
            </div>
            <p className="text-slate-300 text-sm mb-2">Total Employees</p>
            <p className="text-4xl font-bold text-white">{totalEmployees}</p>
          </div>

          {/* Active Today Card */}
          <div className="group backdrop-blur-xl bg-gradient-to-br from-purple-500/10 to-violet-500/5 border border-purple-500/20 rounded-2xl p-6 hover:border-purple-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/20 animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '0.1s' }} data-testid="card-active">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-500/20 rounded-xl group-hover:scale-110 transition-transform">
                <Activity className="w-6 h-6 text-purple-400 animate-pulse" />
              </div>
              <div className="h-2 w-2 bg-purple-400 rounded-full animate-pulse"></div>
            </div>
            <p className="text-slate-300 text-sm mb-2">Active Today</p>
            <p className="text-4xl font-bold text-white">{activeToday}</p>
          </div>

          {/* Revenue Card */}
          <div className="group backdrop-blur-xl bg-gradient-to-br from-emerald-500/10 to-green-500/5 border border-emerald-500/20 rounded-2xl p-6 hover:border-emerald-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/20 animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '0.2s' }} data-testid="card-revenue">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-emerald-500/20 rounded-xl group-hover:scale-110 transition-transform">
                <DollarSign className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="h-2 w-2 bg-emerald-400 rounded-full animate-pulse"></div>
            </div>
            <p className="text-slate-300 text-sm mb-2">Total Revenue</p>
            <p className="text-4xl font-bold text-white">${(totalRevenue / 1000).toFixed(1)}K</p>
          </div>
        </div>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/employees">
            <button className="w-full backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 text-left hover:bg-white/10 hover:border-indigo-500/30 transition-all duration-300 group" data-testid="button-manage-employees">
              <div className="p-3 bg-indigo-500/20 rounded-xl w-fit mb-4 group-hover:scale-110 transition-transform">
                <Users className="w-8 h-8 text-indigo-400" />
              </div>
              <h4 className="font-bold text-white mb-2 text-lg">Manage Employees</h4>
              <p className="text-sm text-slate-400 mb-3">View and edit employee records</p>
              <div className="flex items-center text-indigo-400 text-sm font-semibold group-hover:translate-x-2 transition-transform">
                View all <ArrowRight className="w-4 h-4 ml-1" />
              </div>
            </button>
          </Link>

          <Link href="/schedule">
            <button className="w-full backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 text-left hover:bg-white/10 hover:border-blue-500/30 transition-all duration-300 group" data-testid="button-schedule">
              <div className="p-3 bg-blue-500/20 rounded-xl w-fit mb-4 group-hover:scale-110 transition-transform">
                <Calendar className="w-8 h-8 text-blue-400" />
              </div>
              <h4 className="font-bold text-white mb-2 text-lg">Schedule</h4>
              <p className="text-sm text-slate-400 mb-3">Manage shifts and assignments</p>
              <div className="flex items-center text-blue-400 text-sm font-semibold group-hover:translate-x-2 transition-transform">
                Open <ArrowRight className="w-4 h-4 ml-1" />
              </div>
            </button>
          </Link>

          <Link href="/time-tracking">
            <button className="w-full backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 text-left hover:bg-white/10 hover:border-violet-500/30 transition-all duration-300 group" data-testid="button-time-tracking">
              <div className="p-3 bg-violet-500/20 rounded-xl w-fit mb-4 group-hover:scale-110 transition-transform">
                <Clock className="w-8 h-8 text-violet-400" />
              </div>
              <h4 className="font-bold text-white mb-2 text-lg">Time Tracking</h4>
              <p className="text-sm text-slate-400 mb-3">Review and approve time entries</p>
              <div className="flex items-center text-violet-400 text-sm font-semibold group-hover:translate-x-2 transition-transform">
                Review <ArrowRight className="w-4 h-4 ml-1" />
              </div>
            </button>
          </Link>

          <Link href="/invoices">
            <button className="w-full backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 text-left hover:bg-white/10 hover:border-cyan-500/30 transition-all duration-300 group" data-testid="button-invoices">
              <div className="p-3 bg-cyan-500/20 rounded-xl w-fit mb-4 group-hover:scale-110 transition-transform">
                <FileText className="w-8 h-8 text-cyan-400" />
              </div>
              <h4 className="font-bold text-white mb-2 text-lg">Invoices</h4>
              <p className="text-sm text-slate-400 mb-3">Generate and send invoices</p>
              <div className="flex items-center text-cyan-400 text-sm font-semibold group-hover:translate-x-2 transition-transform">
                Create <ArrowRight className="w-4 h-4 ml-1" />
              </div>
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
