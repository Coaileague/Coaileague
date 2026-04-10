import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { storage } from "../storage";
import { requireAuth } from "../auth";
import { hasManagerAccess, type AuthenticatedRequest } from "../rbac";
import { createLogger } from '../lib/logger';
const log = createLogger('FeedbackRoutes');


const router = Router();

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { type, message } = req.body;
    
    if (!type || !message) {
      return res.status(400).json({ message: 'Type and message are required' });
    }

    const ticket = await storage.createSupportTicket({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      workspaceId: req.workspaceId || (req.user)?.workspaceId || (req.user).currentWorkspaceId || '',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      requestorId: userId,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      requestorEmail: req.user.email || '',
      category: type === 'bug' ? 'bug_report' : type === 'feature' ? 'feature_request' : 'feedback',
      subject: `User Feedback: ${type}`,
      description: message,
      priority: 'medium',
      status: 'open',
    });
    res.json({ success: true, ticketId: ticket.id });
  } catch (error) {
    log.error('Error submitting feedback:', error);
    res.status(500).json({ message: 'Failed to submit feedback' });
  }
});

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { type, status, priority, sortBy, sortOrder, limit, offset, myFeedback } = req.query;
    
    const filters: any = {
      workspaceId: req.workspaceId!,
    };
    
    if (type) filters.type = type as string;
    if (status) filters.status = status as string;
    if (priority) filters.priority = priority as string;
    if (sortBy) filters.sortBy = sortBy as string;
    if (sortOrder) filters.sortOrder = sortOrder as 'asc' | 'desc';
    if (limit) filters.limit = parseInt(limit as string, 10);
    if (offset) filters.offset = parseInt(offset as string, 10);
    if (myFeedback === 'true') filters.userId = req.user!;
    
    const feedbackList = await storage.getFeedbackList(filters);
    
    const feedbackWithUserVotes = await Promise.all(
      feedbackList.map(async (fb) => {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const userVote = await storage.getUserFeedbackVote(fb.id, req.user!);
        return { ...fb, userVote: userVote?.voteType || null };
      })
    );
    res.json({ success: true, data: feedbackWithUserVotes });
  } catch (error: unknown) {
    log.error("Error fetching feedback:", error);
    res.status(500).json({ success: false, error: sanitizeError(error) || "Failed to fetch feedback" });
  }
});

router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    
    const feedback = await storage.getFeedback(id);
    if (!feedback) {
      return res.status(404).json({ success: false, error: "Feedback not found" });
    }
    
    if (feedback.workspaceId !== req.workspaceId) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }
    
    const comments = await storage.getFeedbackComments(id);
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userVote = await storage.getUserFeedbackVote(id, req.user!);
    
    res.json({ 
      success: true, 
      data: { 
        ...feedback, 
        comments,
        userVote: userVote?.voteType || null 
      } 
    });
  } catch (error: unknown) {
    log.error("Error fetching feedback detail:", error);
    res.status(500).json({ success: false, error: sanitizeError(error) || "Failed to fetch feedback" });
  }
});

router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { title, description, type, priority, category } = req.body;
    
    const feedback = await storage.getFeedback(id);
    if (!feedback) {
      return res.status(404).json({ success: false, error: "Feedback not found" });
    }
    
    if (feedback.workspaceId !== req.workspaceId) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (feedback.userId !== req.user) {
      return res.status(403).json({ success: false, error: "Only the author can edit this feedback" });
    }
    
    const updateData: any = {};
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (type) updateData.type = type;
    if (priority) updateData.priority = priority;
    if (category !== undefined) updateData.category = category;
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const updated = await storage.updateFeedback(id, updateData);
    res.json({ success: true, data: updated });
  } catch (error: unknown) {
    log.error("Error updating feedback:", error);
    res.status(500).json({ success: false, error: sanitizeError(error) || "Failed to update feedback" });
  }
});

