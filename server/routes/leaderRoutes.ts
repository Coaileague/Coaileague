import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { requireAuth } from "../auth";
import { requireLeader, getUserPlatformRole, type AuthenticatedRequest } from "../rbac";
import { storage } from "../storage";
import { db } from "../db";
import {
  ptoRequests,
  leaderActions,
  escalationTickets,
  timeEntryDiscrepancies,
  disputes,
  platformRoles,
  users,
} from "@shared/schema";
import { sql, eq, and, or, isNull, desc, gte, inArray } from "drizzle-orm";
import crypto from "crypto";
import { emailService } from "../services/emailService";
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';
const log = createLogger('LeaderRoutes');


const router = Router();

router.get("/leaders/stats", requireAuth, requireLeader, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    
    const allEmployees = await storage.getEmployeesByWorkspace(workspaceId);
    
    const pendingPTORequests = await db
      .select()
      .from(ptoRequests)
      .where(
        and(
          eq(ptoRequests.workspaceId, workspaceId),
          eq(ptoRequests.status, 'pending')
        )
      );
    
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentLeaderActions = await db
      .select()
      .from(leaderActions)
      .where(
        and(
          eq(leaderActions.workspaceId, workspaceId),
          gte(leaderActions.createdAt, sevenDaysAgo)
        )
      );
    
    const openEscalations = await db
      .select()
      .from(escalationTickets)
      .where(
        and(
          eq(escalationTickets.workspaceId, workspaceId),
          inArray(escalationTickets.status, ['open', 'in_progress'])
        )
      );
    
    const pendingDiscrepancies = await db
      .select()
      .from(timeEntryDiscrepancies)
      .where(
        and(
          eq(timeEntryDiscrepancies.workspaceId, workspaceId),
          eq(timeEntryDiscrepancies.status, 'open')
        )
      );
    
    const pendingDisputes = await db
      .select()
      .from(disputes)
      .where(
        and(
          eq(disputes.workspaceId, workspaceId),
          inArray(disputes.status, ['pending', 'under_review'])
        )
      );
    
    const stats = {
      headcount: {
        total: allEmployees.length,
        active: allEmployees.filter(e => e.isActive).length,
        onLeave: allEmployees.filter(e => !e.isActive).length,
        pendingOnboarding: allEmployees.filter(e => e.onboardingStatus === 'pending').length,
      },
      compliance: {
        compliant: allEmployees.length - pendingDiscrepancies.length - pendingDisputes.length,
        expiringSoon: 0,
        overdue: pendingDiscrepancies.length,
      },
      pendingApprovals: {
        scheduleSwaps: 0,
        timeAdjustments: pendingDiscrepancies.length,
        ptoRequests: pendingPTORequests.length,
      },
      recentActivity: {
        actionCount: recentLeaderActions.length,
        escalationCount: openEscalations.length,
      },
    };
    
    res.json(stats);
  } catch (error) {
    log.error("Error fetching leader stats:", error);
    res.status(500).json({ message: "Failed to fetch leader stats" });
  }
});

