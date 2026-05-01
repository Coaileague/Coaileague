import { db } from '../db';
import { orgDocuments, orgDocumentSignatures, orgDocumentAccess, employeeDocuments, users, employees, workspaces } from '@shared/schema';
import { eq, and, desc, sql, isNull } from 'drizzle-orm';
import { sendCanSpamCompliantEmail, isResendConfigured, isEmailUnsubscribed } from './emailCore';
import { createNotification } from './notificationService';
import { getAppBaseUrl } from '../utils/getAppBaseUrl';
import { platformEventBus } from './platformEventBus';
import crypto from 'crypto';
import { createLogger } from '../lib/logger';
const log = createLogger('documentSigningService');


interface SignatureRecipient {
  email: string;
  name: string;
  type: 'internal' | 'external';
  userId?: string;
  employeeId?: string;
}

interface SendForSignatureParams {
  documentId: string;
  workspaceId: string;
  senderUserId: string;
  senderName: string;
  recipients: SignatureRecipient[];
  message?: string;
}

interface SignatureResult {
  signatureId: string;
  recipientEmail: string;
  recipientName: string;
  verificationToken: string | null;
  status: 'sent' | 'failed';
  error?: string;
}

function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function buildSigningRequestEmail(params: {
  recipientName: string;
  senderName: string;
  documentName: string;
  signingUrl: string;
  message?: string;
}): { subject: string; html: string } {
  return {
    subject: `Signature Requested: ${params.documentName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb;">
        <div style="text-align: center; padding: 30px 20px; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">CoAIleague</h1>
          <p style="color: #bfdbfe; margin: 8px 0 0 0; font-size: 14px;">Document Signing Service</p>
        </div>
        <div style="padding: 30px; background-color: white;">
          <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 20px;">Signature Requested</h2>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">Hello ${params.recipientName},</p>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            <strong>${params.senderName}</strong> has requested your signature on the following document:
          </p>
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
            <p style="margin: 5px 0; font-size: 15px;"><strong>Document:</strong> ${params.documentName}</p>
            <p style="margin: 5px 0; font-size: 15px;"><strong>Requested By:</strong> ${params.senderName}</p>
          </div>
          ${params.message ? `
            <div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; font-size: 14px; color: #1e40af; font-weight: 600;">Message from sender:</p>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #374151;">${params.message}</p>
            </div>
          ` : ''}
          <div style="text-align: center; margin: 30px 0;">
            <a href="${params.signingUrl}"
               style="background-color: #2563eb; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 16px;">
              Review &amp; Sign Document
            </a>
          </div>
          <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
            <p style="margin: 0; font-size: 13px; color: #92400e;">
              <strong>Security Notice:</strong> This signing link is unique to you. Do not forward this email. The link will expire after the document is signed or recalled by the sender.
            </p>
          </div>
          <p style="color: #6b7280; font-size: 12px; margin-top: 30px; text-align: center;">
            This is an automated message from CoAIleague Document Signing Service.
          </p>
        </div>
      </div>
    `,
  };
}

function buildSignatureConfirmationEmail(params: {
  recipientName: string;
  documentName: string;
}): { subject: string; html: string } {
  return {
    subject: `Signature Confirmed: \${params.documentName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; padding: 25px 20px; background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">CoAIleague</h1>
          <p style="color: #bbf7d0; margin: 8px 0 0 0; font-size: 14px;">Signature Confirmed</p>
        </div>
        <div style="padding: 30px; background-color: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="color: #374151; font-size: 15px;">Hello \${params.recipientName},</p>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            Your signature on <strong>\${params.documentName}</strong> has been successfully recorded.
          </p>
          <div style="background-color: #f0fdf4; padding: 16px; border-radius: 8px; margin: 20px 0; text-align: center; border: 1px solid #bbf7d0;">
            <p style="margin: 0; font-size: 14px; color: #15803d; font-weight: 600;">Signature captured and verified.</p>
          </div>
          <p style="color: #6b7280; font-size: 13px;">You will receive a final copy of the fully executed document once all parties have signed.</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 30px; text-align: center;">
            This is an automated confirmation from CoAIleague.
          </p>
        </div>
      </div>
    `,
  };
}

