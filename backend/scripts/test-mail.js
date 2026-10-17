'use strict';
// Uso:  npm run mail:test -- tucorreo@gmail.com
// Envía un correo de prueba con la configuración SMTP de backend/.env.
const env = require('../src/config/env');
const { sendMail } = require('../src/services/mailer');

(async () => {
  const to = process.argv[2];
  if (!to) { console.error('Uso: npm run mail:test -- tucorreo@ejemplo.com'); process.exit(1); }
  if (!env.mail.enabled) { console.error('SMTP_HOST está vacío en backend/.env: configura el correo primero (ver README → 2FA).'); process.exit(1); }
  const r = await sendMail({ to, subject: 'Prueba de correo · EduNova', text: 'Si lees esto, el correo (y el código 2FA) funcionan.' });
  if (r.ok) console.log(`✔ Correo enviado a ${to}. Revisa también la carpeta de spam.`);
  else { console.error('✖', r.error); process.exit(1); }
})();