<#
.SYNOPSIS
  Release do CutCut em dois atos, com o PR no meio (D-782, D-823).

.DESCRIPTION
  Casca do bin/release.py: roda com o Python do backend/.venv, o mesmo do
  portão, para a release não depender do Python global. Não faz push.

  1. Numa branch release-vX.Y.Z criada da origin/main: portão, versão,
     CHANGELOG e commit. Sobe por PR, como qualquer mudança.
  2. Depois do merge, -Taguear: tag anotada no commit da release na
     origin/main, só com o CI verde naquele SHA.

.EXAMPLE
  .\bin\release.ps1 0.6.0 -Resumo "o que esta versão entrega" -Verificar
  .\bin\release.ps1 0.6.0 -Resumo "o que esta versão entrega"
  .\bin\release.ps1 0.6.0 -Taguear
#>
param(
    [Parameter(Mandatory = $true)][string]$Versao,
    [string]$Resumo,
    [switch]$Verificar,
    [switch]$Taguear
)

$raiz = Split-Path -Parent $PSScriptRoot
$python = Join-Path $raiz "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Host "Sem backend\.venv. Rode antes: .\bin\bootstrap.ps1 -Dev" -ForegroundColor Red
    exit 1
}
$argumentos = @((Join-Path $PSScriptRoot "release.py"), $Versao)
if ($Taguear) { $argumentos += "--taguear" }
if ($Resumo) { $argumentos += @("--resumo", $Resumo) }
if ($Verificar) { $argumentos += "--verificar" }
& $python @argumentos
exit $LASTEXITCODE
