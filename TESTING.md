# Testes automáticos

Sem instalar nada além do **Node.js 20+** (usa o executor de testes nativo do Node, zero dependências).

```powershell
npm test                    # tudo (≈190 testes, ~2 s)
npm run test:backend        # regras de negócio, planilha, PIN
npm run test:frontend       # máscara de valores, gráfico, módulos, navegação
npm run test:static         # estrutura do projeto, schema, PWA, documentação
npm run test:regression     # bugs já corrigidos (REG-nnn)
node tests/run.js lancamentos   # só arquivos cujo caminho contém "lancamentos"
```

## Como funciona
- **Backend:** `tests/helpers/gas-mock.js` simula o Google (planilha em memória, travas, propriedades, cache) e roda os `.gs` **reais**. O simulador reproduz um comportamento do Sheets que já causou bug: texto que parece data/número vira `Date`/número se a coluna não for formatada como texto.
- **Frontend:** `tests/helpers/front.js` carrega os `<script>` de `apps-script/js_*.html` num ambiente com "DOM de mentira". Testa funções puras e a lógica do `App` (não renderiza telas).
- **Estático:** confere includes, sintaxe de todos os arquivos, rotas usadas x existentes, manifesto, ícones (tamanho real dos PNGs), service worker, caminhos relativos do GitHub Pages, schema e documentação.
- **CI:** `.github/workflows/ci.yml` roda tudo a cada push/PR. **O GitHub Pages só publica se os testes passarem.**

## Rotina obrigatória
### Corrigiu um bug
1. Escreva o teste **antes**, em `tests/regression/regression.test.js`, num `describe('REG-nnn — o que quebrava')` (próximo número livre). Ele deve **falhar**.
2. Corrija o código. O teste passa.
3. Cite `REG-nnn` no `CHANGELOG.md` (um teste confere).
4. `npm test` verde → publique.

### Criou uma funcionalidade
1. Backend novo → teste em `tests/backend/<modulo>.test.js` (caminho feliz, validações, erros, efeitos colaterais).
2. Função de tela → função **pura** (como `barChartSvg`) + teste em `tests/frontend/`.
3. Módulo novo → entra sozinho nos testes de estrutura (ícone, ordem, rotas, include). Rotas novas precisam existir em `routes_()`.
4. Mudou qualquer tela ou script do app (`apps-script/*.html`)? Rode `npm run build` e faça commit do `pwa/index.html` — o teste "pwa/index.html está em dia" reprova a versão desatualizada.
5. Coluna nova numa aba → **só no fim** do `SCHEMAS`; depois atualize `tests/fixtures/schema-baseline.json` (o teste `schema.test.js` impede renomear/reordenar/remover colunas já em uso).
6. Mudou algo da PWA → aumente `VERSION` em `pwa/sw.js` **e** `version` em `package.json` (um teste exige que sejam iguais) e acrescente a versão no `CHANGELOG.md`.

## Limites conhecidos (e próximo passo)
Não há navegador nos testes: layout, cores e toque no celular continuam sendo verificados à mão (roteiro no `README.md`). Para testar telas de verdade, o caminho natural é adicionar `jsdom` (ou Playwright) como dependência de desenvolvimento e escrever testes em `tests/ui/`.
