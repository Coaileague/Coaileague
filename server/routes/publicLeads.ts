/**
 * Public Lead Capture API Routes
 * 
 * These routes are PUBLIC (no auth required) for landing page lead capture.
 * Used by ROI calculator, testimonial requests, and other marketing pages.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { leads, insertLeadSchema } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { emailService } from "../services/emailService";
import { NotificationDeliveryService } from '../services/notificationDeliveryService';
import { createLogger } from '../lib/logger';
const log = createLogger('PublicLeads');


const router = Router();

// Lead capture from ROI calculator
const roiLeadSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  contactName: z.string().min(1, "Your name is required"),
  contactEmail: z.string().email("Valid email is required"),
  contactPhone: z.string().optional(),
  contactTitle: z.string().optional(),
  industry: z.string().default("security"),
  estimatedEmployees: z.number().min(1).optional(),
  
  // ROI calculator inputs
  roiData: z.object({
    numberOfGuards: z.number().min(1),
    averageHoursPerWeek: z.number().min(1),
    currentOvertimePercent: z.number().min(0).max(100),
    averageHourlyRate: z.number().min(1),
    // Calculated results
    estimatedAnnualSavings: z.number(),
    estimatedOvertimeReduction: z.number(),
    estimatedSchedulingTimeReduction: z.number(),
  }).optional(),
  
  // UTM tracking
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmTerm: z.string().optional(),
  utmContent: z.string().optional(),
});

// POST /api/public/leads - Create a new lead from landing page
router.post("/", async (req: Request, res: Response) => {
  try {
    const validated = roiLeadSchema.parse(req.body);
    
    // Build UTM source string
    const utmParts = [
      validated.utmSource,
      validated.utmMedium,
      validated.utmCampaign,
    ].filter(Boolean);
    
    const source = utmParts.length > 0 
      ? `web_form:${utmParts.join('/')}` 
      : 'web_form:roi_calculator';
    
    // Calculate lead score based on company size and engagement
    let leadScore = 20; // Base score for submitting form
    if (validated.estimatedEmployees) {
      if (validated.estimatedEmployees >= 100) leadScore += 30;
      else if (validated.estimatedEmployees >= 50) leadScore += 20;
      else if (validated.estimatedEmployees >= 20) leadScore += 10;
    }
    if (validated.roiData) leadScore += 20; // Completed ROI calculator
    if (validated.contactPhone) leadScore += 10; // Provided phone
    if (validated.contactTitle) leadScore += 5; // Provided title
    
    // Estimate deal value based on guard count
    let estimatedValue = null;
    if (validated.roiData?.numberOfGuards) {
      // $30/guard/month base estimate
      estimatedValue = (validated.roiData.numberOfGuards * 30 * 12).toString();
    } else if (validated.estimatedEmployees) {
      estimatedValue = (validated.estimatedEmployees * 30 * 12).toString();
    }
    
    // Check for existing lead with same email
    const existingLead = await db.query.leads.findFirst({
      where: eq(leads.contactEmail, validated.contactEmail),
    });
    
    if (existingLead) {
      // Update existing lead with new info
      await db.update(leads)
        .set({
          companyName: validated.companyName,
          contactName: validated.contactName,
          contactPhone: validated.contactPhone || existingLead.contactPhone,
          contactTitle: validated.contactTitle || existingLead.contactTitle,
          industry: validated.industry,
          estimatedEmployees: validated.estimatedEmployees || existingLead.estimatedEmployees,
          leadScore: Math.max(leadScore, existingLead.leadScore || 0),
          notes: validated.roiData 
            ? `ROI Calculator Data: ${JSON.stringify(validated.roiData)}\n\n${existingLead.notes || ''}`
            : existingLead.notes,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, existingLead.id));
      
      return res.status(200).json({ 
        success: true, 
        message: "Thank you! We've updated your information.",
        leadId: existingLead.id,
        isExisting: true,
      });
    }
    
    // Create new lead
    const [newLead] = await db.insert(leads).values({
      workspaceId: null,
      companyName: validated.companyName,
      contactName: validated.contactName,
      contactEmail: validated.contactEmail,
      contactPhone: validated.contactPhone,
      contactTitle: validated.contactTitle,
      industry: validated.industry,
      estimatedEmployees: validated.estimatedEmployees,
      leadStatus: 'new',
      leadScore,
      estimatedValue,
      source,
      notes: validated.roiData 
        ? `ROI Calculator Data: ${JSON.stringify(validated.roiData)}`
        : 'Submitted via landing page',
    }).returning();
    
    // Send welcome email to new lead — tracked through NDS for retry on failure
    const _leadEmail = emailService.buildPublicLeadWelcome({
      email: validated.contactEmail,
      contactName: validated.contactName,
      companyName: validated.companyName,
      roiData: validated.roiData ? {
        estimatedAnnualSavings: validated.roiData.estimatedAnnualSavings,
        numberOfGuards: validated.roiData.numberOfGuards,
      } : undefined,
    });
    NotificationDeliveryService.send({ idempotencyKey: `notif:lead:${newLead.id}:welcome`,
            type: 'lead_welcome', workspaceId: 'public', recipientUserId: validated.contactEmail, channel: 'email', body: _leadEmail }).catch(err => {
      log.error('[PublicLeads] Failed to queue welcome email:', err);
    });
    
    res.status(201).json({
      success: true,
      message: "Thank you! Our team will contact you within 24 hours.",
      leadId: newLead.id,
      estimatedSavings: validated.roiData?.estimatedAnnualSavings,
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false,
        error: "Please check your information",
        details: error.errors,
      });
    }
    log.error("Error capturing lead:", error);
    res.status(500).json({ 
      success: false,
      error: "Something went wrong. Please try again.",
    });
  }
});

// GET /api/public/leads/stats - Public stats for social proof
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    // Return anonymized platform stats for social proof
    const stats = {
      totalCompanies: "500+",
      totalGuardsManaged: "25,000+",
      averageSavings: "23%",
      satisfactionRate: "4.8/5",
    };
    
    res.json(stats);
  } catch (error) {
    res.json({
      totalCompanies: "500+",
      totalGuardsManaged: "25,000+",
      averageSavings: "23%",
      satisfactionRate: "4.8/5",
    });
  }
});

export default router;
