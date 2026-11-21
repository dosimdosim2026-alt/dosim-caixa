'use strict';
/**
 * Carrega os scripts do frontend (apps-script/js_*.html) num contexto vm com um "DOM de mentira".
 * Serve para testar funções puras e a lógica do App (sem navegador, sem dependências).
 * Para testes com DOM real, o caminho é adicionar jsdom — veja TESTING.md.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { GAS_DIR } = require('./gas-mock');

function scriptOf(file) {
  const html = fs.readFileSync(path.join(GAS_DIR, file), 'utf8');
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  return m ? m[1] : '';
}

/** Arquivos incluídos no index.html, na ordem em que o app os carrega. */
function indexIncludes() {
  const html = fs.readFileSync(path.join(GAS_DIR, 'index.html'), 'utf8');
  return [...html.matchAll(/include\('([a-z_]+)'\)/g)].map(m => m[1]);
}

/** Objeto "aceita tudo": qualquer propriedade/chamada devolve outro objeto igual (stub de elementos do DOM). */
function ghost() {
  return new Proxy(function () {}, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : ghost()),
    apply: () => ghost(), construct: () => ghost(), set: () => true
  });
}

function loadFront(files = ['js_core.html'], opts = {}) {
  const listeners = {}, sent = [], apiCalls = [];
  const handler = opts.api || (() => ({}));

  const document = new Proxy({ addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); }, title: '' }, {
    get: (t, k) => (k in t ? t[k] : ghost()), set: (t, k, v) => { t[k] = v; return true }
  });
  const win = { addEventListener() {}, onbeforeunload: null, top: { postMessage: m => sent.push(m) } };
  const google = { script: { get run() {
    const st = {};
    const r = {
      withSuccessHandler(f) { st.ok = f; return r; },
      withFailureHandler(f) { st.no = f; return r; },
      api(route, p, pin) { apiCalls.push({ route, p, pin }); Promise.resolve().then(() => { try { st.ok(handler(route, p, pin)); } catch (e) { st.no(e); } }); }
    };
    return r;
  } } };

  const ctx = vm.createContext(Object.assign({
    console, document, window: win, google, setTimeout, clearTimeout,
    matchMedia: () => ({ matches: false }), scrollTo() {}, requestAnimationFrame: f => f(),
    getComputedStyle: () => ({ getPropertyValue: n => ({ '--surface': ' #ffffff', '--bg': '#f5f6fa' }[n] || '') }),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, Image: function () {}, URL: { createObjectURL: () => '' }
  }, opts.globals));

  for (const f of files) new vm.Script(scriptOf(f), { filename: f }).runInContext(ctx);

  const raw = code => vm.runInContext(code, ctx);
  return {
    ctx, win, listeners, sent, apiCalls,
    eval: raw,                                           // valor "cru" (promessas, funções)
    run: code => { const v = raw(code); return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); },
    fire: (type, ev) => (listeners[type] || []).forEach(fn => fn(ev))
  };
}

/** Carrega o app inteiro, na ordem do index.html. */
function loadFullApp(opts) {
  const files = indexIncludes().filter(n => n.startsWith('js_')).map(n => n + '.html');
  return loadFront(files, opts);
}

module.exports = { loadFront, loadFullApp, scriptOf, indexIncludes, GAS_DIR };
