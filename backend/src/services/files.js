'use strict';
/**
 * Almacenamiento de archivos con dos motores intercambiables:
 *  - Supabase Storage (producción / Vercel): bucket privado, accedido solo desde el backend.
 *  - Disco local (desarrollo): carpeta STORAGE_DIR (por defecto backend/storage).
 *
 * Las "claves" son rutas con "/" como  boletines/Periodo 1/5A/BOLETIN_Perez_Ana.pdf
 * Interfaz (todas async): put, get, stat, list, remove, removeTree, exists.
 */
const fs = require('fs');
const path = require('path');
const env = require('../config/env');

const useSupabase = Boolean(env.storage.supabaseUrl && env.storage.supabaseKey);
const driverName = useSupabase ? 'supabase' : 'disco';

/** Valida una clave y la devuelve como lista de segmentos (sin "..", vacíos ni barras invertidas). */
function segments(key) {
  const parts = String(key || '').split('/').filter((s) => s !== '');
  if (!parts.length || parts.some((s) => s === '.' || s === '..' || s.includes('\\') || s.includes('\0'))) {
    throw new Error('Ruta de archivo no permitida');
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Disco local
// ---------------------------------------------------------------------------
function diskDriver() {
  const root = path.resolve(env.storage.dir || path.join(__dirname, '../../storage'));
  const abs = (key) => path.join(root, ...segments(key));
  return {
    async put(key, buffer) { const f = abs(key); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buffer); },
    async get(key) { try { return fs.readFileSync(abs(key)); } catch (_) { return null; } },
    async stat(key) {
      try { const s = fs.statSync(abs(key)); return s.isFile() ? { size: s.size, updatedAt: s.mtime.toISOString() } : null; } catch (_) { return null; }
    },
    async list(prefix) {
      try {
        return fs.readdirSync(abs(prefix), { withFileTypes: true }).map((e) => {
          if (e.isDirectory()) return { name: e.name, isDir: true, size: 0, updatedAt: null };
          const s = fs.statSync(path.join(abs(prefix), e.name));
          return { name: e.name, isDir: false, size: s.size, updatedAt: s.mtime.toISOString() };
        });
      } catch (_) { return []; }
    },
    async remove(key) { try { fs.rmSync(abs(key), { force: true }); } catch (_) { /* ignora */ } },
    async removeTree(prefix) { try { fs.rmSync(abs(prefix), { recursive: true, force: true }); } catch (_) { /* ignora */ } },
  };
}

// ---------------------------------------------------------------------------
// Supabase Storage
// ---------------------------------------------------------------------------
/** Supabase solo admite letras, números y  ! - _ . * ' ( )  en las claves: el resto se codifica como (hex) (reversible).
 *  Los paréntesis literales también se codifican, así que (hex) nunca es ambiguo. */
const encSeg = (s) => s.replace(/[^A-Za-z0-9_.-]/gu, (ch) => `(${Buffer.from(ch, 'utf8').toString('hex')})`);
const decSeg = (s) => s.replace(/\(([0-9a-f]+)\)/g, (_, h) => Buffer.from(h, 'hex').toString('utf8'));
const encKey = (key) => segments(key).map(encSeg).join('/');

function supabaseDriver() {
  const { createClient } = require('@supabase/supabase-js');
  const client = createClient(env.storage.supabaseUrl, env.storage.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const bucketName = env.storage.bucket;
  const bucket = () => client.storage.from(bucketName);
  let bucketReady = null;

  /** Crea el bucket privado si todavía no existe (una vez por instancia). */
  function ensureBucket() {
    if (!bucketReady) {
      bucketReady = (async () => {
        const { error } = await client.storage.createBucket(bucketName, { public: false });
        if (error && !/already exists|duplicate|exists/i.test(`${error.message} ${error.statusCode || ''}`)) throw error;
      })().catch((e) => { bucketReady = null; throw e; });
    }
    return bucketReady;
  }
  const isMissing = (e) => e && (/not.?found|does not exist|no such/i.test(String(e.message)) || [400, 404].includes(Number(e.statusCode || e.status)));

  async function listRaw(prefix) {
    const out = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await bucket().list(prefix ? encKey(prefix) : '', { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) { if (isMissing(error)) return out; throw error; }
      out.push(...(data || []));
      if (!data || data.length < 1000) return out;
    }
  }
  const toEntry = (it) => ({
    name: decSeg(it.name),
    isDir: it.id === null || it.id === undefined,
    size: Number((it.metadata && (it.metadata.size ?? it.metadata.contentLength)) || 0),
    updatedAt: it.updated_at || it.created_at || null,
  });

  return {
    async put(key, buffer, contentType = 'application/octet-stream') {
      const send = () => bucket().upload(encKey(key), buffer, { contentType, upsert: true });
      let { error } = await send();
      if (error && /bucket not found/i.test(String(error.message))) { await ensureBucket(); ({ error } = await send()); }
      if (error) throw new Error(`Storage: no se pudo guardar "${key}": ${error.message}`);
    },
    async get(key) {
      const { data, error } = await bucket().download(encKey(key));
      if (error) { if (isMissing(error)) return null; throw new Error(`Storage: no se pudo leer "${key}": ${error.message}`); }
      return Buffer.from(await data.arrayBuffer());
    },
    async stat(key) {
      const parts = segments(key);
      const name = parts.pop();
      const hit = (await listRaw(parts.join('/'))).map(toEntry).find((e) => !e.isDir && e.name === name);
      return hit ? { size: hit.size, updatedAt: hit.updatedAt } : null;
    },
    async list(prefix) { return (await listRaw(prefix)).map(toEntry); },
    async remove(key) { await bucket().remove([encKey(key)]); },
    async removeTree(prefix) {
      const walk = async (p) => {
        const files = [];
        for (const e of await this.list(p)) {
          if (e.isDir) files.push(...(await walk(`${p}/${e.name}`)));
          else files.push(`${p}/${e.name}`);
        }
        return files;
      };
      const files = await walk(prefix);
      for (let i = 0; i < files.length; i += 100) {
        const { error } = await bucket().remove(files.slice(i, i + 100).map(encKey));
        if (error) throw new Error(`Storage: no se pudo borrar "${prefix}": ${error.message}`);
      }
    },
  };
}

const driver = useSupabase ? supabaseDriver() : diskDriver();

module.exports = {
  driverName,
  put: (key, buffer, contentType) => driver.put(key, buffer, contentType),
  get: (key) => driver.get(key),
  stat: (key) => driver.stat(key),
  exists: async (key) => (await driver.stat(key)) !== null,
  list: (prefix) => driver.list(prefix),
  remove: (key) => driver.remove(key),
  removeTree: (prefix) => driver.removeTree(prefix),
  /** Copia un archivo a otra clave (devuelve false si el origen no existe). */
  async copy(from, to, contentType) {
    const data = await driver.get(from);
    if (!data) return false;
    await driver.put(to, data, contentType);
    return true;
  },
  // exportadas para pruebas
  _encKey: encKey, _decSeg: decSeg,
};
