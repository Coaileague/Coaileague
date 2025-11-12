import { Home, Calendar, Clock, MessageSquare, MoreHorizontal } from "lucide-react";
import { useLocation } from "wouter";

interface MobileNavProps {
  onMore?: () => void;
}

export function MobileNav({ onMore }: MobileNavProps) {
  const [location, setLocation] = useLocation();

  const NavItem = ({ 
    icon: Icon, 
    label, 
    href 
  }: { 
    icon: typeof Home; 
    label: string; 
    href: string 
  }) => {
    const isActive = location === href;
    
    return (
      <button
        onClick={() => setLocation(href)}
        className={`tap flex flex-col items-center gap-1 text-[11px] transition-colors ${
          isActive 
            ? 'text-blue-600 dark:text-blue-400 font-bold' 
            : 'text-gray-600 dark:text-gray-400 active:text-blue-600 dark:active:text-blue-400'
        }`}
        data-testid={`nav-${label.toLowerCase()}`}
      >
        <Icon className="w-5 h-5" />
        <span className="truncate max-w-[72px]">{label}</span>
      </button>
    );
  };

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-t-2 border-gray-200 dark:border-slate-700 shadow-lg pb-safe">
      <div className="mx-auto max-w-screen-md flex justify-around py-2 px-2">
        <NavItem icon={Home} label="Home" href="/mobile-dashboard" />
        <NavItem icon={Calendar} label="Schedule" href="/schedule-grid" />
        <NavItem icon={Clock} label="Time" href="/time-tracking" />
        <NavItem icon={MessageSquare} label="Chat" href="/mobile-chat" />
        <button
          onClick={onMore || (() => setLocation("/workspace"))}
          className="tap flex flex-col items-center gap-1 text-[11px] text-gray-600 dark:text-gray-400 active:text-blue-600 dark:active:text-blue-400"
          data-testid="nav-more"
        >
          <MoreHorizontal className="w-5 h-5" />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
