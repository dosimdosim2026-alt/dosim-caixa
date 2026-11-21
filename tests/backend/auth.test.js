'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('../helpers/gas-mock');

describe('PIN de acesso (necessário quando o app é público, como na PWA)', () => {
  test('sem APP_PIN o app funciona como antes', () => {
    const b = loadBackend();
    assert.equal(b.call('auth.status').required, false);
    assert.doesNotThrow(() => b.call('core.bootstrap'));
  });

  test('com APP_PIN: status é público e só expõe a identidade visual', () => {
    const b = loadBackend({ props: { APP_PIN: '1234' } });
    b.call('settings.save', { empresa: 'DoSim', primary: '#9E4563' }, '1234');
    const st = b.call('auth.status');
    assert.equal(st.required, true);
    assert.deepEqual(Object.keys(st.brand).sort(), ['empresa', 'logo', 'primary']);
    assert.equal(st.brand.empresa, 'DoSim');
  });

  test('com APP_PIN: nenhuma rota de dados abre sem o PIN certo', () => {
    const rotas = ['core.bootstrap', 'lancamentos.list', 'lancamentos.save', 'lancamentos.remove', 'categorias.list', 'contatos.list',
                   'catalogo.list', 'settings.get', 'settings.save', 'dashboard.summary'];
    for (const r of rotas) {                                   // ambiente novo por rota: o bloqueio por tentativas não interfere
      const b = loadBackend({ props: { APP_PIN: '1234' } });
      assert.throws(() => b.call(r, { mes: '2026-11' }), /PIN incorreto/, r + ' sem PIN');
      assert.throws(() => b.call(r, { mes: '2026-11' }, '9999'), /PIN incorreto/, r + ' com PIN errado');
    }
    assert.doesNotThrow(() => loadBackend({ props: { APP_PIN: '1234' } }).call('core.bootstrap', {}, '1234'));
  });

  test('auth.check valida o PIN', () => {
    const b = loadBackend({ props: { APP_PIN: '1234' } });
    assert.deepEqual(b.call('auth.check', {}, '1234'), { ok: true });
    assert.throws(() => b.call('auth.check', {}, '0000'), /PIN incorreto/);
  });

  test('bloqueia após 5 erros, mesmo com o PIN certo, e libera depois do prazo', () => {
    const b = loadBackend({ props: { APP_PIN: '1234' } });
    for (let i = 0; i < 5; i++) assert.throws(() => b.call('auth.check', {}, 'x'), /PIN incorreto/);
    assert.throws(() => b.call('auth.check', {}, '1234'), /Muitas tentativas/);
    b.advance(901);
    assert.doesNotThrow(() => b.call('auth.check', {}, '1234'));
  });

  test('acerto zera o contador de erros', () => {
    const b = loadBackend({ props: { APP_PIN: '1234' } });
    for (let i = 0; i < 4; i++) assert.throws(() => b.call('auth.check', {}, 'x'));
    b.call('auth.check', {}, '1234');
    for (let i = 0; i < 4; i++) assert.throws(() => b.call('auth.check', {}, 'x'), /PIN incorreto/);
    assert.doesNotThrow(() => b.call('auth.check', {}, '1234'));
  });

  test('igualSeguro_ compara tamanhos e conteúdos', () => {
    const b = loadBackend();
    assert.equal(b.run("igualSeguro_('1234','1234')"), true);
    assert.equal(b.run("igualSeguro_('1234','12345')"), false);
    assert.equal(b.run("igualSeguro_('','')"), true);
    assert.equal(b.run("igualSeguro_('1234','1235')"), false);
  });
});
