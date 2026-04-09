import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { validateWebhookUrl } from '../services/webhookDeliveryService';
import { requireAuth } from "../auth";
import { requireManager, requireOwner, type AuthenticatedRequest } from "../rbac";
import {
  integrationMarketplace,
  integrationConnections,
  integrationApiKeys,
  webhookSubscriptions,
  webhookDeliveries,
  partnerConnections,
  stagedShifts,
} from "@shared/schema";
import { sql, eq, and, desc } from "drizzle-orm";
import {
  readLimiter,
} from "../middleware/rateLimiter";
import { getIntegrationHealthSummary } from "../services/healthCheck";
import { createLogger } from '../lib/logger';
const log = createLogger('IntegrationsInlineRoutes');


const router = Router();

router.get('/health', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const healthData = await getIntegrationHealthSummary();
      res.json(healthData);
    } catch (error: unknown) {
      log.error('[IntegrationHealth] Error:', sanitizeError(error));
      res.status(500).json({ 
        error: 'Failed to check integration health',
        quickbooks: { service: 'quickbooks', status: 'down', isCritical: false, message: 'Health check failed', lastChecked: new Date().toISOString() },
        gusto: { service: 'gusto', status: 'down', isCritical: false, message: 'Health check failed', lastChecked: new Date().toISOString() },
        overall: 'down',
        timestamp: new Date().toISOString()
      });
    }
  });

  router.get('/marketplace', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { category, certified } = req.query;
      
      let query = db
        .select()
        .from(integrationMarketplace)
        .where(and(
          eq(integrationMarketplace.isActive, true),
          eq(integrationMarketplace.isPublished, true)
        ))
        .orderBy(desc(integrationMarketplace.installCount));
      
      const integrations = await query;
      
      const filtered = integrations.filter(integration => {
        if (category && integration.category !== category) return false;
        if (certified === 'true' && !integration.isCertified) return false;
        return true;
      });
      
      res.json(filtered);
    } catch (error: unknown) {
      log.error("Error fetching integrations:", error);
      res.status(500).json({ message: "Failed to fetch integrations" });
    }
  });
  
  router.get('/connections', requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      
      const connections = await db
        .select()
        .from(integrationConnections)
        .where(eq(integrationConnections.workspaceId, workspaceId))
        .orderBy(desc(integrationConnections.connectedAt));
      
      res.json(connections);
    } catch (error: unknown) {
      log.error("Error fetching connections:", error);
      res.status(500).json({ message: "Failed to fetch connections" });
    }
  });
  
  router.post('/connections', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { integrationId, connectionName, authType, apiKey, apiSecret } = req.body;
      
      if (!integrationId) {
        return res.status(400).json({ message: "integrationId is required" });
      }
      
      const [integration] = await db
        .select()
        .from(integrationMarketplace)
        .where(eq(integrationMarketplace.id, integrationId))
        .limit(1);
      
      if (!integration) {
        return res.status(404).json({ message: "Integration not found" });
      }
      
      const [connection] = await db
        .insert(integrationConnections)
        .values({
          workspaceId,
          integrationId,
          connectionName: connectionName || `${integration.name} Connection`,
          authType: authType || integration.authType,
          apiKey: apiKey || null,
          apiSecret: apiSecret || null,
          connectedByUserId: userId,
          ipAddress: req.ip || null,
          userAgent: req.get('User-Agent') || null,
        })
        .returning();
      
      await db
        .update(integrationMarketplace)
        .set({ 
          installCount: sql`${integrationMarketplace.installCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(integrationMarketplace.id, integrationId));
      
      res.json(connection);
    } catch (error: unknown) {
      log.error("Error creating connection:", error);
      res.status(500).json({ message: "Failed to create connection" });
    }
  });
  
  router.delete('/connections/:id', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { id } = req.params;
      
      await db
        .update(integrationConnections)
        .set({ 
          isActive: false,
          disconnectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(integrationConnections.id, id),
          eq(integrationConnections.workspaceId, workspaceId)
        ));
      
      res.json({ message: "Connection disconnected" });
    } catch (error: unknown) {
      log.error("Error disconnecting integration:", error);
      res.status(500).json({ message: "Failed to disconnect integration" });
    }
  });
  
  router.get('/api-keys', requireOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      
      const apiKeys = await db
        .select({
          id: integrationApiKeys.id,
          name: integrationApiKeys.name,
          description: integrationApiKeys.description,
          keyPrefix: integrationApiKeys.keyPrefix,
          scopes: integrationApiKeys.scopes,
          ipWhitelist: integrationApiKeys.ipWhitelist,
          rateLimit: integrationApiKeys.rateLimit,
          rateLimitWindow: integrationApiKeys.rateLimitWindow,
          lastUsedAt: integrationApiKeys.lastUsedAt,
          totalRequests: integrationApiKeys.totalRequests,
          totalErrors: integrationApiKeys.totalErrors,
          isActive: integrationApiKeys.isActive,
          expiresAt: integrationApiKeys.expiresAt,
          createdAt: integrationApiKeys.createdAt,
        })
        .from(integrationApiKeys)
        .where(eq(integrationApiKeys.workspaceId, workspaceId))
        .orderBy(desc(integrationApiKeys.createdAt));
      
      res.json(apiKeys);
    } catch (error: unknown) {
      log.error("Error fetching API keys:", error);
      res.status(500).json({ message: "Failed to fetch API keys" });
    }
  });
  
  router.post('/api-keys', requireOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { name, description, scopes, rateLimit, expiresAt } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: "name is required" });
      }
      
      const crypto = await import('crypto');
      const apiKeyValue = `wfos_${crypto.randomBytes(32).toString('hex')}`;
      const keyHash = crypto.createHash('sha256').update(apiKeyValue).digest('hex');
      const keyPrefix = apiKeyValue.substring(0, 12);
      
      const [apiKey] = await db
        .insert(integrationApiKeys)
        .values({
          workspaceId,
          name,
          description: description || null,
          keyPrefix,
          keyHash,
          scopes: scopes || [],
          rateLimit: rateLimit || 1000,
          rateLimitWindow: 'hour',
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          createdByUserId: userId,
          ipAddress: req.ip || null,
          userAgent: req.get('User-Agent') || null,
        })
        .returning();
      
      res.json({ ...apiKey, apiKey: apiKeyValue });
    } catch (error: unknown) {
      log.error("Error creating API key:", error);
      res.status(500).json({ message: "Failed to create API key" });
    }
  });
  
  router.delete('/api-keys/:id', requireOwner, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { id } = req.params;
      
      await db
        .update(integrationApiKeys)
        .set({ 
          isActive: false,
          updatedAt: new Date(),
        })
        .where(and(
          eq(integrationApiKeys.id, id),
          eq(integrationApiKeys.workspaceId, workspaceId)
        ));
      
      res.json({ message: "API key revoked" });
    } catch (error: unknown) {
      log.error("Error revoking API key:", error);
      res.status(500).json({ message: "Failed to revoke API key" });
    }
  });
  
  router.get('/webhooks', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      
      const webhooks = await db
        .select()
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.workspaceId, workspaceId))
        .orderBy(desc(webhookSubscriptions.createdAt));
      
      res.json(webhooks);
    } catch (error: unknown) {
      log.error("Error fetching webhooks:", error);
      res.status(500).json({ message: "Failed to fetch webhooks" });
    }
  });
  
  router.post('/webhooks', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { name, targetUrl, events, filters, authType, authConfig, maxRetries } = req.body;
      
      if (!name || !targetUrl || !events || events.length === 0) {
        return res.status(400).json({ message: "name, targetUrl, and events are required" });
      }

      // SSRF guard — validate the target URL before persisting it
      try {
        await validateWebhookUrl(targetUrl);
      } catch (ssrfErr: any) {
        return res.status(400).json({ message: `Invalid webhook URL: ${ssrfErr.message}` });
      }
      
      const [webhook] = await db
        .insert(webhookSubscriptions)
        .values({
          workspaceId,
          name,
          targetUrl,
          events,
          filters: filters || null,
          authType: authType || 'none',
          authConfig: authConfig || null,
          maxRetries: maxRetries || 3,
          createdByUserId: userId,
        })
        .returning();
      
      res.json(webhook);
    } catch (error: unknown) {
      log.error("Error creating webhook:", error);
      res.status(500).json({ message: "Failed to create webhook" });
    }
  });
  
  router.patch('/webhooks/:id/toggle', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { id } = req.params;
      
      const [webhook] = await db
        .select()
        .from(webhookSubscriptions)
        .where(and(
          eq(webhookSubscriptions.id, id),
          eq(webhookSubscriptions.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!webhook) {
        return res.status(404).json({ message: "Webhook not found" });
      }
      
      const [updated] = await db
        .update(webhookSubscriptions)
        .set({ 
          isActive: !webhook.isActive,
          updatedAt: new Date(),
        })
        .where(eq(webhookSubscriptions.id, id))
        .returning();
      
      res.json(updated);
    } catch (error: unknown) {
      log.error("Error toggling webhook:", error);
      res.status(500).json({ message: "Failed to toggle webhook" });
    }
  });
  
  router.delete('/webhooks/:id', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { id } = req.params;
      
      await db
        .delete(webhookSubscriptions)
        .where(and(
          eq(webhookSubscriptions.id, id),
          eq(webhookSubscriptions.workspaceId, workspaceId)
        ));
      
      res.json({ message: "Webhook deleted" });
    } catch (error: unknown) {
      log.error("Error deleting webhook:", error);
      res.status(500).json({ message: "Failed to delete webhook" });
    }
  });
  
  router.get('/webhooks/:id/deliveries', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { id } = req.params;
      
      const deliveries = await db
        .select()
        .from(webhookDeliveries)
        .where(and(
          eq(webhookDeliveries.subscriptionId, id),
          eq(webhookDeliveries.workspaceId, workspaceId)
        ))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(100);
      
      res.json(deliveries);
    } catch (error: unknown) {
      log.error("Error fetching webhook deliveries:", error);
      res.status(500).json({ message: "Failed to fetch webhook deliveries" });
    }
  });

  router.get('/status', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) return res.status(400).json({ message: 'Workspace required' });
      
      const workspace = await storage.getWorkspace(workspaceId);
      
      const connections = await db.select().from(partnerConnections)
        .where(eq(partnerConnections.workspaceId, workspaceId));
      
      const qbConnection = connections.find(c => c.partnerType === 'quickbooks');
      const gustoConnection = connections.find(c => c.partnerType === 'gusto');
      
      res.json({
        quickbooks: {
          connected: !!(qbConnection?.status === 'connected' || (workspace as any)?.quickbooksRealmId),
          companyName: (qbConnection?.metadata as any)?.companyName || null,
        },
        stripe: {
          connected: !!workspace?.stripeAccountId,
        },
        gusto: {
          connected: !!(gustoConnection?.status === 'connected'),
        },
      });
    } catch (error: unknown) {
      res.status(500).json({ message: sanitizeError(error) });
    }
  });

export default router;
