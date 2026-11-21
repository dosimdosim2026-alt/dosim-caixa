/** Indicadores do painel. Considera "realizado" (status pago) nos totais. */
function dashboardRoutes_() {
  return {
    'dashboard.summary': function (p) {
      const mes = p.mes, cats = {}, all = Db.list('lancamentos');
      Db.list('categorias').forEach(function (c) { cats[c.id] = c; });
      const sum = function (rows, tipo, st) {
        return rows.filter(function (r) { return r.tipo === tipo && (!st || r.status === st); })
          .reduce(function (s, r) { return s + Number(r.valor); }, 0);
      };
      const cur = all.filter(function (r) { return String(r.data).indexOf(mes) === 0; });
      const entradas = sum(cur, 'entrada', 'pago'), saidas = sum(cur, 'saida', 'pago');

      const porCat = {};
      cur.filter(function (r) { return r.tipo === 'saida' && r.status === 'pago'; })
        .forEach(function (r) { porCat[r.categoria_id] = (porCat[r.categoria_id] || 0) + Number(r.valor); });
      const porCategoria = Object.keys(porCat).map(function (id) {
        return { nome: cats[id] ? cats[id].nome : 'Sem categoria', cor: cats[id] ? cats[id].cor : '#94A3B8', total: porCat[id] };
      }).sort(function (a, b) { return b.total - a.total; }).slice(0, 6);

      const y = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7)), serie = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(y, m - 1 - i, 1);
        const k = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
        const rows = all.filter(function (r) { return String(r.data).indexOf(k) === 0; });
        serie.push({ mes: k, entradas: sum(rows, 'entrada', 'pago'), saidas: sum(rows, 'saida', 'pago') });
      }
      // Pendências por contato (todos os meses): a receber (vendas) x a pagar (compras)
      const pend = {};
      all.filter(function (r) { return r.status === 'pendente' && r.contato_nome; }).forEach(function (r) {
        const k = normalizar_(r.contato_nome);
        pend[k] = pend[k] || { nome: r.contato_nome, aReceber: 0, aPagar: 0 };
        if (r.tipo === 'entrada') pend[k].aReceber += Number(r.valor); else pend[k].aPagar += Number(r.valor);
      });
      const porContato = Object.keys(pend).map(function (k) { return pend[k]; })
        .sort(function (a, b) { return Math.abs(b.aReceber - b.aPagar) - Math.abs(a.aReceber - a.aPagar); }).slice(0, 8);
      return {
        porContato: porContato, entradas: entradas, saidas: saidas, saldo: entradas - saidas,
        aReceber: sum(cur, 'entrada', 'pendente'), aPagar: sum(cur, 'saida', 'pendente'),
        porCategoria: porCategoria, serie: serie
      };
    }
  };
}
