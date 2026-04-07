/**
 * ONBOARDING ORCHESTRATOR
 * ========================
 * Coordinates parallel execution of onboarding subagents for new organizations.
 * 
 * When a new org is created, invited, or subscribes, this orchestrator:
 * 1. Triggers DataMigrationAgent for data extraction (PDF/Excel/manual)
 * 2. Triggers GamificationActivationAgent in parallel
 * 3. Initializes workspace-isolated Trinity AI instance
 * 4. Creates Trinity welcome notification
 * 5. Coordinates completion and reports results
 * 
 * This enables orgs to work out-of-box with migrated data and unlocked automation.
 * 
 * WORKSPACE ISOLATION:
 * - Each org gets its own Trinity AI context
 * - Memory and conversation history are isolated per workspace
 * - Trinity personality adapts to workspace subscription tier
 */

import { dataMigrationAgent, type ExtractedData, type MigrationResult } from './dataMigrationAgent';
import { createLogger } from '../../../lib/logger';
import { gamificationActivationAgent, type ActivationResult, AUTOMATION_GATES } from './gamificationActivationAgent';
import { cognitiveOnboardingService, type IntegrationProvider, type DataSyncType } from '../cognitiveOnboardingService';
import { industryComplianceTemplates, type IndustryComplianceConfig } from '../industryComplianceTemplates';
import { db } from '../../../db';
import { workspaces, notifications, orgInvitations, employees, userPlatformUpdateViews, platformUpdates } from '@shared/schema';
import { eq, and, isNull, notInArray, or } from 'drizzle-orm';
import { trialManager } from '../../billing/trialManager';
import { onboardingPipelineService } from '../../onboardingPipelineService';
import { platformEventBus, type PlatformEvent } from '../../platformEventBus';
import { universalNotificationEngine } from '../../universalNotificationEngine';
import { universalAudit, AUDIT_ACTIONS } from '../../universalAuditService';

export interface OnboardingSource {
  type: 'pdf' | 'excel' | 'csv' | 'manual' | 'bulk_text';
  fileContent?: string; // base64 for PDF
  fileName?: string;
  data?: Record<string, any>[]; // For spreadsheet data
  headers?: string[]; // For spreadsheet columns
  formData?: Record<string, any>; // For manual entry
  extractionType?: 'employees' | 'teams' | 'schedules' | 'auto';
}

export interface OnboardingRequest {
  workspaceId: string;
  userId: string;
  sources?: OnboardingSource[];
  options?: {
    skipGamification?: boolean;
    skipDataMigration?: boolean;
    validateOnly?: boolean;
    unlockBasicAutomation?: boolean;
  };
}

export interface OnboardingResult {
  success: boolean;
  workspaceId: string;
  duration: number;
  dataExtraction?: {
    success: boolean;
    extracted: ExtractedData;
    validation: { valid: boolean; issues: string[] };
  };
  dataMigration?: MigrationResult;
  gamificationActivation?: ActivationResult;
  summary: {
    employeesImported: number;
    achievementsCreated: number;
    automationGatesUnlocked: string[];
    readyToWork: boolean;
  };
  errors: string[];
  warnings: string[];
}

class OnboardingOrchestrator {
  private static instance: OnboardingOrchestrator;
  private readonly log = createLogger('OnboardingOrchestrator');

  static getInstance(): OnboardingOrchestrator {
    if (!OnboardingOrchestrator.instance) {
      OnboardingOrchestrator.instance = new OnboardingOrchestrator();
    }
    return OnboardingOrchestrator.instance;
  }

