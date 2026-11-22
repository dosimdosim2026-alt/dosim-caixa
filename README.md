# DoSim · Fluxo de Caixa

Web App em **Google Apps Script** (dados na planilha) + **PWA** no **GitHub Pages** (instalável no celular, com ícone e cores da marca na tela toda) + **suíte de testes automáticos**.

```
apps-script/   código do app (.gs = servidor, .html = telas)  →  vai para o Apps Script via clasp
pwa/           casco da PWA (index, manifest, service worker, ícones)  →  vai para o GitHub Pages
tests/         testes automáticos (npm test)
scripts/       make-icons.py (gera os ícones) e deploy.ps1 (testa + publica o Apps Script)
assets/        logo original
.github/       pipeline: testa tudo e publica o Pages
```

## Como a PWA funciona (e por que precisa de PIN)
A PWA no GitHub Pages **contém a própria tela do app** (gerada por `npm run build` a partir de `apps-script/`) e fala com o Apps Script como uma **API**: cada ação é um `fetch` (POST) para o link `/exec`, sem iframe, sem cookies e sem login do Google. Por isso funciona no celular com várias contas Google e em aba anônima.
Para isso o Web App precisa estar com acesso **"Qualquer pessoa"**, e o link fica aberto. O **PIN** (`APP_PIN`) é o que protege os dados: sem ele nenhuma rota entrega nada, e após 5 erros o acesso fica bloqueado por 15 minutos. O link direto do Apps Script continua funcionando (mesma tela, mesmo PIN).

## Passo a passo

### 1. Reorganizar a pasta local (uma vez só)
O código do app passa a ficar em `apps-script\`. No PowerShell, na pasta do projeto (onde está o seu `.clasp.json`):
```powershell
cd C:\projetos\fluxo-caixa
Remove-Item *.gs, *.html, appsscript.json -Force          # arquivos antigos soltos na raiz
Expand-Archive -Path "$HOME\Downloads\dosim-caixa-repo.zip" -DestinationPath . -Force

# diz ao clasp que o código agora está em apps-script\ (grava sem BOM)
$j = Get-Content .clasp.json -Raw | ConvertFrom-Json
$j | Add-Member -NotePropertyName rootDir -NotePropertyValue "apps-script" -Force
[System.IO.File]::WriteAllText("$PWD\.clasp.json", ($j | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))

clasp status       # deve listar os arquivos de apps-script\
npm test           # tudo verde antes de seguir
```

### 2. Definir o PIN
1. Abra o projeto no navegador pela **planilha → Extensões → Apps Script** (evita o erro de conta errada do `clasp open-script` quando há várias contas Google logadas).
2. Engrenagem (**Configurações do projeto**) → **Propriedades do script** → **Adicionar propriedade**: nome `APP_PIN`, valor o seu PIN (6 dígitos ou mais) → **Salvar propriedades do script**.
3. Confira que o `scriptId` do `.clasp.json` é o mesmo que aparece no endereço do editor (`/projects/CODIGO/edit`). Se forem diferentes, o PIN está no projeto errado.

### 3. Liberar o acesso público e publicar (nesta ordem, num passo só)
O acesso "Qualquer pessoa" só deve ser publicado **junto** do código com PIN. Por isso ele é definido no arquivo `appsscript.json` e enviado pelo `deploy.ps1`:
```powershell
$m = Get-Content .\apps-script\appsscript.json -Raw
$m = $m -replace '"access":\s*"[A-Z_]+"', '"access": "ANYONE_ANONYMOUS"'
[System.IO.File]::WriteAllText("$PWD\apps-script\appsscript.json", $m, (New-Object System.Text.UTF8Encoding($false)))

