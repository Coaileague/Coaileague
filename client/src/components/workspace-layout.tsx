import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface WorkspaceLayoutProps {
  children: ReactNode;
  className?: string;
  /**
   * Add a hero gradient background to the top section (like public pages)
   */
  heroGradient?: boolean;
  /**
   * Maximum width constraint for content
   */
  maxWidth?: "4xl" | "5xl" | "6xl" | "7xl" | "full";
}

/**
 * WorkspaceLayout - Unified layout component for all workspace pages
 * 
 * Provides consistent styling matching public pages:
 * - Light bg-background by default (no dark/black inconsistencies)
 * - Optional hero gradients like landing/homepage
 * - Consistent responsive padding via responsive-container
 * - Professional Fortune 500 aesthetic
 * 
 * @example
 * ```tsx
 * <WorkspaceLayout heroGradient maxWidth="6xl">
 *   <WorkspaceSection title="Dashboard">
 *     Your content here
 *   </WorkspaceSection>
 * </WorkspaceLayout>
 * ```
 */
export function WorkspaceLayout({
  children,
  className,
  heroGradient = false,
  maxWidth = "7xl",
}: WorkspaceLayoutProps) {
  const maxWidthClass = {
    "4xl": "max-w-4xl",
    "5xl": "max-w-5xl",
    "6xl": "max-w-6xl",
    "7xl": "max-w-7xl",
    "full": "max-w-full",
  }[maxWidth];

  return (
    <div
      className={cn(
        "min-h-screen bg-background overflow-x-hidden w-full",
        heroGradient && "bg-gradient-to-b from-background via-background to-muted/20",
        className
      )}
    >
      <div className={cn("responsive-container responsive-spacing-y", maxWidthClass, "mx-auto")}>
        {children}
      </div>
    </div>
  );
}

interface WorkspaceSectionProps {
  children: ReactNode;
  className?: string;
  /**
   * Section title (optional)
   */
  title?: string;
  /**
   * Section description (optional)
   */
  description?: string;
  /**
   * Use card background styling
   */
  card?: boolean;
  /**
   * Add border
   */
  bordered?: boolean;
}

/**
 * WorkspaceSection - Consistent section wrapper for workspace content
 * 
 * Provides:
 * - Optional card styling with bg-card
 * - Consistent spacing and borders
 * - Optional title/description headers
 * 
 * @example
 * ```tsx
 * <WorkspaceSection title="Recent Activity" description="Your latest updates" card>
 *   <YourContent />
 * </WorkspaceSection>
 * ```
 */
export function WorkspaceSection({
  children,
  className,
  title,
  description,
  card = false,
  bordered = false,
}: WorkspaceSectionProps) {
  return (
    <section
      className={cn(
        "space-y-4 sm:space-y-6",
        card && "bg-card border border-border rounded-lg p-4 sm:p-6",
        bordered && !card && "border-b pb-6 sm:pb-8",
        className
      )}
    >
      {(title || description) && (
        <div className="space-y-1 sm:space-y-2">
          {title && (
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              {title}
            </h2>
          )}
          {description && (
            <p className="text-sm sm:text-base text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
