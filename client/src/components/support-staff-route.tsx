import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ArrowLeft, HeadphonesIcon } from "lucide-react";
import { Link } from "wouter";
import { ColorfulCelticKnot } from "@/components/ui/colorful-celtic-knot";

const SUPPORT_STAFF_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'compliance_officer'];

export function isSupportStaff(platformRole?: string | null): boolean {
  if (!platformRole) return false;
  return SUPPORT_STAFF_ROLES.includes(platformRole);
}

export function SupportStaffRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background gap-3">
        <ColorfulCelticKnot size="lg" state="focused" animated={true} animationSpeed="fast" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  const platformRole = (user as any)?.platformRole;
  const hasAccess = isSupportStaff(platformRole);

  if (!hasAccess) {
    return (
      <div className="h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-full">
                <HeadphonesIcon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle data-testid="text-support-only-title">Support Staff Only</CardTitle>
                <CardDescription>Internal Tool</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground" data-testid="text-support-only-message">
              This area is restricted to CoAIleague support staff. It contains internal testing and debugging tools for the mascot system.
            </p>
            <div className="flex gap-2">
              <Link href="/dashboard">
                <Button variant="outline" className="gap-2" data-testid="button-back-dashboard">
                  <ArrowLeft className="w-4 h-4" />
                  Back to Dashboard
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
