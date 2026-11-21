/** Configurações de UI (logo, paleta, tema) persistidas na aba "config". */
const DEFAULT_CONFIG = {
  empresa: 'Minha Empresa', logo: '',
  primary: '#4F46E5', accent: '#10B981', danger: '#EF4444',
  tema: 'auto', radius: '14',
  contato_regra: 'opcional' // opcional | pendente (obrigatório se pendente) | sempre
};

function settingsGet_() {
  const cfg = Object.assign({}, DEFAULT_CONFIG);
  Db.list('config').forEach(function (r) { if (r.chave in DEFAULT_CONFIG) cfg[r.chave] = String(r.val); });
  return cfg;
}

function settingsRoutes_() {
  return {
    'settings.get': settingsGet_,
    'settings.save': function (p) {
      const have = Db.list('config').map(function (r) { return r.chave; });
      Object.keys(DEFAULT_CONFIG).forEach(function (k) {
        if (!(k in p)) return;
        if (k === 'contato_regra' && ['opcional', 'pendente', 'sempre'].indexOf(p[k]) < 0) return;
        const v = String(p[k]).slice(0, 45000); // limite de célula do Sheets ~50k
        if (have.indexOf(k) > -1) Db.update('config', k, { val: v }, 'chave');
        else Db.insert('config', { chave: k, val: v });
      });
      return settingsGet_();
    }
  };
}
