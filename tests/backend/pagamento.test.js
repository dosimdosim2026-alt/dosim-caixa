'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('../helpers/gas-mock');

const sum = (b, p) => b.call('dashboard.summary', { hoje: '2026-12-31', ...p });

describe('Data do pagamento — o realizado conta no dia em que o dinheiro saiu', () => {
  test('realizado sem data de pagamento usa a data do lançamento', () => {
    assert.equal(loadBackend().lanc({ status: 'pago', data: '2026-11-10' }).data_pagamento, '2026-11-10');
  });
  test('data de pagamento informada é gravada; inexistente (31/02) é recusada', () => {
    const b = loadBackend();
    assert.equal(b.lanc({ status: 'pago', data: '2026-11-10', data_pagamento: '2026-11-18' }).data_pagamento, '2026-11-18');
    assert.throws(() => b.lanc({ status: 'pago', data_pagamento: '2026-02-31' }), /data de pagamento válida/);
    assert.throws(() => b.lanc({ status: 'pago', data_pagamento: '18/11/2026' }), /data de pagamento válida/);
  });
  test('pendente nunca tem data de pagamento (mesmo que o pedido envie uma)', () => {
    assert.equal(loadBackend().lanc({ status: 'pendente', data_pagamento: '2026-11-18' }).data_pagamento, '');
  });
  test('conta lançada em novembro, com vencimento em dezembro e paga em novembro: conta em NOVEMBRO', () => {
    const b = loadBackend();
    b.lanc({ tipo: 'saida', valor: 80, data: '2026-11-05', vencimento: '2026-12-10', status: 'pago', data_pagamento: '2026-11-28' });
    assert.equal(sum(b, { mes: '2026-11' }).saidas, 80); assert.equal(sum(b, { mes: '2026-12' }).saidas, 0);
  });
  test('vencia em novembro e foi paga em dezembro: antes da baixa é previsão de novembro; depois, saída de dezembro', () => {
    const b = loadBackend();
    const l = b.lanc({ tipo: 'saida', valor: 120, data: '2026-10-20', vencimento: '2026-11-25', status: 'pendente' });
    assert.deepEqual([sum(b, { mes: '2026-11' }).aPagar, sum(b, { mes: '2026-11' }).saidas], [120, 0]);
    b.call('lancamentos.baixa', { id: l.id, data_pagamento: '2026-12-03' });
    assert.deepEqual([sum(b, { mes: '2026-11' }).aPagar, sum(b, { mes: '2026-11' }).saidas], [0, 0]);
    assert.deepEqual([sum(b, { mes: '2026-12' }).aPagar, sum(b, { mes: '2026-12' }).saidas], [0, 120]);
  });
  test('a lista de lançamentos por mês também segue o pagamento', () => {
    const b = loadBackend();
    b.lanc({ tipo: 'saida', data: '2026-11-05', status: 'pago', data_pagamento: '2026-12-02', descricao: 'Paga em dez' });
    assert.equal(b.call('lancamentos.list', { mes: '2026-11' }).length, 0);
    assert.equal(b.call('lancamentos.list', { mes: '2026-12' })[0].descricao, 'Paga em dez');
  });
  test('editar: pago→pendente limpa a data; pendente→pago sem data usa a do lançamento; editar sem enviar a data preserva a gravada', () => {
    const b = loadBackend();
    const l = b.lanc({ status: 'pago', data: '2026-11-10', data_pagamento: '2026-11-18' });
    assert.equal(b.call('lancamentos.save', { ...l, descricao: 'x', data_pagamento: undefined }).data_pagamento, '2026-11-18');
    const pend = b.call('lancamentos.save', { ...l, status: 'pendente' }); assert.equal(pend.data_pagamento, '');
    assert.equal(b.call('lancamentos.save', { ...pend, status: 'pago' }).data_pagamento, '2026-11-10');
  });
  test('registros antigos (realizados sem data de pagamento) usam vencimento ou data, como antes', () => {
    const b = loadBackend();
    const sh = b.ss.insertSheet('lancamentos');
    sh.getRange(1, 1, 1, 8).setValues([['id', 'data', 'tipo', 'categoria_id', 'descricao', 'valor', 'status', 'criado_em']]);
    sh.appendRow(['L1', '2026-11-10', 'saida', 'c1', 'Antigo', 70, 'pago', '2026-11-10 10:00:00']);
    assert.equal(sum(b, { mes: '2026-11' }).saidas, 70);
  });
});

