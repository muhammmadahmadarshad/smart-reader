import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const PDF_EXTRACTOR = Symbol('PDF_EXTRACTOR');
export interface PdfExtractor {
  open(
    data: Uint8Array,
  ): Promise<{ count: number; page(number: number): Promise<string>; close(): Promise<void> }>;
}
type Reply = { id: number; count?: number; text?: string; error?: boolean };
/** A bounded local parser subprocess isolates PDF.js/native dependencies from the API process. */
@Injectable()
export class PdfTextExtractor implements PdfExtractor {
  async open(data: Uint8Array) {
    const program = `
      process.on('disconnect',()=>process.exit(0));
      process.once('message',async workerData=>{
        try {
          const pdfjs=await import(workerData.module);
          const doc=await pdfjs.getDocument({data:workerData.data,isEvalSupported:false,useSystemFonts:false,disableFontFace:true,verbosity:0}).promise;
          process.on('message',async({id,page,close})=>{
            if(close){await doc.destroy();process.exit(0);return;}
            let source;
            try {
              source=await doc.getPage(page);const content=await source.getTextContent();
              // Stored offsets refer to this normalized representation, never original PDF bytes.
              const text=content.items.map(item=>'str' in item?item.str+(item.hasEOL?'\\n':' '):'').join('');
              if(Buffer.byteLength(text)>10000000)throw new Error();
              process.send({id,text});
            } catch { process.send({id,error:true}); } finally { source?.cleanup(); }
          });
          process.send({id:0,count:doc.numPages});
        } catch { process.send({id:0,error:true}); }
      });
    `;
    const worker = spawn(process.execPath, ['--max-old-space-size=256', '-e', program], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      serialization: 'advanced',
      windowsHide: true,
      // PDF parsing does not need application, user, storage or project credentials.
      env: {
        SystemRoot: process.env.SystemRoot,
        PATH: process.env.PATH,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
      },
    });
    let sequence = 0,
      closed = false;
    const pending = new Map<
      number,
      { resolve: (value: Reply) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
    >();
    const fail = () => {
      closed = true;
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error('PDF extraction exceeded limits or failed.'));
      }
      pending.clear();
    };
    worker.on('error', fail);
    worker.on('exit', fail);
    worker.on('message', (result: Reply) => {
      const entry = pending.get(result.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(result.id);
      if (result.error) entry.reject(new Error('Page extraction failed.'));
      else entry.resolve(result);
    });
    const wait = (id: number) =>
      new Promise<Reply>((resolve, reject) => {
        if (closed) {
          reject(new Error('PDF extraction process unavailable.'));
          return;
        }
        const timer = setTimeout(() => {
          fail();
          worker.kill();
        }, 30000);
        pending.set(id, { resolve, reject, timer });
      });
    const send = (message: object) => {
      if (!closed)
        worker.send(message, (error) => {
          if (error) fail();
        });
    };
    const close = async () => {
      if (worker.exitCode !== null || worker.signalCode !== null) return;
      await new Promise<void>((done) => {
        const timer = setTimeout(() => worker.kill(), 3000);
        worker.once('exit', () => {
          clearTimeout(timer);
          done();
        });
        if (worker.connected) send({ close: true });
        else worker.kill();
      });
      fail();
    };
    try {
      const ready = wait(0);
      send({
        module: pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href,
        data,
      });
      const { count } = await ready;
      return {
        count: count!,
        page: async (page: number) => {
          const id = ++sequence,
            result = wait(id);
          send({ id, page });
          return (await result).text!;
        },
        close,
      };
    } catch (error) {
      worker.kill();
      fail();
      throw error;
    }
  }
}
