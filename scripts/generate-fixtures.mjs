import { PDFDocument, StandardFonts, rgb, PDFName, PDFString, degrees } from 'pdf-lib';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('artifacts/fixtures', { recursive: true });
async function textPdf(count, name) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= count; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`A quiet forest - Chapter ${i}`, {
      x: 55,
      y: 755,
      size: 24,
      font,
      color: rgb(0.1, 0.2, 0.15),
    });
    for (let line = 0; line < 18; line++)
      page.drawText(`Page ${i}. Make time for a good book and a little quiet. Line ${line + 1}.`, {
        x: 55,
        y: 700 - line * 27,
        size: 12,
        font,
      });
    page.drawText(`Unique phrase chapter${i}`, { x: 55, y: 140, size: 14, font });
  }
  if (name === 'text') {
    const root = doc.context.nextRef();
    const item = doc.context.nextRef();
    doc.context.assign(
      item,
      doc.context.obj({
        Title: PDFString.of('Second chapter'),
        Parent: root,
        Dest: [doc.getPage(1).ref, PDFName.of('Fit')],
      }),
    );
    doc.context.assign(
      root,
      doc.context.obj({ Type: 'Outlines', First: item, Last: item, Count: 1 }),
    );
    doc.catalog.set(PDFName.of('Outlines'), root);
  }
  await writeFile(`artifacts/fixtures/${name}.pdf`, await doc.save());
}
await textPdf(3, 'text');
await textPdf(500, 'large');
for (const name of ['multicolumn', 'rotated']) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < 4; index++) {
    const p = doc.addPage(index % 2 ? [700, 500] : [595, 842]);
    if (name === 'rotated') {
      p.setRotation(degrees(index * 90));
      if (index === 2) p.setCropBox(20, 30, 550, 780);
    }
    const top = p.getHeight() - 70;
    for (let line = 0; line < 9; line++) {
      p.drawText(`Left column passage ${line + 1}`, { x: 45, y: top - line * 26, size: 12, font });
      p.drawText(`Right column passage ${line + 1}`, {
        x: 325,
        y: top - line * 26,
        size: 12,
        font,
      });
    }
  }
  await writeFile(`artifacts/fixtures/${name}.pdf`, await doc.save());
}
const browser = await chromium.launch();
const page = await browser.newPage();
const png = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 595;
  canvas.height = 842;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 595, 842);
  ctx.fillStyle = '#222222';
  ctx.font = '28px Georgia';
  ctx.fillText('A scanned chapter', 55, 90);
  ctx.font = '17px Georgia';
  for (let i = 0; i < 12; i++)
    ctx.fillText('This page is an image of a printed book.', 55, 150 + i * 34);
  return canvas.toDataURL('image/png').split(',')[1];
});
await browser.close();
const scanned = await PDFDocument.create();
const img = await scanned.embedPng(Buffer.from(png, 'base64'));
scanned.addPage([595, 842]).drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
await writeFile('artifacts/fixtures/scanned.pdf', await scanned.save());
await writeFile('artifacts/fixtures/corrupt.pdf', '%PDF-1.7\nThis is not a valid document.');
console.log(
  'Created text (3 pages, outline), scanned (image only), large (500 pages), and corrupt PDF fixtures.',
);
