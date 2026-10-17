'use strict';
// Uso:  npm run ai:test
// Hace una pregunta corta al proveedor de IA configurado en backend/.env.
const env = require('../src/config/env');

(async () => {
  if (!env.ai.enabled) { console.error('Faltan AI_API_KEY, AI_URL o AI_MODEL en backend/.env (ver README → IA).'); process.exit(1); }
  const r = await fetch(env.ai.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ai.apiKey}` },
    body: JSON.stringify({ model: env.ai.model, messages: [{ role: 'user', content: 'Responde solo: IA lista' }], max_tokens: 20 }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error(`✖ ${r.status}:`, j?.error?.message || JSON.stringify(j).slice(0, 300)); process.exit(1); }
  console.log('✔ Respuesta del modelo:', j.choices?.[0]?.message?.content);
})();