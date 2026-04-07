import { gamificationService } from './gamificationService';
import { createLogger } from '../../lib/logger';
import { 
  gamificationEvents, 
  emitGamificationEvent,
  type ClockInEvent,
  type ShiftEvent,
  type ApprovalEvent,
  type FeatureEvent,
  type MilestoneEvent,
  type OnboardingEvent,
  type TutorialEvent,
  type MigrationEvent,
  type OrgSetupEvent
} from './gamificationEvents';
import { db } from '../../db';
import { employees } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const log = createLogger('GamificationEventTracker');

/**
 * Event-driven gamification system
 * Hooks into platform events to award badges and points
 */
export class GamificationEventTracker {
  private static initialized = false;

  /**
   * Initialize event listeners for all gamification triggers
   */
  static initializeEventListeners(): void {
    if (this.initialized) {
      log.info('[GamificationEventTracker] Already initialized, skipping');
      return;
    }

    // Time tracking events
    gamificationEvents.on('clock_in', (data: ClockInEvent) => this.handleClockIn(data));
    gamificationEvents.on('clock_out', (data: ClockInEvent) => this.handleClockOut(data));
    gamificationEvents.on('shift_completed', (data: ShiftEvent) => this.handleShiftCompleted(data));
    gamificationEvents.on('timesheet_approved', (data: ApprovalEvent) => this.handleTimesheetApproved(data));

    // Scheduling events
    gamificationEvents.on('shift_accepted', (data: ShiftEvent) => this.handleShiftAccepted(data));
    gamificationEvents.on('shift_swapped', (data: ShiftEvent) => this.handleShiftSwapped(data));
    gamificationEvents.on('schedule_viewed', (data: ShiftEvent) => this.handleScheduleViewed(data));

    // Approval events
    gamificationEvents.on('expense_approved', (data: ApprovalEvent) => this.handleExpenseApproved(data));
    gamificationEvents.on('request_approved', (data: ApprovalEvent) => this.handleRequestApproved(data));

    // Platform events
    gamificationEvents.on('feature_used', (data: FeatureEvent) => this.handleFeatureUsed(data));
    gamificationEvents.on('profile_completed', (data: ApprovalEvent) => this.handleProfileCompleted(data));

    // Onboarding & Tutorial events
    gamificationEvents.on('onboarding_step_completed', (data: OnboardingEvent) => this.handleOnboardingStepCompleted(data));
    gamificationEvents.on('onboarding_completed', (data: OnboardingEvent) => this.handleOnboardingCompleted(data));
    gamificationEvents.on('tutorial_step_completed', (data: TutorialEvent) => this.handleTutorialStepCompleted(data));
    gamificationEvents.on('tutorial_completed', (data: TutorialEvent) => this.handleTutorialCompleted(data));

    // Migration events
    gamificationEvents.on('migration_started', (data: MigrationEvent) => this.handleMigrationStarted(data));
    gamificationEvents.on('migration_document_uploaded', (data: MigrationEvent) => this.handleMigrationDocumentUploaded(data));
    gamificationEvents.on('migration_data_imported', (data: MigrationEvent) => this.handleMigrationDataImported(data));
    gamificationEvents.on('migration_completed', (data: MigrationEvent) => this.handleMigrationCompleted(data));

    // Org setup events
    gamificationEvents.on('org_setup_started', (data: OrgSetupEvent) => this.handleOrgSetupStarted(data));
    gamificationEvents.on('org_setup_step_completed', (data: OrgSetupEvent) => this.handleOrgSetupStepCompleted(data));
    gamificationEvents.on('org_ready_to_work', (data: OrgSetupEvent) => this.handleOrgReadyToWork(data));

    this.initialized = true;
    log.info('[GamificationEventTracker] Event listeners initialized');
  }

  private static async handleClockIn(data: ClockInEvent): Promise<void> {
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
        emitGamificationEvent('gamification_milestone', {
          type: 'early_arrival',
          workspaceId,
          employeeId,
          points: 10,
        });
      }

