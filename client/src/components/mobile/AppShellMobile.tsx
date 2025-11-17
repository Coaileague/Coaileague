import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { MobileUserMenu } from "./MobileUserMenu";

interface AppShellMobileProps {
  children: React.ReactNode;
  title?: string;
  showBack?: boolean;
}

export function AppShellMobile({ children, title, showBack = true }: AppShellMobileProps) {
  const [, setLocation] = useLocation();

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation("/");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-white to-blue-50/30 text-gray-900">
      {/* Safe-area header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b-2 border-gray-200 shadow-md px-4 py-3 pt-safe flex items-center gap-3">
        {showBack && (
          <button
            onClick={handleBack}
            className="tap p-2 rounded-xl bg-white border-2 border-gray-200 hover-elevate active-elevate-2 shadow-sm"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5 text-blue-600" />
          </button>
        )}
        <div className="flex-1 truncate font-semibold text-base text-gray-900">
          {title || "Dashboard"}
        </div>
        <MobileUserMenu />
      </header>

      {/* Main content with bottom nav spacing */}
      <main className="px-4 pt-4 has-bottom-nav">
        {children}
      </main>
    </div>
  );
}
