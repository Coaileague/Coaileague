import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { db } from "../db";
import { shiftChatrooms, darReports } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { storage } from "../storage";
import { shiftChatroomWorkflowService } from "../services/shiftChatroomWorkflowService";
import { reportBotPdfService } from "../services/bots/reportBotPdfService";
import { platformEventBus } from "../services/platformEventBus";
import { createLogger } from '../lib/logger';
const log = createLogger('ShiftChatroomRoutes');


const router = Router();

router.get('/active', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    const activeChatrooms = await storage.getActiveShiftChatrooms(workspaceId);
    res.json(activeChatrooms);
  } catch (error: unknown) {
    log.error("Error fetching active shift chatrooms:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to fetch shift chatrooms" });
  }
});

router.get('/by-shift/:shiftId', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    const [chatroom] = await db.select()
      .from(shiftChatrooms)
      .where(and(
        eq(shiftChatrooms.shiftId, req.params.shiftId),
        eq(shiftChatrooms.workspaceId, workspaceId)
      ))
      .limit(1);
    if (!chatroom) {
      return res.status(404).json({ message: "No shift room found for this shift" });
    }
    res.json({ chatroom });
  } catch (error: unknown) {
    log.error("Error fetching shift chatroom by shiftId:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to fetch shift chatroom" });
  }
});

// These specific routes must be registered BEFORE /:shiftId/:timeEntryId to prevent shadowing
router.get('/:chatroomId/premium-status', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { chatroomId } = req.params;
    const [chatroom] = await db.select().from(shiftChatrooms).where(eq(shiftChatrooms.id, chatroomId));
    if (!chatroom) return res.status(404).json({ success: false, error: 'Chatroom not found' });
    if (chatroom.workspaceId !== workspaceId) return res.status(403).json({ success: false, error: 'Access denied' });
    const status = await shiftChatroomWorkflowService.getPremiumFeatureStatus(chatroomId, chatroom.workspaceId);
    res.json({ success: true, ...status });
  } catch (error: unknown) {
    log.error("Error getting premium status:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to get premium status" });
  }
});

router.get('/dar/:darId', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id || req.user?.claims?.sub;
    const dar = await fetchDAR(req.params.darId, workspaceId);
    if (!dar) return res.status(404).json({ message: 'DAR not found' });
    await appendAccessLog(dar.id, userId, 'viewed');
    res.json({ dar });
  } catch (err: unknown) {
    res.status(500).json({ message: sanitizeError(err) || 'Failed to fetch DAR' });
  }
});

router.get('/:shiftId/:timeEntryId', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;

    const chatroom = await storage.getShiftChatroom(req.params.shiftId, req.params.timeEntryId);
    
    if (!chatroom) {
      return res.status(404).json({ message: "Shift chatroom not found" });
    }

    if (chatroom.workspaceId !== workspaceId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const messages = await storage.getChatMessagesByConversation(chatroom.id);
    
    res.json({ chatroom, messages });
  } catch (error: unknown) {
    log.error("Error fetching shift chatroom:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to fetch shift chatroom" });
  }
});

router.post('/:conversationId/messages', async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const workspaceId = req.workspaceId;

    // Scope employee lookup to the validated workspace — prevents cross-tenant message injection
    const employee = await storage.getEmployeeByUserId(userId, workspaceId);
    
    if (!employee) {
      return res.status(404).json({ message: "Employee not found in this workspace" });
    }

    const conversation = await storage.getChatConversation(req.params.conversationId);
    
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Verify the conversation belongs to this workspace
    if (conversation.workspaceId && conversation.workspaceId !== workspaceId) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (conversation.conversationType !== 'shift_chat') {
      return res.status(403).json({ message: "Not a shift chatroom" });
    }

    const shiftChatBodySchema = z.object({
      message: z.string().min(1, 'Message is required'),
    });
    const shiftChatParsed = shiftChatBodySchema.safeParse(req.body);
    if (!shiftChatParsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: shiftChatParsed.error.flatten() });
    }

    const message = await storage.createChatMessage({
      conversationId: req.params.conversationId,
      senderId: employee.id,
      senderName: employee.lastName ? `${employee.firstName} ${employee.lastName}` : (employee.firstName || 'User'),
      senderType: 'employee',
      message: shiftChatParsed.data.message,
      isSystemMessage: false,
    });

    res.json(message);
  } catch (error: unknown) {
    log.error("Error sending shift chat message:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to send message" });
  }
});

