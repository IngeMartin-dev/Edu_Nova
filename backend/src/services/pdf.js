'use strict';
/**
 * HTML -> PDF con Chromium (puppeteer-core) y pdf-lib. Sin Python.
 *  - En Vercel/AWS Lambda usa @sparticuz/chromium (Chromium empaquetado para serverless).
 *  - En local usa CHROME_PATH, o el Chrome/Chromium/Edge instalado en el equipo.
 *  - Boletín: se renderiza al tamaño de diseño (8.5x14 in) y cada página se reescala a CARTA (8.5x11 in).
 *    Si trae materias adicionales (.materia-ext-page) se parte en página 1 + hojas de materias + página 2.
 *  - Consolidado: Carta horizontal (11x8.5 in), 1:1.
 */
const fs = require('fs');
const path = require('path');
const env = require('../config/env');

const ORIG_W_IN = 8.5; const ORIG_H_IN = 14.0; // tamaño de render del diseño del boletín
const LETTER_W = 8.5 * 72; const LETTER_H = 11 * 72; // puntos
const CONSOLIDADO_W_IN = 11.0; const CONSOLIDADO_H_IN = 8.5;
const BLOCKS_POR_HOJA = 12; const ALTO_BLOQUE_PX = 92.16;
const PAD_TOP = 20; const PAD_BOTTOM = 4; const PAD_LEFT = 53.44; const PAD_RIGHT = 30.4;

const isServerless = () => Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV);

// ---------------------------------------------------------------------------
// Navegador (se reutiliza entre PDF y se cierra solo si queda inactivo)
// ---------------------------------------------------------------------------
function localChrome() {
  const fixed = [
    env.pdf.chromePath,
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  for (const f of fixed) { try { if (fs.statSync(f).isFile()) return f; } catch (_) { /* sigue */ } }
  // Chromium de Playwright (PLAYWRIGHT_BROWSERS_PATH o ruta por defecto)
  for (const root of [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean)) {
    try {
      for (const d of fs.readdirSync(root).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
        for (const rel of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
          const f = path.join(root, d, rel);
          if (fs.existsSync(f)) return f;
        }
      }
    } catch (_) { /* sigue */ }
  }
  return null;
}

let browserPromise = null;
let idleTimer = null;
let active = 0;

async function launch() {
  const pm = await import('puppeteer-core'); // paquete ESM: no se puede usar require() en Vercel
  const puppeteer = pm.default || pm;
  if (isServerless() && !env.pdf.chromePath) {
    const chromium = (await import('@sparticuz/chromium')).default; // paquete ESM
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: 'shell' });
  }
  const executablePath = localChrome();
  if (!executablePath) throw new Error('No se encontró Chrome/Chromium/Edge. Instálalo o define CHROME_PATH en .env');
  return puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
}

function getBrowser() {
  if (!browserPromise) {
    browserPromise = launch().then((b) => {
      b.on('disconnected', () => { browserPromise = null; });
      return b;
    }).catch((e) => { browserPromise = null; throw e; });
  }
  return browserPromise;
}

function scheduleClose() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (active > 0 || !browserPromise) return;
    const p = browserPromise; browserPromise = null;
    try { await (await p).close(); } catch (_) { /* ignora */ }
  }, 20 * 1000);
  idleTimer.unref();
}

/** Renderiza un HTML a PDF (Buffer) con el tamaño indicado. */
async function render(html, opts) {
  active += 1;
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
    const bytes = await page.pdf({ printBackground: true, ...opts });
    return Buffer.from(bytes);
  } finally {
    try { if (page) await page.close(); } catch (_) { /* ignora */ }
    active -= 1;
    scheduleClose();
  }
}

