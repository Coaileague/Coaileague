import { Home, Calendar, Clock, MessageSquare, Menu } from "lucide-react";
import { useLocation } from "wouter";

interface MobileNavProps {
  onMore?: () => void;
}

export function MobileNav({ onMore }: MobileNavProps) {
  const [location, setLocation] = useLocation();

  const NavItem = ({ 
    icon: Icon, 
    label,
    sublabel,
    href 
  }: { 
    icon: typeof Home; 
    label: string;
    sublabel?: string;
    href: string 
  }) => {
    const isActive = location === href;
    
    return (
      <button
        onClick={() => setLocation(href)}
        className={`tap flex flex-col items-center justify-center gap-0.5 py-1.5 px-2 rounded-lg transition-all min-h-[48px] min-w-[56px] ${
          isActive 
            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30' 
            : 'text-gray-600 dark:text-gray-400 hover-elevate active-elevate-2'
        }`}
        data-testid={`nav-${label.toLowerCase()}`}
      >
        <Icon className={`${isActive ? 'w-6 h-6' : 'w-5 h-5'} transition-all`} strokeWidth={isActive ? 2.5 : 2} />
        <span className={`text-[10px] font-medium ${isActive ? 'font-bold' : ''}`}>{label}</span>
        {sublabel && (
          <span className="text-[8px] text-muted-foreground opacity-75">{sublabel}</span>
        )}
      </button>
    );
  };

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-background/98 dark:bg-card/98 backdrop-blur-md border-t border-border shadow-2xl pb-safe">
      <div className="mx-auto max-w-screen-md flex justify-around items-center py-1.5 px-3 gap-1">
        <NavItem icon={Home} label="Home" href="/mobile-dashboard" />
        <NavItem icon={Calendar} label="Schedule" sublabel="shifts" href="/schedule-grid" />
        <NavItem icon={Clock} label="Time" sublabel="track" href="/time-tracking" />
        <NavItem icon={MessageSquare} label="Chat" sublabel="help" href="/mobile-chat" />
        <button
          onClick={onMore || (() => setLocation("/workspace"))}
          className="tap flex flex-col items-center justify-center gap-0.5 py-1.5 px-2 rounded-lg transition-all min-h-[48px] min-w-[56px] text-gray-600 dark:text-gray-400 hover-elevate active-elevate-2"
          data-testid="nav-more"
        >
          <Menu className="w-5 h-5" strokeWidth={2} />
          <span className="text-[10px] font-medium">Menu</span>
        </button>
      </div>
    </nav>
  );
}
