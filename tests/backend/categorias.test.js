'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('../helpers/gas-mock');

describe('Categorias — tipos de entrada e saída', () => {
  test('cria, lista, edita e exclui', () => {
    const b = loadBackend();
    const c = b.cat('Vendas', 'entrada');
    assert.equal(b.call('categorias.list').length, 1);
    b.call('categorias.save', { id: c.id, nome: 'Vendas loja', tipo: 'entrada', cor: '#112233' });
    assert.equal(b.call('categorias.list')[0].nome, 'Vendas loja');
    b.call('categorias.remove', { id: c.id });
    assert.equal(b.call('categorias.list').length, 0);
  });

  test('valida nome, tipo e cor', () => {
    const b = loadBackend();
    assert.throws(() => b.cat('  ', 'entrada'), /Informe o nome/);
    assert.throws(() => b.cat('X', 'outro'), /Tipo inválido/);
    assert.equal(b.cat('Y', 'saida', { cor: 'vermelho' }).cor, '#64748B');
  });

  test('ativo volta como booleano e o padrão é ativa', () => {
    const b = loadBackend();
    const c = b.cat('A', 'entrada');
    assert.equal(b.call('categorias.list')[0].ativo, true);
    b.call('categorias.save', { id: c.id, nome: 'A', tipo: 'entrada', ativo: false });
    assert.equal(b.call('categorias.list')[0].ativo, false);
  });

  test('lista ordenada por tipo e depois por nome', () => {
    const b = loadBackend();
    b.cat('Zeta', 'saida'); b.cat('Beta', 'entrada'); b.cat('Alfa', 'saida');
    assert.deepEqual(b.call('categorias.list').map(c => c.nome), ['Beta', 'Alfa', 'Zeta']);
  });

  test('não exclui categoria usada em lançamento', () => {
    const b = loadBackend();
    const c = b.cat('Vendas', 'entrada');
    b.lanc({ categoria_id: c.id });
    assert.throws(() => b.call('categorias.remove', { id: c.id }), /em uso/);
  });

  test('não exclui categoria usada como padrão de item do catálogo', () => {
    const b = loadBackend();
    const c = b.cat('Doces', 'entrada');
    b.call('catalogo.save', { nome: 'Brigadeiro', tipo: 'entrada', categoria_id: c.id });
    assert.throws(() => b.call('categorias.remove', { id: c.id }), /em uso/);
  });
});
