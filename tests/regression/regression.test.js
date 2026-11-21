'use strict';
/**
 * REGRESSÕES — um bug corrigido = um teste aqui, com ID fixo (REG-nnn).
 * Regra de ouro: escreva o teste ANTES de corrigir (ele deve falhar), corrija, e só então publique.
 * Cada ID precisa constar no CHANGELOG.md (um teste em tests/static/docs.test.js confere).
 * Veja TESTING.md.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadBackend, GAS_DIR } = require('../helpers/gas-mock');
const { loadFront, loadFullApp, scriptOf } = require('../helpers/front');

describe('REG-001 — datas viravam objeto Date no Sheets e apareciam trocadas/quebradas', () => {
  test('data gravada sem formato de texto volta como "aaaa-mm-dd"', () => {
    const b = loadBackend();
    const sh = b.ss.insertSheet('lancamentos');                                   // aba antiga: sem formato de texto
    sh.getRange(1, 1, 1, 8).setValues([['id', 'data', 'tipo', 'categoria_id', 'descricao', 'valor', 'status', 'criado_em']]);
    sh.appendRow(['L1', '2026-11-10', 'entrada', 'c1', 'Venda', 100, 'pago', '2026-11-01 10:00:00']);
    assert.equal(typeof sh.rows[1][1], 'object', 'pré-condição: o Sheets converteu em Date');
    assert.equal(b.call('lancamentos.list')[0].data, '2026-11-10');
  });
});

describe('REG-002 — abas antigas não ganhavam colunas novas (dados novos se perdiam)', () => {
  test('a aba "lancamentos" de 8 colunas é migrada para o schema atual sem perder dados', () => {
    const b = loadBackend();
    const sh = b.ss.insertSheet('lancamentos');
    sh.getRange(1, 1, 1, 8).setValues([['id', 'data', 'tipo', 'categoria_id', 'descricao', 'valor', 'status', 'criado_em']]);
    sh.appendRow(['L1', '2026-11-10', 'entrada', 'c1', 'Venda antiga', 100, 'pago', '2026-11-01 10:00:00']);
    const linhas = b.call('lancamentos.list');
    assert.deepEqual(sh.rows[0], b.run('SCHEMAS.lancamentos'));
    assert.equal(linhas[0].descricao, 'Venda antiga'); assert.equal(linhas[0].valor, 100);
    assert.equal(linhas[0].forma, ''); assert.equal(linhas[0].contato_nome, '');
    assert.doesNotThrow(() => b.lanc({ forma: 'pix', contato_nome: 'Ana' }));      // gravar nas colunas novas funciona
    assert.equal(b.call('lancamentos.list').length, 2);
  });
});

describe('REG-003 — manifesto com BOM travava o clasp ("Invalid manifest file")', () => {
  test('appsscript.json começa com "{", não com bytes de BOM', () => {
    assert.equal(fs.readFileSync(path.join(GAS_DIR, 'appsscript.json'))[0], 0x7B);
  });
});

describe('REG-004 — gráfico dos 6 meses estourava a tela do celular (rolagem horizontal longa)', () => {
  test('nenhum conteúdo do SVG passa da largura disponível', () => {
    const f = loadFront(['js_core.html', 'js_dashboard.html']);
    const serie = [1, 2, 3, 4, 5, 6].map(i => ({ mes: `2026-0${i}`, entradas: i * 15000.5, saidas: i * 7000.25 }));
    for (const W of [252, 320, 360, 390, 430]) {
      const s = f.eval(`barChartSvg(${JSON.stringify(serie)}, ${W})`);
      assert.match(s, new RegExp(`<svg [^>]*width="${W}"`));                       // o SVG tem exatamente a largura do cartão
      for (const m of s.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g)) assert.ok(+m[1] + +m[2] <= W, `coluna fora da tela em ${W}px`);
    }
  });
});

describe('REG-005 — valores monetários exigem máscara bancária (1000 → R$ 10,00)', () => {
  test('digitar 1000 mostra R$ 10,00 e o valor lido é 10', () => {
    const f = loadFront(['js_core.html']);
    assert.equal(f.eval("maskMoney('1000')"), 'R$ 10,00');
    assert.equal(f.eval("parseMoney(maskMoney('1000'))"), 10);
  });
});

describe('REG-006 — atualizar um registro não pode trocar id nem criado_em', () => {
  test('patch com id/criado_em é ignorado nesses campos', () => {
    const b = loadBackend();
    const r = b.run("Db.insert('categorias', { nome: 'X', tipo: 'saida', cor: '#000000', ativo: true })");
    const u = b.run(`Db.update('categorias', '${r.id}', { id: 'outro', criado_em: '1999-01-01', nome: 'Y' })`);
    assert.equal(u.id, r.id); assert.equal(u.criado_em, r.criado_em); assert.equal(u.nome, 'Y');
  });
});

describe('REG-007 — a trava (LockService) ficava presa quando a gravação falhava', () => {
  test('após erro em update/remove não há trava aberta', () => {
    const b = loadBackend();
    b.run("Db.list('categorias')");
    assert.throws(() => b.run("Db.update('categorias', 'nao-existe', { nome: 'Y' })"));
    assert.throws(() => b.run("Db.remove('categorias', 'nao-existe')"));
    assert.equal(b.locks.held, 0); assert.ok(b.locks.total >= 2);
  });
});

describe('REG-008 — a PWA só funciona se o app puder ser embutido em iframe', () => {
  test('doGet usa XFrameOptionsMode.ALLOWALL', () => {
    const b = loadBackend(); b.ctx.doGet();
    assert.ok(b.html.calls.some(c => c[0] === 'xframe' && c[1] === 'ALLOWALL'));
  });
});

describe('REG-009 — ícone inexistente deixava um item do menu em branco', () => {
  test('todo módulo e grupo usa um ícone cadastrado em ICONS', () => {
    const a = loadFullApp();
    const icons = Object.keys(a.run('ICONS'));
    for (const i of a.run('App.mods.map(m => m.icon)')) assert.ok(icons.includes(i), i);
  });
});

describe('REG-010 — ações disparavam duas vezes (ouvintes de clique acumulavam entre telas)', () => {
  test('App.go troca o elemento #view por um clone limpo a cada navegação', () => {
    const core = scriptOf('js_core.html');
    const go = core.slice(core.indexOf('async go('));
    assert.match(go, /cloneNode\(false\)/); assert.match(go, /replaceWith\(/);
  });
});

describe('REG-011 — a troca de abas "Cadastros" apagava o destaque (segmentos sem data-f)', () => {
  test('bindSeg só atua em .seg[data-f]', () => {
    const core = scriptOf('js_core.html');
    const bind = core.slice(core.indexOf('function bindSeg'), core.indexOf('function monthBar'));
    assert.equal((bind.match(/\.seg\[data-f\]/g) || []).length, 2, 'tanto o paint quanto o clique devem filtrar por [data-f]');
  });
});

describe('REG-012 — com PIN ativo o app precisa pedir o PIN antes de carregar qualquer dado', () => {
  test('App.start chama Auth.ensure() antes do core.bootstrap', () => {
    const core = scriptOf('js_core.html');
    const start = core.slice(core.indexOf('async start()'));
    assert.ok(start.indexOf('Auth.ensure()') > -1 && start.indexOf('Auth.ensure()') < start.indexOf("'core.bootstrap'"));
  });
});
