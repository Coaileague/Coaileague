import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  UserCircle, 
  Calendar, 
  DollarSign, 
  Clock,
  Plus,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();

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

  return (
    <div className="flex-1 overflow-auto">
      <div className="container mx-auto p-6 lg:p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight" data-testid="text-dashboard-title">
              Dashboard
            </h1>
            <p className="text-muted-foreground mt-1" data-testid="text-dashboard-subtitle">
              Overview of your workspace activity
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" asChild data-testid="button-add-employee">
              <Link href="/employees">
                <Plus className="mr-2 h-4 w-4" />
                Add Employee
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild data-testid="button-create-schedule">
              <Link href="/schedule">
                <Calendar className="mr-2 h-4 w-4" />
                Create Schedule
              </Link>
            </Button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card data-testid="card-metric-employees">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Active Employees
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold" data-testid="text-metric-employees">0</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <TrendingUp className="h-3 w-3 text-chart-2" />
                <span>Ready to schedule</span>
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-metric-clients">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Active Clients
              </CardTitle>
              <UserCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold" data-testid="text-metric-clients">0</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <span>No pending appointments</span>
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-metric-hours">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Scheduled Hours
              </CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold" data-testid="text-metric-hours">0</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <span>This week</span>
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-metric-revenue">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Revenue (Month)
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold" data-testid="text-metric-revenue">$0</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <span>From 0 invoices</span>
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Upcoming Shifts */}
          <Card data-testid="card-upcoming-shifts">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Upcoming Shifts</CardTitle>
                <Button size="sm" variant="ghost" asChild>
                  <Link href="/schedule">View All</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground" data-testid="text-no-shifts">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p className="text-sm">No upcoming shifts scheduled</p>
                <Button size="sm" variant="outline" className="mt-4" asChild>
                  <Link href="/schedule">
                    <Plus className="mr-2 h-4 w-4" />
                    Create First Shift
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card data-testid="card-recent-activity">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground" data-testid="text-no-activity">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p className="text-sm">No recent activity</p>
                <p className="text-xs mt-2">Start scheduling to see updates here</p>
              </div>
            </CardContent>
          </Card>

          {/* Pending Invoices */}
          <Card data-testid="card-pending-invoices">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Pending Invoices</CardTitle>
                <Button size="sm" variant="ghost" asChild>
                  <Link href="/invoices">View All</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground" data-testid="text-no-invoices">
                <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p className="text-sm">No pending invoices</p>
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card data-testid="card-quick-stats">
            <CardHeader>
              <CardTitle>Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Subscription Plan</span>
                <Badge data-testid="badge-subscription-tier">Free</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Employee Limit</span>
                <span className="text-sm font-medium" data-testid="text-employee-limit">0 / 5</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Client Limit</span>
                <span className="text-sm font-medium" data-testid="text-client-limit">0 / 10</span>
              </div>
              <Button size="sm" variant="outline" className="w-full mt-4" data-testid="button-upgrade-plan">
                <TrendingUp className="mr-2 h-4 w-4" />
                Upgrade Plan
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
