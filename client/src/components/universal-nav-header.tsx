/**
 * Universal Navigation Header - Works on ALL pages (mobile + desktop)
 * Provides hamburger menu access to navigation on every page
 * Matches Fortune 500 professional aesthetic with CoAIleague branding
 */

import { Menu, ChevronDown, ChevronRight, GraduationCap, Search, Monitor, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { selectCondensedMobileFamilies, getDesktopOnlyRoutes } from "@/lib/osModules";
import { CoAIleagueLogo } from "@/components/coailleague-logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTransition } from "@/contexts/transition-context";
import { showLogoutTransition } from "@/lib/transition-utils";
import { useToast } from "@/hooks/use-toast";
import { NotificationsCenter } from "@/components/notifications-center";
import { HelpDropdown } from "@/components/help-dropdown";
import { FeedbackWidget } from "@/components/feedback-widget";
import { WhatsNewBadge } from "@/components/whats-new-badge";
import { PlanBadge } from "@/components/plan-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { performLogout } from "@/lib/logoutHandler";

export function UniversalNavHeader() {
  const { workspaceRole, subscriptionTier, isPlatformStaff, isLoading } = useWorkspaceAccess();
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const transition = useTransition();
  const { toast } = useToast();
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
    showLogoutTransition(transition);
    setSidebarOpen(false);
    await performLogout();
  };

  const handleNavigate = () => {
    setSidebarOpen(false);
  };

  return (
    <div className="sticky top-0 z-40 border-b border-slate-700/50 bg-slate-900 text-white shadow-lg">
      <div className="flex items-center justify-between px-3 py-3 gap-2">
        {/* Left: Hamburger Menu + Role Badge */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-white hover:bg-slate-800 flex-shrink-0"
                data-testid="button-hamburger-menu"
                aria-label="Open navigation menu"
              >
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-[300px] overflow-y-auto bg-slate-900 border-slate-700">
              {/* Header */}
              <div className="p-5 border-b border-slate-700/50">
                <Link href="/dashboard" onClick={handleNavigate} data-testid="link-dashboard-logo" className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 via-cyan-500 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20 shrink-0">
                    <span className="text-white font-black text-sm">CO</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-lg font-black text-white tracking-tight">
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-400">Co</span>
                      <span className="text-white">AI</span>
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">league</span>
                      <span className="text-[10px] text-slate-400 ml-0.5">™</span>
                    </span>
                    <p className="text-[11px] text-slate-400 tracking-wide">Autonomous Management</p>
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
              <div className="px-3 py-4 space-y-1">
                {families.map((family) => (
                  <div key={family.id} className="mb-2">
                    {/* Section Header */}
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

                    {/* Section Items */}
                    {expandedSections[family.id] && (
                      <div className="mt-1 space-y-0.5">
                        {family.routes.map((route) => {
                          const Icon = route.icon;
                          const isActive = location === route.href;
                          return (
                            <Link 
                              key={route.id}
                              href={route.href}
                              onClick={handleNavigate}
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
                              <span className="flex-1 min-w-0 text-sm font-medium break-words">
                                {route.label}
                              </span>
                              {route.badge && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                  route.badge === 'Root' 
                                    ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                                    : route.badge === 'Enterprise' 
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                    : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
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
                <div className="p-4 border-t border-slate-700/50 space-y-3">
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
                      className="justify-start gap-2 h-9 text-slate-300 hover:text-white hover:bg-slate-800"
                      data-testid="button-mobile-tutorial"
                    >
                      <GraduationCap className="h-4 w-4 text-cyan-400" />
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
                      className="justify-start gap-2 h-9 text-slate-300 hover:text-white hover:bg-slate-800"
                      data-testid="button-mobile-search"
                    >
                      <Search className="h-4 w-4 text-cyan-400" />
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

              {/* Footer: User Profile + Settings + Sign Out */}
              <div className="p-4 border-t border-slate-700/50 space-y-2">
                {/* User Info Display */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800">
                  <Avatar className="w-10 h-10 rounded-lg border-2 border-slate-600">
                    <AvatarImage src={user?.profileImageUrl || undefined} className="object-cover rounded-lg" />
                    <AvatarFallback className="rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 text-white font-bold">
                      {getInitials(user?.firstName, user?.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {user?.firstName || user?.lastName 
                        ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim()
                        : "User"}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
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
                    className="w-full justify-start gap-3 text-slate-300 hover:text-white hover:bg-slate-800"
                  >
                    Settings
                  </Button>
                </Link>

                {/* Sign Out Button */}
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-red-400 hover:text-red-300 hover:bg-red-500/10"
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
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 border border-slate-700">
              <span className="text-xs font-bold text-cyan-400">{getRoleDisplay()[0]}</span>
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight text-white">{getRoleDisplay()}</p>
              {subscriptionTier && (
                <p className="text-xs text-slate-400 capitalize">{subscriptionTier}</p>
              )}
            </div>
          </div>
        </div>

        {/* Center: CoAIleague Branding */}
        <div className="flex-1 flex items-center justify-center min-w-0 px-2">
          <div className="flex items-baseline gap-1">
            <span className="hidden sm:inline text-base font-bold whitespace-nowrap">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-400">Co</span>
              <span className="text-white">AI</span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">league</span>
            </span>
            <span className="sm:hidden text-lg font-bold text-cyan-400">CO</span>
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
