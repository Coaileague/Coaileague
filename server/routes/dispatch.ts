/**
 * Dispatch Routes — real CAD/DispatchOS endpoints using dispatch_incidents,
 * dispatch_assignments, unit_statuses tables (seeded Anvil + Acme data)
 */
import { Router } from 'express';
import { requireAuth } from '../rbac';
import { ensureWorkspaceAccess } from '../middleware/workspaceScope';
import type { AuthenticatedRequest } from '../rbac';
import { pool } from '../db';

const router = Router();

// GET /api/dispatch/incidents — active and recent incidents
router.get('/incidents', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { status } = req.query;
    const params: any[] = [req.workspaceId];
    let filter = '';
    if (status) { filter = ' AND di.status = $2'; params.push(status); }
    const { rows } = await pool.query(`
      SELECT di.*, c.name as client_name,
             da.assigned_officer_id, da.unit_designation
      FROM dispatch_incidents di
      LEFT JOIN clients c ON c.id = di.client_id
      LEFT JOIN dispatch_assignments da ON da.incident_id = di.id AND da.status = 'active'
      WHERE di.workspace_id = $1 ${filter}
      ORDER BY di.call_received_at DESC
      LIMIT 50
    `, params);
    res.json({
      incidents: rows,
      stats: {
        total: rows.length,
        active: rows.filter((r: any) => ['queued','dispatched','en_route','on_scene'].includes(r.status)).length,
        emergency: rows.filter((r: any) => r.priority === 'emergency').length,
      }
    });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// GET /api/dispatch/units — unit status board (all active officers)
router.get('/units', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT us.*, e.first_name, e.last_name, e.employee_number,
             gl.latitude, gl.longitude, gl.updated_at as location_updated
      FROM unit_statuses us
      LEFT JOIN employees e ON e.id = us.employee_id
      LEFT JOIN LATERAL (
        SELECT latitude, longitude, updated_at FROM gps_locations
        WHERE employee_id = us.employee_id AND workspace_id = $1
        ORDER BY updated_at DESC LIMIT 1
      ) gl ON true
      WHERE us.workspace_id = $1
      ORDER BY us.updated_at DESC
    `, [req.workspaceId]);
    res.json({ units: rows });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// POST /api/dispatch/incidents — create new dispatch incident
router.post('/incidents', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { priority, type, locationAddress, description, clientId, callerName, callerPhone } = req.body;
    const incidentNumber = `CAD-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const { rows } = await pool.query(`
      INSERT INTO dispatch_incidents
        (id, workspace_id, incident_number, priority, type, status,
         location_address, description, client_id,
         caller_name, caller_phone, caller_type, call_received_at, created_by)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'queued', $5, $6, $7, $8, $9, 'user', NOW(), $10)
      RETURNING *
    `, [req.workspaceId, incidentNumber, priority || 'routine', type || 'patrol',
        locationAddress, description, clientId, callerName, callerPhone, req.user?.id]);
    res.status(201).json({ incident: rows[0] });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/dispatch/incidents/:id/status — update incident status
router.patch('/incidents/:id/status', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { status } = req.body;
    const tsCol = status === 'dispatched' ? ', dispatched_at = NOW()' :
                  status === 'en_route'   ? ', en_route_at = NOW()' :
                  status === 'on_scene'   ? ', arrived_at = NOW()' :
                  status === 'cleared'    ? ', cleared_at = NOW()' : '';
    const { rows } = await pool.query(
      `UPDATE dispatch_incidents SET status=$1, updated_at=NOW()${tsCol}
       WHERE id=$2 AND workspace_id=$3 RETURNING *`,
      [status, req.params.id, req.workspaceId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Incident not found' });
    res.json({ incident: rows[0] });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

export default router;
