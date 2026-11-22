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

describe('Lançamentos — filtro por período (dia, semana, mês ou datas livres)', () => {
  const datas = l => l.map(x => x.data);
  const base = () => {
    const b = loadBackend();
    for (const d of ['2026-11-15', '2026-11-16', '2026-11-18', '2026-11-22', '2026-11-23', '2026-12-01']) b.lanc({ data: d });
    b.lanc({ tipo: 'saida', data: '2026-11-18' });
    return b;
  };

  test('de/ate incluem as duas pontas e vêm da data mais recente para a mais antiga', () => {
    const b = base();
    assert.deepEqual(datas(b.call('lancamentos.list', { de: '2026-11-16', ate: '2026-11-22', tipo: 'entrada' })), ['2026-11-22', '2026-11-18', '2026-11-16']);
  });

  test('um dia só (de = ate)', () => {
    const b = base();
    assert.equal(b.call('lancamentos.list', { de: '2026-11-18', ate: '2026-11-18' }).length, 2);
  });

  test('só "de" ou só "ate" funcionam como limite aberto', () => {
    const b = base();
    assert.deepEqual(datas(b.call('lancamentos.list', { de: '2026-11-23', tipo: 'entrada' })), ['2026-12-01', '2026-11-23']);
    assert.deepEqual(datas(b.call('lancamentos.list', { ate: '2026-11-15', tipo: 'entrada' })), ['2026-11-15']);
  });

  test('combina com o filtro de tipo e o "mes" continua funcionando', () => {
    const b = base();
    assert.equal(b.call('lancamentos.list', { de: '2026-11-01', ate: '2026-11-30', tipo: 'saida' }).length, 1);
    assert.equal(b.call('lancamentos.list', { mes: '2026-11' }).length, 6);
  });

  test('período que cruza o ano', () => {
    const b = loadBackend();
    b.lanc({ data: '2026-12-31' }); b.lanc({ data: '2027-01-01' }); b.lanc({ data: '2027-01-04' });
    assert.deepEqual(datas(b.call('lancamentos.list', { de: '2026-12-28', ate: '2027-01-03' })), ['2027-01-01', '2026-12-31']);
  });

  test('data inicial maior que a final e formato inválido são recusados com mensagem clara', () => {
    const b = base();
    assert.throws(() => b.call('lancamentos.list', { de: '2026-11-22', ate: '2026-11-16' }), /inicial não pode ser maior/);
    assert.throws(() => b.call('lancamentos.list', { de: '22/11/2026' }), /Data inicial do período inválida/);
    assert.throws(() => b.call('lancamentos.list', { ate: 'amanhã' }), /Data final do período inválida/);
  });
});

describe('Lançamentos — filtro de status (pendentes)', () => {
  test('status=pendente lista só os pendentes e combina com tipo e período', () => {
    const b = loadBackend();
    b.lanc({ tipo: 'saida', status: 'pendente', data: '2026-11-20' }); b.lanc({ tipo: 'saida', status: 'pago', data: '2026-11-20' });
    b.lanc({ tipo: 'entrada', status: 'pendente', data: '2026-11-21' });
    assert.equal(b.call('lancamentos.list', { status: 'pendente' }).length, 2);
    assert.equal(b.call('lancamentos.list', { status: 'pendente', tipo: 'saida' }).length, 1);
    assert.equal(b.call('lancamentos.list', { status: 'pendente', de: '2026-11-21', ate: '2026-11-21' }).length, 1);
    assert.equal(b.call('lancamentos.list', {}).length, 3);
  });
});

