'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadFront } = require('../helpers/front');

const f = loadFront(['js_core.html', 'js_dashboard.html']);
const serie = [1, 2, 3, 4, 5, 6].map(i => ({ mes: `2026-0${i}`, entradas: i * 21234.56, saidas: i * 9876.54 }));
const svg = W => f.eval(`barChartSvg(${JSON.stringify(serie)}, ${W})`);

/** Extrai posição e texto dos rótulos diagonais (translate + rotate(-45)). */
function rotulos(s, W) {
  const re = /<text class="v (in|out)" style="font-size:(\d+)px" transform="translate\(([\d.]+) ([\d.-]+)\) rotate\(-45\)">([^<]+)<\/text>/g;
  return [...s.matchAll(re)].map(m => {
    const fs = +m[2], len = m[5].length * fs * 0.60 * Math.SQRT1_2;      // estimativa da projeção a 45° (independente da usada no código)
    return { cls: m[1], fs, x: +m[3], y: +m[4], texto: m[5], fim: +m[3] + len, topo: +m[4] - len };
  });
}

describe('Gráfico dos últimos 6 meses', () => {
  test('desenha 12 colunas e 12 valores quando nada é zero', () => {
    const s = svg(360);
    assert.equal((s.match(/<rect/g) || []).length, 12);
    assert.equal(rotulos(s, 360).length, 12);
  });

  test('não gera NaN/undefined e usa a largura recebida', () => {
    for (const W of [252, 360, 600]) {
      const s = svg(W);
      assert.ok(!/NaN|undefined/.test(s), `W=${W}`);
      assert.match(s, new RegExp(`width="${W}"`)); assert.match(s, new RegExp(`viewBox="0 0 ${W} `));
    }
  });

  test('valores zerados não desenham coluna nem rótulo', () => {
    const s = f.eval(`barChartSvg(${JSON.stringify([{ mes: '2026-01', entradas: 0, saidas: 50 }, { mes: '2026-02', entradas: 0, saidas: 0 }])}, 400)`);
    assert.equal((s.match(/<rect/g) || []).length, 1);
  });

  test('a maior coluna ocupa a altura máxima (120) e as demais são proporcionais', () => {
    const s = f.eval(`barChartSvg(${JSON.stringify([{ mes: '2026-01', entradas: 100, saidas: 50 }])}, 400)`);
    const alturas = [...s.matchAll(/<rect [^>]*height="([\d.]+)"/g)].map(m => +m[1]);
    assert.deepEqual(alturas, [120, 60]);
  });

  test('mostra os 6 nomes de mês', () => {
    const meses = [...svg(360).matchAll(/text-anchor="middle"[^>]*>(\w+)<\/text>/g)].map(m => m[1]);
    assert.deepEqual(meses, ['jan', 'fev', 'mar', 'abr', 'mai', 'jun']);
  });

  test('celular (<460px): valores sem centavos; desktop: com centavos', () => {
    assert.ok(rotulos(svg(360), 360).every(r => !/,\d{2}$/.test(r.texto)));
    assert.ok(rotulos(svg(700), 700).every(r => /,\d{2}$/.test(r.texto)));
  });

  test('valores em reais, cor da série e rotação diagonal', () => {
    const r = rotulos(svg(360), 360);
    assert.ok(r.every(x => /^R\$\s/.test(x.texto.replace(/\u00a0/g, ' '))));
    assert.ok(r.some(x => x.cls === 'in') && r.some(x => x.cls === 'out'));
  });
});

describe('Gráfico cabe na tela (sem rolagem horizontal)', () => {
  test('valores de milhões, com centavos, também cabem (folga proporcional ao maior rótulo)', () => {
    const grande = serie.map(s => ({ ...s, entradas: s.entradas * 90, saidas: s.saidas * 90 }));     // até ~R$ 11 milhões
    for (const W of [360, 600]) {
      const r = rotulos(f.eval(`barChartSvg(${JSON.stringify(grande)}, ${W})`), W);
      for (const x of r) { assert.ok(x.fim <= W, `W=${W}: ${x.texto} termina em ${x.fim.toFixed(0)}`); assert.ok(x.topo >= 0, `W=${W}: ${x.texto} sai pelo topo`); }
    }
  });

  for (const W of [252, 280, 300, 320, 360, 390, 430, 459, 460, 600, 800]) {
    test(`largura ${W}px: nenhum rótulo sai da área e nenhum encosta no vizinho`, () => {
      const r = rotulos(svg(W), W);
      assert.ok(r.length > 0);
      for (const x of r) { assert.ok(x.fim <= W, `rótulo ${x.texto} termina em ${x.fim.toFixed(0)} > ${W}`); assert.ok(x.topo >= 0, `rótulo ${x.texto} sai pelo topo (${x.topo.toFixed(0)})`); }
      const xs = r.map(x => x.x).sort((a, b) => a - b);
      const fs = r[0].fs;
      for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > 0.5) assert.ok((xs[i] - xs[i - 1]) * Math.SQRT1_2 >= fs * 0.95, `vizinhos muito juntos em ${W}px`);
    });
  }
});