router.get("/leaders/pending-tasks", requireAuth, requireLeader, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    
    const pendingPTO = await db
      .select()
      .from(ptoRequests)
      .where(
        and(
          eq(ptoRequests.workspaceId, workspaceId),
          eq(ptoRequests.status, 'pending')
        )
      )
      .orderBy(desc(ptoRequests.createdAt))
      .limit(20);
    
    const pendingDiscrepancies = await db
      .select()
      .from(timeEntryDiscrepancies)
      .where(
        and(
          eq(timeEntryDiscrepancies.workspaceId, workspaceId),
          eq(timeEntryDiscrepancies.status, 'open')
        )
      )
      .limit(20);
    
    const openEscalations = await db
      .select()
      .from(escalationTickets)
      .where(
        and(
          eq(escalationTickets.workspaceId, workspaceId),
          inArray(escalationTickets.status, ['open', 'in_progress'])
        )
      )
      .limit(10);
    
    const tasks: any[] = [];
    
    pendingPTO.forEach((pto: any) => {
      tasks.push({
        id: pto.id,
        title: `PTO Request: ${pto.leaveType || 'Time Off'}`,
        type: 'pto_request',
        description: pto.reason || 'PTO request pending approval',
        priority: 'medium',
        status: pto.status,
        employee: {
          id: pto.employeeId || '',
          name: pto.employeeName || 'Employee',
        },
        requestedAt: pto.createdAt,
        createdAt: pto.createdAt,
      });
    });
    
    pendingDiscrepancies.forEach((disc: any) => {
      tasks.push({
        id: disc.id,
        title: `Time Adjustment: ${disc.discrepancyType || 'Review Required'}`,
        type: 'time_adjustment',
        description: disc.description || 'Time entry discrepancy needs review',
        priority: 'high',
        status: disc.status,
        employee: {
          id: disc.employeeId || '',
          name: disc.employeeName || 'Employee',
        },
        requestedAt: disc.createdAt,
        createdAt: disc.createdAt,
      });
    });
    
    openEscalations.forEach((esc: any) => {
      tasks.push({
        id: esc.id,
        title: esc.title || 'Escalation',
        type: 'compliance_review',
        description: esc.description || 'Escalation ticket requires attention',
        priority: esc.priority || 'high',
        status: esc.status,
        employee: {
          id: esc.createdBy || '',
          name: 'Escalation',
        },
        requestedAt: esc.createdAt,
        createdAt: esc.createdAt,
      });
    });
    
    tasks.sort((a, b) => {
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
      return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
    });
    
    res.json(tasks.slice(0, 50));
  } catch (error) {
    log.error("Error fetching pending tasks:", error);
    res.status(500).json({ message: "Failed to fetch pending tasks" });
  }
});

router.get("/leaders/recent-actions", requireAuth, requireLeader, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 500);
    
    const actions = await storage.getLeaderActionsByWorkspace(workspaceId, limit);
    res.json(actions);
  } catch (error) {
    log.error("Error fetching recent actions:", error);
    res.status(500).json({ message: "Failed to fetch recent actions" });
  }
});

router.post("/leaders/reset-password", requireAuth, requireLeader, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    const leaderId = req.user?.id;
    const { employeeId, reason } = req.body;
    
    const employee = await storage.getEmployee(employeeId, workspaceId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found in your workspace" });
    }
    
    const tempPassword = crypto.randomBytes(8).toString('hex');
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    
    if (employee.userId) {
      const { stagedShifts } = await import('@shared/schema');
      await db
        .update(users)
        .set({ 
          passwordHash: hashedPassword,
          updatedAt: new Date()
        })
        .where(eq(users.id, employee.userId));
    }
    
    await storage.createLeaderAction({
      workspaceId,
      leaderId,
      leaderEmail: req.user?.email || '',
      leaderRole: req.workspaceRole,
      action: 'reset_password',
      targetEntityType: 'employee',
      targetEntityId: employeeId,
      targetEmployeeName: `${employee.firstName} ${employee.lastName}`,
      changesBefore: null,
      changesAfter: { passwordReset: true, forcePasswordReset: true },
      reason,
      ipAddress: req.ip,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userAgent: req.get('user-agent') || '',
      requiresApproval: false,
    });
    
    const workspace = await storage.getWorkspace(workspaceId);
    await emailService.sendEmployeeTemporaryPassword( // nds-exempt: one-time temporary password delivery
      workspaceId,
      employeeId,
      employee.email || '',
      tempPassword,
      employee.firstName || 'Employee',
      workspace?.name || PLATFORM.name
    ).catch(err => log.error(`[PASSWORD RESET] Failed to send email to ${employee.email}:`, sanitizeError(err)));
    
    res.json({ 
      success: true, 
      message: "Password reset successfully and sent via email",
      tempPassword
    });
  } catch (error) {
    log.error("Error resetting password:", error);
    res.status(500).json({ message: "Failed to reset password" });
  }
});

