/**
 * Trinity Welcome Email Service
 *
 * Sends Trinity-branded welcome emails to new users automatically.
 * Messages are customized per user type (tenant_owner, client, employee).
 *
 * Canonical sender: noreply@coaileague.com (per emailCore.ts sender policy)
 * Channel: email via NotificationDeliveryService (per CLAUDE.md §9 — NDS sole sender)
 */

import { NotificationDeliveryService } from './notificationDeliveryService';
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';

const log = createLogger('trinityWelcomeService');

export type TrinityWelcomeUserType = 'tenant_owner' | 'client' | 'employee';

export interface TrinityWelcomeParams {
  workspaceId: string;
  userId: string;
  userEmail: string;
  userType: TrinityWelcomeUserType;
  workspaceName: string;
  userName: string;
  customContext?: {
    tenantName?: string;
    shiftInfo?: string;
  };
}

/**
 * Send Trinity welcome email to a new user.
 * Non-fatal: logs on failure but never throws.
 */
export async function sendTrinityWelcomeEmail(
  params: TrinityWelcomeParams
): Promise<void> {
  const { workspaceId, userId, userEmail, userType, workspaceName, userName } = params;

  if (!userEmail) {
    log.warn('[TrinityWelcomeService] No email provided, skipping', { userId, userType });
    return;
  }

  log.info('[TrinityWelcomeService] Sending welcome email', {
    userId,
    userType,
    workspaceId,
    email: userEmail,
  });

  try {
    const emailContent = buildEmailContent(userType, {
      userName,
      workspaceName,
      tenantName: params.customContext?.tenantName || workspaceName,
      shiftInfo: params.customContext?.shiftInfo,
    });

    await NotificationDeliveryService.send({
      type: 'trinity_welcome_email',
      workspaceId: workspaceId || 'system',
      recipientUserId: userId,
      channel: 'email',
      subject: emailContent.subject,
      body: {
        to: userEmail,
        subject: emailContent.subject,
        html: emailContent.html,
      },
    });

    log.info('[TrinityWelcomeService] Welcome email sent successfully', {
      userId,
      userType,
      workspaceId,
    });
  } catch (error) {
    log.warn('[TrinityWelcomeService] Welcome email send failed (non-blocking):', {
      error: (error as any)?.message,
      userId,
      userType,
    });
  }
}

// ── Email content builders ────────────────────────────────────────────────

interface EmailBuildContext {
  userName: string;
  workspaceName: string;
  tenantName: string;
  shiftInfo?: string;
}

function buildEmailContent(
  userType: TrinityWelcomeUserType,
  context: EmailBuildContext
): { subject: string; html: string } {
  switch (userType) {
    case 'tenant_owner':
      return buildTenantWelcomeEmail(context);
    case 'client':
      return buildClientWelcomeEmail(context);
    case 'employee':
      return buildEmployeeWelcomeEmail(context);
    default:
      return buildGenericWelcomeEmail(context);
  }
}

const APP_URL = PLATFORM.appUrl;

