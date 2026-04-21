import { sanitizeError } from '../middleware/errorHandler';
import { platformEventBus } from '../services/platformEventBus';
import { PLATFORM } from '../config/platformConfig';
import { Router } from "express";
import { randomUUID } from 'crypto';
import { db } from "../db";
import {
  trainingCourses,
  trainingEnrollments,
  trainingCertifications,
  insertTrainingCourseSchema,
  employees,
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../auth";
import { readLimiter } from "../middleware/rateLimiter";
import { requireManager, hasManagerAccess, type AuthenticatedRequest } from "../rbac";
import { trainingRateService } from "../services/trainingRateService";
// @ts-expect-error — TS migration: fix in refactoring sprint
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../lib/logger';
const log = createLogger('TrainingRoutes');


const router = Router();

// ── camelCase helpers ─────────────────────────────────────────────────────

function sessionToCamel(row: any) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    description: row.description,
    trainingType: row.training_type,
    requiredFor: row.required_for,
    providerId: row.provider_id,
    providerName: row.provider_name,
    instructorName: row.instructor_name,
    location: row.location,
    sessionDate: row.session_date,
    durationHours: row.duration_hours,
    maxAttendees: row.max_attendees,
    tcoleHoursCredit: row.tcole_hours_credit,
    status: row.status,
    qrCode: row.qr_code,
    certificateTemplate: row.certificate_template,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function attendanceToCamel(row: any) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sessionId: row.session_id,
    employeeId: row.employee_id,
    employeeName: row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : undefined,
    badgeId: row.badge_id,
    status: row.status,
    checkInMethod: row.check_in_method,
    checkedInAt: row.checked_in_at,
    tcoleHoursAwarded: row.tcole_hours_awarded,
    certificateUrl: row.certificate_url,
  };
}

function providerToCamel(row: any) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    address: row.address,
    website: row.website,
    approved: row.approved,
    tcoleApproved: row.tcole_approved,
    specialties: typeof row.specialties === 'string' ? JSON.parse(row.specialties) : (row.specialties || []),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