router.post('/:chatroomId/send', async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const workspaceId = req.workspaceId;
    const { content, messageType, attachmentUrl, attachmentType, attachmentSize, metadata } = req.body;
    
    if (!content) {
      return res.status(400).json({ message: "Content is required" });
    }

    // Verify chatroom belongs to this workspace before sending
    const [chatroom] = await db.select({ workspaceId: shiftChatrooms.workspaceId })
      .from(shiftChatrooms)
      .where(eq(shiftChatrooms.id, req.params.chatroomId))
      .limit(1);

    if (!chatroom) {
      return res.status(404).json({ message: "Chatroom not found" });
    }
    if (chatroom.workspaceId !== workspaceId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const result = await shiftChatroomWorkflowService.sendMessage(
      req.params.chatroomId,
      userId,
      { content, messageType: messageType || 'text', attachmentUrl, attachmentType, attachmentSize, metadata }
    );

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    res.json({ success: true, messageId: result.messageId });
  } catch (error: unknown) {
    log.error("Error sending chatroom message:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to send message" });
  }
});

router.post('/:chatroomId/enable-recording', async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const workspaceId = req.workspaceId;
    const { chatroomId } = req.params;
    
    const [chatroom] = await db.select().from(shiftChatrooms).where(eq(shiftChatrooms.id, chatroomId));
    if (!chatroom) {
      return res.status(404).json({ success: false, error: 'Chatroom not found' });
    }
    if (chatroom.workspaceId !== workspaceId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const result = await shiftChatroomWorkflowService.enableTrinityRecording(
      chatroomId,
      chatroom.workspaceId,
      userId
    );

    if (!result.success) {
      return res.status(result.isPremium ? 402 : 400).json({
        success: false,
        error: result.error,
        isPremium: result.isPremium,
        creditCost: result.creditCost,
        upgradeRequired: true,
      });
    }

    res.json({ success: true, isPremium: true });
  } catch (error: unknown) {
    log.error("Error enabling Trinity recording:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to enable recording" });
  }
});

router.post('/:chatroomId/generate-transcript', async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const workspaceId = req.workspaceId;
    const { chatroomId } = req.params;
    
    const [chatroom] = await db.select().from(shiftChatrooms).where(eq(shiftChatrooms.id, chatroomId));
    if (!chatroom) {
      return res.status(404).json({ success: false, error: 'Chatroom not found' });
    }
    if (chatroom.workspaceId !== workspaceId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const result = await shiftChatroomWorkflowService.generateMeetingTranscript(
      chatroomId,
      chatroom.workspaceId,
      userId
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      transcriptId: result.transcriptId,
      summary: result.summary,
      actionItems: result.actionItems,
      creditsUsed: result.creditsUsed,
    });
  } catch (error: unknown) {
    log.error("Error generating transcript:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to generate transcript" });
  }
});

// ============================================================================
// DAR APPROVAL WORKFLOW ROUTES — Manager actions on Daily Activity Reports
// ============================================================================

// Helper — fetch + workspace-validate a DAR
async function fetchDAR(darId: string, workspaceId: string) {
  const [dar] = await db.select().from(darReports)
    .where(and(eq(darReports.id, darId), eq(darReports.workspaceId, workspaceId)))
    .limit(1);
  return dar || null;
}

