// Gamification Domain - Badges, achievements, rewards, XP, levels, streaks, quests
// Re-exports from main schema for domain organization
// Import from this module for domain-specific schema access

// Tables
// Enums
// Insert Schemas
export {
  timeOffRequests,
  achievements,
  orgRewards,
  quickFixRequests,
  sessionRecoveryRequests,
  aiApprovalRequests,
  achievementCategoryEnum,
  rewardStatusEnum,
  rewardTypeEnum,
  workboardRequestTypeEnum,
  regulatorAccessLevelEnum,
  insertTimeOffRequestSchema,
  insertAchievementSchema,
  insertOrgRewardSchema,
  insertQuickFixRequestSchema,
  insertSessionRecoveryRequestSchema,
  insertAiApprovalRequestSchema,
} from '../schema';

export type {
  InsertTimeOffRequest,
  TimeOffRequest,
  WhatsNewTabGroup,
  InsertAchievement,
  Achievement,
  InsertOrgReward,
  OrgReward,
  InsertQuickFixRequest,
  QuickFixRequest,
  InsertSessionRecoveryRequest,
  SessionRecoveryRequest,
  InsertAiApprovalRequest,
  AiApprovalRequest,
} from '../schema';
