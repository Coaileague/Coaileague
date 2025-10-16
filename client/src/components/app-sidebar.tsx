// Reference: shadcn sidebar documentation
import { Calendar, Users, UserCircle, FileText, Settings, LayoutDashboard, LogOut, Building2, Clock, BarChart3, ClipboardCheck, Activity, Headphones, CreditCard, Heart, Star, Plane, UserX, MessageSquare, Shield, UserCog, DollarSign, Receipt } from "lucide-react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { WorkforceOSLogo } from "@/components/workforceos-logo";

const menuItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Schedule",
    url: "/schedule",
    icon: Calendar,
  },
  {
    title: "Time Tracking",
    url: "/time-tracking",
    icon: Clock,
  },
  {
    title: "Employees",
    url: "/employees",
    icon: Users,
  },
  {
    title: "Clients",
    url: "/clients",
    icon: UserCircle,
  },
  {
    title: "Invoices",
    url: "/invoices",
    icon: FileText,
  },
  {
    title: "Reports",
    url: "/reports",
    icon: ClipboardCheck,
  },
  {
    title: "Analytics",
    url: "/analytics",
    icon: BarChart3,
  },
  {
    title: "Live HelpDesk",
    url: "/live-chat",
    icon: MessageSquare,
  },
  {
    title: "Billing",
    url: "/billing",
    icon: CreditCard,
  },
  {
    title: "PayrollOS™",
    url: "/payroll",
    icon: DollarSign,
  },
  {
    title: "My Paychecks",
    url: "/my-paychecks",
    icon: Receipt,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

const hrMenuItems = [
  {
    title: "Benefits",
    url: "/hr/benefits",
    icon: Heart,
  },
  {
    title: "Reviews",
    url: "/hr/reviews",
    icon: Star,
  },
  {
    title: "PTO",
    url: "/hr/pto",
    icon: Plane,
  },
  {
    title: "Terminations",
    url: "/hr/terminations",
    icon: UserX,
  },
];

const adminMenuItems = [
  {
    title: "Command Center",
    url: "/admin/command",
    icon: Activity,
  },
  {
    title: "Usage & Credits",
    url: "/admin/usage",
    icon: BarChart3,
  },
  {
    title: "Admin Support",
    url: "/admin/support",
    icon: Headphones,
  },
  {
    title: "Support Dashboard",
    url: "/support/dashboard",
    icon: MessageSquare,
  },
  {
    title: "Live Chat",
    url: "/support/chat",
    icon: MessageSquare,
  },
];

const platformAdminMenuItems = [
  {
    title: "Platform Admin",
    url: "/platform/admin",
    icon: Shield,
  },
  {
    title: "Platform Users",
    url: "/platform/users",
    icon: UserCog,
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    if (!firstName && !lastName) return "U";
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();
  };

  // Check if user is Root Admin (platform-level access)
  const isRootAdmin = (user as any)?.platformRole === 'root' || (user as any)?.platformRole === 'sysop';

  // Root Admin only sees platform-level items, not workspace operations
  const rootAdminItems = [
    {
      title: "Platform Dashboard",
      url: "/root-admin-portal",
      icon: Shield,
    },
    {
      title: "Live HelpDesk",
      url: "/live-chat",
      icon: MessageSquare,
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings,
    },
  ];

  return (
    <Sidebar className="sidebar-glass">
      <SidebarHeader className="p-6 border-b border-white/[0.08]">
        <WorkforceOSLogo size="sm" showText={true} />
      </SidebarHeader>
      
      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 mb-3 text-xs font-black uppercase tracking-wider text-muted-foreground/70">
            {isRootAdmin ? "Platform Admin" : "Navigation"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {(isRootAdmin ? rootAdminItems : menuItems).map((item) => (
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

        {/* HR Management - Only for workspace admin (NOT root admin) */}
        {!isRootAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 mb-3 text-xs font-black uppercase tracking-wider text-muted-foreground/70">
              HR Management
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {hrMenuItems.map((item) => (
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
        )}

        {/* Admin Tools - Only for workspace admin (NOT root admin) */}
        {!isRootAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 mb-3 text-xs font-black uppercase tracking-wider text-muted-foreground/70">
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {adminMenuItems.map((item) => (
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
        )}

        {/* Platform Admin - Only for workspace admins (NOT root admin) */}
        {!isRootAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 mb-3 text-xs font-black uppercase tracking-wider text-muted-foreground/70">
              Platform
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {platformAdminMenuItems.map((item) => (
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
        )}
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
          </div>
        </div>
        <Button 
          variant="outline" 
          className="w-full" 
          size="sm"
          onClick={() => window.location.href = "/api/logout"}
          data-testid="button-logout"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log Out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
