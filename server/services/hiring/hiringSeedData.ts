import { db } from '../../db';
import { sql } from 'drizzle-orm';
import { typedPool, typedPoolExec } from '../../lib/typedSql';
import { interviewQuestionSets, chatConversations, chatMessages, interviewSessions } from '@shared/schema';

const WS = 'dev-acme-security-ws';

function d(daysAgo: number, hoursAgo = 0): string {
  const t = new Date();
  t.setDate(t.getDate() - daysAgo);
  t.setHours(t.getHours() - hoursAgo);
  return t.toISOString();
}

export async function seedHiringData(): Promise<{ success: boolean; message: string }> {
  const pool = db.$client;

  // CATEGORY C — Raw SQL retained: LIMIT | Tables: interview_sessions | Verified: 2026-03-23
  const sentinel = await typedPool(
    `SELECT id FROM interview_sessions WHERE workspace_id = $1 AND id = 'isess-acme-001' LIMIT 1`,
    [WS]
  );
  // @ts-expect-error — TS migration: fix in refactoring sprint
  if (sentinel.length > 0) {
    // CATEGORY C — Raw SQL retained: IS NULL | Tables: interview_sessions | Verified: 2026-03-23
    await typedPoolExec(`
      UPDATE interview_sessions
      SET overall_score = 82,
          transcript_summary = 'Samantha Cruz completed all 10 interview questions. De-escalation protocol: Excellent. Healthcare compliance awareness: Outstanding. Employment history: Clean — no terminations. License verified at 97% confidence. Full availability including evenings and overnights. Trinity recommends for offer.'
      WHERE id = 'isess-acme-002' AND workspace_id = $1 AND (overall_score IS NULL OR transcript_summary IS NULL)
    `, [WS]);
    return { success: true, message: 'Hiring data already seeded' };
  }

  // =========================================================================
  // 1. JOB POSTINGS
  // =========================================================================
  // CATEGORY C — Raw SQL retained: Seed data multi-row INSERT with complex VALUES | Tables: job_postings | Verified: 2026-03-23
  await typedPoolExec(`
    INSERT INTO job_postings (
      id, workspace_id, title, description, position_type, employment_type,
      sites, pay_rate_min, pay_rate_max, required_certifications, status,
      applications_count, posted_at, created_at,
      shift_type, schedule_details, requires_license, auto_generated, demand_trigger
    ) VALUES
    (
      'jp-acme-001', $1,
      'Armed Security Officer — Pinnacle Tower',
      'Seeking a licensed, armed security officer for a prestigious downtown high-rise. Responsibilities include access control, patrol, and incident response. Client requires professional demeanor and immaculate uniform standards.',
      'armed', 'full_time',
      '["Pinnacle Tower, 1200 Main St, Houston TX"]',
      22.00, 26.00,
      '["Texas DPS Level III License","Armed Endorsement"]',
      'active', 4, $2, $2,
      'armed', 'Monday–Friday 6AM–2PM, Saturday 8AM–4PM', TRUE, FALSE, NULL
    ),
    (
      'jp-acme-002', $1,
      'Unarmed Security Guard — Lone Star Medical Center',
      'Hospital environment security role. Duties include patient transport assist, visitor management, parking enforcement, and emergency code response. Must be comfortable in a healthcare setting.',
      'unarmed', 'full_time',
      '["Lone Star Medical Center, 4500 Fannin St, Houston TX"]',
      18.00, 21.00,
      '["Texas DPS Level II License"]',
      'active', 7, $2, $2,
      'unarmed', 'Rotating shifts: Days (6AM–2PM), Evenings (2PM–10PM), Nights (10PM–6AM)', TRUE, FALSE, NULL
    ),
    (
      'jp-acme-003', $1,
      'Site Supervisor — Downtown District Portfolio',
      'Trinity identified a scheduling coverage gap across three downtown client sites. This supervisor role will oversee patrol coordination for Bayou Building, Commerce Square, and Heritage Plaza. Requires 3+ years leadership experience.',
      'supervisor', 'full_time',
      '["Bayou Building","Commerce Square","Heritage Plaza"]',
      28.00, 34.00,
      '["Texas DPS Level IV License","Management Experience"]',
      'active', 2, $3, $3,
      'supervisor', 'Monday–Friday 8AM–5PM with on-call weekend coverage', TRUE, TRUE, 'scheduling_gap'
    )
    ON CONFLICT (id) DO NOTHING
  `, [WS, d(5), d(2)]);

  // =========================================================================
  // 2. DEFAULT QUESTION SETS
  // =========================================================================
  const unarmedQuestions = JSON.stringify([
    { q: 'What is your availability? Are you able to work nights, weekends, and holidays?', weight: 10, category: 'availability' },
    { q: 'Tell me about your prior security experience. How many years have you worked in the industry?', weight: 15, category: 'experience' },
    { q: 'What is your reason for wanting to leave or having left your most recent employer?', weight: 10, category: 'employment_history' },
    { q: 'A visitor becomes aggressive at the front desk after being denied entry. Walk me through exactly how you handle that situation.', weight: 20, category: 'situational' },
    { q: 'You observe a coworker sleeping on duty during a night shift. What do you do?', weight: 15, category: 'situational' },
    { q: 'Are you familiar with Texas DPS licensing requirements for security officers? Is your license currently active and in good standing?', weight: 15, category: 'compliance' },
    { q: 'Can you confirm you are physically able to stand, walk, and patrol for shifts up to 12 hours?', weight: 5, category: 'physical' },
    { q: 'Have you ever been terminated from a security position? If yes, please describe the circumstances.', weight: 15, category: 'employment_history' },
    { q: 'What would you do if you disagreed with a direct order from your supervisor?', weight: 10, category: 'situational' },
    { q: 'Do you have reliable transportation to report on time to assigned client sites?', weight: 5, category: 'logistics' }
  ]);

  // Converted to Drizzle ORM: ON CONFLICT
  await db.insert(interviewQuestionSets).values([
    { id: 'iqs-unarmed-001', workspaceId: WS, roleType: 'unarmed', questions: JSON.parse(unarmedQuestions), isDefault: true, createdBy: 'trinity-system', createdAt: new Date(d(5)) },
    { id: 'iqs-armed-001', workspaceId: WS, roleType: 'armed', questions: JSON.parse(unarmedQuestions), isDefault: true, createdBy: 'trinity-system', createdAt: new Date(d(5)) },
  ]).onConflictDoNothing();

  // =========================================================================
  // 3. APPLICANTS AT EVERY PIPELINE STAGE
  // =========================================================================
  // CATEGORY C — Raw SQL retained: Seed data multi-row INSERT with complex VALUES | Tables: applicants | Verified: 2026-03-23
  await typedPoolExec(`
    INSERT INTO applicants (
      id, workspace_id, job_posting_id,
      first_name, last_name, email, phone,
      has_guard_card, guard_card_number, has_armed_endorsement,
      years_experience, applied_at, status,
      trinity_score, trinity_score_rationale,
      pipeline_stage, license_state, license_type, license_verified,
      license_verification_notes, interview_score, liability_score, trinity_summary
    ) VALUES

    -- Stage: applied — just submitted, awaiting Trinity pre-screen
    (
      'app-acme-001', $1, 'jp-acme-001',
      'Marcus', 'Webb', 'marcus.webb.applicant@gmail.com', '(832) 555-0191',
      TRUE, 'TX-2024-88341', TRUE, 4, $2, 'applied',
      72, '+30 guard card, +20 armed endorsement, +4 experience, +10 complete, +8 references',
      'applied', 'TX', 'Level III Armed', FALSE, NULL, NULL, NULL, NULL
    ),

    -- Stage: pre_screened — license flagged for review
    (
      'app-acme-002', $1, 'jp-acme-002',
      'Ashley', 'Moore', 'ashley.moore.tx@outlook.com', '(713) 555-0247',
      TRUE, 'TX-2023-45219', FALSE, 2, $3, 'reviewing',
      55, '+30 guard card, +2 experience, +10 complete, +5 posting specific, +8 references',
      'pre_screened', 'TX', 'Level II Unarmed', FALSE,
      'Extracted expiration date (2023-11-15) is in the past. Name match: PASS. Number match: PASS. License appears expired — management review required before advancing.',
      NULL, NULL, NULL
    ),

    -- Stage: interview_scheduled — license verified, interview in progress (halfway)
    (
      'app-acme-003', $1, 'jp-acme-002',
      'Jordan', 'Taylor', 'jordan.taylor.security@gmail.com', '(832) 555-0388',
      TRUE, 'TX-2025-11947', FALSE, 3, $4, 'interview_scheduled',
      68, '+30 guard card, +3 experience, +10 complete, +5 posting, +10 references, +10 high scorer',
      'interview_scheduled', 'TX', 'Level II Unarmed', TRUE,
      'License verified. Name: JORDAN TAYLOR — MATCH. Number: TX-2025-11947 — MATCH. Expiration: 2027-03-15 — VALID. No anomalies detected. Confidence: 94%.',
      NULL, NULL, NULL
    ),

    -- Stage: interview_complete — full scores and Trinity summary
    (
      'app-acme-004', $1, 'jp-acme-002',
      'Samantha', 'Cruz', 'samantha.cruz.hsec@gmail.com', '(713) 555-0552',
      TRUE, 'TX-2024-77623', FALSE, 5, $5, 'interview_complete',
      88, '+30 guard card, +5 experience, +10 complete, +5 posting, +10 references, +10 high scorer, +18 score bonus',
      'interview_complete', 'TX', 'Level II Unarmed', TRUE,
      'License verified. Name: SAMANTHA CRUZ — MATCH. Expiration: 2026-08-22 — VALID. Confidence: 97%.',
      82, 88,
      'Samantha Cruz presents as a seasoned and professionally mature candidate with five years of verifiable security experience across healthcare and corporate environments. Her situational judgment responses demonstrated sound decision-making — she correctly identified de-escalation as the first tool before any physical intervention and showed awareness of chain-of-command protocols when asked about supervisor disagreements.

Her compliance awareness is above average. She articulated Texas DPS licensing requirements accurately and confirmed her license is current. Physical readiness is not a concern — she volunteered prior experience working 12-hour overnight shifts at Lone Star Regional Medical without incident.

Trinity Assessment: RECOMMEND FOR OFFER. Liability score of 88 reflects no red flags across all evaluated dimensions. Samantha is a strong match for the Lone Star Medical Center unarmed position and should be prioritized.'
    ),

    -- Stage: management_review — ready for human decision
    (
      'app-acme-005', $1, 'jp-acme-001',
      'David', 'Kim', 'david.kim.sec@yahoo.com', '(832) 555-0614',
      TRUE, 'TX-2024-63891', TRUE, 7, $6, 'interview_complete',
      91, '+30 guard card, +20 armed, +7 exp, +10 complete, +10 refs, +14 score bonus',
      'management_review', 'TX', 'Level III Armed', TRUE,
      'License verified. Name: DAVID KIM — MATCH. Expiration: 2026-11-30 — VALID. Confidence: 99%.',
      89, 94,
      'David Kim is an exceptional candidate by every measurable dimension. Seven years of continuous security employment — four with a licensed contract firm and three in a supervisory-adjacent capacity — demonstrates both longevity and career growth. His armed scenario responses were measured, lawful, and showed clear understanding of use-of-force continuum principles, which is precisely what an armed position at Pinnacle Tower demands.

His departure from his last employer was professionally handled — he cited a company-wide restructuring that eliminated his position, which was corroborated by the timeline and manner of his disclosure. There are no employment gaps or termination disclosures of concern.

Trinity Assessment: STRONG RECOMMEND — TOP CANDIDATE. Liability score of 94 is the highest recorded for this posting cycle. David is the recommended hire for the Pinnacle Tower Armed Officer role. Management should move to offer stage promptly given competitive market conditions for Level III talent.'
    ),

    -- Stage: offer_extended
    (
      'app-acme-006', $1, 'jp-acme-002',
      'Lisa', 'Patterson', 'lisa.patterson.sec@gmail.com', '(713) 555-0778',
      TRUE, 'TX-2023-99102', FALSE, 6, $7, 'offer_sent',
      85, '+30 guard card, +6 exp, +10 complete, +10 refs, +10 high scorer, +9 bonus',
      'offer_extended', 'TX', 'Level II Unarmed', TRUE,
      'License verified. Confidence: 96%.', 78, 82,
      'Lisa Patterson is a strong candidate with extensive unarmed patrol experience. Recommend for offer.'
    ),

    -- Stage: disqualified — failed license verification
    (
      'app-acme-007', $1, 'jp-acme-001',
      'Robert', 'Nguyen', 'robertnguyen.guard@hotmail.com', '(832) 555-0923',
      TRUE, 'TX-2020-11234', FALSE, 1, $8, 'rejected',
      42, '+30 guard card, +1 exp, +10 complete, +1 ref',
      'disqualified', 'TX', 'Level II Unarmed', FALSE,
      'VERIFICATION FAILED. Multiple anomalies detected: (1) License number TX-2020-11234 expired 2022-09-01 — expired 2+ years ago. (2) Font inconsistency detected in expiration field — possible alteration. (3) Submitted for Armed Officer role but license type is Level II Unarmed — mismatch. Confidence in document authenticity: 31%. Applicant auto-flagged. Management has been notified. DO NOT ADVANCE.',
      NULL, NULL,
      'Application disqualified due to license verification failure. Document showed signs of alteration and submitted credentials did not match required license type. Applicant was not advanced to interview stage.'
    ),

    -- Training pipeline (no license)
    (
      'app-acme-008', $1, 'jp-acme-002',
      'Deja', 'Washington', 'deja.washington22@gmail.com', '(713) 555-1032',
      FALSE, NULL, FALSE, 0, $9, 'applied',
      20, '+10 complete application, +10 expressed sponsorship interest',
      'applied', NULL, NULL, FALSE,
      NULL, NULL, NULL, NULL
    )
    ON CONFLICT (id) DO NOTHING
  `, [WS, d(1), d(3), d(2), d(6), d(4), d(5), d(1), d(1)]);

  // =========================================================================
  // 4. CHATDOCK INTERVIEW CONVERSATIONS
  // =========================================================================

  // --- Conversation A: Jordan Taylor — interview IN PROGRESS (6/10 questions) ---
  // Converted to Drizzle ORM: ON CONFLICT
  await db.insert(chatConversations).values({
    id: 'conv-interview-jordan-001',
    workspaceId: WS,
    customerId: 'app-acme-003',
    customerName: 'Jordan Taylor',
    customerEmail: 'jordan.taylor.security@gmail.com',
    supportAgentId: 'trinity-bot',
    supportAgentName: 'Trinity AI',
    subject: 'Security Guard Interview — Lone Star Medical Center',
    status: 'open',
    priority: 'medium',
    conversationType: 'interview',
    createdAt: new Date(d(2, 2)),
    updatedAt: new Date(d(2)),
    lastMessageAt: new Date(d(2)),
  }).onConflictDoNothing();

  const jordanMessages = [
    { id: 'msg-jt-001', sid: 'trinity-bot', sname: 'Trinity', stype: 'ai', ts: d(2, 2),
      msg: `Hello Jordan, I'm Trinity — the AI hiring assistant for Acme Security Services. Thank you for applying for the Unarmed Security Guard position at Lone Star Medical Center.

I'll be conducting your initial interview today. This is an async interview, so you can take your time responding to each question. Your answers will be reviewed by our hiring team along with my assessment.

There are 10 questions total. Let's get started when you're ready.

**Question 1 of 10:** What is your availability? Are you able to work nights, weekends, and holidays if required?` },
    { id: 'msg-jt-002', sid: 'app-acme-003', sname: 'Jordan Taylor', stype: 'guest', ts: d(2, 1),
      msg: `Hi Trinity, thanks for reaching out. I'm available for all three shifts — days, evenings, and nights. I'm also available on weekends and most holidays except maybe Christmas Day. I understand that security doesn't take days off and I'm fully committed to the schedule requirements.` },
    { id: 'msg-jt-003', sid: 'trinity-bot', sname: 'Trinity', stype: 'ai', ts: d(2, 1),
      msg: `Great — full availability including evenings, nights, and weekends is exactly what this role requires. Noted.

**Question 2 of 10:** Tell me about your prior security experience. How many years have you worked in the security industry, and what types of environments?` },
    { id: 'msg-jt-004', sid: 'app-acme-003', sname: 'Jordan Taylor', stype: 'guest', ts: d(1, 22),
      msg: `I've been working in security for about 3 years. My first two years were at a retail complex in Sugar Land — loss prevention and access control. The last year I've been at an office park doing overnight patrol. I've done some event security on the side as well, mostly weekend concerts and corporate events. I've always worked unarmed positions but I'm familiar with incident reporting, daily activity reports, and how to handle visitors professionally.` },
    { id: 'msg-jt-005', sid: 'trinity-bot', sname: 'Trinity', stype: 'ai', ts: d(1, 22),
      msg: `Three years of varied experience across retail, commercial, and event environments — good range. Healthcare security has its own unique demands and your visitor management background is applicable.

**Question 3 of 10:** What is your reason for wanting to leave or having left your most recent employer?` },
    { id: 'msg-jt-006', sid: 'app-acme-003', sname: 'Jordan Taylor', stype: 'guest', ts: d(1, 20),
      msg: `My current company is fine but there's no room for growth. I've been doing the same overnight route for a year with no promotions or raises in sight. I've asked about advancement twice and was told there are no open supervisor spots. Acme seems like a company that actually values its officers and I want to be somewhere I can develop a real career, not just clock in and out.` },
    { id: 'msg-jt-007', sid: 'trinity-bot', sname: 'Trinity', stype: 'ai', ts: d(1, 19),
      msg: `That's a reasonable and professional answer. Career growth is a legitimate motivator.

**Question 4 of 10:** This one is a situational scenario. A visitor becomes aggressive at the hospital reception desk after being denied access to a patient room. They're raising their voice and refusing to leave. Walk me through exactly how you would handle that situation.` },
    { id: 'msg-jt-008', sid: 'app-acme-003', sname: 'Jordan Taylor', stype: 'guest', ts: d(1, 17),
      msg: `First I would approach calmly and introduce myself — let them know I'm here to help, not confront them. I'd lower my voice so they might naturally lower theirs, make eye contact, and acknowledge that I understand they're upset. I'd ask them to step slightly away from the desk so we can talk privately — this gets them away from the escalation point and gives them a chance to calm down.

I'd explain the hospital's visitor policy clearly and if there's a legitimate concern, I'd offer to contact the charge nurse or patient advocate to see if there's anything that can be done through proper channels. If they continue to refuse to leave or become physically threatening, I'd notify hospital security command, call for backup, and document everything.` },
    { id: 'msg-jt-009', sid: 'trinity-bot', sname: 'Trinity', stype: 'ai', ts: d(1, 17),
      msg: `Solid de-escalation framework — de-escalate first, redirect, involve proper channels before any physical response. That's exactly the right sequence in a healthcare environment.

**Question 5 of 10:** You observe a coworker sleeping on duty during a night shift. What do you do?` },
    { id: 'msg-jt-010', sid: 'app-acme-003', sname: 'Jordan Taylor', stype: 'guest', ts: d(1, 15),
      msg: `I'd wake them up quietly and let them know what I saw. Give them a chance to address it themselves — maybe they just closed their eyes for a second and didn't realize. But if it's a clear pattern or they're putting the site at risk, I have to report it to the supervisor. It's uncomfortable but sleeping on duty is a safety issue, not just a rule violation. The client is paying for coverage. I wouldn't cover for someone who's compromising that.` },
    { id: 'msg-jt-011', sid: 'trinity-bot', sname: 'Trinity', stype: 'ai', ts: d(1, 14),
      msg: `Good — you balanced professional courtesy with accountability. That's the right call.

**Question 6 of 10:** Are you familiar with Texas DPS licensing requirements for security officers? Can you confirm your Level II license is currently active and in good standing?` },
    { id: 'msg-jt-012', sid: 'app-acme-003', sname: 'Jordan Taylor', stype: 'guest', ts: d(1, 12),
      msg: `Yes, I know that Texas requires all security officers to be licensed through the Texas Department of Public Safety Private Security Bureau. My Level II license number is TX-2025-11947 and it's valid through March 2027. I completed my 6-hour classroom training and passed the written exam. I'm also current on my annual continuing education. I keep a copy of my license card on me at all times per PSB rules.` },
    { id: 'msg-jt-013', sid: 'trinity-bot', sname: 'Trinity', stype: 'ai', ts: d(1, 12),
      msg: `Confirmed — your license was verified when you submitted your application. Everything checks out.

We're halfway through the interview. Questions 7–10 are coming up shortly. You can respond whenever you're ready — no time pressure. I'll check back in a few hours if I don't hear from you.

**Question 7 of 10:** Can you confirm you are physically able to stand, walk, and patrol for shifts up to 12 hours? Any physical limitations we should be aware of?` }
  ];

  for (const m of jordanMessages) {
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(chatMessages).values({
      id: m.id,
      workspaceId: WS,
      conversationId: 'conv-interview-jordan-001',
      senderId: m.sid,
      senderName: m.sname,
      senderType: m.stype,
      message: m.msg,
      messageType: 'text',
      createdAt: new Date(m.ts),
      updatedAt: new Date(m.ts),
    }).onConflictDoNothing();
  }

  // --- Conversation B: Samantha Cruz — interview COMPLETE ---
  // Converted to Drizzle ORM: ON CONFLICT
  await db.insert(chatConversations).values({
    id: 'conv-interview-samantha-001',
    workspaceId: WS,
    customerId: 'app-acme-004',
    customerName: 'Samantha Cruz',
    customerEmail: 'samantha.cruz.hsec@gmail.com',
    supportAgentId: 'trinity-bot',
    supportAgentName: 'Trinity AI',
    subject: 'Security Guard Interview — Lone Star Medical Center',
    status: 'open',
    priority: 'medium',
    conversationType: 'interview',
    createdAt: new Date(d(6, 3)),
    updatedAt: new Date(d(6)),
    lastMessageAt: new Date(d(6)),
  }).onConflictDoNothing();

  const samanthaMessages = [
    { id: 'msg-sc-001', sid: 'trinity-bot', sname: 'Trinity', stype: 'ai', ts: d(6, 3),
      msg: `Hello Samantha, I'm Trinity — the AI hiring assistant for Acme Security Services. Thank you for applying for the Unarmed Security Guard position at Lone Star Medical Center. Your Texas DPS Level II license has been verified — you're all clear to proceed.

I'll be conducting your initial interview today. There are 10 questions. Let's begin.

**Question 1 of 10:** What is your availability? Are you able to work nights, weekends, and holidays?` },
    { id: 'msg-sc-002', sid: 'app-acme-004', sname: 'Samantha Cruz', stype: 'guest', ts: d(6, 2),
      msg: `Hi Trinity! I'm fully available for all shifts. I actually prefer evening and overnight shifts because they're typically quieter and I focus better. I'm available every day of the week including all holidays — I worked Thanksgiving and Christmas last year without any issues. Flexibility is one of my strengths.` },
    { id: 'msg-sc-003', sid: 'trinity-bot', sname: 'Trinity', stype: 'ai', ts: d(6, 2),
      msg: `Excellent availability — and a preference for evenings aligns well with our open shift inventory.

**Question 2 of 10:** Tell me about your prior security experience. How many years and what types of environments?` },
    { id: 'msg-sc-004', sid: 'app-acme-004', sname: 'Samantha Cruz', stype: 'guest', ts: d(6, 1),
      msg: `Five years total. My first two were at Lone Star Regional Medical — actually the same network as Lone Star Medical Center — so I'm already familiar with healthcare security protocols, HIPAA confidentiality in hallway conversations, code situations, and behavioral health wing procedures. After that, I spent three years at a corporate campus doing executive protection and access control for a law firm. I know both environments well.` },
    { id: 'msg-sc-005', sid: 'trinity-bot', sname: 'Trinity', stype: 'ai', ts: d(6, 1),
      msg: `Five years with direct healthcare security experience is exactly what this client values. Your familiarity with the Lone Star network is a genuine differentiator.

**Question 3 of 10:** Why are you leaving or seeking to leave your current employer?` },
    { id: 'msg-sc-006', sid: 'app-acme-004', sname: 'Samantha Cruz', stype: 'guest', ts: d(5, 22),
      msg: `The corporate campus contract ended when the law firm relocated to Austin. It wasn't a performance issue at all — the whole Acme subcontract ended with the site. My supervisor gave me an excellent reference, which you're welcome to contact. I'm looking to return to healthcare security because that's where I feel most effective and where my experience adds the most value.` },
    { id: 'msg-sc-007', sid: 'trinity-bot', sname: 'Trinity', stype: 'ai', ts: d(5, 22),
      msg: `Contract end due to client relocation — completely understandable, and a positive departure circumstance.

**Question 4 of 10:** Situational: An agitated patient in the ER is refusing to stay in their assigned bay and is attempting to leave against medical advice while clearly in distress. What do you do?` },
    { id: 'msg-sc-008', sid: 'app-acme-004', sname: 'Samantha Cruz', stype: 'guest', ts: d(5, 20),
      msg: `This is a medical situation first, security situation second. My first action is to immediately alert the charge nurse and the attending physician — they are the authority here, not me. My role is to support the clinical team, not to detain anyone.

While the medical staff are responding, I position myself calmly nearby — not blocking, not threatening — just present in case the situation escalates to where someone could get hurt. I speak to the patient in a calm, low voice, affirm that everyone wants to help them, and make sure there are no bystanders in the way.

If the patient becomes physically aggressive, my job is to protect other patients and staff from harm, not to force the patient back into their bay. That's a clinical decision. I keep communication open with the charge nurse at every step.` },
    { id: 'msg-sc-009', sid: 'trinity-bot', sname: 'Trinity', stype: 'ai', ts: d(5, 20),
      msg: `Outstanding response — you correctly identified that medical authority supersedes security authority in patient situations, supported without overstepping, and prioritized bystander safety. That's textbook healthcare security.

**Question 5 of 10:** You catch a coworker sharing patient information in a hallway conversation with a non-staff visitor. What do you do?` },
    { id: 'msg-sc-010', sid: 'app-acme-004', sname: 'Samantha Cruz', stype: 'guest', ts: d(5, 18),
      msg: `HIPAA violation — I intervene immediately but discreetly. I approach, interrupt the conversation politely, and redirect the officer away from the visitor. I'd remind them that patient information discussions need to happen in a designated private area.

Then I document the incident and report it to my supervisor and the hospital's compliance liaison. This isn't optional — HIPAA compliance is a legal requirement and it protects both the patient and the facility. I'd also make sure the visitor didn't retain the information if possible.` },
    { id: 'msg-sc-011', sid: 'trinity-bot', sname: 'Trinity', stype: 'ai', ts: d(5, 18),
      msg: `Correct on all counts — immediate intervention, discreet redirect, documentation, and proper reporting chain. Healthcare-specific awareness is evident.

**Question 6 of 10:** Can you confirm your Texas DPS Level II license is active and in good standing?` },
    { id: 'msg-sc-012', sid: 'app-acme-004', sname: 'Samantha Cruz', stype: 'guest', ts: d(5, 17),
      msg: `Yes, license number TX-2024-77623, valid through August 2026. I completed my renewal last year and I'm current on my continuing education hours. I also carry a copy of my license card at all times — I understand it's required to be accessible during any shift.` },
    { id: 'msg-sc-013', sid: 'trinity-bot', sname: 'Trinity', stype: 'ai', ts: d(5, 17),
      msg: `Verified — your license was confirmed with 97% confidence at application submission.

**Question 7 of 10:** Are you physically able to stand, walk, and patrol for shifts up to 12 hours? Any limitations?` },
    { id: 'msg-sc-014', sid: 'app-acme-004', sname: 'Samantha Cruz', stype: 'guest', ts: d(5, 15),
      msg: `Absolutely. I've regularly worked 10 and 12 hour overnight shifts at Lone Star Regional. I'm in good physical condition — I run three times a week and I've never had to call out for physical reasons in five years of security work. No limitations.` },
    { id: 'msg-sc-015', sid: 'trinity-bot', sname: 'Trinity', stype: 'ai', ts: d(5, 15),
      msg: `Excellent physical fitness for shift demands.

**Question 8 of 10:** Have you ever been terminated from a security position?` },
    { id: 'msg-sc-016', sid: 'app-acme-004', sname: 'Samantha Cruz', stype: 'guest', ts: d(5, 14),
      msg: `Never. Five years, no terminations. My departures have been a contract expiration (most recent) and my choice to leave Lone Star Regional for the corporate role because the pay was better at the time. Both supervisors are listed as references and both would give positive reviews.` },
    { id: 'msg-sc-017', sid: 'trinity-bot', sname: 'Trinity', stype: 'ai', ts: d(5, 14),
      msg: `Clean employment history noted.

**Question 9 of 10:** If you disagreed with a direct order from your supervisor, what would you do?` },
    { id: 'msg-sc-018', sid: 'app-acme-004', sname: 'Samantha Cruz', stype: 'guest', ts: d(5, 12),
      msg: `I'd comply first, then raise the concern through proper channels. Unless the order is illegal or clearly puts someone in danger, the chain of command exists for a reason and I respect that. After the situation is handled, I'd request time to discuss my concern privately with the supervisor — professionally, not confrontationally. If I still disagreed after that conversation, I'd bring it to their manager or submit a written concern.` },
    { id: 'msg-sc-019', sid: 'trinity-bot', sname: 'Trinity', stype: 'ai', ts: d(5, 12),
      msg: `Mature, professional answer — compliance first, escalation through proper channels, no insubordination.

**Question 10 of 10 — Final question:** Do you have reliable transportation to report on time to assigned client sites in the Houston area?` },
    { id: 'msg-sc-020', sid: 'app-acme-004', sname: 'Samantha Cruz', stype: 'guest', ts: d(5, 10),
      msg: `Yes, I have a personal vehicle in good condition and I live 12 minutes from Lone Star Medical Center. I've never been late to a shift in five years of security work. Reliability is something I take seriously.` },
    { id: 'msg-sc-021', sid: 'trinity-bot', sname: 'Trinity', stype: 'ai', ts: d(5, 10),
      msg: `That completes your interview, Samantha. Thank you for your thorough, professional responses.

**Interview Summary:**
- All 10 questions answered
- De-escalation protocol: Excellent
- Healthcare compliance awareness: Outstanding
- Employment history: Clean — no terminations
- License status: Verified
- Availability: Full flexibility

I'm generating your assessment now and passing it to the Acme Security hiring team. You should expect to hear back within 2–3 business days.

Thank you again for your time. You represented yourself very well today.

— Trinity, Acme Security AI Hiring Assistant` }
  ];

  for (const m of samanthaMessages) {
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(chatMessages).values({
      id: m.id,
      workspaceId: WS,
      conversationId: 'conv-interview-samantha-001',
      senderId: m.sid,
      senderName: m.sname,
      senderType: m.stype,
      message: m.msg,
      messageType: 'text',
      createdAt: new Date(m.ts),
      updatedAt: new Date(m.ts),
    }).onConflictDoNothing();
  }

  // =========================================================================
  // 5. INTERVIEW SESSIONS
  // =========================================================================
  // Converted to Drizzle ORM: ON CONFLICT
  await db.insert(interviewSessions).values([
    {
      id: 'isess-acme-001',
      workspaceId: WS,
      applicantId: 'app-acme-003',
      jobPostingId: 'jp-acme-002',
      conversationId: 'conv-interview-jordan-001',
      sessionType: 'async',
      status: 'in_progress',
      questionSetId: 'iqs-unarmed-001',
      transcript: { questions_answered: 6, questions_total: 10, last_question: 7 },
      scoreBreakdown: { availability: 10, experience: 13, employment_history: 9, situational_1: 17, situational_2: 13, compliance: 14 },
      overallScore: null,
      transcriptSummary: null,
      completedAt: null,
      createdAt: new Date(d(2)),
    },
    {
      id: 'isess-acme-002',
      workspaceId: WS,
      applicantId: 'app-acme-004',
      jobPostingId: 'jp-acme-002',
      conversationId: 'conv-interview-samantha-001',
      sessionType: 'async',
      status: 'complete',
      questionSetId: 'iqs-unarmed-001',
      transcript: { questions_answered: 10, questions_total: 10 },
      scoreBreakdown: {
        availability: 10, experience: 15, employment_history: 10,
        situational_1: 19, situational_2: 17, compliance: 14,
        physical: 5, employment_clean: 15, chain_of_command: 9, logistics: 5,
        total: 82
      },
      overallScore: 82,
      transcriptSummary: 'Samantha Cruz completed all 10 interview questions. De-escalation protocol: Excellent. Healthcare compliance awareness: Outstanding. Employment history: Clean — no terminations. License verified at 97% confidence. Full availability including evenings and overnights. Trinity recommends for offer.',
      completedAt: new Date(d(5, 10)),
      createdAt: new Date(d(6, 3)),
    },
  ]).onConflictDoNothing();

  console.log('[HiringSeed] Acme hiring stress test data seeded successfully');
  return { success: true, message: 'Hiring seed data inserted: 3 job postings, 8 applicants, 2 interview sessions, 34 ChatDock messages' };
}
