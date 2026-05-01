/**
 * FILE DOWNLOAD ROUTES
 * ====================
 * Secure file download endpoint with proper authentication and access control.
 * Serves files from object storage with ACL policy enforcement.
 */

import path from 'path';
import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { chatMessages, employeeDocuments, users, employees } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../auth';
import { ObjectStorageService, ObjectNotFoundError } from '../objectStorage';
import { ObjectPermission } from '../objectAcl';
import { getUserPlatformRole, hasPlatformWideAccess } from '../rbac';
import { createLogger } from '../lib/logger';
const log = createLogger('FileDownload');


const router = Router();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    workspaceId?: string;
    currentWorkspaceId?: string;
    platformRole?: string;
    workspaceRole?: string;
  };
  workspaceId?: string;
}

/**
 * Download a file by path
 * Endpoint: GET /api/files/download/*
 *
 * Supports paths like:
 * - /api/files/download/private-messages/{workspaceId}/{fileId}.ext
 * - /api/files/download/expense-receipts/{workspaceId}/{fileId}.ext
 * - /api/files/download/signatures/{signatureId}
 */
router.get('/download/*', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const userWorkspaceId = req.user?.currentWorkspaceId || req.workspaceId;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Extract the file path from the URL (everything after /download/)
    const rawFilePath = req.params[0];
    if (!rawFilePath) {
      return res.status(400).json({ error: 'File path required' });
    }

    // Path traversal defense: normalize and verify path stays within expected bounds
    // Decode any percent-encoded traversal sequences before normalizing
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(rawFilePath);
    } catch {
      return res.status(400).json({ error: 'Invalid file path encoding' });
    }
    // Reject any path containing traversal segments
    if (decodedPath.includes('..') || decodedPath.includes('\\') || decodedPath.startsWith('/')) {
      log.warn(`[FileDownload] Path traversal attempt blocked: ${rawFilePath} by user ${userId}`);
      return res.status(400).json({ error: 'Invalid file path' });
    }
    // Normalize and verify canonical path does not escape the prefix
    const normalizedPath = path.posix.normalize(decodedPath);
    if (normalizedPath.startsWith('..') || normalizedPath.startsWith('/')) {
      log.warn(`[FileDownload] Path traversal attempt (post-normalize) blocked: ${rawFilePath} by user ${userId}`);
      return res.status(400).json({ error: 'Invalid file path' });
    }
    const filePath = normalizedPath;

    // Construct the object path
    const objectPath = `/objects/${filePath}`;
    log.info(`[FileDownload] Requested: ${objectPath} by user ${userId}`);

    // Create object storage service instance
    const objectStorageService = new ObjectStorageService();

    // Get the file from object storage
    let objectFile;
    try {
      objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        log.info(`[FileDownload] File not found: ${objectPath}`);
        return res.status(404).json({ error: 'File not found' });
      }
      throw error;
    }

    // Check access permissions
    const hasAccess = await objectStorageService.canAccessObjectEntity({
      userId,
      objectFile,
      requestedPermission: ObjectPermission.READ,
    });

    if (!hasAccess) {
      // Additional workspace-based access check
      const pathParts = filePath.split('/');
      const fileType = pathParts[0];

      // Check workspace membership for workspace-scoped files
      if (fileType === 'private-messages' || fileType === 'expense-receipts') {
        const fileWorkspaceId = pathParts[1];
        if (fileWorkspaceId !== userWorkspaceId) {
          log.info(`[FileDownload] Access denied: workspace mismatch ${fileWorkspaceId} vs ${userWorkspaceId}`);
          return res.status(403).json({ error: 'Access denied - not authorized for this workspace' });
        }
      }

      // If still no access, check if user is root/admin (using proper revokedAt-aware check)
      const callerPlatRole = await getUserPlatformRole(userId);
      const isAdmin = ['root_admin', 'deputy_admin', 'sysop'].includes(callerPlatRole);
      if (!isAdmin) {
        log.info(`[FileDownload] Access denied: ${objectPath} for user ${userId}`);
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Set appropriate headers for download
    const filename = filePath.split('/').pop() || 'download';
    const isInline = req.query.inline === 'true';

    if (!isInline) {
      res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    }

    // Stream the file to response
    await objectStorageService.downloadObject(objectFile, res);

  } catch (error: unknown) {
    log.error('[FileDownload] Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download file', message: sanitizeError(error) });
    }
  }
});

/**
 * Download a chat message attachment by message ID
 * Endpoint: GET /api/files/chat-attachment/:messageId
 *
 * Chat attachments are stored inline in the chatMessages table
 */
