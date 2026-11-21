'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('../helpers/gas-mock');

describe('Db — camada de dados sobre a planilha', () => {
  test('cria a aba com o cabeçalho do schema na primeira leitura', () => {
    const b = loadBackend();
    b.run("Db.list('categorias')");
    assert.deepEqual(b.sheet('categorias').rows[0], b.run('SCHEMAS.categorias'));
  });

  test('insert gera id e criado_em; list devolve o registro', () => {
    const b = loadBackend();
    const r = b.run("Db.insert('categorias', { nome: 'X', tipo: 'saida', cor: '#000000', ativo: true })");
    assert.match(r.id, /^[0-9a-f-]{36}$/);
    assert.match(r.criado_em, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.equal(b.run("Db.list('categorias')").length, 1);
  });

  test('update mescla o patch e devolve o registro completo', () => {
    const b = loadBackend();
    const r = b.run("Db.insert('categorias', { nome: 'X', tipo: 'saida', cor: '#000000', ativo: true })");
    const u = b.run(`Db.update('categorias', '${r.id}', { nome: 'Y' })`);
    assert.equal(u.nome, 'Y'); assert.equal(u.tipo, 'saida');
  });

  test('update de registro inexistente falha com mensagem clara', () => {
    const b = loadBackend();
    b.run("Db.list('categorias')");
    assert.throws(() => b.run("Db.update('categorias', 'nao-existe', { nome: 'Y' })"), /Registro não encontrado/);
  });

  test('remove apaga a linha; remover inexistente falha', () => {
    const b = loadBackend();
    const r = b.run("Db.insert('categorias', { nome: 'X', tipo: 'saida', cor: '#000000', ativo: true })");
    assert.equal(b.run(`Db.remove('categorias', '${r.id}')`), true);
    assert.equal(b.run("Db.list('categorias')").length, 0);
    assert.throws(() => b.run(`Db.remove('categorias', '${r.id}')`), /Registro não encontrado/);
  });

  test('schema inexistente é recusado', () => {
    assert.throws(() => loadBackend().run("Db.list('nao_existe')"), /Schema inexistente/);
  });

  test('datas ficam como texto na planilha (coluna formatada como @)', () => {
    const b = loadBackend();
    b.lanc({ data: '2026-11-10' });
    assert.equal(typeof b.sheet('lancamentos').rows[1][1], 'string');
  });

  test('telefone com zero à esquerda não vira número', () => {
    const b = loadBackend();
    b.call('contatos.save', { nome: 'Ana', telefone: '0319999', cliente: true });
    assert.equal(b.call('contatos.list')[0].telefone, '0319999');
  });
});
