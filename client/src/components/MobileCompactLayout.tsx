/**
 * MobileCompactLayout Component
 * 
 * Provides standardized mobile-first layout with:
 * - Responsive spacing with fluid utilities
 * - Optional sticky header slot
 * - Optional sticky bottom CTA bar
 * - Touch-friendly minimum tap targets (48px)
 * - Compact gaps and padding
 */

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MobileCompactLayoutProps {
  children: ReactNode;
  
  /** Optional sticky header content (navigation, title, etc.) */
  header?: ReactNode;
  
  /** Optional sticky bottom CTA bar (Save, Submit, etc.) */
  bottomCta?: ReactNode;
  
  /** Use compact spacing (reduced gaps/padding) */
  compact?: boolean;
  
  /** Use fluid typography/spacing utilities */
  fluid?: boolean;
  
  /** Additional CSS classes */
  className?: string;
  
  /** Additional classes for content wrapper */
  contentClassName?: string;
  
  /** Max width constraint (default: 7xl for analytics/reports) */
  maxWidth?: 'full' | '7xl' | '6xl' | '5xl' | '4xl';
  
  /** Test ID for automated testing */
  'data-testid'?: string;
}

const maxWidthMap = {
  full: 'max-w-full',
  '7xl': 'max-w-7xl',
  '6xl': 'max-w-6xl',
  '5xl': 'max-w-5xl',
  '4xl': 'max-w-4xl',
};

export function MobileCompactLayout({
  children,
  header,
  bottomCta,
  compact = false,
  fluid = false,
  className,
  contentClassName,
  maxWidth = '7xl',
  'data-testid': testId,
}: MobileCompactLayoutProps) {
  return (
    <div 
      className={cn(
        "min-h-screen bg-background flex flex-col",
        className
      )}
      data-testid={testId}
    >
      {/* Optional Sticky Header */}
      {header && (
        <div 
          className="sticky top-0 z-30 bg-background border-b border-border"
          data-testid={testId ? `${testId}-header` : undefined}
        >
          {header}
        </div>
      )}
      
      {/* Main Content Area */}
      <div 
        className={cn(
          "flex-1 mx-auto w-full",
          maxWidthMap[maxWidth],
          compact ? "compact-padding compact-gap" : "p-4 md:p-6 lg:p-8",
          fluid && "fluid-padding fluid-gap",
          contentClassName
        )}
        data-testid={testId ? `${testId}-content` : undefined}
      >
        {children}
      </div>
      
      {/* Optional Sticky Bottom CTA */}
      {bottomCta && (
        <div 
          className="sticky-bottom-cta"
          data-testid={testId ? `${testId}-bottom-cta` : undefined}
        >
          {bottomCta}
        </div>
      )}
    </div>
  );
}

/**
 * Compact Section Component
 * Use within MobileCompactLayout for individual sections
 */
interface CompactSectionProps {
  children: ReactNode;
  title?: string;
  description?: string;
  className?: string;
  titleClassName?: string;
  'data-testid'?: string;
}

export function CompactSection({
  children,
  title,
  description,
  className,
  titleClassName,
  'data-testid': testId,
}: CompactSectionProps) {
  return (
    <section 
      className={cn("space-y-4", className)}
      data-testid={testId}
    >
      {(title || description) && (
        <div className="space-y-1">
          {title && (
            <h2 
              className={cn(
                "text-xl md:text-2xl font-semibold text-foreground",
                titleClassName
              )}
              data-testid={testId ? `${testId}-title` : undefined}
            >
              {title}
            </h2>
          )}
          {description && (
            <p 
              className="text-sm text-muted-foreground"
              data-testid={testId ? `${testId}-description` : undefined}
            >
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Touch-Friendly Action Bar
 * Helper component for sticky bottom CTAs
 */
interface TouchActionBarProps {
  children: ReactNode;
  /** Label/description text (optional) */
  label?: string;
  /** Show label only on mobile */
  mobileLabel?: boolean;
  className?: string;
  'data-testid'?: string;
}

export function TouchActionBar({
  children,
  label,
  mobileLabel = false,
  className,
  'data-testid': testId,
}: TouchActionBarProps) {
  return (
    <div 
      className={cn(
        "flex items-center gap-3",
        className
      )}
      data-testid={testId}
    >
      {label && (
        <span 
          className={cn(
            "text-sm font-medium flex-1",
            mobileLabel && "md:hidden"
          )}
          data-testid={testId ? `${testId}-label` : undefined}
        >
          {label}
        </span>
      )}
      <div className="flex items-center gap-2 touch-friendly">
        {children}
      </div>
    </div>
  );
}

/**
 * Usage Examples:
 * 
 * // Basic compact layout
 * <MobileCompactLayout compact>
 *   <CompactSection title="Analytics">
 *     <p>Content here</p>
 *   </CompactSection>
 * </MobileCompactLayout>
 * 
 * // With sticky header and bottom CTA
 * <MobileCompactLayout
 *   header={<div className="p-4"><h1>Dashboard</h1></div>}
 *   bottomCta={
 *     <TouchActionBar label="Ready to save?">
 *       <Button>Cancel</Button>
 *       <Button variant="default">Save</Button>
 *     </TouchActionBar>
 *   }
 *   fluid
 * >
 *   <CompactSection title="Reports">
 *     <DataTable />
 *   </CompactSection>
 * </MobileCompactLayout>
 * 
 * // With custom max-width
 * <MobileCompactLayout maxWidth="5xl" compact>
 *   <CompactSection title="Payroll">
 *     <PayrollTable />
 *   </CompactSection>
 * </MobileCompactLayout>
 */
