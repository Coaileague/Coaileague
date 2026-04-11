/**
 * COMPREHENSIVE EMAIL TEMPLATE FIRE TEST
 * ========================================
 * Sends EVERY email template the platform uses to txpsinvestigations@gmail.com.
 * This bypasses simulation mode and hits the live Resend API directly.
 *
 * Templates tested (in order):
 *   1.  Email Verification
 *   2.  Password Reset
 *   3.  New Member Welcome
 *   4.  Employee Invitation
 *   5.  Onboarding Complete
 *   6.  Support Ticket Confirmation
 *   7.  Report Delivery
 *   8.  Employee Temporary Password
 *   9.  Manager Onboarding Notification
 *  10.  Client Welcome
 *  11.  Public Lead Welcome
 *  12.  Organization Invitation
 *  13.  Assisted Onboarding Handoff
 *  14.  Support Role Briefing
 *  15.  Trinity AI Greeting (staffing)
 *  16.  Staffing Request Dropped
 *  17.  Staffing Onboarding Invitation
 *  18.  Account Deactivation
 *  19.  Subscription Welcome
 *  20.  Subscription Cancellation
 *  21.  Payment Failed
 *  22.  Maintenance Notification
 *
 * Run: npx tsx server/tests/sendAllEmailTemplates.ts
 *
 * Requires: RESEND_API_KEY env var (any valid Resend key will work)
 *           RESEND_FROM_EMAIL env var (optional, falls back to noreply@coaileague.com)
 */

import { Resend } from 'resend';

const TO = 'txpsinvestigations@gmail.com';
const FROM = process.env.RESEND_FROM_EMAIL || 'noreply@coaileague.com';
const TRINITY_FROM = 'trinity@coaileague.com';
const SUPPORT_FROM = 'support@coaileague.com';
const APP_URL = 'https://coaileague.com';

const FIRST_NAME = 'Sarah';
const FULL_NAME = 'Sarah Johnson';
const WORKSPACE_NAME = 'TXPS Investigations';
const PLATFORM_NAME = 'CoAIleague';

let passed = 0;
let failed = 0;
const results: { name: string; id?: string; error?: string }[] = [];

async function send(
  name: string,
  subject: string,
  html: string,
  from: string = FROM,
) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({ from, to: [TO], subject, html }); // nds
    if ((result as any).error) {
      const msg = JSON.stringify((result as any).error);
      console.error(`  ❌ [${name}] FAILED: ${msg}`);
      results.push({ name, error: msg });
      failed++;
    } else {
      const id = (result as any).data?.id ?? '?';
      console.log(`  ✅ [${name}] Sent — id=${id}`);
      results.push({ name, id });
      passed++;
    }
  } catch (e: any) {
    console.error(`  ❌ [${name}] Exception: ${e.message}`);
    results.push({ name, error: e.message });
    failed++;
  }
}

// ─── HTML BUILDERS ────────────────────────────────────────────────────────────

