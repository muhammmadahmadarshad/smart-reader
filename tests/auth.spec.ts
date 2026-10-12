import { test, expect } from '@playwright/test';
test('signup, refresh, profile logout and protected navigation', async ({ page }) => {
  const email = `browser-${Date.now()}@example.com`;
  await page.goto('/library');
  await expect(page).toHaveURL(/login/);
  await page.getByRole('link', { name: 'Create an account' }).click();
  await expect(page.getByRole('heading', { name: 'Make room for a good book' })).toBeVisible();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('A very readable passphrase!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/library/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My library' })).toBeVisible();
  await page.getByRole('button', { name: 'Open profile menu' }).click();
  await page.getByText('Log out', { exact: true }).click();
  await expect(page).toHaveURL(/login/);
  await page.goto('/library');
  await expect(page).toHaveURL(/login/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/auth-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Find your way back' })).toBeVisible();
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('If an account exists', { exact: false })).toBeVisible();
  const inbox = await fetch('http://localhost:8025/api/v1/messages').then((r) => r.json());
  const mail = inbox.messages.find((m: { To: { Address: string }[] }) =>
    m.To.some((to) => to.Address === email),
  );
  const detail = await fetch(`http://localhost:8025/api/v1/message/${mail.ID}`).then((r) =>
    r.json(),
  );
  const link = detail.Text.match(/http:\/\/localhost:5173\/reset-password#token=[a-f0-9]+/)[0];
  await page.goto(link);
  await page.getByLabel('Password', { exact: true }).fill('A newly remembered passphrase!');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Password updated.', { exact: false })).toBeVisible();
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('A newly remembered passphrase!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/library/);
});
