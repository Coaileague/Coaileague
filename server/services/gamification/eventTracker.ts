import { gamificationService } from './gamificationService';
import { platformEventBus } from '../platformEventBus';
import { db } from '../../db';
import { employees } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Event-driven gamification system
 * Hooks into platform events to award badges and points
 */

export class GamificationEventTracker {
  /**
   * Initialize event listeners for all gamification triggers
   */
  static initializeEventListeners(): void {
    // Time tracking events
    platformEventBus.on('clock_in', (data) => this.handleClockIn(data));
    platformEventBus.on('shift_completed', (data) => this.handleShiftCompleted(data));
    platformEventBus.on('timesheet_approved', (data) => this.handleTimesheetApproved(data));

    // Scheduling events
    platformEventBus.on('shift_accepted', (data) => this.handleShiftAccepted(data));
    platformEventBus.on('shift_swapped', (data) => this.handleShiftSwapped(data));
    platformEventBus.on('schedule_viewed', (data) => this.handleScheduleViewed(data));

    // Approval events
    platformEventBus.on('expense_approved', (data) => this.handleExpenseApproved(data));
    platformEventBus.on('request_approved', (data) => this.handleRequestApproved(data));

    // Platform events
    platformEventBus.on('feature_used', (data) => this.handleFeatureUsed(data));
    platformEventBus.on('profile_completed', (data) => this.handleProfileCompleted(data));

    console.log('[GamificationEventTracker] Event listeners initialized');
  }

  private static async handleClockIn(data: { workspaceId: string; employeeId: string; clockId?: string; isEarly?: boolean }): Promise<void> {
    try {
      const { workspaceId, employeeId, isEarly } = data;
      
      await gamificationService.awardPoints({
        workspaceId,
        employeeId,
        points: 5,
        transactionType: 'clock_in',
        referenceId: data.clockId,
        referenceType: 'clock_entry',
        description: 'Clocked in for the day',
      });

      if (isEarly) {
        await gamificationService.awardPoints({
          workspaceId,
          employeeId,
          points: 10,
          transactionType: 'early_clock_in',
          referenceId: data.clockId,
          referenceType: 'clock_entry',
          description: 'Clocked in early',
        });

        // Notify AI brain of early arrival pattern
        platformEventBus.emit('gamification_milestone', {
          type: 'early_arrival',
          workspaceId,
          employeeId,
          points: 10,
        });
      }
    } catch (error) {
      console.error('[GamificationEventTracker] Error handling clock_in:', error);
    }
  }

  private static async handleShiftCompleted(data: any): Promise<void> {
    try {
      const { workspaceId, employeeId, hoursWorked } = data;
      
      // Award points based on hours
      const points = Math.min(Math.floor(hoursWorked * 2), 50);
      await gamificationService.awardPoints({
        workspaceId,
        employeeId,
        points,
        transactionType: 'shift_completed',
        referenceId: data.shiftId,
        referenceType: 'shift',
        description: `Completed shift (${hoursWorked} hours)`,
      });

      // Check for milestone achievements
      if (hoursWorked >= 8) {
        platformEventBus.emit('gamification_milestone', {
          type: 'full_day_worked',
          workspaceId,
          employeeId,
          points,
        });
      }
    } catch (error) {
      console.error('[GamificationEventTracker] Error handling shift_completed:', error);
    }
  }

  private static async handleTimesheetApproved(data: any): Promise<void> {
    try {
      const { workspaceId, employeeId } = data;
      
      await gamificationService.awardPoints({
        workspaceId,
        employeeId,
        points: 15,
        transactionType: 'timesheet_approved',
        referenceId: data.timesheetId,
        referenceType: 'timesheet',
        description: 'Timesheet approved',
      });
    } catch (error) {
      console.error('[GamificationEventTracker] Error handling timesheet_approved:', error);
    }
  }

  private static async handleShiftAccepted(data: any): Promise<void> {
    try {
      const { workspaceId, employeeId } = data;
      
      await gamificationService.awardPoints({
        workspaceId,
        employeeId,
        points: 5,
        transactionType: 'shift_accepted',
        referenceId: data.shiftId,
        referenceType: 'shift',
        description: 'Accepted a shift',
      });
    } catch (error) {
      console.error('[GamificationEventTracker] Error handling shift_accepted:', error);
    }
  }