function buildFinalCopyEmail(params: {
  recipientName: string;
  documentName: string;
  documentUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `Fully Executed: \${params.documentName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; padding: 25px 20px; background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%); border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">CoAIleague</h1>
          <p style="color: #c4b5fd; margin: 8px 0 0 0; font-size: 14px;">Document Fully Executed</p>
        </div>
        <div style="padding: 30px; background-color: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="color: #374151; font-size: 15px;">Hello \${params.recipientName},</p>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            All required signatures have been collected for <strong>\${params.documentName}</strong>. The document is now fully executed.
          </p>
          <div style="text-align: center; margin: 25px 0;">
            <a href="\${params.documentUrl}"
               style="background-color: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
              View Document
            </a>
          </div>
          <p style="color: #6b7280; font-size: 13px;">A copy of this document has been saved to your records.</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 30px; text-align: center;">
            This is an automated message from CoAIleague Document Signing Service.
          </p>
        </div>
      </div>
    `,
  };
}

function buildReminderEmail(params: {
  recipientName: string;
  senderName: string;
  documentName: string;
  signingUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `Reminder: Signature Required - \${params.documentName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; padding: 25px 20px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">CoAIleague</h1>
          <p style="color: #fef3c7; margin: 8px 0 0 0; font-size: 14px;">Signature Reminder</p>
        </div>
        <div style="padding: 30px; background-color: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="color: #374151; font-size: 15px;">Hello \${params.recipientName},</p>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            This is a friendly reminder that <strong>\${params.senderName}</strong> is waiting for your signature on:
          </p>
          <div style="background-color: #fffbeb; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
            <p style="margin: 0; font-size: 15px;"><strong>\${params.documentName}</strong></p>
          </div>
          <div style="text-align: center; margin: 25px 0;">
            <a href="\${params.signingUrl}"
               style="background-color: #f59e0b; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 16px;">
              Sign Now
            </a>
          </div>
          <p style="color: #6b7280; font-size: 12px; margin-top: 30px; text-align: center;">
            This is an automated reminder from CoAIleague.
          </p>
        </div>
      </div>
    `,
  };
}

class DocumentSigningService {

