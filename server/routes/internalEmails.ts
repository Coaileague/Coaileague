/**
 * Internal Email System API Routes
 * 
 * Provides internal messaging between users/employees within the platform
 * with optional external email delivery via Resend.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db";
import {
  internalMailboxes,
  internalEmails,
  internalEmailFolders,
  internalEmailRecipients,
  internalEmailAudit,
  employees,
  workspaces,
  users,
  type InsertInternalMailbox,
  type InsertInternalEmail,
  type InsertInternalEmailFolder,
  type InsertInternalEmailRecipient,
  type InsertInternalEmailAudit,
} from "@shared/schema";
import { eq, and, desc, asc, sql, inArray, isNull, or, ilike, isNotNull, like } from "drizzle-orm";
import { requireAuth } from "../auth";
import { getUncachableResendClient, isResendConfigured } from "../email";

// Support roles that can permanently delete emails (platform and workspace roles)
const PERMANENT_DELETE_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'compliance_officer'];

// Helper to check if user has authoritative support role scoped to a specific workspace
// This prevents cross-tenant privilege escalation by requiring support role IN the mailbox's workspace
async function hasAuthoritativeSupportRole(
  userId: string, 
  mailboxWorkspaceId: string | null, 
  platformRole?: string
): Promise<{ canPermanentlyDelete: boolean; role: string }> {
  // First check platform-level support role (for platform admins)
  // These are global support staff who can access any workspace
  if (platformRole && PERMANENT_DELETE_ROLES.includes(platformRole)) {
    return { canPermanentlyDelete: true, role: platformRole };
  }
  
  // If mailbox has no workspace (global/personal mailbox), only global support can permanently delete
  if (!mailboxWorkspaceId) {
    return { canPermanentlyDelete: false, role: 'end_user' };
  }
  
  // Check if user has a support role specifically within the mailbox's workspace
  const [employeeRecord] = await db
    .select({ workspaceRole: employees.workspaceRole })
    .from(employees)
    .where(and(
      eq(employees.userId, userId),
      eq(employees.workspaceId, mailboxWorkspaceId)
    ))
    .limit(1);
  
  if (employeeRecord?.workspaceRole && PERMANENT_DELETE_ROLES.includes(employeeRecord.workspaceRole)) {
    return { canPermanentlyDelete: true, role: employeeRecord.workspaceRole };
  }
  
  // No support role found in the mailbox's workspace - user is end user
  return { canPermanentlyDelete: false, role: 'end_user' };
}

// Helper to log audit entries
async function logEmailAudit(data: Omit<InsertInternalEmailAudit, 'id' | 'createdAt'>) {
  try {
    await db.insert(internalEmailAudit).values(data);
  } catch (error) {
    console.error('Failed to log email audit:', error);
  }
}

// Helper to emit Trinity event (for AI Brain awareness)
async function emitTrinityEmailEvent(eventType: string, data: Record<string, any>) {
  try {
    // Import dynamically to avoid circular dependencies
    const { emitTrinityEvent } = await import('../services/trinity/eventBus');
    if (typeof emitTrinityEvent === 'function') {
      emitTrinityEvent('internal_email', eventType, data);
    }
  } catch (error) {
    // Event bus may not be available, silently continue
  }
}

const router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createMailboxSchema = z.object({
  emailAddress: z.string().min(1),
  displayName: z.string().optional(),
  mailboxType: z.enum(["personal", "shared", "system", "department"]).optional(),
  signature: z.string().optional(),
});

const attachmentSchema = z.object({
  name: z.string(),
  url: z.string(),
  size: z.number(),
  type: z.string(),
});

const sendEmailSchema = z.object({
  to: z.array(z.string()),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  subject: z.string().min(1),
  bodyText: z.string().optional(),
  bodyHtml: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  inReplyTo: z.string().optional(),
  sendExternal: z.boolean().optional().default(false),
  attachments: z.array(attachmentSchema).optional(),
});

const updateEmailSchema = z.object({
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  isImportant: z.boolean().optional(),
  folderId: z.string().optional(),
  status: z.enum(["draft", "sent", "delivered", "read", "archived", "deleted"]).optional(),
});

const createFolderSchema = z.object({
  name: z.string().min(1),
  folderType: z.enum(["inbox", "sent", "drafts", "trash", "archive", "spam", "starred", "custom"]).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  parentFolderId: z.string().optional(),
});

// ============================================================================
// MAILBOX ROUTES
// ============================================================================

router.get("/mailbox", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string; currentWorkspaceId?: string };
    if (!user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const mailbox = await db.query.internalMailboxes.findFirst({
      where: and(
        eq(internalMailboxes.userId, user.id),
        user.currentWorkspaceId 
          ? eq(internalMailboxes.workspaceId, user.currentWorkspaceId)
          : isNull(internalMailboxes.workspaceId)
      ),
    });

    if (!mailbox) {
      return res.status(404).json({ error: "No mailbox found. Please create one first." });
    }

    res.json({ mailbox });
  } catch (error) {
    console.error("Error fetching mailbox:", error);
    res.status(500).json({ error: "Failed to fetch mailbox" });
  }
});

router.post("/mailbox", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string; currentWorkspaceId?: string; email?: string; firstName?: string; lastName?: string };
    if (!user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const validated = createMailboxSchema.parse(req.body);

    const existing = await db.query.internalMailboxes.findFirst({
      where: eq(internalMailboxes.emailAddress, validated.emailAddress),
    });

    if (existing) {
      return res.status(400).json({ error: "Email address already in use" });
    }

    const [mailbox] = await db.insert(internalMailboxes).values({
      userId: user.id,
      workspaceId: user.currentWorkspaceId || null,
      emailAddress: validated.emailAddress,
      displayName: validated.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      mailboxType: validated.mailboxType || 'personal',
      signature: validated.signature,
    }).returning();

    const systemFolders = [
      { name: "Inbox", folderType: "inbox" as const, sortOrder: 0, isSystem: true },
      { name: "Sent", folderType: "sent" as const, sortOrder: 1, isSystem: true },
      { name: "Drafts", folderType: "drafts" as const, sortOrder: 2, isSystem: true },
      { name: "Starred", folderType: "starred" as const, sortOrder: 3, isSystem: true },
      { name: "Archive", folderType: "archive" as const, sortOrder: 4, isSystem: true },
      { name: "Trash", folderType: "trash" as const, sortOrder: 5, isSystem: true },
    ];

    await db.insert(internalEmailFolders).values(
      systemFolders.map((folder) => ({
        mailboxId: mailbox.id,
        name: folder.name,
        folderType: folder.folderType,
        sortOrder: folder.sortOrder,
        isSystem: folder.isSystem,
      }))
    );

    res.json({ mailbox, message: "Mailbox created with default folders" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Error creating mailbox:", error);
    res.status(500).json({ error: "Failed to create mailbox" });
  }
});

router.get("/mailbox/auto-create", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string; currentWorkspaceId?: string; email?: string; firstName?: string; lastName?: string };
    if (!user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    let mailbox = await db.query.internalMailboxes.findFirst({
      where: and(
        eq(internalMailboxes.userId, user.id),
        user.currentWorkspaceId 
          ? eq(internalMailboxes.workspaceId, user.currentWorkspaceId)
          : isNull(internalMailboxes.workspaceId)
      ),
    });

    if (!mailbox) {
      const emailPrefix = user.email?.split('@')[0] || `user-${user.id.substring(0, 8)}`;
      const baseAddress = `${emailPrefix}@coaileague.internal`;
      
      // Check if this email already exists (for a different user/workspace combo)
      const existingWithEmail = await db.query.internalMailboxes.findFirst({
        where: eq(internalMailboxes.emailAddress, baseAddress),
      });
      
      // If email exists for different user, create unique address
      const internalAddress = existingWithEmail 
        ? `${emailPrefix}-${user.id.substring(0, 8)}@coaileague.internal`
        : baseAddress;

      try {
        [mailbox] = await db.insert(internalMailboxes).values({
          userId: user.id,
          workspaceId: user.currentWorkspaceId || null,
          emailAddress: internalAddress,
          displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'User',
          mailboxType: 'personal',
        }).returning();
      } catch (insertError: any) {
        // Handle race condition - mailbox may have been created by another request
        if (insertError?.code === '23505') {
          mailbox = await db.query.internalMailboxes.findFirst({
            where: and(
              eq(internalMailboxes.userId, user.id),
              user.currentWorkspaceId 
                ? eq(internalMailboxes.workspaceId, user.currentWorkspaceId)
                : isNull(internalMailboxes.workspaceId)
            ),
          });
          if (mailbox) {
            return res.json({ mailbox });
          }
        }
        throw insertError;
      }

      const systemFolders = [
        { name: "Inbox", folderType: "inbox" as const, sortOrder: 0, isSystem: true },
        { name: "Sent", folderType: "sent" as const, sortOrder: 1, isSystem: true },
        { name: "Drafts", folderType: "drafts" as const, sortOrder: 2, isSystem: true },
        { name: "Starred", folderType: "starred" as const, sortOrder: 3, isSystem: true },
        { name: "Archive", folderType: "archive" as const, sortOrder: 4, isSystem: true },
        { name: "Trash", folderType: "trash" as const, sortOrder: 5, isSystem: true },
      ];

      await db.insert(internalEmailFolders).values(
        systemFolders.map((folder) => ({
          mailboxId: mailbox!.id,
          name: folder.name,
          folderType: folder.folderType,
          sortOrder: folder.sortOrder,
          isSystem: folder.isSystem,
        }))
      );

      // Emit Trinity event for mailbox provisioning
      await emitTrinityEmailEvent('mailbox_provisioned', {
        mailboxId: mailbox!.id,
        userId: user.id,
        workspaceId: user.currentWorkspaceId,
        emailAddress: mailbox!.emailAddress,
      });
    }

    res.json({ mailbox });
  } catch (error) {
    console.error("Error auto-creating mailbox:", error);
    res.status(500).json({ error: "Failed to get or create mailbox" });
  }
});

// ============================================================================
// FOLDER ROUTES
// ============================================================================

router.get("/folders", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string; currentWorkspaceId?: string };
    if (!user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const mailbox = await db.query.internalMailboxes.findFirst({
      where: eq(internalMailboxes.userId, user.id),
    });

    if (!mailbox) {
      return res.status(404).json({ error: "No mailbox found" });
    }

    const folders = await db.query.internalEmailFolders.findMany({
      where: eq(internalEmailFolders.mailboxId, mailbox.id),
      orderBy: [asc(internalEmailFolders.sortOrder)],
    });

    res.json({ folders });
  } catch (error) {
    console.error("Error fetching folders:", error);
    res.status(500).json({ error: "Failed to fetch folders" });
  }
});

router.post("/folders", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string };
    if (!user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const validated = createFolderSchema.parse(req.body);

    const mailbox = await db.query.internalMailboxes.findFirst({
      where: eq(internalMailboxes.userId, user.id),
    });

    if (!mailbox) {
      return res.status(404).json({ error: "No mailbox found" });
    }

    const maxSort = await db.query.internalEmailFolders.findFirst({
      where: eq(internalEmailFolders.mailboxId, mailbox.id),
      orderBy: [desc(internalEmailFolders.sortOrder)],
    });

    const [folder] = await db.insert(internalEmailFolders).values({
      mailboxId: mailbox.id,
      name: validated.name,
      folderType: validated.folderType || 'custom',
      color: validated.color,
      icon: validated.icon,
      parentFolderId: validated.parentFolderId,
      sortOrder: (maxSort?.sortOrder || 0) + 1,
      isSystem: false,
    }).returning();

    res.json({ folder });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Error creating folder:", error);
    res.status(500).json({ error: "Failed to create folder" });
  }
});

// ============================================================================
// EMAIL ROUTES
// ============================================================================

router.get("/inbox", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string };
    if (!user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { folder = 'inbox', page = '1', limit = '20', search } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10), 100);
    const offset = (pageNum - 1) * limitNum;

    const mailbox = await db.query.internalMailboxes.findFirst({
      where: eq(internalMailboxes.userId, user.id),
    });

    if (!mailbox) {
      return res.status(404).json({ error: "No mailbox found", emails: [], total: 0 });
    }

    let folderRecord = await db.query.internalEmailFolders.findFirst({
      where: and(
        eq(internalEmailFolders.mailboxId, mailbox.id),
        eq(internalEmailFolders.folderType, folder as string)
      ),
    });

    const emails = await db
      .select({
        id: internalEmails.id,
        fromAddress: internalEmails.fromAddress,
        fromName: internalEmails.fromName,
        toAddresses: internalEmails.toAddresses,
        subject: internalEmails.subject,
        bodyText: internalEmails.bodyText,
        bodyHtml: internalEmails.bodyHtml,
        priority: internalEmails.priority,
        isInternal: internalEmails.isInternal,
        sentAt: internalEmails.sentAt,
        createdAt: internalEmails.createdAt,
        threadId: internalEmails.threadId,
        isRead: internalEmailRecipients.isRead,
        isStarred: internalEmailRecipients.isStarred,
        isImportant: internalEmailRecipients.isImportant,
        recipientId: internalEmailRecipients.id,
        status: internalEmailRecipients.status,
      })
      .from(internalEmailRecipients)
      .innerJoin(internalEmails, eq(internalEmailRecipients.emailId, internalEmails.id))
      .where(
        and(
          eq(internalEmailRecipients.mailboxId, mailbox.id),
          folderRecord ? eq(internalEmailRecipients.folderId, folderRecord.id) : sql`1=1`,
          search ? or(
            ilike(internalEmails.subject, `%${search}%`),
            ilike(internalEmails.fromAddress, `%${search}%`),
            ilike(internalEmails.bodyText, `%${search}%`)
          ) : sql`1=1`
        )
      )
      .orderBy(desc(internalEmails.sentAt), desc(internalEmails.createdAt))
      .limit(limitNum)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(internalEmailRecipients)
      .where(
        and(
          eq(internalEmailRecipients.mailboxId, mailbox.id),
          folderRecord ? eq(internalEmailRecipients.folderId, folderRecord.id) : sql`1=1`
        )
      );

    res.json({
      emails,
      total: countResult?.count || 0,
      page: pageNum,
      limit: limitNum,
      hasMore: offset + emails.length < (countResult?.count || 0),
    });
  } catch (error) {
    console.error("Error fetching inbox:", error);
    res.status(500).json({ error: "Failed to fetch emails" });
  }
});

router.get("/sent", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string };
    if (!user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const mailbox = await db.query.internalMailboxes.findFirst({
      where: eq(internalMailboxes.userId, user.id),
    });

    if (!mailbox) {
      return res.status(404).json({ error: "No mailbox found", emails: [] });
    }

    const emails = await db.query.internalEmails.findMany({
      where: eq(internalEmails.fromMailboxId, mailbox.id),
      orderBy: [desc(internalEmails.sentAt)],
      limit: 50,
    });

    res.json({ emails });
  } catch (error) {
    console.error("Error fetching sent emails:", error);
    res.status(500).json({ error: "Failed to fetch sent emails" });
  }
});

router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string };
    if (!user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { id } = req.params;

    const mailbox = await db.query.internalMailboxes.findFirst({
      where: eq(internalMailboxes.userId, user.id),
    });

    if (!mailbox) {
      return res.status(404).json({ error: "No mailbox found" });
    }

    const email = await db.query.internalEmails.findFirst({
      where: eq(internalEmails.id, id),
    });

    if (!email) {
      return res.status(404).json({ error: "Email not found" });
    }

    const recipient = await db.query.internalEmailRecipients.findFirst({
      where: and(
        eq(internalEmailRecipients.emailId, id),
        eq(internalEmailRecipients.mailboxId, mailbox.id)
      ),
    });

    if (recipient && !recipient.isRead) {
      await db.update(internalEmailRecipients)
        .set({ isRead: true, readAt: new Date() })
        .where(eq(internalEmailRecipients.id, recipient.id));

      await db.update(internalMailboxes)
        .set({ unreadCount: sql`GREATEST(0, ${internalMailboxes.unreadCount} - 1)` })
        .where(eq(internalMailboxes.id, mailbox.id));
    }

    res.json({
      email,
      recipientStatus: recipient,
    });
  } catch (error) {
    console.error("Error fetching email:", error);
    res.status(500).json({ error: "Failed to fetch email" });
  }
});

router.post("/send", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string; currentWorkspaceId?: string };
    if (!user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const validated = sendEmailSchema.parse(req.body);

    const mailbox = await db.query.internalMailboxes.findFirst({
      where: eq(internalMailboxes.userId, user.id),
    });

    if (!mailbox) {
      return res.status(400).json({ error: "You need a mailbox to send emails. Please create one first." });
    }

    const threadId = validated.inReplyTo 
      ? (await db.query.internalEmails.findFirst({ where: eq(internalEmails.id, validated.inReplyTo) }))?.threadId || validated.inReplyTo
      : `thread-${Date.now()}-${Math.random().toString(36).substring(2)}`;

    const [email] = await db.insert(internalEmails).values({
      fromMailboxId: mailbox.id,
      fromAddress: mailbox.emailAddress,
      fromName: mailbox.displayName,
      toAddresses: JSON.stringify(validated.to),
      ccAddresses: validated.cc ? JSON.stringify(validated.cc) : null,
      bccAddresses: validated.bcc ? JSON.stringify(validated.bcc) : null,
      subject: validated.subject,
      bodyText: validated.bodyText,
      bodyHtml: validated.bodyHtml,
      priority: validated.priority || 'normal',
      isInternal: !validated.sendExternal,
      inReplyTo: validated.inReplyTo,
      threadId,
      sentAt: new Date(),
      attachments: validated.attachments ? JSON.stringify(validated.attachments) : null,
    }).returning();

    await db.update(internalMailboxes)
      .set({ totalMessages: sql`${internalMailboxes.totalMessages} + 1` })
      .where(eq(internalMailboxes.id, mailbox.id));

    const senderSentFolder = await db.query.internalEmailFolders.findFirst({
      where: and(
        eq(internalEmailFolders.mailboxId, mailbox.id),
        eq(internalEmailFolders.folderType, 'sent')
      ),
    });

    if (senderSentFolder) {
      await db.insert(internalEmailRecipients).values({
        emailId: email.id,
        mailboxId: mailbox.id,
        recipientType: 'from',
        folderId: senderSentFolder.id,
        status: 'sent',
        isRead: true,
      });
    }

    const allRecipients = [
      ...validated.to.map(addr => ({ address: addr, type: 'to' })),
      ...(validated.cc || []).map(addr => ({ address: addr, type: 'cc' })),
      ...(validated.bcc || []).map(addr => ({ address: addr, type: 'bcc' })),
    ];

    let externalRecipients: string[] = [];
    let internalDelivered = 0;

    for (const recipient of allRecipients) {
      if (recipient.address.endsWith('@coaileague.internal')) {
        const recipientMailbox = await db.query.internalMailboxes.findFirst({
          where: eq(internalMailboxes.emailAddress, recipient.address),
        });

        if (recipientMailbox) {
          const recipientInboxFolder = await db.query.internalEmailFolders.findFirst({
            where: and(
              eq(internalEmailFolders.mailboxId, recipientMailbox.id),
              eq(internalEmailFolders.folderType, 'inbox')
            ),
          });

          await db.insert(internalEmailRecipients).values({
            emailId: email.id,
            mailboxId: recipientMailbox.id,
            recipientType: recipient.type,
            folderId: recipientInboxFolder?.id || null,
            status: 'delivered',
            isRead: false,
          });

          await db.update(internalMailboxes)
            .set({ 
              unreadCount: sql`${internalMailboxes.unreadCount} + 1`,
              totalMessages: sql`${internalMailboxes.totalMessages} + 1`
            })
            .where(eq(internalMailboxes.id, recipientMailbox.id));

          internalDelivered++;
        }
      } else {
        externalRecipients.push(recipient.address);
      }
    }

    let externalResult = null;
    if (validated.sendExternal && externalRecipients.length > 0 && isResendConfigured()) {
      try {
        const resend = await getUncachableResendClient();
        const result = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'noreply@coaileague.com',
          to: externalRecipients,
          subject: validated.subject,
          html: validated.bodyHtml || `<pre>${validated.bodyText}</pre>`,
          text: validated.bodyText,
        });

        externalResult = {
          sent: true,
          messageId: result.data?.id,
          recipients: externalRecipients.length,
        };

        await db.update(internalEmails)
          .set({
            externalId: result.data?.id,
            externalStatus: 'sent',
          })
          .where(eq(internalEmails.id, email.id));
      } catch (externalError) {
        console.error("Error sending external email:", externalError);
        externalResult = {
          sent: false,
          error: "Failed to send to external recipients",
          recipients: externalRecipients.length,
        };
      }
    }

    // Audit log for email sent
    await logEmailAudit({
      emailId: email.id,
      mailboxId: mailbox.id,
      action: 'created',
      newValue: JSON.stringify({
        to: validated.to,
        subject: validated.subject,
        internalDelivered,
        externalRecipients: externalRecipients.length,
      }),
      actorId: user.id,
      actorRole: 'end_user',
      actorEmail: (user as any).email,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
    });

    // Emit Trinity event for email sent
    await emitTrinityEmailEvent('email_sent', {
      emailId: email.id,
      fromMailboxId: mailbox.id,
      toAddresses: validated.to,
      subject: validated.subject,
      internalDelivered,
      externalRecipients: externalRecipients.length,
    });

    res.json({
      success: true,
      email,
      internalDelivered,
      externalResult,
      message: `Email sent successfully. ${internalDelivered} internal recipient(s), ${externalRecipients.length} external recipient(s).`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Error sending email:", error);
    res.status(500).json({ error: "Failed to send email" });
  }
});

router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string };
    if (!user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { id } = req.params;
    const validated = updateEmailSchema.parse(req.body);

    const mailbox = await db.query.internalMailboxes.findFirst({
      where: eq(internalMailboxes.userId, user.id),
    });

    if (!mailbox) {
      return res.status(404).json({ error: "No mailbox found" });
    }

    const recipient = await db.query.internalEmailRecipients.findFirst({
      where: and(
        eq(internalEmailRecipients.emailId, id),
        eq(internalEmailRecipients.mailboxId, mailbox.id)
      ),
    });

    if (!recipient) {
      return res.status(404).json({ error: "Email not found in your mailbox" });
    }

    const updateData: Record<string, unknown> = {};
    if (validated.isRead !== undefined) {
      updateData.isRead = validated.isRead;
      if (validated.isRead && !recipient.isRead) {
        updateData.readAt = new Date();
      }
    }
    if (validated.isStarred !== undefined) updateData.isStarred = validated.isStarred;
    if (validated.isImportant !== undefined) updateData.isImportant = validated.isImportant;
    if (validated.folderId !== undefined) updateData.folderId = validated.folderId;
    if (validated.status !== undefined) updateData.status = validated.status;

    const previousState = JSON.stringify({
      isRead: recipient.isRead,
      isStarred: recipient.isStarred,
      isImportant: recipient.isImportant,
      folderId: recipient.folderId,
      status: recipient.status,
    });

    const [updated] = await db.update(internalEmailRecipients)
      .set(updateData)
      .where(eq(internalEmailRecipients.id, recipient.id))
      .returning();

    if (validated.isRead !== undefined && validated.isRead !== recipient.isRead) {
      const increment = validated.isRead ? -1 : 1;
      await db.update(internalMailboxes)
        .set({ unreadCount: sql`GREATEST(0, ${internalMailboxes.unreadCount} + ${increment})` })
        .where(eq(internalMailboxes.id, mailbox.id));
    }

    // Audit logging for state changes
    let auditAction: 'read' | 'unread' | 'starred' | 'unstarred' | 'moved' | 'archived' | null = null;
    if (validated.isRead !== undefined && validated.isRead !== recipient.isRead) {
      auditAction = validated.isRead ? 'read' : 'unread';
    } else if (validated.isStarred !== undefined && validated.isStarred !== recipient.isStarred) {
      auditAction = validated.isStarred ? 'starred' : 'unstarred';
    } else if (validated.folderId !== undefined && validated.folderId !== recipient.folderId) {
      auditAction = 'moved';
    } else if (validated.status === 'archived') {
      auditAction = 'archived';
    }

    if (auditAction) {
      await logEmailAudit({
        emailId: id,
        recipientId: recipient.id,
        mailboxId: mailbox.id,
        action: auditAction,
        previousValue: previousState,
        newValue: JSON.stringify(updateData),
        actorId: user.id,
        actorRole: 'end_user',
        actorEmail: (user as any).email,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
      });

      // Emit Trinity event for read status changes
      if (auditAction === 'read') {
        await emitTrinityEmailEvent('email_read', {
          emailId: id,
          mailboxId: mailbox.id,
          userId: user.id,
        });
      }
    }

    res.json({ success: true, recipient: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Error updating email:", error);
    res.status(500).json({ error: "Failed to update email" });
  }
});

router.post("/:id/summarize", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string };
    if (!user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { id } = req.params;

    const mailbox = await db.query.internalMailboxes.findFirst({
      where: eq(internalMailboxes.userId, user.id),
    });

    if (!mailbox) {
      return res.status(404).json({ error: "No mailbox found" });
    }

    const recipient = await db.query.internalEmailRecipients.findFirst({
      where: and(
        eq(internalEmailRecipients.emailId, id),
        eq(internalEmailRecipients.mailboxId, mailbox.id)
      ),
    });

    if (!recipient) {
      return res.status(404).json({ error: "Email not found in your mailbox" });
    }

    const email = await db.query.internalEmails.findFirst({
      where: eq(internalEmails.id, id),
    });

    if (!email) {
      return res.status(404).json({ error: "Email not found" });
    }

    const emailContent = email.bodyText || email.bodyHtml?.replace(/<[^>]*>/g, '') || '';
    const subject = email.subject || '(No subject)';
    
    if (emailContent.length < 50) {
      return res.json({ summary: emailContent || 'This email has no content to summarize.' });
    }

    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.json({ summary: emailContent.substring(0, 200) + (emailContent.length > 200 ? '...' : '') });
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b" });

      const prompt = `Summarize this email in 2-3 concise sentences. Focus on key points and action items.

Subject: ${subject}

${emailContent.substring(0, 3000)}`;

      const result = await model.generateContent(prompt);
      const summary = result.response.text();

      res.json({ summary });
    } catch (aiError) {
      console.error("AI summarization failed, using fallback:", aiError);
      const fallbackSummary = emailContent.substring(0, 200) + (emailContent.length > 200 ? '...' : '');
      res.json({ summary: fallbackSummary });
    }
  } catch (error) {
    console.error("Error summarizing email:", error);
    res.status(500).json({ error: "Failed to summarize email" });
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string; role?: string; email?: string };
    if (!user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { id } = req.params;
    const { permanent, reason } = req.query;

    const mailbox = await db.query.internalMailboxes.findFirst({
      where: eq(internalMailboxes.userId, user.id),
    });

    if (!mailbox) {
      return res.status(404).json({ error: "No mailbox found" });
    }

    const recipient = await db.query.internalEmailRecipients.findFirst({
      where: and(
        eq(internalEmailRecipients.emailId, id),
        eq(internalEmailRecipients.mailboxId, mailbox.id)
      ),
    });

    if (!recipient) {
      return res.status(404).json({ error: "Email not found in your mailbox" });
    }

    const previousState = JSON.stringify({
      status: recipient.status,
      folderId: recipient.folderId,
      deletedAt: recipient.deletedAt,
    });

    if (permanent === 'true') {
      // RBAC: Only support roles or Trinity can permanently delete
      // This checks platform role AND workspace role, scoped to the mailbox's workspace
      const authCheck = await hasAuthoritativeSupportRole(user.id, mailbox.workspaceId, user.role);
      
      if (!authCheck.canPermanentlyDelete) {
        return res.status(403).json({ 
          error: "Only support staff can permanently delete emails. Use soft delete instead.",
          hint: "Remove the 'permanent=true' parameter to move to trash instead."
        });
      }
      
      const userRole = authCheck.role;

      await db.delete(internalEmailRecipients)
        .where(eq(internalEmailRecipients.id, recipient.id));

      // Audit log for permanent deletion
      await logEmailAudit({
        emailId: id,
        recipientId: recipient.id,
        mailboxId: mailbox.id,
        action: 'permanently_deleted',
        previousValue: previousState,
        newValue: null,
        actorId: user.id,
        actorRole: userRole,
        actorEmail: user.email,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
        reason: typeof reason === 'string' ? reason : 'Permanent deletion by support',
      });

      // Emit Trinity event
      await emitTrinityEmailEvent('email_permanently_deleted', {
        emailId: id,
        mailboxId: mailbox.id,
        deletedBy: user.id,
        deletedByRole: userRole,
        reason: reason || 'Support action',
      });

      res.json({ success: true, message: "Email permanently deleted" });
    } else {
      const trashFolder = await db.query.internalEmailFolders.findFirst({
        where: and(
          eq(internalEmailFolders.mailboxId, mailbox.id),
          eq(internalEmailFolders.folderType, 'trash')
        ),
      });

      await db.update(internalEmailRecipients)
        .set({
          status: 'deleted',
          folderId: trashFolder?.id || null,
          deletedAt: new Date(),
        })
        .where(eq(internalEmailRecipients.id, recipient.id));

      // Audit log for soft deletion
      await logEmailAudit({
        emailId: id,
        recipientId: recipient.id,
        mailboxId: mailbox.id,
        action: 'soft_deleted',
        previousValue: previousState,
        newValue: JSON.stringify({ status: 'deleted', folderId: trashFolder?.id, deletedAt: new Date() }),
        actorId: user.id,
        actorRole: 'end_user',
        actorEmail: user.email,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
      });

      // Emit Trinity event
      await emitTrinityEmailEvent('email_soft_deleted', {
        emailId: id,
        mailboxId: mailbox.id,
        deletedBy: user.id,
      });

      res.json({ success: true, message: "Email moved to trash" });
    }
  } catch (error) {
    console.error("Error deleting email:", error);
    res.status(500).json({ error: "Failed to delete email" });
  }
});

// ============================================================================
// RESTORE SOFT-DELETED EMAIL
// ============================================================================

router.post("/:id/restore", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string; email?: string };
    if (!user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { id } = req.params;

    const mailbox = await db.query.internalMailboxes.findFirst({
      where: eq(internalMailboxes.userId, user.id),
    });

    if (!mailbox) {
      return res.status(404).json({ error: "No mailbox found" });
    }

    const recipient = await db.query.internalEmailRecipients.findFirst({
      where: and(
        eq(internalEmailRecipients.emailId, id),
        eq(internalEmailRecipients.mailboxId, mailbox.id)
      ),
    });

    if (!recipient) {
      return res.status(404).json({ error: "Email not found in your mailbox" });
    }

    if (!recipient.deletedAt) {
      return res.status(400).json({ error: "Email is not in trash" });
    }

    // Restore to inbox
    const inboxFolder = await db.query.internalEmailFolders.findFirst({
      where: and(
        eq(internalEmailFolders.mailboxId, mailbox.id),
        eq(internalEmailFolders.folderType, 'inbox')
      ),
    });

    const previousState = JSON.stringify({
      status: recipient.status,
      folderId: recipient.folderId,
      deletedAt: recipient.deletedAt,
    });

    await db.update(internalEmailRecipients)
      .set({
        status: 'delivered',
        folderId: inboxFolder?.id || null,
        deletedAt: null,
      })
      .where(eq(internalEmailRecipients.id, recipient.id));

    // Audit log for restore
    await logEmailAudit({
      emailId: id,
      recipientId: recipient.id,
      mailboxId: mailbox.id,
      action: 'restored',
      previousValue: previousState,
      newValue: JSON.stringify({ status: 'delivered', folderId: inboxFolder?.id, deletedAt: null }),
      actorId: user.id,
      actorRole: 'end_user',
      actorEmail: user.email,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
    });

    // Emit Trinity event
    await emitTrinityEmailEvent('email_restored', {
      emailId: id,
      mailboxId: mailbox.id,
      restoredBy: user.id,
    });

    res.json({ success: true, message: "Email restored to inbox" });
  } catch (error) {
    console.error("Error restoring email:", error);
    res.status(500).json({ error: "Failed to restore email" });
  }
});

// ============================================================================
// SEARCH EMAILS (Full-text search)
// ============================================================================

router.get("/search/query", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string };
    if (!user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { q, folder, includeDeleted, page = '1', limit = '20' } = req.query;
    
    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.status(400).json({ error: "Search query must be at least 2 characters" });
    }

    const mailbox = await db.query.internalMailboxes.findFirst({
      where: eq(internalMailboxes.userId, user.id),
    });

    if (!mailbox) {
      return res.json({ emails: [], total: 0 });
    }

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string) || 20));
    const offset = (pageNum - 1) * limitNum;

    const searchTerm = `%${q.toLowerCase()}%`;

    // Search in subject, body, from address
    const emails = await db
      .select({
        id: internalEmails.id,
        fromAddress: internalEmails.fromAddress,
        fromName: internalEmails.fromName,
        toAddresses: internalEmails.toAddresses,
        subject: internalEmails.subject,
        bodyText: internalEmails.bodyText,
        priority: internalEmails.priority,
        sentAt: internalEmails.sentAt,
        createdAt: internalEmails.createdAt,
        threadId: internalEmails.threadId,
        isRead: internalEmailRecipients.isRead,
        isStarred: internalEmailRecipients.isStarred,
        recipientId: internalEmailRecipients.id,
        status: internalEmailRecipients.status,
        deletedAt: internalEmailRecipients.deletedAt,
      })
      .from(internalEmails)
      .innerJoin(
        internalEmailRecipients,
        eq(internalEmailRecipients.emailId, internalEmails.id)
      )
      .where(
        and(
          eq(internalEmailRecipients.mailboxId, mailbox.id),
          includeDeleted !== 'true' ? isNull(internalEmailRecipients.deletedAt) : sql`1=1`,
          or(
            ilike(internalEmails.subject, searchTerm),
            ilike(internalEmails.bodyText, searchTerm),
            ilike(internalEmails.fromAddress, searchTerm),
            ilike(internalEmails.fromName, searchTerm)
          )
        )
      )
      .orderBy(desc(internalEmails.sentAt))
      .limit(limitNum)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(internalEmails)
      .innerJoin(
        internalEmailRecipients,
        eq(internalEmailRecipients.emailId, internalEmails.id)
      )
      .where(
        and(
          eq(internalEmailRecipients.mailboxId, mailbox.id),
          includeDeleted !== 'true' ? isNull(internalEmailRecipients.deletedAt) : sql`1=1`,
          or(
            ilike(internalEmails.subject, searchTerm),
            ilike(internalEmails.bodyText, searchTerm),
            ilike(internalEmails.fromAddress, searchTerm),
            ilike(internalEmails.fromName, searchTerm)
          )
        )
      );

    res.json({
      emails,
      total: countResult?.count || 0,
      page: pageNum,
      limit: limitNum,
      query: q,
    });
  } catch (error) {
    console.error("Error searching emails:", error);
    res.status(500).json({ error: "Failed to search emails" });
  }
});

// ============================================================================
// AUDIT TRAIL (Support staff only)
// ============================================================================

router.get("/audit/:emailId", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string; role?: string };
    if (!user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Only support roles can view full audit trail
    const userRole = user.role || 'end_user';
    const canViewAudit = PERMANENT_DELETE_ROLES.includes(userRole);
    
    if (!canViewAudit) {
      return res.status(403).json({ error: "Only support staff can view audit trails" });
    }

    const { emailId } = req.params;

    const auditEntries = await db.query.internalEmailAudit.findMany({
      where: eq(internalEmailAudit.emailId, emailId),
      orderBy: [desc(internalEmailAudit.createdAt)],
    });

    res.json({ audit: auditEntries });
  } catch (error) {
    console.error("Error fetching audit trail:", error);
    res.status(500).json({ error: "Failed to fetch audit trail" });
  }
});

router.get("/contacts/search", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string; currentWorkspaceId?: string };
    if (!user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: "Search query required" });
    }

    const mailboxes = await db
      .select({
        id: internalMailboxes.id,
        emailAddress: internalMailboxes.emailAddress,
        displayName: internalMailboxes.displayName,
        mailboxType: internalMailboxes.mailboxType,
      })
      .from(internalMailboxes)
      .where(
        and(
          or(
            ilike(internalMailboxes.emailAddress, `%${q}%`),
            ilike(internalMailboxes.displayName, `%${q}%`)
          ),
          eq(internalMailboxes.isActive, true)
        )
      )
      .limit(20);

    res.json({ contacts: mailboxes });
  } catch (error) {
    console.error("Error searching contacts:", error);
    res.status(500).json({ error: "Failed to search contacts" });
  }
});

export default router;
