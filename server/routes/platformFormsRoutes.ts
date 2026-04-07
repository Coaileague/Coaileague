import { Router } from 'express';
import type { Request, Response } from 'express';
import { PLATFORM } from '../config/platformConfig';
import { randomBytes } from 'crypto';
import { pool } from '../db';
import { requireAuth } from '../auth';
import { createLogger } from '../lib/logger';
import { trinityEmailProcessor } from '../services/trinityEmailProcessor';
import { sendCanSpamCompliantEmail, isResendConfigured } from '../services/emailCore';
import { generateAndStorePdf, generateAndGetPdf } from '../services/formsPdfService';

const log = createLogger('PlatformFormsRoutes');
const router = Router();

// GET /api/forms — list forms for workspace (auth required)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const workspaceId = user.workspaceId;
    const result = await pool.query(
      `SELECT id, form_type, title, description, fields, submit_action,
              is_active, requires_auth, requires_signature, signature_label,
              pre_population_source, expires_at, created_at
       FROM platform_forms
       WHERE (workspace_id = $1 OR workspace_id IS NULL)
         AND is_active = true
       ORDER BY form_type, created_at`,
      [workspaceId]
    );
    res.json(result.rows);
  } catch (err: any) {
    log.error('Failed to list forms:', err?.message);
    res.status(500).json({ error: 'Failed to list forms' });
  }
});

// GET /api/forms/invitations — list invitations for workspace (forms manager)
router.get('/invitations', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const wid = user.workspaceId;
    const status = (req.query.status as string) || null;
    const formId = (req.query.formId as string) || null;

    let q = `SELECT fi.id, fi.token, fi.sent_to_email, fi.sent_to_phone, fi.sent_to_name,
                    fi.status, fi.context_type, fi.context_id,
                    fi.opened_at, fi.submitted_at, fi.created_at, fi.expires_at,
                    fi.reminder_sent_at,
                    pf.title AS form_title, pf.form_type
             FROM form_invitations fi
             JOIN platform_forms pf ON pf.id = fi.form_id
             WHERE fi.workspace_id = $1`;
    const params: any[] = [wid];

    if (status) { q += ` AND fi.status = $${params.length + 1}`; params.push(status); }
    if (formId) { q += ` AND fi.form_id = $${params.length + 1}`; params.push(formId); }
    q += ' ORDER BY fi.created_at DESC LIMIT 200';

    const result = await pool.query(q, params);
    res.json({ invitations: result.rows, count: result.rowCount });
  } catch (err: any) {
    log.error('Failed to list invitations:', err?.message);
    res.status(500).json({ error: 'Failed to list invitations' });
  }
});

// POST /api/forms/:invId/reminder — send reminder
router.post('/:invId/reminder', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const inv = await pool.query(
      `SELECT fi.*, pf.title FROM form_invitations fi
       JOIN platform_forms pf ON pf.id = fi.form_id
       WHERE fi.id = $1 AND fi.workspace_id = $2`,
      [req.params.invId, user.workspaceId]
    );
    if (!inv.rows[0]) return res.status(404).json({ error: 'Invitation not found' });
    const row = inv.rows[0];
    if (row.status === 'submitted') return res.status(400).json({ error: 'Already submitted' });

    await pool.query(
      `UPDATE form_invitations SET reminder_sent_at = NOW() WHERE id = $1 AND workspace_id = $2`,
      [row.id, user.workspaceId]
    );

    const formUrl = `${process.env.BASE_URL || 'https://coaileague.com'}/forms/${row.token}`;
    log.info(`Reminder for invitation ${row.id} → ${row.sent_to_email} url=${formUrl}`);

    res.json({ success: true, message: `Reminder logged for ${row.sent_to_email || row.sent_to_name}`, formUrl });
  } catch (err: any) {
    log.error('Failed to send reminder:', err?.message);
    res.status(500).json({ error: 'Failed to send reminder' });
  }
});

// POST /api/forms — create a custom form
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const {
      formType, title, description, fields, submitAction, successMessage,
      requiresSignature, signatureLabel, prePopulationSource
    } = req.body;

    if (!formType || !title || !fields) {
      return res.status(400).json({ error: 'formType, title, and fields are required' });
    }

    const result = await pool.query(
      `INSERT INTO platform_forms
       (workspace_id, form_type, title, description, fields, submit_action, success_message,
        requires_signature, signature_label, pre_population_source, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        user.workspaceId,
        formType,
        title,
        description || null,
        JSON.stringify(fields),
        submitAction || null,
        successMessage || 'Your form has been submitted successfully.',
        requiresSignature || false,
        signatureLabel || 'Your Signature',
        prePopulationSource || null,
        user.id,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    log.error('Failed to create form:', err?.message);
    res.status(500).json({ error: 'Failed to create form' });
  }
});

// GET /api/forms/public/:token — public form access (NO auth required)
router.get('/public/:token', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT fi.id AS invitation_id, fi.token, fi.status, fi.expires_at,
              fi.context_type, fi.context_id, fi.workspace_id,
              fi.pre_populated_data, fi.sent_to_name,
              pf.id AS form_id, pf.title, pf.description, pf.fields,
              pf.requires_auth, pf.success_message, pf.submit_action,
              pf.requires_signature, pf.signature_label, pf.branding
       FROM form_invitations fi
       JOIN platform_forms pf ON pf.id = fi.form_id
       WHERE fi.token = $1
         AND fi.expires_at > NOW()
         AND fi.status != 'expired'`,
      [req.params.token]
    );

    if (!result.rows[0]) {
      return res.status(404).json({
        error: 'Form not found or expired',
        message: 'This form link is no longer valid. Please contact the organization for a new link.',
      });
    }

    const row = result.rows[0];
    if (row.status === 'submitted') {
      return res.json({ alreadySubmitted: true, title: row.title });
    }

    // Mark as opened (only if not already opened)
    await pool.query(
      `UPDATE form_invitations SET status = 'opened', opened_at = NOW()
       WHERE token = $1 AND status = 'sent'`,
      [req.params.token]
    );

    res.json({
      invitationId: row.invitation_id,
      token: row.token,
      formId: row.form_id,
      title: row.title,
      description: row.description,
      fields: row.fields,
      requiresAuth: row.requires_auth,
      requiresSignature: row.requires_signature,
      signatureLabel: row.signature_label || 'Your Signature',
      successMessage: row.success_message,
      expiresAt: row.expires_at,
      prePopulatedData: row.pre_populated_data || {},
      sentToName: row.sent_to_name,
      branding: row.branding || {},
    });
  } catch (err: any) {
    log.error('Failed to load public form:', err?.message);
    res.status(500).json({ error: 'Failed to load form' });
  }
});

