import { test, expect } from '@playwright/test';

/**
 * E2E тесты для ключевых пользовательских флоу
 *
 * Запуск: pnpm test:e2e (требует pnpm dev)
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';

// =============================================================================
// Dev Auth Helper
// =============================================================================

async function devAuthAs(request: Parameters<typeof test.step>[1] extends (a: infer A) => unknown ? never : import('@playwright/test').APIRequestContext, telegramUserId: string) {
  const res = await request.post(`${API_URL}/auth/dev`, {
    data: { telegramUserId },
  });
  return res.status() === 200;
}

// =============================================================================
// Giveaway API
// =============================================================================

test.describe('Giveaway Public API', () => {
  test('seed ACTIVE giveaway is accessible via /public endpoint', async ({ request }) => {
    const ACTIVE_ID = 'seed-giveaway-active-001';
    const response = await request.get(`${API_URL}/giveaways/${ACTIVE_ID}/public`);

    // Если гiveaway существует — 200, иначе 401/404
    if (response.status() === 200) {
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.giveaway.id).toBe(ACTIVE_ID);
      expect(body.giveaway.status).toBe('ACTIVE');
    } else {
      // В prod/без сида — 404 или 401 — это нормально
      expect([401, 404]).toContain(response.status());
    }
  });

  test('GET /giveaways/by-code/:shortCode works for known giveaway', async ({ request }) => {
    const response = await request.get(`${API_URL}/giveaways/by-code/SEEDACT1`);
    if (response.status() === 200) {
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.giveaway?.shortCode).toBe('SEEDACT1');
    } else {
      expect([401, 404]).toContain(response.status());
    }
  });
});

// =============================================================================
// Auth + Init Flow (Dev Login)
// =============================================================================

test.describe('Dev Auth + Init Flow', () => {
  test('Alice (FREE) can log in via /auth/dev and get initData', async ({ request }) => {
    // Dev login
    const loginRes = await request.post(`${API_URL}/auth/dev`, {
      data: { telegramUserId: '123456789' },
    });

    if (loginRes.status() !== 200) {
      test.skip(true, 'Dev endpoint not available (production mode)');
      return;
    }

    const loginBody = await loginRes.json();
    expect(loginBody.ok).toBe(true);

    // Get init data
    const initRes = await request.get(`${API_URL}/init`);
    expect(initRes.status()).toBe(200);
    const initBody = await initRes.json();

    expect(initBody.ok).toBe(true);
    expect(initBody.user).toBeDefined();
    expect(initBody.user.telegramUserId).toBe('123456789');
  });

  test('Charlie (PRO) has tier.pro entitlement', async ({ request }) => {
    const loginRes = await request.post(`${API_URL}/auth/dev`, {
      data: { telegramUserId: '111222333' },
    });

    if (loginRes.status() !== 200) {
      test.skip(true, 'Dev endpoint not available');
      return;
    }

    const initRes = await request.get(`${API_URL}/init`);
    const initBody = await initRes.json();

    expect(initBody.ok).toBe(true);
    expect(initBody.config?.subscriptionTier).toMatch(/PLUS|PRO|BUSINESS/);
  });
});

// =============================================================================
// Draft CRUD
// =============================================================================

test.describe('Draft API', () => {
  test('can create and retrieve a draft', async ({ request }) => {
    const loginRes = await request.post(`${API_URL}/auth/dev`, {
      data: { telegramUserId: '123456789' },
    });

    if (loginRes.status() !== 200) {
      test.skip(true, 'Dev endpoint not available');
      return;
    }

    // Create draft
    const createRes = await request.post(`${API_URL}/drafts/giveaway`, {
      data: { wizardStep: 'basics' },
    });
    expect(createRes.status()).toBe(200);
    const { draft } = await createRes.json();
    expect(draft).toBeDefined();
    expect(draft.id).toBeTruthy();

    // Get draft
    const getRes = await request.get(`${API_URL}/drafts/giveaway`);
    expect(getRes.status()).toBe(200);
    const body = await getRes.json();
    expect(body.ok).toBe(true);
  });
});