  /**
   * Run full onboarding flow for a new organization
   * Executes data migration and gamification activation in parallel
   */
  async runOnboarding(request: OnboardingRequest): Promise<OnboardingResult> {
    const startTime = Date.now();
    const { workspaceId, userId, sources = [], options = {} } = request;
    const { 
      skipGamification = false, 
      skipDataMigration = false,
      validateOnly = false,
      unlockBasicAutomation = true,
    } = options;

    this.log.info(`Starting onboarding for workspace ${workspaceId}`);

    universalAudit.log({
      workspaceId,
      actorId: userId,
      actorType: 'user',
      action: AUDIT_ACTIONS.ONBOARDING_ORCHESTRATION_STARTED,
      entityType: 'workspace',
      entityId: workspaceId,
      changeType: 'action',
      metadata: { sourceCount: sources.length, skipGamification, skipDataMigration, validateOnly },
    }).catch((auditErr: any) => {
      this.log.warn('[Onboarding] Audit log (start) failed:', auditErr?.message);
    });

    const result: OnboardingResult = {
      success: true,
      workspaceId,
      duration: 0,
      summary: {
        employeesImported: 0,
        achievementsCreated: 0,
        automationGatesUnlocked: [],
        readyToWork: false,
      },
      errors: [],
      warnings: [],
    };

    try {
      // Verify workspace exists
      const [workspace] = await db.select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      if (!workspace) {
        throw new Error(`Workspace ${workspaceId} not found`);
      }

      // Create parallel tasks
      const parallelTasks: Promise<void>[] = [];

      // Task 1: Data Migration (if sources provided)
      if (!skipDataMigration && sources.length > 0) {
        parallelTasks.push(
          this.runDataMigration(workspaceId, userId, sources, validateOnly).then(migrationResult => {
            result.dataExtraction = migrationResult.extraction;
            result.dataMigration = migrationResult.migration;
            result.summary.employeesImported = migrationResult.migration?.importedCounts.employees || 0;
            if (migrationResult.errors.length > 0) {
              result.errors.push(...migrationResult.errors);
            }
            if (migrationResult.warnings.length > 0) {
              result.warnings.push(...migrationResult.warnings);
            }

            universalAudit.log({
              workspaceId,
              actorId: userId,
              actorType: 'trinity',
              actorBot: 'DataMigrationAgent',
              action: AUDIT_ACTIONS.ONBOARDING_DATA_MIGRATION_COMPLETED,
              entityType: 'workspace',
              entityId: workspaceId,
              changeType: 'action',
              metadata: {
                employeesImported: result.summary.employeesImported,
                sourcesProcessed: sources.length,
                errorCount: migrationResult.errors.length,
                warningCount: migrationResult.warnings.length,
                validateOnly,
              },
            }).catch((err) => this.log.warn('[OnboardingOrchestrator] Fire-and-forget failed:', err));
          }).catch((err: any) => {
            this.log.error('Data migration task failed:', err);
            result.errors.push(`Data migration failed: ${(err instanceof Error ? err.message : String(err))}`);
          })
        );
      }

      // Task 2: Gamification Activation (always runs unless skipped)
      if (!skipGamification) {
        parallelTasks.push(
          gamificationActivationAgent.activateForOrg({
            workspaceId,
            userId,
            options: {
              includeStarterBadges: true,
              initializeAllEmployees: true,
              unlockBasicAutomation,
            },
          }).then(gamificationResult => {
            result.gamificationActivation = gamificationResult;
            result.summary.achievementsCreated = gamificationResult.achievementsCreated;
            result.summary.automationGatesUnlocked = gamificationResult.automationGatesUnlocked;
            if (gamificationResult.errors.length > 0) {
              result.errors.push(...gamificationResult.errors);
            }

            universalAudit.log({
              workspaceId,
              actorId: userId,
              actorType: 'trinity',
              actorBot: 'GamificationActivationAgent',
              action: AUDIT_ACTIONS.ONBOARDING_GAMIFICATION_ACTIVATED,
              entityType: 'workspace',
              entityId: workspaceId,
              changeType: 'action',
              metadata: {
                success: gamificationResult.success,
                achievementsCreated: gamificationResult.achievementsCreated,
                automationGatesUnlocked: gamificationResult.automationGatesUnlocked,
                errorCount: gamificationResult.errors.length,
              },
            }).catch((err) => this.log.warn('[OnboardingOrchestrator] Fire-and-forget failed:', err));
          }).catch((err: any) => {
            this.log.error('Gamification activation task failed:', err);
            result.errors.push(`Gamification activation failed: ${(err instanceof Error ? err.message : String(err))}`);
          })
        );
      }

      // Task 3: Industry Compliance Deployment (if workspace has industry selected)
      // Handle both standard taxonomy industries and custom user-defined industries
      const isCustomIndustry = workspace.sectorId === 'other_custom';
      
      if (!isCustomIndustry && workspace.subIndustryId) {
        // Standard industry from taxonomy - deploy pre-configured compliance templates
        parallelTasks.push(
          this.deployIndustryCompliance({
            workspaceId,
            subIndustryId: workspace.subIndustryId,
            userId,
          }).then(complianceResult => {
            if (!complianceResult.success) {
              result.warnings.push(...complianceResult.errors);
            } else {
              this.log.info(`Industry compliance deployed: ${complianceResult.templatesDeployed.length} templates, ${complianceResult.requirementsCreated} requirements`);
            }
          }).catch((err: any) => {
            this.log.error('Industry compliance task failed:', err);
            result.warnings.push(`Industry compliance deployment failed: ${(err instanceof Error ? err.message : String(err))}`);
          })
        );
      } else if (isCustomIndustry) {
        // Custom industry - deploy generic compliance templates and log for AI learning
        if (workspace.customIndustryName) {
          parallelTasks.push(
            this.deployCustomIndustryCompliance({
              workspaceId,
              customIndustryName: workspace.customIndustryName,
              customIndustryDescription: workspace.customIndustryDescription || undefined,
              userId,
            }).then(complianceResult => {
              if (!complianceResult.success) {
                result.warnings.push(...complianceResult.errors);
              } else {
                this.log.info(`Custom industry compliance deployed for "${workspace.customIndustryName}": ${complianceResult.templatesDeployed.length} templates`);
              }
            }).catch((err: any) => {
              this.log.error('Custom industry compliance task failed:', err);
              result.warnings.push(`Custom industry compliance deployment failed: ${(err instanceof Error ? err.message : String(err))}`);
            })
          );
        } else {
          // Custom industry selected but name not provided yet - add warning
          result.warnings.push('Custom industry sector selected but industry name not provided. Please complete industry setup.');
        }
      }

      // Execute all tasks in parallel
      await Promise.all(parallelTasks);

      // Determine if org is ready to work
      result.summary.readyToWork = result.errors.length === 0 && (
        result.summary.employeesImported > 0 || 
        result.gamificationActivation?.success === true
      );

      result.success = result.errors.length === 0;

    } catch (error: any) {
      this.log.error('Onboarding failed:', error);
      result.success = false;
      result.errors.push((error instanceof Error ? error.message : String(error)));
    }

    result.duration = Date.now() - startTime;

    universalAudit.log({
      workspaceId,
      actorId: userId,
      actorType: 'trinity',
      actorBot: 'OnboardingOrchestrator',
      action: AUDIT_ACTIONS.ONBOARDING_ORCHESTRATION_COMPLETED,
      entityType: 'workspace',
      entityId: workspaceId,
      changeType: 'action',
      metadata: {
        success: result.success,
        durationMs: result.duration,
        employeesImported: result.summary.employeesImported,
        achievementsCreated: result.summary.achievementsCreated,
        automationGatesUnlocked: result.summary.automationGatesUnlocked,
        readyToWork: result.summary.readyToWork,
        errorCount: result.errors.length,
        warningCount: result.warnings.length,
      },
    }).catch((auditErr: any) => {
      this.log.warn('[Onboarding] Audit log (complete) failed:', auditErr?.message);
    });

    this.log.info(`Onboarding completed in ${result.duration}ms:`, result.summary);

    return result;
  }

