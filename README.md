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
O GitHub Pages hospeda uma página-casco que abre o seu app do Apps Script **dentro de um iframe**, em tela cheia. O login do Google **não funciona dentro de iframe**, então o Web App precisa estar com acesso **"Qualquer pessoa"**. Como isso deixa o link aberto, o app tem um **PIN** (`APP_PIN`): sem ele, nenhum dado é entregue. Após 5 PINs errados o acesso fica bloqueado por 15 minutos.

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

### 2. Definir o PIN e liberar o acesso
1. `clasp open-script` → **Configurações do projeto** → **Propriedades do script** → **Adicionar propriedade**: nome `APP_PIN`, valor o seu PIN (ex.: 6 dígitos).
2. **Implantar → Gerenciar implantações →** lápis ✏ **→ Quem pode acessar: "Qualquer pessoa" → Versão: Nova versão → Implantar.** (Executar como: *Eu*.)
3. Abra o link `/exec` numa **aba anônima**: deve aparecer a tela de PIN.

> Não libere "Qualquer pessoa" sem definir o `APP_PIN`.

### 3. Publicar o Apps Script
```powershell
.\scripts\deploy.ps1        # roda os testes e, se passarem, envia e atualiza a implantação
```
(Na primeira vez pede o ID da implantação — `AKfycb...` — e guarda em `.deployment-id`.)

### 4. Configurar a PWA
Abra `pwa\config.js` e confira `APP_URL` (o link `/exec` do Web App).

### 5. Subir para o GitHub
Crie um repositório **vazio** em github.com/new (ex.: `dosim-caixa`) e:
```powershell
git init -b main
git add .
git commit -m "DoSim Caixa: app, PWA e testes"
git remote add origin https://github.com/SEU_USUARIO/dosim-caixa.git
git push -u origin main
```
O `.gitignore` já deixa de fora `.clasp.json`, `.deployment-id` e credenciais.

### 6. Ligar o GitHub Pages
No repositório: **Settings → Pages → Build and deployment → Source: GitHub Actions.**
Depois, em **Actions**, rode de novo o workflow (*Re-run all jobs*) se o primeiro deploy falhou por o Pages ainda estar desligado. O endereço será:
`https://SEU_USUARIO.github.io/dosim-caixa/`

> Pages em repositório **privado** exige plano pago. Em repositório público o link `/exec` fica visível no código; o PIN é o que protege os dados.

### 7. Instalar no celular
- **Android (Chrome):** abra o endereço → menu **⋮ → Instalar app** (ou *Adicionar à tela inicial*).
- **iPhone (Safari):** abra o endereço → **Compartilhar → Adicionar à Tela de Início**.
- **Computador (Chrome/Edge):** ícone de instalar na barra de endereço.

## Rotina de atualização
| O que mudou | O que fazer |
|---|---|
| Código do app (`apps-script/`) | `.\scripts\deploy.ps1` e **Ctrl+F5** no app |
| PWA (`pwa/`) | aumente `VERSION` em `pwa/sw.js` **e** `version` no `package.json`, `git commit`, `git push` — o Actions publica; o app instalado atualiza na próxima abertura |
| Logo/ícones | troque `assets/logo-dosim.png` → `pip install pillow` → `npm run icons` |
| Qualquer correção ou novidade | teste + `CHANGELOG.md` (veja `TESTING.md`) |

## Roteiro de teste manual (o que os testes automáticos não veem)
1. Instalou com o ícone da DoSim? Abre em **tela cheia**, sem barra do navegador?
2. Barra de status e splash na cor da marca (`#9E4563`)? No iPhone, faixas do topo/rodapé coloridas?
3. Tela de PIN: PIN errado é recusado; certo entra.
4. Painel no celular: gráfico cabe sem rolagem horizontal, valores na diagonal.
5. Criar, editar e excluir um lançamento; trocar a cor em Ajustes e ver a barra de status acompanhar.

## Limitações conhecidas
- O Google pode exibir uma **faixa de aviso** no topo de Web Apps de contas pessoais; é do Apps Script e não dá para remover pela PWA.
- Sem internet a PWA mostra apenas uma tela de "sem conexão" (os dados vivem na planilha).
- No iPhone a PWA instalada tem armazenamento separado do Safari: pode pedir o PIN de novo.
- O bloqueio por tentativas é global (não por pessoa): quem erra o PIN 5 vezes bloqueia todos por 15 min.
