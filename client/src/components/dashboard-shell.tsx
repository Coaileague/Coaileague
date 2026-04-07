/**
 * DashboardShell - Shared responsive container for all role dashboards
 * 
 * Features:
 * - Centers content on large screens (max-w-5xl xl:max-w-6xl 2xl:max-w-[1400px])
 * - Consistent padding and margins
 * - Optional center alignment for headers/CTAs
 * - Mobile-first responsive design
 */

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DashboardShellProps {
  children: ReactNode;
  align?: "left" | "center";
  className?: string;
  maxWidth?: "4xl" | "5xl" | "6xl" | "7xl";
}

export function DashboardShell({ 
  children, 
  align = "left",
  className,
  maxWidth = "5xl" 
}: DashboardShellProps) {
  const maxWidthClasses = {
    "4xl": "max-w-4xl 2xl:max-w-5xl",
    "5xl": "max-w-5xl xl:max-w-6xl 2xl:max-w-[1400px]",
    "6xl": "max-w-6xl xl:max-w-7xl 2xl:max-w-[1400px]",
    "7xl": "max-w-7xl 2xl:max-w-[1400px]"
  };

  return (
    <div 
      className={cn(
        "w-full px-4 sm:px-6 mx-auto 2xl:text-base",
        maxWidthClasses[maxWidth],
        align === "center" && "flex flex-col items-center text-center",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * ResponsiveSection - Wrapper for dashboard sections with consistent spacing
 */
interface ResponsiveSectionProps {
  children: ReactNode;
  className?: string;
  spacing?: "sm" | "md" | "lg";
}

export function ResponsiveSection({ 
  children, 
  className,
  spacing = "md" 
}: ResponsiveSectionProps) {
  const spacingClasses = {
    sm: "mb-4",
    md: "mb-6 sm:mb-8",
    lg: "mb-8 sm:mb-12"
  };

  return (
    <div className={cn(spacingClasses[spacing], className)}>
      {children}
    </div>
  );
}

/**
 * StackedRow - Mobile card fallback for table rows
 * Shows on mobile (<sm), hidden on desktop
 */
interface StackedRowProps {
  fields: Array<{
    label: string;
    value: ReactNode;
    className?: string;
  }>;
  actions?: ReactNode;
  className?: string;
}

export function StackedRow({ fields, actions, className }: StackedRowProps) {
  return (
    <div 
      className={cn(
        "bg-card border border-border rounded-lg p-4 sm:hidden",
        className
      )}
    >
      <dl className="space-y-2">
        {fields.map((field, index) => (
          <div key={index} className="flex justify-between items-start gap-2">
            <dt className="text-sm font-medium text-muted-foreground min-w-0 flex-1">
              {field.label}:
            </dt>
            <dd className={cn("text-sm text-foreground text-right min-w-0 flex-1", field.className)}>
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
      {actions && (
        <div className="mt-4 flex justify-end gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * CenteredActions - Centers buttons/actions within a section
 */
interface CenteredActionsProps {
  children: ReactNode;
  className?: string;
  mobileStack?: boolean;
}

export function CenteredActions({ 
  children, 
  className,
  mobileStack = false 
}: CenteredActionsProps) {
  return (
    <div 
      className={cn(
        "flex gap-2 justify-center items-center flex-wrap",
        mobileStack && "flex-col sm:flex-row",
        className
      )}
    >
      {children}
    </div>
  );
}