// POST /api/forms/public/:token/submit — public form submission (NO auth required)
router.post('/public/:token/submit', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT fi.*, pf.submit_action, pf.workspace_id AS pf_workspace_id,
              pf.success_message, pf.requires_signature, pf.fields
       FROM form_invitations fi
       JOIN platform_forms pf ON pf.id = fi.form_id
       WHERE fi.token = $1 AND fi.expires_at > NOW() AND fi.status != 'expired'`,
      [req.params.token]
    );

    if (!result.rows[0]) {
      return res.status(410).json({ error: 'This form link has expired or is no longer valid.' });
    }

    const inv = result.rows[0];
    if (inv.status === 'submitted') {
      return res.status(409).json({ error: 'This form has already been submitted.' });
    }

    const { data: formData, signatureData, signatureType, typedName } = req.body;
    const data = formData || req.body;

    // Server-side: validate signature if required
    if (inv.requires_signature && !signatureData) {
      return res.status(400).json({
        error: 'Signature required',
        message: 'Please sign the form before submitting.',
      });
    }

    // Detect device type from user agent
    const ua = req.headers['user-agent'] || '';
    const deviceType = /Mobile|Android|iPhone|iPad/i.test(ua)
      ? (/iPad/i.test(ua) ? 'tablet' : 'mobile')
      : 'desktop';

    const ip = req.ip || req.socket?.remoteAddress || null;

    // Store submission
    const sub = await pool.query(
      `INSERT INTO form_submissions
       (workspace_id, form_id, invitation_id, submitted_by_email, submitted_by_name,
        data, signature_data, signature_type, typed_name,
        ip_address, user_agent, device_type,
        trinity_processing_status, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', NOW())
       RETURNING *`,
      [
        inv.workspace_id || inv.pf_workspace_id,
        inv.form_id,
        inv.id,
        inv.sent_to_email || data?.email || null,
        inv.sent_to_name || data?.full_name || `${data?.firstName || ''} ${data?.lastName || ''}`.trim() || null,
        JSON.stringify(data),
        signatureData || null,
        signatureType || (signatureData ? 'drawn' : null),
        typedName || null,
        ip,
        ua,
        deviceType,
      ]
    );

    // Mark invitation submitted
    await pool.query(
      `UPDATE form_invitations SET status = 'submitted', submitted_at = NOW() WHERE id = $1 AND workspace_id = $2`,
      [inv.id, inv.workspace_id]
    );

    // Trinity + PDF + Email pipeline — all async, non-blocking
    setImmediate(async () => {
      const submissionRow = sub.rows[0];
      const workspaceId = inv.workspace_id || inv.pf_workspace_id;

      try {
        // 1. Trigger Trinity action processing
        await trinityEmailProcessor.processFormSubmission(
          submissionRow,
          inv.submit_action,
          inv.context_type,
          inv.context_id
        );

        // 2. Fetch full form definition for PDF generation
        const formRow = await pool.query(
          `SELECT id, title, form_type, description, fields, requires_signature, signature_label
           FROM platform_forms WHERE id = $1`,
          [inv.form_id]
        );
        const formDef = formRow.rows[0];

        if (formDef) {
          const fields = Array.isArray(formDef.fields) ? formDef.fields :
            (typeof formDef.fields === 'string' ? JSON.parse(formDef.fields) : []);

          // 3. Generate PDF and store in org_documents
          const pdfUrl = await generateAndStorePdf({
            submission: {
              ...submissionRow,
              data: typeof submissionRow.data === 'string' ? JSON.parse(submissionRow.data) : submissionRow.data,
            },
            form: { ...formDef, fields },
          });

          // 3a. Persist generated PDF URL back to form_submissions immediately
          // This must happen before the email step so the URL is always saved
          // even if email delivery fails.
          if (pdfUrl) {
            await pool.query(
              `UPDATE form_submissions SET generated_document_url = $1 WHERE id = $2 AND workspace_id = $3`,
              [pdfUrl, submissionRow.id, workspaceId]
            ).catch((e: any) => log.warn('Failed to persist PDF URL to form_submissions:', e?.message));
          }

          // 4. Send confirmation email to submitter via Resend
          if (isResendConfigured() && submissionRow.submitted_by_email) {
            const baseUrl = process.env.BASE_URL || 'https://coaileague.com';
            const pdfLink = pdfUrl ? `${baseUrl}${pdfUrl}` : null;
            await sendCanSpamCompliantEmail({
              to: submissionRow.submitted_by_email,
              subject: `Confirmation: ${formDef.title} Received`,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;">
                  <div style="background:linear-gradient(135deg,#0f2a4a 0%,#1e3a5f 100%);padding:30px 40px;border-radius:8px 8px 0 0;">
                    <h1 style="color:#fff;margin:0;font-size:22px;">${PLATFORM.name}</h1>
                    <p style="color:#d4af37;margin:6px 0 0;font-size:13px;letter-spacing:0.5px;">FORM SUBMISSION CONFIRMED</p>
                  </div>
                  <div style="background:#fff;padding:30px 40px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
                    <p style="color:#374151;font-size:15px;">Hello ${submissionRow.submitted_by_name || 'there'},</p>
                    <p style="color:#374151;font-size:15px;line-height:1.6;">
                      Your submission for <strong>${formDef.title}</strong> has been received and is being processed.
                    </p>
                    <div style="background:#f3f4f6;padding:18px;border-radius:6px;margin:20px 0;border-left:4px solid #d4af37;">
                      <p style="margin:4px 0;font-size:14px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;font-size:11px;">Submission Details</p>
                      <p style="margin:4px 0;font-size:14px;"><strong>Form:</strong> ${formDef.title}</p>
                      <p style="margin:4px 0;font-size:14px;"><strong>Submitted:</strong> ${new Date(submissionRow.submitted_at).toLocaleString()}</p>
                      <p style="margin:4px 0;font-size:14px;"><strong>Reference ID:</strong> ${submissionRow.id}</p>
                    </div>
                    ${pdfLink ? `
                    <div style="text-align:center;margin:24px 0;">
                      <a href="${pdfLink}" style="background:#0f2a4a;color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block;">
                        Download Your Copy (PDF)
                      </a>
                    </div>` : ''}
                    <p style="color:#6b7280;font-size:13px;">You will be notified of any updates. Keep this email for your records.</p>
                  </div>
                </div>`,
              emailType: 'form_submission_confirmation',
              workspaceId,
              skipUnsubscribeCheck: true,
            }).catch((e: any) => log.warn('Submitter confirmation email failed:', e?.message));
          }

          // 5. Notify workspace manager/owner
          const wsRow = await pool.query(
            `SELECT u.email AS owner_email, u.first_name AS owner_name, w.name AS workspace_name
             FROM workspaces w
             JOIN users u ON u.id = w.owner_id
             WHERE w.id = $1`,
            [workspaceId]
          );
          const ws = wsRow.rows[0];
          if (ws?.owner_email && isResendConfigured()) {
            const baseUrl = process.env.BASE_URL || 'https://coaileague.com';
            await sendCanSpamCompliantEmail({
              to: ws.owner_email,
              subject: `New Form Submission: ${formDef.title}`,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;">
                  <div style="background:linear-gradient(135deg,#0f2a4a 0%,#1e3a5f 100%);padding:24px 36px;border-radius:8px 8px 0 0;">
                    <h1 style="color:#fff;margin:0;font-size:20px;">${PLATFORM.name}</h1>
                    <p style="color:#d4af37;margin:5px 0 0;font-size:12px;letter-spacing:0.5px;">NEW FORM SUBMISSION ALERT</p>
                  </div>
                  <div style="background:#fff;padding:24px 36px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
                    <p style="color:#374151;font-size:15px;">Hello ${ws.owner_name || 'Manager'},</p>
                    <p style="color:#374151;font-size:15px;line-height:1.6;">
                      A new form submission has been received for <strong>${formDef.title}</strong>.
                    </p>
                    <div style="background:#f3f4f6;padding:16px;border-radius:6px;margin:16px 0;">
                      <p style="margin:4px 0;font-size:14px;"><strong>Submitted By:</strong> ${submissionRow.submitted_by_name || 'Anonymous'}</p>
                      <p style="margin:4px 0;font-size:14px;"><strong>Email:</strong> ${submissionRow.submitted_by_email || '—'}</p>
                      <p style="margin:4px 0;font-size:14px;"><strong>Time:</strong> ${new Date(submissionRow.submitted_at).toLocaleString()}</p>
                      <p style="margin:4px 0;font-size:14px;"><strong>ID:</strong> ${submissionRow.id}</p>
                    </div>
                    <div style="text-align:center;margin:20px 0;">
                      <a href="${baseUrl}/forms" style="background:#0f2a4a;color:#fff;padding:11px 24px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block;">
                        View in Forms Manager
                      </a>
                    </div>
                  </div>
                </div>`,
              emailType: 'form_submission_notification',
              workspaceId,
              skipUnsubscribeCheck: true,
            }).catch((e: any) => log.warn('Manager notification email failed:', e?.message));
          }
        }

        await pool.query(
          `UPDATE form_submissions SET trinity_processing_status = 'complete' WHERE id = $1 AND workspace_id = $2`,
          [submissionRow.id, workspaceId]
        );

        // 6. Emit platform event
        const { platformEventBus } = await import('../services/platformEventBus');
        platformEventBus.publish({
          type: 'form_submitted',
          category: 'automation',
          title: `Form Submitted: ${inv.title || 'Untitled Form'}`,
          description: `Form '${inv.title || 'Untitled Form'}' was submitted by ${submissionRow.submitted_by_name || 'Anonymous'}.`,
          workspaceId,
          metadata: {
            submissionId: submissionRow.id,
            formId: inv.form_id,
            invitationId: inv.id,
            contextType: inv.context_type,
            contextId: inv.context_id,
          },
          visibility: 'all'
        }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
      } catch (e: any) {
        log.error('Form submission pipeline error:', e?.message);
        await pool.query(
          `UPDATE form_submissions SET trinity_processing_status = 'failed' WHERE id = $1 AND workspace_id = $2`,
          [submissionRow.id, workspaceId]
        ).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
      }
    });

    res.json({
      success: true,
      submissionId: sub.rows[0].id,
      message: inv.success_message || 'Your form has been submitted successfully.',
    });
  } catch (err: any) {
    log.error('Failed to submit public form:', err?.message);
    res.status(500).json({ error: 'Failed to submit form' });
  }
});

// GET /api/forms/:formId/submissions — get submissions for a form (auth required)
router.get('/:formId/submissions', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = await pool.query(
      `SELECT fs.id, fs.submitted_by_email, fs.submitted_by_name, fs.data,
              fs.submitted_at, fs.processed_at, fs.trinity_action_taken,
              fs.trinity_processing_status, fs.device_type, fs.signature_type,
              fs.generated_document_url,
              fi.status AS invitation_status, fi.sent_to_name
       FROM form_submissions fs
       LEFT JOIN form_invitations fi ON fi.id = fs.invitation_id
       WHERE fs.form_id = $1 AND fs.workspace_id = $2
       ORDER BY fs.submitted_at DESC`,
      [req.params.formId, user.workspaceId]
    );
    res.json(result.rows);
  } catch (err: any) {
    log.error('Failed to get form submissions:', err?.message);
    res.status(500).json({ error: 'Failed to get submissions' });
  }
});

// ─── Document Signing Sequences ───────────────────────────────────────────────

// POST /api/forms/signing/sequences — create a multi-party signing sequence
router.post('/signing/sequences', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { documentTitle, documentId, formId, signers, expiresInDays = 30 } = req.body;
    if (!documentTitle || !signers?.length) {
      return res.status(400).json({ error: 'documentTitle and signers are required' });
    }

    const seq = await pool.query(
      `INSERT INTO document_signing_sequences
       (workspace_id, document_id, form_id, document_title, signers, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + $6::interval)
       RETURNING *`,
      [
        user.workspaceId,
        documentId || null,
        formId || null,
        documentTitle,
        JSON.stringify(signers),
        `${Math.min(Number(expiresInDays), 90)} days`,
      ]
    );

    const sequence = seq.rows[0];

    // Create signing tokens for each signer
    const tokens = [];
    for (const signer of signers) {
      const tok = await pool.query(
        `INSERT INTO document_signing_tokens
         (sequence_id, workspace_id, document_id, signer_email, signer_name,
          signer_role, signer_order, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
                 CASE WHEN $7 = 1 THEN 'pending' ELSE 'waiting' END,
                 NOW() + $8::interval)
         RETURNING *`,
        [
          sequence.id,
          user.workspaceId,
          documentId || null,
          signer.email,
          signer.name,
          signer.role || 'signer',
          signer.order || 1,
          `${Math.min(Number(expiresInDays), 90)} days`,
        ]
      );
      tokens.push(tok.rows[0]);
    }

    const baseUrl = process.env.BASE_URL || 'https://coaileague.com';
    const tokenLinks = tokens.map(t => ({
      signerName: t.signer_name,
      signerEmail: t.signer_email,
      signerOrder: t.signer_order,
      status: t.status,
      signingUrl: `${baseUrl}/sign/${t.token}`,
    }));

    // Email first signer in the sequence
    const firstToken = tokens.find(t => t.signer_order === 1 || t.status === 'pending');
    if (firstToken?.signer_email && isResendConfigured()) {
      const senderName = (user as any).first_name
        ? `${(user as any).first_name} ${(user as any).last_name || ''}`.trim()
        : PLATFORM.name;
      const signingUrl = `${baseUrl}/sign/${firstToken.token}`;
      setImmediate(async () => {
        await sendCanSpamCompliantEmail({
          to: firstToken.signer_email,
          subject: `Signature Required: ${documentTitle}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;">
              <div style="background:linear-gradient(135deg,#0f2a4a 0%,#1e3a5f 100%);padding:28px 36px;border-radius:8px 8px 0 0;">
                <h1 style="color:#fff;margin:0;font-size:22px;">${PLATFORM.name}</h1>
                <p style="color:#d4af37;margin:5px 0 0;font-size:12px;letter-spacing:0.8px;">SIGNATURE REQUEST</p>
              </div>
              <div style="background:#fff;padding:28px 36px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
                <p style="color:#374151;font-size:15px;">Hello ${firstToken.signer_name},</p>
                <p style="color:#374151;font-size:15px;line-height:1.7;">
                  <strong>${senderName}</strong> has requested your signature on the following document:
                </p>
                <div style="background:#f3f4f6;padding:18px;border-radius:6px;margin:20px 0;border-left:4px solid #d4af37;">
                  <p style="margin:0;font-size:16px;font-weight:700;color:#0f2a4a;">${documentTitle}</p>
                  <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Role: ${firstToken.signer_role || 'Signer'} · Order: ${firstToken.signer_order} of ${signers.length}</p>
                </div>
                <div style="text-align:center;margin:28px 0;">
                  <a href="${signingUrl}" style="background:#0f2a4a;color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:700;display:inline-block;font-size:15px;">
                    Review &amp; Sign Document
                  </a>
                </div>
                <p style="color:#6b7280;font-size:13px;text-align:center;">
                  This signing link expires in ${Math.min(Number(expiresInDays), 90)} days. Keep this link confidential.
                </p>
              </div>
            </div>`,
          emailType: 'document_signing_request',
          workspaceId: user.workspaceId,
          skipUnsubscribeCheck: true,
        }).catch((e: any) => log.warn(`Signing email failed for ${firstToken.signer_email}:`, e?.message));
      });
    }

    res.status(201).json({ sequence, tokens: tokenLinks, firstSignerEmailSent: !!(firstToken?.signer_email && isResendConfigured()) });
  } catch (err: any) {
    log.error('Failed to create signing sequence:', err?.message);
    res.status(500).json({ error: 'Failed to create signing sequence' });
  }
});

// GET /api/forms/signing/sequences — list sequences for workspace
router.get('/signing/sequences', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = await pool.query(
      `SELECT dss.id, dss.document_title, dss.status, dss.signers,
              dss.current_signer_index, dss.created_at, dss.completed_at, dss.expires_at,
              COUNT(dst.id) AS total_signers,
              COUNT(dst.id) FILTER (WHERE dst.status = 'signed') AS signed_count
       FROM document_signing_sequences dss
       LEFT JOIN document_signing_tokens dst ON dst.sequence_id = dss.id
       WHERE dss.workspace_id = $1
       GROUP BY dss.id
       ORDER BY dss.created_at DESC
       LIMIT 100`,
      [user.workspaceId]
    );
    res.json(result.rows);
  } catch (err: any) {
    log.error('Failed to list signing sequences:', err?.message);
    res.status(500).json({ error: 'Failed to list sequences' });
  }
});

// GET /api/forms/sign/:token — public signing access (NO auth)
router.get('/sign/:token', async (req: Request, res: Response) => {
  try {
    const tok = await pool.query(
      `SELECT dst.*, dss.document_title, dss.signers, dss.status AS sequence_status
       FROM document_signing_tokens dst
       JOIN document_signing_sequences dss ON dss.id = dst.sequence_id
       WHERE dst.token = $1 AND dst.expires_at > NOW()`,
      [req.params.token]
    );
    if (!tok.rows[0]) return res.status(404).json({ error: 'Signing link not found or expired' });
    const t = tok.rows[0];
    if (t.status === 'waiting') return res.status(200).json({ waiting: true, message: 'Awaiting prior signers to complete' });
    if (t.status === 'signed') return res.json({ alreadySigned: true, documentTitle: t.document_title });

    res.json({
      token: t.token,
      signerName: t.signer_name,
      signerEmail: t.signer_email,
      signerRole: t.signer_role,
      signerOrder: t.signer_order,
      documentTitle: t.document_title,
      sequenceStatus: t.sequence_status,
      expiresAt: t.expires_at,
    });
  } catch (err: any) {
    log.error('Failed to load signing token:', err?.message);
    res.status(500).json({ error: 'Failed to load signing request' });
  }
});

// POST /api/forms/sign/:token — submit signature (NO auth)
router.post('/sign/:token', async (req: Request, res: Response) => {
  try {
    const { signatureData, typedName } = req.body;
    if (!signatureData) return res.status(400).json({ error: 'signatureData is required' });

    const tok = await pool.query(
      `SELECT dst.*, dss.id AS seq_id, dss.signers, dss.current_signer_index
       FROM document_signing_tokens dst
       JOIN document_signing_sequences dss ON dss.id = dst.sequence_id
       WHERE dst.token = $1 AND dst.expires_at > NOW() AND dst.status = 'pending'`,
      [req.params.token]
    );
    if (!tok.rows[0]) return res.status(410).json({ error: 'This signing link is expired or already used.' });
    const t = tok.rows[0];
    const ip = req.ip || null;

    // Mark this token as signed
    await pool.query(
      `UPDATE document_signing_tokens SET status = 'signed', signed_at = NOW(),
       signature_data = $1, typed_name = $2, ip_address = $3 WHERE id = $4`,
      [signatureData, typedName || null, ip, t.id]
    );

    // Advance sequence: activate next signer
    const nextIndex = t.current_signer_index + 1;
    const signers = t.signers || [];
    const nextSigner = signers[nextIndex];

    if (nextSigner) {
      await pool.query(
        `UPDATE document_signing_sequences SET current_signer_index = $1 WHERE id = $2`,
        [nextIndex, t.seq_id]
      );
      // Activate next token
      const nextTokResult = await pool.query(
        `UPDATE document_signing_tokens SET status = 'pending'
         WHERE sequence_id = $1 AND signer_order = $2 RETURNING token`,
        [t.seq_id, nextIndex + 1]
      );

      // Email next signer their signing link
      if (nextSigner.email && isResendConfigured()) {
        const nextSigningToken = nextTokResult.rows[0]?.token;
        if (nextSigningToken) {
          const baseUrl = process.env.BASE_URL || 'https://coaileague.com';
          const nextSigningUrl = `${baseUrl}/sign/${nextSigningToken}`;
          setImmediate(async () => {
            await sendCanSpamCompliantEmail({
              to: nextSigner.email,
              subject: `Your Turn to Sign: ${t.document_title}`,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;">
                  <div style="background:linear-gradient(135deg,#0f2a4a 0%,#1e3a5f 100%);padding:26px 34px;border-radius:8px 8px 0 0;">
                    <h1 style="color:#fff;margin:0;font-size:20px;">${PLATFORM.name}</h1>
                    <p style="color:#d4af37;margin:5px 0 0;font-size:11px;letter-spacing:0.8px;">YOUR SIGNATURE IS NEEDED</p>
                  </div>
                  <div style="background:#fff;padding:26px 34px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
                    <p style="color:#374151;font-size:15px;">Hello ${nextSigner.name},</p>
                    <p style="color:#374151;font-size:15px;line-height:1.7;">
                      The previous party has signed. It is now your turn to review and sign:
                    </p>
                    <div style="background:#f3f4f6;padding:16px;border-radius:6px;margin:18px 0;border-left:4px solid #d4af37;">
                      <p style="margin:0;font-size:15px;font-weight:700;color:#0f2a4a;">${t.document_title}</p>
                      <p style="margin:6px 0 0;font-size:13px;color:#6b7280;">Step ${nextIndex + 1} of ${signers.length}</p>
                    </div>
                    <div style="text-align:center;margin:24px 0;">
                      <a href="${nextSigningUrl}" style="background:#0f2a4a;color:#fff;padding:13px 30px;text-decoration:none;border-radius:6px;font-weight:700;display:inline-block;font-size:14px;">
                        Review &amp; Sign Now
                      </a>
                    </div>
                  </div>
                </div>`,
              emailType: 'document_signing_request',
              workspaceId: t.workspace_id,
              skipUnsubscribeCheck: true,
            }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
          });
        }
      }

      // Emit platform event for partial signature
      const { platformEventBus } = await import('../services/platformEventBus');
      platformEventBus.publish({
        type: 'document_partially_signed',
        category: 'automation',
        title: `Document Signed by ${t.signer_name}`,
        description: `${t.signer_name} has signed '${t.document_title}'. Next signer: ${nextSigner.name}.`,
        workspaceId: t.workspace_id,
        metadata: {
          sequenceId: t.seq_id,
          documentId: t.document_id,
          signerName: t.signer_name,
          signerEmail: t.signer_email,
          nextSignerName: nextSigner.name,
          nextSignerEmail: nextSigner.email
        },
        visibility: 'all'
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    } else {
      // All signed
      await pool.query(
        `UPDATE document_signing_sequences SET status = 'complete', completed_at = NOW() WHERE id = $1 AND workspace_id = $2`,
        [t.seq_id, t.workspace_id]
      );

      // Emit platform event for sequence completion
      const { platformEventBus } = await import('../services/platformEventBus');
      platformEventBus.publish({
        type: 'document_fully_signed',
        category: 'automation',
        title: `Document Fully Signed: ${t.document_title}`,
        description: `All parties have signed '${t.document_title}'. The document is now fully executed.`,
        workspaceId: t.workspace_id,
        metadata: {
          sequenceId: t.seq_id,
          documentId: t.document_id,
          documentTitle: t.document_title,
          signerCount: signers.length
        },
        visibility: 'all'
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    }

    res.json({ success: true, message: 'Signature recorded successfully.' });
  } catch (err: any) {
    log.error('Failed to submit signature:', err?.message);
    res.status(500).json({ error: 'Failed to record signature' });
  }
});