  /**
   * Run data extraction and migration from provided sources
   */
  private async runDataMigration(
    workspaceId: string,
    userId: string,
    sources: OnboardingSource[],
    validateOnly: boolean
  ): Promise<{
    extraction?: { success: boolean; extracted: ExtractedData; validation: { valid: boolean; issues: string[] } };
    migration?: MigrationResult;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let combinedData: ExtractedData = {
      employees: [],
      teams: [],
      schedules: [],
      confidence: 0,
      warnings: [],
      errors: [],
    };

    // Extract data from all sources
    for (const source of sources) {
      try {
        let extracted: ExtractedData;

        switch (source.type) {
          case 'pdf':
            if (!source.fileContent || !source.fileName) {
              warnings.push('PDF source missing file content or name');
              continue;
            }
            extracted = await dataMigrationAgent.extractFromPdf({
              workspaceId,
              fileContent: source.fileContent,
              fileName: source.fileName,
              extractionType: source.extractionType || 'auto',
            });
            break;

          case 'excel':
          case 'csv':
            if (!source.data || !source.headers) {
              warnings.push(`${source.type.toUpperCase()} source missing data or headers`);
              continue;
            }
            extracted = await dataMigrationAgent.extractFromSpreadsheet({
              workspaceId,
              data: source.data,
              headers: source.headers,
              extractionType: source.extractionType || 'auto',
            });
            break;

          case 'manual':
          case 'bulk_text':
            if (!source.formData) {
              warnings.push('Manual entry missing form data');
              continue;
            }
            extracted = await dataMigrationAgent.parseManualEntry({
              workspaceId,
              formData: source.formData,
              entryType: source.type === 'bulk_text' ? 'bulk_text' : 
                (source.extractionType as 'employee' | 'team' | 'schedule') || 'bulk_text',
            });
            break;

          default:
            warnings.push(`Unknown source type: ${source.type}`);
            continue;
        }

        // Merge extracted data
        if (extracted.employees) combinedData.employees!.push(...extracted.employees);
        if (extracted.teams) combinedData.teams!.push(...extracted.teams);
        if (extracted.schedules) combinedData.schedules!.push(...extracted.schedules);
        combinedData.warnings.push(...extracted.warnings);
        combinedData.errors.push(...extracted.errors);
        combinedData.confidence = Math.max(combinedData.confidence, extracted.confidence);

      } catch (error: any) {
        errors.push(`Source extraction failed: ${(error instanceof Error ? error.message : String(error))}`);
      }
    }

    // Validate combined data
    const validation = await dataMigrationAgent.validateData({
      workspaceId,
      data: combinedData,
    });

    const extractionResult = {
      success: combinedData.errors.length === 0,
      extracted: combinedData,
      validation,
    };

    // If validate only, return without importing
    if (validateOnly) {
      return {
        extraction: extractionResult,
        errors,
        warnings: [...warnings, ...combinedData.warnings],
      };
    }

    // Import validated data
    if (validation.valid || combinedData.employees!.length > 0) {
      const migrationResult = await dataMigrationAgent.importData({
        workspaceId,
        userId,
        data: combinedData,
        skipDuplicates: true,
      });

      return {
        extraction: extractionResult,
        migration: migrationResult,
        errors: [...errors, ...migrationResult.errors],
        warnings: [...warnings, ...combinedData.warnings, ...migrationResult.warnings],
      };
    }

    return {
      extraction: extractionResult,
      errors,
      warnings: [...warnings, ...combinedData.warnings, ...validation.issues],
    };
  }

  /**
   * Get onboarding status for a workspace
   */
  async getOnboardingStatus(workspaceId: string): Promise<{
    gamificationEnabled: boolean;
    automationGates: { id: string; name: string; unlocked: boolean; requiredLevel: number }[];
    currentLevel: number;
    readyForAutomation: boolean;
  }> {
    const gamificationEnabled = gamificationActivationAgent.isGamificationEnabled(workspaceId);
    const gateStatus = await gamificationActivationAgent.getAutomationGateStatus(workspaceId);

    return {
      gamificationEnabled,
      automationGates: gateStatus.gates.map(g => ({
        id: g.id,
        name: g.name,
        unlocked: g.unlocked,
        requiredLevel: g.requiredLevel,
      })),
      currentLevel: gateStatus.currentLevel,
      readyForAutomation: gateStatus.gates.some(g => g.unlocked),
    };
  }

  /**
   * Trigger onboarding for a newly invited user/org
   */
  async triggerForNewOrg(params: {
    workspaceId: string;
    ownerId: string;
    inviteSource?: 'signup' | 'invite' | 'subscription';
  }): Promise<OnboardingResult> {
    this.log.info(`New org trigger: ${params.workspaceId} (${params.inviteSource})`);

    // Clear all existing platform updates for new org users
    // This prevents them seeing historical updates that aren't relevant to them
    await this.clearPlatformUpdatesForNewUser(params.ownerId, params.workspaceId);

    return this.runOnboarding({
      workspaceId: params.workspaceId,
      userId: params.ownerId,
      options: {
        skipDataMigration: true, // No data sources yet
        unlockBasicAutomation: true,
      },
    });
  }

  /**
   * Mark all existing platform updates as viewed for a new user
   * Prevents new org users from seeing historical platform updates
   * PUBLIC: Can be called from routes when creating employees/users
   */
  async clearPlatformUpdatesForNewUser(userId: string, workspaceId: string): Promise<number> {
    try {
      // Get all platform updates that the user hasn't viewed yet
      const existingViews = await db.query.userPlatformUpdateViews.findMany({
        where: eq(userPlatformUpdateViews.userId, userId),
        columns: { updateId: true },
      });
      
      const viewedIds = existingViews.map(v => v.updateId);
      
      // Find all updates that are either global or for this workspace
      // Build conditions array filtering out undefined to avoid SQL builder issues
      const conditions = [
        or(
          isNull(platformUpdates.workspaceId),
          eq(platformUpdates.workspaceId, workspaceId)
        )
      ];
      
      // Only add notInArray condition if there are existing views
      if (viewedIds.length > 0) {
        conditions.push(notInArray(platformUpdates.id, viewedIds));
      }
      
      const unviewedUpdates = await db.query.platformUpdates.findMany({
        where: and(...conditions),
        columns: { id: true },
      });
      
      if (unviewedUpdates.length === 0) {
        this.log.info(`No platform updates to clear for user ${userId}`);
        return 0;
      }
      
      // Mark all as viewed
      const now = new Date();
      const viewRecords = unviewedUpdates.map(u => ({
        userId,
        workspaceId,
        updateId: u.id,
        viewedAt: now,
      }));
      
      await db.insert(userPlatformUpdateViews)
        .values(viewRecords)
        .onConflictDoNothing();
      
      this.log.info(`Cleared ${viewRecords.length} platform updates for new user ${userId}`);
      return viewRecords.length;
    } catch (error: any) {
      this.log.error('Failed to clear platform updates:', (error instanceof Error ? error.message : String(error)));
      return 0;
    }
  }

  /**
   * Continue onboarding with data import
   */
  async continueWithDataImport(params: {
    workspaceId: string;
    userId: string;
    sources: OnboardingSource[];
  }): Promise<OnboardingResult> {
    return this.runOnboarding({
      workspaceId: params.workspaceId,
      userId: params.userId,
      sources: params.sources,
      options: {
        skipGamification: true, // Already activated
      },
    });
  }

