/**
 * POST /api/admin/dev-execute
 *
 * Token-authenticated endpoint for running pre-approved dev/admin scripts
 * without requiring a platform-staff session.  Designed for CI pipelines,
 * Railway deploy hooks, and one-shot setup tasks.
 *
 * Authentication: `x-admin-token` header must match the `ADMIN_SCRIPT_TOKEN`
 * environment variable.  The endpoint rejects requests when the env var is
 * not set to prevent accidental open access.
 *
 * Allowed commands (whitelist):
 *   - "npx tsx create-dev-accounts.ts"  →  creates Statewide Dev Sandbox
 *                                           and CoAIleague Support Org accounts
 *
 * SECURITY: The command whitelist is the only RCE guard.  Never expand the
 * whitelist without a security review.  Never expose this route without a
 * strong, randomly-generated ADMIN_SCRIPT_TOKEN.
 */

import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { createLogger } from '../lib/logger';
import { sanitizeError } from '../middleware/errorHandler';

const log = createLogger('AdminDevExecute');

const router = Router();

const devExecuteSchema = z.object({
  command: z.string().min(1),
});

// ─── Token middleware ─────────────────────────────────────────────────────────

function requireAdminScriptToken(req: any, res: any, next: any): void {
  const expectedToken = process.env.ADMIN_SCRIPT_TOKEN;

  if (!expectedToken) {
    res.status(503).json({
      error: 'ADMIN_SCRIPT_TOKEN environment variable is not configured on this server.',
    });
    return;
  }

  const provided = req.headers['x-admin-token'];
  if (!provided || typeof provided !== 'string') {
    log.warn('[DevExecute] Rejected request — missing x-admin-token');
    res.status(401).json({ error: 'Invalid or missing x-admin-token header.' });
    return;
  }

  // Constant-time comparison to prevent timing attacks.
  try {
    const providedBuf = Buffer.from(provided);
    const expectedBuf = Buffer.from(expectedToken);
    if (
      providedBuf.length !== expectedBuf.length ||
      !timingSafeEqual(providedBuf, expectedBuf)
    ) {
      log.warn('[DevExecute] Rejected request — invalid x-admin-token');
      res.status(401).json({ error: 'Invalid or missing x-admin-token header.' });
      return;
    }
  } catch {
    res.status(401).json({ error: 'Invalid or missing x-admin-token header.' });
    return;
  }

  next();
}

// ─── Allowed commands ─────────────────────────────────────────────────────────

const ALLOWED_COMMANDS: Record<string, () => Promise<string>> = {
  'npx tsx create-dev-accounts.ts': async () => {
    const lines: string[] = [];

    // Pass a scoped logger to avoid touching the global console.log.
    const capture = (...args: unknown[]) => {
      const line = args.map((a) => String(a)).join(' ');
      lines.push(line);
      // Also emit to server stdout for visibility in Railway logs.
      process.stdout.write(line + '\n');
    };

    const { createDevAccounts } = await import('../../create-dev-accounts');
    await createDevAccounts(capture);

    return lines.join('\n');
  },
};

// ─── Route ───────────────────────────────────────────────────────────────────

router.post('/dev-execute', requireAdminScriptToken, async (req: any, res: any) => {
  // Extra safety: dev-execute should never run in production
  if (process.env.NODE_ENV === 'production') {
    log.error('[DevExecute] Attempted dev-execute in production — blocked');
    return res.status(403).json({ error: 'dev-execute is not available in production environments' });
  }
  const parsed = devExecuteSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Request body must include a "command" string.',
      details: parsed.error.flatten(),
    });
  }

  const { command } = parsed.data;

  const handler = ALLOWED_COMMANDS[command.trim()];
  if (!handler) {
    log.warn(`[DevExecute] Rejected disallowed command: ${command}`);
    return res.status(400).json({
      error: `Command not allowed: "${command}". Check the server whitelist.`,
    });
  }

  try {
    log.info(`[DevExecute] Running: ${command}`);
    const output = await handler();
    log.info('[DevExecute] Completed successfully');
    return res.json({ success: true, command, output });
  } catch (error: unknown) {
    log.error('[DevExecute] Command failed:', error);
    return res.status(500).json({
      success: false,
      command,
      error: sanitizeError(error),
    });
  }
});

export default router;
