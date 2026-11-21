<#
  Roda os testes e, só se passarem, envia o Apps Script e atualiza a implantação (mesmo link do app).
  Uso:   .\scripts\deploy.ps1                      (descrição automática)
         .\scripts\deploy.ps1 -Descricao "v7 ajustes"
  Na 1ª vez pede o ID da implantação (AKfycb...) e guarda em .deployment-id (ignorado pelo Git).
#>
param([string]$Descricao = ("v" + (Get-Date -Format "yyyyMMdd-HHmm")))
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

npm test
if ($LASTEXITCODE -ne 0) { Write-Host "Testes falharam: deploy cancelado." -ForegroundColor Red; exit 1 }

if (-not (Test-Path .deployment-id)) { Read-Host "Cole o ID da implantação (AKfycb...)" | Set-Content .deployment-id -NoNewline }
$id = (Get-Content .deployment-id -Raw).Trim()

clasp push --force
clasp deploy --deploymentId $id --description $Descricao
Write-Host "Pronto. Atualize o app com Ctrl+F5." -ForegroundColor Green
