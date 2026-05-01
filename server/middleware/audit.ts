// Audit Logging Middleware for SOC2/GDPR Compliance
// Automatically captures request context and provides audit trail helpers

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import type { InsertAuditLog } from '@shared/schema';
import { universalAudit } from '../services/universalAuditService';
import { createLogger } from '../lib/logger';
const log = createLogger('auditMiddleware');

// Extract IP address from request (handles proxies)
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]).trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

// Generate unique request ID for correlation
function generateRequestId(): string {
  return `req_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Middleware to capture audit context from authenticated requests
 * Must be used AFTER authentication middleware
 */
export async function auditContextMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only capture context for authenticated requests (custom auth: user.id is set)
  if (req.user?.id) {
    const userId = req.user.id as string;
    
    // Get workspace ID from request (set by workspace resolution middleware)
    // or load user's current workspace
    let workspaceId = req.workspaceId;
    
    if (!workspaceId) {
      try {
        // Load user to get their current workspace
        const user = await storage.getUser(userId);
        // @ts-expect-error — TS migration: fix in refactoring sprint
        workspaceId = user?.currentWorkspaceId;
      } catch (error) {
        log.warn('Failed to load user workspace for audit context:', error);
      }
    }
    
    if (workspaceId) {
      req.auditContext = {
        workspaceId,
        userId,
        userEmail: req.user?.email || 'unknown',
        userRole: req.platformRole || req.workspaceRole || 'employee',
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'unknown',
        requestId: generateRequestId(),
      };
    }
  }
  
  next();
}

/**
 * Helper to create audit log entry with request context
 * Use this in route handlers after mutations
 */
export async function createAuditLog(
  req: Request,
  action: 'create' | 'update' | 'delete' | 'login' | 'logout' | 'clock_in' | 'clock_out' | 'generate_invoice' | 'payment_received' | 'assign_manager' | 'remove_manager',
  entityType: string,
  entityId: string,
  changes?: Record<string, unknown>,
  options?: {
    isSensitiveData?: boolean;
    complianceTag?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  // Require audit context from middleware
  if (!req.auditContext) {
    log.warn('Audit context not available - ensure auditContextMiddleware is enabled');
    return;
  }

  const {
    workspaceId,
    userId,
    userEmail,
    userRole,
    ipAddress,
    userAgent,
    requestId,
  } = req.auditContext;

  if (!workspaceId || !userId || !userEmail || !userRole) {
    log.warn('Incomplete audit context - skipping audit log write', {
      workspaceId,
      userId,
      userEmail,
      userRole,
      requestId: requestId || req.requestId,
    });
    return;
  }

  try {
    await storage.createAuditLog({
      workspaceId,
      userId,
      userEmail,
      userRole,
      action,
      entityType,
      entityId,
      changes: changes || null,
      metadata: {
        endpoint: `${req.method} ${req.path}`,
        ...(options?.metadata || {}),
      },
      ipAddress,
      userAgent,
      requestId: requestId || req.requestId,
      isSensitiveData: options?.isSensitiveData || false,
      complianceTag: options?.complianceTag || null,
    });

    const changeTypeMap: Record<string, string> = {
      create: 'create', update: 'update', delete: 'delete',
      login: 'action', logout: 'action',
      clock_in: 'action', clock_out: 'action',
      generate_invoice: 'create', payment_received: 'action',
      assign_manager: 'update', remove_manager: 'update',
    };
    universalAudit.log({
      workspaceId,
      actorId: userId,
      actorType: 'user',
      actorRole: userRole,
      actorIp: ipAddress,
      action: `${entityType}.${action}`,
      entityType,
      entityId,
      changeType: (changeTypeMap[action] || 'action') as any,
      changes: changes ? { data: { old: null, new: changes } } : null,
      metadata: { endpoint: `${req.method} ${req.path}`, requestId: requestId || req.requestId, ...(options?.metadata || {}) },
      sourceRoute: `${req.method} ${req.path}`,
    }).catch((err: any) => log.warn('[AuditLog] Async write failed (non-blocking):', err?.message));
  } catch (error) {
    log.error('Failed to create audit log:', error);
  }
}

/**
 * Helper for service/webhook paths that don't have Express request context
 * Use this for background jobs, Stripe webhooks, etc.
 */
export async function createAuditLogFromContext(
  context: {
    workspaceId: string;
    userId: string;
    userEmail: string;
    userRole: string;
    ipAddress?: string;
    userAgent?: string;
  },
  action: 'create' | 'update' | 'delete' | 'login' | 'logout' | 'clock_in' | 'clock_out' | 'generate_invoice' | 'payment_received' | 'assign_manager' | 'remove_manager',
  entityType: string,
  entityId: string,
  changes?: Record<string, unknown>,
  options?: {
    isSensitiveData?: boolean;
    complianceTag?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await storage.createAuditLog({
      workspaceId: context.workspaceId,
      userId: context.userId,
      userEmail: context.userEmail,
      userRole: context.userRole,
      action,
      entityType,
      entityId,
      changes: changes || null,
      metadata: options?.metadata || null,
      ipAddress: context.ipAddress || 'system',
      userAgent: context.userAgent || 'system-service',
      requestId: `svc_${Date.now()}`,
      isSensitiveData: options?.isSensitiveData || false,
      complianceTag: options?.complianceTag || null,
    });

    universalAudit.log({
      workspaceId: context.workspaceId,
      actorId: context.userId,
      actorType: 'user',
      actorRole: context.userRole,
      actorIp: context.ipAddress || 'system',
      action: `${entityType}.${action}`,
      entityType,
      entityId,
      changeType: (['create', 'update', 'delete'].includes(action) ? action : 'action') as any,
      changes: changes ? { data: { old: null, new: changes } } : null,
      metadata: options?.metadata || {},
    }).catch((err: any) => log.warn('[AuditLog] Async write failed (non-blocking):', err?.message));
  } catch (error) {
    log.error('Failed to create audit log from context:', error);
  }
}

/**
 * Convenience wrapper for common CRUD audit patterns
 */
export const auditHelpers = {
  /**
   * Log employee creation with PII flag
   */
  async employeeCreated(req: Request, employee: { id: string; email?: string }) {
    await createAuditLog(req, 'create', 'employee', employee.id, undefined, {
      isSensitiveData: true,
      complianceTag: 'gdpr',
    });
  },

  /**
   * Log employee update with before/after values.
   * PII fields (SSN, bank credentials) are scrubbed from the audit record —
   * the fact of change is recorded but the raw values are never written to
   * audit_logs.metadata, preventing exfiltration via the audit trail.
   */
  async employeeUpdated(req: Request, employeeId: string, before: any, after: any) {
    // FIX [AUDIT LOG PII]: Scrub sensitive financial/identity fields before writing
    // to audit_logs. Without this, a manager updating payroll info would cause the
    // raw SSN and bank account number to be stored in the audit_logs.metadata JSONB
    // column, creating a secondary exfiltration path beyond the masked API response.
    const PII_FIELDS = ['ssn', 'taxId', 'bankAccountNumber', 'bankRoutingNumber', 'bankAccountType'];
    const scrub = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return obj;
      const clean = { ...obj };
      for (const field of PII_FIELDS) {
        if (field in clean) {
          clean[field] = clean[field] ? '[REDACTED]' : null;
        }
      }
      return clean;
    };
    await createAuditLog(req, 'update', 'employee', employeeId, { before: scrub(before), after: scrub(after) }, {
      isSensitiveData: true,
      complianceTag: 'gdpr',
    });
  },

  /**
   * Log employee deletion
   */
  async employeeDeleted(req: Request, employeeId: string, employeeData: any) {
    await createAuditLog(req, 'delete', 'employee', employeeId, { deleted: employeeData }, {
      isSensitiveData: true,
      complianceTag: 'gdpr',
    });
  },

  /**
   * Log invoice generation
   */
  async invoiceGenerated(req: Request, invoice: { id: string; total: string }) {
    await createAuditLog(req, 'generate_invoice', 'invoice', invoice.id, {
      total: invoice.total,
    }, {
      isSensitiveData: true,
      complianceTag: 'soc2',
    });
  },

  /**
   * Log payment received
   */
  async paymentReceived(req: Request, invoiceId: string, amount: string) {
    await createAuditLog(req, 'payment_received', 'invoice', invoiceId, {
      amount,
      timestamp: new Date().toISOString(),
    }, {
      isSensitiveData: true,
      complianceTag: 'soc2',
    });
  },

  /**
   * Log time clock-in
   */
  async clockIn(req: Request, timeEntryId: string) {
    await createAuditLog(req, 'clock_in', 'time_entry', timeEntryId, {
      timestamp: new Date().toISOString(),
    });
  },

  /**
   * Log time clock-out
   */
  async clockOut(req: Request, timeEntryId: string, hours: number) {
    await createAuditLog(req, 'clock_out', 'time_entry', timeEntryId, {
      timestamp: new Date().toISOString(),
      totalHours: hours,
    });
  },
};
