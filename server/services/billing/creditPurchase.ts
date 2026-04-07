/**
 * Credit Purchase Service — No-Op Stub
 * creditPacks table was dropped (Phase 16). All purchase flows return
 * success immediately; Stripe checkout is disabled.
 */
import { createLogger } from '../../lib/logger';

const log = createLogger('CreditPurchaseService');

export interface CreateCheckoutSessionParams {
  workspaceId: string;
  creditPackId: string;
  userId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  sessionId: string | null;
  url: string | null;
  error?: string;
}

export class CreditPurchaseService {
  async createCheckoutSession(_params: CreateCheckoutSessionParams): Promise<CheckoutSessionResult> {
    log.info('creditPurchaseService.createCheckoutSession no-op — creditPacks table dropped');
    return { sessionId: null, url: null, error: 'Credit packs are no longer available' };
  }

  async fulfillPurchase(_paymentIntentId: string, _workspaceId: string): Promise<void> {
    log.info('creditPurchaseService.fulfillPurchase no-op — credit_transactions table dropped');
  }

  async listAvailablePacks(_workspaceId: string): Promise<unknown[]> {
    return [];
  }

  async getPackById(_packId: string): Promise<null> {
    return null;
  }
}

export const creditPurchaseService = new CreditPurchaseService();
