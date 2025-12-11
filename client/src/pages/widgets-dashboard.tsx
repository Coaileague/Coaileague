import { useAuth } from "@/hooks/useAuth";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { EnhancedDashboard } from "@/components/enhanced-dashboard-widgets";
import { ResponsiveLoading } from "@/components/loading-indicators";
import { useIdentity } from "@/hooks/useIdentity";

export default function WidgetsDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const { employee, isLoading: identityLoading } = useIdentity();

  if (authLoading || identityLoading) {
    return <ResponsiveLoading label="Loading your dashboard..." />;
  }

  if (!user) {
    return null;
  }

  return (
    <WorkspaceLayout
      title="Dashboard"
      description="Your personalized workspace overview"
    >
      <div className="p-4 md:p-6 lg:p-8">
        <EnhancedDashboard />
      </div>
    </WorkspaceLayout>
  );
}
