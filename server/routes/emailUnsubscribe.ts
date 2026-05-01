/**
 * Email Unsubscribe Routes - CAN-SPAM Compliance
 *
 * Provides endpoints for:
 * - One-click unsubscribe (RFC 8058)
 * - Web-based unsubscribe with preferences
 * - Resubscribe functionality
 *
 * All commercial emails must include List-Unsubscribe headers pointing to these endpoints.
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { emailUnsubscribes } from "@shared/schema";
import { eq, and, or, isNull } from "drizzle-orm";
import { generateUnsubscribeToken } from "../services/emailCore";
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';
const log = createLogger('EmailUnsubscribe');


/**
 * Escape HTML characters to prevent XSS in server-rendered templates
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const router = Router();

// ============================================================================
// UNSUBSCRIBE PAGE - Renders unsubscribe confirmation page
// ============================================================================

/**
 * GET /api/email/unsubscribe
 * Shows unsubscribe confirmation page with options
 */
router.get("/unsubscribe", async (req: Request, res: Response) => {
  try {
    const { token, email } = req.query;

    if (!token || !email) {
      return res.status(400).send(renderUnsubscribePage({
        error: "Invalid unsubscribe link. Please use the link from your email.",
      }));
    }

    // Verify token matches email
    const record = await db.select()
      .from(emailUnsubscribes)
      .where(
        and(
          eq(emailUnsubscribes.email, (email as string).toLowerCase()),
          eq(emailUnsubscribes.unsubscribeToken, token as string)
        )
      )
      .limit(1);

    if (record.length === 0) {
      return res.status(400).send(renderUnsubscribePage({
        error: "Invalid or expired unsubscribe link.",
      }));
    }

    const unsub = record[0];

    res.send(renderUnsubscribePage({
      email: email as string,
      token: token as string,
      currentPreferences: {
        unsubscribeAll: unsub.unsubscribeAll || false,
        unsubscribeMarketing: unsub.unsubscribeMarketing || false,
        unsubscribeNotifications: unsub.unsubscribeNotifications || false,
        unsubscribeDigests: unsub.unsubscribeDigests || false,
      },
    }));
  } catch (error: unknown) {
    log.error('[Unsubscribe] Error rendering page:', sanitizeError(error));
    res.status(500).send(renderUnsubscribePage({
      error: "An error occurred. Please try again later.",
    }));
  }
});

// ============================================================================
// ONE-CLICK UNSUBSCRIBE - RFC 8058 Compliance
// ============================================================================

/**
 * POST /api/email/unsubscribe
 * One-click unsubscribe handler (RFC 8058)
 * Mail clients send POST with List-Unsubscribe=One-Click in body
 */
