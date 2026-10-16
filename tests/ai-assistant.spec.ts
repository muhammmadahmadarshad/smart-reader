import { test, expect } from '@playwright/test';
import { createTestAccount, uploadFixture } from './upload-fixture';

test('AI actions require a connection; selection, model switching and citations preserve reader state', async ({
  page,
}) => {
  await createTestAccount(page, `ai-ui-${Date.now()}@example.com`, 'A strong testing passphrase!');
  await page.goto('/library');
  await page.getByRole('button', { name: /Add a book/ }).click();
  await uploadFixture(page, 'artifacts/fixtures/text.pdf');
  await page.getByRole('link', { name: 'text', exact: true }).click();
  await expect(page.locator('.react-pdf__Page canvas')).toBeVisible();
  const bookId = new URL(page.url()).pathname.split('/').at(-2)!;
  const select = async () => {
    await page.evaluate(() => {
      const span = document.querySelector('.react-pdf__Page__textContent span')!;
      const range = document.createRange();
      range.selectNodeContents(span);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
  };
  await select();
  await page.getByRole('button', { name: 'Ask AI', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Explain', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add connection', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'AI assistant', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Question for AI' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Send question' })).toBeDisabled();
  // UI-only fixtures: native adapters, authorization, SQL and encryption are exercised in API tests.
  const connection = {
    id: 'fixture-connection',
    name: 'Test hosted',
    provider: 'compatible',
    baseUrl: 'https://test.example/v1',
    model: 'model-a',
    keySuffix: '1234',
    validation: 'VALID',
    validatedModels: ['model-a', 'model-b'],
    streaming: true,
    revision: 1,
  };
  const records: unknown[] = [];
  const sent: Record<string, any>[] = [];
  let indexRequests = 0;
  await page.route('**/api/ai/**', async (route) => {
    const path = new URL(route.request().url()).pathname,
      method = route.request().method();
    let data: unknown = {};
    if (path.endsWith('/capabilities'))
      data = {
        generation: true,
        streaming: true,
        embeddings: false,
        retrieval: false,
        connectionsEnabled: true,
        reason: null,
      };
    else if (path.endsWith('/connections')) data = [connection];
    else if (path.endsWith('/preferences'))
      data = { connectionId: connection.id, model: 'model-a' };
    else if (path.endsWith('/index')) {
      indexRequests++;
      data = {
        status: 'NOT_PREPARED',
        ready: false,
        available: false,
        reason: 'Project embedding service is not configured.',
        totalPages: 3,
        pagesProcessed: 0,
        chunksEmbedded: 0,
        totalChunks: 0,
        coverage: {},
      };
    } else if (path.endsWith('/conversations'))
      data =
        method === 'POST'
          ? { id: 'conversation', title: 'New conversation' }
          : [{ id: 'conversation', title: 'Selection discussion' }];
    else if (path.endsWith('/conversations/conversation')) data = records;
    else if (path.endsWith('/messages')) {
      const input = route.request().postDataJSON();
      sent.push(input);
      const item = {
        ...input,
        id: crypto.randomUUID(),
        provider: 'compatible',
        answer:
          'A supported answer [S1]. <script>window.untrusted=true</script> ![remote](https://tracker.invalid/image)',
        status: 'COMPLETED',
        createdAt: new Date().toISOString(),
        citations: [
          {
            id: 'S1',
            excerpt: 'Unique phrase chapter3',
            source: {
              sourceType: 'BOOK_TEXT',
              bookId,
              documentVersion: bookId,
              sourceTitle: 'text',
              pages: { first: 3, last: 3 },
            },
          },
        ],
      };
      records.push(item);
      await route.fulfill({
        contentType: 'application/x-ndjson',
        body:
          [
            { type: 'status', status: 'Generating answer' },
            { type: 'text_delta', text: 'A supported answer' },
            { type: 'result', message: item },
          ]
            .map((x) => JSON.stringify(x))
            .join('\n') + '\n',
      });
      return;
    }
    await route.fulfill({ json: data });
  });
  await page.reload();
  await expect(page.locator('.react-pdf__Page canvas')).toBeVisible();
  await select();
  await page.getByRole('button', { name: 'Ask AI', exact: true }).click();
  await page.getByRole('button', { name: 'Explain in Urdu', exact: true }).click();
  const panel = page.getByRole('region', { name: 'AI book assistant' });
  await expect(panel.getByText('Original passage', { exact: false })).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'Question for AI' })).toHaveValue(
    'Explain this passage in Urdu.',
  );
  // Idle panels must not keep polling. Closing and reopening must preserve the draft.
  const idleRequests = indexRequests;
  await page.waitForTimeout(3500);
  expect(indexRequests).toBe(idleRequests);
  await panel.getByRole('textbox', { name: 'Question for AI' }).fill('My unsent question');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel.getByRole('textbox', { name: 'Question for AI' })).toHaveValue(
    'My unsent question',
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(panel.getByRole('textbox', { name: 'Question for AI' })).toHaveValue(
    'My unsent question',
  );
  await page.getByRole('button', { name: 'Close side panel', exact: true }).click();
  await expect(panel).not.toBeVisible();
  await page.getByRole('button', { name: 'Open side panel', exact: true }).click();
  await expect(panel.getByRole('textbox', { name: 'Question for AI' })).toHaveValue(
    'My unsent question',
  );
  await panel
    .getByRole('textbox', { name: 'Question for AI' })
    .fill('Explain this passage in Urdu.');
  await panel.getByRole('button', { name: 'Send question' }).click();
  await expect(panel.getByText('AI-generated', { exact: true })).toBeVisible();
  expect(sent[0].selection).toMatchObject({
    bookId,
    documentVersion: bookId,
    language: 'ur',
    anchors: { coordinateVersion: 2 },
  });
  expect(sent[0].selection.selectedText).toContain('A quiet forest');
  expect(sent[0].model).toBe('model-a');
  await panel.getByRole('button', { name: 'Change AI model' }).click();
  await page.getByRole('combobox', { name: 'Chat model' }).focus();
  await page.getByRole('combobox', { name: 'Chat model' }).press('ArrowDown');
  await page.getByText('model-b', { exact: true }).last().click();
  await panel.getByRole('button', { name: 'Change AI model' }).click();
  await panel.getByRole('textbox', { name: 'Question for AI' }).fill('Give another example.');
  await panel.getByRole('button', { name: 'Send question' }).click();
  await expect(panel.getByText('AI-generated', { exact: true })).toHaveCount(2);
  expect(sent[1].model).toBe('model-b');
  expect(sent[0].model).toBe('model-a');
  const composer = await panel.getByRole('textbox', { name: 'Question for AI' }).boundingBox();
  expect(composer!.y + composer!.height).toBeLessThan(page.viewportSize()!.height);
  await expect(panel.getByRole('button', { name: 'Send question' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/ui-reader-desktop.png', animations: 'disabled' });
  expect(await page.evaluate(() => 'untrusted' in window)).toBe(false);
  await expect(panel.locator('img')).toHaveCount(0);
  await panel
    .getByRole('button', { name: /S1.*Page 3/ })
    .first()
    .click();
  await expect(page.locator('.react-pdf__Page__textContent')).toContainText(
    'Unique phrase chapter3',
  );
  // A slow test-only stream exercises partial rendering and cancellation without a provider.
  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      if (String(input).endsWith('/messages') && options?.method === 'POST') {
        const encoder = new TextEncoder();
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ type: 'text_delta', text: 'An unfinished explanation' }) + '\n',
              ),
            );
            options.signal?.addEventListener(
              'abort',
              () => controller.error(new DOMException('Cancelled', 'AbortError')),
              { once: true },
            );
          },
        });
        return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson' } });
      }
      return originalFetch(input, options);
    };
  });
  await panel.getByRole('textbox', { name: 'Question for AI' }).fill('Explain a little more');
  await panel.getByRole('button', { name: 'Send question' }).click();
  await expect(panel.locator('.ai-draft')).toHaveText('An unfinished explanation');
  await panel.getByRole('button', { name: 'Cancel response' }).click();
  await expect(panel.getByText('Incomplete response', { exact: true })).toBeVisible();
  await expect(panel.locator('.ai-draft')).toHaveText('An unfinished explanation');
  await expect(panel.getByRole('textbox', { name: 'Question for AI' })).toHaveValue(
    'Explain a little more',
  );
  await panel.getByRole('button', { name: 'Use book-wide Q&A' }).click();
  await expect(panel.getByRole('textbox', { name: 'Question for AI' })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.locator('.ant-drawer').getByRole('region', { name: 'AI book assistant' }),
  ).toBeVisible();
  await expect(panel.getByText('AI-generated', { exact: true })).toHaveCount(2);
  await expect(panel.getByRole('button', { name: 'Change AI model' })).toContainText('model-b');
  const mobileComposer = await page.getByRole('textbox', { name: 'Question for AI' }).boundingBox();
  expect(mobileComposer!.y + mobileComposer!.height).toBeLessThan(844);
  await expect(page.locator('.ant-drawer-content-wrapper')).toHaveCSS('transform', 'none');
  await page.screenshot({ path: 'artifacts/ui-reader-mobile.png', animations: 'disabled' });
});

