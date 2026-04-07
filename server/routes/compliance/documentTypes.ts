import { Router, Request, Response } from "express";
import { db } from "../../db";
import { complianceDocumentTypes } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from '../../auth';
import { createLogger } from '../../lib/logger';
const log = createLogger('DocumentTypes');


const router = Router();

router.use(requireAuth);

router.get("/", async (req: Request, res: Response) => {
  try {
    const types = await db.select().from(complianceDocumentTypes)
      .where(eq(complianceDocumentTypes.isActive, true))
      .orderBy(complianceDocumentTypes.sortOrder);
    res.json({ success: true, documentTypes: types });
  } catch (error) {
    log.error("[Compliance DocumentTypes] Error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch document types" });
  }
});

router.get("/:typeCode", async (req: Request, res: Response) => {
  try {
    const { typeCode } = req.params;
    const docType = await db.select().from(complianceDocumentTypes)
      .where(eq(complianceDocumentTypes.typeCode, typeCode.toUpperCase()))
      .limit(1);
    
    if (!docType.length) {
      return res.status(404).json({ success: false, error: "Document type not found" });
    }
    
    res.json({ success: true, documentType: docType[0] });
  } catch (error) {
    log.error("[Compliance DocumentTypes] Error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch document type" });
  }
});

export const documentTypesRoutes = router;
