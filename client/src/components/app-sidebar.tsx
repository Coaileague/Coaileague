import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, LogOut } from "lucide-react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { performLogout, setLogoutTransitionLoader } from "@/lib/logoutHandler";
import { useTransitionLoaderIfMounted } from "@/components/canvas-hub";
import { UnifiedBrandLogo, IconLogo } from "@/components/unified-brand-logo";
import { OfficerScoreBadge } from "@/components/officer-score-badge";

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { workspaceRole, subscriptionTier, isPlatformStaff, isLoading, positionCapabilities } = useWorkspaceAccess();
  const { state } = useSidebar();
  const isMobile = useIsMobile();
  const transitionLoader = useTransitionLoaderIfMounted();

  useEffect(() => {
    if (transitionLoader) {
      setLogoutTransitionLoader(transitionLoader);
    }
  }, [transitionLoader]);
  
  if (isMobile) {
    return null;
  }

  const rawFamilies = isLoading 
    ? [] 
    : selectSidebarFamilies(workspaceRole, subscriptionTier, isPlatformStaff, positionCapabilities);
  
  const families = rawFamilies.map(family => ({
    ...family,
    routes: family.routes.filter(route => !route.mobileOnly)
  }));

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    families.forEach(family => {
      const hasActiveRoute = family.routes.some(route => location === route.href);
      initial[family.id] = hasActiveRoute || family.id === 'platform';
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
    await performLogout();
  };

  return (
    <Sidebar 
      variant="floating" 
      collapsible="offcanvas" 
      className="bg-sidebar border-r border-border"
      aria-label="Main navigation"
    >
      <SidebarHeader className="p-5 border-b border-border">
        <Link href="/dashboard" className="flex items-center" data-testid="link-dashboard-logo">
          {state === 'collapsed' ? (
            <IconLogo size="sm" />
          ) : (
            <UnifiedBrandLogo 
              size="lg" 
              variant="full" 
              responsive={false}
              showTagline={true}
              theme="dark"
            />
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4 space-y-1 overflow-y-auto">
        {families.map((family) => (
          <SidebarGroup key={family.id} className="mb-2">
            <SidebarGroupLabel asChild>
              <button
                onClick={() => toggleSection(family.id)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wider transition-colors"
                data-testid={`toggle-section-${family.id}`}
              >
                <span>{family.label}</span>
                {expandedSections[family.id] ? 
                  <ChevronDown size={12} className="text-muted-foreground/60" /> : 
                  <ChevronRight size={12} className="text-muted-foreground/60" />
                }
              </button>
            </SidebarGroupLabel>

            <SidebarGroupContent
              className="overflow-hidden transition-all duration-200"
              style={{
                maxHeight: expandedSections[family.id] ? `${(family.routes.length + family.locked.length) * 44 + 20}px` : '0px',
                opacity: expandedSections[family.id] ? 1 : 0,
              }}
            >
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
                                ? 'bg-sidebar-accent text-sidebar-accent-foreground' 
                                : 'text-sidebar-foreground/80 hover-elevate'
                            }`}
                            data-testid={`link-${route.id}`}
                          >
                            <Icon size={18} className={`shrink-0 ${
                              isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'
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

                  {family.locked.map((route) => {
                    const Icon = route.icon;
                    return (
                      <SidebarMenuItem key={route.id}>
                        <SidebarMenuButton disabled>
                          <div className="flex items-center gap-3 px-3 py-2 opacity-50 cursor-not-allowed">
                            <Icon size={18} className="text-muted-foreground/50 shrink-0" />
                            <span className="flex-1 text-sm font-medium text-muted-foreground/50 truncate">
                              {route.label}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground/50 border border-border">
                              {route.badge}
                            </span>
                          </div>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border border-border">
            <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
              {getInitials(user?.firstName, user?.lastName)}
            </AvatarFallback>
          </Avatar>
          {state !== 'collapsed' && (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-sidebar-foreground truncate">
                  {user?.firstName} {user?.lastName}
                </p>
                <OfficerScoreBadge compact />
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {user?.email}
              </p>
            </div>
          )}
        </div>
        
        <Button
          variant="ghost"
          size={state === 'collapsed' ? 'icon' : 'sm'}
          onClick={handleLogout}
          className={`w-full mt-3 text-muted-foreground ${state !== 'collapsed' ? 'justify-start' : 'justify-center'}`}
          data-testid="button-logout-footer"
          title="Sign Out"
        >
          <LogOut size={16} className="shrink-0" />
          {state !== 'collapsed' && <span>Sign Out</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
