/**
 * DataSummaryCard Component
 * 
 * Mobile-optimized card for displaying table row data with progressive disclosure.
 * Desktop shows full table, mobile transforms rows into cards with accordion details.
 * 
 * Features:
 * - P1 fields always visible (summary)
 * - P2/P3 fields in accordion (progressive disclosure)
 * - Responsive column visibility
 * - Accessible table semantics preserved
 */

import { ReactNode, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ColumnConfig } from "@/lib/responsive-utils";

export interface DataField {
  key: string;
  label: string;
  value: ReactNode;
  priority: 'P1' | 'P2' | 'P3';
  badge?: boolean; // Render as badge instead of text
  className?: string;
}

interface DataSummaryCardProps {
  /** Unique identifier for the card */
  id: string | number;
  
  /** Array of data fields to display */
  fields: DataField[];
  
  /** Optional title (first P1 field used if not provided) - supports ReactNode for icons, badges, etc. */
  title?: ReactNode;
  
  /** Optional subtitle (second P1 field used if not provided) */
  subtitle?: ReactNode;
  
  /** Show all fields expanded by default */
  defaultExpanded?: boolean;
  
  /** Additional CSS classes */
  className?: string;
  
  /** Click handler for entire card */
  onClick?: () => void;
  
  /** Optional action buttons in card header */
  actions?: ReactNode;
  
  /** Test ID prefix */
  'data-testid'?: string;
}

