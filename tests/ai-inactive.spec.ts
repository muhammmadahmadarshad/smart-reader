import { test, expect } from '@playwright/test';
import { createTestAccount, uploadFixture } from './upload-fixture';

test('AI remains absent from library, reader, selection toolbar and notes', async ({ page }) => {
  const aiRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/ai\//.test(request.url())) aiRequests.push(request.url());
  });
  await createTestAccount(
    page,
    `ai-inactive-${Date.now()}@example.com`,
    'A strong testing passphrase!',
  );
  await page.goto('/library');
  const absent = async () => {
    await expect(
      page.getByRole('button', {
        name: /ask ai|ai settings|explain|translate|give example|coming soon|chat/i,
      }),
    ).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: /ask|chat|question/i })).toHaveCount(0);
    await expect(page.getByRole('complementary', { name: /ai|chat/i })).toHaveCount(0);
  };
  await absent();
  await page.getByRole('button', { name: /Add a book/ }).click();
  await uploadFixture(page, 'artifacts/fixtures/text.pdf');
  await page.getByRole('link', { name: 'text', exact: true }).click();
  await expect(page.locator('.react-pdf__Page canvas')).toBeVisible();
  await absent();
  await expect(page.locator('.react-pdf__Page__textContent')).toContainText('A quiet forest');
  await page.evaluate(() => {
    const span = document.querySelector('.react-pdf__Page__textContent span')!;
    const range = document.createRange();
    range.selectNodeContents(span);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await expect(
    page.getByRole('button', { name: 'Highlight selection', exact: true }),
  ).toBeVisible();
  await absent();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Notes and highlights', exact: true }).click();
  await absent();
  expect(aiRequests).toEqual([]);
});
