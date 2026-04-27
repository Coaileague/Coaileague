import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { randomUUID } from 'crypto';
import { NotificationDeliveryService } from '../services/notificationDeliveryService';
import { db } from "../db";
import { storage } from "../storage";
import {
  employees,
  clients,
  shifts,
  sites,
  workspaces,
  users,
  supportTickets,
  userNotificationPreferences,
  shiftOffers,
  shiftRequests,
  contractorAssignments,
  contractorPool,
  stagedShifts,
  quickbooksOnboardingFlows,
  orchestrationOverlays,
  managerAssignments,
  knowledgeArticles,
  knowledgeQueries,
  searchQueries,
  insertClientRateSchema,
  clientRates,
  insertExpenseCategorySchema,
} from "@shared/schema";
import { orgSubscriptions, subscriptionTiers, invoices } from "@shared/schema/domains/billing";
import { timeEntries } from "@shared/schema/domains/time";
import { supportRegistry } from "@shared/schema/domains/support";
import { getExternalId } from "../services/identityService";
import { eq, and, or, desc, asc, sql, ilike, isNull, inArray } from "drizzle-orm";
import { requireAuth } from "../auth";
import {
  requireManager,
  requireManagerOrPlatformStaff,
  requirePlatformAdmin,
  attachWorkspaceId,
  type AuthenticatedRequest,
} from "../rbac";
import {
  readLimiter,
} from "../middleware/rateLimiter";
import { z } from "zod";
import { csrfTokenHandler } from "../middleware/csrf";
import { monitoringService } from "../services/monitoringService";
import { escalationMatrixService } from "../services/escalationMatrixService";
import { workflowStatusService } from "../services/workflowStatusService";
import { jobRetrievalService } from "../services/jobRetrievalService";
import { helposSettingsService } from "../services/helposSettingsService";
import { documentExtractionService } from "../services/documentExtraction";
import { notificationEngine } from "../services/universalNotificationEngine";
import { getMeteredOpenAICompletion } from "../services/billing/universalAIBillingInterceptor";
import { emailService } from "../services/emailService";
import { scheduleSmartAI, isScheduleSmartAvailable } from "../services/scheduleSmartAI";
import crypto from "crypto";
import multer from "multer";
import { Readable } from "stream";
import OpenAI from "openai";
import { createLogger } from '../lib/logger';
import { scheduleNonBlocking } from '../lib/scheduleNonBlocking';
import { PLATFORM } from '../config/platformConfig';
const log = createLogger('MiscRoutes');

const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/mpeg", "audio/wav", "audio/ogg", "audio/webm", "audio/mp4", "audio/aac", "audio/x-m4a", "audio/m4a"
];

