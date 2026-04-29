/**
 * aiCreditGateway — LEGACY SHIM
 * Real gating uses aiTokenGateway.preAuthorize() with tier-based allowances.
 * @see server/services/billing/aiTokenGateway.ts
 */
export { aiTokenGateway as aiCreditGateway } from './aiTokenGateway';
