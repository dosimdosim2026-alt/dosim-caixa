/** Camada de dados genérica: cada aba da planilha = uma "tabela" definida em SCHEMAS. */
const SCHEMAS = {
  categorias:  ['id', 'nome', 'tipo', 'cor', 'ativo', 'criado_em'],
  // Novas colunas entram SEMPRE no fim: abas já existentes são migradas automaticamente.
  lancamentos: ['id', 'data', 'tipo', 'categoria_id', 'descricao', 'valor', 'status', 'criado_em', 'forma', 'item_id', 'contato_id', 'contato_nome', 'vencimento', 'parcela', 'parcelas', 'grupo_id', 'data_pagamento'],
  catalogo:    ['id', 'tipo', 'nome', 'categoria_id', 'preco', 'ativo', 'criado_em'],
  contatos:    ['id', 'nome', 'telefone', 'obs', 'cliente', 'fornecedor', 'ativo', 'criado_em'],
  config:      ['chave', 'val']
  // fornecedores: ['id','nome','documento','contato','criado_em'],
};
const NUMERIC_COLS_ = ['valor', 'ativo', 'preco', 'cliente', 'fornecedor', 'parcela', 'parcelas'];

function bool_(v) { return v === true || String(v).toLowerCase() === 'true'; }

/** Remove acentos/caixa para comparar nomes ("Gasolina" = "gasolína"). */
function normalizar_(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

const Db = {
  ss: function () {
    const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  },

  checked_: {},

  fmt_: function (sh, cols, from) { // texto puro evita conversão automática de datas
    cols.forEach(function (c, i) {
      if (i >= from && NUMERIC_COLS_.indexOf(c) < 0) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
    });
  },

  sheet: function (name) {
    const cols = SCHEMAS[name];
    if (!cols) throw new Error('Schema inexistente: ' + name);
    let sh = this.ss().getSheetByName(name);
    if (!sh) {
      sh = this.ss().insertSheet(name);
      sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
      sh.setFrozenRows(1);
      this.fmt_(sh, cols, 0);
    } else if (!this.checked_[name]) { // migração: acrescenta colunas novas ao cabeçalho
      const have = sh.getLastColumn();
      if (have < cols.length) {
        sh.getRange(1, have + 1, 1, cols.length - have).setValues([cols.slice(have)]).setFontWeight('bold');
        this.fmt_(sh, cols, have);
      }
    }
    this.checked_[name] = true;
    return sh;
  },

  clean: function (v) {
    return v instanceof Date ? Utilities.formatDate(v, this.ss().getSpreadsheetTimeZone(), 'yyyy-MM-dd') : v;
  },

  list: function (name) {
    const sh = this.sheet(name), cols = SCHEMAS[name], n = sh.getLastRow(), self = this;
    if (n < 2) return [];
    return sh.getRange(2, 1, n - 1, cols.length).getValues().map(function (r) {
      const o = {};
      cols.forEach(function (c, i) { o[c] = self.clean(r[i]); });
      return o;
    });
  },

  lock_: function (fn) {
    const l = LockService.getScriptLock();
    l.waitLock(10000);
    try { return fn(); } finally { l.releaseLock(); }
  },

  insert: function (name, obj) {
    const self = this;
    return this.lock_(function () {
      const cols = SCHEMAS[name], rec = Object.assign({}, obj);
      if (cols.indexOf('id') > -1) rec.id = Utilities.getUuid();
      if (cols.indexOf('criado_em') > -1)
        rec.criado_em = Utilities.formatDate(new Date(), self.ss().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      self.sheet(name).appendRow(cols.map(function (c) { return rec[c] === undefined ? '' : rec[c]; }));
      return rec;
    });
  },

  /** Grava várias linhas de uma vez (uma só trava e uma só escrita): usado nas parcelas. */
  insertMany: function (name, objs) {
    const self = this;
    return this.lock_(function () {
      const cols = SCHEMAS[name], sh = self.sheet(name);
      const agora = Utilities.formatDate(new Date(), self.ss().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      const recs = objs.map(function (o) {
        const r = Object.assign({}, o);
        if (cols.indexOf('id') > -1) r.id = Utilities.getUuid();
        if (cols.indexOf('criado_em') > -1) r.criado_em = agora;
        return r;
      });
      const primeira = sh.getLastRow() + 1, falta = primeira + recs.length - 1 - sh.getMaxRows();
      if (falta > 0) sh.insertRowsAfter(sh.getMaxRows(), falta);   // setValues não aumenta a planilha sozinho
      sh.getRange(primeira, 1, recs.length, cols.length).setValues(recs.map(function (r) {
        return cols.map(function (c) { return r[c] === undefined ? '' : r[c]; });
      }));
      return recs;
    });
  },

  /** Apaga várias linhas pelo id (de baixo para cima, para os índices não deslocarem). */
  removeMany: function (name, ids) {
    const self = this;
    return this.lock_(function () {
      const sh = self.sheet(name), cols = SCHEMAS[name], n = sh.getLastRow(), ci = cols.indexOf('id');
      if (n < 2) return 0;
      const chaves = sh.getRange(2, ci + 1, n - 1, 1).getValues().map(function (r) { return String(r[0]); });
      const alvo = {}; ids.forEach(function (i) { alvo[String(i)] = true; });
      let removidas = 0;
      for (let i = chaves.length - 1; i >= 0; i--) if (alvo[chaves[i]]) { sh.deleteRow(i + 2); removidas++; }
      return removidas;
    });
  },

  rowIndex_: function (sh, cols, by, key) {
    const n = sh.getLastRow(), ci = cols.indexOf(by);
    if (n < 2) return -1;
    const keys = sh.getRange(2, ci + 1, n - 1, 1).getValues().map(function (r) { return String(r[0]); });
    const i = keys.indexOf(String(key));
    return i < 0 ? -1 : i + 2;
  },

  update: function (name, key, patch, by) {
    const self = this;
    return this.lock_(function () {
      const sh = self.sheet(name), cols = SCHEMAS[name], row = self.rowIndex_(sh, cols, by || 'id', key);
      if (row < 0) throw new Error('Registro não encontrado.');
      const rng = sh.getRange(row, 1, 1, cols.length), cur = rng.getValues()[0], out = {};
      cols.forEach(function (c, j) {
        out[c] = (c in patch && c !== 'id' && c !== 'criado_em') ? patch[c] : cur[j];
      });
      rng.setValues([cols.map(function (c) { return out[c]; })]);
      cols.forEach(function (c) { out[c] = self.clean(out[c]); });
      return out;
    });
  },

  remove: function (name, key, by) {
    const self = this;
    return this.lock_(function () {
      const sh = self.sheet(name), row = self.rowIndex_(sh, SCHEMAS[name], by || 'id', key);
      if (row < 0) throw new Error('Registro não encontrado.');
      sh.deleteRow(row);
      return true;
    });
  }
};

/**
 * Fábrica de CRUD: opts = { validate, filter, sort, map, beforeDelete }.
 * Reaproveite em qualquer módulo novo (fornecedores, catálogo...).
 */
function makeCrud_(name, opts) {
  opts = opts || {};
  return {
    list: function (p) {
      let rows = Db.list(name);
      if (opts.filter) rows = opts.filter(rows, p || {});
      if (opts.map) rows = rows.map(opts.map);
      if (opts.sort) rows.sort(opts.sort);
      return rows;
    },
    save: function (p) {
      const d = opts.validate ? opts.validate(p) : p;
      return d.id ? Db.update(name, d.id, d) : Db.insert(name, d);
    },
    remove: function (p) {
      if (opts.beforeDelete) opts.beforeDelete(p.id);
      return Db.remove(name, p.id);
    }
  };
}

function crudRoutes_(name, crud) {
  const r = {};
  ['list', 'save', 'remove'].forEach(function (k) { r[name + '.' + k] = crud[k]; });
  return r;
}