// ── GET sessions ──────────────────────────────────────────────────────────
router.get('/sessions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { status, startDate, endDate } = req.query;
    
    let query = `SELECT ts.*, tp.name as provider_name 
                 FROM training_sessions ts
                 LEFT JOIN training_providers tp ON ts.provider_id = tp.id
                 WHERE ts.workspace_id = $1`;
    const params: any[] = [workspaceId];
    
    if (status) {
      params.push(status);
      query += ` AND ts.status = $${params.length}`;
    }
    if (startDate) {
      params.push(startDate);
      query += ` AND ts.session_date >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      query += ` AND ts.session_date <= $${params.length}`;
    }
    
    query += ` ORDER BY ts.session_date DESC`;
    
    const result = await db.$client.query(query, params);
    res.json(result.rows.map(sessionToCamel));
  } catch (error: unknown) {
    log.error("Error fetching training sessions:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ── POST sessions ─────────────────────────────────────────────────────────
router.post('/sessions', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.user?.id;
    const { 
      title, description, training_type, required_for, provider_id, 
      instructor_name, location, session_date, duration_hours, 
      max_attendees, tcole_hours_credit, certificate_template 
    } = req.body;
    
    const id = `tsess-${randomUUID()}`;
    const qrCode = uuidv4();
    
    await db.$client.query(
      `INSERT INTO training_sessions (
        id, workspace_id, title, description, training_type, required_for, 
        provider_id, instructor_name, location, session_date, duration_hours, 
        max_attendees, tcole_hours_credit, status, qr_code, certificate_template, 
        created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())`,
      [
        id, workspaceId, title, description, training_type, required_for,
        provider_id || null, instructor_name || null, location || null, 
        session_date, duration_hours || 0, max_attendees || null, 
        tcole_hours_credit || 0, 'scheduled', qrCode, certificate_template || null, userId
      ]
    );
    
    const result = await db.$client.query(`SELECT * FROM training_sessions WHERE id = $1`, [id]);
    res.status(201).json(sessionToCamel(result.rows[0]));
  } catch (error: unknown) {
    log.error("Error creating training session:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ── GET session detail ────────────────────────────────────────────────────
router.get('/sessions/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;
    
    const sessionRes = await db.$client.query(
      `SELECT ts.*, tp.name as provider_name 
       FROM training_sessions ts
       LEFT JOIN training_providers tp ON ts.provider_id = tp.id
       WHERE ts.id = $1 AND ts.workspace_id = $2`,
      [id, workspaceId]
    );
    
    if (sessionRes.rows.length === 0) {
      return res.status(404).json({ message: "Session not found" });
    }
    
    const attendeesRes = await db.$client.query(
      `SELECT ta.*, e.first_name, e.last_name, e.employee_id as badge_id
       FROM training_attendance ta
       JOIN employees e ON ta.employee_id = e.id
       WHERE ta.session_id = $1 AND ta.workspace_id = $2`,
      [id, workspaceId]
    );
    
    res.json({
      ...sessionToCamel(sessionRes.rows[0]),
      attendees: attendeesRes.rows.map(attendanceToCamel),
    });
  } catch (error: unknown) {
    log.error("Error fetching session detail:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ── PATCH session ─────────────────────────────────────────────────────────
router.patch('/sessions/:id', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;
    const updates = req.body;
    
    const allowedFields = [
      'title', 'description', 'training_type', 'required_for', 'provider_id',
      'instructor_name', 'location', 'session_date', 'duration_hours',
      'max_attendees', 'tcole_hours_credit', 'status', 'certificate_template'
    ];
    
    const setClauses: string[] = [];
    const params: any[] = [id, workspaceId];
    let paramIndex = 3;
    
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        setClauses.push(`${key} = $${paramIndex++}`);
        params.push(updates[key]);
      }
    }
    
    if (setClauses.length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }
    
    setClauses.push(`updated_at = NOW()`);
    
    const query = `UPDATE training_sessions 
                   SET ${setClauses.join(', ')} 
                   WHERE id = $1 AND workspace_id = $2
                   RETURNING *`;
                   
    const result = await db.$client.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Session not found or access denied" });
    }
    
    res.json(sessionToCamel(result.rows[0]));
  } catch (error: unknown) {
    log.error("Error updating training session:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ── GET session attendance ─────────────────────────────────────────────────
router.get('/sessions/:id/attendance', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id: sessionId } = req.params;
    
    const result = await db.$client.query(
      `SELECT ta.*, e.first_name, e.last_name, e.employee_id as badge_id
       FROM training_attendance ta
       JOIN employees e ON ta.employee_id = e.id
       WHERE ta.session_id = $1 AND ta.workspace_id = $2
       ORDER BY ta.checked_in_at ASC NULLS LAST`,
      [sessionId, workspaceId]
    );
    
    res.json(result.rows.map(attendanceToCamel));
  } catch (error: unknown) {
    log.error("Error fetching session attendance:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ── POST session register ─────────────────────────────────────────────────
router.post('/sessions/:id/register', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id: sessionId } = req.params;

    // Resolve the calling user's employee record
    const ownEmpRes = await db.$client.query(
      `SELECT id FROM employees WHERE user_id = $1 AND workspace_id = $2`,
      [req.user?.id, workspaceId]
    );
    const ownEmployeeId = ownEmpRes.rows[0]?.id;
    if (!ownEmployeeId) {
      return res.status(404).json({ message: "Employee record not found for this workspace" });
    }

    const sessionRes = await db.$client.query(
      `SELECT * FROM training_sessions WHERE id = $1 AND workspace_id = $2`,
      [sessionId, workspaceId]
    );
    if (sessionRes.rows.length === 0) {
      return res.status(404).json({ message: "Session not found" });
    }
    const session = sessionRes.rows[0];
    if (session.status === 'completed' || session.status === 'cancelled') {
      return res.status(400).json({ message: "Cannot register for a completed or cancelled session" });
    }

    // Upsert: if already registered, return existing record
    const existingRes = await db.$client.query(
      `SELECT * FROM training_attendance WHERE session_id = $1 AND employee_id = $2`,
      [sessionId, ownEmployeeId]
    );
    if (existingRes.rows.length > 0) {
      return res.json({ message: "Already registered", attendance: attendanceToCamel(existingRes.rows[0]) });
    }

    const id = `tatt-${randomUUID()}`;
    const insertRes = await db.$client.query(
      `INSERT INTO training_attendance (id, workspace_id, session_id, employee_id, status)
       VALUES ($1, $2, $3, $4, 'registered') RETURNING *`,
      [id, workspaceId, sessionId, ownEmployeeId]
    );
    res.status(201).json(attendanceToCamel(insertRes.rows[0]));
  } catch (error: unknown) {
    log.error("Error registering for session:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ── POST session check-in ─────────────────────────────────────────────────
router.post('/sessions/:id/checkin', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id: sessionId } = req.params;
    const { method, employeeId: bodyEmployeeId } = req.body; // method: 'qr' | 'manual' | 'self_report'

    const isManager = hasManagerAccess(req.workspaceRole) || hasManagerAccess(req.platformRole);

    // Resolve calling user's own employee record (always needed)
    const ownEmpRes = await db.$client.query(
      `SELECT id FROM employees WHERE user_id = $1 AND workspace_id = $2`,
      [req.user?.id, workspaceId]
    );
    const ownEmployeeId = ownEmpRes.rows[0]?.id;

    let employeeId: string;

    if (!isManager) {
      // Non-managers always check themselves in
      if (!ownEmployeeId) {
        return res.status(404).json({ message: "Employee record not found for this workspace" });
      }
      employeeId = ownEmployeeId;
    } else {
      // Managers may specify an employee; default to themselves if not provided
      if (bodyEmployeeId) {
        // Validate target employee belongs to this workspace
        const targetRes = await db.$client.query(
          `SELECT id FROM employees WHERE id = $1 AND workspace_id = $2`,
          [bodyEmployeeId, workspaceId]
        );
        if (targetRes.rows.length === 0) {
          return res.status(403).json({ message: "Target employee does not belong to this workspace" });
        }
        employeeId = bodyEmployeeId;
      } else {
        if (!ownEmployeeId) {
          return res.status(400).json({ message: "employeeId is required when checking in another officer" });
        }
        employeeId = ownEmployeeId;
      }
    }
    
    const sessionRes = await db.$client.query(
      `SELECT * FROM training_sessions WHERE id = $1 AND workspace_id = $2`,
      [sessionId, workspaceId]
    );
    
    if (sessionRes.rows.length === 0) {
      return res.status(404).json({ message: "Session not found" });
    }
    const session = sessionRes.rows[0];

    // Session state gating: cannot check in to completed/cancelled sessions
    if (session.status === 'completed' || session.status === 'cancelled') {
      return res.status(400).json({ message: "Session is no longer accepting check-ins" });
    }

    // Non-managers using self-service check-in must wait until session is in_progress
    const resolvedMethod = method || 'manual';
    if (!isManager && (resolvedMethod === 'self_report' || resolvedMethod === 'qr')) {
      if (session.status !== 'in_progress') {
        return res.status(400).json({ message: "Self check-in is only available once the session is in progress" });
      }
    }

    // QR token validation
    if (resolvedMethod === 'qr') {
      const { token } = req.body;
      if (!token || token !== session.qr_code) {
        return res.status(403).json({ message: "Invalid or expired QR token" });
      }
    }
    
    // Check if already checked in
    const existingRes = await db.$client.query(
      `SELECT * FROM training_attendance WHERE session_id = $1 AND employee_id = $2`,
      [sessionId, employeeId]
    );
    
    if (existingRes.rows.length > 0) {
      const attendance = existingRes.rows[0];
      if (attendance.status === 'attended') {
        return res.json({ message: "Already checked in", attendance: attendanceToCamel(attendance) });
      }
      
      // Update existing record
      const updateRes = await db.$client.query(
        `UPDATE training_attendance 
         SET status = 'attended', check_in_method = $1, checked_in_at = NOW()
         WHERE id = $2 RETURNING *`,
        [resolvedMethod, attendance.id]
      );
      return res.json(attendanceToCamel(updateRes.rows[0]));
    }
    
    // Create new attendance record
    const id = `tatt-${randomUUID()}`;
    const insertRes = await db.$client.query(
      `INSERT INTO training_attendance (
        id, workspace_id, session_id, employee_id, status, check_in_method, checked_in_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
      [id, workspaceId, sessionId, employeeId, 'attended', resolvedMethod]
    );
    
    res.status(201).json(attendanceToCamel(insertRes.rows[0]));
  } catch (error: unknown) {
    log.error("Error during session check-in:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ── POST session complete ─────────────────────────────────────────────────
router.post('/sessions/:id/complete', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id: sessionId } = req.params;
    
    const sessionRes = await db.$client.query(
      `SELECT * FROM training_sessions WHERE id = $1 AND workspace_id = $2`,
      [sessionId, workspaceId]
    );
    
    if (sessionRes.rows.length === 0) {
      return res.status(404).json({ message: "Session not found" });
    }
    
    const session = sessionRes.rows[0];
    if (session.status === 'completed') {
      return res.status(400).json({ message: "Session is already completed" });
    }
    
    // Award TCOLE hours to all attended records and generate certificate URLs
    await db.$client.query(
      `UPDATE training_attendance 
       SET tcole_hours_awarded = $1, 
           certificate_url = $2
       WHERE session_id = $3 AND status = 'attended'`,
      [
        session.tcole_hours_credit,
        `https://certs.${PLATFORM.domain}/training/${sessionId}/certificate`,
        sessionId
      ]
    );
    
    // 2. Mark session as completed
    const updatedSession = await db.$client.query(
      `UPDATE training_sessions 
       SET status = 'completed', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [sessionId]
    );

    // 3. Fire year-end compliance alerts at 90/60/30-day windows (idempotent per officer/threshold/year).
    //    Fires once per threshold bucket: if daysUntilYearEnd falls in ≤90 but >60, the 90-day alert fires.
    //    ON CONFLICT DO NOTHING ensures each officer/year/threshold combination alerts exactly once.
    const now = new Date();
    const endOfYear = new Date(now.getFullYear(), 11, 31);
    const daysUntilYearEnd = Math.ceil((endOfYear.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const alertThresholds = [30, 60, 90];
    const activeThreshold = alertThresholds.find(t => daysUntilYearEnd <= t);
    if (activeThreshold) {
      const requiredHours = 40;
      const year = now.getFullYear();
      const stillBehind = await db.$client.query(
        `SELECT e.id, e.first_name, e.last_name,
                COALESCE(SUM(ta2.tcole_hours_awarded), 0) AS hours_completed
         FROM employees e
         LEFT JOIN training_attendance ta2 ON ta2.employee_id = e.id
              AND ta2.workspace_id = e.workspace_id
              AND ta2.status = 'attended'
              AND EXTRACT(YEAR FROM ta2.checked_in_at) = $2
         WHERE e.workspace_id = $1 AND e.is_active = TRUE
         GROUP BY e.id
         HAVING COALESCE(SUM(ta2.tcole_hours_awarded), 0) < $3`,
        [workspaceId, year, requiredHours]
      );
      for (const officer of stillBehind.rows) {
        // Idempotency: only fire once per officer/threshold/year using tcole_alert_log
        const alertInsert = await db.$client.query(
          `INSERT INTO tcole_alert_log (workspace_id, employee_id, year, threshold_days)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (workspace_id, employee_id, year, threshold_days) DO NOTHING
           RETURNING workspace_id`,
          [workspaceId, officer.id, year, activeThreshold]
        );
        if (alertInsert.rows.length === 0) continue; // Already sent for this milestone
        const completed = parseFloat(officer.hours_completed);
        platformEventBus.publish({
          type: 'tcole_compliance_warning',
          category: 'compliance',
          title: `TCOLE ${activeThreshold}-Day Alert: ${officer.first_name} ${officer.last_name}`,
          description: `Officer has ${completed}/${requiredHours} TCOLE hours with ${daysUntilYearEnd} days until year-end.`,
          workspaceId,
          metadata: { employeeId: officer.id, hoursCompleted: completed, threshold: activeThreshold, year }
        }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
      }
    }
    
    res.json({
      message: "Session completed and hours awarded",
      session: sessionToCamel(updatedSession.rows[0])
    });
  } catch (error: unknown) {
    log.error("Error completing training session:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ── GET session QR data ───────────────────────────────────────────────────
router.get('/sessions/:id/qr', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;
    
    const result = await db.$client.query(
      `SELECT qr_code, title FROM training_sessions WHERE id = $1 AND workspace_id = $2`,
      [id, workspaceId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Session not found" });
    }
    
    res.json(result.rows[0]);
  } catch (error: unknown) {
    log.error("Error fetching session QR:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ── GET TCOLE hours ───────────────────────────────────────────────────────
router.get('/tcole-hours', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.user?.id;
    const isManager = hasManagerAccess(req.workspaceRole) || hasManagerAccess(req.platformRole);

    // Resolve own employee ID first
    const ownEmpRes = await db.$client.query(
      `SELECT id FROM employees WHERE user_id = $1 AND workspace_id = $2`,
      [userId, workspaceId]
    );
    const ownEmployeeId = ownEmpRes.rows[0]?.id;

    // Non-managers may only access their own hours
    let employeeId = req.query.employeeId as string | undefined;
    if (employeeId && !isManager) {
      if (employeeId !== ownEmployeeId) {
        return res.status(403).json({ message: "You may only view your own TCOLE hours" });
      }
    }
    employeeId = employeeId || ownEmployeeId;
    if (!employeeId) {
      return res.status(404).json({ message: "Employee record not found" });
    }
    
    const year = new Date().getFullYear();
    const result = await db.$client.query(
      `SELECT SUM(tcole_hours_awarded) as total_hours
       FROM training_attendance
       WHERE employee_id = $1 AND workspace_id = $2
       AND status = 'attended'
       AND checked_in_at >= $3`,
      [employeeId, workspaceId, `${year}-01-01`]
    );
    
    const hoursAccumulated = parseFloat(result.rows[0].total_hours || '0');
    const hoursRequired = 40;
    res.json({
      employeeId,
      year,
      hoursAccumulated,
      hoursRequired,
      hoursRemaining: Math.max(0, hoursRequired - hoursAccumulated),
    });
  } catch (error: unknown) {
    log.error("Error fetching TCOLE hours:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ── GET providers ─────────────────────────────────────────────────────────
router.get('/providers', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const result = await db.$client.query(
      `SELECT * FROM training_providers WHERE workspace_id = $1 ORDER BY name ASC`,
      [workspaceId]
    );
    res.json(result.rows.map(providerToCamel));
  } catch (error: unknown) {
    log.error("Error fetching training providers:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ── POST providers ────────────────────────────────────────────────────────
router.post('/providers', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { name, contact_name, contact_email, contact_phone, address, website, approved, tcole_approved, specialties, notes } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: "Provider name is required" });
    }
    
    const id = `tprov-${randomUUID()}`;
    await db.$client.query(
      `INSERT INTO training_providers (
        id, workspace_id, name, contact_name, contact_email, contact_phone, 
        address, website, approved, tcole_approved, specialties, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
      [
        id, workspaceId, name, contact_name || null, contact_email || null, contact_phone || null,
        address || null, website || null, approved || false, tcole_approved || false,
        JSON.stringify(specialties || []), notes || null
      ]
    );
    
    const result = await db.$client.query(`SELECT * FROM training_providers WHERE id = $1`, [id]);
    res.status(201).json(providerToCamel(result.rows[0]));
  } catch (error: unknown) {
    log.error("Error creating training provider:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get('/courses', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { category, difficulty, status, isRequired } = req.query;
    
    let query = db
      .select()
      .from(trainingCourses)
      .where(eq(trainingCourses.workspaceId, workspaceId))
      .orderBy(desc(trainingCourses.createdAt));
    
    let courses = await query;
    
    if (category) {
      courses = courses.filter(c => c.category === category);
    }
    if (difficulty) {
      courses = courses.filter(c => (c as any).difficulty === difficulty);
    }
    if (status) {
      courses = courses.filter(c => (c as any).status === status);
    }
    if (isRequired !== undefined) {
      courses = courses.filter(c => c.isRequired === (isRequired === 'true'));
    }
    
    res.json(courses);
  } catch (error: unknown) {
    log.error("Error fetching training courses:", error);
    res.status(500).json({ message: "Failed to fetch training courses" });
  }
});

router.get('/courses/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;
    
    const [course] = await db
      .select()
      .from(trainingCourses)
      .where(and(
        eq(trainingCourses.id, id),
        eq(trainingCourses.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!course) {
      return res.status(404).json({ message: "Training course not found" });
    }
    
    res.json(course);
  } catch (error: unknown) {
    log.error("Error fetching training course:", error);
    res.status(500).json({ message: "Failed to fetch training course" });
  }
});

router.post('/courses', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    
    const validatedData = insertTrainingCourseSchema.parse({
      ...req.body,
      workspaceId
    });
    
    const [course] = await db
      .insert(trainingCourses)
      .values(validatedData)
      .returning();
    
    res.json(course);
  } catch (error: unknown) {
    log.error("Error creating training course:", error);
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (error.name === 'ZodError') {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to create training course" });
  }
});

router.patch('/courses/:id', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;
    
    const existing = await db
      .select()
      .from(trainingCourses)
      .where(and(
        eq(trainingCourses.id, id),
        eq(trainingCourses.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!existing[0]) {
      return res.status(404).json({ message: "Training course not found" });
    }
    
    const validatedData = insertTrainingCourseSchema.partial().parse(req.body);
    
    const [updated] = await db
      .update(trainingCourses)
      .set({
        ...validatedData,
        updatedAt: new Date()
      })
      .where(and(eq(trainingCourses.id, id), eq(trainingCourses.workspaceId, workspaceId)))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ message: "Training course not found or access denied" });
    }
    res.json(updated);
  } catch (error: unknown) {
    log.error("Error updating training course:", error);
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (error.name === 'ZodError') {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to update training course" });
  }
});

