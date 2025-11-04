// Reference: shadcn sidebar documentation
import { Calendar, Users, UserCircle, FileText, Settings, LayoutDashboard, LogOut, Clock, BarChart3, Activity, Headphones, CreditCard, MessageSquare, Shield, UserCog, DollarSign, Receipt, Briefcase, TrendingUp, Zap, Package, Lock, Sparkles, Brain, Target, Layers } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useTransition } from "@/contexts/transition-context";
import { showLogoutTransition } from "@/lib/transition-utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AutoForceLogo } from "@/components/autoforce-logo";
import { Badge } from "@/components/ui/badge";

// FAMILY 1: Communication & Collaboration OS
const communicationFamilyItems = [
  { title: "📡 Communication Family", url: "/os-family/communication", icon: Sparkles, isFamily: true },
  { title: "CommunicationOS™", url: "/communication", icon: MessageSquare },
  { title: "Private Messages", url: "/messages", icon: Lock },
  { title: "SupportOS™ HelpDesk", url: "/live-chat", icon: Headphones },
  { title: "Mobile Chat", url: "/mobile-chat", icon: MessageSquare },
];

// FAMILY 2: Workforce Operations OS
const operationsFamilyItems = [
  { title: "⚙️ Operations Family", url: "/os-family/operations", icon: Sparkles, isFamily: true },
  { title: "ScheduleOS™", url: "/schedule", icon: Calendar },
  { title: "TimeOS™", url: "/time-tracking", icon: Clock },
  { title: "PayrollOS™", url: "/payroll", icon: DollarSign },
  { title: "BillOS™", url: "/invoices", icon: FileText },
  { title: "TrainingOS™", url: "/training", icon: Package },
  { title: "Employees", url: "/employees", icon: Users },
  { title: "Clients", url: "/clients", icon: UserCircle },
];

// FAMILY 3: Growth & Intelligence OS
const growthFamilyItems = [
  { title: "🚀 Growth Family", url: "/os-family/growth", icon: Sparkles, isFamily: true },
  { title: "TalentOS™", url: "/leaders-hub", icon: UserCog },
  { title: "EngagementOS™", url: "/engagement/dashboard", icon: Activity },
  { title: "AnalyticsOS™", url: "/analytics", icon: BarChart3 },
  { title: "ReportOS™", url: "/reports", icon: FileText },
];

// FAMILY 4: Platform & Control OS
const platformFamilyItems = [
  { title: "🎛️ Platform Family", url: "/os-family/platform", icon: Sparkles, isFamily: true },
  { title: "IntegrationOS™", url: "/integrations", icon: Zap },
  { title: "Admin Dashboard", url: "/dashboard", icon: LayoutDashboard },
];

// Quick Access (non-OS features)
const quickAccessItems = [
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Billing", url: "/billing", icon: CreditCard },
  { title: "My Paychecks", url: "/my-paychecks", icon: Receipt },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const transition = useTransition();

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    if (!firstName && !lastName) return "U";
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include"
      });
    } catch (error) {
      console.error("Logout error:", error);
    }
    
    showLogoutTransition(transition);
  };

  const renderMenuSection = (title: string, items: typeof communicationFamilyItems, showBadge?: boolean) => (
    <SidebarGroup>
      <SidebarGroupLabel className="px-3 mb-3 text-xs font-black uppercase tracking-wider text-muted-foreground/70 flex items-center gap-2">
        {title}
        {showBadge && <Badge variant="outline" className="text-[9px] px-1.5 py-0">NEW</Badge>}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="space-y-1">
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton 
                asChild 
                isActive={location === item.url}
                data-testid={`link-${item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                className={`hover-elevate active-elevate-2 overflow-visible ${
                  (item as any).isFamily ? 'bg-primary/10 font-bold border-l-2 border-primary' : ''
                }`}
              >
                <Link href={item.url}>
                  <item.icon className="h-4 w-4" />
                  <span className={(item as any).isFamily ? "font-black" : "font-semibold"}>
                    {item.title}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar variant="floating" collapsible="offcanvas" className="sidebar-glass">
      <SidebarHeader className="p-6 border-b border-white/[0.08]">
        <div className="bg-white/5 backdrop-blur-sm rounded-xl p-3 border border-white/10">
          <AutoForceLogo variant="full" size="sm" />
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-3 py-4">
        {/* OS Family 1: Communication & Collaboration */}
        {renderMenuSection("Communication & Collaboration", communicationFamilyItems, true)}
        
        {/* OS Family 2: Workforce Operations */}
        {renderMenuSection("Workforce Operations", operationsFamilyItems, true)}
        
        {/* OS Family 3: Growth & Intelligence */}
        {renderMenuSection("Growth & Intelligence", growthFamilyItems, true)}
        
        {/* OS Family 4: Platform & Control */}
        {renderMenuSection("Platform & Control", platformFamilyItems, true)}
        
        {/* Quick Access */}
        {renderMenuSection("Quick Access", quickAccessItems)}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-white/[0.08]">
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-xl bg-white/[0.03]">
          <Avatar className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-red-700 dark:from-red-600 dark:to-red-800">
            <AvatarImage src={user?.profileImageUrl || undefined} className="object-cover rounded-xl" />
            <AvatarFallback className="text-sm font-black rounded-xl bg-gradient-to-br from-red-500 to-red-700 dark:from-red-600 dark:to-red-800 text-white dark:text-white">
              {getInitials(user?.firstName, user?.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-bold truncate" data-testid="text-user-name">
              {user?.firstName || user?.lastName 
                ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim()
                : "User"}
            </span>
            <span className="text-xs text-muted-foreground truncate" data-testid="text-user-email">
              {user?.email || ""}
            </span>
            {(user as any)?.workId && (
              <span className="text-[10px] font-mono text-primary/80 truncate mt-0.5" data-testid="text-work-id">
                ID: {(user as any).workId}
              </span>
            )}
          </div>
        </div>
        <Button 
          variant="outline" 
          className="w-full" 
          size="sm"
          onClick={handleLogout}
          data-testid="button-logout"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log Out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
