'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('../helpers/gas-mock');

describe('Núcleo — bootstrap, roteador e página', () => {
  test('bootstrap cria as abas e semeia 8 categorias uma única vez', () => {
    const b = loadBackend();
    const r1 = b.call('core.bootstrap'); const r2 = b.call('core.bootstrap');
    assert.equal(r1.categorias.length, 8); assert.equal(r2.categorias.length, 8);
    for (const aba of ['categorias', 'lancamentos', 'catalogo', 'contatos', 'config']) assert.ok(b.sheet(aba), 'falta a aba ' + aba);
  });

  test('bootstrap devolve tudo que o front precisa', () => {
    const r = loadBackend().call('core.bootstrap');
    assert.deepEqual(Object.keys(r).sort(), ['catalogo', 'categorias', 'config', 'contatos']);
  });

  test('rota inexistente é recusada', () => {
    assert.throws(() => loadBackend().call('nao.existe'), /Rota inválida/);
  });

  test('toda rota de CRUD está registrada', () => {
    const rotas = loadBackend().run('Object.keys(routes_())');
    for (const m of ['categorias', 'catalogo', 'contatos', 'lancamentos']) for (const a of ['list', 'save', 'remove']) assert.ok(rotas.includes(`${m}.${a}`), `${m}.${a}`);
    for (const r of ['core.bootstrap', 'dashboard.summary', 'settings.get', 'settings.save']) assert.ok(rotas.includes(r), r);
  });

  test('include() devolve o conteúdo do arquivo HTML', () => {
    const b = loadBackend();
    assert.match(b.ctx.include('css'), /<style>/);
  });
});