// ─── Online Proposals ─────────────────────────────────────────────────────────

// POST /api/forms/proposals — create an online proposal
router.post('/proposals', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { title, leadId, clientId, clientName, clientEmail, content, totalMonthlyValue } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    const proposalNumber = `PROP-${Date.now().toString(36).toUpperCase()}`;
    const result = await pool.query(
      `INSERT INTO sales_proposals_online
       (workspace_id, lead_id, client_id, proposal_number, title, client_name, client_email,
        content, total_monthly_value, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        user.workspaceId, leadId || null, clientId || null,
        proposalNumber, title, clientName || null, clientEmail || null,
        JSON.stringify(content || {}), totalMonthlyValue || null, user.id,
      ]
    );
    const proposal = result.rows[0];
    const proposalUrl = `${process.env.BASE_URL || 'https://coaileague.com'}/proposals/${proposal.token}`;
    res.status(201).json({ proposal, proposalUrl });
  } catch (err: any) {
    log.error('Failed to create proposal:', err?.message);
    res.status(500).json({ error: 'Failed to create proposal' });
  }
});

// GET /api/forms/proposals/public/:token — view proposal (NO auth)
router.get('/proposals/public/:token', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, title, proposal_number, status, content, client_name,
              client_email, total_monthly_value, expires_at, sent_at
       FROM sales_proposals_online
       WHERE token = $1 AND expires_at > NOW()`,
      [req.params.token]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Proposal not found or expired' });
    const p = result.rows[0];

    // Mark viewed
    if (!p.client_viewed_at) {
      await pool.query(
        `UPDATE sales_proposals_online SET client_viewed_at = NOW(), status = 'viewed'
         WHERE token = $1 AND client_viewed_at IS NULL`,
        [req.params.token]
      );
    }

    res.json(p);
  } catch (err: any) {
    log.error('Failed to load proposal:', err?.message);
    res.status(500).json({ error: 'Failed to load proposal' });
  }
});

