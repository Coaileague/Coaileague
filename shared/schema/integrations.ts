// Integrations Domain - OAuth, webhooks, sync, connectors, DocuSign, Gusto
// Re-exports from main schema for domain organization
// Import from this module for domain-specific schema access

// Tables
// Enums
// Insert Schemas
export {
  integrationMarketplace,
  integrationConnections,
  integrationApiKeys,
  webhookDeliveries,
  oauthStates,
  partnerSyncLogs,
  gustoSyncHistory,
  helpaiIntegrations,
  calendarSyncEvents,
  integrationCategoryEnum,
  gustoSyncStatusEnum,
  checkpointSyncStateEnum,
  insertIntegrationMarketplaceSchema,
  insertIntegrationConnectionSchema,
  insertIntegrationApiKeySchema,
  insertWebhookDeliverySchema,
  insertOAuthStateSchema,
  insertPartnerSyncLogSchema,
  insertGustoSyncHistorySchema,
  insertHelpaiIntegrationSchema,
} from '../schema';

export type {
  InsertIntegrationMarketplace,
  IntegrationMarketplace,
  InsertIntegrationConnection,
  IntegrationConnection,
  InsertIntegrationApiKey,
  IntegrationApiKey,
  InsertWebhookDelivery,
  WebhookDelivery,
  InsertOAuthState,
  OAuthState,
  InsertPartnerSyncLog,
  PartnerSyncLog,
  InsertGustoSyncHistory,
  GustoSyncHistory,
  InsertHelpaiIntegration,
  HelpaiIntegration,
} from '../schema';