export function DataSummaryCard({
  id,
  fields,
  title,
  subtitle,
  defaultExpanded = false,
  className,
  onClick,
  actions,
  'data-testid': testId,
}: DataSummaryCardProps) {
  // Track accordion open state
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  // Separate fields by priority
  const p1Fields = fields.filter(f => f.priority === 'P1');
  const detailFields = fields.filter(f => f.priority !== 'P1');
  
  // Auto-generate title/subtitle from P1 fields if not provided
  // Keep as ReactNode to support JSX, icons, badges, etc.
  const cardTitle = title ?? p1Fields[0]?.value ?? 'Item';
  const cardSubtitle = subtitle ?? p1Fields[1]?.value;
  
  const hasDetails = detailFields.length > 0;
  
  return (
    <div
      className={cn(
        "bg-card border border-border rounded-lg overflow-hidden",
        onClick && "cursor-pointer hover-elevate active-elevate-2",
        className
      )}
      onClick={onClick}
      data-testid={testId ? `${testId}-${id}` : `card-${id}`}
    >
      {/* Card Header - Always Visible (P1 Fields) */}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Title */}
            <h3 
              className="font-semibold text-base text-foreground truncate"
              data-testid={testId ? `${testId}-${id}-title` : `card-${id}-title`}
            >
              {cardTitle}
            </h3>
            
            {/* Subtitle */}
            {cardSubtitle && (
              <div 
                className="text-sm text-muted-foreground mt-1"
                data-testid={testId ? `${testId}-${id}-subtitle` : `card-${id}-subtitle`}
              >
                {cardSubtitle}
              </div>
            )}
          </div>
          
          {/* Actions */}
          {actions && (
            <div 
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
              data-testid={testId ? `${testId}-${id}-actions` : `card-${id}-actions`}
            >
              {actions}
            </div>
          )}
        </div>
        
        {/* Additional P1 Fields (beyond title/subtitle) */}
        {p1Fields.length > 2 && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
            {p1Fields.slice(2).map((field) => (
              <DataFieldDisplay 
                key={field.key} 
                field={field}
                testId={testId ? `${testId}-${id}-${field.key}` : `card-${id}-${field.key}`}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Details Section - Collapsible (P2/P3 Fields) */}
      {hasDetails && (
        <div onClick={(e) => e.stopPropagation()}>
          <Accordion 
            type="single" 
            collapsible 
            value={isExpanded ? "details" : undefined}
            onValueChange={(value) => setIsExpanded(value === "details")}
            className="border-t border-border"
          >
            <AccordionItem value="details" className="border-0">
              <AccordionTrigger 
                className="px-4 py-3 text-sm hover:no-underline hover:bg-muted/50"
                data-testid={testId ? `${testId}-${id}-toggle` : `card-${id}-toggle`}
              >
                <span className="font-medium">
                  {isExpanded ? "Hide" : "Show"} Details
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-3">
                  {detailFields.map((field) => (
                    <DataFieldDisplay 
                      key={field.key} 
                      field={field} 
                      fullWidth
                      testId={testId ? `${testId}-${id}-${field.key}` : `card-${id}-${field.key}`}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}
    </div>
  );
}

/**
 * Individual Field Display Component
 */
interface DataFieldDisplayProps {
  field: DataField;
  fullWidth?: boolean;
  testId?: string;
}

function DataFieldDisplay({ field, fullWidth = false, testId }: DataFieldDisplayProps) {
  return (
    <div 
      className={cn(
        "space-y-1",
        field.className
      )}
      data-testid={testId}
    >
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {field.label}
      </div>
      <div className="text-sm text-foreground">
        {field.badge && typeof field.value === 'string' ? (
          <Badge variant="secondary">{field.value}</Badge>
        ) : (
          field.value
        )}
      </div>
    </div>
  );
}

/**
 * Responsive Table Wrapper
 * Shows shadcn Table on desktop, DataSummaryCards on mobile
 */
interface ResponsiveTableWrapperProps {
  /** Desktop table content */
  desktopTable: ReactNode;
  
  /** Mobile cards content */
  mobileCards: ReactNode;
  
  /** Breakpoint for switching (default: 768px) */
  breakpoint?: 'sm' | 'md' | 'lg';
  
  className?: string;
  'data-testid'?: string;
}

const mobileVisibilityMap = {
  sm: 'sm:!hidden', // Hide at 640px+ (force with !important)
  md: 'md:!hidden', // Hide at 768px+ (force with !important)
  lg: 'lg:!hidden', // Hide at 1024px+ (force with !important)
};

const desktopVisibilityMap = {
  sm: '!hidden sm:!block', // Show at 640px+ (force with !important)
  md: '!hidden md:!block', // Show at 768px+ (force with !important)
  lg: '!hidden lg:!block', // Show at 1024px+ (force with !important)
};

export function ResponsiveTableWrapper({
  desktopTable,
  mobileCards,
  breakpoint = 'md',
  className,
  'data-testid': testId,
}: ResponsiveTableWrapperProps) {
  return (
    <div className={className} data-testid={testId}>
      {/* Mobile Cards - Visible by default, hidden at breakpoint+ */}
      <div className={mobileVisibilityMap[breakpoint]}>
        {mobileCards}
      </div>
      
      {/* Desktop Table - Hidden by default, visible at breakpoint+ */}
      <div className={desktopVisibilityMap[breakpoint]}>
        {desktopTable}
      </div>
    </div>
  );
}

/**
 * Helper: Transform table columns config to DataField format
 */
export function columnsToDataFields<T extends Record<string, any>>(
  rowData: T,
  columns: ColumnConfig[],
  renderFunctions?: Record<string, (value) => ReactNode>
): DataField[] {
  return columns.map(col => ({
    key: col.key,
    label: col.mobileLabel || col.label,
    value: renderFunctions?.[col.key] 
      ? renderFunctions[col.key](rowData[col.key])
      : rowData[col.key],
    priority: col.priority,
  }));
}

/**
 * Usage Examples:
 * 
 * // Basic card with auto title/subtitle from P1 fields
 * <DataSummaryCard
 *   id={employee.id}
 *   fields={[
 *     { key: 'name', label: 'Name', value: 'John Doe', priority: 'P1' },
 *     { key: 'status', label: 'Status', value: 'Active', priority: 'P1', badge: true },
 *     { key: 'dept', label: 'Department', value: 'Engineering', priority: 'P2' },
 *     { key: 'hire', label: 'Hire Date', value: '2023-01-15', priority: 'P3' },
 *   ]}
 * />
 * 
 * // Responsive table wrapper
 * <ResponsiveTableWrapper
 *   desktopTable={<Table>...</Table>}
 *   mobileCards={
 *     <div className="space-y-3">
 *       {employees.map(emp => (
 *         <DataSummaryCard key={emp.id} id={emp.id} fields={...} />
 *       ))}
 *     </div>
 *   }
 * />
 * 
 * // With custom actions
 * <DataSummaryCard
 *   id={invoice.id}
 *   fields={invoiceFields}
 *   actions={
 *     <>
 *       <Button size="sm" variant="ghost">Edit</Button>
 *       <Button size="sm" variant="default">Pay</Button>
 *     </>
 *   }
 *   onClick={() => navigate(`/invoices/${invoice.id}`)}
 * />
 */
