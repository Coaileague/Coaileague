import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SortableHeaderProps<T> {
  column: keyof T;
  sortKey: keyof T | null;
  sortDir: 'asc' | 'desc';
  onSort: (key: keyof T) => void;
  children: React.ReactNode;
  className?: string;
}

export function SortableHeader<T>({
  column,
  sortKey,
  sortDir,
  onSort,
  children,
  className,
}: SortableHeaderProps<T>) {
  const isActive = sortKey === column;

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`-ml-3 h-8 data-[state=open]:bg-accent ${className}`}
      onClick={() => onSort(column)}
      data-testid={`sort-header-${String(column)}`}
    >
      <span>{children}</span>
      {isActive ? (
        sortDir === "asc" ? (
          <ChevronUp className="ml-2 h-4 w-4" />
        ) : (
          <ChevronDown className="ml-2 h-4 w-4" />
        )
      ) : (
        <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
      )}
    </Button>
  );
}