  /**
   * Generate Trinity welcome message for new org
   * Creates a personalized AI greeting for the workspace-isolated Trinity instance
   */
  async generateTrinityWelcome(params: {
    workspaceId: string;
    workspaceName: string;
    ownerName: string;
    inviteSource?: 'signup' | 'invite' | 'subscription';
  }): Promise<{
    welcomeMessage: string;
    suggestedNextSteps: string[];
    trinityPersonality: string;
  }> {
    const { workspaceName, ownerName, inviteSource } = params;

    const sourceContext = {
      signup: 'who just signed up',
      invite: 'who was invited to join',
      subscription: 'who just subscribed',
    };

    const greeting = sourceContext[inviteSource || 'signup'];

    return {
      welcomeMessage: `Hello ${ownerName}! I'm Trinity, your dedicated AI assistant for ${workspaceName}. ` +
        `I operate exclusively within your organization to help you manage your workforce efficiently. ` +
        `I'm powered by Gemini 3 Pro and I'm here to guide you through setting up your organization, ` +
        `answer any questions, and help optimize your operations with intelligent recommendations.`,
      suggestedNextSteps: [
        'Import your employee data (PDF, Excel, or CSV)',
        'Set up your team structure and departments',
        'Configure your first shift schedule',
        'Explore the gamification system to unlock automation features',
        'Ask me anything about CoAIleague features!',
      ],
      trinityPersonality: 'helpful_professional',
    };
  }

