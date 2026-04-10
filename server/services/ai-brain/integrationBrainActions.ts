/**
 * INTEGRATION MANAGEMENT BRAIN ACTIONS
 * =====================================
 * Registers all integration management capabilities with the AI Brain Master Orchestrator.
 * 
 * Includes:
 * - Workspace integration management (connect, disconnect, credentials)
 * - API key management (create, list, revoke)
 * - Service health monitoring and outage analysis
 * - Partner catalog management (support roles)
 */

import { helpaiOrchestrator, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { integrationManagementService, type IntegrationAccessContext } from './integrationManagementService';
import { integrationPartnerService, type SupportContext } from './integrationPartnerService';
import { createLogger } from '../../lib/logger';
const log = createLogger('integrationBrainActions');

function requireContext(request: ActionRequest): { userId: string; workspaceId: string } | null {
  if (!request.userId || !request.workspaceId) {
    return null;
  }
  return { userId: request.userId, workspaceId: request.workspaceId };
}

function missingContextResult(request: ActionRequest, startTime: number): ActionResult {
  log.warn(`[Integration Brain] Missing workspaceId or userId for ${request.actionId}`);
  return {
    success: false,
    actionId: request.actionId,
    message: 'Missing workspace or user context — cannot execute integration action',
    executionTimeMs: Date.now() - startTime,
  };
}

export function registerIntegrationBrainActions(): void {
  log.info('[Integration Brain] Registering integration management actions...');

  helpaiOrchestrator.registerAction({
    actionId: 'integrations.list_available',
    name: 'List Available Integrations',
    category: 'integrations',
    description: 'List all available integration partners in the marketplace',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const ctx = requireContext(request);
      if (!ctx) return missingContextResult(request, startTime);
      
      try {
        const context: IntegrationAccessContext = {
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          platformRole: request.platformRole || '',
          workspaceRole: (request as any).workspaceRole || '',
          accessLevel: integrationManagementService.determineAccessLevel(
            request.platformRole || '',
            (request as any).workspaceRole || ''
          )
        };
        
        const integrations = await integrationManagementService.listAvailableIntegrations(context);
        
        return {
          success: true,
          actionId: request.actionId,
          data: integrations,
          message: `Found ${integrations.length} available integrations`,
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to list integrations: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'integrations.get_workspace_connections',
    name: 'Get Workspace Connections',
    category: 'integrations',
    description: 'List all active integration connections for a workspace',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const ctx = requireContext(request);
      if (!ctx) return missingContextResult(request, startTime);
      
      try {
        const context: IntegrationAccessContext = {
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          platformRole: request.platformRole || '',
          workspaceRole: (request as any).workspaceRole || '',
          accessLevel: integrationManagementService.determineAccessLevel(
            request.platformRole || '',
            (request as any).workspaceRole || ''
          )
        };
        
        const connections = await integrationManagementService.getWorkspaceConnections(context);
        
        return {
          success: true,
          actionId: request.actionId,
          data: connections,
          message: `Found ${connections.length} active connections`,
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to get connections: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'integrations.connect',
    name: 'Connect Integration',
    category: 'integrations',
    description: 'Connect an integration partner to the workspace',
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const ctx = requireContext(request);
      if (!ctx) return missingContextResult(request, startTime);
      const { integrationId, displayName, authType, credentials, syncConfig } = request.payload || {};
      
      if (!integrationId || !displayName || !authType) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameters: integrationId, displayName, authType',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      try {
        const context: IntegrationAccessContext = {
          userId: request.userId,
          workspaceId: request.workspaceId!,
          platformRole: request.platformRole || '',
          workspaceRole: (request as any).workspaceRole || '',
          accessLevel: integrationManagementService.determineAccessLevel(
            request.platformRole || '',
            (request as any).workspaceRole || ''
          )
        };
        
        const result = await integrationManagementService.connectIntegration(context, {
          integrationId,
          displayName,
          authType,
          credentials: credentials || {},
          syncConfig
        });
        
        return {
          success: result.success,
          actionId: request.actionId,
          data: result.connection,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          message: result.success ? 'Integration connected successfully' : result.error,
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to connect integration: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'integrations.disconnect',
    name: 'Disconnect Integration',
    category: 'integrations',
    description: 'Disconnect an integration from the workspace',
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const ctx = requireContext(request);
      if (!ctx) return missingContextResult(request, startTime);
      const { connectionId } = request.payload || {};
      
      if (!connectionId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameter: connectionId',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      try {
        const context: IntegrationAccessContext = {
          userId: request.userId,
          workspaceId: request.workspaceId!,
          platformRole: request.platformRole || '',
          workspaceRole: (request as any).workspaceRole || '',
          accessLevel: integrationManagementService.determineAccessLevel(
            request.platformRole || '',
            (request as any).workspaceRole || ''
          )
        };
        
        const result = await integrationManagementService.disconnectIntegration(context, connectionId);
        
        return {
          success: result.success,
          actionId: request.actionId,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          message: result.success ? 'Integration disconnected successfully' : result.error,
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to disconnect integration: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'integrations.update_credentials',
    name: 'Update Integration Credentials',
    category: 'integrations',
    description: 'Update credentials for an existing integration connection',
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const ctx = requireContext(request);
      if (!ctx) return missingContextResult(request, startTime);
      const { connectionId, credentials } = request.payload || {};
      
      if (!connectionId || !credentials) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameters: connectionId, credentials',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      try {
        const context: IntegrationAccessContext = {
          userId: request.userId,
          workspaceId: request.workspaceId!,
          platformRole: request.platformRole || '',
          workspaceRole: (request as any).workspaceRole || '',
          accessLevel: integrationManagementService.determineAccessLevel(
            request.platformRole || '',
            (request as any).workspaceRole || ''
          )
        };
        
        const result = await integrationManagementService.updateConnectionCredentials(context, connectionId, credentials);
        
        return {
          success: result.success,
          actionId: request.actionId,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          message: result.success ? 'Credentials updated successfully' : result.error,
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to update credentials: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'integrations.create_api_key',
    name: 'Create API Key',
    category: 'integrations',
    description: 'Create a new API key for the workspace',
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const ctx = requireContext(request);
      if (!ctx) return missingContextResult(request, startTime);
      const { name, scopes, expiresAt } = request.payload || {};
      
      if (!name || !scopes) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameters: name, scopes',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      try {
        const context: IntegrationAccessContext = {
          userId: request.userId,
          workspaceId: request.workspaceId!,
          platformRole: request.platformRole || '',
          workspaceRole: (request as any).workspaceRole || '',
          accessLevel: integrationManagementService.determineAccessLevel(
            request.platformRole || '',
            (request as any).workspaceRole || ''
          )
        };
        
        const result = await integrationManagementService.createApiKey(
          context,
          name,
          scopes,
          expiresAt ? new Date(expiresAt) : undefined
        );
        
        return {
          success: result.success,
          actionId: request.actionId,
          data: result.success ? { keyId: result.keyId, apiKey: result.apiKey } : undefined,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          message: result.success ? 'API key created successfully. Save this key securely - it will only be shown once.' : result.error,
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to create API key: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'integrations.list_api_keys',
    name: 'List API Keys',
    category: 'integrations',
    description: 'List all API keys for the workspace',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      
      const ctx = requireContext(request);
      
      if (!ctx) return missingContextResult(request, startTime);
      
      try {
        const context: IntegrationAccessContext = {
          userId: request.userId,
          workspaceId: request.workspaceId!,
          platformRole: request.platformRole || '',
          workspaceRole: (request as any).workspaceRole || '',
          accessLevel: integrationManagementService.determineAccessLevel(
            request.platformRole || '',
            (request as any).workspaceRole || ''
          )
        };
        
        const keys = await integrationManagementService.listApiKeys(context);
        const sanitizedKeys = keys.map(k => ({ ...k, keyHash: undefined }));
        
        return {
          success: true,
          actionId: request.actionId,
          data: sanitizedKeys,
          message: `Found ${keys.length} API keys`,
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to list API keys: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'integrations.revoke_api_key',
    name: 'Revoke API Key',
    category: 'integrations',
    description: 'Revoke an API key for the workspace',
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const ctx = requireContext(request);
      if (!ctx) return missingContextResult(request, startTime);
      const { keyId } = request.payload || {};
      
      if (!keyId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameter: keyId',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      try {
        const context: IntegrationAccessContext = {
          userId: request.userId,
          workspaceId: request.workspaceId!,
          platformRole: request.platformRole || '',
          workspaceRole: (request as any).workspaceRole || '',
          accessLevel: integrationManagementService.determineAccessLevel(
            request.platformRole || '',
            (request as any).workspaceRole || ''
          )
        };
        
        const result = await integrationManagementService.revokeApiKey(context, keyId);
        
        return {
          success: result.success,
          actionId: request.actionId,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          message: result.success ? 'API key revoked successfully' : result.error,
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to revoke API key: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'integrations.get_service_health',
    name: 'Get Service Health',
    category: 'integrations',
    description: 'Get health status for all connected integrations',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      
      const ctx = requireContext(request);
      
      if (!ctx) return missingContextResult(request, startTime);
      
      try {
        const context: IntegrationAccessContext = {
          userId: request.userId,
          workspaceId: request.workspaceId!,
          platformRole: request.platformRole || '',
          workspaceRole: (request as any).workspaceRole || '',
          accessLevel: integrationManagementService.determineAccessLevel(
            request.platformRole || '',
            (request as any).workspaceRole || ''
          )
        };
        
        const health = await integrationManagementService.getServiceHealth(context);
        const unhealthyCount = health.filter(h => !h.isHealthy).length;
        
        return {
          success: true,
          actionId: request.actionId,
          data: health,
          message: `${health.length - unhealthyCount}/${health.length} services healthy`,
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to get service health: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'integrations.analyze_outage',
    name: 'Analyze Service Outage',
    category: 'integrations',
    description: 'Analyze an integration outage and provide AI-powered guidance to user',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const ctx = requireContext(request);
      if (!ctx) return missingContextResult(request, startTime);
      const { integrationId } = request.payload || {};
      
      if (!integrationId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameter: integrationId',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      try {
        const context: IntegrationAccessContext = {
          userId: request.userId,
          workspaceId: request.workspaceId!,
          platformRole: request.platformRole || '',
          workspaceRole: (request as any).workspaceRole || '',
          accessLevel: integrationManagementService.determineAccessLevel(
            request.platformRole || '',
            (request as any).workspaceRole || ''
          )
        };
        
        const analysis = await integrationManagementService.analyzeServiceOutage(context, integrationId);
        
        return {
          success: true,
          actionId: request.actionId,
          data: analysis,
          message: analysis.diagnosis,
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to analyze outage: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  log.info('[Integration Brain] Registered 10 workspace integration actions');

  helpaiOrchestrator.registerAction({
    actionId: 'partner.list_all',
    name: 'List All Partners',
    category: 'integrations',
    description: 'List all integration partners in the marketplace (support role)',
    requiredRoles: ['sysop', 'deputy_admin', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const ctx = requireContext(request);
      if (!ctx) return missingContextResult(request, startTime);
      const { category, status, search, limit, offset } = request.payload || {};
      
      try {
        const context: SupportContext = {
          userId: request.userId,
          platformRole: request.platformRole || '',
          accessLevel: integrationPartnerService.determineSupportAccessLevel(request.platformRole || '')
        };
        
        const result = await integrationPartnerService.listAllPartners(context, {
          category,
          status,
          search,
          limit,
          offset
        });
        
        return {
          success: true,
          actionId: request.actionId,
          data: result,
          message: `Found ${result.total} integration partners`,
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to list partners: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'partner.get_details',
    name: 'Get Partner Details',
    category: 'integrations',
    description: 'Get detailed information about an integration partner',
    requiredRoles: ['sysop', 'deputy_admin', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const ctx = requireContext(request);
      if (!ctx) return missingContextResult(request, startTime);
      const { partnerId } = request.payload || {};
      
      if (!partnerId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameter: partnerId',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      try {
        const context: SupportContext = {
          userId: request.userId,
          platformRole: request.platformRole || '',
          accessLevel: integrationPartnerService.determineSupportAccessLevel(request.platformRole || '')
        };
        
        const details = await integrationPartnerService.getPartnerDetails(context, partnerId);
        
        return {
          success: !!details,
          actionId: request.actionId,
          data: details,
          message: details ? `Partner: ${details.name}` : 'Partner not found',
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to get partner details: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'partner.create',
    name: 'Create Partner',
    category: 'integrations',
    description: 'Add a new integration partner to the marketplace (support role)',
    requiredRoles: ['sysop', 'deputy_admin', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const ctx = requireContext(request);
      if (!ctx) return missingContextResult(request, startTime);
      const { partner } = request.payload || {};
      
      if (!partner || !partner.name || !partner.slug || !partner.category) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required partner fields: name, slug, category',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      try {
        const context: SupportContext = {
          userId: request.userId,
          platformRole: request.platformRole || '',
          accessLevel: integrationPartnerService.determineSupportAccessLevel(request.platformRole || '')
        };
        
        const result = await integrationPartnerService.createPartner(context, partner);
        
        return {
          success: result.success,
          actionId: request.actionId,
          data: result.partner,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          message: result.success ? `Partner "${partner.name}" created successfully` : result.error,
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to create partner: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'partner.update',
    name: 'Update Partner',
    category: 'integrations',
    description: 'Update an existing integration partner',
    requiredRoles: ['sysop', 'deputy_admin', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const ctx = requireContext(request);
      if (!ctx) return missingContextResult(request, startTime);
      const { partnerId, updates } = request.payload || {};
      
      if (!partnerId || !updates) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameters: partnerId, updates',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      try {
        const context: SupportContext = {
          userId: request.userId,
          platformRole: request.platformRole || '',
          accessLevel: integrationPartnerService.determineSupportAccessLevel(request.platformRole || '')
        };
        
        const result = await integrationPartnerService.updatePartner(context, partnerId, updates);
        
        return {
          success: result.success,
          actionId: request.actionId,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          message: result.success ? 'Partner updated successfully' : result.error,
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to update partner: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'partner.suspend',
    name: 'Suspend Partner',
    category: 'integrations',
    description: 'Suspend an integration partner (affects all connected workspaces)',
    requiredRoles: ['sysop', 'deputy_admin', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const ctx = requireContext(request);
      if (!ctx) return missingContextResult(request, startTime);
      const { partnerId, reason } = request.payload || {};
      
      if (!partnerId || !reason) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameters: partnerId, reason',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      try {
        const context: SupportContext = {
          userId: request.userId,
          platformRole: request.platformRole || '',
          accessLevel: integrationPartnerService.determineSupportAccessLevel(request.platformRole || '')
        };
        
        const result = await integrationPartnerService.suspendPartner(context, partnerId, reason);
        
        return {
          success: result.success,
          actionId: request.actionId,
          data: { affectedWorkspaces: result.affectedWorkspaces },
          // @ts-expect-error — TS migration: fix in refactoring sprint
          message: result.success 
            ? `Partner suspended. ${result.affectedWorkspaces} workspace(s) affected.` 
            : result.error,
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to suspend partner: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'partner.reactivate',
    name: 'Reactivate Partner',
    category: 'integrations',
    description: 'Reactivate a suspended integration partner',
    requiredRoles: ['sysop', 'deputy_admin', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const ctx = requireContext(request);
      if (!ctx) return missingContextResult(request, startTime);
      const { partnerId } = request.payload || {};
      
      if (!partnerId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameter: partnerId',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      try {
        const context: SupportContext = {
          userId: request.userId,
          platformRole: request.platformRole || '',
          accessLevel: integrationPartnerService.determineSupportAccessLevel(request.platformRole || '')
        };
        
        const result = await integrationPartnerService.reactivatePartner(context, partnerId);
        
        return {
          success: result.success,
          actionId: request.actionId,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          message: result.success ? 'Partner reactivated successfully' : result.error,
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to reactivate partner: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'partner.delete',
    name: 'Delete Partner',
    category: 'integrations',
    description: 'Permanently delete an integration partner',
    requiredRoles: ['sysop', 'deputy_admin', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const ctx = requireContext(request);
      if (!ctx) return missingContextResult(request, startTime);
      const { partnerId, force } = request.payload || {};
      
      if (!partnerId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameter: partnerId',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      try {
        const context: SupportContext = {
          userId: request.userId,
          platformRole: request.platformRole || '',
          accessLevel: integrationPartnerService.determineSupportAccessLevel(request.platformRole || '')
        };
        
        const result = await integrationPartnerService.deletePartner(context, partnerId, force);
        
        return {
          success: result.success,
          actionId: request.actionId,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          message: result.success ? 'Partner deleted permanently' : result.error,
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to delete partner: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'partner.get_stats',
    name: 'Get Partner Stats',
    category: 'integrations',
    description: 'Get usage statistics for integration partners',
    requiredRoles: ['sysop', 'deputy_admin', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const ctx = requireContext(request);
      if (!ctx) return missingContextResult(request, startTime);
      const { partnerId } = request.payload || {};
      
      try {
        const context: SupportContext = {
          userId: request.userId,
          platformRole: request.platformRole || '',
          accessLevel: integrationPartnerService.determineSupportAccessLevel(request.platformRole || '')
        };
        
        const stats = await integrationPartnerService.getPartnerUsageStats(context, partnerId);
        
        return {
          success: true,
          actionId: request.actionId,
          data: stats,
          message: `${stats.totalPartners} partners, ${stats.totalConnections} connections`,
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to get partner stats: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  log.info('[Integration Brain] Registered 8 partner management actions');
  log.info('[Integration Brain] Total: 18 integration management actions registered');
  log.info('[Integration Brain] Categories: Workspace Integrations (10), Partner Management (8)');
}
