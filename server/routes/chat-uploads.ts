// AI Communications Chat File Upload Routes
// Secure file upload system with workspace scoping, sanitization, virus scanning, and audit tracking

import { sanitizeError } from '../middleware/errorHandler';
import { Router, type Request } from "express";
import multer from "multer";
import path from "path";
import { randomBytes } from "crypto";
import { db, pool } from "../db";
import { chatUploads, roomEvents, chatConversations, chatParticipants } from "../../shared/schema";
import { requireAuth } from "../auth";
import type { AuthenticatedRequest } from "../rbac";
import { chatUploadLimiter } from "../middleware/rateLimiter";
import { strictVirusScan } from "../middleware/virusScan";
import { Storage } from "@google-cloud/storage";
import { eq, and, or } from "drizzle-orm";
import { UPLOADS } from '../config/platformConfig';
import { platformEventBus } from '../services/platformEventBus';
import { broadcastToWorkspace } from '../websocket';
import { typedPool, typedPoolExec } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
const log = createLogger('ChatUploads');


const router = Router();

// Validate environment configuration
const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
const PRIVATE_DIR = process.env.PRIVATE_OBJECT_DIR || "/.private";

if (!BUCKET_ID) {
  log.warn("[ChatUploads] DEFAULT_OBJECT_STORAGE_BUCKET_ID not set - chat file uploads will be disabled");
}

// Initialize Google Cloud Storage
const storage = new Storage();

