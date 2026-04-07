import express from 'express';
import { pool } from '../db';
import { requireAuth } from '../rbac';
import { platformActionHub } from '../services/helpai/platformActionHub';
import { platformEventBus } from '../services/platformEventBus';
import { registerLegacyBootstrap } from '../services/legacyBootstrapRegistry';
import { createLogger } from '../lib/logger';
const log = createLogger('GateDutyRoutes');


const router = express.Router();

// Idempotent table creation (deferred to post-DB-ready bootstrap phase)
registerLegacyBootstrap('gateDuty', async (p) => {
  await p.query(`
      CREATE TABLE IF NOT EXISTS gate_vehicle_logs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
        workspace_id varchar NOT NULL,
        site_id varchar,
        site_name varchar,
        license_plate varchar NOT NULL,
        vehicle_make varchar,
        vehicle_model varchar,
        vehicle_color varchar,
        driver_name varchar,
        driver_id_type varchar CHECK (driver_id_type IN ('drivers_license','passport','employee_badge','other')),
        driver_id_number varchar,
        purpose varchar,
        destination_on_site varchar,
        entry_time timestamptz DEFAULT NOW(),
        exit_time timestamptz,
        logged_by_employee_id varchar,
        logged_by_name varchar,
        is_flagged boolean DEFAULT false,
        flag_reason text,
        notes text,
        created_at timestamptz DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS gate_personnel_logs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
        workspace_id varchar NOT NULL,
        site_id varchar,
        site_name varchar,
        person_name varchar NOT NULL,
        person_type varchar DEFAULT 'visitor' CHECK (person_type IN ('visitor','contractor','vendor','delivery','employee','other')),
        id_type varchar,
        id_number varchar,
        company_name varchar,
        purpose varchar,
        destination_on_site varchar,
        badge_number varchar,
        escort_required boolean DEFAULT false,
        escort_name varchar,
        entry_time timestamptz DEFAULT NOW(),
        exit_time timestamptz,
        logged_by_employee_id varchar,
        logged_by_name varchar,
        notes text,
        created_at timestamptz DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS gate_shift_reports (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
        workspace_id varchar NOT NULL,
        site_id varchar,
        site_name varchar,
        shift_start timestamptz NOT NULL,
        shift_end timestamptz,
        officer_id varchar,
        officer_name varchar,
        vehicle_count integer DEFAULT 0,
        personnel_count integer DEFAULT 0,
        incidents_count integer DEFAULT 0,
        notes text,
        status varchar DEFAULT 'open' CHECK (status IN ('open','closed')),
        created_at timestamptz DEFAULT NOW()
      );
    `);
});

// Trinity Actions
platformActionHub.registerAction({
  actionId: 'gate.current_occupancy',
  name: 'Gate Current Occupancy',
  category: 'automation',
  description: 'Total vehicles and personnel currently on-site today',
  requiredRoles: ['guard', 'supervisor', 'manager', 'owner', 'root_admin'],
  inputSchema: { type: 'object', properties: { siteId: { type: 'string', description: 'Optional site ID to filter by' } } },
  handler: async (request: any) => {
    const t = Date.now();
    const ws = request.workspaceId;
    try {
      const vehicleRes = await pool.query(
        "SELECT COUNT(*) FROM gate_vehicle_logs WHERE workspace_id = $1 AND exit_time IS NULL AND entry_time > CURRENT_DATE",
        [ws]
      );
      const personnelRes = await pool.query(
        "SELECT COUNT(*) FROM gate_personnel_logs WHERE workspace_id = $1 AND exit_time IS NULL AND entry_time > CURRENT_DATE",
        [ws]
      );
      const total = parseInt(vehicleRes.rows[0].count) + parseInt(personnelRes.rows[0].count);
      return { 
        success: true, 
        actionId: 'gate.current_occupancy', 
        message: `Currently ${total} entries on-site`, 
        executionTimeMs: Date.now() - t, 
        data: { total, vehicles: parseInt(vehicleRes.rows[0].count), personnel: parseInt(personnelRes.rows[0].count) } 
      };
    } catch (err) {
      return { success: false, actionId: 'gate.current_occupancy', message: 'Data unavailable', executionTimeMs: Date.now() - t };
    }
  }
});

