import { expect, test, type Page } from '@playwright/test';

export async function createTestAccount(page: Page, email: string, password: string) {
  test.setTimeout(120000);
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await page.request.post('/api/auth/signup', {
      headers: { Origin: 'http://localhost:5184', 'X-Kevnex-Request': '1' },
      data: { email, password },
    });
    if (response.status() !== 429) {
      expect(response.status()).toBe(201);
      return;
    }
    const seconds = Math.max(1, Math.min(60, Number(response.headers()['retry-after']) || 60));
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }
  throw new Error('Test-account creation remained rate limited.');
}

// All browser workflows share loopback, so fixture uploads share the production IP limit.
// Exercise the real UI retry after 429; do not weaken the application guard or mock success.
export async function uploadFixture(page: Page, path: string) {
  test.setTimeout(120000);
  const input = page.locator('input[type=file]');
  for (let attempt = 0; attempt < 3; attempt++) {
    await expect(input).toBeEnabled();
    const completed = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/books',
    );
    await input.setInputFiles(path);
    const response = await completed;
    if (response.status() !== 429) {
      expect(response.status()).toBe(201);
      return;
    }
    const seconds = Math.max(1, Math.min(60, Number(response.headers()['retry-after']) || 60));
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    await input.setInputFiles([]);
  }
  throw new Error('Fixture upload remained rate limited after respecting Retry-After.');
}
