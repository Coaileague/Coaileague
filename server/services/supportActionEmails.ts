/**
 * server/services/supportActionEmails.ts
 *
 * Re-export barrel for support-specific email actions.
 * All implementations live in emailCore; supportRoutes imports from here.
 */

export {
  sendReviewDeletedEmail,
  sendReviewEditedEmail,
  sendRatingDeletedEmail,
  sendWriteUpDeletedEmail,
  sendCanSpamCompliantEmail,
  getUncachableResendClient,
  isResendConfigured,
} from './emailCore';
