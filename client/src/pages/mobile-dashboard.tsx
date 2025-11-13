import { MessageSquare, HelpCircle, Mail, Shield, Calendar, Clock, Users, LayoutDashboard } from "lucide-react";
import { AppShellMobile } from "@/components/mobile/AppShellMobile";
import { MobileNav } from "@/components/mobile/MobileNav";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useIdentity } from "@/hooks/useIdentity";

function FeatureCard({ icon: Icon, label, href }: { icon: typeof MessageSquare; label: string; href: string }) {
  return (
    <a
      href={href}
      className="card rounded-2xl bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 shadow-sm flex flex-col justify-center items-center gap-2 hover-elevate active-elevate-2 transition p-3"
      data-testid={`card-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-200 dark:border-blue-700">
        <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="text-xs text-center px-2 leading-tight font-medium text-gray-900 dark:text-white">
        {label}
      </div>
    </a>
  );
}

export default function MobileDashboard() {
  const { user } = useAuth();
  const { 
    externalId, 
    employeeId, 
    supportCode, 
    orgId, 
    userType, 
    workspaceRole,
    identity
  } = useIdentity(); // Universal RBAC tracking - ALL user types

  const isStaff = user?.platformRole &&
    ['root_admin', 'deputy_admin', 'support_manager', 'sysop', 'support_agent'].includes(user.platformRole);

  // Generate display name like desktop does
  const displayName = user?.firstName && user?.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : user?.email?.split('@')[0] || 'User';
    
  const initials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : user?.email?.[0]?.toUpperCase() || "U";

  // Determine which external ID to display based on user type
  const displayExternalId = employeeId || supportCode || externalId;
  const displayRole = workspaceRole || user?.platformRole;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <AppShellMobile title="Quick Access" showBack={false}>
        {/* Welcome Card */}
        <Card className="mb-4 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-2 border-gray-200 dark:border-slate-700 shadow-md">
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 flex-shrink-0 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 dark:from-blue-700 dark:to-indigo-700 flex items-center justify-center text-white dark:text-white font-bold shadow-md">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                {/* Name and Welcome - Two Lines for Mobile */}
                <CardTitle className="text-sm leading-tight text-gray-900 dark:text-white" data-testid="text-welcome">
                  Welcome,
                </CardTitle>
                <p className="text-base font-bold leading-tight text-gray-900 dark:text-white mt-0.5" data-testid="text-user-name">
                  {displayName}
                </p>
                {/* Badges - Allow Wrapping */}
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  {displayExternalId && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-400" data-testid="badge-external-id">
                      {displayExternalId}
                    </Badge>
                  )}
                  {displayRole && (
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300" data-testid="badge-role">
                      {displayRole.replace(/_/g, ' ')}
                    </Badge>
                  )}
                  {orgId && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-400" data-testid="badge-org-id">
                      {orgId}
                    </Badge>
                  )}
                </div>
                {/* Email - Smaller, Wrapped */}
                <p className="text-[10px] text-gray-600 dark:text-gray-400 mt-1.5 break-all leading-tight" data-testid="text-email">
                  {user?.email || "Loading..."}
                </p>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Support & Help Desk Section */}
        <section className="rounded-2xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-2 border-gray-200 dark:border-slate-700 shadow-md p-4 mb-4">
          <div className="text-xs tracking-wide text-blue-600 dark:text-blue-400 font-semibold mb-3 uppercase">
            Support & Helpdesk
          </div>
          <div className="grid gap-3 grid-cols-2 grid-auto-3">
            <FeatureCard icon={MessageSquare} label="Live Chat" href="/mobile-chat" />
            <FeatureCard icon={HelpCircle} label="Help Desk" href="/mobile-chat" />
            <FeatureCard icon={Mail} label="Support Email" href="/support" />
            {isStaff && <FeatureCard icon={Shield} label="Audit Logs" href="/audit" />}
          </div>
        </section>

        {/* Platform Management Section */}
        <section className="rounded-2xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-2 border-gray-200 dark:border-slate-700 shadow-md p-4 mb-4">
          <div className="text-sm font-semibold mb-3 text-gray-900 dark:text-white">
            Platform Management
          </div>
          <div className="grid gap-3 grid-cols-2 grid-auto-3">
            <FeatureCard icon={Calendar} label="Schedule" href="/schedule-grid" />
            <FeatureCard icon={Clock} label="Time Tracking" href="/time-tracking" />
            <FeatureCard icon={MessageSquare} label="CommOS&trade;" href="/comm-os" />
            {isStaff && <FeatureCard icon={Shield} label="Admin" href="/dashboard" />}
          </div>
        </section>

        {/* Core Features Section */}
        <section className="rounded-2xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-2 border-gray-200 dark:border-slate-700 shadow-md p-4 mb-20">
          <div className="text-sm font-semibold mb-3 text-gray-900 dark:text-white">
            Core Features
          </div>
          <div className="grid gap-3 grid-cols-2 grid-auto-3">
            <FeatureCard icon={Users} label="Employees" href="/employees" />
            <FeatureCard icon={LayoutDashboard} label="Dashboard" href="/dashboard" />
            <FeatureCard icon={Mail} label="Billing" href="/billing" />
            <FeatureCard icon={Calendar} label="Reports" href="/reports" />
          </div>
        </section>
      </AppShellMobile>

      {/* Mobile Bottom Navigation */}
      <MobileNav />
    </div>
  );
}
