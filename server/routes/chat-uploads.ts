// AI Communications Chat File Upload Routes
// Secure file upload system with workspace scoping, sanitization, and audit tracking

import { Router, type Request } from "express";
import multer from "multer";
import path from "path";
import { randomBytes } from "crypto";
import { db } from "../db";
import { chatUploads, roomEvents, chatConversations, chatParticipants } from "../../shared/schema";
import { requireAuth } from "../auth";
import type { AuthenticatedRequest } from "../rbac";
import { chatUploadLimiter } from "../middleware/rateLimiter";
import { Storage } from "@google-cloud/storage";
import { eq, and, or } from "drizzle-orm";

const router = Router();

// Validate environment configuration
const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
const PRIVATE_DIR = process.env.PRIVATE_OBJECT_DIR || "/.private";
const STORAGE_CONFIGURED = !!BUCKET_ID;

if (!STORAGE_CONFIGURED) {
  console.warn(
    "[chat-uploads] DEFAULT_OBJECT_STORAGE_BUCKET_ID not set — chat file uploads disabled. " +
    "Set this environment variable to enable Google Cloud Storage uploads."
  );
}

// Initialize Google Cloud Storage (lazy — only used when STORAGE_CONFIGURED)
const storage = STORAGE_CONFIGURED ? new Storage() : null;

// File upload configuration
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_MIME_TYPES = [
  // Images
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  // Documents
  "application/pdf", "application/msword", 
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // Text
  "text/plain", "text/csv",
  // Archives
  "application/zip", "application/x-rar-compressed"
];

// Sanitize filename to prevent path traversal and XSS
function sanitizeFilename(filename: string): string {
  // Remove path components
  const baseName = path.basename(filename);
  
  // Remove dangerous characters, keep only alphanumeric, dots, hyphens, underscores
  const sanitized = baseName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.') // Prevent multiple dots
    .replace(/^\.+/, '') // Remove leading dots
    .slice(0, 255); // Limit length
  
  // Generate unique prefix to avoid collisions
  const uniqueId = randomBytes(8).toString('hex');
  return `${uniqueId}_${sanitized}`;
}

// Multer memory storage (files uploaded to memory, then to object storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5, // Max 5 files per request
  },
  fileFilter: (req, file, cb) => {
    // Check MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
    
    // Do NOT modify file.originalname here - preserve it for audit trail
    cb(null, true);
  },
});

// Verify user is participant in conversation
async function verifyConversationAccess(
  conversationId: string,
  userId: string,
  workspaceId: string
): Promise<boolean> {
  // Check conversation exists in workspace
  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.id, conversationId),
        eq(chatConversations.workspaceId, workspaceId)
      )
    )
    .limit(1);
  
  if (!conversation) {
    return false;
  }
  
  // Check if user is a participant (customer, support agent, or in participants table)
  if (
    conversation.customerId === userId ||
    conversation.supportAgentId === userId
  ) {
    return true;
  }
  
  // Check participants table - must be active participant
  const [participant] = await db
    .select()
    .from(chatParticipants)
    .where(
      and(
        eq(chatParticipants.conversationId, conversationId),
        eq(chatParticipants.participantId, userId),
        eq(chatParticipants.isActive, true) // CRITICAL: Must be active
      )
    )
    .limit(1);
  
  return !!participant;
}