router.patch('/:id/status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;
    
    const managerOnlyStatuses = ['under_review', 'planned', 'in_progress', 'completed', 'declined', 'duplicate'];
    const validStatuses = ['submitted', ...managerOnlyStatuses];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status" });
    }
    
    if (managerOnlyStatuses.includes(status) && !hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ success: false, error: "Manager access required to set this status" });
    }
    
    const feedback = await storage.getFeedback(id);
    if (!feedback) {
      return res.status(404).json({ success: false, error: "Feedback not found" });
    }
    
    if (feedback.workspaceId !== req.workspaceId) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const updated = await storage.updateFeedbackStatus(id, status, req.user!, note);
    res.json({ success: true, data: updated });
  } catch (error: unknown) {
    log.error("Error updating feedback status:", error);
    res.status(500).json({ success: false, error: sanitizeError(error) || "Failed to update status" });
  }
});

router.post('/:id/vote', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { voteType } = req.body;
    
    if (!voteType || !['up', 'down'].includes(voteType)) {
      return res.status(400).json({ success: false, error: "Invalid vote type. Use 'up' or 'down'" });
    }
    
    const feedback = await storage.getFeedback(id);
    if (!feedback) {
      return res.status(404).json({ success: false, error: "Feedback not found" });
    }
    
    if (feedback.workspaceId !== req.workspaceId) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const result = await storage.voteFeedback(id, req.user!, voteType);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    log.error("Error voting on feedback:", error);
    res.status(500).json({ success: false, error: sanitizeError(error) || "Failed to vote" });
  }
});

router.post('/:id/comments', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { content, parentId } = req.body;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ success: false, error: "Comment content is required" });
    }
    
    const feedback = await storage.getFeedback(id);
    if (!feedback) {
      return res.status(404).json({ success: false, error: "Feedback not found" });
    }
    
    if (feedback.workspaceId !== req.workspaceId) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }
    
    const comment = await storage.createFeedbackComment({
      feedbackId: id,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: req.user!,
      content: content.trim(),
      parentId: parentId || null,
    });
    
    res.status(201).json({ success: true, data: comment });
  } catch (error: unknown) {
    log.error("Error adding comment:", error);
    res.status(500).json({ success: false, error: sanitizeError(error) || "Failed to add comment" });
  }
});

router.get('/:id/comments', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    
    const feedback = await storage.getFeedback(id);
    if (!feedback) {
      return res.status(404).json({ success: false, error: "Feedback not found" });
    }
    
    if (feedback.workspaceId !== req.workspaceId) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }
    
    const comments = await storage.getFeedbackComments(id);
    res.json({ success: true, data: comments });
  } catch (error: unknown) {
    log.error("Error fetching comments:", error);
    res.status(500).json({ success: false, error: sanitizeError(error) || "Failed to fetch comments" });
  }
});

router.delete('/:id/comments/:commentId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id, commentId } = req.params;
    
    const feedback = await storage.getFeedback(id);
    if (!feedback) {
      return res.status(404).json({ success: false, error: "Feedback not found" });
    }
    
    if (feedback.workspaceId !== req.workspaceId) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    await storage.deleteFeedbackComment(commentId);
    res.json({ success: true, message: "Comment deleted" });
  } catch (error: unknown) {
    log.error("Error deleting comment:", error);
    res.status(500).json({ success: false, error: sanitizeError(error) || "Failed to delete comment" });
  }
});

router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    
    const feedback = await storage.getFeedback(id);
    if (!feedback) {
      return res.status(404).json({ success: false, error: "Feedback not found" });
    }
    
    if (feedback.workspaceId !== req.workspaceId) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (feedback.userId !== req.user) {
      return res.status(403).json({ success: false, error: "Only the author can delete this feedback" });
    }
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    await storage.deleteFeedback(id);
    res.json({ success: true, message: "Feedback deleted" });
  } catch (error: unknown) {
    log.error("Error deleting feedback:", error);
    res.status(500).json({ success: false, error: sanitizeError(error) || "Failed to delete feedback" });
  }
});

export default router;
