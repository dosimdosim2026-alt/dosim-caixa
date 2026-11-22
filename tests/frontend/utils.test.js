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
