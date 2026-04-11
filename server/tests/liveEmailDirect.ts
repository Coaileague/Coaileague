/**
 * DIRECT LIVE EMAIL FIRE — uses Resend API directly, no simulation wrapper
 * Sends 4 real emails:
 *   1. Trinity AI Greeting → txpsinvestigations@gmail.com (as winner)
 *   2. Trinity AI Greeting → jgriffin.tpsi@gmail.com (as loser — same shift)
 *   3. Staffing Request Dropped → jgriffin.tpsi@gmail.com
 *   4. Staffing Onboarding Invitation → txpsinvestigations@gmail.com
 *
 * Run: npx tsx server/tests/liveEmailDirect.ts
 */

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL || 'noreply@coaileague.com';

const WINNER = 'txpsinvestigations@gmail.com';
const LOSER  = 'jgriffin.tpsi@gmail.com';
const WIN_REF  = `SR-WIN-${Date.now().toString(36).toUpperCase()}`;
const LOSE_REF = `SR-LOSE-${Date.now().toString(36).toUpperCase()}`;
const CONF     = `CONF-${(Date.now() + 1).toString(36).toUpperCase()}`;
const WIN_ORG  = 'TXPS Investigations';
const LOSE_ORG = 'TPSI Security Solutions';

const JOB_SUMMARY = `The client is requesting one (1) unarmed security officer for a commercial warehouse site located at 4500 Industrial Blvd, Houston, TX 77023. The assignment is scheduled for March 15, 2026, from 6:00 PM to 6:00 AM (12-hour shift). The officer must have a valid Texas Level II unarmed security license and a clean background. The client's point of contact is Sarah Johnson, reachable at 832-555-1234.`;

// ── EMAIL HTML BUILDERS ───────────────────────────────────────────────────────

function trinityGreetingHtml(opts: {
  senderName: string;
  workspaceName: string;
  licenseNumber: string;
  referenceNumber: string;
  orgEmail: string;
  jobSummary: string;
}): string {
  return `
<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 50%,#1e40af 100%);padding:32px;border-radius:12px 12px 0 0;text-align:center;">
    <p style="color:#93c5fd;margin:0 0 6px 0;font-size:13px;letter-spacing:2px;text-transform:uppercase;">CoAIleague Staffing Network</p>
    <h1 style="color:white;margin:0;font-size:26px;font-weight:700;">${opts.workspaceName}</h1>
    <p style="color:#bfdbfe;margin:6px 0 0 0;font-size:13px;">License No. ${opts.licenseNumber}</p>
    <p style="color:#7dd3fc;margin:12px 0 0 0;font-size:14px;">Staffing Request Received</p>
  </div>
  <div style="padding:32px;background-color:#f8fafc;border-radius:0 0 12px 12px;">
    <p style="font-size:16px;color:#1e293b;margin:0 0 18px 0;">Hello ${opts.senderName},</p>
    <p style="color:#334155;font-size:14px;line-height:1.8;margin:0 0 20px 0;">
      Greetings. My name is <strong>Trinity</strong>, I am the staffing coordinator system for all CoAIleague security providers.
      I have received your request to staff the following assignment:
    </p>
    <div style="background-color:white;padding:22px;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:24px;border-left:4px solid #2563eb;">
      <p style="color:#1e40af;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin:0 0 12px 0;">Assignment Summary</p>
      <div style="color:#334155;font-size:14px;line-height:1.8;white-space:pre-line;">${opts.jobSummary}</div>
      <p style="color:#94a3b8;font-size:12px;margin:14px 0 0 0;">Reference Number: <strong style="color:#1e40af;">${opts.referenceNumber}</strong></p>
    </div>
    <p style="color:#334155;font-size:14px;line-height:1.8;margin:0 0 20px 0;">
      I will attempt to staff this with qualified, vetted security officers using the CoAIleague <strong>Officer Readiness Score</strong> — evaluating attendance, field behavior, experience, certifications, and client feedback.
    </p>
    <div style="background-color:#eff6ff;padding:20px;border-radius:10px;border:1px solid #bfdbfe;margin-bottom:24px;">
      <p style="color:#1e40af;font-size:14px;font-weight:700;margin:0 0 12px 0;">What Happens Next</p>
      <ul style="color:#334155;font-size:14px;padding-left:20px;margin:0 0 12px 0;line-height:1.8;">
        <li>If ${opts.workspaceName} can fulfill your request, you will receive a second email with your assignment confirmation number</li>
        <li>Access to your dedicated <strong>Client Portal</strong> — manage schedules, contracts, feedback, and staff changes in one place</li>
        <li>A <strong>dedicated case manager</strong> will be assigned and will contact you directly</li>
      </ul>
    </div>
    <p style="color:#334155;font-size:14px;line-height:1.7;margin:0 0 20px 0;">
      Thank you for trusting CoAIleague to staff your needs. I will be in touch shortly.
    </p>
    <p style="color:#1e293b;font-size:14px;margin:0;">Sincerely,</p>
    <p style="color:#1e40af;font-size:18px;font-weight:700;margin:6px 0 2px 0;font-style:italic;">Trinity</p>
    <p style="color:#64748b;font-size:12px;margin:0;">AI Staffing Coordinator — CoAIleague Network</p>
    <p style="color:#94a3b8;font-size:12px;margin:4px 0 0 0;">Reply to this email or contact: ${opts.orgEmail}</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 20px 0;">
    <p style="color:#94a3b8;font-size:11px;margin:0;text-align:center;">${opts.workspaceName} | CoAIleague Staffing Network | Ref: ${opts.referenceNumber}</p>
  </div>
</div>`;
}

