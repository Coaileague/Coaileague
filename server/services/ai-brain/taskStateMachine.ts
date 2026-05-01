/**
 * TASK STATE MACHINE SERVICE
 * ==========================
 * Enforces Plan→Act→Validate→Reflect lifecycle for Trinity tasks.
 * 
 * This service solves the "State Machine Governance" critical gap:
 * - Enforces valid phase transitions
 * - Persists status ledger to database
 * - Provides guard rails for illegal transitions
 * - Integrates with parity layer run loop
 * 
 * State Flow:
 * pending → planning → plan_ready → executing → validating → reflecting → completed
 *                                                          ↓
 *                                                    (retry loop)
 */

import { db } from '../../db';
import { createLogger } from '../../lib/logger';
const log = createLogger('taskStateMachine');

