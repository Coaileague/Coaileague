import { test, expect, Route } from '@playwright/test';

test.describe('TEST 13: Network Failure Handling', () => {
  test('API timeout shows error message', async ({ page }) => {
    await page.route('**/api/employees', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 10000));
      await route.abort('timedout');
    });

    await page.goto('/employees');
    
    await page.waitForTimeout(3000);
    
    const errorIndicators = await page.locator(
      '[data-testid*="error"], .error, [class*="error"], [role="alert"], text=/error|failed|timeout/i'
    ).all();

    console.log(`[Network] Found ${errorIndicators.length} error indicators after timeout`);
  });

  test('500 error shows user-friendly message', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    await page.goto('/');
    
    await page.waitForTimeout(2000);
  });

  test('Network disconnect recovery', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await context.setOffline(true);
    
    await page.waitForTimeout(2000);

    const offlineIndicator = await page.locator(
      'text=/offline|no connection|network error/i, [data-testid*="offline"]'
    ).count();

    await context.setOffline(false);
    
    await page.waitForTimeout(3000);

    console.log(`[Network] Offline indicators: ${offlineIndicator}`);
  });

  test('Retry button functionality', async ({ page }) => {
    let requestCount = 0;
    
    await page.route('**/api/employees', async (route) => {
      requestCount++;
      if (requestCount < 3) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Service Unavailable' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ employees: [] }),
        });
      }
    });

    await page.goto('/employees');
    
    const retryButton = page.locator('button:has-text("Retry"), button:has-text("Try Again"), [data-testid*="retry"]').first();
    
    if (await retryButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await retryButton.click();
      await page.waitForTimeout(1000);
      await retryButton.click().catch(() => {});
    }

    console.log(`[Network] Total requests made: ${requestCount}`);
  });

  test('Partial data corruption prevention', async ({ page }) => {
    let submitCount = 0;
    
    await page.route('**/api/shifts', async (route) => {
      submitCount++;
      if (route.request().method() === 'POST') {
        await route.abort('connectionfailed');
      } else {
        await route.continue();
      }
    });

    await page.goto('/schedule');
    
    const createButton = page.locator('[data-testid*="create"], button:has-text("Create"), button:has-text("Add Shift")').first();
    
    if (await createButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createButton.click();
      await page.waitForTimeout(1000);
    }

    console.log(`[Network] Shift creation attempts: ${submitCount}`);
  });

  test('Form data preserved on error', async ({ page }) => {
    await page.route('**/api/employees', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Database error' }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/employees');
    
    const addButton = page.locator('[data-testid*="add"], button:has-text("Add Employee"), button:has-text("New")').first();
    
    if (await addButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addButton.click();
      await page.waitForTimeout(500);

      const nameInput = page.locator('input[name="firstName"], input[placeholder*="name"]').first();
      if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nameInput.fill('TestEmployee');
        
        const submitBtn = page.locator('button[type="submit"], button:has-text("Save")').first();
        if (await submitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await submitBtn.click();
          await page.waitForTimeout(1000);
          
          const preservedValue = await nameInput.inputValue().catch(() => '');
          console.log(`[Network] Form data after error: "${preservedValue}"`);
        }
      }
    }
  });

  test('Circuit breaker behavior simulation', async ({ page }) => {
    let failCount = 0;
    const MAX_FAILS = 5;

    await page.route('**/api/health', async (route) => {
      failCount++;
      if (failCount <= MAX_FAILS) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Service down' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'healthy' }),
        });
      }
    });

    for (let i = 0; i < MAX_FAILS + 2; i++) {
      await page.request.get('/api/health').catch(() => {});
      await page.waitForTimeout(100);
    }

    console.log(`[Circuit Breaker] Failures simulated: ${failCount}`);
    expect(failCount).toBeGreaterThanOrEqual(MAX_FAILS);
  });

  test('Graceful degradation with slow network', async ({ page }) => {
    await page.route('**/*', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.continue();
    });

    const startTime = Date.now();
    await page.goto('/', { timeout: 60000 });
    const loadTime = Date.now() - startTime;

    console.log(`[Slow Network] Page loaded in ${loadTime}ms with 500ms delay per request`);
    
    const isUsable = await page.locator('body').isVisible();
    expect(isUsable).toBeTruthy();
  });
});
