import { test, expect } from '@playwright/test';

interface PageBenchmark {
  path: string;
  name: string;
  maxLoadTime: number;
}

const PAGE_BENCHMARKS: PageBenchmark[] = [
  { path: '/', name: 'Dashboard', maxLoadTime: 3000 },
  { path: '/schedule', name: 'Schedule', maxLoadTime: 4000 },
  { path: '/employees', name: 'Employee List', maxLoadTime: 3000 },
  { path: '/billing', name: 'Billing', maxLoadTime: 3000 },
  { path: '/clients', name: 'Clients', maxLoadTime: 3000 },
];

test.describe('TEST 11: Load Time Benchmarks', () => {
  for (const benchmark of PAGE_BENCHMARKS) {
    test(`${benchmark.name} loads under ${benchmark.maxLoadTime}ms`, async ({ page }) => {
      const startTime = Date.now();
      
      await page.goto(benchmark.path, { waitUntil: 'networkidle' });
      
      const loadTime = Date.now() - startTime;
      
      console.log(`[Benchmark] ${benchmark.name}: ${loadTime}ms (max: ${benchmark.maxLoadTime}ms)`);
      
      expect(loadTime).toBeLessThan(benchmark.maxLoadTime);
    });

    test(`${benchmark.name} - First Contentful Paint`, async ({ page }) => {
      await page.goto(benchmark.path);
      
      const fcp = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const fcpEntry = entries.find(e => e.name === 'first-contentful-paint');
            if (fcpEntry) {
              resolve(fcpEntry.startTime);
            }
          });
          observer.observe({ entryTypes: ['paint'] });
          
          setTimeout(() => resolve(0), 5000);
        });
      });
      
      console.log(`[FCP] ${benchmark.name}: ${fcp}ms`);
      
      expect(fcp).toBeLessThan(2500);
    });
  }

  test('API response times', async ({ page }) => {
    const apiEndpoints = [
      '/api/employees',
      '/api/clients',
      '/api/schedule/shifts',
      '/api/billing/subscription',
    ];

    await page.goto('/');

    for (const endpoint of apiEndpoints) {
      const startTime = Date.now();
      
      const response = await page.request.get(endpoint, {
        timeout: 10000,
      }).catch(() => null);
      
      const responseTime = Date.now() - startTime;
      
      console.log(`[API] ${endpoint}: ${responseTime}ms (status: ${response?.status() || 'error'})`);
      
      expect(responseTime).toBeLessThan(2000);
    }
  });

  test('Time to Interactive (TTI)', async ({ page }) => {
    await page.goto('/');
    
    const tti = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        if (document.readyState === 'complete') {
          resolve(performance.now());
        } else {
          window.addEventListener('load', () => {
            resolve(performance.now());
          });
        }
      });
    });
    
    console.log(`[TTI] Dashboard: ${tti}ms`);
    
    expect(tti).toBeLessThan(5000);
  });

  test('Bundle size check', async ({ page }) => {
    const resourceSizes: { [key: string]: number } = {};
    
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('.js') || url.includes('.css')) {
        const size = (await response.body().catch(() => Buffer.from(''))).length;
        const name = url.split('/').pop() || url;
        resourceSizes[name] = size;
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    let totalJsSize = 0;
    let totalCssSize = 0;

    for (const [name, size] of Object.entries(resourceSizes)) {
      if (name.includes('.js')) totalJsSize += size;
      if (name.includes('.css')) totalCssSize += size;
    }

    console.log(`[Bundle] Total JS: ${(totalJsSize / 1024).toFixed(2)}KB`);
    console.log(`[Bundle] Total CSS: ${(totalCssSize / 1024).toFixed(2)}KB`);

    expect(totalJsSize).toBeLessThan(5 * 1024 * 1024);
    expect(totalCssSize).toBeLessThan(1 * 1024 * 1024);
  });
});