router.get('/chat-attachment/:messageId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;
    const userWorkspaceId = req.user?.currentWorkspaceId || req.workspaceId;

    if (!userId || !userWorkspaceId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Look up the message with attachment in the database
    const [message] = await db.select()
      .from(chatMessages)
      .where(eq(chatMessages.id, messageId))
      .limit(1);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (!message.attachmentUrl) {
      return res.status(404).json({ error: 'No attachment on this message' });
    }

    // For private messages, check if user is sender or recipient
    if (message.isPrivateMessage) {
      if (message.senderId !== userId && message.recipientId !== userId) {
        const callerPlatRole2 = await getUserPlatformRole(userId);
        const isAdmin = ['root_admin', 'deputy_admin', 'sysop'].includes(callerPlatRole2);
        if (!isAdmin) {
          return res.status(403).json({ error: 'Access denied - private message' });
        }
      }
    }

    // Get the file URL from the message record
    const fileUrl = message.attachmentUrl;
    const objectStorageService = new ObjectStorageService();

    // Normalize the path and get the file
    const objectPath = objectStorageService.normalizeObjectEntityPath(fileUrl);
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    // Set download headers
    const filename = message.attachmentName || 'attachment';
    const isInline = req.query.inline === 'true';

    if (!isInline) {
      res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    }

    // Stream the file
    await objectStorageService.downloadObject(objectFile, res);

  } catch (error: unknown) {
    log.error('[FileDownload] Chat attachment error:', error);
    if (!res.headersSent) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: 'File not found in storage' });
      } else {
        res.status(500).json({ error: 'Failed to download attachment', message: sanitizeError(error) });
      }
    }
  }
});

/**
 * Download an employee document by ID
 * Endpoint: GET /api/files/document/:documentId
 *
 * Employee documents include I-9, W-4, certifications, etc.
 */
router.get('/document/:documentId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { documentId } = req.params;
    const userId = req.user?.id;
    const userWorkspaceId = req.user?.currentWorkspaceId || req.workspaceId;

    if (!userId || !userWorkspaceId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Look up the document in the database
    const [document] = await db.select()
      .from(employeeDocuments)
      .where(eq(employeeDocuments.id, documentId))
      .limit(1);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check workspace access (using proper revokedAt-aware platform role check)
    const docCallerPlatRole = await getUserPlatformRole(userId);
    if (document.workspaceId !== userWorkspaceId) {
      const isAdmin = ['root_admin', 'deputy_admin', 'sysop'].includes(docCallerPlatRole);
      if (!isAdmin) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Check if user is the document owner (employee) or has admin access
    const [employee] = await db.select()
      .from(employees)
      .where(eq(employees.id, document.employeeId))
      .limit(1);

    if (employee && employee.userId !== userId) {
      const isAdminOrManager = ['org_owner', 'co_owner', 'hr_director', 'manager']
        .includes(req.user?.workspaceRole || '') ||
        ['root_admin', 'deputy_admin', 'sysop'].includes(docCallerPlatRole);

      if (!isAdminOrManager) {
        return res.status(403).json({ error: 'Access denied - you can only view your own documents' });
      }
    }

    // Get the file URL from the document record
    const fileUrl = document.fileUrl;
    if (!fileUrl) {
      return res.status(404).json({ error: 'Document file URL not found' });
    }

    const objectStorageService = new ObjectStorageService();

    // Normalize the path and get the file
    const objectPath = objectStorageService.normalizeObjectEntityPath(fileUrl);
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    // Set download headers
    const filename = document.originalFileName || document.documentName || 'document';
    const isInline = req.query.inline === 'true';

    if (!isInline) {
      res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    }

    // Stream the file
    await objectStorageService.downloadObject(objectFile, res);

  } catch (error: unknown) {
    log.error('[FileDownload] Document error:', error);
    if (!res.headersSent) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: 'File not found in storage' });
      } else {
        res.status(500).json({ error: 'Failed to download document', message: sanitizeError(error) });
      }
    }
  }
});

/**
 * Get file metadata without downloading
 * Endpoint: GET /api/files/info/*
 */
router.get('/info/*', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const filePath = req.params[0];
    if (!filePath) {
      return res.status(400).json({ error: 'File path required' });
    }

    const objectPath = `/objects/${filePath}`;
    const objectStorageService = new ObjectStorageService();

    try {
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      const [metadata] = await objectFile.getMetadata();

      res.json({
        exists: true,
        contentType: metadata.contentType,
        size: metadata.size,
        created: metadata.timeCreated,
        updated: metadata.updated,
      });
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.json({ exists: false });
      } else {
        throw error;
      }
    }
  } catch (error: unknown) {
    log.error('[FileDownload] Info error:', error);
    res.status(500).json({ error: 'Failed to get file info', message: sanitizeError(error) });
  }
});

export default router;