// POST /api/forms/proposals/public/:token/action — accept/decline proposal
router.post('/proposals/public/:token/action', async (req: Request, res: Response) => {
  try {
    const { action, signatureData, clientName, declineReason, changeRequests } = req.body;
    if (!['accept', 'decline', 'changes_requested'].includes(action)) {
      return res.status(400).json({ error: 'action must be accept, decline, or changes_requested' });
    }
    if (action === 'accept' && !signatureData) {
      return res.status(400).json({ error: 'signatureData required for acceptance' });
    }

    const result = await pool.query(
      `SELECT id, workspace_id, status FROM sales_proposals_online
       WHERE token = $1 AND expires_at > NOW()`,
      [req.params.token]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Proposal not found or expired' });
    const p = result.rows[0];

    const statusMap: Record<string, string> = {
      accept: 'accepted', decline: 'declined', changes_requested: 'changes_requested'
    };

    const signedAt = action === 'accept' ? new Date() : null;
    await pool.query(
      `UPDATE sales_proposals_online SET
         status = $1, client_action = $2, client_action_at = NOW(),
         client_signature_data = $3, client_signed_at = $4,
         client_name = COALESCE($5, client_name),
         client_decline_reason = $6, client_change_requests = $7
       WHERE id = $8`,
      [
        statusMap[action], action, signatureData || null,
        signedAt, clientName || null, declineReason || null, changeRequests || null, p.id,
      ]
    );

    log.info(`Proposal ${p.id} action=${action} workspace=${p.workspace_id}`);
    res.json({ success: true, status: statusMap[action] });
  } catch (err: any) {
    log.error('Failed to process proposal action:', err?.message);
    res.status(500).json({ error: 'Failed to process action' });
  }
});

// GET /api/forms/:id — get a specific form (auth required)
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = await pool.query(
      `SELECT * FROM platform_forms
       WHERE id = $1 AND (workspace_id = $2 OR workspace_id IS NULL)`,
      [req.params.id, user.workspaceId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Form not found' });
    res.json(result.rows[0]);
  } catch (err: any) {
    log.error('Failed to get form:', err?.message);
    res.status(500).json({ error: 'Failed to get form' });
  }
});

