import { Router, Request, Response } from "express";
import { db } from "../../db";
import { complianceStates } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from '../../auth';
import { createLogger } from '../../lib/logger';
const log = createLogger('States');


const router = Router();

router.use(requireAuth);

router.get("/", async (req: Request, res: Response) => {
  try {
    const states = await db.select().from(complianceStates).orderBy(complianceStates.stateName);
    res.json({ success: true, states });
  } catch (error) {
    log.error("[Compliance States] Error fetching states:", error);
    res.status(500).json({ success: false, error: "Failed to fetch compliance states" });
  }
});

router.get("/:stateCode", async (req: Request, res: Response) => {
  try {
    const { stateCode } = req.params;
    const state = await db.select().from(complianceStates)
      .where(eq(complianceStates.stateCode, stateCode.toUpperCase()))
      .limit(1);
    
    if (!state.length) {
      return res.status(404).json({ success: false, error: "State not found" });
    }
    
    res.json({ success: true, state: state[0] });
  } catch (error) {
    log.error("[Compliance States] Error fetching state:", error);
    res.status(500).json({ success: false, error: "Failed to fetch state" });
  }
});

export const statesRoutes = router;
