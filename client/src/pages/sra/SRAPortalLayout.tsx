import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import {
  Shield, LayoutDashboard, Users, AlertTriangle,
  FileText, LogOut, Menu, X, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface SRAAccount {
  fullLegalName: string;
  badgeNumber: string;
  regulatoryBody: string;
  stateCode: string;
  governmentEmail: string;
}

interface SRAPortalLayoutProps {
  children: React.ReactNode;
  activeRoute: string;
}

const NAV_ITEMS = [
  { route: "/regulatory-audit/portal", label: "Dashboard", icon: LayoutDashboard },
  { route: "/regulatory-audit/portal/officers", label: "Officer Roster", icon: Users },
  { route: "/regulatory-audit/portal/findings", label: "Findings", icon: AlertTriangle },
  { route: "/regulatory-audit/portal/report-builder", label: "Report Builder", icon: FileText },
];

export default function SRAPortalLayout({ children, activeRoute }: SRAPortalLayoutProps) {
  const [, setLocation] = useLocation();
  const [account, setAccount] = useState<SRAAccount | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("sra_session_token");
    if (!token) { setLocation("/regulatory-audit/login"); return; }
    const raw = localStorage.getItem("sra_account");
    if (raw) {
      try { setAccount(JSON.parse(raw)); } catch { /* ignore */ }
    }
  }, [setLocation]);

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sra/auth/logout"),
    onSuccess: () => {
      localStorage.removeItem("sra_session_token");
      localStorage.removeItem("sra_session_id");
      localStorage.removeItem("sra_account");
      setLocation("/regulatory-audit/login");
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0f1e3d] transform transition-transform ${navOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 md:relative md:flex md:flex-col`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-blue-900">
          <div className="w-9 h-9 bg-[#d4aa3b] rounded-full flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-[#0f1e3d]" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">SRA Partner Portal</p>
            <p className="text-blue-400 text-xs">Regulatory Audit System</p>
          </div>
          <button
            data-testid="button-close-nav"
            onClick={() => setNavOpen(false)}
            className="ml-auto text-blue-400 md:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Account info */}
        {account && (
          <div className="px-5 py-4 border-b border-blue-900">
            <p className="text-white text-sm font-medium truncate">{account.fullLegalName}</p>
            <p className="text-blue-400 text-xs">{account.regulatoryBody}</p>
            <p className="text-blue-500 text-xs mt-0.5">Badge: {account.badgeNumber}</p>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(item => {
            const isActive = activeRoute === item.route;
            const Icon = item.icon;
            return (
              <Link key={item.route} href={item.route}>
                <a
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-[#1a3a6b] text-white"
                      : "text-blue-200 hover:bg-blue-900/40 hover:text-white"
                  }`}
                  onClick={() => setNavOpen(false)}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.label}</span>
                  {isActive && <ChevronRight className="w-3 h-3 ml-auto" />}
                </a>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-blue-900">
          <Button
            data-testid="button-logout"
            variant="ghost"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="w-full justify-start text-blue-300 hover:text-white hover:bg-blue-900/40 text-sm gap-2"
          >
            <LogOut className="w-4 h-4" />
            {logoutMutation.isPending ? "Logging out..." : "Logout"}
          </Button>
          <p className="text-blue-600 text-xs text-center mt-3">Secure Regulatory Platform</p>
        </div>
      </aside>

      {/* Overlay for mobile nav */}
      {navOpen && (
        <div
          className="fixed inset-0 z-[2000] bg-black/50 md:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 flex-shrink-0">
          <button
            data-testid="button-open-nav"
            onClick={() => setNavOpen(true)}
            className="text-gray-500 md:hidden"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="hidden md:flex items-center gap-2 text-xs text-gray-400">
            <span className="bg-[#1a3a6b] text-white px-2 py-0.5 rounded font-medium">
              {account?.stateCode || "—"}
            </span>
            <span>State Regulatory Audit Portal</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span className="text-xs text-gray-500">Active Session</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
