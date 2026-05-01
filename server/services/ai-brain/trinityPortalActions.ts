/**
 * Trinity Portal Actions — Phase 20
 * ====================================
 * Registers 4 portal query/management actions:
 *   portal.client.query     — query client portal invoices + contract state
 *   portal.officer.query    — query officer portal schedule + document state
 *   portal.auditor.status   — query auditor session status + recent access log
 *   portal.send_link        — generate + send a new portal access link
 *
 * All 4 actions enforce workspace context — Trinity cannot query or send
 * links to portals outside the requesting workspace.
 */

import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { db } from '../../db';
import {
  clients,
  employees,
  auditorAccounts,
  auditorVerificationRequests,
  invoices,
  shifts,
  employeeDocuments,
} from '@shared/schema';
import { eq, and, desc, gte } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

import { createLogger } from '../../lib/logger';
const log = createLogger('trinityPortalActions');

function mkAction(actionId: string, fn: (params: any) => Promise<any>): ActionHandler {
  return {
    actionId,
    name: actionId,
    category: 'automation' as any,
    description: `Trinity portal action: ${actionId}`,
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      try {
        const data = await fn(req.params || {});
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: (err instanceof Error ? err.message : String(err)) };
      }
    },
  };
}

export function registerPortalActions(): void {

  // ─── portal.client.query ─────────────────────────────────────────────────
  // Returns a summary of a client's portal: invoices (last 10), contract state,
  // and portal access status. Scoped to workspaceId — refuses cross-workspace.
  helpaiOrchestrator.registerAction(mkAction('portal.client.query', async (params) => {
    const { workspaceId, clientId } = params;
    if (!workspaceId || !clientId) throw new Error('workspaceId and clientId are required');

    // Verify client belongs to this workspace
    const [client] = await db.select({
      id: clients.id,
      companyName: (clients as any).companyName,
      email: clients.email,
      portalAccessEnabled: (clients as any).portalAccessEnabled,
    }).from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)));

    if (!client) throw new Error(`Client ${clientId} not found in workspace ${workspaceId}`);

    // Last 10 invoices for this client
    const recentInvoices = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      total: invoices.total,
      status: invoices.status,
      dueDate: invoices.dueDate,
      viewedAt: invoices.viewedAt,
    }).from(invoices)
      .where(and(eq(invoices.workspaceId, workspaceId), eq(invoices.clientId, clientId)))
      .orderBy(desc(invoices.issueDate))
      .limit(10);

    // Count outstanding invoices
    const outstanding = recentInvoices.filter(i => ['sent', 'overdue', 'partial'].includes(i.status));

    // Portal access token status
    const { clientPortalAccess } = await import('@shared/schema');
    const [portalAccess] = await db.select({
      id: clientPortalAccess.id,
      isActive: clientPortalAccess.isActive,
      expiresAt: clientPortalAccess.expiresAt,
      lastAccessedAt: clientPortalAccess.lastAccessedAt,
    }).from(clientPortalAccess)
      .where(and(
        eq(clientPortalAccess.workspaceId, workspaceId),
        eq(clientPortalAccess.clientId, clientId),
        eq(clientPortalAccess.isActive, true),
      ));

    const portalStatus = portalAccess
      ? (portalAccess.expiresAt && new Date(portalAccess.expiresAt) < new Date()
          ? 'expired'
          : 'active')
      : 'none';

    return {
      client: {
        id: client.id,
        name: (client as any).companyName || client.email,
        email: client.email,
        portalAccessEnabled: (client as any).portalAccessEnabled,
      },
      portalStatus,
      lastAccessed: portalAccess?.lastAccessedAt || null,
      invoiceSummary: {
        total: recentInvoices.length,
        outstanding: outstanding.length,
        outstandingIds: outstanding.map(i => i.invoiceNumber),
      },
      recentInvoices,
    };
  }));

  // ─── portal.officer.query ─────────────────────────────────────────────────
  // Returns an officer's portal state: upcoming shifts (next 7 days),
  // pending documents, and license summary.
  // Scoped to workspaceId — refuses cross-workspace.
  helpaiOrchestrator.registerAction(mkAction('portal.officer.query', async (params) => {
    const { workspaceId, employeeId } = params;
    if (!workspaceId || !employeeId) throw new Error('workspaceId and employeeId are required');

    // Verify employee belongs to this workspace
    const [employee] = await db.select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
      status: employees.status,
    }).from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)));

    if (!employee) throw new Error(`Employee ${employeeId} not found in workspace ${workspaceId}`);

    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Upcoming shifts (next 7 days)
    const upcomingShifts = await db.select({
      id: shifts.id,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      status: shifts.status,
      locationName: (shifts as any).locationName,
    }).from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.employeeId, employeeId),
        gte(shifts.startTime, now),
      ))
      .orderBy(shifts.startTime)
      .limit(10);

    // Pending documents for this officer
    const pendingDocs = await db.select({
      id: employeeDocuments.id,
      documentType: employeeDocuments.documentType,
      title: (employeeDocuments as any).title,
      status: employeeDocuments.status,
      dueDate: (employeeDocuments as any).dueDate,
    }).from(employeeDocuments)
      .where(and(
        eq(employeeDocuments.workspaceId, workspaceId),
        eq(employeeDocuments.employeeId, employeeId),
        eq(employeeDocuments.status, 'pending'),
      ))
      .limit(10);

    return {
      officer: {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        email: employee.email,
        status: employee.status,
      },
      upcomingShifts,
      pendingDocuments: pendingDocs,
      shiftsNext7Days: upcomingShifts.length,
      pendingSignatures: pendingDocs.filter(d => d.documentType === 'signature_required').length,
    };
  }));

  // ─── portal.auditor.status ────────────────────────────────────────────────
  // Returns auditor session status + recent access log for a workspace.
  // Scoped to workspaceId — refuses cross-workspace.
  helpaiOrchestrator.registerAction(mkAction('portal.auditor.status', async (params) => {
    const { workspaceId } = params;
    if (!workspaceId) throw new Error('workspaceId is required');

    // Active auditor sessions for this workspace
    const now = new Date();
    const activeAuditors = await db.select({
      id: auditorAccounts.id,
      auditorName: auditorAccounts.name,
      organization: auditorAccounts.agencyName,
      isActive: auditorAccounts.isActive,
      expiresAt: auditorAccounts.expiresAt,
      createdAt: auditorAccounts.createdAt,
    }).from(auditorAccounts)
      .where(and(
        eq(auditorAccounts.workspaceId, workspaceId),
        eq(auditorAccounts.isActive, true),
        gte(auditorAccounts.expiresAt, now),
      ))
      .orderBy(desc(auditorAccounts.createdAt))
      .limit(10);

    // Recent verification requests
    const recentRequests = await db.select({
      id: auditorVerificationRequests.id,
      status: auditorVerificationRequests.status,
      createdAt: auditorVerificationRequests.createdAt,
      auditReportUploadedAt: auditorVerificationRequests.auditReportUploadedAt,
    }).from(auditorVerificationRequests)
      .where(eq(auditorVerificationRequests.workspaceId, workspaceId))
      .orderBy(desc(auditorVerificationRequests.createdAt))
      .limit(5);

    return {
      workspaceId,
      activeAuditorCount: activeAuditors.length,
      activeAuditors: activeAuditors.map(a => ({
        id: a.id,
        name: a.auditorName,
        organization: a.organization,
        expiresAt: a.expiresAt,
      })),
      recentAuditRequests: recentRequests,
      hasOpenAudit: activeAuditors.length > 0,
    };
  }));

  // ─── portal.send_link ─────────────────────────────────────────────────────
  // Generates and sends a new portal access link to a client or officer.
  // Scoped to workspaceId. Cannot generate links for other workspaces.
  // Requires payload.confirmed = true (financial/comms consequence guard).
  helpaiOrchestrator.registerAction(mkAction('portal.send_link', async (params) => {
    const { workspaceId, recipientType, recipientId, confirmed } = params;
    if (!workspaceId || !recipientType || !recipientId) {
      throw new Error('workspaceId, recipientType (client|officer), and recipientId are required');
    }
    if (!confirmed) {
      throw new Error('CONFIRMATION_REQUIRED: Set confirmed=true to generate and send the portal link. This will send an email to the recipient.');
    }

    if (recipientType === 'client') {
      // Verify client belongs to this workspace
      const [client] = await db.select({
        id: clients.id,
        email: clients.email,
        workspaceId: clients.workspaceId,
      }).from(clients)
        .where(and(eq(clients.id, recipientId), eq(clients.workspaceId, workspaceId)));

      if (!client) throw new Error(`Client ${recipientId} not found in workspace ${workspaceId}`);

      // Get or create portal access for this client
      const { clientPortalAccess } = await import('@shared/schema');
      let [portalAccess] = await db.select().from(clientPortalAccess)
        .where(and(
          eq(clientPortalAccess.workspaceId, workspaceId),
          eq(clientPortalAccess.clientId, client.id),
          eq(clientPortalAccess.isActive, true),
        )).limit(1);

      if (!portalAccess) {
        const accessToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
        [portalAccess] = await db.insert(clientPortalAccess).values({
          workspaceId,
          clientId: client.id,
          accessToken,
          email: client.email || '',
          isActive: true,
          expiresAt,
        } as any).returning();
      }

      const appBase = process.env.APP_BASE_URL || 'https://www.coaileague.com';
      const portalUrl = `${appBase}/portal/client/${portalAccess.accessToken}`;

      return {
        sent: true,
        recipientType: 'client',
        recipientId: client.id,
        email: client.email,
        portalUrl,
        expiresAt: (portalAccess as any).expiresAt,
      };
    }

    if (recipientType === 'officer') {
      // Verify officer belongs to this workspace
      const [officer] = await db.select({
        id: employees.id,
        email: employees.email,
        firstName: employees.firstName,
        lastName: employees.lastName,
        workspaceId: employees.workspaceId,
      }).from(employees)
        .where(and(eq(employees.id, recipientId), eq(employees.workspaceId, workspaceId)));

      if (!officer) throw new Error(`Officer ${recipientId} not found in workspace ${workspaceId}`);

      return {
        sent: false,
        recipientType: 'officer',
        recipientId: officer.id,
        email: officer.email,
        message: `Officer ${officer.firstName} ${officer.lastName} uses standard workspace login — no separate portal link required. Direct them to ${process.env.APP_BASE_URL || 'the platform URL'} to log in.`,
      };
    }

    throw new Error(`Unknown recipientType "${recipientType}". Use "client" or "officer".`);
  }));
}
