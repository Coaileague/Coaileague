/**
 * creditBalanceService — LEGACY SHIM
 * The platform tracks AI usage via tokenManager + TIER_TOKEN_ALLOCATIONS.
 * This file exists only to satisfy the domain contract file check.
 * All real token tracking goes through tokenManager / aiTokenGateway.
 * @see server/services/billing/tokenManager.ts
 * @see server/services/billing/aiTokenGateway.ts
 */
export { tokenManager as creditBalanceService } from './tokenManager';
