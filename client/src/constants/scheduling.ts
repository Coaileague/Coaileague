/**
 * CoAIleague Scheduling Configuration
 * Centralized design tokens for shift management visual system
 * 
 * STATUS LOGIC:
 * - DRAFT: New shifts start here (dashed amber border)
 * - ASSIGNED: When an officer is added (dashed blue border)
 * - PUBLISHED: When shift is published (solid green border)
 * - UNFILLED: Past start time with no officer (solid red border)
 * - ACTIVE: Officer clocks in via GPS (solid purple with pulse)
 * - COMPLETED: After shift ends (solid gray border)
 * 
 * POSITION COLORS:
 * - Armed: #DC2626 (red)
 * - Unarmed: #475569 (slate)
 * - Supervisor: #D97706 (amber)
 * - Manager: #4F46E5 (indigo)
 * - Owner: #7C3AED (violet)
 */

export interface ShiftStatusConfig {
  key: string;
  label: string;
  description: string;
  borderStyle: string;
  bgColor: string;
  badgeColor: string;
  tailwindBorder: string;
  tailwindBg: string;
}

export interface PositionTypeConfig {
  key: string;
  label: string;
  color: string;
  bgColor: string;
  shortLabel: string;
  tailwindColor: string;
  tailwindBg: string;
}

export const SHIFT_STATUS: Record<string, ShiftStatusConfig> = {
  DRAFT: {
    key: 'draft',
    label: 'Draft',
    description: 'Shift created, needs assignment',
    borderStyle: '2px dashed #F59E0B',
    bgColor: 'rgba(245, 158, 11, 0.08)',
    badgeColor: '#F59E0B',
    tailwindBorder: 'border-2 border-dashed border-amber-500',
    tailwindBg: 'bg-amber-500/5',
  },
  ASSIGNED: {
    key: 'assigned',
    label: 'Assigned',
    description: 'Officer assigned, awaiting publish',
    borderStyle: '2px dashed #3B82F6',
    bgColor: 'rgba(59, 130, 246, 0.08)',
    badgeColor: '#3B82F6',
    tailwindBorder: 'border-2 border-dashed border-blue-500',
    tailwindBg: 'bg-blue-500/5',
  },
  PUBLISHED: {
    key: 'published',
    label: 'Published',
    description: 'Live shift, officer notified',
    borderStyle: '2px solid #10B981',
    bgColor: 'rgba(16, 185, 129, 0.08)',
    badgeColor: '#10B981',
    tailwindBorder: 'border-2 border-solid border-emerald-500',
    tailwindBg: 'bg-emerald-500/5',
  },
  UNFILLED: {
    key: 'unfilled',
    label: 'Unfilled',
    description: 'Urgent - needs immediate attention',
    borderStyle: '2px solid #EF4444',
    bgColor: 'rgba(239, 68, 68, 0.08)',
    badgeColor: '#EF4444',
    tailwindBorder: 'border-2 border-solid border-red-500',
    tailwindBg: 'bg-red-500/5',
  },
  ACTIVE: {
    key: 'active',
    label: 'In Progress',
    description: 'Officer currently on duty',
    borderStyle: '2px solid #8B5CF6',
    bgColor: 'rgba(139, 92, 246, 0.08)',
    badgeColor: '#8B5CF6',
    tailwindBorder: 'border-2 border-solid border-violet-500',
    tailwindBg: 'bg-violet-500/5',
  },
  COMPLETED: {
    key: 'completed',
    label: 'Completed',
    description: 'Shift finished',
    borderStyle: '2px solid #6B7280',
    bgColor: 'rgba(107, 114, 128, 0.08)',
    badgeColor: '#6B7280',
    tailwindBorder: 'border-2 border-solid border-gray-500',
    tailwindBg: 'bg-gray-500/5',
  },
};

export const POSITION_TYPES: Record<string, PositionTypeConfig> = {
  ARMED: {
    key: 'armed',
    label: 'Armed Officer',
    color: '#DC2626',
    bgColor: 'rgba(220, 38, 38, 0.15)',
    shortLabel: 'ARM',
    tailwindColor: 'text-red-600',
    tailwindBg: 'bg-red-600/15',
  },
  UNARMED: {
    key: 'unarmed',
    label: 'Unarmed Officer',
    color: '#475569',
    bgColor: 'rgba(71, 85, 105, 0.15)',
    shortLabel: 'UNA',
    tailwindColor: 'text-slate-600',
    tailwindBg: 'bg-slate-600/15',
  },
  SUPERVISOR: {
    key: 'supervisor',
    label: 'Supervisor',
    color: '#D97706',
    bgColor: 'rgba(217, 119, 6, 0.15)',
    shortLabel: 'SUP',
    tailwindColor: 'text-amber-600',
    tailwindBg: 'bg-amber-600/15',
  },
  MANAGER: {
    key: 'manager',
    label: 'Manager',
    color: '#4F46E5',
    bgColor: 'rgba(79, 70, 229, 0.15)',
    shortLabel: 'MGR',
    tailwindColor: 'text-indigo-600',
    tailwindBg: 'bg-indigo-600/15',
  },
  OWNER: {
    key: 'owner',
    label: 'Owner/Admin',
    color: '#7C3AED',
    bgColor: 'rgba(124, 58, 237, 0.15)',
    shortLabel: 'OWN',
    tailwindColor: 'text-violet-600',
    tailwindBg: 'bg-violet-600/15',
  },
};

/**
 * Determine shift status automatically based on shift data
 * Supports both computed status (from times) and backend status field
 */
