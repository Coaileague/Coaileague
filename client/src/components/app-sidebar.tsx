import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { selectSidebarFamilies } from "@/lib/osModules";
import { useTransition } from "@/contexts/transition-context";
import { showLogoutTransition } from "@/lib/transition-utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AutoForceAFLogo } from "@/components/autoforce-af-logo";

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { workspaceRole, subscriptionTier, isPlatformStaff, isLoading } = useWorkspaceAccess();
  const transition = useTransition();
  const { state } = useSidebar();

  // Get sidebar families with RBAC filtering
  const families = isLoading 
    ? [] 
    : selectSidebarFamilies(workspaceRole, subscriptionTier, isPlatformStaff);

  // Track expanded sections - Initialize platform as open, others closed
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    families.forEach(family => {
      initial[family.id] = family.id === 'platform'; // Only platform expanded by default
    });
    return initial;
  });

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

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

  return (
    <Sidebar variant="floating" collapsible="offcanvas" className="bg-sidebar border-r border-sidebar-border shadow-lg">
      {/* Header */}
      <SidebarHeader className="p-6 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-3 mb-2" data-testid="link-dashboard-logo">
          {state === 'collapsed' ? (
            <div className="w-12 h-12 flex items-center justify-center">
              <AutoForceAFLogo variant="icon" size="md" animated={false} />
            </div>
          ) : (
            <>
              <div className="w-12 h-12 shrink-0">
                <AutoForceAFLogo variant="icon" size="md" animated={false} />
              </div>
              <div>
                <h1 className="text-xl font-bold leading-tight">
                  <span className="text-sidebar-foreground">AUTO </span>
                  <span className="text-primary">FORCE</span>
                  <span className="text-xs text-sidebar-foreground/70 ml-1">™</span>
                </h1>
                <p className="text-xs text-sidebar-foreground/70">Workforce Management</p>
              </div>
            </>
          )}
        </Link>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent className="p-4 space-y-2">
        {families.map((family) => (
          <SidebarGroup key={family.id}>
            {/* Section Header */}
            <SidebarGroupLabel asChild>
              <button
                onClick={() => toggleSection(family.id)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-sidebar-foreground hover:text-sidebar-foreground transition-colors"
                data-testid={`toggle-section-${family.id}`}
              >
                <span className="tracking-wider">{family.label}</span>
                {expandedSections[family.id] ? 
                  <ChevronDown size={14} /> : 
                  <ChevronRight size={14} />
                }
              </button>
            </SidebarGroupLabel>

            {/* Section Items */}
            {expandedSections[family.id] && (
              <SidebarGroupContent>
                <SidebarMenu className="mt-1 space-y-1">
                  {family.routes.map((route) => {
                    const Icon = route.icon;
                    const isActive = location === route.href;
                    return (
                      <SidebarMenuItem key={route.id}>
                        <SidebarMenuButton asChild isActive={isActive}>
                          <Link 
                            href={route.href}
                            className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-sidebar-accent transition-all duration-200 hover:translate-x-1"
                            data-testid={`link-${route.id}`}
                          >
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                              isActive 
                                ? 'bg-primary/10' 
                                : 'bg-sidebar-accent group-hover:bg-primary/5'
                            }`}>
                              <Icon size={18} className={`transition-colors ${
                                isActive 
                                  ? 'text-primary' 
                                  : 'text-sidebar-foreground group-hover:text-primary'
                              }`} />
                            </div>
                            <span className={`flex-1 text-sm font-medium transition-colors ${
                              isActive 
                                ? 'text-sidebar-foreground' 
                                : 'text-sidebar-foreground/90 group-hover:text-sidebar-foreground'
                            }`}>
                              {route.label}
                            </span>
                            {route.badge && (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                route.badge === 'Root' 
                                  ? 'bg-destructive/20 text-destructive border border-destructive/30' 
                                  : route.badge === 'Enterprise' 
                                  ? 'bg-primary/20 text-primary border border-primary/30'
                                  : 'bg-primary/20 text-primary border border-primary/30'
                              }`}>
                                {route.badge}
                              </span>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}

                  {/* Locked routes */}
                  {family.locked.map((route) => {
                    const Icon = route.icon;
                    return (
                      <SidebarMenuItem key={`locked-${route.id}`}>
                        <div 
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg opacity-50 cursor-not-allowed"
                          data-testid={`link-locked-${route.id}`}
                        >
                          <div className="w-9 h-9 bg-sidebar-accent rounded-lg flex items-center justify-center">
                            <Icon size={18} className="text-sidebar-foreground/70" />
                          </div>
                          <span className="flex-1 text-sm text-sidebar-foreground/70 font-medium">
                            {route.label}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-muted/50 text-muted-foreground border border-border">
                            {route.badge || 'Locked'}
                          </span>
                        </div>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            )}
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* User Profile */}
      <SidebarFooter className="p-4 border-t border-border">
        <div 
          onClick={handleLogout}
          className="flex items-center gap-3 p-3 rounded-xl bg-sidebar-accent hover:bg-sidebar-accent/80 transition-colors cursor-pointer group"
          data-testid="button-logout"
        >
          <Avatar className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-blue-500">
            <AvatarImage src={user?.profileImageUrl || undefined} className="object-cover rounded-lg" />
            <AvatarFallback className="rounded-lg bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold">
              {getInitials(user?.firstName, user?.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground truncate" data-testid="text-user-name">
              {user?.firstName || user?.lastName 
                ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim()
                : "User"}
            </p>
            <p className="text-xs text-sidebar-foreground/70 truncate" data-testid="text-user-email">
              {user?.email || ""}
            </p>
          </div>
          <ChevronRight size={16} className="text-sidebar-foreground group-hover:text-sidebar-foreground transition-colors" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
