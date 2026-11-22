'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadFront } = require('../helpers/front');
const { loadBackend } = require('../helpers/gas-mock');

const f = loadFront(['js_core.html']);
const nbsp = s => String(s).replace(/\u00a0/g, ' ');

describe('Máscara bancária de valores', () => {
  const casos = [['', ''], ['abc', ''], ['1', 'R$ 0,01'], ['10', 'R$ 0,10'], ['100', 'R$ 1,00'], ['1000', 'R$ 10,00'],
                 ['12345', 'R$ 123,45'], ['123456789', 'R$ 1.234.567,89'], ['0001000', 'R$ 10,00'], ['R$ 10,00', 'R$ 10,00'], ['R$ 10,005', 'R$ 100,05']];
  for (const [entrada, saida] of casos)
    test(`maskMoney(${JSON.stringify(entrada)}) → ${JSON.stringify(saida)}`, () => assert.equal(f.eval(`maskMoney(${JSON.stringify(entrada)})`), saida));

  test('limita a 12 dígitos', () => assert.equal(f.eval("maskMoney('1'.repeat(20))").replace(/\D/g, '').length, 12));

  test('moneyFmt formata números vindos do servidor', () => {
    assert.equal(f.eval('moneyFmt(10)'), 'R$ 10,00');
    assert.equal(f.eval('moneyFmt(1234.5)'), 'R$ 1.234,50');
    assert.equal(f.eval('moneyFmt(0.07)'), 'R$ 0,07');
    assert.equal(f.eval('moneyFmt(1.15)'), 'R$ 1,15');          // sem erro de ponto flutuante
    assert.equal(f.eval("moneyFmt('')"), ''); assert.equal(f.eval('moneyFmt(null)'), '');
  });

  test('parseMoney volta ao número (ida e volta sem perda)', () => {
    assert.equal(f.eval("parseMoney('R$ 10,00')"), 10);
    assert.equal(f.eval("parseMoney('R$ 1.234,56')"), 1234.56);
    assert.equal(f.eval("parseMoney('')"), ''); assert.equal(f.eval("parseMoney('abc')"), '');
    for (const n of [0.01, 9.99, 100, 1234.56, 99999.99]) assert.equal(f.eval(`parseMoney(moneyFmt(${n}))`), n);
  });

  test('campos [data-money] são mascarados ao digitar; os demais não', () => {
    const money = { matches: s => s === '[data-money]', value: '1000' };
    f.fire('input', { target: money }); assert.equal(money.value, 'R$ 10,00');
    const outro = { matches: () => false, value: '1000' };
    f.fire('input', { target: outro }); assert.equal(outro.value, '1000');
  });
});

