import { useState, useMemo } from 'react';

export function useTableSort<T>(data: T[], defaultSortKey?: keyof T, defaultDir: 'asc' | 'desc' = 'asc') {
  const [sortKey, setSortKey] = useState<keyof T | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultDir);
  
  const toggleSort = (key: keyof T) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { 
      setSortKey(key); 
      setSortDir('asc'); 
    }
  };
  
  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);
  
  return { sorted, sortKey, sortDir, toggleSort };
}
