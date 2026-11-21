'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('../helpers/gas-mock');

describe('Lançamentos — validação e consulta', () => {
  test('valida valor, data, tipo e categoria', () => {
    const b = loadBackend();
    const ent = b.cat('V', 'entrada'), sai = b.cat('G', 'saida');
    const ok = { tipo: 'entrada', valor: 10, data: '2026-11-10', categoria_id: ent.id };
    assert.throws(() => b.call('lancamentos.save', { ...ok, valor: 0 }), /valor maior que zero/);
    assert.throws(() => b.call('lancamentos.save', { ...ok, data: '10/11/2026' }), /data válida/);
    assert.throws(() => b.call('lancamentos.save', { ...ok, tipo: 'x' }), /Tipo inválido/);
    assert.throws(() => b.call('lancamentos.save', { ...ok, categoria_id: sai.id }), /mesmo tipo/);
  });

  test('arredonda o valor em centavos e normaliza status e forma', () => {
    const b = loadBackend();
    const l = b.lanc({ valor: 10.456, status: 'qualquer', forma: 'cheque' });
    assert.equal(l.valor, 10.46); assert.equal(l.status, 'pago'); assert.equal(l.forma, '');
  });

  test('aceita as 5 formas de pagamento/recebimento', () => {
    const b = loadBackend();
    for (const f of ['pix', 'dinheiro', 'credito', 'debito', 'transferencia']) assert.equal(b.lanc({ forma: f }).forma, f);
  });

  test('filtra por mês e tipo; ordena da data mais recente para a mais antiga', () => {
    const b = loadBackend();
    b.lanc({ data: '2026-11-01' }); b.lanc({ data: '2026-11-20' }); b.lanc({ data: '2026-10-05' });
    b.lanc({ tipo: 'saida', data: '2026-11-15' });
    assert.deepEqual(b.call('lancamentos.list', { mes: '2026-11' }).map(l => l.data), ['2026-11-20', '2026-11-15', '2026-11-01']);
    assert.equal(b.call('lancamentos.list', { mes: '2026-11', tipo: 'saida' }).length, 1);
  });

  test('editar preserva id e criado_em; excluir remove', () => {
    const b = loadBackend();
    const l = b.lanc({ descricao: 'A' });
    const e = b.call('lancamentos.save', { ...l, descricao: 'B' });
    assert.equal(e.id, l.id); assert.equal(e.criado_em, l.criado_em); assert.equal(e.descricao, 'B');
    b.call('lancamentos.remove', { id: l.id });
    assert.equal(b.call('lancamentos.list').length, 0);
  });
});

describe('Lançamentos — catálogo (salvar item digitado à mão)', () => {
  test('salvar_catalogo cria o item e vincula; em entrada o valor vira valor padrão', () => {
    const b = loadBackend();
    const l = b.lanc({ descricao: 'Brigadeiro', valor: 4.5, salvar_catalogo: true });
    const itens = b.call('catalogo.list');
    assert.equal(itens.length, 1); assert.equal(itens[0].preco, 4.5); assert.equal(l.item_id, itens[0].id);
  });

  test('em saída o item nasce sem valor padrão', () => {
    const b = loadBackend();
    b.lanc({ tipo: 'saida', descricao: 'Gasolina', valor: 200, salvar_catalogo: true });
    assert.equal(b.call('catalogo.list')[0].preco, '');
  });

  test('reaproveita item existente (sem caixa/acento) em vez de duplicar', () => {
    const b = loadBackend();
    const i = b.call('catalogo.save', { nome: 'Gasolina', tipo: 'saida' });
    const l = b.lanc({ tipo: 'saida', descricao: 'gasolína', salvar_catalogo: true });
    assert.equal(b.call('catalogo.list').length, 1); assert.equal(l.item_id, i.id);
  });

  test('sem a flag, ou sem descrição, nada é criado no catálogo', () => {
    const b = loadBackend();
    b.lanc({ descricao: 'Bolo' });
    b.lanc({ descricao: '', salvar_catalogo: true });
    assert.equal(b.call('catalogo.list').length, 0);
  });

  test('lançamento inválido não deixa item "órfão" no catálogo', () => {
    const b = loadBackend();
    assert.throws(() => b.lanc({ descricao: 'Bolo', valor: 0, salvar_catalogo: true }), /valor maior que zero/);
    assert.equal(b.call('catalogo.list').length, 0);
  });
});