function buildTenantWelcomeEmail(ctx: EmailBuildContext): { subject: string; html: string } {
  return {
    subject: `Welcome to ${PLATFORM.name}, ${ctx.userName}! Meet Trinity.`,
    html: `<!DOCTYPE html><html><head><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;margin:0;padding:0}
.container{max-width:600px;margin:0 auto;padding:20px}
.header{background:linear-gradient(135deg,#2563eb 0%,#1e40af 100%);color:#fff;padding:30px;text-align:center;border-radius:8px}
.header h1{margin:0;font-size:28px}
.content{background:#f9fafb;padding:30px;margin:20px 0;border-radius:8px}
.feature{background:#fff;padding:15px;margin:10px 0;border-left:4px solid #2563eb}
.feature strong{color:#2563eb}
.btn{display:inline-block;background:#2563eb;color:#fff;padding:12px 30px;text-decoration:none;border-radius:6px;margin:20px 0}
.footer{text-align:center;color:#6b7280;font-size:14px;margin-top:30px}
</style></head><body><div class="container">
<div class="header">
  <h1>Welcome to ${PLATFORM.name}, ${ctx.userName}!</h1>
  <p>Meet Trinity, your dedicated AI assistant</p>
</div>
<div class="content">
  <p>Hi ${ctx.userName},</p>
  <p>I'm <strong>Trinity</strong>, your dedicated AI assistant for <strong>${ctx.workspaceName}</strong>.</p>
  <p>Here's what I handle automatically, 24/7:</p>
  <div class="feature"><strong>Shift Scheduling &amp; Management</strong><br>Create shifts, assign staff, handle coverage requests. I notify your team automatically.</div>
  <div class="feature"><strong>Email Monitoring &amp; Intelligence</strong><br>I monitor your workspace email, extract key information, and route it to the right people.</div>
  <div class="feature"><strong>Payroll &amp; Compliance</strong><br>Calculate hours, process payroll, track licenses and certifications automatically.</div>
  <div class="feature"><strong>Team Coordination</strong><br>Message staff, track approvals, generate reports. Always coordinated.</div>
  <p><strong>Our Model:</strong> We run at 99% automation with 1% human intervention (when you need us).</p>
  <p><strong>Next Steps:</strong></p>
  <ol>
    <li>Check your workspace email inbox</li>
    <li>Configure your workspace settings</li>
    <li>Import your employee data (Excel, PDF, or CSV)</li>
    <li>Ask me anything anytime — just reply to any email!</li>
  </ol>
  <p style="text-align:center"><a href="${APP_URL}/dashboard" class="btn">Go to Dashboard</a></p>
</div>
<div class="footer">
  <p>Trinity &middot; Your ${PLATFORM.name} AI Assistant<br>
  <a href="${APP_URL}/help" style="color:#2563eb;text-decoration:none">Need Help?</a></p>
</div>
</div></body></html>`,
  };
}

function buildClientWelcomeEmail(ctx: EmailBuildContext): { subject: string; html: string } {
  return {
    subject: `Your Staffing Portal is Live! (Free, Powered by ${ctx.tenantName})`,
    html: `<!DOCTYPE html><html><head><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;margin:0;padding:0}
.container{max-width:600px;margin:0 auto;padding:20px}
.header{background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff;padding:30px;text-align:center;border-radius:8px}
.header h1{margin:0;font-size:28px}
.badge{display:inline-block;background:rgba(255,255,255,0.3);padding:8px 16px;border-radius:20px;margin:10px 0;font-size:14px}
.content{background:#f0fdf4;padding:30px;margin:20px 0;border-radius:8px}
.feature{background:#fff;padding:15px;margin:10px 0;border-left:4px solid #10b981}
.feature strong{color:#10b981}
.btn{display:inline-block;background:#10b981;color:#fff;padding:12px 30px;text-decoration:none;border-radius:6px;margin:20px 0}
.footer{text-align:center;color:#6b7280;font-size:14px;margin-top:30px}
</style></head><body><div class="container">
<div class="header">
  <h1>Your Portal is Live!</h1>
  <div class="badge">FREE &middot; Powered by ${ctx.tenantName}</div>
</div>
<div class="content">
  <p>Hi ${ctx.userName},</p>
  <p>Your staffing portal is ready to go — and it's <strong>100% FREE</strong>.</p>
  <p>This portal is powered by <strong>${ctx.tenantName}</strong> using ${PLATFORM.name}'s fully automated staffing platform.</p>
  <h3 style="color:#10b981">Here's How It Works:</h3>
  <div class="feature"><strong>Browse &amp; Request Shifts</strong><br>See available assignments that match your availability and skills.</div>
  <div class="feature"><strong>Instant Confirmations</strong><br>Trinity confirms your requests within seconds (not days).</div>
  <div class="feature"><strong>24/7 Support</strong><br>Message anytime. Trinity is always available to help.</div>
  <div class="feature"><strong>Automatic Payment</strong><br>Your pay is calculated automatically and paid on time.</div>
  <h3 style="color:#10b981">Why Is This Free?</h3>
  <p>${ctx.tenantName} chose ${PLATFORM.name}'s automation to manage their staffing. As a result, you get a premium staffing experience at zero cost.</p>
  <p><strong>How to Get Started:</strong></p>
  <ol>
    <li>Log into your portal</li>
    <li>Browse available shifts</li>
    <li>Request what works for you</li>
    <li>Get confirmed instantly</li>
  </ol>
  <p style="text-align:center"><a href="${APP_URL}/portal" class="btn">View Available Shifts</a></p>
  <p><strong>Questions?</strong> Trinity is available 24/7. Just reply to this email.</p>
</div>
<div class="footer">
  <p>${PLATFORM.name} &middot; Fully Automated Staffing<br>
  <a href="${APP_URL}/help" style="color:#10b981;text-decoration:none">Get Help</a></p>
</div>
</div></body></html>`,
  };
}

