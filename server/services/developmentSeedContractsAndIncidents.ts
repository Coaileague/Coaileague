/**
 * CONTRACTS & INCIDENTS SEED — Both Acme Security and Anvil Security
 * Client contracts (with e-signature tokens), incident reports for both orgs.
 * Idempotent — sentinel: client_contracts.id = 'contract-acme-002'
 */
import { db } from "../db";
import { createLogger } from '../lib/logger';
const log = createLogger('developmentSeedContractsAndIncidents');

