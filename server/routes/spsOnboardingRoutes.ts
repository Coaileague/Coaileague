/**
 * SPS Onboarding Routes Alias
 * ===========================
 * Canonical SPS onboarding API surface lives in `spsFormsRoutes.ts`.
 * This alias exists so integrations and launch checklists that look for
 * `spsOnboardingRoutes` resolve to the same router without drift.
 */

import { spsFormsRouter } from './spsFormsRoutes';

export const spsOnboardingRoutes = spsFormsRouter;
export default spsOnboardingRoutes;

