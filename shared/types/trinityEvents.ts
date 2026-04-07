/**
 * Trinity Scheduling Event Types
 * Used for real-time WebSocket communication during auto-scheduling
 */

export interface TrinitySchedulingStartedEvent {
  type: 'trinity_scheduling_started';
  sessionId: string;
  executionId: string;
  workspaceId: string;
  mode: 'optimize' | 'fill_gaps' | 'full_generate';
  totalShifts: number;
  timestamp: string;
}

export interface TrinitySchedulingProgressEvent {
  type: 'trinity_scheduling_progress';
  sessionId: string;
  workspaceId: string;
  currentShiftId: string;
  currentIndex: number;
  totalShifts: number;
  status: 'analyzing' | 'assigned' | 'skipped' | 'failed';
  message: string;
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  timestamp: string;
}

export interface TrinitySchedulingCompletedEvent {
  type: 'trinity_scheduling_completed';
  sessionId: string;
  executionId: string;
  workspaceId: string;
  mutationCount: number;
  summary: {
    shiftsCreated: number;
    shiftsEdited: number;
    shiftsDeleted: number;
    employeesSwapped: number;
    openShiftsFilled: number;
    totalHoursScheduled: number;
    estimatedLaborCost: number;
  };
  timestamp: string;
}

export type TrinitySchedulingEvent = 
  | TrinitySchedulingStartedEvent 
  | TrinitySchedulingProgressEvent 
  | TrinitySchedulingCompletedEvent;
