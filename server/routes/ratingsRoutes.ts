import type { Express } from 'express';
import { Router, Request, Response } from 'express';
import { employerRatingsService } from '../services/employerRatingsService';
import { compositeScoresService } from '../services/compositeScoresService';
import '../types';

export function registerRatingsRoutes(app: Express, requireAuth: any, requireManager: any, readLimiter: any) {
  const ratingsRouter = Router();

  ratingsRouter.get("/employer", requireAuth, readLimiter, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req.user)?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: 'No workspace selected' });
      const { targetId, period = '30' } = req.query;
      const periodDays = parseInt(period as string) || 30;

      const stats = await employerRatingsService.calculateEmployerRatingStats(
        workspaceId,
        targetId as string | undefined,
        periodDays
      );

      res.json({ success: true, data: stats });
    } catch (error: any) {
      console.error('Error calculating employer ratings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  ratingsRouter.get("/employer/trends", requireAuth, readLimiter, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req.user)?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: 'No workspace selected' });
      const { targetId, granularity = 'week' } = req.query;

      const trends = await employerRatingsService.getRatingTrends(
        workspaceId,
        targetId as string | undefined,
        granularity as 'week' | 'month'
      );

      res.json({ success: true, data: trends });
    } catch (error: any) {
      console.error('Error fetching rating trends:', error);
      res.status(500).json({ error: error.message });
    }
  });

  ratingsRouter.get("/at-risk-managers", requireAuth, requireManager, readLimiter, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req.user)?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: 'No workspace selected' });
      const { threshold = '3.0' } = req.query;

      const atRiskManagers = await employerRatingsService.identifyAtRiskManagers(
        workspaceId,
        parseFloat(threshold as string) || 3.0
      );

      res.json({ success: true, data: atRiskManagers });
    } catch (error: any) {
      console.error('Error identifying at-risk managers:', error);
      res.status(500).json({ error: error.message });
    }
  });

  ratingsRouter.get("/composite-score", requireAuth, readLimiter, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req.user)?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: 'No workspace selected' });
      const { employeeId } = req.query;
      if (!employeeId) return res.status(400).json({ error: 'employeeId required' });

      const compositeScore = await compositeScoresService.calculateCompositeScore(
        workspaceId,
        employeeId as string
      );

      if (!compositeScore) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      res.json({ success: true, data: compositeScore });
    } catch (error: any) {
      console.error('Error calculating composite score:', error);
      res.status(500).json({ error: error.message });
    }
  });

  ratingsRouter.get("/composite-scores", requireAuth, requireManager, readLimiter, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req.user)?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: 'No workspace selected' });

      const scores = await compositeScoresService.calculateWorkspaceCompositeScores(workspaceId);

      res.json({ 
        success: true, 
        data: scores,
        summary: {
          totalEmployees: scores.length,
          averageScore: scores.length > 0 ? Math.round(scores.reduce((sum, s) => sum + s.compositeScore, 0) / scores.length) : 0,
          topPerformer: scores[0],
        }
      });
    } catch (error: any) {
      console.error('Error fetching workspace composite scores:', error);
      res.status(500).json({ error: error.message });
    }
  });

  ratingsRouter.get("/employee-rank/:employeeId", requireAuth, readLimiter, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req.user)?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: 'No workspace selected' });
      const { employeeId } = req.params;

      const rank = await compositeScoresService.getEmployeeRank(workspaceId, employeeId);

      if (!rank) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      res.json({ success: true, data: rank });
    } catch (error: any) {
      console.error('Error fetching employee rank:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.use('/api/ratings', ratingsRouter);
}
