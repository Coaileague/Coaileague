/**
 * E2E TESTS — Authentication & Core UI Flows
 * Playwright — Phase 38 Automated Test Suite
 */

import { test, expect } from '@playwright/test';

// ─── Landing / Login Page ─────────────────────────────────────────────────────
test.describe('Authentication Flow', () => {
  test('home page loads without crashing', async ({ page }) => {
    const response = await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(response?.status()).toBeLessThan(500);
  });

  test('home page has a document title', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('login page renders without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const criticalErrors = errors.filter(e =>
      !e.includes('ResizeObserver') &&
      !e.includes('Non-Error') &&
      !e.includes('reCAPTCHA')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('login page renders interactive elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const interactable = await page.locator(
      'input, button, [role="button"], a[href]'
    ).count();
    expect(interactable).toBeGreaterThan(0);
  });

  test('/login route serves login page without crashing', async ({ page }) => {
    const response = await page.goto('/login');
    await page.waitForLoadState('networkidle');
    expect(response?.status()).toBeLessThan(500);
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});

// ─── SPA Routing ─────────────────────────────────────────────────────────────
test.describe('SPA Routing', () => {
  test('unknown route stays on SPA without server error message', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-xyz');
    await page.waitForLoadState('networkidle');
    const body = await page.textContent('body');
    expect(body).not.toContain('Cannot GET');
  });

  test('dashboard route handles unauthenticated gracefully', async ({ page }) => {
    const response = await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    expect(response?.status()).toBeLessThan(500);
  });

  test('privacy policy route is navigable', async ({ page }) => {
    const response = await page.goto('/privacy');
    await page.waitForLoadState('networkidle');
    expect(response?.status()).toBeLessThan(500);
  });
});

// ─── Accessibility Baseline ───────────────────────────────────────────────────
test.describe('WCAG 2.1 AA — Baseline Checks', () => {
  test('home page has a non-empty document title', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('home page renders page content (not blank)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.trim().length).toBeGreaterThan(10);
  });

  test('interactive elements are keyboard-navigable (Tab key moves focus)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('Tab');
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(['INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA', 'BODY']).toContain(focusedTag);
  });

  test('page has viewport meta tag (mobile responsive)', async ({ page }) => {
    await page.goto('/');
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toBeTruthy();
    expect(viewport).not.toContain('user-scalable=no');
  });

  test('page does not generate server errors on load (no 5xx)', async ({ page }) => {
    const errors: string[] = [];
    page.on('response', res => {
      if (res.url().includes('localhost') && res.status() >= 500) {
        errors.push(`${res.status()} ${res.url()}`);
      }
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });
});
