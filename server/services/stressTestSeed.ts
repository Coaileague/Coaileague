/**
 * STRESS TEST SEED — 30 days of shifts for ACME + Anvil
 * Creates realistic data for Trinity to process:
 * - Past shifts: completed, ready for payroll/invoices
 * - Future shifts: published/scheduled for coverage testing
 */

import { db } from '../db';
import { createLogger } from '../lib/logger';
const log = createLogger('stressTestSeed');