// POST /api/forms/:formId/invite — send a form invitation via secure token
router.post('/:formId/invite', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { email, phone, name, contextType, contextId, expiresHours = 168, prePopulatedData: manualData } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ error: 'email or phone required' });
    }

    // Verify form exists and is accessible
    const formResult = await pool.query(
      `SELECT id, title, pre_population_source, requires_signature
       FROM platform_forms
       WHERE id = $1 AND (workspace_id = $2 OR workspace_id IS NULL) AND is_active = true`,
      [req.params.formId, user.workspaceId]
    );
    if (!formResult.rows[0]) {
      return res.status(404).json({ error: 'Form not found or inactive' });
    }
    const form = formResult.rows[0];

    // Build pre-populated data from context
    let prePopulatedData: Record<string, any> = manualData || {};

    if (contextType === 'employee' && contextId) {
      const emp = await pool.query(
        `SELECT e.first_name, e.last_name, e.email, e.phone,
                e.employee_number, e.position, e.hire_date,
                e.address, e.city, e.state, e.zip_code
         FROM employees e
         WHERE e.id = $1 AND e.workspace_id = $2`,
        [contextId, user.workspaceId]
      );
      if (emp.rows[0]) {
        const e = emp.rows[0];
        prePopulatedData = {
          ...prePopulatedData,
          firstName: e.first_name,
          lastName: e.last_name,
          full_name: `${e.first_name} ${e.last_name}`.trim(),
          email: e.email,
          phone: e.phone,
          employeeNumber: e.employee_number,
          position: e.position,
          hireDate: e.hire_date,
          address: e.address,
          city: e.city,
          state: e.state,
          zipCode: e.zip_code,
        };
      }
    } else if (contextType === 'client' && contextId) {
      const cli = await pool.query(
        `SELECT c.name AS company_name, c.contact_name, c.email, c.phone,
                c.billing_address, c.id AS client_number
         FROM clients c
         WHERE c.id = $1 AND c.workspace_id = $2`,
        [contextId, user.workspaceId]
      );
      if (cli.rows[0]) {
        const c = cli.rows[0];
        prePopulatedData = {
          ...prePopulatedData,
          companyName: c.company_name,
          contactName: c.contact_name,
          email: c.email,
          phone: c.phone,
          clientNumber: c.client_number,
          billingAddress: c.billing_address,
        };
      }
    }

    // Phase 58: use 32-byte cryptographic random token (64-char hex) — NOT a UUID
    const invitationToken = randomBytes(32).toString('hex');

    const inv = await pool.query(
      `INSERT INTO form_invitations
       (workspace_id, form_id, token, sent_to_email, sent_to_phone, sent_to_name,
        sent_by_user_id, context_type, context_id, pre_populated_data,
        expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               NOW() + INTERVAL '${Math.min(Number(expiresHours) || 168, 720)} hours')
       RETURNING *`,
      [
        user.workspaceId,
        req.params.formId,
        invitationToken,
        email || null,
        phone || null,
        name || null,
        user.id,
        contextType || null,
        contextId || null,
        JSON.stringify(prePopulatedData),
      ]
    );

    const invitation = inv.rows[0];
    const baseUrl = process.env.BASE_URL || 'https://coaileague.com';
    const formUrl = `${baseUrl}/forms/${invitation.token}`;
    log.info(`Form invitation created token=${invitation.token} to=${email || phone} form=${form.title}`);

    // Send invitation email via Resend
    if (email && isResendConfigured()) {
      const senderName = (user as any).first_name ? `${(user as any).first_name} ${(user as any).last_name || ''}`.trim() : `Your ${PLATFORM.name} Team`;
      setImmediate(async () => {
        await sendCanSpamCompliantEmail({
          to: email,
          subject: `Action Required: Please complete — ${form.title}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;">
              <div style="background:linear-gradient(135deg,#0f2a4a 0%,#1e3a5f 100%);padding:28px 36px;border-radius:8px 8px 0 0;">
                <h1 style="color:#fff;margin:0;font-size:22px;">${PLATFORM.name}</h1>
                <p style="color:#d4af37;margin:5px 0 0;font-size:12px;letter-spacing:0.8px;">FORM INVITATION</p>
              </div>
              <div style="background:#fff;padding:28px 36px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
                <p style="color:#374151;font-size:15px;">Hello${name ? ` ${name}` : ''},</p>
                <p style="color:#374151;font-size:15px;line-height:1.7;">
                  <strong>${senderName}</strong> has invited you to complete the following form:
                </p>
                <div style="background:#f3f4f6;padding:18px;border-radius:6px;margin:20px 0;border-left:4px solid #d4af37;">
                  <p style="margin:0;font-size:16px;font-weight:700;color:#0f2a4a;">${form.title}</p>
                  ${form.description ? `<p style="margin:8px 0 0;font-size:14px;color:#6b7280;">${form.description || ''}</p>` : ''}
                </div>
                <div style="text-align:center;margin:28px 0;">
                  <a href="${formUrl}" style="background:#0f2a4a;color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:700;display:inline-block;font-size:15px;">
                    Open Form &amp; Complete
                  </a>
                </div>
                <p style="color:#6b7280;font-size:13px;text-align:center;">
                  This link expires in ${Math.min(Number(expiresHours) || 168, 720) / 24} days. Do not share this link.
                </p>
                <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:20px;">
                  Powered by ${PLATFORM.name} · Workforce Management Platform
                </p>
              </div>
            </div>`,
          emailType: 'form_invitation',
          workspaceId: user.workspaceId,
          skipUnsubscribeCheck: true,
        }).catch((e: any) => log.warn(`Invitation email failed for ${email}:`, e?.message));
      });
    }

    res.json({ invitation, formUrl, formTitle: form.title, emailSent: !!(email && isResendConfigured()) });
  } catch (err: any) {
    log.error('Failed to create form invitation:', err?.message);
    res.status(500).json({ error: 'Failed to create invitation' });
  }
});

