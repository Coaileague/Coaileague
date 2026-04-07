/**
 * Architecture Linter — startup check for route file organization violations.
 * 
 * THE LAW:
 * - Route handler files MUST live in server/routes/*.ts (NOT server/*.ts root)
 * - Domain organizer files live in server/routes/domains/*.ts
 * - Root server/*.ts is ONLY for: non-route utilities and services
 * - Never define Express Router in root server files (see ALLOWED_ROOT_FILES)
 *
 * This linter runs at startup, logs violations as WARN, never crashes the app.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../lib/logger';
const log = createLogger('architectureLinter');


const SERVER_DIR = path.join(process.cwd(), 'server');
const ROUTES_DIR = path.join(SERVER_DIR, 'routes');

/**
 * Root-level server files explicitly allowed to exist (non-route utilities).
 * These are the ONLY files permitted to live at server/*.ts.
 */
const ALLOWED_ROOT_FILES = new Set([
  'index.ts',        // App entry point (may have health/status endpoints)
  'routes.ts',       // Main route registration
  'auth.ts',         // Auth utilities (not routes)
  'rbac.ts',         // RBAC middleware
  'db.ts',           // Database connection
  'email.ts',        // Email service
  'encryption.ts',   // Encryption utilities
  'storage.ts',      // Storage layer
  'monitoring.ts',   // Monitoring utilities
  'notifications.ts', // Notification service utilities
  'vite.ts',         // Vite dev server config
  'websocket.ts',    // WebSocket server setup
  'tierGuards.ts',   // Tier guards middleware
  'platformMiddleware.ts', // Platform middleware
  'platformAdmin.ts',      // Platform admin utilities
  'adminSupport.ts',       // Admin support utilities
  'replitAuth.ts',         // Replit auth shim
  'objectStorage.ts',      // Object storage utilities
  'objectAcl.ts',          // Object ACL utilities
  'featureFlags.ts',       // Feature flag utilities
  'gemini.ts',             // Gemini AI client
  'helpos-ai.ts',          // HelposAI utilities
  'chat-export.ts',        // Chat export utility (data processing)
  'configRegistry.ts',     // Config registry service (non-route)
  'seed.ts',               // Seed script
]);

// Pattern to detect Express Router definition
const ROUTER_PATTERN = /Router\(\)|express\.Router/;

export function runArchitectureLint(): void {
  const violations: string[] = [];

  // Rule 1: No Express Router in root server/*.ts (except ALLOWED_ROOT_FILES)
  try {
    const rootFiles = fs.readdirSync(SERVER_DIR)
      .filter(f => f.endsWith('.ts') && !ALLOWED_ROOT_FILES.has(f));
    
    for (const file of rootFiles) {
      const filePath = path.join(SERVER_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          const content = fs.readFileSync(filePath, 'utf-8');
          if (ROUTER_PATTERN.test(content)) {
            violations.push(
              `[ARCH] Route file in wrong location: server/${file} → move to server/routes/${file}`
            );
          }
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Skip if directory unreadable
  }

  // Rule 2: Seed files starting with "seed" are always allowed at root
  // (already excluded by ROUTER_PATTERN check since they don't define routers)

  if (violations.length === 0) {
    log.info('[ArchLinter] Architecture check passed — all route files properly organized');
  } else {
    log.warn(`[ArchLinter] ${violations.length} architecture violation(s) detected:`);
    for (const v of violations) {
      log.warn(`  ${v}`);
    }
    log.warn('[ArchLinter] Fix: move the listed files to server/routes/ and update domain imports');
  }
}