function layout(header: string, body: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:28px;text-align:center;">
    <h1 style="color:white;margin:0;font-size:22px;">${header}</h1>
    <p style="color:#93c5fd;margin:8px 0 0;font-size:13px;">${PLATFORM_NAME}</p>
  </div>
  <div style="padding:28px;background:#f8fafc;">${body}</div>
</div>`;
}

function ctaBtn(text: string, url: string): string {
  return `<div style="text-align:center;margin:24px 0;"><a href="${url}" style="background:#2563eb;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">${text}</a></div>`;
}

// ── TEMPLATE BUILDERS ─────────────────────────────────────────────────────────

function verificationEmail() {
  const url = `${APP_URL}/verify-email?token=test-verify-token-abc123`;
  return layout('Verify Your Email', `
    <p>Hello <strong>${FIRST_NAME}</strong>,</p>
    <p>Thank you for registering with <strong>${PLATFORM_NAME}</strong>! To activate your account, please verify your email address by clicking the button below.</p>
    ${ctaBtn('Verify My Email', url)}
    <p style="color:#64748b;font-size:13px;">This link expires in 24 hours. If you did not create an account, you can safely ignore this email.</p>
  `);
}

function passwordResetEmail() {
  const url = `${APP_URL}/reset-password?token=test-reset-token-xyz789`;
  return layout('Reset Your Password', `
    <p>Hello <strong>${FIRST_NAME}</strong>,</p>
    <p>We received a request to reset the password for your <strong>${PLATFORM_NAME}</strong> account.</p>
    ${ctaBtn('Reset My Password', url)}
    <p style="color:#64748b;font-size:13px;">This link expires in 1 hour. If you did not request a password reset, please ignore this email — your password has not changed.</p>
  `);
}

function newMemberWelcomeEmail() {
  const url = `${APP_URL}/onboarding`;
  return layout('Welcome to CoAIleague! 🎉', `
    <p>Hello <strong>${FIRST_NAME}</strong>,</p>
    <p>You've successfully registered on <strong>${PLATFORM_NAME}</strong>! We're thrilled to have you on board.</p>
    <p>Complete your onboarding to unlock all platform features:</p>
    ${ctaBtn('Start Onboarding', url)}
    <p style="color:#64748b;font-size:13px;">Need help? Reply to this email or visit our support center.</p>
  `);
}

function employeeInvitationEmail() {
  const url = `${APP_URL}/accept-invite?token=test-invite-token-emp001`;
  return layout(`Join ${WORKSPACE_NAME} on CoAIleague`, `
    <p>Hello <strong>${FIRST_NAME}</strong>,</p>
    <p><strong>Jane Smith</strong> has invited you to join <strong>${WORKSPACE_NAME}</strong> on <strong>${PLATFORM_NAME}</strong> as a <em>Security Officer</em>.</p>
    ${ctaBtn('Accept Invitation', url)}
    <p style="color:#64748b;font-size:13px;">This invitation expires in 7 days.</p>
  `);
}

function onboardingCompleteEmail() {
  const url = `${APP_URL}/dashboard`;
  return layout('Onboarding Complete! 🎊', `
    <p>Hello <strong>${FIRST_NAME}</strong>,</p>
    <p>You have completed all <strong>5 onboarding tasks</strong> for <strong>${WORKSPACE_NAME}</strong>. Your account is fully configured and ready to use!</p>
    ${ctaBtn('Go to Dashboard', url)}
  `);
}

function supportTicketEmail() {
  return layout('Support Ticket Received', `
    <p>Hello <strong>${FULL_NAME}</strong>,</p>
    <p>We've received your support request and created ticket <strong>#TKT-2026-4521</strong>.</p>
    <p><strong>Subject:</strong> Login issue with 2FA</p>
    <p>Our support team will respond within 24 hours. You can track your ticket status in the dashboard.</p>
  `);
}

function reportDeliveryEmail() {
  return layout('Your Report Is Ready', `
    <p>Hello <strong>${FULL_NAME}</strong>,</p>
    <p>Your requested report <strong>RPT-2026-0042 — April Weekly Security Summary</strong> is ready for download.</p>
    ${ctaBtn('Download Report', `${APP_URL}/reports/RPT-2026-0042`)}
  `);
}

function tempPasswordEmail() {
  return layout('Your Temporary Password', `
    <p>Hello <strong>${FIRST_NAME}</strong>,</p>
    <p>Your account for <strong>${WORKSPACE_NAME}</strong> on <strong>${PLATFORM_NAME}</strong> has been created.</p>
    <p>Your temporary credentials are:</p>
    <div style="background:white;padding:16px;border-radius:8px;border:1px solid #e2e8f0;margin:16px 0;">
      <p style="margin:4px 0;"><strong>Email:</strong> ${TO}</p>
      <p style="margin:4px 0;"><strong>Temporary Password:</strong> <code style="background:#f1f5f9;padding:2px 8px;border-radius:4px;">Temp@2026!SecureXY</code></p>
    </div>
    ${ctaBtn('Sign In & Change Password', `${APP_URL}/login`)}
    <p style="color:#ef4444;font-size:13px;">You will be required to change this password on first login.</p>
  `);
}

function managerOnboardingEmail() {
  return layout('New Employee Onboarding', `
    <p>Hello <strong>Manager Jones</strong>,</p>
    <p>A new team member, <strong>${FULL_NAME}</strong>, has been added to your workspace at <strong>${WORKSPACE_NAME}</strong>.</p>
    <p>Please ensure they complete their onboarding tasks and receive proper orientation.</p>
    ${ctaBtn('View Employee Profile', `${APP_URL}/employees`)}
  `);
}

function clientWelcomeEmail() {
  const url = `${APP_URL}/client-portal`;
  return layout(`Welcome to ${WORKSPACE_NAME}`, `
    <p>Hello <strong>${FULL_NAME}</strong>,</p>
    <p>Your client account at <strong>${WORKSPACE_NAME}</strong> (powered by ${PLATFORM_NAME}) is now active!</p>
    <p>Your Client Portal gives you 24/7 access to manage your security services, review reports, and communicate with your provider.</p>
    ${ctaBtn('Access Client Portal', url)}
  `);
}

function publicLeadEmail() {
  const url = `${APP_URL}/schedule-demo`;
  return layout(`Thank You for Your Interest in ${PLATFORM_NAME}`, `
    <p>Hello <strong>${FULL_NAME}</strong>,</p>
    <p>Thank you for exploring <strong>${PLATFORM_NAME}</strong> for <strong>TXPS Investigations LLC</strong>!</p>
    <p>Based on your information, our AI estimates potential annual savings of <strong>$42,000</strong> for your 8-officer team.</p>
    ${ctaBtn('Schedule a Live Demo', url)}
  `);
}

function orgInvitationEmail() {
  const url = `${APP_URL}/welcome?token=test-org-invite-token-789`;
  return layout(`You're Invited to Join ${PLATFORM_NAME}`, `
    <p>Hello <strong>${FULL_NAME}</strong>,</p>
    <p><strong>CoAIleague Admin</strong> has invited <strong>TXPS Investigations LLC</strong> to join the <strong>${PLATFORM_NAME}</strong> staffing network.</p>
    <p>Join thousands of security companies using AI to staff faster and smarter.</p>
    ${ctaBtn('Accept Invitation', url)}
    <p style="color:#64748b;font-size:13px;">This invitation expires in 7 days.</p>
  `);
}

function assistedHandoffEmail() {
  const url = `${APP_URL}/accept-handoff?token=test-handoff-token-456`;
  return layout('Your Account Is Ready', `
    <p>Hello <strong>${FIRST_NAME}</strong>,</p>
    <p>Our support team has finished setting up your <strong>${WORKSPACE_NAME}</strong> workspace on ${PLATFORM_NAME}.</p>
    <p>Everything is configured and ready for you to take over. Click the button below to access your account.</p>
    ${ctaBtn('Access My Account', url)}
    <p style="color:#64748b;font-size:13px;">This handoff link expires on April 18, 2026.</p>
  `);
}

function supportRoleBriefingEmail() {
  const url = `${APP_URL}/platform-admin`;
  return layout('Platform Support Role Assigned', `
    <p>Hello <strong>${FIRST_NAME}</strong>,</p>
    <p>You have been assigned the <strong>Platform Support Agent</strong> role on ${PLATFORM_NAME}.</p>
    <p><strong>Your capabilities include:</strong></p>
    <ul style="color:#334155;">
      <li>View all workspace details and billing history</li>
      <li>Assist users with account issues</li>
      <li>Escalate critical platform issues to engineering</li>
    </ul>
    ${ctaBtn('Access Support Dashboard', url)}
  `);
}

function trinityGreetingEmail() {
  const refNum = `SR-${Date.now().toString(36).toUpperCase()}`;
  return {
    subject: `Staffing Request Received — ${WORKSPACE_NAME} [Ref: ${refNum}]`,
    html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#0f172a,#1e3a5f,#1e40af);padding:32px;border-radius:12px 12px 0 0;text-align:center;">
    <p style="color:#93c5fd;margin:0 0 6px;font-size:13px;letter-spacing:2px;text-transform:uppercase;">CoAIleague Staffing Network</p>
    <h1 style="color:white;margin:0;font-size:26px;">${WORKSPACE_NAME}</h1>
    <p style="color:#7dd3fc;margin:12px 0 0;font-size:14px;">Staffing Request Received | Ref: ${refNum}</p>
  </div>
  <div style="padding:32px;background:#f8fafc;border-radius:0 0 12px 12px;">
    <p style="font-size:16px;color:#1e293b;">Hello ${FULL_NAME},</p>
    <p style="color:#334155;font-size:14px;line-height:1.8;">Greetings. My name is <strong>Trinity</strong>, the AI staffing coordinator for the CoAIleague network. I have received your request for one (1) unarmed security officer at 4500 Industrial Blvd, Houston, TX 77023 on April 15, 2026 (6 PM – 6 AM).</p>
    <p style="color:#334155;font-size:14px;line-height:1.8;">I will match qualified officers using our Officer Readiness Score and will be in touch shortly with a confirmation.</p>
    <p style="color:#1e293b;font-size:14px;margin:0;">Sincerely,</p>
    <p style="color:#1e40af;font-size:18px;font-weight:700;margin:6px 0 2px;font-style:italic;">Trinity</p>
    <p style="color:#64748b;font-size:12px;margin:0;">AI Staffing Coordinator — CoAIleague Network</p>
  </div>
</div>`,
  };
}

