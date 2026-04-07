import { Router, Request, Response } from "express";
import { db } from "../../db";
import { complianceRequirements, complianceStates, complianceDocumentTypes } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from '../../auth';
import { createLogger } from '../../lib/logger';
const log = createLogger('Requirements');


const router = Router();

router.use(requireAuth);

router.get("/", async (req: Request, res: Response) => {
  try {
    const { stateCode } = req.query;
    
    let requirements;
    if (stateCode) {
      const state = await db.select().from(complianceStates)
        .where(eq(complianceStates.stateCode, String(stateCode).toUpperCase()))
        .limit(1);
      
      if (!state.length) {
        return res.status(404).json({ success: false, error: "State not found" });
      }
      
      requirements = await db.select({
        requirement: complianceRequirements,
        documentType: complianceDocumentTypes
      })
        .from(complianceRequirements)
        .leftJoin(complianceDocumentTypes, eq(complianceRequirements.documentTypeId, complianceDocumentTypes.id))
        .where(and(
          eq(complianceRequirements.stateId, state[0].id),
          eq(complianceRequirements.isActive, true)
        ))
        .orderBy(complianceRequirements.sortOrder);
    } else {
      requirements = await db.select({
        requirement: complianceRequirements,
        documentType: complianceDocumentTypes
      })
        .from(complianceRequirements)
        .leftJoin(complianceDocumentTypes, eq(complianceRequirements.documentTypeId, complianceDocumentTypes.id))
        .where(eq(complianceRequirements.isActive, true))
        .orderBy(complianceRequirements.sortOrder);
    }
    
    res.json({ success: true, requirements });
  } catch (error) {
    log.error("[Compliance Requirements] Error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch requirements" });
  }
});

export const requirementsRoutes = router;