  async sendDocumentForSignature(params: SendForSignatureParams): Promise<SignatureResult[]> {
    const { documentId, workspaceId, senderUserId, senderName, recipients, message } = params;
    const results: SignatureResult[] = [];

    log.info(`[DocumentSigning] Sending document \${documentId} for signature to \${recipients.length} recipient(s)`);

    const [doc] = await db
      .select()
      .from(orgDocuments)
      .where(and(eq(orgDocuments.id, documentId), eq(orgDocuments.workspaceId, workspaceId)));

    if (!doc) {
      throw new Error(`Document \${documentId} not found in workspace \${workspaceId}`);
    }

    const baseUrl = getAppBaseUrl();

    for (const recipient of recipients) {
      try {
        // Idempotency: reuse existing pending (unsigned) request for same document+signer
        const [existingPending] = await db
          .select()
          .from(orgDocumentSignatures)
          .where(and(
            eq(orgDocumentSignatures.documentId, documentId),
            eq(orgDocumentSignatures.signerEmail, recipient.email),
          ))
          .limit(1);

        let signature: typeof orgDocumentSignatures.$inferSelect;
        let verificationToken: string;
        let expiresAt: Date;

        if (existingPending && !existingPending.signatureData) {
          // Already has an unsigned pending request — reuse it (resend email only)
          signature = existingPending;
          verificationToken = existingPending.verificationToken || generateVerificationToken();
          expiresAt = existingPending.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          
          if (!existingPending.expiresAt) {
            await db.update(orgDocumentSignatures).set({ expiresAt }).where(eq(orgDocumentSignatures.id, signature.id));
          }
          
          log.info(`[DocumentSigning] Reusing existing signature request ${signature.id} for ${recipient.email}`);
        } else {
          // Create a new signature request
          verificationToken = generateVerificationToken();
          expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

          const [inserted] = await db
            .insert(orgDocumentSignatures)
            .values({
              documentId,
              workspaceId,
              signerUserId: recipient.userId || null,
              signerEmail: recipient.email,
              signerName: recipient.name,
              verificationToken,
              expiresAt,
              signatureData: null,
              signatureType: null,
              ipAddress: null,
              userAgent: null,
            })
            .returning();
          signature = inserted;
          log.info(`[DocumentSigning] Created signature request ${signature.id} for ${recipient.email}`);
        }

        const signingUrl = recipient.type === 'external'
          ? `${baseUrl}/sign/${verificationToken}`
          : `${baseUrl}/documents/${documentId}/sign`;

        const emailContent = buildSigningRequestEmail({
          recipientName: recipient.name,
          senderName,
          documentName: doc.fileName,
          signingUrl,
          message,
        });

        const unsubscribed = await isEmailUnsubscribed(recipient.email, 'notifications', workspaceId);
        if (!unsubscribed) {
          await sendCanSpamCompliantEmail({
            to: recipient.email,
            subject: emailContent.subject,
            html: emailContent.html,
            emailType: 'document_signing_request',
            workspaceId,
          });
          log.info(`[DocumentSigning] Sent signing request email to ${recipient.email}`);
        } else {
          log.info(`[DocumentSigning] Skipped email to ${recipient.email} (unsubscribed)`);
        }

        if (recipient.type === 'internal' && recipient.userId) {
          try {
            await createNotification({
              workspaceId,
              userId: recipient.userId,
              type: 'document_signature_request',
              title: 'Signature Required',
              message: `${senderName} has requested your signature on "${doc.fileName}".`,
              actionUrl: `/documents/${documentId}/sign`,
              relatedEntityType: 'document',
              relatedEntityId: documentId,
              metadata: {
                senderUserId,
                senderName,
                documentName: doc.fileName,
                signatureId: signature.id,
              },
              createdBy: senderUserId,
              idempotencyKey: `document_signature_request-${documentId}-${recipient.userId}`
            });
            log.info(`[DocumentSigning] Created notification for internal user ${recipient.userId}`);
          } catch (notifErr: unknown) {
            log.warn(`[DocumentSigning] Failed to create notification for ${recipient.userId}: ${notifErr.message}`);
          }
        }

        results.push({
          signatureId: signature.id,
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          verificationToken: recipient.type === 'external' ? verificationToken : null,
          status: 'sent',
        });
      } catch (err: unknown) {
        log.error(`[DocumentSigning] Failed to process recipient ${recipient.email}: ${(err instanceof Error ? err.message : String(err))}`);
        results.push({
          signatureId: '',
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          verificationToken: null,
          status: 'failed',
          error: (err instanceof Error ? err.message : String(err)),
        });
      }
    }

    const totalRequired = recipients.length;
    await db
      .update(orgDocuments)
      .set({
        requiresSignature: true,
        totalSignaturesRequired: totalRequired,
        updatedAt: new Date(),
      })
      .where(and(eq(orgDocuments.id, documentId), eq(orgDocuments.workspaceId, workspaceId)));

    log.info(`[DocumentSigning] Completed sending document ${documentId}. ${results.filter(r => r.status === 'sent').length}/${recipients.length} succeeded.`);

    // Emit event to platform event bus
    platformEventBus.publish({
      type: 'document_sent_for_signature',
      category: 'automation',
      title: 'Document Sent for Signature',
      description: `Document "${doc.fileName}" has been sent for signature to ${totalRequired} recipient(s).`,
      workspaceId,
      userId: senderUserId,
      metadata: {
        documentId,
        documentName: doc.fileName,
        recipientCount: totalRequired,
        recipients: recipients.map(r => ({ name: r.name, email: r.email }))
      }
    }).catch(err => log.error('[DocumentSigning] Failed to emit document_sent_for_signature event:', err));

    return results;
  }

