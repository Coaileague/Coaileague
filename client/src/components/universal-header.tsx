/**
 * Universal Header - Consistent navigation for ALL pages (public + workspace)
 * Shows appropriate nav based on variant prop (not auth state for public pages)
 * Configuration-driven for easy editing (see config/headerConfig.ts)
 */

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, LogOut, LayoutDashboard } from "lucide-react";
import { useState } from "react";
import { CoAIleagueLogo } from "@/components/coailleague-logo";
import { performLogout } from "@/lib/logoutHandler";
import { AnimatedNotificationBell } from "@/components/animated-notification-bell";
import { WhatsNewBadge } from "@/components/whats-new-badge";
import { AISearchTrigger } from "@/components/ai-search";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { HEADER_CONFIG, HEADER_SPACING, HEADER_HEIGHTS } from "@/config/headerConfig";

interface UniversalHeaderProps {
  variant?: "public" | "workspace";
}

export function UniversalHeader({ variant = "public" }: UniversalHeaderProps) {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // RBAC-controlled: Only show notification features to authenticated users
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

  // Handle logo click - PUBLIC variant always goes to homepage
  const handleLogoClick = () => {
    if (variant === "public") {
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
          {/* Logo - Uses the provided CoAIleagueLogo component */}
          <button 
            onClick={handleLogoClick}
            className="relative cursor-pointer hover-elevate transition-all duration-300 shrink-0"
            aria-label={variant === "public" ? "Go to homepage" : "Go to dashboard"}
            data-testid="button-logo-home"
          >
            {/* Desktop: Full logo with wordmark */}
            <div className="hidden sm:block">
              <CoAIleagueLogo 
                width={220} 
                height={55} 
                showTagline={false} 
                showWordmark={true}
              />
            </div>
            {/* Tablet: Medium logo */}
            <div className="hidden sm:block md:hidden">
              <CoAIleagueLogo 
                width={160} 
                height={40} 
                showTagline={false} 
                showWordmark={true}
              />
            </div>
            {/* Mobile: Icon with text for visibility */}
            <div className="flex sm:hidden items-center gap-2">
              <CoAIleagueLogo 
                width={36} 
                height={36} 
                onlyIcon={true}
                className="flex-shrink-0"
              />
              <span className="font-bold text-base bg-gradient-to-r from-cyan-500 to-blue-600 bg-clip-text text-transparent">
                CoAIleague
              </span>
            </div>
          </button>

          {/* PUBLIC NAVIGATION - Always show when variant is "public" */}
          {variant === "public" ? (
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
                          <AISearchTrigger />
                          <WhatsNewBadge />
                          <AnimatedNotificationBell
                            hasNotifications={true}
                            onClick={() => setLocation("/dashboard")}
                            onClear={() => {
                              // Notifications cleared
                            }}
                          />
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

              {/* Mobile Menu */}
              <div className={`flex md:hidden items-center ${HEADER_SPACING.mobileIconGap} shrink-0`}>
                {showNotificationFeatures && (
                  <div className={`flex items-center ${HEADER_SPACING.mobileIconGap}`}>
                    <WhatsNewBadge />
                    <AnimatedNotificationBell
                      hasNotifications={true}
                      onClick={() => setLocation("/dashboard")}
                      onClear={() => {
                        // Notifications cleared
                      }}
                    />
                  </div>
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
                    <nav className="flex flex-col gap-4 mt-8">
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
            <div className="flex items-center gap-3">
              <AISearchTrigger />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                data-testid="button-logout"
                className="text-foreground/80 hover:text-foreground"
              >
                Logout
              </Button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
