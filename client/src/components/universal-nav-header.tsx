/**
 * Universal Navigation Header - Works on ALL pages (mobile + desktop)
 * Provides hamburger menu access to navigation on every page
 * Matches Fortune 500 professional aesthetic with AutoForce branding
 */

import { Menu, ChevronDown, ChevronRight, GraduationCap, Search, Monitor, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { selectCondensedMobileFamilies, getDesktopOnlyRoutes } from "@/lib/osModules";
import { AutoForceAFLogo } from "@/components/autoforce-af-logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTransition } from "@/contexts/transition-context";
import { showLogoutTransition } from "@/lib/transition-utils";
import { NotificationsCenter } from "@/components/notifications-center";
import { HelpDropdown } from "@/components/help-dropdown";
import { FeedbackWidget } from "@/components/feedback-widget";
import { WhatsNewBadge } from "@/components/whats-new-badge";
import { PlanBadge } from "@/components/plan-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function UniversalNavHeader() {
  const { workspaceRole, subscriptionTier, isPlatformStaff, isLoading } = useWorkspaceAccess();
  const { user } = useAuth();
  const [location] = useLocation();
  const transition = useTransition();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Get CONDENSED navigation items for mobile (essential features only)
  const families = isLoading 
    ? [] 
    : selectCondensedMobileFamilies(workspaceRole, subscriptionTier, isPlatformStaff);

  // Get desktop-only routes for "Use Desktop" prompt
  const desktopOnlyRoutes = isLoading
    ? []
    : getDesktopOnlyRoutes(workspaceRole, subscriptionTier, isPlatformStaff);

  // Track expanded sections - ALL expanded by default for easy access
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // Update expanded sections when families data loads
  useEffect(() => {
    if (families.length > 0) {
      const allExpanded: Record<string, boolean> = {};
      families.forEach(family => {
        allExpanded[family.id] = true; // ALL sections expanded by default
      });
      setExpandedSections(allExpanded);
    }
  }, [families.length]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  const getRoleDisplay = () => {
    if (!workspaceRole) return "User";
    
    const roleMap: Record<string, string> = {
      'admin': 'Admin',
      'manager': 'Manager',
      'employee': 'Employee',
      'owner': 'Owner',
      'leader': 'Leader',
    };
    
    return roleMap[workspaceRole] || workspaceRole;
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

  const handleNavigate = () => {
    setSidebarOpen(false);
  };

  return (
    <div className="sticky top-0 z-40 border-b bg-gradient-to-r from-primary via-primary/95 to-primary/90 text-white shadow-md">
      <div className="flex items-center justify-between px-3 py-3 gap-2">
        {/* Left: Hamburger Menu + Role Badge */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-white hover:bg-white/20 flex-shrink-0"
                data-testid="button-hamburger-menu"
                aria-label="Open navigation menu"
              >
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-[300px] overflow-y-auto">
              {/* Header */}
              <div className="p-6 border-b border-border bg-sidebar">
                <Link href="/dashboard" onClick={handleNavigate} className="flex items-center gap-3 mb-2" data-testid="link-dashboard-logo">
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
                </Link>
              </div>

              {/* Use Desktop Notice */}
              {desktopOnlyRoutes.length > 0 && (
                <div className="px-4 pt-4">
                  <Alert className="border-amber-500/30 bg-amber-500/5">
                    <Monitor className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                    <AlertDescription className="text-xs text-foreground/80 mt-1">
                      <strong className="font-semibold block mb-1">Mobile Limitations</strong>
                      Major operations require desktop for best experience:
                      <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                        {desktopOnlyRoutes.slice(0, 5).map(route => (
                          <li key={route.id}>{route.label}</li>
                        ))}
                        {desktopOnlyRoutes.length > 5 && (
                          <li className="font-semibold">+{desktopOnlyRoutes.length - 5} more features</li>
                        )}
                      </ul>
                      <p className="mt-2 text-[10px] text-amber-700 dark:text-amber-600 font-medium">
                        📍 Use desktop for AI Scheduling, Invoicing, Payroll & Analytics
                      </p>
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {/* Navigation Menu */}
              <div className="p-4 space-y-2">
                {families.map((family) => (
                  <div key={family.id} className="space-y-1">
                    {/* Section Header */}
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

                    {/* Section Items */}
                    {expandedSections[family.id] && (
                      <div className="mt-1 space-y-1">
                        {family.routes.map((route) => {
                          const Icon = route.icon;
                          const isActive = location === route.href;
                          return (
                            <Link 
                              key={route.id}
                              href={route.href}
                              onClick={handleNavigate}
                              className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-sidebar-accent transition-all duration-200 ${
                                isActive ? 'bg-sidebar-accent' : ''
                              }`}
                              data-testid={`link-${route.id}`}
                            >
                              <div className={`w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center transition-colors ${
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
                              <span className={`flex-1 min-w-0 text-sm font-medium transition-colors break-words ${
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
                                    : 'bg-primary/20 text-primary border border-primary/30'
                                }`}>
                                  {route.badge}
                                </span>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Quick Tools Section - Only show when authenticated */}
              {user && !isLoading && (
                <div className="p-4 border-t border-border space-y-3">
                  {/* Plan Badge */}
                  <PlanBadge />

                  {/* Tutorial & Search - Grid Layout */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if ((window as any).setShowOnboarding) {
                          (window as any).setShowOnboarding(true);
                        }
                        setSidebarOpen(false);
                      }}
                      className="justify-start gap-2 h-9"
                      data-testid="button-mobile-tutorial"
                    >
                      <GraduationCap className="h-4 w-4" />
                      <span className="text-xs">Tutorial</span>
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if ((window as any).openCommandPalette) {
                          (window as any).openCommandPalette();
                        } else {
                          const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true });
                          document.dispatchEvent(event);
                        }
                        setSidebarOpen(false);
                      }}
                      className="justify-start gap-2 h-9"
                      data-testid="button-mobile-search"
                    >
                      <Search className="h-4 w-4" />
                      <span className="text-xs">Search</span>
                    </Button>
                  </div>

                  {/* Help & Feedback - Grid Layout */}
                  <div className="grid grid-cols-2 gap-2" onClick={() => setSidebarOpen(false)}>
                    <HelpDropdown />
                    <FeedbackWidget />
                  </div>

                  {/* What's New - Full Width */}
                  <div className="w-full" onClick={() => setSidebarOpen(false)}>
                    <WhatsNewBadge />
                  </div>
                </div>
              )}

              <Separator className="bg-border" />

              {/* Footer: User Profile + Settings + Sign Out */}
              <div className="p-4 space-y-2">
                {/* User Info Display */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-sidebar-accent">
                  <Avatar className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-blue-500">
                    <AvatarImage src={user?.profileImageUrl || undefined} className="object-cover rounded-lg" />
                    <AvatarFallback className="rounded-lg bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold">
                      {getInitials(user?.firstName, user?.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-sidebar-foreground truncate">
                      {user?.firstName || user?.lastName 
                        ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim()
                        : "User"}
                    </p>
                    <p className="text-xs text-sidebar-foreground/70 truncate">
                      {user?.email || ""}
                    </p>
                  </div>
                </div>

                {/* Settings Button */}
                <Link
                  href="/settings"
                  onClick={() => setSidebarOpen(false)}
                  data-testid="link-settings-hamburger"
                >
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent"
                  >
                    Settings
                  </Button>
                </Link>

                {/* Sign Out Button */}
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-destructive hover:bg-destructive/10"
                  onClick={handleLogout}
                  data-testid="button-logout-hamburger"
                >
                  Sign Out
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          {/* Role Badge */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold">{getRoleDisplay()[0]}</span>
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">{getRoleDisplay()}</p>
              {subscriptionTier && (
                <p className="text-xs opacity-90 capitalize">{subscriptionTier}</p>
              )}
            </div>
          </div>
        </div>

        {/* Center: AutoForce Branding */}
        <div className="flex-1 flex items-center justify-center min-w-0 px-2">
          <div className="flex items-baseline gap-1">
            <span className="hidden sm:inline text-base font-bold whitespace-nowrap">AutoForce</span>
            <span className="sm:hidden text-lg font-bold">AF</span>
            <span className="text-[8px] sm:text-[10px] font-bold align-super">™</span>
          </div>
        </div>

        {/* Right: User Initials + Notifications */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* User Initials Display (no dropdown - settings/sign-out in hamburger menu) */}
          <div 
            className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0"
            data-testid="display-user-initials"
          >
            <span className="text-sm font-bold">{getInitials(user?.firstName, user?.lastName)}</span>
          </div>
          
          {/* Notifications */}
          <div className="[&_button]:text-white [&_button]:hover:bg-white/20 flex-shrink-0">
            <NotificationsCenter />
          </div>
        </div>
      </div>

      {/* Date indicator */}
      <div className="px-3 pb-2 text-center">
        <p className="text-sm font-medium">
          Today
        </p>
        <p className="text-xs opacity-90">
          {new Date().toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          })}
        </p>
      </div>
    </div>
  );
}
