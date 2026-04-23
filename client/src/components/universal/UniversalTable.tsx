import { useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

export interface ColumnDef<T> {
  key: keyof T | string;
  header: string;
  sortable?: boolean;
  width?: string;
  render?: (value: unknown, row: T) => React.ReactNode;
  mobileLabel?: string;
  mobileHide?: boolean;
}

interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

interface UniversalTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  loading?: boolean;
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  selectedIds?: Set<unknown>;
  onSelectionChange?: (ids: Set<unknown>) => void;
  idKey?: keyof T;
  pagination?: PaginationConfig;
  sortable?: boolean;
  className?: string;
  'data-testid'?: string;
}

type SortDir = 'asc' | 'desc' | null;

export function UniversalTable<T extends Record<string, unknown>>({
  data,
  columns,
  loading = false,
  empty,
  onRowClick,
  selectable = false,
  selectedIds,
  onSelectionChange,
  idKey = 'id' as keyof T,
  pagination,
  className = '',
  'data-testid': testId,
}: UniversalTableProps<T>) {
  const isMobile = useIsMobile();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const handleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortKey(null);
      setSortDir(null);
    }
  };

  const sortedData = [...data].sort((a, b) => {
    if (!sortKey || !sortDir) return 0;
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp = av === null ? -1 : bv === null ? 1 : av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleSelect = (id: unknown) => {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const toggleAll = () => {
    if (!onSelectionChange || !selectedIds) return;
    if (selectedIds.size === data.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(data.map((r) => r[idKey])));
    }
  };

  const SortIcon = ({ col }: { col: ColumnDef<T> }) => {
    if (sortKey !== col.key) return <ChevronsUpDown size={12} style={{ opacity: 0.4 }} />;
    if (sortDir === 'asc') return <ChevronUp size={12} />;
    return <ChevronDown size={12} />;
  };

  if (loading) {
    return (
      <div data-testid={testId} className={className}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="u-skeleton" style={{ height: '52px', marginBottom: '8px', borderRadius: 'var(--radius-md)' }} />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div data-testid={testId} className={className}>
        {empty ?? (
          <div
            style={{
              padding: 'var(--space-12)',
              textAlign: 'center',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-body)',
            }}
          >
            No data available
          </div>
        )}
      </div>
    );
  }

  if (isMobile) {
    const visibleCols = columns.filter((c) => !c.mobileHide);
    return (
      <div data-testid={testId} className={className} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {sortedData.map((row, ri) => (
          <div
            key={ri}
            data-testid={`row-table-${ri}`}
            onClick={() => onRowClick?.(row)}
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-4)',
              cursor: onRowClick ? 'pointer' : 'default',
            }}
          >
            {visibleCols.map((col) => {
              const val = row[col.key as keyof T];
              const rendered = col.render ? col.render(val, row) : String(val ?? '—');
              return (
                <div key={String(col.key)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)', padding: '4px 0' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-body)', flexShrink: 0 }}>
                    {col.mobileLabel ?? col.header}
                  </span>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-body)', textAlign: 'right' }}>
                    {rendered}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
        {pagination && <TablePagination pagination={pagination} />}
      </div>
    );
  }

  return (
    <div data-testid={testId} className={className} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-default)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border-default)' }}>
              {selectable && (
                <th style={thStyle}>
                  <input
                    type="checkbox"
                    checked={selectedIds?.size === data.length && data.length > 0}
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  style={{ ...thStyle, width: col.width, cursor: col.sortable ? 'pointer' : 'default' }}
                  onClick={col.sortable ? () => handleSort(String(col.key)) : undefined}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', userSelect: 'none' }}>
                    {col.header}
                    {col.sortable && <SortIcon col={col} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, ri) => (
              <tr
                key={ri}
                data-testid={`row-table-${ri}`}
                onClick={() => onRowClick?.(row)}
                style={{
                  borderBottom: '1px solid var(--color-border-subtle)',
                  cursor: onRowClick ? 'pointer' : 'default',
                  background: selectedIds?.has(row[idKey]) ? 'rgba(0,212,255,0.06)' : 'transparent',
                  transition: 'background var(--duration-fast)',
                }}
              >
                {selectable && (
                  <td style={tdStyle}>
                    <input
                      type="checkbox"
                      checked={selectedIds?.has(row[idKey]) ?? false}
                      onChange={() => toggleSelect(row[idKey])}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Select row"
                    />
                  </td>
                )}
                {columns.map((col) => {
                  const val = row[col.key as keyof T];
                  const rendered = col.render ? col.render(val, row) : String(val ?? '—');
                  return (
                    <td key={String(col.key)} style={tdStyle}>
                      {rendered}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination && <TablePagination pagination={pagination} />}
    </div>
  );
}

function TablePagination({ pagination }: { pagination: PaginationConfig }) {
  const { page, pageSize, total, onPageChange } = pagination;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
        flexWrap: 'wrap',
        fontSize: 'var(--text-sm)',
        color: 'var(--color-text-secondary)',
        fontFamily: 'var(--font-body)',
      }}
    >
      <span>{start}–{end} of {total}</span>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button
          data-testid="button-pagination-prev"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          style={paginationBtnStyle(page <= 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          data-testid="button-pagination-next"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          style={paginationBtnStyle(page >= totalPages)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: 'var(--space-3) var(--space-4)',
  textAlign: 'left',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--weight-semibold)' as any,
  color: 'var(--color-text-secondary)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: 'var(--space-3) var(--space-4)',
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text-primary)',
  verticalAlign: 'middle',
};

const paginationBtnStyle = (disabled: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  border: `1px solid var(--color-border-default)`,
  borderRadius: 'var(--radius-md)',
  background: 'transparent',
  color: disabled ? 'var(--color-text-disabled)' : 'var(--color-text-primary)',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.4 : 1,
});