router.post("/unsubscribe", async (req: Request, res: Response) => {
  try {
    const { token, email, category, List } = req.body;

    // Handle RFC 8058 one-click format
    const isOneClick = List === "One-Click" || req.body['List-Unsubscribe'] === 'One-Click';

    // Get email from query params if not in body (for one-click from headers)
    const targetEmail = email || req.query.email;
    const targetToken = token || req.query.token;

    if (!targetToken || !targetEmail) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters"
      });
    }

    // Verify token
    const record = await db.select()
      .from(emailUnsubscribes)
      .where(
        and(
          eq(emailUnsubscribes.email, (targetEmail as string).toLowerCase()),
          eq(emailUnsubscribes.unsubscribeToken, targetToken as string)
        )
      )
      .limit(1);

    if (record.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid unsubscribe token"
      });
    }

    // Determine what to unsubscribe from
    const updateData: Record<string, unknown> = {
      unsubscribedAt: new Date(),
      unsubscribeSource: isOneClick ? 'one_click' : 'email_link',
      ipAddress: req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0],
      userAgent: req.headers['user-agent'],
      resubscribedAt: null,
    };

    // One-click always unsubscribes from all
    if (isOneClick) {
      updateData.unsubscribeAll = true;
    } else {
      // Support two form submission formats:
      // 1. category=all|marketing|notifications|digests (legacy single-select)
      // 2. Individual checkbox fields: unsubscribeMarketing, unsubscribeNotifications, unsubscribeDigests
      //    (sent as "on" when checked, absent when unchecked)
      const hasIndividualFields =
        req.body.unsubscribeMarketing !== undefined ||
        req.body.unsubscribeNotifications !== undefined ||
        req.body.unsubscribeDigests !== undefined;

      if (hasIndividualFields) {
        // Individual checkbox mode — apply each flag independently
        if (req.body.unsubscribeMarketing === 'on' || req.body.unsubscribeMarketing === 'true' || req.body.unsubscribeMarketing === true) {
          updateData.unsubscribeMarketing = true;
        }
        if (req.body.unsubscribeNotifications === 'on' || req.body.unsubscribeNotifications === 'true' || req.body.unsubscribeNotifications === true) {
          updateData.unsubscribeNotifications = true;
        }
        if (req.body.unsubscribeDigests === 'on' || req.body.unsubscribeDigests === 'true' || req.body.unsubscribeDigests === true) {
          updateData.unsubscribeDigests = true;
        }
        // Also handle the "all" checkbox if present alongside individual fields
        if (category === 'all' || req.body.unsubscribeAll === 'on' || req.body.unsubscribeAll === true) {
          updateData.unsubscribeAll = true;
        }
      } else {
        // Category-specific unsubscribe (legacy single-select mode)
        switch (category) {
          case 'all':
            updateData.unsubscribeAll = true;
            break;
          case 'marketing':
            updateData.unsubscribeMarketing = true;
            break;
          case 'notifications':
            updateData.unsubscribeNotifications = true;
            break;
          case 'digests':
            updateData.unsubscribeDigests = true;
            break;
          default:
            // Default to unsubscribe all if no category specified
            updateData.unsubscribeAll = true;
        }
      }
    }

    await db.update(emailUnsubscribes)
      .set(updateData)
      .where(eq(emailUnsubscribes.id, record[0].id));

    log.info(`[Unsubscribe] ${targetEmail} unsubscribed from ${category || 'all'} (source: ${updateData.unsubscribeSource})`);

    // Return appropriate response
    if (isOneClick) {
      // RFC 8058 requires 200 OK with no body or simple body
      return res.status(200).send("Unsubscribed successfully");
    }

    // For web form submissions, return JSON or redirect
    if (req.headers.accept?.includes('application/json')) {
      return res.json({
        success: true,
        message: "You have been successfully unsubscribed"
      });
    }

    // Redirect to confirmation page
    res.redirect(`/api/email/unsubscribe/confirm?email=${encodeURIComponent(targetEmail as string)}`);
  } catch (error: unknown) {
    log.error('[Unsubscribe] Error processing request:', sanitizeError(error));
    res.status(500).json({
      success: false,
      error: "An error occurred processing your unsubscribe request"
    });
  }
});

// ============================================================================
// UPDATE PREFERENCES - Granular unsubscribe options
// ============================================================================

const updatePreferencesSchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  unsubscribeAll: z.boolean().optional(),
  unsubscribeMarketing: z.boolean().optional(),
  unsubscribeNotifications: z.boolean().optional(),
  unsubscribeDigests: z.boolean().optional(),
  reason: z.string().optional(),
});

/**
 * PUT /api/email/unsubscribe/preferences
 * Update granular email preferences
 */
router.put("/unsubscribe/preferences", async (req: Request, res: Response) => {
  try {
    const validated = updatePreferencesSchema.parse(req.body);

    // Verify token
    const record = await db.select()
      .from(emailUnsubscribes)
      .where(
        and(
          eq(emailUnsubscribes.email, validated.email.toLowerCase()),
          eq(emailUnsubscribes.unsubscribeToken, validated.token)
        )
      )
      .limit(1);

    if (record.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid token or email"
      });
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
      unsubscribeSource: 'preferences',
      ipAddress: req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0],
      userAgent: req.headers['user-agent'],
    };

    if (validated.unsubscribeAll !== undefined) {
      updateData.unsubscribeAll = validated.unsubscribeAll;
      // If turning off unsubscribe all, mark as resubscribed
      if (!validated.unsubscribeAll && record[0].unsubscribeAll) {
        updateData.resubscribedAt = new Date();
      } else if (validated.unsubscribeAll) {
        updateData.unsubscribedAt = new Date();
        updateData.resubscribedAt = null;
      }
    }

    if (validated.unsubscribeMarketing !== undefined) {
      updateData.unsubscribeMarketing = validated.unsubscribeMarketing;
    }

    if (validated.unsubscribeNotifications !== undefined) {
      updateData.unsubscribeNotifications = validated.unsubscribeNotifications;
    }

    if (validated.unsubscribeDigests !== undefined) {
      updateData.unsubscribeDigests = validated.unsubscribeDigests;
    }

    if (validated.reason) {
      updateData.unsubscribeReason = validated.reason;
    }

    await db.update(emailUnsubscribes)
      .set(updateData)
      .where(eq(emailUnsubscribes.id, record[0].id));

    log.info(`[Unsubscribe] Updated preferences for ${validated.email}`);

    res.json({
      success: true,
      message: "Email preferences updated successfully"
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: "Invalid request",
        details: error.errors
      });
    }
    log.error('[Unsubscribe] Error updating preferences:', sanitizeError(error));
    res.status(500).json({
      success: false,
      error: "An error occurred updating your preferences"
    });
  }
});

