import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { hasManagerAccess } from "@/config/mobileConfig";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Redirect } from "wouter";
import { performLogout } from "@/lib/logoutHandler";
import { useTrinityModal } from "@/components/trinity-chat-modal";
import { TrinityLogo } from "@/components/ui/coaileague-logo-mark";
import {
  Clock, Users, Building2, Shield,
  FolderOpen, Activity, Eye, MessageSquare, Megaphone, FileText,
  ArrowRightLeft, CalendarOff, ClipboardList, AlertTriangle,
  Settings, HelpCircle, LogOut, Briefcase, ChevronRight, X,
  Radio, ShieldAlert, ShoppingBag, Scale, GraduationCap, Star,
  Award, TrendingUp,
  Mail, CheckCircle, MapPin, Wallet,
  Package, FileCheck2, Receipt,
  type LucideIcon,
} from "lucide-react";

interface MenuItemProps {
  icon: LucideIcon;
  label: string;
  href: string;
  onClick?: () => void;
  variant?: "default" | "destructive";
  badge?: string;
}

function MenuItem({ icon: Icon, label, href, onClick, variant = "default", badge }: MenuItemProps) {
  const [, setLocation] = useLocation();
  const [location] = useLocation();
  const isActive = location === href || location.startsWith(href + '/') || location.startsWith(href + '?');

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if ('vibrate' in navigator) navigator.vibrate(10);
    setLocation(href);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex items-center gap-2 w-full px-3 py-0.5 text-left transition-colors active-elevate-2",
        variant === "destructive" && "text-destructive",
        isActive && "bg-primary/5"
      )}
      style={{ WebkitTapHighlightColor: 'transparent', minHeight: '44px' }}
      data-testid={`more-menu-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className={cn(
        "w-7 h-7 rounded-full border border-border/60 flex items-center justify-center shrink-0",
        isActive ? "bg-primary/10 border-primary/30" : "bg-muted/50"
      )}>
        <Icon className={cn(
          "w-3.5 h-3.5",
          variant === "destructive" ? "text-destructive" : isActive ? "text-primary" : "text-muted-foreground"
        )} />
      </div>
      <span className={cn(
        "text-xs font-medium flex-1 uppercase tracking-wide",
        variant === "destructive" ? "text-destructive" : "text-foreground"
      )}>
        {label}
      </span>
      {badge && (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-primary/10 text-primary border border-primary/20 shrink-0">
          {badge}
        </span>
      )}
      {variant !== "destructive" && !badge && (
        <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
      )}
      {variant !== "destructive" && badge && (
        <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0 ml-1" />
      )}
    </button>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 pt-1.5 pb-0.5 border-t border-border/30 first:border-t-0 first:pt-1 bg-muted/20">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export default function MobileMorePage() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { workspaceRole, platformRole } = useWorkspaceAccess();
  const [, setLocation] = useLocation();
  const { openModal: openTrinityModal } = useTrinityModal();

  if (!isMobile) {
    return <Redirect to="/dashboard" />;
  }

  const effectiveRole = platformRole === 'root_admin' || platformRole === 'deputy_admin' || platformRole === 'sysop'
    ? 'org_owner'
    : workspaceRole;
  const isManager = hasManagerAccess(effectiveRole);
  const isTrinityAuthorized = ['org_owner', 'co_owner', 'department_manager'].includes(effectiveRole || '');

  const userDisplayName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.email?.split('@')[0] || 'User';

  const userInitials = user?.firstName
    ? `${user.firstName[0]}${user.lastName?.[0] || ''}`.toUpperCase()
    : 'U';

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="bg-primary px-3 flex items-center" style={{ minHeight: '44px' }}>
        <div className="w-11" />
        <h1 className="flex-1 text-sm font-semibold text-primary-foreground tracking-wide text-center" data-testid="text-more-title">
          More
        </h1>
        <button
          onClick={() => setLocation('/dashboard')}
          className="w-11 h-11 flex items-center justify-center rounded-full active:bg-primary-foreground/20"
          style={{ WebkitTapHighlightColor: 'transparent' }}
          data-testid="button-more-close"
          aria-label="Close"
        >
          <X className="w-4 h-4 text-primary-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-y-contain pb-20">
        <button
          onClick={() => { if ('vibrate' in navigator) navigator.vibrate(10); setLocation('/profile'); }}
          className="flex items-center gap-3 w-full px-4 py-3 text-left active-elevate-2 border-b border-border/40 bg-muted/20"
          style={{ WebkitTapHighlightColor: 'transparent' }}
          data-testid="more-menu-profile-header"
        >
          <Avatar className="h-10 w-10 ring-2 ring-primary/20 shrink-0">
            <AvatarImage src={(user as any)?.profileImageUrl || ''} alt={userDisplayName} />
            <AvatarFallback className="bg-primary/15 text-primary text-sm font-bold">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground truncate" data-testid="text-user-name">{userDisplayName}</div>
            <div className="text-xs text-muted-foreground truncate" data-testid="text-user-email">{user?.email}</div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
        </button>

        {/* Ask Trinity — authorized roles only */}
        {isTrinityAuthorized && (
          <button
            onClick={() => { openTrinityModal(); }}
            className="flex items-center gap-2 w-full px-3 py-0.5 text-left active-elevate-2 border-b border-border/40"
            style={{ WebkitTapHighlightColor: 'transparent', minHeight: '44px' }}
            data-testid="more-menu-ask-trinity"
          >
            <div className="w-7 h-7 rounded-full border border-primary/30 bg-primary/10 flex items-center justify-center shrink-0">
              <TrinityLogo size={14} />
            </div>
            <span className="text-xs font-medium flex-1 uppercase tracking-wide text-primary">
              Ask Trinity AI
            </span>
            <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
          </button>
        )}

        {/* Communications */}
        <SectionHeader label="Communications" />
        <MenuItem icon={MessageSquare} label="Team Chat" href="/chatrooms" />
        <MenuItem icon={Mail} label="Email / Inbox" href="/email-intelligence" />
        <MenuItem icon={Megaphone} label="Broadcasts" href="/broadcasts" />

        {/* Operations — Field workforce tools */}
        <SectionHeader label="Operations" />
        <MenuItem icon={Clock} label="Time Clock" href="/time-tracking" />
        <MenuItem icon={CalendarOff} label="Availability" href="/availability" />
        <MenuItem icon={FileText} label="Timesheets" href="/timesheets/pending" />
        <MenuItem icon={ClipboardList} label="Daily Report" href="/field-reports?type=daily" />
        <MenuItem icon={AlertTriangle} label="Incidents" href="/field-reports?type=incident" />
        {isManager && (
          <>
            <MenuItem icon={CheckCircle} label="Approvals" href="/workflow-approvals" />
            <MenuItem icon={ShoppingBag} label="Shift Marketplace" href="/shift-marketplace" />
            <MenuItem icon={ShoppingBag} label="Coverage Market" href="/coverage-marketplace" />
            <MenuItem icon={Scale} label="Disputes" href="/disputes" />
          </>
        )}

        {/* Security Operations — Manager field tools */}
        {isManager && (
          <>
            <SectionHeader label="Security Operations" />
            <MenuItem icon={FolderOpen} label="Records (RMS)" href="/records" />
            <MenuItem icon={Radio} label="CAD Dispatch" href="/cad" />
            <MenuItem icon={ShieldAlert} label="Safety & SLA" href="/safety-check" />
            <MenuItem icon={Eye} label="Ethics Hotline" href="/ethics" />
            <MenuItem icon={MapPin} label="Guard Tour" href="/guard-tour" />
            <MenuItem icon={Package} label="Equipment" href="/equipment" />
            <MenuItem icon={ClipboardList} label="Post Orders" href="/post-orders" />
          </>
        )}

        {/* Team Management — Manager mobile tools */}
        {isManager && (
          <>
            <SectionHeader label="Team Management" />
            <MenuItem icon={Building2} label="Clients" href="/clients" />
            <MenuItem icon={Users} label="Employees" href="/employees" />
            <MenuItem icon={GraduationCap} label="Training" href="/training" />
            <MenuItem icon={Shield} label="Compliance" href="/security-compliance" />
            <MenuItem icon={FolderOpen} label="File Cabinet" href="/document-library" />
            <MenuItem icon={Activity} label="Behavior Scoring" href="/behavior-scoring" badge="AI" />
            <MenuItem icon={Star} label="Recognition" href="/employee-recognition" />
            <MenuItem icon={Award} label="Leadership" href="/leaders-hub" />
            <MenuItem icon={TrendingUp} label="Engagement" href="/engagement/dashboard" />
            <MenuItem icon={Eye} label="Auditor Portal" href="/security-compliance/auditor-portal" />
          </>
        )}

        {/* Mobile Approvals — Manager quick actions for payroll & invoices */}
        {isManager && (
          <>
            <SectionHeader label="Approvals & Finance" />
            <MenuItem icon={Wallet} label="Payroll" href="/payroll" />
            <MenuItem icon={FileCheck2} label="Invoices" href="/invoices" />
            <MenuItem icon={Receipt} label="Expenses" href="/expenses" />
          </>
        )}

        {/* My Work — for non-managers */}
        {!isManager && (
          <>
            <SectionHeader label="My Work" />
            <MenuItem icon={Briefcase} label="My Paychecks" href="/my-paychecks" />
            <MenuItem icon={Activity} label="My Score" href="/behavior-scoring" />
            <MenuItem icon={FolderOpen} label="My Files" href="/my-audit-record" />
          </>
        )}

        {/* Account */}
        <SectionHeader label="Account" />
        <MenuItem icon={Settings} label="Settings" href="/settings" />
        <MenuItem icon={HelpCircle} label="HelpDesk" href="/helpdesk" />
        <MenuItem icon={LogOut} label="Log Out" href="/logout" onClick={performLogout} variant="destructive" />
      </div>
    </div>
  );
}