const audioUpload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_AUDIO_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}. Only audio files are accepted.`));
    }
  }
});

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI API key not configured");
  return new OpenAI({ apiKey });
}

const router = Router();

router.get("/api/me/workspace-role", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;

    if (!userId || !workspaceId) {
      return res.json({ role: null, workspaceId: null });
    }

    const employee = await db.query.employees.findFirst({
      where: and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId)),
    });

    if (employee) {
      return res.json({
        role: employee.workspaceRole || employee.role || "staff",
        workspaceId,
        employeeId: employee.id,
      });
    }

    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (workspace?.ownerId === userId) {
      return res.json({ role: "org_owner", workspaceId, employeeId: null });
    }

    res.json({ role: null, workspaceId, employeeId: null });
  } catch (error: unknown) {
    log.error("Error fetching workspace role:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/api/me/platform-role", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.json({ platformRole: null });
    }

    const { getUserPlatformRole } = await import("../rbac");
    const platformRole = await getUserPlatformRole(userId);

    res.json({
      platformRole: platformRole || null,
      userId,
      hasPlatformAccess: !!platformRole,
    });
  } catch (error: unknown) {
    log.error("Error fetching platform role:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/api/me/workspace-features", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.json({ features: {} });
    }

    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      return res.json({ features: {} });
    }

    const tier = workspace.subscriptionTier || "free";

    // Use billingConfig FEATURE_MATRIX as canonical source of truth — no hardcoded tier strings
    const { BILLING } = await import("@shared/billingConfig");
    const matrix = BILLING.featureMatrix;
    const t = (tier === "free_trial" ? "free" : tier) as keyof typeof matrix.basic_scheduling;

    const features: Record<string, boolean> = {
      scheduling:         matrix.basic_scheduling[t]         ?? false,
      employee_management: true, // available on all tiers
      client_management:  matrix.client_billing[t]          ?? false,
      time_tracking:      matrix.basic_time_tracking[t]     ?? false,
      invoicing:          matrix.invoice_generation[t]      ?? false,
      analytics:          matrix.advanced_analytics[t]      ?? false,
      onboarding:         matrix.employee_onboarding[t]     ?? false,
      gps_tracking:       matrix.gps_time_tracking[t]       ?? false,
      report_management:  matrix.basic_reporting[t]         ?? false,
      api_access:         matrix.api_access[t]              ?? false,
    };

    res.json({
      features,
      tier,
      workspaceId,
    });
  } catch (error: unknown) {
    log.error("Error fetching workspace features:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/api/feature-updates", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.json([]);
    }

    const { featureUpdates, featureUpdateReceipts } = await import("@shared/schema");

    const updates = await db
      .select()
      .from(featureUpdates)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .where(eq(featureUpdates.isActive, true))
      .orderBy(desc(featureUpdates.releaseAt));

    const dismissals = await db
      .select()
      .from(featureUpdateReceipts)
      .where(eq(featureUpdateReceipts.userId, userId));

    const dismissedIds = new Set(dismissals.map((d) => d.featureUpdateId));

    const result = updates.map((update) => ({
      ...update,
      isDismissed: dismissedIds.has(update.id),
    }));

    res.json(result);
  } catch (error: unknown) {
    log.error("Error fetching feature updates:", error);
    res.status(500).json({ message: sanitizeError(error) });
  }
});

// ── Voice: Server-side Whisper transcription (works on iOS Safari) ───────────
router.post("/api/voice/transcribe", requireAuth, audioUpload.single("audio"), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }
    const openai = getOpenAIClient();
    const audioBuffer = req.file.buffer;
    const mimeType = req.file.mimetype || "audio/webm";
    const ext = mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a"
      : mimeType.includes("ogg") ? "ogg"
      : mimeType.includes("wav") ? "wav"
      : "webm";

    const readable = Readable.from(audioBuffer) as any;
    readable.name = `audio.${ext}`;

    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: readable,
    });
    res.json({ transcript: transcription.text, confidence: 0.95 });
  } catch (err: unknown) {
    log.error("[Whisper] transcription error:", sanitizeError(err));
    res.status(500).json({ error: "Transcription failed", detail: sanitizeError(err) });
  }
});

// ── Voice: OpenAI TTS (server-side text-to-speech) ────────────────────────
router.post("/api/voice/tts", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { text, voice = "nova" } = req.body;
    if (!text) return res.status(400).json({ error: "text required" });
    const openai = getOpenAIClient();
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice,
      input: text,
    });
    const arrayBuffer = await mp3.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": buffer.length,
      "Cache-Control": "no-cache",
    });
    res.send(buffer);
  } catch (err: unknown) {
    log.error("[TTS] error:", sanitizeError(err));
    res.status(500).json({ error: "TTS failed", detail: sanitizeError(err) });
  }
});

router.post("/api/voice-command", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { command, context } = req.body;

    if (!command) {
      return res.status(400).json({ message: "Command is required" });
    }

    if (!req.workspaceId) {
      return res.status(400).json({ message: "Workspace context required for voice commands" });
    }
    const aiResult = await getMeteredOpenAICompletion({
      workspaceId: req.workspaceId,
      userId: req.user?.id,
      featureKey: "voice_command",
      messages: [
        {
          role: "system",
          content: `You are a voice command interpreter for ${PLATFORM.name} workforce management platform. Parse the user's voice command and return a JSON object with: { action: string, entity: string, parameters: object, confidence: number, naturalResponse: string }. Actions include: clock_in, clock_out, navigate, create, search, update, delete, report, schedule_lookup, calloff, incident_report, post_orders, message_supervisor, call_for_backup, help_request, bug_report. For clock_in/clock_out, extract latitude and longitude from context if available. For navigate, set entity to the page name (schedule, employees, dashboard, incidents, payroll, chat). For schedule_lookup: phrases like "what's my schedule", "when do I work". For calloff: phrases like "I can't make it", "I need to call off", "call off my shift". For incident_report: phrases like "file a report", "something happened", "I need to report". For post_orders: phrases like "what are my post orders", "site instructions". For message_supervisor: phrases like "message my supervisor", "tell manager [content]" — put the message content in parameters.message. For call_for_backup: phrases like "call for backup", "send backup", "emergency", "panic", "SOS", "officer down", "send help" — this triggers an immediate duress/panic alert to supervisors and managers. For help_request: phrases like "I need help", "open help", "get support", "help desk", "contact support", "I need assistance" — navigates user to the help/support page. For bug_report: phrases like "report a bug", "something is broken", "I found a bug", "this isn't working", "there's an error", "report an issue" — opens the bug report form.`,
        },
        {
          role: "user",
          content: `Voice command: "${command}"${context ? `\nContext: ${JSON.stringify(context)}` : ""}`,
        },
      ],
      model: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 300,
    });

    if (aiResult.blocked) {
      return res.status(402).json({ message: aiResult.error || "Insufficient credits" });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(aiResult.content || "{}");
    } catch {
      parsed = {
        action: "unknown",
        naturalResponse: aiResult.content || "I didn't understand that command.",
        confidence: 0.3,
      };
    }

    // Execute actionable commands instead of just returning interpretation
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;

    if (parsed.action === 'clock_in' && parsed.confidence >= 0.7 && userId) {
      try {
        const { db } = await import('../db');
        const { timeEntries, employees } = await import('@shared/schema');
        const { eq, and, isNull } = await import('drizzle-orm');
        // Find employee linked to this user
        const [emp] = await db.select({ id: employees.id, capturedPayRate: employees.hourlyRate })
          .from(employees)
          .where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId!)))
          .limit(1);
        if (!emp) {
          parsed.executed = false;
          parsed.naturalResponse = "No employee record found for your account. Please contact your admin.";
        } else {
          // Check not already clocked in
          const [active] = await db.select({ id: timeEntries.id })
            .from(timeEntries)
            .where(and(eq(timeEntries.employeeId, emp.id), isNull(timeEntries.clockOut)))
            .limit(1);
          if (active) {
            parsed.executed = false;
            parsed.naturalResponse = "You're already clocked in. Say 'clock out' when your shift ends.";
          } else {
            await db.insert(timeEntries).values({
              employeeId: emp.id,
              workspaceId: workspaceId!,
              clockIn: new Date(),
              status: 'pending',
              notes: 'Clocked in via voice command',
              capturedPayRate: emp.capturedPayRate || '0',
            });
            parsed.executed = true;
            parsed.naturalResponse = `Clock-in recorded at ${new Date().toLocaleTimeString()}. Have a safe shift.`;
          }
        }
      } catch (execErr: unknown) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        log.error('[VoiceCommand] clock_in execution error:', execErr.message);
        parsed.executed = false;
        parsed.naturalResponse = "I understood 'clock in' but couldn't execute it. Please use the clock-in button.";
      }
    } else if (parsed.action === 'clock_out' && parsed.confidence >= 0.7 && userId) {
      try {
        const { db } = await import('../db');
        const { timeEntries, employees } = await import('@shared/schema');
        const { eq, and, isNull } = await import('drizzle-orm');
        const [emp] = await db.select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId!)))
          .limit(1);
        if (!emp) {
          parsed.executed = false;
          parsed.naturalResponse = "No employee record found for your account.";
        } else {
          const [active] = await db.select({ id: timeEntries.id, clockIn: timeEntries.clockIn })
            .from(timeEntries)
            .where(and(eq(timeEntries.employeeId, emp.id), isNull(timeEntries.clockOut)))
            .limit(1);
          if (!active) {
            parsed.executed = false;
            parsed.naturalResponse = "You're not currently clocked in.";
          } else {
            const now = new Date();
            const hoursWorked = (now.getTime() - new Date(active.clockIn!).getTime()) / 3600000;
            await db.update(timeEntries)
              .set({ clockOut: now, totalHours: hoursWorked.toFixed(2), status: 'pending' })
              .where(eq(timeEntries.id, active.id));
            parsed.executed = true;
            parsed.naturalResponse = `Clock-out recorded. You worked ${hoursWorked.toFixed(1)} hours. Good work today.`;
          }
        }
      } catch (execErr: unknown) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        log.error('[VoiceCommand] clock_out execution error:', execErr.message);
        parsed.executed = false;
        parsed.naturalResponse = "I understood 'clock out' but couldn't execute it. Please use the clock-out button.";
      }
    } else if (parsed.action === 'schedule_lookup' && parsed.confidence >= 0.6 && userId) {
      try {
        const { db } = await import('../db');
        const { employees, shifts } = await import('@shared/schema');
        const { eq, and, gte } = await import('drizzle-orm');
        const [emp] = await db.select({ id: employees.id, firstName: employees.firstName })
          .from(employees).where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId!))).limit(1);
        if (!emp) {
          parsed.executed = false;
          parsed.naturalResponse = "No employee record found. Please contact your admin.";
        } else {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
          const upcoming = await db.select({
            id: shifts.id, startTime: shifts.startTime, endTime: shifts.endTime,
            title: shifts.title, status: shifts.status,
          }).from(shifts).where(and(
            eq(shifts.employeeId, emp.id),
            gte(shifts.startTime, today),
          )).limit(5);
          if (upcoming.length === 0) {
            parsed.naturalResponse = "You have no upcoming shifts scheduled in the next week.";
          } else {
            const scheduleText = upcoming.map(s => {
              const start = new Date(s.startTime!).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
              return `${start}${s.title ? ` — ${s.title}` : ''}`;
            }).join('. ');
            parsed.naturalResponse = `Your upcoming shifts: ${scheduleText}.`;
          }
          parsed.executed = true;
          parsed.scheduleData = upcoming;
        }
      } catch (execErr: unknown) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        log.error('[VoiceCommand] schedule_lookup error:', execErr.message);
        parsed.naturalResponse = "I couldn't retrieve your schedule. Please check the Schedule page.";
      }
    } else if (parsed.action === 'calloff' && parsed.confidence >= 0.65 && userId) {
      try {
        const { db } = await import('../db');
        const { employees, shifts } = await import('@shared/schema');
        const { eq, and, gte } = await import('drizzle-orm');
        const [emp] = await db.select({ id: employees.id, firstName: employees.firstName })
          .from(employees).where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId!))).limit(1);
        if (!emp) {
          parsed.naturalResponse = "No employee record found. Please contact your admin directly.";
          parsed.executed = false;
        } else {
          const today = new Date();
          const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
          const [nextShift] = await db.select({ id: shifts.id, startTime: shifts.startTime, title: shifts.title })
            .from(shifts).where(and(eq(shifts.employeeId, emp.id), gte(shifts.startTime, today))).limit(1);
          const { platformEventBus } = await import('../services/platformEventBus');
          await platformEventBus.publish({
            type: 'shift_calloff_requested',
            category: 'automation',
            title: `Calloff Request — ${emp.firstName}`,
            description: `${emp.firstName} called off via voice command${nextShift ? ` for shift: ${nextShift.title || 'shift'} starting ${new Date(nextShift.startTime!).toLocaleString()}` : ''}`,
            workspaceId: workspaceId!,
            metadata: { employeeId: emp.id, shiftId: nextShift?.id || null, method: 'voice_command' },
          }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
          const shiftInfo = nextShift
            ? ` for your upcoming shift ${nextShift.title ? `"${nextShift.title}"` : ''} starting ${new Date(nextShift.startTime!).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
            : '';
          parsed.naturalResponse = `Calloff recorded${shiftInfo}. Your manager has been notified and will arrange coverage. Please also text or call your supervisor directly.`;
          parsed.executed = true;
        }
      } catch (execErr: unknown) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        log.error('[VoiceCommand] calloff error:', execErr.message);
        parsed.naturalResponse = "I couldn't process your calloff. Please contact your supervisor directly.";
      }
    } else if (parsed.action === 'incident_report' && parsed.confidence >= 0.6) {
      parsed.executed = true;
      parsed.navigateTo = '/rms';
      parsed.naturalResponse = "Opening the incident report form now. Please describe what happened in detail.";
    } else if (parsed.action === 'post_orders' && parsed.confidence >= 0.6 && userId) {
      try {
        const { db } = await import('../db');
        const { employees, shifts, clients } = await import('@shared/schema');
        const { eq, and, gte } = await import('drizzle-orm');
        const [emp] = await db.select({ id: employees.id })
          .from(employees).where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId!))).limit(1);
        if (emp) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const [nextShift] = await db.select({ clientId: shifts.clientId, title: shifts.title })
            .from(shifts).where(and(eq(shifts.employeeId, emp.id), gte(shifts.startTime, today))).limit(1);
          if (nextShift?.clientId) {
            const [client] = await db.select({ name: clients.companyName, postOrders: clients.postOrders })
              .from(clients).where(eq(clients.id, nextShift.clientId)).limit(1);
            if (client?.postOrders) {
              const preview = (client.postOrders as string).substring(0, 350);
              parsed.naturalResponse = `Post orders for ${nextShift.title || client.name}: ${preview}${(client.postOrders as string).length > 350 ? '... See the Site Briefing page for full details.' : ''}`;
            } else {
              parsed.naturalResponse = `Post orders for ${nextShift.title || 'your site'} have not been configured yet. Please check with your supervisor.`;
            }
          } else {
            parsed.naturalResponse = "No upcoming shift found to retrieve post orders. Please check the Schedule page.";
          }
        } else {
          parsed.naturalResponse = "Employee record not found. Please contact your admin.";
        }
        parsed.executed = true;
      } catch (execErr: unknown) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        log.error('[VoiceCommand] post_orders error:', execErr.message);
        parsed.naturalResponse = "I couldn't retrieve post orders. Please check the Site Briefing page.";
      }
    } else if (parsed.action === 'message_supervisor' && parsed.confidence >= 0.6 && userId) {
      try {
        const { db } = await import('../db');
        const { employees } = await import('@shared/schema');
        const { eq, and } = await import('drizzle-orm');
        const [emp] = await db.select({ id: employees.id, firstName: employees.firstName })
          .from(employees).where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId!))).limit(1);
        const messageContent = parsed.parameters?.message || command;
        if (emp) {
          const { platformEventBus } = await import('../services/platformEventBus');
          await platformEventBus.publish({
            type: 'employee_message_to_supervisor',
            category: 'automation',
            title: `Message from ${emp.firstName}`,
            description: messageContent,
            workspaceId: workspaceId!,
            metadata: { employeeId: emp.id, employeeName: emp.firstName, message: messageContent, method: 'voice_command' },
          }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
          parsed.executed = true;
          parsed.naturalResponse = `Message sent to your supervisor: "${messageContent}". They will receive it shortly.`;
        } else {
          parsed.naturalResponse = "Could not find your employee record. Please contact your supervisor directly.";
        }
      } catch (execErr: unknown) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        log.error('[VoiceCommand] message_supervisor error:', execErr.message);
        parsed.naturalResponse = "Message could not be sent. Please contact your supervisor directly.";
      }
    } else if (parsed.action === 'call_for_backup' && parsed.confidence >= 0.7) {
      try {
        const { db } = await import('../db');
        const { employees } = await import('@shared/schema');
        const { eq, and } = await import('drizzle-orm');
        const { platformEventBus } = await import('../services/platformEventBus');
        const { broadcastToWorkspace } = await import('../websocket');

        let employeeName = 'Officer';
        let employeeId: string | null = null;
        if (userId && workspaceId) {
          const [emp] = await db.select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName })
            .from(employees).where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId))).limit(1);
          if (emp) {
            employeeName = `${emp.firstName ?? ''} ${emp.lastName ?? ''}`.trim() || 'Officer';
            employeeId = emp.id;
          }
        }

        // Immediate WebSocket broadcast to all connected workspace supervisors/managers
        if (workspaceId) {
          broadcastToWorkspace(workspaceId, {
            type: 'safety:panic_alert',
            severity: 'critical',
            employeeId,
            employeeName,
            timestamp: new Date().toISOString(),
            source: 'voice_command',
            message: `DURESS ALERT — ${employeeName} requested backup via voice command`,
          });

          await platformEventBus.publish({
            type: 'panic_alert_triggered',
            category: 'safety',
            title: `DURESS ALERT — ${employeeName}`,
            description: `${employeeName} triggered a panic/backup alert via voice command.`,
            workspaceId,
            metadata: { employeeId, employeeName, method: 'voice_command', timestamp: new Date().toISOString() },
          }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
        }

        parsed.executed = true;
        parsed.navigateTo = '/safety';
        parsed.naturalResponse = `Emergency alert sent. Your supervisors and managers have been notified immediately. Stay on the line and follow your safety protocol.`;
      } catch (execErr: unknown) {
        log.error('[VoiceCommand] call_for_backup error:', execErr instanceof Error ? execErr.message : execErr);
        parsed.executed = false;
        parsed.naturalResponse = "Alert could not be sent automatically. Call your supervisor immediately and use the panic button in the Safety Hub.";
      }
    } else if (parsed.action === 'help_request' && parsed.confidence >= 0.6) {
      parsed.executed = true;
      parsed.navigateTo = '/support';
      parsed.naturalResponse = "Opening the help and support center. A support representative or HelpAI can assist you right away.";
    } else if (parsed.action === 'bug_report' && parsed.confidence >= 0.6) {
      parsed.executed = true;
      parsed.navigateTo = '/support?tab=bug-report';
      parsed.naturalResponse = "Opening the bug report form. Please describe what went wrong and I'll make sure it's logged and reviewed.";
    }

    res.json({ success: true, data: parsed });
  } catch (error: unknown) {
    log.error("Error processing voice command:", error);
    res.status(500).json({ message: sanitizeError(error) });
  }
});

router.get("/api/workspaces/all", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.json([]);

    const { workspaceMembers } = await import("@shared/schema");

    const memberships = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId));

    const workspaceIds = memberships.map((m) => m.workspaceId);

    const ownedWorkspaces = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerId, userId));

    const allIds = [...new Set([...workspaceIds, ...ownedWorkspaces.map((w) => w.id)])];

    if (allIds.length === 0) return res.json([]);

    const allWorkspaces = await db
      .select()
      .from(workspaces)
      .where(inArray(workspaces.id, allIds));

    res.json(allWorkspaces);
  } catch (error: unknown) {
    log.error("Error fetching all workspaces:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/api/workspaces/current", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(404).json({ message: "No current workspace" });
    }
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }
    res.json(workspace);
  } catch (error: unknown) {
    log.error("Error fetching current workspace:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/api/user/role", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.json({ role: "guest" });
    }
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    res.json({
      role: user?.role || "user",
      platformRole: (user as any)?.platformRole || null,
    });
  } catch (error: unknown) {
    log.error("Error fetching user role:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/api/device/profile", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.json({ userId: null, preferences: {} });
    }
    const user = await storage.getUser(userId);
    res.json({
      userId: user?.id,
      email: user?.email,
      displayName: (user as any)?.displayName || `${user?.firstName} ${user?.lastName}`.trim(),
      preferences: {},
    });
  } catch (error: unknown) {
    log.error("Error fetching device profile:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/api/identity/me", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user.currentWorkspaceId;
    let employee: any = null;
    let workspace: any = null;
    if (workspaceId) {
      employee = await storage.getEmployeeByUserId(userId, workspaceId);
      const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      workspace = ws;
    }

    // Resolve human-readable external IDs (ORG-XXXX, EMP-XXXX-00001, SUP-XXXX)
    // These live in the external_identifiers + support_registry tables. All
    // lookups are best-effort — missing rows just leave the field null so the
    // dashboard can gracefully hide the badge.
    const orgExternalId = workspaceId ? await getExternalId('org', workspaceId) : null;
    const employeeExternalId = employee?.id ? await getExternalId('employee', employee.id) : null;

    let supportCode: string | null = null;
    try {
      const [sup] = await db
        .select({ supportCode: supportRegistry.supportCode })
        .from(supportRegistry)
        .where(eq(supportRegistry.userId, userId))
        .limit(1);
      supportCode = sup?.supportCode ?? null;
    } catch {
      supportCode = null;
    }

    const platformRole = (user as any).platformRole ?? null;
    const isPlatformStaff = !!platformRole &&
      ['root_admin', 'deputy_admin', 'support_manager', 'sysop', 'support_agent'].includes(platformRole);
    const userType: 'employee' | 'support_agent' | 'client' | 'platform_admin' | 'guest' =
      isPlatformStaff
        ? (platformRole === 'support_agent' || platformRole === 'support_manager' ? 'support_agent' : 'platform_admin')
        : employee
          ? 'employee'
          : 'guest';

    // Primary external ID — prefer employee code, fall back to org code
    const primaryExternalId = employeeExternalId || orgExternalId || supportCode;

    res.json({
      userType,

      // External IDs for RBAC tracking
      externalId: primaryExternalId,
      employeeId: employeeExternalId,
      supportCode,
      clientId: null,
      orgId: orgExternalId || workspace?.orgId || null,

      // State licensing (regulated industries — e.g. security, healthcare)
      // Pulled from the workspaces table so every member of a licensed org
      // can display the company's license badge in the hero.
      licenseNumber: workspace?.stateLicenseNumber ?? null,
      licenseState: workspace?.stateLicenseState ?? null,
      licenseExpiry: workspace?.stateLicenseExpiry
        ? new Date(workspace.stateLicenseExpiry).toISOString()
        : null,
      licenseVerified: !!workspace?.stateLicenseVerified,
      licenseVerifiedAt: workspace?.stateLicenseVerifiedAt
        ? new Date(workspace.stateLicenseVerifiedAt).toISOString()
        : null,

      // Database IDs for support/admin visibility
      dbUserId: user.id,
      dbWorkspaceId: workspaceId ?? null,

      // Roles
      platformRole,
      workspaceRole: employee?.workspaceRole || employee?.role || null,

      // Workspace details for hero display
      workspace: workspace
        ? {
            id: workspace.id,
            name: workspace.name,
            orgCode: workspace.orgCode,
            subscriptionTier: workspace.subscriptionTier,
            stateLicenseNumber: workspace.stateLicenseNumber,
            stateLicenseState: workspace.stateLicenseState,
            stateLicenseVerified: workspace.stateLicenseVerified,
          }
        : null,

      // Full details for downstream consumers
      details: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          displayName: (user as any).displayName,
          role: user.role,
          platformRole,
          currentWorkspaceId: user.currentWorkspaceId,
          profileImageUrl: user.profileImageUrl,
        },
        employee: employee
          ? {
              id: employee.id,
              workspaceRole: employee.workspaceRole || employee.role,
              position: employee.position,
              department: (employee as any).department,
            }
          : null,
      },
    });
  } catch (error: unknown) {
    log.error("Error fetching identity:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/api/business-categories", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const categories = [
      { id: "security", name: "Security Services", icon: "shield", value: "security", label: "Security Services" },
      { id: "cleaning", name: "Cleaning Services", icon: "sparkles", value: "cleaning", label: "Cleaning Services" },
      { id: "healthcare", name: "Healthcare Staffing", icon: "heart-pulse", value: "healthcare", label: "Healthcare Staffing" },
      { id: "construction", name: "Construction", icon: "hard-hat", value: "construction", label: "Construction" },
      { id: "hospitality", name: "Hospitality", icon: "utensils", value: "hospitality", label: "Hospitality" },
      { id: "logistics", name: "Logistics & Warehousing", icon: "truck", value: "logistics", label: "Logistics & Warehousing" },
      { id: "retail", name: "Retail", icon: "shopping-cart", value: "retail", label: "Retail" },
      { id: "manufacturing", name: "Manufacturing", icon: "factory", value: "manufacturing", label: "Manufacturing" },
      { id: "it_staffing", name: "IT Staffing", icon: "monitor", value: "it_staffing", label: "IT Staffing" },
      { id: "education", name: "Education", icon: "graduation-cap", value: "education", label: "Education" },
      { id: "event_staffing", name: "Event Staffing", icon: "calendar", value: "event_staffing", label: "Event Staffing" },
      { id: "landscaping", name: "Landscaping", icon: "tree-pine", value: "landscaping", label: "Landscaping" },
      { id: "pest_control", name: "Pest Control", icon: "bug", value: "pest_control", label: "Pest Control" },
      { id: "plumbing", name: "Plumbing", icon: "wrench", value: "plumbing", label: "Plumbing" },
      { id: "electrical", name: "Electrical", icon: "zap", value: "electrical", label: "Electrical" },
      { id: "other", name: "Other", icon: "briefcase", value: "other", label: "Other" },
    ];
    res.json(categories);
  } catch (error: unknown) {
    log.error("Error fetching business categories:", error);
    res.status(500).json({ message: sanitizeError(error) });
  }
});

router.get("/api/premium-features", async (req: any, res) => {
  try {
    const { PREMIUM_FEATURES, CREDIT_PACKAGES } = await import("@shared/config/premiumFeatures");

    res.json({
      success: true,
      features: Object.values(PREMIUM_FEATURES),
      creditPackages: CREDIT_PACKAGES,
    });
  } catch (error: unknown) {
    log.error("Error getting premium features:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to get premium features" });
  }
});

router.get("/api/premium-features/:featureId/check", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const { featureId } = req.params;

    const [employee] = await db.select().from(employees).where(eq(employees.userId, userId));
    if (!employee?.workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace not found" });
    }

    const { premiumFeatureGating } = await import("../services/premiumFeatureGating");
    const access = await premiumFeatureGating.checkAccess(employee.workspaceId, featureId, userId);

    res.json({
      success: true,
      allowed: access.allowed,
      reason: access.reason,
      creditCost: access.creditCost,
      remainingCredits: access.remainingCredits,
      usageThisMonth: access.usageThisMonth,
      monthlyLimit: access.monthlyLimit,
      requiresUpgrade: access.requiresUpgrade,
      suggestedTier: access.suggestedTier,
    });
  } catch (error: unknown) {
    log.error("Error checking premium feature access:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to check feature access" });
  }
});

router.post("/api/contact", async (req, res) => {
  try {
    const { name, email, company, phone, subject, tier, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        message: "Missing required fields: name, email, subject, and message are required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }

    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(2).toString("hex").toUpperCase();
    const ticketNumber = `TKT-${timestamp}-${random}`;

    let priority = "normal";
    const normalizedTier = (tier || "").toLowerCase();
    if (normalizedTier === "strategic") priority = "urgent";
    else if (["enterprise", "business"].includes(normalizedTier)) priority = "high";

    // Route to platform support inbox — visible to ALL support agents
    const platformWorkspaceId = "coaileague-platform-workspace";

    const fullDescription = `Contact Form Submission\n\nName: ${name}\nEmail: ${email}\n${company ? `Company: ${company}\n` : ""}${phone ? `Phone: ${phone}\n` : ""}${tier ? `Tier: ${tier}\n` : ""}\n\nMessage:\n${message}`;

    // Create ticket locked to Trinity — she works it first before any human sees it
    const [ticket] = await db.transaction(async (tx) => {
      return tx
        .insert(supportTickets)
        .values({
          workspaceId: platformWorkspaceId,
          ticketNumber,
          type: "support",
          priority,
          requestedBy: `${name} <${email}>`,
          subject,
          description: fullDescription,
          status: "in_progress",
          assignedTo: "trinity-ai",
        })
        .returning();
    });

    // Send confirmation to submitter
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const _confEmail = emailService.buildSupportTicketConfirmation(ticket.id, email, ticketNumber, subject, name);
    await NotificationDeliveryService.send({ idempotencyKey: `notif-${Date.now()}`,
            type: 'support_ticket_confirmation', workspaceId: platformWorkspaceId, recipientUserId: email, channel: 'email', body: _confEmail });

    res.json({
      success: true,
      message: "Your message has been received. Trinity AI is reviewing your request now — you'll hear back shortly.",
      ticketNumber,
      ticketId: ticket.id,
      trinityWorking: true,
    });

    // ─── TRINITY TRIAGE (async — does not block response) ──────────────────────
    scheduleNonBlocking('contact.trinity-triage', async () => {
      try {
        const { meteredGemini } = await import('../services/billing/meteredGeminiClient');

        const triagePrompt = `You are Trinity, ${PLATFORM.name}'s AI co-pilot for workforce management. A prospect or customer submitted a contact form. Your job is to:
1. Understand their request
2. Provide a helpful, professional response that answers their question or addresses their concern
3. Determine if this can be resolved by AI or needs a human support agent

Contact Form Details:
- From: ${name} <${email}>
${company ? `- Company: ${company}` : ''}
${phone ? `- Phone: ${phone}` : ''}
${tier ? `- Interested Tier: ${tier}` : ''}
- Subject: ${subject}
- Message: ${message}

Respond with a JSON object:
{
  "canResolve": true/false,
  "resolution": "Your full response to the customer (if canResolve=true)",
  "summary": "Brief summary of what the customer needs",
  "escalationReason": "Why this needs human review (if canResolve=false)"
}

Resolve if the inquiry is about: pricing, features, getting started, demo requests, general questions, platform capabilities.
Escalate to human if: there are complaints, billing disputes, legal matters, urgent security issues, or complex technical problems.`;

        // @ts-expect-error — TS migration: fix in refactoring sprint
        const aiResult = await meteredGemini(
          triagePrompt,
          'PLATFORM',
          'contact_triage',
          { temperature: 0.4 }
        );

        let parsed: any = null;
        try {
          const jsonMatch = aiResult.match(/\{[\s\S]*\}/);
          if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        } catch { parsed = null; }

        if (parsed?.canResolve && parsed?.resolution) {
          // Trinity resolved it — close the ticket
          await db.update(supportTickets)
            .set({
              status: 'resolved',
              assignedTo: 'trinity-ai',
              resolution: parsed.resolution,
              resolutionSummary: parsed.summary || 'Resolved by Trinity AI',
              resolvedAt: new Date(),
              resolvedBy: 'trinity-ai',
            })
            .where(eq(supportTickets.id, ticket.id));

          log.info(`[Contact] Trinity resolved ticket ${ticketNumber} autonomously`);

          // Send Trinity's response to the submitter
          try {
            const replyHtml = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
              <p style="color:#94a3b8;font-size:12px;margin-bottom:16px">${PLATFORM.name} Support · Ticket ${ticketNumber}</p>
              <h2 style="color:#1e293b;margin-bottom:8px">Hi ${name},</h2>
              <p style="color:#475569;line-height:1.6">${parsed.resolution.replace(/\n/g, '<br>')}</p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
              <p style="color:#94a3b8;font-size:12px">Trinity AI · ${PLATFORM.name} Platform Support<br>
              If you need further help, reply to this email or call <strong>+1 (866) 464-4151</strong></p>
            </div>`;
            await NotificationDeliveryService.send({
              idempotencyKey: `notif-${Date.now()}`,
            type: 'support_ticket_confirmation',
              workspaceId: platformWorkspaceId,
              recipientUserId: email,
              channel: 'email',
              // @ts-expect-error — TS migration: fix in refactoring sprint
              body: replyHtml,
            });
          } catch (emailErr) {
            log.warn(`[Contact] Trinity reply email failed for ${ticketNumber}:`, emailErr);
          }
        } else {
          // Trinity couldn't resolve — unlock ticket for human agents
          await db.update(supportTickets)
            .set({
              status: 'open',
              assignedTo: null,
              platformNotes: `Trinity triage: ${parsed?.escalationReason || parsed?.summary || 'Needs human review'}`,
            })
            .where(eq(supportTickets.id, ticket.id));

          log.info(`[Contact] Trinity escalated ticket ${ticketNumber} to human support: ${parsed?.escalationReason || 'needs human review'}`);
        }
      } catch (triageErr) {
        // Triage failure — unlock ticket silently so humans can handle it
        log.warn(`[Contact] Trinity triage failed for ${ticketNumber}, falling back to human review:`, triageErr);
        await db.update(supportTickets)
          .set({ status: 'open', assignedTo: null })
          .where(eq(supportTickets.id, ticket.id))
          .catch(() => {});
      }
    });
    // ───────────────────────────────────────────────────────────────────────────

  } catch (error) {
    log.error("Error processing contact form:", error);
    res.status(500).json({ message: "Failed to submit contact form. Please try again." });
  }
});