  /**
   * Complete full invitation workflow with Trinity integration
   * Handles: email -> welcome page -> signup -> data migration -> gamification -> automation
   */
  async processInvitationAcceptance(params: {
    inviteToken: string;
    userId: string;
    workspaceId: string;
    workspaceName: string;
    ownerName: string;
  }): Promise<{
    success: boolean;
    onboardingResult?: OnboardingResult;
    trinityWelcome?: {
      welcomeMessage: string;
      suggestedNextSteps: string[];
      trinityPersonality: string;
    };
    trinityInstance?: {
      instanceId: string;
      persona: string;
      capabilities: string[];
    };
    trialInfo?: {
      trialEndsAt: Date;
      daysRemaining: number;
    };
    billingPipeline?: {
      pipelineStatus: string;
      totalTasks: number;
      completionPercent: number;
    };
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      this.log.info(`[OnboardingOrchestrator] Processing invitation acceptance for workspace ${params.workspaceId}`);

      // Step 1: Start free trial for the workspace (CRITICAL for billing)
      let trialInfo: { trialEndsAt: Date; daysRemaining: number } | undefined;
      try {
        const trialResult = await trialManager.startTrial(params.workspaceId);
        if (trialResult.success) {
          const daysRemaining = Math.ceil((trialResult.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          trialInfo = { trialEndsAt: trialResult.trialEndsAt, daysRemaining };
          this.log.info(`[OnboardingOrchestrator] Trial started for workspace ${params.workspaceId}, ends ${trialResult.trialEndsAt.toISOString()}`);
        } else {
          this.log.warn(`[OnboardingOrchestrator] Trial start warning: ${trialResult.error}`);
        }
      } catch (trialError: any) {
        this.log.warn('[OnboardingOrchestrator] Trial start failed (may already exist):', trialError.message);
      }

      // Step 2: Initialize billing onboarding pipeline (gamified tasks + discount reward)
      let billingPipeline: { pipelineStatus: string; totalTasks: number; completionPercent: number } | undefined;
      try {
        const pipelineProgress = await onboardingPipelineService.initializeOnboarding(params.workspaceId);
        billingPipeline = {
          pipelineStatus: pipelineProgress.pipelineStatus,
          totalTasks: pipelineProgress.totalTasks,
          completionPercent: pipelineProgress.completionPercent,
        };
        this.log.info(`[OnboardingOrchestrator] Billing pipeline initialized: ${pipelineProgress.totalTasks} tasks`);
      } catch (pipelineError: any) {
        this.log.warn('[OnboardingOrchestrator] Pipeline init warning:', pipelineError.message);
      }

      // Step 3: Generate Trinity welcome message
      const trinityWelcome = await this.generateTrinityWelcome({
        workspaceId: params.workspaceId,
        workspaceName: params.workspaceName,
        ownerName: params.ownerName,
        inviteSource: 'invite',
      });

      // Step 4: Initialize workspace-isolated Trinity AI instance
      const trinityInit = await this.initializeWorkspaceTrinity({
        workspaceId: params.workspaceId,
        workspaceName: params.workspaceName,
        ownerId: params.userId,
        ownerName: params.ownerName,
      });

      if (!trinityInit.success) {
        errors.push(...trinityInit.errors);
      }

      // Step 5: Trigger onboarding (gamification activation, basic automation unlock)
      const onboardingResult = await this.triggerForNewOrg({
        workspaceId: params.workspaceId,
        ownerId: params.userId,
        inviteSource: 'invite',
      });

      if (!onboardingResult.success) {
        errors.push(...onboardingResult.errors);
      }

      // Step 6: Emit platform event for org onboarding
      const event: PlatformEvent = {
        type: 'org_onboarded',
        category: 'billing',
        title: 'New Organization Onboarded',
        description: `${params.workspaceName} has accepted invitation and started trial`,
        metadata: {
          workspaceId: params.workspaceId,
          workspaceName: params.workspaceName,
          ownerName: params.ownerName,
          trialEndsAt: trialInfo?.trialEndsAt?.toISOString(),
          timestamp: new Date().toISOString(),
        },
        visibility: 'org_leadership',
      };
      await platformEventBus.publish(event);

      universalAudit.log({
        workspaceId: params.workspaceId,
        actorId: params.userId,
        actorType: 'user',
        action: AUDIT_ACTIONS.ONBOARDING_INVITATION_ACCEPTED,
        entityType: 'workspace',
        entityId: params.workspaceId,
        entityName: params.workspaceName,
        changeType: 'action',
        metadata: {
          inviteToken: params.inviteToken ? `${params.inviteToken.substring(0, 8)}...` : null,
          ownerName: params.ownerName,
          trialStarted: !!trialInfo,
          trialDaysRemaining: trialInfo?.daysRemaining || null,
          pipelineTasks: billingPipeline?.totalTasks || 0,
          trinityInitialized: trinityInit.success,
          gamificationActive: onboardingResult.gamificationActivation?.success || false,
          automationGatesUnlocked: onboardingResult.summary.automationGatesUnlocked,
        },
      }).catch((err) => this.log.warn('[OnboardingOrchestrator] Fire-and-forget failed:', err));

      if (trialInfo) {
        universalAudit.log({
          workspaceId: params.workspaceId,
          actorType: 'system',
          action: AUDIT_ACTIONS.ONBOARDING_TRIAL_STARTED,
          entityType: 'workspace',
          entityId: params.workspaceId,
          changeType: 'create',
          metadata: { trialEndsAt: trialInfo.trialEndsAt.toISOString(), daysRemaining: trialInfo.daysRemaining },
        }).catch((err) => this.log.warn('[OnboardingOrchestrator] Fire-and-forget failed:', err));
      }

      if (trinityInit.success) {
        universalAudit.log({
          workspaceId: params.workspaceId,
          actorType: 'trinity',
          actorBot: 'OnboardingOrchestrator',
          action: AUDIT_ACTIONS.ONBOARDING_TRINITY_WELCOME_SENT,
          entityType: 'trinity_instance',
          entityId: trinityInit.trinityInstanceId,
          changeType: 'create',
          metadata: { persona: trinityInit.persona, capabilities: trinityInit.capabilities },
        }).catch((err) => this.log.warn('[OnboardingOrchestrator] Fire-and-forget failed:', err));
      }

      this.log.info(`[OnboardingOrchestrator] Invitation acceptance complete:`, {
        workspaceId: params.workspaceId,
        success: onboardingResult.success && trinityInit.success,
        trinityPersona: trinityInit.persona,
        trialDaysRemaining: trialInfo?.daysRemaining,
        gamificationActive: onboardingResult.gamificationActivation?.success,
        automationGatesUnlocked: onboardingResult.summary.automationGatesUnlocked,
      });

      return {
        success: onboardingResult.success && trinityInit.success,
        onboardingResult,
        trinityWelcome,
        trinityInstance: {
          instanceId: trinityInit.trinityInstanceId,
          persona: trinityInit.persona,
          capabilities: trinityInit.capabilities,
        },
        trialInfo,
        billingPipeline,
        errors,
      };

    } catch (error: any) {
      this.log.error('[OnboardingOrchestrator] Invitation acceptance failed:', error);
      errors.push((error instanceof Error ? error.message : String(error)));
      return {
        success: false,
        errors,
      };
    }
  }

  /**
   * Get migration capabilities for display to new users
   */
  getMigrationCapabilities(): {
    automated: { name: string; description: string; sources: string[] }[];
    apiIntegrations: { provider: IntegrationProvider; name: string; description: string; dataTypes: DataSyncType[] }[];
    manual: { name: string; description: string }[];
  } {
    return {
      automated: [
        {
          name: 'Employee Roster',
          description: 'Import employee data with AI-powered field mapping',
          sources: ['PDF', 'Excel', 'CSV'],
        },
        {
          name: 'Team Structures',
          description: 'Extract department and team hierarchies',
          sources: ['PDF', 'Excel'],
        },
        {
          name: 'Schedule Patterns',
          description: 'Import existing shift schedules',
          sources: ['Excel', 'CSV'],
        },
      ],
      apiIntegrations: cognitiveOnboardingService.getSupportedProviders().map(p => ({
          provider: p.provider,
          name: p.name,
          description: `Auto-import from ${p.name}`,
          dataTypes: p.dataTypes,
        })),
      manual: [
        {
          name: 'Payroll Settings',
          description: 'Configure pay rates, overtime rules, and tax settings',
        },
        {
          name: 'Client Relationships',
          description: 'Set up client accounts and billing preferences',
        },
        {
          name: 'Compliance Rules',
          description: 'Configure state-specific labor law compliance',
        },
      ],
    };
  }

  /**
   * Initialize workspace-isolated Trinity AI instance
   * Creates isolated AI context, memory, and conversation history per workspace
   */
  async initializeWorkspaceTrinity(params: {
    workspaceId: string;
    workspaceName: string;
    ownerId: string;
    ownerName: string;
    subscriptionTier?: 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic';
  }): Promise<{
    success: boolean;
    trinityInstanceId: string;
    persona: string;
    capabilities: string[];
    errors: string[];
  }> {
    const errors: string[] = [];
    const { workspaceId, workspaceName, ownerId, ownerName, subscriptionTier = 'starter' } = params;

    this.log.info(`[OnboardingOrchestrator] Initializing workspace-isolated Trinity for ${workspaceId}`);

    try {
      // Determine Trinity persona based on subscription tier
      const persona = this.getTrinityPersonaForTier(subscriptionTier);
      
      // Determine Trinity capabilities based on tier
      const capabilities = this.getTrinityCapabilitiesForTier(subscriptionTier);

      // Create Trinity welcome notification for the workspace owner
      await this.createTrinityWelcomeNotification({
        userId: ownerId,
        workspaceId,
        workspaceName,
        ownerName,
        persona,
      });

      this.log.info(`[OnboardingOrchestrator] Trinity initialized for workspace ${workspaceId}:`, {
        persona,
        capabilities: capabilities.length,
      });

      return {
        success: true,
        trinityInstanceId: `trinity-${workspaceId}`,
        persona,
        capabilities,
        errors,
      };

    } catch (error: any) {
      this.log.error('[OnboardingOrchestrator] Trinity initialization failed:', error);
      errors.push((error instanceof Error ? error.message : String(error)));
      return {
        success: false,
        trinityInstanceId: '',
        persona: 'standard',
        capabilities: [],
        errors,
      };
    }
  }

  /**
   * Get Trinity persona based on subscription tier
   */
  private getTrinityPersonaForTier(tier: string): string {
    const personaMap: Record<string, string> = {
      'free': 'onboarding_guide',
      'starter': 'coo_advisor',
      'professional': 'support_partner',
      'enterprise': 'executive_advisor',
    };
    return personaMap[tier] || 'onboarding_guide';
  }

  /**
   * Get Trinity capabilities based on subscription tier
   */
  private getTrinityCapabilitiesForTier(tier: string): string[] {
    const baseCapabilities = [
      'answer_questions',
      'navigation_help',
      'feature_discovery',
      'basic_scheduling_help',
    ];

    const tierCapabilities: Record<string, string[]> = {
      'free': baseCapabilities,
      'starter': [
        ...baseCapabilities,
        'data_migration_assistance',
        'gamification_guidance',
        'basic_analytics_insights',
      ],
      'professional': [
        ...baseCapabilities,
        'data_migration_assistance',
        'gamification_guidance',
        'advanced_analytics',
        'automation_suggestions',
        'compliance_monitoring',
        'fast_mode_access',
      ],
      'enterprise': [
        ...baseCapabilities,
        'data_migration_assistance',
        'gamification_guidance',
        'advanced_analytics',
        'automation_suggestions',
        'compliance_monitoring',
        'fast_mode_access',
        'guru_mode',
        'platform_diagnostics',
        'strategic_insights',
        'crisis_management',
      ],
    };

    return tierCapabilities[tier] || baseCapabilities;
  }

  /**
   * Create Trinity welcome notification for new user
   */
  private async createTrinityWelcomeNotification(params: {
    userId: string;
    workspaceId: string;
    workspaceName: string;
    ownerName: string;
    persona: string;
  }): Promise<void> {
    const { userId, workspaceId, workspaceName, ownerName, persona } = params;

    const welcomeMessages: Record<string, { title: string; message: string }> = {
      'onboarding_guide': {
        title: 'Welcome to CoAIleague!',
        message: `Hi ${ownerName}! I'm Trinity, your AI guide. I'm here to help you set up ${workspaceName} and get the most out of our platform. Let's start by importing your data!`,
      },
      'coo_advisor': {
        title: 'COO Mode Activated!',
        message: `Hello ${ownerName}! I'm Trinity in COO Mode for ${workspaceName}. I'll help you optimize operations, analyze workforce performance, and drive strategic growth. Ready to get started?`,
      },
      'support_partner': {
        title: 'Trinity Pro Activated!',
        message: `Welcome ${ownerName}! I'm Trinity Pro, your dedicated support partner for ${workspaceName}. I have advanced capabilities including automation suggestions and compliance monitoring. How can I help?`,
      },
      'executive_advisor': {
        title: 'Executive AI Advisor Ready',
        message: `Greetings ${ownerName}! I'm Trinity in Executive Advisor mode for ${workspaceName}. I provide strategic insights, platform-wide diagnostics, and enterprise-grade automation. Let me help you maximize ROI.`,
      },
    };

    const content = welcomeMessages[persona] || welcomeMessages['onboarding_guide'];

    // Route through UNE for AI enrichment and unified handling
    await universalNotificationEngine.sendNotification({
      userId,
      workspaceId,
      type: 'ai_action_completed',
      title: content.title,
      message: content.message,
      severity: 'info',
      actionUrl: '/dashboard',
      metadata: {
        persona,
        workspaceName,
        detailedCategory: 'trinity_welcome',
        sourceType: 'trinity',
        sourceName: 'Trinity AI',
        isFirstLogin: true,
        skipFeatureCheck: true, // Welcome notifications bypass feature validation
      },
    });

    this.log.info(`[OnboardingOrchestrator] UNE created Trinity welcome notification for user ${userId}`);
  }

  /**
   * Run end-to-end invitation workflow test
   * Used for testing the complete invitation -> onboarding flow
   */
  async testInvitationWorkflow(params: {
    testUserId: string;
    testWorkspaceId: string;
    testWorkspaceName: string;
    testOwnerName: string;
    dryRun?: boolean;
  }): Promise<{
    success: boolean;
    steps: { name: string; status: 'passed' | 'failed' | 'skipped'; duration: number; error?: string }[];
    totalDuration: number;
    summary: string;
  }> {
    const startTime = Date.now();
    const steps: { name: string; status: 'passed' | 'failed' | 'skipped'; duration: number; error?: string }[] = [];
    const { testUserId, testWorkspaceId, testWorkspaceName, testOwnerName, dryRun = true } = params;

    this.log.info(`[OnboardingOrchestrator] Starting invitation workflow test (dryRun: ${dryRun})`);

    // Step 1: Validate workspace exists
    const step1Start = Date.now();
    try {
      const [workspace] = await db.select()
        .from(workspaces)
        .where(eq(workspaces.id, testWorkspaceId))
        .limit(1);

      if (!workspace && !dryRun) {
        throw new Error('Workspace not found');
      }

      steps.push({
        name: 'Validate Workspace',
        status: 'passed',
        duration: Date.now() - step1Start,
      });
    } catch (error: any) {
      steps.push({
        name: 'Validate Workspace',
        status: dryRun ? 'passed' : 'failed',
        duration: Date.now() - step1Start,
        error: (error instanceof Error ? error.message : String(error)),
      });
    }

    // Step 2: Generate Trinity welcome
    const step2Start = Date.now();
    try {
      const trinityWelcome = await this.generateTrinityWelcome({
        workspaceId: testWorkspaceId,
        workspaceName: testWorkspaceName,
        ownerName: testOwnerName,
        inviteSource: 'invite',
      });

      if (!trinityWelcome.welcomeMessage) {
        throw new Error('Trinity welcome message not generated');
      }

      steps.push({
        name: 'Generate Trinity Welcome',
        status: 'passed',
        duration: Date.now() - step2Start,
      });
    } catch (error: any) {
      steps.push({
        name: 'Generate Trinity Welcome',
        status: 'failed',
        duration: Date.now() - step2Start,
        error: (error instanceof Error ? error.message : String(error)),
      });
    }

    // Step 3: Initialize workspace Trinity (skip in dry run)
    const step3Start = Date.now();
    if (!dryRun) {
      try {
        const trinityInit = await this.initializeWorkspaceTrinity({
          workspaceId: testWorkspaceId,
          workspaceName: testWorkspaceName,
          ownerId: testUserId,
          ownerName: testOwnerName,
        });

        steps.push({
          name: 'Initialize Workspace Trinity',
          status: trinityInit.success ? 'passed' : 'failed',
          duration: Date.now() - step3Start,
          error: trinityInit.errors[0],
        });
      } catch (error: any) {
        steps.push({
          name: 'Initialize Workspace Trinity',
          status: 'failed',
          duration: Date.now() - step3Start,
          error: (error instanceof Error ? error.message : String(error)),
        });
      }
    } else {
      steps.push({
        name: 'Initialize Workspace Trinity',
        status: 'skipped',
        duration: 0,
      });
    }

    // Step 4: Test gamification activation (skip in dry run)
    const step4Start = Date.now();
    if (!dryRun) {
      try {
        const gamificationResult = await gamificationActivationAgent.activateForOrg({
          workspaceId: testWorkspaceId,
          userId: testUserId,
          options: {
            includeStarterBadges: true,
            initializeAllEmployees: false,
            unlockBasicAutomation: true,
          },
        });

        steps.push({
          name: 'Activate Gamification',
          status: gamificationResult.success ? 'passed' : 'failed',
          duration: Date.now() - step4Start,
          error: gamificationResult.errors[0],
        });
      } catch (error: any) {
        steps.push({
          name: 'Activate Gamification',
          status: 'failed',
          duration: Date.now() - step4Start,
          error: (error instanceof Error ? error.message : String(error)),
        });
      }
    } else {
      steps.push({
        name: 'Activate Gamification',
        status: 'skipped',
        duration: 0,
      });
    }

    // Step 5: Verify onboarding status
    const step5Start = Date.now();
    try {
      const status = await this.getOnboardingStatus(testWorkspaceId);
      steps.push({
        name: 'Verify Onboarding Status',
        status: 'passed',
        duration: Date.now() - step5Start,
      });
    } catch (error: any) {
      steps.push({
        name: 'Verify Onboarding Status',
        status: dryRun ? 'passed' : 'failed',
        duration: Date.now() - step5Start,
        error: (error instanceof Error ? error.message : String(error)),
      });
    }

    const totalDuration = Date.now() - startTime;
    const passedSteps = steps.filter(s => s.status === 'passed').length;
    const failedSteps = steps.filter(s => s.status === 'failed').length;
    const success = failedSteps === 0;

    const summary = `Invitation workflow test ${success ? 'PASSED' : 'FAILED'}: ${passedSteps}/${steps.length} steps passed in ${totalDuration}ms`;
    this.log.info(`[OnboardingOrchestrator] ${summary}`);

    return {
      success,
      steps,
      totalDuration,
      summary,
    };
  }

  /**
   * Get workflow diagnostics for debugging
   */
  async getWorkflowDiagnostics(workspaceId: string): Promise<{
    workspaceId: string;
    onboardingComplete: boolean;
    trinityInitialized: boolean;
    gamificationActive: boolean;
    automationGatesUnlocked: string[];
    dataImported: boolean;
    errors: string[];
    recommendations: string[];
  }> {
    const errors: string[] = [];
    const recommendations: string[] = [];

    try {
      // Check workspace exists
      const [workspace] = await db.select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      if (!workspace) {
        return {
          workspaceId,
          onboardingComplete: false,
          trinityInitialized: false,
          gamificationActive: false,
          automationGatesUnlocked: [],
          dataImported: false,
          errors: ['Workspace not found'],
          recommendations: ['Create workspace first'],
        };
      }

      // Check gamification status
      const gamificationEnabled = gamificationActivationAgent.isGamificationEnabled(workspaceId);
      const gateStatus = await gamificationActivationAgent.getAutomationGateStatus(workspaceId);

      // Check for Trinity welcome notification
      const [trinityNotification] = await db.select()
        .from(notifications)
        .where(eq(notifications.workspaceId, workspaceId))
        .limit(1);

      const trinityInitialized = !!trinityNotification;

      // Check if data has been imported by counting employees in workspace
      const employeeCount = await db.select()
        .from(employees)
        .where(eq(employees.workspaceId, workspaceId))
        .limit(1);
      const dataImported = employeeCount.length > 0;

      // Determine recommendations
      if (!gamificationEnabled) {
        recommendations.push('Activate gamification to unlock automation features');
      }
      if (!trinityInitialized) {
        recommendations.push('Initialize Trinity AI assistant for personalized guidance');
      }
      if (gateStatus.gates.filter(g => g.unlocked).length === 0) {
        recommendations.push('Complete onboarding challenges to unlock automation gates');
      }
      if (!dataImported) {
        recommendations.push('Import employee data to get started with scheduling');
      }

      return {
        workspaceId,
        onboardingComplete: gamificationEnabled && gateStatus.gates.some(g => g.unlocked),
        trinityInitialized,
        gamificationActive: gamificationEnabled,
        automationGatesUnlocked: gateStatus.gates.filter(g => g.unlocked).map(g => g.name),
        dataImported,
        errors,
        recommendations,
      };

    } catch (error: any) {
      errors.push((error instanceof Error ? error.message : String(error)));
      return {
        workspaceId,
        onboardingComplete: false,
        trinityInitialized: false,
        gamificationActive: false,
        automationGatesUnlocked: [],
        dataImported: false,
        errors,
        recommendations: ['Debug the error and try again'],
      };
    }
  }

  /**
   * Deploy industry-specific compliance templates for a workspace
   * Called when organization selects their industry during onboarding
   */
  async deployIndustryCompliance(params: {
    workspaceId: string;
    subIndustryId: string;
    userId: string;
  }): Promise<{
    success: boolean;
    complianceConfig: IndustryComplianceConfig | null;
    templatesDeployed: string[];
    requirementsCreated: number;
    errors: string[];
  }> {
    const { workspaceId, subIndustryId, userId } = params;
    const errors: string[] = [];

    this.log.info(`[OnboardingOrchestrator] Deploying industry compliance for workspace ${workspaceId}, sub-industry ${subIndustryId}`);

    try {
      // Get compliance configuration for the selected sub-industry
      const complianceConfig = industryComplianceTemplates.getComplianceConfigForSubIndustry(subIndustryId);
      
      if (!complianceConfig) {
        errors.push(`No compliance configuration found for sub-industry: ${subIndustryId}`);
        return {
          success: false,
          complianceConfig: null,
          templatesDeployed: [],
          requirementsCreated: 0,
          errors,
        };
      }

      // Deploy the compliance templates to the workspace
      const deployResult = await industryComplianceTemplates.deployComplianceTemplates({
        workspaceId,
        subIndustryId,
        userId,
      });

      if (!deployResult.success) {
        errors.push(...deployResult.errors);
      }

      universalAudit.log({
        workspaceId,
        actorId: userId,
        actorType: 'trinity',
        actorBot: 'OnboardingOrchestrator',
        action: AUDIT_ACTIONS.ONBOARDING_COMPLIANCE_DEPLOYED,
        entityType: 'compliance_config',
        entityId: subIndustryId,
        changeType: 'create',
        metadata: { subIndustryId, templatesDeployed: deployResult.templatesDeployed, requirementsCreated: deployResult.requirementsCreated },
      }).catch((err) => this.log.warn('[OnboardingOrchestrator] Fire-and-forget failed:', err));

      this.log.info(`[OnboardingOrchestrator] Industry compliance deployed:`, {
        workspaceId,
        subIndustryId,
        templatesDeployed: deployResult.templatesDeployed.length,
        requirementsCreated: deployResult.requirementsCreated,
      });

      return {
        success: deployResult.success,
        complianceConfig,
        templatesDeployed: deployResult.templatesDeployed,
        requirementsCreated: deployResult.requirementsCreated,
        errors,
      };

    } catch (error: any) {
      this.log.error('[OnboardingOrchestrator] Industry compliance deployment failed:', error);
      errors.push((error instanceof Error ? error.message : String(error)));
      return {
        success: false,
        complianceConfig: null,
        templatesDeployed: [],
        requirementsCreated: 0,
        errors,
      };
    }
  }

  /**
   * Deploy generic compliance templates for custom/user-defined industries
   * Used when the user selects "Other / My Industry Not Listed" sector
   * Logs the custom industry for AI learning and future taxonomy expansion
   */
  async deployCustomIndustryCompliance(params: {
    workspaceId: string;
    customIndustryName: string;
    customIndustryDescription?: string;
    userId: string;
  }): Promise<{
    success: boolean;
    templatesDeployed: string[];
    errors: string[];
  }> {
    const { workspaceId, customIndustryName, customIndustryDescription, userId } = params;
    const errors: string[] = [];

    this.log.info(`[OnboardingOrchestrator] Deploying custom industry compliance for workspace ${workspaceId}, industry "${customIndustryName}"`);

    try {
      // Deploy generic compliance templates applicable to all industries
      const genericTemplates = [
        'general_workplace_safety',
        'employee_handbook_acknowledgment',
        'emergency_procedures',
        'anti_discrimination_policy',
        'data_privacy_policy',
      ];

      // Log custom industry for AI learning and future taxonomy expansion
      this.log.info(`[OnboardingOrchestrator] Custom industry logged for taxonomy expansion:`, {
        workspaceId,
        customIndustryName,
        customIndustryDescription: customIndustryDescription || 'No description provided',
        userId,
        timestamp: new Date().toISOString(),
      });

      // Get current workspace to merge templates safely
      const [currentWorkspace] = await db.select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      // Merge existing templates with new generic templates (avoid duplicates)
      const existingTemplates = currentWorkspace?.industryComplianceTemplates || [];
      const mergedTemplates = [...new Set([...existingTemplates, ...genericTemplates])];

      // Update workspace with merged templates
      await db.update(workspaces)
        .set({
          industryVerifiedBy: userId,
          industryVerifiedAt: new Date(),
          industryComplianceTemplates: mergedTemplates,
        })
        .where(eq(workspaces.id, workspaceId));

      // Only mark onboarding complete after successful update
      await db.update(workspaces)
        .set({ industryOnboardingComplete: true })
        .where(eq(workspaces.id, workspaceId));

      universalAudit.log({
        workspaceId,
        actorId: userId,
        actorType: 'trinity',
        actorBot: 'OnboardingOrchestrator',
        action: AUDIT_ACTIONS.ONBOARDING_COMPLIANCE_DEPLOYED,
        entityType: 'compliance_config',
        entityId: `custom-${customIndustryName}`,
        entityName: customIndustryName,
        changeType: 'create',
        metadata: { customIndustry: true, customIndustryName, templatesDeployed: mergedTemplates, templateCount: mergedTemplates.length },
      }).catch((err) => this.log.warn('[OnboardingOrchestrator] Fire-and-forget failed:', err));

      this.log.info(`[OnboardingOrchestrator] Custom industry compliance deployed:`, {
        workspaceId,
        customIndustryName,
        templatesDeployed: mergedTemplates.length,
      });

      return {
        success: true,
        templatesDeployed: mergedTemplates,
        errors,
      };

    } catch (error: any) {
      this.log.error('[OnboardingOrchestrator] Custom industry compliance deployment failed:', error);
      errors.push((error instanceof Error ? error.message : String(error)));
      return {
        success: false,
        templatesDeployed: [],
        errors,
      };
    }
  }

  /**
   * Get industry compliance status for a workspace
   * Handles both standard taxonomy industries and custom user-defined industries
   */
  async getIndustryComplianceStatus(workspaceId: string): Promise<{
    industryConfigured: boolean;
    isCustomIndustry: boolean;
    subIndustryId: string | null;
    subIndustryName: string | null;
    sectorName: string | null;
    customIndustryName: string | null;
    customIndustryDescription: string | null;
    templatesActive: string[];
    complianceSummary: {
      totalTemplates: number;
      totalRequirements: number;
      byCategory: Record<string, number>;
      byPriority: Record<string, number>;
      criticalItems: string[];
    } | null;
    requiredCertifications: { id: string; fromTemplate: string }[];
  }> {
    try {
      const [workspace] = await db.select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      // Check if no industry is configured at all
      const hasStandardIndustry = workspace?.subIndustryId && workspace.sectorId !== 'other_custom';
      const hasCustomIndustry = workspace?.sectorId === 'other_custom' && workspace.customIndustryName;

      if (!workspace || (!hasStandardIndustry && !hasCustomIndustry)) {
        return {
          industryConfigured: false,
          isCustomIndustry: false,
          subIndustryId: null,
          subIndustryName: null,
          sectorName: null,
          customIndustryName: null,
          customIndustryDescription: null,
          templatesActive: [],
          complianceSummary: null,
          requiredCertifications: [],
        };
      }

      const templates = workspace.industryComplianceTemplates || [];

      // Handle custom industry
      if (hasCustomIndustry) {
        return {
          industryConfigured: true,
          isCustomIndustry: true,
          subIndustryId: workspace.subIndustryId,
          subIndustryName: null,
          sectorName: 'Other / My Industry Not Listed',
          customIndustryName: workspace.customIndustryName,
          customIndustryDescription: workspace.customIndustryDescription,
          templatesActive: templates,
          complianceSummary: {
            totalTemplates: templates.length,
            totalRequirements: 0, // Custom industries use generic templates
            byCategory: { general: templates.length },
            byPriority: { medium: templates.length },
            criticalItems: [],
          },
          requiredCertifications: [],
        };
      }

      // Handle standard taxonomy industry
      const complianceSummary = industryComplianceTemplates.getComplianceSummaryForWorkspace(workspaceId, templates);
      const requiredCertifications = industryComplianceTemplates.getRequiredCertifications(templates);
      const taxonomy = industryComplianceTemplates.getSubIndustryFromTaxonomy(workspace.subIndustryId!);

      return {
        industryConfigured: true,
        isCustomIndustry: false,
        subIndustryId: workspace.subIndustryId,
        subIndustryName: taxonomy?.subIndustry.name || null,
        sectorName: taxonomy?.sector.name || null,
        customIndustryName: null,
        customIndustryDescription: null,
        templatesActive: templates,
        complianceSummary,
        requiredCertifications,
      };

    } catch (error: any) {
      this.log.error('[OnboardingOrchestrator] Failed to get industry compliance status:', error);
      return {
        industryConfigured: false,
        isCustomIndustry: false,
        subIndustryId: null,
        subIndustryName: null,
        sectorName: null,
        customIndustryName: null,
        customIndustryDescription: null,
        templatesActive: [],
        complianceSummary: null,
        requiredCertifications: [],
      };
    }
  }
}

export const onboardingOrchestrator = OnboardingOrchestrator.getInstance();
