'use strict';
const crypto = require('crypto');
const { exec, one } = require('../config/db');
const env = require('../config/env');
const { sendMail } = require('./mailer');

const CODE_VALID_MS = 10 * 60 * 1000; // 10 minutos
let lastError = null;
const getLastError = () => lastError;

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function buildHtml(inst, asunto, intro, codigo) {
  return `<div style="background:#f5f3ff;padding:32px 12px;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:480px;margin:auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(91,33,182,.10)">
    <div style="background:linear-gradient(135deg,#6d28d9,#8b5cf6);padding:24px;text-align:center">
      <img src="cid:logoEduNova" alt="${escapeHtml(inst)}" style="height:52px;width:auto;display:inline-block" onerror="this.style.display='none'">
      <div style="color:#fff;font-size:22px;font-weight:bold;letter-spacing:.5px;margin-top:6px">${escapeHtml(inst)}</div>
    </div>
    <div style="padding:32px 28px">
      <h2 style="color:#2e1065;margin:0 0 6px;font-size:20px">${escapeHtml(asunto)}</h2>
      <p style="color:#333;font-size:15px;line-height:1.5">${escapeHtml(intro)}</p>
      <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:18px;text-align:center;margin:24px 0">
        <span style="font-size:34px;font-weight:bold;letter-spacing:8px;color:#6d28d9">${escapeHtml(codigo)}</span>
      </div>
      <p style="color:#666;font-size:13px;line-height:1.5">Este código vence en <strong>10 minutos</strong>. Si no fuiste tú quien lo solicitó, ignora este correo; tu cuenta sigue segura.</p>
    </div>
    <div style="background:#faf5ff;padding:16px 28px;border-top:1px solid #ede9fe;text-align:center;color:#8b7bb5;font-size:12px">
      Mensaje automático de ${escapeHtml(inst)}. Por favor no respondas a este correo.
    </div>
  </div></div>`;
}

/** Genera un código de 6 dígitos, lo guarda con vencimiento y lo envía por correo. */
async function generateAndSend(user, asunto, intro) {
  const codigo = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  try {
    await exec('UPDATE users SET temp_2fa_code = ?, temp_2fa_expiry = ? WHERE id = ?', [
      codigo,
      Date.now() + CODE_VALID_MS,
      user.id,
    ]);
  } catch (e) {
    lastError = `No se pudo guardar el código: ${e.message}`;
    return false;
  }
  const inst = env.institution.name;
  const text =
    `${inst}\n\n${intro}\n\nTu código es: ${codigo}\n\n` +
    'Este código vence en 10 minutos. Si no fuiste tú quien lo solicitó, ignora este correo.';
  const res = await sendMail({
    to: user.email,
    subject: `[${inst}] ${asunto}`,
    text,
    html: buildHtml(inst, asunto, intro, codigo),
  });
  lastError = res.ok ? null : res.error;
  return res.ok;
}

/** Verifica el código (un solo uso): si es correcto lo borra y devuelve true. */
async function verifyCode(userId, enteredCode) {
  const row = await one('SELECT temp_2fa_code, temp_2fa_expiry FROM users WHERE id = ?', [userId]);
  if (!row || !row.temp2faCode || !row.temp2faExpiry) return false;
  if (Date.now() > Number(row.temp2faExpiry)) return false;
  const a = Buffer.from(String(row.temp2faCode));
  const b = Buffer.from(String(enteredCode));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  await exec('UPDATE users SET temp_2fa_code = NULL, temp_2fa_expiry = NULL WHERE id = ?', [userId]);
  return true;
}

module.exports = { generateAndSend, verifyCode, getLastError };
