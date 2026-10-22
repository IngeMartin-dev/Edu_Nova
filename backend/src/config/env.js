'use strict';
/**
 * Carga y valida la configuración desde variables de entorno (.env).
 * Nunca se escriben credenciales en el código: todo sale de .env.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

// Hora de Colombia en todo el backend (en Vercel el servidor corre en UTC)
process.env.TZ = process.env.TZ || 'America/Bogota';

const bool = (v, def = false) => (v === undefined || v === '' ? def : /^(1|true|yes|on)$/i.test(String(v)));
const int = (v, def) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? def : Number(v));
const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 8080),

  // PostgreSQL (Supabase). Lo más simple: DATABASE_URL (cadena del "Transaction pooler", puerto 6543).
  // Alternativa: DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME.
  db: {
    url: process.env.DATABASE_URL || '',
    host: process.env.DB_HOST || 'localhost',
    port: int(process.env.DB_PORT, 5432),
    name: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    connectionLimit: int(process.env.DB_POOL_SIZE, 5),
    // Supabase exige TLS: DB_SSL=true
    ssl: bool(process.env.DB_SSL, false),
  },

  // Archivos (PDF, firmas, fotos, adjuntos del chat).
  // Con SUPABASE_URL + SUPABASE_SECRET_KEY se guardan en Supabase Storage (bucket privado);
  // sin ellas, en la carpeta STORAGE_DIR (desarrollo local).
  storage: {
    supabaseUrl: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
    supabaseKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    bucket: process.env.SUPABASE_BUCKET || 'edunova',
    dir: process.env.STORAGE_DIR || '',
    chatMaxMb: int(process.env.CHAT_MAX_MB, 4),
  },

  jwt: {
    secret: process.env.JWT_SECRET || '',
    // 7 días el access token, 30 días el refresh token (igual que el sistema original)
    expiresInSeconds: int(process.env.JWT_EXPIRES_SECONDS, 7 * 24 * 3600),
    refreshExpiresDays: int(process.env.JWT_REFRESH_DAYS, 30),
  },

  decimalSeparator: process.env.DECIMAL_SEPARATOR === '.' ? '.' : ',',

  institution: {
    name: process.env.INSTITUTION_NAME || 'EduNova',
    address: process.env.INSTITUTION_ADDRESS || 'Calle 10 #20-30, Cartagena de Indias, Bolívar, Colombia',
    phone: process.env.INSTITUTION_PHONE || '+57 300 000 0000',
    logo: process.env.INSTITUTION_LOGO || '/img/logo.svg',
  },

  security: {
    trustProxy: bool(process.env.TRUST_PROXY, false),
    allowedOrigins: list(process.env.ALLOWED_ORIGINS),
  },

  // Correo (2FA y notificaciones por correo). Opcional: si no hay SMTP_HOST,
  // en desarrollo el código 2FA se imprime en la consola del servidor.
  mail: {
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || '',
  },

  // Firebase push (opcional)
  firebase: {
    enabled: bool(process.env.FIREBASE_ENABLED, false),
    serviceAccountFile: process.env.FIREBASE_SERVICE_ACCOUNT_FILE || 'firebase-service-account.json',
    // Configuración PÚBLICA de la app web de Firebase (no es secreta) + clave VAPID del navegador.
    web: {
      apiKey: process.env.FIREBASE_WEB_API_KEY || '',
      authDomain: process.env.FIREBASE_WEB_AUTH_DOMAIN || '',
      projectId: process.env.FIREBASE_WEB_PROJECT_ID || '',
      storageBucket: process.env.FIREBASE_WEB_STORAGE_BUCKET || '',
      messagingSenderId: process.env.FIREBASE_WEB_MESSAGING_SENDER_ID || '',
      appId: process.env.FIREBASE_WEB_APP_ID || '',
    },
    vapidKey: process.env.FIREBASE_WEB_VAPID_KEY || '',
  },

  // IA (opcional, vacía por defecto: el asistente queda desactivado)
  ai: {
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || '',
    url: process.env.AI_URL || '',
    maxTokens: int(process.env.AI_MAX_TOKENS, 8000),
  },

  // Generación de PDF con Python + Playwright
  pdf: {
    chromePath: process.env.CHROME_PATH || '',
    concurrency: int(process.env.PDF_CONCURRENCY, 2),
    timeoutSeconds: int(process.env.PDF_TIMEOUT_SECONDS, 180),
  },

  seed: {
    adminPassword: process.env.ADMIN_PASSWORD || 'EduNova2026*',
    teacherPassword: process.env.TEACHER_PASSWORD || 'EduNova2026*',
  },
};

env.isProd = env.nodeEnv === 'production';
env.mail.enabled = Boolean(env.mail.host);
env.firebase.webReady = Boolean(env.firebase.enabled && env.firebase.vapidKey && env.firebase.web.apiKey && env.firebase.web.projectId && env.firebase.web.messagingSenderId && env.firebase.web.appId);
env.ai.enabled = Boolean(env.ai.apiKey && env.ai.url && env.ai.model);

/** Falla temprano y con un mensaje claro si la configuración es insegura. */
env.validate = function validate() {
  if (!env.jwt.secret || env.jwt.secret.length < 32) {
    throw new Error(
      'Config inválida: falta JWT_SECRET en backend/.env (mínimo 32 caracteres). ' +
        'Genera uno con:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }
};

module.exports = env;