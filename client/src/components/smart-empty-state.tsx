import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SmartEmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: "default" | "outline";
    icon?: ReactNode;
  }>;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function SmartEmptyState({
  icon,
  title,
  description,
  actions,
  className,
  size = "md",
}: SmartEmptyStateProps) {
  const sizes = {
    sm: "py-8 px-4",
    md: "py-12 px-6",
    lg: "py-16 px-8",
  };

  const iconSizes = {
    sm: "h-12 w-12",
    md: "h-16 w-16",
    lg: "h-20 w-20",
  };

  return (
    <Card className={cn("border-dashed", className)}>
      <div
        className={cn(
          "flex flex-col items-center justify-center text-center",
          sizes[size]
        )}
      >
        {/* Icon */}
        <div className={cn("text-muted-foreground mb-4", iconSizes[size])}>
          {icon}
        </div>

        {/* Content */}
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs">
          {description}
        </p>

        {/* Actions */}
        {actions && actions.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row gap-2">
            {actions.map((action, index) => (
              <Button
                key={index}
                variant={action.variant || "default"}
                onClick={action.onClick}
                data-testid={`empty-state-action-${action.label.toLowerCase()}`}
                className="gap-2"
              >
                {action.icon && action.icon}
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
