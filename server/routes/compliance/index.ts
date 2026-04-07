import { Router } from "express";
import { statesRoutes } from "./states";
import { documentTypesRoutes } from "./documentTypes";
import { requirementsRoutes } from "./requirements";
import { recordsRoutes } from "./records";
import { documentsRoutes } from "./documents";
import { approvalsRoutes } from "./approvals";
import { auditTrailRoutes } from "./auditTrail";
import { checklistsRoutes } from "./checklists";
import { regulatorRoutes } from "./regulator";
import { packetsRoutes } from "./packets";
import { enforcementRoutes } from "./enforcement";
import { matrixRoutes } from "./matrix";
import { regulatoryPortalRoutes } from "./regulatoryPortal";

const router = Router();

router.use("/states", statesRoutes);
router.use("/document-types", documentTypesRoutes);
router.use("/requirements", requirementsRoutes);
router.use("/records", recordsRoutes);
router.use("/documents", documentsRoutes);
router.use("/approvals", approvalsRoutes);
router.use("/audit-trail", auditTrailRoutes);
router.use("/checklists", checklistsRoutes);
router.use("/regulator", regulatorRoutes);
router.use("/packets", packetsRoutes);
router.use("/enforcement", enforcementRoutes);
router.use("/matrix", matrixRoutes);
router.use("/regulatory-portal", regulatoryPortalRoutes);

export const complianceRoutes = router;
