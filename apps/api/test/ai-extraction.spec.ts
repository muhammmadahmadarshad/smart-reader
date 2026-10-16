import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PdfTextExtractor } from '../src/ai/pdf-extractor';
describe('Production PDF.js extraction', () => {
  it('extracts first, middle and final pages and identifies an image-only PDF without AI calls', async () => {
    const extractor = new PdfTextExtractor();
    const results: string[][] = [];
    for (const file of ['text', 'scanned']) {
      const pdf = await extractor.open(
        new Uint8Array(readFileSync(resolve(`../../artifacts/fixtures/${file}.pdf`))),
      );
      try {
        const pages = [];
        for (let i = 1; i <= pdf.count; i++) pages.push(await pdf.page(i));
        results.push(pages);
      } finally {
        await pdf.close();
      }
    }
    const [text, scanned] = results;
    expect(text).toHaveLength(3);
    for (let i = 0; i < 3; i++) expect(text[i]).toContain(`Unique phrase chapter${i + 1}`);
    expect(scanned).toHaveLength(1);
    expect(scanned[0].trim()).toBe('');
  });
});
