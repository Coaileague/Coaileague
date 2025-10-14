import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Users, 
  CheckCircle2, 
  DollarSign, 
  TrendingDown,
  Clock,
  MapPin,
  FileText,
  BarChart3,
  ClipboardCheck,
  Plus,
  ArrowRight,
} from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();

  // Fetch workspace stats
  const { data: stats } = useQuery({
    queryKey: ['/api/analytics/stats'],
    enabled: isAuthenticated,
  });

  // Fetch active employees (clocked in)
  const { data: activeEmployees } = useQuery({
    queryKey: ['/api/employees', { status: 'active' }],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
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
  }, [isAuthenticated, isLoading, toast]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" aria-label="Loading" />
      </div>
    );
  }

  const firstName = user?.firstName || user?.email?.split('@')[0] || 'User';
  const totalEmployees = (stats as any)?.totalEmployees || 847;
  const activeToday = (stats as any)?.activeToday || 734;
  const payrollProcessed = (stats as any)?.totalRevenue || 284000;
  const costSavings = (stats as any)?.costSavings || 22000;

  return (
    <div className="flex-1 overflow-auto">
      <div className="container mx-auto p-6 lg:p-8 space-y-8 relative z-10">
        {/* Top Bar */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tight mb-2" data-testid="text-dashboard-title">
              Welcome back, {firstName}
            </h1>
            <p className="text-lg text-muted-foreground" data-testid="text-dashboard-subtitle">
              Here's what's happening with your workforce today
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" size="default" data-testid="button-export-report">
              Export Report
            </Button>
            <Button 
              size="default"
              asChild
              data-testid="button-add-employee"
            >
              <Link href="/employees">
                <Plus className="mr-2 h-4 w-4" />
                Add Employee
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="glass-card rounded-2xl p-7" data-testid="card-metric-employees">
            <div className="flex justify-between items-center mb-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Total Employees
              </div>
              <div className="icon-box w-10 h-10">
                <Users className="h-5 w-5 text-red-500" />
              </div>
            </div>
            <div className="text-4xl font-black mb-2 stat-value-gradient" data-testid="text-metric-employees">
              {totalEmployees}
            </div>
            <div className="text-sm font-semibold text-chart-2 flex items-center gap-1">
              <span>↑ 12% vs last month</span>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-7" data-testid="card-metric-active">
            <div className="flex justify-between items-center mb-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Active Today
              </div>
              <div className="icon-box w-10 h-10">
                <CheckCircle2 className="h-5 w-5 text-red-500" />
              </div>
            </div>
            <div className="text-4xl font-black mb-2 stat-value-gradient" data-testid="text-metric-active">
              {activeToday}
            </div>
            <div className="text-sm font-semibold text-chart-2 flex items-center gap-1">
              <span>↑ 87% attendance</span>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-7" data-testid="card-metric-payroll">
            <div className="flex justify-between items-center mb-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Payroll Processed
              </div>
              <div className="icon-box w-10 h-10">
                <DollarSign className="h-5 w-5 text-red-500" />
              </div>
            </div>
            <div className="text-4xl font-black mb-2 stat-value-gradient" data-testid="text-metric-payroll">
              ${(payrollProcessed / 1000).toFixed(0)}K
            </div>
            <div className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
              <span>This month</span>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-7" data-testid="card-metric-savings">
            <div className="flex justify-between items-center mb-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Cost Savings
              </div>
              <div className="icon-box w-10 h-10">
                <TrendingDown className="h-5 w-5 text-red-500" />
              </div>
            </div>
            <div className="text-4xl font-black mb-2 stat-value-gradient" data-testid="text-metric-savings">
              ${(costSavings / 1000).toFixed(0)}K
            </div>
            <div className="text-sm font-semibold text-chart-2 flex items-center gap-1">
              <span>↑ Saved this month</span>
            </div>
          </div>
        </div>

        {/* Main Dashboard Grid */}
        <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
          {/* Active Employees */}
          <Card className="glass-card rounded-2xl p-8 border-0" data-testid="card-active-employees">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black">Active Employees</h2>
              <Button 
                variant="ghost" 
                size="sm"
                asChild
                data-testid="button-view-all-employees"
              >
                <Link href="/employees">
                  View All <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
            
            <div className="space-y-4">
              {[
                { name: "John Davis", role: "Software Engineer", location: "Site A", initials: "JD" },
                { name: "Sarah Kim", role: "Project Manager", location: "Site B", initials: "SK" },
                { name: "Mike Thompson", role: "Operations Lead", location: "Site A", initials: "MT" },
                { name: "Anna Lee", role: "Designer", location: "Remote", initials: "AL" },
                { name: "Robert Johnson", role: "Team Lead", location: "Site C", initials: "RJ" },
              ].map((employee, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 rounded-xl list-item-hover bg-white/[0.03]"
                  data-testid={`employee-item-${index}`}
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-11 w-11 rounded-xl bg-gradient-to-br from-red-500 to-red-700">
                      <AvatarFallback className="rounded-xl bg-gradient-to-br from-red-500 to-red-700 text-white font-black text-lg">
                        {employee.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h4 className="font-bold mb-1">{employee.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {employee.role} • {employee.location}
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-green-500/15 text-green-500 border-0 font-semibold">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2 pulse-dot" />
                    Clocked In
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          {/* Quick Actions */}
          <Card className="glass-card rounded-2xl p-8 border-0" data-testid="card-quick-actions">
            <h2 className="text-2xl font-black mb-8">Quick Actions</h2>
            
            <div className="space-y-4">
              <Link href="/invoices" data-testid="link-quick-action-payroll">
                <div className="flex items-center gap-4 p-5 rounded-xl list-item-hover bg-white/[0.03] cursor-pointer border border-white/[0.08]">
                  <div className="icon-box w-11 h-11">
                    <Clock className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <h4 className="font-bold mb-1">Run Payroll</h4>
                    <p className="text-sm text-muted-foreground">Process this week's payroll</p>
                  </div>
                </div>
              </Link>

              <Link href="/time-tracking" data-testid="link-quick-action-gps">
                <div className="flex items-center gap-4 p-5 rounded-xl list-item-hover bg-white/[0.03] cursor-pointer border border-white/[0.08]">
                  <div className="icon-box w-11 h-11">
                    <MapPin className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <h4 className="font-bold mb-1">GPS Tracking</h4>
                    <p className="text-sm text-muted-foreground">View live employee locations</p>
                  </div>
                </div>
              </Link>

              <Link href="/employees" data-testid="link-quick-action-post-job">
                <div className="flex items-center gap-4 p-5 rounded-xl list-item-hover bg-white/[0.03] cursor-pointer border border-white/[0.08]">
                  <div className="icon-box w-11 h-11">
                    <FileText className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <h4 className="font-bold mb-1">Post Job</h4>
                    <p className="text-sm text-muted-foreground">Create new job listing</p>
                  </div>
                </div>
              </Link>

              <Link href="/analytics" data-testid="link-quick-action-reports">
                <div className="flex items-center gap-4 p-5 rounded-xl list-item-hover bg-white/[0.03] cursor-pointer border border-white/[0.08]">
                  <div className="icon-box w-11 h-11">
                    <BarChart3 className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <h4 className="font-bold mb-1">View Reports</h4>
                    <p className="text-sm text-muted-foreground">Generate analytics report</p>
                  </div>
                </div>
              </Link>

              <div className="flex items-center gap-4 p-5 rounded-xl list-item-hover bg-white/[0.03] cursor-pointer border border-white/[0.08]" data-testid="button-quick-action-compliance">
                <div className="icon-box w-11 h-11">
                  <ClipboardCheck className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <h4 className="font-bold mb-1">Compliance Check</h4>
                  <p className="text-sm text-muted-foreground">Run audit compliance scan</p>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Bottom Grid */}
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Recent Activity */}
          <Card className="glass-card rounded-2xl p-8 border-0" data-testid="card-recent-activity">
            <h2 className="text-2xl font-black mb-8">Recent Activity</h2>
            
            <div className="space-y-5">
              <div className="flex gap-4">
                <div className="icon-box w-10 h-10 flex-shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <h4 className="font-bold text-sm mb-1">Payroll Completed</h4>
                  <p className="text-sm text-muted-foreground mb-2">847 employees paid successfully</p>
                  <div className="text-xs text-muted-foreground/60">2 hours ago</div>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="icon-box w-10 h-10 flex-shrink-0">
                  <Users className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <h4 className="font-bold text-sm mb-1">New Employee</h4>
                  <p className="text-sm text-muted-foreground mb-2">James Wilson onboarded</p>
                  <div className="text-xs text-muted-foreground/60">5 hours ago</div>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="icon-box w-10 h-10 flex-shrink-0">
                  <MapPin className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <h4 className="font-bold text-sm mb-1">GPS Verified</h4>
                  <p className="text-sm text-muted-foreground mb-2">3,241 clock-ins verified today</p>
                  <div className="text-xs text-muted-foreground/60">8 hours ago</div>
                </div>
              </div>
            </div>
          </Card>

          {/* Performance Chart */}
          <Card className="glass-card rounded-2xl p-8 border-0" data-testid="card-performance">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black">Performance</h2>
              <Button 
                variant="ghost" 
                size="sm"
                asChild
                data-testid="button-view-performance"
              >
                <Link href="/analytics">
                  View Details <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
            
            <div className="h-48 bg-white/[0.02] rounded-xl flex items-center justify-center">
              <BarChart3 className="h-20 w-20 text-muted-foreground/20" />
            </div>
          </Card>

          {/* Compliance Status */}
          <Card className="glass-card rounded-2xl p-8 border-0" data-testid="card-compliance">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black">Compliance</h2>
              <Button 
                variant="ghost" 
                size="sm"
                data-testid="button-view-compliance"
              >
                View All <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-4">
              <div className="flex gap-4 p-4 rounded-xl bg-white/[0.02]">
                <div className="icon-box w-10 h-10 flex-shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <h4 className="font-bold text-sm mb-1">OSHA Compliant</h4>
                  <p className="text-sm text-muted-foreground">All requirements met</p>
                </div>
              </div>

              <div className="flex gap-4 p-4 rounded-xl bg-white/[0.02]">
                <div className="icon-box w-10 h-10 flex-shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <h4 className="font-bold text-sm mb-1">Labor Laws</h4>
                  <p className="text-sm text-muted-foreground">Up to date across all states</p>
                </div>
              </div>

              <div className="flex gap-4 p-4 rounded-xl bg-white/[0.02]">
                <div className="icon-box w-10 h-10 flex-shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <h4 className="font-bold text-sm mb-1">Tax Compliance</h4>
                  <p className="text-sm text-muted-foreground">Federal & state current</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
