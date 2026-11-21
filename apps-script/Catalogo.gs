/**
 * Catálogo: produtos/serviços (tipo "entrada") e despesas recorrentes (tipo "saida", ex.: Gasolina).
 * Alimenta a lista de seleção do lançamento. Item novo pode nascer aqui ou ao lançar manualmente.
 */
function catalogoCrud_() {
  return makeCrud_('catalogo', {
    map: function (r) {
      return Object.assign({}, r, {
        ativo: r.ativo === true || String(r.ativo).toLowerCase() === 'true',
        preco: r.preco === '' || r.preco === null ? '' : Number(r.preco)
      });
    },
    validate: function (p) {
      const nome = String(p.nome || '').trim();
      if (!nome) throw new Error('Informe o nome do item.');
      if (['entrada', 'saida'].indexOf(p.tipo) < 0) throw new Error('Tipo inválido.');
      const preco = (p.preco === '' || p.preco === null || p.preco === undefined) ? '' : Number(p.preco);
      if (preco !== '' && !(preco >= 0)) throw new Error('Valor padrão inválido.');
      const dup = Db.list('catalogo').some(function (i) {
        return i.id !== p.id && i.tipo === p.tipo && normalizar_(i.nome) === normalizar_(nome);
      });
      if (dup) throw new Error('Já existe um item com esse nome.');
      return { id: p.id, tipo: p.tipo, nome: nome.slice(0, 80), categoria_id: p.categoria_id || '', preco: preco, ativo: p.ativo !== false };
    },
    sort: function (a, b) { return a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome); }
  });
}
function catalogoRoutes_() { return crudRoutes_('catalogo', catalogoCrud_()); }
