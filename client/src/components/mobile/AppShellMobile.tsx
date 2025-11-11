import { ArrowLeft, MessageSquare } from "lucide-react";
import { useLocation } from "wouter";

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
    <div className="min-h-screen bg-background text-foreground">
      {/* Safe-area header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-sm border-b px-4 py-3 pt-safe flex items-center gap-3">
        {showBack && (
          <button
            onClick={handleBack}
            className="tap p-2 rounded-xl bg-card border hover-elevate active-elevate-2"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1 truncate font-semibold text-base">
          {title || "Dashboard"}
        </div>
      </header>

      {/* Main content with bottom nav spacing */}
      <main className="px-4 pt-4 has-bottom-nav">
        {children}
      </main>

      {/* Floating support button */}
      <a
        href="/support"
        className="fixed right-4 z-40 rounded-full bg-primary p-3 shadow-xl hover-elevate active-elevate-2"
        style={{ bottom: 'calc(var(--bottom-nav-h) + 1rem + env(safe-area-inset-bottom))' }}
        data-testid="button-float-support"
      >
        <MessageSquare className="w-5 h-5 text-primary-foreground" />
      </a>
    </div>
  );
}
