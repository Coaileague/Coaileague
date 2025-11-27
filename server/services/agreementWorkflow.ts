/**
 * Agreement & Contract Workflow Service
 * Manages client contract lifecycle from negotiation to active service
 * Integrated with Stripe billing and onboarding pipeline
 */

import { ONBOARDING_PIPELINE, CONTRACT_STATUSES } from "@shared/clientOnboardingConfig";
import { PLATFORM } from "@shared/platformConfig";

export const AGREEMENT_WORKFLOW = {
  // Draft agreement based on client tier
  createDraft: async (clientId: string, tier: "starter" | "growth" | "enterprise") => {
    const template = ONBOARDING_PIPELINE.agreement_templates.find((t) => t.id === tier);
    return {
      clientId,
      status: CONTRACT_STATUSES.DRAFT,
      template,
      createdAt: new Date(),
    };
  },

  // Send for client review
  sendForReview: async (agreementId: string) => {
    return {
      agreementId,
      status: CONTRACT_STATUSES.SENT_FOR_REVIEW,
      sentAt: new Date(),
      reviewDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    };
  },

  // Mark as ready for signature
  readyForSignature: async (agreementId: string) => {
    return {
      agreementId,
      status: CONTRACT_STATUSES.READY_TO_SIGN,
      signatureDeadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
    };
  },

  // Record signature and activate service
  finalizeSigned: async (agreementId: string, signedBy: string) => {
    return {
      agreementId,
      status: CONTRACT_STATUSES.SIGNED,
      signedBy,
      signedAt: new Date(),
      serviceActivationScheduled: true,
    };
  },

  // Activate client workspace
  activateClient: async (clientId: string, tier: string) => {
    return {
      clientId,
      status: "active",
      workspaceCreated: true,
      tierProvisioned: tier,
      activatedAt: new Date(),
      onboardingPipelineTriggered: true,
    };
  },
};

export const CONTRACT_WORKFLOW_STEPS = [
  {
    step: 1,
    name: "Create Draft",
    action: "createDraft",
    autoTransition: false,
  },
  {
    step: 2,
    name: "Send for Review",
    action: "sendForReview",
    autoTransition: false,
    requiresApproval: true,
  },
  {
    step: 3,
    name: "Ready for Signature",
    action: "readyForSignature",
    autoTransition: false,
  },
  {
    step: 4,
    name: "Signed",
    action: "finalizeSigned",
    autoTransition: true,
    triggerNextStep: "activateClient",
  },
  {
    step: 5,
    name: "Active",
    action: "activateClient",
    autoTransition: true,
    triggersOnboarding: true,
  },
];
