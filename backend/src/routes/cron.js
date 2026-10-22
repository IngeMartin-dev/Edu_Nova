'use strict';
const express = require('express');
const crypto = require('crypto');
const { asyncHandler } = require('../utils/http');
const tasks = require('../jobs/tasks');

const router = express.Router();

/** Vercel Cron envía  Authorization: Bearer <CRON_SECRET>. Sin CRON_SECRET configurado el endpoint queda cerrado. */
function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = String(req.headers.authorization || '');
  const want = `Bearer ${secret}`;
  const a = Buffer.from(got); const b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.get('/daily', asyncHandler(async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'No autorizado' });
  res.json({ ok: true, tareas: await tasks.runDaily() });
}));

module.exports = router;
