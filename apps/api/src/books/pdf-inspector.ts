import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { Worker } from 'node:worker_threads';

export function validateUpload(
  file: Express.Multer.File | undefined,
  maxBytes: number,
): asserts file is Express.Multer.File {
  if (!file) throw new BadRequestException('Choose a PDF to upload.');
  if (file.size > maxBytes)
    throw new PayloadTooLargeException(
      `PDF must be ${Math.floor(maxBytes / 1048576)} MB or smaller.`,
    );
  if (
    !/\.pdf$/i.test(file.originalname) ||
    file.mimetype !== 'application/pdf' ||
    file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
  ) {
    throw new BadRequestException(
      'Only valid PDF files with a .pdf extension and application/pdf content type are accepted.',
    );
  }
}

// Parse untrusted PDFs away from the HTTP event loop, with bounded execution time.
export type PdfMetadata = { pages: number; boxes: number[][] };
export function inspectPdf(buffer: Buffer): Promise<PdfMetadata> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      `
      const { parentPort, workerData } = require('node:worker_threads');
      (async () => {
        const { PDFDocument } = require(workerData.module);
        try {
          const pdf = await PDFDocument.load(new Uint8Array(workerData.data), {
            updateMetadata: false, throwOnInvalidObject: true,
          });
          const boxes = pdf.getPages().map(page => {
            const media = page.getMediaBox(), crop = page.getCropBox();
            const x = Math.max(media.x, crop.x), y = Math.max(media.y, crop.y);
            const right = Math.min(media.x + media.width, crop.x + crop.width);
            const top = Math.min(media.y + media.height, crop.y + crop.height);
            return right > x && top > y
              ? [x, y, right, top]
              : [media.x, media.y, media.x + media.width, media.y + media.height];
          });
          parentPort.postMessage({ pages: pdf.getPageCount(), boxes });
        }
        catch (error) { parentPort.postMessage({ error: /encrypted/i.test(error.message) ? 'EncryptedPDFError' : error.name }); }
      })().catch(() => parentPort.postMessage({ error: 'InvalidPDFException' }));
    `,
      {
        eval: true,
        workerData: { module: require.resolve('pdf-lib'), data: buffer },
        resourceLimits: { maxOldGenerationSizeMb: 192 },
      },
    );
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(
        new BadRequestException(
          'This PDF took too long to process. Try a smaller or repaired document.',
        ),
      );
    }, 20000);
    const finish = () => {
      clearTimeout(timer);
      void worker.terminate();
    };
    worker.once('message', (result: { pages?: number; boxes?: number[][]; error?: string }) => {
      finish();
      if (result.pages && result.pages > 0 && result.boxes)
        resolve({ pages: result.pages, boxes: result.boxes });
      else
        reject(
          new BadRequestException(
            result.error === 'EncryptedPDFError'
              ? 'Password-protected PDFs are not supported. Upload an unlocked copy.'
              : 'This PDF is corrupted or unsupported. Try another copy.',
          ),
        );
    });
    worker.once('error', () => {
      finish();
      reject(new BadRequestException('This PDF could not be processed. Try another copy.'));
    });
    worker.once('exit', (code) => {
      if (code !== 0) {
        clearTimeout(timer);
        reject(
          new BadRequestException('This PDF could not be processed within the resource limit.'),
        );
      }
    });
  });
}
