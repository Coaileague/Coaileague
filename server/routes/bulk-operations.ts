/**
 * Bulk Operations API Routes
 * ==========================
 * Handles bulk import/export for employees, clients, shifts, invoices, and time entries.
 */

import express, { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';
import { requireManager } from '../rbac';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { employees, clients, shifts, invoices, timeEntries } from '@shared/schema';
import { exportEmployees, exportPayroll } from '../services/exportService';
import multer from 'multer';
import { z } from 'zod';

export const bulkOperationsRouter: Router = express.Router();

// Secure multer config: 5 MB cap, CSV/Excel only, memory storage
// Both MIME type and file extension are checked because some browsers send
// 'application/octet-stream' for CSV files instead of 'text/csv', so relying
// on MIME alone would reject valid uploads from those browsers.
const BULK_IMPORT_LIMITS = { fileSize: 5 * 1024 * 1024 }; // 5 MB
const BULK_ALLOWED_MIME = [
  'text/csv', 'text/plain', 'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: BULK_IMPORT_LIMITS,
  fileFilter: (_req, file, cb) => {
    if (!BULK_ALLOWED_MIME.includes(file.mimetype) && !file.originalname.match(/\.(csv|xlsx|xls)$/i)) {
      return cb(new Error(`File type not allowed. Upload CSV or Excel files only.`));
    }
    cb(null, true);
  },
});

// ============================================================================
// CSV PARSING HELPER
// ============================================================================

function parseCSV(csvData: string): Array<Record<string, string>> {
  const lines = csvData.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row);
  }

  return rows;
}

// ============================================================================
// IMPORT ROUTES
// ============================================================================

/**
 * POST /api/bulk/import/employees
 * Bulk import employees from CSV
 */
bulkOperationsRouter.post('/import/employees', requireAuth, requireManager, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    let data: Array<Record<string, string>>;

    if (req.file) {
      const csvData = req.file.buffer.toString('utf-8');
      data = parseCSV(csvData);
    } else if (req.body.data) {
      data = req.body.data;
    } else {
      return res.status(400).json({ error: 'CSV file or data array required' });
    }

    const imported: any[] = [];
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      try {
        if (!row.firstName || !row.lastName || !row.email) {
          throw new Error('firstName, lastName, and email are required');
        }

        const [emp] = await db.insert(employees).values({
          workspaceId,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          phone: row.phone || null,
          role: row.role || 'employee',
          status: 'active',
        }).returning();
        imported.push(emp);
      } catch (error: any) {
        errors.push({ row: i + 1, error: error.message });
      }
    }

    res.json({
      success: true,
      imported: imported.length,
      errors: errors.length,
      errorDetails: errors,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to import employees', message: error.message });
  }
});

/**
 * POST /api/bulk/import/clients
 * Bulk import clients from CSV
 */
bulkOperationsRouter.post('/import/clients', requireAuth, requireManager, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    let data: Array<Record<string, string>>;

    if (req.file) {
      const csvData = req.file.buffer.toString('utf-8');
      data = parseCSV(csvData);
    } else if (req.body.data) {
      data = req.body.data;
    } else {
      return res.status(400).json({ error: 'CSV file or data array required' });
    }

    const imported: any[] = [];
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      try {
        if (!row.firstName || !row.lastName) {
          throw new Error('firstName and lastName are required');
        }

        const [client] = await db.insert(clients).values({
          workspaceId,
          firstName: row.firstName,
          lastName: row.lastName,
          companyName: row.companyName || null,
          email: row.email || null,
          phone: row.phone || null,
          address: row.address || null,
          isActive: true,
        }).returning();
        imported.push(client);
      } catch (error: any) {
        errors.push({ row: i + 1, error: error.message });
      }
    }

    res.json({
      success: true,
      imported: imported.length,
      errors: errors.length,
      errorDetails: errors,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to import clients', message: error.message });
  }
});

/**
 * POST /api/bulk/import/shifts
 * Bulk import shifts from CSV
 */
