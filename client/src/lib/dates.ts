export function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  // If date-only string (YYYY-MM-DD), append time to force local timezone interpretation
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + 'T00:00:00');
  }
  return new Date(dateStr);
}

export function formatDate(date: Date | string | null, format = 'MM/dd/yyyy'): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? parseLocalDate(date) : date;
  if (isNaN(d.getTime())) return '—';
  return format
    .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
    .replace('dd', String(d.getDate()).padStart(2, '0'))
    .replace('yyyy', String(d.getFullYear()));
}
