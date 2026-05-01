/**
 * GPS Routes — real location tracking using gps_locations table
 */
import { Router } from 'express';
import { requireAuth } from '../rbac';
import { ensureWorkspaceAccess } from '../middleware/workspaceScope';
import type { AuthenticatedRequest } from '../rbac';
import { pool } from '../db';

const router = Router();

// POST /api/gps/location — record officer GPS location
router.post('/location', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { employeeId, latitude, longitude, accuracy, altitude, speed, heading, isMoving, timeEntryId } = req.body;
    if (!employeeId || !latitude || !longitude) return res.status(400).json({ error: 'employeeId, latitude, longitude required' });
    const { rows } = await pool.query(`
      INSERT INTO gps_locations
        (id, workspace_id, employee_id, time_entry_id, latitude, longitude,
         accuracy, altitude, speed, heading, is_moving, verified, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, NOW())
      RETURNING id, latitude, longitude, created_at
    `, [req.workspaceId, employeeId, timeEntryId, latitude, longitude, accuracy, altitude, speed, heading, isMoving ?? false]);
    res.status(201).json({ location: rows[0] });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// GET /api/gps/locations/:employeeId — location history for officer
router.get('/locations/:employeeId', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 8;
    const { rows } = await pool.query(`
      SELECT latitude, longitude, accuracy, speed, heading, is_moving, verified, created_at
      FROM gps_locations
      WHERE workspace_id=$1 AND employee_id=$2
        AND created_at > NOW() - ($3 || ' hours')::interval
      ORDER BY created_at DESC
      LIMIT 500
    `, [req.workspaceId, req.params.employeeId, hours]);
    res.json({ locations: rows, count: rows.length, hours });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// GET /api/gps/active — all officers' latest positions (dispatcher map)
router.get('/active', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (gl.employee_id)
        gl.employee_id, gl.latitude, gl.longitude, gl.speed,
        gl.is_moving, gl.created_at as last_seen,
        e.first_name, e.last_name, e.employee_number
      FROM gps_locations gl
      JOIN employees e ON e.id = gl.employee_id
      WHERE gl.workspace_id=$1
        AND gl.created_at > NOW() - INTERVAL '4 hours'
      ORDER BY gl.employee_id, gl.created_at DESC
    `, [req.workspaceId]);
    res.json({ officers: rows, count: rows.length });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// GET /api/gps/geofences — workspace geofence zones
router.get('/geofences', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT gz.*, c.name as client_name
      FROM geofence_zones gz
      LEFT JOIN clients c ON c.id = gz.client_id
      WHERE gz.workspace_id=$1 AND gz.is_active=true
      ORDER BY gz.name
    `, [req.workspaceId]);
    res.json({ geofences: rows });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

export default router;
