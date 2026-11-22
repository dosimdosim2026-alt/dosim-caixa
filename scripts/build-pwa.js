#!/usr/bin/env node
'use strict';
/**
 * Gera pwa/index.html: junta a tela do app (apps-script/css.html + js_*.html, na ordem do
 * apps-script/index.html) ao modelo scripts/pwa-template.html. Assim existe UM código de telas,
 * usado tanto no link do Apps Script quanto na PWA (GitHub Pages).
 *
 *   npm run build          -> gera pwa/index.html
 * Um teste confere que pwa/index.html está em dia: mudou algo em apps-script/? rode o build.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GAS = path.join(ROOT, 'apps-script');
const norm = t => t.replace(/\r\n/g, '\n');
const lerParte = nome => norm(fs.readFileSync(path.join(GAS, nome + '.html'), 'utf8')).trim();

function build() {
  const index = fs.readFileSync(path.join(GAS, 'index.html'), 'utf8');
  const nomes = [...index.matchAll(/include\('([a-z_]+)'\)/g)].map(m => m[1]);
  const estilos = nomes.filter(n => !n.startsWith('js_')).map(lerParte).join('\n');
  const scripts = nomes.filter(n => n.startsWith('js_')).map(lerParte).join('\n');
  const modelo = norm(fs.readFileSync(path.join(__dirname, 'pwa-template.html'), 'utf8'));
  for (const m of ['<!--@STYLES-->', '<!--@SCRIPTS-->']) if (!modelo.includes(m)) throw new Error('marcador ausente no modelo: ' + m);
  // função como substituto: o código das telas tem "$" e "$$" que o replace() trataria como padrões especiais
  return modelo.replace('<!--@STYLES-->', () => estilos).replace('<!--@SCRIPTS-->', () => scripts);
}

module.exports = { build };

if (require.main === module) {
  const saida = path.join(ROOT, 'pwa', 'index.html');
  fs.writeFileSync(saida, build(), 'utf8');
  console.log('pwa/index.html gerado (' + Math.round(fs.statSync(saida).size / 1024) + ' KB)');
}