function buildEmployeeWelcomeEmail(ctx: EmailBuildContext): { subject: string; html: string } {
  return {
    subject: `Welcome to ${ctx.workspaceName}! Trinity is Your Shift Assistant.`,
    html: `<!DOCTYPE html><html><head><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;margin:0;padding:0}
.container{max-width:600px;margin:0 auto;padding:20px}
.header{background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);color:#fff;padding:30px;text-align:center;border-radius:8px}
.header h1{margin:0;font-size:28px}
.content{background:#fffbeb;padding:30px;margin:20px 0;border-radius:8px}
.feature{background:#fff;padding:15px;margin:10px 0;border-left:4px solid #f59e0b}
.feature strong{color:#f59e0b}
.btn{display:inline-block;background:#f59e0b;color:#fff;padding:12px 30px;text-decoration:none;border-radius:6px;margin:20px 0}
.footer{text-align:center;color:#6b7280;font-size:14px;margin-top:30px}
</style></head><body><div class="container">
<div class="header">
  <h1>Welcome to ${ctx.workspaceName}!</h1>
  <p>Trinity is Your Shift Assistant</p>
</div>
<div class="content">
  <p>Hi ${ctx.userName},</p>
  <p>Welcome to the <strong>${ctx.workspaceName}</strong> team!</p>
  <p>I'm <strong>Trinity</strong>, your AI assistant. I help with everything related to your shifts and team coordination.</p>
  <h3 style="color:#f59e0b">What I Can Help You With:</h3>
  <div class="feature"><strong>View Your Schedule</strong><br>See all your assigned shifts, get reminders, know who you're working with.</div>
  <div class="feature"><strong>Clock In/Out</strong><br>Quick check-in when you arrive, auto-track your hours, instant confirmation.</div>
  <div class="feature"><strong>Request Time Off</strong><br>Submit PTO or leave requests. Get instant decisions.</div>
  <div class="feature"><strong>Message Your Manager</strong><br>Ask shift questions anytime. Report issues. Get instant responses.</div>
  <div class="feature"><strong>Get Help 24/7</strong><br>Ask about policies, get guidance, request support anytime.</div>
  <p><strong>How to Get Started:</strong></p>
  <ol>
    <li>Check your schedule (in the app or via email)</li>
    <li>Confirm your availability</li>
    <li>Clock in on your first shift</li>
    <li>Message Trinity anytime (just reply to email)</li>
  </ol>
  <p style="text-align:center"><a href="${APP_URL}/dashboard" class="btn">View Your Schedule</a></p>
  <p>Questions? Just reply to this email or message Trinity in the app.</p>
</div>
<div class="footer">
  <p>Trinity &middot; Your Shift Assistant<br>
  <a href="${APP_URL}/help" style="color:#f59e0b;text-decoration:none">Get Help</a></p>
</div>
</div></body></html>`,
  };
}

function buildGenericWelcomeEmail(ctx: EmailBuildContext): { subject: string; html: string } {
  return {
    subject: `Welcome to ${ctx.workspaceName}!`,
    html: `<!DOCTYPE html><html><body>
<div style="max-width:600px;margin:0 auto;padding:20px;font-family:Arial,sans-serif">
  <h1>Welcome to ${ctx.workspaceName}!</h1>
  <p>Hi ${ctx.userName},</p>
  <p>Welcome to ${ctx.workspaceName}. We're excited to have you on board.</p>
  <p>I'm Trinity, your AI assistant. I'm here to help you with anything you need.</p>
  <p>Need help getting started? Just reply to this email!</p>
  <p>Trinity<br>Your ${PLATFORM.name} AI Assistant</p>
</div>
</body></html>`,
  };
}
