// Reference: shadcn sidebar documentation
import { Calendar, Users, UserCircle, Settings, LogOut, Lock, ChevronUp, Building2, Bell, HelpCircle, Shield } from "lucide-react";
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
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { selectSidebarFamilies } from "@/lib/osModules";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";


export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { workspaceRole, subscriptionTier, isPlatformStaff, isLoading } = useWorkspaceAccess();
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

  // Get sidebar families with RBAC filtering
  const families = isLoading 
    ? [] 
    : selectSidebarFamilies(workspaceRole, subscriptionTier, isPlatformStaff);

  return (
    <Sidebar variant="floating" collapsible="offcanvas" className="sidebar-glass z-50">
      <SidebarHeader className="p-4 border-b border-white/[0.08] bg-gradient-to-br from-background/80 to-muted/20">
        <Link href="/dashboard" className="flex items-center justify-center" data-testid="link-dashboard-logo">
          <AnimatedAutoForceLogo variant="icon" size="md" animated={true} />
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4 overflow-y-auto">
        {families.map((family) => (
          <SidebarGroup key={family.id}>
            <SidebarGroupLabel className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 flex items-center gap-2">
              {family.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {/* Accessible routes */}
                {family.routes.map((route) => (
                  <SidebarMenuItem key={route.id}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={location === route.href}
                      data-testid={`link-${route.id}`}
                      className="hover-elevate active-elevate-2 h-9 px-3 group"
                    >
                      <Link href={route.href} className="flex items-center gap-3 w-full">
                        <route.icon className={`h-4 w-4 shrink-0 transition-colors ${
                          location === route.href 
                            ? 'text-primary' 
                            : 'text-muted-foreground group-hover:text-primary'
                        }`} />
                        <span className={`text-sm leading-tight font-medium transition-colors ${
                          location === route.href
                            ? 'text-primary'
                            : 'text-foreground group-hover:text-primary'
                        }`}>
                          {route.label}
                        </span>
                        {route.badge && (
                          <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                            {route.badge}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                
                {/* Locked routes (tier upgrade prompts) */}
                {family.locked.map((route) => (
                  <SidebarMenuItem key={`locked-${route.id}`}>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton 
                            disabled
                            data-testid={`link-locked-${route.id}`}
                            className="h-9 px-3 group opacity-50 cursor-not-allowed"
                          >
                            <div className="flex items-center gap-3 w-full">
                              <route.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="text-sm leading-tight font-medium text-muted-foreground">
                                {route.label}
                              </span>
                              <div className="ml-auto flex items-center gap-1">
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-600 dark:text-amber-400">
                                  {route.badge}
                                </Badge>
                                <Lock className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                              </div>
                            </div>
                          </SidebarMenuButton>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <p className="font-medium">{route.label}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {route.description}
                          </p>
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                            Requires {route.badge} tier or higher
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
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