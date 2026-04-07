import { useState, useCallback, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X, Filter, Layers } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  placeholder: string;
  options: FilterOption[];
}

export interface GroupByConfig {
  key: string;
  label: string;
}

export interface ListFilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters: FilterConfig[];
  filterValues: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
  groupByOptions?: GroupByConfig[];
  groupByValue?: string;
  onGroupByChange?: (value: string) => void;
  resultCount?: number;
  totalCount?: number;
}

export function ListFilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  filters,
  filterValues,
  onFilterChange,
  groupByOptions,
  groupByValue,
  onGroupByChange,
  resultCount,
  totalCount,
}: ListFilterBarProps) {
  const isMobile = useIsMobile();
  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount = useMemo(() => {
    return Object.values(filterValues).filter((v) => v && v !== "__all__").length;
  }, [filterValues]);

  const hasActiveFilters = activeFilterCount > 0 || searchValue.length > 0;

  const handleClearAll = useCallback(() => {
    onSearchChange("");
    filters.forEach((f) => onFilterChange(f.key, "__all__"));
    if (onGroupByChange) onGroupByChange("__none__");
  }, [onSearchChange, filters, onFilterChange, onGroupByChange]);

  return (
    <div className="space-y-2" data-testid="list-filter-bar">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
            data-testid="input-filter-search"
          />
        </div>

        <Button
          variant="outline"
          size="default"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-1.5"
          data-testid="button-toggle-filters"
        >
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-0.5">
              {activeFilterCount}
            </Badge>
          )}
        </Button>

        {groupByOptions && groupByOptions.length > 0 && (
          <Select
            value={groupByValue || "__none__"}
            onValueChange={(v) => onGroupByChange?.(v)}
          >
            <SelectTrigger
              className="w-auto min-w-[140px] gap-1.5"
              data-testid="select-group-by"
            >
              <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
              <SelectValue placeholder="Group by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No grouping</SelectItem>
              {groupByOptions.map((opt) => (
                <SelectItem key={opt.key} value={opt.key}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="default"
            onClick={handleClearAll}
            className="gap-1 text-muted-foreground"
            data-testid="button-clear-filters"
          >
            <X className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </Button>
        )}

        {resultCount !== undefined && totalCount !== undefined && resultCount !== totalCount && (
          <span className="text-xs text-muted-foreground whitespace-nowrap" data-testid="text-filter-count">
            {resultCount} of {totalCount}
          </span>
        )}
      </div>

      {showFilters && (
        <div
          className={`flex gap-2 ${isMobile ? "flex-col" : "flex-wrap items-center"}`}
          data-testid="filter-panel"
        >
          {filters.map((filter) => (
            <Select
              key={filter.key}
              value={filterValues[filter.key] || "__all__"}
              onValueChange={(v) => onFilterChange(filter.key, v)}
            >
              <SelectTrigger
                className={isMobile ? "w-full" : "w-auto min-w-[150px]"}
                data-testid={`select-filter-${filter.key}`}
              >
                <SelectValue placeholder={filter.placeholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All {filter.label}</SelectItem>
                {filter.options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </div>
      )}
    </div>
  );
}

export function useListFilters(initialFilters: Record<string, string> = {}, syncWithUrl = false) {
  const [location, setLocation] = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), [window.location.search]);

  const [searchValue, setSearchValue] = useState(() => {
    if (syncWithUrl) {
      return searchParams.get("search") || "";
    }
    return "";
  });

  const [filterValues, setFilterValues] = useState<Record<string, string>>(() => {
    if (syncWithUrl) {
      const filters = { ...initialFilters };
      searchParams.forEach((value, key) => {
        if (key !== "search" && key !== "groupBy") {
          filters[key] = value;
        }
      });
      return filters;
    }
    return initialFilters;
  });

  const [groupByValue, setGroupByValue] = useState(() => {
    if (syncWithUrl) {
      return searchParams.get("groupBy") || "__none__";
    }
    return "__none__";
  });

  useEffect(() => {
    if (syncWithUrl) {
      const params = new URLSearchParams();
      if (searchValue) params.set("search", searchValue);
      Object.entries(filterValues).forEach(([key, value]) => {
        if (value && value !== "__all__") params.set(key, value);
      });
      if (groupByValue && groupByValue !== "__none__") params.set("groupBy", groupByValue);

      const newSearch = params.toString();
      const currentSearch = window.location.search.replace(/^\?/, "");
      
      if (newSearch !== currentSearch) {
        setLocation(`${window.location.pathname}${newSearch ? `?${newSearch}` : ""}`, { replace: true });
      }
    }
  }, [searchValue, filterValues, groupByValue, syncWithUrl, setLocation]);

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  return {
    searchValue,
    setSearchValue,
    filterValues,
    handleFilterChange,
    groupByValue,
    setGroupByValue,
  };
}

export function groupItems<T>(
  items: T[],
  groupKey: string,
  getGroupValue: (item: T) => string,
): { label: string; items: T[] }[] {
  if (groupKey === "__none__") {
    return [{ label: "", items }];
  }
  const groups: Record<string, T[]> = {};
  items.forEach((item) => {
    const val = getGroupValue(item) || "Unassigned";
    if (!groups[val]) groups[val] = [];
    groups[val].push(item);
  });
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, items]) => ({ label, items }));
}
