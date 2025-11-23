import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Plus, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PageHeaderModernProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Array<{ label: string; onClick?: () => void }>;
  status?: "active" | "inactive" | "pending" | "success" | "error";
  statusLabel?: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
    loading?: boolean;
  };
  secondaryActions?: Array<{
    label: string;
    onClick: () => void;
    icon?: ReactNode;
    destructive?: boolean;
  }>;
  onBack?: () => void;
  className?: string;
}

const statusColors = {
  active: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  inactive: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  success: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  error: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function PageHeaderModern({
  title,
  subtitle,
  breadcrumbs,
  status,
  statusLabel,
  primaryAction,
  secondaryActions,
  onBack,
  className,
}: PageHeaderModernProps) {
  return (
    <div className={cn("space-y-4 pb-4", className)}>
      {/* Breadcrumbs + Back Button */}
      {(onBack || breadcrumbs) && (
        <div className="flex items-center gap-2">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              data-testid="button-back"
              className="h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          {breadcrumbs && (
            <div className="flex items-center gap-1">
              {breadcrumbs.map((crumb, index) => (
                <div key={index} className="flex items-center gap-1">
                  {index > 0 && (
                    <span className="text-muted-foreground text-xs">/</span>
                  )}
                  <button
                    onClick={crumb.onClick}
                    className={cn(
                      "text-sm hover:underline",
                      crumb.onClick
                        ? "text-primary cursor-pointer"
                        : "text-muted-foreground"
                    )}
                    data-testid={`breadcrumb-${crumb.label.toLowerCase()}`}
                  >
                    {crumb.label}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Title Section */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold truncate">{title}</h1>
            {status && statusLabel && (
              <Badge className={cn("shrink-0", statusColors[status])}>
                {statusLabel}
              </Badge>
            )}
          </div>
          {subtitle && (
            <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>
          )}
        </div>

        {/* Actions */}
        {(primaryAction || secondaryActions) && (
          <div className="flex items-center gap-2 shrink-0">
            {primaryAction && (
              <Button
                onClick={primaryAction.onClick}
                disabled={primaryAction.loading}
                data-testid="button-primary-action"
                className="gap-2"
              >
                {primaryAction.icon && primaryAction.icon}
                {primaryAction.label}
              </Button>
            )}

            {secondaryActions && secondaryActions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    data-testid="button-more-actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {secondaryActions.map((action, index) => (
                    <DropdownMenuItem
                      key={index}
                      onClick={action.onClick}
                      className={cn(action.destructive && "text-destructive")}
                      data-testid={`action-${action.label.toLowerCase()}`}
                    >
                      {action.icon && <span className="mr-2">{action.icon}</span>}
                      {action.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
