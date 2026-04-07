import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  BarChart3, Users, Calendar, Clock, FileText, 
  DollarSign, Shield, Headphones, TrendingUp, Building2,
  CheckCircle, Receipt, ShieldCheck, Book, MessageSquare,
  Truck, HelpCircle, ArrowRight, Activity
} from "lucide-react";
import { TrinityMascotAnimated } from "@/components/ui/trinity-mascot";
import type { WorkspaceFeature } from "@shared/workspaceFeatures";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';

const iconMap: Record<string, any> = {
  BarChart3, Users, Calendar, Clock, FileText,
  DollarSign, Shield, Headphones, TrendingUp, Building2,
  CheckCircle, Receipt, ShieldCheck, Book, MessageSquare,
  Truck, HelpCircle, Activity
};

export default function Workspace() {
  const { user, isLoading } = useAuth();

  // ✅ SECURE: Fetch features from backend (server-side validation)
  const { data: featuresData, isLoading: featuresLoading } = useQuery<{
    features: WorkspaceFeature[];
    platformRole: string;
    workspaceRole: string | null;
  }>({
    queryKey: ['/api/me/workspace-features'],
    enabled: !!user,
  });

  // Fetch workspace stats
  const { data: stats } = useQuery<{
    totalEmployees: number;
    totalClients: number;
    activeShifts: number;
    pendingApprovals: number;
    totalRevenue: number;
  }>({
    queryKey: ['/api/analytics/stats'],
    enabled: !!user,
  });

  const availableFeatures = featuresData?.features || [];
  const platformRole = featuresData?.platformRole;
  const workspaceRole = featuresData?.workspaceRole;

  // Only show loader if actually loading AND not on a public route
  // CoAIleagueLoader internally checks universal gate anyway
  if (isLoading || featuresLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
        <TrinityMascotAnimated size="lg" state="loading" showSparkles />
        <span className="text-lg font-semibold text-muted-foreground">Loading workspace...</span>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const subtitle = platformRole && platformRole !== 'none' 
    ? `Platform Role: ${platformRole.replace(/_/g, ' ')}`
    : workspaceRole 
      ? `Workspace Role: ${workspaceRole.replace(/_/g, ' ')}`
      : 'Select a tool to get started';

  const pageConfig: CanvasPageConfig = {
    id: 'workspace',
    title: 'Welcome to your Workspace',
    subtitle: subtitle,
    category: 'dashboard',
  };

  return (
    <CanvasHubPage config={pageConfig}>
      {/* Quick Stats (for managers and owners) */}
      {stats && (workspaceRole === 'org_owner' || workspaceRole === 'department_manager') && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-8">
          <Card>
            <CardContent className="p-3 sm:pt-6 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">Employees</p>
                  <p className="text-lg sm:text-2xl font-bold" data-testid="stat-employees">{stats.totalEmployees || 0}</p>
                </div>
                <Users className="h-5 w-5 sm:h-8 sm:w-8 text-primary shrink-0" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:pt-6 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">Clients</p>
                  <p className="text-lg sm:text-2xl font-bold" data-testid="stat-clients">{stats.totalClients || 0}</p>
                </div>
                <Building2 className="h-5 w-5 sm:h-8 sm:w-8 text-primary shrink-0" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:pt-6 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">Active Shifts</p>
                  <p className="text-lg sm:text-2xl font-bold" data-testid="stat-shifts">{stats.activeShifts || 0}</p>
                </div>
                <Calendar className="h-5 w-5 sm:h-8 sm:w-8 text-primary shrink-0" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:pt-6 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">Pending Approvals</p>
                  <p className="text-lg sm:text-2xl font-bold" data-testid="stat-pending">{stats.pendingApprovals || 0}</p>
                </div>
                <CheckCircle className="h-5 w-5 sm:h-8 sm:w-8 text-primary shrink-0" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* CoAI Buddy Info Card */}
      <Card className="mb-4 sm:mb-8 bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/20 dark:to-blue-950/20 border-cyan-200 dark:border-cyan-800">
        <CardContent className="p-3 sm:pt-6 sm:p-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="p-2 sm:p-3 rounded-full bg-gradient-to-br from-cyan-500 via-blue-500 to-teal-500 shrink-0">
              <MessageSquare className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm sm:text-lg mb-1" data-testid="text-coai-buddy-title">Meet Your CoAI Buddy</h3>
              <p className="text-xs sm:text-sm text-muted-foreground mb-2" data-testid="text-coai-buddy-desc">
                Look for the three floating stars on every page. CoAI offers helpful tips, 
                answers questions, and provides contextual guidance.
              </p>
              <div className="flex flex-wrap gap-1.5 sm:gap-2 text-[10px] sm:text-xs">
                <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300">Proactive Tips</span>
                <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">Learns Your Patterns</span>
                <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300">Seasonal Themes</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature Grid */}
      <div>
        <h2 className="text-base sm:text-xl font-semibold mb-3 sm:mb-4">Your Tools</h2>
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
          {availableFeatures.map((feature) => {
            const Icon = iconMap[feature.icon] || Activity;
            return (
              <Link key={feature.id} href={feature.path}>
                <Card className="hover-elevate active-elevate-2 cursor-pointer h-full" data-testid={`card-feature-${feature.id}`}>
                  <CardHeader className="p-3 sm:p-6">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="p-1.5 sm:p-2 rounded-md bg-primary/10 shrink-0">
                        <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-xs sm:text-base truncate">{feature.label}</CardTitle>
                      </div>
                      <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0 hidden sm:block" />
                    </div>
                  </CardHeader>
                  {feature.description && (
                    <CardContent className="pt-0 px-3 pb-3 sm:px-6 sm:pb-6 hidden sm:block">
                      <CardDescription className="text-sm">
                        {feature.description}
                      </CardDescription>
                    </CardContent>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>

        {availableFeatures.length === 0 && (
          <Card>
            <CardContent className="py-8 sm:py-12 text-center">
              <HelpCircle className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-3 sm:mb-4" />
              <h3 className="text-base sm:text-lg font-semibold mb-2">No Tools Available</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Contact your administrator to get access to workspace tools.
              </p>
              <Link href="/chatrooms">
                <Button variant="outline">
                  <Headphones className="h-4 w-4 mr-2" />
                  Get Support
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </CanvasHubPage>
  );
}