function staffingDroppedEmail() {
  const refNum = `SR-DROP-${Date.now().toString(36).toUpperCase()}`;
  return layout('Staffing Request Update', `
    <p>Hello <strong>${FULL_NAME}</strong>,</p>
    <p>Thank you for reaching out to <strong>${WORKSPACE_NAME}</strong> regarding your security staffing need. After a thorough review, we are unable to fulfill this particular request at this time.</p>
    <p style="color:#64748b;font-size:13px;">Reference: ${refNum}</p>
    <p>We apologize for any inconvenience. Please reach out for future needs and we'll do our best to assist.</p>
  `);
}

function staffingOnboardingEmail() {
  const confNum = `CONF-${Date.now().toString(36).toUpperCase()}`;
  const refNum = `SR-WIN-${Date.now().toString(36).toUpperCase()}`;
  return {
    subject: `Your Assignment is Staffed — ${WORKSPACE_NAME} [${confNum}]`,
    html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#065f46,#047857,#16a34a);padding:32px;border-radius:12px 12px 0 0;text-align:center;">
    <p style="color:#a7f3d0;margin:0 0 6px;font-size:13px;letter-spacing:2px;text-transform:uppercase;">Assignment Confirmed</p>
    <h1 style="color:white;margin:0;font-size:26px;">${WORKSPACE_NAME}</h1>
    <p style="color:#6ee7b7;margin:10px 0 0;font-size:14px;">Your staffing request has been fulfilled</p>
  </div>
  <div style="padding:32px;background:#f8fafc;border-radius:0 0 12px 12px;">
    <p style="font-size:16px;color:#1e293b;">Hello ${FULL_NAME},</p>
    <div style="background:#ecfdf5;padding:18px;border-radius:10px;border:1px solid #bbf7d0;margin-bottom:24px;">
      <p style="margin:0 0 6px;color:#065f46;font-size:15px;font-weight:700;">Your assignment is now staffed.</p>
      <p style="margin:0;color:#047857;font-size:13px;">Confirmation: <strong>${confNum}</strong> &nbsp;|&nbsp; Reference: <strong>${refNum}</strong></p>
    </div>
    <p><strong>Assigned Officer:</strong> Marcus T. Williams — Senior Security Officer (Verified)</p>
    <p><strong>Location:</strong> 4500 Industrial Blvd, Houston, TX 77023</p>
    <p><strong>Date/Time:</strong> April 15, 2026 | 6:00 PM – 6:00 AM</p>
    <div style="text-align:center;margin:24px 0;"><a href="${APP_URL}/portal" style="background:#2563eb;color:white;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">Open Client Portal</a></div>
    <p style="color:#1e293b;font-size:14px;margin:0;">Sincerely,</p>
    <p style="color:#1e40af;font-size:18px;font-weight:700;margin:6px 0 2px;font-style:italic;">Trinity</p>
    <p style="color:#64748b;font-size:12px;margin:0;">AI Staffing Coordinator — CoAIleague Network</p>
  </div>
</div>`,
  };
}

function accountDeactivationEmail() {
  return layout('Account Deactivated', `
    <p>Hello <strong>${FIRST_NAME}</strong>,</p>
    <p>Your <strong>${PLATFORM_NAME}</strong> account has been deactivated as requested. Your data will be retained for 90 days before permanent deletion.</p>
    <p>If this was done in error, please contact support immediately at <a href="mailto:support@coaileague.com">support@coaileague.com</a>.</p>
  `);
}

function subscriptionWelcomeEmail() {
  const url = `${APP_URL}/dashboard`;
  return layout('Subscription Activated — Welcome to CoAIleague Pro!', `
    <p>Hello <strong>${FIRST_NAME}</strong>,</p>
    <p>Your <strong>Professional Plan</strong> subscription for <strong>${WORKSPACE_NAME}</strong> is now active. You now have access to all Pro features including:</p>
    <ul style="color:#334155;">
      <li>AI-powered shift staffing with Officer Readiness Score</li>
      <li>Unlimited employee accounts</li>
      <li>Advanced reporting and analytics</li>
      <li>Trinity AI for inbound staffing requests</li>
    </ul>
    ${ctaBtn('Go to Dashboard', url)}
    <p style="color:#64748b;font-size:13px;">Your next billing date is May 11, 2026. Manage your subscription in Account Settings.</p>
  `);
}

function subscriptionCancellationEmail() {
  return layout('Subscription Cancelled', `
    <p>Hello <strong>${FIRST_NAME}</strong>,</p>
    <p>Your <strong>${PLATFORM_NAME}</strong> subscription for <strong>${WORKSPACE_NAME}</strong> has been cancelled. You will retain access through <strong>May 11, 2026</strong>.</p>
    <p>We're sorry to see you go. If there's anything we can do to help, please reply to this email.</p>
    ${ctaBtn('Reactivate Subscription', `${APP_URL}/billing`)}
  `);
}

function paymentFailedEmail() {
  return layout('Payment Failed — Action Required', `
    <p>Hello <strong>${FIRST_NAME}</strong>,</p>
    <p>We were unable to process your payment of <strong>$149.00</strong> for <strong>${WORKSPACE_NAME}</strong>.</p>
    <p><strong>Reason:</strong> Card declined (insufficient funds)</p>
    <p>Please update your payment method to avoid service interruption.</p>
    ${ctaBtn('Update Payment Method', `${APP_URL}/billing`)}
    <p style="color:#ef4444;font-size:13px;">If payment is not received within 3 days, your account will be suspended.</p>
  `);
}

function maintenanceNotificationEmail() {
  return layout('Scheduled Maintenance — April 13, 2026', `
    <p>Hello <strong>${FIRST_NAME}</strong>,</p>
    <p><strong>${PLATFORM_NAME}</strong> will undergo scheduled maintenance on:</p>
    <div style="background:white;padding:16px;border-radius:8px;border:1px solid #e2e8f0;margin:16px 0;">
      <p style="margin:4px 0;"><strong>Date:</strong> Sunday, April 13, 2026</p>
      <p style="margin:4px 0;"><strong>Time:</strong> 2:00 AM – 4:00 AM ET</p>
      <p style="margin:4px 0;"><strong>Expected Downtime:</strong> ~2 hours</p>
    </div>
    <p>During this window, the platform will be unavailable. All data is safe and no action is required from you.</p>
    <p style="color:#64748b;font-size:13px;">We apologize for any inconvenience. Follow us on social media for real-time status updates.</p>
  `);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.RESEND_API_KEY) {
    console.error('\n❌ ERROR: RESEND_API_KEY is not set. Cannot send live emails.');
    console.error('   Set it with: export RESEND_API_KEY=re_your_key_here\n');
    process.exit(1);
  }

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   COAILEAGUE COMPREHENSIVE EMAIL TEMPLATE FIRE TEST   ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
  console.log(`📧 Sending all templates to: ${TO}`);
  console.log(`📤 Default FROM: ${FROM}`);
  console.log(`🔑 RESEND_API_KEY: ${process.env.RESEND_API_KEY.substring(0, 8)}...\n`);

  // 1. Email Verification
  await send(
    '01 Email Verification',
    `Verify Your ${PLATFORM_NAME} Account`,
    verificationEmail(),
  );

  // 2. Password Reset
  await send(
    '02 Password Reset',
    `Reset Your ${PLATFORM_NAME} Password`,
    passwordResetEmail(),
    SUPPORT_FROM,
  );

  // 3. New Member Welcome
  await send(
    '03 New Member Welcome',
    `Welcome to ${PLATFORM_NAME}! 🎉`,
    newMemberWelcomeEmail(),
  );

  // 4. Employee Invitation
  await send(
    '04 Employee Invitation',
    `Join ${WORKSPACE_NAME} on CoAIleague`,
    employeeInvitationEmail(),
  );

  // 5. Onboarding Complete
  await send(
    '05 Onboarding Complete',
    `Onboarding Complete — Welcome to ${WORKSPACE_NAME}!`,
    onboardingCompleteEmail(),
  );

  // 6. Support Ticket Confirmation
  await send(
    '06 Support Ticket Confirmation',
    `Support Ticket #TKT-2026-4521 Received`,
    supportTicketEmail(),
    SUPPORT_FROM,
  );

  // 7. Report Delivery
  await send(
    '07 Report Delivery',
    `Report RPT-2026-0042 Is Ready`,
    reportDeliveryEmail(),
  );

  // 8. Employee Temporary Password
  await send(
    '08 Employee Temp Password',
    `Your Temporary Password — ${WORKSPACE_NAME}`,
    tempPasswordEmail(),
  );

  // 9. Manager Onboarding Notification
  await send(
    '09 Manager Onboarding Notification',
    `New Employee ${FULL_NAME} Added to ${WORKSPACE_NAME}`,
    managerOnboardingEmail(),
  );

  // 10. Client Welcome
  await send(
    '10 Client Welcome',
    `Welcome to ${WORKSPACE_NAME} Client Portal`,
    clientWelcomeEmail(),
  );

  // 11. Public Lead Welcome
  await send(
    '11 Public Lead Welcome',
    `Thank You for Your Interest in ${PLATFORM_NAME}`,
    publicLeadEmail(),
  );

  // 12. Organization Invitation
  await send(
    '12 Organization Invitation',
    `TXPS Investigations LLC — You're Invited to Join ${PLATFORM_NAME}`,
    orgInvitationEmail(),
  );

  // 13. Assisted Onboarding Handoff
  await send(
    '13 Assisted Onboarding Handoff',
    `Your ${WORKSPACE_NAME} Account Is Ready`,
    assistedHandoffEmail(),
  );

  // 14. Support Role Briefing
  await send(
    '14 Support Role Briefing',
    `Platform Support Role Assigned — ${PLATFORM_NAME}`,
    supportRoleBriefingEmail(),
  );

  // 15. Trinity AI Greeting
  const trinityGreeting = trinityGreetingEmail();
  await send(
    '15 Trinity AI Greeting',
    trinityGreeting.subject,
    trinityGreeting.html,
    TRINITY_FROM,
  );

  // 16. Staffing Request Dropped
  await send(
    '16 Staffing Request Dropped',
    `Staffing Request Update — ${WORKSPACE_NAME}`,
    staffingDroppedEmail(),
    TRINITY_FROM,
  );

  // 17. Staffing Onboarding Invitation
  const staffingOnboarding = staffingOnboardingEmail();
  await send(
    '17 Staffing Onboarding Invitation',
    staffingOnboarding.subject,
    staffingOnboarding.html,
    TRINITY_FROM,
  );

  // 18. Account Deactivation
  await send(
    '18 Account Deactivation',
    `Your ${PLATFORM_NAME} Account Has Been Deactivated`,
    accountDeactivationEmail(),
  );

  // 19. Subscription Welcome
  await send(
    '19 Subscription Welcome',
    `Subscription Activated — ${WORKSPACE_NAME} Pro`,
    subscriptionWelcomeEmail(),
  );

  // 20. Subscription Cancellation
  await send(
    '20 Subscription Cancellation',
    `Your ${PLATFORM_NAME} Subscription Has Been Cancelled`,
    subscriptionCancellationEmail(),
  );

  // 21. Payment Failed
  await send(
    '21 Payment Failed',
    `Action Required: Payment Failed for ${WORKSPACE_NAME}`,
    paymentFailedEmail(),
    SUPPORT_FROM,
  );

  // 22. Maintenance Notification
  await send(
    '22 Maintenance Notification',
    `${PLATFORM_NAME} Scheduled Maintenance — April 13, 2026`,
    maintenanceNotificationEmail(),
  );

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} passed / ${failed} failed / ${passed + failed} total`);
  console.log('══════════════════════════════════════════════════════════');

  if (failed > 0) {
    console.log('\n❌ FAILED TEMPLATES:');
    results.filter(r => r.error).forEach(r => console.log(`   • ${r.name}: ${r.error}`));
  }

  if (passed > 0) {
    console.log('\n✅ SUCCESSFULLY SENT TEMPLATES:');
    results.filter(r => r.id).forEach(r => console.log(`   • ${r.name} — id=${r.id}`));
  }

  console.log(`\n📥 Check ${TO} for all ${passed} delivered email(s).`);
  console.log('📊 Verify delivery in Resend dashboard: https://resend.com/emails\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
