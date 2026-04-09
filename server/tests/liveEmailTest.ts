/**
 * LIVE EMAIL FIRE TEST
 * Sends real emails to txpsinvestigations@gmail.com (winner) and jgriffin.tpsi@gmail.com (loser)
 * Simulates: both orgs receive staffing request → Trinity greets both → jgriffin gets drop → txps gets onboarding invite
 * Run with: npx tsx server/tests/liveEmailTest.ts
 */

import { emailService } from '../services/emailService';

const WINNER_EMAIL = 'txpsinvestigations@gmail.com';
const LOSER_EMAIL = 'jgriffin.tpsi@gmail.com';

const WORKSPACE_ID = 'dev-acme-security-ws';
const WORKSPACE_NAME = 'TXPS Investigations';
const REF_WINNER = `SR-${Date.now().toString(36).toUpperCase()}`;
const REF_LOSER  = `SR-${(Date.now() + 1).toString(36).toUpperCase()}`;
const CONF_NUMBER = `CONF-${(Date.now() + 2).toString(36).toUpperCase()}`;

const JOB_SUMMARY = `The client is requesting one (1) unarmed security officer for a commercial warehouse site located at 4500 Industrial Blvd, Houston, TX 77023. The assignment is scheduled for March 15, 2026, from 6:00 PM to 6:00 AM (12-hour shift). The officer must have a valid Texas Level II unarmed security license and a clean background. The client's point of contact is Sarah Johnson, reachable at 832-555-1234.`;

async function main() {
  console.log('=== COAILEAGUE LIVE EMAIL FIRE TEST ===\n');

  // ── EMAIL 1A: Trinity AI Greeting → WINNER (txps) ──────────────────────────
  console.log(`[1/4] Sending Trinity AI Greeting → ${WINNER_EMAIL}...`);
  try {
    const r = await emailService.sendTrinityAIGreeting({
      workspaceId: WORKSPACE_ID,
      senderEmail: WINNER_EMAIL,
      senderName: 'Sarah Johnson',
      workspaceName: WORKSPACE_NAME,
      licenseNumber: 'TX-SEC-2024-00891',
      referenceNumber: REF_WINNER,
      orgEmail: 'staffing@txpsinvestigations.com',
      jobSummary: JOB_SUMMARY,
    });
    console.log(`   ✅ Sent — MessageId: ${(r as any).messageId ?? 'n/a'}\n`);
  } catch (e: any) {
    console.error(`   ❌ FAILED: ${e.message}\n`);
  }

  // ── EMAIL 1B: Trinity AI Greeting → LOSER (jgriffin) ──────────────────────
  console.log(`[2/4] Sending Trinity AI Greeting → ${LOSER_EMAIL}...`);
  try {
    const r = await emailService.sendTrinityAIGreeting({
      workspaceId: 'dev-jgriffin-ws',
      senderEmail: LOSER_EMAIL,
      senderName: 'Sarah Johnson',
      workspaceName: 'TPSI Security Solutions',
      licenseNumber: 'TX-SEC-2023-00442',
      referenceNumber: REF_LOSER,
      orgEmail: 'staffing@tpsisecurity.com',
      jobSummary: JOB_SUMMARY,
    });
    console.log(`   ✅ Sent — MessageId: ${(r as any).messageId ?? 'n/a'}\n`);
  } catch (e: any) {
    console.error(`   ❌ FAILED: ${e.message}\n`);
  }

  // ── EMAIL 2A: Drop Notification → LOSER (jgriffin) ────────────────────────
  console.log(`[3/4] Sending Staffing Request Dropped → ${LOSER_EMAIL}...`);
  try {
    const r = await emailService.sendStaffingRequestDropped({
      workspaceId: 'dev-jgriffin-ws',
      workspaceName: 'TPSI Security Solutions',
      clientEmail: LOSER_EMAIL,
      clientName: 'Sarah Johnson',
      shiftDescription: 'Unarmed security officer — 4500 Industrial Blvd, Houston TX 77023 — March 15, 2026 | 6:00 PM – 6:00 AM',
      referenceNumber: REF_LOSER,
    });
    console.log(`   ✅ Sent — MessageId: ${(r as any).messageId ?? 'n/a'}\n`);
  } catch (e: any) {
    console.error(`   ❌ FAILED: ${e.message}\n`);
  }

  // ── EMAIL 2B: Staffing Onboarding Invitation → WINNER (txps) ──────────────
  console.log(`[4/4] Sending Staffing Onboarding Invitation → ${WINNER_EMAIL}...`);
  try {
    const r = await emailService.sendStaffingOnboardingInvitation({
      workspaceId: WORKSPACE_ID,
      clientEmail: WINNER_EMAIL,
      clientName: 'Sarah Johnson',
      workspaceName: WORKSPACE_NAME,
      referenceNumber: REF_WINNER,
      confirmationNumber: CONF_NUMBER,
      portalUrl: 'https://coaileague.com/portal',
      signupUrl: 'https://coaileague.com/signup',
      shiftDetails: {
        location: '4500 Industrial Blvd, Houston, TX 77023',
        date: 'Saturday, March 15, 2026',
        startTime: '6:00 PM',
        endTime: '6:00 AM',
        positionType: 'Unarmed Security Officer (Level II)',
      },
      assignedOfficers: [
        { name: 'Marcus T. Williams', role: 'Senior Security Officer', credentialStatus: 'Verified' },
      ],
      nextSteps: {
        contractReady: true,
        dlUploadRequired: true,
        postOrdersRequired: true,
        providerDocsReady: true,
      },
    });
    console.log(`   ✅ Sent — MessageId: ${(r as any).messageId ?? 'n/a'}\n`);
  } catch (e: any) {
    console.error(`   ❌ FAILED: ${e.message}\n`);
  }

  console.log('=== DONE ===');
  console.log(`Winner (${WINNER_EMAIL}): received Trinity greeting [${REF_WINNER}] + onboarding invite [${CONF_NUMBER}]`);
  console.log(`Loser  (${LOSER_EMAIL}): received Trinity greeting [${REF_LOSER}] + drop notification`);
}

main().catch(console.error);
