# clean-dev.ps1 - Limpa processos locais do CortadorLive.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

$projectPorts = @(8000, 4300, 3000, 3001)

function Stop-ProcessTree {
    param([int]$ProcessId)

    Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-ProcessTree -ProcessId $_.ProcessId
        try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
    }

    try { Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue } catch {}
}

Write-Host "----------------------------------------------------" -ForegroundColor Cyan
Write-Host "Iniciando limpeza do ambiente local..." -ForegroundColor Cyan
Write-Host "----------------------------------------------------" -ForegroundColor Cyan

$pidsByPort = foreach ($port in $projectPorts) {
    Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess
}

$pidsByCmd = Get-CimInstance Win32_Process -Filter "Name = 'python.exe' OR Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -like "*uvicorn*" -or
        $_.CommandLine -like "*app.main*" -or
        $_.CommandLine -like "*gerador-cortes*" -or
        $_.CommandLine -like "*remotion*" -or
        $_.CommandLine -like "*vite*" -or
        $_.CommandLine -like "*spawn_main*"
    } |
    Select-Object -ExpandProperty ProcessId

$allPids = ($pidsByPort + $pidsByCmd) |
    Where-Object { $_ -gt 0 -and $_ -ne $PID } |
    Select-Object -Unique

if ($allPids) {
    foreach ($targetPid in $allPids) {
        $proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "Encerrando: $($proc.Name) (PID $targetPid)..." -ForegroundColor Yellow
            Stop-ProcessTree -ProcessId $targetPid
        }
    }
} else {
    Write-Host "Nenhum processo antigo encontrado." -ForegroundColor Gray
}

$ffmpegs = Get-Process -Name ffmpeg -ErrorAction SilentlyContinue
if ($ffmpegs) {
    Write-Host "Limpando FFmpeg..." -ForegroundColor Yellow
    $ffmpegs | Stop-Process -Force -ErrorAction SilentlyContinue
}

Write-Host "----------------------------------------------------" -ForegroundColor Cyan
Write-Host "Ambiente limpo." -ForegroundColor Green
Write-Host "----------------------------------------------------" -ForegroundColor Cyan