// Helper — log access to a DAR (chain of custody)
async function appendAccessLog(darId: string, userId: string, action: string) {
  try {
    const [dar] = await db.select({ accessLog: darReports.accessLog }).from(darReports).where(eq(darReports.id, darId)).limit(1);
    const existing = (dar?.accessLog as any[]) || [];
    const newEntry = { accessedBy: userId, accessedAt: new Date().toISOString(), action };
    await db.update(darReports)
      .set({ accessLog: [...existing, newEntry] } as any)
      .where(eq(darReports.id, darId));
  } catch { /* access log write failure is non-blocking */ }
}

// GET /dar/:darId/access-log — chain of custody audit trail
router.get('/dar/:darId/access-log', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    const dar = await fetchDAR(req.params.darId, workspaceId);
    if (!dar) return res.status(404).json({ message: 'DAR not found' });
    res.json({ accessLog: (dar.accessLog as any[]) || [], legalHold: dar.legalHold });
  } catch (err: unknown) {
    res.status(500).json({ message: sanitizeError(err) || 'Failed to fetch access log' });
  }
});

// POST /dar/:darId/approve — manager approves DAR
router.post('/dar/:darId/approve', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id || req.user?.claims?.sub;
    const dar = await fetchDAR(req.params.darId, workspaceId);
    if (!dar) return res.status(404).json({ message: 'DAR not found' });
    if (dar.legalHold) return res.status(423).json({ message: 'DAR is under legal hold — no modifications permitted' });

    const { notes } = req.body;
    await db.update(darReports)
      .set({
        status: 'verified',
        verifiedBy: userId,
        verifiedAt: new Date(),
        approvedBy: userId,
        approvedAt: new Date(),
        verificationNotes: notes || null,
        updatedAt: new Date(),
      } as any)
      .where(eq(darReports.id, dar.id));

    await appendAccessLog(dar.id, userId, 'approved');

    // Notify officer
    if (dar.employeeId) {
      try {
        const [emp] = await db.select({ userId: (darReports as any).employeeId }).from(darReports).where(eq(darReports.id, dar.id)).limit(1);
      } catch { /* non-blocking */ }
    }

    // Publish event
    platformEventBus.publish({
      type: 'dar_approved',
      category: 'automation',
      title: 'DAR Approved',
      description: `Daily Activity Report approved for ${dar.employeeName || 'officer'}`,
      workspaceId,
      metadata: { darId: dar.id, shiftId: dar.shiftId, approvedBy: userId, timestamp: new Date().toISOString() },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json({ success: true, darId: dar.id, status: 'verified' });
  } catch (err: unknown) {
    res.status(500).json({ message: sanitizeError(err) || 'Failed to approve DAR' });
  }
});

// POST /dar/:darId/reject — manager rejects DAR
router.post('/dar/:darId/reject', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id || req.user?.claims?.sub;
    const dar = await fetchDAR(req.params.darId, workspaceId);
    if (!dar) return res.status(404).json({ message: 'DAR not found' });
    if (dar.legalHold) return res.status(423).json({ message: 'DAR is under legal hold — no modifications permitted' });

    const bodySchema = z.object({ reason: z.string().min(1, 'Reason required') });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Rejection reason is required' });

    await db.update(darReports)
      .set({
        status: 'rejected',
        rejectedBy: userId,
        rejectedAt: new Date(),
        rejectionReason: parsed.data.reason,
        updatedAt: new Date(),
      } as any)
      .where(eq(darReports.id, dar.id));

    await appendAccessLog(dar.id, userId, 'rejected');
    res.json({ success: true, darId: dar.id, status: 'rejected' });
  } catch (err: unknown) {
    res.status(500).json({ message: sanitizeError(err) || 'Failed to reject DAR' });
  }
});

