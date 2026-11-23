'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadFront } = require('../helpers/front');
const { loadBackend } = require('../helpers/gas-mock');

const f = loadFront(['js_core.html', 'js_dashboard.html']);
const b = loadBackend();

describe('Fechamento — navegação entre períodos (dia, mês, ano)', () => {
  const shift = (p, ref, n) => f.eval(`periodShift('${p}', '${ref}', ${n})`);
  test('dia: avança e volta atravessando mês e ano', () => {
    assert.equal(shift('dia', '2026-11-30', 1), '2026-12-01'); assert.equal(shift('dia', '2026-12-31', 1), '2027-01-01');
    assert.equal(shift('dia', '2027-03-01', -1), '2027-02-28'); assert.equal(shift('dia', '2028-03-01', -1), '2028-02-29');
  });
  test('mês: avança e volta atravessando o ano', () => {
    assert.equal(shift('mes', '2026-12', 1), '2027-01'); assert.equal(shift('mes', '2026-01', -1), '2025-12'); assert.equal(shift('mes', '2026-11', 0), '2026-11');
  });
  test('ano: ±1', () => { assert.equal(shift('ano', '2026', 1), '2027'); assert.equal(shift('ano', '2026', -2), '2024'); });
  test('addDaysISO == addDias_ do servidor', () => {
    for (const iso of ['2026-01-31', '2026-12-31', '2028-02-28', '2026-11-22'])
      for (let n = -40; n <= 40; n += 7) assert.equal(f.eval(`addDaysISO('${iso}', ${n})`), b.run(`addDias_('${iso}', ${n})`), `${iso} ${n}`);
  });
  test('rótulos legíveis do período', () => {
    assert.equal(f.eval("periodLabel('ano', '2026')"), '2026');
    assert.match(f.eval("periodLabel('mes', '2026-11')"), /novembro.*2026/i);
    const dia = f.eval("periodLabel('dia', '2026-11-22')"); assert.match(dia, /22/); assert.match(dia, /nov/i); assert.match(dia, /2026/);
  });
});

describe('Janela de baixa (data do pagamento e forma)', () => {
  const item = (o = {}) => ({ id: 'x', tipo: 'saida', descricao: 'Aluguel', valor: 1500, forma: 'debito', ...o });
  const html = (it, hoje = '2026-11-22') => f.eval(`baixaHtml(${JSON.stringify(it)}, '${hoje}')`);
  test('a data vem preenchida com hoje e não aceita data futura (max)', () => assert.match(html(item()), /id="b-data" type="date" value="2026-11-22" max="2026-11-22"/));
  test('conta a pagar fala em pagamento; a receber, em recebimento', () => {
    assert.match(html(item()), /Data do pagamento/); assert.match(html(item()), /Confirmar pagamento/);
    assert.match(html(item({ tipo: 'entrada' })), /Data do recebimento/); assert.match(html(item({ tipo: 'entrada' })), /Confirmar recebimento/);
  });
  test('a forma atual já vem selecionada (Pix se não houver)', () => {
    assert.match(html(item()), /value="debito" selected/); assert.match(html(item({ forma: '' })), /value="pix" selected/);
  });
  test('mostra o valor e a parcela; descrição é escapada', () => {
    const h = html(item({ parcela: 2, parcelas: 12, descricao: '<script>x</script>' }));
    assert.match(h, /parcela 2\/12/); assert.ok(!/<script>x/.test(h)); assert.match(h, /&lt;script&gt;/);
  });
});

describe('Gráfico — modos dia, mês e ano', () => {
  const dias = Array.from({ length: 7 }, (_, i) => ({ mes: `2026-11-${String(14 + i).padStart(2, '0')}`, entradas: 100 * (i + 1), saidas: 40 * (i + 1) }));
  const ano = Array.from({ length: 12 }, (_, i) => ({ mes: `2026-${String(i + 1).padStart(2, '0')}`, entradas: 5000 + i * 1111.11, saidas: 3000 + i * 777.77 }));
  const svg = (serie, W, opts) => f.eval(`barChartSvg(${JSON.stringify(serie)}, ${W}, ${JSON.stringify(opts || null)})`);

  test('dia: 7 colunas duplas e rótulos dd/mm', () => {
    const s = svg(dias, 360);
    assert.equal((s.match(/<rect/g) || []).length, 14);
    assert.deepEqual([...s.matchAll(/text-anchor="middle"[^>]*>([\d/]+)<\/text>/g)].map(m => m[1]), ['14/11', '15/11', '16/11', '17/11', '18/11', '19/11', '20/11']);
  });
  test('ano: 12 meses, sem valores no topo (eles vão na tabela)', () => {
    const s = svg(ano, 360, { valores: false });
    assert.equal((s.match(/<rect/g) || []).length, 24); assert.ok(!/<text class="v/.test(s));
    assert.deepEqual([...s.matchAll(/text-anchor="middle"[^>]*>(\w+)<\/text>/g)].map(m => m[1]).slice(0, 3), ['jan', 'fev', 'mar']);
  });
  test('padrão continua com os valores na diagonal', () => assert.match(svg(dias, 360), /<text class="v in"/));
  for (const W of [252, 300, 360, 430, 600, 800])
    test(`ano e dia cabem em ${W}px (nada passa da largura)`, () => {
      for (const s of [svg(ano, W, { valores: false }), svg(dias, W)]) for (const m of s.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g)) assert.ok(+m[1] + +m[2] <= W, `coluna fora em ${W}px`);
    });
  test('sem valores o gráfico é mais baixo (sem a folga dos rótulos)', () => {
    const h = s => +s.match(/<svg [^>]*height="([\d.]+)"/)[1];
    assert.ok(h(svg(ano, 360, { valores: false })) < h(svg(ano, 360)));
  });
});