describe('Lançamentos — cliente/fornecedor', () => {
  test('contato escolhido da lista grava id e nome', () => {
    const b = loadBackend();
    const c = b.call('contatos.save', { nome: 'Ana', cliente: true });
    const l = b.lanc({ contato_id: c.id });
    assert.equal(l.contato_id, c.id); assert.equal(l.contato_nome, 'Ana');
  });

  test('nome digitado + salvar_contato: entrada cria CLIENTE, saída cria FORNECEDOR', () => {
    const b = loadBackend();
    b.lanc({ contato_nome: 'Cliente Novo', salvar_contato: true });
    b.lanc({ tipo: 'saida', contato_nome: 'Posto Z', salvar_contato: true });
    const cs = b.call('contatos.list');
    const cli = cs.find(c => c.nome === 'Cliente Novo'), forn = cs.find(c => c.nome === 'Posto Z');
    assert.deepEqual([cli.cliente, cli.fornecedor], [true, false]);
    assert.deepEqual([forn.cliente, forn.fornecedor], [false, true]);
  });

  test('nome digitado sem salvar_contato guarda só o nome, sem criar contato', () => {
    const b = loadBackend();
    const l = b.lanc({ contato_nome: 'Avulso' });
    assert.equal(l.contato_nome, 'Avulso'); assert.equal(l.contato_id, '');
    assert.equal(b.call('contatos.list').length, 0);
  });

  test('nome digitado igual a contato existente vincula ao existente', () => {
    const b = loadBackend();
    const c = b.call('contatos.save', { nome: 'José', cliente: true });
    const l = b.lanc({ contato_nome: 'jose' });
    assert.equal(l.contato_id, c.id); assert.equal(b.call('contatos.list').length, 1);
  });

  test('contato que só é cliente vira também fornecedor, sem duplicar (com confirmação)', () => {
    const b = loadBackend();
    const c = b.call('contatos.save', { nome: 'Maria', cliente: true });
    b.lanc({ tipo: 'saida', contato_id: c.id, salvar_contato: true });
    const lista = b.call('contatos.list');
    assert.equal(lista.length, 1); assert.deepEqual([lista[0].cliente, lista[0].fornecedor], [true, true]);
  });

  test('sem confirmação (salvar_contato) o papel NÃO é alterado', () => {
    const b = loadBackend();
    const c = b.call('contatos.save', { nome: 'Maria', cliente: true });
    b.lanc({ tipo: 'saida', contato_id: c.id });
    assert.equal(b.call('contatos.list')[0].fornecedor, false);
  });
});

describe('Lançamentos — regra de obrigatoriedade do contato (Ajustes)', () => {
  const setRegra = (b, r) => b.call('settings.save', { contato_regra: r });

  test('opcional (padrão): nunca exige', () => {
    const b = loadBackend();
    assert.doesNotThrow(() => b.lanc({ status: 'pendente' }));
  });

  test('pendente: exige só em lançamento pendente, nas duas pontas', () => {
    const b = loadBackend(); setRegra(b, 'pendente');
    assert.doesNotThrow(() => b.lanc({ status: 'pago' }));
    assert.throws(() => b.lanc({ status: 'pendente' }), /Informe o cliente/);
    assert.throws(() => b.lanc({ tipo: 'saida', status: 'pendente' }), /Informe o fornecedor/);
    assert.doesNotThrow(() => b.lanc({ status: 'pendente', contato_nome: 'Ana' }));
  });

  test('sempre: exige mesmo em lançamento realizado', () => {
    const b = loadBackend(); setRegra(b, 'sempre');
    assert.throws(() => b.lanc({ status: 'pago' }), /Informe o cliente/);
    assert.doesNotThrow(() => b.lanc({ status: 'pago', contato_nome: 'Ana' }));
  });

  test('a regra vale no servidor também ao EDITAR lançamento antigo', () => {
    const b = loadBackend();
    const antigo = b.lanc({ status: 'pago' });              // criado quando era opcional
    setRegra(b, 'pendente');
    assert.throws(() => b.call('lancamentos.save', { ...antigo, status: 'pendente' }), /Informe o cliente/);
  });
});
