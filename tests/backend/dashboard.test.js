'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('../helpers/gas-mock');

describe('Painel — indicadores', () => {
  test('totais do mês contam só lançamentos realizados; pendentes ficam à parte', () => {
    const b = loadBackend();
    b.lanc({ valor: 100 }); b.lanc({ valor: 50, status: 'pendente' });
    b.lanc({ tipo: 'saida', valor: 30 }); b.lanc({ tipo: 'saida', valor: 20, status: 'pendente' });
    b.lanc({ valor: 999, data: '2026-10-10' });                      // outro mês
    const d = b.call('dashboard.summary', { mes: '2026-11' });
    assert.deepEqual([d.entradas, d.saidas, d.saldo, d.aReceber, d.aPagar], [100, 30, 70, 50, 20]);
  });

  test('série tem 6 meses terminando no mês consultado', () => {
    const b = loadBackend();
    b.lanc({ data: '2026-06-10', valor: 10 }); b.lanc({ data: '2026-11-10', valor: 60 });
    const s = b.call('dashboard.summary', { mes: '2026-11' }).serie;
    assert.deepEqual(s.map(x => x.mes), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    assert.equal(s[0].entradas, 10); assert.equal(s[5].entradas, 60);
  });

  test('série atravessa a virada de ano', () => {
    const b = loadBackend();
    const s = b.call('dashboard.summary', { mes: '2027-02' }).serie;
    assert.deepEqual(s.map(x => x.mes), ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02']);
  });

  test('maiores saídas: ordenadas, no máximo 6, só realizadas', () => {
    const b = loadBackend();
    for (let i = 1; i <= 7; i++) { const c = b.cat('Saída ' + i, 'saida'); b.lanc({ tipo: 'saida', categoria_id: c.id, valor: i * 10 }); }
    const c8 = b.cat('Pendente', 'saida'); b.lanc({ tipo: 'saida', categoria_id: c8.id, valor: 9999, status: 'pendente' });
    const top = b.call('dashboard.summary', { mes: '2026-11' }).porCategoria;
    assert.equal(top.length, 6); assert.equal(top[0].nome, 'Saída 7'); assert.equal(top[0].total, 70);
    assert.ok(!top.some(t => t.nome === 'Pendente'));
  });

  test('pendências por contato somam a receber e a pagar, de todos os meses', () => {
    const b = loadBackend();
    b.lanc({ status: 'pendente', valor: 100, contato_nome: 'Maria', data: '2026-09-01' });
    b.lanc({ status: 'pendente', valor: 40, contato_nome: 'maria', data: '2026-11-01' });
    b.lanc({ tipo: 'saida', status: 'pendente', valor: 30, contato_nome: 'Maria' });
    b.lanc({ status: 'pendente', valor: 5 });                                   // sem contato: não entra
    const p = b.call('dashboard.summary', { mes: '2026-11' }).porContato;
    assert.equal(p.length, 1); assert.deepEqual([p[0].aReceber, p[0].aPagar], [140, 30]);
  });
});