describe('Utilitários', () => {
  test('esc escapa HTML', () => assert.equal(f.eval(`esc('<a href="x">&\\'')`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;'));
  test('esc trata null/undefined', () => assert.equal(f.eval('esc(null) + esc(undefined)'), ''));
  test('norm ignora acento, caixa e espaços das pontas', () => assert.equal(f.eval("norm('  Gasolína ')"), 'gasolina'));
  test('fmtDate: aaaa-mm-dd → dd/mm', () => assert.equal(f.eval("fmtDate('2026-11-19')"), '19/11'));
  test('today() devolve aaaa-mm-dd', () => assert.match(f.eval('today()'), /^\d{4}-\d{2}-\d{2}$/));
  test('brl formata em reais', () => assert.equal(nbsp(f.eval('brl(1234.5)')), 'R$ 1.234,50'));
  test('formaCurta abrevia as formas', () => {
    assert.deepEqual(['pix', 'dinheiro', 'credito', 'debito', 'transferencia', 'x'].map(k => f.eval(`formaCurta('${k}')`)),
      ['Pix', 'Dinheiro', 'Crédito', 'Débito', 'Transferência', '']);
  });
  test('as formas do front são exatamente as aceitas pelo backend', () => {
    const front = f.run('FORMAS.map(x => x[0])').sort();
    const back = loadBackend().run('FORMAS_').sort();
    assert.deepEqual(front, back);
  });
});

describe('API (ponte com o Apps Script)', () => {
  test('envia rota, dados e o PIN guardado em Store.pin', async () => {
    const g = loadFront(['js_core.html']);
    g.eval("Store.pin = '1234'");
    await g.eval("API.call('lancamentos.list', { mes: '2026-11' })");
    assert.deepEqual(JSON.parse(JSON.stringify(g.apiCalls.at(-1))), { route: 'lancamentos.list', p: { mes: '2026-11' }, pin: '1234' });
  });

  test('o PIN pode ser informado explicitamente (tela de PIN) e sem PIN vai vazio', async () => {
    const g = loadFront(['js_core.html']);
    await g.eval("API.call('auth.check', {}, 'abcd')"); assert.equal(g.apiCalls.at(-1).pin, 'abcd');
    await g.eval("API.call('auth.status', {}, '')"); assert.equal(g.apiCalls.at(-1).pin, '');
    await g.eval("API.call('core.bootstrap')"); assert.equal(g.apiCalls.at(-1).pin, '');
  });

  test('erro do servidor vira Error com a mensagem original', async () => {
    const g = loadFront(['js_core.html'], { api: () => { throw new Error('PIN incorreto.'); } });
    await assert.rejects(() => g.eval("API.call('x')"), /PIN incorreto/);
  });
});

describe('Tema → barra de status da PWA (cor da marca)', () => {
  const meta = () => { const m = { attrs: {}, setAttribute(k, v) { m.attrs[k] = v; } }; return m; };
  const comMeta = m => loadFront(['js_core.html'], { docProps: { querySelector: sel => (sel === 'meta[name="theme-color"]' ? m : null) } });

  test('setBarColor pinta o theme-color com a cor principal escolhida em Ajustes', () => {
    const m = meta(); comMeta(m).eval("Theme.setBarColor('#BD647D')");
    assert.equal(m.attrs.content, '#BD647D');
  });
  test('cor inválida é ignorada (não quebra a barra)', () => {
    const m = meta(); const g = comMeta(m);
    g.eval("Theme.setBarColor('vermelho'); Theme.setBarColor(''); Theme.setBarColor(undefined)");
    assert.equal(m.attrs.content, undefined);
  });
  test('sem a tag theme-color (link do Apps Script) não dá erro', () => {
    assert.doesNotThrow(() => loadFront(['js_core.html']).eval("Theme.setBarColor('#BD647D')"));
  });
});

describe('Períodos (dia, semana, mês)', () => {
  const r = (modo, ref) => JSON.parse(f.eval(`JSON.stringify(periodRange(${JSON.stringify(modo)}, ${JSON.stringify(ref)}))`));

  test('dia: de = ate = a própria data', () => assert.deepEqual(r('dia', '2026-11-22'), { de: '2026-11-22', ate: '2026-11-22' }));

  test('semana vai de segunda a domingo (domingo pertence à semana que termina nele)', () => {
    assert.deepEqual(r('semana', '2026-11-22'), { de: '2026-11-16', ate: '2026-11-22' }); // domingo
    assert.deepEqual(r('semana', '2026-11-16'), { de: '2026-11-16', ate: '2026-11-22' }); // segunda
    assert.deepEqual(r('semana', '2026-11-18'), { de: '2026-11-16', ate: '2026-11-22' }); // quarta
  });

  test('semana que atravessa a virada de ano', () => assert.deepEqual(r('semana', '2027-01-01'), { de: '2026-12-28', ate: '2027-01-03' }));

  test('mês: do dia 1 ao último dia (30, 31, fevereiro e bissexto)', () => {
    assert.deepEqual(r('mes', '2026-11-10'), { de: '2026-11-01', ate: '2026-11-30' });
    assert.deepEqual(r('mes', '2026-12-31'), { de: '2026-12-01', ate: '2026-12-31' });
    assert.deepEqual(r('mes', '2027-02-01'), { de: '2027-02-01', ate: '2027-02-28' });
    assert.deepEqual(r('mes', '2028-02-15'), { de: '2028-02-01', ate: '2028-02-29' });
  });

  test('addDays anda para frente e para trás, atravessando mês e ano', () => {
    assert.equal(f.eval("addDays('2026-12-31', 1)"), '2027-01-01');
    assert.equal(f.eval("addDays('2026-03-01', -1)"), '2026-02-28');
    assert.equal(f.eval("addDays('2026-11-22', 7)"), '2026-11-29');
    assert.equal(f.eval("addDays('2026-11-22', -7)"), '2026-11-15');
  });

  test('fmtDateFull: aaaa-mm-dd → dd/mm/aaaa', () => assert.equal(f.eval("fmtDateFull('2026-11-22')"), '22/11/2026'));
});

describe('Alerta de vencimento e lista por dia', () => {
  const HOJE = '2026-11-22';
  const vi = (data, extra = {}) => JSON.parse(f.eval(`JSON.stringify(vencInfo(${JSON.stringify({ tipo: 'saida', status: 'pendente', data, ...extra })}, ${JSON.stringify(HOJE)}))`));

  test('despesa pendente: vencida, vence hoje, amanhã e em até 7 dias', () => {
    assert.deepEqual(vi('2026-11-10'), { n: -12, cls: 'late', texto: 'Vencida há 12 dias' });
    assert.deepEqual(vi('2026-11-21'), { n: -1, cls: 'late', texto: 'Venceu ontem' });
    assert.deepEqual(vi('2026-11-22'), { n: 0, cls: 'today', texto: 'Vence hoje' });
    assert.deepEqual(vi('2026-11-23'), { n: 1, cls: 'soon', texto: 'Vence amanhã' });
    assert.deepEqual(vi('2026-11-29'), { n: 7, cls: 'soon', texto: 'Vence em 7 dias' });
  });

  test('mais de 7 dias, despesa paga e entrada pendente não geram alerta', () => {
    assert.equal(vi('2026-11-30'), null);
    assert.equal(vi('2026-11-10', { status: 'pago' }), null);
    assert.equal(vi('2026-11-10', { tipo: 'entrada' }), null);
  });

  test('conta dias pelo calendário, atravessando mês, ano e horário de verão', () => {
    assert.equal(f.eval("daysBetween('2026-12-30', '2027-01-02')"), 3);
    assert.equal(f.eval("daysBetween('2026-03-01', '2026-02-28')"), -1);
    assert.equal(f.eval("daysBetween('2026-10-01', '2026-11-01')"), 31);
  });

  test('dayLabel: Hoje, Ontem, Amanhã, dia da semana; ano só se for outro ano', () => {
    assert.equal(f.eval(`dayLabel('2026-11-22', '${HOJE}')`), 'Hoje, 22/11');
    assert.equal(f.eval(`dayLabel('2026-11-21', '${HOJE}')`), 'Ontem, 21/11');
    assert.equal(f.eval(`dayLabel('2026-11-23', '${HOJE}')`), 'Amanhã, 23/11');
    assert.equal(f.eval(`dayLabel('2026-11-20', '${HOJE}')`), 'sexta-feira, 20/11');
    assert.equal(f.eval(`dayLabel('2025-12-31', '${HOJE}')`), 'quarta-feira, 31/12/2025');
  });

  test('groupByDay junta linhas do mesmo dia e mantém a ordem', () => {
    const rows = [{ id: 1, data: '2026-11-22' }, { id: 2, data: '2026-11-22' }, { id: 3, data: '2026-11-20' }];
    const g = JSON.parse(f.eval(`JSON.stringify(groupByDay(${JSON.stringify(rows)}))`));
    assert.deepEqual(g.map(x => [x.data, x.itens.map(i => i.id)]), [['2026-11-22', [1, 2]], ['2026-11-20', [3]]]);
    assert.deepEqual(JSON.parse(f.eval('JSON.stringify(groupByDay([]))')), []);
  });
});

describe('Alerta de vencimento — carga, bolinha do menu e aviso', () => {
  const dados = { alertas: 3, dias: 7, itens: [], resumo: { vencidas: { qtd: 2, total: 150 }, hoje: { qtd: 1, total: 30 }, proximas: { qtd: 0, total: 0 } } };

  test('Venc.load pede ao servidor com a data do aparelho e guarda o resultado', async () => {
    const calls = [], g = loadFront(['js_core.html'], { api: (route, payload) => { calls.push([route, payload]); return dados; } });
    await g.eval('Venc.load()');
    assert.equal(calls[0][0], 'lancamentos.vencimentos');
    assert.match(calls[0][1].hoje, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(g.eval('Venc.dados.alertas'), 3);
  });

  test('chamadas simultâneas dividem a mesma requisição', async () => {
    const calls = [], g = loadFront(['js_core.html'], { api: route => { calls.push(route); return dados; } });
    await g.eval('Promise.all([Venc.load(), Venc.load(), Venc.load()])');
    assert.equal(calls.length, 1);
  });

  test('se o servidor falhar, o alerta fica de fora e nada quebra', async () => {
    const g = loadFront(['js_core.html'], { api: () => { throw new Error('fora do ar'); } });
    await g.eval('Venc.load()');
    assert.equal(g.eval('Venc.dados'), null);
  });

  test('aviso ao abrir: texto com plural certo; vencidas em vermelho, só "hoje" em tom normal', () => {
    const g = loadFront(['js_core.html']);
    g.eval(`globalThis.__t = []; UI.toast = (m, e) => __t.push([m, !!e]); Venc.dados = ${JSON.stringify(dados)}; Venc.avisar();`);
    assert.deepEqual(JSON.parse(g.eval('JSON.stringify(__t)')), [['Atenção: 2 contas vencidas e 1 vence hoje', true]]);
    g.eval(`__t.length = 0; Venc.dados = ${JSON.stringify({ ...dados, resumo: { vencidas: { qtd: 0, total: 0 }, hoje: { qtd: 2, total: 5 }, proximas: { qtd: 0, total: 0 } } })}; Venc.avisar();`);
    assert.deepEqual(JSON.parse(g.eval('JSON.stringify(__t)')), [['Atenção: 2 vencem hoje', false]]);
    g.eval(`__t.length = 0; Venc.dados = ${JSON.stringify({ ...dados, resumo: { vencidas: { qtd: 0, total: 0 }, hoje: { qtd: 0, total: 0 }, proximas: { qtd: 3, total: 9 } } })}; Venc.avisar();`);
    assert.equal(g.eval('__t.length'), 0); // só próximos dias: sem aviso ao abrir
  });
});