test('AI Settings keeps credentials in the form only and validates explicitly', async ({
  page,
}) => {
  await createTestAccount(
    page,
    `ai-settings-${Date.now()}@example.com`,
    'A strong testing passphrase!',
  );
  let saved: any;
  let validations = 0;
  await page.route('**/api/ai/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/capabilities')) {
      await route.fulfill({
        json: {
          generation: !!validations,
          connectionsEnabled: true,
          embeddings: false,
          retrieval: false,
        },
      });
      return;
    }
    if (path.endsWith('/validate')) {
      validations++;
      saved.validation = 'VALID';
      saved.validatedModels = [saved.model];
      await route.fulfill({ json: saved });
      return;
    }
    if (route.request().method() === 'POST') {
      const { apiKey, ...input } = route.request().postDataJSON();
      expect(apiKey).toBe('fixture-secret-1234');
      saved = {
        ...input,
        id: 'fixture',
        keySuffix: '1234',
        validation: 'UNVALIDATED',
        validatedModels: [],
        streaming: false,
      };
      await route.fulfill({ json: saved });
      return;
    }
    await route.fulfill({ json: saved ? [saved] : [] });
  });
  await page.goto('/ai-settings');
  await page.getByRole('button', { name: 'Add connection', exact: true }).click();
  await page.getByLabel('Connection name').fill('My model');
  await page.getByLabel('API key', { exact: false }).fill('fixture-secret-1234');
  await page.getByLabel('Default model', { exact: false }).fill('test-manual-model');
  await page.getByRole('button', { name: 'Save connection' }).click();
  await expect(page.getByText('UNVALIDATED', { exact: true })).toBeVisible();
  expect(validations).toBe(0);
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain('fixture-secret');
  await expect(page.locator('body')).not.toContainText('fixture-secret');
  await page.getByRole('button', { name: 'Validate model', exact: true }).click();
  await page.getByRole('button', { name: 'Validate connection', exact: true }).click();
  await expect(page.getByText('VALID', { exact: true })).toBeVisible();
  expect(validations).toBe(1);
});
