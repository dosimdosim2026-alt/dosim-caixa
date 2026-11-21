#!/usr/bin/env node
'use strict';
/**
 * Executor da suíte (sem dependências; usa o test runner nativo do Node).
 *   node tests/run.js              -> roda tudo
 *   node tests/run.js backend      -> só uma pasta (backend | frontend | static | regression)
 *   node tests/run.js lancamentos  -> só arquivos cujo caminho contém o texto
 * Funciona igual no PowerShell, CMD, macOS e Linux (não depende de "glob" do shell).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const filtro = (process.argv[2] || '').toLowerCase();

function achar(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? (e.name === 'helpers' || e.name === 'fixtures' ? [] : achar(p)) : (e.name.endsWith('.test.js') ? [p] : []);
  });
}

const arquivos = achar(ROOT).filter(f => !filtro || f.toLowerCase().includes(filtro)).sort();
if (!arquivos.length) { console.error('Nenhum teste encontrado para: ' + (filtro || '(todos)')); process.exit(1); }

const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...arquivos], { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
