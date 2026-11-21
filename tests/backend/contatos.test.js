'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('../helpers/gas-mock');

describe('Contatos — cliente, fornecedor ou os dois', () => {
  test('exige pelo menos uma marcação (cliente ou fornecedor)', () => {
    const b = loadBackend();
    assert.throws(() => b.call('contatos.save', { nome: 'Ana' }), /cliente, fornecedor ou ambos/);
  });

  test('o mesmo contato pode ser cliente e fornecedor', () => {
    const b = loadBackend();
    b.call('contatos.save', { nome: 'Maria', cliente: true, fornecedor: true });
    const c = b.call('contatos.list')[0];
    assert.equal(c.cliente, true); assert.equal(c.fornecedor, true);
  });

  test('bloqueia nome duplicado (sem caixa/acento) mas permite editar o próprio', () => {
    const b = loadBackend();
    const c = b.call('contatos.save', { nome: 'José Lima', cliente: true });
    assert.throws(() => b.call('contatos.save', { nome: 'jose lima', fornecedor: true }), /Já existe/);
    b.call('contatos.save', { id: c.id, nome: 'José Lima', cliente: true, telefone: '31' });
    assert.equal(b.call('contatos.list')[0].telefone, '31');
  });

  test('filtra por papel', () => {
    const b = loadBackend();
    b.call('contatos.save', { nome: 'A', cliente: true });
    b.call('contatos.save', { nome: 'B', fornecedor: true });
    b.call('contatos.save', { nome: 'C', cliente: true, fornecedor: true });
    assert.deepEqual(b.call('contatos.list', { papel: 'cliente' }).map(c => c.nome), ['A', 'C']);
    assert.deepEqual(b.call('contatos.list', { papel: 'fornecedor' }).map(c => c.nome), ['B', 'C']);
  });

  test('excluir o contato não apaga o histórico (nome fica no lançamento)', () => {
    const b = loadBackend();
    const c = b.call('contatos.save', { nome: 'Ana', cliente: true });
    b.lanc({ contato_id: c.id });
    b.call('contatos.remove', { id: c.id });
    assert.equal(b.call('lancamentos.list')[0].contato_nome, 'Ana');
  });
});
