/**
 * MODULE PAGE SHELL — Single Source of Truth for expansion module page layout
 *
 * Provides universal layout, header, stat cards, alert banners, loading
 * skeletons, and empty states used by all 8 expansion module pages.
 * Edit ONE file → changes every expansion module page instantly.
 *
 * Features:
 *   - Mobile-aware pull-to-refresh via MobilePageWrapper
 *   - Responsive stat grid (2 col on mobile, configurable on desktop)
 *   - Standardized section heading, toolbar row, alert banner, empty state
 *   - Consistent WorkspaceLayout max-width and spacing
 *
 * Usage:
 *   <ModulePageShell title="..." description="..." action={<Button>...</Button>}>
 *     <ModuleStatGrid stats={[{ label, value, color }]} />
 *     <ModuleAlertBanner variant="warning" message="..." />
 *     <ModuleSkeletonList count={3} height="h-16" />
 *     <ModuleEmptyState icon={SomeIcon} title="..." subtitle="..." action={<Button/>} />
 *     {content}
 *   </ModulePageShell>
 */
import { ReactNode, ElementType } from "react";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { MobilePageWrapper } from "@/components/mobile-page-wrapper";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { makeStatId } from "@/lib/module-utils";

// ── Page Shell ────────────────────────────────────────────────────────────────

interface ModulePageShellProps {
  title: string;
  description?: string;
  /** Primary action button rendered top-right */
  action?: ReactNode;
  children: ReactNode;
  maxWidth?: "4xl" | "5xl" | "6xl" | "7xl";
  /** Optional pull-to-refresh handler (mobile only) */
  onRefresh?: () => Promise<void> | void;
}

export function ModulePageShell({
  title,
  description,
  action,
  children,
  maxWidth = "5xl",
  onRefresh,
}: ModulePageShellProps) {
  const isMobile = useIsMobile();

  const header = (
    <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-tight">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 leading-snug">
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );

  if (isMobile && onRefresh) {
    return (
      <MobilePageWrapper
        // @ts-expect-error — TS migration: fix in refactoring sprint
        title={title}
        enablePullToRefresh
        onRefresh={onRefresh}
      >
        <div className="px-4 py-4">
          {description && (
            <p className="text-sm text-muted-foreground mb-4 leading-snug">
              {description}
            </p>
          )}
          {action && <div className="mb-4">{action}</div>}
          {children}
        </div>
      </MobilePageWrapper>
    );
  }

  return (
    <WorkspaceLayout maxWidth={maxWidth}>
      {header}
      {children}
    </WorkspaceLayout>
  );
}

// ── Detail Shell (back-button pages) ─────────────────────────────────────────

interface ModuleDetailShellProps {
  backButton: ReactNode;
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  children: ReactNode;
}

export function ModuleDetailShell({
  backButton,
  title,
  subtitle,
  badges,
  children,
}: ModuleDetailShellProps) {
  return (
    <WorkspaceLayout maxWidth="4xl">
      <div className="mb-4">{backButton}</div>
      <div className="flex items-start justify-between flex-wrap gap-2 mb-6">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        {badges && <div className="flex items-center gap-2 flex-wrap">{badges}</div>}
      </div>
      {children}
    </WorkspaceLayout>
  );
}

// ── Stat Grid ─────────────────────────────────────────────────────────────────

interface StatItem {
  label: string;
  value: string | number;
  /** Tailwind text color class e.g. "text-red-500" */
  color?: string;
  /** Optional lucide icon */
  icon?: ElementType;
}

interface ModuleStatGridProps {
  stats: StatItem[];
  /** Number of columns on desktop (default: 4) */
  cols?: 2 | 3 | 4;
  className?: string;
}

const COL_CLASS: Record<2 | 3 | 4, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};

export function ModuleStatGrid({ stats, cols = 4, className }: ModuleStatGridProps) {
  return (
    <div className={cn(`grid ${COL_CLASS[cols]} gap-3 sm:gap-4 mb-6`, className)}>
      {stats.map((s) => {
        const Icon = s.icon;
        const colorClass = s.color ?? "text-foreground";
        return (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3 px-4">
              {Icon && (
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className={cn("w-3.5 h-3.5", colorClass)} />
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              )}
              <p
                className={cn("text-xl sm:text-2xl font-bold", colorClass)}
                data-testid={`stat-${makeStatId(s.label)}`}
              >
                {s.value}
              </p>
              {!Icon && (
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Alert Banner ──────────────────────────────────────────────────────────────

type AlertVariant = "warning" | "error" | "info" | "success";

const ALERT_STYLES: Record<AlertVariant, { bg: string; border: string; text: string; Icon: ElementType }> = {
  warning: { bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-700 dark:text-amber-400", Icon: AlertTriangle },
  error:   { bg: "bg-red-500/10",   border: "border-red-500/20",   text: "text-red-700 dark:text-red-400",     Icon: AlertCircle },
  info:    { bg: "bg-blue-500/10",  border: "border-blue-500/20",  text: "text-blue-700 dark:text-blue-400",   Icon: Info },
  success: { bg: "bg-green-500/10", border: "border-green-500/20", text: "text-green-700 dark:text-green-400", Icon: CheckCircle2 },
};

interface ModuleAlertBannerProps {
  variant?: AlertVariant;
  title?: string;
  message: ReactNode;
  className?: string;
}

export function ModuleAlertBanner({
  variant = "warning",
  title,
  message,
  className,
}: ModuleAlertBannerProps) {
  const { bg, border, text, Icon } = ALERT_STYLES[variant];
  return (
    <div
      className={cn(
        "mb-4 p-3 rounded-md border flex items-start gap-2",
        bg, border, className
      )}
    >
      <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", text)} />
      <div className="min-w-0">
        {title && <p className={cn("text-sm font-medium", text)}>{title}</p>}
        <p className={cn("text-sm", text)}>{message}</p>
      </div>
    </div>
  );
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────

interface ModuleSkeletonListProps {
  count?: number;
  /** Tailwind height class e.g. "h-16" */
  height?: string;
}

export function ModuleSkeletonList({ count = 3, height = "h-16" }: ModuleSkeletonListProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn(height, "rounded-lg bg-muted animate-pulse")} />
      ))}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

interface ModuleEmptyStateProps {
  icon: ElementType;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function ModuleEmptyState({ icon: Icon, title, subtitle, action }: ModuleEmptyStateProps) {
  return (
    <div className="text-center py-12 sm:py-16 text-muted-foreground">
      <Icon className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p className="font-medium text-sm sm:text-base">{title}</p>
      {subtitle && <p className="text-sm mt-1">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── Section Heading ───────────────────────────────────────────────────────────

interface ModuleSectionHeadingProps {
  icon?: ElementType;
  iconColor?: string;
  children: ReactNode;
  className?: string;
}

export function ModuleSectionHeading({
  icon: Icon,
  iconColor = "text-muted-foreground",
  children,
  className,
}: ModuleSectionHeadingProps) {
  return (
    <h2 className={cn("text-base font-semibold text-foreground mb-3 flex items-center gap-2", className)}>
      {Icon && <Icon className={cn("w-4 h-4", iconColor)} />}
      {children}
    </h2>
  );
}

// ── Toolbar Row ───────────────────────────────────────────────────────────────

interface ModuleToolbarProps {
  children: ReactNode;
  className?: string;
}

/** Flex row of filters, search inputs, and count label — standardized spacing */
export function ModuleToolbar({ children, className }: ModuleToolbarProps) {
  return (
    <div className={cn("flex items-center gap-3 mb-4 flex-wrap", className)}>
      {children}
    </div>
  );
}
