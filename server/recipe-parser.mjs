// Resource-limited worker: no document files are written to disk, no external fetches.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_CHARS = 60000;
let active = 0;

export async function extractRecipeDocument({ name, data }) {
  if (typeof name !== 'string' || name.length > 255 || typeof data !== 'string' || !/\.(pdf|docx)$/i.test(name)) throw new Error('Choose a PDF or DOCX recipe file.');
  if (!data || data.length > Math.ceil(MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new Error('Invalid file data or file larger than 5 MB.');
  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES) throw new Error('Each recipe file must be between 1 byte and 5 MB.');
  if (active >= 2) throw new Error('The document reader is busy. Please try again in a moment.');
  active++;
  try {
    return await new Promise((resolve, reject) => {
      const worker = new Worker(new URL(import.meta.url), { workerData: { name, buffer }, resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 } });
      let settled = false;
      const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); worker.terminate(); error ? reject(error) : resolve(result); };
      const timer = setTimeout(() => finish(new Error('Recipe parsing took too long. Try a smaller document or a text export.')), 25000);
      worker.once('message', value => finish(value.error ? new Error(value.error) : null, value));
      worker.once('error', () => finish(new Error('This document could not be parsed within the resource limit. Try a smaller document or a text export.')));
      worker.once('exit', () => { if (!settled) finish(new Error('Document reader stopped before finishing.')); });
    });
  } finally { active--; }
}

async function parseDocument({ name, buffer }) {
  const bytes = new Uint8Array(buffer);
  let text = '', pages;
  if (/\.pdf$/i.test(name)) {
    if (!Buffer.from(bytes.slice(0, 5)).toString().startsWith('%PDF-')) throw new Error('This file is not a valid PDF.');
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 });
    let pdf;
    try {
      pdf = await task.promise;
      pages = pdf.numPages;
      if (pages > 30) throw new Error('Attach a recipe excerpt of 30 pages or fewer.');
      for (let i = 1; i <= pages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.filter(item => typeof item.str === 'string').map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('') + '\n\n';
        page.cleanup();
        if (text.length > MAX_CHARS) throw new Error('Recipe text exceeds 60,000 characters. Attach a shorter excerpt.');
      }
    } catch (error) {
      if (error.name === 'PasswordException') throw new Error('This PDF is password protected. Attach an unlocked copy.');
      throw error;
    } finally { await task.destroy(); }
  } else {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('This file is not a valid DOCX document.');
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) }, { externalFileAccess: false });
    text = result.value;
  }
  text = text.trim();
  if (!text) throw new Error('No readable text found. Scanned/image-only recipes need a photo attachment instead.');
  if (text.length > MAX_CHARS) throw new Error('Recipe text exceeds 60,000 characters. Attach a shorter excerpt.');
  return { text, pages };
}

if (!isMainThread) {
  parseDocument(workerData).then(result => parentPort.postMessage(result)).catch(error => {
    const safe = /pages|characters|password|readable text|valid PDF|valid DOCX/i.test(error.message) ? error.message : 'Could not read this document. It may be damaged or unsupported; try exporting it to TXT.';
    parentPort.postMessage({ error: safe });
  });
}
