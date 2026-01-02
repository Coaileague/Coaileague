import { useState, ReactNode } from "react";
import { 
  Users, BarChart3, Settings, Calendar, Clock, TrendingUp, 
  FileText, Target, Menu, X, LogOut 
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { CoAIleagueAFLogo } from "@/components/coaileague-af-logo";
import { performLogout } from "@/lib/logoutHandler";

interface ModernLayoutProps {
  children: ReactNode;
}

export default function ModernLayout({ children }: ModernLayoutProps) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', icon: BarChart3, label: 'Dashboard', href: '/dashboard' },
    { id: 'employees', icon: Users, label: 'Employees', href: '/employees' },
    { id: 'clients', icon: Target, label: 'Customers', href: '/clients' },
    { id: 'schedule', icon: Calendar, label: 'Schedule', href: '/schedule' },
    { id: 'time', icon: Clock, label: 'Time Tracking', href: '/time-tracking' },
    { id: 'invoices', icon: FileText, label: 'Invoices', href: '/invoices' },
    { id: 'analytics', icon: TrendingUp, label: 'Analytics', href: '/analytics' },
    { id: 'settings', icon: Settings, label: 'Settings', href: '/settings' },
  ];

  const isActiveRoute = (href: string) => {
    return location === href || (href !== '/dashboard' && location.startsWith(href));
  };

  return (
    <div className="h-screen flex flex-col bg-[hsl(var(--cad-background))] text-[hsl(var(--cad-text-primary))]">
      {/* Header */}
      <header className="bg-[hsl(var(--cad-chrome))] border-b border-[hsl(var(--cad-border))] px-4 sm:px-6 py-3 sm:py-4 sticky top-0 z-50 flex-shrink-0">
        <div className="flex items-center justify-between">
          <Link href="/dashboard">
            <CoAIleagueAFLogo size="sm" variant="full" className="cursor-pointer hover:opacity-80" />
          </Link>
          
          <button 
            className="lg:hidden p-2 text-[hsl(var(--cad-text-secondary))] hover:text-[hsl(var(--cad-text-primary))]"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            data-testid="button-mobile-menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          <div className="hidden lg:flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-[hsl(var(--cad-text-secondary))]">System Status</p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-[hsl(var(--cad-green))] rounded-full animate-pulse"></div>
                <span className="text-sm font-semibold text-[hsl(var(--cad-green))]">Operational</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => performLogout()}
              data-testid="button-logout"
              className="text-[hsl(var(--cad-text-secondary))] hover:text-[hsl(var(--cad-text-primary))]"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        {/* Sidebar - Desktop */}
        <aside className="hidden lg:block w-64 bg-[hsl(var(--cad-chrome))] border-r border-[hsl(var(--cad-border))] p-4 overflow-y-auto">
          <nav className="space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
              >
                <button
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all hover-elevate active-elevate-2 ${
                    isActiveRoute(item.href)
                      ? 'bg-[hsl(var(--cad-blue))] text-white'
                      : 'text-[hsl(var(--cad-text-secondary))] hover:text-[hsl(var(--cad-text-primary))]'
                  }`}
                  data-testid={`nav-${item.id}`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </button>
              </Link>
            ))}
          </nav>
        </aside>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 bg-[hsl(var(--cad-chrome))] z-40 pt-16 overflow-y-auto">
            <nav className="p-4 space-y-2 pb-safe">
              {navItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                >
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                      isActiveRoute(item.href)
                        ? 'bg-[hsl(var(--cad-blue))] text-white'
                        : 'text-[hsl(var(--cad-text-secondary))] hover:bg-[hsl(var(--cad-chrome-hover))] hover:text-[hsl(var(--cad-text-primary))]'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </button>
                </Link>
              ))}
              <Button
                variant="ghost"
                size="default"
                onClick={() => {
                  setMobileMenuOpen(false);
                  performLogout();
                }}
                data-testid="button-logout-mobile"
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[hsl(var(--cad-text-secondary))] hover:bg-[hsl(var(--cad-chrome-hover))] hover:text-[hsl(var(--cad-text-primary))]"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-medium">Logout</span>
              </Button>
            </nav>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
