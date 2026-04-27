/**
 * Universal Header - ONE header for ALL pages (public + workspace)
 * Auto-detects mode based on route and auth state
 * Configuration-driven for easy editing (see config/headerConfig.ts)
 * CACHE_BUST: v2026.01.24.0512
 */

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { UniversalModal, UniversalModalTrigger } from '@/components/ui/universal-modal';
;
import { Menu, LogOut, LayoutDashboard, Mail, Bug, ChevronDown, Settings, Search, Home } from "lucide-react";
import { useState, useEffect, useMemo, useId } from "react";
import { HeaderLogo } from "@/components/unified-brand-logo";
import { performLogout, setLogoutTransitionLoader } from "@/lib/logoutHandler";
import { useTransitionLoaderIfMounted } from "@/components/canvas-hub";
import { NotificationsPopover } from "@/components/notifications-popover";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { AISearchTrigger } from "@/components/ai-search";
import { TrinityMiniButton } from "@/components/trinity-button";
import { TrinityLogo } from "@/components/ui/coaileague-logo-mark";
import { useTrinityModal } from "@/components/trinity-chat-modal";
import { useChatDock } from "@/contexts/ChatDockContext";
import { useChatUnreadTotal } from "@/hooks/useChatManager";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TrinityThoughtBar } from "@/components/chatdock/TrinityThoughtBar";
import { TrinityTaskLauncher } from "@/components/trinity/TrinityTaskWidget";
import { useTrinitySession } from "@/contexts/TrinitySessionContext";

/**
 * TrinityDesktopButton - INLINED to bypass Replit webview module caching
 * Larger, more visible Trinity button for desktop headers
 * Features curved "Ask Trinity" text wrapping around the bottom of the icon
 */