router.post("/api/knowledge/ask", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const workspaceId = req.workspaceId;

    const schema = z.object({
      query: z.string().min(1, "Question is required"),
    });

    const validationResult = schema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        message: "Invalid request",
        errors: validationResult.error.errors,
      });
    }

    const { query } = validationResult.data;
    const startTime = Date.now();

    const relevantArticles = await db
      .select()
      .from(knowledgeArticles)
      .where(or(eq(knowledgeArticles.workspaceId, workspaceId!), eq(knowledgeArticles.isPublic, true)))
      .limit(5);

    const context = relevantArticles
      .map((article, idx) => `[Article ${idx + 1}: ${article.title}]\n${article.content}`)
      .join("\n\n");

    if (!process.env.OPENAI_API_KEY && !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
      const response =
        relevantArticles.length > 0
          ? `I found ${relevantArticles.length} related articles:\n\n${relevantArticles.map((a) => `• ${a.title}\n  ${a.summary || a.content.substring(0, 200)}...`).join("\n\n")}`
          : "I couldn't find any relevant information. Please contact HR or your manager for assistance.";

      await db.insert(knowledgeQueries).values({
        workspaceId,
        userId,
        query,
        response,
        responseTime: Date.now() - startTime,
        articlesRetrieved: relevantArticles.map((a) => a.id),
      });

      return res.json({ response, articles: relevantArticles });
    }

    const knowledgeWorkspaceId = workspaceId;

    if (!knowledgeWorkspaceId) {
      return res.status(400).json({ message: "Workspace context required for knowledge queries" });
    }
    const knowledgeAiResult = await getMeteredOpenAICompletion({
      workspaceId: knowledgeWorkspaceId,
      userId,
      featureKey: "knowledge_ask",
      messages: [
        {
          role: "system",
          content: `You are a helpful HR assistant for ${PLATFORM.name}. Answer employee questions about company policies, procedures, and benefits using the provided knowledge base. Be concise, friendly, and accurate. If you don't know the answer, say so and suggest contacting HR.`,
        },
        {
          role: "user",
          content: `Context from knowledge base:\n${context}\n\nEmployee question: ${query}`,
        },
      ],
      model: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 500,
    });

    if (knowledgeAiResult.blocked) {
      return res.status(402).json({ message: knowledgeAiResult.error || "Insufficient credits" });
    }

    const response = knowledgeAiResult.success
      ? knowledgeAiResult.content
      : "I'm sorry, I couldn't generate a response. Please try again.";

    await db.insert(knowledgeQueries).values({
      workspaceId,
      userId,
      query,
      response,
      responseTime: Date.now() - startTime,
      articlesRetrieved: relevantArticles.map((a) => a.id),
    });

    res.json({ response, articles: relevantArticles });
  } catch (error: unknown) {
    log.error("Error in AI knowledge retrieval:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/api/knowledge/articles", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const { category, search } = req.query;

    let query = db
      .select()
      .from(knowledgeArticles)
      .where(or(eq(knowledgeArticles.workspaceId, workspaceId!), eq(knowledgeArticles.isPublic, true)));

    const articles = await query.orderBy(desc(knowledgeArticles.createdAt));

    let filtered = articles;
    if (category) {
      filtered = filtered.filter((a) => a.category === category);
    }
    if (search) {
      const searchLower = (search as string).toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.title.toLowerCase().includes(searchLower) || a.content.toLowerCase().includes(searchLower)
      );
    }

    res.json(filtered);
  } catch (error: unknown) {
    log.error("Error fetching knowledge articles:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/api/knowledge/articles", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { title, content, category, summary, tags, isPublic } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: "Title and content are required" });
    }

    const { insertKnowledgeArticleSchema } = await import("@shared/schema");

    const validated = insertKnowledgeArticleSchema.parse({
      workspaceId,
      title,
      content,
      category: category || "general",
      summary,
      tags: tags || [],
      isPublic: isPublic || false,
      createdBy: req.user?.id,
    });

    const [article] = await db.insert(knowledgeArticles).values(validated).returning();
    res.json(article);
  } catch (error: unknown) {
    log.error("Error creating knowledge article:", error);
    res.status(400).json({ message: sanitizeError(error) });
  }
});