platformActionHub.registerAction({
  actionId: 'gate.flagged_vehicles',
  name: 'Gate Flagged Vehicles',
  category: 'automation',
  description: 'Count of flagged vehicles in the last 7 days',
  requiredRoles: ['guard', 'supervisor', 'manager', 'owner', 'root_admin'],
  inputSchema: { type: 'object', properties: { days: { type: 'integer', description: 'Lookback window in days', default: 7 } } },
  handler: async (request: any) => {
    const t = Date.now();
    const ws = request.workspaceId;
    try {
      const res = await pool.query(
        "SELECT COUNT(*) FROM gate_vehicle_logs WHERE workspace_id = $1 AND is_flagged = true AND created_at > NOW() - INTERVAL '7 days'",
        [ws]
      );
      const count = parseInt(res.rows[0].count);
      return { success: true, actionId: 'gate.flagged_vehicles', message: `Found ${count} flagged vehicles in last 7 days`, executionTimeMs: Date.now() - t, data: { count } };
    } catch {
      return { success: false, actionId: 'gate.flagged_vehicles', message: 'Data unavailable', executionTimeMs: Date.now() - t };
    }
  }
});

platformActionHub.registerAction({
  actionId: 'gate.daily_log',
  name: 'Gate Daily Log',
  category: 'automation',
  description: 'Total entries today (vehicles + personnel)',
  requiredRoles: ['guard', 'supervisor', 'manager', 'owner', 'root_admin'],
  inputSchema: { type: 'object', properties: { date: { type: 'string', format: 'date', description: 'Date to query (YYYY-MM-DD), defaults to today' } } },
  handler: async (request: any) => {
    const t = Date.now();
    const ws = request.workspaceId;
    try {
      const vehicleRes = await pool.query(
        "SELECT COUNT(*) FROM gate_vehicle_logs WHERE workspace_id = $1 AND entry_time > CURRENT_DATE",
        [ws]
      );
      const personnelRes = await pool.query(
        "SELECT COUNT(*) FROM gate_personnel_logs WHERE workspace_id = $1 AND entry_time > CURRENT_DATE",
        [ws]
      );
      const total = parseInt(vehicleRes.rows[0].count) + parseInt(personnelRes.rows[0].count);
      return { success: true, actionId: 'gate.daily_log', message: `${total} entries logged today`, executionTimeMs: Date.now() - t, data: { total } };
    } catch {
      return { success: false, actionId: 'gate.daily_log', message: 'Data unavailable', executionTimeMs: Date.now() - t };
    }
  }
});

