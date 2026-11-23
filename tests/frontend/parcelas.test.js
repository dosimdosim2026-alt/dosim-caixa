'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadFront } = require('../helpers/front');
const { loadBackend } = require('../helpers/gas-mock');

const f = loadFront(['js_core.html', 'js_dashboard.html']);
const b = loadBackend();

describe('Parcelas e datas — o front calcula igual ao servidor (a prévia = o que será gravado)', () => {
  test('addMonthsISO == addMeses_ do servidor (dias 29/30/31, bissexto, virada de ano)', () => {
    for (const iso of ['2026-01-31', '2027-01-31', '2028-01-31', '2026-11-15', '2026-12-31', '2026-03-30', '2027-02-28', '2028-02-29'])
      for (let n = 0; n <= 14; n++) assert.equal(f.eval(`addMonthsISO('${iso}', ${n})`), b.run(`addMeses_('${iso}', ${n})`), `${iso} + ${n}`);
  });

  test('splitParcelas == splitParcelas_ do servidor e a soma é o total ao centavo', () => {
    for (const total of [100, 0.1, 999.99, 1, 1234.56, 50, 0.07])
      for (const n of [2, 3, 7, 12, 60]) {
        const a = f.run(`splitParcelas(${total}, ${n})`);
        assert.deepEqual(a, b.run(`splitParcelas_(${total}, ${n})`), `${total} em ${n}x`);
        assert.equal(a.reduce((s, v) => s + Math.round(v * 100), 0), Math.round(total * 100));
      }
  });

  test('exemplo: 100 em 3x = 33,33 + 33,33 + 33,34', () => assert.deepEqual(f.run('splitParcelas(100, 3)'), [33.33, 33.33, 33.34]));
});

describe('Vencimento em relação a hoje', () => {
  const v = (iso, hoje = '2026-11-22') => f.run(`vencInfo('${iso}', '${hoje}')`);
  test('vencida: ontem e há vários dias', () => {
    assert.deepEqual(v('2026-11-21'), { dias: -1, cls: 'late', texto: 'Venceu ontem' });
    assert.deepEqual(v('2026-11-12'), { dias: -10, cls: 'late', texto: 'Venceu há 10 dias' });
  });
  test('hoje, amanhã e até 7 dias (atenção)', () => {
    assert.deepEqual(v('2026-11-22'), { dias: 0, cls: 'today', texto: 'Vence hoje' });
    assert.deepEqual(v('2026-11-23'), { dias: 1, cls: 'soon', texto: 'Vence amanhã' });
    assert.deepEqual(v('2026-11-29'), { dias: 7, cls: 'soon', texto: 'Vence em 7 dias' });
  });
  test('depois de 7 dias mostra a data (com o ano só se for outro ano)', () => {
    assert.deepEqual(v('2026-11-30'), { dias: 8, cls: '', texto: 'Vence 30/11' });
    assert.equal(v('2027-01-10').texto, 'Vence 10/01/2027');
  });
  test('vira o mês e o ano sem erro (31/12 → 01/01)', () => {
    assert.equal(v('2027-01-01', '2026-12-31').texto, 'Vence amanhã'); assert.equal(v('2026-12-01', '2026-11-30').dias, 1);
  });
});

describe('Painel — cartão de contas a pagar / a receber', () => {
  const item = (o = {}) => ({ id: 'i1', descricao: 'Aluguel', valor: 1500, venc: '2026-11-20', parcela: '', parcelas: '', categoria: 'Aluguel', contato: 'Imobiliária', ...o });
  const dados = (pag = [], rec = []) => ({
    contasPagar: { total: 1500, qtd: pag.length, vencidas: { qtd: 1, total: 1500 }, proximos7: { qtd: 0, total: 0 }, itens: pag },
    contasReceber: { total: 0, qtd: rec.length, vencidas: { qtd: 0, total: 0 }, proximos7: { qtd: 0, total: 0 }, itens: rec }
  });
  const html = (d, tipo = 'saida') => { f.eval(`Radar.tipo = '${tipo}'`); return f.eval(`radarHtml(${JSON.stringify(d)}, '2026-11-22')`); };

  test('lista a conta com vencimento destacado, valor e botão Pagar', () => {
    const h = html(dados([item()]));
    assert.match(h, /Contas a pagar/); assert.match(h, /due late">Venceu há 2 dias/); assert.match(h, /Imobiliária/);
    assert.match(h, /data-baixa="i1">Pagar</); assert.match(h, /data-edit="i1"/);
  });
  test('mostra a numeração da parcela', () => assert.match(html(dados([item({ parcela: 2, parcelas: 12 })])), /<i class="chip">2\/12<\/i>/));
  test('na aba "a receber" o botão é Receber e o título muda', () => {
    const h = html(dados([], [item({ id: 'r1' })]), 'entrada');
    assert.match(h, /Contas a receber/); assert.match(h, /data-baixa="r1">Receber</);
  });
  test('texto vindo do usuário é escapado (sem HTML injetado)', () => {
    const h = html(dados([item({ descricao: '<img src=x onerror=alert(1)>', contato: '<b>x</b>' })]));
    assert.ok(!/<img src=x/.test(h) && !/<b>x<\/b>/.test(h)); assert.match(h, /&lt;img/);
  });
  test('resumo: vencidas em vermelho e total dos próximos 7 dias', () => {
    const d = dados([item()]); d.contasPagar.proximos7 = { qtd: 1, total: 80 };
    const h = html(d); assert.match(h, /1 vencida · /); assert.match(h, /Próximos 7 dias · /);
  });
  test('vazio: mensagem em vez de lista; "Ver todas" só quando há mais itens do que os exibidos', () => {
    assert.match(html(dados([])), /Nenhuma conta a pagar em aberto/);
    const d = dados([item()]); d.contasPagar.qtd = 12;
    assert.match(html(d), /Ver todas \(12\)/);
    assert.ok(!/Ver todas/.test(html(dados([item()]))));
  });
});
