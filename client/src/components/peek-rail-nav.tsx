import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "wouter";
import {
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Bell,
  Settings,
  LogOut,
  UserCircle,
  Calendar,
  Users,
  Building2,
  HelpCircle,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { selectSidebarFamilies } from "@/lib/osModules";
import { showLogoutTransition } from "@/lib/transition-utils";
import { useTransition } from "@/contexts/transition-context";
import { queryClient } from "@/lib/queryClient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AnimatedAutoForceLogo } from "@/components/animated-autoforce-logo";
import { cn } from "@/lib/utils";

const RAIL_WIDTH_COLLAPSED = 56; // 56px collapsed
const RAIL_WIDTH_EXPANDED = 240; // 240px expanded

interface PeekRailNavProps {
  defaultPinned?: boolean;
}


export function PeekRailNav({ defaultPinned = false }: PeekRailNavProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { workspaceRole, subscriptionTier, isPlatformStaff, isLoading } = useWorkspaceAccess();
  const transition = useTransition();
  
  // State management - lazy load pin preference from localStorage
  const [isPinned, setIsPinned] = useState(() => {
    const saved = localStorage.getItem("peek-rail-pinned");
    return saved !== null ? saved === "true" : defaultPinned;
  });
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = localStorage.getItem("peek-rail-pinned");
    const initialPinned = saved !== null ? saved === "true" : defaultPinned;
    return initialPinned && window.innerWidth >= 768; // Don't auto-expand on mobile
  });
  const [isMobile, setIsMobile] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  
  // Refs for debouncing hover interactions
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Save pinned state to localStorage
  useEffect(() => {
    localStorage.setItem("peek-rail-pinned", String(isPinned));
  }, [isPinned]);

  const handleTogglePin = () => {
    const newPinned = !isPinned;
    setIsPinned(newPinned);
    if (!isMobile) {
      setIsExpanded(newPinned);
    }
  };

  // Debounce hover interactions to prevent glitching
  const handleMouseEnter = () => {
    if (!isMobile && !isPinned) {
      // Clear any pending collapse
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      // Small delay to prevent accidental triggers
      hoverTimeoutRef.current = setTimeout(() => {
        if (!isPinned && !isMobile) {
          setIsExpanded(true);
        }
        hoverTimeoutRef.current = null;
      }, 100);
    }
  };

  const handleMouseLeave = () => {
    if (!isMobile && !isPinned) {
      // Clear any pending expand
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      // Delay collapse to allow moving to expanded content
      hoverTimeoutRef.current = setTimeout(() => {
        if (!isPinned && !isMobile) {
          setIsExpanded(false);
        }
        hoverTimeoutRef.current = null;
      }, 200);
    }
  };
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const handleMobileToggle = () => {
    if (isMobile) {
      setIsExpanded(!isExpanded);
    }
  };

  // Keyboard navigation support
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && isExpanded && isMobile) {
      setIsExpanded(false);
    }
    if ((e.key === "Enter" || e.key === " ") && !isMobile && !isExpanded) {
      e.preventDefault();
      setIsExpanded(true);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      // Invalidate auth query to clear user state
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    } catch (error) {
      console.error("Logout error:", error);
    }
    showLogoutTransition(transition);
  };

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    if (!firstName && !lastName) return "U";
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();
  };

  // Get sidebar families with RBAC filtering
  const families = isLoading
    ? []
    : selectSidebarFamilies(workspaceRole, subscriptionTier, isPlatformStaff);

  const railWidth = isExpanded ? RAIL_WIDTH_EXPANDED : RAIL_WIDTH_COLLAPSED;

  return (
    <>
      {/* Mobile overlay backdrop */}
      <AnimatePresence>
        {isMobile && isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setIsExpanded(false)}
            data-testid="peek-rail-backdrop"
          />
        )}
      </AnimatePresence>

      {/* Peek Rail Navigation */}
      <motion.nav
        initial={false}
        animate={{
          width: railWidth,
          x: isMobile && !isExpanded ? -railWidth : 0,
        }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 30,
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        className={cn(
          "fixed left-0 top-0 h-screen z-50 flex flex-col",
          "bg-white",
          "border-r border-gray-200 backdrop-blur-xl",
          "shadow-xl",
          "hidden md:flex", // Hide on mobile (<768px), show on desktop
          isMobile && "md:relative"
        )}
        style={{
          width: railWidth,
        }}
        role="navigation"
        aria-label="Main navigation"
        aria-expanded={isExpanded}
        data-testid="peek-rail-nav"
      >
        {/* Header with Logo and Pin Button */}
        <div className="h-14 border-b border-gray-200 flex items-center justify-between px-3 flex-shrink-0">
          <Link href="/dashboard" className="flex items-center min-w-0 flex-1" data-testid="link-dashboard-logo">
            {isExpanded ? (
              <div className="flex items-center gap-2 min-w-0">
                <div className="shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent shadow-lg w-10 h-10">
                  <span className="text-white font-black text-sm">AF</span>
                </div>
                <div className="flex flex-col min-w-0 overflow-hidden">
                  <div className="text-base font-bold tracking-tight leading-tight flex items-baseline gap-1 whitespace-nowrap">
                    <span className="text-gray-900">AUTO</span>
                    <span className="text-primary">FORCE</span>
                    <span className="text-[10px] align-super">™</span>
                  </div>
                  <div className="text-[9px] text-gray-600 font-medium tracking-wide truncate">
                    Workforce Management
                  </div>
                </div>
              </div>
            ) : (
              <AnimatedAutoForceLogo
                variant="icon"
                size="md"
                animated={true}
              />
            )}
          </Link>
          
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleTogglePin}
                  className="h-8 w-8"
                  data-testid="button-toggle-pin"
                  aria-label={isPinned ? "Unpin navigation" : "Pin navigation"}
                  aria-pressed={isPinned}
                >
                  {isPinned ? (
                    <ChevronLeft className="h-4 w-4 text-primary" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-primary" />
                  )}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Scrollable Navigation Content */}
        <div 
          className="flex-1 overflow-y-auto overflow-x-hidden mobile-scroll px-2 py-4"
          role="menu"
          aria-label="Navigation menu"
        >
          <TooltipProvider>
            {families.map((family) => (
              <div key={family.id} className="mb-6">
                {/* Family Label */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.2 }}
                      className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-blue-400/60"
                    >
                      {family.label}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Accessible Routes - Progressive Disclosure */}
                <div className="space-y-1">
                  {/* Primary Routes - Always Visible */}
                  {family.routes.filter(route => route.isPrimary !== false).map((route) => {
                    const isActive = location === route.href;
                    
                    const routeButton = (
                      <Link href={route.href} key={route.id}>
                        <Button
                          variant={isActive ? "secondary" : "ghost"}
                          className={cn(
                            "w-full justify-start h-10 px-3",
                            "hover-elevate active-elevate-2",
                            !isExpanded && "px-2",
                            isActive && "bg-secondary/80"
                          )}
                          data-testid={`link-${route.id}`}
                          aria-current={isActive ? "page" : undefined}
                        >
                          <route.icon
                            className={cn(
                              "h-5 w-5 flex-shrink-0",
                              isActive ? "text-primary" : "text-blue-400"
                            )}
                          />
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, width: 0 }}
                                animate={{ opacity: 1, width: "auto" }}
                                exit={{ opacity: 0, width: 0 }}
                                transition={{ duration: 0.2 }}
                                className="ml-3 flex items-center gap-2 overflow-hidden"
                              >
                                <span
                                  className={cn(
                                    "text-sm font-medium truncate",
                                    isActive ? "text-foreground" : "text-foreground"
                                  )}
                                >
                                  {route.label}
                                </span>
                                {route.badge && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] px-1.5 py-0 ml-auto flex-shrink-0"
                                  >
                                    {route.badge}
                                  </Badge>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </Button>
                      </Link>
                    );

                    if (!isExpanded) {
                      return (
                        <Tooltip key={route.id}>
                          <TooltipTrigger asChild>{routeButton}</TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p className="font-medium">{route.label}</p>
                            {route.description && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {route.description}
                              </p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      );
                    }

                    return routeButton;
                  })}

                  {/* Secondary Routes - Collapsible "More" Section */}
                  {isExpanded && family.routes.filter(route => route.isPrimary === false).length > 0 && (
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="more" className="border-none">
                        <AccordionTrigger className="py-2 px-3 text-xs text-blue-300 hover:no-underline hover-elevate rounded-md" data-testid={`button-more-${family.id}`}>
                          <div className="flex items-center gap-2">
                            <ChevronDown className="h-3 w-3 text-blue-400" />
                            <span>More</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-0">
                          <div className="space-y-1 mt-1">
                            {family.routes.filter(route => route.isPrimary === false).map((route) => {
                              const isActive = location === route.href;
                              
                              return (
                                <Link href={route.href} key={route.id}>
                                  <Button
                                    variant={isActive ? "secondary" : "ghost"}
                                    className={cn(
                                      "w-full justify-start h-10 px-3 text-xs",
                                      "hover-elevate active-elevate-2",
                                      isActive && "bg-secondary/80"
                                    )}
                                    data-testid={`link-${route.id}`}
                                    aria-current={isActive ? "page" : undefined}
                                  >
                                    <route.icon className={cn("h-4 w-4 flex-shrink-0", isActive ? "text-primary" : "text-blue-400")} />
                                    <span className={cn("ml-3 truncate", isActive ? "text-foreground" : "text-foreground")}>{route.label}</span>
                                    {route.badge && (
                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto flex-shrink-0">
                                        {route.badge}
                                      </Badge>
                                    )}
                                  </Button>
                                </Link>
                              );
                            })}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}

                  {/* Locked Routes */}
                  {family.locked.map((route) => {
                    const lockedButton = (
                      <Button
                        key={`locked-${route.id}`}
                        variant="ghost"
                        disabled
                        className={cn(
                          "w-full justify-start h-10 px-3 opacity-50 cursor-not-allowed",
                          !isExpanded && "px-2"
                        )}
                        data-testid={`link-locked-${route.id}`}
                      >
                        <route.icon className="h-5 w-5 flex-shrink-0 text-blue-300/50" />
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, width: 0 }}
                              animate={{ opacity: 1, width: "auto" }}
                              exit={{ opacity: 0, width: 0 }}
                              transition={{ duration: 0.2 }}
                              className="ml-3 flex items-center gap-2 overflow-hidden"
                            >
                              <span className="text-sm font-medium text-muted-foreground truncate">
                                {route.label}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 border-blue-500/50 text-blue-600 dark:text-blue-400 ml-auto flex-shrink-0"
                              >
                                {route.badge}
                              </Badge>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </Button>
                    );

                    if (!isExpanded) {
                      return (
                        <Tooltip key={`locked-${route.id}`}>
                          <TooltipTrigger asChild>{lockedButton}</TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p className="font-medium">{route.label}</p>
                            {route.description && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {route.description}
                              </p>
                            )}
                            <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                              Requires {route.badge} tier or higher
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    }

                    return lockedButton;
                  })}
                </div>
              </div>
            ))}
          </TooltipProvider>
        </div>

        {/* Footer with User Profile */}
        <div className="border-t border-sidebar-border p-3 flex-shrink-0">
          {isExpanded ? (
            <DropdownMenu open={showUserMenu} onOpenChange={setShowUserMenu}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start p-2 h-auto hover-elevate active-elevate-2"
                  data-testid="button-profile-menu"
                >
                  <div className="flex items-center gap-3 w-full min-w-0">
                    <Avatar className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-accent flex-shrink-0">
                      <AvatarImage
                        src={user?.profileImageUrl || undefined}
                        className="object-cover rounded-xl"
                      />
                      <AvatarFallback className="text-sm font-black rounded-xl bg-gradient-to-br from-primary to-accent text-white">
                        {getInitials(user?.firstName, user?.lastName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col overflow-hidden flex-1 text-left min-w-0">
                      <span className="text-sm font-bold truncate" data-testid="text-user-name">
                        {user?.firstName || user?.lastName
                          ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim()
                          : "User"}
                      </span>
                      <span
                        className="text-xs text-muted-foreground truncate"
                        data-testid="text-user-email"
                      >
                        {user?.email || ""}
                      </span>
                    </div>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                side="right" 
                align="end" 
                className="w-64 ml-2"
                sideOffset={8}
              >
                <DropdownMenuLabel className="font-semibold">
                  {user?.firstName || user?.lastName
                    ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim()
                    : "Account"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="flex items-center cursor-pointer" data-testid="link-profile">
                    <UserCircle className="mr-2 h-4 w-4 text-blue-400" />
                    <span>Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href="/unavailability"
                    className="flex items-center cursor-pointer"
                    data-testid="link-unavailability"
                  >
                    <Calendar className="mr-2 h-4 w-4 text-blue-400" />
                    <span>Unavailability</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/employees" className="flex items-center cursor-pointer" data-testid="link-employees">
                    <Users className="mr-2 h-4 w-4 text-blue-400" />
                    <span>Employees</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href="/settings"
                    className="flex items-center cursor-pointer"
                    data-testid="link-account-settings"
                  >
                    <Settings className="mr-2 h-4 w-4 text-blue-400" />
                    <span>Account</span>
                  </Link>
                </DropdownMenuItem>
                {isPlatformStaff && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link
                        href="/dashboard"
                        className="flex items-center cursor-pointer"
                        data-testid="link-platform-admin"
                      >
                        <Shield className="mr-2 h-4 w-4 text-blue-400" />
                        <span>Platform Admin</span>
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/create-org" className="flex items-center cursor-pointer" data-testid="link-create-org">
                    <Building2 className="mr-2 h-4 w-4 text-blue-400" />
                    <span>Create new org</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/updates" className="flex items-center cursor-pointer" data-testid="link-updates">
                    <Bell className="mr-2 h-4 w-4 text-blue-400" />
                    <span>Product updates</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/help" className="flex items-center cursor-pointer" data-testid="link-help">
                    <HelpCircle className="mr-2 h-4 w-4 text-blue-400" />
                    <span>Help Center</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-red-600 dark:text-red-400 cursor-pointer"
                  data-testid="button-logout"
                >
                  <LogOut className="mr-2 h-4 w-4 text-red-500" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleMobileToggle}
                    className="w-full h-10 hover-elevate active-elevate-2"
                    data-testid="button-avatar-collapsed"
                  >
                    <Avatar className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-accent">
                      <AvatarImage
                        src={user?.profileImageUrl || undefined}
                        className="object-cover rounded-xl"
                      />
                      <AvatarFallback className="text-xs font-black rounded-xl bg-gradient-to-br from-primary to-accent text-white">
                        {getInitials(user?.firstName, user?.lastName)}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="font-medium">
                    {user?.firstName || user?.lastName
                      ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim()
                      : "User"}
                  </p>
                  <p className="text-xs text-gray-600">{user?.email}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </motion.nav>

      {/* Content offset for pinned rail on desktop */}
      {isPinned && !isMobile && (
        <div
          style={{ width: RAIL_WIDTH_EXPANDED }}
          className="flex-shrink-0"
          aria-hidden="true"
        />
      )}
    </>
  );
}
