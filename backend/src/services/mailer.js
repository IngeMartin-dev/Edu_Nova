'use strict';
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporter = null;
function getTransporter() {
  if (!env.mail.enabled) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.mail.host,
      port: env.mail.port,
      secure: env.mail.secure,
      auth: env.mail.user ? { user: env.mail.user, pass: env.mail.pass } : undefined,
    });
  }
  return transporter;
}

const LOGO_PNG = path.resolve(__dirname, '../../assets/logo-email.png');

/**
 * Envía un correo. Devuelve { ok, dev, error? }.
 *  - Con SMTP configurado: lo envía de verdad.
 *  - Sin SMTP y fuera de producción: modo desarrollo, imprime el correo en consola (ok = true).
 *  - Sin SMTP en producción: ok = false.
 */
async function sendMail({ to, subject, text, html, attachments: extra = [] }) {
  const t = getTransporter();
  if (!t) {
    if (env.isProd) return { ok: false, dev: false, error: 'El servidor de correo (SMTP) no está configurado' };
    console.log('\n[MAIL · modo desarrollo, SMTP no configurado]');
    console.log(`  Para:    ${to}\n  Asunto:  ${subject}\n  Mensaje: ${text}\n${extra.length ? `  Adjuntos: ${extra.map((a) => a.filename).join(', ')}\n` : ''}`);
    return { ok: true, dev: true };
  }
  try {
    const attachments = [...extra];
    if (html && html.includes('cid:logoEduNova') && fs.existsSync(LOGO_PNG)) {
      attachments.push({ filename: 'logo.png', path: LOGO_PNG, cid: 'logoEduNova' });
    }
    await t.sendMail({
      from: env.mail.from || `"${env.institution.name}" <${env.mail.user}>`,
      to,
      subject,
      text,
      html,
      attachments,
    });
    return { ok: true, dev: false };
  } catch (e) {
    console.error('[MAIL] No se pudo enviar el correo a', to, '-', e.message);
    return { ok: false, dev: false, error: `No se pudo enviar el correo: ${e.message}` };
  }
}

module.exports = { sendMail };
