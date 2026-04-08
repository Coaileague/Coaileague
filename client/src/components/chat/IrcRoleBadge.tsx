import { cn } from "@/lib/utils";
import { TrinityLogo } from "@/components/ui/coaileague-logo-mark";
import { Bot, Shield, Crown, Star, Wrench, User, Eye, Briefcase, ClipboardList } from "lucide-react";

/**
 * IRC-Style Role Badge System
 * 
 * mIRC/IRCX-inspired role hierarchy with visual sigils:
 * - ~ Admin - Platform root administrators (root_admin)
 * - & Deputy - Platform deputy admins / support managers
 * - [Trinity] Orchestrator - Trinity AI (FULL AUTHORITY)
 * - [Bot] System - System bots (FULL AUTHORITY)
 * - @ Sysop/Tech - Platform system operators / support agents
 * - @ Chief - Organization owners (org_owner)
 * - @ Deputy Chief - Organization co-owners (co_owner)
 * - % Operations - Managers / supervisors
 * - + Staff - Employees / staff
 * - (none) User - Regular participants (auditors, contractors)
 * - (none) Guest - Guests with limited access
 * 
 * IMPORTANT: Bots have FULL AUTHORITY and BYPASS privileges as automated
 * support agents. They rank at level 2, just below Deputy.
 */

export type IrcRole = 
  | 'radmin'     // ~ Root admin / Admin (level 0)
  | 'coadmin'    // & Deputy admin / Support manager (level 1)
  | 'bot'        // AI Bot with FULL AUTHORITY (level 2 - Orchestrator/System)
  | 'sysop'      // @ System operator / Tech (level 3)
  | 'owner'      // @ Org owner / Chief (level 4)
  | 'halfop'     // % Operations / Manager / Supervisor (level 5)
  | 'voice'      // + Staff / Employee (level 6)
  | 'user'       // Regular user / Auditor / Contractor (level 7)
  | 'guest';     // Guest (level 8)

/**
 * Role hierarchy order for sorting (lower = higher rank)
 * Bots have FULL AUTHORITY and rank at level 2 (after Deputy)
 */
export const IRC_ROLE_ORDER: Record<IrcRole, number> = {
  radmin: 0,
  coadmin: 1,
  bot: 2,
  sysop: 3,
  owner: 4,
  halfop: 5,
  voice: 6,
  user: 7,
  guest: 8,
};