  async processExternalSignature(
    token: string,
    signatureData: string,
    signatureType: string,
    ip: string,
    userAgent: string,
    requestedWorkspaceId?: string   // Check 4: workspace scope binding
  ): Promise<{ success: boolean; documentId?: string; error?: string }> {
    log.info(`[DocumentSigning] Processing external signature with token`);

    try {
      const [sigRecord] = await db
        .select()
        .from(orgDocumentSignatures)
        .where(eq(orgDocumentSignatures.verificationToken, token));

      if (!sigRecord) {
        log.warn(`[DocumentSigning] Invalid verification token`);
        return { success: false, error: 'Invalid or expired signing token' };
      }

      if (sigRecord.expiresAt && new Date() > sigRecord.expiresAt) {
        log.warn(`[DocumentSigning] Token expired for signature ${sigRecord.id}`);
        return { success: false, error: 'This signing link has expired (7-day limit)' };
      }

      if (sigRecord.signatureData) {
        log.warn(`[DocumentSigning] Token already used for signature ${sigRecord.id}`);
        return { success: false, error: 'This document has already been signed with this token' };
      }

      // ── Check 4: Workspace scope enforcement ─────────────────────────────────
      // Fetch the parent document and verify workspace consistency.
      // This prevents a token issued in workspace A from being accepted in workspace B.
      const [tokenDoc] = await db
        .select({ workspaceId: orgDocuments.workspaceId })
        .from(orgDocuments)
        .where(eq(orgDocuments.id, sigRecord.documentId));

      if (!tokenDoc) {
        log.warn(`[DocumentSigning] Document ${sigRecord.documentId} not found for token validation`);
        return { success: false, error: 'Invalid or expired signing token' };
      }

      // Self-consistency: signature record workspace must match document workspace
      if (sigRecord.workspaceId && sigRecord.workspaceId !== tokenDoc.workspaceId) {
        log.warn(`[DocumentSigning] WORKSPACE MISMATCH — token workspaceId=${sigRecord.workspaceId} ≠ doc workspaceId=${tokenDoc.workspaceId}`);
        return { success: false, error: 'Invalid or expired signing token' };
      }

      // Caller-supplied scope: if the route knows the expected workspace, enforce it
      if (requestedWorkspaceId && requestedWorkspaceId !== tokenDoc.workspaceId) {
        log.warn(`[DocumentSigning] WORKSPACE SCOPE VIOLATION — requested workspaceId=${requestedWorkspaceId} ≠ doc workspaceId=${tokenDoc.workspaceId}`);
        return { success: false, error: 'Invalid or expired signing token' };
      }
      // ─────────────────────────────────────────────────────────────────────────

      await db
        .update(orgDocumentSignatures)
        .set({
          signatureData,
          signatureType,
          verifiedAt: new Date(),
          ipAddress: ip,
          userAgent,
          // E-SIGN Act compliance — disclosure accepted at time of signing
          esignDisclosureAccepted: true,
          esignDisclosureAcceptedAt: new Date(),
        })
        .where(eq(orgDocumentSignatures.id, sigRecord.id));

      log.info(`[DocumentSigning] Captured external signature ${sigRecord.id} for document ${sigRecord.documentId} — E-SIGN disclosure acceptance recorded`);

      await db
        .update(orgDocuments)
        .set({
          signaturesCompleted: sql`${orgDocuments.signaturesCompleted} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(orgDocuments.id, sigRecord.documentId));

      const [doc] = await db
        .select()
        .from(orgDocuments)
        .where(eq(orgDocuments.id, sigRecord.documentId));

      if (doc && sigRecord.signerEmail) {
        const confirmEmail = buildSignatureConfirmationEmail({
          recipientName: sigRecord.signerName || 'Signer',
          documentName: doc.fileName,
        });
        await sendCanSpamCompliantEmail({
          to: sigRecord.signerEmail,
          subject: confirmEmail.subject,
          html: confirmEmail.html,
          emailType: 'document_signature_confirmation',
          workspaceId: doc.workspaceId,
        }).catch((e: any) => log.warn(`[DocumentSigning] Confirmation email failed: ${e.message}`));
      }

      if (doc?.uploadedBy) {
        try {
          await createNotification({
            workspaceId: doc.workspaceId,
            userId: doc.uploadedBy,
            type: 'document_signed',
            title: 'Signature Received',
            message: `${sigRecord.signerName || sigRecord.signerEmail} has signed "${doc.fileName}".`,
            actionUrl: `/documents/${doc.id}`,
            relatedEntityType: 'document',
            relatedEntityId: doc.id,
            metadata: {
              signerEmail: sigRecord.signerEmail,
              signerName: sigRecord.signerName,
              signatureId: sigRecord.id,
            },
          });
        } catch (notifErr: unknown) {
          log.warn(`[DocumentSigning] Owner notification failed: ${notifErr.message}`);
        }
      }

      if (doc) {
        const newCompleted = (doc.signaturesCompleted || 0) + 1;
        if (doc.totalSignaturesRequired && newCompleted >= doc.totalSignaturesRequired) {
          log.info(`[DocumentSigning] All signatures collected for document ${doc.id}. Triggering final copy distribution.`);
          
          // Emit document_fully_signed event
          platformEventBus.publish({
            type: 'document_fully_signed',
            category: 'automation',
            title: 'Document Fully Signed',
            description: `Document "${doc.fileName}" has been fully signed by all ${doc.totalSignaturesRequired} recipient(s).`,
            workspaceId: doc.workspaceId,
            metadata: {
              documentId: doc.id,
              documentName: doc.fileName,
              signatureCount: newCompleted
            }
          }).catch(err => log.error('[DocumentSigning] Failed to emit document_fully_signed event:', err));

          await this.saveFinalCopyToParties(doc.id);
        }
      }

      return { success: true, documentId: sigRecord.documentId };
    } catch (err: unknown) {
      log.error(`[DocumentSigning] Error processing external signature: ${(err instanceof Error ? err.message : String(err))}`);
      return { success: false, error: (err instanceof Error ? err.message : String(err)) };
    }
  }

  async processInternalSignature(
    documentId: string,
    userId: string,
    signatureData: string,
    signatureType: string,
    ip: string,
    userAgent: string
  ): Promise<{ success: boolean; signatureId?: string; error?: string }> {
    log.info(`[DocumentSigning] Processing internal signature for document \${documentId} by user \${userId}`);

    try {
      const [doc] = await db
        .select()
        .from(orgDocuments)
        .where(eq(orgDocuments.id, documentId));

      if (!doc) {
        return { success: false, error: 'Document not found' };
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const [existingSig] = await db
        .select()
        .from(orgDocumentSignatures)
        .where(
          and(
            eq(orgDocumentSignatures.documentId, documentId),
            eq(orgDocumentSignatures.signerUserId, userId)
          )
        );

      if (existingSig) {
        if (existingSig.signatureData) {
          return { success: false, error: 'You have already signed this document' };
        }

        await db
          .update(orgDocumentSignatures)
          .set({
            signatureData,
            signatureType,
            verifiedAt: new Date(),
            ipAddress: ip,
            userAgent,
            // E-SIGN Act compliance
            esignDisclosureAccepted: true,
            esignDisclosureAcceptedAt: new Date(),
          })
          .where(eq(orgDocumentSignatures.id, existingSig.id));

        log.info(`[DocumentSigning] Updated existing signature request \${existingSig.id} — E-SIGN disclosure recorded`);
      } else {
        const [newSig] = await db
          .insert(orgDocumentSignatures)
          .values({
            documentId,
            signerUserId: userId,
            signerEmail: user.email,
            signerName: `\${user.firstName || ''} \${user.lastName || ''}`.trim() || user.email,
            signatureData,
            signatureType,
            verifiedAt: new Date(),
            ipAddress: ip,
            userAgent,
            // E-SIGN Act compliance
            esignDisclosureAccepted: true,
            esignDisclosureAcceptedAt: new Date(),
            workspaceId: doc.workspaceId
          })
          .returning();
          
        log.info(`[DocumentSigning] Created internal signature record \${newSig.id} — E-SIGN disclosure recorded`);
      }

      await db
        .update(orgDocuments)
        .set({
          signaturesCompleted: sql`\${orgDocuments.signaturesCompleted} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(orgDocuments.id, documentId));

      const updatedDoc = await db.query.orgDocuments.findFirst({
        where: eq(orgDocuments.id, documentId)
      });

      if (updatedDoc && updatedDoc.totalSignaturesRequired && (updatedDoc.signaturesCompleted || 0) >= updatedDoc.totalSignaturesRequired) {
        log.info(`[DocumentSigning] All signatures collected for document \${documentId} after internal signature. Triggering final copy.`);
        await this.saveFinalCopyToParties(documentId);
      }

      return { success: true };
    } catch (err: unknown) {
      log.error(`[DocumentSigning] Error processing internal signature: \${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async saveFinalCopyToParties(documentId: string): Promise<void> {
    log.info(`[DocumentSigning] Saving final executed copy for document \${documentId}`);
    try {
      const [doc] = await db.select().from(orgDocuments).where(eq(orgDocuments.id, documentId));
      if (!doc) return;

      const signatures = await db
        .select()
        .from(orgDocumentSignatures)
        .where(eq(orgDocumentSignatures.documentId, documentId));

      const baseUrl = getAppBaseUrl();
      const documentUrl = `\${baseUrl}/documents/\${doc.id}/view`;

      for (const sig of signatures) {
        if (sig.signerEmail) {
          const email = buildFinalCopyEmail({
            recipientName: sig.signerName || 'Signer',
            documentName: doc.fileName,
            documentUrl,
          });
          
          await sendCanSpamCompliantEmail({
            to: sig.signerEmail,
            subject: email.subject,
            html: email.html,
            emailType: 'document_fully_executed',
            workspaceId: doc.workspaceId,
          }).catch(e => log.warn(`[DocumentSigning] Final copy email failed for \${sig.signerEmail}: \${e.message}`));
        }
      }
    } catch (err: unknown) {
      log.error(`[DocumentSigning] Failed to distribute final copies: \${err.message}`);
    }
  }
}

export const documentSigningService = new DocumentSigningService();
