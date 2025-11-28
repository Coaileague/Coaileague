/**
 * Universal Header - Consistent navigation for ALL pages (public + workspace)
 * Shows appropriate nav based on variant prop (not auth state for public pages)
 */

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, LogOut, LayoutDashboard } from "lucide-react";
import { useState } from "react";
import { queryClient } from "@/lib/queryClient";
import { LOGOUT_CONFIG } from "@/config/logout";
import { CoAIleagueLogo } from "@/components/coailleague-logo";
import { performLogout } from "@/lib/logoutHandler";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface UniversalHeaderProps {
  variant?: "public" | "workspace";
}

export function UniversalHeader({ variant = "public" }: UniversalHeaderProps) {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
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
        <div className="flex h-16 sm:h-20 items-center justify-between gap-2">
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
                width={200} 
                height={50} 
                showTagline={false} 
                showWordmark={true}
              />
            </div>
            {/* Mobile: Icon only */}
            <div className="block sm:hidden">
              <CoAIleagueLogo 
                width={40} 
                height={40} 
                onlyIcon={true}
              />
            </div>
          </button>

          {/* PUBLIC NAVIGATION - Always show when variant is "public" */}
          {variant === "public" ? (
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
                
                {/* Show Login/Register if not authenticated, Dashboard link if authenticated */}
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 px-2 h-9"
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
                )}
              </div>

              {/* Mobile Menu */}
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
