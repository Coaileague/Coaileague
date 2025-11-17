/**
 * Universal Navigation Header - Works on ALL pages (mobile + desktop)
 * Provides hamburger menu access to navigation on every page
 * Matches Fortune 500 professional aesthetic with AutoForce branding
 */

import { Menu, Bell, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { selectSidebarFamilies } from "@/lib/osModules";
import { AutoForceAFLogo } from "@/components/autoforce-af-logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTransition } from "@/contexts/transition-context";
import { showLogoutTransition } from "@/lib/transition-utils";

export function UniversalNavHeader() {
  const { workspaceRole, subscriptionTier, isPlatformStaff, isLoading } = useWorkspaceAccess();
  const { user } = useAuth();
  const [location] = useLocation();
  const transition = useTransition();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Get navigation items with RBAC filtering
  const families = isLoading 
    ? [] 
    : selectSidebarFamilies(workspaceRole, subscriptionTier, isPlatformStaff);

  // Track expanded sections - ALL expanded by default for easy access
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    families.forEach(family => {
      initial[family.id] = true; // ALL sections expanded by default
    });
    return initial;
  });

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

  const handleNavigate = (href: string) => {
    setSidebarOpen(false);
  };

  return (
    <div className="sticky top-0 z-40 border-b bg-gradient-to-r from-primary via-primary/95 to-primary/90 text-white shadow-md">
      <div className="flex items-center justify-between px-4 py-3">
        {/* Left: Hamburger Menu + Role Badge */}
        <div className="flex items-center gap-3">
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-white hover:bg-white/20"
                data-testid="button-hamburger-menu"
                aria-label="Open navigation menu"
              >
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-[300px] overflow-y-auto">
              {/* Header */}
              <div className="p-6 border-b border-border bg-sidebar">
                <Link href="/dashboard" onClick={() => handleNavigate('/dashboard')} className="flex items-center gap-3 mb-2" data-testid="link-dashboard-logo">
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
                              onClick={() => handleNavigate(route.href)}
                              className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-sidebar-accent transition-all duration-200 ${
                                isActive ? 'bg-sidebar-accent' : ''
                              }`}
                              data-testid={`link-${route.id}`}
                            >
                              <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
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
                              <span className={`flex-1 text-sm font-medium transition-colors ${
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

              {/* Footer: User Profile */}
              <div className="p-4 border-t border-border mt-auto">
                <div 
                  onClick={handleLogout}
                  className="flex items-center gap-3 p-3 rounded-xl bg-sidebar-accent hover:bg-sidebar-accent/80 transition-colors cursor-pointer group"
                  data-testid="button-logout-hamburger"
                >
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
                  <ChevronRight size={16} className="text-sidebar-foreground group-hover:text-sidebar-foreground transition-colors" />
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* Role Badge */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-xs font-bold">{getRoleDisplay()[0]}</span>
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold leading-tight">{getRoleDisplay()}</p>
              {subscriptionTier && (
                <p className="text-xs opacity-90 capitalize">{subscriptionTier}</p>
              )}
            </div>
          </div>
        </div>

        {/* Center: AutoForce Branding (mobile only shows icon) */}
        <div className="absolute left-1/2 transform -translate-x-1/2">
          <div className="flex items-baseline gap-1">
            <span className="hidden sm:inline text-base font-bold">AutoForce</span>
            <span className="sm:hidden text-lg font-bold">AF</span>
            <span className="text-[8px] sm:text-[10px] font-bold align-super">™</span>
          </div>
        </div>

        {/* Right: Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-white hover:bg-white/20 relative"
          data-testid="button-notifications"
          aria-label="View notifications"
        >
          <Bell className="h-5 w-5" />
        </Button>
      </div>

      {/* Date indicator */}
      <div className="px-4 pb-2 text-center">
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