router.post("/api/search", requireAuth, async (req, res) => {
  try {
    const { query, filters } = req.body;
    const workspaceId = req.workspaceId;

    if (!query || query.length < 2) {
      return res.status(400).json({ message: "Query must be at least 2 characters" });
    }

    const pattern = `%${query}%`;
    const results: any[] = [];

    const matchedEmployees = await db
      .select()
      .from(employees)
      .where(
        and(
          // @ts-expect-error — TS migration: fix in refactoring sprint
          eq(employees.workspaceId, workspaceId),
          or(ilike(employees.firstName, pattern), ilike(employees.lastName, pattern), ilike(employees.email, pattern))
        )
      )
      .limit(10);

    for (const emp of matchedEmployees) {
      results.push({
        type: "employee",
        id: emp.id,
        title: `${emp.firstName} ${emp.lastName}`,
        subtitle: emp.position || emp.email,
        relevance: 0.9,
      });
    }

    const matchedClients = await db
      .select()
      .from(clients)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .where(and(eq(clients.workspaceId, workspaceId), ilike(clients.companyName, pattern)))
      .limit(10);

    for (const client of matchedClients) {
      results.push({
        type: "client",
        id: client.id,
        title: client.companyName,
        subtitle: (client as any).industry || "Client",
        relevance: 0.85,
      });
    }

    await db.insert(searchQueries).values({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      workspaceId,
      userId: req.user?.id,
      query,
      searchType: 'all',
      resultsCount: results.length,
      searchFilters: JSON.stringify(filters || {}),
    });

    res.json({ results, query, total: results.length });
  } catch (error: unknown) {
    log.error("Error performing search:", error);
    res.status(500).json({ message: "Search failed" });
  }
});

