/**
 * Per-category template barrel.
 *
 * Templates that used to live as a single 650-line `emailTemplates`
 * object inside emailService.ts now sit in dedicated files by category.
 * The combined export keeps the existing call sites unchanged
 * (`emailTemplates.verification(...)`, `emailTemplates.paymentFailed(...)`)
 * — only the file each template lives in changed.
 *
 * Keep new templates grouped by lifecycle (account / billing / support /
 * onboarding / scheduling) and add new categories as separate files
 * rather than growing any one file unbounded.
 */
import { accountTemplates } from './account';
import { billingTemplates } from './billing';
import { supportTemplates } from './support';
import { /* onboardingTemplates removed - use onboardingFlow/onboardingStep */ } from './onboarding';
import { schedulingTemplates } from './scheduling';

export const emailTemplates = {
  ...accountTemplates,
  ...billingTemplates,
  ...supportTemplates,
  .../* onboardingTemplates removed - use onboardingFlow/onboardingStep */,
  ...schedulingTemplates,
};

export type EmailTemplateName = keyof typeof emailTemplates;

export {
  accountTemplates,
  billingTemplates,
  supportTemplates,
  /* onboardingTemplates removed - use onboardingFlow/onboardingStep */,
  schedulingTemplates,
};
