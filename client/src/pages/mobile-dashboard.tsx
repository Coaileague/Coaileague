import { MessageSquare, HelpCircle, Mail, Shield, Calendar, Clock, Users, LayoutDashboard } from "lucide-react";
import { AppShellMobile } from "@/components/mobile/AppShellMobile";
import { MobileNav } from "@/components/mobile/MobileNav";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";

function FeatureCard({ icon: Icon, label, href }: { icon: typeof MessageSquare; label: string; href: string }) {
  return (
    <a
      href={href}
      className="card rounded-2xl bg-card border flex flex-col justify-center items-center gap-2 hover-elevate active-elevate-2 transition p-3"
      data-testid={`card-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="p-2 rounded-xl bg-muted border">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div className="text-xs text-center px-2 leading-tight font-medium">
        {label}
      </div>
    </a>
  );
}

export default function MobileDashboard() {
  const { data: currentUser } = useQuery<{ user: { email: string; platformRole?: string } }>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const isStaff = currentUser?.user?.platformRole &&
    ['root_admin', 'deputy_admin', 'support_manager', 'sysop', 'support_agent'].includes(currentUser.user.platformRole);

  return (
    <div className="min-h-screen bg-background">
      <AppShellMobile title="Quick Access" showBack={false}>
        {/* Welcome Card */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground font-bold">
                {currentUser?.user?.email?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base truncate">
                  Welcome back!
                </CardTitle>
                <p className="text-xs text-muted-foreground truncate">
                  {currentUser?.user?.email || "Loading..."}
                </p>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Support & Help Desk Section */}
        <section className="rounded-2xl bg-card border p-4 mb-4">
          <div className="text-xs tracking-wide text-primary font-semibold mb-3 uppercase">
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
        <section className="rounded-2xl border bg-card p-4 mb-4">
          <div className="text-sm font-semibold mb-3">
            Platform Management
          </div>
          <div className="grid gap-3 grid-cols-2 grid-auto-3">
            <FeatureCard icon={Calendar} label="Schedule" href="/schedule-grid" />
            <FeatureCard icon={Clock} label="Time Tracking" href="/time-tracking" />
            <FeatureCard icon={MessageSquare} label="CommOS™" href="/communication-os" />
            {isStaff && <FeatureCard icon={Shield} label="Admin" href="/dashboard" />}
          </div>
        </section>

        {/* Core Features Section */}
        <section className="rounded-2xl border bg-card p-4 mb-20">
          <div className="text-sm font-semibold mb-3">
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
