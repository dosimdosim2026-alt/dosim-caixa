/**
 * Contatos: cadastro único de pessoas/empresas.
 * Um mesmo contato pode ser cliente, fornecedor ou os dois (duas marcações independentes).
 */
function contatosCrud_() {
  return makeCrud_('contatos', {
    map: function (r) {
      return Object.assign({}, r, { cliente: bool_(r.cliente), fornecedor: bool_(r.fornecedor), ativo: bool_(r.ativo) });
    },
    validate: function (p) {
      const nome = String(p.nome || '').trim();
      if (!nome) throw new Error('Informe o nome do contato.');
      const cliente = p.cliente === true, fornecedor = p.fornecedor === true;
      if (!cliente && !fornecedor) throw new Error('Marque se o contato é cliente, fornecedor ou ambos.');
      const dup = Db.list('contatos').some(function (c) { return c.id !== p.id && normalizar_(c.nome) === normalizar_(nome); });
      if (dup) throw new Error('Já existe um contato com esse nome.');
      return {
        id: p.id, nome: nome.slice(0, 80), telefone: String(p.telefone || '').trim().slice(0, 30),
        obs: String(p.obs || '').trim().slice(0, 200), cliente: cliente, fornecedor: fornecedor, ativo: p.ativo !== false
      };
    },
    filter: function (rows, p) { return rows.filter(function (r) { return !p.papel || bool_(r[p.papel]); }); },
    sort: function (a, b) { return a.nome.localeCompare(b.nome); }
  });
}
function contatosRoutes_() { return crudRoutes_('contatos', contatosCrud_()); }