describe('Baixa — marcar como pago/recebido gravando a data do pagamento', () => {
  const pendente = b => b.lanc({ tipo: 'saida', valor: 100, data: '2026-11-01', vencimento: '2026-11-25', status: 'pendente' });

  test('sem data informada usa "hoje" do pedido; a data informada tem prioridade', () => {
    const b = loadBackend(); const a = pendente(b), c = pendente(b);
    assert.equal(b.call('lancamentos.baixa', { id: a.id, hoje: '2026-11-22' }).data_pagamento, '2026-11-22');
    assert.equal(b.call('lancamentos.baixa', { id: c.id, hoje: '2026-11-22', data_pagamento: '2026-11-20' }).data_pagamento, '2026-11-20');
  });
  test('sem "hoje" no pedido usa a data do servidor (formato válido)', () => {
    const b = loadBackend();
    assert.match(b.call('lancamentos.baixa', { id: pendente(b).id }).data_pagamento, /^\d{4}-\d{2}-\d{2}$/);
  });
  test('registra a forma usada no pagamento (e ignora forma inválida)', () => {
    const b = loadBackend(); const a = pendente(b), c = pendente(b);
    assert.equal(b.call('lancamentos.baixa', { id: a.id, forma: 'debito' }).forma, 'debito');
    assert.equal(b.call('lancamentos.baixa', { id: c.id, forma: 'cheque' }).forma, 'pix');
  });
  test('repetir a baixa não muda a data já gravada, a menos que uma nova seja informada', () => {
    const b = loadBackend(); const a = pendente(b);
    b.call('lancamentos.baixa', { id: a.id, data_pagamento: '2026-11-20' });
    assert.equal(b.call('lancamentos.baixa', { id: a.id, hoje: '2026-12-01' }).data_pagamento, '2026-11-20');
    assert.equal(b.call('lancamentos.baixa', { id: a.id, data_pagamento: '2026-11-21' }).data_pagamento, '2026-11-21');
  });
  test('data inválida e registro inexistente: erro claro', () => {
    const b = loadBackend();
    assert.throws(() => b.call('lancamentos.baixa', { id: pendente(b).id, data_pagamento: '2026-02-30' }), /data de pagamento válida/);
    assert.throws(() => b.call('lancamentos.baixa', { id: 'x' }), /Registro não encontrado/);
  });
  test('parcela paga antecipada conta no dia do pagamento e sai do radar', () => {
    const b = loadBackend();
    const ps = b.lanc({ tipo: 'saida', valor: 300, data: '2026-11-01', vencimento: '2026-12-05', parcelado: true, parcelas: 3 });
    b.call('lancamentos.baixa', { id: ps[0].id, data_pagamento: '2026-11-28' });
    assert.equal(sum(b, { mes: '2026-11' }).saidas, 100); assert.equal(sum(b, { mes: '2026-12' }).saidas, 0);
    assert.equal(sum(b, { mes: '2026-11' }).contasPagar.qtd, 2);
  });
  test('1ª parcela já paga: usa a data informada (ou a do lançamento); as outras ficam sem data', () => {
    const b = loadBackend();
    const a = b.lanc({ tipo: 'saida', valor: 300, data: '2026-11-01', vencimento: '2026-12-05', parcelado: true, parcelas: 3, primeira_paga: true });
    assert.deepEqual(a.map(p => p.data_pagamento), ['2026-11-01', '', '']);
    const c = b.lanc({ tipo: 'saida', valor: 300, data: '2026-11-01', vencimento: '2026-12-05', parcelado: true, parcelas: 3, primeira_paga: true, data_pagamento: '2026-11-03' });
    assert.deepEqual(c.map(p => p.data_pagamento), ['2026-11-03', '', '']);
  });
});

