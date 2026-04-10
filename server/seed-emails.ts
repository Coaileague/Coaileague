/**
 * Email Seed Data Script
 * Creates 100 diverse internal emails for testing the email system
 * Covers: incidents, scheduling, compliance, HR, client issues, Trinity AI requests
 */

import { db } from "./db";
import { internalEmails, internalMailboxes, internalEmailRecipients, internalEmailFolders, users, workspaces } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

interface EmailTemplate {
  subject: string;
  body: string;
  category: 'incident' | 'scheduling' | 'compliance' | 'hr' | 'client' | 'payroll' | 'training' | 'system' | 'trinity_request';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  requiresTrinityAction?: boolean;
}

const EMAIL_TEMPLATES: EmailTemplate[] = [
  // === INCIDENT REPORTS (15) ===
  { subject: "URGENT: Unauthorized access attempt at Site Alpha", body: "Security detected an individual attempting to enter the building through the loading dock without proper credentials. Guards responded and the individual fled. Please review camera footage from 2:34 AM.", category: "incident", priority: "urgent", requiresTrinityAction: true },
  { subject: "Property damage reported - Client: TechCorp", body: "During the overnight shift, Officer Johnson discovered graffiti on the east wall of the facility. Photos have been documented. Client has been notified and is requesting a formal incident report for insurance.", category: "incident", priority: "high" },
  { subject: "Medical emergency on site - Employee needs follow-up", body: "James Davis experienced chest pains during his shift at Healthcare Plus. Paramedics were called and he was transported to County General. Please ensure workers comp paperwork is initiated.", category: "incident", priority: "urgent", requiresTrinityAction: true },
  { subject: "Suspicious package found at main entrance", body: "A security officer discovered an unattended backpack near the main entrance. Following protocol, the area was evacuated and local authorities were notified. All clear has been given.", category: "incident", priority: "high" },
  { subject: "Vehicle break-in in employee parking lot", body: "Two employees reported their vehicles were broken into during the night shift. Windows smashed, personal items stolen. Police report #2024-5847 has been filed.", category: "incident", priority: "normal" },
  { subject: "Fire alarm activation - False alarm confirmed", body: "The fire alarm was triggered in Building C at 11:42 PM due to a malfunctioning smoke detector. Fire department responded, confirmed false alarm. Maintenance has been notified.", category: "incident", priority: "normal" },
  { subject: "Altercation between two individuals on property", body: "Two individuals were involved in a verbal altercation near the food court. Security intervened before it became physical. Both parties were escorted off premises.", category: "incident", priority: "high" },
  { subject: "Water leak discovered in server room", body: "URGENT: Water leak detected above server racks in the data center. Facilities and IT have been notified. Emergency tarps deployed to protect equipment.", category: "incident", priority: "urgent", requiresTrinityAction: true },
  { subject: "Slip and fall incident - Visitor injured", body: "A visitor slipped on wet floor near the cafeteria entrance. First aid was administered. The individual declined ambulance but may file a claim. Witness statements attached.", category: "incident", priority: "high" },
  { subject: "Theft from employee locker room", body: "Multiple employees reported personal items missing from the locker room. Security reviewing footage. Affected employees: Martinez, Chen, Williams.", category: "incident", priority: "normal" },
  { subject: "Power outage affecting multiple zones", body: "Partial power outage reported in Zones 3-5. Backup generators activated for critical systems. Facilities investigating root cause.", category: "incident", priority: "high" },
  { subject: "Threatening phone call received at reception", body: "Reception received an anonymous threatening call at 3:15 PM. Call has been recorded and authorities notified. Increased security presence recommended.", category: "incident", priority: "urgent", requiresTrinityAction: true },
  { subject: "Equipment malfunction - Card reader failure", body: "Access card readers at the north entrance are not functioning. Manual log-in procedures implemented until repairs complete.", category: "incident", priority: "normal" },
  { subject: "Vandalism discovered in restroom facilities", body: "Significant vandalism discovered in the second-floor men's restroom. Mirrors broken, sinks damaged. Reviewing footage to identify responsible party.", category: "incident", priority: "normal" },
  { subject: "Lost child found on premises", body: "A young child (approx. 5 years old) was found wandering near the playground. Child has been reunited with parent. No further action required.", category: "incident", priority: "low" },

  // === SCHEDULING (15) ===
  { subject: "Shift swap request - Sarah and Michael", body: "Sarah Johnson is requesting to swap her Thursday evening shift with Michael Chen's Friday morning shift. Both parties have agreed. Please approve in the system.", category: "scheduling", priority: "normal" },
  { subject: "URGENT: Need coverage for night shift tomorrow", body: "Officer Patterson called in sick. We need immediate coverage for the 10 PM - 6 AM shift at TechCorp facility. Overtime authorized.", category: "scheduling", priority: "urgent", requiresTrinityAction: true },
  { subject: "Holiday schedule draft for review", body: "Attached is the proposed holiday schedule for December. Please review and provide feedback by Friday. Key dates: Christmas Eve, Christmas Day, New Year's Eve.", category: "scheduling", priority: "normal" },
  { subject: "Request for reduced hours - Emma Williams", body: "Emma Williams is requesting to move to part-time status (20 hours/week) starting next month due to family obligations. Please process accordingly.", category: "scheduling", priority: "normal" },
  { subject: "New client site - Staff assignments needed", body: "We've won the contract for Retail Solutions headquarters. Need to assign 3 full-time officers starting Monday. Please recommend qualified candidates.", category: "scheduling", priority: "high", requiresTrinityAction: true },
  { subject: "Overtime approval request - Multiple employees", body: "Several employees have accumulated overtime this week: Davis (8 hrs), Martinez (12 hrs), Chen (6 hrs). Requesting approval for payroll processing.", category: "scheduling", priority: "normal" },
  { subject: "Training schedule conflict - Need resolution", body: "The mandatory compliance training scheduled for Tuesday conflicts with three employees' shifts. Need to either reschedule or find coverage.", category: "scheduling", priority: "normal" },
  { subject: "Vacation request - James Davis - 2 weeks", body: "James Davis is requesting vacation leave from December 15-29. He has 12 PTO days available. Manager approval pending.", category: "scheduling", priority: "low" },
  { subject: "Site closure notification - Temporary assignment changes", body: "The Downtown Plaza site will be closed for renovations from Jan 15-Feb 15. All assigned staff need temporary reassignment to other locations.", category: "scheduling", priority: "high" },
  { subject: "On-call schedule for next month", body: "Please find attached the on-call rotation for February. Review and confirm availability. Any conflicts must be reported within 48 hours.", category: "scheduling", priority: "normal" },
  { subject: "Shift bid period opening next week", body: "The quarterly shift bid period opens Monday. Seniority-based selection as per union agreement. All preferences due by Friday 5 PM.", category: "scheduling", priority: "normal" },
  { subject: "Last-minute callout - Need immediate coverage", body: "Lisa Martinez called out for her 2 PM shift at Healthcare Plus. Patient visiting area needs coverage ASAP. Please respond if available.", category: "scheduling", priority: "urgent", requiresTrinityAction: true },
  { subject: "Extended hours request from client", body: "TechCorp is requesting 24/7 coverage starting next week (currently only 6 AM - 10 PM). Need to hire additional staff or authorize significant overtime.", category: "scheduling", priority: "high" },
  { subject: "Jury duty notification - Officer Thompson", body: "Officer Thompson has been summoned for jury duty starting November 12. Expected duration 1-2 weeks. Need to arrange coverage.", category: "scheduling", priority: "normal" },
  { subject: "Summer schedule adjustments needed", body: "With three employees taking extended summer vacations, we need to adjust the June-August schedules. Draft attached for review.", category: "scheduling", priority: "normal" },

  // === COMPLIANCE (15) ===
  { subject: "License expiration warning - 3 guards affected", body: "The following employees have security licenses expiring within 30 days: Johnson (Nov 15), Davis (Nov 22), Martinez (Dec 1). Renewal process must begin immediately.", category: "compliance", priority: "urgent", requiresTrinityAction: true },
  { subject: "Annual OSHA inspection scheduled", body: "OSHA has scheduled our annual workplace safety inspection for December 10. All sites must ensure compliance documentation is up to date.", category: "compliance", priority: "high" },
  { subject: "Background check renewal required", body: "Per company policy, 5-year background check renewals are required for: Chen, Williams, Thompson. Please initiate the process.", category: "compliance", priority: "normal" },
  { subject: "New state regulation - Overtime rules changing", body: "New state labor law effective January 1 changes overtime calculation. All supervisors must complete the attached training module by December 15.", category: "compliance", priority: "high" },
  { subject: "Missing I-9 documentation - 2 employees", body: "Audit revealed missing I-9 documentation for recently hired employees: Garcia and Patel. Documents must be collected within 3 business days.", category: "compliance", priority: "urgent" },
  { subject: "CPR certification expiring - 8 employees", body: "Eight employees have CPR/First Aid certifications expiring next month. Training class scheduled for November 20. Please confirm attendance.", category: "compliance", priority: "normal" },
  { subject: "Drug testing requirement - Random selection", body: "Random drug testing has selected the following employees: Davis, Chen, Williams, Martinez. Testing must be completed within 48 hours.", category: "compliance", priority: "high" },
  { subject: "Uniform compliance audit results", body: "Recent uniform inspection revealed 4 employees not meeting dress code standards. Warning notices have been issued. Please review attached report.", category: "compliance", priority: "normal" },
  { subject: "Client contract renewal - Compliance review needed", body: "The TechCorp contract renewal requires an updated compliance certification. Legal and HR must verify all requirements are met.", category: "compliance", priority: "normal" },
  { subject: "Workers compensation insurance renewal", body: "Annual workers comp insurance renewal due November 30. Updated employee roster and claims history required for premium calculation.", category: "compliance", priority: "high" },
  { subject: "Privacy training completion reminder", body: "Annual privacy and data protection training must be completed by all staff by month end. 12 employees have not yet completed the module.", category: "compliance", priority: "normal" },
  { subject: "Fire safety inspection - Minor violations found", body: "Yesterday's fire inspection identified 3 minor violations: blocked exit (corrected), expired extinguisher (replaced), missing signage (ordered).", category: "compliance", priority: "normal" },
  { subject: "New hire orientation checklist incomplete", body: "New employees Garcia and Thompson have incomplete orientation checklists. Missing: security acknowledgment, equipment sign-off, emergency procedures.", category: "compliance", priority: "normal" },
  { subject: "Client audit request - Documentation needed", body: "Healthcare Plus is conducting a vendor audit and requires copies of all employee certifications, insurance certificates, and training records.", category: "compliance", priority: "high" },
  { subject: "Sexual harassment training deadline approaching", body: "California law requires annual harassment training. 15 employees have not completed the required 2-hour course. Deadline: November 30.", category: "compliance", priority: "urgent", requiresTrinityAction: true },

  // === HR ISSUES (15) ===
  { subject: "Employee complaint filed - Workplace conflict", body: "A formal complaint has been filed by Emma Williams regarding hostile behavior from a coworker. HR investigation must be initiated per policy.", category: "hr", priority: "high", requiresTrinityAction: true },
  { subject: "Resignation notice - Lead Technician position", body: "Sarah Johnson has submitted her 2-week resignation notice effective November 15. Exit interview scheduled. Need to begin recruitment for replacement.", category: "hr", priority: "high" },
  { subject: "Performance improvement plan - James Davis", body: "Following multiple tardiness incidents, James Davis has been placed on a 30-day performance improvement plan. Documentation attached.", category: "hr", priority: "normal" },
  { subject: "New hire paperwork complete - Ready for onboarding", body: "All background checks and paperwork cleared for new hire Robert Kim. Start date: Monday. Please prepare training schedule and equipment.", category: "hr", priority: "normal" },
  { subject: "FMLA leave request - Employee medical condition", body: "Michael Chen has requested FMLA leave for a recurring medical condition. Medical certification received. Intermittent leave approved.", category: "hr", priority: "normal" },
  { subject: "Workplace injury claim filed", body: "Officer Patterson filed a workplace injury claim after straining his back during a patrol. Medical treatment received. Light duty assignment recommended.", category: "hr", priority: "high" },
  { subject: "Annual review schedule for November", body: "Annual performance reviews must be completed for all employees by November 30. Attached is the schedule and evaluation forms.", category: "hr", priority: "normal" },
  { subject: "Pay raise request - Lisa Martinez", body: "Lisa Martinez has formally requested a pay increase citing market rates and 3 years of service. Current rate: $70/hr. Requesting $75/hr.", category: "hr", priority: "normal" },
  { subject: "Disciplinary action - Policy violation", body: "Employee Rodriguez was found sleeping during an overnight shift. This is the second documented offense. Written warning issued, final warning status.", category: "hr", priority: "high" },
  { subject: "Benefits enrollment deadline reminder", body: "Open enrollment ends November 30. 8 employees have not made selections for next year's benefits. Reminder emails sent.", category: "hr", priority: "normal" },
  { subject: "Promotion recommendation - Field Specialist", body: "Supervisor recommends Emma Williams for promotion to Lead Field Specialist. Excellent performance record, positive client feedback, leadership skills demonstrated.", category: "hr", priority: "normal" },
  { subject: "Termination documentation - Final paycheck", body: "Following termination of employee Garcia for cause, please process final paycheck including unused PTO (12 hours). Equipment return pending.", category: "hr", priority: "high" },
  { subject: "Workplace accommodation request", body: "Employee Thompson has requested workplace accommodation under ADA. Request: modified patrol route due to knee surgery recovery. Medical documentation attached.", category: "hr", priority: "normal" },
  { subject: "Reference check request - Former employee", body: "Received employment verification request for former employee Sandra Lee. Per policy, confirm dates of employment and title only.", category: "hr", priority: "low" },
  { subject: "Team morale concern flagged by supervisor", body: "Supervisor reports declining morale at the Healthcare Plus site. Suggested causes: understaffing, difficult client demands. Team meeting recommended.", category: "hr", priority: "normal" },

  // === CLIENT ISSUES (15) ===
  { subject: "Client complaint - Response time concern", body: "TechCorp security manager reports dissatisfaction with response time to recent alarm activation (12 minutes vs. 5-minute SLA). Investigation required.", category: "client", priority: "urgent", requiresTrinityAction: true },
  { subject: "Contract amendment request - Additional services", body: "Healthcare Plus is requesting to add parking lot patrol services to their existing contract. Proposal and pricing needed by Friday.", category: "client", priority: "normal" },
  { subject: "Client site visit scheduled - VIP tour", body: "TechCorp CEO will be touring the facility with investors on Friday. Request for our best-presented officers on duty.", category: "client", priority: "high" },
  { subject: "Invoice dispute - Client claims overbilling", body: "Retail Solutions is disputing last month's invoice. They claim we billed for 320 hours but their records show 280 hours. Need timesheet reconciliation.", category: "client", priority: "high" },
  { subject: "New client onboarding - Acme Industries", body: "Welcome packet needed for new client Acme Industries. Contract signed for 3 officers, 24/7 coverage. Start date: December 1.", category: "client", priority: "normal" },
  { subject: "Client feedback - Exceptional service recognition", body: "Healthcare Plus sent a commendation letter praising Officer Martinez for her handling of a difficult patient situation. Recommend for employee recognition.", category: "client", priority: "low" },
  { subject: "Client contract expiring - Renewal discussion", body: "The Retail Solutions contract expires December 31. Account manager should schedule renewal discussion. Client satisfaction rating: 4.2/5.", category: "client", priority: "normal" },
  { subject: "Emergency contact update - Client personnel changes", body: "TechCorp has new after-hours emergency contacts following personnel changes. Updated contact list attached. Please distribute to all site officers.", category: "client", priority: "normal" },
  { subject: "Client terminating contract - Exit plan needed", body: "Received 30-day termination notice from Metro Mall. Client moving to in-house security. Need transition plan and staff reassignment.", category: "client", priority: "high", requiresTrinityAction: true },
  { subject: "Special event security request", body: "Healthcare Plus is hosting a charity gala on November 22. Requesting 6 additional officers for event security. Premium rate authorized.", category: "client", priority: "normal" },
  { subject: "Client access card audit discrepancy", body: "Quarterly access card audit at TechCorp reveals 3 unaccounted cards. Need to verify with client and potentially deactivate missing cards.", category: "client", priority: "high" },
  { subject: "Site-specific training requirement from client", body: "Retail Solutions now requires all officers to complete their proprietary customer service training (4 hours). Scheduling needed for 8 officers.", category: "client", priority: "normal" },
  { subject: "Client requesting dedicated account manager", body: "TechCorp (our largest client) is requesting a dedicated account manager rather than shared supervision. Resource allocation decision needed.", category: "client", priority: "normal" },
  { subject: "Insurance certificate request for client RFP", body: "Potential new client requires proof of $5M liability coverage for RFP submission. Current coverage: $3M. Insurance upgrade needed?", category: "client", priority: "high" },
  { subject: "Client site relocation notification", body: "Healthcare Plus is relocating their admin offices effective January 1. New address attached. Update all records and inform assigned staff.", category: "client", priority: "normal" },

  // === PAYROLL (10) ===
  { subject: "Payroll processing deadline reminder", body: "Reminder: All timesheets must be submitted and approved by Thursday 5 PM for Friday payroll processing. Currently missing: 4 timesheets.", category: "payroll", priority: "high" },
  { subject: "Overtime discrepancy identified", body: "Payroll audit identified overtime calculation error for employee Chen. Underpayment of $234.50 for pay period ending Nov 1. Correction needed.", category: "payroll", priority: "urgent" },
  { subject: "Direct deposit update - New bank account", body: "Employee Davis submitted direct deposit change form. New account verification complete. Effective for next pay period.", category: "payroll", priority: "normal" },
  { subject: "Bonus processing request - Q3 performance", body: "Q3 performance bonuses approved for 5 employees: Johnson ($500), Chen ($750), Williams ($400), Davis ($350), Martinez ($600). Process for Nov 15 payroll.", category: "payroll", priority: "normal" },
  { subject: "Tax withholding update - W-4 change", body: "Employee Thompson submitted new W-4 claiming additional withholding allowances. Verify and update system before next payroll.", category: "payroll", priority: "normal" },
  { subject: "Retroactive pay adjustment required", body: "Following promotion approval for Williams, retroactive pay increase of $5/hr effective October 1. Total adjustment: $180. Process ASAP.", category: "payroll", priority: "high" },
  { subject: "Garnishment order received - Employee confidential", body: "Court-ordered wage garnishment received for employee [Confidential]. Amount: 15% of disposable earnings. Effective immediately.", category: "payroll", priority: "urgent" },
  { subject: "Year-end payroll deadlines approaching", body: "Reminder: Last payroll of the year is December 27. All adjustments, corrections, and bonuses must be submitted by December 20.", category: "payroll", priority: "normal" },
  { subject: "Expense reimbursement pending approval", body: "Officer Martinez submitted expense reimbursement for uniform items ($156.78). Receipt attached. Manager approval pending.", category: "payroll", priority: "low" },
  { subject: "Commission calculation review - Account manager", body: "Q3 commission calculation for Account Manager shows $2,340 earned. Please verify against contract new client bonus formula.", category: "payroll", priority: "normal" },

  // === TRAINING (10) ===
  { subject: "New employee training schedule - Week 1", body: "Training schedule for new hire Robert Kim: Day 1 - Orientation, Day 2-3 - Safety procedures, Day 4-5 - Site-specific training at TechCorp.", category: "training", priority: "normal" },
  { subject: "De-escalation training mandatory for all staff", body: "Following recent industry incidents, all security officers must complete 4-hour de-escalation training by December 31. Schedule attached.", category: "training", priority: "high" },
  { subject: "Training completion certificates - 12 employees", body: "The following employees have completed required annual training. Certificates attached for personnel files: [List of 12 names].", category: "training", priority: "low" },
  { subject: "Advanced security certification course available", body: "State-approved advanced security certification course offered December 5-7. Company will cover cost for interested employees. Sign-up deadline: Nov 20.", category: "training", priority: "normal" },
  { subject: "Training failure notification - Remediation needed", body: "Employee Rodriguez failed the post-training assessment (score: 62%, passing: 75%). Remediation training scheduled for next week.", category: "training", priority: "normal" },
  { subject: "Client-specific training requirement update", body: "Healthcare Plus updated their HIPAA training requirement. All assigned officers must complete 2-hour online module by November 30.", category: "training", priority: "high" },
  { subject: "Field training officer assignment", body: "Officer Johnson has been selected as Field Training Officer (FTO) for new hires. Additional $2/hr differential approved during training periods.", category: "training", priority: "normal" },
  { subject: "Training room reservation - December sessions", body: "Training room reserved for December sessions: Dec 5-7 (Certification), Dec 12 (CPR renewal), Dec 19 (Annual compliance). Catering ordered.", category: "training", priority: "low" },
  { subject: "Online training platform access issues", body: "Multiple employees reporting login issues with the training platform. IT investigating. Workaround: clear browser cache or use incognito mode.", category: "training", priority: "normal" },
  { subject: "Train-the-trainer session for supervisors", body: "All supervisors required to attend train-the-trainer session November 18. Topic: New reporting procedures and incident documentation.", category: "training", priority: "normal" },

  // === SYSTEM / OPERATIONS (5) ===
  { subject: "System maintenance scheduled - Downtime notice", body: "The scheduling system will be down for maintenance Saturday 2-6 AM. Please complete any urgent scheduling changes before then.", category: "system", priority: "normal" },
  { subject: "New mobile app version released", body: "Version 2.5 of the officer mobile app is now available. Key updates: improved GPS accuracy, offline incident reports, photo attachments. Update required by Nov 30.", category: "system", priority: "normal" },
  { subject: "Radio system upgrade complete", body: "The radio communication system upgrade is complete. New channel assignments attached. All officers must test their equipment before next shift.", category: "system", priority: "normal" },
  { subject: "Patrol route optimization recommendations", body: "Based on incident data analysis, Trinity AI recommends adjusting patrol routes at TechCorp site. Proposed changes attached for review.", category: "system", priority: "normal", requiresTrinityAction: true },
  { subject: "Vehicle fleet maintenance schedule", body: "Q4 vehicle maintenance schedule attached. 3 patrol vehicles due for service this month: Units 105, 112, 118. Loaner vehicles arranged.", category: "system", priority: "low" },

  // === TRINITY AI REQUESTS (bonus - specific Trinity involvement) ===
  { subject: "Request: Trinity AI analysis of incident patterns", body: "Please have Trinity analyze the past 6 months of incident reports for the Healthcare Plus site. Looking for patterns, peak times, and prevention recommendations.", category: "trinity_request", priority: "normal", requiresTrinityAction: true },
  { subject: "Trinity: Please draft client proposal", body: "Need Trinity to draft a security proposal for potential client Acme Industries. Requirements: 24/7 coverage, 5 officers, access control management.", category: "trinity_request", priority: "high", requiresTrinityAction: true },
  { subject: "AI Schedule optimization request", body: "Can Trinity optimize next month's schedule to minimize overtime while ensuring coverage? Current projected OT: 120 hours. Target: under 80 hours.", category: "trinity_request", priority: "normal", requiresTrinityAction: true },
  { subject: "Trinity compliance audit assistance", body: "Requesting Trinity AI to review all employee certifications and flag any expiring within the next 60 days. Priority on security licenses and CPR certs.", category: "trinity_request", priority: "high", requiresTrinityAction: true },
  { subject: "Draft response needed - Client complaint", body: "Need Trinity to help draft a professional response to TechCorp's complaint about response times. Should acknowledge concern and outline corrective actions.", category: "trinity_request", priority: "urgent", requiresTrinityAction: true },
];