export interface IrcRoleBadgeProps {
  role: IrcRole;
  platformRole?: string | null;
  workspaceRole?: string | null;
  isBot?: boolean;
  isTrinity?: boolean;
  showLabel?: boolean;
  showSigil?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

interface IrcRoleConfigEntry {
  sigil: string;
  label: string;
  shortLabel: string;
  orgLabel: string;
  platformLabel: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  icon: typeof Shield;
}

const IRC_ROLE_CONFIG: Record<IrcRole, IrcRoleConfigEntry> = {
  radmin: {
    sigil: '~',
    label: 'Admin',
    shortLabel: 'Admin',
    orgLabel: 'Admin',
    platformLabel: 'Admin',
    bgColor: 'bg-red-100 dark:bg-red-900/40',
    textColor: 'text-red-700 dark:text-red-300',
    borderColor: 'border-red-300 dark:border-red-700',
    icon: Crown,
  },
  coadmin: {
    sigil: '&',
    label: 'Deputy',
    shortLabel: 'Deputy',
    orgLabel: 'Deputy Chief',
    platformLabel: 'Deputy',
    bgColor: 'bg-orange-100 dark:bg-orange-900/40',
    textColor: 'text-orange-700 dark:text-orange-300',
    borderColor: 'border-orange-300 dark:border-orange-700',
    icon: Shield,
  },
  sysop: {
    sigil: '@',
    label: 'Sysop',
    shortLabel: 'Sysop',
    orgLabel: 'Administrative',
    platformLabel: 'Sysop',
    bgColor: 'bg-purple-100 dark:bg-purple-900/40',
    textColor: 'text-purple-700 dark:text-purple-300',
    borderColor: 'border-purple-300 dark:border-purple-700',
    icon: Wrench,
  },
  owner: {
    sigil: '@',
    label: 'Chief',
    shortLabel: 'Chief',
    orgLabel: 'Chief',
    platformLabel: 'Owner',
    bgColor: 'bg-amber-100 dark:bg-amber-900/40',
    textColor: 'text-amber-700 dark:text-amber-300',
    borderColor: 'border-amber-300 dark:border-amber-700',
    icon: Crown,
  },
  halfop: {
    sigil: '%',
    label: 'Operations',
    shortLabel: 'Ops',
    orgLabel: 'Operations',
    platformLabel: 'Operations',
    bgColor: 'bg-blue-100 dark:bg-blue-900/40',
    textColor: 'text-blue-700 dark:text-blue-300',
    borderColor: 'border-blue-300 dark:border-blue-700',
    icon: Briefcase,
  },
  voice: {
    sigil: '+',
    label: 'Staff',
    shortLabel: 'Staff',
    orgLabel: 'Staff',
    platformLabel: 'Tech',
    bgColor: 'bg-green-100 dark:bg-green-900/40',
    textColor: 'text-green-700 dark:text-green-300',
    borderColor: 'border-green-300 dark:border-green-700',
    icon: User,
  },
  user: {
    sigil: '',
    label: 'User',
    shortLabel: 'User',
    orgLabel: 'User',
    platformLabel: 'User',
    bgColor: 'bg-slate-100 dark:bg-slate-800',
    textColor: 'text-slate-600 dark:text-slate-400',
    borderColor: 'border-slate-300 dark:border-slate-600',
    icon: User,
  },
  guest: {
    sigil: '',
    label: 'Guest',
    shortLabel: 'Guest',
    orgLabel: 'Guest',
    platformLabel: 'Guest',
    bgColor: 'bg-slate-100 dark:bg-slate-800',
    textColor: 'text-slate-500 dark:text-slate-500',
    borderColor: 'border-slate-200 dark:border-slate-700',
    icon: Eye,
  },
  bot: {
    sigil: '',
    label: 'Orchestrator',
    shortLabel: 'Orchestrator',
    orgLabel: 'System',
    platformLabel: 'Orchestrator',
    bgColor: 'bg-gradient-to-r from-blue-100 via-purple-100 to-amber-100 dark:from-blue-900/40 dark:via-purple-900/40 dark:to-amber-900/40',
    textColor: 'text-purple-700 dark:text-purple-300',
    borderColor: 'border-purple-300 dark:border-purple-600',
    icon: Bot,
  },
};

const TRINITY_SENDER_NAMES = ['trinity', 'trinity ai', 'trinity ai orchestrator'];

export function isTrinityBot(senderName?: string | null): boolean {
  if (!senderName) return false;
  return TRINITY_SENDER_NAMES.includes(senderName.toLowerCase());
}

function resolveDisplayLabel(config: IrcRoleConfigEntry, opts: {
  isPlatformContext?: boolean;
  isTrinity?: boolean;
  workspaceRole?: string | null;
}): string {
  if (opts.isTrinity) return 'Orchestrator';
  if (config === IRC_ROLE_CONFIG.bot) return 'System';
  if (config === IRC_ROLE_CONFIG.owner && opts.workspaceRole === 'co_owner') {
    return opts.isPlatformContext ? 'Deputy' : 'Deputy Chief';
  }
  return opts.isPlatformContext ? config.platformLabel : config.orgLabel;
}

/**
 * Maps platform/workspace roles to IRC role hierarchy
 */
export function mapToIrcRole(params: {
  platformRole?: string | null;
  workspaceRole?: string | null;
  roomRole?: string | null;
  isBot?: boolean;
  senderType?: string | null;
  senderName?: string | null;
}): IrcRole {
  const { platformRole, workspaceRole, roomRole, isBot, senderType } = params;
  
  if (isBot || senderType === 'bot') {
    return 'bot';
  }
  
  if (platformRole === 'root_admin') {
    return 'radmin';
  }
  
  if (platformRole === 'deputy_admin' || platformRole === 'support_manager') {
    return 'coadmin';
  }
  
  if (platformRole === 'sysop' || platformRole === 'support_agent' || platformRole === 'compliance_officer' || senderType === 'support') {
    return 'sysop';
  }
  
  if (workspaceRole === 'org_owner' || workspaceRole === 'co_owner' || roomRole === 'owner') {
    return 'owner';
  }
  
  if (workspaceRole === 'manager' || workspaceRole === 'department_manager' || workspaceRole === 'supervisor' || roomRole === 'operator') {
    return 'halfop';
  }
  
  if (workspaceRole === 'staff' || workspaceRole === 'employee' || roomRole === 'voice' || senderType === 'staff') {
    return 'voice';
  }
  
  if (workspaceRole === 'auditor' || workspaceRole === 'contractor') {
    return 'user';
  }
  
  if (roomRole === 'guest') {
    return 'guest';
  }
  
  return 'user';
}

/**
 * IRC-Style Role Badge Component
 * Renders mIRC/IRCX-inspired role badges with sigils
 */
export function IrcRoleBadge({
  role,
  platformRole,
  workspaceRole,
  isBot,
  isTrinity,
  showLabel = true,
  showSigil = true,
  size = 'sm',
  className,
}: IrcRoleBadgeProps) {
  const effectiveRole = isBot ? 'bot' : role;
  const config = IRC_ROLE_CONFIG[effectiveRole];
  
  if (!config) return null;
  
  if (effectiveRole === 'user' && !showLabel) return null;
  
  const isPlatformContext = !!platformRole && platformRole !== 'none';
  const displayLabel = resolveDisplayLabel(config, {
    isPlatformContext,
    isTrinity,
    workspaceRole,
  });
  
  const sizeClasses = {
    xs: 'h-3.5 px-1 text-[8px] gap-0.5',
    sm: 'h-4 px-1.5 text-[10px] gap-1',
    md: 'h-5 px-2 text-xs gap-1.5',
  };
  
  const iconSizes = {
    xs: 'w-2 h-2',
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3',
  };
  
  const logoSizes = {
    xs: 8,
    sm: 10,
    md: 12,
  };
  
  const showTrinityLogo = effectiveRole === 'bot' && isTrinity;
  const showBotIcon = effectiveRole === 'bot' && !isTrinity;
  
  return (
    <span
      className={cn(
        "inline-flex items-center font-mono font-semibold rounded border whitespace-nowrap",
        sizeClasses[size],
        config.bgColor,
        config.textColor,
        config.borderColor,
        className
      )}
      title={displayLabel}
      data-testid={`irc-badge-${effectiveRole}${isTrinity ? '-trinity' : ''}`}
    >
      {showTrinityLogo ? (
        <TrinityLogo size={logoSizes[size]} className="shrink-0" />
      ) : showBotIcon ? (
        <Bot className={cn("shrink-0", iconSizes[size])} />
      ) : showSigil && config.sigil ? (
        <span className="font-bold">{config.sigil}</span>
      ) : null}
      
      {showLabel && (
        <span className="leading-none">{displayLabel}</span>
      )}
    </span>
  );
}

/**
 * Inline IRC Sigil - Just the sigil character for compact display
 */
export function IrcSigil({
  role,
  isBot,
  className,
}: {
  role: IrcRole;
  isBot?: boolean;
  className?: string;
}) {
  const effectiveRole = isBot ? 'bot' : role;
  const config = IRC_ROLE_CONFIG[effectiveRole];
  
  if (!config) return null;
  
  if (effectiveRole === 'bot') {
    return <TrinityLogo size={12} className={cn("inline-block align-baseline", className)} />;
  }
  
  if (!config.sigil) return null;
  
  return (
    <span 
      className={cn("font-mono font-bold", config.textColor, className)}
      title={config.label}
    >
      {config.sigil}
    </span>
  );
}

/**
 * Username with IRC-style prefix sigil
 */
export function IrcUsername({
  name,
  role,
  isBot,
  showBadge = false,
  badgeSize = 'xs',
  className,
}: {
  name: string;
  role: IrcRole;
  isBot?: boolean;
  showBadge?: boolean;
  badgeSize?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  const effectiveRole = isBot ? 'bot' : role;
  const config = IRC_ROLE_CONFIG[effectiveRole];
  
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <IrcSigil role={effectiveRole} isBot={isBot} />
      <span className="font-medium">{name}</span>
      {showBadge && effectiveRole !== 'user' && (
        <IrcRoleBadge 
          role={effectiveRole} 
          isBot={isBot}
          showSigil={false}
          size={badgeSize}
        />
      )}
    </span>
  );
}

export default IrcRoleBadge;
