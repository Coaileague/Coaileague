import { useState } from "react";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
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
import { selectSidebarFamilies } from "@/lib/sidebarModules";
import { useTransition } from "@/contexts/transition-context";
import { showLogoutTransition } from "@/lib/transition-utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { performLogout } from "@/lib/logoutHandler";
import { CoAIleagueLogo } from "@/components/coaileague-logo";

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { workspaceRole, subscriptionTier, isPlatformStaff, isLoading } = useWorkspaceAccess();
  const transition = useTransition();
  const { state } = useSidebar();
  const isMobile = useIsMobile();
  
  if (isMobile) {
    return null;
  }

  const families = isLoading 
    ? [] 
    : selectSidebarFamilies(workspaceRole, subscriptionTier, isPlatformStaff);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    families.forEach(family => {
      initial[family.id] = family.id === 'platform';
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
    showLogoutTransition(transition);
    await performLogout();
  };

  return (
    <Sidebar 
      variant="floating" 
      collapsible="offcanvas" 
      className="bg-slate-900 border-r border-slate-700/50"
    >
      {/* Header - Using CoAIleagueLogo Component */}
      <SidebarHeader className="p-5 border-b border-slate-700/50">
        <Link href="/dashboard" className="flex items-center" data-testid="link-dashboard-logo">
          {state === 'collapsed' ? (
            <CoAIleagueLogo 
              width={40} 
              height={40} 
              onlyIcon={true}
              className="shrink-0"
            />
          ) : (
            <CoAIleagueLogo 
              width={180} 
              height={50} 
              showTagline={true} 
              showWordmark={true}
            />
          )}
        </Link>
      </SidebarHeader>

      {/* Navigation - Clean Sections */}
      <SidebarContent className="px-3 py-4 space-y-1 overflow-y-auto">
        {families.map((family) => (
          <SidebarGroup key={family.id} className="mb-2">
            {/* Section Header */}
            <SidebarGroupLabel asChild>
              <button
                onClick={() => toggleSection(family.id)}
                className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider hover:text-slate-300 transition-colors"
                data-testid={`toggle-section-${family.id}`}
              >
                <span>{family.label}</span>
                {expandedSections[family.id] ? 
                  <ChevronDown size={12} className="text-slate-500" /> : 
                  <ChevronRight size={12} className="text-slate-500" />
                }
              </button>
            </SidebarGroupLabel>

            {/* Section Items */}
            {expandedSections[family.id] && (
              <SidebarGroupContent>
                <SidebarMenu className="mt-1 space-y-0.5">
                  {family.routes.map((route) => {
                    const Icon = route.icon;
                    const isActive = location === route.href;
                    return (
                      <SidebarMenuItem key={route.id}>
                        <SidebarMenuButton asChild isActive={isActive}>
                          <Link 
                            href={route.href}
                            className={`group flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${
                              isActive 
                                ? 'bg-slate-800 text-white' 
                                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                            }`}
                            data-testid={`link-${route.id}`}
                          >
                            <Icon size={18} className={`shrink-0 ${
                              isActive ? 'text-cyan-400' : 'text-slate-400 group-hover:text-cyan-400'
                            }`} />
                            <span className="flex-1 text-sm font-medium truncate">
                              {route.label}
                            </span>
                            {route.badge && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                route.badge === 'Root' 
                                  ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                                  : route.badge === 'Enterprise' 
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : route.badge === 'QA'
                                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                  : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
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
                      <SidebarMenuItem key={route.id}>
                        <SidebarMenuButton disabled>
                          <div className="flex items-center gap-3 px-3 py-2 opacity-50 cursor-not-allowed">
                            <Icon size={18} className="text-slate-500 shrink-0" />
                            <span className="flex-1 text-sm font-medium text-slate-500 truncate">
                              {route.label}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-700/50 text-slate-500 border border-slate-600/30">
                              {route.badge}
                            </span>
                          </div>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            )}
          </SidebarGroup>
        ))}

        {/* More Button */}
        <div className="pt-2 border-t border-slate-700/50">
          <button className="w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-lg transition-colors">
            <MoreHorizontal size={18} />
            <span className="text-sm font-medium">More</span>
          </button>
        </div>
      </SidebarContent>

      {/* Footer - User Profile */}
      <SidebarFooter className="p-4 border-t border-slate-700/50">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border-2 border-slate-600">
            <AvatarImage src={undefined} alt={user?.firstName || "User"} />
            <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-blue-500 text-white text-sm font-bold">
              {getInitials(user?.firstName, user?.lastName)}
            </AvatarFallback>
          </Avatar>
          {state !== 'collapsed' && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-slate-400 truncate">
                {user?.email}
              </p>
            </div>
          )}
        </div>
        
        <Button
          variant="ghost"
          size={state === 'collapsed' ? 'icon' : 'sm'}
          onClick={handleLogout}
          className={`w-full mt-3 text-slate-400 hover:text-white hover:bg-slate-800 ${state !== 'collapsed' ? 'justify-start' : 'justify-center'}`}
          data-testid="button-logout-footer"
          title="Sign Out"
        >
          {state === 'collapsed' ? 'X' : 'Sign Out'}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