router.get("/api/search/history", requireAuth, async (req, res) => {
  try {
    const workspaceId = req.workspaceId;

    const history = await db.query.searchQueries.findMany({
      where: (searchQueries, { eq }) => eq(searchQueries.workspaceId, workspaceId!),
      orderBy: (searchQueries, { desc }) => [desc(searchQueries.createdAt)],
      limit: 50,
    });

    res.json(history);
  } catch (error) {
    log.error("Error fetching search history:", error);
    res.status(500).json({ message: "Failed to fetch search history" });
  }
});

router.get("/api/users/search", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const query = req.query.q as string;

    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace found" });
    }

    if (!query || query.length < 3) {
      return res.json([]);
    }

    const users = await storage.searchUsers(workspaceId, query);
    res.json(users);
  } catch (error: unknown) {
    log.error("Error searching users:", error);
    res.status(500).json({ message: "Failed to search users" });
  }
});

router.get("/api/escalation/matrix", requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;

    const matrix = await escalationMatrixService.getEscalationMatrix(workspaceId);

    res.json({
      success: true,
      data: matrix,
    });
  } catch (error: unknown) {
    log.error("Error fetching escalation matrix:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/api/migration/import-extracted", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { entityType, mappedData } = req.body;

    if (!entityType || !mappedData) {
      return res.status(400).json({
        error: "Missing required fields: entityType, mappedData",
      });
    }

    let importedId = "";

    if (entityType === "employee") {
      const newEmployee = await db.insert(employees).values({
        ...mappedData,
        workspaceId,
        id: `emp_${randomUUID()}`,
      });
      // @ts-expect-error — TS migration: fix in refactoring sprint
      importedId = newEmployee[0].id;
    } else if (entityType === "client") {
      const newClient = await db.insert(clients).values({
        ...mappedData,
        workspaceId,
        id: `cli_${randomUUID()}`,
      });
      // @ts-expect-error — TS migration: fix in refactoring sprint
      importedId = newClient[0].id;
    }

    await notificationEngine.sendNotification({
      workspaceId,
      type: "migration_complete",
      title: "Data Import Complete",
      message: `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} record imported successfully`,
      metadata: { importedId, entityType },
      severity: "info",
    });

    res.json({
      success: true,
      message: `${entityType} imported successfully from extracted document data`,
      importedId,
    });
  } catch (error: unknown) {
    log.error("Error importing extracted data:", error);
    res.status(500).json({ error: sanitizeError(error) || "Import failed" });
  }
});

