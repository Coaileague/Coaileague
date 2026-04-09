import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import multer from "multer";
import path from "path";
import { randomBytes } from "crypto";
import { requireAuth } from "../auth";
import type { AuthenticatedRequest } from "../rbac";
import { Storage } from "@google-cloud/storage";
import { strictVirusScan } from "../middleware/virusScan";
import { logScanResult, type ScanResult } from "../services/virusScanService";
import { createLogger } from '../lib/logger';
const log = createLogger('EmailAttachments');


const router = Router();

const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
const PRIVATE_DIR = process.env.PRIVATE_OBJECT_DIR || "/.private";

if (!BUCKET_ID) {
  log.warn("[EmailAttachments] Object storage not configured - attachment uploads will fail");
}

const storage = BUCKET_ID ? new Storage() : null;

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
  "application/zip", "application/x-rar-compressed"
];

function sanitizeFilename(filename: string): string {
  const baseName = path.basename(filename);
  const sanitized = baseName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')
    .slice(0, 255);
  const uniqueId = randomBytes(8).toString('hex');
  return `${uniqueId}_${sanitized}`;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 10,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

router.post("/upload", requireAuth, upload.array("files", 10), strictVirusScan, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    const workspaceId = (authReq as any).user?.workspaceId;
    
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    if (!storage || !BUCKET_ID) {
      return res.status(503).json({ error: "Object storage not configured" });
    }
    
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files provided" });
    }
    
    const bucket = storage.bucket(BUCKET_ID);
    const uploadedAttachments: { name: string; url: string; size: number; type: string }[] = [];
    
    for (const file of files) {
      const sanitizedName = sanitizeFilename(file.originalname);
      const filePath = `${PRIVATE_DIR}/email-attachments/${workspaceId || 'global'}/${Date.now()}_${sanitizedName}`;
      
      const blob = bucket.file(filePath);
      
      await blob.save(file.buffer, {
        contentType: file.mimetype,
        metadata: {
          uploadedBy: userId,
          originalName: file.originalname,
          uploadedAt: new Date().toISOString(),
        },
      });
      
      const [signedUrl] = await blob.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      
      // Get scan result from middleware
      const scanResult = (file as any).scanResult as ScanResult | undefined;

      uploadedAttachments.push({
        name: file.originalname,
        url: signedUrl,
        size: file.size,
        type: file.mimetype,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        scanStatus: scanResult?.status || 'clean',
      });
    }

    log.info(`[EmailAttachments] Uploaded ${uploadedAttachments.length} scanned files for user ${userId}`);
    
    return res.json({
      success: true,
      attachments: uploadedAttachments,
    });
  } catch (error) {
    log.error("[EmailAttachments] Upload failed:", error);
    return res.status(500).json({ 
      error: "Failed to upload attachments",
      details: error instanceof Error ? sanitizeError(error) : "Unknown error"
    });
  }
});

export default router;