// ============================================================================
// RESUBSCRIBE ENDPOINT
// ============================================================================

/**
 * POST /api/email/resubscribe
 * Allow users to resubscribe after unsubscribing
 */
router.post("/resubscribe", async (req: Request, res: Response) => {
  try {
    const { token, email } = req.body;

    if (!token || !email) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters"
      });
    }

    // Verify token
    const record = await db.select()
      .from(emailUnsubscribes)
      .where(
        and(
          eq(emailUnsubscribes.email, email.toLowerCase()),
          eq(emailUnsubscribes.unsubscribeToken, token)
        )
      )
      .limit(1);

    if (record.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid token or email"
      });
    }

    // Resubscribe - reset all unsubscribe flags
    await db.update(emailUnsubscribes)
      .set({
        unsubscribeAll: false,
        unsubscribeMarketing: false,
        unsubscribeNotifications: false,
        unsubscribeDigests: false,
        resubscribedAt: new Date(),
        unsubscribeSource: 'resubscribe',
        ipAddress: req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0],
        userAgent: req.headers['user-agent'],
        updatedAt: new Date(),
      })
      .where(eq(emailUnsubscribes.id, record[0].id));

    log.info(`[Unsubscribe] ${email} resubscribed to all emails`);

    res.json({
      success: true,
      message: "You have been successfully resubscribed to our emails"
    });
  } catch (error: unknown) {
    log.error('[Resubscribe] Error:', sanitizeError(error));
    res.status(500).json({
      success: false,
      error: "An error occurred processing your resubscribe request"
    });
  }
});

// ============================================================================
// CONFIRMATION PAGE
// ============================================================================

/**
 * GET /api/email/unsubscribe/confirm
 * Shows unsubscribe confirmation
 */
