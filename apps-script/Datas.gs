/** Datas em texto "aaaa-mm-dd" (sem fuso: evita o erro de "um dia a menos" do Sheets). */
const ISO_ = /^\d{4}-\d{2}-\d{2}$/;

function dataValida_(s) {
  s = String(s || '');
  if (!ISO_.test(s)) return false;
  const y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10), dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function isoDe_(dt) {
  return dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2);
}

/** Soma n meses mantendo o dia; em meses mais curtos usa o último dia (31/01 -> 28/02 -> 31/03). */
function addMeses_(iso, n) {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
  const alvo = new Date(y, m - 1 + n, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  return isoDe_(new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(d, ultimo)));
}

function addDias_(iso, n) {
  return isoDe_(new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n));
}

function hojeISO_() {
  return Utilities.formatDate(new Date(), Db.ss().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

/** Divide o total em n parcelas em centavos; a diferença de arredondamento fica na ÚLTIMA parcela. */
function splitParcelas_(total, n) {
  const cents = Math.round(total * 100), base = Math.floor(cents / n), resto = cents - base * n, out = [];
  for (let i = 0; i < n; i++) out.push((i === n - 1 ? base + resto : base) / 100);
  return out;
}

/**
 * Data de caixa (regime de caixa): quando o dinheiro realmente entrou/saiu.
 *  - realizado (pago): a data do pagamento; registros antigos sem ela usam vencimento ou data do lançamento;
 *  - pendente: o vencimento (previsão), ou a data do lançamento se não houver vencimento.
 */
function dataCaixa_(r) {
  if (r.status === 'pago' && ISO_.test(String(r.data_pagamento || ''))) return r.data_pagamento;
  return ISO_.test(String(r.vencimento || '')) ? r.vencimento : r.data;
}
