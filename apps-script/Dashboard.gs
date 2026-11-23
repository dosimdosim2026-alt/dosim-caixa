/**
 * Indicadores do painel por período: dia, mês ou ano (fechamento).
 * Regime de caixa: o realizado (pago) conta no dia em que o pagamento foi feito (data_pagamento);
 * o pendente conta no vencimento (previsão). O radar de contas em aberto olha todos os meses.
 */
function dashboardRoutes_() {
  return {
    'dashboard.summary': function (p) {
      const periodo = ['dia', 'mes', 'ano'].indexOf(p.periodo) > -1 ? p.periodo : 'mes';
      const ref = String(p.ref || p.mes || '');          // dia: aaaa-mm-dd | mes: aaaa-mm | ano: aaaa
      const formato = { dia: /^\d{4}-\d{2}-\d{2}$/, mes: /^\d{4}-\d{2}$/, ano: /^\d{4}$/ }[periodo];
      if (!formato.test(ref) || (periodo === 'dia' && !dataValida_(ref))) throw new Error('Período inválido.');

      const cats = {}, all = Db.list('lancamentos');
      Db.list('categorias').forEach(function (c) { cats[c.id] = c; });
      const sum = function (rows, tipo, st) {
        return rows.filter(function (r) { return r.tipo === tipo && (!st || r.status === st); })
          .reduce(function (s, r) { return s + Number(r.valor); }, 0);
      };
      const noPeriodo = function (r, chave) { return String(dataCaixa_(r)).indexOf(chave) === 0; };
      const cur = all.filter(function (r) { return noPeriodo(r, ref); });
      const entradas = sum(cur, 'entrada', 'pago'), saidas = sum(cur, 'saida', 'pago');

      const porCat = {};
      cur.filter(function (r) { return r.tipo === 'saida' && r.status === 'pago'; })
        .forEach(function (r) { porCat[r.categoria_id] = (porCat[r.categoria_id] || 0) + Number(r.valor); });
      const porCategoria = Object.keys(porCat).map(function (id) {
        return { nome: cats[id] ? cats[id].nome : 'Sem categoria', cor: cats[id] ? cats[id].cor : '#94A3B8', total: porCat[id] };
      }).sort(function (a, b) { return b.total - a.total; }).slice(0, 6);

      // Série do gráfico: dia = últimos 7 dias | mês = últimos 6 meses | ano = os 12 meses do ano
      const chaves = [];
      if (periodo === 'dia') { for (let i = 6; i >= 0; i--) chaves.push(addDias_(ref, -i)); }
      else if (periodo === 'ano') { for (let m = 1; m <= 12; m++) chaves.push(ref + '-' + ('0' + m).slice(-2)); }
      else {
        const y = Number(ref.slice(0, 4)), m = Number(ref.slice(5, 7));
        for (let i = 5; i >= 0; i--) { const d = new Date(y, m - 1 - i, 1); chaves.push(d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2)); }
      }
      const serie = chaves.map(function (k) {
        const rows = all.filter(function (r) { return noPeriodo(r, k); });
        return { mes: k, entradas: sum(rows, 'entrada', 'pago'), saidas: sum(rows, 'saida', 'pago') };
      });

      // Pendências por contato (todos os meses): a receber (vendas) x a pagar (compras)
      const pend = {};
      all.filter(function (r) { return r.status === 'pendente' && r.contato_nome; }).forEach(function (r) {
        const k = normalizar_(r.contato_nome);
        pend[k] = pend[k] || { nome: r.contato_nome, aReceber: 0, aPagar: 0 };
        if (r.tipo === 'entrada') pend[k].aReceber += Number(r.valor); else pend[k].aPagar += Number(r.valor);
      });
      const porContato = Object.keys(pend).map(function (k) { return pend[k]; })
        .sort(function (a, b) { return Math.abs(b.aReceber - b.aPagar) - Math.abs(a.aReceber - a.aPagar); }).slice(0, 8);

      // Radar: contas em aberto de TODOS os meses (pendentes), pela data de vencimento
      const hoje = dataValida_(p.hoje) ? p.hoje : hojeISO_(), em7 = addDias_(hoje, 7);
      const arred = function (n) { return Math.round(n * 100) / 100; };
      const total = function (rows) { return arred(rows.reduce(function (s, r) { return s + Number(r.valor); }, 0)); };
      const ctMap = {}; Db.list('contatos').forEach(function (c) { ctMap[c.id] = c; });
      const enriquecer = function (r) {
        return Object.assign({}, r, { venc: dataCaixa_(r), categoria: cats[r.categoria_id] ? cats[r.categoria_id].nome : '', contato: ctMap[r.contato_id] ? ctMap[r.contato_id].nome : r.contato_nome });
      };
      const radar = function (tipo) {
        const abertos = all.filter(function (r) { return r.tipo === tipo && r.status === 'pendente'; })
          .sort(function (a, b) { return String(dataCaixa_(a)).localeCompare(String(dataCaixa_(b))) || String(a.criado_em).localeCompare(String(b.criado_em)); });
        const vencidas = abertos.filter(function (r) { return dataCaixa_(r) < hoje; });
        const prox = abertos.filter(function (r) { return dataCaixa_(r) >= hoje && dataCaixa_(r) <= em7; });
        return {
          total: total(abertos), qtd: abertos.length,
          vencidas: { qtd: vencidas.length, total: total(vencidas) },
          proximos7: { qtd: prox.length, total: total(prox) },
          itens: abertos.slice(0, 8).map(enriquecer)
        };
      };

      const out = {
        periodo: periodo, ref: ref, hoje: hoje,
        contasPagar: radar('saida'), contasReceber: radar('entrada'),
        porContato: porContato, entradas: arred(entradas), saidas: arred(saidas), saldo: arred(entradas - saidas),
        aReceber: sum(cur, 'entrada', 'pendente'), aPagar: sum(cur, 'saida', 'pendente'),
        porCategoria: porCategoria, serie: serie
      };
      if (periodo === 'dia') {                              // fechamento do dia: tudo que foi pago/recebido nele
        out.movimentos = cur.filter(function (r) { return r.status === 'pago'; })
          .sort(function (a, b) { return String(a.criado_em).localeCompare(String(b.criado_em)); }).map(enriquecer);
      }
      return out;
    }
  };
}
