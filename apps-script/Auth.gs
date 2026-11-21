/**
 * Proteção opcional por PIN.
 * Necessária quando o app é publicado como "Qualquer pessoa" (exigência para funcionar como PWA em iframe).
 * Ative criando a propriedade de script APP_PIN (Configurações do projeto -> Propriedades do script).
 * Sem APP_PIN, o app se comporta como antes (sem PIN).
 */
const AUTH_MAX_TENTATIVAS_ = 5, AUTH_BLOQUEIO_S_ = 900;

function authPin_() { return PropertiesService.getScriptProperties().getProperty('APP_PIN') || ''; }

/** Comparação sem atalho no primeiro caractere diferente. */
function igualSeguro_(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function authStatus_() {
  const cfg = settingsGet_();
  return { required: !!authPin_(), brand: { empresa: cfg.empresa, logo: cfg.logo, primary: cfg.primary } };
}

/** Lança erro se houver PIN configurado e o informado estiver errado; bloqueia após várias falhas. */
function authCheck_(pin) {
  const real = authPin_();
  if (!real) return true;
  const cache = CacheService.getScriptCache();
  const falhas = Number(cache.get('pin_falhas') || 0);
  if (falhas >= AUTH_MAX_TENTATIVAS_) throw new Error('Muitas tentativas. Aguarde alguns minutos e tente de novo.');
  if (igualSeguro_(pin == null ? '' : pin, real)) { if (falhas) cache.remove('pin_falhas'); return true; }
  cache.put('pin_falhas', String(falhas + 1), AUTH_BLOQUEIO_S_);
  throw new Error('PIN incorreto.');
}
