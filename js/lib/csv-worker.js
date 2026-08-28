/**
 * EDMGLAB — CSV parsing worker
 *
 * A module worker, so it can import the same parsing core the main thread
 * uses. There is one parser in this codebase, not two.
 *
 * Why off the main thread at all: a long cycling run exports hundreds of
 * thousands of rows, and parsing that on the main thread freezes the interface
 * for seconds — during which the progress bar you added to reassure the user
 * cannot repaint. The work belongs somewhere the UI is not.
 *
 * csv.js falls back to main-thread parsing if this fails to construct, so an
 * environment without module-worker support still imports files.
 */

import { parse } from './csv-core.js';

self.addEventListener('message', (e) => {
  const { id, text, profiles, override } = e.data || {};
  try {
    const result = parse(text, profiles, override || {}, (p) => {
      self.postMessage({ id, type: 'progress', value: p });
    });
    self.postMessage({ id, type: 'done', result });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err?.message || String(err) });
  }
});
