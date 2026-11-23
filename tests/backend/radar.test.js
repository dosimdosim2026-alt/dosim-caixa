'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('../helpers/gas-mock');

const HOJE = '2026-11-22';
const conta = (b, venc, valor, over = {}) => b.lanc({ tipo: 'saida', status: 'pendente', valor, vencimento: venc, data: '2026-11-01', descricao: 'Conta ' + venc, ...over });
const radar = (b, tipo = 'contasPagar', extra = {}) => b.call('dashboard.summary', { mes: '2026-11', hoje: HOJE, ...extra })[tipo];

describe('Painel — contas a pagar (no radar)', () => {
  function cenario() {
    const b = loadBackend();
    conta(b, '2026-09-05', 10);     // vencida há meses
    conta(b, '2026-11-10', 100);    // vencida
    conta(b, '2026-11-22', 50);     // vence hoje
    conta(b, '2026-11-27', 30);     // em 5 dias
    conta(b, '2026-12-12', 70);     // futura (outro mês)
    b.lanc({ tipo: 'saida', status: 'pago', valor: 999, vencimento: '2026-11-15' });     // realizada: fora do radar
    b.lanc({ tipo: 'entrada', status: 'pendente', valor: 5, vencimento: '2026-11-29' });  // a receber (7º dia: ainda conta em "próximos 7 dias")
    return b;
  }

  test('total em aberto, vencidas e próximos 7 dias', () => {
    const r = radar(cenario());
    assert.equal(r.total, 260); assert.equal(r.qtd, 5);
    assert.deepEqual(r.vencidas, { qtd: 2, total: 110 });
    assert.deepEqual(r.proximos7, { qtd: 2, total: 80 });            // hoje (50) + dia 27 (30)
  });

  test('lista ordenada do vencimento mais antigo ao mais distante (vencidas primeiro)', () => {
    assert.deepEqual(radar(cenario()).itens.map(i => i.venc), ['2026-09-05', '2026-11-10', '2026-11-22', '2026-11-27', '2026-12-12']);
  });

  test('não inclui o que já foi pago, nem entradas', () => {
    const r = radar(cenario());
    assert.ok(!r.itens.some(i => i.valor === 999 || i.tipo === 'entrada'));
  });

  test('contas a receber têm o seu próprio bloco (mesma regra)', () => {
    const r = radar(cenario(), 'contasReceber');
    assert.deepEqual([r.total, r.qtd, r.vencidas.qtd, r.proximos7.qtd], [5, 1, 0, 1]);
  });

  test('independe do mês exibido no painel (contas de outros meses não somem do radar)', () => {
    const b = cenario();
    assert.equal(radar(b, 'contasPagar', { mes: '2027-03' }).total, 260);
    assert.equal(b.call('dashboard.summary', { mes: '2027-03', hoje: HOJE }).aPagar, 0);      // o KPI mensal é outra coisa
  });

  test('"próximos 7 dias": o 7º dia entra, o 8º não; hoje entra, ontem é vencida', () => {
    const b = loadBackend();
    conta(b, '2026-11-29', 1); conta(b, '2026-11-30', 2); conta(b, '2026-11-22', 4); conta(b, '2026-11-21', 8);
    const r = radar(b);
    assert.deepEqual([r.proximos7.total, r.vencidas.total], [5, 8]);
  });

  test('mostra no máximo 8 itens, mas o total/quantidade contam todos', () => {
    const b = loadBackend();
    for (let d = 1; d <= 10; d++) conta(b, '2026-12-' + String(d).padStart(2, '0'), 10);
    const r = radar(b); assert.equal(r.itens.length, 8); assert.equal(r.qtd, 10); assert.equal(r.total, 100);
  });

  test('sem vencimento, vale a data do lançamento; a conta vencida de ontem conta como vencida', () => {
    const b = loadBackend();
    b.lanc({ tipo: 'saida', status: 'pendente', valor: 20, data: '2026-11-21' });
    const r = radar(b); assert.equal(r.vencidas.qtd, 1); assert.equal(r.itens[0].venc, '2026-11-21');
  });

  test('cada item traz o registro completo (para editar/dar baixa) mais categoria e contato', () => {
    const b = loadBackend(); const c = b.call('contatos.save', { nome: 'Posto Z', fornecedor: true });
    conta(b, '2026-11-25', 80, { contato_id: c.id, parcelado: undefined });
    const i = radar(b).itens[0];
    for (const k of ['id', 'tipo', 'valor', 'data', 'vencimento', 'categoria_id', 'status', 'forma', 'grupo_id']) assert.ok(k in i, k);
    assert.equal(i.contato, 'Posto Z'); assert.equal(i.categoria, 'Cat saida');
  });

  test('parcelas entram no radar, cada uma no seu vencimento, com a numeração', () => {
    const b = loadBackend();
    b.lanc({ tipo: 'saida', valor: 300, data: '2026-11-20', vencimento: '2026-11-25', parcelado: true, parcelas: 3, descricao: 'Fogão' });
    const r = radar(b);
    assert.deepEqual(r.itens.map(i => [i.venc, i.parcela, i.parcelas]), [['2026-11-25', 1, 3], ['2026-12-25', 2, 3], ['2027-01-25', 3, 3]]);
    assert.equal(r.total, 300);
  });

  test('sem "hoje" no pedido usa a data do servidor (formato válido, sem erro)', () => {
    const b = loadBackend();
    assert.match(b.call('dashboard.summary', { mes: '2026-11' }).hoje, /^\d{4}-\d{2}-\d{2}$/);
  });
});
