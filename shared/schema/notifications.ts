// Notifications Domain - Alerts, inbox, digests, push notifications, announcements
// Re-exports from main schema for domain organization
// Import from this module for domain-specific schema access

// Tables
// Enums
// Insert Schemas
export {
  notifications,
  userNotificationPreferences,
  notificationRules,
  alertConfigurations,
  alertHistory,
  alertRateLimits,
  trackedNotifications,
  notificationScopeEnum,
  notificationCategoryEnum,
  notificationTypeEnum,
  digestFrequencyEnum,
  notificationRuleActionEnum,
  alertTypeEnum,
  alertSeverityEnum,
  alertStatusEnum,
  notificationDeliveryStatusEnum,
  insertNotificationSchema,
  insertUserNotificationPreferencesSchema,
  insertNotificationRuleSchema,
  insertAlertConfigurationSchema,
  insertAlertHistorySchema,
  // Phase 8 — delivery tracking table
  notificationDeliveries,
  insertNotificationDeliverySchema,
} from '../schema';

export type {
  InsertNotification,
  Notification,
  UserNotificationPreferences,
  InsertNotificationDigest,
  InsertNotificationRule,
  NotificationRule,
  UpdateNotificationPreferences,
  InsertAlertConfiguration,
  AlertConfiguration,
  InsertAlertHistory,
  AlertHistory,
  // Phase 8
  InsertNotificationDelivery,
  NotificationDelivery,
} from '../schema';
