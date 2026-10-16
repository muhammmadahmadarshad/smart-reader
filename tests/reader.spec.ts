import { test, expect, Page } from '@playwright/test';
import { createTestAccount, uploadFixture } from './upload-fixture';

async function upload(page: Page, name: string) {
  await page.getByRole('button', { name: /Add a book/ }).click();
  await uploadFixture(page, `artifacts/fixtures/${name}.pdf`);
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.locator('.react-pdf__Page canvas')).toBeVisible({ timeout: 30000 });
}
async function pageNumber(page: Page, number: number) {
  const input = page.getByRole('spinbutton', { name: 'Page number' });
  await input.fill(String(number));
  await input.press('Enter');
  await expect(page.locator(`.react-pdf__Page[data-page-number="${number}"] canvas`)).toBeVisible();
}

test('text PDF: selection, navigation, zoom, outline, search, bookmarks and restored position', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await createTestAccount(page, `reader-${Date.now()}@example.com`, 'A secure reader passphrase!');
  await page.goto('/library');
  await upload(page, 'text');
  await expect(page.locator('.react-pdf__Page')).toHaveCount(1);
  await expect(page.locator('.react-pdf__Page__textContent')).toContainText('A quiet forest');
  const heading = page
    .locator('.react-pdf__Page__textContent span')
    .filter({ hasText: 'A quiet forest' })
    .first();
  await heading.scrollIntoViewIfNeeded();
  const bounds = (await heading.boundingBox())!;
  await page.mouse.move(bounds.x + 1, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 1, bounds.y + bounds.height / 2, {
    steps: 15,
  });
  await expect(page.getByRole('button', { name: 'Highlight selection', exact: true })).toHaveCount(
    0,
  );
  await page.mouse.up();
  const selected = await page.evaluate(() => window.getSelection()?.toString());
  expect(selected).toContain('A quiet forest');
  await page.getByRole('button', { name: 'Highlight selection', exact: true }).click();
  await expect(page.locator('.saved-highlight').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('.saved-highlight').first()).toBeVisible({ timeout: 30000 });
  const highlightRect = await page.locator('.saved-highlight').first().boundingBox();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect
    .poll(async () => (await page.locator('.saved-highlight').first().boundingBox())!.width)
    .toBeGreaterThan(highlightRect!.width);
  await page.getByRole('button', { name: 'Notes and highlights', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toContainText('A quiet forest');
  await page.screenshot({ path: 'artifacts/reader-highlights.png', fullPage: true });
  await page.getByRole('button', { name: /Delete annotation A quiet forest/ }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.saved-highlight')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close side panel', exact: true }).click();
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.react-pdf__Page[data-page-number="2"] canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Previous page', exact: true }).click();
  await pageNumber(page, 2);
  const before = await page
    .locator('.react-pdf__Page canvas')
    .evaluate((e) => e.getBoundingClientRect().width);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect
    .poll(() =>
      page.locator('.react-pdf__Page canvas').evaluate((e) => e.getBoundingClientRect().width),
    )
    .toBeGreaterThan(before);
  await page.getByRole('combobox', { name: 'Page zoom' }).press('ArrowDown');
  await page.getByRole('option', { name: 'Fit to page', exact: true }).click();
  await page.getByRole('button', { name: 'Bookmark this page', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Page bookmarked', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open side panel', exact: true }).click();
  await page.getByRole('tab', { name: 'Navigate', exact: true }).click();
  await page.getByRole('tab', { name: 'Bookmarks', exact: true }).click();
  await page.getByRole('button', { name: 'Rename bookmark Page 2' }).click();
  await page.getByLabel('Bookmark name').fill('Return to the forest');
  await page.getByRole('button', { name: 'Save bookmark', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Return to the forest', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Outline', exact: true }).click();
  await page.getByText('Second chapter', { exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Page number' })).toHaveValue('2');
  await page.getByRole('tab', { name: 'Search', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search this PDF' }).fill('chapter3');
  await page.getByRole('searchbox', { name: 'Search this PDF' }).press('Enter');
  await expect(page.getByText('1 matches', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next match', exact: true }).click();
  await expect(page.locator('.react-pdf__Page[data-page-number="3"] canvas')).toBeVisible();
  await expect(page.getByText('Position saved', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/reader-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Return to library', exact: true }).click();
  await expect(page.getByText('Page 3 of 3', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'text', exact: true }).click();
  await expect(page.locator('.react-pdf__Page[data-page-number="3"] canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Open side panel', exact: true }).click();
  await page.getByRole('button', { name: 'Return to the forest', exact: true }).click();
  await expect(page.locator('.react-pdf__Page[data-page-number="2"] canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Remove bookmark Return to the forest' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bookmark this page', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('combobox', { name: 'Page zoom' }).press('ArrowDown');
  await page.getByRole('option', { name: 'Fit to width', exact: true }).click();
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.react-pdf__Page[data-page-number="3"] canvas')).toBeVisible();
  await page.screenshot({ path: 'artifacts/reader-mobile.png', fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});

test('scanned and 500-page documents render one page; search is progressive and cancellable', async ({
  page,
}) => {
  test.setTimeout(120000);
  await createTestAccount(page, `large-${Date.now()}@example.com`, 'A secure reader passphrase!');
  await page.goto('/library');
  await upload(page, 'scanned');
  await expect(page.getByText('No selectable text on this page', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/reader-scanned.png', fullPage: true });
  await page.getByRole('button', { name: 'Open side panel', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Outline', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Search', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search this PDF' }).fill('chapter');
  await page.getByRole('searchbox', { name: 'Search this PDF' }).press('Enter');
  await expect(
    page.getByText('This document has no selectable text.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Return to library', exact: true }).click();
  await upload(page, 'large');
  await pageNumber(page, 499);
  await expect(page.locator('.react-pdf__Page')).toHaveCount(1);
  await expect(page.locator('.react-pdf__Page__textContent')).toContainText('chapter499');
  await page.getByRole('button', { name: 'Open side panel', exact: true }).click();
  await page.getByRole('tab', { name: 'Search', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search this PDF' }).fill('not-present');
  await page.getByRole('searchbox', { name: 'Search this PDF' }).press('Enter');
  await page.getByRole('button', { name: 'Cancel search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel search', exact: true })).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search this PDF' }).fill('chapter500');
  await page.getByRole('searchbox', { name: 'Search this PDF' }).press('Enter');
  await expect(page.getByText('1 matches', { exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Next match', exact: true }).click();
  await expect(page.locator('.react-pdf__Page[data-page-number="500"] canvas')).toBeVisible();
  await expect(page.locator('.react-pdf__Page')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await page.screenshot({ path: 'artifacts/reader-large.png', fullPage: true });
});
