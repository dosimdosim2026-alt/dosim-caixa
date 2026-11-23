'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('../helpers/gas-mock');

describe('Vencimento separado da data do lançamento', () => {
  test('lançamento simples guarda o vencimento; sem vencimento fica vazio', () => {
    const b = loadBackend();
    assert.equal(b.lanc({ status: 'pendente', vencimento: '2026-12-05' }).vencimento, '2026-12-05');
    assert.equal(b.lanc({}).vencimento, '');
  });

  test('datas inexistentes (31/02) são recusadas na data e no vencimento', () => {
    const b = loadBackend();
    assert.throws(() => b.lanc({ data: '2026-02-31' }), /data válida/);
    assert.throws(() => b.lanc({ vencimento: '2026-02-31' }), /vencimento válido/);
    assert.throws(() => b.lanc({ vencimento: '05/12/2026' }), /vencimento válido/);
  });

  test('a lista por mês segue o vencimento: lançado em novembro, vence em dezembro → aparece em dezembro', () => {
    const b = loadBackend();
    b.lanc({ data: '2026-11-10', vencimento: '2026-12-05', status: 'pendente', descricao: 'Boleto' });
    b.lanc({ data: '2026-11-12', descricao: 'Venda à vista' });                         // sem vencimento: segue a data
    assert.deepEqual(b.call('lancamentos.list', { mes: '2026-11' }).map(l => l.descricao), ['Venda à vista']);
    assert.deepEqual(b.call('lancamentos.list', { mes: '2026-12' }).map(l => l.descricao), ['Boleto']);
  });

  test('filtro por situação (pendente/pago) e ordem do mais próximo ao mais distante', () => {
    const b = loadBackend();
    b.lanc({ status: 'pendente', vencimento: '2026-12-20', descricao: 'C' });
    b.lanc({ status: 'pendente', vencimento: '2026-11-25', descricao: 'A' });
    b.lanc({ status: 'pago', descricao: 'Pago' });
    b.lanc({ status: 'pendente', vencimento: '2026-12-01', descricao: 'B' });
    assert.equal(b.call('lancamentos.list', { status: 'pago' }).length, 1);
    assert.deepEqual(b.call('lancamentos.list', { status: 'pendente', ordem: 'asc' }).map(l => l.descricao), ['A', 'B', 'C']);
    assert.deepEqual(b.call('lancamentos.list', { status: 'pendente' }).map(l => l.descricao), ['C', 'B', 'A']);     // padrão: mais recente primeiro
  });

  test('painel: pendente conta no vencimento (previsão); realizado conta no dia do pagamento', () => {
    const b = loadBackend();
    b.lanc({ tipo: 'saida', valor: 200, data: '2026-11-10', vencimento: '2026-12-10', status: 'pendente' });                         // previsão de dezembro
    b.lanc({ tipo: 'saida', valor: 50, data: '2026-11-10', vencimento: '2026-12-12', status: 'pago', data_pagamento: '2026-12-12' }); // pago em dezembro
    b.lanc({ tipo: 'saida', valor: 30, data: '2026-11-10', vencimento: '2026-12-15', status: 'pago' });                              // pago, sem data: vale a do lançamento (nov)
    const nov = b.call('dashboard.summary', { mes: '2026-11' }), dez = b.call('dashboard.summary', { mes: '2026-12' });
    assert.deepEqual([nov.saidas, nov.aPagar], [30, 0]);
    assert.deepEqual([dez.saidas, dez.aPagar], [50, 200]);
    assert.equal(dez.serie[5].saidas, 50); assert.equal(nov.serie[5].saidas, 30);
  });

  test('registros antigos (sem a coluna vencimento) continuam iguais', () => {
    const b = loadBackend();
    const sh = b.ss.insertSheet('lancamentos');
    sh.getRange(1, 1, 1, 8).setValues([['id', 'data', 'tipo', 'categoria_id', 'descricao', 'valor', 'status', 'criado_em']]);
    sh.appendRow(['L1', '2026-11-10', 'saida', 'c1', 'Antigo', 70, 'pago', '2026-11-10 10:00:00']);
    assert.equal(b.call('dashboard.summary', { mes: '2026-11' }).saidas, 70);
    assert.equal(b.call('lancamentos.list', { mes: '2026-11' })[0].vencimento, '');
  });
});