const SENDER_POOL = [
  { name: "Sarah Johnson", email: "sarah.johnson@coaileague.internal", role: "Lead Technician" },
  { name: "Michael Chen", email: "michael.chen@coaileague.internal", role: "Senior Consultant" },
  { name: "Emma Williams", email: "emma.williams@coaileague.internal", role: "Field Specialist" },
  { name: "James Davis", email: "james.davis@coaileague.internal", role: "Technician" },
  { name: "Lisa Martinez", email: "lisa.martinez@coaileague.internal", role: "Consultant" },
  { name: "Robert Anderson", email: "robert.anderson@coaileague.internal", role: "Supervisor" },
  { name: "Jennifer Thompson", email: "jennifer.thompson@coaileague.internal", role: "HR Manager" },
  { name: "David Miller", email: "david.miller@coaileague.internal", role: "Operations Manager" },
  { name: "System Notifications", email: "system@coaileague.internal", role: "System" },
  { name: "Client Relations", email: "clients@coaileague.internal", role: "Department" },
];

const RECIPIENT_POOL = [
  "management@coaileague.internal",
  "operations@coaileague.internal",
  "hr@coaileague.internal",
  "compliance@coaileague.internal",
  "scheduling@coaileague.internal",
  "trinity-inbox@coaileague.internal",
  "payroll@coaileague.internal",
];

