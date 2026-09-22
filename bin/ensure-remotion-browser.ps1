<#
.SYNOPSIS
    Garante que o Chrome Headless Shell do Remotion esteja instalado e funcional.

.DESCRIPTION
    Contorna o bug do `extract-zip` no Node 24 (v24.17.0), que extrai apenas
    ABOUT + LICENSE do zip do Chrome Headless Shell em silêncio. Sem o binário
    real, todo render "conclui" com exit 0 mas nao gera arquivo.

    Fluxo IDEMPOTENTE:
      1. Se o exe ja existe e responde a `--version`, nao faz nada (OK).
      2. Senao: se o zip existe, extrai com Expand-Archive -Force; se nao,
         roda `npx remotion browser ensure` para baixar o zip e entao extrai.
      3. Cria/atualiza o marker VERSION com a versao baixada.
      4. Valida no fim: exe presente e `--version` OK; sai !=0 se falhar.

    Rode a partir de qualquer diretorio; o caminho e resolvido em relacao ao repo.
    Rode APOS o `npm ci` do video-renderer.

.EXAMPLE
    pwsh -File bin/ensure-remotion-browser.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Info  { param($m) Write-Host "[ensure-remotion-browser] $m" }
function Write-Ok    { param($m) Write-Host "[ensure-remotion-browser] OK: $m" -ForegroundColor Green }
function Write-Fail  { param($m) Write-Host "[ensure-remotion-browser] ERRO: $m" -ForegroundColor Red }

# --- Resolver caminhos relativos ao repo (bin/ fica na raiz) ---------------
$repoRoot     = Split-Path -Parent $PSScriptRoot
$videoRenderer = Join-Path $repoRoot 'video-renderer'
$browserDir   = Join-Path $videoRenderer 'node_modules/.remotion/chrome-headless-shell'
$win64Dir     = Join-Path $browserDir 'win64'
$exePath      = Join-Path $win64Dir 'chrome-headless-shell-win64/chrome-headless-shell.exe'
$versionFile  = Join-Path $browserDir 'VERSION'

if (-not (Test-Path $videoRenderer)) {
    Write-Fail "pasta video-renderer nao encontrada em '$videoRenderer'."
    exit 1
}

# --- Helper: o exe existe e responde a --version? --------------------------
function Test-BrowserExe {
    if (-not (Test-Path $exePath)) { return $false }
    try {
        $out = & $exePath '--version' 2>&1
        if ($LASTEXITCODE -eq 0 -and $out) {
            Write-Info "versao do browser: $($out -join ' ')"
            return $true
        }
    } catch {
        Write-Info "exe presente mas falhou ao rodar --version: $_"
    }
    return $false
}

# --- Passo 1: ja esta OK? --------------------------------------------------
if (Test-BrowserExe) {
    Write-Ok "Chrome Headless Shell ja presente e funcional. Nada a fazer."
    exit 0
}

Write-Info "exe ausente ou nao-funcional. Iniciando instalacao/reparo..."

# --- Passo 2 + 3: garantir um zip integro e extrair (com recuperacao) ------
function Get-ZipPath {
    if (-not (Test-Path $browserDir)) { return $null }
    $zip = Get-ChildItem -Path $browserDir -Filter 'chrome-headless-shell-win64.zip' -File -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($zip) { return $zip.FullName }
    return $null
}

function Invoke-BrowserDownload {
    Write-Info "Baixando via 'npx remotion browser ensure'..."
    Push-Location $videoRenderer
    try {
        & npx remotion browser ensure
    } finally {
        Pop-Location
    }
}

# Extrai o zip para win64/. Retorna $true no sucesso. Se o zip estiver
# corrompido/truncado, Expand-Archive falha com "registro Final de Diretorio
# Central nao localizado" — resquicio do proprio bug do extract-zip no Node 24,
# que baixa um zip parcial. Nesse caso descartamos o zip parcial (e o win64/
# meio-extraido) para forcar um download limpo na proxima tentativa, em vez de
# insistir num artefato quebrado (era a falha que travava o reparo).
function Expand-BrowserZip {
    param([string]$ZipPath)
    if (-not (Test-Path $win64Dir)) {
        New-Item -ItemType Directory -Path $win64Dir -Force | Out-Null
    }
    Write-Info "extraindo (Expand-Archive -Force) para '$win64Dir'..."
    try {
        Expand-Archive -Path $ZipPath -DestinationPath $win64Dir -Force -ErrorAction Stop
        return $true
    } catch {
        Write-Info "zip invalido/truncado ($_). Descartando para rebaixar."
        Remove-Item -Path $ZipPath -Force -ErrorAction SilentlyContinue
        Remove-Item -Path $win64Dir -Recurse -Force -ErrorAction SilentlyContinue
        return $false
    }
}

# Ate 2 tentativas: usa o zip presente; se estiver corrompido, descarta,
# rebaixa e extrai uma vez mais.
$extraido = $false
for ($tentativa = 1; $tentativa -le 2 -and -not $extraido; $tentativa++) {
    $zipPath = Get-ZipPath
    if (-not $zipPath) {
        Invoke-BrowserDownload
        # D-671: nas versoes atuais o Remotion baixa, extrai E apaga o zip. Sem
        # esta checagem o script procurava um zip que nao existe mais e abortava
        # o dev.ps1 com o browser ja funcionando (visto num clone limpo). O zip
        # so importa quando o extract-zip do Node 24 falha e deixa o exe quebrado.
        if (Test-BrowserExe) {
            $extraido = $true
            break
        }
        $zipPath = Get-ZipPath
    }
    if (-not $zipPath) {
        Write-Fail "nao foi possivel obter o zip do Chrome Headless Shell."
        exit 1
    }
    Write-Info "zip (tentativa $tentativa): $zipPath"
    $extraido = Expand-BrowserZip -ZipPath $zipPath
}

if (-not $extraido) {
    Write-Fail "nao foi possivel extrair o Chrome Headless Shell (zip corrompido mesmo apos rebaixar)."
    exit 1
}

# --- Passo 4: criar/atualizar o marker VERSION -----------------------------
function Resolve-BrowserVersion {
    # A versao correta e a do proprio browser (ex. 144.0.7559.20), NAO a do
    # pacote Remotion. A fonte confiavel e o exe recem-extraido: e exatamente
    # o build que o Remotion baixou, entao sua versao casa com a esperada.
    if (Test-Path $exePath) {
        try {
            $out = (& $exePath '--version' 2>&1) -join ' '
        } catch {
            $out = $null
        }
        if ($out) {
            # Sem \b inicial: a saida pode vir colada a um prefixo (ex. "v24.17.0").
            $match = [regex]::Match($out, '(\d+\.\d+\.\d+(?:\.\d+)?)')
            if ($match.Success) { return $match.Value }
        }
    }
    # Fallback: derivar do nome de alguma pasta versionada, se houver.
    $verDir = Get-ChildItem -Path $browserDir -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^\d+\.\d+\.\d+' } | Select-Object -First 1
    if ($verDir) { return $verDir.Name }
    return $null
}

$version = Resolve-BrowserVersion
if ($version) {
    Set-Content -Path $versionFile -Value $version -NoNewline -Encoding ASCII
    Write-Info "marker VERSION escrito: $version"
} else {
    Write-Info "nao foi possivel derivar a versao; VERSION nao atualizado (Remotion pode re-baixar)."
}

# --- Passo 5: validacao final ----------------------------------------------
if (Test-BrowserExe) {
    Write-Ok "Chrome Headless Shell instalado e funcional."
    exit 0
}

Write-Fail "apos extracao, o exe ainda nao esta funcional em '$exePath'."
exit 1
