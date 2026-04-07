/**
 * EXPANSION SPRINT — Acme Seed Data
 * Seeds all 8 modules for the dev-acme-security-ws workspace.
 * Idempotent — sentinel: subcontractor_companies WHERE id = 'sc-acme-001'
 */
import { db } from "../db";

const ACME = "dev-acme-security-ws";

function daysFromNow(d: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().split("T")[0];
}
function daysAgo(d: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt.toISOString().split("T")[0];
}
function ts(d: number, hoursAgo = 0): string {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  dt.setHours(dt.getHours() - hoursAgo);
  return dt.toISOString();
}

// CATEGORY C — Raw SQL retained: Expansion seed helper executes dynamic INSERT/DDL statements via db.$client | Tables: dynamic | Verified: 2026-03-23
async function q(sql: string, params: any[] = []): Promise<any> {
  return db.$client.query(sql, params);
}

export async function runExpansionSeed(): Promise<{ success: boolean; message: string }> {
  const { isProduction } = await import('../lib/isProduction');
  if (isProduction()) return { success: true, message: "Skipped — production" };

  // Sentinel check
  const check = await q(`SELECT id FROM subcontractor_companies WHERE id = 'sc-acme-001' LIMIT 1`);
  if (check.rows.length > 0) {
    return { success: true, message: "Expansion seed already run — skipped" };
  }

  console.log("[ExpansionSeed] Seeding all 8 modules for Acme workspace...");

  // ── Get Acme site IDs and employee IDs ─────────────────────────────────────
  const sites = (await q(`SELECT id, name FROM sites WHERE workspace_id = $1 LIMIT 5`, [ACME])).rows;
  const employees = (await q(
    `SELECT id, first_name, last_name, position FROM employees WHERE workspace_id = $1 AND is_active = true ORDER BY created_at LIMIT 10`,
    [ACME]
  )).rows;
  const clients = (await q(`SELECT id, company_name FROM clients WHERE workspace_id = $1 AND is_active = true LIMIT 5`, [ACME])).rows;

  const site1Id = sites[0]?.id || "site-acme-1";
  const site2Id = sites[1]?.id || "site-acme-2";
  const site3Id = sites[2]?.id || "site-acme-3";
  const officer1Id = employees[0]?.id || "emp-acme-1";
  const officer2Id = employees[1]?.id || "emp-acme-2";
  const officer3Id = employees[2]?.id || "emp-acme-3";
  const officer4Id = employees[3]?.id || "emp-acme-4";
  const client1Id = clients[0]?.id || "client-acme-1";
  const client2Id = clients[1]?.id || "client-acme-2";
  const client3Id = clients[2]?.id || "client-acme-3";

  // ─────────────────────────────────────────────────────────────────────────────
  // MODULE 1 — POST ORDER VERSIONS
  // ─────────────────────────────────────────────────────────────────────────────

  const officerIds = employees.slice(0, 4).map((e: any) => e.id);

  // Site 1: 3 versions
  await q(`INSERT INTO post_order_versions (id,workspace_id,site_id,version_number,title,content,change_summary,effective_date,created_by,is_current,requires_acknowledgment,acknowledgment_deadline,officers_required_to_acknowledge,acknowledged_count,pending_count,created_at)
    VALUES ($1,$2,$3,1,$4,$5,$6,$7,$8,FALSE,FALSE,NULL,$9,0,0,$10) ON CONFLICT (id) DO NOTHING`,
    ['pov-acme-s1-v1', ACME, site1Id, `${sites[0]?.name || 'Site 1'} — Post Orders v1`,
     `PATROL SCHEDULE: Officer shall conduct perimeter patrol every 2 hours.\nACCESS CONTROL: Visitor sign-in required at all entry points.\nEMERGENCY: Call 911 first, then supervisor.`,
     'Initial post order', daysAgo(60), officer1Id, JSON.stringify(officerIds), daysAgo(58)]);

  await q(`INSERT INTO post_order_versions (id,workspace_id,site_id,version_number,title,content,change_summary,effective_date,created_by,is_current,requires_acknowledgment,acknowledgment_deadline,officers_required_to_acknowledge,acknowledged_count,pending_count,created_at)
    VALUES ($1,$2,$3,2,$4,$5,$6,$7,$8,FALSE,TRUE,$9,$10,3,1,$11) ON CONFLICT (id) DO NOTHING`,
    ['pov-acme-s1-v2', ACME, site1Id, `${sites[0]?.name || 'Site 1'} — Post Orders v2`,
     `PATROL SCHEDULE: Officer shall conduct perimeter patrol every 90 minutes.\nACCESS CONTROL: Visitor sign-in + photo ID required.\nPARKING: Unauthorized vehicles towed at owner expense.\nEMERGENCY: Call 911 first, then supervisor.`,
     'Updated patrol frequency to 90 min. Added parking enforcement language.',
     daysAgo(30), officer1Id, daysAgo(25), JSON.stringify(officerIds), daysAgo(32)]);

  await q(`INSERT INTO post_order_versions (id,workspace_id,site_id,version_number,title,content,change_summary,effective_date,created_by,is_current,requires_acknowledgment,acknowledgment_deadline,officers_required_to_acknowledge,acknowledged_count,pending_count,created_at)
    VALUES ($1,$2,$3,3,$4,$5,$6,$7,$8,TRUE,TRUE,$9,$10,2,2,$11) ON CONFLICT (id) DO NOTHING`,
    ['pov-acme-s1-v3', ACME, site1Id, `${sites[0]?.name || 'Site 1'} — Post Orders v3`,
     `PATROL SCHEDULE: Officer shall conduct perimeter patrol every 90 minutes.\nACCESS CONTROL: Visitor sign-in + photo ID required.\nPARKING: Unauthorized vehicles towed at owner expense.\nNO TRESPASS LIST: See bulletin board for banned individuals.\nEMERGENCY: Call 911 first, then supervisor.`,
     'Added no-trespass list reference. Banned individual list posted.',
     daysFromNow(5), officer1Id, daysFromNow(7), JSON.stringify(officerIds), daysAgo(3)]);

  // Site 2: 2 versions
  await q(`INSERT INTO post_order_versions (id,workspace_id,site_id,version_number,title,content,change_summary,effective_date,created_by,is_current,requires_acknowledgment,acknowledgment_deadline,officers_required_to_acknowledge,acknowledged_count,pending_count,created_at)
    VALUES ($1,$2,$3,1,$4,$5,$6,$7,$8,FALSE,FALSE,NULL,$9,0,0,$10) ON CONFLICT (id) DO NOTHING`,
    ['pov-acme-s2-v1', ACME, site2Id, `${sites[1]?.name || 'Site 2'} — Post Orders v1`,
     `HOURS: 24/7 coverage.\nACCESS: Badge required for all personnel.\nEMERGENCY: Building evacuation plan posted at entrance.`,
     'Initial post order', daysAgo(90), officer1Id, JSON.stringify(officerIds.slice(0,3)), daysAgo(88)]);

  await q(`INSERT INTO post_order_versions (id,workspace_id,site_id,version_number,title,content,change_summary,effective_date,created_by,is_current,requires_acknowledgment,acknowledgment_deadline,officers_required_to_acknowledge,acknowledged_count,pending_count,created_at)
    VALUES ($1,$2,$3,2,$4,$5,$6,$7,$8,TRUE,TRUE,$9,$10,3,0,$11) ON CONFLICT (id) DO NOTHING`,
    ['pov-acme-s2-v2', ACME, site2Id, `${sites[1]?.name || 'Site 2'} — Post Orders v2`,
     `HOURS: 24/7 coverage.\nACCESS: Badge required for all personnel. Contractors must be escorted.\nEMERGENCY: Building evacuation plan posted at entrance.\nDAR: Daily activity report required every shift.`,
     'Added contractor escort policy. DAR requirement added.',
     daysAgo(7), officer1Id, daysFromNow(2), JSON.stringify(officerIds.slice(0,3)), daysAgo(7)]);

  // Acknowledgments for site 1 v3 (2 acknowledged, 2 pending)
  await q(`INSERT INTO post_order_version_acknowledgments (id,workspace_id,site_id,post_order_version_id,employee_id,acknowledged_at,acknowledgment_method)
    VALUES ($1,$2,$3,$4,$5,$6,'manual') ON CONFLICT DO NOTHING`,
    ['pova-001', ACME, site1Id, 'pov-acme-s1-v3', officer1Id, ts(1)]);
  await q(`INSERT INTO post_order_version_acknowledgments (id,workspace_id,site_id,post_order_version_id,employee_id,acknowledged_at,acknowledgment_method)
    VALUES ($1,$2,$3,$4,$5,$6,'chatdock') ON CONFLICT DO NOTHING`,
    ['pova-002', ACME, site1Id, 'pov-acme-s1-v3', officer2Id, ts(2)]);

  // ─────────────────────────────────────────────────────────────────────────────
  // MODULE 2 — INCIDENT PATTERNS
  // ─────────────────────────────────────────────────────────────────────────────

  await q(`INSERT INTO incident_patterns (id,workspace_id,pattern_type,pattern_scope,sites_affected,officers_involved,incident_count,first_occurrence,most_recent_occurrence,pattern_description,risk_level,recommended_action,status,created_by,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (id) DO NOTHING`,
    ['ip-acme-001', ACME, 'theft', 'multi_site',
     JSON.stringify([site1Id, site2Id, site3Id]), JSON.stringify([]),
     5, ts(28), ts(3),
     `I have identified a pattern of theft incidents across 3 sites in the past 30 days. This may indicate a systemic issue requiring a company-wide policy response. Incidents occurred at similar times (evening shift, 6–10 PM) across all affected sites.`,
     'high', 'Review access control policies at all three sites. Consider coordinating with local law enforcement. Increase officer visibility during evening hours.',
     'active', 'trinity', ts(2)]);

  await q(`INSERT INTO incident_patterns (id,workspace_id,pattern_type,pattern_scope,sites_affected,officers_involved,incident_count,first_occurrence,most_recent_occurrence,pattern_description,risk_level,recommended_action,status,created_by,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (id) DO NOTHING`,
    ['ip-acme-002', ACME, 'suspicious_activity', 'time_based',
     JSON.stringify([site1Id, site2Id]), JSON.stringify([]),
     6, ts(45), ts(1),
     `Incidents occur disproportionately during the midnight–3 AM window. 6 incidents in this time range over the past 45 days. Consider enhanced coverage or protocol changes during this window.`,
     'medium', 'Increase officer patrol frequency between midnight and 3 AM. Consider adding a second officer on night shifts.',
     'active', 'trinity', ts(1)]);

  await q(`INSERT INTO incident_patterns (id,workspace_id,pattern_type,pattern_scope,sites_affected,officers_involved,incident_count,first_occurrence,most_recent_occurrence,pattern_description,risk_level,recommended_action,status,created_by,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (id) DO NOTHING`,
    ['ip-acme-003', ACME, 'trespass', 'single_site',
     JSON.stringify([site3Id]), JSON.stringify([]),
     4, ts(22), ts(5),
     `${sites[2]?.name || 'Site 3'} has had 4 incidents of trespass in the past 30 days. This site may have environmental or security gap issues that need addressing. Incidents consistently occur at the northwest perimeter.`,
     'medium', 'Conduct a site security audit. Review fencing and lighting at the northwest perimeter. Consider adding surveillance camera coverage.',
     'active', 'trinity', ts(4)]);

  // ─────────────────────────────────────────────────────────────────────────────
  // MODULE 3 — CONTRACT RENEWALS
  // ─────────────────────────────────────────────────────────────────────────────

  // Contract expiring in 85 days
  await q(`INSERT INTO client_contracts (id,workspace_id,doc_type,client_id,client_name,title,content,status,total_value,term_end_date,annual_value,renewal_status,renewal_notice_days,created_at,updated_at)
    VALUES ($1,$2,'contract',$3,$4,$5,$6,'executed',$7,$8,$9,'not_started',90,NOW(),NOW()) ON CONFLICT (id) DO NOTHING`,
    ['renewal-acme-001', ACME, client1Id, clients[0]?.company_name || 'Riverside Plaza',
     'Security Services Agreement — Riverside Plaza',
     'This security services agreement covers all patrol and access control services.',
     84000, daysFromNow(85), 84000]);

  await q(`INSERT INTO contract_renewal_tasks (id,workspace_id,contract_id,task_type,due_date,status,trinity_action_taken,owner_notified)
    VALUES ($1,$2,$3,$4,$5,'pending',$6,TRUE) ON CONFLICT (id) DO NOTHING`,
    ['crt-001', ACME, 'renewal-acme-001', 'renewal_alert_90', daysFromNow(1),
     'Trinity notified owner: Riverside Plaza contract expires in 85 days. Proposal preparation recommended.']);

  // Contract expiring in 45 days (proposal already sent)
  await q(`INSERT INTO client_contracts (id,workspace_id,doc_type,client_id,client_name,title,content,status,total_value,term_end_date,annual_value,renewal_status,renewal_proposed_at,renewal_notice_days,created_at,updated_at)
    VALUES ($1,$2,'contract',$3,$4,$5,$6,'executed',$7,$8,$9,'proposed',$10,90,NOW(),NOW()) ON CONFLICT (id) DO NOTHING`,
    ['renewal-acme-002', ACME, client2Id, clients[1]?.company_name || 'Metro Corporate Park',
     'Security Services Agreement — Metro Corporate Park',
     'This security services agreement covers 24/7 patrol and monitoring services.',
     156000, daysFromNow(45), 156000, ts(15)]);

  await q(`INSERT INTO contract_renewal_tasks (id,workspace_id,contract_id,task_type,due_date,status,trinity_action_taken,owner_notified)
    VALUES ($1,$2,$3,$4,$5,'pending',$6,TRUE) ON CONFLICT (id) DO NOTHING`,
    ['crt-002', ACME, 'renewal-acme-002', 'renewal_alert_60', daysFromNow(1),
     'Trinity follow-up: Metro Corporate Park renewal is still pending. Proposal was sent 15 days ago.']);

  // Contract expired last month
  await q(`INSERT INTO client_contracts (id,workspace_id,doc_type,client_id,client_name,title,content,status,total_value,term_end_date,annual_value,renewal_status,renewal_notice_days,created_at,updated_at)
    VALUES ($1,$2,'contract',$3,$4,$5,$6,'expired',$7,$8,$9,'not_started',90,NOW(),NOW()) ON CONFLICT (id) DO NOTHING`,
    ['renewal-acme-003', ACME, client3Id, clients[2]?.company_name || 'Westgate Industrial',
     'Security Services Agreement — Westgate Industrial',
     'This security services agreement covers warehouse patrol and perimeter security.',
     62400, daysAgo(35), 62400]);

  // ─────────────────────────────────────────────────────────────────────────────
  // MODULE 4 — APPLICANT TRACKING
  // ─────────────────────────────────────────────────────────────────────────────

  await q(`INSERT INTO job_postings (id,workspace_id,title,description,position_type,employment_type,pay_rate_min,pay_rate_max,status,applications_count,created_by,created_at,posted_at)
    VALUES ($1,$2,$3,$4,'armed','full_time',$5,$6,'active',5,$7,NOW(),NOW()) ON CONFLICT (id) DO NOTHING`,
    ['jp-acme-001', ACME,
     'Armed Security Officer — Commercial District',
     'Seeking experienced armed security officers for commercial client sites. Texas DPS Guard Card and LTC required. Minimum 2 years experience.',
     18.00, 24.00, officer1Id]);

  const applicants = [
    ['app-acme-001', 'Marcus', 'Thompson', 'marcus.thompson@email.com', '(214) 555-0101',
     true, 'GC-2024-112233', daysFromNow(180), true, 7, 85,
     '+30: Guard card. +10: Valid 6mo+. +20: Armed endorsement. +15: 7yr experience. +10: Complete application. +5: Applied for position.',
     'reviewing'],
    ['app-acme-002', 'Jennifer', 'Rodriguez', 'jennifer.r@email.com', '(972) 555-0202',
     true, 'GC-2024-445566', daysFromNow(90), false, 4, 75,
     '+30: Guard card. +10: Valid 6mo+. +15: 4yr experience. +10: Complete. +5: Position match. +5: References.',
     'interview_scheduled'],
    ['app-acme-003', 'David', 'Kim', 'david.kim@email.com', '(817) 555-0303',
     true, 'GC-2023-778899', daysFromNow(45), false, 2, 52,
     '+30: Guard card. +10: 2yr experience. +10: Complete application. +5: Position match.',
     'applied'],
    ['app-acme-004', 'Sarah', 'Martinez', 'sarah.m@email.com', '(214) 555-0404',
     false, null, null, false, 1, 35,
     '+10: 1yr experience. +10: Complete. +5: References. +10: Applied for position.',
     'applied'],
    ['app-acme-005', 'Robert', 'Jones', 'r.jones@email.com', '(972) 555-0505',
     false, null, null, false, 0, 10,
     '+10: Complete application.',
     'rejected'],
  ];

  for (const [id, fn, ln, email, phone, gc, gcn, gcexp, armed, yoe, score, rationale, status] of applicants) {
    await q(`INSERT INTO applicants (id,workspace_id,job_posting_id,first_name,last_name,email,phone,has_guard_card,guard_card_number,guard_card_expiration,has_armed_endorsement,years_experience,applied_at,status,trinity_score,trinity_score_rationale)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),$13,$14,$15) ON CONFLICT (id) DO NOTHING`,
      [id, ACME, 'jp-acme-001', fn, ln, email, phone, gc, gcn, gcexp, armed, yoe, status, score, rationale]);
  }

  // Interview for app-acme-002
  await q(`INSERT INTO applicant_interviews (id,workspace_id,applicant_id,scheduled_at,interviewer_id,interview_type,status,created_at)
    VALUES ($1,$2,$3,$4,$5,'in_person','scheduled',NOW()) ON CONFLICT (id) DO NOTHING`,
    ['int-acme-001', ACME, 'app-acme-002', daysFromNow(3), officer1Id]);

  // Offer letter for app-acme-001
  await q(`INSERT INTO offer_letters (id,workspace_id,applicant_id,position,start_date,pay_rate,pay_type,employment_type,reporting_to,offer_sent_at,offer_expires_at,status,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,'hourly','full_time',$7,NOW(),$8,'sent',NOW()) ON CONFLICT (id) DO NOTHING`,
    ['ol-acme-001', ACME, 'app-acme-001', 'Armed Security Officer', daysFromNow(14),
     21.00, 'Field Supervisor', daysFromNow(7)]);
  await q(`UPDATE applicants SET status = 'offer_sent' WHERE id = 'app-acme-001' AND workspace_id = $1`, [ACME]);

  // ─────────────────────────────────────────────────────────────────────────────
  // MODULE 5 — TRAINING REQUIREMENTS & RECORDS
  // ─────────────────────────────────────────────────────────────────────────────

  const requirements = [
    ['req-tx-guard-card', null, 'Texas DPS Guard Card', 'license', '[]', '["officer","armed","unarmed"]', 'annual', 12, 'block_all', true, 'TX', 'Texas Occupations Code Chapter 1702'],
    ['req-tx-firearms', null, 'Texas Firearms Qualification', 'firearms', '["armed"]', '["armed"]', 'annual', 12, 'block_armed', true, 'TX', 'TAC Chapter 35'],
    ['req-first-aid', null, 'First Aid / CPR Certification', 'first_aid', '[]', '["officer","armed","unarmed","supervisor"]', 'biennial', 24, 'warning', true, 'TX', 'OSHA 1910.151'],
    ['req-de-escalation', null, 'De-escalation Training', 'de_escalation', '[]', '["officer","armed","unarmed","supervisor"]', 'annual', 12, 'warning', false, 'TX', null],
    ['req-company-policy', null, 'Annual Company Policy Review', 'company_policy', '[]', '["officer","armed","unarmed","supervisor","manager"]', 'annual', 12, 'notify_only', false, null, null],
    ['req-harassment', null, 'Texas Sexual Harassment Prevention', 'annual_training', '[]', '["officer","armed","unarmed","supervisor","manager"]', 'annual', 12, 'notify_only', true, 'TX', 'Texas Labor Code Chapter 21'],
  ];

  for (const [id, wid, name, type, pos, roles, freq, freqM, consequence, stateReq, state, ref] of requirements) {
    await q(`INSERT INTO training_requirements (id,workspace_id,requirement_name,requirement_type,applies_to_positions,applies_to_roles,frequency,frequency_months,consequence_of_expiry,state_required,state_code,regulatory_reference,active,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,NOW()) ON CONFLICT (id) DO NOTHING`,
      [id, wid, name, type, pos, roles, freq, freqM, consequence, stateReq, state, ref]);
  }

  // Training records for 4 officers
  // Officer 1 (Marcus Rodriguez equivalent): all current
  await q(`INSERT INTO employee_training_records (id,workspace_id,employee_id,requirement_id,training_name,completion_date,expiration_date,provider_name,certificate_number,verified,status,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,'current',NOW()) ON CONFLICT (id) DO NOTHING`,
    ['etr-001', ACME, officer1Id, 'req-tx-guard-card', 'Texas DPS Guard Card Renewal',
     daysAgo(180), daysFromNow(185), 'Texas DPS', 'GC-2024-001-A']);
  await q(`INSERT INTO employee_training_records (id,workspace_id,employee_id,requirement_id,training_name,completion_date,expiration_date,provider_name,verified,status,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,'current',NOW()) ON CONFLICT (id) DO NOTHING`,
    ['etr-002', ACME, officer1Id, 'req-tx-firearms', 'Annual Firearms Qualification',
     daysAgo(90), daysFromNow(275), 'Lone Star Range']);
  await q(`INSERT INTO employee_training_records (id,workspace_id,employee_id,requirement_id,training_name,completion_date,expiration_date,provider_name,verified,status,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,'current',NOW()) ON CONFLICT (id) DO NOTHING`,
    ['etr-003', ACME, officer1Id, 'req-first-aid', 'First Aid / CPR',
     daysAgo(30), daysFromNow(700), 'Red Cross']);

  // Officer 2: firearms qualification expiring in 25 days
  await q(`INSERT INTO employee_training_records (id,workspace_id,employee_id,requirement_id,training_name,completion_date,expiration_date,provider_name,certificate_number,verified,status,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,'current',NOW()) ON CONFLICT (id) DO NOTHING`,
    ['etr-004', ACME, officer2Id, 'req-tx-guard-card', 'Texas DPS Guard Card',
     daysAgo(340), daysFromNow(25), 'Texas DPS', 'GC-2023-002-B']);
  await q(`INSERT INTO employee_training_records (id,workspace_id,employee_id,requirement_id,training_name,completion_date,expiration_date,provider_name,verified,status,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,'expiring_soon',NOW()) ON CONFLICT (id) DO NOTHING`,
    ['etr-005', ACME, officer2Id, 'req-tx-firearms', 'Annual Firearms Qualification',
     daysAgo(340), daysFromNow(25), 'Lone Star Range']);

  // Officer 3: de-escalation training expired
  await q(`INSERT INTO employee_training_records (id,workspace_id,employee_id,requirement_id,training_name,completion_date,expiration_date,provider_name,verified,status,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,'expired',NOW()) ON CONFLICT (id) DO NOTHING`,
    ['etr-006', ACME, officer3Id, 'req-de-escalation', 'De-escalation Training',
     daysAgo(400), daysAgo(35), 'TexasSec Training Center']);
  await q(`INSERT INTO employee_training_records (id,workspace_id,employee_id,requirement_id,training_name,completion_date,expiration_date,provider_name,verified,status,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,'current',NOW()) ON CONFLICT (id) DO NOTHING`,
    ['etr-007', ACME, officer3Id, 'req-tx-guard-card', 'Texas DPS Guard Card',
     daysAgo(60), daysFromNow(305), 'Texas DPS']);

  // Officer 4: guard card expiring in 40 days
  await q(`INSERT INTO employee_training_records (id,workspace_id,employee_id,requirement_id,training_name,completion_date,expiration_date,provider_name,certificate_number,verified,status,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,'expiring_soon',NOW()) ON CONFLICT (id) DO NOTHING`,
    ['etr-008', ACME, officer4Id, 'req-tx-guard-card', 'Texas DPS Guard Card',
     daysAgo(325), daysFromNow(40), 'Texas DPS', 'GC-2023-004-D']);

  // ─────────────────────────────────────────────────────────────────────────────
  // MODULE 6 — SUBCONTRACTOR COMPANIES
  // ─────────────────────────────────────────────────────────────────────────────

  await q(`INSERT INTO subcontractor_companies (id,workspace_id,company_name,dba_name,contact_name,contact_email,contact_phone,company_license_number,company_license_state,company_license_expiration,insurance_coi_path,insurance_expiration,insurance_coverage_amount,hourly_rate,status,notes,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'TX',$9,$10,$11,$12,$13,'active',$14,NOW()) ON CONFLICT (id) DO NOTHING`,
    ['sc-acme-001', ACME, 'Texas Shield Security LLC', 'Texas Shield',
     'Carlos Mendez', 'carlos@txshield.com', '(214) 555-1100',
     'TX-PSB-2024-8812', daysFromNow(280),
     '/uploads/coi/txshield-2024.pdf', daysFromNow(150),
     2000000.00, 19.50, 'Primary overflow subcontractor. Excellent reliability record.']);

  await q(`INSERT INTO subcontractor_companies (id,workspace_id,company_name,contact_name,contact_email,contact_phone,company_license_number,company_license_state,company_license_expiration,insurance_expiration,insurance_coverage_amount,hourly_rate,status,notes,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,'TX',$8,$9,$10,$11,'active',$12,NOW()) ON CONFLICT (id) DO NOTHING`,
    ['sc-acme-002', ACME, 'Lone Star Coverage Inc',
     'Patricia Williams', 'pwilliams@lonestarcov.com', '(972) 555-2200',
     'TX-PSB-2023-5541', daysFromNow(200),
     daysFromNow(20), 1000000.00, 17.00,
     'COI expiring soon — renewal requested. Use with caution until renewed.']);

  // ─────────────────────────────────────────────────────────────────────────────
  // MODULE 7 — CLIENT SATISFACTION
  // ─────────────────────────────────────────────────────────────────────────────

  // Client 1: stable (score 4.5)
  await q(`INSERT INTO client_satisfaction_records (id,workspace_id,client_id,check_in_type,check_in_date,conducted_by,satisfaction_score,nps_score,feedback_text,issues_raised,issues_resolved,follow_up_required,created_at)
    VALUES ($1,$2,$3,'scheduled',$4,$5,$6,$7,$8,$9,TRUE,FALSE,NOW()) ON CONFLICT (id) DO NOTHING`,
    ['csr-001', ACME, client1Id, daysAgo(90), officer1Id, 4.5, 9,
     'Very pleased with service. Officers are professional and responsive. Minor concern about shift change timing.',
     JSON.stringify(['Shift change communication'])]);

  await q(`INSERT INTO client_satisfaction_records (id,workspace_id,client_id,check_in_type,check_in_date,conducted_by,satisfaction_score,nps_score,feedback_text,issues_raised,issues_resolved,follow_up_required,created_at)
    VALUES ($1,$2,$3,'scheduled',$4,$5,$6,$7,$8,$9,TRUE,FALSE,NOW()) ON CONFLICT (id) DO NOTHING`,
    ['csr-002', ACME, client1Id, daysAgo(7), officer1Id, 4.5, 9,
     'Continued strong performance. No outstanding concerns.',
     JSON.stringify([])]);

  // Client 2: declining (3.5 -> 3.0 -> 2.5) — churn risk
  await q(`INSERT INTO client_satisfaction_records (id,workspace_id,client_id,check_in_type,check_in_date,conducted_by,satisfaction_score,nps_score,feedback_text,issues_raised,issues_resolved,follow_up_required,created_at)
    VALUES ($1,$2,$3,'scheduled',$4,$5,$6,$7,$8,$9,FALSE,TRUE,NOW()) ON CONFLICT (id) DO NOTHING`,
    ['csr-003', ACME, client2Id, daysAgo(90), officer1Id, 3.5, 6,
     'Some concerns about response times and coverage gaps on weekends.',
     JSON.stringify(['Weekend coverage gaps', 'Response time issues'])]);

  await q(`INSERT INTO client_satisfaction_records (id,workspace_id,client_id,check_in_type,check_in_date,conducted_by,satisfaction_score,nps_score,feedback_text,issues_raised,issues_resolved,follow_up_required,created_at)
    VALUES ($1,$2,$3,'incident_triggered',$4,$5,$6,$7,$8,$9,FALSE,TRUE,NOW()) ON CONFLICT (id) DO NOTHING`,
    ['csr-004', ACME, client2Id, daysAgo(45), officer1Id, 3.0, 5,
     'Weekend coverage improved slightly but billing disputes remain. We are evaluating alternatives.',
     JSON.stringify(['Billing dispute', 'Communication gaps'])]);

  await q(`INSERT INTO client_satisfaction_records (id,workspace_id,client_id,check_in_type,check_in_date,conducted_by,satisfaction_score,nps_score,feedback_text,issues_raised,issues_resolved,follow_up_required,created_at)
    VALUES ($1,$2,$3,'scheduled',$4,$5,$6,$7,$8,$9,FALSE,TRUE,NOW()) ON CONFLICT (id) DO NOTHING`,
    ['csr-005', ACME, client2Id, daysAgo(5), officer1Id, 2.5, 3,
     'Significant concerns. Multiple officers did not show up for their shifts last week. We are seriously considering other vendors.',
     JSON.stringify(['No-show officers', 'Scheduling failures', 'Lack of communication'])]);

  await q(`INSERT INTO client_concerns (id,workspace_id,client_id,concern_type,severity,description,raised_at,raised_by,assigned_to,status)
    VALUES ($1,$2,$3,'coverage_gap','critical',$4,$5,$6,$7,'open') ON CONFLICT (id) DO NOTHING`,
    ['cc-001', ACME, client2Id,
     'Three officers failed to show for scheduled shifts on Nov 12-14. Client threatened contract cancellation.',
     ts(5), officer1Id, officer1Id]);

  // Client 3: stable, check-in due
  await q(`INSERT INTO client_satisfaction_records (id,workspace_id,client_id,check_in_type,check_in_date,conducted_by,satisfaction_score,nps_score,feedback_text,issues_raised,issues_resolved,follow_up_required,created_at)
    VALUES ($1,$2,$3,'scheduled',$4,$5,$6,$7,$8,$9,TRUE,FALSE,NOW()) ON CONFLICT (id) DO NOTHING`,
    ['csr-006', ACME, client3Id, daysAgo(95), officer1Id, 4.0, 7,
     'Generally happy. Officers are professional. Would appreciate more proactive communication.',
     JSON.stringify(['Proactive communication'])]);

  // ─────────────────────────────────────────────────────────────────────────────
  // MODULE 8 — PROPOSALS / BID ANALYTICS
  // ─────────────────────────────────────────────────────────────────────────────

  // Proposal 1: Won — this client is now active
  await q(`INSERT INTO pipeline_deals (id,workspace_id,prospect_company,prospect_contact_name,prospect_email,stage,estimated_monthly_value,proposal_type,decision_maker_name,decision_maker_title,our_differentiators,actual_close_date,converted_to_client_id,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,'won',$6,'new_client',$7,$8,$9,$10,$11,$12,NOW()) ON CONFLICT (id) DO NOTHING`,
    ['deal-acme-001', ACME, 'Riverside Plaza Management', 'Tom Garrison', 'tgarrison@riverside.com',
     7000, 'Linda Garrison', 'Property Manager',
     'Armed officers with LTC, 24/7 Trinity monitoring, real-time incident reporting.',
     daysAgo(45), client1Id, daysAgo(45)]);

  // Proposal 2: Lost (price reason)
  await q(`INSERT INTO pipeline_deals (id,workspace_id,prospect_company,prospect_contact_name,prospect_email,stage,estimated_monthly_value,proposal_type,decision_maker_name,loss_reason,actual_close_date,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,'lost',$6,'new_client',$7,$8,$9,$10,NOW()) ON CONFLICT (id) DO NOTHING`,
    ['deal-acme-002', ACME, 'Northgate Shopping Center', 'Mike Chen', 'mchen@northgate.com',
     4500, 'Mike Chen', 'price', daysAgo(20), daysAgo(60)]);

  // Proposal 3: In progress — decision in 10 days
  await q(`INSERT INTO pipeline_deals (id,workspace_id,prospect_company,prospect_contact_name,prospect_email,stage,estimated_monthly_value,proposal_type,decision_maker_name,decision_maker_title,expected_close_date,our_differentiators,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,'proposal',$6,'new_client',$7,$8,$9,$10,$11,NOW()) ON CONFLICT (id) DO NOTHING`,
    ['deal-acme-003', ACME, 'Lakewood Medical Center', 'Dr. Angela Foster', 'afoster@lakewood-med.com',
     12000, 'Dr. Angela Foster', 'COO',
     daysFromNow(10), 'Healthcare security expertise, HIPAA-compliant incident reporting, armed officers.',
     daysAgo(14)]);

  // Proposal 4: No response — 20 days old
  await q(`INSERT INTO pipeline_deals (id,workspace_id,prospect_company,prospect_contact_name,prospect_email,stage,estimated_monthly_value,proposal_type,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,'rfp',$6,'new_client',$7,$8) ON CONFLICT (id) DO NOTHING`,
    ['deal-acme-004', ACME, 'Pinnacle Office Towers', 'Rachel Kim', 'rkim@pinnacle-towers.com',
     9500, daysAgo(20), daysAgo(20)]);

  // Generate bid analytics snapshot
  await q(`INSERT INTO bid_analytics (id,workspace_id,period_start,period_end,total_bids_submitted,total_bids_won,total_bids_lost,total_bids_no_response,win_rate_pct,average_proposal_value,total_pipeline_value,total_won_value,average_days_to_close,most_common_loss_reason,generated_at)
    VALUES ($1,$2,$3,$4,4,1,1,1,50.0,8250,255000,84000,45,'price',NOW()) ON CONFLICT DO NOTHING`,
    ['ba-acme-001', ACME, daysAgo(180), daysAgo(0)]);

  console.log("[ExpansionSeed] All 8 modules seeded successfully.");
  return { success: true, message: "Expansion seed completed successfully" };
}
