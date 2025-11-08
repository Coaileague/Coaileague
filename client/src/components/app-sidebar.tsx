// Reference: shadcn sidebar documentation
import { Calendar, Users, UserCircle, FileText, Settings, LayoutDashboard, LogOut, Clock, BarChart3, Activity, Headphones, CreditCard, MessageSquare, Shield, UserCog, DollarSign, Receipt, Briefcase, TrendingUp, Zap, Package, Lock, Sparkles, Brain, Target, Layers, ChevronUp, Building2, Bell, HelpCircle, Download, MessagesSquare, LockKeyhole, HeadphonesIcon, CalendarClock, Timer, Banknote, FileText as FileInvoice, GraduationCap, UsersRound, UserCheck, Rocket, Medal, LineChart, FileBarChart, Wallet, CalendarDays, BadgeDollarSign, Coins, FileCheck2, BookUser, UserSquare2, Award, PieChart, TrendingUpDown } from "lucide-react";
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
import { AnimatedAutoForceLogo } from "@/components/animated-autoforce-logo";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// FAMILY 1: Communication & Collaboration OS
const communicationFamilyItems = [
  { title: "CommOS™", url: "/comm-os", icon: MessagesSquare },
  { title: "Private Messages", url: "/messages", icon: LockKeyhole },
  { title: "SupportOS™ HelpDesk", url: "/chat", icon: Headphones },
];

// FAMILY 2: Workforce Operations OS
const operationsFamilyItems = [
  { title: "ScheduleOS™", url: "/schedule", icon: CalendarDays },
  { title: "TimeOS™", url: "/time-tracking", icon: Clock },
  { title: "PayrollOS™", url: "/payroll", icon: Wallet },
  { title: "BillOS™", url: "/invoices", icon: FileCheck2 },
  { title: "TrainingOS™", url: "/training", icon: GraduationCap },
  { title: "Employees", url: "/employees", icon: UsersRound },
  { title: "Clients", url: "/clients", icon: BookUser },
];

// FAMILY 3: Growth & Intelligence OS
const growthFamilyItems = [
  { title: "🚀 Growth Family", url: "/os-family/growth", icon: Rocket, isFamily: true },
  { title: "DealOS™ Sales", url: "/sales", icon: BadgeDollarSign },
  { title: "TalentOS™", url: "/leaders-hub", icon: Award },
  { title: "EngagementOS™", url: "/engagement/dashboard", icon: TrendingUp },
  { title: "AnalyticsOS™", url: "/analytics", icon: PieChart },
  { title: "ReportOS™", url: "/reports", icon: FileBarChart },
];

// FAMILY 4: Platform & Control OS
const platformFamilyItems = [
  { title: "⚡ Platform Family", url: "/os-family/platform", icon: Zap, isFamily: true },
  { title: "IntegrationOS™", url: "/integrations", icon: Zap },
  { title: "Admin Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Settings", url: "/settings", icon: Settings },
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
      <SidebarGroupLabel className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 flex items-center gap-2">
        {title}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="space-y-0.5">
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton 
                asChild 
                isActive={location === item.url}
                data-testid={`link-${item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                className="hover-elevate active-elevate-2 h-9 px-3 group"
              >
                <Link href={item.url} className="flex items-center gap-3 w-full">
                  <item.icon className={`h-4 w-4 shrink-0 transition-colors ${
                    location === item.url 
                      ? 'text-primary' 
                      : 'text-muted-foreground group-hover:text-primary'
                  }`} />
                  <span className={`text-sm leading-tight font-medium transition-colors ${
                    location === item.url
                      ? 'text-primary'
                      : 'text-foreground group-hover:text-primary'
                  }`}>
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
    <Sidebar variant="floating" collapsible="offcanvas" className="sidebar-glass z-50">
      <SidebarHeader className="p-4 border-b border-white/[0.08] bg-gradient-to-br from-background/80 to-muted/20">
        <Link href="/dashboard" className="flex items-center justify-center" data-testid="link-dashboard-logo">
          <AnimatedAutoForceLogo variant="icon" size="md" animated={true} />
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4 overflow-y-auto">
        {/* OS Family 1: Communication */}
        {renderMenuSection("Communication", communicationFamilyItems, true)}

        {/* OS Family 2: Operations */}
        {renderMenuSection("Operations", operationsFamilyItems, true)}

        {/* OS Family 3: Growth & AI */}
        {renderMenuSection("Growth & AI", growthFamilyItems, true)}

        {/* OS Family 4: Platform */}
        {renderMenuSection("Platform", platformFamilyItems, true)}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-white/[0.08]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-start p-3 h-auto hover-elevate active-elevate-2"
              data-testid="button-profile-menu"
            >
              <div className="flex items-center gap-3 w-full">
                <Avatar className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-red-700 dark:from-red-600 dark:to-red-800">
                  <AvatarImage src={user?.profileImageUrl || undefined} className="object-cover rounded-xl" />
                  <AvatarFallback className="text-sm font-black rounded-xl bg-gradient-to-br from-red-500 to-red-700 dark:from-red-600 dark:to-red-800 text-white dark:text-white">
                    {getInitials(user?.firstName, user?.lastName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col overflow-hidden flex-1 text-left">
                  <span className="text-sm font-bold truncate" data-testid="text-user-name">
                    {user?.firstName || user?.lastName 
                      ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim()
                      : "User"}
                  </span>
                  <span className="text-xs text-muted-foreground truncate" data-testid="text-user-email">
                    {user?.email || ""}
                  </span>
                </div>
                <ChevronUp className="h-4 w-4 ml-auto flex-shrink-0 opacity-60" />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-64">
            <DropdownMenuLabel className="font-semibold">
              {user?.firstName || user?.lastName 
                ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim()
                : "Account"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center cursor-pointer" data-testid="link-profile">
                <UserCircle className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/unavailability" className="flex items-center cursor-pointer" data-testid="link-unavailability">
                <Calendar className="mr-2 h-4 w-4" />
                <span>Unavailability</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/employees" className="flex items-center cursor-pointer" data-testid="link-employees">
                <Users className="mr-2 h-4 w-4" />
                <span>Employees</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center cursor-pointer" data-testid="link-account-settings">
                <Settings className="mr-2 h-4 w-4" />
                <span>Account</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center cursor-pointer" data-testid="link-settings">
                <Shield className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/create-org" className="flex items-center cursor-pointer" data-testid="link-create-org">
                <Building2 className="mr-2 h-4 w-4" />
                <span>Create new org</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/updates" className="flex items-center cursor-pointer" data-testid="link-updates">
                <Bell className="mr-2 h-4 w-4" />
                <span>Product updates</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/help" className="flex items-center cursor-pointer" data-testid="link-help">
                <HelpCircle className="mr-2 h-4 w-4" />
                <span>Help Center</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={handleLogout}
              className="text-red-600 dark:text-red-400 cursor-pointer"
              data-testid="button-logout"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}