describe('Lançamentos — alerta de vencimento (despesas a pagar)', () => {
  const HOJE = '2026-11-22';
  const base = () => {
    const b = loadBackend();
    b.lanc({ tipo: 'saida', status: 'pendente', data: '2026-11-18', valor: 100, descricao: 'Vencida há 4' });
    b.lanc({ tipo: 'saida', status: 'pendente', data: '2026-11-21', valor: 50.5, descricao: 'Vencida ontem' });
    b.lanc({ tipo: 'saida', status: 'pendente', data: HOJE, valor: 30, descricao: 'Vence hoje' });
    b.lanc({ tipo: 'saida', status: 'pendente', data: '2026-11-25', valor: 20, descricao: 'Em 3 dias' });
    b.lanc({ tipo: 'saida', status: 'pendente', data: '2026-11-29', valor: 10, descricao: 'Em 7 dias (limite)' });
    b.lanc({ tipo: 'saida', status: 'pendente', data: '2026-11-30', valor: 99, descricao: 'Em 8 dias (fora)' });
    b.lanc({ tipo: 'saida', status: 'pago', data: '2026-11-10', valor: 77, descricao: 'Já paga' });
    b.lanc({ tipo: 'entrada', status: 'pendente', data: '2026-11-10', valor: 88, descricao: 'A receber (não é despesa)' });
    return b;
  };

  test('separa vencidas, vence hoje e próximos 7 dias, da mais atrasada para a mais distante', () => {
    const r = base().call('lancamentos.vencimentos', { hoje: HOJE });
    assert.deepEqual(r.itens.map(i => [i.descricao, i.situacao, i.dias]), [
      ['Vencida há 4', 'vencida', -4], ['Vencida ontem', 'vencida', -1], ['Vence hoje', 'hoje', 0],
      ['Em 3 dias', 'proxima', 3], ['Em 7 dias (limite)', 'proxima', 7]]);
  });

  test('totais por situação e contagem de alertas (vencidas + hoje)', () => {
    const r = base().call('lancamentos.vencimentos', { hoje: HOJE });
    assert.deepEqual(r.resumo.vencidas, { qtd: 2, total: 150.5 });
    assert.deepEqual(r.resumo.hoje, { qtd: 1, total: 30 });
    assert.deepEqual(r.resumo.proximas, { qtd: 2, total: 30 });
    assert.equal(r.alertas, 3);
  });

  test('ignora despesas já pagas e entradas a receber', () => {
    const r = base().call('lancamentos.vencimentos', { hoje: HOJE });
    assert.ok(!r.itens.some(i => /Já paga|A receber/.test(i.descricao)));
  });

  test('janela configurável (dias) e limitada entre 1 e 60', () => {
    const b = base();
    assert.equal(b.call('lancamentos.vencimentos', { hoje: HOJE, dias: 1 }).itens.length, 3);
    assert.equal(b.call('lancamentos.vencimentos', { hoje: HOJE, dias: 8 }).itens.length, 6);
    assert.equal(b.call('lancamentos.vencimentos', { hoje: HOJE, dias: 9999 }).dias, 60);
    assert.equal(b.call('lancamentos.vencimentos', { hoje: HOJE, dias: 'x' }).dias, 7);
  });

  test('atravessa virada de mês e de ano', () => {
    const b = loadBackend();
    b.lanc({ tipo: 'saida', status: 'pendente', data: '2027-01-02' });
    const r = b.call('lancamentos.vencimentos', { hoje: '2026-12-30' });
    assert.equal(r.itens[0].dias, 3); assert.equal(r.itens[0].situacao, 'proxima');
  });

  test('sem despesas pendentes: lista vazia e zero alertas', () => {
    const r = loadBackend().call('lancamentos.vencimentos', { hoje: HOJE });
    assert.deepEqual(r.itens, []); assert.equal(r.alertas, 0);
  });

  test('sem "hoje" usa a data do servidor; data inválida é recusada', () => {
    const b = loadBackend(), d = new Date(), p = n => String(n).padStart(2, '0');
    assert.equal(b.call('lancamentos.vencimentos', {}).ref, `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
    assert.throws(() => b.call('lancamentos.vencimentos', { hoje: '22/11/2026' }), /Data de hoje inválida/);
  });
});

describe('Lançamentos — dar baixa em pendente', () => {
  test('vira realizado, mantém o resto e a data pode ser a do pagamento', () => {
    const b = loadBackend();
    const l = b.lanc({ tipo: 'saida', status: 'pendente', data: '2026-11-20', descricao: 'Luz', valor: 80, contato_nome: 'Enel' });
    const r = b.call('lancamentos.baixar', { id: l.id, data: '2026-11-22' });
    assert.equal(r.status, 'pago'); assert.equal(r.data, '2026-11-22'); assert.equal(r.descricao, 'Luz');
    assert.equal(r.valor, 80); assert.equal(r.contato_nome, 'Enel'); assert.equal(r.id, l.id); assert.equal(r.criado_em, l.criado_em);
  });

  test('sem data, mantém a data original', () => {
    const b = loadBackend(), l = b.lanc({ status: 'pendente', data: '2026-11-20' });
    assert.equal(b.call('lancamentos.baixar', { id: l.id }).data, '2026-11-20');
  });

  test('some do alerta de vencimento depois da baixa', () => {
    const b = loadBackend(), l = b.lanc({ tipo: 'saida', status: 'pendente', data: '2026-11-20' });
    assert.equal(b.call('lancamentos.vencimentos', { hoje: '2026-11-22' }).alertas, 1);
    b.call('lancamentos.baixar', { id: l.id });
    assert.equal(b.call('lancamentos.vencimentos', { hoje: '2026-11-22' }).alertas, 0);
  });

  test('recusa id inexistente, lançamento já realizado e data inválida', () => {
    const b = loadBackend(), pago = b.lanc({ status: 'pago' }), pend = b.lanc({ status: 'pendente' });
    assert.throws(() => b.call('lancamentos.baixar', { id: 'nao-existe' }), /não encontrado/);
    assert.throws(() => b.call('lancamentos.baixar', { id: pago.id }), /já está realizado/);
    assert.throws(() => b.call('lancamentos.baixar', { id: pend.id, data: '22/11' }), /Data do pagamento inválida/);
    assert.equal(b.call('lancamentos.list', { status: 'pendente' }).length, 1); // a pendente continua pendente
  });
});
