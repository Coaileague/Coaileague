/**
 * Universal Header - Consistent navigation for ALL pages (public + workspace)
 * Shows appropriate nav based on authentication state and RBAC
 */

import { AutoForceAFLogo } from "@/components/autoforce-af-logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { useState } from "react";
import { queryClient } from "@/lib/queryClient";
import { LOGOUT_CONFIG } from "@/config/logout";

interface UniversalHeaderProps {
  variant?: "public" | "workspace";
}

export function UniversalHeader({ variant = "public" }: UniversalHeaderProps) {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Determine if user is authenticated
  const isAuthenticated = !!user;
  
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
    try {
      // IMMEDIATELY clear the auth cache BEFORE redirect so component re-renders as unauthenticated
      LOGOUT_CONFIG.cacheKeysToClear.forEach(key => {
        queryClient.setQueryData([key], null);
      });
      // Invalidate all queries to ensure cached data is cleared
      await queryClient.invalidateQueries();
      
      // Call logout API in the background (fire and forget)
      fetch(LOGOUT_CONFIG.endpoint, { 
        method: LOGOUT_CONFIG.method, 
        credentials: "include" 
      }).catch(err => console.error("Logout API call failed:", err));
      
      // Redirect immediately after clearing cache - don't wait for API
      if (LOGOUT_CONFIG.fullPageReload) {
        window.location.href = LOGOUT_CONFIG.redirectPath;
      } else {
        setLocation(LOGOUT_CONFIG.redirectPath);
      }
    } catch (error) {
      console.error("Logout failed:", error);
      // Still clear cache and redirect even if clearing fails
      LOGOUT_CONFIG.cacheKeysToClear.forEach(key => {
        queryClient.setQueryData([key], null);
      });
      setLocation(LOGOUT_CONFIG.redirectPath);
    }
  };
  
  return (
    <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-3 sm:px-6">
        <div className="flex h-16 sm:h-20 items-center justify-between gap-2">
          {/* Logo - Always visible */}
          <button 
            onClick={() => setLocation(isAuthenticated ? "/dashboard" : "/")}
            className="relative cursor-pointer hover-elevate transition-all duration-300 shrink-0"
            aria-label={isAuthenticated ? "Go to dashboard" : "Go to homepage"}
            data-testid="button-logo-home"
          >
            {/* Desktop: Show full logo */}
            <div className="hidden sm:block">
              <AutoForceAFLogo variant="full" size="md" />
            </div>
            {/* Mobile: Show smaller logo */}
            <div className="block sm:hidden">
              <AutoForceAFLogo variant="icon" size="sm" />
            </div>
          </button>

          {/* Navigation - Changes based on auth state */}
          {!isAuthenticated ? (
            // PUBLIC NAVIGATION
            <>
              {/* Desktop Navigation */}
              <div className="hidden md:flex items-center gap-4 lg:gap-6">
                <button
                  onClick={() => setLocation("/pricing")}
                  className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors min-h-[44px] px-3"
                  data-testid="link-pricing"
                >
                  Pricing
                </button>
                <button
                  onClick={handleFeaturesClick}
                  className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors min-h-[44px] px-3"
                  data-testid="link-features"
                >
                  Features
                </button>
                <button
                  onClick={() => setLocation("/contact")}
                  className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors min-h-[44px] px-3"
                  data-testid="link-contact"
                >
                  Contact
                </button>
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
              </div>

              {/* Mobile Menu - Collapsible Sheet */}
              <div className="flex md:hidden items-center gap-2 shrink-0">
                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="min-h-[44px] min-w-[44px]"
                      data-testid="button-mobile-menu"
                    >
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[280px] sm:w-[320px]">
                    <nav className="flex flex-col gap-4 mt-8">
                      <Button
                        variant="ghost"
                        className="justify-start text-base"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setLocation("/pricing");
                        }}
                        data-testid="mobile-link-pricing"
                      >
                        Pricing
                      </Button>
                      <Button
                        variant="ghost"
                        className="justify-start text-base"
                        onClick={handleFeaturesClick}
                        data-testid="mobile-link-features"
                      >
                        Features
                      </Button>
                      <Button
                        variant="ghost"
                        className="justify-start text-base"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setLocation("/contact");
                        }}
                        data-testid="mobile-link-contact"
                      >
                        Contact
                      </Button>
                      <div className="border-t my-2" />
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
                    </nav>
                  </SheetContent>
                </Sheet>
              </div>
            </>
          ) : (
            // WORKSPACE NAVIGATION - Minimal header, PeekRailNav handles main nav
            <div className="flex items-center gap-3">
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
