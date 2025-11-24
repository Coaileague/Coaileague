/**
 * Universal Workspace Tabs Navigation
 * Replaces link-based navigation with organized tab-based navigation
 * Works seamlessly on desktop and mobile with horizontal scrolling
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { selectSidebarFamilies } from "@/lib/osModules";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function WorkspaceTabsNav() {
  const [location, setLocation] = useLocation();
  const { workspaceRole, subscriptionTier, isPlatformStaff, isLoading } = useWorkspaceAccess();
  const isMobile = useIsMobile();
  const [activeFamily, setActiveFamily] = useState<string>("platform");
  const [expandedTab, setExpandedTab] = useState<boolean>(false);

  // Get sidebar families with RBAC filtering
  const families = isLoading 
    ? [] 
    : selectSidebarFamilies(workspaceRole, subscriptionTier, isPlatformStaff);

  // Determine active family from current location
  useEffect(() => {
    for (const family of families) {
      const isInFamily = family.routes.some(route => location === route.href);
      if (isInFamily) {
        setActiveFamily(family.id);
        return;
      }
    }
  }, [location, families]);

  if (families.length === 0) return null;

  const currentFamily = families.find(f => f.id === activeFamily);
  const currentRoutes = currentFamily?.routes || [];

  return (
    <div className="w-full border-b bg-background sticky top-0 z-30">
      {/* Main Tabs - Shows family tabs */}
      <Tabs value={activeFamily} onValueChange={setActiveFamily} className="w-full">
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
        {families.map((family) => (
          <TabsContent key={`content-${family.id}`} value={family.id} className="p-0 border-0">
            {/* Desktop: Show route buttons inline */}
            {!isMobile && (
              <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto scrollbar-hide">
                {family.routes.map((route) => {
                  const isActive = location === route.href;
                  const Icon = route.icon;
                  return (
                    <Button
                      key={route.id}
                      variant={isActive ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setLocation(route.href)}
                      className={cn(
                        "gap-2 whitespace-nowrap",
                        isActive && "bg-primary text-primary-foreground"
                      )}
                      data-testid={`route-${route.id}`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-xs sm:text-sm">{route.label}</span>
                      {route.badge && (
                        <span className="ml-1 px-1.5 py-0.5 text-xs bg-accent rounded-full">
                          {route.badge}
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>
            )}

            {/* Mobile: Show route dropdown menu */}
            {isMobile && (
              <div className="px-4 py-2 border-t bg-muted/30">
                <Sheet open={expandedTab} onOpenChange={setExpandedTab}>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-between gap-2"
                      data-testid="button-mobile-routes"
                    >
                      <span className="text-sm font-medium">
                        {currentRoutes.find(r => location === r.href)?.label || "Select Feature"}
                      </span>
                      <ChevronDown className={cn(
                        "h-4 w-4 transition-transform",
                        expandedTab && "rotate-180"
                      )} />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="h-[60vh]">
                    <div className="space-y-2 mt-4">
                      {currentRoutes.map((route) => {
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
                  </SheetContent>
                </Sheet>
              </div>
            )}
          </TabsContent>
        ))}
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
