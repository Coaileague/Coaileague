import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { requireAuth } from "../auth";
import type { AuthenticatedRequest } from "../rbac";

const router = Router();

router.get("/current-theme", async (_req, res) => {
  try {
    const { getSeasonalSubagent } = await import("../services/ai-brain/seasonalSubagent");
    const agent = getSeasonalSubagent();
    const theme = agent.getActiveTheme();
    
    res.json({
      success: true,
      ...theme,
    });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get("/holidays", async (_req, res) => {
  try {
    const { getSeasonalSubagent } = await import("../services/ai-brain/seasonalSubagent");
    const agent = getSeasonalSubagent();
    const holidays = agent.getHolidayCalendar();
    
    res.json({
      success: true,
      holidays,
      currentHoliday: agent.getCurrentHoliday(new Date())?.id || null,
    });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post("/activate/:holidayId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { holidayId } = req.params;
    const { getSeasonalSubagent } = await import("../services/ai-brain/seasonalSubagent");
    const agent = getSeasonalSubagent();
    
    const theme = await agent.forceActivateHoliday(holidayId);
    
    if (!theme) {
      return res.status(404).json({ success: false, error: "Holiday not found" });
    }
    
    res.json({
      success: true,
      message: `${theme.holidayName} theme activated!`,
      theme,
    });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post("/deactivate", requireAuth, async (_req: AuthenticatedRequest, res) => {
  try {
    const { getSeasonalSubagent } = await import("../services/ai-brain/seasonalSubagent");
    const agent = getSeasonalSubagent();
    
    await agent.deactivateTheme();
    
    res.json({
      success: true,
      message: "Seasonal theme deactivated",
    });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get("/preview/:holidayId", async (req, res) => {
  try {
    const { holidayId } = req.params;
    const { getSeasonalSubagent } = await import("../services/ai-brain/seasonalSubagent");
    const agent = getSeasonalSubagent();
    
    const preview = await agent.previewHolidayTheme(holidayId);
    
    if (!preview) {
      return res.status(404).json({ success: false, error: "Holiday not found" });
    }
    
    res.json({
      success: true,
      holidayId,
      preview,
    });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

export default router;
