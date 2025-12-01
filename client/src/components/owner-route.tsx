import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export function OwnerRoute({ children }: { children: React.ReactNode}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" aria-label="Loading" />
      </div>
    );
  }

  const platformRole = (user as any)?.platformRole;
  const isPlatformStaff = platformRole === 'root_admin' || platformRole === 'deputy_admin' || platformRole === 'sysop';
  
  const workspaceRole = (user as any)?.workspaceRole;
  const isOwner = workspaceRole === 'org_owner' || workspaceRole === 'org_admin' || isPlatformStaff;

  if (!isOwner) {
    return (
      <div className="h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center">
                <ShieldAlert className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <CardTitle>Access Denied</CardTitle>
                <CardDescription>Business Owner Analytics - Restricted</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              You don't have permission to access Owner Analytics. This area is restricted to workspace Owners and Admins only.
            </p>
            <p className="text-sm text-muted-foreground">
              If you believe you should have access, please contact your workspace owner.
            </p>
            <Button asChild className="w-full" data-testid="button-back-to-dashboard">
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