function getRandomDate(daysBack: number = 30): Date {
  const now = new Date();
  const past = new Date(now.getTime() - Math.random() * daysBack * 24 * 60 * 60 * 1000);
  return past;
}

function getRandomSender() {
  return SENDER_POOL[Math.floor(Math.random() * SENDER_POOL.length)];
}

function getRandomRecipients(count: number = 1): string[] {
  const shuffled = [...RECIPIENT_POOL].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

export async function seedEmails(workspaceId?: string) {
  console.log("📧 Seeding email test data...");

  // Get a workspace to associate emails with
  let targetWorkspaceId = workspaceId;
  if (!targetWorkspaceId) {
    const [workspace] = await db.select().from(workspaces).limit(1);
    if (!workspace) {
      console.error("❌ No workspace found. Please create a workspace first.");
      return { success: false, error: "No workspace found" };
    }
    targetWorkspaceId = workspace.id;
  }

  console.log(`📧 Using workspace: ${targetWorkspaceId}`);

  // Create mailboxes for senders if they don't exist
  const createdMailboxes: Map<string, string> = new Map();
  
  for (const sender of SENDER_POOL) {
    const existing = await db.select().from(internalMailboxes)
      .where(eq(internalMailboxes.emailAddress, sender.email))
      .limit(1);
    
    if (existing.length === 0) {
      // Get a user to associate with the mailbox (or use a system user)
      const [user] = await db.select().from(users).limit(1);
      if (user) {
        const [mailbox] = await db.insert(internalMailboxes).values({
          userId: user.id,
          workspaceId: targetWorkspaceId,
          emailAddress: sender.email,
          displayName: sender.name,
          mailboxType: sender.role === 'System' || sender.role === 'Department' ? 'system' : 'personal',
          isActive: true,
        }).returning();
        createdMailboxes.set(sender.email, mailbox.id);
        console.log(`📬 Created mailbox: ${sender.email}`);
      }
    } else {
      createdMailboxes.set(sender.email, existing[0].id);
    }
  }

  // Create Trinity inbox mailbox
  const trinityEmail = "trinity-inbox@coaileague.internal";
  const existingTrinity = await db.select().from(internalMailboxes)
    .where(eq(internalMailboxes.emailAddress, trinityEmail))
    .limit(1);
  
  if (existingTrinity.length === 0) {
    const [user] = await db.select().from(users).limit(1);
    if (user) {
      const [trinityMailbox] = await db.insert(internalMailboxes).values({
        userId: user.id,
        workspaceId: targetWorkspaceId,
        emailAddress: trinityEmail,
        displayName: "Trinity AI Inbox",
        mailboxType: 'system',
        isActive: true,
        autoReply: false,
        signature: "-- Trinity AI Assistant | CoAIleague Platform"
      }).returning();
      createdMailboxes.set(trinityEmail, trinityMailbox.id);
      console.log(`🤖 Created Trinity mailbox: ${trinityEmail}`);
    }
  }

  // Get ALL personal mailboxes in workspace to deliver emails to them
  const allPersonalMailboxes = await db.select({
    id: internalMailboxes.id,
    emailAddress: internalMailboxes.emailAddress,
  })
    .from(internalMailboxes)
    .where(and(
      eq(internalMailboxes.workspaceId, targetWorkspaceId),
      eq(internalMailboxes.mailboxType, 'personal')
    ));
  
  console.log(`📬 Found ${allPersonalMailboxes.length} personal mailboxes to deliver emails to`);
  
  // Also add these to the createdMailboxes map for recipient lookup
  for (const mb of allPersonalMailboxes) {
    if (!createdMailboxes.has(mb.emailAddress)) {
      createdMailboxes.set(mb.emailAddress, mb.id);
    }
  }

  // Insert emails
  let emailCount = 0;
  const emailsToInsert = EMAIL_TEMPLATES.map((template, index) => {
    const sender = getRandomSender();
    const recipients = template.requiresTrinityAction 
      ? [trinityEmail, ...getRandomRecipients(1)]
      : getRandomRecipients(Math.floor(Math.random() * 2) + 1);
    
    const sentAt = getRandomDate(60);
    
    return {
      fromMailboxId: createdMailboxes.get(sender.email) || null,
      fromAddress: sender.email,
      fromName: sender.name,
      toAddresses: JSON.stringify(recipients),
      ccAddresses: Math.random() > 0.7 ? JSON.stringify(getRandomRecipients(1)) : null,
      subject: template.subject,
      bodyText: template.body,
      bodyHtml: `<p>${template.body.replace(/\n/g, '</p><p>')}</p>`,
      threadId: `thread-${Math.floor(index / 3)}`, // Group some emails into threads
      priority: template.priority,
      isInternal: true,
      sentAt,
      createdAt: sentAt,
    };
  });

  for (const email of emailsToInsert) {
    try {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const [inserted] = await db.insert(internalEmails).values(email).returning();
      emailCount++;
      
      // Create recipient records for the listed recipients
      const recipients = JSON.parse(email.toAddresses as string);
      for (const recipientEmail of recipients) {
        const recipientMailboxId = createdMailboxes.get(recipientEmail);
        if (recipientMailboxId) {
          // Get or ensure inbox folder exists for recipient mailbox
          let inboxFolder = await db.select().from(internalEmailFolders)
            .where(and(
              eq(internalEmailFolders.mailboxId, recipientMailboxId),
              eq(internalEmailFolders.folderType, 'inbox')
            ))
            .limit(1);
          
          const inboxFolderId = inboxFolder[0]?.id || null;
          
          await db.insert(internalEmailRecipients).values({
            emailId: inserted.id,
            mailboxId: recipientMailboxId,
            folderId: inboxFolderId,
            recipientType: 'to',
            status: Math.random() > 0.3 ? 'read' : 'delivered',
            readAt: Math.random() > 0.3 ? new Date() : null,
          });
        }
      }
      
      // ALSO deliver to ALL personal mailboxes (so all users can see the seeded emails)
      for (const personalMailbox of allPersonalMailboxes) {
        // Skip if already a recipient
        if (recipients.includes(personalMailbox.emailAddress)) continue;
        
        // Get or create inbox folder for this mailbox
        let inboxFolder = await db.select().from(internalEmailFolders)
          .where(and(
            eq(internalEmailFolders.mailboxId, personalMailbox.id),
            eq(internalEmailFolders.folderType, 'inbox')
          ))
          .limit(1);
        
        // Create inbox folder if it doesn't exist
        if (inboxFolder.length === 0) {
          const [newFolder] = await db.insert(internalEmailFolders).values({
            mailboxId: personalMailbox.id,
            name: "Inbox",
            folderType: "inbox",
            sortOrder: 0,
            isSystem: true,
          }).returning();
          inboxFolder = [newFolder];
        }
        
        const inboxFolderId = inboxFolder[0]?.id || null;
        
        try {
          await db.insert(internalEmailRecipients).values({
            emailId: inserted.id,
            mailboxId: personalMailbox.id,
            folderId: inboxFolderId,
            recipientType: 'bcc', // BCC so they receive without being listed
            status: Math.random() > 0.3 ? 'read' : 'delivered',
            readAt: Math.random() > 0.3 ? new Date() : null,
          });
        } catch (recipientError) {
          // Ignore duplicate key errors
        }
      }
    } catch (error) {
      console.error(`Failed to insert email: ${email.subject}`, error);
    }
  }

  console.log(`✅ Seeded ${emailCount} emails successfully!`);
  console.log(`📊 Categories: incidents(15), scheduling(15), compliance(15), HR(15), client(15), payroll(10), training(10), system(5)`);
  console.log(`🤖 ${EMAIL_TEMPLATES.filter(t => t.requiresTrinityAction).length} emails flagged for Trinity AI attention`);

  return { 
    success: true, 
    emailCount,
    workspaceId: targetWorkspaceId,
    trinityActionRequired: EMAIL_TEMPLATES.filter(t => t.requiresTrinityAction).length
  };
}

// Seed emails for ALL workspaces that have personal mailboxes
export async function seedEmailsForAllWorkspaces() {
  console.log("📧 Seeding emails for ALL workspaces with personal mailboxes...");
  
  // Get all workspaces that have at least one personal mailbox
  const workspacesWithMailboxes = await db
    .selectDistinct({ workspaceId: internalMailboxes.workspaceId })
    .from(internalMailboxes)
    .where(eq(internalMailboxes.mailboxType, 'personal'));
  
  const uniqueWorkspaceIds = workspacesWithMailboxes
    .map(w => w.workspaceId)
    .filter((id): id is string => id !== null);
  
  console.log(`📧 Found ${uniqueWorkspaceIds.length} workspaces with personal mailboxes`);
  
  let totalEmails = 0;
  for (const workspaceId of uniqueWorkspaceIds) {
    console.log(`📧 Seeding emails for workspace: ${workspaceId}`);
    const result = await seedEmails(workspaceId);
    if (result.success) {
      totalEmails += result.emailCount || 0;
    }
  }
  
  console.log(`✅ Seeded ${totalEmails} emails across ${uniqueWorkspaceIds.length} workspaces`);
  return { success: true, totalEmails, workspaceCount: uniqueWorkspaceIds.length };
}

export async function clearEmailSeedData(workspaceId?: string) {
  console.log("🗑️ Clearing seeded email data...");
  
  // Delete emails from seed email addresses
  const seedEmails = SENDER_POOL.map(s => s.email);
  
  let deletedCount = 0;
  for (const email of seedEmails) {
    const result = await db.delete(internalEmails)
      .where(eq(internalEmails.fromAddress, email));
    deletedCount++;
  }

  console.log(`✅ Cleared seeded emails`);
  return { success: true };
}
