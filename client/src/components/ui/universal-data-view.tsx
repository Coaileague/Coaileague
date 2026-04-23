import { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface Column<T> {
  key: string
  header: string
  render: (item: T, index: number) => ReactNode
  className?: string
  hideOnMobile?: boolean
  mobileLabel?: string
}

interface UniversalDataViewProps<T> {
  data: T[]
  columns: Column<T>[]
  keyExtractor: (item: T, index: number) => string
  emptyMessage?: string
  emptyIcon?: ReactNode
  className?: string
  tableClassName?: string
  cardClassName?: string
  onRowClick?: (item: T, index: number) => void
  rowTestId?: (item: T, index: number) => string
  mobileCardRenderer?: (item: T, index: number) => ReactNode
  forceMode?: "table" | "cards"
}

export function UniversalDataView<T>({
  data,
  columns,
  keyExtractor,
  emptyMessage = "Nothing to show yet",
  emptyIcon,
  className,
  tableClassName,
  cardClassName,
  onRowClick,
  rowTestId,
  mobileCardRenderer,
  forceMode,
}: UniversalDataViewProps<T>) {
  const isMobile = useIsMobile()
  const showCards = forceMode === "cards" || (forceMode !== "table" && isMobile)

  if (data.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
        {emptyIcon}
        <p className="text-sm text-muted-foreground mt-2">{emptyMessage}</p>
      </div>
    )
  }

  if (showCards) {
    return (
      <div className={cn("space-y-3", className)}>
        {data.map((item, index) => {
          const key = keyExtractor(item, index)

          if (mobileCardRenderer) {
            return (
              <div
                key={key}
                data-testid={rowTestId?.(item, index)}
                onClick={onRowClick ? () => onRowClick(item, index) : undefined}
                className={cn(onRowClick && "cursor-pointer")}
              >
                {mobileCardRenderer(item, index)}
              </div>
            )
          }

          const visibleColumns = columns.filter(c => !c.hideOnMobile || !isMobile)

          return (
            <div
              key={key}
              data-testid={rowTestId?.(item, index)}
              onClick={onRowClick ? () => onRowClick(item, index) : undefined}
              className={cn(
                "bg-card border border-border rounded-md p-4",
                onRowClick && "cursor-pointer hover-elevate",
                cardClassName
              )}
            >
              <dl className="space-y-2">
                {visibleColumns.map(col => (
                  <div key={col.key} className="flex justify-between items-start gap-2">
                    <dt className="text-sm font-medium text-muted-foreground min-w-0 flex-1">
                      {col.mobileLabel || col.header}:
                    </dt>
                    <dd className={cn("text-sm text-foreground text-right min-w-0 flex-1", col.className)}>
                      {col.render(item, index)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className={cn("rounded-md border", className)}>
      <Table className={tableClassName}>
        <TableHeader>
          <TableRow>
            {columns.map(col => (
              <TableHead key={col.key} className={col.className}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item, index) => (
            <TableRow
              key={keyExtractor(item, index)}
              data-testid={rowTestId?.(item, index)}
              onClick={onRowClick ? () => onRowClick(item, index) : undefined}
              className={cn(onRowClick && "cursor-pointer")}
            >
              {columns.map(col => (
                <TableCell key={col.key} className={col.className}>
                  {col.render(item, index)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
