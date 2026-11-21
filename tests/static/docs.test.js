'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pkg = JSON.parse(read('package.json'));

describe('Documentação em dia (parte da rotina de cada correção/novidade)', () => {
  test('CHANGELOG.md tem a versão atual do package.json', () => {
    assert.match(read('CHANGELOG.md'), new RegExp(`^## \\[${pkg.version.replace(/\./g, '\\.')}\\]`, 'm'),
      `adicione "## [${pkg.version}]" ao CHANGELOG.md`);
  });
  test('todo teste de regressão (REG-nnn) está citado no CHANGELOG', () => {
    const ids = [...new Set([...read('tests/regression/regression.test.js').matchAll(/REG-\d{3}/g)].map(m => m[0]))];
    assert.ok(ids.length > 0);
    const log = read('CHANGELOG.md');
    for (const id of ids) assert.ok(log.includes(id), `${id} não aparece no CHANGELOG.md`);
  });
  test('IDs de regressão são únicos (um bug = um ID)', () => {
    const ids = [...read('tests/regression/regression.test.js').matchAll(/^describe\('(REG-\d{3})/gm)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length);
  });
  test('README e TESTING existem', () => { assert.ok(read('README.md').length > 500); assert.ok(read('TESTING.md').length > 500); });
});
