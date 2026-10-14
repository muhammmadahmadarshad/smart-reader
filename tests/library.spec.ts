import { test, expect } from '@playwright/test';
import { uploadFixture } from './upload-fixture';
test('upload, grid/list, search, rename, private file opening and delete', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Email address').fill(`library-${Date.now()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('A long library passphrase!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My library' })).toBeVisible();
  await page.getByRole('button', { name: /Add a book/ }).click();
  await uploadFixture(page, 'artifacts/fixtures/text.pdf');
  await expect(page.getByRole('link', { name: 'text', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Actions for text', exact: true }).click();
  await page.getByText('Rename', { exact: true }).click();
  await page.getByLabel('Book title').fill('The quiet forest');
  await page.getByRole('button', { name: 'Save title' }).click();
  await expect(page.getByRole('link', { name: 'The quiet forest' })).toBeVisible();
  await page.getByText('List view', { exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByLabel('Search books').fill('no match here');
  await expect(page.getByRole('heading', { name: 'No matching books' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByRole('link', { name: 'The quiet forest' })).toBeVisible();
  await page.getByText('Grid view', { exact: true }).click();
  await page.screenshot({ path: 'artifacts/library-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/library-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Actions for The quiet forest' }).click();
  await page.getByRole('menuitem', { name: /Delete/ }).click();
  await page.getByRole('button', { name: 'Delete book', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Every library starts with one book' }),
  ).toBeVisible();
});
