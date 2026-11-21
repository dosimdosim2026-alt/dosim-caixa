'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('../helpers/gas-mock');

describe('Catálogo — produtos/serviços e despesas', () => {
  test('cria item com valor padrão e devolve número', () => {
    const b = loadBackend();
    b.call('catalogo.save', { nome: 'Brigadeiro', tipo: 'entrada', preco: 4.5 });
    const i = b.call('catalogo.list')[0];
    assert.equal(i.preco, 4.5); assert.equal(i.ativo, true);
  });

  test('valor padrão é opcional (vazio) e não aceita negativo', () => {
    const b = loadBackend();
    b.call('catalogo.save', { nome: 'Gasolina', tipo: 'saida', preco: '' });
    assert.equal(b.call('catalogo.list')[0].preco, '');
    assert.throws(() => b.call('catalogo.save', { nome: 'X', tipo: 'saida', preco: -1 }), /Valor padrão inválido/);
  });

  test('nome obrigatório e tipo válido', () => {
    const b = loadBackend();
    assert.throws(() => b.call('catalogo.save', { nome: ' ', tipo: 'entrada' }), /Informe o nome/);
    assert.throws(() => b.call('catalogo.save', { nome: 'X', tipo: 'z' }), /Tipo inválido/);
  });

  test('bloqueia duplicado ignorando maiúsculas e acentos, só dentro do mesmo tipo', () => {
    const b = loadBackend();
    b.call('catalogo.save', { nome: 'Gasolina', tipo: 'saida' });
    assert.throws(() => b.call('catalogo.save', { nome: '  gasolína ', tipo: 'saida' }), /Já existe/);
    b.call('catalogo.save', { nome: 'Gasolina', tipo: 'entrada' });          // outro tipo: permitido
    assert.equal(b.call('catalogo.list').length, 2);
  });

  test('editar o próprio item mantendo o nome não conta como duplicado', () => {
    const b = loadBackend();
    const i = b.call('catalogo.save', { nome: 'Bolo', tipo: 'entrada', preco: 10 });
    b.call('catalogo.save', { id: i.id, nome: 'Bolo', tipo: 'entrada', preco: 12 });
    assert.equal(b.call('catalogo.list')[0].preco, 12);
  });

  test('exclui item', () => {
    const b = loadBackend();
    const i = b.call('catalogo.save', { nome: 'Bolo', tipo: 'entrada' });
    b.call('catalogo.remove', { id: i.id });
    assert.equal(b.call('catalogo.list').length, 0);
  });
});
