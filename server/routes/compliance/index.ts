import { Router } from "express";
import { statesRoutes } from "./states";
import { documentTypesRoutes } from "./documentTypes";
import { recordsRoutes } from "./records";
import { documentsRoutes } from "./documents";
import { approvalsRoutes } from "./approvals";
import { regulatorRoutes } from "./regulator";
import { enforcementRoutes } from "./enforcement";
import { matrixRoutes } from "./matrix";

const router = Router();

router.use("/states", statesRoutes);
router.use("/document-types", documentTypesRoutes);
router.use("/records", recordsRoutes);
router.use("/documents", documentsRoutes);
router.use("/approvals", approvalsRoutes);
router.use("/regulator", regulatorRoutes);
router.use("/enforcement", enforcementRoutes);
router.use("/matrix", matrixRoutes);

export const complianceRoutes = router;
