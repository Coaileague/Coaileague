// Centralized shift theme resolver for vibrant schedule colors
// Matches homepage preview with royal blues, magenta/purple, and teal/cyan

import type { Shift, Employee, Client } from "@shared/schema";

export interface ShiftTheme {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  hoverColor: string;
  category: string;
}

// Vibrant color themes matching homepage preview
const CATEGORY_THEMES: Record<string, ShiftTheme> = {
  tech_support: {
    backgroundColor: "#3b82f6", // Royal blue
    borderColor: "#2563eb",
    textColor: "#ffffff",
    hoverColor: "#2563eb",
    category: "Tech Support",
  },
  field_ops: {
    backgroundColor: "#2563eb", // Vibrant blue
    borderColor: "#1d4ed8",
    textColor: "#ffffff",
    hoverColor: "#1d4ed8",
    category: "Field Ops",
  },
  healthcare: {
    backgroundColor: "#0ea5e9", // Sky blue
    borderColor: "#0284c7",
    textColor: "#ffffff",
    hoverColor: "#0284c7",
    category: "Healthcare",
  },
  training: {
    backgroundColor: "#1d4ed8", // Blue
    borderColor: "#1e40af",
    textColor: "#ffffff",
    hoverColor: "#1e40af",
    category: "Training",
  },
  emergency: {
    backgroundColor: "#a855f7", // Magenta/Purple
    borderColor: "#9333ea",
    textColor: "#ffffff",
    hoverColor: "#9333ea",
    category: "Emergency",
  },
  admin: {
    backgroundColor: "#8b5cf6", // Purple
    borderColor: "#7c3aed",
    textColor: "#ffffff",
    hoverColor: "#7c3aed",
    category: "Admin",
  },
  security: {
    backgroundColor: "#14b8a6", // Teal/Cyan
    borderColor: "#0d9488",
    textColor: "#ffffff",
    hoverColor: "#0d9488",
    category: "Security",
  },
  general: {
    backgroundColor: "#3b82f6", // Default royal blue
    borderColor: "#2563eb",
    textColor: "#ffffff",
    hoverColor: "#2563eb",
    category: "General",
  },
};

// Fallback colors for draft/unassigned shifts
const DRAFT_THEME: ShiftTheme = {
  backgroundColor: "#94a3b8", // Gray for drafts
  borderColor: "#64748b",
  textColor: "#ffffff",
  hoverColor: "#64748b",
  category: "Draft",
};

const OPEN_SHIFT_THEME: ShiftTheme = {
  backgroundColor: "#cbd5e1", // Light gray for open shifts
  borderColor: "#94a3b8",
  textColor: "#1e293b",
  hoverColor: "#94a3b8",
  category: "Open Shift",
};

/**
 * Get shift theme based on category, client, or employee color
 * Precedence: shift.category > client.color > employee.color > fallback
 */
export function getShiftTheme(
  shift: Shift,
  client?: Client | null,
  employee?: Employee | null
): ShiftTheme {
  // 1. Check if shift is draft
  if (shift.status === "draft") {
    return DRAFT_THEME;
  }

  // 2. Check if shift is unassigned (open shift)
  if (!shift.employeeId) {
    return OPEN_SHIFT_THEME;
  }

  // 3. Use shift category if defined
  if (shift.category && shift.category !== "general" && CATEGORY_THEMES[shift.category]) {
    return CATEGORY_THEMES[shift.category];
  }

  // 4. Use client color if available
  if (client?.color) {
    return {
      backgroundColor: client.color,
      borderColor: adjustColor(client.color, -20), // Slightly darker
      textColor: "#ffffff",
      hoverColor: adjustColor(client.color, -20),
      category: `${client.firstName} ${client.lastName}`,
    };
  }

  // 5. Use employee color if available
  if (employee?.color) {
    return {
      backgroundColor: employee.color,
      borderColor: adjustColor(employee.color, -20), // Slightly darker
      textColor: "#ffffff",
      hoverColor: adjustColor(employee.color, -20),
      category: `${employee.firstName} ${employee.lastName}`,
    };
  }

  // 6. Fallback to general theme
  return CATEGORY_THEMES.general;
}

/**
 * Adjust color brightness (simple hex manipulation)
 * amount: positive = lighter, negative = darker
 */
function adjustColor(hex: string, amount: number): string {
  // Remove # if present
  hex = hex.replace(/^#/, '');
  
  // Parse RGB
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);
  
  // Adjust
  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));
  
  // Convert back to hex
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Get all available category themes (for UI pickers/legend)
 */
export function getAllCategoryThemes(): Record<string, ShiftTheme> {
  return { ...CATEGORY_THEMES };
}

/**
 * Get theme color for CSS variable use
 */
export function getThemeColorVariables(theme: ShiftTheme): React.CSSProperties {
  return {
    '--shift-bg': theme.backgroundColor,
    '--shift-border': theme.borderColor,
    '--shift-text': theme.textColor,
    '--shift-hover': theme.hoverColor,
  } as React.CSSProperties;
}