// GET /api/forms/submissions/:id/pdf — download generated PDF for a submission
router.get('/submissions/:id/pdf', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const sub = await pool.query(
      `SELECT fs.*, pf.title, pf.form_type, pf.fields, pf.requires_signature, pf.signature_label
       FROM form_submissions fs
       JOIN platform_forms pf ON pf.id = fs.form_id
       WHERE fs.id = $1 AND fs.workspace_id = $2`,
      [req.params.id, user.workspaceId]
    );
    if (!sub.rows[0]) return res.status(404).json({ error: 'Submission not found' });
    const row = sub.rows[0];

    let pdfBuf = (global as any).__formPdfCache?.[req.params.id] || null;

    if (!pdfBuf) {
      const fields = Array.isArray(row.fields) ? row.fields :
        (typeof row.fields === 'string' ? JSON.parse(row.fields) : []);
      pdfBuf = await generateAndGetPdf({
        submission: {
          ...row,
          data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
        },
        form: {
          id: row.form_id,
          title: row.title,
          form_type: row.form_type,
          fields,
          requires_signature: row.requires_signature,
          signature_label: row.signature_label,
        },
      });
    }

    if (!pdfBuf) return res.status(500).json({ error: 'Failed to generate PDF' });

    const safeFormId = req.params.id.replace(/[\r\n]/g, '');
    const fileName = `form-submission-${safeFormId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuf.length);
    res.send(pdfBuf);
  } catch (err: any) {
    log.error('Failed to serve submission PDF:', err?.message);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// POST /api/forms/submissions/:id/forward — forward submission by email
router.post('/submissions/:id/forward', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { toEmail, toName, message } = req.body;
    if (!toEmail) return res.status(400).json({ error: 'toEmail is required' });

    const sub = await pool.query(
      `SELECT fs.*, pf.title, pf.form_type, pf.fields, pf.requires_signature, pf.signature_label
       FROM form_submissions fs
       JOIN platform_forms pf ON pf.id = fs.form_id
       WHERE fs.id = $1 AND fs.workspace_id = $2`,
      [req.params.id, user.workspaceId]
    );
    if (!sub.rows[0]) return res.status(404).json({ error: 'Submission not found' });
    const row = sub.rows[0];

    if (!isResendConfigured()) {
      return res.status(503).json({ error: 'Email service not configured' });
    }

    const baseUrl = process.env.BASE_URL || 'https://coaileague.com';
    const pdfUrl = row.generated_document_url ? `${baseUrl}${row.generated_document_url}` : null;

    const fields = Array.isArray(row.fields) ? row.fields :
      (typeof row.fields === 'string' ? JSON.parse(row.fields) : []);
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;

    const fieldRows = fields
      .filter((f: any) => f.type !== 'signature')
      .map((f: any) => {
        const key = f.name || f.id || f.label;
        const val = data[key] ?? data[f.label] ?? '—';
        return `<tr><td style="padding:6px 12px;background:#f9fafb;font-size:12px;color:#6b7280;width:38%;">${f.label}</td><td style="padding:6px 12px;font-size:13px;color:#111827;">${val}</td></tr>`;
      }).join('');

    await sendCanSpamCompliantEmail({
      to: toEmail,
      subject: `Form Submission: ${row.title}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f9fafb;">
          <div style="background:linear-gradient(135deg,#0f2a4a 0%,#1e3a5f 100%);padding:24px 32px;border-radius:8px 8px 0 0;">
            <h1 style="color:#fff;margin:0;font-size:20px;">${PLATFORM.name}</h1>
            <p style="color:#d4af37;margin:5px 0 0;font-size:11px;letter-spacing:0.8px;">FORM SUBMISSION RECORD</p>
          </div>
          <div style="background:#fff;padding:24px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
            <h2 style="color:#0f2a4a;font-size:18px;margin:0 0 4px;">${row.title}</h2>
            <p style="color:#6b7280;font-size:13px;margin:0 0 16px;">Submitted by: ${row.submitted_by_name || 'Anonymous'} · ${new Date(row.submitted_at).toLocaleString()}</p>
            ${message ? `<div style="background:#fef9ec;padding:12px;border-radius:6px;margin-bottom:16px;border-left:3px solid #d4af37;"><p style="margin:0;font-size:13px;color:#374151;">${message}</p></div>` : ''}
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
              ${fieldRows}
            </table>
            ${pdfUrl ? `
            <div style="text-align:center;margin:20px 0;">
              <a href="${pdfUrl}" style="background:#0f2a4a;color:#fff;padding:11px 24px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block;">
                Download Full PDF Record
              </a>
            </div>` : ''}
            <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:20px;">
              Forwarded by ${PLATFORM.name} on behalf of the workspace administrator.
            </p>
          </div>
        </div>`,
      emailType: 'form_submission_forward',
      workspaceId: user.workspaceId,
    });

    log.info(`Submission ${req.params.id} forwarded to ${toEmail} by user ${user.id}`);
    res.json({ success: true, sentTo: toEmail });
  } catch (err: any) {
    log.error('Failed to forward submission:', err?.message);
    res.status(500).json({ error: 'Failed to forward submission' });
  }
});

export default router;
