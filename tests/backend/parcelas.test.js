'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('../helpers/gas-mock');

const compra = (b, over = {}) => b.lanc({ tipo: 'saida', valor: 100, data: '2026-11-10', vencimento: '2026-12-10', parcelado: true, parcelas: 3, descricao: 'Geladeira', ...over });
const cents = ps => ps.reduce((s, p) => s + Math.round(p.valor * 100), 0);

describe('Parcelamento — geração automática das parcelas', () => {
  test('gera N lançamentos: valores, vencimentos mensais, numeração e mesmo grupo', () => {
    const b = loadBackend();
    const ps = compra(b);
    assert.equal(ps.length, 3);
    assert.deepEqual(ps.map(p => p.valor), [33.33, 33.33, 33.34]);                       // diferença de centavos na última
    assert.deepEqual(ps.map(p => p.vencimento), ['2026-12-10', '2027-01-10', '2027-02-10']);
    assert.deepEqual(ps.map(p => p.parcela), [1, 2, 3]); assert.ok(ps.every(p => p.parcelas === 3));
    assert.equal(new Set(ps.map(p => p.grupo_id)).size, 1); assert.ok(ps[0].grupo_id);
    assert.ok(ps.every(p => p.status === 'pendente' && p.data === '2026-11-10' && p.descricao === 'Geladeira'));
    assert.equal(b.call('lancamentos.list').length, 3);
  });

  test('a soma das parcelas é SEMPRE o total, ao centavo', () => {
    for (const [total, n] of [[100, 7], [0.1, 3], [999.99, 12], [1, 60], [1234.56, 5], [50, 2]]) {
      const b = loadBackend();
      assert.equal(cents(compra(b, { valor: total, parcelas: n })), Math.round(total * 100), `${total} em ${n}x`);
    }
  });

  test('vencimentos mantêm o dia e usam o último dia do mês quando ele não existe (31 → 28/29 → 31 → 30)', () => {
    const b = loadBackend();
    assert.deepEqual(compra(b, { vencimento: '2027-01-31', parcelas: 4 }).map(p => p.vencimento), ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
    assert.equal(compra(loadBackend(), { vencimento: '2028-01-31', parcelas: 2 })[1].vencimento, '2028-02-29');           // ano bissexto
  });

  test('atravessa a virada de ano e parcelas longas (12 e 60)', () => {
    const b = loadBackend();
    const ps = compra(b, { vencimento: '2026-11-15', parcelas: 12 });
    assert.equal(ps[1].vencimento, '2026-12-15'); assert.equal(ps[2].vencimento, '2027-01-15'); assert.equal(ps[11].vencimento, '2027-10-15');
    assert.equal(compra(loadBackend(), { valor: 600, parcelas: 60 }).length, 60);
  });

  test('"1ª parcela paga na hora" (entrada): só a primeira nasce paga', () => {
    const ps = compra(loadBackend(), { primeira_paga: true });
    assert.deepEqual(ps.map(p => p.status), ['pago', 'pendente', 'pendente']);
  });

  test('o status enviado é ignorado: parcelas são contas em aberto', () => {
    assert.ok(compra(loadBackend(), { status: 'pago' }).every(p => p.status === 'pendente'));
  });

  test('vale também para venda a prazo (entrada = a receber)', () => {
    const ps = compra(loadBackend(), { tipo: 'entrada', valor: 300, parcelas: 3 });
    assert.ok(ps.every(p => p.tipo === 'entrada')); assert.deepEqual(ps.map(p => p.valor), [100, 100, 100]);
  });

  test('forma de pagamento, categoria e contato valem para todas as parcelas', () => {
    const b = loadBackend();
    const c = b.call('contatos.save', { nome: 'Loja X', fornecedor: true });
    const ps = compra(b, { forma: 'credito', contato_id: c.id });
    assert.ok(ps.every(p => p.forma === 'credito' && p.contato_id === c.id && p.contato_nome === 'Loja X' && p.categoria_id === ps[0].categoria_id));
  });

  test('item digitado + salvar_catalogo cria UM item e todas as parcelas apontam para ele', () => {
    const b = loadBackend();
    const ps = compra(b, { salvar_catalogo: true });
    assert.equal(b.call('catalogo.list').length, 1); assert.ok(ps.every(p => p.item_id === b.call('catalogo.list')[0].id));
  });
});

describe('Parcelamento — validações (nada é gravado se algo estiver errado)', () => {
  const falha = (over, msg) => {
    const b = loadBackend();
    assert.throws(() => compra(b, over), msg);
    assert.equal(b.sheet('lancamentos') ? b.call('lancamentos.list').length : 0, 0, 'não pode sobrar parcela gravada');
    assert.equal(b.call('catalogo.list').length, 0); assert.equal(b.call('contatos.list').length, 0);
  };
  test('número de parcelas: inteiro de 2 a 60', () => { for (const n of [1, 0, 61, 2.5, 'abc', undefined]) falha({ parcelas: n, salvar_catalogo: true }, /de 2 a 60/); });
  test('exige o vencimento da 1ª parcela', () => falha({ vencimento: '', salvar_catalogo: true, contato_nome: 'X', salvar_contato: true }, /vencimento da 1ª/));
  test('vencimento inexistente (31/02) é recusado', () => falha({ vencimento: '2026-02-31' }, /vencimento válido/));
  test('valor zero, categoria de outro tipo, etc. continuam valendo', () => { falha({ valor: 0 }, /maior que zero/); });
  test('regra de contato obrigatório vale para as parcelas, mesmo com status "pago" no pedido', () => {
    const b = loadBackend(); b.call('settings.save', { contato_regra: 'pendente' });
    assert.throws(() => compra(b, { status: 'pago' }), /Informe o fornecedor/);
    assert.doesNotThrow(() => compra(b, { contato_nome: 'Loja X' }));
  });
});

describe('Parcelas — editar, dar baixa e excluir', () => {
  test('editar uma parcela muda só ela e NÃO mexe no grupo/numeração (mesmo que o pedido tente)', () => {
    const b = loadBackend(); const ps = compra(b);
    const e = b.call('lancamentos.save', { ...ps[1], valor: 40, descricao: 'Geladeira (ajuste)', parcela: 9, parcelas: 99, grupo_id: 'outro', parcelado: true });
    assert.equal(e.valor, 40); assert.equal(e.parcela, 2); assert.equal(e.parcelas, 3); assert.equal(e.grupo_id, ps[0].grupo_id);
    assert.equal(b.call('lancamentos.list').length, 3);                                     // não gerou parcelas novas
    assert.equal(b.call('lancamentos.list').find(l => l.id === ps[0].id).valor, 33.33);      // as outras ficaram como estavam
  });

  test('baixa marca como pago e é repetível', () => {
    const b = loadBackend(); const ps = compra(b);
    assert.equal(b.call('lancamentos.baixa', { id: ps[0].id }).status, 'pago');
    assert.equal(b.call('lancamentos.baixa', { id: ps[0].id }).status, 'pago');
    assert.deepEqual(b.call('lancamentos.list', { ordem: 'asc' }).map(l => l.status), ['pago', 'pendente', 'pendente']);
    assert.throws(() => b.call('lancamentos.baixa', { id: 'nao-existe' }), /Registro não encontrado/);
  });

  test('excluir o parcelamento remove só as pendentes (as pagas ficam no histórico)', () => {
    const b = loadBackend(); const ps = compra(b);
    b.call('lancamentos.baixa', { id: ps[0].id });
    assert.deepEqual(b.call('lancamentos.remove_grupo', { grupo_id: ps[0].grupo_id }), { removidas: 2 });
    const resta = b.call('lancamentos.list'); assert.equal(resta.length, 1); assert.equal(resta[0].parcela, 1);
    assert.equal(b.locks.held, 0);
  });

  test('todas:true remove inclusive as pagas; outros lançamentos nunca são tocados', () => {
    const b = loadBackend(); const ps = compra(b); const avulso = b.lanc({ descricao: 'Avulso' });
    b.call('lancamentos.baixa', { id: ps[0].id });
    assert.deepEqual(b.call('lancamentos.remove_grupo', { grupo_id: ps[0].grupo_id, todas: true }), { removidas: 3 });
    assert.deepEqual(b.call('lancamentos.list').map(l => l.id), [avulso.id]);
  });

  test('parcelamento desconhecido ou ausente: erro claro', () => {
    const b = loadBackend(); b.lanc({});
    assert.throws(() => b.call('lancamentos.remove_grupo', { grupo_id: 'x' }), /não encontrado/);
    assert.throws(() => b.call('lancamentos.remove_grupo', {}), /não informado/);
  });
});

describe('Planilha — limite de linhas do Sheets', () => {
  test('gravar parcelas além da última linha da planilha expande a planilha (setValues não faz isso sozinho)', () => {
    const b = loadBackend(); b.call('core.bootstrap');
    const sh = b.sheet('lancamentos');
    for (let i = 0; i < 997; i++) sh.appendRow(['id' + i, '2026-11-01', 'entrada', 'c', 'x', 1, 'pago', '2026-11-01 00:00:00']);
    assert.ok(sh.getLastRow() >= 998);
    const ps = compra(b, { parcelas: 12 });
    assert.equal(ps.length, 12); assert.ok(sh.maxRows >= sh.getLastRow());
    assert.equal(b.call('lancamentos.list').length, 997 + 12);
  });
});