function dropHtml(opts: { workspaceName: string; clientName: string; shiftDescription: string; referenceNumber: string }): string {
  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="color:white;margin:0;font-size:22px;">${opts.workspaceName}</h1>
    <p style="color:#93c5fd;margin:8px 0 0 0;font-size:14px;">Staffing Request Update</p>
  </div>
  <div style="padding:30px;background-color:#f8fafc;border-radius:0 0 12px 12px;">
    <p style="font-size:16px;color:#1e293b;margin:0 0 16px 0;">Hello ${opts.clientName},</p>
    <div style="background-color:#f1f5f9;padding:15px;border-radius:8px;margin-bottom:20px;border:1px solid #e2e8f0;">
      <p style="margin:0;font-size:13px;color:#475569;font-style:italic;">${opts.shiftDescription}</p>
    </div>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px 0;">
      Thank you for reaching out to <strong>${opts.workspaceName}</strong> regarding your staffing need. After a thorough review, we are unable to fulfill this particular request at this time.
    </p>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px 0;">
      We sincerely apologize for any inconvenience. We encourage you to reach out for future staffing needs — we would be glad to assist when availability aligns.
    </p>
    <div style="background-color:#eff6ff;padding:18px;border-radius:8px;border:1px solid #bfdbfe;margin-bottom:25px;">
      <p style="margin:0;color:#1e40af;font-size:14px;font-weight:600;">Need immediate assistance?</p>
      <p style="margin:8px 0 0 0;color:#3b82f6;font-size:13px;">Reply to this email — we will do our best to connect you with the right resources.</p>
    </div>
    <p style="color:#1e293b;font-size:14px;margin:0;">Warm regards,</p>
    <p style="color:#1e293b;font-size:14px;margin:4px 0 0 0;font-weight:600;">The ${opts.workspaceName} Team</p>
    <p style="color:#64748b;font-size:13px;margin:4px 0 0 0;font-style:italic;">Powered by CoAIleague</p>
    <p style="color:#64748b;font-size:13px;margin:8px 0 0 0;">Reference: ${opts.referenceNumber}</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:25px 0;">
    <p style="color:#94a3b8;font-size:11px;margin:0;text-align:center;">${opts.workspaceName} | Staffing Request Update | CoAIleague Platform</p>
  </div>
</div>`;
}

function onboardingHtml(opts: { clientName: string; workspaceName: string; referenceNumber: string; confirmationNumber: string; portalUrl: string }): string {
  return `
<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#065f46 0%,#047857 50%,#16a34a 100%);padding:32px;border-radius:12px 12px 0 0;text-align:center;">
    <p style="color:#a7f3d0;margin:0 0 6px 0;font-size:13px;letter-spacing:2px;text-transform:uppercase;">Assignment Confirmed</p>
    <h1 style="color:white;margin:0;font-size:26px;font-weight:700;">${opts.workspaceName}</h1>
    <p style="color:#6ee7b7;margin:10px 0 0 0;font-size:14px;">Your staffing request has been fulfilled</p>
  </div>
  <div style="padding:32px;background-color:#f8fafc;border-radius:0 0 12px 12px;">
    <p style="font-size:16px;color:#1e293b;margin:0 0 18px 0;">Hello ${opts.clientName},</p>
    <div style="background-color:#ecfdf5;padding:18px;border-radius:10px;border:1px solid #bbf7d0;margin-bottom:26px;">
      <p style="margin:0 0 6px 0;color:#065f46;font-size:15px;font-weight:700;">Your assignment is now staffed.</p>
      <p style="margin:0;color:#047857;font-size:13px;">Confirmation: <strong>${opts.confirmationNumber}</strong> &nbsp;|&nbsp; Reference: <strong>${opts.referenceNumber}</strong></p>
    </div>
    <div style="background-color:white;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:26px;overflow:hidden;">
      <div style="background-color:#1e3a5f;padding:12px 16px;"><p style="color:white;font-size:14px;font-weight:700;margin:0;">Assigned Officer</p></div>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background-color:#f1f5f9;">
          <th style="padding:10px 14px;font-size:12px;color:#64748b;text-align:left;">Officer Name</th>
          <th style="padding:10px 14px;font-size:12px;color:#64748b;text-align:left;">Role</th>
          <th style="padding:10px 14px;font-size:12px;color:#64748b;text-align:left;">Status</th>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-size:14px;color:#1e293b;font-weight:600;">Marcus T. Williams</td>
          <td style="padding:10px 14px;font-size:13px;color:#64748b;">Senior Security Officer</td>
          <td style="padding:10px 14px;font-size:13px;"><span style="background-color:#dcfce7;color:#065f46;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Verified</span></td>
        </tr>
      </table>
    </div>
    <div style="background-color:white;padding:20px;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:26px;">
      <p style="color:#1e293b;font-size:14px;font-weight:700;margin:0 0 14px 0;">Assignment Details</p>
      <p style="margin:6px 0;font-size:14px;color:#334155;"><strong>Position:</strong> Unarmed Security Officer (Level II)</p>
      <p style="margin:6px 0;font-size:14px;color:#334155;"><strong>Location:</strong> 4500 Industrial Blvd, Houston, TX 77023</p>
      <p style="margin:6px 0;font-size:14px;color:#334155;"><strong>Date:</strong> Saturday, March 15, 2026</p>
      <p style="margin:6px 0;font-size:14px;color:#334155;"><strong>Hours:</strong> 6:00 PM – 6:00 AM</p>
    </div>
    <div style="background-color:#1e3a5f;padding:26px;border-radius:12px;margin-bottom:26px;text-align:center;">
      <p style="color:#93c5fd;font-size:13px;margin:0 0 8px 0;letter-spacing:1px;text-transform:uppercase;">Next Step</p>
      <p style="color:white;font-size:18px;font-weight:700;margin:0 0 12px 0;">Access Your Client Portal</p>
      <p style="color:#bfdbfe;font-size:13px;line-height:1.6;margin:0 0 20px 0;">Complete your onboarding in minutes — contracts, ID upload, post orders, and all provider documents are organized and waiting for you.</p>
      <a href="${opts.portalUrl}" style="background-color:#2563eb;color:white;padding:14px 36px;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;display:inline-block;">Open Client Portal</a>
    </div>
    <p style="color:#1e293b;font-size:15px;font-weight:700;margin:0 0 10px 0;">Your Onboarding Checklist</p>
    <div style="background-color:white;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:26px;overflow:hidden;">
      <div style="padding:16px 20px;border-bottom:1px solid #f1f5f9;">
        <p style="margin:0 0 4px 0;font-size:14px;font-weight:700;color:#1e293b;">1. Sign the Security Services Agreement</p>
        <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">Digital signature required. Ready for you in the portal.</p>
      </div>
      <div style="padding:16px 20px;border-bottom:1px solid #f1f5f9;background:#fafafa;">
        <p style="margin:0 0 4px 0;font-size:14px;font-weight:700;color:#1e293b;">2. Upload Government-Issued ID</p>
        <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">Driver's license or government ID for the signing representative.</p>
      </div>
      <div style="padding:16px 20px;border-bottom:1px solid #f1f5f9;">
        <p style="margin:0 0 4px 0;font-size:14px;font-weight:700;color:#1e293b;">3. Set Up Post Orders</p>
        <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">Instructions your officers will follow on-site. Auto-distributed to all assigned staff.</p>
      </div>
      <div style="padding:16px 20px;background:#fafafa;">
        <p style="margin:0 0 4px 0;font-size:14px;font-weight:700;color:#1e293b;">4. Provider Documents — Auto-Prepared by Trinity</p>
        <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">W-9, Certificate of Insurance, Company License, and Officer Credential copies are already in your portal — no action needed.</p>
      </div>
    </div>
    <p style="color:#1e293b;font-size:14px;margin:0;">Sincerely,</p>
    <p style="color:#1e40af;font-size:18px;font-weight:700;margin:6px 0 2px 0;font-style:italic;">Trinity</p>
    <p style="color:#64748b;font-size:12px;margin:0;">AI Staffing Coordinator — CoAIleague Network</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 20px 0;">
    <p style="color:#94a3b8;font-size:11px;margin:0;text-align:center;">${opts.workspaceName} | Confirmation: ${opts.confirmationNumber} | CoAIleague Platform</p>
  </div>
</div>`;
}

// ── FIRE ─────────────────────────────────────────────────────────────────────

async function send(to: string, subject: string, html: string, label: string) {
  console.log(`Sending: ${label} → ${to}...`);
  try {
    const result = await resend.emails.send({ from: FROM, to: [to], subject, html }); // nds
    if ((result as any).error) {
      console.error(`  ❌ FAILED: ${JSON.stringify((result as any).error)}\n`);
    } else {
      console.log(`  ✅ MessageId: ${(result as any).data?.id ?? JSON.stringify(result)}\n`);
    }
  } catch (e: any) {
    console.error(`  ❌ Exception: ${e.message}\n`);
  }
}

async function main() {
  if (!process.env.RESEND_API_KEY) {
    console.error('ERROR: RESEND_API_KEY not set. Aborting.');
    process.exit(1);
  }
  console.log(`\n=== COAILEAGUE LIVE EMAIL FIRE ===`);
  console.log(`FROM: ${FROM}`);
  console.log(`Ref Winner: ${WIN_REF}  |  Ref Loser: ${LOSE_REF}  |  Conf: ${CONF}\n`);

  // 1. Trinity greeting → winner (txps)
  await send(
    WINNER,
    `Staffing Request Received — ${WIN_ORG} [Ref: ${WIN_REF}]`,
    trinityGreetingHtml({
      senderName: 'Sarah Johnson',
      workspaceName: WIN_ORG,
      licenseNumber: 'TX-SEC-2024-00891',
      referenceNumber: WIN_REF,
      orgEmail: 'staffing@txpsinvestigations.com',
      jobSummary: JOB_SUMMARY,
    }),
    `[1/4] Trinity Greeting → ${WIN_ORG}`
  );

  // 2. Trinity greeting → loser (jgriffin) — same shift, competing org
  await send(
    LOSER,
    `Staffing Request Received — ${LOSE_ORG} [Ref: ${LOSE_REF}]`,
    trinityGreetingHtml({
      senderName: 'Sarah Johnson',
      workspaceName: LOSE_ORG,
      licenseNumber: 'TX-SEC-2023-00442',
      referenceNumber: LOSE_REF,
      orgEmail: 'staffing@tpsisecurity.com',
      jobSummary: JOB_SUMMARY,
    }),
    `[2/4] Trinity Greeting → ${LOSE_ORG}`
  );

  // 3. Drop notification → loser (jgriffin)
  await send(
    LOSER,
    `Staffing Request Update — ${LOSE_ORG}`,
    dropHtml({
      workspaceName: LOSE_ORG,
      clientName: 'Sarah Johnson',
      shiftDescription: 'Unarmed security officer — 4500 Industrial Blvd, Houston TX 77023 — March 15, 2026 | 6:00 PM – 6:00 AM',
      referenceNumber: LOSE_REF,
    }),
    `[3/4] Staffing Request Dropped → ${LOSE_ORG}`
  );

  // 4. Onboarding invitation → winner (txps)
  await send(
    WINNER,
    `Your Assignment is Staffed — ${WIN_ORG} [${CONF}]`,
    onboardingHtml({
      clientName: 'Sarah Johnson',
      workspaceName: WIN_ORG,
      referenceNumber: WIN_REF,
      confirmationNumber: CONF,
      portalUrl: 'https://www.coaileague.com/portal',
    }),
    `[4/4] Onboarding Invitation → ${WIN_ORG}`
  );

  console.log('=== COMPLETE ===');
  console.log(`txpsinvestigations@gmail.com → Trinity greeting + Onboarding invite [${CONF}]`);
  console.log(`jgriffin.tpsi@gmail.com     → Trinity greeting + Drop notification`);
}

main().catch(console.error);
