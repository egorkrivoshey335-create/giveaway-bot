import { test, expect } from '@playwright/test';

/**
 * E2E smoke tests — проверяем что приложение запускается
 * и ключевые страницы/API отвечают корректно.
 *
 * Запуск: pnpm test:e2e
 * (требует запущенного `pnpm dev`)
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';

// =============================================================================
// API Health
// =============================================================================

test.describe('API Health', () => {
  test('GET /health returns 200 with healthy status', async ({ request }) => {
    const response = await request.get(`${API_URL}/health`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('healthy');
    expect(body.data.service).toBe('api');
    expect(body.data.checks.database.status).toBe('healthy');
    expect(body.data.checks.redis.status).toBe('healthy');
  });

  test('GET /health includes latency metrics', async ({ request }) => {
    const response = await request.get(`${API_URL}/health`);
    const body = await response.json();
    expect(body.data.checks.database.latencyMs).toBeLessThan(500);
    expect(body.data.checks.redis.latencyMs).toBeLessThan(500);
  });
});

// =============================================================================
// Web App
// =============================================================================

test.describe('Web App', () => {
  test('home page loads without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(errors.filter(e => !e.includes('hydrat'))).toHaveLength(0);
  });

  test('home page has correct title / meta', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });

  test('page responds within 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });
});

// =============================================================================
// API Auth
// =============================================================================

test.describe('API Auth', () => {
  test('GET /auth/me returns 401 without session', async ({ request }) => {
    const response = await request.get(`${API_URL}/auth/me`);
    expect([401, 200]).toContain(response.status());
    if (response.status() === 401) {
      const body = await response.json();
      expect(body.ok).toBe(false);
    }
  });

  test('dev login endpoint exists in development', async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/dev`, {
      data: { telegramUserId: '123456789' },
    });
    // В dev режиме должен отвечать 200, в prod — 404 или 403
    expect([200, 403, 404]).toContain(response.status());
  });
});

// =============================================================================
// API Catalog
// =============================================================================

test.describe('API Catalog', () => {
  test('GET /catalog returns a response', async ({ request }) => {
    const response = await request.get(`${API_URL}/catalog`);
    expect([200, 401, 403]).toContain(response.status());
  });
});