// ---------------------------------------------------------------------------
// Combinar páginas y reescalarlas a CARTA vertical (sin deformar, centradas, nunca agranda)
// ---------------------------------------------------------------------------
async function toLetter(buffers) {
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf);
    const embedded = await out.embedPdf(src, src.getPageIndices());
    embedded.forEach((ep, i) => {
      const { width: w, height: h } = src.getPage(i).getSize();
      const scale = Math.min(LETTER_W / w, LETTER_H / h, 1);
      const page = out.addPage([LETTER_W, LETTER_H]);
      page.drawPage(ep, { x: (LETTER_W - w * scale) / 2, y: (LETTER_H - h * scale) / 2, xScale: scale, yScale: scale });
    });
  }
  return Buffer.from(await out.save());
}

const designSize = (heightPx) => ({ width: `${ORIG_W_IN}in`, height: heightPx ? `${heightPx}px` : `${ORIG_H_IN}in` });

/** Si el boletín trae materias adicionales, lo parte en páginas; si no, devuelve null (modo simple). */
async function splitBoletin(htmlText) {
  if (!htmlText.includes('materia-ext-page')) return null;
  const cheerio = await import('cheerio');
  const $ = cheerio.load(htmlText);
  if (!$('.materia-ext-page').length) return null;
  const pageDivs = $('div.page').toArray();
  if (pageDivs.length < 2) return null;
  const blocks = $('.materia-block').toArray().filter((b) => !$(b).hasClass('materia-block--vacio'));
  if (!blocks.length) return null; // hasta 16 materias: documento completo

  const styleHtml = $('style').first().length ? $.html($('style').first()) : '';
  const scriptsHtml = $('script').toArray().map((s) => $.html(s)).join('');
  const wrap = (inner) => `<!DOCTYPE html><html><head><meta charset="utf-8">${styleHtml}<style>body{margin:0;padding:0;}</style></head><body>${inner}${scriptsHtml}</body></html>`;

  const jobs = [render(wrap($.html(pageDivs[0])), designSize())];
  for (let i = 0; i < blocks.length; i += BLOCKS_POR_HOJA) {
    const chunk = blocks.slice(i, i + BLOCKS_POR_HOJA);
    const alto = Math.ceil(PAD_TOP + chunk.length * ALTO_BLOQUE_PX + PAD_BOTTOM);
    const style = `width:816px;box-sizing:border-box;padding:${PAD_TOP}px ${PAD_RIGHT}px ${PAD_BOTTOM}px ${PAD_LEFT}px;font-family:'Times New Roman',Times,serif;position:relative;`;
    jobs.push(render(wrap(`<div style="${style}">${chunk.map((b) => $.html(b)).join('')}</div>`), designSize(alto)));
  }
  jobs.push(render(wrap($.html(pageDivs[1])), designSize()));
  return toLetter(await Promise.all(jobs));
}

// --- cola simple con concurrencia limitada ---
let running = 0;
const waiting = [];
const acquire = () => new Promise((resolve) => {
  if (running < env.pdf.concurrency) { running += 1; resolve(); } else waiting.push(resolve);
});
const release = () => {
  const next = waiting.shift();
  if (next) next(); else running -= 1;
};

const withTimeout = (p, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`El PDF tardó más de ${ms / 1000} s y se canceló`)), ms);
  p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

/** HTML (string) -> Buffer con el PDF. */
async function htmlToPdf(html) {
  await acquire();
  try {
    return await withTimeout((async () => {
      if (html.includes('data-doc="consolidado"')) {
        return render(html, { width: `${CONSOLIDADO_W_IN}in`, height: `${CONSOLIDADO_H_IN}in`, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
      }
      const split = await splitBoletin(html);
      if (split) return split;
      return toLetter([await render(html, designSize())]);
    })(), env.pdf.timeoutSeconds * 1000);
  } catch (e) {
    throw new Error(`Error generando PDF: ${e.message}`);
  } finally {
    release();
  }
}

/** Estado para el diagnóstico (/api/system/pdf-status). */
function status() {
  const serverless = isServerless() && !env.pdf.chromePath;
  const exe = serverless ? '@sparticuz/chromium' : localChrome();
  return { motor: 'chromium', disponible: Boolean(exe), ejecutable: exe, serverless };
}

module.exports = { htmlToPdf, status };
