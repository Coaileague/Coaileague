import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { db, pool } from "../db";
import { hasManagerAccess, resolveWorkspaceForUser, getUserPlatformRole, hasPlatformWideAccess } from "../rbac";
import { platformEventBus } from "../services/platformEventBus";
import { scheduleNonBlocking } from '../lib/scheduleNonBlocking';
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';
const log = createLogger('TerminationRoutes');

const router = Router();

async function requireManagerForTermination(req: any, res: any): Promise<{ workspace: any } | null> {
  const userId = req.user?.id || req.user?.claims?.sub;
  if (!userId) { res.status(401).json({ message: "Unauthorized" }); return null; }
  const platformRole = await getUserPlatformRole(userId);
  if (hasPlatformWideAccess(platformRole)) {
    const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
    if (!workspace) { res.status(404).json({ message: "Workspace not found" }); return null; }
    return { workspace };
  }
  const resolved = await resolveWorkspaceForUser(userId);
  if (!resolved.workspaceId || !resolved.role) { res.status(403).json({ message: "Workspace not found" }); return null; }
  if (!hasManagerAccess(resolved.role)) { res.status(403).json({ message: "Insufficient permissions — manager role or higher required" }); return null; }
  const workspace = await storage.getWorkspace(resolved.workspaceId);
  if (!workspace) { res.status(404).json({ message: "Workspace not found" }); return null; }
  return { workspace };
}

router.get("/terminations", requireAuth, async (req: any, res) => {
  try {
    const result = await requireManagerForTermination(req, res);
    if (!result) return;
    const { workspace } = result;

    const terminations = await storage.getEmployeeTerminationsByWorkspace(workspace.id);
    res.json(terminations);
  } catch (error) {
    log.error("Error fetching terminations:", error);
    res.status(500).json({ message: "Failed to fetch terminations" });
  }
});

router.post("/terminations", requireAuth, async (req: any, res) => {
  try {
    const result = await requireManagerForTermination(req, res);
    if (!result) return;
    const { workspace } = result;

    const { insertEmployeeTerminationSchema } = await import("@shared/schema");
    const validated = insertEmployeeTerminationSchema.parse({
      ...req.body,
      workspaceId: workspace.id,
    });

    // ── Trinity Deliberation Gate ───────────────────────────────────────────
    // Terminations are the highest-stakes destructive action. Trinity considers
    // tenure, reliability score, progressive-discipline record, and empathetic
    // impact; generated PIPs/warnings are persisted regardless of verdict to
    // create legal protection. Owners override via { deliberationApproved: true }.
    const deliberationApproved = req.body?.deliberationApproved === true;
    if (!deliberationApproved) {
      try {
        const { deliberate, persistDeliberationDocuments } =
          await import('../services/trinity/trinityDeliberation');
        const delibCtx = {
          requestType: 'terminate_employee' as const,
          requestedBy: req.user?.id || 'unknown',
          requestedByRole: (result as any)?.workspace?.role || '',
          workspaceId: workspace.id,
          targetId: validated.employeeId || undefined,
          targetType: 'employee' as const,
          rawCommand: validated.reason || 'Employee termination',
        };
        const deliberationResult = await deliberate(delibCtx);
        scheduleNonBlocking('termination.deliberation-docs', () =>
          persistDeliberationDocuments(deliberationResult, delibCtx),
        );
        if (['intervene', 'pause_and_warn'].includes(deliberationResult.verdict)) {
          return res.status(200).json({
            trinityIntervention: true,
            verdict: deliberationResult.verdict,
            headline: deliberationResult.headline,
            reasoning: deliberationResult.reasoning,
            empathyStatement: deliberationResult.empathyStatement,
            riskAssessment: deliberationResult.riskAssessment,
            alternatives: deliberationResult.alternatives,
            generatedDocuments: deliberationResult.generatedDocuments?.map(d => ({
              type: d.type, title: d.title, persisted: d.shouldPersist,
            })),
            overrideAvailable: true,
            overrideMessage: 'Resubmit with deliberationApproved: true to proceed.',
          });
        }
        if (deliberationResult.verdict === 'block') {
          return res.status(200).json({
            trinityIntervention: true,
            verdict: 'block',
            headline: deliberationResult.headline,
            reasoning: deliberationResult.reasoning,
            overrideAvailable: false,
          });
        }
      } catch (deliberationErr: any) {
        log.warn('[Termination] Deliberation failed (non-fatal):', deliberationErr?.message);
      }
    }

    const termination = await storage.createEmployeeTermination(validated);

    // Cross-tenant score persistence — when an employee departs, mark them
    // as members of the global pool so their score/reputation survives
    // into any next employer. Non-blocking: score writes should never
    // fail a termination.
    scheduleNonBlocking('termination.cross-tenant-score', async () => {
      if (!validated.employeeId) return;
      try {
        await pool.query(`
          UPDATE coaileague_profiles
             SET is_in_global_pool = TRUE,
                 is_active_in_current_org = FALSE,
                 departed_at = NOW(),
                 departure_reason = $1,
                 updated_at = NOW()
           WHERE employee_id = $2 AND workspace_id = $3
        `, [validated.reason || 'terminated', validated.employeeId, workspace.id]);
        log.info(`[CrossTenantScore] Score persisted to global pool for ${validated.employeeId}`);
      } catch (err: any) {
        log.warn('[CrossTenantScore] Persist failed (non-fatal):', err?.message);
      }
    });

    interface EquipmentChecklistItem { assignmentId: string; itemName: string; serialNumber: string | null; category: string; checkoutDate: string | null; expectedReturnDate: string | null; }
    let equipmentChecklist: EquipmentChecklistItem[] = [];
    try {
      const equipResult = await db.$client.query(
        `SELECT ea.id AS assignment_id, ei.name AS item_name, ei.serial_number, ei.category,
                ea.checkout_date, ea.expected_return_date
         FROM equipment_assignments ea
         JOIN equipment_items ei ON ea.equipment_item_id = ei.id
         WHERE ea.employee_id = $1 AND ea.workspace_id = $2 AND ea.actual_return_date IS NULL`,
        [validated.employeeId, workspace.id]
      );
      interface EquipmentInitRow { assignment_id: string; item_name: string; serial_number: string | null; category: string; checkout_date: string | null; expected_return_date: string | null; }
      equipmentChecklist = (equipResult.rows as EquipmentInitRow[]).map((r) => ({
        assignmentId: r.assignment_id,
        itemName: r.item_name,
        serialNumber: r.serial_number,
        category: r.category,
        checkoutDate: r.checkout_date,
        expectedReturnDate: r.expected_return_date,
      }));
      if (equipmentChecklist.length > 0) {
        log.info(`[Termination] Equipment checklist generated at initiation for employee ${validated.employeeId}: ${equipmentChecklist.length} unreturned item(s)`);
      }
    } catch (equipErr) {
      log.warn("[Termination] Equipment checklist generation failed (non-blocking):", equipErr);
    }

    res.status(201).json({ ...termination, equipmentChecklist });
  } catch (error: unknown) {
    log.error("Error creating termination:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create termination" });
  }
});

export default router;
