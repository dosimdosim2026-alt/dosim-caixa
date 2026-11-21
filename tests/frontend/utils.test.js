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

describe('Tema → PWA (cores da marca na tela toda)', () => {
  test('dentro da PWA (iframe) avisa a janela externa com as cores', () => {
    const g = loadFront(['js_core.html']);
    g.eval("Theme.notifyShell({ primary: '#9E4563' })");
    assert.deepEqual(JSON.parse(JSON.stringify(g.sent)), [{ type: 'cx-theme', primary: '#9E4563', surface: '#ffffff', bg: '#f5f6fa' }]);
  });

  test('fora de um iframe não envia nada', () => {
    const g = loadFront(['js_core.html']);
    g.win.top = g.win;
    g.eval("Theme.notifyShell({ primary: '#9E4563' })");
    assert.equal(g.sent.length, 0);
  });
});
