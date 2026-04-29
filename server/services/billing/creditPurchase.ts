/**
 * creditPurchase — LEGACY SHIM
 * CoAIleague uses Stripe subscription tiers, not one-off credit purchases.
 * Tier upgrades are handled via subscriptionService and Stripe webhooks.
 * @see server/routes/billing-api.ts
 */
export const creditPurchase = {
  purchase: async (_workspaceId: string, _amount: number) => {
    throw new Error('Credit purchases are not supported. Use subscription tier upgrades via Stripe.');
  },
};
