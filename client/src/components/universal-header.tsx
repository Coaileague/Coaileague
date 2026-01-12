/**
 * Universal Header - ONE header for ALL pages (public + workspace)
 * Auto-detects mode based on route and auth state
 * Configuration-driven for easy editing (see config/headerConfig.ts)
 */

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Menu, LogOut, LayoutDashboard, Mail, Bug, ChevronDown, Settings } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { HeaderLogo } from "@/components/unified-brand-logo";
import { performLogout } from "@/lib/logoutHandler";
import { NotificationsPopover } from "@/components/notifications-popover";
import { AISearchTrigger } from "@/components/ai-search";
import { TrinityMiniButton } from "@/components/trinity-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { HEADER_CONFIG, HEADER_SPACING, HEADER_HEIGHTS } from "@/config/headerConfig";
import { getCurrentHoliday } from "@/config/mascotConfig";
import { selectSidebarFamilies } from "@/lib/sidebarModules";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const PUBLIC_ROUTES = new Set([
  "/", "/homepage", "/login", "/register", "/forgot-password", "/reset-password",
  "/pricing", "/trinity-features", "/contact", "/support", "/terms", "/privacy",
  "/error-403", "/error-404", "/error-500"
]);

interface UniversalHeaderProps {
  variant?: "public" | "workspace" | "auto";
}

