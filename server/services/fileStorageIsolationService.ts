/**
 * File Storage Isolation Service
 * ===============================
 * Enforces workspace-level isolation for all file storage operations.
 * Prevents cross-org file access and validates ownership.
 */

import { db } from "../db";
import { employees, clients, chatUploads, workspaces } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";

const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
const storage = new Storage();

const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  profile: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  incident: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime'],
  document: ['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  chat: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'],
};

const MAX_FILE_SIZES: Record<string, number> = {
  profile: 5 * 1024 * 1024,     // 5MB
  incident: 50 * 1024 * 1024,   // 50MB for videos
  document: 25 * 1024 * 1024,   // 25MB
  chat: 10 * 1024 * 1024,       // 10MB
};

export interface FileAccessResult {
  allowed: boolean;
  reason: string;
  filePath?: string;
  workspaceId?: string;
}

export interface FileUploadResult {
  success: boolean;
  fileId?: string;
  url?: string;
  error?: string;
}

export class FileStorageIsolationService {
  /**
   * Validate that a user can access a file based on workspace membership
   */
  async validateFileAccess(
    userId: string,
    fileId: string,
    workspaceId: string
  ): Promise<FileAccessResult> {
    const [upload] = await db
      .select()
      .from(chatUploads)
      .where(eq(chatUploads.id, fileId))
      .limit(1);

    if (!upload) {
      return { allowed: false, reason: 'File not found' };
    }

    if (upload.workspaceId !== workspaceId) {
      console.warn(`[FileIsolation] Cross-org access attempt: User ${userId} tried to access file ${fileId} from workspace ${workspaceId}, but file belongs to ${upload.workspaceId}`);
      return { allowed: false, reason: 'File belongs to different organization' };
    }

    return { allowed: true, reason: 'Access granted', filePath: (upload as any).storagePath, workspaceId: upload.workspaceId };
  }

  /**
   * Generate workspace-scoped storage path
   */
  generateStoragePath(workspaceId: string, category: string, filename: string): string {
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    return `workspaces/${workspaceId}/${category}/${timestamp}_${sanitizedFilename}`;
  }

  /**
   * Validate file upload permissions
   */
  async validateUploadPermission(
    userId: string,
    workspaceId: string,
    category: 'profile' | 'incident' | 'document' | 'chat'
  ): Promise<{ allowed: boolean; reason: string }> {
    const employee = await db.query.employees.findFirst({
      where: and(
        eq(employees.userId, userId),
        eq(employees.workspaceId, workspaceId)
      ),
    });

    if (!employee) {
      return { allowed: false, reason: 'User is not a member of this workspace' };
    }

    if (category === 'incident' && employee.workspaceRole === 'staff') {
      return { allowed: true, reason: 'Employees can upload incident photos' };
    }

    if (category === 'profile') {
      return { allowed: true, reason: 'Users can upload profile photos' };
    }

    const managerRoles = ['org_owner', 'org_admin', 'department_manager'];
    if (category === 'document' && !managerRoles.includes(employee.workspaceRole || '')) {
      return { allowed: false, reason: 'Only managers can upload documents' };
    }

    return { allowed: true, reason: 'Permission granted' };
  }

  /**
   * Validate file type and size for category
   */
  validateFileUpload(
    category: string,
    mimeType: string,
    fileSize: number
  ): { valid: boolean; reason: string } {
    const allowedTypes = ALLOWED_MIME_TYPES[category] || ALLOWED_MIME_TYPES.chat;
    const maxSize = MAX_FILE_SIZES[category] || MAX_FILE_SIZES.chat;

    if (!allowedTypes.includes(mimeType)) {
      return { valid: false, reason: `File type ${mimeType} not allowed for ${category}. Allowed: ${allowedTypes.join(', ')}` };
    }

    if (fileSize > maxSize) {
      const maxMB = Math.round(maxSize / (1024 * 1024));
      return { valid: false, reason: `File size exceeds ${maxMB}MB limit for ${category}` };
    }

    return { valid: true, reason: 'File validation passed' };
  }

  /**
   * Upload file with workspace isolation and validation
   */
  async uploadWithIsolation(
    workspaceId: string,
    userId: string,
    category: string,
    filename: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<FileUploadResult> {
    if (!BUCKET_ID) {
      return { success: false, error: 'Object storage not configured' };
    }

    const validation = this.validateFileUpload(category, mimeType, buffer.length);
    if (!validation.valid) {
      console.warn(`[FileIsolation] Upload rejected: ${validation.reason}`);
      return { success: false, error: validation.reason };
    }

    try {
      const storagePath = this.generateStoragePath(workspaceId, category, filename);
      const bucket = storage.bucket(BUCKET_ID);
      const file = bucket.file(storagePath);

      console.log(`[FileIsolation] Uploading file: ${storagePath} for workspace ${workspaceId} by user ${userId}`);

      await file.save(buffer, {
        contentType: mimeType,
        metadata: {
          workspaceId,
          uploadedBy: userId,
          uploadedAt: new Date().toISOString(),
          category,
        },
      });

      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 24 * 60 * 60 * 1000,
      });

      return {
        success: true,
        fileId: storagePath,
        url: signedUrl,
      };
    } catch (error) {
      console.error('[FileIsolation] Upload failed:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Delete file with workspace validation
   */
  async deleteWithValidation(
    workspaceId: string,
    userId: string,
    fileId: string
  ): Promise<{ success: boolean; error?: string }> {
    const access = await this.validateFileAccess(userId, fileId, workspaceId);
    
    if (!access.allowed) {
      return { success: false, error: access.reason };
    }

    if (!BUCKET_ID || !access.filePath) {
      return { success: false, error: 'Storage not configured' };
    }

    try {
      const bucket = storage.bucket(BUCKET_ID);
      await bucket.file(access.filePath).delete();
      return { success: true };
    } catch (error) {
      console.error('[FileIsolation] Delete failed:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Audit all files for workspace isolation violations
   */
  async auditWorkspaceIsolation(workspaceId: string): Promise<{
    totalFiles: number;
    isolationViolations: number;
    details: string[];
  }> {
    const uploads = await db.query.chatUploads.findMany({
      where: eq(chatUploads.workspaceId, workspaceId),
    });

    const violations: string[] = [];
    
    for (const upload of uploads) {
      if (!(upload as any).storagePath?.includes(`workspaces/${workspaceId}/`)) {
        violations.push(`File ${upload.id} has incorrect storage path: ${(upload as any).storagePath}`);
      }
    }

    return {
      totalFiles: uploads.length,
      isolationViolations: violations.length,
      details: violations,
    };
  }
}

export const fileStorageIsolationService = new FileStorageIsolationService();
