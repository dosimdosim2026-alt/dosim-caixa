/** Painel de lançamentos (receitas e despesas). */
const FORMAS_ = ['pix', 'dinheiro', 'credito', 'debito', 'transferencia'];

function validarLancamento_(p) {
  const valor = Number(p.valor);
  if (!(valor > 0)) throw new Error('Informe um valor maior que zero.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.data)) throw new Error('Informe uma data válida.');
  if (['entrada', 'saida'].indexOf(p.tipo) < 0) throw new Error('Tipo inválido.');
  const cat = Db.list('categorias').filter(function (c) { return c.id === p.categoria_id; })[0];
  if (!cat || cat.tipo !== p.tipo) throw new Error('Selecione uma categoria do mesmo tipo.');
  return {
    id: p.id, data: p.data, tipo: p.tipo, categoria_id: p.categoria_id,
    descricao: String(p.descricao || '').trim().slice(0, 200),
    valor: Math.round(valor * 100) / 100,
    status: p.status === 'pendente' ? 'pendente' : 'pago',
    forma: FORMAS_.indexOf(p.forma) > -1 ? p.forma : '',
    item_id: String(p.item_id || ''),
    contato_id: '', contato_nome: ''
  };
}

/** Regra de Ajustes (contato_regra): opcional | pendente (obrigatório se pendente) | sempre. */
function exigirContato_(d, nome) {
  const regra = settingsGet_().contato_regra;
  if (!nome && (regra === 'sempre' || (regra === 'pendente' && d.status === 'pendente')))
    throw new Error(d.tipo === 'entrada' ? 'Informe o cliente deste lançamento.' : 'Informe o fornecedor deste lançamento.');
}

/** Data do filtro de período: vazia = sem limite; formato diferente de aaaa-mm-dd é recusado. */
function dataFiltro_(v, qual) {
  if (v === undefined || v === null || v === '') return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new Error('Data ' + qual + ' do período inválida.');
  return String(v);
}

function lancamentosRoutes_() {
  const crud = makeCrud_('lancamentos', {
    validate: validarLancamento_,
    filter: function (rows, p) {
      // Período: "mes" (aaaa-mm) ou intervalo "de"/"ate" (aaaa-mm-dd, inclusive nas duas pontas).
      const de = dataFiltro_(p.de, 'inicial'), ate = dataFiltro_(p.ate, 'final');
      if (de && ate && de > ate) throw new Error('A data inicial não pode ser maior que a final.');
      return rows.filter(function (r) {
        const d = String(r.data);
        return (!p.mes || d.indexOf(p.mes) === 0) && (!de || d >= de) && (!ate || d <= ate) && (!p.tipo || r.tipo === p.tipo);
      });
    },
    sort: function (a, b) { return String(b.data).localeCompare(String(a.data)); }
  });
  const routes = crudRoutes_('lancamentos', crud);

  // Salvar: valida tudo primeiro; só depois grava contato/item novos (se pedido) e o lançamento.
  routes['lancamentos.save'] = function (p) {
    const d = validarLancamento_(p);
    const papel = d.tipo === 'entrada' ? 'cliente' : 'fornecedor';

    // --- contato (cliente nas entradas, fornecedor nas saídas) ---
    let contato = p.contato_id ? Db.list('contatos').filter(function (c) { return c.id === p.contato_id; })[0] : null;
    const nome = contato ? contato.nome : String(p.contato_nome || '').trim().slice(0, 80);
    exigirContato_(d, nome);

    if (!contato && nome) {
      const chave = normalizar_(nome);
      contato = Db.list('contatos').filter(function (c) { return normalizar_(c.nome) === chave; })[0];
      if (!contato && p.salvar_contato) {
        contato = Db.insert('contatos', { nome: nome, telefone: '', obs: '', cliente: papel === 'cliente', fornecedor: papel === 'fornecedor', ativo: true });
      }
    }
    // contato existente só no outro papel: marca também, se o usuário confirmou (cliente que é fornecedor)
    if (contato && p.salvar_contato && !bool_(contato[papel])) {
      const patch = {}; patch[papel] = true; Db.update('contatos', contato.id, patch);
    }
    d.contato_id = contato ? contato.id : '';
    d.contato_nome = contato ? contato.nome : nome;

    // --- item do catálogo digitado manualmente ---
    if (p.salvar_catalogo && !d.item_id && d.descricao) {
      const chave = normalizar_(d.descricao);
      let item = Db.list('catalogo').filter(function (i) { return i.tipo === d.tipo && normalizar_(i.nome) === chave; })[0];
      if (!item) item = Db.insert('catalogo', {
        tipo: d.tipo, nome: d.descricao, categoria_id: d.categoria_id,
        preco: d.tipo === 'entrada' ? d.valor : '', ativo: true
      });
      d.item_id = item.id;
    }
    return d.id ? Db.update('lancamentos', d.id, d) : Db.insert('lancamentos', d);
  };
  return routes;
}