describe('Fechamento por dia, mês e ano', () => {
  function cenario() {
    const b = loadBackend();
    b.lanc({ tipo: 'entrada', valor: 500, data: '2026-11-20', data_pagamento: '2026-11-20' });
    b.lanc({ tipo: 'saida', valor: 120, data: '2026-11-20', data_pagamento: '2026-11-20' });
    b.lanc({ tipo: 'saida', valor: 80, data: '2026-11-18', vencimento: '2026-11-21', data_pagamento: '2026-11-21' });
    b.lanc({ tipo: 'entrada', valor: 1000, data: '2026-05-10' });
    b.lanc({ tipo: 'saida', valor: 300, data: '2026-12-31', data_pagamento: '2026-12-31' });
    b.lanc({ tipo: 'saida', valor: 40, data: '2025-12-31', data_pagamento: '2025-12-31' });                 // ano anterior
    b.lanc({ tipo: 'saida', valor: 999, data: '2026-11-20', status: 'pendente', vencimento: '2026-11-20' }); // pendente: fora do realizado
    return b;
  }
  test('dia: só o que foi pago/recebido naquele dia', () => {
    const d = sum(cenario(), { periodo: 'dia', ref: '2026-11-20' });
    assert.deepEqual([d.entradas, d.saidas, d.saldo], [500, 120, 380]);
    assert.equal(sum(cenario(), { periodo: 'dia', ref: '2026-11-21' }).saidas, 80);
  });
  test('dia: devolve as movimentações do dia (realizadas), com categoria', () => {
    const d = sum(cenario(), { periodo: 'dia', ref: '2026-11-20' });
    assert.equal(d.movimentos.length, 2); assert.ok(d.movimentos.every(m => m.status === 'pago' && m.categoria));
  });
  test('mês e ano não trazem a lista de movimentações (ela é só do dia)', () => {
    assert.equal(sum(cenario(), { periodo: 'mes', ref: '2026-11' }).movimentos, undefined);
    assert.equal(sum(cenario(), { periodo: 'ano', ref: '2026' }).movimentos, undefined);
  });
  test('mês: soma o mês inteiro', () => {
    const d = sum(cenario(), { periodo: 'mes', ref: '2026-11' });
    assert.deepEqual([d.entradas, d.saidas], [500, 200]);
  });
  test('ano: soma o ano inteiro e a virada de ano separa os anos (31/12/2026 ≠ 31/12/2025)', () => {
    const d = sum(cenario(), { periodo: 'ano', ref: '2026' });
    assert.deepEqual([d.entradas, d.saidas, d.saldo], [1500, 500, 1000]);
    assert.equal(sum(cenario(), { periodo: 'ano', ref: '2025' }).saidas, 40);
  });
  test('gráfico: dia = 7 dias terminando no dia; mês = 6 meses; ano = 12 meses do ano', () => {
    const b = cenario();
    assert.deepEqual(sum(b, { periodo: 'dia', ref: '2026-11-20' }).serie.map(s => s.mes), ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
    assert.equal(sum(b, { periodo: 'mes', ref: '2026-11' }).serie.length, 6);
    const ano = sum(b, { periodo: 'ano', ref: '2026' }).serie;
    assert.equal(ano.length, 12); assert.equal(ano[0].mes, '2026-01'); assert.equal(ano[11].mes, '2026-12');
    assert.equal(ano[4].entradas, 1000); assert.equal(ano[10].saidas, 200); assert.equal(ano[11].saidas, 300);
  });
  test('série de dias atravessa mês e ano (01/01 mostra 26–31/12)', () => {
    const s = sum(loadBackend(), { periodo: 'dia', ref: '2027-01-01' }).serie.map(x => x.mes);
    assert.deepEqual([s[0], s[1], s[6]], ['2026-12-26', '2026-12-27', '2027-01-01']);
  });
  test('maiores saídas seguem o período', () => {
    const b = loadBackend(); const c = b.cat('Luz', 'saida');
    b.lanc({ tipo: 'saida', categoria_id: c.id, valor: 90, data: '2026-11-03', data_pagamento: '2026-11-03' });
    b.lanc({ tipo: 'saida', categoria_id: c.id, valor: 10, data: '2026-11-04', data_pagamento: '2026-11-04' });
    assert.equal(sum(b, { periodo: 'dia', ref: '2026-11-03' }).porCategoria[0].total, 90);
    assert.equal(sum(b, { periodo: 'mes', ref: '2026-11' }).porCategoria[0].total, 100);
  });
  test('o radar de contas em aberto não depende do período escolhido', () => {
    const b = cenario();
    for (const p of [{ periodo: 'dia', ref: '2026-01-01' }, { periodo: 'mes', ref: '2020-05' }, { periodo: 'ano', ref: '2030' }]) assert.equal(sum(b, p).contasPagar.total, 999);
  });
  test('períodos inválidos são recusados', () => {
    const b = loadBackend();
    for (const p of [{ periodo: 'dia', ref: '2026-11' }, { periodo: 'dia', ref: '2026-02-31' }, { periodo: 'mes', ref: '2026' }, { periodo: 'ano', ref: '26' }, { periodo: 'mes', ref: '' }])
      assert.throws(() => sum(b, p), /Período inválido/, JSON.stringify(p));
  });
  test('compatível com o pedido antigo (só "mes", sem "periodo")', () => {
    const d = sum(cenario(), { mes: '2026-11' }); assert.equal(d.periodo, 'mes'); assert.equal(d.saidas, 200);
  });
});
