/**
 * Client-Side Message Sanitization
 * Defense-in-depth: Even though server sanitizes, client should too
 */

import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize chat message for safe HTML rendering
 * Allows basic formatting but strips dangerous content
 * SECURITY: Normalizes all links to prevent reverse tabnabbing
 */
export function sanitizeMessage(message: string): string {
  if (!message || typeof message !== 'string') {
    return '';
  }

  // Remove any existing hooks to prevent accumulation
  DOMPurify.removeAllHooks();

  // Add hook to normalize ALL <a> tags - strip attacker rel and force noopener noreferrer
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      // Always set target to _blank for external links
      if (node.hasAttribute('href')) {
        node.setAttribute('target', '_blank');
      }
      // CRITICAL: Remove any existing rel attribute (attacker controlled or legacy)
      // Then add our safe rel attribute
      node.removeAttribute('rel');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });

  // Configure DOMPurify for chat messages
  // Allow basic formatting: bold, italic, links, line breaks
  // SECURITY: Only allow http/https/mailto URIs - block javascript:, data:, etc.
  const clean = DOMPurify.sanitize(message, {
    ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em', 'a', 'br', 'p', 'code', 'pre'],
    ALLOWED_ATTR: ['href'], // Only allow href - target and rel are forced by hook
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i, // Only http(s) and mailto
    ALLOW_DATA_ATTR: false,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false,
    SAFE_FOR_TEMPLATES: true,
  });

  // Cleanup hooks after use
  DOMPurify.removeAllHooks();

  return clean;
}

/**
 * Sanitize plain text (strips ALL HTML)
 * Use for usernames, status messages, etc.
 */
export function sanitizePlainText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const clean = DOMPurify.sanitize(text, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    RETURN_DOM: false,
  });

  return clean.trim();
}
