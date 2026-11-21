'use strict';
/**
 * Simulador mínimo do ambiente Google Apps Script para testar o backend (.gs) em Node, sem rede.
 * - Planilha em memória (SpreadsheetApp), com o mesmo "defeito" do Sheets real: texto que parece data/número
 *   vira Date/número se a coluna NÃO estiver formatada como texto ('@').
 * - LockService (conta travas abertas), PropertiesService, CacheService (com relógio controlável),
 *   Utilities, Session e HtmlService (grava as chamadas de doGet).
 * Os arquivos reais de apps-script/*.gs rodam dentro de um contexto vm, exatamente como estão.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const GAS_DIR = path.join(__dirname, '..', '..', 'apps-script');
const pad = n => String(n).padStart(2, '0');

class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) { const v = this.sh._cell(this.r + i, this.c + j); row.push(v === undefined ? '' : v); }
      out.push(row);
    }
    return out;
  }
  setValues(vals) {
    for (let i = 0; i < vals.length; i++) for (let j = 0; j < vals[i].length; j++) this.sh._set(this.r + i, this.c + j, vals[i][j]);
    return this;
  }
  setValue(v) { this.sh._set(this.r, this.c, v); return this; }
  setFontWeight() { return this; }
  setNumberFormat(f) { if (f === '@') for (let j = 0; j < this.nc; j++) this.sh.textCols.add(this.c + j); return this; }
}

class Sheet {
  constructor(name, env) { this.name = name; this.env = env; this.rows = []; this.textCols = new Set(); }
  _cell(r, c) { return (this.rows[r - 1] || [])[c - 1]; }
  _convert(v, c) {                                   // comportamento do Sheets em colunas sem formato de texto
    if (typeof v !== 'string' || this.textCols.has(c)) return v;
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/);
    if (m) return new this.env.Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    return v;
  }
  _set(r, c, v) {
    while (this.rows.length < r) this.rows.push([]);
    const row = this.rows[r - 1];
    while (row.length < c - 1) row.push('');
    row[c - 1] = this._convert(v, c);
  }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  getLastRow() { for (let i = this.rows.length; i > 0; i--) if (this.rows[i - 1].some(v => v !== '' && v !== undefined)) return i; return 0; }
  getLastColumn() { let m = 0; this.rows.forEach(row => row.forEach((v, j) => { if (v !== '' && v !== undefined) m = Math.max(m, j + 1); })); return m; }
  getMaxRows() { return 1000; }
  getMaxColumns() { return 26; }
  appendRow(arr) { const r = this.getLastRow() + 1; arr.forEach((v, j) => this._set(r, j + 1, v)); }
  deleteRow(r) { this.rows.splice(r - 1, 1); }
  setFrozenRows() {}
}

class Spreadsheet {
  constructor(env) { this.env = env; this.sheets = {}; }
  getSheetByName(n) { return this.sheets[n] || null; }
  insertSheet(n) { return (this.sheets[n] = new Sheet(n, this.env)); }
  getSpreadsheetTimeZone() { return 'America/Sao_Paulo'; }
}

function formatDate(d, _tz, fmt) {
  return fmt.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate()))
    .replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds()));
}

/** Cria um ambiente novo e carrega todos os .gs. Cada teste usa o seu: nada vaza entre testes. */
function loadBackend(options = {}) {
  const env = { Date };                                   // ajustado para o Date do contexto logo abaixo
  const ss = new Spreadsheet(env);
  const props = Object.assign({}, options.props);
  const clock = { now: 0 };                               // segundos simulados (expiração do cache)
  const cacheData = {};
  const locks = { held: 0, total: 0 };
  const html = { calls: [] };

  const out = { setTitle(t) { html.calls.push(['title', t]); return out; }, addMetaTag(n, c) { html.calls.push(['meta', n, c]); return out; },
                setXFrameOptionsMode(m) { html.calls.push(['xframe', m]); return out; } };
  const globals = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() { locks.held++; locks.total++; }, releaseLock() { locks.held--; } }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; } }) },
    CacheService: { getScriptCache: () => ({
      get: k => { const e = cacheData[k]; return e && e.exp > clock.now ? e.v : null; },
      put: (k, v, ttl) => { cacheData[k] = { v: String(v), exp: clock.now + (ttl || 600) }; },
      remove: k => { delete cacheData[k]; } }) },
    Utilities: { getUuid: () => crypto.randomUUID(), formatDate },
    Session: { getActiveUser: () => ({ getEmail: () => '' }), getScriptTimeZone: () => 'America/Sao_Paulo' },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL', DEFAULT: 'DEFAULT' },
      createTemplateFromFile: f => ({ evaluate: () => { html.calls.push(['template', f]); return out; } }),
      createHtmlOutputFromFile: f => ({ getContent: () => fs.readFileSync(path.join(GAS_DIR, f + '.html'), 'utf8') })
    }
  };
  const ctx = vm.createContext(globals);
  env.Date = vm.runInContext('Date', ctx);
  const files = fs.readdirSync(GAS_DIR).filter(f => f.endsWith('.gs')).sort();
  for (const f of files) new vm.Script(fs.readFileSync(path.join(GAS_DIR, f), 'utf8'), { filename: f }).runInContext(ctx);

  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const b = {
    ctx, ss, props, locks, html, clock, files,
    run: code => clone(vm.runInContext(code, ctx)),
    call: (route, payload, pin) => clone(ctx.api(route, payload || {}, pin)),
    sheet: name => ss.getSheetByName(name),
    advance: s => { clock.now += s; },
    /* atalhos de dados */
    cat(nome, tipo = 'entrada', extra = {}) { return b.call('categorias.save', Object.assign({ nome, tipo, cor: '#112233' }, extra)); },
    lanc(over = {}) {
      const p = Object.assign({ tipo: 'entrada', valor: 100, data: '2026-11-10', status: 'pago', forma: 'pix' }, over);
      if (!p.categoria_id) {
        const nome = 'Cat ' + p.tipo;
        const have = b.call('categorias.list').find(c => c.nome === nome);
        p.categoria_id = (have || b.cat(nome, p.tipo)).id;
      }
      return b.call('lancamentos.save', p);
    }
  };
  return b;
}

module.exports = { loadBackend, GAS_DIR };