function TrinityDesktopButton({
  onClick,
  className,
  'data-testid': testId = 'button-trinity-desktop',
}: {
  onClick?: () => void;
  className?: string;
  'data-testid'?: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      title="Ask Trinity AI"
      className={cn(
        'relative group flex flex-col items-center justify-center',
        'w-16 h-16 rounded-full cursor-pointer',
        'bg-gradient-to-br from-slate-900/90 via-slate-800/95 to-slate-900/90',
        'border border-cyan-500/40 hover:border-cyan-400/60',
        'shadow-sm shadow-cyan-500/20 hover:shadow-sm hover:shadow-cyan-400/30',
        'transition-all duration-300 hover:scale-105',
        'ring-1 ring-cyan-400/20 hover:ring-cyan-300/40',
        className
      )}
    >
      {/* Glow effect behind icon */}
      <div className="absolute inset-0 rounded-full bg-gradient-radial from-cyan-400/15 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      {/* Trinity mascot icon - centered and larger */}
      <div className="relative z-10 -mt-1">
        <TrinityLogo size={36} />
      </div>
      
      {/* Curved "Ask Trinity" text using SVG */}
      <svg 
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 64 64"
      >
        <defs>
          {/* Curved path for text at bottom of circle */}
          <path
            id="askTrinityArcHeader"
            d="M 8,42 Q 32,58 56,42"
            fill="none"
          />
        </defs>
        <text
          className="fill-cyan-400 group-hover:fill-cyan-300 transition-colors duration-300"
          fontSize="7"
          fontWeight="600"
          letterSpacing="0.5"
        >
          <textPath
            href="#askTrinityArcHeader"
            startOffset="50%"
            textAnchor="middle"
          >
            Ask Trinity
          </textPath>
        </text>
      </svg>
      
      {/* Subtle pulse animation ring */}
      <div className="absolute inset-0 rounded-full border border-cyan-400/30 animate-ping opacity-20 group-hover:opacity-40" style={{ animationDuration: '2s' }} />
    </button>
  );
}
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,  } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HEADER_CONFIG, HEADER_SPACING, HEADER_HEIGHTS } from "@/config/headerConfig";
import { getCurrentHoliday } from "@/config/mascotConfig";
import { selectSidebarFamilies, selectCondensedMobileFamilies } from "@/lib/sidebarModules";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
  const { activeSessionId } = useTrinitySession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isChristmas, setIsChristmas] = useState(false);
  const isMobile = useIsMobile();
  const { openModal: openTrinityModal } = useTrinityModal();
  const { toggleBubble } = useChatDock();
  const totalUnread = useChatUnreadTotal();
  const isChatRoute = location === "/chatrooms" || location.startsWith("/chatrooms/") || location === "/chat" || location.startsWith("/chat/");
  
  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);
  const [lightPhase, setLightPhase] = useState(0);
  
  const transitionLoader = useTransitionLoaderIfMounted();
  useEffect(() => {
    if (transitionLoader) {
      setLogoutTransitionLoader(transitionLoader);
    }
  }, [transitionLoader]);

  const { workspaceRole, subscriptionTier, isPlatformStaff, isLoading: workspaceLoading, positionCapabilities } = useWorkspaceAccess();
  
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
  
  // Desktop uses full navigation, Mobile uses condensed workforce-focused navigation
  const workspaceFamilies = useMemo(() => {
    if (workspaceLoading || !isWorkspaceMode) return [];
    // @ts-expect-error — TS migration: fix in refactoring sprint
    return selectSidebarFamilies(workspaceRole, subscriptionTier, isPlatformStaff, positionCapabilities);
  }, [workspaceLoading, isWorkspaceMode, workspaceRole, subscriptionTier, isPlatformStaff, positionCapabilities]);
  
  // Mobile-only: Condensed navigation for workforce employees
  // Only shows core tools: clock in/out, schedule, chat, timesheets, approvals (managers)
  const mobileWorkspaceFamilies = useMemo(() => {
    if (workspaceLoading || !isWorkspaceMode) return [];
    // @ts-expect-error — TS migration: fix in refactoring sprint
    return selectCondensedMobileFamilies(workspaceRole, subscriptionTier, isPlatformStaff);
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
    fetch('/api/mascot/seasonal/state', { credentials: 'include' })
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

  // Only show notification/messaging features in WORKSPACE mode (not on public pages)
  // This keeps public landing pages clean and uncluttered
  const showNotificationFeatures = isWorkspaceMode && !!user;
  const chatGradId = useId().replace(/:/g, '');
  
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
    <nav className="universal-header sticky top-0 z-[1030] border-b bg-background shadow-sm">
      <div className={`mx-auto ${HEADER_SPACING.containerPadding} max-w-full`}>
        <div className={`flex ${HEADER_HEIGHTS.mobile} ${HEADER_HEIGHTS.desktop} items-center justify-between gap-1 sm:gap-3`} data-testid="universal-header-row">
          {/* Logo - Unified responsive branding */}
          <button 
            onClick={handleLogoClick}
            className="relative cursor-pointer hover-elevate transition-all duration-300 shrink-0 min-w-0"
            aria-label={!isWorkspaceMode ? "Go to homepage" : "Go to dashboard"}
            data-testid="button-logo-home"
          >
            <HeaderLogo />
          </button>

          {/* NAVIGATION - Adapts based on mode (public vs workspace) */}
          {!isWorkspaceMode ? (
            <>
              {/* Desktop Navigation */}
              <div className={`hidden md:flex items-center ${HEADER_SPACING.desktopNavGap} flex-1 min-w-0`}>
                {HEADER_CONFIG.public.navItems.map((item) => (
                  <button
                    key={item.href}
                    // @ts-expect-error — TS migration: fix in refactoring sprint
                    onClick={item.isSpecial ? handleFeaturesClick : () => setLocation(item.href)}
                    className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors min-h-[44px] px-3"
                    data-testid={item.testid}
                  >
                    {item.label}
                  </button>
                ))}
                
                {/* Show Login/Register if not authenticated, Dashboard link if authenticated */}
                <div className={`ml-auto flex items-center ${HEADER_SPACING.rightSideGap} gap-1 sm:gap-2`}>
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
                    /* User is logged in but on PUBLIC page - show clean, minimal header */
                    <>
                      <Button
                        className="min-h-[44px] px-6"
                        onClick={() => setLocation("/dashboard")}
                        data-testid="button-go-dashboard"
                      >
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        Go to Dashboard
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Mobile Menu - Truly responsive with overflow menu */}
              <div className="flex md:hidden items-center gap-2 shrink-0 min-w-0">
                {/* For PUBLIC pages: Show Login button for guests, Dashboard button for logged-in users */}
                {!user ? (
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 px-2 text-xs font-semibold whitespace-nowrap"
                    onClick={() => setLocation("/login")}
                    data-testid="mobile-button-login-visible"
                  >
                    Login
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setLocation("/dashboard")}
                    data-testid="mobile-button-dashboard"
                    aria-label="Go to Dashboard"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                  </Button>
                )}
                {/* Hamburger menu contains all other actions */}
                <Button
                  variant="ghost"
                  size="icon"
                  className={HEADER_HEIGHTS.iconButton}
                  onClick={() => setMobileMenuOpen(true)}
                  data-testid="button-mobile-menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </div>
            </>
          ) : (
            // WORKSPACE NAVIGATION
            <>
              {/* Desktop workspace controls */}
              <div className="hidden md:flex items-center gap-2 lg:gap-3 shrink-0">
                <div className="hidden lg:block">
                  <TrinityDesktopButton 
                    onClick={openTrinityModal} 
                    data-testid="button-trinity-workspace"
                  />
                </div>
                <div className="block lg:hidden">
                  <TrinityMiniButton
                    onClick={openTrinityModal}
                    className={HEADER_HEIGHTS.iconButton}
                    data-testid="button-trinity-workspace-md"
                  />
                </div>
                <div className="hidden lg:block">
                  <AISearchTrigger />
                </div>
                <TrinityTaskLauncher data-testid="button-trinity-tasks-desktop" />
                <NotificationsPopover />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={HEADER_HEIGHTS.iconButton}
                      data-testid="button-user-menu-workspace"
                    >
                      <Avatar className="h-8 w-8 sm:h-9 sm:w-9">
                        <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
                        <AvatarFallback className="text-[10px] font-bold tracking-wide bg-gradient-to-br from-cyan-500 to-blue-500 text-white">
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

              {/* Mobile workspace navigation - Uses centralized HEADER_SPACING config */}
              <div className={`flex md:hidden items-center ${HEADER_SPACING.mobileIconGap} shrink-0 ml-auto pr-0.5 min-w-0`}>
                {/* Mobile quick actions: Chat + Trinity + Notifications */}
                {user && showNotificationFeatures && (
                  <>
                    {!isChatRoute && (
                      <div className="relative">
                        <button
                          className="relative inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 shadow-sm shadow-cyan-500/15 active-elevate-2"
                          onClick={() => { window.dispatchEvent(new CustomEvent('chatdock-opened')); toggleBubble(); }}
                          data-testid="button-header-chat-mobile-universal"
                          aria-label={`Messages${totalUnread > 0 ? `, ${totalUnread} unread` : ""}`}
                          title="Messages"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" fill="white" fillOpacity="0.25" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            <circle cx="9.5" cy="11.5" r="1" fill="white"/>
                            <circle cx="12.5" cy="11.5" r="1" fill="white"/>
                            <circle cx="15.5" cy="11.5" r="1" fill="white"/>
                          </svg>
                          {totalUnread > 0 && (
                            <span
                              className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full text-white flex items-center justify-center text-[8px] font-bold px-0.5 pointer-events-none"
                              style={{
                                background: "linear-gradient(135deg, #ef4444, #dc2626)",
                                boxShadow: "0 0 4px rgba(239, 68, 68, 0.4)",
                              }}
                              data-testid="badge-header-chat-unread-universal"
                            >
                              {totalUnread > 9 ? '9+' : totalUnread}
                            </span>
                          )}
                        </button>
                      </div>
                    )}
                    <TrinityMiniButton 
                      onClick={openTrinityModal}
                      className={HEADER_HEIGHTS.iconButton}
                      data-testid="button-mobile-trinity-workspace"
                    />
                    <button
                      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      onClick={() => { (window as any).openCommandPalette?.(); }}
                      data-testid="button-mobile-search"
                      aria-label="Search"
                      title="Search"
                    >
                      <Search className="h-4 w-4" />
                    </button>
                    <TrinityTaskLauncher compact data-testid="button-trinity-tasks-mobile" />
                    <NotificationsPopover />
                  </>
                )}
                {user ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={HEADER_HEIGHTS.iconButton}
                    onClick={() => setMobileMenuOpen(true)}
                    data-testid="button-workspace-mobile-menu"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
                      <AvatarFallback className="text-[9px] font-bold tracking-wide bg-gradient-to-br from-cyan-500 to-blue-500 text-white">
                        {getInitials(user?.firstName, user?.lastName)}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={HEADER_HEIGHTS.iconButton}
                    onClick={() => setMobileMenuOpen(true)}
                    data-testid="button-workspace-mobile-menu"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                )}
                  <div className="flex flex-col gap-2">
                    {mobileWorkspaceFamilies.length > 0 ? (
                      <div className="space-y-2 min-w-0">
                        {mobileWorkspaceFamilies.map((family) => (
                          <Collapsible key={family.id} defaultOpen={family.routes.some(r => location === r.href)}>
                            <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 rounded-md bg-muted/50 hover-elevate gap-2 min-w-0">
                              <span className="text-xs font-semibold truncate">{family.label}</span>
                              <ChevronDown className="h-3 w-3 shrink-0 transition-transform data-[state=open]:rotate-180" />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="pt-1 space-y-0.5">
                              {family.routes.map((route) => {
                                const isActive = location === route.href;
                                const Icon = route.icon;
                                return (
                                  <Button
                                    key={route.id}
                                    variant={isActive ? "default" : "ghost"}
                                    className="w-full justify-start gap-2 h-auto py-2 px-2 min-h-0 min-w-0"
                                    onClick={() => {
                                      setLocation(route.href);
                                      setMobileMenuOpen(false);
                                    }}
                                    data-testid={`mobile-workspace-route-${route.id}`}
                                  >
                                    <Icon className="h-4 w-4 shrink-0" />
                                    <span className="text-xs font-medium truncate flex-1 text-left">{route.label}</span>
                                    {route.badge && (
                                      <span className="px-1.5 py-0.5 text-[10px] bg-primary text-primary-foreground rounded-full shrink-0">
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
                      <div className="text-xs text-muted-foreground p-2">
                        Loading...
                      </div>
                    )}
                    
                    <div className="border-t pt-3 mt-2 space-y-1 min-w-0">
                      <Button
                        variant="outline"
                        className="w-full justify-start gap-2 text-xs h-auto py-2 px-2 min-w-0"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setLocation("/support");
                        }}
                        data-testid="mobile-workspace-help"
                      >
                        <Bug className="h-4 w-4 shrink-0" />
                        <span className="truncate">Help</span>
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start gap-2 text-xs h-auto py-2 px-2 min-w-0"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setLocation("/settings");
                        }}
                        data-testid="mobile-workspace-settings"
                      >
                        <Settings className="h-4 w-4 shrink-0" />
                        <span className="truncate">Settings</span>
                      </Button>
                      <Button
                        variant="destructive"
                        className="w-full justify-center gap-2 text-xs h-auto py-2 min-w-0"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          handleLogout();
                        }}
                        data-testid="mobile-workspace-logout"
                      >
                        <LogOut className="h-4 w-4 shrink-0" />
                        <span className="truncate">Sign Out</span>
                      </Button>
                    </div>
                  </div>
              </div>
            </>
          )}
        </div>
      </div>
      {isWorkspaceMode && user && (
        <TrinityThoughtBar
          className="border-t border-cyan-500/20"
          sessionId={activeSessionId ?? undefined}
          isProcessing={!!activeSessionId}
        />
      )}
    </nav>
  );
}