      log.info(`[Gamification] Clock-in points awarded to ${employeeId}`);
    } catch (error) {
      log.error('[GamificationEventTracker] Error handling clock_in:', error);
    }
  }

  private static async handleClockOut(data: ClockInEvent): Promise<void> {
    try {
      const { workspaceId, employeeId } = data;
      
      await gamificationService.awardPoints({
        workspaceId,
        employeeId,
        points: 3,
        transactionType: 'clock_out',
        referenceId: data.clockId,
        referenceType: 'clock_entry',
        description: 'Clocked out for the day',
      });
    } catch (error) {
      log.error('[GamificationEventTracker] Error handling clock_out:', error);
    }
  }

  private static async handleShiftCompleted(data: ShiftEvent): Promise<void> {
    try {
      const { workspaceId, employeeId, hoursWorked } = data;
      
      // Award points based on hours
      const points = Math.min(Math.floor((hoursWorked || 0) * 2), 50);
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
      if (hoursWorked && hoursWorked >= 8) {
        emitGamificationEvent('gamification_milestone', {
          type: 'full_day_worked',
          workspaceId,
          employeeId,
          points,
        });
      }
    } catch (error) {
      log.error('[GamificationEventTracker] Error handling shift_completed:', error);
    }
  }

  private static async handleTimesheetApproved(data: ApprovalEvent): Promise<void> {
    try {
      const { workspaceId, employeeId } = data;
      
      if (!employeeId) return;

      await gamificationService.awardPoints({
        workspaceId,
        employeeId,
        points: 15,
        transactionType: 'timesheet_approved',
        referenceId: data.referenceId,
        referenceType: 'timesheet',
        description: 'Timesheet approved',
      });
    } catch (error) {
      log.error('[GamificationEventTracker] Error handling timesheet_approved:', error);
    }
  }

  private static async handleShiftAccepted(data: ShiftEvent): Promise<void> {
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
      log.error('[GamificationEventTracker] Error handling shift_accepted:', error);
    }
  }

  private static async handleShiftSwapped(data: ShiftEvent): Promise<void> {
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

      emitGamificationEvent('gamification_milestone', {
        type: 'shift_swap',
        workspaceId,
        employeeId,
        points: 20,
      });
    } catch (error) {
      log.error('[GamificationEventTracker] Error handling shift_swapped:', error);
    }
  }

  private static async handleScheduleViewed(data: ShiftEvent): Promise<void> {
    try {
      const { workspaceId, employeeId } = data;
      
      // Small reward for engagement
      await gamificationService.awardPoints({
        workspaceId,
        employeeId,
        points: 2,
        transactionType: 'schedule_viewed',
        referenceType: 'schedule_view',
        description: 'Viewed schedule',
      });
    } catch (error) {
      log.error('[GamificationEventTracker] Error handling schedule_viewed:', error);
    }
  }

  private static async handleExpenseApproved(data: ApprovalEvent): Promise<void> {
    try {
      const { workspaceId, approverId } = data;
      
      if (approverId) {
        await gamificationService.awardPoints({
          workspaceId,
          employeeId: approverId,
          points: 5,
          transactionType: 'expense_approved',
          referenceId: data.referenceId,
          referenceType: 'expense',
          description: 'Approved an expense',
        });
      }
    } catch (error) {
      log.error('[GamificationEventTracker] Error handling expense_approved:', error);
    }
  }

  private static async handleRequestApproved(data: ApprovalEvent): Promise<void> {
    try {
      const { workspaceId, approverId } = data;
      
      if (approverId) {
        await gamificationService.awardPoints({
          workspaceId,
          employeeId: approverId,
          points: 10,
          transactionType: 'request_approved',
          referenceId: data.referenceId,
          referenceType: 'request',
          description: 'Processed a request',
        });
      }
    } catch (error) {
      log.error('[GamificationEventTracker] Error handling request_approved:', error);
    }
  }

  private static async handleFeatureUsed(data: FeatureEvent): Promise<void> {
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
        'gamification': 5,
        'calendar_sync': 10,
        'time_tracking': 5,
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

      emitGamificationEvent('gamification_milestone', {
        type: 'feature_adoption',
        workspaceId,
        employeeId: employee.id,
        feature: featureName,
        points,
      });

      log.info(`[Gamification] Feature use points (${points}) awarded for ${featureName}`);
    } catch (error) {
      log.error('[GamificationEventTracker] Error handling feature_used:', error);
    }
  }

  private static async handleProfileCompleted(data: ApprovalEvent): Promise<void> {
    try {
      const { workspaceId, employeeId } = data;
      
      if (!employeeId) return;

      await gamificationService.awardPoints({
        workspaceId,
        employeeId,
        points: 50,
        transactionType: 'profile_completed',
        referenceId: employeeId,
        referenceType: 'employee',
        description: 'Completed profile setup',
      });

      emitGamificationEvent('gamification_milestone', {
        type: 'profile_complete',
        workspaceId,
        employeeId,
        points: 50,
      });
    } catch (error) {
      log.error('[GamificationEventTracker] Error handling profile_completed:', error);
    }
  }

  // ==================== ONBOARDING & TUTORIAL HANDLERS ====================

  private static async handleOnboardingStepCompleted(data: OnboardingEvent): Promise<void> {
    try {
      const { workspaceId, employeeId, stepName, stepNumber, totalSteps } = data;
      
      const points = 25; // Points per onboarding step
      await gamificationService.awardPoints({
        workspaceId,
        employeeId,
        points,
        transactionType: 'onboarding_step',
        referenceId: data.stepId,
        referenceType: 'onboarding',
        description: `Completed onboarding step: ${stepName || `Step ${stepNumber}`}`,
      });

      log.info(`[Gamification] Onboarding step ${stepNumber}/${totalSteps} completed for ${employeeId}`);

      emitGamificationEvent('gamification_milestone', {
        type: 'onboarding_progress',
        workspaceId,
        employeeId,
        points,
        feature: `onboarding_step_${stepNumber}`,
      });
    } catch (error) {
      log.error('[GamificationEventTracker] Error handling onboarding_step_completed:', error);
    }
  }

  private static async handleOnboardingCompleted(data: OnboardingEvent): Promise<void> {
    try {
      const { workspaceId, employeeId } = data;
      
      const points = 200; // Bonus for completing all onboarding
      await gamificationService.awardPoints({
        workspaceId,
        employeeId,
        points,
        transactionType: 'onboarding_completed',
        referenceId: employeeId,
        referenceType: 'onboarding',
        description: 'Completed all onboarding steps - Welcome aboard!',
      });

      log.info(`[Gamification] Onboarding completed for ${employeeId} - 200 bonus points awarded!`);

      emitGamificationEvent('gamification_milestone', {
        type: 'onboarding_complete',
        workspaceId,
        employeeId,
        points,
      });
    } catch (error) {
      log.error('[GamificationEventTracker] Error handling onboarding_completed:', error);
    }
  }

  private static async handleTutorialStepCompleted(data: TutorialEvent): Promise<void> {
    try {
      const { workspaceId, userId, tutorialName, stepNumber, totalSteps } = data;
      
      // Get employee record
      const [employee] = await db.select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);

      if (!employee) return;

      const points = 10; // Points per tutorial step
      await gamificationService.awardPoints({
        workspaceId,
        employeeId: employee.id,
        points,
        transactionType: 'tutorial_step',
        referenceId: data.tutorialId,
        referenceType: 'tutorial',
        description: `Completed tutorial step: ${tutorialName} (${stepNumber}/${totalSteps})`,
      });

      log.info(`[Gamification] Tutorial step ${stepNumber}/${totalSteps} completed for ${userId}`);
    } catch (error) {
      log.error('[GamificationEventTracker] Error handling tutorial_step_completed:', error);
    }
  }

  private static async handleTutorialCompleted(data: TutorialEvent): Promise<void> {
    try {
      const { workspaceId, userId, tutorialName, tutorialId } = data;
      
      // Get employee record
      const [employee] = await db.select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);

      if (!employee) return;

      const points = 50; // Bonus for completing a tutorial
      await gamificationService.awardPoints({
        workspaceId,
        employeeId: employee.id,
        points,
        transactionType: 'tutorial_completed',
        referenceId: tutorialId,
        referenceType: 'tutorial',
        description: `Mastered tutorial: ${tutorialName}`,
      });

      log.info(`[Gamification] Tutorial "${tutorialName}" completed by ${userId} - 50 bonus points!`);

      emitGamificationEvent('gamification_milestone', {
        type: 'tutorial_mastered',
        workspaceId,
        employeeId: employee.id,
        points,
        feature: tutorialName,
      });
    } catch (error) {
      log.error('[GamificationEventTracker] Error handling tutorial_completed:', error);
    }
  }

  // ==================== MIGRATION HANDLERS ====================

  private static async handleMigrationStarted(data: MigrationEvent): Promise<void> {
    try {
      const { workspaceId, userId } = data;
      if (!userId) return;

      // Get employee record
      const [employee] = await db.select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);

      if (!employee) return;

      const points = 25;
      await gamificationService.awardPoints({
        workspaceId,
        employeeId: employee.id,
        points,
        transactionType: 'migration_started',
        referenceId: data.migrationJobId,
        referenceType: 'migration',
        description: 'Started data migration journey',
      });

      log.info(`[Gamification] Migration started by ${userId}`);
    } catch (error) {
      log.error('[GamificationEventTracker] Error handling migration_started:', error);
    }
  }

  private static async handleMigrationDocumentUploaded(data: MigrationEvent): Promise<void> {
    try {
      const { workspaceId, userId, documentType } = data;
      if (!userId) return;

      const [employee] = await db.select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);

      if (!employee) return;

      const points = 15;
      await gamificationService.awardPoints({
        workspaceId,
        employeeId: employee.id,
        points,
        transactionType: 'migration_upload',
        referenceId: data.migrationJobId,
        referenceType: 'migration',
        description: `Uploaded ${documentType || 'document'} for migration`,
      });
    } catch (error) {
      log.error('[GamificationEventTracker] Error handling migration_document_uploaded:', error);
    }
  }

  private static async handleMigrationDataImported(data: MigrationEvent): Promise<void> {
    try {
      const { workspaceId, userId, recordCount, documentType } = data;
      if (!userId) return;

      const [employee] = await db.select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);

      if (!employee) return;

      // Points based on number of records imported
      const points = Math.min(Math.floor((recordCount || 1) * 2), 100);
      await gamificationService.awardPoints({
        workspaceId,
        employeeId: employee.id,
        points,
        transactionType: 'migration_import',
        referenceId: data.migrationJobId,
        referenceType: 'migration',
        description: `Imported ${recordCount} ${documentType || 'records'}`,
      });

      log.info(`[Gamification] Imported ${recordCount} records for ${userId} - ${points} points`);
    } catch (error) {
      log.error('[GamificationEventTracker] Error handling migration_data_imported:', error);
    }
  }

  private static async handleMigrationCompleted(data: MigrationEvent): Promise<void> {
    try {
      const { workspaceId, userId } = data;
      if (!userId) return;

      const [employee] = await db.select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);

      if (!employee) return;

      const points = 250;
      await gamificationService.awardPoints({
        workspaceId,
        employeeId: employee.id,
        points,
        transactionType: 'migration_completed',
        referenceId: data.migrationJobId,
        referenceType: 'migration',
        description: 'Data migration completed successfully!',
      });

      log.info(`[Gamification] Migration completed by ${userId} - 250 bonus points!`);

      emitGamificationEvent('gamification_milestone', {
        type: 'migration_complete',
        workspaceId,
        employeeId: employee.id,
        points,
      });
    } catch (error) {
      log.error('[GamificationEventTracker] Error handling migration_completed:', error);
    }
  }

  // ==================== ORG SETUP HANDLERS ====================

  private static async handleOrgSetupStarted(data: OrgSetupEvent): Promise<void> {
    try {
      const { workspaceId, userId, setupPhase } = data;
      if (!userId) return;

      const [employee] = await db.select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);

      if (!employee) return;

      const points = 50;
      await gamificationService.awardPoints({
        workspaceId,
        employeeId: employee.id,
        points,
        transactionType: 'org_setup_started',
        referenceType: 'org_setup',
        description: `Started organization setup: ${setupPhase}`,
      });

      log.info(`[Gamification] Org setup started by ${userId}`);
    } catch (error) {
      log.error('[GamificationEventTracker] Error handling org_setup_started:', error);
    }
  }

  private static async handleOrgSetupStepCompleted(data: OrgSetupEvent): Promise<void> {
    try {
      const { workspaceId, userId, setupPhase, progress } = data;
      if (!userId) return;

      const [employee] = await db.select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);

      if (!employee) return;

      const points = 30;
      await gamificationService.awardPoints({
        workspaceId,
        employeeId: employee.id,
        points,
        transactionType: 'org_setup_step',
        referenceType: 'org_setup',
        description: `Completed setup phase: ${setupPhase} (${progress || 0}% complete)`,
      });

      log.info(`[Gamification] Org setup step "${setupPhase}" completed - ${progress}%`);
    } catch (error) {
      log.error('[GamificationEventTracker] Error handling org_setup_step_completed:', error);
    }
  }

  private static async handleOrgReadyToWork(data: OrgSetupEvent): Promise<void> {
    try {
      const { workspaceId, userId } = data;
      if (!userId) return;

      const [employee] = await db.select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);

      if (!employee) return;

      const points = 500;
      await gamificationService.awardPoints({
        workspaceId,
        employeeId: employee.id,
        points,
        transactionType: 'org_ready',
        referenceType: 'org_setup',
        description: 'Organization is fully set up and ready to work!',
      });

      log.info(`[Gamification] Organization ready to work! ${userId} awarded 500 points!`);

      emitGamificationEvent('gamification_milestone', {
        type: 'org_launch',
        workspaceId,
        employeeId: employee.id,
        points,
      });
    } catch (error) {
      log.error('[GamificationEventTracker] Error handling org_ready_to_work:', error);
    }
  }
}

// Export function to trigger gamification events from endpoints
export { emitGamificationEvent } from './gamificationEvents';
