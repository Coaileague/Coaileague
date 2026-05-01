/**
 * ANVIL SECURITY GROUP — CORE SEED
 * Creates workspace, users, employees, clients, workspace members.
 * San Antonio TX area. Idempotent — ON CONFLICT DO NOTHING throughout.
 * Sentinel: workspaces.id = 'dev-anvil-security-ws'
 */
import { db } from "../db";
import { createLogger } from '../lib/logger';
const log = createLogger('developmentSeedAnvil');

