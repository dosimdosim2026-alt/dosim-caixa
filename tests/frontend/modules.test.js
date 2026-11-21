'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadFullApp } = require('../helpers/front');

const app = loadFullApp();
const mods = app.run('App.mods.map(m => ({ id: m.id, label: m.label, icon: m.icon, order: m.order, group: m.group || null, refreshable: m.refreshable, hasRender: typeof m.render === "function" }))');
const icons = Object.keys(app.run('ICONS'));
const groups = Object.keys(app.run('App.groups'));

describe('Módulos do app (registro, navegação e ícones)', () => {
  test('todos os módulos esperados estão registrados', () => {
    assert.deepEqual(mods.map(m => m.id).sort(), ['catalogo', 'categorias', 'config', 'contatos', 'dashboard', 'lancamentos']);
  });
  test('ids únicos, com rótulo, ordem numérica e função render', () => {
    assert.equal(new Set(mods.map(m => m.id)).size, mods.length);
    for (const m of mods) { assert.ok(m.label, m.id); assert.equal(typeof m.order, 'number', m.id); assert.ok(m.hasRender, m.id); }
  });
  test('todo ícone usado existe em ICONS (ícone faltando deixa o menu em branco)', () => {
    for (const m of mods) assert.ok(icons.includes(m.icon), `${m.id} usa o ícone "${m.icon}"`);
    for (const g of groups) assert.ok(icons.includes(app.run(`App.groups['${g}'].icon`)), `grupo ${g}`);
  });
  test('módulos agrupados apontam para um grupo que existe', () => {
    for (const m of mods.filter(m => m.group)) assert.ok(groups.includes(m.group), `${m.id} → grupo ${m.group}`);
  });
  test('a barra inferior do celular tem no máximo 5 abas (6+ estoura em telas de 360px)', () => {
    const abas = new Set(mods.map(m => (m.group ? 'grupo:' + m.group : m.id)));
    assert.ok(abas.size <= 5, `há ${abas.size} abas`);
  });
  test('Ajustes não recarrega sozinha (evita perder edições não salvas)', () => {
    assert.equal(mods.find(m => m.id === 'config').refreshable, false);
  });
});

describe('Navegação com alterações não salvas', () => {
  test('App.refresh() não recarrega um módulo com refreshable:false', async () => {
    const a = loadFullApp();
    a.eval("App.cur = { id: 'config', refreshable: false }; App.__go = 0; App.go = () => { App.__go++; };");
    await a.eval('App.refresh()');
    assert.equal(a.eval('App.__go'), 0);
  });

  test('App.refresh() recarrega os módulos comuns', async () => {
    const a = loadFullApp();
    a.eval("App.cur = { id: 'dashboard' }; App.__go = 0; App.go = () => { App.__go++; };");
    await a.eval('App.refresh()');
    assert.equal(a.eval('App.__go'), 1);
  });

  test('guarda de saída: se o usuário escolhe "continuar editando", a navegação é cancelada', async () => {
    const a = loadFullApp();
    a.eval("App.cur = { id: 'config' }; App.leaveGuard = async () => false;");
    await a.eval("App.go('dashboard')");
    assert.equal(a.eval('App.cur.id'), 'config');
    assert.equal(a.eval('typeof App.leaveGuard'), 'function');       // a guarda continua ativa
  });
});
