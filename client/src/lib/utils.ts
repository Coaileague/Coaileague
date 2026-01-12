import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format role/position names for user-friendly display
 * Converts snake_case, kebab-case, and camelCase to Title Case
 * e.g., "field_worker" -> "Field Worker"
 *       "security-officer" -> "Security Officer"
 */
export function formatRoleDisplay(role: string | null | undefined): string {
  if (!role) return "Employee";
  
  return role
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim() || "Employee";
}
