import { test, expect, type Page } from '@playwright/test';
import { createTestAccount, uploadFixture } from './upload-fixture';
const headers = { Origin: 'http://localhost:5184', 'X-Kevnex-Request': '1' };
async function openBook(page: Page, fixture: string) {
  await createTestAccount(
    page,
    `notes-${Date.now()}-${Math.random()}@example.com`,
    'A strong reader passphrase!',
  );
  await page.goto('/library');
  await page.getByRole('button', { name: /Add a book/ }).click();
  await uploadFixture(page, `artifacts/fixtures/${fixture}.pdf`);
  await page.getByRole('link', { name: fixture, exact: true }).click();
  await expect(page.locator('.react-pdf__Page canvas')).toBeVisible();
  return page.url().split('/').at(-2)!;
}
async function selectLines(page: Page, start: string, end = start) {
  await expect(page.locator('.react-pdf__Page__textContent')).toContainText(start);
  await page.evaluate(
    ({ start, end }) => {
      const spans = Array.from(document.querySelectorAll('.react-pdf__Page__textContent span'));
      const first = spans.find((el) => el.textContent === start)!,
        last = spans.find((el) => el.textContent === end)!;
      const range = document.createRange();
      range.setStart(first.firstChild!, 0);
      range.setEnd(last.firstChild!, last.textContent!.length);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    },
    { start, end },
  );
  await expect(
    page.getByRole('button', { name: 'Highlight selection', exact: true }),
  ).toBeVisible();
}
async function go(page: Page, number: number) {
  await page.getByRole('spinbutton', { name: 'Page number' }).fill(String(number));
  await page.getByRole('spinbutton', { name: 'Page number' }).press('Enter');
  await expect(page.locator(`.react-pdf__Page[data-page-number="${number}"] canvas`)).toBeVisible();
}
async function capture(page: Page, path: string) {
  if (await page.locator('.ant-select-dropdown:visible').count())
    await page.locator('.reader-footer').click();
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);
  await expect
    .poll(() =>
      page.locator('.react-pdf__Page canvas').evaluate((element) => {
        const canvas = element as HTMLCanvasElement;
        const pixels = canvas
          .getContext('2d')!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        let dark = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 0 && pixels[i] < 180) dark++;
        return dark;
      }),
    )
    .toBeGreaterThan(20);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
}
async function aligned(page: Page, text: string) {
  await expect
    .poll(async () =>
      page.evaluate((text) => {
        const span = Array.from(
          document.querySelectorAll('.react-pdf__Page__textContent span'),
        ).find((el) => el.textContent === text);
        const overlay = document.querySelector('.saved-highlight');
        if (!span || !overlay) return 10000;
        const range = document.createRange();
        range.selectNodeContents(span);
        const a = range.getBoundingClientRect(),
          b = overlay.getBoundingClientRect();
        return Math.max(
          Math.abs(a.x - b.x),
          Math.abs(a.y - b.y),
          Math.abs(a.width - b.width),
          Math.abs(a.height - b.height),
        );
      }, text),
    )
    .toBeLessThan(2);
}
test('multiline selection survives toolbar focus, reopening, zoom, sidebar and passage navigation', async ({
  page,
}) => {
  const book = await openBook(page, 'text');
  const first = 'Page 1. Make time for a good book and a little quiet. Line 1.';
  await selectLines(page, first, 'Page 1. Make time for a good book and a little quiet. Line 3.');
  await page.getByRole('button', { name: 'Sage highlight color' }).click();
  await page.getByRole('button', { name: 'Add a note', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Personal note' })
    .fill('A personal multiline reflection');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.saved-highlight')).toHaveCount(3);
  const saved = (await (await page.request.get(`/api/books/${book}/annotations`)).json()).items[0];
  expect(saved.coordinateVersion).toBe(2);
  expect(saved.segments[0].rectangles).toHaveLength(3);
  expect(saved.documentVersion).toBe(book);
  await aligned(page, first);
  await page.reload();
  await aligned(page, first);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await aligned(page, first);
  await page.getByRole('button', { name: 'Notes and highlights', exact: true }).click();
  await aligned(page, first);
  await expect(page.locator('.annotation-entry')).toContainText('A personal multiline reflection');
  await go(page, 2);
  await expect(page.locator('.saved-highlight')).toHaveCount(0);
  await page
    .locator('.annotation-entry')
    .getByRole('button', { name: /Page 1$/ })
    .click();
  await expect(page.locator('.annotation-emphasis').first()).toBeVisible();
  await aligned(page, first);
  await page.getByRole('combobox', { name: 'Page zoom' }).press('ArrowDown');
  await page.getByRole('option', { name: 'Fit to page', exact: true }).click();
  await aligned(page, first);
  await page.setViewportSize({ width: 1100, height: 780 });
  await aligned(page, first);
  await capture(page, 'artifacts/phase4-multiline.png');
  await page.getByRole('button', { name: /Edit annotation/ }).click();
  await page.getByRole('button', { name: 'Rose highlight color' }).click();
  await page.getByRole('button', { name: 'Remove attached note' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.annotation-entry')).not.toContainText(
    'A personal multiline reflection',
  );
  await page.reload();
  await aligned(page, first);
  const updated = await (
    await page.request.get(`/api/books/${book}/annotations/${saved.id}`)
  ).json();
  expect(updated.color).toBe('#ECCBD3');
  expect(updated.noteText).toBeNull();
});
test('failed create response is retried once without duplicates; conflicts preserve drafts; standalone notes work on scans', async ({
  page,
}) => {
  const book = await openBook(page, 'scanned');
  await expect(page.getByText('No selectable text on this page', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New book note', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Personal note' })
    .fill('Do not lose this draft <script>alert(1)</script>');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => history.back());
  const navigationWarning = page.getByRole('dialog', { name: 'Leave without saving your note?' });
  await expect(navigationWarning).toBeVisible();
  await navigationWarning.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByRole('textbox', { name: 'Personal note' })).toHaveValue(
    'Do not lose this draft <script>alert(1)</script>',
  );
  let failed = false;
  await page.route(`**/api/books/${book}/annotations`, async (route) => {
    if (route.request().method() === 'POST' && !failed) {
      failed = true;
      const response = await route.fetch();
      expect(response.ok()).toBeTruthy();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Save failed. Your draft is preserved.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Personal note' })).toHaveValue(
    'Do not lose this draft <script>alert(1)</script>',
  );
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.unrouteAll();
  const list = await (await page.request.get(`/api/books/${book}/annotations`)).json();
  expect(list.total).toBe(1);
  const item = list.items[0];
  expect(item.segments).toBeNull();
  await page.getByRole('button', { name: 'Notes and highlights', exact: true }).click();
  await expect(page.locator('.annotation-entry')).toContainText('Standalone book note');
  await expect(page.locator('.annotation-entry')).not.toContainText('Page ');
  await page.getByRole('button', { name: 'Edit annotation book note' }).click();
  await page.getByRole('textbox', { name: 'Personal note' }).fill('My local draft');
  expect(
    (
      await page.request.patch(`/api/books/${book}/annotations/${item.id}`, {
        headers,
        data: { version: 1, noteText: 'Other tab changed this' },
      })
    ).ok(),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Personal note' })).toHaveValue('My local draft');
  await page.getByRole('button', { name: 'Load latest version' }).click();
  await expect(page.getByText('Other tab changed this', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keep my draft and use latest version' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.annotation-entry')).toContainText('My local draft');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.ant-drawer')).toBeVisible();
  await capture(page, 'artifacts/phase4-scanned-mobile.png');
  await page.getByRole('button', { name: 'Delete annotation book note' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.annotation-entry')).toHaveCount(0);
});
for (const fixture of ['rotated', 'multicolumn'])
  test(`${fixture}: PDF coordinate alignment across rotations, crop box, sizes and page remounts`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const book = await openBook(page, fixture);
    for (const number of fixture === 'rotated' ? [1, 2, 3, 4] : [1, 2]) {
      await go(page, number);
      await selectLines(page, 'Left column passage 1');
      await page.getByRole('button', { name: 'Highlight selection', exact: true }).click();
      await aligned(page, 'Left column passage 1');
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      await aligned(page, 'Left column passage 1');
      await page.getByRole('combobox', { name: 'Page zoom' }).press('ArrowDown');
      await page.getByRole('option', { name: 'Fit to page', exact: true }).click();
      await aligned(page, 'Left column passage 1');
      await capture(page, `artifacts/phase4-${fixture}-${number}.png`);
    }
    await go(page, 1);
    await aligned(page, 'Left column passage 1');
    await page.reload();
    await go(page, 1);
    await aligned(page, 'Left column passage 1');
    if (fixture === 'multicolumn') {
      await selectLines(page, 'Left column passage 1', 'Right column passage 3');
      await page.getByRole('button', { name: 'Highlight selection', exact: true }).click();
      await expect(page.locator('.saved-highlight')).toHaveCount(7);
      const all = (
        await (await page.request.get(`/api/books/${book}/annotations?documentPage=1`)).json()
      ).items;
      expect(all).toHaveLength(2);
      const multi = all.find(
        (a: { segments: { rectangles: unknown[] }[] }) => a.segments[0].rectangles.length === 6,
      );
      expect(
        multi.segments[0].rectangles.every((r: { width: number }) => r.width < 250),
      ).toBeTruthy();
      const box = (await page.locator('.saved-highlight').first().boundingBox())!;
      await page.mouse.click(box.x + 5, box.y + 5);
      await expect(page.getByRole('dialog', { name: 'Overlapping highlights' })).toBeVisible();
    }
  });
test('selection outside the page and Escape create nothing', async ({ page }) => {
  const book = await openBook(page, 'text');
  await selectLines(page, 'A quiet forest - Chapter 1');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Highlight selection', exact: true })).toHaveCount(
    0,
  );
  await page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('.reader-title')!);
    window.getSelection()!.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await expect(page.getByRole('button', { name: 'Highlight selection', exact: true })).toHaveCount(
    0,
  );
  expect((await (await page.request.get(`/api/books/${book}/annotations`)).json()).total).toBe(0);
});

test('retrying a quick highlight after a lost response preserves its create key', async ({
  page,
}) => {
  const book = await openBook(page, 'text');
  await selectLines(page, 'A quiet forest - Chapter 1');
  let lost = false;
  await page.route(`**/api/books/${book}/annotations`, async (route) => {
    if (route.request().method() === 'POST' && !lost) {
      lost = true;
      expect((await route.fetch()).ok()).toBeTruthy();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Highlight selection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
  // A browser can emit another selectionchange while focus moves through the popover.
  await page.evaluate(() => document.dispatchEvent(new Event('selectionchange')));
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.locator('.saved-highlight')).toHaveCount(1);
  await page.unrouteAll();
  expect((await (await page.request.get(`/api/books/${book}/annotations`)).json()).total).toBe(1);
});

test('annotation panel searches, filters and paginates a long list', async ({ page }) => {
  const book = await openBook(page, 'text');
  for (let i = 0; i < 22; i++) {
    const response = await page.request.post(`/api/books/${book}/annotations`, {
      headers,
      data: { clientRequestId: crypto.randomUUID(), kind: 'NOTE', noteText: `Notebook entry ${i}` },
    });
    expect(response.ok()).toBeTruthy();
  }
  await selectLines(page, 'A quiet forest - Chapter 1');
  await page.getByRole('button', { name: 'Peach highlight color' }).click();
  await page.getByRole('button', { name: 'Highlight selection', exact: true }).click();
  await page.getByRole('button', { name: 'Notes and highlights', exact: true }).click();
  await expect(page.locator('.annotation-entry')).toHaveCount(20);
  await page.locator('.ant-pagination-next button').click();
  await expect(page.locator('.annotation-entry')).toHaveCount(3);
  await page.getByRole('searchbox', { name: 'Search annotations' }).fill('entry 21');
  await page.getByRole('searchbox', { name: 'Search annotations' }).press('Enter');
  await expect(page.locator('.annotation-entry')).toHaveCount(1);
  await expect(page.locator('.annotation-entry')).toContainText('Notebook entry 21');
  await page.getByRole('searchbox', { name: 'Search annotations' }).fill('');
  await page.getByRole('searchbox', { name: 'Search annotations' }).press('Enter');
  await page.getByRole('combobox', { name: 'Filter highlight color' }).click();
  await page.getByText('Peach', { exact: true }).click();
  await expect(page.locator('.annotation-entry')).toHaveCount(1);
  await expect(page.locator('.annotation-entry')).toContainText('A quiet forest');
  await page.locator('.ant-segmented').getByText('Notes', { exact: true }).click();
  await expect(
    page.getByText('No annotations found. Select a passage or create a book note.'),
  ).toBeVisible();
});
