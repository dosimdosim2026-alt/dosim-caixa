/**
 * FLUXO DE CAIXA — Web App (Google Apps Script)
 * Ponto de entrada + roteador de API.
 *
 * COMO ADICIONAR UM MÓDULO NOVO (ex.: fornecedores):
 *  1. Db.gs        -> declare o schema em SCHEMAS (colunas da aba).
 *  2. Fornecedores.gs -> crie fornecedoresRoutes_() usando makeCrud_/crudRoutes_.
 *  3. Code.gs      -> some fornecedoresRoutes_() em routes_().
 *  4. js_fornecedores.html -> App.register({...}) e inclua em index.html.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('Fluxo de Caixa')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(file) {
  return HtmlService.createHtmlOutputFromFile(file).getContent();
}

/**
 * API HTTP para a PWA (GitHub Pages): POST com corpo JSON { route, payload, pin }.
 * Responde sempre JSON: { ok: true, data } ou { ok: false, error }.
 * O front envia Content-Type text/plain (requisição "simples": o navegador não faz preflight CORS)
 * e não envia cookies, então não depende de conta Google logada nem de cookies de terceiros.
 */
function doPost(e) {
  let saida;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    saida = { ok: true, data: api(String(req.route || ''), req.payload || {}, req.pin) };
  } catch (err) {
    saida = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(saida)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Única função exposta ao frontend: google.script.run.api(rota, payload, pin)
 * Se existir a propriedade de script APP_PIN, toda rota (exceto auth.status) exige o PIN.
 */
function api(route, payload, pin) {
  if (route === 'auth.status') return authStatus_();
  authCheck_(pin);
  if (route === 'auth.check') return { ok: true };
  const fn = routes_()[route];
  if (!fn) throw new Error('Rota inválida: ' + route);
  return fn(payload || {});
}

/** Registro central de rotas — um módulo = uma linha. */
function routes_() {
  return Object.assign({},
    coreRoutes_(),
    categoriasRoutes_(),
    catalogoRoutes_(),
    contatosRoutes_(),
    lancamentosRoutes_(),
    dashboardRoutes_(),
    settingsRoutes_()
  );
}

function coreRoutes_() {
  return {
    'core.bootstrap': function () {
      Db.list('lancamentos'); Db.list('catalogo'); Db.list('contatos'); // garante que as abas existam (e migra colunas novas)
      if (Db.list('categorias').length === 0) seedCategorias_();
      return { config: settingsGet_(), categorias: categoriasCrud_().list(), catalogo: catalogoCrud_().list(), contatos: contatosCrud_().list() };
    }
  };
}

function seedCategorias_() {
  [['Vendas', 'entrada', '#10B981'], ['Serviços', 'entrada', '#06B6D4'], ['Outras receitas', 'entrada', '#84CC16'],
   ['Fornecedores', 'saida', '#F97316'], ['Salários', 'saida', '#8B5CF6'], ['Aluguel', 'saida', '#EC4899'],
   ['Impostos', 'saida', '#EF4444'], ['Marketing', 'saida', '#3B82F6']]
    .forEach(function (c) { Db.insert('categorias', { nome: c[0], tipo: c[1], cor: c[2], ativo: true }); });
}
