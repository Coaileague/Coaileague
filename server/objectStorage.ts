// Object storage (Google Cloud Storage)
//
// Railway-only: the legacy Replit-sidecar external_account credential
// flow (http://127.0.0.1:1106/token) has been removed. Auth now uses the
// GCS client's default credential discovery chain:
//
//   1. GOOGLE_APPLICATION_CREDENTIALS env var → path to a service account
//      JSON file. RECOMMENDED for Railway — mount the service account JSON
//      as a secret file and point the env var at it.
//   2. GCE metadata service (if running on GCP directly).
//   3. Anonymous credentials (read-only public buckets only).
//
// Railway setup: create a GCP service account with Storage Object Admin
// on the target bucket, download the JSON key, mount it as a Railway
// secret, set GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json, and set
// DEFAULT_OBJECT_STORAGE_BUCKET_ID to the bucket name.

import { createLogger } from './lib/logger';
const log = createLogger('objectStorage');
import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

// The object storage client — credentials auto-discovered from the
// GOOGLE_APPLICATION_CREDENTIALS env var or the GCE metadata service.
export const objectStorageClient = new Storage();

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// Object storage service
export class ObjectStorageService {
  constructor() {}

  // Gets the public object search paths.
  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error("PUBLIC_OBJECT_SEARCH_PATHS not set.");
    }
    return paths;
  }

  // Gets the private object directory.
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error("PRIVATE_OBJECT_DIR not set.");
    }
    return dir;
  }

  // Search for a public object from the search paths.
  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  // Downloads an object to the response.
  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      const [metadata] = await file.getMetadata();
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";
      
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
        "X-Content-Type-Options": "nosniff",
      });

      const stream = file.createReadStream();

      stream.on("error", (err) => {
        log.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      // P25-3: Destroy the GCS read stream when the client disconnects early
      // to release the file descriptor and prevent descriptor leaks.
      res.on("close", () => stream.destroy());

      stream.pipe(res);
    } catch (error) {
      log.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  // Gets the upload URL for an object entity.
  async getObjectEntityUploadURL(workspaceId: string): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error("PRIVATE_OBJECT_DIR not set.");
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/chat-attachments/${workspaceId}/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  // Generates a signed upload URL for a specific path
  async generateSignedUploadUrl(
    fullPath: string,
    contentType: string,
    ttlSec: number = 300
  ): Promise<string> {
    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec,
    });
  }

  // Gets the object entity file from the object path.
  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }
  
    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;
  
    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }
  
    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }
  
    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  // Tries to set the ACL policy for the object entity and return the normalized path.
  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  // Checks if the user can access the object entity.
  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

export function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  // Use GCS native signed URL API. Requires the underlying credential
  // to have `iam.serviceAccounts.signBlob` permission (Storage Object
  // Admin + "Service Account Token Creator" on itself is the typical
  // combination). The Replit sidecar's REPLIT_SIDECAR_ENDPOINT has been
  // removed — this is now a pure GCS SDK call.
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  const [signedURL] = await file.getSignedUrl({
    version: "v4",
    action: method === "GET" ? "read"
      : method === "PUT" ? "write"
      : method === "DELETE" ? "delete"
      : "read",
    expires: Date.now() + ttlSec * 1000,
  });
  return signedURL;
}

/**
 * Upload a file buffer to object storage.
 *
 * When workspaceId + storageCategory are supplied, enforces Option B quota:
 *   1. Pre-upload: checks category quota — throws StorageQuotaError (HTTP 507) if over limit
 *   2. Post-upload: credits bytes_used to storage_usage table
 *
 * Omitting workspaceId/storageCategory skips quota enforcement (system-generated files,
 * DAR PDFs, pay stubs, etc. that are already gated elsewhere).
 */
export type StorageCategory = 'email' | 'documents' | 'media' | 'audit_reserve';

