/**
 * Server-Side Input Sanitization
 * Protects against XSS, injection attacks, and malicious content
 */

import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize chat message content
 * Allows basic formatting but strips dangerous HTML/JS
 */
export function sanitizeChatMessage(message: string): string {
  if (!message || typeof message !== 'string') {
    return '';
  }

  // Trim and limit length
  const trimmed = message.trim().slice(0, 10000); // 10k char max

  // Configure DOMPurify for chat messages
  // Allow basic formatting: bold, italic, links, line breaks
  const clean = DOMPurify.sanitize(trimmed, {
    ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em', 'a', 'br', 'p', 'code', 'pre'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false,
    // Add rel="noopener noreferrer" to all links to prevent reverse tabnabbing
    ADD_ATTR: ['target'],
    ADD_TAGS: [],
  });

  // Force secure link attributes on all <a> tags
  return clean.replace(/<a /g, '<a rel="noopener noreferrer" ');
}

/**
 * Sanitize plain text (strips all HTML)
 * Use for usernames, titles, metadata
 */
export function sanitizePlainText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Strip all HTML and trim
  const clean = DOMPurify.sanitize(text, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    RETURN_DOM: false,
  });

  return clean.trim().slice(0, 1000); // 1k char max for metadata
}

/**
 * Sanitize filename for safe storage
 * Prevents path traversal and dangerous extensions
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed_file';
  }

  // Remove path traversal attempts
  let clean = filename.replace(/\.\./g, '');
  clean = clean.replace(/[\/\\]/g, '_');

  // Remove special characters except alphanumeric, dash, underscore, dot
  clean = clean.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Prevent double extensions (.pdf.exe)
  const parts = clean.split('.');
  if (parts.length > 2) {
    const ext = parts.pop();
    const name = parts.join('_');
    clean = `${name}.${ext}`;
  }

  // Limit length
  clean = clean.slice(0, 255);

  return clean || 'unnamed_file';
}

/**
 * Validate file upload
 * Returns validation result with error message if invalid
 */
export interface FileValidationResult {
  valid: boolean;
  error?: string;
  sanitizedFilename?: string;
}

export function validateFileUpload(
  filename: string,
  fileSize: number,
  mimeType: string,
  maxSizeMB: number = 10
): FileValidationResult {
  // Check filename
  if (!filename) {
    return { valid: false, error: 'Filename is required' };
  }

  const sanitizedFilename = sanitizeFilename(filename);

  // Check file size
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (fileSize > maxBytes) {
    return { 
      valid: false, 
      error: `File size exceeds ${maxSizeMB}MB limit` 
    };
  }

  if (fileSize === 0) {
    return { valid: false, error: 'File is empty' };
  }

  // Check for dangerous extensions
  const dangerousExtensions = [
    '.exe', '.bat', '.cmd', '.com', '.pif', '.scr',
    '.vbs', '.js', '.jar', '.app', '.deb', '.rpm'
  ];

  const lowerFilename = sanitizedFilename.toLowerCase();
  if (dangerousExtensions.some(ext => lowerFilename.endsWith(ext))) {
    return { 
      valid: false, 
      error: 'File type not allowed for security reasons' 
    };
  }

  // Validate MIME type against allowed list
  const allowedMimeTypes = [
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    // Documents
    'application/pdf', 
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
    // Archives
    'application/zip',
    'application/x-zip-compressed',
  ];

  if (!allowedMimeTypes.includes(mimeType)) {
    return { 
      valid: false, 
      error: `File type ${mimeType} is not allowed` 
    };
  }

  return { 
    valid: true, 
    sanitizedFilename 
  };
}

/**
 * Sanitize URL for safe storage and display
 * Prevents javascript: and data: URLs
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  const trimmed = url.trim();

  // Block dangerous protocols
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
  const lowerUrl = trimmed.toLowerCase();
  
  if (dangerousProtocols.some(proto => lowerUrl.startsWith(proto))) {
    return '';
  }

  // Only allow http(s) and relative URLs
  if (!lowerUrl.startsWith('http://') && 
      !lowerUrl.startsWith('https://') && 
      !lowerUrl.startsWith('/')) {
    return '';
  }

  return trimmed.slice(0, 2048); // Max URL length
}

/**
 * Rate limit check for input validation
 * Prevents automated abuse
 */
const validationAttempts = new Map<string, { count: number; resetAt: number }>();

export function checkValidationRateLimit(key: string, maxAttempts: number = 100): boolean {
  const now = Date.now();
  const record = validationAttempts.get(key);

  if (!record || now > record.resetAt) {
    validationAttempts.set(key, {
      count: 1,
      resetAt: now + 60000 // 1 minute window
    });
    return true;
  }

  if (record.count >= maxAttempts) {
    return false;
  }

  record.count++;
  return true;
}
