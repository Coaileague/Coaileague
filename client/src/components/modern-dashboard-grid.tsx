import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ChevronRight, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";

interface DashboardStatProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  isLoading?: boolean;
  onClick?: () => void;
  className?: string;
}

export function DashboardStat({
  title,
  value,
  subtitle,
  icon,
  trend,
  trendValue,
  isLoading,
  onClick,
  className,
}: DashboardStatProps) {
  return (
    <Card
      className={cn(
        "p-5 hover-elevate cursor-pointer transition-all",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
      data-testid={`stat-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          {isLoading ? (
            <div className="h-8 w-16 mt-2 bg-muted rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-bold mt-1">{value}</p>
          )}
          {subtitle && (
            <p className="text-xs text-secondary-foreground mt-1">{subtitle}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {icon && <div className="text-muted-foreground">{icon}</div>}
          {trend && trendValue && (
            <div className={cn("flex items-center gap-1 text-sm font-semibold", {
              "text-green-600 dark:text-green-400": trend === "up",
              "text-red-600 dark:text-red-400": trend === "down",
              "text-muted-foreground": trend === "neutral",
            })}>
              {trend === "up" && <TrendingUp className="h-3 w-3" />}
              {trend === "down" && <TrendingDown className="h-3 w-3" />}
              {trendValue}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

interface DashboardGridProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
}

export function DashboardGrid({
  title,
  description,
  children,
  className,
  footer,
}: DashboardGridProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {children}
      </div>
      {footer && <div className="mt-4">{footer}</div>}
    </div>
  );
}

interface ModernListItemProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  isClickable?: boolean;
  onClick?: () => void;
  className?: string;
}

export function ModernListItem({
  icon,
  title,
  subtitle,
  action,
  isClickable,
  onClick,
  className,
}: ModernListItemProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-md transition-colors",
        isClickable && "hover-elevate cursor-pointer",
        className
      )}
      onClick={onClick}
      data-testid={`list-item-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {icon && <div className="text-muted-foreground shrink-0">{icon}</div>}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{title}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        )}
      </div>
      {action || (isClickable && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />)}
    </div>
  );
}