router.delete('/courses/:id', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;
    
    const existing = await db
      .select()
      .from(trainingCourses)
      .where(and(
        eq(trainingCourses.id, id),
        eq(trainingCourses.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!existing[0]) {
      return res.status(404).json({ message: "Training course not found" });
    }
    
    const deleted = await db
      .delete(trainingCourses)
      .where(and(eq(trainingCourses.id, id), eq(trainingCourses.workspaceId, workspaceId)))
      .returning();
    
    if (!deleted.length) {
      return res.status(404).json({ message: "Training course not found" });
    }
    res.json({ message: "Training course deleted successfully" });
  } catch (error: unknown) {
    log.error("Error deleting training course:", error);
    res.status(500).json({ message: "Failed to delete training course" });
  }
});

router.get('/enrollments', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const employee = await db
      .select()
      .from(employees)
      .where(and(
        eq(employees.userId, userId),
        eq(employees.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!employee[0]) {
      return res.status(403).json({ message: "Employee not found" });
    }
    
    const enrollments = await db
      .select({
        id: trainingEnrollments.id,
        courseId: trainingEnrollments.courseId,
        courseTitle: trainingCourses.title,
        assessmentScore: trainingEnrollments.assessmentScore,
        status: trainingEnrollments.status,
        enrolledAt: trainingEnrollments.enrolledAt,
        completedAt: trainingEnrollments.completedAt,
        certificateUrl: trainingEnrollments.certificateUrl
      })
      .from(trainingEnrollments)
      .leftJoin(trainingCourses, eq(trainingEnrollments.courseId, trainingCourses.id))
      .where(eq(trainingEnrollments.employeeId, employee[0].id))
      .orderBy(desc(trainingEnrollments.enrolledAt));
    
    res.json(enrollments);
  } catch (error: unknown) {
    log.error("Error fetching training enrollments:", error);
    res.status(500).json({ message: "Failed to fetch training enrollments" });
  }
});

