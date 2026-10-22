'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const { authenticate, requireRole } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errors');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.VERCEL) app.set('trust proxy', 1);
  else if (env.security.trustProxy) app.set('trust proxy', true);

  // --- Cabeceras de seguridad ---
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: [
            "'self'", 'http://localhost:8080', 'http://127.0.0.1:8080',
            'https://fcm.googleapis.com', 'https://fcmregistrations.googleapis.com',
            'https://firebaseinstallations.googleapis.com', 'https://www.googleapis.com',
          ],
          frameSrc: ["'self'", 'blob:'],
          objectSrc: ["'self'", 'blob:'],
          frameAncestors: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // el frontend (:4200) carga /uploads
      crossOriginEmbedderPolicy: false,
      frameguard: { action: 'sameorigin' },
      hsts: { maxAge: 31536000, includeSubDomains: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })
  );

  // --- CORS (solo orígenes locales + los definidos en ALLOWED_ORIGINS) ---
  const origins = new Set([
    'http://localhost:4200', 'http://localhost:8080', 'http://127.0.0.1:4200', 'http://127.0.0.1:8080',
    ...env.security.allowedOrigins,
  ]);
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || origins.has(origin)),
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
      exposedHeaders: ['Authorization', 'Content-Disposition'],
      maxAge: 3600,
    })
  );

  // --- Límite de peticiones: 1000/min general, 120/min para generación/descarga de boletines ---
  const isHeavy = (req) =>
    req.path.startsWith('/api/boletines') &&
    (req.method === 'POST' || req.path.includes('/descargar') || req.path.includes('/archivo/')) || req.path.startsWith('/api/consolidado/grado-salon');
  const limiterOpts = (max) => ({
    windowMs: 60 * 1000,
    limit: max,
    standardHeaders: false,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: 'Too many requests. Please try again later.' }),
  });
  const heavyLimiter = rateLimit(limiterOpts(120));
  const generalLimiter = rateLimit(limiterOpts(1000));
  app.use('/api', (req, res, next) => (isHeavy({ path: req.originalUrl.split('?')[0], method: req.method })
    ? heavyLimiter(req, res, next)
    : generalLimiter(req, res, next)));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // --- Archivos subidos (fotos de perfil, chat, firmas): salen del almacenamiento (Supabase Storage o disco) ---
  app.use(require('./routes/uploads'));

  // --- Logos e imágenes de marca ---
  app.use('/img', express.static(path.resolve(__dirname, '../assets/img'), { index: false, maxAge: '1d' }));

  // --- API ---
  app.get('/api/health', (req, res) => res.json({ status: 'UP', app: env.institution.name }));
  app.get('/api/institution', (req, res) => res.json({
    name: env.institution.name, address: env.institution.address, phone: env.institution.phone, logo: env.institution.logo,
  }));

  app.use('/api/cron', require('./routes/cron'));

  // En Vercel no hay procesos permanentes: las revisiones periódicas se disparan con las peticiones.
  if (process.env.VERCEL) app.use('/api', (req, res, next) => { require('./utils/background').runInBackground(require('./jobs/tasks').tick()); next(); });

  app.use('/api', authenticate);
  app.get('/api/system/pdf-status', requireRole('ADMIN'), (req, res) => res.json(require('./services/pdf').status()));
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/students', require('./routes/students'));
  app.use('/api/subjects', require('./routes/subjects'));
  app.use('/api/teachers', require('./routes/teachers'));
  app.use('/api/parents', require('./routes/parents'));
  app.use('/api/homeroom-assignments', require('./routes/homeroom'));
  app.use('/api/periods', require('./routes/periods'));
  app.use('/api/notifications', require('./routes/notifications'));
  app.use('/api/messages', require('./routes/messages'));
  app.use('/api/feedback', require('./routes/feedback'));
  app.use('/api/grades', require('./routes/grades'));
  app.use('/api/grades', require('./routes/recovery'));
  app.use('/api/grade-columns', require('./routes/gradeColumns'));
  app.use('/api/school-year', require('./routes/schoolYear'));
  app.use('/api/promociones', require('./routes/promotions'));
  app.use('/api/boletines', require('./routes/boletines'));
  app.use('/api/chats', require('./routes/chats'));
  app.use('/api/export', require('./routes/export'));
  app.use('/api/ai', require('./routes/ai'));
  const rc = require('./routes/reportcards');
  app.use('/api/reportcards', rc.reportCards);
  app.use('/api/signatures', rc.signatures);
  app.use('/api/consolidado', require('./routes/consolidado'));
  app.use('/api', notFound);

  // --- Frontend compilado (si existe): carpeta frontend-dist o public ---
  const candidates = [path.resolve(__dirname, '../public'), path.resolve(__dirname, '../../frontend/dist')];
  const webRoot = candidates.find((d) => fs.existsSync(path.join(d, 'index.html')));
  if (webRoot) {
    app.use(express.static(webRoot, { index: false }));
    app.get(/^(?!\/api\/|\/uploads\/).*/, (req, res) => res.sendFile(path.join(webRoot, 'index.html')));
  } else {
    app.get('/', (req, res) => res.json({ app: env.institution.name, status: 'API en línea', docs: '/api/health' }));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

// Vercel (autodetección de Express) puede tomar este archivo como entrada: debe exportar una función.
let lazyApp = null;
const handler = (req, res) => {
  if (!lazyApp) { env.validate(); lazyApp = createApp(); }
  return lazyApp(req, res);
};
handler.createApp = createApp;
module.exports = handler;
