'use strict';
const pad = (n) => String(n).padStart(2, '0');

/** Fecha/hora local en formato DATETIME de MySQL: "YYYY-MM-DD HH:mm:ss". */
function nowSql(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Fecha local "YYYY-MM-DD". */
function todaySql(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Suma días a una fecha y la devuelve en formato DATETIME. */
function addDaysSql(days, from = new Date()) {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + days);
  return nowSql(d);
}

/** Acepta "2026-05-04T10:00:00", "2026-05-04 10:00:00" o Date y lo vuelve DATETIME de MySQL (o null). */
function toSqlDateTime(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return nowSql(v);
  const s = String(v).replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/Z$/, '');
  return s.length === 10 ? `${s} 00:00:00` : s.slice(0, 19);
}

module.exports = { nowSql, todaySql, addDaysSql, toSqlDateTime };
