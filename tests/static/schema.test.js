'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadBackend } = require('../helpers/gas-mock');

const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'schema-baseline.json'), 'utf8')).schemas;
const atual = loadBackend().run('SCHEMAS');

describe('Compatibilidade das planilhas em uso (schema só cresce no fim)', () => {
  for (const tabela of Object.keys(baseline)) {
    test(`aba "${tabela}": colunas existentes mantêm nome e posição`, () => {
      assert.ok(atual[tabela], `a aba "${tabela}" não pode ser removida`);
      assert.deepEqual(atual[tabela].slice(0, baseline[tabela].length), baseline[tabela],
        `não reordene, renomeie nem remova colunas de "${tabela}": novas colunas entram SEMPRE no fim`);
    });
  }
  test('toda aba tem coluna id (exceto config) e nomes de coluna únicos', () => {
    for (const [t, cols] of Object.entries(atual)) {
      assert.equal(new Set(cols).size, cols.length, `${t}: coluna repetida`);
      if (t !== 'config') assert.equal(cols[0], 'id', `${t}: a 1ª coluna deve ser id`);
    }
  });
});
