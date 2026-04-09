/**
 * Development Communications & Activity Seed
 *
 * Populates Acme Security with rich, realistic simulated data across every
 * section so Trinity has real material to scan, automate, and respond to.
 *
 * Covers:
 *   - internal_emails (email threads between team members)
 *   - chat_messages (org channel conversations + DMs)
 *   - shift_chatroom_messages (active shift conversations)
 *   - support_tickets (helpdesk activity)
 *   - dispatch_incidents (CAD-style field incidents)
 *   - incident_reports (written officer incident reports)
 *   - orchestration_runs (Trinity's action history)
 *
 * IDEMPOTENT: ON CONFLICT DO NOTHING on all inserts
 * SENTINEL: skips if orchestration_runs already seeded for workspace
 * PRODUCTION GUARD: never runs when isProduction() returns true
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { typedCount, typedExec, typedQuery } from '../lib/typedSql';
import {
  internalEmails,
  chatMessages,
  shiftChatroomMessages,
  supportTickets,
  dispatchIncidents,
  incidentReports,
  orchestrationRuns,
} from '@shared/schema';

const WS = 'dev-acme-security-ws';

export async function runCommunicationsSeed(): Promise<{ success: boolean; message: string }> {
  const { isProduction } = await import('../lib/isProduction');
  if (isProduction()) {
    return { success: true, message: 'Skipped - production environment' };
  }

  // Sentinel: skip if we already seeded orchestration runs
  // CATEGORY C — Raw SQL retained: Count( | Tables: orchestration_runs | Verified: 2026-03-23
  const check = await typedCount(sql`
    SELECT COUNT(*)::int AS cnt FROM orchestration_runs
    WHERE workspace_id = ${WS} AND source = 'trinity'
  `);
  if (check > 5) {
    return { success: true, message: 'Communications already seeded' };
  }

  console.log('[CommsSeed] Seeding Acme communications and activity data...');

  // =========================================================================
  // 1. INTERNAL EMAILS — realistic threads between Marcus, Sarah, James
  // =========================================================================
  console.log('[CommsSeed] Inserting internal emails...');
  const now = new Date();
  const d = (daysAgo: number, hoursOffset = 0, minutesOffset = 0) =>
    new Date(now.getTime() - daysAgo * 86400000 - hoursOffset * 3600000 - minutesOffset * 60000).toISOString();

  const emails = [
    {
      id: 'comm-email-001', from_mailbox_id: 'mbx-owner-001',
      from_address: 'marcus.rivera@acme-security.coaileague.ai', from_name: 'Marcus Rivera',
      to_addresses: 'sarah.chen@acme-security.coaileague.ai', subject: 'Q1 Performance Review — Schedule for Next Week',
      body_text: 'Sarah,\n\nLet\'s schedule Q1 reviews for the field team. I want to start with Carlos Garcia and Diana Johnson — both have been standout performers. Can you block 45 minutes each on Tuesday afternoon?\n\nAlso, I noticed Kevin Brown has had three late clock-ins this month. Please pull his attendance report and include it in his review packet.\n\nThanks,\nMarcus',
      thread_id: 'thread-q1-review', sent_at: d(5, 2), folder_data: '{"sent": true, "read": false}',
    },
    {
      id: 'comm-email-002', from_mailbox_id: 'mbx-manager-001',
      from_address: 'sarah.chen@acme-security.coaileague.ai', from_name: 'Sarah Chen',
      to_addresses: 'marcus.rivera@acme-security.coaileague.ai', subject: 'Re: Q1 Performance Review — Schedule for Next Week',
      body_text: 'Marcus,\n\nBooked. Tuesday 2PM–2:45PM for Carlos and 3PM–3:45PM for Diana. I will email them separately with what to expect.\n\nOn Kevin — pulled his report. Three late clock-ins (Jan 22, Feb 4, Feb 27), all by 10–15 minutes. No call-outs. I would classify as a pattern that needs addressing but not a termination-level issue. Let me know if you want me to handle the coaching conversation or if you prefer to do it yourself.\n\nSarah',
      thread_id: 'thread-q1-review', in_reply_to: 'comm-email-001', sent_at: d(4, 22), folder_data: '{"inbox": true, "read": true}',
    },
    {
      id: 'comm-email-003', from_mailbox_id: 'mbx-manager-001',
      from_address: 'sarah.chen@acme-security.coaileague.ai', from_name: 'Sarah Chen',
      to_addresses: 'marcus.rivera@acme-security.coaileague.ai,james.washington@acme-security.coaileague.ai',
      subject: 'Pinnacle Tower Contract Renewal — Client Meeting Notes',
      body_text: 'Marcus, James,\n\nHad my call with Pinnacle Tower property manager (Bill Foster) this morning. Summary:\n\n• They are happy overall. 98% coverage maintained last quarter.\n• Want to add a third post on weekend evenings — currently unguarded loading dock.\n• Bill asked about camera monitoring capability. I told him that is an add-on we can quote separately.\n• Contract renewal is April 30. They will sign at current rates if we can confirm the loading dock coverage.\n\nAction items: James — can you scope out what adding a loading dock post looks like operationally? Need headcount, hours, and post order template. I will draft the renewal language once I hear from you.\n\nSarah',
      thread_id: 'thread-pinnacle-renewal', sent_at: d(3, 4), folder_data: '{"sent": true, "read": false}',
    },
    {
      id: 'comm-email-004', from_mailbox_id: 'mbx-manager-002',
      from_address: 'james.washington@acme-security.coaileague.ai', from_name: 'James Washington',
      to_addresses: 'sarah.chen@acme-security.coaileague.ai', subject: 'Re: Pinnacle Tower Contract Renewal — Client Meeting Notes',
      body_text: 'Sarah,\n\nScoped it out. Loading dock post: Fri–Sun, 10PM–6AM (8 hrs/night). Three shifts = 24 hrs/week. At our current field rate that\'s roughly $1,920/week billed. We need one dedicated officer minimum, ideally two rotating so neither hits OT. I can assign Angela Davis and Michael Thompson who already know the site.\n\nPost order template will take me a day — I want to walk the dock first. Have a site walk booked for Thursday at 5PM.\n\nJames',
      thread_id: 'thread-pinnacle-renewal', in_reply_to: 'comm-email-003', sent_at: d(3, 1), folder_data: '{"inbox": true, "read": true}',
    },
    {
      id: 'comm-email-005', from_mailbox_id: 'mbx-manager-001',
      from_address: 'sarah.chen@acme-security.coaileague.ai', from_name: 'Sarah Chen',
      to_addresses: 'marcus.rivera@acme-security.coaileague.ai', subject: 'URGENT: No-Show — Lone Star Medical Saturday Night',
      body_text: 'Marcus,\n\nRobert Williams did not show for his 10PM shift at Lone Star Medical last night. No call. We scrambled and got David Wilson to cover on short notice — paid him at OT rate.\n\nTriple-checked — Robert has no PTO request in the system. I have tried calling twice, no answer. This is his second no-show in 60 days.\n\nRecommendation: Issue a written warning and place him on probation. If he no-call again, termination. I want your sign-off before I send the paperwork.\n\nSarah',
      thread_id: 'thread-ncns-robert', sent_at: d(2, 6), folder_data: '{"inbox": true, "read": false}',
    },
    {
      id: 'comm-email-006', from_mailbox_id: 'mbx-owner-001',
      from_address: 'marcus.rivera@acme-security.coaileague.ai', from_name: 'Marcus Rivera',
      to_addresses: 'sarah.chen@acme-security.coaileague.ai', subject: 'Re: URGENT: No-Show — Lone Star Medical Saturday Night',
      body_text: 'Sarah — approved. Issue the written warning. Loop in HR on the probation paperwork.\n\nDo we have his emergency contact? Try that before we escalate further. Something may have happened.\n\nAlso — we need to review our no-show coverage protocol. David covering on OT is expensive. Can Trinity flag available off-duty officers automatically next time? James mentioned the platform can do this now.\n\nMarcus',
      thread_id: 'thread-ncns-robert', in_reply_to: 'comm-email-005', sent_at: d(2, 5), folder_data: '{"sent": true, "read": false}',
    },
    {
      id: 'comm-email-007', from_mailbox_id: 'mbx-manager-001',
      from_address: 'sarah.chen@acme-security.coaileague.ai', from_name: 'Sarah Chen',
      to_addresses: 'dev-emp-003@acme-security.coaileague.ai', subject: 'Written Warning — Attendance Policy Violation',
      body_text: 'Robert,\n\nThis email serves as your official written warning for failure to report to your scheduled shift (Lone Star Medical, Saturday March 2, 10PM) without notice.\n\nThis is your second attendance violation in 60 days. Per company policy, you are now on a 90-day probationary period effective immediately. Any further attendance violations during this period may result in termination.\n\nPlease respond to confirm receipt of this notice and to provide an explanation for the absence.\n\nSarah Chen\nOperations Manager, Acme Security Services',
      thread_id: 'thread-warning-robert', sent_at: d(2, 3), folder_data: '{"sent": true, "read": false}',
    },
    {
      id: 'comm-email-008', from_mailbox_id: 'mbx-manager-001',
      from_address: 'sarah.chen@acme-security.coaileague.ai', from_name: 'Sarah Chen',
      to_addresses: 'all-officers@acme-security.coaileague.ai', subject: 'March Schedule Published — Please Confirm Your Shifts',
      body_text: 'Team,\n\nThe March schedule is now published in CoAIleague. Please log in, review your assigned shifts, and confirm each one within 48 hours.\n\nKey reminders:\n• GPS clock-in is required for all posts. No GPS = flagged absence.\n• Uniform inspection every Monday for active posts.\n• Lone Star Medical night shift: pair with a buddy if possible, or notify dispatch hourly.\n\nIf you have a conflict with any assigned shift, contact James Washington immediately — not the day before.\n\nThank you,\nSarah',
      thread_id: 'thread-march-schedule', sent_at: d(7), folder_data: '{"sent": true, "read": false}',
    },
    {
      id: 'comm-email-009', from_mailbox_id: 'mbx-manager-002',
      from_address: 'james.washington@acme-security.coaileague.ai', from_name: 'James Washington',
      to_addresses: 'marcus.rivera@acme-security.coaileague.ai', subject: 'OT Exposure This Week — Review Before Approving Hours',
      body_text: 'Marcus,\n\nHeads up: three officers are approaching OT this week based on scheduled hours vs actual:\n\n1. Carlos Garcia — 38.5 hrs scheduled, clocked 41.2 already (Monday–Thursday). Do NOT add more this week.\n2. Michael Thompson — 37 hrs scheduled, 39 actual. Same.\n3. Diana Johnson — 40 hrs exactly. Will hit OT if she works any extras.\n\nI\'ve flagged them all in the system and blocked further scheduling for this week. But I need your approval to move their pending open shifts to Robert Williams and Kevin Brown instead.\n\nJames',
      thread_id: 'thread-ot-exposure', sent_at: d(1, 3), folder_data: '{"inbox": true, "read": false}',
    },
    {
      id: 'comm-email-010', from_mailbox_id: 'mbx-manager-001',
      from_address: 'sarah.chen@acme-security.coaileague.ai', from_name: 'Sarah Chen',
      to_addresses: 'all-managers@acme-security.coaileague.ai', subject: 'Drug Testing Reminder — Annual Random Selection Due March 15',
      body_text: 'James, Marcus,\n\nAnnual random drug testing cycle is due March 15th per our contract requirements with Lone Star Medical and Pinnacle Tower.\n\nRequired testing rate: 10% of active field staff per client requirement. That means roughly 6 officers.\n\nI will coordinate with Trinity to generate the random selection list. Testing site: LabCorp at 5500 S Hulen St, Fort Worth. I will send appointment confirmations to selected officers by Friday.\n\nSelected officers who fail to appear or test positive will be placed on immediate administrative leave.\n\nSarah',
      thread_id: 'thread-drug-testing', sent_at: d(4), folder_data: '{"sent": true, "read": false}',
    },
    {
      id: 'comm-email-011', from_mailbox_id: 'mbx-manager-001',
      from_address: 'sarah.chen@acme-security.coaileague.ai', from_name: 'Sarah Chen',
      to_addresses: 'marcus.rivera@acme-security.coaileague.ai', subject: 'Invoice COAI-ACME-2026-0289 — Lone Star Medical Dispute',
      body_text: 'Marcus,\n\nLone Star Medical is disputing $480 on invoice COAI-ACME-2026-0289. Their AP contact (Tanya Morris) claims we over-billed by 4 hours on the Feb 28 shift due to an early clock-out that "wasn\'t approved."\n\nI pulled the time entry — Angela clocked out at 5:52AM (shift ends at 6AM), 8 minutes early. The $480 dispute is not mathematically justified by 8 minutes. The discrepancy might be on their end.\n\nDo you want me to hold the invoice or reply with the time entry detail?\n\nSarah',
      thread_id: 'thread-invoice-dispute', sent_at: d(6), folder_data: '{"inbox": true, "read": false}',
    },
    {
      id: 'comm-email-012', from_mailbox_id: 'mbx-manager-002',
      from_address: 'james.washington@acme-security.coaileague.ai', from_name: 'James Washington',
      to_addresses: 'sarah.chen@acme-security.coaileague.ai,marcus.rivera@acme-security.coaileague.ai',
      subject: 'Certification Expiry Alerts — 4 Officers Need Renewal',
      body_text: 'Team,\n\nCertification review completed. Four officers have expiring certifications in the next 60 days:\n\n1. Kevin Brown — Texas Guard Card expires April 3 (28 days)\n2. Lisa Anderson — CPR/AED certification expires March 22 (17 days) — CRITICAL for Lone Star Medical post\n3. Michael Thompson — CPR/AED expires March 29 (24 days)\n4. David Wilson — First Aid expires April 15 (40 days)\n\nLisa and Michael\'s CPR certs are client-required for medical facility assignments. If they expire before renewal, I have to pull them from Lone Star Medical.\n\nI\'ve already emailed all four officers the renewal info. Marcus — please advise if we should cover renewal fees as a company expense.\n\nJames',
      thread_id: 'thread-cert-expiry', sent_at: d(1), folder_data: '{"inbox": true, "read": false}',
    },
  ];

  for (const e of emails) {
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(internalEmails).values({
      id: e.id,
      workspaceId: WS,
      fromMailboxId: e.from_mailbox_id,
      fromAddress: e.from_address,
      fromName: e.from_name,
      toAddresses: e.to_addresses,
      subject: e.subject,
      bodyText: e.body_text,
      threadId: e.thread_id,
      inReplyTo: (e as any).in_reply_to || null,
      sentAt: sql`${e.sent_at}::timestamptz`,
      folderData: JSON.parse(e.folder_data),
      isInternal: true,
      enhancedByTrinity: false,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();
  }

  // =========================================================================
  // 2. CHAT MESSAGES — bulk up existing room conversations
  // =========================================================================
  console.log('[CommsSeed] Inserting chat messages...');

  const chatMsgs = [
    // --- General channel ---
    { id: 'comm-msg-g010', conv: 'conv-room-general', sid: 'dev-manager-001', sname: 'Sarah Chen', stype: 'user', msg: 'Team announcement: effective immediately, all post orders must be acknowledged in the app before your shift starts. No more paper copies in the field. Any issues, see James.', ts: d(6, 2) },
    { id: 'comm-msg-g011', conv: 'conv-room-general', sid: 'dev-emp-001', sname: 'Carlos Garcia', stype: 'user', msg: 'Copy that. Quick question — do post orders auto-expire after the shift or do they stay active?', ts: d(6, 1) },
    { id: 'comm-msg-g012', conv: 'conv-room-general', sid: 'dev-manager-002', sname: 'James Washington', stype: 'user', msg: 'They remain in your history but the active acknowledgment window closes at shift end. Trinity flags anyone who did not acknowledge before clock-in.', ts: d(6, 0) },
    { id: 'comm-msg-g013', conv: 'conv-room-general', sid: 'dev-emp-004', sname: 'Elena Martinez', stype: 'user', msg: 'Is anyone else having GPS signal issues at the Oakwood parking structure? It loses signal on levels B2 and below.', ts: d(5, 5) },
    { id: 'comm-msg-g014', conv: 'conv-room-general', sid: 'dev-manager-002', sname: 'James Washington', stype: 'user', msg: 'Elena — known issue at Oakwood. Clock in from the street level or the lobby before going underground. IT is aware. Use manual log for B2 rounds.', ts: d(5, 4) },
    { id: 'comm-msg-g015', conv: 'conv-room-general', sid: 'dev-owner-001', sname: 'Marcus Rivera', stype: 'user', msg: 'New policy starting next week: all field officers must complete their Daily Activity Report (DAR) before clocking out. Trinity will flag incomplete DARs and hold the time entry for manager review.', ts: d(4, 3) },
    { id: 'comm-msg-g016', conv: 'conv-room-general', sid: 'dev-emp-009', sname: 'David Wilson', stype: 'user', msg: 'Marcus — are we expected to complete DARs for short shifts under 4 hours too?', ts: d(4, 2) },
    { id: 'comm-msg-g017', conv: 'conv-room-general', sid: 'dev-owner-001', sname: 'Marcus Rivera', stype: 'user', msg: 'David — yes, all shifts regardless of length. It only takes 3 minutes. If you see nothing to report, write "All clear, no incidents during patrol" and that is sufficient.', ts: d(4, 2) },
    { id: 'comm-msg-g018', conv: 'conv-room-general', sid: 'dev-emp-005', sname: 'Michael Thompson', stype: 'user', msg: 'Just a heads up — saw a group of unauthorized individuals in the Pinnacle Tower loading area around 11PM last night. Escorted them out, documented in DAR. No issues but something to watch.', ts: d(3, 2) },
    { id: 'comm-msg-g019', conv: 'conv-room-general', sid: 'dev-manager-001', sname: 'Sarah Chen', stype: 'user', msg: 'Michael — good catch. I am adding a note to Pinnacle Tower\'s post orders to flag the loading area as a high-attention zone. Please let the next shift know verbally too.', ts: d(3, 1) },
    { id: 'comm-msg-g020', conv: 'conv-room-general', sid: 'trinity-bot', sname: 'Trinity', stype: 'bot', msg: 'Morning brief ready. Today: 12 shifts active, 2 requiring confirmation (Carlos Garcia, Lisa Anderson). Invoice COAI-ACME-2026-0289 is pending client response on a dispute. Kevin Brown\'s guard card expires in 28 days — renewal reminder sent.', ts: d(0, 8) },

    // --- Operations channel ---
    { id: 'comm-msg-o010', conv: 'conv-room-ops', sid: 'dev-manager-002', sname: 'James Washington', stype: 'user', msg: 'Shift coverage update for tonight: Angela Davis confirmed at Lone Star Medical (10PM–6AM). Kevin Brown confirmed at Oakwood (2PM–10PM). Both GPS-verified and post orders acknowledged.', ts: d(0, 12) },
    { id: 'comm-msg-o011', conv: 'conv-room-ops', sid: 'dev-emp-007', sname: 'Kevin Brown', stype: 'user', msg: 'East gate camera at Oakwood is back online. IT came by this morning and replaced the unit. Running manual visual checks every 30 min until I confirm it is stable.', ts: d(0, 10) },
    { id: 'comm-msg-o012', conv: 'conv-room-ops', sid: 'dev-manager-002', sname: 'James Washington', stype: 'user', msg: 'Kevin — good. Log those manual checks in your DAR with timestamps. If it goes offline again, escalate immediately.', ts: d(0, 9) },
    { id: 'comm-msg-o013', conv: 'conv-room-ops', sid: 'dev-emp-001', sname: 'Carlos Garcia', stype: 'user', msg: 'Arrived at Pinnacle Tower. Starting patrol. Elevator 3 is still out of service on the 12th floor — noted this in last week\'s DAR too. Building maintenance has not addressed it.', ts: d(1, 6) },
    { id: 'comm-msg-o014', conv: 'conv-room-ops', sid: 'dev-manager-002', sname: 'James Washington', stype: 'user', msg: 'Carlos — I will escalate that to Pinnacle property management. Second time you flagged it. Document in today\'s DAR and send me a screenshot so I can include it in the client note.', ts: d(1, 5) },
    { id: 'comm-msg-o015', conv: 'conv-room-ops', sid: 'dev-emp-006', sname: 'Angela Davis', stype: 'user', msg: 'Lone Star Medical: patient disturbance in ER waiting room earlier tonight. Nurse asked me to assist. I de-escalated verbally, patient was calm within 10 minutes. No police needed. Filing incident report now.', ts: d(2, 1) },
    { id: 'comm-msg-o016', conv: 'conv-room-ops', sid: 'dev-manager-002', sname: 'James Washington', stype: 'user', msg: 'Angela — good job on the de-escalation. Make sure the incident report captures witness names (the nurse who asked for help) and timeline to the minute. Medical facility incidents get extra scrutiny.', ts: d(2, 0) },
    { id: 'comm-msg-o017', conv: 'conv-room-ops', sid: 'trinity-bot', sname: 'Trinity', stype: 'bot', msg: 'Ops notice: 2 open shifts for this weekend remain unassigned — Saturday night Pinnacle Tower (10PM–6AM) and Sunday morning Lone Star Medical (6AM–2PM). Carlos and Diana have been offered but not confirmed. Escalating to James for manual assignment.', ts: d(0, 7) },

    // --- Payroll & Finance channel ---
    { id: 'comm-msg-p001', conv: 'conv-room-payroll', sid: 'dev-manager-001', sname: 'Sarah Chen', stype: 'user', msg: 'Payroll for March 1–15 is drafted and pending Marcus\'s final approval. Total gross: $38,240. Fourteen employees in this cycle. One exception — David Wilson has 3.5 hours of disputed time that I have flagged for manager review before including.', ts: d(3, 4) },
    { id: 'comm-msg-p002', conv: 'conv-room-payroll', sid: 'dev-owner-001', sname: 'Marcus Rivera', stype: 'user', msg: 'Sarah — approved. Include David\'s 3.5 hours pending James\'s review. We can do a correction on the next run if it comes back disputed. Do not hold the whole payroll for one exception.', ts: d(3, 3) },
    { id: 'comm-msg-p003', conv: 'conv-room-payroll', sid: 'dev-manager-001', sname: 'Sarah Chen', stype: 'user', msg: 'Processed. Direct deposits will hit on March 17th. Reminder: 1099 contractors (Lisa Anderson, Robert Williams, David Wilson) will receive their statements by end of March per IRS deadline.', ts: d(3, 2) },
    { id: 'comm-msg-p004', conv: 'conv-room-payroll', sid: 'dev-emp-009', sname: 'David Wilson', stype: 'user', msg: 'Hi Sarah — I noticed my last paycheck was $120 short. I worked 4 extra hours covering for the Oakwood no-show on Feb 14 and I do not think those hours were included.', ts: d(2, 6) },
    { id: 'comm-msg-p005', conv: 'conv-room-payroll', sid: 'dev-manager-001', sname: 'Sarah Chen', stype: 'user', msg: 'David — checking now. If that coverage shift was logged under the wrong workspace period, it may have been processed in the Feb 16–28 cycle instead. Let me pull your time entries. I will get back to you by end of day.', ts: d(2, 5) },
    { id: 'comm-msg-p006', conv: 'conv-room-payroll', sid: 'trinity-bot', sname: 'Trinity', stype: 'bot', msg: 'Payroll insight: March 16–31 estimated gross $41,800 based on current scheduled hours. Projected OT exposure: Carlos Garcia (+4.5 hrs over 40), Michael Thompson (+3 hrs). Recommend reviewing their week-3 schedule.', ts: d(1, 8) },

    // --- Scheduling channel ---
    { id: 'comm-msg-s001', conv: 'conv-room-scheduling', sid: 'dev-manager-002', sname: 'James Washington', stype: 'user', msg: 'Schedule for March 16–22 has been published. 47 shifts across 5 clients. Notable: Pinnacle Tower added loading dock coverage starting March 17 (Friday night, 10PM–6AM). Angela Davis primary, Kevin Brown backup.', ts: d(4, 2) },
    { id: 'comm-msg-s002', conv: 'conv-room-scheduling', sid: 'dev-emp-005', sname: 'Michael Thompson', stype: 'user', msg: 'James — I cannot cover the Sunday March 20 morning shift at Lone Star Medical. I have a family obligation. I requested PTO but the app is not letting me submit because it says I am in a "critical coverage window". Can you help?', ts: d(4, 1) },
    { id: 'comm-msg-s003', conv: 'conv-room-scheduling', sid: 'dev-manager-002', sname: 'James Washington', stype: 'user', msg: 'Michael — that flag is correct, you are solo on that shift with no backup listed. Let me find coverage before I approve the PTO. Do not worry, I will not leave you jammed up. Expect a response by 5PM.', ts: d(4, 0) },
    { id: 'comm-msg-s004', conv: 'conv-room-scheduling', sid: 'dev-manager-002', sname: 'James Washington', stype: 'user', msg: 'Michael — Diana Johnson agreed to pick up your March 20 morning. PTO approved. Please make sure Diana has the post orders for Lone Star Medical. She has not worked that site in 6 months.', ts: d(3, 22) },
    { id: 'comm-msg-s005', conv: 'conv-room-scheduling', sid: 'trinity-bot', sname: 'Trinity', stype: 'bot', msg: 'Schedule intelligence: 3 open shifts remain for March 23–29. I ran a match analysis — best fit assignments: Open Shift #1 (Lone Star Medical, Tuesday night) → Robert Williams (if warning resolved); Open Shift #2 (Pinnacle Tower, Wednesday day) → Lisa Anderson; Open Shift #3 (Oakwood, Thursday evening) → Carlos Garcia. Awaiting manager approval.', ts: d(0, 9) },
    { id: 'comm-msg-s006', conv: 'conv-room-scheduling', sid: 'dev-manager-002', sname: 'James Washington', stype: 'user', msg: 'Trinity — approved on Lisa and Carlos. Hold on Robert pending the warning resolution. Assign an extra float shift to Kevin Brown for Tuesday night instead.', ts: d(0, 8) },

    // --- Alerts & Compliance channel ---
    { id: 'comm-msg-a001', conv: 'conv-room-alerts', sid: 'trinity-bot', sname: 'Trinity', stype: 'bot', msg: 'COMPLIANCE ALERT: Kevin Brown\'s Texas Guard Card (License #TX-2019-441209) expires April 3 — 28 days from today. All assignments requiring armed or licensed security will need to be vacated after April 2 if renewal is not confirmed. Renewal link and instructions sent to Kevin directly.', ts: d(0, 7) },
    { id: 'comm-msg-a002', conv: 'conv-room-alerts', sid: 'trinity-bot', sname: 'Trinity', stype: 'bot', msg: 'COMPLIANCE ALERT: Lisa Anderson\'s CPR/AED certification expires March 22 — 15 days. Lone Star Medical REQUIRES current CPR certification for all assigned officers per the MSA. If not renewed by March 21, Lisa must be removed from Lone Star Medical assignments. Renewal class options sent to Lisa.', ts: d(0, 6) },
    { id: 'comm-msg-a003', conv: 'conv-room-alerts', sid: 'dev-manager-001', sname: 'Sarah Chen', stype: 'user', msg: 'Trinity — acknowledged. I have already emailed both Kevin and Lisa. Kevin has an appointment with DPS on March 18. Lisa is signed up for a CPR class on March 15. Both should be fine before expiry.', ts: d(0, 5) },
    { id: 'comm-msg-a004', conv: 'conv-room-alerts', sid: 'trinity-bot', sname: 'Trinity', stype: 'bot', msg: 'PAYROLL ALERT: Invoice COAI-ACME-2026-0289 (Lone Star Medical, $12,480) is 14 days past due. Client contact: Tanya Morris (AP). Last contact: March 1. Recommend follow-up call before March 10. Net cash impact if delayed further: $12,480 cash gap projected for March 20 payroll.', ts: d(0, 4) },
    { id: 'comm-msg-a005', conv: 'conv-room-alerts', sid: 'trinity-bot', sname: 'Trinity', stype: 'bot', msg: 'ATTENDANCE ALERT: Robert Williams has been flagged for a second no-show. Written warning issued by Sarah Chen (March 4). Monitoring active. If another incident occurs within 90 days, Trinity will automatically flag for termination review and initiate replacement hiring pipeline.', ts: d(2, 0) },

    // --- DM: Angela and Michael ---
    { id: 'comm-dm-am001', conv: 'conv-dm-angela-michael', sid: 'dev-emp-006', sname: 'Angela Davis', stype: 'user', msg: 'Michael — are you doing the Lone Star handoff tomorrow at 6AM? I want to brief you on the patient disturbance from last night.', ts: d(1, 7), is_private: true, recipient: 'dev-emp-005' },
    { id: 'comm-dm-am002', conv: 'conv-dm-angela-michael', sid: 'dev-emp-005', sname: 'Michael Thompson', stype: 'user', msg: 'Yes I have the 6AM. Tell me everything — especially if ER staff flagged any individuals. I want to keep an eye out.', ts: d(1, 6), is_private: true, recipient: 'dev-emp-006' },
    { id: 'comm-dm-am003', conv: 'conv-dm-angela-michael', sid: 'dev-emp-006', sname: 'Angela Davis', stype: 'user', msg: 'One male, mid-40s, white shirt, was agitated about wait time. He did not threaten anyone but was loud. Security camera caught him leaving at 1:15AM. I filed the incident report. The ER charge nurse (Brenda) was great about it — very calm.', ts: d(1, 5), is_private: true, recipient: 'dev-emp-005' },
    { id: 'comm-dm-am004', conv: 'conv-dm-angela-michael', sid: 'dev-emp-005', sname: 'Michael Thompson', stype: 'user', msg: 'Got it. I will keep an eye on the ER entrance and check with Brenda when I arrive. Thanks for the brief.', ts: d(1, 4), is_private: true, recipient: 'dev-emp-006' },

    // --- DM: Carlos and James ---
    { id: 'comm-dm-cj001', conv: 'conv-dm-carlos-james', sid: 'dev-emp-001', sname: 'Carlos Garcia', stype: 'user', msg: 'James, I wanted to ask — any chance of a pay rate review this quarter? I have been with Acme 5 years in June and I have not had an increase since 2023.', ts: d(3, 4), is_private: true, recipient: 'dev-manager-002' },
    { id: 'comm-dm-cj002', conv: 'conv-dm-carlos-james', sid: 'dev-manager-002', sname: 'James Washington', stype: 'user', msg: 'Carlos — absolutely a fair ask. Your performance scores have been excellent. I will bring it up with Marcus in our next review meeting. No promises but I will advocate for you. Q1 reviews are next week — perfect timing.', ts: d(3, 3), is_private: true, recipient: 'dev-emp-001' },
    { id: 'comm-dm-cj003', conv: 'conv-dm-carlos-james', sid: 'dev-emp-001', sname: 'Carlos Garcia', stype: 'user', msg: 'Thank you James, I really appreciate it. I am committed to Acme and I just want to make sure that shows.', ts: d(3, 2), is_private: true, recipient: 'dev-manager-002' },
  ];

  for (const m of chatMsgs) {
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(chatMessages).values({
      id: m.id,
      workspaceId: WS,
      conversationId: m.conv,
      senderId: m.sid,
      senderName: m.sname,
      senderType: m.stype,
      message: m.msg,
      messageType: 'text',
      isPrivateMessage: (m as any).is_private || false,
      recipientId: (m as any).recipient || null,
      createdAt: sql`${m.ts}::timestamptz`,
      updatedAt: sql`${m.ts}::timestamptz`,
    }).onConflictDoNothing();
  }

  // =========================================================================
  // 3. SHIFT CHATROOM MESSAGES — active shift conversations
  // =========================================================================
  console.log('[CommsSeed] Inserting shift chatroom messages...');

  // Get existing chatroom IDs
  // CATEGORY C — Raw SQL retained: LIMIT | Tables: shift_chatrooms | Verified: 2026-03-23
  const rooms = await typedQuery(sql`
    SELECT id, name FROM shift_chatrooms WHERE workspace_id = ${WS} LIMIT 10
  `);
  const roomIds = (rooms as any[]).map(r => r.id);

  if (roomIds.length > 0) {
    const room0 = roomIds[0];
    const room1 = roomIds[1] || roomIds[0];

    const shiftMsgs = [
      { id: 'comm-scm-001', room: room0, uid: 'dev-emp-001', content: 'Arrived at Pinnacle Tower. Clocking in now. Lobby is clear, all access points secure.', ts: d(0, 8) },
      { id: 'comm-scm-002', room: room0, uid: 'trinity-bot', content: 'Carlos — post orders for today\'s shift at Pinnacle Tower: (1) Hourly exterior patrol, (2) Escort visitors from lobby to floor 14 only, (3) Loading dock is restricted until 9AM — no access. Type /help for commands.', ts: d(0, 8) },
      { id: 'comm-scm-003', room: room0, uid: 'dev-emp-001', content: 'Completed first patrol. Elevator 3 still out on 12th floor. Documenting in DAR. All other areas clear.', ts: d(0, 7) },
      { id: 'comm-scm-004', room: room0, uid: 'dev-manager-002', content: 'Carlos — I escalated the elevator issue to property management this morning. They said their contractor is booked for Thursday. Until then, keep noting it daily.', ts: d(0, 6) },
      { id: 'comm-scm-005', room: room0, uid: 'dev-emp-001', content: 'Copy. Three visitors escorted to floor 14 at 9:30AM. All badged and logged in visitor system. Loading dock is now open per post orders.', ts: d(0, 5) },
      { id: 'comm-scm-006', room: room0, uid: 'trinity-bot', content: 'Mid-shift check: 4.5 hours into shift. All clear based on your logs. Reminder — your shift ends at 2PM. Begin closing patrol at 1:45PM and ensure the outgoing officer (Kevin Brown, 2PM) has received the handoff brief.', ts: d(0, 4) },
      { id: 'comm-scm-007', room: room1, uid: 'dev-emp-006', content: 'Angela Davis clocked in at Lone Star Medical. Starting night patrol. ER waiting room has about 15 patients — busy night.', ts: d(1, 2) },
      { id: 'comm-scm-008', room: room1, uid: 'trinity-bot', content: 'Angela — night shift briefing: (1) Patient disturbance protocol updated — see post orders section 4.2. (2) Welfare check reminder set for 3AM and 5AM. Tap /welfare to confirm check-in. (3) Charge nurse on duty is Brenda Ellis — direct contact for medical emergencies.', ts: d(1, 2) },
      { id: 'comm-scm-009', room: room1, uid: 'dev-emp-006', content: 'Patient disturbance in ER — de-escalated. All clear now. Documenting incident report.', ts: d(1, 1) },
      { id: 'comm-scm-010', room: room1, uid: 'dev-manager-002', content: 'Angela — solid work. Make sure your incident report mentions Brenda as a witness and include the time the patient left the building. Risk management will want that detail.', ts: d(1, 0) },
      { id: 'comm-scm-011', room: room1, uid: 'trinity-bot', content: 'Welfare check 3AM: Angela Davis — please confirm your status.', ts: d(0, 21) },
      { id: 'comm-scm-012', room: room1, uid: 'dev-emp-006', content: '/welfare confirmed. All clear. Doing parking lot sweep now.', ts: d(0, 21) },
    ];

    for (const m of shiftMsgs) {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(shiftChatroomMessages).values({
        id: m.id,
        workspaceId: WS,
        chatroomId: m.room,
        userId: m.uid,
        content: m.content,
        messageType: 'text',
        createdAt: sql`${m.ts}::timestamptz`,
        updatedAt: sql`${m.ts}::timestamptz`,
      }).onConflictDoNothing();
    }
  }

  // =========================================================================
  // 4. SUPPORT TICKETS — realistic helpdesk activity
  // =========================================================================
  console.log('[CommsSeed] Inserting support tickets...');

  const tickets = [
    { id: 'comm-tkt-001', num: 'TKT-2026-0201', type: 'scheduling', priority: 'high', subject: 'Unable to view schedule for March 16–22', desc: 'I can see the schedule up to March 15 but the March 16+ dates show blank. My colleagues can see the new schedule but I cannot. Restarted the app twice. No change.', status: 'resolved', requested_by: 'dev-emp-009', resolution: 'Cache issue on David\'s account. Reset session and cleared app cache. Schedule now visible. Root cause: browser cache was holding a stale auth token.', resolved_by: 'dev-manager-001', ts: d(5), resolved_at: d(4) },
    { id: 'comm-tkt-002', num: 'TKT-2026-0202', type: 'payroll', priority: 'high', subject: 'Paycheck short by $120 — missing OT hours Feb 14', desc: 'I covered an unplanned Oakwood shift on February 14 due to a no-show. The shift was 4 hours OT. My February 16–28 paycheck did not include those hours. I have screenshots of my clock-in/out.', status: 'open', requested_by: 'dev-emp-009', ts: d(2) },
    { id: 'comm-tkt-003', num: 'TKT-2026-0203', type: 'compliance', priority: 'urgent', subject: 'Guard card renewal — appointment confirmation needed', desc: 'I have my DPS guard card renewal appointment on March 18. I need written confirmation from the company that I have time off without penalty to attend. HR said to submit a ticket.', status: 'open', requested_by: 'dev-emp-007', ts: d(1) },
    { id: 'comm-tkt-004', num: 'TKT-2026-0204', type: 'incident', priority: 'medium', subject: 'Camera at Oakwood Apt east gate — intermittent failure', desc: 'The east gate surveillance camera at Oakwood has been going offline intermittently. I have reported this in my DAR for 3 consecutive shifts. IT came by once but it is happening again. This is a safety issue for solo night patrol.', status: 'resolved', requested_by: 'dev-emp-007', resolution: 'IT replaced camera unit on March 7. New unit is stable. Kevin confirmed operational.', resolved_by: 'dev-manager-002', ts: d(4), resolved_at: d(0, 10) },
    { id: 'comm-tkt-005', num: 'TKT-2026-0205', type: 'hr', priority: 'medium', subject: 'PTO request blocked due to critical coverage warning', desc: 'I requested PTO for March 20 but the system blocked it and said I am in a critical coverage window. I understand the system is protecting coverage but I have a non-negotiable family commitment. Please escalate.', status: 'resolved', requested_by: 'dev-emp-005', resolution: 'Diana Johnson agreed to cover. PTO approved by James Washington. System flag removed.', resolved_by: 'dev-manager-002', ts: d(4), resolved_at: d(3, 22) },
    { id: 'comm-tkt-006', num: 'TKT-2026-0206', type: 'billing', priority: 'high', subject: 'Invoice dispute from Lone Star Medical — $480 charge back', desc: 'Lone Star Medical AP (Tanya Morris) is disputing $480 on invoice COAI-ACME-2026-0289. They claim an unauthorized early clock-out. Time entry shows only 8 minutes early departure. Need resolution before account goes to collections.', status: 'open', requested_by: 'dev-manager-001', ts: d(6) },
    { id: 'comm-tkt-007', num: 'TKT-2026-0207', type: 'scheduling', priority: 'medium', subject: 'Shift swap request — Mar 22 Pinnacle Tower evening', desc: 'Robert Williams (if warning is resolved) and I want to swap shifts. He takes my March 22 Pinnacle Tower 2PM–10PM and I take his March 23 Lone Star Medical 6AM–2PM. We are both qualified for both sites. Need manager approval.', status: 'open', requested_by: 'dev-emp-004', ts: d(1) },
    { id: 'comm-tkt-008', num: 'TKT-2026-0208', type: 'technical', priority: 'low', subject: 'Trinity chat — responses slow on mobile', desc: 'When I ask Trinity questions on the mobile app, responses take 30–45 seconds. On desktop it is faster (under 10 sec). Is this a known issue? My phone is iPhone 14 Pro, latest iOS.', status: 'open', requested_by: 'dev-emp-010', ts: d(0, 4) },
  ];

  for (const t of tickets) {
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(supportTickets).values({
      id: t.id,
      workspaceId: WS,
      ticketNumber: t.num,
      type: t.type,
      priority: t.priority,
      subject: t.subject,
      description: t.desc,
      status: t.status,
      requestedBy: t.requested_by,
      resolution: (t as any).resolution || null,
      resolvedBy: (t as any).resolved_by || null,
      resolvedAt: (t as any).resolved_at ? sql`${(t as any).resolved_at}::timestamptz` : null,
      createdAt: sql`${t.ts}::timestamptz`,
      updatedAt: sql`${t.ts}::timestamptz`,
    }).onConflictDoNothing();
  }

  // =========================================================================
  // 5. DISPATCH INCIDENTS — CAD-style field calls
  // =========================================================================
  console.log('[CommsSeed] Inserting dispatch incidents...');

  const incidents = [
    { id: 'comm-inc-001', num: 'INC-2026-0301', priority: 'high', type: 'trespass', status: 'cleared', client: 'dev-client-001', addr: '400 N Akard St, Dallas TX 75201', desc: 'Unknown individual refused to leave the lobby at Pinnacle Tower after business hours. Verbally aggressive toward cleaning staff.', notes: 'Officer Carlos Garcia responded. Subject identified as former tenant. Escorted from premises. No police required. Client notified.', caller: 'Carlos Garcia', caller_phone: '817-555-0201', call_at: d(3, 2), cleared_at: d(3, 1) },
    { id: 'comm-inc-002', num: 'INC-2026-0302', priority: 'urgent', type: 'medical', status: 'cleared', client: 'dev-client-002', addr: '1500 S Main St, Fort Worth TX 76104', desc: 'Patient in ER waiting room became physically agitated. Possible intoxication. Began shouting at staff and other patients.', notes: 'Angela Davis de-escalated. Patient calmed within 10 minutes. Brenda Ellis RN confirmed no injuries. Subject left premises at 01:15AM voluntarily.', caller: 'Angela Davis', caller_phone: '817-555-0206', call_at: d(2, 1), cleared_at: d(2, 0) },
    { id: 'comm-inc-003', num: 'INC-2026-0303', priority: 'medium', type: 'suspicious_activity', status: 'cleared', client: 'dev-client-003', addr: '1600 E Lamar Blvd, Arlington TX 76011', desc: 'Group of 4 males observed in restricted parking area behind Oakwood Apartments at 23:40. No vehicles registered to building.', notes: 'Kevin Brown approached group. Identified as vendors delivering supplies to adjacent business. Wrong entrance used. Redirected to front gate.', caller: 'Kevin Brown', caller_phone: '817-555-0207', call_at: d(5, 0), cleared_at: d(5, 0) },
    { id: 'comm-inc-004', num: 'INC-2026-0304', priority: 'high', type: 'theft', status: 'open', client: 'dev-client-001', addr: '400 N Akard St, Dallas TX 75201', desc: 'Building management reports missing laptop from 4th floor conference room. Room was locked. No signs of forced entry. Last access log shows 3 badge swipes after 6PM.', notes: 'Pinnacle Tower management contacted DPD. Report filed. Carlos Garcia assisting with badge log review. Investigation ongoing.', caller: 'Bill Foster', caller_phone: '214-555-0400', call_at: d(1, 4) },
    { id: 'comm-inc-005', num: 'INC-2026-0305', priority: 'medium', type: 'access_control', status: 'cleared', client: 'dev-client-002', addr: '1500 S Main St, Fort Worth TX 76104', desc: 'Staff member attempted to access restricted pharmacy storage area without proper clearance badge. Claim they were instructed verbally by supervisor.', notes: 'Angela Davis denied access per post orders. Escalated to hospital security manager. Staff member confirmed had proper verbal authorization from supervisor. Post order updated to reflect supervisor override procedure.', caller: 'Angela Davis', caller_phone: '817-555-0206', call_at: d(6, 3), cleared_at: d(6, 2) },
  ];

  for (const i of incidents) {
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(dispatchIncidents).values({
      id: i.id,
      workspaceId: WS,
      incidentNumber: i.num,
      priority: i.priority,
      type: i.type,
      status: i.status,
      clientId: i.client,
      locationAddress: i.addr,
      description: i.desc,
      notes: i.notes,
      callerName: i.caller,
      callerPhone: i.caller_phone,
      callReceivedAt: sql`${i.call_at}::timestamptz`,
      clearedAt: (i as any).cleared_at ? sql`${(i as any).cleared_at}::timestamptz` : null,
      incidentType: i.type,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();
  }

  // =========================================================================
  // 6. INCIDENT REPORTS — written officer reports
  // =========================================================================
  console.log('[CommsSeed] Inserting incident reports...');

  const incidentReportData = [
    {
      id: 'comm-irpt-001', num: 'RPT-2026-0301', reported_by: 'dev-emp-006',
      title: 'Patient Disturbance — ER Waiting Room, Lone Star Medical',
      severity: 'medium', incident_type: 'disturbance',
      raw_desc: 'At approx 0110 hrs I responded to the ER waiting area after charge nurse Brenda Ellis requested assistance. A male subject in a white shirt was shouting at other patients and nursing staff regarding wait times. I approached the subject calmly, identified myself, and asked him to lower his voice. Subject complied after approximately 10 minutes of verbal de-escalation. He left the premises voluntarily at 0115 hrs. No physical contact was made. No police were required. Brenda Ellis witnessed the entire interaction.',
      polished_desc: 'Officer Angela Davis responded to a disturbance in the emergency room waiting area at approximately 0110 hours. A male subject was verbally confrontational with staff and patients regarding wait times. Officer Davis successfully de-escalated the situation using verbal communication techniques. The subject departed the premises voluntarily at 0115 hours. No force was used, no police were summoned, and no injuries were reported. Witness: Brenda Ellis, RN, Charge Nurse.',
      status: 'reviewed', occurred_at: d(2, 1), reviewed_at: d(2, 0),
    },
    {
      id: 'comm-irpt-002', num: 'RPT-2026-0302', reported_by: 'dev-emp-001',
      title: 'Unauthorized Individual Refused to Leave Lobby — Pinnacle Tower',
      severity: 'low', incident_type: 'trespass',
      raw_desc: 'At 1940 hrs while on lobby patrol I observed a male approximately 50 years old sitting in the lobby furniture area. After business hours ended at 1800 hrs the lobby is restricted to badged tenants only. I approached the subject and asked for his badge. He stated he was a former tenant who "used to have an office here" and wanted to use the WiFi. I informed him the building was closed to the public after hours and that he needed to leave. He initially argued but complied after I offered to contact building management. He exited at 1945 hrs.',
      polished_desc: 'Officer Carlos Garcia identified an unauthorized individual in the Pinnacle Tower lobby at 1940 hours, after business hours when access is restricted to badged tenants. The subject identified himself as a former tenant and refused to leave initially. Officer Garcia employed professional verbal communication, resulting in the subject voluntarily departing at 1945 hours. No physical force used. Building management notified per post orders.',
      status: 'reviewed', occurred_at: d(3, 2), reviewed_at: d(3, 0),
    },
    {
      id: 'comm-irpt-003', num: 'RPT-2026-0303', reported_by: 'dev-emp-005',
      title: 'Elevator 3 Out of Service — 12th Floor, Pinnacle Tower',
      severity: 'low', incident_type: 'maintenance',
      raw_desc: 'Elevator 3 has been out of service on the 12th floor for 4 consecutive patrol days. I first noted this on March 3 in my DAR and have included it in every subsequent DAR. Building maintenance has been notified by James Washington. Contractor visit scheduled for March 10. This creates a single-point-of-failure for the north wing of the 12th floor. If a medical emergency were to occur up there, egress would be limited to the fire stairs which exit on the east side only.',
      polished_desc: 'Officer Michael Thompson has documented Elevator 3 being out of service on the 12th floor of Pinnacle Tower for four consecutive patrol shifts (March 3–6). The matter has been escalated to building management by Operations Manager Washington. A contractor visit is scheduled for March 10. Officer Thompson identifies a potential safety concern related to emergency egress limitations on the 12th floor north wing pending repair.',
      status: 'submitted', occurred_at: d(1, 5),
    },
  ];

  for (const r of incidentReportData) {
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(incidentReports).values({
      id: r.id,
      workspaceId: WS,
      incidentNumber: r.num,
      reportedBy: r.reported_by,
      title: r.title,
      severity: r.severity,
      incidentType: r.incident_type,
      rawDescription: r.raw_desc,
      polishedDescription: r.polished_desc,
      status: r.status,
      occurredAt: sql`${r.occurred_at}::timestamptz`,
      reviewedAt: (r as any).reviewed_at ? sql`${(r as any).reviewed_at}::timestamptz` : null,
      trinityRevisionCount: 1,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();
  }

  // =========================================================================
  // 7. ORCHESTRATION RUNS — Trinity's action history
  // =========================================================================
  console.log('[CommsSeed] Inserting Trinity orchestration history...');

  const runs = [
    { id: 'comm-orch-001', action_id: 'proactive.generate_morning_brief', category: 'proactive', status: 'completed', input: { workspaceId: WS, date: d(0).split('T')[0] }, output: { shiftsToday: 12, unconfirmed: 2, overdueInvoices: 1, alerts: 3, briefGenerated: true }, started_at: d(0, 8), completed_at: d(0, 7, 58), dur: 142000 },
    { id: 'comm-orch-002', action_id: 'proactive.run_daily_scan', category: 'proactive', status: 'completed', input: { workspaceId: WS }, output: { issuesFound: 5, notificationsSent: 8, actionsQueued: 3 }, started_at: d(0, 7), completed_at: d(0, 6, 55), dur: 305000 },
    { id: 'comm-orch-003', action_id: 'shift.send_confirmation_request', category: 'schedule', status: 'completed', input: { workspaceId: WS, shiftIds: ['upcoming-shift-001', 'upcoming-shift-002'] }, output: { confirmationsSent: 2, officersNotified: ['dev-emp-001', 'dev-emp-010'] }, started_at: d(1, 20), completed_at: d(1, 19, 59), dur: 8400 },
    { id: 'comm-orch-004', action_id: 'billing.cash_flow_gap', category: 'billing', status: 'completed', input: { workspaceId: WS, lookAheadDays: 30 }, output: { projectedGap: 12480, gapDate: '2026-03-20', overdueInvoices: ['COAI-ACME-2026-0289'], recommendation: 'Follow up with Lone Star Medical AP immediately' }, started_at: d(0, 4), completed_at: d(0, 3, 58), dur: 22000 },
    { id: 'comm-orch-005', action_id: 'hiring.expiring_licenses_alert', category: 'compliance', status: 'completed', input: { workspaceId: WS, daysAhead: 60 }, output: { expiringSoon: 4, critical: 2, notificationsSent: 4, officers: ['dev-emp-007', 'dev-emp-010', 'dev-emp-005', 'dev-emp-009'] }, started_at: d(0, 6), completed_at: d(0, 5, 58), dur: 18500 },
    { id: 'comm-orch-006', action_id: 'billing.aging_report_detailed', category: 'billing', status: 'completed', input: { workspaceId: WS }, output: { totalOutstanding: 47920, over30Days: 12480, over60Days: 0, clients: ['Lone Star Medical', 'Oakwood Apartments'] }, started_at: d(1, 4), completed_at: d(1, 3, 57), dur: 31000 },
    { id: 'comm-orch-007', action_id: 'safety.start_welfare_monitoring', category: 'safety', status: 'completed', input: { workspaceId: WS, employeeId: 'dev-emp-006', shiftId: 'night-shift-lsm-001' }, output: { monitoringActive: true, checkIntervalMinutes: 120, nextCheckAt: d(0, 21) }, started_at: d(1, 2), completed_at: d(1, 1, 59), dur: 2100 },
    { id: 'comm-orch-008', action_id: 'safety.acknowledge_welfare_check', category: 'safety', status: 'completed', input: { workspaceId: WS, employeeId: 'dev-emp-006', checkId: 'welfare-chk-001' }, output: { acknowledged: true, officer: 'Angela Davis', status: 'all_clear', timestamp: d(0, 21) }, started_at: d(0, 21), completed_at: d(0, 21), dur: 800 },
    { id: 'comm-orch-009', action_id: 'analytics.payroll_summary', category: 'analytics', status: 'completed', input: { workspaceId: WS, periodStart: '2026-03-01', periodEnd: '2026-03-15' }, output: { totalGross: 38240, employeeCount: 14, exceptions: 1, otHours: 7.5, status: 'approved' }, started_at: d(3, 4), completed_at: d(3, 3, 57), dur: 28000 },
    { id: 'comm-orch-010', action_id: 'analytics.employee_performance', category: 'analytics', status: 'completed', input: { workspaceId: WS }, output: { topPerformer: 'Carlos Garcia', avgScore: 84.6, flagged: ['dev-emp-003'], totalReviewed: 14 }, started_at: d(4, 3), completed_at: d(4, 2, 58), dur: 45000 },
    { id: 'comm-orch-011', action_id: 'task.create', category: 'operations', status: 'completed', input: { workspaceId: WS, title: 'Follow up on Lone Star Medical invoice dispute', assignedTo: 'dev-manager-001', dueDate: d(-3) }, output: { taskId: 'task-invoice-dispute-001', created: true }, started_at: d(6, 2), completed_at: d(6, 1, 59), dur: 1800 },
    { id: 'comm-orch-012', action_id: 'task.create', category: 'operations', status: 'completed', input: { workspaceId: WS, title: 'Coordinate guard card renewal for Kevin Brown', assignedTo: 'dev-manager-001', dueDate: d(-18) }, output: { taskId: 'task-kcb-renewal-001', created: true }, started_at: d(0, 6), completed_at: d(0, 5, 59), dur: 1600 },
    { id: 'comm-orch-013', action_id: 'postorders.flag_deviation', category: 'safety', status: 'completed', input: { workspaceId: WS, shiftId: 'night-shift-oak-001', deviationType: 'camera_outage', details: 'East gate camera offline, using manual log' }, output: { flagId: 'flag-cam-001', supervisorNotified: true }, started_at: d(4, 2), completed_at: d(4, 1, 59), dur: 2200 },
    { id: 'comm-orch-014', action_id: 'testing.generate_random_selection', category: 'compliance', status: 'completed', input: { workspaceId: WS, percentage: 10 }, output: { selected: 6, officers: ['dev-emp-001', 'dev-emp-004', 'dev-emp-007', 'dev-emp-009', 'dev-emp-010', 'dev-emp-003'], testingDeadline: d(-5) }, started_at: d(4, 0), completed_at: d(3, 23, 58), dur: 4500 },
    { id: 'comm-orch-015', action_id: 'shift.scan_tomorrows_shifts', category: 'schedule', status: 'completed', input: { workspaceId: WS, date: d(0).split('T')[0] }, output: { shiftsFound: 8, unconfirmed: 2, confirmationsSent: 2, allCovered: false }, started_at: d(1, 20), completed_at: d(1, 19, 58), dur: 12000 },
    { id: 'comm-orch-016', action_id: 'emergency.declare_incident', category: 'emergency', status: 'completed', input: { workspaceId: WS, type: 'no_show_cascade', affectedSiteIds: ['dev-client-002'], description: 'Robert Williams NCNS created coverage gap at Lone Star Medical' }, output: { incidentId: 'emg-ncns-001', replacementFound: true, coveredBy: 'dev-emp-009', status: 'resolved' }, started_at: d(2, 6), completed_at: d(2, 5, 45), dur: 915000 },
    { id: 'comm-orch-017', action_id: 'employee.track_milestones', category: 'hr', status: 'completed', input: { workspaceId: WS }, output: { upcoming: 3, overdue: 1, anniversaries: [{ employeeId: 'dev-emp-001', milestone: '5yr', daysUntil: 87 }] }, started_at: d(0, 7), completed_at: d(0, 6, 58), dur: 8900 },
    { id: 'comm-orch-018', action_id: 'employee.flag_anniversary', category: 'hr', status: 'completed', input: { workspaceId: WS, employeeId: 'dev-emp-001', milestone: '5yr' }, output: { notificationSent: true, owner: 'dev-owner-001', message: 'Carlos Garcia hits his 5-year anniversary on June 15. Performance has been excellent (score: 95). Consider acknowledgment and pay review.' }, started_at: d(0, 6), completed_at: d(0, 5, 59), dur: 3400 },
    { id: 'comm-orch-019', action_id: 'finance.collection_priority', category: 'billing', status: 'completed', input: { workspaceId: WS }, output: { priorityClients: ['Lone Star Medical - $12,480 (14 days past due)'], recommendedActions: ['Call Tanya Morris AP today', 'Offer payment plan if needed', 'Escalate to Marcus Rivera if no response by March 10'] }, started_at: d(0, 4), completed_at: d(0, 3, 58), dur: 19000 },
    { id: 'comm-orch-020', action_id: 'report.executive_summary', category: 'analytics', status: 'completed', input: { workspaceId: WS, period: 'weekly' }, output: { revenue: '$94,200 billed', coverage: '96.8%', incidents: 5, openTickets: 4, payrollStatus: 'On track', topRisk: 'Invoice dispute + certification expiry' }, started_at: d(7, 6), completed_at: d(7, 5, 52), dur: 480000 },
    { id: 'comm-orch-021', action_id: 'settings.propagate_license_expiry', category: 'compliance', status: 'completed', input: { workspaceId: WS, employeeId: 'dev-emp-007', licenseType: 'guard_card', expiryDate: d(-28) }, output: { shiftsAffected: 14, supervisorsNotified: 2, replacementsNeeded: 0, message: 'Kevin Brown guard card expiry flagged. Renewal in progress.' }, started_at: d(0, 5), completed_at: d(0, 4, 58), dur: 9200 },
    { id: 'comm-orch-022', action_id: 'proactive.run_weekly_scan', category: 'proactive', status: 'completed', input: { workspaceId: WS }, output: { otRisk: 3, openShifts: 5, compliance30d: 4, workforceSummary: { active: 14, onLeave: 1, flagged: 2 } }, started_at: d(7, 7), completed_at: d(7, 6, 51), dur: 540000 },
    { id: 'comm-orch-023', action_id: 'task.track_overdue', category: 'operations', status: 'completed', input: { workspaceId: WS }, output: { overdueCount: 2, tasks: ['Invoice follow-up (2 days overdue)', 'Kevin Brown renewal documentation'] }, started_at: d(0, 9), completed_at: d(0, 8, 59), dur: 7800 },
    { id: 'comm-orch-024', action_id: 'subcontractor.get_approved_list', category: 'operations', status: 'completed', input: { workspaceId: WS }, output: { subcontractors: 2, licensed: 2, available: 1 }, started_at: d(2, 5), completed_at: d(2, 4, 59), dur: 3100 },
    { id: 'comm-orch-025', action_id: 'external.flag_external_risk', category: 'intelligence', status: 'completed', input: { workspaceId: WS, siteId: 'dev-client-001', riskType: 'construction', details: 'Heavy construction on N Akard St may affect parking and officer arrival times' }, output: { flagId: 'ext-risk-001', supervisorNotified: true, affectedShifts: 4 }, started_at: d(1, 2), completed_at: d(1, 1, 59), dur: 2800 },
  ];

  for (const r of runs) {
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(orchestrationRuns).values({
      id: r.id,
      workspaceId: WS,
      userId: 'dev-owner-001',
      actionId: r.action_id,
      category: r.category,
      source: 'trinity',
      status: r.status,
      inputParams: r.input,
      outputResult: r.output,
      startedAt: sql`${r.started_at}::timestamptz`,
      completedAt: sql`${r.completed_at}::timestamptz`,
      durationMs: r.dur,
      slaMet: r.dur < 30000,
      slaThresholdMs: 30000,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();
  }

  // =========================================================================
  // 8. UPDATE MAILBOX UNREAD COUNTS
  // =========================================================================
  // CATEGORY C — Raw SQL retained: COUNT( | Tables: internal_emails, internal_mailboxes | Verified: 2026-03-23
  await typedExec(sql`
    UPDATE internal_mailboxes SET
      total_messages = (SELECT COUNT(*) FROM internal_emails WHERE workspace_id = ${WS}),
      unread_count = (SELECT COUNT(*) FROM internal_emails WHERE workspace_id = ${WS} AND (folder_data->>'read')::boolean IS NOT TRUE)
    WHERE workspace_id = ${WS}
  `);

  console.log('[CommsSeed] Communications seed complete.');
  return { success: true, message: 'Communications seed inserted successfully' };
}
