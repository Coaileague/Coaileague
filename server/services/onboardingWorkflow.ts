/**
 * server/services/onboardingWorkflow.ts
 *
 * Re-export shim — employeeRoutes.ts imports `initiateEmployeeOnboarding`
 * from this path, while the real implementation lives in onboardingAutomation.ts.
 */

export {
  initiateEmployeeOnboarding,
  completeOnboardingStep,
} from './onboardingAutomation';
