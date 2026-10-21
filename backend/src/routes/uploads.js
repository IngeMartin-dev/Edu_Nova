'use strict';
/**
 * Sirve los archivos subidos (fotos de perfil, adjuntos del chat y firmas) desde el
 * almacenamiento (Supabase Storage o disco). Los nombres son aleatorios y no listables.
 */
const express = require('express');
const files = require('../services/files');

const NAME_RE = /^[A-Za-z0-9_.-]+$/;
const IMG = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
const OTHER = {
  pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function serve(folder, { inlineImagesOnly }) {
  return async (req, res, next) => {
    try {
      const name = req.params.name;
      if (!NAME_RE.test(name) || name.startsWith('.')) return res.status(404).end();
      const buf = await files.get(`${folder}/${name}`);
      if (!buf) return res.status(404).end();
      const ext = name.split('.').pop().toLowerCase();
      const isImg = Object.prototype.hasOwnProperty.call(IMG, ext);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Content-Type', IMG[ext] || (inlineImagesOnly ? OTHER[ext] : null) || 'application/octet-stream');
      if (inlineImagesOnly && !isImg) res.setHeader('Content-Disposition', 'attachment');
      return res.send(buf);
    } catch (e) { return next(e); }
  };
}

const router = express.Router();
router.get('/uploads/profile-pictures/:name', serve('profile-pictures', { inlineImagesOnly: false }));
router.get('/uploads/chat/:name', serve('chat', { inlineImagesOnly: true }));
router.get('/Firmas/:name', serve('firmas', { inlineImagesOnly: false }));
module.exports = router;
