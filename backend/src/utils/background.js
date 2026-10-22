'use strict';
/** Deja terminar una promesa después de responder: waitUntil en Vercel; en un servidor normal basta con no esperarla. */
function runInBackground(promise) {
  const p = Promise.resolve(promise).catch((e) => console.error('[background]', e && e.message));
  if (process.env.VERCEL) {
    try { require('@vercel/functions').waitUntil(p); } catch (_) { /* sin waitUntil */ }
  }
  return p;
}
module.exports = { runInBackground };
