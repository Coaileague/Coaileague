/**
 * Universal Workspace Tabs Navigation
 * Replaces link-based navigation with organized tab-based navigation
 * Works seamlessly on desktop and mobile with horizontal scrolling
 */

import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { selectSidebarFamilies, ROUTE_GROUPS, type RouteGroupId } from "@/lib/sidebarModules";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { UniversalModal, UniversalModalTrigger, UniversalModalContent } from '@/components/ui/universal-modal';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface RouteItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  description?: string;
  groupId?: RouteGroupId;
}

function DesktopRouteScroller({ 
  routes, 
  location, 
  setLocation 
}: { 
  routes: RouteItem[]; 
  location: string; 
  setLocation: (path: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
    }
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
      return () => {
        el.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
      };
    }
  }, [routes]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 200;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="relative flex items-center bg-muted/30 border-t">
      {canScrollLeft && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => scroll('left')}
          className="absolute left-0 z-10 h-full rounded-none bg-gradient-to-r from-background via-background to-transparent px-2"
          data-testid="button-scroll-left"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}
      
      <div 
        ref={scrollRef}
        className="flex items-center gap-2 px-4 py-2 overflow-x-auto scrollbar-hide"
        onScroll={checkScroll}
      >
        {routes.map((route) => {
          const isActive = location === route.href;
          const Icon = route.icon;
          return (
            <Button
              key={route.id}
              variant={isActive ? "default" : "ghost"}
              size="sm"
              onClick={() => setLocation(route.href)}
              className={cn(
                "gap-1.5 whitespace-nowrap shrink-0 px-3",
                isActive && "bg-primary text-primary-foreground"
              )}
              data-testid={`route-${route.id}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="text-sm">{route.label}</span>
              {route.badge && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-accent rounded-full shrink-0">
                  {route.badge}
                </span>
              )}
            </Button>
          );
        })}
      </div>

      {canScrollRight && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => scroll('right')}
          className="absolute right-0 z-10 h-full rounded-none bg-gradient-to-l from-background via-background to-transparent px-2"
          data-testid="button-scroll-right"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

/**
 * Platform Grouped Navigation - Desktop
 * Displays routes organized by category in a clean vertical stack layout
 */
function PlatformGroupedDesktop({
  routes,
  location,
  setLocation,
}: {
  routes: RouteItem[];
  location: string;
  setLocation: (path: string) => void;
}) {
  // Group routes by groupId
  const groupedRoutes = routes.reduce((acc, route) => {
    const groupId = route.groupId || 'core';
    if (!acc[groupId]) acc[groupId] = [];
    acc[groupId].push(route);
    return acc;
  }, {} as Record<RouteGroupId, RouteItem[]>);

  // Sort groups by order
  const sortedGroups = Object.entries(groupedRoutes)
    .sort(([a], [b]) => (ROUTE_GROUPS[a as RouteGroupId]?.order || 0) - (ROUTE_GROUPS[b as RouteGroupId]?.order || 0));

  return (
    <div className="bg-muted/30 border-t px-3 py-1.5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        {sortedGroups.map(([groupId, groupRoutes]) => {
          const group = ROUTE_GROUPS[groupId as RouteGroupId];
          return (
            <div key={groupId} className="flex items-center gap-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mr-1">
                {group?.label || groupId}
              </span>
              <div className="flex items-center gap-0.5">
                {groupRoutes.map((route) => {
                  const isActive = location === route.href;
                  const Icon = route.icon;
                  return (
                    <Button
                      key={route.id}
                      variant={isActive ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setLocation(route.href)}
                      className={cn(
                        "gap-1.5 h-7 px-2",
                        isActive && "bg-primary text-primary-foreground"
                      )}
                      data-testid={`route-${route.id}`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-xs">{route.label}</span>
                      {route.badge && (
                        <span className="ml-1 px-1 py-0.5 text-[10px] bg-accent/80 rounded shrink-0">
                          {route.badge}
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Platform Grouped Navigation - Mobile
 * Displays routes organized by category in collapsible accordion sections
 */
function PlatformGroupedMobile({
  routes,
  location,
  setLocation,
  onClose,
}: {
  routes: RouteItem[];
  location: string;
  setLocation: (path: string) => void;
  onClose: () => void;
}) {
  // Group routes by groupId
  const groupedRoutes = routes.reduce((acc, route) => {
    const groupId = route.groupId || 'core';
    if (!acc[groupId]) acc[groupId] = [];
    acc[groupId].push(route);
    return acc;
  }, {} as Record<RouteGroupId, RouteItem[]>);

  // Sort groups by order
  const sortedGroups = Object.entries(groupedRoutes)
    .sort(([a], [b]) => (ROUTE_GROUPS[a as RouteGroupId]?.order || 0) - (ROUTE_GROUPS[b as RouteGroupId]?.order || 0));

  // Find which group the current route belongs to
  const activeGroupId = routes.find(r => r.href === location)?.groupId || 'core';

  return (
    <div className="space-y-3 mt-4">
      {sortedGroups.map(([groupId, groupRoutes]) => {
        const group = ROUTE_GROUPS[groupId as RouteGroupId];
        const isActiveGroup = groupId === activeGroupId;
        
        return (
          <Collapsible key={groupId} defaultOpen={isActiveGroup}>
            <CollapsibleTrigger className="flex items-center justify-between gap-2 w-full px-3 py-2 rounded-md bg-muted/50 hover-elevate">
              <span className="text-sm font-semibold">{group?.label || groupId}</span>
              <ChevronDown className="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-1">
              {groupRoutes.map((route) => {
                const isActive = location === route.href;
                const Icon = route.icon;
                return (
                  <Button
                    key={route.id}
                    variant={isActive ? "default" : "ghost"}
                    className="w-full justify-start gap-3 h-auto py-3"
                    onClick={() => {
                      setLocation(route.href);
                      onClose();
                    }}
                    data-testid={`mobile-route-${route.id}`}
                  >
                    <Icon className="h-5 w-5" />
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="font-medium">{route.label}</span>
                      {route.description && (
                        <span className="text-xs text-muted-foreground">{route.description}</span>
                      )}
                    </div>
                    {route.badge && (
                      <span className="ml-auto px-2 py-1 text-xs bg-primary text-primary-foreground rounded-full">
                        {route.badge}
                      </span>
                    )}
                  </Button>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

export function WorkspaceTabsNav() {
  const [location, setLocation] = useLocation();
  const { workspaceRole, subscriptionTier, isPlatformStaff, isLoading, positionCapabilities } = useWorkspaceAccess();
  const isMobile = useIsMobile();
  const [activeFamily, setActiveFamily] = useState<string>("platform");
  const [expandedTab, setExpandedTab] = useState<boolean>(false);

  // Get sidebar families with RBAC filtering (includes position-derived capabilities)
  const rawFamilies = isLoading 
    ? [] 
    : selectSidebarFamilies(workspaceRole, subscriptionTier, isPlatformStaff, positionCapabilities);
  
  // Filter out mobileOnly routes on desktop
  const families = isMobile 
    ? rawFamilies 
    : rawFamilies.map(family => ({
        ...family,
        routes: family.routes.filter(route => !route.mobileOnly)
      }));

  // DEBUG: Log families and routes for troubleshooting
  useEffect(() => {
    if (!isLoading && families.length === 0) {
      console.warn('[TabsNav] WARNING: No families returned from selectSidebarFamilies', {
        workspaceRole,
        subscriptionTier,
        isPlatformStaff,
        currentLocation: location,
      });
    }
  }, [families, isLoading, workspaceRole, subscriptionTier, isPlatformStaff, location, activeFamily]);

  // Determine active family from current location
  useEffect(() => {
    for (const family of families) {
      const isInFamily = family.routes.some(route => location === route.href);
      if (isInFamily) {
        setActiveFamily(family.id);
        console.debug('[TabsNav] Active family updated:', family.id, 'for location:', location);
        return;
      }
    }
  }, [location, families]);

  // Loading skeleton while families load
  if (isLoading) {
    return (
      <div className="w-full border-b bg-background">
        <div className="h-12 flex items-center px-4 gap-2 overflow-x-auto">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-6 w-20 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Fallback message if no families available (RBAC issue or misconfiguration)
  if (families.length === 0) {
    return (
      <div className="w-full border-b bg-background p-3">
        <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
          ⚠️ Navigation unavailable. Role: {workspaceRole} | Tier: {subscriptionTier} | Staff: {isPlatformStaff ? 'Yes' : 'No'}. Check console for details.
        </div>
      </div>
    );
  }

  // Handle family tab change - navigate to first route in selected family
  const handleFamilyChange = (familyId: string) => {
    setActiveFamily(familyId);
    const targetFamily = families.find(f => f.id === familyId);
    if (targetFamily && targetFamily.routes.length > 0) {
      const firstRoute = targetFamily.routes[0];
      setLocation(firstRoute.href);
    }
  };

  return (
    <div className="w-full border-b bg-background">
      {/* Main Tabs - Shows family tabs */}
      <Tabs value={activeFamily} onValueChange={handleFamilyChange} className="w-full">
        <TabsList className={cn(
          "w-full rounded-none border-0 bg-background p-0",
          "h-auto flex justify-start overflow-x-auto overflow-y-hidden",
          "gap-0 scrollbar-hide"
        )}>
          {families.map((family) => (
            <TabsTrigger
              key={family.id}
              value={family.id}
              className={cn(
                "rounded-none border-b-2 px-4 py-3 font-medium transition-all",
                "data-[state=active]:border-primary data-[state=inactive]:border-transparent",
                "hover:bg-accent/50 flex items-center gap-2 whitespace-nowrap"
              )}
              data-testid={`tab-${family.id}`}
            >
              <span>{family.label}</span>
              {activeFamily === family.id && isMobile && (
                <ChevronDown className="h-4 w-4" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Sub-Routes for Each Family */}
        {families.map((family) => {
          // Use grouped layout for Platform family
          const isPlatformFamily = family.id === 'platform';
          
          return (
            <TabsContent key={`content-${family.id}`} value={family.id} className="p-0 border-0">
              {/* Desktop: Show grouped layout for Platform, scrollable row for others */}
              {!isMobile && (
                isPlatformFamily ? (
                  <PlatformGroupedDesktop 
                    routes={family.routes}
                    location={location}
                    setLocation={setLocation}
                  />
                ) : (
                  <DesktopRouteScroller 
                    routes={family.routes}
                    location={location}
                    setLocation={setLocation}
                  />
                )
              )}

              {/* Mobile: Show grouped accordion for Platform, sheet for others */}
              {isMobile && (
                <div className="px-4 py-2 border-t bg-muted/30">
                  <UniversalModal open={expandedTab} onOpenChange={setExpandedTab}>
                    <UniversalModalTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-between gap-2"
                        data-testid="button-mobile-routes"
                      >
                        <span className="text-sm font-medium">
                          {family.routes.find(r => location === r.href)?.label || "Select Feature"}
                        </span>
                        <ChevronDown className={cn(
                          "h-4 w-4 transition-transform",
                          expandedTab && "rotate-180"
                        )} />
                      </Button>
                    </UniversalModalTrigger>
                    <UniversalModalContent side="bottom" className="h-[70vh] overflow-y-auto sm:max-w-3xl" showHomeButton={false}>
                      {isPlatformFamily ? (
                        <PlatformGroupedMobile
                          routes={family.routes}
                          location={location}
                          setLocation={setLocation}
                          onClose={() => setExpandedTab(false)}
                        />
                      ) : (
                        <div className="space-y-2 mt-4">
                          {family.routes.map((route) => {
                            const isActive = location === route.href;
                            const Icon = route.icon;
                            return (
                              <Button
                                key={route.id}
                                variant={isActive ? "default" : "ghost"}
                                className="w-full justify-start gap-3 h-auto py-3"
                                onClick={() => {
                                  setLocation(route.href);
                                  setExpandedTab(false);
                                }}
                                data-testid={`mobile-route-${route.id}`}
                              >
                                <Icon className="h-5 w-5" />
                                <div className="flex flex-col items-start gap-0.5">
                                  <span className="font-medium">{route.label}</span>
                                  {route.description && (
                                    <span className="text-xs text-muted-foreground">{route.description}</span>
                                  )}
                                </div>
                                {route.badge && (
                                  <span className="ml-auto px-2 py-1 text-xs bg-primary text-primary-foreground rounded-full">
                                    {route.badge}
                                  </span>
                                )}
                              </Button>
                            );
                          })}
                        </div>
                      )}
                    </UniversalModalContent>
                  </UniversalModal>
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Custom scrollbar styling */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