router.get("/api/orchestration/dashboard", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { orchestrationStateMachine } = await import("../services/ai-brain/orchestrationStateMachine");
    const { db } = await import("../db");
    const { orchestrationOverlays } = await import("@shared/schema");
    const { desc, and, gte, eq, inArray } = await import("drizzle-orm");

    const workspaceId = req.workspaceId || (req.user)?.workspaceId;
    if (!workspaceId) {
      return res.json({ status: "not_started" });
    }

    const activeOverlays = await orchestrationStateMachine.getActiveOverlays(workspaceId);

    const terminalPhases = ["completed", "failed"];
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentHistory = await db
      .select()
      .from(orchestrationOverlays)
      .where(
        and(
          eq(orchestrationOverlays.workspaceId, workspaceId),
          gte(orchestrationOverlays.createdAt, twentyFourHoursAgo),
          inArray(orchestrationOverlays.phase, terminalPhases as any)
        )
      )
      .orderBy(desc(orchestrationOverlays.completedAt))
      .limit(50);

    const toolHealthSummary = orchestrationStateMachine.getToolHealthSummary();
    const toolHealthStatuses = orchestrationStateMachine.getToolHealthStatuses();

    res.json({
      activeOverlays,
      recentHistory,
      toolHealth: {
        summary: toolHealthSummary,
        statuses: toolHealthStatuses,
      },
    });
  } catch (error: unknown) {
    log.error("[OrchestrationDashboard] Error fetching data:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/api/my-team", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || (req.user)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user.currentWorkspaceId;

    const allEmployees = await storage.getEmployeesByWorkspace(workspaceId);
    const currentEmployee = allEmployees.find((e) => e.userId === userId);

    const workspaceRole = currentEmployee?.workspaceRole || user.role;
    const managerRoles = ["org_owner", "co_owner", "department_manager", "supervisor", "manager"];
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const isManager = managerRoles.includes(workspaceRole);
    if (!isManager) {
      return res.status(403).json({ message: "Only managers and supervisors can access My Team" });
    }

    let teamMembers: typeof allEmployees = [];

    if (workspaceRole === "org_owner" || workspaceRole === "co_owner") {
      teamMembers = allEmployees.filter((e) => e.id !== currentEmployee?.id);
    } else if (currentEmployee) {
      const assignments = await db
        .select()
        .from(managerAssignments)
        .where(and(eq(managerAssignments.workspaceId, workspaceId), eq(managerAssignments.managerId, currentEmployee.id)));

      const assignedIds = new Set(assignments.map((a) => a.employeeId));
      teamMembers = allEmployees.filter((e) => assignedIds.has(e.id));
    }

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    const allTimeEntries = await storage.getTimeEntriesByWorkspace(workspaceId);
    const todayEntries = allTimeEntries.filter((entry) => {
      const clockIn = new Date(entry.clockIn);
      return clockIn >= startOfDay && clockIn <= endOfDay;
    });

    const allShifts = await storage.getShiftsByWorkspace(workspaceId);
    const todayShifts = allShifts.filter((shift) => {
      const shiftDate = new Date(shift.startTime);
      return shiftDate >= startOfDay && shiftDate <= endOfDay;
    });

    const enrichedTeam = teamMembers.map((employee) => {
      const activeEntry = todayEntries.find((e) => e.employeeId === employee.id && !e.clockOut);

      const todayShift = todayShifts.find((s) => s.employeeId === employee.id);

      const completedEntries = todayEntries.filter((e) => e.employeeId === employee.id && e.clockOut);
      const hoursWorked = completedEntries.reduce((sum, entry) => {
        if (entry.clockOut) {
          const duration = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);
          return sum + duration;
        }
        return sum;
      }, 0);

      return {
        ...employee,
        isClockedIn: !!activeEntry,
        clockInTime: activeEntry?.clockIn || null,
        isScheduledToday: !!todayShift,
        scheduledShift: todayShift
          ? {
              startTime: todayShift.startTime,
              endTime: todayShift.endTime,
              clientId: todayShift.clientId,
            }
          : null,
        hoursWorkedToday: Math.round(hoursWorked * 100) / 100,
      };
    });

    enrichedTeam.sort((a, b) => {
      if (a.isClockedIn && !b.isClockedIn) return -1;
      if (!a.isClockedIn && b.isClockedIn) return 1;
      if (a.isScheduledToday && !b.isScheduledToday) return -1;
      if (!a.isScheduledToday && b.isScheduledToday) return 1;
      return (a.firstName || "").localeCompare(b.firstName || "");
    });

    res.json({
      teamMembers: enrichedTeam,
      summary: {
        total: enrichedTeam.length,
        clockedIn: enrichedTeam.filter((e) => e.isClockedIn).length,
        scheduledToday: enrichedTeam.filter((e) => e.isScheduledToday).length,
      },
    });
  } catch (error) {
    log.error("[MyTeam] Error fetching team:", error);
    res.status(500).json({ message: "Failed to fetch team data" });
  }
});

