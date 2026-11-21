'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('../helpers/gas-mock');

describe('Ajustes — configuração de UI e regras', () => {
  test('valores padrão quando nada foi salvo', () => {
    const c = loadBackend().call('settings.get');
    assert.equal(c.contato_regra, 'opcional'); assert.equal(c.tema, 'auto'); assert.equal(c.radius, '14');
  });

  test('salva e relê; salvar de novo atualiza em vez de duplicar linhas', () => {
    const b = loadBackend();
    b.call('settings.save', { empresa: 'DoSim', primary: '#9E4563' });
    const c = b.call('settings.save', { empresa: 'DoSim 2' });
    assert.equal(c.empresa, 'DoSim 2'); assert.equal(c.primary, '#9E4563');
    const chaves = b.sheet('config').rows.slice(1).map(r => r[0]);
    assert.equal(new Set(chaves).size, chaves.length);
  });

  test('ignora chaves desconhecidas', () => {
    const b = loadBackend();
    b.call('settings.save', { hacker: 'x', empresa: 'A' });
    assert.ok(!('hacker' in b.call('settings.get')));
  });

  test('contato_regra inválida é ignorada (mantém a anterior)', () => {
    const b = loadBackend();
    b.call('settings.save', { contato_regra: 'sempre' });
    assert.equal(b.call('settings.save', { contato_regra: 'talvez' }).contato_regra, 'sempre');
  });

  test('logo grande é cortada no limite da célula do Sheets', () => {
    const b = loadBackend();
    assert.equal(b.call('settings.save', { logo: 'a'.repeat(50000) }).logo.length, 45000);
  });

  test('logo pode ser removida (string vazia)', () => {
    const b = loadBackend();
    b.call('settings.save', { logo: 'data:image/png;base64,AAAA' });
    assert.equal(b.call('settings.save', { logo: '' }).logo, '');
  });
});
