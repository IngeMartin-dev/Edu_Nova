'use strict';
/**
 * Convierte HTML a PDF llamando a python/playwright_generator.py (Playwright + Chromium).
 * - Detecta el ejecutable de Python (PYTHON_BIN, python3, python, py).
 * - Limita cuántos PDF se generan a la vez (PDF_CONCURRENCY) para no saturar la máquina.
 * - Usa una carpeta temporal por trabajo, así varios PDF no se pisan entre sí.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const env = require('../config/env');

const SCRIPT = path.resolve(__dirname, '../../python/playwright_generator.py');
let pythonBin = null;

function detectPython() {
  if (pythonBin) return pythonBin;
  // Prioridad: PYTHON_BIN del .env, el .venv de backend (lo crea scripts/windows/instalar.ps1) y luego el Python del sistema.
  const venvPython = process.platform === 'win32'
    ? path.resolve(__dirname, '../../.venv/Scripts/python.exe')
    : path.resolve(__dirname, '../../.venv/bin/python');
  const candidates = [env.pdf.pythonBin, fs.existsSync(venvPython) && venvPython, 'python3', 'python', 'py'].filter(Boolean);
  for (const c of candidates) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) { pythonBin = c; return c; }
  }
  return null;
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

function runPython(bin, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: path.resolve(__dirname, '../..'), windowsHide: true });
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`El PDF tardó más de ${timeoutMs / 1000} s y se canceló`)); }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`Error generando PDF (python, código ${code}): ${stderr.trim() || stdout.trim()}`));
    });
  });
}

/** HTML (string) -> Buffer con el PDF. */
async function htmlToPdf(html) {
  const bin = detectPython();
  if (!bin) {
    throw new Error('No se encontró Python. Instálalo y ejecuta: pip install -r backend/python/requirements.txt && playwright install chromium (o define PYTHON_BIN en .env)');
  }
  await acquire();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edunova-pdf-'));
  try {
    const htmlFile = path.join(dir, 'documento.html');
    const pdfFile = path.join(dir, 'documento.pdf');
    fs.writeFileSync(htmlFile, html, 'utf8');
    await runPython(bin, [SCRIPT, htmlFile, pdfFile], env.pdf.timeoutSeconds * 1000);
    return fs.readFileSync(pdfFile);
  } finally {
    release();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Estado para el diagnóstico (/api/health/pdf). */
function status() {
  const bin = detectPython();
  let playwright = false;
  if (bin) {
    const r = spawnSync(bin, ['-c', 'import playwright, bs4, pypdf'], { encoding: 'utf8' });
    playwright = r.status === 0;
  }
  return { python: bin, dependencias: playwright, script: fs.existsSync(SCRIPT) };
}

module.exports = { htmlToPdf, status };
