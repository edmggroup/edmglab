/**
 * EDMGLAB — Import service (main-thread side)
 *
 * Owns the worker, falls back gracefully, and reads files. The view never
 * touches a Worker or a FileReader.
 *
 * ── ON WHERE THE DATA GOES ──
 * Nowhere. Files are read with the browser's own File API and parsed in this
 * tab. There is no upload, no request, no storage — closing the tab discards
 * everything. That is a property of the architecture (a static site with no
 * server to receive anything), not a promise in a privacy policy, and the
 * import view says so on screen because a researcher about to drop unpublished
 * data onto a web page is entitled to know before they do it.
 */

import { parse as parseSync } from './csv-core.js';

let worker = null;
let workerBroken = false;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./csv-worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (e) => {
      const { id, type } = e.data || {};
      const job = pending.get(id);
      if (!job) return;
      if (type === 'progress') { job.onProgress?.(e.data.value); return; }
      pending.delete(id);
      if (type === 'error') job.reject(new Error(e.data.message));
      else job.resolve(e.data.result);
    });
    worker.addEventListener('error', () => {
      // Whatever went wrong, the import must still work. Tear the worker down
      // and let every future parse take the synchronous path.
      workerBroken = true;
      for (const [, job] of pending) job.viaFallback?.();
      pending.clear();
      try { worker.terminate(); } catch { /* already gone */ }
      worker = null;
    });
  } catch {
    workerBroken = true;
    return null;
  }
  return worker;
}

/** True when parsing is happening off the main thread. Shown in the UI. */
export function usingWorker() { return !!worker && !workerBroken; }

/**
 * Parse text, off the main thread where possible.
 * @param {string} text
 * @param {object} profiles
 * @param {object} [override]
 * @param {function} [onProgress]
 */
export function parse(text, profiles, override = {}, onProgress = null) {
  const w = getWorker();
  if (!w) return Promise.resolve(parseSync(text, profiles, override, onProgress));

  const id = ++seq;
  return new Promise((resolve, reject) => {
    const viaFallback = () => resolve(parseSync(text, profiles, override, onProgress));
    pending.set(id, { resolve, reject, onProgress, viaFallback });
    try {
      w.postMessage({ id, text, profiles, override });
    } catch (e) {
      pending.delete(id);
      viaFallback();
    }
  });
}

/** Read a File as text, with progress. */
export function readFile(file, onProgress = null) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    fr.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    fr.onload = () => resolve(String(fr.result));
    fr.readAsText(file);
  });
}

/** Human file size. */
export function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export { series, stats, num } from './csv-core.js';
