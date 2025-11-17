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
    <Sidebar variant="floating" collapsible="offcanvas" className="bg-slate-900/95 backdrop-blur-xl border-r border-slate-700/50 shadow-2xl">
      {/* Header */}
      <SidebarHeader className="p-6 border-b border-slate-700/50">
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
                  <span className="text-white">AUTO </span>
                  <span className="text-blue-400">FORCE</span>
                  <span className="text-xs text-slate-400 ml-1">™</span>
                </h1>
                <p className="text-xs text-slate-400">Workforce Management</p>
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
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
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
                            className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800/50 transition-all duration-200 hover:translate-x-1"
                            data-testid={`link-${route.id}`}
                          >
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                              isActive 
                                ? 'bg-blue-600/30' 
                                : 'bg-slate-800/50 group-hover:bg-blue-600/20'
                            }`}>
                              <Icon size={18} className={`transition-colors ${
                                isActive 
                                  ? 'text-blue-400' 
                                  : 'text-slate-400 group-hover:text-blue-400'
                              }`} />
                            </div>
                            <span className={`flex-1 text-sm font-medium transition-colors ${
                              isActive 
                                ? 'text-white' 
                                : 'text-slate-200 group-hover:text-white'
                            }`}>
                              {route.label}
                            </span>
                            {route.badge && (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                route.badge === 'Root' 
                                  ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                                  : route.badge === 'Enterprise' 
                                  ? 'bg-purple-500/20 text-blue-700 dark:text-blue-400 border border-purple-500/30'
                                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
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
                          <div className="w-9 h-9 bg-slate-800/50 rounded-lg flex items-center justify-center">
                            <Icon size={18} className="text-slate-400" />
                          </div>
                          <span className="flex-1 text-sm text-slate-200 font-medium">
                            {route.label}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
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
      <SidebarFooter className="p-4 border-t border-slate-700/50">
        <div 
          onClick={handleLogout}
          className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 hover:bg-slate-800 transition-colors cursor-pointer group"
          data-testid="button-logout"
        >
          <Avatar className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-blue-500">
            <AvatarImage src={user?.profileImageUrl || undefined} className="object-cover rounded-lg" />
            <AvatarFallback className="rounded-lg bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold">
              {getInitials(user?.firstName, user?.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate" data-testid="text-user-name">
              {user?.firstName || user?.lastName 
                ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim()
                : "User"}
            </p>
            <p className="text-xs text-slate-400 truncate" data-testid="text-user-email">
              {user?.email || ""}
            </p>
          </div>
          <ChevronRight size={16} className="text-slate-400 group-hover:text-slate-200 transition-colors" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
