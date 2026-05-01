/**
 * COMPREHENSIVE DEV SEED — Full Relational Integrity
 * ====================================================
 * Creates a complete production-like dataset:
 *   users → employees (userId FK) → workspace_members
 *   clients → shifts (clientId FK, employeeId FK)  
 *   shifts → time_entries (shiftId FK, employeeId FK)
 *   time_entries → payroll_runs → payroll_entries
 *   time_entries → invoices → invoice_line_items
 */

import { pool } from '../db';
import { createLogger } from '../lib/logger';
const log = createLogger('comprehensiveDevSeed');