export const STORAGE_CATEGORY_MAP: Record<string, StorageCategory> = {
  'application/pdf':                                                      'documents',
  'application/msword':                                                   'documents',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'documents',
  'application/vnd.ms-excel':                                             'documents',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':   'documents',
  'text/plain':                                                           'documents',
  'text/csv':                                                             'documents',
  'image/jpeg':                                                           'media',
  'image/png':                                                            'media',
  'image/webp':                                                           'media',
  'image/gif':                                                            'media',
  'image/svg+xml':                                                        'media',
  'video/mp4':                                                            'media',
  'video/webm':                                                           'media',
  'video/quicktime':                                                      'media',
  'video/x-msvideo':                                                      'media',
  'audio/mpeg':                                                           'media',
  'audio/wav':                                                            'media',
  'audio/ogg':                                                            'media',
  'audio/webm':                                                           'media',
  'audio/mp4':                                                            'media',
  'audio/aac':                                                            'media',
  'message/rfc822':                                                       'email',
  'application/mbox':                                                     'email',
} as const;

export function getStorageCategoryForMime(mimeType: string): StorageCategory {
  if (STORAGE_CATEGORY_MAP[mimeType]) return STORAGE_CATEGORY_MAP[mimeType];
  const prefix = mimeType.split('/')[0];
  if (prefix === 'image' || prefix === 'video' || prefix === 'audio') return 'media';
  return 'documents';
}

export class StorageQuotaError extends Error {
  readonly statusCode = 507;
  constructor(message: string) {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

export async function uploadFileToObjectStorage(params: {
  objectPath: string;
  buffer: Buffer;
  workspaceId?: string;
  storageCategory?: 'email' | 'documents' | 'media' | 'audit_reserve';
  metadata?: {
    contentType?: string;
    metadata?: Record<string, string>;
  };
}): Promise<void> {
  const { objectPath, buffer, workspaceId, storageCategory, metadata } = params;

  // ── PRE-UPLOAD QUOTA CHECK ────────────────────────────────────────────────
  if (workspaceId && storageCategory) {
    const { checkCategoryQuota } = await import('./services/storage/storageQuotaService');
    const check = await checkCategoryQuota(workspaceId, storageCategory, buffer.length);
    if (!check.allowed) {
      log.warn(`[ObjectStorage] Quota exceeded — ws=${workspaceId} cat=${storageCategory} size=${buffer.length}: ${check.reason}`);
      throw new StorageQuotaError(check.reason ?? 'Storage quota exceeded for this category');
    }
  }

  // Parse the object path to get bucket and object name
  const pathParts = objectPath.startsWith('/') ? objectPath.slice(1).split('/') : objectPath.split('/');
  if (pathParts.length < 2) {
    throw new Error('Invalid object path: must contain at least bucket/object');
  }

  // Get bucket ID from environment
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    throw new Error('DEFAULT_OBJECT_STORAGE_BUCKET_ID not configured');
  }

  const bucket = objectStorageClient.bucket(bucketId);
  const objectName = pathParts.slice(1).join('/'); // Skip 'objects' prefix
  const blob = bucket.file(objectName);

  await blob.save(buffer, {
    contentType: metadata?.contentType || 'application/octet-stream',
    metadata: metadata?.metadata,
  });

  // ── POST-UPLOAD USAGE ACCOUNTING ─────────────────────────────────────────
  if (workspaceId && storageCategory) {
    const { recordStorageUsage } = await import('./services/storage/storageQuotaService');
    recordStorageUsage(workspaceId, storageCategory, buffer.length).catch((err: Error) =>
      log.warn(`[ObjectStorage] recordStorageUsage fire-and-forget failed: ${err?.message}`)
    );
  }
}

/**
 * Download a file buffer from object storage by its storage key path.
 * The objectPath should match the format used by uploadFileToObjectStorage.
 */
export async function downloadFileFromObjectStorage(objectPath: string): Promise<Buffer> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    throw new Error('DEFAULT_OBJECT_STORAGE_BUCKET_ID not configured');
  }

  const bucket = objectStorageClient.bucket(bucketId);
  const pathParts = objectPath.startsWith('/') ? objectPath.slice(1).split('/') : objectPath.split('/');
  const objectName = pathParts.slice(1).join('/');
  const [buffer] = await bucket.file(objectName).download();
  return buffer;
}