// POST /dar/:darId/escalate — escalate to org owner / senior management
router.post('/dar/:darId/escalate', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id || req.user?.claims?.sub;
    const dar = await fetchDAR(req.params.darId, workspaceId);
    if (!dar) return res.status(404).json({ message: 'DAR not found' });

    const bodySchema = z.object({
      escalatedTo: z.string().min(1, 'Escalation target required'),
      reason: z.string().min(1, 'Reason required'),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'escalatedTo and reason are required' });

    await db.update(darReports)
      .set({
        status: 'pending_review',
        escalatedTo: parsed.data.escalatedTo,
        escalatedAt: new Date(),
        escalationReason: parsed.data.reason,
        updatedAt: new Date(),
      } as any)
      .where(eq(darReports.id, dar.id));

    await appendAccessLog(dar.id, userId, 'escalated');
    res.json({ success: true, darId: dar.id, escalatedTo: parsed.data.escalatedTo });
  } catch (err: unknown) {
    res.status(500).json({ message: sanitizeError(err) || 'Failed to escalate DAR' });
  }
});

// POST /dar/:darId/request-changes — manager requests corrections from officer
router.post('/dar/:darId/request-changes', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id || req.user?.claims?.sub;
    const dar = await fetchDAR(req.params.darId, workspaceId);
    if (!dar) return res.status(404).json({ message: 'DAR not found' });
    if (dar.legalHold) return res.status(423).json({ message: 'DAR is under legal hold' });

    const bodySchema = z.object({ notes: z.string().min(1, 'Notes required describing changes needed') });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'notes field is required' });

    await db.update(darReports)
      .set({
        status: 'pending_review',
        changesRequestedBy: userId,
        changesRequestedAt: new Date(),
        changesRequestedNotes: parsed.data.notes,
        updatedAt: new Date(),
      } as any)
      .where(eq(darReports.id, dar.id));

    await appendAccessLog(dar.id, userId, 'changes_requested');
    res.json({ success: true, darId: dar.id, changesRequestedAt: new Date().toISOString() });
  } catch (err: unknown) {
    res.status(500).json({ message: sanitizeError(err) || 'Failed to request changes' });
  }
});

// POST /dar/:darId/legal-hold — set or release legal hold (compliance/legal team)
router.post('/dar/:darId/legal-hold', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id || req.user?.claims?.sub;
    const dar = await fetchDAR(req.params.darId, workspaceId);
    if (!dar) return res.status(404).json({ message: 'DAR not found' });

    const bodySchema = z.object({
      hold: z.boolean(),
      reason: z.string().optional(),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'hold (boolean) is required' });

    const { hold, reason } = parsed.data;

    await db.update(darReports)
      .set(hold
        ? {
            legalHold: true,
            legalHoldReason: reason || 'Legal hold set',
            legalHoldSetBy: userId,
            legalHoldSetAt: new Date(),
            updatedAt: new Date(),
          } as any
        : {
            legalHold: false,
            legalHoldReason: null,
            legalHoldSetBy: null,
            legalHoldSetAt: null,
            updatedAt: new Date(),
          } as any
      )
      .where(eq(darReports.id, dar.id));

    await appendAccessLog(dar.id, userId, hold ? 'legal_hold_set' : 'legal_hold_released');

    if (hold) {
      // Also protect the DAR from deletion
      await db.update(darReports)
        .set({ isAuditProtected: true } as any)
        .where(eq(darReports.id, dar.id));
    }

    res.json({ success: true, darId: dar.id, legalHold: hold });
  } catch (err: unknown) {
    res.status(500).json({ message: sanitizeError(err) || 'Failed to update legal hold' });
  }
});

// Manual report generation — managers can retrigger a shift report at any time
// (covers extended shifts, late data entry, or missed auto-trigger windows)
router.post('/:chatroomId/generate-report', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { chatroomId } = req.params;

    const [chatroom] = await db.select().from(shiftChatrooms).where(eq(shiftChatrooms.id, chatroomId));
    if (!chatroom) {
      return res.status(404).json({ success: false, error: 'Chatroom not found' });
    }
    if (chatroom.workspaceId !== workspaceId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Use the room's conversationId (which equals chatroomId in this system)
    const result = await reportBotPdfService.generateAndSaveShiftReport(
      chatroomId,
      workspaceId
    );

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || 'Report generation failed' });
    }

    res.json({ success: true, documentId: result.documentId });
  } catch (error: unknown) {
    log.error("Error generating shift report:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to generate shift report" });
  }
});

export default router;
