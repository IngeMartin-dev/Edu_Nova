'use strict';
const { HttpError } = require('../utils/http');

function notFound(req, res) {
  res.status(404).json({ error: 'Recurso no encontrado', path: req.originalUrl });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }
  // JSON mal formado en el body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido en la petición' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La petición es demasiado grande' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'El archivo supera el tamaño permitido' });
  }
  // Duplicados / integridad referencial de MySQL
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Ya existe un registro con esos datos' });
  }
  if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
    return res.status(409).json({ error: 'No se puede eliminar: el registro está en uso' });
  }
  console.error('[Error]', req.method, req.originalUrl, '\n', err);
  return res.status(500).json({ error: 'Ocurrió un error interno' });
}

module.exports = { notFound, errorHandler };
