'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { GAS_DIR, scriptOf, indexIncludes } = require('../helpers/front');
const { loadBackend } = require('../helpers/gas-mock');

const htmls = fs.readdirSync(GAS_DIR).filter(f => f.endsWith('.html'));
const gs = fs.readdirSync(GAS_DIR).filter(f => f.endsWith('.gs'));

describe('Estrutura do projeto Apps Script', () => {
  test('todo include() do index.html aponta para um arquivo que existe', () => {
    for (const n of indexIncludes()) assert.ok(fs.existsSync(path.join(GAS_DIR, n + '.html')), `falta ${n}.html`);
  });

  test('todo arquivo .html (exceto index) é incluído no index — senão o módulo "some" em produção', () => {
    const inc = indexIncludes();
    for (const f of htmls.filter(f => f !== 'index.html')) assert.ok(inc.includes(f.replace('.html', '')), `${f} não está no index.html`);
  });

  test('o index carrega o core antes dos módulos e inicia o app por último', () => {
    const html = fs.readFileSync(path.join(GAS_DIR, 'index.html'), 'utf8');
    const inc = indexIncludes();
    assert.ok(inc.indexOf('js_core') < inc.indexOf('js_dashboard'));
    assert.ok(inc.indexOf('js_auth') > inc.indexOf('js_core'));
    assert.ok(html.lastIndexOf('App.start()') > html.lastIndexOf("include('js_config')"));
  });

  test('nenhum scriptlet <? ?> além dos include() (quebraria o HTML do Apps Script)', () => {
    for (const f of htmls) {
      const txt = fs.readFileSync(path.join(GAS_DIR, f), 'utf8').replace(/<\?!= include\('[a-z_]+'\) \?>/g, '');
      assert.ok(!/<\?|\?>/.test(txt), `${f} contém <? ou ?>`);
    }
  });

  for (const f of htmls) test(`sintaxe JavaScript de ${f}`, () => { const js = scriptOf(f); if (js) assert.doesNotThrow(() => new vm.Script(js, { filename: f })); });
  for (const f of gs) test(`sintaxe de ${f}`, () => assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(GAS_DIR, f), 'utf8'), { filename: f })));

  test('toda rota chamada pelo front (API.call) existe no backend', () => {
    const rotasFront = new Set();
    for (const f of htmls) for (const m of fs.readFileSync(path.join(GAS_DIR, f), 'utf8').matchAll(/API\.call\('([a-z]+\.[a-z_]+)'/g)) rotasFront.add(m[1]);
    const back = new Set([...loadBackend().run('Object.keys(routes_())'), 'auth.status', 'auth.check']);
    for (const r of rotasFront) assert.ok(back.has(r), `rota "${r}" usada no front não existe no backend`);
    assert.ok(rotasFront.size >= 10);
  });

  test('doGet entrega o index permitindo iframe (a PWA depende disso)', () => {
    const b = loadBackend(); b.ctx.doGet();
    assert.deepEqual(b.html.calls.find(c => c[0] === 'template'), ['template', 'index']);
    assert.deepEqual(b.html.calls.find(c => c[0] === 'xframe'), ['xframe', 'ALLOWALL']);
    assert.ok(b.html.calls.some(c => c[0] === 'meta' && c[1] === 'viewport'));
  });
});

describe('Manifesto appsscript.json', () => {
  const raw = fs.readFileSync(path.join(GAS_DIR, 'appsscript.json'));
  test('sem BOM (o clasp rejeita como "Invalid manifest file")', () => assert.notDeepEqual([...raw.subarray(0, 3)], [0xEF, 0xBB, 0xBF]));
  test('JSON válido, runtime V8, fuso de São Paulo, executa como o dono', () => {
    const j = JSON.parse(raw.toString('utf8'));
    assert.equal(j.runtimeVersion, 'V8'); assert.equal(j.timeZone, 'America/Sao_Paulo');
    assert.equal(j.webapp.executeAs, 'USER_DEPLOYING');
    assert.ok(['MYSELF', 'DOMAIN', 'ANYONE', 'ANYONE_ANONYMOUS'].includes(j.webapp.access));
  });
  test('acesso público (ANYONE_ANONYMOUS) só é permitido junto de PIN: documentado no README', () => {
    const j = JSON.parse(raw.toString('utf8'));
    if (j.webapp.access === 'ANYONE_ANONYMOUS') assert.match(fs.readFileSync(path.join(__dirname, '..', '..', 'README.md'), 'utf8'), /APP_PIN/);
  });
});
