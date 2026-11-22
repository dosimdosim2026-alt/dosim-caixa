# Histórico de mudanças

Regra: cada correção ou funcionalidade entra aqui **e** ganha teste (veja `TESTING.md`).
Correções citam o ID do teste de regressão (`REG-nnn`) em `tests/regression/regression.test.js`.

## [1.1.0] - 2026-11-21

### Mudança de arquitetura da PWA
- A PWA **deixa de embutir o app em iframe** e passa a rodar a tela do app direto no GitHub Pages, falando com o Apps Script como uma **API HTTP** (`doPost`, POST `text/plain` sem cookies, sem preflight CORS). Não depende mais de conta Google logada nem de cookies de terceiros.
- `npm run build` gera `pwa/index.html` a partir do mesmo código das telas (`apps-script/`): um só código para o link do Apps Script e para a PWA. Um teste confere que o arquivo gerado está em dia.
- Barra de status do Android acompanha a cor da marca definida em Ajustes; no iPhone a faixa do topo usa a cor da marca (áreas seguras).
- O PIN passa a poder ser lembrado no aparelho de verdade (a PWA tem armazenamento próprio).

### Correções
- REG-013 — a PWA embutia o app em iframe: ficava com o tamanho padrão (300x150) e depois nem carregava. (Teste revisado: a PWA não usa mais iframe.)
- REG-014 — PWA em iframe quebrava no celular: "Não foi possível abrir o arquivo" (Drive) com várias contas Google e erro 401 em aba anônima.

## [1.0.1] - 2026-11-21

### Correções
- REG-013 — o iframe da PWA ficava com o tamanho padrão (300x150) em vez de ocupar a tela toda; a tela de PIN aparecia cortada no canto.

## [1.0.0] - 2026-11-19

### Novidades
- **PWA** instalável (Android e iPhone) publicada no GitHub Pages: ícones da marca DoSim, tela cheia, status bar e splash na cor da marca, funciona dentro do app instalado e se atualiza sozinha.
- **PIN de acesso** (propriedade de script `APP_PIN`), com bloqueio após 5 tentativas erradas por 15 minutos. Necessário para o app poder ser público dentro da PWA.
- **Suíte de testes automáticos** (backend, frontend, estrutura, PWA, regressões) e pipeline no GitHub Actions: o Pages só é publicado se os testes passarem.
- Cores da marca seguem o que for definido em Ajustes (o app avisa a PWA via `postMessage`).
- Fluxo de caixa: painel, lançamentos (formas de pagamento/recebimento, máscara bancária), catálogo, contatos (cliente/fornecedor), categorias, ajustes com paleta e logo.

### Correções (cada uma coberta por teste)
- REG-001 — datas viravam `Date` no Sheets e apareciam quebradas.
- REG-002 — abas antigas não recebiam colunas novas (migração automática, sem perder dados).
- REG-003 — `appsscript.json` com BOM travava o clasp.
- REG-004 — gráfico dos 6 meses estourava a tela do celular; agora é desenhado na largura real, com folga calculada pelo maior valor.
- REG-005 — valores monetários com máscara bancária (1000 → R$ 10,00).
- REG-006 — atualizar um registro não troca mais `id` nem `criado_em`.
- REG-007 — trava de gravação não fica presa quando há erro.
- REG-008 — o app só pode ser embutido na PWA se o iframe for permitido (`ALLOWALL`).
- REG-009 — ícone inexistente deixava item do menu em branco.
- REG-010 — ações disparavam duas vezes (ouvintes acumulados entre telas).
- REG-011 — troca de abas de Cadastros apagava o destaque.
- REG-012 — com PIN ativo, nenhum dado carrega antes do PIN.
