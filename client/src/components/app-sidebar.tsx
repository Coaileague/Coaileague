// Reference: shadcn sidebar documentation
import { Calendar, Users, UserCircle, FileText, Settings, LayoutDashboard, LogOut, Building2, Clock, BarChart3, ClipboardCheck, Activity, Headphones, CreditCard, Heart, Star, Plane, UserX, MessageSquare, Shield, UserCog, DollarSign, Receipt, Scale, Briefcase, FileCheck, TrendingUp, Zap, Package, Lock } from "lucide-react";
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
import { WorkforceOSLogo } from "@/components/workforceos-logo";

// Core workspace features
const coreMenuItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Schedule", url: "/schedule", icon: Calendar },
  { title: "Time Tracking", url: "/time-tracking", icon: Clock },
  { title: "Employees", url: "/employees", icon: Users },
  { title: "Clients", url: "/clients", icon: UserCircle },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Reports", url: "/reports", icon: ClipboardCheck },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
];

// Financial features
const financeMenuItems = [
  { title: "PayrollOS™", url: "/payroll", icon: DollarSign },
  { title: "My Paychecks", url: "/my-paychecks", icon: Receipt },
  { title: "Billing", url: "/billing", icon: CreditCard },
];

// HR & People Management
const hrMenuItems = [
  { title: "Benefits", url: "/hr/benefits", icon: Heart },
  { title: "Reviews", url: "/hr/reviews", icon: Star },
  { title: "PTO", url: "/hr/pto", icon: Plane },
  { title: "Terminations", url: "/hr/terminations", icon: UserX },
  { title: "Disputes", url: "/disputes", icon: Scale },
];

// Engagement & Intelligence
const engagementMenuItems = [
  { title: "EngagementOS™ Dashboard", url: "/engagement/dashboard", icon: TrendingUp },
  { title: "Employee Engagement", url: "/engagement/employee", icon: Activity },
  { title: "Leaders Hub", url: "/leaders-hub", icon: UserCog },
  { title: "TrainingOS™", url: "/training", icon: Package },
];

// Admin & Workspace Management
const adminMenuItems = [
  { title: "Command Center", url: "/admin/command", icon: Activity },
  { title: "Usage & Credits", url: "/admin/usage", icon: BarChart3 },
  { title: "Custom Forms", url: "/admin/custom-forms", icon: FileCheck },
  { title: "HireOS Workflow", url: "/owner/hireos/workflow-builder", icon: Briefcase },
];

// Support & Communication
const supportMenuItems = [
  { title: "CommunicationOS™", url: "/communication", icon: MessageSquare },
  { title: "Private Messages", url: "/messages", icon: Lock },
  { title: "Live HelpDesk", url: "/live-chat", icon: Headphones },
  { title: "Support Dashboard", url: "/support/dashboard", icon: Shield },
  { title: "Mobile Chat", url: "/mobile-chat", icon: MessageSquare },
];

// Platform Administration
const platformAdminMenuItems = [
  { title: "Platform Dashboard", url: "/root-admin-portal", icon: Shield },
  { title: "QueryOS™ Diagnostics", url: "/query-os", icon: Activity },
  { title: "Platform Admin", url: "/platform/admin", icon: Shield },
  { title: "Platform Users", url: "/platform/users", icon: UserCog },
  { title: "Sales Portal", url: "/platform/sales", icon: DollarSign },
];

// Portals
const portalMenuItems = [
  { title: "Employee Portal", url: "/employee/portal", icon: Users },
  { title: "Client Portal", url: "/client/portal", icon: UserCircle },
  { title: "Auditor Portal", url: "/auditor/portal", icon: Scale },
];

// System & Settings
const systemMenuItems = [
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Profile", url: "/employee/profile", icon: UserCircle },
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
    // Call logout API while staying in SPA
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include"
      });
    } catch (error) {
      console.error("Logout error:", error);
    }
    
    // Show transition with auto-redirect to homepage
    showLogoutTransition(transition);
  };

  const renderMenuSection = (title: string, items: typeof coreMenuItems) => (
    <SidebarGroup>
      <SidebarGroupLabel className="px-3 mb-3 text-xs font-black uppercase tracking-wider text-muted-foreground/70">
        {title}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="space-y-1">
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton 
                asChild 
                isActive={location === item.url}
                data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                className="hover-elevate active-elevate-2 overflow-visible"
              >
                <Link href={item.url}>
                  <item.icon className="h-4 w-4" />
                  <span className="font-semibold">{item.title}</span>
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
          <WorkforceOSLogo size="sm" showText={true} />
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-3 py-4">
        {/* Core Features - Always visible to ALL users */}
        {renderMenuSection("Core Features", coreMenuItems)}
        
        {/* Financial - Always visible */}
        {renderMenuSection("Financial", financeMenuItems)}
        
        {/* HR Management - Always visible */}
        {renderMenuSection("HR Management", hrMenuItems)}
        
        {/* Engagement & Intelligence - Always visible */}
        {renderMenuSection("Intelligence", engagementMenuItems)}
        
        {/* Admin Tools - Always visible */}
        {renderMenuSection("Admin", adminMenuItems)}
        
        {/* Support & Communication - Always visible */}
        {renderMenuSection("Support", supportMenuItems)}
        
        {/* Platform Administration - Always visible */}
        {renderMenuSection("Platform", platformAdminMenuItems)}
        
        {/* Portals - Always visible */}
        {renderMenuSection("Portals", portalMenuItems)}
        
        {/* System & Settings - Always visible */}
        {renderMenuSection("System", systemMenuItems)}
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
