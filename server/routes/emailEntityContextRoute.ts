/**
 * GET /api/email/entity-context?email={senderEmail}
 * 
 * Resolves a sender email address to a client or employee entity in the workspace,
 * returns their operational context, and generates Trinity suggested actions.
 * Powers the AIContextRail entity panel in EmailHubCanvas.tsx.
 */
import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../auth';
import { db } from '../db';
import { clients, employees, shifts, invoices, employeeCertifications } from '@shared/schema';
import { eq, and, gte, count, sql } from 'drizzle-orm';
import { createLogger } from '../lib/logger';

const log = createLogger('EmailEntityContext');
const router = Router();

router.get('/api/email/entity-context', requireAuth, async (req: AuthenticatedRequest, res) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'Workspace context required' });

  const senderEmail = String(req.query.email ?? '').toLowerCase().trim();
  if (!senderEmail || !senderEmail.includes('@')) {
    return res.json({ entity: null, stats: null, suggestedActions: [] });
  }

  try {
    // 1. Try to match as a client contact email
    const [client] = await db.select({
      id: clients.id,
      name: clients.companyName,
      contactEmail: clients.contactEmail,
      billingRate: (clients as any).billingRate,
    })
      .from(clients)
      .where(and(
        eq(clients.workspaceId, workspaceId),
        sql`LOWER(${clients.contactEmail}) = ${senderEmail}`
      ))
      .limit(1);

    if (client) {
      // Fetch client stats
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [openShiftCount] = await db.select({ count: count() })
        .from(shifts)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          eq(shifts.clientId, client.id),
          sql`${shifts.status} IN ('open', 'scheduled', 'unassigned')`
        ));

      const [officerCount] = await db.select({ count: count() })
        .from(shifts)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          eq(shifts.clientId, client.id),
          sql`${shifts.employeeId} IS NOT NULL`
        ));

      const [mtdInvoices] = await db.select({
        total: sql<number>`COALESCE(SUM(CAST(${invoices.totalAmount} AS NUMERIC)), 0)`
      })
        .from(invoices)
        .where(and(
          eq((invoices as any).workspaceId, workspaceId),
          eq((invoices as any).clientId, client.id),
          gte(invoices.createdAt, monthStart)
        ))
        .catch(() => [{ total: 0 }]);

      const openShifts = Number(openShiftCount?.count ?? 0);
      const officers = Number(officerCount?.count ?? 0);
      const mtdInvoiced = Number(mtdInvoices?.total ?? 0);
      const rate = client.billingRate ? parseFloat(String(client.billingRate)) : null;

      // Build Trinity suggested actions based on context
      const suggestedActions = [];
      if (openShifts > 0) {
        suggestedActions.push({
          label: `Fill ${openShifts} open shift${openShifts > 1 ? 's' : ''}`,
          description: 'Trigger Trinity auto-fill pipeline',
          icon: 'shifts',
        });
      }
      suggestedActions.push({
        label: 'Generate contract amendment',
        description: 'Branded PDF → vault → send to client',
        icon: 'pdf',
      });
      if (mtdInvoiced > 0) {
        suggestedActions.push({
          label: 'View invoice status',
          description: `$${mtdInvoiced.toLocaleString()} invoiced this month`,
          icon: 'invoice',
        });
      }
      suggestedActions.push({
        label: 'Send shift confirmation',
        description: 'Officer names, times, site address',
        icon: 'email',
      });

      return res.json({
        entity: { id: client.id, name: client.name, type: 'client', email: senderEmail },
        stats: { openShifts, officerCount: officers, contractRate: rate, mtdInvoiced },
        suggestedActions,
      });
    }

    // 2. Try to match as an employee
    const [employee] = await db.select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
    })
      .from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        sql`LOWER(${employees.email}) = ${senderEmail}`
      ))
      .limit(1);

    if (employee) {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      // Next upcoming shift
      const [nextShift] = await db.select({
        date: shifts.date,
        startTime: shifts.startTime,
        status: shifts.status,
      })
        .from(shifts)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          eq(shifts.employeeId, employee.id),
          gte(shifts.date, now.toISOString().split('T')[0]),
          sql`${shifts.status} IN ('scheduled', 'confirmed')`
        ))
        .orderBy(shifts.date)
        .limit(1);

      // Certification count
      const [certCount] = await db.select({ count: count() })
        .from(employeeCertifications)
        .where(eq(employeeCertifications.employeeId, employee.id))
        .catch(() => [{ count: 0 }]);

      const name = `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim();

      const suggestedActions = [
        { label: 'View employee profile', description: 'Full record, certifications, history', icon: 'profile' },
        { label: 'Generate employment letter', description: 'FCRA-bounded PDF → signed → vault', icon: 'pdf' },
      ];
      if (nextShift) {
        suggestedActions.unshift({
          label: 'View upcoming shift',
          description: `${nextShift.date} · ${nextShift.startTime ?? ''} · ${nextShift.status}`,
          icon: 'shifts',
        });
      }

      return res.json({
        entity: { id: employee.id, name, type: 'employee', email: senderEmail },
        stats: {
          nextShift: nextShift ? `${nextShift.date} ${nextShift.startTime ?? ''}`.trim() : null,
          timesheetStatus: null, // Could add timesheet lookup here
          certCount: Number(certCount?.count ?? 0),
        },
        suggestedActions,
      });
    }

    // 3. Unknown sender
    return res.json({
      entity: null,
      stats: null,
      suggestedActions: [
        { label: 'Add as new client', description: 'Create client record from this email', icon: 'client' },
        { label: 'Add as new employee', description: 'Start onboarding from this email', icon: 'employee' },
      ],
    });

  } catch (error: any) {
    log.error('[EmailEntityContext] Error:', error?.message);
    return res.json({ entity: null, stats: null, suggestedActions: [] });
  }
});

export default router;
