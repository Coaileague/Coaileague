/**
 * ANVIL SECURITY GROUP — OPERATIONAL DATA SEED
 * Shifts, time entries, payroll runs, pay stubs, invoices,
 * guard tours, lone worker sessions. Idempotent.
 * Sentinel: guard_tours.id = 'anvil-tour-001'
 */
import { db } from "../db";
import { createLogger } from '../lib/logger';
const log = createLogger('developmentSeedAnvilOperational');