router.post('/courses/:id/enroll', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { id: courseId } = req.params;
    
    const employee = await db
      .select()
      .from(employees)
      .where(and(
        eq(employees.userId, userId),
        eq(employees.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!employee[0]) {
      return res.status(403).json({ message: "Employee not found" });
    }
    
    const course = await db
      .select()
      .from(trainingCourses)
      .where(and(
        eq(trainingCourses.id, courseId),
        eq(trainingCourses.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!course[0]) {
      return res.status(404).json({ message: "Training course not found" });
    }
    
    const existing = await db
      .select()
      .from(trainingEnrollments)
      .where(and(
        eq(trainingEnrollments.courseId, courseId),
        eq(trainingEnrollments.employeeId, employee[0].id)
      ))
      .limit(1);
    
    if (existing[0]) {
      return res.status(400).json({ message: "Already enrolled in this course" });
    }
    
    const [enrollment] = await db
      .insert(trainingEnrollments)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .values({
        workspaceId,
        courseId,
        employeeId: employee[0].id,
        status: 'not_started',
        progress: 0,
        dueDate: req.body.dueDate || null
      })
      .returning();
    
    res.json(enrollment);
  } catch (error: unknown) {
    log.error("Error enrolling in course:", error);
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (error.name === 'ZodError') {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to enroll in course" });
  }
});

router.patch('/enrollments/:id/progress', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { id } = req.params;
    const { progress, status, score } = req.body;
    
    const employee = await db
      .select()
      .from(employees)
      .where(and(
        eq(employees.userId, userId),
        eq(employees.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!employee[0]) {
      return res.status(403).json({ message: "Employee not found" });
    }
    
    const enrollment = await db
      .select()
      .from(trainingEnrollments)
      .where(and(
        eq(trainingEnrollments.id, id),
        eq(trainingEnrollments.employeeId, employee[0].id)
      ))
      .limit(1);
    
    if (!enrollment[0]) {
      return res.status(404).json({ message: "Enrollment not found" });
    }
    
    const updateData: any = { updatedAt: new Date() };
    if (progress !== undefined) updateData.progress = progress;
    if (status !== undefined) updateData.status = status;
    if (score !== undefined) updateData.score = score;
    if (status === 'completed') updateData.completedAt = new Date();

    const wasAlreadyCompleted = enrollment[0].status === 'completed';

    const [updated] = await db
      .update(trainingEnrollments)
      .set(updateData)
      .where(eq(trainingEnrollments.id, id))
      .returning();

    // Auto-issue certification when an enrollment transitions to completed (idempotent)
    if (status === 'completed' && !wasAlreadyCompleted && !enrollment[0].certificateUrl) {
      const course = await db
        .select({ title: trainingCourses.title, workspaceId: trainingCourses.workspaceId })
        .from(trainingCourses)
        .where(eq(trainingCourses.id, enrollment[0].courseId))
        .limit(1);

      if (course[0]) {
        const [cert] = await db
          .insert(trainingCertifications)
          .values({
            workspaceId: course[0].workspaceId,
            employeeId: enrollment[0].employeeId,
            courseId: enrollment[0].courseId,
            enrollmentId: id,
            name: `${course[0].title} Certification`,
            issuedDate: new Date(),
            status: 'active',
          })
          .onConflictDoNothing()
          .returning();

        if (cert) {
          await db
            .update(trainingEnrollments)
            .set({ certificateUrl: cert.id })
            .where(eq(trainingEnrollments.id, id));
        }
      }
    }

    res.json(updated);
  } catch (error: unknown) {
    log.error("Error updating enrollment progress:", error);
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (error.name === 'ZodError') {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to update enrollment progress" });
  }
});

router.get('/certifications', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const employee = await db
      .select()
      .from(employees)
      .where(and(
        eq(employees.userId, userId),
        eq(employees.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!employee[0]) {
      return res.status(403).json({ message: "Employee not found" });
    }
    
    const certifications = await db
      .select({
        id: trainingCertifications.id,
        courseId: trainingCertifications.courseId,
        courseTitle: trainingCourses.title,
        issuedAt: trainingCertifications.issuedDate,
        expiresAt: (trainingCertifications as any).expirationDate,
        certificateUrl: trainingCertifications.certificateUrl,
        score: trainingEnrollments.score,
        status: trainingCertifications.status
      })
      .from(trainingCertifications)
      .leftJoin(trainingCourses, eq(trainingCertifications.courseId, trainingCourses.id))
      .leftJoin(trainingEnrollments, eq(trainingCertifications.enrollmentId, trainingEnrollments.id))
      .where(eq(trainingCertifications.employeeId, employee[0].id))
      .orderBy(desc(trainingCertifications.issuedDate));
    
    res.json(certifications);
  } catch (error: unknown) {
    log.error("Error fetching certifications:", error);
    res.status(500).json({ message: "Failed to fetch certifications" });
  }
});

router.post('/certifications', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { employeeId, courseId, enrollmentId } = req.body;
    
    const enrollment = await db
      .select()
      .from(trainingEnrollments)
      .where(and(
        eq(trainingEnrollments.id, enrollmentId),
        eq(trainingEnrollments.employeeId, employeeId),
        eq(trainingEnrollments.status, 'completed')
      ))
      .limit(1);
    
    if (!enrollment[0]) {
      return res.status(400).json({ message: "Employee must complete the course before certification" });
    }
    
    const course = await db
      .select()
      .from(trainingCourses)
      .where(and(
        eq(trainingCourses.id, courseId),
        eq(trainingCourses.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!course[0]) {
      return res.status(404).json({ message: "Course not found" });
    }
    
    const [certification] = await db
      .insert(trainingCertifications)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .values({
        workspaceId,
        employeeId,
        courseId,
        enrollmentId,
        certificationName: `${course[0].title} Certification`,
        issuedDate: new Date(),
        expirationDate: req.body.expiryDate || null,
        status: 'active'
      })
      .returning();
    
    await db
      .update(trainingEnrollments)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .set({ certificateId: certification.id })
      .where(eq(trainingEnrollments.id, enrollmentId));
    
    res.json(certification);
  } catch (error: unknown) {
    log.error("Error issuing certification:", error);
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (error.name === 'ZodError') {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to issue certification" });
  }
});

router.get("/completion/:employeeId", requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { employeeId } = req.params;

    const metrics = await trainingRateService.getTrainingCompletionRate(workspaceId, employeeId);
    res.json({ success: true, data: metrics });
  } catch (error: unknown) {
    log.error('Error fetching training rate:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/team-summary", requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;

    const summary = await trainingRateService.getTeamTrainingCompletionRate(workspaceId);
    res.json({ success: true, data: summary });
  } catch (error: unknown) {
    log.error('Error fetching team training summary:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/requirements/:requiredPerYear", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { requiredPerYear } = req.params;

    trainingRateService.setTrainingRequirements(workspaceId, parseInt(requiredPerYear));

    res.json({ 
      success: true, 
      message: `Training requirements set to ${requiredPerYear} per year`,
    });
  } catch (error: unknown) {
    log.error('Error setting training requirements:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// GET /api/training/analytics — course completion stats for the analytics dashboard
router.get('/analytics', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;

    const courses = await db
      .select()
      .from(trainingCourses)
      .where(eq(trainingCourses.workspaceId, workspaceId));

    const enrollments = await db
      .select()
      .from(trainingEnrollments)
      .where(eq(trainingEnrollments.workspaceId, workspaceId));

    const totalEnrollments = enrollments.length;
    const completed = enrollments.filter(e => e.status === 'completed');
    const inProgress = enrollments.filter(e => e.status === 'in_progress');
    const notStarted = enrollments.filter(e => e.status === 'enrolled');

    const completionRate = totalEnrollments > 0
      ? Math.round((completed.length / totalEnrollments) * 100)
      : 0;

    const avgScore = completed.filter(e => e.score !== null).length > 0
      ? completed.filter(e => e.score !== null).reduce((sum, e) => sum + parseFloat(String(e.score || 0)), 0) /
        completed.filter(e => e.score !== null).length
      : 0;

    const courseStats = courses.map(course => {
      const courseEnrollments = enrollments.filter(e => e.courseId === course.id);
      const courseCompleted = courseEnrollments.filter(e => e.status === 'completed');
      const courseScores = courseCompleted.filter(e => e.score !== null);
      return {
        id: course.id,
        title: course.title,
        category: course.category,
        isRequired: course.isRequired,
        durationHours: course.durationHours,
        totalEnrolled: courseEnrollments.length,
        completed: courseCompleted.length,
        inProgress: courseEnrollments.filter(e => e.status === 'in_progress').length,
        notStarted: courseEnrollments.filter(e => e.status === 'enrolled').length,
        completionRate: courseEnrollments.length > 0
          ? Math.round((courseCompleted.length / courseEnrollments.length) * 100)
          : 0,
        avgScore: courseScores.length > 0
          ? parseFloat((courseScores.reduce((s, e) => s + parseFloat(String(e.score || 0)), 0) / courseScores.length).toFixed(1))
          : null,
      };
    });

    const categoryBreakdown: Record<string, { enrolled: number; completed: number }> = {};
    for (const course of courses) {
      const cat = course.category || 'other';
      if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { enrolled: 0, completed: 0 };
      const ce = enrollments.filter(e => e.courseId === course.id);
      categoryBreakdown[cat].enrolled += ce.length;
      categoryBreakdown[cat].completed += ce.filter(e => e.status === 'completed').length;
    }

    res.json({
      summary: {
        totalCourses: courses.length,
        totalEnrollments,
        completedCount: completed.length,
        inProgressCount: inProgress.length,
        notStartedCount: notStarted.length,
        completionRate,
        avgScore: parseFloat(avgScore.toFixed(1)),
        requiredCourses: courses.filter(c => c.isRequired).length,
      },
      courseStats,
      categoryBreakdown: Object.entries(categoryBreakdown).map(([cat, data]) => ({
        category: cat,
        ...data,
        completionRate: data.enrolled > 0 ? Math.round((data.completed / data.enrolled) * 100) : 0,
      })),
    });
  } catch (error: unknown) {
    log.error('Error fetching training analytics:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

export default router;