// File upload configuration
const MAX_FILE_SIZE = UPLOADS.maxFileSizeBytes;
const ALLOWED_MIME_TYPES = [
  // Images
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  // Videos
  "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo",
  // Audio / Voice
  "audio/mpeg", "audio/wav", "audio/ogg", "audio/webm", "audio/mp4", "audio/aac",
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
  strictVirusScan, // CRITICAL: Scan files for malware before processing
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const files = req.files as Express.Multer.File[];
      const { conversationId, isPublic, gpsLat, gpsLng, gpsAddress, gpsAccuracy, caption } = req.body;
      const gpsData = (gpsLat && gpsLng) ? {
        lat: parseFloat(gpsLat),
        lng: parseFloat(gpsLng),
        address: gpsAddress || null,
        accuracy: gpsAccuracy ? parseFloat(gpsAccuracy) : null,
      } : null;
      
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
      
      // Only org_owner/co_owner/manager can set public uploads
      if (isPublic === "true" && !["org_owner", "co_owner", "manager", "org_manager"].includes(authReq.workspaceRole || "")) {
        return res.status(403).json({ error: "Only workspace owners/managers can upload public files" });
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
        
        // Get scan result from middleware (attached to file object)
        const scanResult = (file as any).scanResult;

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
            isScanned: true, // File was scanned by middleware
            scanStatus: scanResult?.status || "clean", // Store scan status
            scanResult: scanResult ? JSON.stringify({
              threatName: scanResult.threatName,
              confidence: scanResult.confidence,
              scanMethod: scanResult.scanMethod,
              sha256Hash: scanResult.sha256Hash,
              scannedAt: scanResult.timestamp,
            }) : null,
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
      
      // Auto-link image uploads to DAR photo_manifest if this chatroom is tied to a shift report
      // Also store GPS metadata on the shift_chatroom_message if present
      if (conversationId && uploadedFiles.length > 0) {
        try {
          const imageUploads = uploadedFiles.filter(f =>
            f.mimeType?.startsWith('image/') || ['image/jpeg','image/png','image/webp','image/gif'].includes(f.mimeType || '')
          );
          if (imageUploads.length > 0) {
            const now = new Date().toISOString();

            // First, check if this conversationId is a shift chatroom
            // CATEGORY C — Raw SQL retained: LIMIT | Tables: shift_chatrooms | Verified: 2026-03-23
            const chatroomResult = await typedPool(
              `SELECT id FROM shift_chatrooms WHERE id = $1 LIMIT 1`,
              [conversationId]
            ).catch(() => [] as any[]);
            const isShiftChatroom = (chatroomResult as any).length > 0;

            // If shift chatroom, insert photo messages with GPS metadata
            if (isShiftChatroom) {
              for (const f of imageUploads) {
                const msgMeta: Record<string, any> = {};
                if (gpsData) msgMeta.gps = gpsData;
                // CATEGORY C — Raw SQL retained: ::jsonb | Tables: shift_chatroom_messages | Verified: 2026-03-23
                await typedPoolExec(
                  `INSERT INTO shift_chatroom_messages
                   (id, workspace_id, chatroom_id, user_id, content, message_type, attachment_url, attachment_type, attachment_size, metadata, created_at, updated_at)
                   VALUES (gen_random_uuid(), $1, $2, $3, $4, 'photo', $5, $6, $7, $8::jsonb, NOW(), NOW())`,
                  [
                    workspaceId, conversationId, userId,
                    caption || `Photo uploaded by ${userName}`,
                    f.url, f.mimeType, f.fileSize,
                    JSON.stringify(Object.keys(msgMeta).length ? msgMeta : {}),
                  ]
                );
              }

              // Trigger ReportBot photo acknowledgment non-blocking
              (async () => {
                try {
                  const { shiftRoomBotOrchestrator } = await import('../services/bots/shiftRoomBotOrchestrator');
                  for (const f of imageUploads) {
                    await shiftRoomBotOrchestrator.handlePhotoAcknowledgment({
                      conversationId,
                      workspaceId,
                      senderName: userName,
                      attachmentUrl: f.url,
                      gpsLat: gpsData?.lat ?? undefined,
                      gpsLng: gpsData?.lng ?? undefined,
                      gpsAddress: gpsData?.address ?? undefined,
                    });
                  }
                } catch (botErr: unknown) {
                  log.warn('[ChatUploads] ReportBot photo ack failed (non-blocking):', botErr.message);
                }
              })();
            }

            // Link to DAR photo_manifest
            // CATEGORY C — Raw SQL retained: LIMIT | Tables: dar_reports | Verified: 2026-03-23
            const darResult = await typedPool(
              `SELECT id, photo_manifest, photo_count FROM dar_reports WHERE chatroom_id = $1 AND workspace_id = $2 LIMIT 1`,
              [conversationId, workspaceId]
            );
            if (darResult.length > 0) {
              const dar = darResult[0];
              const existingManifest: any[] = Array.isArray(dar.photo_manifest) ? dar.photo_manifest : [];
              const newEntries = imageUploads.map(f => ({
                url: f.url,
                filename: f.originalFilename || f.filename,
                mimeType: f.mimeType,
                uploaderName: userName,
                timestamp: now,
                caption: caption || `Photo captured during shift by ${userName}`,
                gpsLat: gpsData?.lat ?? null,
                gpsLng: gpsData?.lng ?? null,
                gpsAddress: gpsData?.address ?? null,
                gpsAccuracy: gpsData?.accuracy ?? null,
              }));
              const updatedManifest = [...existingManifest, ...newEntries];
              // CATEGORY C — Raw SQL retained: ::jsonb | Tables: dar_reports | Verified: 2026-03-23
              await typedPoolExec(
                `UPDATE dar_reports SET photo_manifest = $1::jsonb, photo_count = $2, updated_at = NOW() WHERE id = $3`,
                [JSON.stringify(updatedManifest), updatedManifest.length, dar.id]
              );
              log.info(`[ChatUploads] Linked ${newEntries.length} photo(s) to DAR ${dar.id} photo_manifest${gpsData ? ' with GPS' : ''}`);
            }
          }
        } catch (darErr: unknown) {
          log.warn('[ChatUploads] DAR photo manifest link failed (non-blocking):', darErr.message);
        }
      }

      // Emit platform event + WS broadcast for image uploads in any chatroom (non-blocking)
      if (conversationId && uploadedFiles.length > 0) {
        const imageUploadsForEvent = uploadedFiles.filter(f =>
          f.mimeType?.startsWith('image/') || ['image/jpeg','image/png','image/webp','image/gif'].includes(f.mimeType || '')
        );
        if (imageUploadsForEvent.length > 0) {
          try {
            broadcastToWorkspace(workspaceId, {
              type: 'chat_image_uploaded',
              workspaceId,
              conversationId,
              uploaderId: userId,
              uploaderName: userName,
              uploadCount: imageUploadsForEvent.length,
              uploads: imageUploadsForEvent.map(f => ({ id: f.id, url: f.url, mimeType: f.mimeType })),
            });
            platformEventBus.publish({
              type: 'chat_message',
              category: 'operations',
              title: 'Photo shared in chat',
              description: `${userName} shared ${imageUploadsForEvent.length} photo(s) in a conversation`,
              workspaceId,
              userId,
              metadata: {
                conversationId,
                audience: 'workspace',
                chatEventType: 'image_upload',
              },
              payload: {
                uploadCount: imageUploadsForEvent.length,
                uploads: imageUploadsForEvent.map(f => ({ id: f.id, url: f.url, mimeType: f.mimeType })),
                uploaderName: userName,
                hasGps: !!gpsData,
              },
            }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
          } catch (evtErr: unknown) {
            log.warn('[ChatUploads] Image event emission failed (non-blocking):', (evtErr as any)?.message);
          }
        }
      }

      res.json({
        success: true,
        uploads: uploadedFiles,
        gpsAddress: gpsData?.address ?? null,
        gpsLat: gpsData?.lat ?? null,
        gpsLng: gpsData?.lng ?? null,
        message: `${uploadedFiles.length} file(s) uploaded successfully`,
      });
    } catch (error: unknown) {
      log.error("File upload error:", error);
      
      if (sanitizeError(error)?.includes("File type not allowed")) {
        return res.status(400).json({ error: sanitizeError(error) });
      }
      
      if (sanitizeError(error)?.includes("File too large")) {
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
      log.error("Get uploads error:", error);
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
      
      // Only uploader, org_owner, co_owner, or manager can delete
      if (upload.uploaderId !== userId && !["org_owner", "co_owner", "manager", "org_manager"].includes(authReq.workspaceRole || "")) {
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
      log.error("Delete upload error:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  }
);

export default router;