router.post("/api/client-signup", async (req, res) => {
  try {
    const { tempCode, firstName, lastName, email, password, phone, companyName } = req.body;

    if (!tempCode || !firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const { clientProspectService } = await import("../services/clientProspectService");

    const prospect = await clientProspectService.getByTempCode(tempCode);
    if (!prospect) {
      return res.status(404).json({
        success: false,
        message: "Invalid or expired access code",
      });
    }

    if (prospect.accessStatus === "converted") {
      return res.status(400).json({
        success: false,
        message: "This access code has already been used. Please log in instead.",
      });
    }

    if (prospect.accessExpiresAt && new Date(prospect.accessExpiresAt) < new Date()) {
      return res.status(403).json({
        success: false,
        message: "Access code has expired. Please contact the service provider.",
      });
    }

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`LOWER(${users.email}) = ${email.toLowerCase().trim()}`)
      .limit(1);

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "An account with this email already exists. Please log in instead.",
      });
    }

    const bcrypt = await import("bcryptjs");
    const cryptoMod = await import("crypto");

    const passwordHash = await bcrypt.hash(password, 10);

    const [newUser] = await db
      .insert(users)
      .values({
        email: email.toLowerCase().trim(),
        passwordHash,
        firstName,
        lastName,
        phone: phone || prospect.phone,
      })
      .returning();

    const clientCode = `CLI-${prospect.orgCode}-${cryptoMod.randomBytes(3).toString("hex").toUpperCase()}`;

    const { workspaceMembers } = await import("@shared/schema");

    const [newClient] = await db
      .insert(clients)
      .values({
        workspaceId: prospect.workspaceId,
        userId: newUser.id,
        clientCode,
        firstName,
        lastName,
        email: email.toLowerCase().trim(),
        phone: phone || prospect.phone,
        companyName: companyName || prospect.companyName,
      })
      .returning();

    await clientProspectService.convertToClient({
      prospectId: prospect.id,
      clientId: newClient.id,
      userId: newUser.id,
    });

    await db
      .insert(workspaceMembers)
      .values({
        userId: newUser.id,
        workspaceId: prospect.workspaceId,
        role: "client",
        status: "active",
      })
      .onConflictDoNothing();

    res.json({
      success: true,
      message: "Account created successfully",
      clientCode: newClient.clientCode,
      redirectTo: "/login",
    });
  } catch (error: unknown) {
    log.error("[ClientSignup] Error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to create account. Please try again later.",
    });
  }
});

router.get("/api/sites", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) {
      return res.json([]);
    }
    const workspaceSites = await db.select().from(sites).where(eq(sites.workspaceId, workspaceId)).orderBy(asc(sites.name));
    res.json(workspaceSites);
  } catch (error: unknown) {
    log.error("Error fetching sites:", error);
    res.status(500).json({ error: "Failed to fetch sites" });
  }
});

router.get("/api/search/suggestions", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    const q = (req.query.q as string) || "";

    if (!q || q.length < 2 || !workspaceId) {
      return res.json({ query: q, suggestions: [] });
    }

    const pattern = `%${q}%`;
    const suggestions: Array<{ type: string; id: string; label: string; description?: string }> = [];

    const matchedEmployees = await db
      .select({
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        position: employees.position,
      })
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, workspaceId),
          or(ilike(employees.firstName, pattern), ilike(employees.lastName, pattern))
        )
      )
      .limit(5);

    for (const emp of matchedEmployees) {
      suggestions.push({
        type: "employee",
        id: emp.id,
        label: `${emp.firstName} ${emp.lastName}`,
        description: emp.position || "Employee",
      });
    }

    const matchedClients = await db
      .select({
        id: clients.id,
        companyName: clients.companyName,
        industry: (clients as any).industry,
      })
      .from(clients)
      .where(and(eq(clients.workspaceId, workspaceId), ilike(clients.companyName, pattern)))
      .limit(5);

    for (const client of matchedClients) {
      suggestions.push({
        type: "client",
        id: client.id,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        label: client.companyName,
        description: client.industry || "Client",
      });
    }

    const pages = [
      { id: "dashboard", label: "Dashboard", path: "/dashboard" },
      { id: "employees", label: "Employees", path: "/employees" },
      { id: "clients", label: "Clients", path: "/clients" },
      { id: "scheduling", label: "Scheduling", path: "/scheduling" },
      { id: "time-tracking", label: "Time Tracking", path: "/time-tracking" },
      { id: "invoices", label: "Invoices", path: "/invoices" },
      { id: "reports", label: "Reports", path: "/reports" },
      { id: "settings", label: "Settings", path: "/settings" },
    ];
    const matchedPages = pages.filter((p) => p.label.toLowerCase().includes(q.toLowerCase()));
    for (const page of matchedPages.slice(0, 3)) {
      suggestions.push({
        type: "page",
        id: page.id,
        label: page.label,
        description: page.path,
      });
    }

    res.json({ query: q, suggestions: suggestions.slice(0, 10) });
  } catch (error: unknown) {
    log.error("Error fetching search suggestions:", error);
    res.status(500).json({ error: "Failed to fetch suggestions" });
  }
});

