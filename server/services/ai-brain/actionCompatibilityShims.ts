/**
 * ACTION COMPATIBILITY SHIMS — Trinity Action Consolidation
 * ==========================================================
 * Legacy action redirects were used during action-domain consolidation.
 * Repository searches now show the retired action IDs are no longer used by
 * active source files; canonical actions remain registered in their owning
 * modules.
 *
 * This registrar intentionally remains as a no-op so the master orchestrator
 * import/call path stays stable while the compatibility layer is phased out.
 * Do not add new shims here unless an active production caller is identified.
 */

import { createLogger } from '../../lib/logger';
const log = createLogger('actionCompatibilityShims');

export function registerActionCompatibilityShims(): void {
  log.info('[Action Compatibility Shims] No legacy action redirects registered; canonical action IDs only.');
}
