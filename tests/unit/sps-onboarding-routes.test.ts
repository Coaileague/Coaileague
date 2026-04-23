import { describe, expect, it } from 'vitest';
import { spsOnboardingRoutes } from '../../server/routes/spsOnboardingRoutes';

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

describe('SPS onboarding router surface', () => {
  it('exposes required launch endpoints', () => {
    const routes = listRoutes(spsOnboardingRoutes);

    expect(routes).toContainEqual({ method: 'POST', path: '/create' });
    expect(routes).toContainEqual({ method: 'GET', path: '/:id' });
    expect(routes).toContainEqual({ method: 'POST', path: '/:id/save' });
    expect(routes).toContainEqual({ method: 'PUT', path: '/:id/save-draft' });
    expect(routes).toContainEqual({ method: 'POST', path: '/:id/finalize' });
    expect(routes).toContainEqual({ method: 'POST', path: '/:id/set-rate' });
  });
});

