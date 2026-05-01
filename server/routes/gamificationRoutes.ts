/**
 * Gamification API Routes — real endpoints backed by employee_points table
 */
import { Router } from 'express';
import type { AuthenticatedRequest } from '../rbac';
import { requireAuth } from '../rbac';
import { ensureWorkspaceAccess } from '../middleware/workspaceScope';
import { gamificationService } from '../services/gamification/gamificationService';
import { GAMIFICATION_EVENTS } from '../services/gamification/gamificationEvents';

const router = Router();

// GET /api/gamification/leaderboard — workspace leaderboard
router.get('/leaderboard', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { period = 'weekly' } = req.query as { period?: 'weekly' | 'monthly' | 'all_time' };
    const workspaceId = req.workspaceId!;
    const leaderboard = await gamificationService.getLeaderboard(workspaceId, period);
    res.json({ leaderboard, period });
  } catch (err: unknown) {
    res.status(500).json({ error: err?.message });
  }
});

// GET /api/gamification/my-points — current user's points
router.get('/my-points', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const employeeId = req.user?.employeeId || req.session?.employeeId;
    if (!employeeId) return res.status(404).json({ error: 'No employee record found' });
    const points = await gamificationService.getPoints(workspaceId, employeeId);
    res.json(points);
  } catch (err: unknown) {
    res.status(500).json({ error: err?.message });
  }
});

// GET /api/gamification/events — list all gamification event types and point values
router.get('/events', requireAuth, (_req, res) => {
  res.json({ events: Object.values(GAMIFICATION_EVENTS) });
});

// POST /api/gamification/award — manually award points (manager/owner only)
router.post('/award', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { employeeId, eventId } = req.body;
    if (!employeeId || !eventId) return res.status(400).json({ error: 'employeeId and eventId required' });
    const workspaceId = req.workspaceId!;
    const result = await gamificationService.award(workspaceId, employeeId, eventId);
    res.json({ success: true, ...result });
  } catch (err: unknown) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
