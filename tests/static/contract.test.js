'use strict';
/**
 * Contrato tela ↔ servidor: o que o formulário ENVIA precisa ser exatamente o que o servidor LÊ.
 * Pega o erro típico (sem navegador nos testes): campo novo no servidor que a tela esqueceu de enviar,
 * ou campo digitado errado na tela (o servidor ignora em silêncio).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { GAS_DIR } = require('../helpers/gas-mock');

const lê = f => fs.readFileSync(path.join(GAS_DIR, f), 'utf8');

/** Corpo do objeto literal que começa em API.call('rota', { ... }) — respeita (), [], {} e aspas. */
function corpoDoObjeto(texto, inicio) {
  let prof = 0, aspas = null, i = inicio;
  for (; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) { if (c === aspas && texto[i - 1] !== '\\') aspas = null; continue; }
    if (c === "'" || c === '"' || c === '`') { aspas = c; continue; }
    if ('({['.includes(c)) prof++;
    if (')}]'.includes(c)) { prof--; if (prof === 0) return texto.slice(inicio + 1, i); }
  }
  throw new Error('objeto não fechado');
}
/** Chaves do objeto enviado: "chave: valor" ou atalho "chave" (separa só nas vírgulas de nível zero). */
function chavesEnviadas(arquivo, rota) {
  const t = lê(arquivo), i = t.indexOf("API.call('" + rota + "', {");
  assert.ok(i > -1, `não achei a chamada ${rota} em ${arquivo}`);
  const corpo = corpoDoObjeto(t, t.indexOf('{', i));
  const partes = []; let prof = 0, aspas = null, ini = 0;
  for (let k = 0; k < corpo.length; k++) {
    const c = corpo[k];
    if (aspas) { if (c === aspas && corpo[k - 1] !== '\\') aspas = null; continue; }
    if (c === "'" || c === '"' || c === '`') { aspas = c; continue; }
    if ('({['.includes(c)) prof++; if (')}]'.includes(c)) prof--;
    if (c === ',' && prof === 0) { partes.push(corpo.slice(ini, k)); ini = k + 1; }
  }
  partes.push(corpo.slice(ini));
  return new Set(partes.map(x => x.trim()).filter(Boolean).map(x => (x.includes(':') ? x.slice(0, x.indexOf(':')) : x).trim()));
}
const chavesLidas = (arquivo, de, ate) => {
  const t = lê(arquivo); const a = t.indexOf(de), b = ate ? t.indexOf(ate, a) : t.length;
  assert.ok(a > -1 && b > a, `trecho ${de} não encontrado`);
  return new Set([...t.slice(a, b).matchAll(/\bp\.([a-z_]+)/g)].map(x => x[1]));
};

describe('Contrato — formulário de lançamento → lancamentos.save', () => {
  const enviadas = chavesEnviadas('js_lancamentos.html', 'lancamentos.save');
  const lidas = new Set([...chavesLidas('Lancamentos.gs', 'function validarLancamento_', 'function exigirContato_'),
                         ...chavesLidas('Lancamentos.gs', "routes['lancamentos.save']", "routes['lancamentos.baixa']")]);
  test('o formulário envia tudo o que o servidor lê (data do pagamento, vencimento, parcelas, contato, catálogo…)', () => {
    for (const k of lidas) assert.ok(enviadas.has(k), `o servidor lê "${k}" mas o formulário não envia`);
  });
  test('o formulário não envia nada que o servidor ignora (erro de digitação)', () => {
    for (const k of enviadas) assert.ok(lidas.has(k), `o formulário envia "${k}" mas o servidor não lê`);
  });
  test('campos essenciais estão no envio', () => {
    for (const k of ['id', 'tipo', 'valor', 'data', 'vencimento', 'data_pagamento', 'parcelado', 'parcelas', 'primeira_paga', 'categoria_id', 'forma', 'contato_id', 'salvar_catalogo'])
      assert.ok(enviadas.has(k), k);
  });
});

describe('Contrato — baixa e painel', () => {
  test('janela de baixa envia id, data_pagamento, forma e hoje (todos lidos pelo servidor)', () => {
    const env = chavesEnviadas('js_lancamentos.html', 'lancamentos.baixa');
    const lidas = chavesLidas('Lancamentos.gs', "routes['lancamentos.baixa']", "routes['lancamentos.remove_grupo']");
    for (const k of ['id', 'data_pagamento', 'forma', 'hoje']) { assert.ok(env.has(k), `baixa não envia ${k}`); assert.ok(lidas.has(k), `servidor não lê ${k}`); }
  });
  test('painel envia periodo, ref e hoje (lidos pelo servidor)', () => {
    const env = chavesEnviadas('js_dashboard.html', 'dashboard.summary');
    const lidas = chavesLidas('Dashboard.gs', "'dashboard.summary'", null);
    for (const k of ['periodo', 'ref', 'hoje']) { assert.ok(env.has(k), k); assert.ok(lidas.has(k), k); }
  });
  test('excluir parcelamento envia grupo_id (lido pelo servidor)', () => {
    assert.ok(chavesEnviadas('js_lancamentos.html', 'lancamentos.remove_grupo').has('grupo_id'));
  });
});