export function UniversalHeader({ variant = "auto" }: UniversalHeaderProps) {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isChristmas, setIsChristmas] = useState(false);
  
  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);
  const [lightPhase, setLightPhase] = useState(0);
  
  const { workspaceRole, subscriptionTier, isPlatformStaff, isLoading: workspaceLoading } = useWorkspaceAccess();
  
  const resolvedMode = useMemo(() => {
    if (variant !== "auto") return variant;
    const isPublicRoute = PUBLIC_ROUTES.has(location) || 
                          location.startsWith("/onboarding/") ||
                          location.startsWith("/pay-invoice/");
    if (!user) return "public";
    if (isPublicRoute) return "public";
    return "workspace";
  }, [variant, location, user]);
  
  const isWorkspaceMode = resolvedMode === "workspace";
  
  const workspaceFamilies = useMemo(() => {
    if (workspaceLoading || !isWorkspaceMode) return [];
    return selectSidebarFamilies(workspaceRole, subscriptionTier, isPlatformStaff);
  }, [workspaceLoading, isWorkspaceMode, workspaceRole, subscriptionTier, isPlatformStaff]);

  // Detect Christmas season only if seasonal theming is not disabled
  useEffect(() => {
    // Check if seasonal theming is disabled via environment variable
    const disableSeasonal = import.meta.env.VITE_DISABLE_SEASONAL_THEMING === 'true';
    if (disableSeasonal) {
      setIsChristmas(false);
      return;
    }
    // Also check via API to respect runtime settings
    fetch('/api/mascot/seasonal/state')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.isDisabled || data?.forceDeactivated) {
          setIsChristmas(false);
        } else {
          const holiday = getCurrentHoliday();
          setIsChristmas(holiday?.key === 'christmas');
        }
      })
      .catch(() => {
        // On error, fall back to date check
        const holiday = getCurrentHoliday();
        setIsChristmas(holiday?.key === 'christmas');
      });
  }, []);

  // Animate Christmas light colors on mobile word logo
  useEffect(() => {
    if (!isChristmas) return;
    const interval = setInterval(() => {
      setLightPhase(prev => (prev + 1) % 6);
    }, 600); // Fast twinkling for mobile lights
    return () => clearInterval(interval);
  }, [isChristmas]);

  // Christmas light colors for each letter position
  const mobileChristmasColors = useMemo(() => {
    const colors = ['#dc2626', '#16a34a', '#eab308', '#3b82f6', '#a855f7', '#f97316'];
    // Rotate colors based on phase for twinkling effect
    return colors.map((_, i) => colors[(i + lightPhase) % colors.length]);
  }, [lightPhase]);

  // Only show notification bell for authenticated users
  // UNS notifications require login to function properly
  const showNotificationFeatures = !!user;
  
  // Safe scroll function for SPA navigation
  const scrollToFeatures = () => {
    const featuresEl = document.getElementById('features');
    if (featuresEl) {
      featuresEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  
  const handleFeaturesClick = () => {
    setMobileMenuOpen(false);
    if (location === "/") {
      scrollToFeatures();
    } else {
      setLocation("/");
      setTimeout(scrollToFeatures, 200);
    }
  };

  const handleLogout = async () => {
    await performLogout();
  };

  // Handle logo click - PUBLIC mode always goes to homepage
  const handleLogoClick = () => {
    if (!isWorkspaceMode) {
      setLocation("/");
    } else {
      setLocation("/dashboard");
    }
  };

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    if (!firstName && !lastName) return "U";
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();
  };
  
  return (
    <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-3 sm:px-6">
        <div className={`flex ${HEADER_HEIGHTS.mobile} ${HEADER_HEIGHTS.desktop} items-center justify-between gap-2`}>
          {/* Logo - Unified responsive branding */}
          <button 
            onClick={handleLogoClick}
            className="relative cursor-pointer hover-elevate transition-all duration-300 shrink-0"
            aria-label={!isWorkspaceMode ? "Go to homepage" : "Go to dashboard"}
            data-testid="button-logo-home"
          >
            <HeaderLogo />
          </button>

          {/* NAVIGATION - Adapts based on mode (public vs workspace) */}
          {!isWorkspaceMode ? (
            <>
              {/* Desktop Navigation */}
              <div className={`hidden md:flex items-center ${HEADER_SPACING.desktopNavGap} flex-1`}>
                {HEADER_CONFIG.public.navItems.map((item) => (
                  <button
                    key={item.href}
                    onClick={item.isSpecial ? handleFeaturesClick : () => setLocation(item.href)}
                    className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors min-h-[44px] px-3"
                    data-testid={item.testid}
                  >
                    {item.label}
                  </button>
                ))}
                
                {/* Show Login/Register if not authenticated, Dashboard link if authenticated */}
                <div className={`ml-auto flex items-center ${HEADER_SPACING.rightSideGap}`}>
                  {!user ? (
                    <>
                      {/* Bug report for guests */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setLocation("/support")}
                            data-testid="button-bug-report-guest"
                            aria-label="Report an issue"
                            title="Get Help & Report Issues"
                            className="h-10 w-10"
                          >
                            <Bug className="h-6 w-6" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Get Help & Report Issues</TooltipContent>
                      </Tooltip>
                      <Button
                        variant="ghost"
                        className="min-h-[44px] px-4"
                        onClick={() => setLocation("/login")}
                        data-testid="button-login"
                      >
                        Login
                      </Button>
                      <Button
                        className="min-h-[44px] px-6"
                        onClick={() => setLocation("/register")}
                        data-testid="button-get-started"
                      >
                        Start Free Trial
                      </Button>
                    </>
                  ) : (
                    <>
                      {showNotificationFeatures && (
                        <div className={`flex items-center ${HEADER_SPACING.mobileIconGap}`}>
                          <TrinityMiniButton 
                            onClick={() => setLocation("/trinity")} 
                            data-testid="button-trinity-header"
                          />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setLocation("/support")}
                                data-testid="button-bug-report"
                                aria-label="Report an issue"
                                title="Get Help & Report Issues"
                                className="h-10 w-10"
                              >
                                <Bug className="h-6 w-6" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Get Help & Report Issues</TooltipContent>
                          </Tooltip>
                          <AISearchTrigger />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setLocation("/inbox")}
                                data-testid="button-inbox"
                                aria-label="Inbox"
                                title="Messages & Inbox"
                                className="h-10 w-10"
                              >
                                <Mail className="h-6 w-6" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Messages & Inbox</TooltipContent>
                          </Tooltip>
                          <NotificationsPopover />
                        </div>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={HEADER_HEIGHTS.iconButton}
                            data-testid="button-user-menu"
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs font-bold">
                                {getInitials(user?.firstName, user?.lastName)}
                              </AvatarFallback>
                            </Avatar>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            onClick={() => setLocation("/dashboard")}
                            data-testid="menu-go-dashboard"
                          >
                            <LayoutDashboard className="mr-2 h-4 w-4" />
                            <span>Go to Dashboard</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={handleLogout}
                            data-testid="menu-logout"
                            className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950"
                          >
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>Sign Out</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                </div>
              </div>

              {/* Mobile Menu - Compact for small screens */}
              <div className={`flex md:hidden items-center gap-0.5 sm:gap-1 shrink-0`}>
                {showNotificationFeatures && (
                  <div className="flex items-center gap-0.5 sm:gap-1">
                    <TrinityMiniButton 
                      onClick={() => setLocation("/trinity")} 
                      data-testid="mobile-button-trinity"
                    />
                    <AISearchTrigger />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setLocation("/inbox")}
                      data-testid="mobile-button-inbox"
                      aria-label="Inbox"
                      title="Inbox"
                      className="h-9 w-9 sm:h-10 sm:w-10"
                    >
                      <Mail className="h-5 w-5 sm:h-6 sm:w-6" />
                    </Button>
                    <NotificationsPopover />
                  </div>
                )}
                {/* Visible Login button for unauthenticated mobile users */}
                {!user && (
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 px-2 sm:px-3 text-xs font-semibold"
                    onClick={() => setLocation("/login")}
                    data-testid="mobile-button-login-visible"
                  >
                    Login
                  </Button>
                )}
                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={HEADER_HEIGHTS.iconButton}
                      data-testid="button-mobile-menu"
                    >
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[280px] sm:w-[320px]">
                    <SheetHeader>
                      <SheetTitle>Menu</SheetTitle>
                      <SheetDescription>Navigate the CoAIleague platform</SheetDescription>
                    </SheetHeader>
                    <nav className="flex flex-col gap-4 mt-4">
                      {HEADER_CONFIG.public.navItems.map((item) => (
                        <Button
                          key={item.href}
                          variant="ghost"
                          className="justify-start text-base"
                          onClick={() => {
                            setMobileMenuOpen(false);
                            item.isSpecial ? handleFeaturesClick() : setLocation(item.href);
                          }}
                          data-testid={`mobile-${item.testid}`}
                        >
                          {item.label}
                        </Button>
                      ))}
                      <div className="border-t my-2" />
                      
                      <Button
                        variant="ghost"
                        className="justify-start text-base"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setLocation("/support");
                        }}
                        data-testid="mobile-button-support"
                      >
                        <Bug className="mr-2 h-4 w-4" />
                        Get Help
                      </Button>
                      
                      <div className="border-t my-2" />
                      
                      {!user ? (
                        <>
                          <Button
                            variant="outline"
                            className="justify-center"
                            onClick={() => {
                              setMobileMenuOpen(false);
                              setLocation("/login");
                            }}
                            data-testid="mobile-button-login"
                          >
                            Login
                          </Button>
                          <Button
                            className="justify-center"
                            onClick={() => {
                              setMobileMenuOpen(false);
                              setLocation("/register");
                            }}
                            data-testid="mobile-button-register"
                          >
                            Start Free Trial
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            className="justify-center w-full"
                            onClick={() => {
                              setMobileMenuOpen(false);
                              setLocation("/dashboard");
                            }}
                            data-testid="mobile-button-dashboard"
                          >
                            <LayoutDashboard className="mr-2 h-4 w-4" />
                            Go to Dashboard
                          </Button>
                          <Button
                            variant="destructive"
                            className="justify-center w-full"
                            onClick={() => {
                              setMobileMenuOpen(false);
                              handleLogout();
                            }}
                            data-testid="mobile-button-logout"
                          >
                            <LogOut className="mr-2 h-4 w-4" />
                            Sign Out
                          </Button>
                        </>
                      )}
                    </nav>
                  </SheetContent>
                </Sheet>
              </div>
            </>
          ) : (
            // WORKSPACE NAVIGATION
            <>
              {/* Desktop workspace controls */}
              <div className="hidden md:flex items-center gap-3">
                <TrinityMiniButton 
                  onClick={() => setLocation("/trinity")} 
                  data-testid="button-trinity-workspace"
                />
                <AISearchTrigger />
                <NotificationsPopover />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={HEADER_HEIGHTS.iconButton}
                      data-testid="button-user-menu-workspace"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs font-bold">
                          {getInitials(user?.firstName, user?.lastName)}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      onClick={() => setLocation("/settings")}
                      data-testid="menu-settings"
                    >
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleLogout}
                      data-testid="menu-logout-workspace"
                      className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Sign Out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Mobile workspace navigation - Compact for small screens */}
              <div className="flex md:hidden items-center gap-0.5 sm:gap-1">
                <TrinityMiniButton 
                  onClick={() => setLocation("/trinity")} 
                  data-testid="mobile-button-trinity-workspace"
                />
                <NotificationsPopover />
                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={HEADER_HEIGHTS.iconButton}
                      data-testid="button-workspace-mobile-menu"
                    >
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[300px] sm:w-[340px] overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>Workspace Navigation</SheetTitle>
                      <SheetDescription>Navigate to different areas of your workspace</SheetDescription>
                    </SheetHeader>
                    <div className="flex flex-col gap-4 mt-4">
                      
                      {workspaceFamilies.length > 0 ? (
                        <div className="space-y-3">
                          {workspaceFamilies.map((family) => (
                            <Collapsible key={family.id} defaultOpen={family.routes.some(r => location === r.href)}>
                              <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 rounded-md bg-muted/50 hover-elevate">
                                <span className="text-sm font-semibold">{family.label}</span>
                                <ChevronDown className="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
                              </CollapsibleTrigger>
                              <CollapsibleContent className="pt-2 space-y-1">
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
                                        setMobileMenuOpen(false);
                                      }}
                                      data-testid={`mobile-workspace-route-${route.id}`}
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
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground p-3">
                          Loading navigation...
                        </div>
                      )}
                      
                      <div className="border-t pt-4 mt-2 space-y-2">
                        <Button
                          variant="outline"
                          className="w-full justify-start gap-3"
                          onClick={() => {
                            setMobileMenuOpen(false);
                            setLocation("/support");
                          }}
                          data-testid="mobile-workspace-help"
                        >
                          <Bug className="h-4 w-4" />
                          Get Help
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full justify-start gap-3"
                          onClick={() => {
                            setMobileMenuOpen(false);
                            setLocation("/settings");
                          }}
                          data-testid="mobile-workspace-settings"
                        >
                          <Settings className="h-4 w-4" />
                          Settings
                        </Button>
                        <Button
                          variant="destructive"
                          className="w-full justify-center gap-2"
                          onClick={() => {
                            setMobileMenuOpen(false);
                            handleLogout();
                          }}
                          data-testid="mobile-workspace-logout"
                        >
                          <LogOut className="h-4 w-4" />
                          Sign Out
                        </Button>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
