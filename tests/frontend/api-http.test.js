'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadFront } = require('../helpers/front');

const URL = 'https://script.google.com/macros/s/AKfycbTESTE/exec';
const resp = corpo => ({ json: async () => corpo });
/** Carrega o front "como PWA": sem google.script.run, com config.js e um fetch falso que registra as chamadas. */
function pwa(fetchImpl, extra = {}) {
  const chamadas = [];
  const g = loadFront(['js_core.html'], Object.assign({
    noGoogle: true, appConfig: { APP_URL: URL },
    globals: { fetch: async (url, init) => { chamadas.push({ url, init }); return fetchImpl(url, init); } }
  }, extra));
  return { g, chamadas };
}

describe('API fora do Apps Script (PWA → fetch)', () => {
  test('faz POST "simples": só Content-Type text/plain, sem cookies (não dispara preflight CORS)', async () => {
    const { g, chamadas } = pwa(() => resp({ ok: true, data: [1, 2] }));
    g.eval("Store.pin = '1234'");
    const r = await g.eval("API.call('lancamentos.list', { mes: '2026-11' })");
    assert.deepEqual(JSON.parse(JSON.stringify(r)), [1, 2]);
    const { url, init } = chamadas[0];
    assert.equal(url, URL); assert.equal(init.method, 'POST'); assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'follow');
    assert.deepEqual(Object.keys(init.headers), ['Content-Type']);
    assert.match(init.headers['Content-Type'], /^text\/plain/);                 // application/json exigiria preflight, que o Apps Script não responde
    assert.deepEqual(JSON.parse(init.body), { route: 'lancamentos.list', payload: { mes: '2026-11' }, pin: '1234' });
  });

  test('o PIN pode ser informado na chamada (tela de PIN) e sem PIN vai vazio', async () => {
    const { g, chamadas } = pwa(() => resp({ ok: true, data: {} }));
    await g.eval("API.call('auth.check', {}, 'abcd')"); assert.equal(JSON.parse(chamadas.at(-1).init.body).pin, 'abcd');
    await g.eval("API.call('core.bootstrap')"); assert.equal(JSON.parse(chamadas.at(-1).init.body).pin, '');
  });

  test('erro do servidor (ex.: PIN incorreto) vira Error com a mensagem', async () => {
    const { g } = pwa(() => resp({ ok: false, error: 'PIN incorreto.' }));
    await assert.rejects(() => g.eval("API.call('x')"), /PIN incorreto/);
  });

  test('sem internet: mensagem amigável', async () => {
    const { g } = pwa(() => { throw new TypeError('Failed to fetch'); });
    await assert.rejects(() => g.eval("API.call('x')"), /Sem conexão/);
  });

  test('resposta que não é JSON (ex.: página de login do Google) explica o que conferir', async () => {
    const { g } = pwa(() => ({ json: async () => { throw new SyntaxError('Unexpected token <'); } }));
    await assert.rejects(() => g.eval("API.call('x')"), /Qualquer pessoa/);
  });

  test('sem APP_URL no config.js: aviso claro', async () => {
    const { g } = pwa(() => resp({ ok: true }), { appConfig: {} });
    await assert.rejects(() => g.eval("API.call('x')"), /config\.js/);
  });

  test('dentro do Apps Script continua usando google.script.run (não usa fetch)', async () => {
    const chamadas = [];
    const g = loadFront(['js_core.html'], { globals: { fetch: async () => { chamadas.push(1); return resp({ ok: true }); } } });
    await g.eval("API.call('lancamentos.list', {})");
    assert.equal(chamadas.length, 0); assert.equal(g.apiCalls.length, 1);
  });
});