// Upload endpoint - POST /api/chat/upload
router.post(
  "/",
  requireAuth,
  chatUploadLimiter,
  upload.array("files", 5),
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      if (!STORAGE_CONFIGURED || !storage) {
        return res.status(503).json({
          error: "Chat file uploads are not configured on this deployment",
          code: "STORAGE_NOT_CONFIGURED",
        });
      }

      const files = req.files as Express.Multer.File[];
      const { conversationId, isPublic } = req.body;

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files provided" });
      }
      
      const workspaceId = authReq.workspaceId;
      const userId = authReq.user?.id;
      const userName = authReq.user?.firstName && authReq.user?.lastName
        ? `${authReq.user.firstName} ${authReq.user.lastName}`
        : authReq.user?.email || "Unknown User";
      
      if (!workspaceId || !userId) {
        return res.status(403).json({ error: "No workspace context" });
      }
      
      // CRITICAL: Verify user is participant in conversation
      if (conversationId) {
        const hasAccess = await verifyConversationAccess(conversationId, userId, workspaceId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Not authorized to upload to this conversation" });
        }
      }
      
      // Only owner/admin can set public uploads
      if (isPublic === "true" && !["owner", "admin"].includes(authReq.workspaceRole || "")) {
        return res.status(403).json({ error: "Only workspace owners/admins can upload public files" });
      }
      
      const uploadedFiles = [];
      const bucket = storage.bucket(BUCKET_ID!);
      
      for (const file of files) {
        // PRESERVE original filename for audit trail
        const originalFilename = file.originalname;
        
        // Generate sanitized filename for storage
        const sanitizedName = sanitizeFilename(originalFilename);
        const storagePath = isPublic === "true"
          ? `public/chat-uploads/${workspaceId}/${sanitizedName}`
          : `${PRIVATE_DIR}/chat-uploads/${workspaceId}/${sanitizedName}`;
        
        // Upload to object storage
        const blob = bucket.file(storagePath);
        const blobStream = blob.createWriteStream({
          resumable: false,
          metadata: {
            contentType: file.mimetype,
            metadata: {
              uploadedBy: userId,
              workspace: workspaceId,
              originalName: originalFilename,
            },
          },
        });
        
        await new Promise((resolve, reject) => {
          blobStream.on("error", reject);
          blobStream.on("finish", resolve);
          blobStream.end(file.buffer);
        });
        
        // Generate public URL if public file
        const storageUrl = isPublic === "true"
          ? `https://storage.googleapis.com/${BUCKET_ID}/${storagePath}`
          : storagePath;
        
        // Save to database with ORIGINAL filename for audit trail
        const [uploadRecord] = await db
          .insert(chatUploads)
          .values({
            workspaceId,
            uploaderId: userId,
            uploaderName: userName,
            conversationId: conversationId || null,
            messageId: null, // Will be linked when message is created
            filename: sanitizedName, // Sanitized storage name
            originalFilename: originalFilename, // PRESERVE original for audit
            mimeType: file.mimetype,
            fileSize: file.size,
            storageUrl,
            isScanned: false,
            scanStatus: "pending",
          })
          .returning();
        
        // Create audit event
        if (conversationId) {
          await db.insert(roomEvents).values({
            workspaceId,
            conversationId,
            actorId: userId!,
            actorName: userName,
            actorRole: authReq.workspaceRole || "employee",
            eventType: "file_uploaded",
            description: `${userName} uploaded file: ${file.originalname}`,
            eventPayload: {
              uploadId: uploadRecord.id,
              filename: sanitizedName,
              mimeType: file.mimetype,
              fileSize: file.size,
            },
            ipAddress: authReq.ip,
            userAgent: authReq.get("user-agent"),
          });
        }
        
        uploadedFiles.push({
          id: uploadRecord.id,
          filename: sanitizedName,
          originalFilename: originalFilename, // Use preserved original name
          mimeType: file.mimetype,
          fileSize: file.size,
          url: storageUrl,
        });
      }
      
      res.json({
        success: true,
        uploads: uploadedFiles,
        message: `${uploadedFiles.length} file(s) uploaded successfully`,
      });
    } catch (error: any) {
      console.error("File upload error:", error);
      
      if (error.message?.includes("File type not allowed")) {
        return res.status(400).json({ error: error.message });
      }
      
      if (error.message?.includes("File too large")) {
        return res.status(413).json({ 
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` 
        });
      }
      
      res.status(500).json({ error: "File upload failed" });
    }
  }
);

// Get uploads for a conversation - GET /api/chat/upload/:conversationId
router.get(
  "/:conversationId",
  requireAuth,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { conversationId } = authReq.params;
      const workspaceId = authReq.workspaceId;
      const userId = authReq.user?.id;
      
      if (!workspaceId || !userId) {
        return res.status(403).json({ error: "No workspace context" });
      }
      
      // CRITICAL: Verify user is participant in conversation
      const hasAccess = await verifyConversationAccess(conversationId, userId, workspaceId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Not authorized to view this conversation's uploads" });
      }
      
      const uploads = await db
        .select()
        .from(chatUploads)
        .where(
          and(
            eq(chatUploads.conversationId, conversationId),
            eq(chatUploads.workspaceId, workspaceId),
            eq(chatUploads.isDeleted, false)
          )
        )
        .orderBy(chatUploads.createdAt);
      
      res.json({ uploads });
    } catch (error) {
      console.error("Get uploads error:", error);
      res.status(500).json({ error: "Failed to retrieve uploads" });
    }
  }
);

// Delete upload - DELETE /api/chat/upload/:uploadId
router.delete(
  "/:uploadId",
  requireAuth,
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const { uploadId } = authReq.params;
      const workspaceId = authReq.workspaceId;
      const userId = authReq.user?.id;
      
      if (!workspaceId || !userId) {
        return res.status(403).json({ error: "No workspace context" });
      }
      
      // Get upload record
      const [upload] = await db
        .select()
        .from(chatUploads)
        .where(
          and(
            eq(chatUploads.id, uploadId),
            eq(chatUploads.workspaceId, workspaceId)
          )
        )
        .limit(1);
      
      if (!upload) {
        return res.status(404).json({ error: "Upload not found" });
      }
      
      // CRITICAL: Verify user has access to the conversation
      if (upload.conversationId) {
        const hasAccess = await verifyConversationAccess(upload.conversationId, userId, workspaceId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Not authorized to access this conversation" });
        }
      }
      
      // Only uploader, owner, or admin can delete
      if (upload.uploaderId !== userId && !["owner", "admin"].includes(authReq.workspaceRole || "")) {
        return res.status(403).json({ error: "Not authorized to delete this file" });
      }
      
      // Mark as deleted (soft delete for audit trail)
      await db
        .update(chatUploads)
        .set({
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: userId!,
        })
        .where(eq(chatUploads.id, uploadId));
      
      res.json({ success: true, message: "File deleted successfully" });
    } catch (error) {
      console.error("Delete upload error:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  }
);

export default router;
