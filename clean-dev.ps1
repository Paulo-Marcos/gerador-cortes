# clean-dev.ps1 - Limpa processos locais do CutCut.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

$BASE = $PSScriptRoot
$projectPorts = @(8000, 4300, 3200, 3201)

function Stop-ProcessTree {
    param([int]$ProcessId)

    Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-ProcessTree -ProcessId $_.ProcessId
        try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
    }

    try { Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue } catch {}
}

function Test-CortadorProcess {
    # D-370: so encerra processos deste checkout (casados pelo caminho absoluto
    # $BASE). Tokens genericos (uvicorn/app.main, native_worker.js, vite,
    # remotion, porta) NAO distinguem este DEV do PROD (C:\PRD\gerador-cortes)
    # nem de apps de terceiros que usam node/vite/porta (ex.: BolsoFundo).
    param([string]$CommandLine, [string]$ExecutablePath)

    $cl  = if ($CommandLine)    { $CommandLine }    else { "" }
    $exe = if ($ExecutablePath) { $ExecutablePath } else { "" }

    return ($cl -like "*$BASE*" -or $exe -like "*$BASE*")
}

Write-Host "----------------------------------------------------" -ForegroundColor Cyan
Write-Host "Iniciando limpeza do ambiente local..." -ForegroundColor Cyan
Write-Host "----------------------------------------------------" -ForegroundColor Cyan

$pidsByPort = foreach ($port in $projectPorts) {
    Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess
}

$pidsByCmd = Get-CimInstance Win32_Process -Filter "Name = 'python.exe' OR Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { Test-CortadorProcess -CommandLine $_.CommandLine -ExecutablePath $_.ExecutablePath } |
    Select-Object -ExpandProperty ProcessId

$allPids = ($pidsByPort + $pidsByCmd) |
    Where-Object { $_ -gt 0 -and $_ -ne $PID } |
    Select-Object -Unique

if ($allPids) {
    foreach ($targetPid in $allPids) {
        $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$targetPid" -ErrorAction SilentlyContinue
        if (-not $cim) { continue }

        if (Test-CortadorProcess -CommandLine $cim.CommandLine -ExecutablePath $cim.ExecutablePath) {
            Write-Host "Encerrando: $($cim.Name) (PID $targetPid)..." -ForegroundColor Yellow
            Stop-ProcessTree -ProcessId $targetPid
        } else {
            Write-Host "Porta ocupada por $($cim.Name) (PID $targetPid) alheio ao CutCut - ignorando." -ForegroundColor DarkGray
        }
    }
} else {
    Write-Host "Nenhum processo antigo encontrado." -ForegroundColor Gray
}

# FFmpeg: apenas os deste projeto (nunca global - poderia matar render de PROD).
$ffmpegs = Get-CimInstance Win32_Process -Filter "Name = 'ffmpeg.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$BASE*" }
if ($ffmpegs) {
    Write-Host "Limpando FFmpeg do projeto..." -ForegroundColor Yellow
    $ffmpegs | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }
}

Write-Host "----------------------------------------------------" -ForegroundColor Cyan
Write-Host "Ambiente limpo." -ForegroundColor Green
Write-Host "----------------------------------------------------" -ForegroundColor Cyan