router.post("/leaders/unlock-account", requireAuth, requireLeader, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    const leaderId = req.user?.id;
    const { employeeId, reason } = req.body;
    
    const employee = await storage.getEmployee(employeeId, workspaceId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found in your workspace" });
    }
    
    if (employee.userId) {
      const { stagedShifts } = await import('@shared/schema');
      await db
        .update(users)
        .set({ 
          lockedUntil: null,
          loginAttempts: 0,
          updatedAt: new Date()
        })
        .where(eq(users.id, employee.userId));
    }
    
    await storage.createLeaderAction({
      workspaceId,
      leaderId,
      leaderEmail: req.user?.email || '',
      leaderRole: req.workspaceRole,
      action: 'unlock_account',
      targetEntityType: 'employee',
      targetEntityId: employeeId,
      targetEmployeeName: `${employee.firstName} ${employee.lastName}`,
      changesBefore: { accountLocked: true },
      changesAfter: { accountLocked: false, loginAttempts: 0 },
      reason,
      ipAddress: req.ip,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userAgent: req.get('user-agent') || '',
      requiresApproval: false,
    });
    
    res.json({ 
      success: true, 
      message: "Account unlocked successfully"
    });
  } catch (error) {
    log.error("Error unlocking account:", error);
    res.status(500).json({ message: "Failed to unlock account" });
  }
});

router.patch("/leaders/update-contact", requireAuth, requireLeader, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    const leaderId = req.user?.id;
    const { employeeId, email, phone, address, reason } = req.body;
    
    const employee = await storage.getEmployee(employeeId, workspaceId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found in your workspace" });
    }
    
    const beforeState = {
      email: employee.email,
      phone: employee.phone,
      address: employee.address,
    };
    
    const updateData: any = {};
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    
    const updated = await storage.updateEmployee(employeeId, workspaceId, updateData);
    
    const afterState = {
      email: updated?.email,
      phone: updated?.phone,
      address: updated?.address,
    };
    
    await storage.createLeaderAction({
      workspaceId,
      leaderId,
      leaderEmail: req.user?.email || '',
      leaderRole: req.workspaceRole,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      action: 'update_contact',
      targetEntityType: 'employee',
      targetEntityId: employeeId,
      targetEmployeeName: `${employee.firstName} ${employee.lastName}`,
      changesBefore: beforeState,
      changesAfter: afterState,
      reason,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || '',
      requiresApproval: false,
    });
    
    res.json({ 
      success: true, 
      message: "Contact information updated successfully",
      employee: updated
    });
  } catch (error) {
    log.error("Error updating contact info:", error);
    res.status(500).json({ message: "Failed to update contact information" });
  }
});

router.post("/leaders/escalate", requireAuth, requireLeader, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    const requestorId = req.user?.id;
    const { category, title, description, priority, relatedEntityType, relatedEntityId, contextData } = req.body;
    
    let ticket;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!ticket && attempts < maxAttempts) {
      try {
        const ticketNumber = `ESC-${crypto.randomInt(100000, 999999)}`;
        
        ticket = await storage.createEscalationTicket({
          ticketNumber,
          workspaceId,
          requestorId,
          requestorEmail: req.user?.email || '',
          requestorRole: req.workspaceRole,
          category: category || 'other',
          title,
          description,
          priority: priority || 'normal',
          relatedEntityType,
          relatedEntityId,
          contextData,
          attachments: null,
          assignedTo: null,
          status: 'open',
          resolution: null,
        });
      } catch (error: unknown) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        if (error.code === '23505' && error.constraint === 'escalation_tickets_ticket_number_unique') {
          attempts++;
          if (attempts >= maxAttempts) {
            return res.status(500).json({ message: "Failed to generate unique ticket number after retries" });
          }
          continue;
        }
        throw error;
      }
    }
    
    if (!ticket) {
      return res.status(500).json({ message: "Failed to create escalation ticket" });
    }
    
    await storage.createLeaderAction({
      workspaceId,
      requestorId,
      leaderEmail: req.user?.email || '',
      leaderRole: req.workspaceRole,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      action: 'escalate_to_support',
      targetEntityType: 'escalation_ticket',
      targetEntityId: ticket.id,
      targetEmployeeName: null,
      changesBefore: null,
      changesAfter: { ticketNumber: ticket.ticketNumber, category, priority },
      reason: description,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || '',
      requiresApproval: false,
    });
    
    res.status(201).json({ 
      success: true, 
      message: "Escalation ticket created successfully",
      ticket
    });
  } catch (error) {
    log.error("Error creating escalation ticket:", error);
    res.status(500).json({ message: "Failed to create escalation ticket" });
  }
});