router.get("/unsubscribe/confirm", (req: Request, res: Response) => {
  const { email } = req.query;
  const safeEmail = email ? escapeHtml(email as string) : null;

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Unsubscribed - ${PLATFORM.name}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 600px;
          margin: 40px auto;
          padding: 20px;
          text-align: center;
          color: #333;
        }
        .success { color: #16a34a; font-size: 48px; margin-bottom: 20px; }
        h1 { color: #1f2937; margin-bottom: 10px; }
        p { color: #6b7280; line-height: 1.6; }
        .email { font-weight: bold; color: #2563eb; }
      </style>
    </head>
    <body>
      <div class="success">&#10003;</div>
      <h1>Successfully Unsubscribed</h1>
      <p>
        ${safeEmail ? `<span class="email">${safeEmail}</span> has been` : 'You have been'}
        removed from our mailing list.
      </p>
      <p>You will no longer receive marketing emails from ${PLATFORM.name}.</p>
      <p style="margin-top: 30px; font-size: 14px;">
        Changed your mind? Contact support to resubscribe.
      </p>
    </body>
    </html>
  `);
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

interface UnsubscribePageOptions {
  email?: string;
  token?: string;
  error?: string;
  currentPreferences?: {
    unsubscribeAll: boolean;
    unsubscribeMarketing: boolean;
    unsubscribeNotifications: boolean;
    unsubscribeDigests: boolean;
  };
}

function renderUnsubscribePage(options: UnsubscribePageOptions): string {
  const { email, token, error, currentPreferences } = options;
  const safeEmail = email ? escapeHtml(email) : null;
  const safeToken = token ? escapeHtml(token) : null;
  const safeError = error ? escapeHtml(error) : null;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Preferences - ${PLATFORM.name}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 600px;
          margin: 40px auto;
          padding: 20px;
          color: #333;
          background: #f9fafb;
        }
        .container {
          background: white;
          border-radius: 12px;
          padding: 40px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        h1 { color: #1f2937; margin-bottom: 10px; }
        .subtitle { color: #6b7280; margin-bottom: 30px; }
        .error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #dc2626;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
        }
        .email-display {
          background: #f3f4f6;
          padding: 12px 20px;
          border-radius: 8px;
          margin-bottom: 30px;
          font-weight: 500;
        }
        .option {
          display: flex;
          align-items: flex-start;
          padding: 15px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        .option:last-child { border-bottom: none; }
        .option input { margin-right: 15px; margin-top: 4px; }
        .option-label { font-weight: 500; color: #1f2937; }
        .option-desc { font-size: 14px; color: #6b7280; margin-top: 4px; }
        .btn {
          display: inline-block;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 600;
          text-decoration: none;
          cursor: pointer;
          border: none;
          font-size: 16px;
          margin-top: 20px;
        }
        .btn-primary { background: #2563eb; color: white; }
        .btn-danger { background: #dc2626; color: white; }
        .btn-secondary { background: #f3f4f6; color: #374151; margin-left: 10px; }
        .btn:hover { opacity: 0.9; }
        .footer {
          text-align: center;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          font-size: 12px;
          color: #9ca3af;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Email Preferences</h1>
        <p class="subtitle">Manage your email subscription settings</p>

        ${safeError ? `<div class="error">${safeError}</div>` : ''}

        ${safeEmail && safeToken ? `
          <div class="email-display">${safeEmail}</div>

          <form id="preferencesForm" action="/api/email/unsubscribe" method="POST">
            <input type="hidden" name="token" value="${safeToken}">
            <input type="hidden" name="email" value="${safeEmail}">

            <div class="option">
              <input type="checkbox" id="all" name="category" value="all"
                ${currentPreferences?.unsubscribeAll ? 'checked' : ''}>
              <div>
                <label for="all" class="option-label">Unsubscribe from all emails</label>
                <p class="option-desc">Stop receiving all non-essential emails from ${PLATFORM.name}</p>
              </div>
            </div>

            <div class="option">
              <input type="checkbox" id="marketing" name="unsubscribeMarketing"
                ${currentPreferences?.unsubscribeMarketing ? 'checked' : ''}>
              <div>
                <label for="marketing" class="option-label">Marketing emails</label>
                <p class="option-desc">Product announcements, promotions, and newsletters</p>
              </div>
            </div>

            <div class="option">
              <input type="checkbox" id="notifications" name="unsubscribeNotifications"
                ${currentPreferences?.unsubscribeNotifications ? 'checked' : ''}>
              <div>
                <label for="notifications" class="option-label">Notification emails</label>
                <p class="option-desc">Shift assignments, schedule changes, and updates</p>
              </div>
            </div>

            <div class="option">
              <input type="checkbox" id="digests" name="unsubscribeDigests"
                ${currentPreferences?.unsubscribeDigests ? 'checked' : ''}>
              <div>
                <label for="digests" class="option-label">Digest emails</label>
                <p class="option-desc">Daily and weekly summary emails</p>
              </div>
            </div>

            <button type="submit" class="btn btn-danger">Update Preferences</button>
          </form>

          <p style="margin-top: 20px; font-size: 14px; color: #6b7280;">
            Note: You will still receive important account and security emails.
          </p>
        ` : ''}

        <div class="footer">
          <p>${PLATFORM.name} - AI-Powered Workforce Intelligence</p>
          <p>This page is provided for CAN-SPAM compliance.</p>
        </div>
      </div>

      <script>
        // Handle checkbox logic
        document.getElementById('all')?.addEventListener('change', function() {
          const checkboxes = document.querySelectorAll('input[type="checkbox"]:not(#all)');
          checkboxes.forEach(cb => {
            cb.checked = this.checked;
            cb.disabled = this.checked;
          });
        });
      </script>
    </body>
    </html>
  `;
}

export default router;
