/**
 * Onboarding & Settings Wiring — surface tests
 *
 * Locks in the wiring fixes shipped in commits 7a1174b + c1553f8 + later
 * follow-ups. These are router-shape and module-export tests in the style of
 * tests/unit/sps-onboarding-routes.test.ts — they don't hit a DB, they only
 * verify that the routes / middleware / helpers are exposed under the
 * expected names so future refactors that rename or remove them fail loudly.
 */

import { describe, expect, it } from 'vitest';

function listRoutes(router: any): Array<{ method: string; path: string }> {
  return (router?.stack || [])
    .filter((layer: any) => layer.route)
    .flatMap((layer: any) =>
      Object.keys(layer.route.methods).map((method) => ({
        method: method.toUpperCase(),
        path: layer.route.path as string,
      })),
    );
}

describe('auditor router — settings surface', () => {
  it('exposes GET and PATCH /settings', async () => {
    const mod = await import('../../server/routes/auditorRoutes');
    const routes = listRoutes(mod.auditorRouter);
    expect(routes).toContainEqual({ method: 'GET', path: '/settings' });
    expect(routes).toContainEqual({ method: 'PATCH', path: '/settings' });
  });

  it('exposes GET /nda/last-accepted for version-bump UX', async () => {
    const mod = await import('../../server/routes/auditorRoutes');
    const routes = listRoutes(mod.auditorRouter);
    expect(routes).toContainEqual({ method: 'GET', path: '/nda/last-accepted' });
    expect(routes).toContainEqual({ method: 'GET', path: '/nda/current' });
    expect(routes).toContainEqual({ method: 'POST', path: '/nda/accept' });
  });

  it('still exposes the unchanged audit lifecycle endpoints', async () => {
    const mod = await import('../../server/routes/auditorRoutes');
    const routes = listRoutes(mod.auditorRouter);
    expect(routes).toContainEqual({ method: 'POST', path: '/intake' });
    expect(routes).toContainEqual({ method: 'POST', path: '/claim' });
    expect(routes).toContainEqual({ method: 'POST', path: '/login' });
    expect(routes).toContainEqual({ method: 'POST', path: '/logout' });
  });
});

describe('workspace router — onboarding progress surface', () => {
  it('exposes /onboarding/progress, /step, /complete', async () => {
    const mod = await import('../../server/routes/workspace');
    const routes = listRoutes(mod.default);
    expect(routes).toContainEqual({ method: 'GET', path: '/onboarding/progress' });
    expect(routes).toContainEqual({ method: 'POST', path: '/onboarding/step' });
    expect(routes).toContainEqual({ method: 'POST', path: '/onboarding/complete' });
  });
});

describe('workspaceScope middleware — onboarding gate', () => {
  it('exports requireOnboardingComplete', async () => {
    const mod = await import('../../server/middleware/workspaceScope');
    expect(typeof mod.requireOnboardingComplete).toBe('function');
  });

  it('still exports ensureWorkspaceAccess (unchanged)', async () => {
    const mod = await import('../../server/middleware/workspaceScope');
    expect(typeof mod.ensureWorkspaceAccess).toBe('function');
  });
});

describe('settingsSyncBroadcaster — broadcast helper', () => {
  it('exports broadcastSettingsUpdated', async () => {
    const mod = await import('../../server/services/settingsSyncBroadcaster');
    expect(typeof mod.broadcastSettingsUpdated).toBe('function');
  });
});

describe('shared schema — auditor_settings table', () => {
  it('exports auditorSettings drizzle table + insert schema + types', async () => {
    const mod = await import('../../shared/schema/domains/audit');
    expect(mod.auditorSettings).toBeDefined();
    expect(mod.insertAuditorSettingsSchema).toBeDefined();
  });
});

describe('publicOnboardingRoutes — role landing maps', () => {
  it('defines landing pages for every supported role', async () => {
    // Read the file rather than import (the module has side effects requiring
    // a full express app context). Verify the role keys are present.
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../server/routes/publicOnboardingRoutes.ts'),
      'utf-8',
    );
    for (const role of [
      'org_owner', 'co_owner', 'org_admin', 'org_manager',
      'manager', 'department_manager', 'supervisor',
      'employee', 'staff', 'contractor',
      'vendor', 'client', 'auditor', 'co_auditor',
    ]) {
      expect(src).toContain(`${role}:`);
    }
  });
});

describe('trinityEventSubscriptions — onboarding handler', () => {
  it('subscribes to onboarding_completed', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../server/services/trinityEventSubscriptions.ts'),
      'utf-8',
    );
    // Both the handler function and the subscription registration must exist.
    expect(src).toContain('onOnboardingCompleted');
    expect(src).toContain("platformEventBus.subscribe('onboarding_completed'");
    expect(src).toContain('TrinityOnboardingCompletionHandler');
  });
});

