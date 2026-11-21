/** Tipos de entrada e saída (categorias). */
function categoriasCrud_() {
  return makeCrud_('categorias', {
    map: function (r) {
      return Object.assign({}, r, { ativo: r.ativo === true || String(r.ativo).toLowerCase() === 'true' });
    },
    validate: function (p) {
      const nome = String(p.nome || '').trim();
      if (!nome) throw new Error('Informe o nome da categoria.');
      if (['entrada', 'saida'].indexOf(p.tipo) < 0) throw new Error('Tipo inválido.');
      return {
        id: p.id, nome: nome.slice(0, 60), tipo: p.tipo,
        cor: /^#[0-9A-Fa-f]{6}$/.test(p.cor) ? p.cor : '#64748B',
        ativo: p.ativo !== false
      };
    },
    beforeDelete: function (id) {
      const emUso = Db.list('lancamentos').some(function (l) { return l.categoria_id === id; });
      const emItem = Db.list('catalogo').some(function (i) { return i.categoria_id === id; });
      if (emUso || emItem) throw new Error('Categoria em uso por lançamentos ou itens do catálogo. Marque como inativa em vez de excluir.');
    },
    sort: function (a, b) { return a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome); }
  });
}
function categoriasRoutes_() { return crudRoutes_('categorias', categoriasCrud_()); }
