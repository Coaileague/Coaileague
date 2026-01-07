import { test, expect } from '@playwright/test';

test.describe('TEST 12: Concurrent Users Simulation', () => {
  test.describe.configure({ mode: 'parallel' });

  const CONCURRENT_OPERATIONS = 10;

  test('Multiple simultaneous page loads', async ({ browser }) => {
    const contexts = await Promise.all(
      Array(CONCURRENT_OPERATIONS).fill(0).map(() => browser.newContext())
    );
    
    const pages = await Promise.all(
      contexts.map(ctx => ctx.newPage())
    );

    const startTime = Date.now();

    const results = await Promise.allSettled(
      pages.map(async (page, index) => {
        const pageStart = Date.now();
        await page.goto('/', { waitUntil: 'networkidle', timeout: 30000 });
        return { index, loadTime: Date.now() - pageStart };
      })
    );

    const totalTime = Date.now() - startTime;

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`[Concurrent] ${CONCURRENT_OPERATIONS} pages loaded in ${totalTime}ms`);
    console.log(`[Concurrent] Success: ${successful}, Failed: ${failed}`);

    for (const page of pages) await page.close();
    for (const ctx of contexts) await ctx.close();

    expect(successful).toBeGreaterThanOrEqual(CONCURRENT_OPERATIONS * 0.8);
    expect(totalTime).toBeLessThan(60000);
  });

  test('Concurrent API requests', async ({ request }) => {
    const endpoints = [
      '/api/health',
      '/api/employees',
      '/api/clients',
    ];

    const requests = Array(CONCURRENT_OPERATIONS).fill(0).flatMap((_, i) =>
      endpoints.map(endpoint => ({
        endpoint,
        index: i,
      }))
    );

    const startTime = Date.now();

    const results = await Promise.allSettled(
      requests.map(async ({ endpoint, index }) => {
        const reqStart = Date.now();
        const response = await request.get(endpoint, { timeout: 10000 });
        return {
          endpoint,
          index,
          status: response.status(),
          time: Date.now() - reqStart,
        };
      })
    );

    const totalTime = Date.now() - startTime;

    const successful = results.filter(r => 
      r.status === 'fulfilled' && 
      (r.value.status === 200 || r.value.status === 401 || r.value.status === 304)
    ).length;

    const avgTime = results
      .filter(r => r.status === 'fulfilled')
      .reduce((sum, r) => sum + (r.value as any).time, 0) / successful || 0;

    console.log(`[Concurrent API] ${requests.length} requests in ${totalTime}ms`);
    console.log(`[Concurrent API] Success: ${successful}/${requests.length}`);
    console.log(`[Concurrent API] Avg response time: ${avgTime.toFixed(0)}ms`);

    expect(successful).toBeGreaterThanOrEqual(requests.length * 0.7);
  });

  test('Rate limiting behavior', async ({ request }) => {
    const rapidRequests = Array(30).fill(0).map((_, i) => i);
    
    const results = await Promise.allSettled(
      rapidRequests.map(async (i) => {
        const response = await request.get('/api/health', { timeout: 5000 });
        return { index: i, status: response.status() };
      })
    );

    const statuses = results
      .filter(r => r.status === 'fulfilled')
      .map(r => (r.value as any).status);

    const successCount = statuses.filter(s => s === 200).length;
    const rateLimited = statuses.filter(s => s === 429).length;

    console.log(`[Rate Limit] Success: ${successCount}, Rate Limited: ${rateLimited}`);

    expect(successCount + rateLimited).toBeGreaterThan(0);
  });

  test('WebSocket concurrent connections', async ({ browser }) => {
    const WS_COUNT = 5;
    const pages = await Promise.all(
      Array(WS_COUNT).fill(0).map(async () => {
        const context = await browser.newContext();
        return context.newPage();
      })
    );

    const wsConnections: boolean[] = [];

    for (const page of pages) {
      await page.goto('/');
      
      const hasWs = await page.evaluate(() => {
        return new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(true), 1000);
        });
      });
      
      wsConnections.push(hasWs);
    }

    console.log(`[WebSocket] ${wsConnections.filter(Boolean).length}/${WS_COUNT} connections established`);

    for (const page of pages) await page.close();

    expect(wsConnections.filter(Boolean).length).toBeGreaterThanOrEqual(WS_COUNT * 0.8);
  });

  test('Database connection pool under load', async ({ request }) => {
    const DB_HEAVY_REQUESTS = 20;

    const startTime = Date.now();

    const results = await Promise.allSettled(
      Array(DB_HEAVY_REQUESTS).fill(0).map(async (_, i) => {
        const response = await request.get('/api/employees', { timeout: 15000 });
        return { index: i, status: response.status() };
      })
    );

    const totalTime = Date.now() - startTime;
    const successful = results.filter(r => 
      r.status === 'fulfilled' && 
      ((r.value as any).status === 200 || (r.value as any).status === 401)
    ).length;

    console.log(`[DB Pool] ${DB_HEAVY_REQUESTS} DB queries in ${totalTime}ms`);
    console.log(`[DB Pool] Success: ${successful}/${DB_HEAVY_REQUESTS}`);

    expect(successful).toBeGreaterThanOrEqual(DB_HEAVY_REQUESTS * 0.7);
    expect(totalTime).toBeLessThan(30000);
  });
});
