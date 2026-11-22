'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('../helpers/gas-mock');

/** Chama o doPost como o Google chamaria e devolve { saida, json }. */
function post(b, corpo) {
  const saida = b.ctx.doPost({ postData: { contents: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) } });
  return { saida, json: JSON.parse(saida.getContent()) };
}

describe('doPost — API HTTP da PWA', () => {
  test('executa a rota e responde { ok: true, data } em JSON', () => {
    const b = loadBackend(); b.cat('Vendas', 'entrada');
    const { saida, json } = post(b, { route: 'categorias.list', payload: {} });
    assert.equal(saida.mime, 'JSON'); assert.equal(json.ok, true); assert.equal(json.data.length, 1);
  });

  test('salva dados de verdade (mesma regra do app dentro do Apps Script)', () => {
    const b = loadBackend();
    const { json } = post(b, { route: 'categorias.save', payload: { nome: 'Vendas', tipo: 'entrada' } });
    assert.equal(json.ok, true); assert.equal(b.call('categorias.list')[0].nome, 'Vendas');
  });

  test('erros viram { ok: false, error } em vez de estourar (o front mostra a mensagem)', () => {
    const b = loadBackend();
    assert.match(post(b, { route: 'nao.existe' }).json.error, /Rota inválida/);
    assert.match(post(b, { route: 'categorias.save', payload: { nome: ' ', tipo: 'entrada' } }).json.error, /Informe o nome/);
    const r = post(b, { route: 'categorias.save', payload: { nome: ' ', tipo: 'entrada' } }).json;
    assert.equal(r.ok, false);
  });

  test('corpo inválido ou ausente não derruba o servidor', () => {
    const b = loadBackend();
    assert.equal(post(b, 'isto não é json').json.ok, false);
    assert.equal(b.ctx.doPost({}).getContent().includes('"ok":false'), true);
    assert.equal(post(b, {}).json.ok, false);
  });

  test('com APP_PIN: sem PIN ou com PIN errado nenhum dado sai; com o PIN certo funciona', () => {
    for (const pin of [undefined, '0000']) {
      const b = loadBackend({ props: { APP_PIN: '1234' } });
      const r = post(b, { route: 'lancamentos.list', payload: {}, pin }).json;
      assert.equal(r.ok, false); assert.match(r.error, /PIN incorreto/); assert.equal(r.data, undefined);
    }
    const b = loadBackend({ props: { APP_PIN: '1234' } });
    assert.equal(post(b, { route: 'core.bootstrap', payload: {}, pin: '1234' }).json.ok, true);
  });

  test('o bloqueio por tentativas também vale pela PWA', () => {
    const b = loadBackend({ props: { APP_PIN: '1234' } });
    for (let i = 0; i < 5; i++) post(b, { route: 'auth.check', pin: 'x' });
    assert.match(post(b, { route: 'auth.check', pin: '1234' }).json.error, /Muitas tentativas/);
  });

  test('auth.status é público e só expõe a identidade visual', () => {
    const b = loadBackend({ props: { APP_PIN: '1234' } });
    const r = post(b, { route: 'auth.status' }).json;
    assert.equal(r.ok, true); assert.equal(r.data.required, true); assert.deepEqual(Object.keys(r.data.brand).sort(), ['empresa', 'logo', 'primary']);
  });
});