.\scripts\deploy.ps1        # roda os testes e, se passarem, envia o código e atualiza a implantação
```
Na primeira vez o script pede o ID da implantação (`AKfycb...`) e o guarda em `.deployment-id`.
> Não libere "Qualquer pessoa" pela tela do Google antes deste passo: o link ficaria público rodando a versão antiga, sem PIN.

### 4. Testar o PIN
Feche as janelas anônimas, abra uma nova (Ctrl+Shift+N), cole o link `/exec` e aperte Ctrl+F5: deve aparecer a **tela de PIN**. Se o app abrir direto, o PIN não está ativo — não siga adiante (veja "Se o PIN não aparecer" abaixo).

### 5. Configurar e gerar a PWA
Abra `pwa\config.js` e confira `APP_URL` (o link `/exec` do Web App). Depois gere a página da PWA:
```powershell
npm run build      # gera pwa\index.html a partir de apps-script\ (o deploy.ps1 já faz isso)
```

### 6. Subir para o GitHub
Crie um repositório **vazio** em github.com/new (ex.: `dosim-caixa`) e:
```powershell
git init -b main
git add .
git commit -m "DoSim Caixa: app, PWA e testes"
git remote add origin https://github.com/SEU_USUARIO/dosim-caixa.git
git push -u origin main
```
O `.gitignore` já deixa de fora `.clasp.json`, `.deployment-id` e credenciais.

### 7. Ligar o GitHub Pages
No repositório: **Settings → Pages → Build and deployment → Source: GitHub Actions.**
Depois, em **Actions**, rode de novo o workflow (*Re-run all jobs*) se o primeiro deploy falhou por o Pages ainda estar desligado. O endereço será:
`https://SEU_USUARIO.github.io/dosim-caixa/`

> Pages em repositório **privado** exige plano pago. Em repositório público o link `/exec` fica visível no código; o PIN é o que protege os dados.

### 8. Instalar no celular
- **Android (Chrome):** abra o endereço → menu **⋮ → Instalar app** (ou *Adicionar à tela inicial*).
- **iPhone (Safari):** abra o endereço → **Compartilhar → Adicionar à Tela de Início**.
- **Computador (Chrome/Edge):** ícone de instalar na barra de endereço.

## Rotina de atualização
| O que mudou | O que fazer |
|---|---|
| Código do app (`apps-script/`) | `.\scripts\deploy.ps1` (build + testes + publica o Apps Script) **e** `git add .`, `git commit`, `git push` (atualiza a PWA) |
| PWA (`pwa/`, ou qualquer tela do app) | aumente `VERSION` em `pwa/sw.js` **e** `version` no `package.json`, `npm run build`, `git commit`, `git push` — o Actions publica; o app instalado atualiza na próxima abertura |
| Logo/ícones | troque `assets/logo-dosim.png` → `pip install pillow` → `npm run icons` |
| Qualquer correção ou novidade | teste + `CHANGELOG.md` (veja `TESTING.md`) |

## Roteiro de teste manual (o que os testes automáticos não veem)
1. Instalou com o ícone da DoSim? Abre em **tela cheia**, sem barra do navegador?
2. Barra de status e splash na cor da marca (`#9E4563`)? No iPhone, faixas do topo/rodapé coloridas?
3. Tela de PIN: PIN errado é recusado; certo entra.
4. Painel no celular: gráfico cabe sem rolagem horizontal, valores na diagonal.
5. Criar, editar e excluir um lançamento; trocar a cor em Ajustes e ver a barra de status acompanhar.

## Limitações conhecidas
- A **faixa de aviso do Google** no topo só aparece no link direto do Apps Script; na PWA não existe.
- Sem internet a PWA abre, mas as telas mostram erro de conexão (os dados vivem na planilha).
- O bloqueio por tentativas é global (não por pessoa): quem erra o PIN 5 vezes bloqueia todos por 15 min.
- Cada ação passa pelo Apps Script, então pode levar de 1 a 3 segundos (limite do serviço do Google).

## Se o PIN não aparecer
O app abre direto quando (1) o código com PIN ainda não foi enviado (`.\scripts\deploy.ps1` não rodou: no editor, `Auth.gs` não aparece na lista de arquivos) ou (2) a propriedade `APP_PIN` não existe no projeto certo (nome exato, salva, mesmo `scriptId` do `.clasp.json`). Corrija e teste de novo em janela anônima.