describe('workspace.ts — eager onboarding_completed fix', () => {
  it('no longer publishes onboarding_completed during workspace creation', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../server/routes/workspace.ts'),
      'utf-8',
    );
    // The eager publish (in POST '/' workspace creation) must be gone.
    // Acceptable publishers now: POST /onboarding/complete (real
    // completion) and POST /onboarding/admin-force-complete (platform
    // staff override). Both should be present; the eager creation-time
    // fire should not.
    const occurrences = src.match(/type:\s*'onboarding_completed'/g) || [];
    expect(occurrences.length).toBeGreaterThanOrEqual(1);
    expect(occurrences.length).toBeLessThanOrEqual(2);
    // The publish must NOT live inside the workspace create handler
    // (router.post('/'). Use a substring slice to verify.
    const createBlockStart = src.indexOf("router.post('/'");
    const createBlockEnd = src.indexOf("router.get('/all'", createBlockStart);
    if (createBlockStart >= 0 && createBlockEnd > createBlockStart) {
      const createBlock = src.slice(createBlockStart, createBlockEnd);
      expect(createBlock).not.toContain("type: 'onboarding_completed'");
    }
  });

  it('exposes admin-force-complete platform-staff override', async () => {
    const mod = await import('../../server/routes/workspace');
    const router = mod.default as any;
    const routes = (router?.stack || [])
      .filter((layer: any) => layer.route)
      .map((layer: any) => layer.route.path);
    expect(routes).toContain('/onboarding/admin-force-complete/:workspaceId');
  });
});

describe('handoff hardening — token hashing + identity gate', () => {
  it('assistedOnboardingService hashes the handoff token at rest', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../server/services/assistedOnboardingService.ts'),
      'utf-8',
    );
    expect(src).toContain('hashHandoffToken');
    expect(src).toContain("createHash('sha256')");
    // completeHandoff must look up by hash, not raw token
    expect(src).toMatch(/eq\(workspaces\.handoffToken,\s*tokenHash\)/);
  });

  it('completeHandoff requires email match to prevent token theft', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../server/services/assistedOnboardingService.ts'),
      'utf-8',
    );
    expect(src).toContain('expectedEmail');
    expect(src).toContain('actualEmail');
    expect(src).toContain('Handoff identity mismatch');
  });
});

describe('client signup — events, audit, auto-auth', () => {
  it('publishes workspace.created and onboarding_completed for clients', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../server/routes/miscRoutes.ts'),
      'utf-8',
    );
    expect(src).toContain("type: \"workspace.created\"");
    expect(src).toContain("type: \"onboarding_completed\"");
    expect(src).toContain("source: \"client_signup\"");
    // Auto-redirect to /client-portal, not /login
    expect(src).toContain('redirectTo: "/client-portal"');
  });
});

describe('publicOnboardingRoutes — vendor goes to clients, not employees', () => {
  it("vendors don't pollute the employees table", async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../server/routes/publicOnboardingRoutes.ts'),
      'utf-8',
    );
    // Vendor branch must skip employees insert
    expect(src).toMatch(/if\s*\(role\s*===\s*'vendor'\)/);
    expect(src).toMatch(/clientCode:\s*`VND-/);
  });

  it('contractor gets contractor payType, not hourly', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../server/routes/publicOnboardingRoutes.ts'),
      'utf-8',
    );
    expect(src).toMatch(/role === 'contractor' \? 'contractor' : 'hourly'/);
    expect(src).toMatch(/role === 'contractor' \? 'contractor' : 'employee'/);
  });
});

describe('workspace switch — onboarding gate', () => {
  it('returns 412 when switching into an incomplete workspace', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../server/routes/workspaceInlineRoutes.ts'),
      'utf-8',
    );
    expect(src).toContain('ONBOARDING_INCOMPLETE');
    expect(src).toContain('onboardingFullyComplete === false');
    expect(src).toContain('resumeUrl');
  });
});

describe('Trinity onboarding handler — in-app notification', () => {
  it('writes a notification + WS broadcast when flag flips', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../server/services/trinityEventSubscriptions.ts'),
      'utf-8',
    );
    expect(src).toContain("type: 'onboarding_completed'");
    expect(src).toContain('Trinity is ready');
    expect(src).toContain('broadcastToWorkspace');
    expect(src).toContain('welcome=trinity_unlocked');
  });
});

describe('invite reaper — orphan user vacuum', () => {
  it('deletes users with no membership and no email slug', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../server/services/onboarding/inviteReaperService.ts'),
      'utf-8',
    );
    expect(src).toContain('orphan-user');
    expect(src).toContain('NOT EXISTS (SELECT 1 FROM workspace_members');
    expect(src).toContain('NOT EXISTS (SELECT 1 FROM employees');
  });
});

describe('workspace router — onboarding step audit', () => {
  it('writes an audit_log on every step + completion', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../server/routes/workspace.ts'),
      'utf-8',
    );
    expect(src).toContain("'onboarding_step.completed'");
    expect(src).toContain("'onboarding.completed'");
  });
});
