import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { db } from "../db";
import { proposals, insertProposalSchema } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireManager, type AuthenticatedRequest } from "../rbac";
import { generateProposalPdf } from "../services/proposalPdfService";
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';
const log = createLogger('ProposalRoutes');

const router = Router();

const PROPOSAL_TEMPLATES = [
  {
    id: "security-guard-services",
    name: "Security Guard Services",
    sections: [
      { title: "Executive Summary", content: "We are pleased to submit this proposal for comprehensive security guard services. Our team of trained, licensed security professionals will provide reliable coverage tailored to your specific needs." },
      { title: "Scope of Services", content: "- Uniformed security officer presence during specified hours\n- Access control and visitor management\n- Regular patrol rounds of premises\n- Incident reporting and documentation\n- Emergency response coordination\n- Daily Activity Reports (DARs)" },
      { title: "Staffing Plan", content: "We will assign dedicated security officers to your site, ensuring continuity and familiarity with your facility. All officers are licensed, background-checked, and trained in:\n- Conflict de-escalation\n- Emergency procedures\n- First aid / CPR\n- Customer service excellence" },
      { title: "Technology & Reporting", content: `Our ${PLATFORM.name} platform provides:\n- Real-time GPS clock-in/out verification\n- Digital Daily Activity Reports\n- Incident reporting with photo evidence\n- Guard tour checkpoint scanning\n- Client portal access for transparency` },
      { title: "Why Choose Us", content: "- Licensed and insured security provider\n- 24/7 operations center support\n- Rapid replacement guarantee\n- Transparent billing with detailed invoices\n- Dedicated account manager" },
    ],
    termsAndConditions: "1. Services will commence on the agreed start date.\n2. A 30-day written notice is required for contract termination.\n3. Pricing is valid for 30 days from the date of this proposal.\n4. All officers are employees of our company, fully insured and bonded.\n5. Overtime rates apply for hours exceeding 40 per week per officer.",
  },
  {
    id: "event-security",
    name: "Event Security",
    sections: [
      { title: "Executive Summary", content: "We are pleased to present our proposal for professional event security services. Our experienced team will ensure the safety of your attendees, staff, and property throughout the event." },
      { title: "Scope of Services", content: "- Perimeter security and access control\n- Crowd management and flow control\n- VIP protection services\n- Bag checks and screening\n- Emergency evacuation coordination\n- Post-event security and site clearance" },
      { title: "Staffing Plan", content: "Based on the event size and requirements, we will deploy an appropriate team including:\n- Event Security Supervisor\n- Access Control Officers\n- Roving Patrol Officers\n- VIP Close Protection (if required)" },
      { title: "Communication & Coordination", content: "- Dedicated radio channel for security team\n- Pre-event security briefing\n- Real-time incident reporting\n- Post-event summary report\n- Coordination with local law enforcement" },
    ],
    termsAndConditions: "1. A 50% deposit is required to confirm the booking.\n2. Final headcount adjustments must be made 72 hours prior to the event.\n3. Cancellation within 48 hours incurs a 25% fee.\n4. All officers will arrive 1 hour before event start for briefing.\n5. Overtime rates apply after the contracted event hours.",
  },
  {
    id: "mobile-patrol",
    name: "Mobile Patrol Services",
    sections: [
      { title: "Executive Summary", content: "This proposal outlines our mobile patrol security services designed to provide cost-effective security coverage across multiple locations or large properties." },
      { title: "Scope of Services", content: "- Scheduled patrol visits at agreed intervals\n- Lock/unlock services\n- Alarm response\n- Property inspection and condition reporting\n- Parking lot patrols\n- Incident investigation and reporting" },
      { title: "Patrol Schedule", content: "Our mobile patrol units will conduct scheduled visits according to the agreed patrol plan. Each visit includes a thorough inspection with digital checkpoint verification and photo documentation." },
      { title: "Vehicle & Equipment", content: "- Marked patrol vehicles with emergency lighting\n- GPS-tracked routes for accountability\n- Body-worn cameras\n- Two-way radio communication\n- First aid equipment" },
    ],
    termsAndConditions: "1. Patrol frequency and schedule as agreed in the service contract.\n2. Additional patrol visits available at per-visit rates.\n3. Alarm response time targets based on location.\n4. Monthly service reports provided.\n5. 30-day notice required for service changes.",
  },
  {
    id: "blank",
    name: "Blank Proposal",
    sections: [
      { title: "Introduction", content: "" },
      { title: "Scope of Services", content: "" },
      { title: "Pricing", content: "" },
    ],
    termsAndConditions: "",
  },
];

router.get("/templates", async (_req: AuthenticatedRequest, res) => {
  try {
    res.json(PROPOSAL_TEMPLATES.map(t => ({ id: t.id, name: t.name })));
  } catch (error: unknown) {
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const results = await db
      .select()
      .from(proposals)
      .where(eq(proposals.workspaceId, workspaceId))
      .orderBy(desc(proposals.createdAt));

    res.json(results);
  } catch (error: unknown) {
    log.error("Error fetching proposals:", error);
    res.status(500).json({ error: "Failed to fetch proposals" });
  }
});

router.post("/", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

    const validated = insertProposalSchema.parse({
      ...req.body,
      workspaceId,
      createdBy: userId,
    });

    const [proposal] = await db.insert(proposals).values(validated).returning();
    res.status(201).json(proposal);
  } catch (error: unknown) {
    log.error("Error creating proposal:", error);
    res.status(400).json({ error: sanitizeError(error) || "Failed to create proposal" });
  }
});

export default router;