export function getShiftStatus(shift: {
  startTime: Date | string;
  endTime: Date | string;
  officerId?: string | null;
  isPublished?: boolean;
  clockedIn?: boolean;
  status?: string; // Backend status field: 'draft', 'published', 'confirmed', etc.
}): ShiftStatusConfig {
  const now = new Date();
  const startTime = new Date(shift.startTime);
  const endTime = new Date(shift.endTime);

  // Completed: past end time with officer assigned
  if (now > endTime && shift.officerId) {
    return SHIFT_STATUS.COMPLETED;
  }

  // Active: officer clocked in, during shift time
  if (shift.clockedIn && now >= startTime && now <= endTime) {
    return SHIFT_STATUS.ACTIVE;
  }

  // Unfilled: past start time with no officer
  if (now > startTime && !shift.officerId) {
    return SHIFT_STATUS.UNFILLED;
  }

  // Use backend status field if available
  if (shift.status) {
    const normalizedStatus = shift.status.toLowerCase();
    if (normalizedStatus === 'published' || normalizedStatus === 'confirmed') {
      return shift.officerId ? SHIFT_STATUS.PUBLISHED : SHIFT_STATUS.UNFILLED;
    }
    if (normalizedStatus === 'draft' || normalizedStatus === 'pending') {
      return shift.officerId ? SHIFT_STATUS.ASSIGNED : SHIFT_STATUS.DRAFT;
    }
  }

  // Published: has officer, is published (fallback)
  if (shift.isPublished && shift.officerId) {
    return SHIFT_STATUS.PUBLISHED;
  }

  // Assigned: has officer, not published
  if (shift.officerId && !shift.isPublished) {
    return SHIFT_STATUS.ASSIGNED;
  }

  // Draft: default state
  return SHIFT_STATUS.DRAFT;
}

/**
 * Get position type by key
 */
export function getPositionType(positionKey: string): PositionTypeConfig {
  const upperKey = positionKey?.toUpperCase() || 'UNARMED';
  return POSITION_TYPES[upperKey] || POSITION_TYPES.UNARMED;
}

/**
 * Status key to config lookup
 */
export function getShiftStatusByKey(key: string): ShiftStatusConfig {
  const upperKey = key?.toUpperCase() || 'DRAFT';
  return SHIFT_STATUS[upperKey] || SHIFT_STATUS.DRAFT;
}

export interface PositionCategoryColor {
  id: string;
  label: string;
  color: string;
  borderClass: string;
  bgClass: string;
  textClass: string;
  dotClass: string;
}

export const POSITION_CATEGORY_COLORS: Record<string, PositionCategoryColor> = {
  chiefs: {
    id: 'chiefs',
    label: 'Executive Leadership',
    color: '#FF8C00',
    borderClass: 'border-l-[#FF8C00]',
    bgClass: 'bg-orange-500/10',
    textClass: 'text-orange-700 dark:text-orange-300',
    dotClass: 'bg-orange-500',
  },
  admin_command: {
    id: 'admin_command',
    label: 'Administrative Command',
    color: '#8B5CF6',
    borderClass: 'border-l-[#8B5CF6]',
    bgClass: 'bg-violet-500/10',
    textClass: 'text-violet-700 dark:text-violet-300',
    dotClass: 'bg-violet-500',
  },
  field_supervisors: {
    id: 'field_supervisors',
    label: 'Field Supervisors',
    color: '#3B82F6',
    borderClass: 'border-l-[#3B82F6]',
    bgClass: 'bg-blue-500/10',
    textClass: 'text-blue-700 dark:text-blue-300',
    dotClass: 'bg-blue-500',
  },
  admin_staff: {
    id: 'admin_staff',
    label: 'Administrative Staff',
    color: '#6B7280',
    borderClass: 'border-l-[#6B7280]',
    bgClass: 'bg-gray-500/10',
    textClass: 'text-gray-700 dark:text-gray-300',
    dotClass: 'bg-gray-500',
  },
  case_managers: {
    id: 'case_managers',
    label: 'Case Managers',
    color: '#F59E0B',
    borderClass: 'border-l-[#F59E0B]',
    bgClass: 'bg-amber-500/10',
    textClass: 'text-amber-700 dark:text-amber-300',
    dotClass: 'bg-amber-500',
  },
  dispatchers: {
    id: 'dispatchers',
    label: 'Dispatchers',
    color: '#06B6D4',
    borderClass: 'border-l-[#06B6D4]',
    bgClass: 'bg-cyan-500/10',
    textClass: 'text-cyan-700 dark:text-cyan-300',
    dotClass: 'bg-cyan-500',
  },
  armed: {
    id: 'armed',
    label: 'Armed Staff',
    color: '#DC2626',
    borderClass: 'border-l-[#DC2626]',
    bgClass: 'bg-red-500/10',
    textClass: 'text-red-700 dark:text-red-300',
    dotClass: 'bg-red-500',
  },
  unarmed: {
    id: 'unarmed',
    label: 'Unarmed Staff',
    color: '#92400E',
    borderClass: 'border-l-[#92400E]',
    bgClass: 'bg-amber-900/10',
    textClass: 'text-amber-900 dark:text-amber-400',
    dotClass: 'bg-amber-800',
  },
};

export function getPositionCategoryColor(categoryId: string | null | undefined): PositionCategoryColor {
  if (!categoryId) return POSITION_CATEGORY_COLORS.unarmed;
  return POSITION_CATEGORY_COLORS[categoryId] || POSITION_CATEGORY_COLORS.unarmed;
}
