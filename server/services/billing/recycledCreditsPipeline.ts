/**
 * recycledCreditsPipeline — LEGACY SHIM
 * Token refunds are not a concept in the tier-based model.
 * Failed AI calls simply don't consume from the allocation.
 * @see server/services/billing/aiTokenGateway.ts (preAuthorize only charges on success)
 */
export const recycledCreditsPipeline = {
  refund: async () => {},
  run: async () => ({ refunded: 0 }),
};