bulkOperationsRouter.post('/import/shifts', requireAuth, requireManager, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    let data: Array<Record<string, string>>;

    if (req.file) {
      const csvData = req.file.buffer.toString('utf-8');
      data = parseCSV(csvData);
    } else if (req.body.data) {
      data = req.body.data;
    } else {
      return res.status(400).json({ error: 'CSV file or data array required' });
    }

    const imported: any[] = [];
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      try {
        if (!row.employeeId || !row.startTime || !row.endTime) {
          throw new Error('employeeId, startTime, and endTime are required');
        }

        const [shift] = await db.insert(shifts).values({
          workspaceId,
          employeeId: row.employeeId,
          startTime: new Date(row.startTime),
          endTime: new Date(row.endTime),
          title: row.title || null,
          description: row.description || null,
          status: 'scheduled',
        }).returning();
        imported.push(shift);
      } catch (error: any) {
        errors.push({ row: i + 1, error: error.message });
      }
    }

    res.json({
      success: true,
      imported: imported.length,
      errors: errors.length,
      errorDetails: errors,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to import shifts', message: error.message });
  }
});

// ============================================================================
// EXPORT ROUTES
// ============================================================================

/**
 * GET /api/bulk/export/employees
 * Export all employees to CSV/JSON
 */
bulkOperationsRouter.get('/export/employees', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    const format = (req.query.format as 'csv' | 'json') || 'csv';

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const result = await exportEmployees(workspaceId, { format });

    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to export employees', message: error.message });
  }
});

/**
 * GET /api/bulk/export/clients
 * Export all clients to CSV/JSON
 */
bulkOperationsRouter.get('/export/clients', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    const format = (req.query.format as 'csv' | 'json') || 'csv';

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const clientList = await db.query.clients.findMany({
      where: eq(clients.workspaceId, workspaceId),
    });

    const sanitized = clientList.map(c => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      companyName: c.companyName,
      email: c.email,
      phone: c.phone,
      address: c.address,
      isActive: c.isActive,
    }));

    let data: string;
    if (format === 'csv') {
      if (sanitized.length === 0) {
        data = 'id,firstName,lastName,companyName,email,phone,address,isActive';
      } else {
        const headers = Object.keys(sanitized[0]).join(',');
        const rows = sanitized.map(row => Object.values(row).map(v => v ?? '').join(','));
        data = [headers, ...rows].join('\n');
      }
    } else {
      data = JSON.stringify(sanitized, null, 2);
    }

    const filename = `clients-${new Date().toISOString().split('T')[0]}.${format}`;
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to export clients', message: error.message });
  }
});

/**
 * GET /api/bulk/export/shifts
 * Export shifts to CSV/JSON
 */
bulkOperationsRouter.get('/export/shifts', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    const format = (req.query.format as 'csv' | 'json') || 'csv';

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const shiftList = await db.query.shifts.findMany({
      where: eq(shifts.workspaceId, workspaceId),
    });

    const sanitized = shiftList.map(s => ({
      id: s.id,
      employeeId: s.employeeId,
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status,
      title: s.title,
      description: s.description,
    }));

    let data: string;
    if (format === 'csv') {
      if (sanitized.length === 0) {
        data = 'id,employeeId,startTime,endTime,status,title,description';
      } else {
        const headers = Object.keys(sanitized[0]).join(',');
        const rows = sanitized.map(row => Object.values(row).map(v => v ?? '').join(','));
        data = [headers, ...rows].join('\n');
      }
    } else {
      data = JSON.stringify(sanitized, null, 2);
    }

    const filename = `shifts-${new Date().toISOString().split('T')[0]}.${format}`;
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to export shifts', message: error.message });
  }
});

/**
 * GET /api/bulk/export/time-entries
 * Export time entries to CSV/JSON
 */
bulkOperationsRouter.get('/export/time-entries', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    const format = (req.query.format as 'csv' | 'json') || 'csv';

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const result = await exportPayroll(workspaceId, { format });

    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to export time entries', message: error.message });
  }
});

// ============================================================================
// TEMPLATE ROUTES
// ============================================================================

/**
 * GET /api/bulk/templates/:type
 * Get CSV template for bulk import
 */
bulkOperationsRouter.get('/templates/:type', (req: Request, res: Response) => {
  const { type } = req.params;

  const templates: Record<string, string> = {
    employees: 'firstName,lastName,email,phone,role\nJohn,Doe,john@example.com,555-1234,employee\nJane,Smith,jane@example.com,555-5678,manager',
    clients: 'firstName,lastName,companyName,email,phone,address\nJohn,Contact,Acme Corp,contact@acme.com,555-1234,123 Main St',
    shifts: 'employeeId,startTime,endTime,title,description\nEMP-001,2024-01-15T09:00:00Z,2024-01-15T17:00:00Z,Morning Shift,Regular shift',
  };

  const template = templates[type];
  if (!template) {
    return res.status(404).json({ error: `Template for '${type}' not found` });
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-template.csv"`);
  res.send(template);
});

export default bulkOperationsRouter;
