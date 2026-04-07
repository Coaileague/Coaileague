/**
 * MODULE UTILS — Single Source of Truth for expansion module utilities
 *
 * Used by all 8 expansion module pages. Edit here → changes everywhere.
 */
import { format, parseISO } from "date-fns";

/** Format any ISO date string or null/undefined to "MMM d, yyyy" or "—" */
export function formatDate(d?: string | null): string {
  if (!d) return "—";
  try {
    return format(parseISO(d), "MMM d, yyyy");
  } catch {
    return d;
  }
}

/** Format any number/string value as USD currency or "—" */
export function formatCurrency(v?: number | string | null): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Convert a stat label like "At-Risk Value" → "at-risk-value" for data-testid */
export function makeStatId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Common badge color classes keyed by semantic meaning */
export const BADGE_COLORS = {
  green:  "bg-green-500/15 text-green-600 dark:text-green-400",
  amber:  "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  yellow: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  orange: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  red:    "bg-red-500/15 text-red-600 dark:text-red-400",
  blue:   "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  purple: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  slate:  "bg-slate-500/15 text-slate-600 dark:text-slate-400",
} as const;

export type BadgeColor = keyof typeof BADGE_COLORS;