// Routes
router.get('/stats', requireAuth, async (req: any, res) => {
  try {
    const vehicleToday = await pool.query(
      "SELECT COUNT(*) FROM gate_vehicle_logs WHERE workspace_id = $1 AND entry_time > CURRENT_DATE",
      [req.workspaceId]
    );
    const personnelToday = await pool.query(
      "SELECT COUNT(*) FROM gate_personnel_logs WHERE workspace_id = $1 AND entry_time > CURRENT_DATE",
      [req.workspaceId]
    );
    const flagged = await pool.query(
      "SELECT COUNT(*) FROM gate_vehicle_logs WHERE workspace_id = $1 AND is_flagged = true AND entry_time > CURRENT_DATE",
      [req.workspaceId]
    );
    const currentVehicles = await pool.query(
      "SELECT COUNT(*) FROM gate_vehicle_logs WHERE workspace_id = $1 AND exit_time IS NULL AND entry_time > CURRENT_DATE",
      [req.workspaceId]
    );
    const currentPersonnel = await pool.query(
      "SELECT COUNT(*) FROM gate_personnel_logs WHERE workspace_id = $1 AND exit_time IS NULL AND entry_time > CURRENT_DATE",
      [req.workspaceId]
    );

    res.json({
      vehiclesToday: parseInt(vehicleToday.rows[0].count),
      personnelToday: parseInt(personnelToday.rows[0].count),
      flaggedToday: parseInt(flagged.rows[0].count),
      currentlyOnSite: parseInt(currentVehicles.rows[0].count) + parseInt(currentPersonnel.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.get('/vehicles/current', requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM gate_vehicle_logs WHERE workspace_id = $1 AND exit_time IS NULL AND entry_time > CURRENT_DATE ORDER BY entry_time DESC",
      [req.workspaceId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch current vehicles' });
  }
});

router.get('/personnel/current', requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM gate_personnel_logs WHERE workspace_id = $1 AND exit_time IS NULL AND entry_time > CURRENT_DATE ORDER BY entry_time DESC",
      [req.workspaceId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch current personnel' });
  }
});

router.get('/shift-report', requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM gate_shift_reports WHERE workspace_id = $1 AND status = 'open' LIMIT 1",
      [req.workspaceId]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shift report' });
  }
});

router.get('/vehicles', requireAuth, async (req: any, res) => {
  try {
    const flagged = req.query.flagged === 'true';
    let sql = "SELECT * FROM gate_vehicle_logs WHERE workspace_id = $1";
    const params = [req.workspaceId];
    if (flagged) {
      sql += " AND is_flagged = true";
    }
    sql += " ORDER BY entry_time DESC LIMIT 50";
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});

router.post('/vehicles', requireAuth, async (req: any, res) => {
  try {
    const { licensePlate, vehicleMake, vehicleModel, vehicleColor, driverName, purpose, siteId, siteName, loggedByName } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO gate_vehicle_logs 
      (workspace_id, license_plate, vehicle_make, vehicle_model, vehicle_color, driver_name, purpose, site_id, site_name, logged_by_name, logged_by_employee_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [req.workspaceId, licensePlate, vehicleMake, vehicleModel, vehicleColor, driverName, purpose, siteId, siteName, loggedByName, req.user?.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to log vehicle' });
  }
});

router.patch('/vehicles/:id/exit', requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE gate_vehicle_logs SET exit_time = NOW() WHERE id = $1 AND workspace_id = $2 RETURNING *",
      [req.params.id, req.workspaceId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark exit' });
  }
});

router.patch('/vehicles/:id/flag', requireAuth, async (req: any, res) => {
  try {
    const { reason } = req.body;
    const { rows } = await pool.query(
      "UPDATE gate_vehicle_logs SET is_flagged = true, flag_reason = $1 WHERE id = $2 AND workspace_id = $3 RETURNING *",
      [reason, req.params.id, req.workspaceId]
    );
    
    platformEventBus.publish({
      type: 'vehicle_flagged',
      category: 'automation',
      title: 'Vehicle Flagged',
      description: `Vehicle ${rows[0].license_plate} flagged: ${reason}`,
      workspaceId: req.workspaceId,
      metadata: { vehicleId: req.params.id, licensePlate: rows[0].license_plate }
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to flag vehicle' });
  }
});

router.get('/personnel', requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM gate_personnel_logs WHERE workspace_id = $1 ORDER BY entry_time DESC LIMIT 50",
      [req.workspaceId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch personnel' });
  }
});

router.post('/personnel', requireAuth, async (req: any, res) => {
  try {
    const { personName, personType, companyName, purpose, siteId, siteName, loggedByName, badgeNumber, escortRequired } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO gate_personnel_logs
      (workspace_id, person_name, person_type, company_name, purpose, site_id, site_name, logged_by_name, logged_by_employee_id, badge_number, escort_required)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [req.workspaceId, personName, personType, companyName, purpose, siteId, siteName, loggedByName, req.user?.id, badgeNumber, escortRequired]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to log person' });
  }
});

router.patch('/personnel/:id/exit', requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE gate_personnel_logs SET exit_time = NOW() WHERE id = $1 AND workspace_id = $2 RETURNING *",
      [req.params.id, req.workspaceId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark exit' });
  }
});

router.post('/shift-report', requireAuth, async (req: any, res) => {
  try {
    const { siteId, siteName, officerName, officerId } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO gate_shift_reports (workspace_id, site_id, site_name, officer_name, officer_id, shift_start, status)
      VALUES ($1, $2, $3, $4, $5, NOW(), 'open')
      RETURNING *`,
      [req.workspaceId, siteId, siteName, officerName, officerId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to start shift report' });
  }
});

router.patch('/shift-report/:id/close', requireAuth, async (req: any, res) => {
  try {
    const { rows: reportRows } = await pool.query(
      "SELECT shift_start FROM gate_shift_reports WHERE id = $1 AND workspace_id = $2",
      [req.params.id, req.workspaceId]
    );
    if (reportRows.length === 0) return res.status(404).json({ error: 'Report not found' });
    
    const start = reportRows[0].shift_start;
    
    const { rows: vehicleRes } = await pool.query(
      "SELECT COUNT(*) FROM gate_vehicle_logs WHERE workspace_id = $1 AND entry_time >= $2",
      [req.workspaceId, start]
    );
    const { rows: personnelRes } = await pool.query(
      "SELECT COUNT(*) FROM gate_personnel_logs WHERE workspace_id = $1 AND entry_time >= $2",
      [req.workspaceId, start]
    );
    
    const { rows } = await pool.query(
      `UPDATE gate_shift_reports 
      SET shift_end = NOW(), status = 'closed', vehicle_count = $1, personnel_count = $2
      WHERE id = $3 AND workspace_id = $4
      RETURNING *`,
      [parseInt(vehicleRes[0].count), parseInt(personnelRes[0].count), req.params.id, req.workspaceId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to close shift report' });
  }
});

export default router;
