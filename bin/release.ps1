<#
.SYNOPSIS
  Prepara uma release local do CutCut: portão, versão, CHANGELOG, commit e tag (D-782).

.DESCRIPTION
  Casca do bin/release.py: roda com o Python do backend/.venv, o mesmo do
  portão, para a release não depender do Python global. Não faz push; no fim
  imprime os comandos de publicação.

.EXAMPLE
  .\bin\release.ps1 0.5.0 -Resumo "o que esta versão entrega" -Verificar
  .\bin\release.ps1 0.5.0 -Resumo "o que esta versão entrega"
#>
param(
    [Parameter(Mandatory = $true)][string]$Versao,
    [Parameter(Mandatory = $true)][string]$Resumo,
    [switch]$Verificar
)

$raiz = Split-Path -Parent $PSScriptRoot
$python = Join-Path $raiz "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Host "Sem backend\.venv. Rode antes: .\bin\bootstrap.ps1 -Dev" -ForegroundColor Red
    exit 1
}
$argumentos = @((Join-Path $PSScriptRoot "release.py"), $Versao, "--resumo", $Resumo)
if ($Verificar) { $argumentos += "--verificar" }
& $python @argumentos
exit $LASTEXITCODE