router.get("/leaders/escalations", requireAuth, requireLeader, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    
    const tickets = await storage.getEscalationTicketsByWorkspace(workspaceId);
    res.json(tickets);
  } catch (error) {
    log.error("Error fetching escalation tickets:", error);
    res.status(500).json({ message: "Failed to fetch escalation tickets" });
  }
});

router.patch("/leaders/escalations/:id/status", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { status, resolution } = req.body;
    const staffId = req.user?.id;
    
    const [staffRole] = await db
      .select()
      .from(platformRoles)
      .where(
        and(
          eq(platformRoles.userId, staffId),
          isNull(platformRoles.revokedAt)
        )
      )
      .limit(1);
    
    const isPlatformStaff = staffRole && ['root_admin', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(staffRole.role);
    
    if (!isPlatformStaff) {
      return res.status(403).json({ message: "Only platform staff can update escalation tickets" });
    }
    
    const [existingTicket] = await db
      .select()
      .from(escalationTickets)
      .where(eq(escalationTickets.id, id))
      .limit(1);
    
    if (!existingTicket) {
      return res.status(404).json({ message: "Escalation ticket not found" });
    }
    
    const currentStatus = existingTicket.status;
    const allowedTransitions: Record<string, string[]> = {
      'open': ['in_progress', 'resolved'],
      'in_progress': ['resolved', 'open'],
      'resolved': [],
    };
    
    const validStatuses = ['open', 'in_progress', 'resolved'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }
    
    const allowedNextStates = allowedTransitions[currentStatus || 'open'] || [];
    if (!allowedNextStates.includes(status)) {
      return res.status(400).json({ 
        message: `Cannot transition from ${currentStatus} to ${status}. Allowed transitions: ${allowedNextStates.join(', ') || 'none'}` 
      });
    }
    
    if (status === 'resolved' && !resolution) {
      return res.status(400).json({ message: "Resolution is required when closing an escalation ticket" });
    }
    
    const beforeState = {
      status: existingTicket.status,
      resolution: existingTicket.resolution,
    };
    
    const updated = await storage.updateEscalationTicketStatus(id, status, staffId);
    
    if (resolution && updated) {
      await storage.addEscalationTicketResponse(id, resolution);
    }
    
    const afterState = {
      status: updated?.status,
      resolution: updated?.resolution || resolution,
    };
    
    await storage.createLeaderAction({
      workspaceId: existingTicket.workspaceId,
      leaderId: staffId,
      leaderEmail: req.user?.email || '',
      leaderRole: staffRole.role as any,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      action: 'platform_update_escalation',
      targetEntityType: 'escalation_ticket',
      targetEntityId: id,
      targetEmployeeName: existingTicket.ticketNumber,
      changesBefore: beforeState,
      changesAfter: afterState,
      reason: resolution || `Status changed to ${status}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || '',
      requiresApproval: false,
    });
    
    res.json({ 
      success: true, 
      message: "Escalation ticket updated successfully",
      ticket: updated
    });
  } catch (error) {
    log.error("Error updating escalation ticket:", error);
    res.status(500).json({ message: "Failed to update escalation ticket" });
  }
});

export default router;
