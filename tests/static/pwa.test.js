'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PWA = path.join(__dirname, '..', '..', 'pwa');
const read = f => fs.readFileSync(path.join(PWA, f), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));
const index = read('index.html');
const sw = read('sw.js');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));

function pngSize(file) {
  const b = fs.readFileSync(path.join(PWA, file));
  assert.equal(b.subarray(1, 4).toString(), 'PNG', `${file} não é PNG`);
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
}

describe('PWA — manifesto e instalação', () => {
  test('campos essenciais para instalar (nome, escopo, tela cheia, idioma)', () => {
    assert.ok(manifest.name && manifest.short_name); assert.ok(manifest.short_name.length <= 12);
    assert.equal(manifest.start_url, './'); assert.equal(manifest.scope, './');
    assert.equal(manifest.display, 'standalone'); assert.equal(manifest.lang, 'pt-BR');
  });
  test('cor da marca igual no manifesto, no index e na página offline (barra de status e splash)', () => {
    assert.match(manifest.theme_color, /^#[0-9A-F]{6}$/i);
    assert.equal(manifest.background_color, manifest.theme_color);
    for (const html of [index, read('offline.html')]) assert.match(html, new RegExp(`name="theme-color" content="${manifest.theme_color}"`, 'i'));
  });
  test('ícones: 192 e 512, "any" e "maskable", com o tamanho declarado', () => {
    const combos = manifest.icons.map(i => `${i.sizes}:${i.purpose}`);
    for (const c of ['192x192:any', '512x512:any', '192x192:maskable', '512x512:maskable']) assert.ok(combos.includes(c), `falta ícone ${c}`);
    for (const i of manifest.icons) assert.equal(pngSize(i.src), i.sizes, i.src);
  });
  test('ícone do iPhone (180x180), favicons e ícone de splash existem', () => {
    assert.equal(pngSize('icons/apple-touch-icon.png'), '180x180');
    assert.equal(pngSize('icons/favicon-32.png'), '32x32'); assert.equal(pngSize('icons/favicon-16.png'), '16x16');
    assert.ok(fs.existsSync(path.join(PWA, 'icons', 'favicon.ico')));
  });
});

describe('PWA — página gerada (pwa/index.html)', () => {
  test('tags para instalar no celular e ocupar a tela toda', () => {
    for (const t of ['rel="manifest"', 'rel="apple-touch-icon"', 'viewport-fit=cover', 'apple-mobile-web-app-capable" content="yes"',
                     'apple-mobile-web-app-status-bar-style" content="black-translucent"', 'mobile-web-app-capable" content="yes"'])
      assert.ok(index.includes(t), `falta ${t}`);
    assert.match(index, /env\(safe-area-inset-top\)/); assert.match(index, /env\(safe-area-inset-bottom\)/);
  });
  test('NÃO usa iframe: o app roda direto na página (iframe falha com várias contas Google / cookies bloqueados)', () => {
    assert.ok(!/<iframe/i.test(index));
  });
  test('carrega o config.js antes do app, inicia o app e registra o service worker', () => {
    assert.ok(index.indexOf('<script src="config.js">') > -1 && index.indexOf('<script src="config.js">') < index.indexOf('const API'));
    assert.ok(index.indexOf('App.start();') > index.indexOf("id: 'config'"));
    assert.match(index, /serviceWorker\.register\('sw\.js'\)/);
  });
  test('está EM DIA com o código de apps-script/ (se falhar: npm run build)', () => {
    const { build } = require('../../scripts/build-pwa');
    assert.equal(index.replace(/\r\n/g, '\n'), build(), 'pwa/index.html desatualizado: rode "npm run build" e faça commit');
  });
  test('todos os scripts embutidos têm sintaxe válida', () => {
    const blocos = [...index.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    assert.ok(blocos.length >= 9);
    for (const js of blocos) assert.doesNotThrow(() => new vm.Script(js));
  });
  test('usa o transporte HTTP (API.http) e a cor da barra (setBarColor)', () => {
    assert.match(index, /async http\(route, payload, pin\)/); assert.match(index, /setBarColor\(/);
  });
});

describe('PWA — GitHub Pages (publica em subpasta: caminhos relativos)', () => {
  test('nenhum caminho absoluto ("/...") em manifesto, index e service worker', () => {
    assert.ok(!/(href|src)="\//.test(index), 'index.html tem href/src absoluto');
    for (const i of manifest.icons) assert.ok(!i.src.startsWith('/'), i.src);
    const lista = JSON.parse(sw.match(/const ASSETS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
    for (const a of lista) assert.ok(!a.startsWith('/'), `pré-cache com caminho absoluto: ${a}`);
    assert.ok(!/register\(['"]\//.test(index), 'o service worker deve ser registrado com caminho relativo');
  });
  test('.nojekyll existe (o Pages não ignora pastas especiais)', () => assert.ok(fs.existsSync(path.join(PWA, '.nojekyll'))));
  test('config.js aponta para um link /exec do Apps Script', () => {
    const cfg = {}; vm.runInNewContext(read('config.js'), { window: cfg });
    assert.match(cfg.APP_CONFIG.APP_URL, /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/);
  });
});

describe('PWA — service worker', () => {
  test('VERSION do sw.js = version do package.json (lembrete para publicar atualização)', () => {
    assert.equal(sw.match(/const VERSION = '([^']+)'/)[1], pkg.version);
  });
  test('todos os arquivos do pré-cache existem', () => {
    const lista = JSON.parse(sw.match(/const ASSETS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
    for (const a of lista) assert.ok(fs.existsSync(path.join(PWA, a === './' ? 'index.html' : a)), `pré-cache: falta ${a}`);
    for (const i of manifest.icons) assert.ok(lista.includes(i.src), `${i.src} fora do pré-cache`);
  });
  test('nunca intercepta requisições de outro domínio (Google Apps Script) nem POST', () => {
    assert.match(sw, /url\.origin !== self\.location\.origin\) return/); assert.match(sw, /req\.method !== 'GET'\) return/);
  });
});