  private static async handleShiftSwapped(data: any): Promise<void> {
    try {
      const { workspaceId, employeeId, swappedWith } = data;
      
      // Points for the person doing the swap
      await gamificationService.awardPoints({
        workspaceId,
        employeeId,
        points: 20,
        transactionType: 'shift_swapped',
        referenceId: data.swapId,
        referenceType: 'shift_swap',
        description: 'Swapped a shift with team member',
      });

      // Points for the person receiving the swap
      if (swappedWith) {
        await gamificationService.awardPoints({
          workspaceId,
          employeeId: swappedWith,
          points: 20,
          transactionType: 'shift_swapped',
          referenceId: data.swapId,
          referenceType: 'shift_swap',
          description: 'Received a shift swap',
        });
      }

      platformEventBus.emit('gamification_milestone', {
        type: 'shift_swap',
        workspaceId,
        employeeId,
        points: 20,
      });
    } catch (error) {
      console.error('[GamificationEventTracker] Error handling shift_swapped:', error);
    }
  }

  private static async handleScheduleViewed(data: any): Promise<void> {
    try {
      const { workspaceId, employeeId } = data;
      
      // Small reward for engagement
      await gamificationService.awardPoints({
        workspaceId,
        employeeId,
        points: 2,
        transactionType: 'schedule_viewed',
        referenceId: data.viewId,
        referenceType: 'schedule_view',
        description: 'Viewed schedule',
      });
    } catch (error) {
      console.error('[GamificationEventTracker] Error handling schedule_viewed:', error);
    }
  }

  private static async handleExpenseApproved(data: any): Promise<void> {
    try {
      const { workspaceId, approverId } = data;
      
      if (approverId) {
        await gamificationService.awardPoints({
          workspaceId,
          employeeId: approverId,
          points: 5,
          transactionType: 'expense_approved',
          referenceId: data.expenseId,
          referenceType: 'expense',
          description: 'Approved an expense',
        });
      }
    } catch (error) {
      console.error('[GamificationEventTracker] Error handling expense_approved:', error);
    }
  }

  private static async handleRequestApproved(data: any): Promise<void> {
    try {
      const { workspaceId, approverId } = data;
      
      if (approverId) {
        await gamificationService.awardPoints({
          workspaceId,
          employeeId: approverId,
          points: 10,
          transactionType: 'request_approved',
          referenceId: data.requestId,
          referenceType: 'request',
          description: 'Processed a request',
        });
      }
    } catch (error) {
      console.error('[GamificationEventTracker] Error handling request_approved:', error);
    }
  }

  private static async handleFeatureUsed(data: any): Promise<void> {
    try {
      const { workspaceId, userId, featureName } = data;
      
      // Get employee record
      const [employee] = await db.select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);

      if (!employee) return;

      const pointMap: Record<string, number> = {
        'analytics': 15,
        'reporting': 10,
        'ai_scheduling': 20,
        'mobile_app': 5,
        'helpai_chat': 10,
      };

      const points = pointMap[featureName] || 5;

      await gamificationService.awardPoints({
        workspaceId,
        employeeId: employee.id,
        points,
        transactionType: 'feature_used',
        referenceId: featureName,
        referenceType: 'feature',
        description: `Used ${featureName} feature`,
      });

      platformEventBus.emit('gamification_milestone', {
        type: 'feature_adoption',
        workspaceId,
        employeeId: employee.id,
        feature: featureName,
        points,
      });
    } catch (error) {
      console.error('[GamificationEventTracker] Error handling feature_used:', error);
    }
  }

  private static async handleProfileCompleted(data: any): Promise<void> {
    try {
      const { workspaceId, employeeId } = data;
      
      await gamificationService.awardPoints({
        workspaceId,
        employeeId,
        points: 50,
        transactionType: 'profile_completed',
        referenceId: employeeId,
        referenceType: 'employee',
        description: 'Completed profile setup',
      });

      platformEventBus.emit('gamification_milestone', {
        type: 'profile_complete',
        workspaceId,
        employeeId,
        points: 50,
      });
    } catch (error) {
      console.error('[GamificationEventTracker] Error handling profile_completed:', error);
    }
  }
}

// Initialize on module load
GamificationEventTracker.initializeEventListeners();
