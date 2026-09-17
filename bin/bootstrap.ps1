# bin/bootstrap.ps1 — primeira instalação do CutCut no Windows (D-630).
#
# Clonar o repositório não deixa nada pronto: são três runtimes (Python do
# backend, Node do frontend e do renderer) e um .env que ninguém adivinha. O
# passo a passo existia só no docs/SETUP.md, e um passo pulado vira um erro
# três telas adiante.
#
# Este script é a documentação executável desse setup. Pode rodar de novo
# quantas vezes quiser: reaproveita o venv existente e NUNCA sobrescreve um
# .env já criado.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File bin\bootstrap.ps1
#   powershell -ExecutionPolicy Bypass -File bin\bootstrap.ps1 -Dev   # + deps de teste
param([switch]$Dev)

$ErrorActionPreference = "Stop"
$RAIZ = Split-Path -Parent $PSScriptRoot

function Passo([string]$texto) { Write-Host "`n-> $texto" -ForegroundColor Cyan }
function Ok([string]$texto) { Write-Host "  ok: $texto" -ForegroundColor Green }
function Aviso([string]$texto) { Write-Host "  aviso: $texto" -ForegroundColor Yellow }

function Parar([string]$texto) {
    Write-Host "`n  x $texto" -ForegroundColor Red
    exit 1
}

function Comando([string]$nome) {
    $achado = Get-Command $nome -ErrorAction SilentlyContinue
    if ($achado) { return $achado.Source } else { return $null }
}

# Versão "maior.menor" da saída do próprio programa (ex.: "Python 3.13.1" → 3.13).
function VersaoMaiorMenor([string]$saida) {
    if ($saida -match '(\d+)\.(\d+)') { return [version]"$($Matches[1]).$($Matches[2])" }
    return $null
}

function ExigirVersao([string]$nome, [string]$binario, [string]$argumento, [version]$minima, [string]$comoInstalar) {
    $caminho = Comando $binario
    if (-not $caminho) { Parar "$nome nao encontrado. $comoInstalar" }
    $versao = VersaoMaiorMenor (& $binario $argumento 2>&1 | Out-String)
    if ($versao -and $versao -lt $minima) {
        Parar "$nome $versao e antigo demais (minimo $minima). $comoInstalar"
    }
    Ok "$nome $versao"
}

Write-Host "CutCut - instalacao inicial" -ForegroundColor White
Write-Host "Raiz: $RAIZ"

# ─── 1. O que precisa existir ANTES ──────────────────────────────────────────
Passo "1/5 Conferindo o que precisa estar instalado"
ExigirVersao "Python" "python" "--version" ([version]"3.11") "Instale o Python 3.11+ de https://python.org (marque 'Add to PATH')."
ExigirVersao "Node.js" "node" "--version" ([version]"20.0") "Instale o Node.js 20+ de https://nodejs.org."
if (-not (Comando "npm")) { Parar "npm nao encontrado. Ele vem com o Node.js." }

# ffmpeg e yt-dlp não são necessários para INSTALAR, só para usar: avisar é o
# suficiente, e a tela de Pré-requisitos cobra depois.
foreach ($ferramenta in @(
        @{ nome = "ffmpeg"; dica = "winget install Gyan.FFmpeg" },
        @{ nome = "yt-dlp"; dica = "winget install yt-dlp.yt-dlp" })) {
    if (Comando $ferramenta.nome) { Ok $ferramenta.nome }
    else { Aviso "$($ferramenta.nome) nao esta no PATH - o app precisa dele para rodar. Instale com: $($ferramenta.dica)" }
}

# ─── 2. Backend ──────────────────────────────────────────────────────────────
Passo "2/5 Ambiente Python do backend"
$venv = Join-Path $RAIZ "backend\.venv"
$venvPython = Join-Path $venv "Scripts\python.exe"
if (Test-Path $venvPython) {
    Ok "venv ja existe (backend\.venv)"
}
else {
    python -m venv $venv
    if (-not (Test-Path $venvPython)) { Parar "nao consegui criar o venv em $venv" }
    Ok "venv criado"
}
& $venvPython -m pip install --upgrade pip --quiet
& $venvPython -m pip install -r (Join-Path $RAIZ "backend\requirements.txt")
if ($LASTEXITCODE -ne 0) { Parar "falha ao instalar as dependencias do backend" }
if ($Dev) {
    & $venvPython -m pip install -r (Join-Path $RAIZ "backend\requirements-dev.txt")
    if ($LASTEXITCODE -ne 0) { Parar "falha ao instalar as dependencias de desenvolvimento" }
}
Ok "dependencias do backend instaladas"

# ─── 3. Frontend e renderer ──────────────────────────────────────────────────
Passo "3/5 Dependencias do frontend e do renderer"
foreach ($pacote in @("frontend", "video-renderer")) {
    Push-Location (Join-Path $RAIZ $pacote)
    try {
        npm ci
        if ($LASTEXITCODE -ne 0) { Parar "falha no npm ci de $pacote" }
        Ok "$pacote pronto"
    }
    finally { Pop-Location }
}

# ─── 4. Configuração ─────────────────────────────────────────────────────────
Passo "4/5 Arquivo de configuracao do backend"
$arquivoEnv = Join-Path $RAIZ "backend\.env"
$exemplo = Join-Path $RAIZ "backend\.env.example"
if (Test-Path $arquivoEnv) {
    Ok "backend\.env ja existe - mantido como esta"
}
else {
    Copy-Item $exemplo $arquivoEnv
    Ok "backend\.env criado a partir do exemplo"
}

# ─── 5. Próximo passo ────────────────────────────────────────────────────────
Passo "5/5 Pronto"
Write-Host @"
  Suba o app:            .\dev.ps1
  Depois, no navegador:  Configuracoes -> aba Aplicacao -> cartao "Pre-requisitos"
  Para publicar no YouTube: Configuracoes -> Canal ativo -> "Como conectar o YouTube"
"@ -ForegroundColor White
