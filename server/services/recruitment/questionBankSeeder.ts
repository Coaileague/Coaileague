/**
 * QUESTION BANK SEEDER
 * Phase 58 — Trinity Interview Pipeline
 *
 * Seeds the default question bank for armed_officer, unarmed_officer, and supervisor position types.
 * Called during ACME sandbox setup.
 */

import { db } from '../../db';
import { createLogger } from '../../lib/logger';
const log = createLogger('questionBankSeeder');

