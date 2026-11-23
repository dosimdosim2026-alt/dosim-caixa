/** Painel de lançamentos (receitas e despesas), vencimentos e parcelamento. */
const FORMAS_ = ['pix', 'dinheiro', 'credito', 'debito', 'transferencia'];
const MAX_PARCELAS_ = 60;

function validarLancamento_(p) {
  const valor = Number(p.valor);
  if (!(valor > 0)) throw new Error('Informe um valor maior que zero.');
  if (!dataValida_(p.data)) throw new Error('Informe uma data válida.');
  if (p.vencimento && !dataValida_(p.vencimento)) throw new Error('Informe um vencimento válido.');
  if (p.data_pagamento && !dataValida_(p.data_pagamento)) throw new Error('Informe uma data de pagamento válida.');
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
    contato_id: '', contato_nome: '',
    vencimento: p.vencimento ? String(p.vencimento) : '',
    parcela: '', parcelas: '', grupo_id: '',
    data_pagamento: p.data_pagamento ? String(p.data_pagamento) : ''
  };
}

/** Regra de Ajustes (contato_regra): opcional | pendente (obrigatório se pendente) | sempre. */
function exigirContato_(d, nome) {
  const regra = settingsGet_().contato_regra;
  if (!nome && (regra === 'sempre' || (regra === 'pendente' && d.status === 'pendente')))
    throw new Error(d.tipo === 'entrada' ? 'Informe o cliente deste lançamento.' : 'Informe o fornecedor deste lançamento.');
}

function lancamentosRoutes_() {
  const crud = makeCrud_('lancamentos', {
    validate: validarLancamento_,
    // O mês segue a data de caixa (vencimento, se houver): cada parcela aparece no mês em que vence.
    filter: function (rows, p) {
      return rows.filter(function (r) {
        return (!p.mes || String(dataCaixa_(r)).indexOf(p.mes) === 0) && (!p.tipo || r.tipo === p.tipo) && (!p.status || r.status === p.status);
      });
    },
    sort: function (a, b) { return String(dataCaixa_(b)).localeCompare(String(dataCaixa_(a))); }
  });
  const routes = crudRoutes_('lancamentos', crud);

  routes['lancamentos.list'] = function (p) {
    const rows = crud.list(p);
    if (p.ordem === 'asc') rows.sort(function (a, b) { return String(dataCaixa_(a)).localeCompare(String(dataCaixa_(b))); });
    return rows;
  };

  // Salvar: valida tudo primeiro; só depois grava contato/item novos (se pedido) e o lançamento (ou as parcelas).
  routes['lancamentos.save'] = function (p) {
    const d = validarLancamento_(p);
    const papel = d.tipo === 'entrada' ? 'cliente' : 'fornecedor';
    const parcelar = !p.id && p.parcelado === true;
    let n = 0;
    if (parcelar) {
      n = Number(p.parcelas);
      if (!(Number.isInteger(n) && n >= 2 && n <= MAX_PARCELAS_)) throw new Error('Informe de 2 a ' + MAX_PARCELAS_ + ' parcelas.');
      if (!d.vencimento) throw new Error('Informe o vencimento da 1ª parcela.');
      d.status = 'pendente';                                   // parcelas são contas em aberto (a 1ª pode nascer paga)
    }
    const atual = p.id ? Db.list('lancamentos').filter(function (r) { return r.id === p.id; })[0] : null;
    if (p.id && !atual) throw new Error('Registro não encontrado.');

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

    if (parcelar) {                                            // compra/venda parcelada: gera todas as parcelas de uma vez
      const valores = splitParcelas_(d.valor, n), grupo = Utilities.getUuid();
      return Db.insertMany('lancamentos', valores.map(function (v, i) {
        return Object.assign({}, d, {
          valor: v, vencimento: addMeses_(d.vencimento, i), parcela: i + 1, parcelas: n, grupo_id: grupo,
          status: (i === 0 && p.primeira_paga === true) ? 'pago' : 'pendente',
          data_pagamento: (i === 0 && p.primeira_paga === true) ? (d.data_pagamento || d.data) : ''
        });
      }));
    }
    // data do pagamento: só existe para lançamento realizado; sem ela, vale a data do lançamento (ou a já gravada)
    if (d.status !== 'pago') d.data_pagamento = '';
    else if (!d.data_pagamento) d.data_pagamento = (atual && atual.status === 'pago' && atual.data_pagamento) || d.data;
    if (atual) {                                               // editar uma parcela não muda a que grupo ela pertence
      d.parcela = atual.parcela; d.parcelas = atual.parcelas; d.grupo_id = atual.grupo_id;
      return Db.update('lancamentos', d.id, d);
    }
    return Db.insert('lancamentos', d);
  };

  // Dar baixa (marcar como pago/recebido): grava a DATA DO PAGAMENTO (padrão: hoje) e, se informada, a forma usada
  routes['lancamentos.baixa'] = function (p) {
    const atual = Db.list('lancamentos').filter(function (r) { return r.id === p.id; })[0];
    if (!atual) throw new Error('Registro não encontrado.');
    if (p.data_pagamento && !dataValida_(p.data_pagamento)) throw new Error('Informe uma data de pagamento válida.');
    const patch = { status: 'pago' };
    if (p.data_pagamento) patch.data_pagamento = p.data_pagamento;
    else if (atual.status !== 'pago' || !ISO_.test(String(atual.data_pagamento || ''))) patch.data_pagamento = dataValida_(p.hoje) ? p.hoje : hojeISO_();
    if (FORMAS_.indexOf(p.forma) > -1) patch.forma = p.forma;
    return Db.update('lancamentos', p.id, patch);
  };

  // Excluir um parcelamento inteiro (por padrão só as parcelas ainda pendentes; todas:true apaga também as pagas)
  routes['lancamentos.remove_grupo'] = function (p) {
    const g = String(p.grupo_id || '');
    if (!g) throw new Error('Parcelamento não informado.');
    const grupo = Db.list('lancamentos').filter(function (r) { return r.grupo_id === g; });
    if (!grupo.length) throw new Error('Parcelamento não encontrado.');
    const alvo = grupo.filter(function (r) { return p.todas === true || r.status === 'pendente'; });
    return { removidas: Db.removeMany('lancamentos', alvo.map(function (r) { return r.id; })) };
  };
  return routes;
}
