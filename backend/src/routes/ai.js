'use strict';
/**
 * Asistente de IA (planes de estudio) con cualquier proveedor compatible con la API de OpenAI
 * (Groq, Google Gemini, OpenRouter, Cerebras, NVIDIA NIM, Mistral, Ollama…).
 * Se activa definiendo AI_API_KEY, AI_URL y AI_MODEL en backend/.env. Sin eso responde 503
 * con un mensaje claro y el resto de la plataforma funciona igual (los planes se escriben a mano).
 */
const express = require('express');
const env = require('../config/env');
const { requireRole } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../utils/http');

const router = express.Router();
router.use(requireRole('ADMIN', 'TEACHER', 'DIRECTOR_DE_GRUPO'));

const NOT_CONFIGURED = 'El asistente de IA no está configurado. Escribe el plan de estudio manualmente o define AI_API_KEY, AI_URL y AI_MODEL en backend/.env.';
const clampTokens = (n) => Math.max(256, Math.min(Number(n) || env.ai.maxTokens, env.ai.maxTokens));
const clampTemp = (t) => (Number.isFinite(Number(t)) ? Math.max(0, Math.min(Number(t), 1.5)) : 0.3);

function upstream(body, signal) {
  return fetch(env.ai.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ai.apiKey}` },
    body: JSON.stringify({ model: env.ai.model, ...body }),
    signal,
  });
}

async function upstreamErrorMessage(r) {
  let detail = '';
  try { const j = await r.json(); detail = j?.error?.message || j?.message || ''; } catch { /* sin cuerpo */ }
  console.warn(`[IA] El proveedor respondió ${r.status}: ${String(detail).slice(0, 200)}`);
  return r.status === 429 ? 'Se superó el límite de solicitudes de la IA. Espera un momento e intenta de nuevo.'
    : r.status === 401 || r.status === 403 ? 'La clave de la IA (AI_API_KEY) no es válida o no tiene permiso.'
    : 'El proveedor de IA no pudo generar el plan. Intenta de nuevo.';
}

router.get('/status', (req, res) => res.json({ aiEnabled: env.ai.enabled }));

// Genera el plan en streaming; reenvía el SSE tal cual (data: {choices:[{delta:{content}}]}).
router.post('/study-plan-stream', asyncHandler(async (req, res) => {
  if (!env.ai.enabled) return res.status(503).json({ error: NOT_CONFIGURED, aiEnabled: false });
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
  if (!prompt.trim() || prompt.length > 60000) throw new HttpError(400, 'El texto del plan es obligatorio (máx. 60.000 caracteres)');

  const ctl = new AbortController();
  res.on('close', () => ctl.abort());
  let r;
  try {
    r = await upstream({ messages: [{ role: 'user', content: prompt }], temperature: clampTemp(req.body.temperature), max_tokens: clampTokens(req.body.max_tokens), stream: true }, ctl.signal);
  } catch (e) {
    if (ctl.signal.aborted) return undefined;
    return res.status(503).json({ error: 'No se pudo conectar con el proveedor de IA.' });
  }
  if (!r.ok) return res.status(r.status === 429 ? 429 : 503).json({ error: await upstreamErrorMessage(r) });

  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  try {
    for await (const chunk of r.body) res.write(chunk);
  } catch (e) {
    if (!ctl.signal.aborted) res.write(`data: ${JSON.stringify({ error: 'Se interrumpió la conexión con la IA.' })}\n\n`);
  }
  return res.end();
}));

// Continúa un plan que quedó cortado; responde { content }.
router.post('/study-plan-continuation', asyncHandler(async (req, res) => {
  if (!env.ai.enabled) return res.status(503).json({ error: NOT_CONFIGURED, aiEnabled: false });
  const partial = typeof req.body?.partialPlan === 'string' ? req.body.partialPlan.slice(-12000) : '';
  if (!partial.trim()) throw new HttpError(400, 'Falta el plan parcial');
  const prompt = `Continúa EXACTAMENTE donde se quedó este plan de estudio (HTML). No repitas lo ya escrito, no reinicies secciones; termina las secciones pendientes y cierra con la línea "PLAN DE ESTUDIO COMPLETO".\n\nFINAL DEL PLAN HASTA AHORA:\n${partial}`;
  let r;
  try { r = await upstream({ messages: [{ role: 'user', content: prompt }], temperature: 0.25, max_tokens: clampTokens(6000) }); }
  catch { return res.status(503).json({ error: 'No se pudo conectar con el proveedor de IA.' }); }
  if (!r.ok) return res.status(r.status === 429 ? 429 : 503).json({ error: await upstreamErrorMessage(r) });
  const j = await r.json();
  return res.json({ content: j?.choices?.[0]?.message?.content || '' });
}));

module.exports = router;