router.get("/api/device/settings", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    if (!userId || !workspaceId) {
      return res.json({ notifications: true, theme: "system", fontSize: "medium", compactMode: false });
    }

    const [prefs] = await db
      .select()
      .from(userNotificationPreferences)
      .where(and(eq(userNotificationPreferences.userId, userId), eq(userNotificationPreferences.workspaceId, workspaceId)))
      .limit(1);

    if (!prefs) {
      await db
        .insert(userNotificationPreferences)
        .values({
          userId,
          workspaceId,
          enablePush: true,
          enableEmail: true,
          enableSms: false,
        })
        .onConflictDoNothing();

      return res.json({ notifications: true, theme: "system", fontSize: "medium", compactMode: false });
    }

    res.json({
      notifications: prefs.enablePush ?? true,
      theme: "system",
      fontSize: "medium",
      compactMode: false,
      emailEnabled: prefs.enableEmail ?? true,
      smsEnabled: prefs.enableSms ?? false,
      pushEnabled: prefs.enablePush ?? true,
      digestFrequency: prefs.digestFrequency ?? "realtime",
    });
  } catch (error: unknown) {
    log.error("Error fetching device settings:", error);
    res.json({ notifications: true, theme: "system", fontSize: "medium", compactMode: false });
  }
});

router.get("/api/timesheets/export/csv", requireAuth, (req: AuthenticatedRequest, res) => {
  const queryString = req.url.split("?")[1] || "";
  res.redirect(`/api/timesheet-reports/export/csv${queryString ? "?" + queryString : ""}`);
});

router.get("/api/timesheets/export/pdf", requireAuth, (req: AuthenticatedRequest, res) => {
  const queryString = req.url.split("?")[1] || "";
  res.redirect(`/api/timesheet-reports/export/pdf${queryString ? "?" + queryString : ""}`);
});

const scheduleSmartAIRequestSchema = z.object({
  openShiftIds: z.array(z.string()).min(1, "At least one shift ID is required"),
  availableEmployeeIds: z.array(z.string()).min(1, "At least one employee ID is required"),
  constraints: z
    .object({
      maxShiftsPerEmployee: z.number().int().positive().optional(),
      requiredSkills: z.array(z.string()).optional(),
      preferExperience: z.boolean().optional(),
      balanceWorkload: z.boolean().optional(),
    })
    .optional(),
});

router.get("/api/shift-templates", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const workspace = (await storage.getWorkspaceByOwnerId(userId)) || (await storage.getWorkspaceByMembership(userId));

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const templates = await storage.getShiftTemplatesByWorkspace(workspace.id);
    res.json(templates);
  } catch (error) {
    log.error("Error fetching shift templates:", error);
    res.status(500).json({ message: "Failed to fetch shift templates" });
  }
});

router.post("/api/shift-templates", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const workspace = (await storage.getWorkspaceByOwnerId(userId)) || (await storage.getWorkspaceByMembership(userId));

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const template = await storage.createShiftTemplate({
      ...req.body,
      workspaceId: workspace.id,
    });
    res.json(template);
  } catch (error: unknown) {
    log.error("Error creating shift template:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create shift template" });
  }
});

// ─── Missing workspace / billing aliases ─────────────────────────────────────
router.get("/api/workspace/current", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) return res.status(404).json({ message: "No current workspace" });
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    res.json(workspace);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.get("/api/workspace/stats", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) return res.json({ employeeCount: 0, clientCount: 0, activeShifts: 0, timeEntryCount: 0, invoiceCount: 0, deliveredInvoiceCount: 0 });
    const [empCount] = await db.select({ count: sql<number>`count(*)::int` }).from(employees).where(eq(employees.workspaceId, workspaceId));
    const [clientCount] = await db.select({ count: sql<number>`count(*)::int` }).from(clients).where(eq(clients.workspaceId, workspaceId));
    const [shiftCount] = await db.select({ count: sql<number>`count(*)::int` }).from(shifts).where(and(eq(shifts.workspaceId, workspaceId), inArray(shifts.status, ['published', 'in_progress', 'scheduled'])));
    const [teCount] = await db.select({ count: sql<number>`count(*)::int` }).from(timeEntries).where(eq(timeEntries.workspaceId, workspaceId));
    const [invCount] = await db.select({ count: sql<number>`count(*)::int` }).from(invoices).where(eq(invoices.workspaceId, workspaceId));
    const [deliveredCount] = await db.select({ count: sql<number>`count(*)::int` }).from(invoices).where(and(eq(invoices.workspaceId, workspaceId), eq(invoices.deliveryConfirmed, true)));
    res.json({
      employeeCount: Number(empCount?.count || 0),
      clientCount: Number(clientCount?.count || 0),
      activeShifts: Number(shiftCount?.count || 0),
      timeEntryCount: Number(teCount?.count || 0),
      invoiceCount: Number(invCount?.count || 0),
      deliveredInvoiceCount: Number(deliveredCount?.count || 0),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.get("/api/workspace/health", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) return res.json({ status: "unknown", employeeCount: 0, activeShifts: 0 });
    const [empCount] = await db.select({ count: sql<number>`count(*)` }).from(employees).where(eq(employees.workspaceId, workspaceId));
    const [shiftCount] = await db.select({ count: sql<number>`count(*)` }).from(shifts).where(and(eq(shifts.workspaceId, workspaceId), inArray(shifts.status, ['published', 'in_progress', 'scheduled'])));
    res.json({
      status: "healthy",
      workspaceId,
      employeeCount: Number(empCount?.count || 0),
      activeShifts: Number(shiftCount?.count || 0),
      checkedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.get("/api/billing/subscription", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) return res.json({ tier: "starter", status: "active", trialEndsAt: null, trialStartedAt: null, currentPeriodEnd: null });
    const [sub] = await db
      .select({ status: orgSubscriptions.status, tierId: orgSubscriptions.tierId, currentPeriodEnd: orgSubscriptions.currentPeriodEnd })
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.workspaceId, workspaceId))
      .limit(1);
    if (!sub) return res.json({ tier: "starter", status: "active", trialEndsAt: null, trialStartedAt: null, currentPeriodEnd: null });
    const [tier] = await db.select({ tierName: subscriptionTiers.tierName }).from(subscriptionTiers).where(eq(subscriptionTiers.id, sub.tierId)).limit(1);
    res.json({
      tier: tier?.tierName || "starter",
      status: sub.status || "active",
      trialEndsAt: null,
      trialStartedAt: null,
      currentPeriodEnd: sub.currentPeriodEnd,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// In-memory safety check records (field-submitted safety inspections)
const safetyCheckStore = new Map<string, any[]>(); // keyed by workspaceId

// GET /api/safety-checks/recent — Recent safety check submissions for this workspace
router.get("/api/safety-checks/recent", requireAuth, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.json([]);
    const records = safetyCheckStore.get(workspaceId) || [];
    res.json(records.slice(-20).reverse());
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// POST /api/safety-checks — Submit a safety inspection check
router.post("/api/safety-checks", requireAuth, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.userId || req.user?.id;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { items, notes, location, timestamp } = req.body;
    const passCount = Object.values(items || {}).filter((v: any) => v === "pass").length;
    const failCount = Object.values(items || {}).filter((v: any) => v === "fail").length;
    const record = {
      id: randomUUID(),
      workspaceId,
      submittedBy: userId,
      siteName: (req.body.siteName as string) || "Field Location",
      completedAt: timestamp || new Date().toISOString(),
      passCount,
      failCount,
      status: failCount > 0 ? "issues_found" : "passed",
      items,
      notes,
      location,
    };
    const existing = safetyCheckStore.get(workspaceId) || [];
    existing.push(record);
    safetyCheckStore.set(workspaceId, existing);
    res.json({ success: true, data: record });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// NOTE: GET /api/user/view-mode and PATCH /api/user/preferences are
// handled in authCoreRoutes.ts with full DB persistence and workspace-aware
// view mode resolution. Do not add duplicates here.

export default router;
