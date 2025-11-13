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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-gray-900 dark:text-white">
      {/* Safe-area header */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b-2 border-gray-200 dark:border-slate-700 shadow-md px-4 py-3 pt-safe flex items-center gap-3">
        {showBack && (
          <button
            onClick={handleBack}
            className="tap p-2 rounded-xl bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 hover-elevate active-elevate-2 shadow-sm"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </button>
        )}
        <div className="flex-1 truncate font-semibold text-base text-gray-900 dark:text-white">
          {title || "Dashboard"}
        </div>
      </header>

      {/* Main content with bottom nav spacing */}
      <main className="px-4 pt-4 has-bottom-nav">
        {children}
      </main>

      {/* Floating support button - Links to universal HelpDesk chat */}
      <a
        href="/chat"
        className="fixed right-4 z-40 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 dark:from-blue-700 dark:to-indigo-700 p-3 shadow-xl hover-elevate active-elevate-2"
        style={{ bottom: 'calc(var(--bottom-nav-h) + 1rem + env(safe-area-inset-bottom))' }}
        data-testid="button-float-support"
      >
        <MessageSquare className="w-5 h-5 text-white dark:text-white" />
      </a>
    </div>
  );
}
